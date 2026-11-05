param([string]$PlanReference,[string]$DescribeDevice,[switch]$PlanOnly,[ValidateSet('Preview','Git','Discovery','Transport','Software')][string]$Capability='Preview')
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
Add-Type -AssemblyName System.Security
function Hash([string]$File){(Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant()}
function CopyReviewedAcl([string]$Source,[string]$Destination){
 $sections=[Security.AccessControl.AccessControlSections]::Access -bor [Security.AccessControl.AccessControlSections]::Owner -bor [Security.AccessControl.AccessControlSections]::Group
 $security=[Security.AccessControl.FileSecurity]::new();$security.SetSecurityDescriptorBinaryForm([IO.File]::GetAccessControl($Source).GetSecurityDescriptorBinaryForm(),$sections)
 [IO.File]::SetAccessControl($Destination,$security)
 if([IO.File]::GetAccessControl($Destination).GetSecurityDescriptorSddlForm($sections) -cne [IO.File]::GetAccessControl($Source).GetSecurityDescriptorSddlForm($sections)){throw 'Reviewed file permissions differ'}
}
function Plain([string]$File){for($cursor=[IO.Path]::GetFullPath($File);;$cursor=[IO.Path]::GetDirectoryName($cursor)){if([IO.File]::GetAttributes($cursor) -band [IO.FileAttributes]::ReparsePoint){throw 'Linked preview update path denied'};if($cursor -eq [IO.Path]::GetPathRoot($cursor)){break}}}
function InstallRoot([string]$Id){if($Id -cnotmatch '^fc_[a-f0-9]{32}$'){throw 'Invalid preview connector identity'};return [IO.Path]::Combine($env:LOCALAPPDATA,'FrevOS','Connector',$Id)}
function ReadIdentity([string]$Root){
 $file=Join-Path $Root 'device.dpapi';Plain $file
 if((Get-Item -LiteralPath $file).Length -gt 65536){throw 'Preview connector identity capacity'}
 $clear=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($file),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
 try{return [Text.Encoding]::UTF8.GetString($clear)|ConvertFrom-Json}finally{[Array]::Clear($clear,0,$clear.Length)}
}
function IoRetry([scriptblock]$Operation){
 for($attempt=0;;$attempt++){try{return & $Operation}catch [IO.IOException]{if($attempt -ge 9 -or (($_.Exception.HResult -band 0xffff) -notin @(32,33))){throw};Start-Sleep -Milliseconds 150}}
}
function ProtectedFields($Identity){
 $value=[ordered]@{};foreach($property in @($Identity.PSObject.Properties|Sort-Object Name)){if($property.Name -cnotin @('server','discoveryIdentityOrigin')){$value[$property.Name]=$property.Value}};return ($value|ConvertTo-Json -Depth 20 -Compress)
}
function IdentityNamespace($Identity){
 $value=if($Identity.PSObject.Properties.Name -contains 'discoveryIdentityOrigin'){$Identity.discoveryIdentityOrigin}else{([uri]$Identity.server).GetLeftPart([UriPartial]::Authority)}
 if($value -isnot [string] -or $value -match '[\\\s%]'){throw 'Connector discovery identity namespace differs'}
 $origin=[uri]$value;if($origin.Scheme -cnotin @('http','https') -or $origin.UserInfo -or $origin.Query -or $origin.Fragment -or $origin.AbsolutePath -cne '/' -or $origin.GetLeftPart([UriPartial]::Authority) -cne $value){throw 'Connector discovery identity namespace differs'};return $value
}
function DiscoveryIdentity($Identity,[switch]$Installed){
 $file=@($plan.files|Where-Object name -CEQ 'SystemDiscovery.cjs');if($file.Count -ne 1 -or ($Installed -and $null -eq $file[0].beforeSha256)){throw 'Update Discovery before migrating this legacy connection'}
 $module=if($Installed){Join-Path $root 'SystemDiscovery.cjs'}else{Join-Path $package 'deployment\servix\SystemDiscovery.cjs'};$expected=if($Installed){$file[0].beforeSha256}else{$file[0].sha256}
 # Read the exact installed or artifact-bound module into an isolated process.
 # Export its existing private function in memory; never edit the installed file.
 $program='let data="";process.stdin.setEncoding("utf8");process.stdin.on("data",x=>data+=x);process.stdin.on("end",async()=>{try{const Module=require("node:module"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),file=process.argv[1],bytes=fs.readFileSync(file);if(crypto.createHash("sha256").update(bytes).digest("hex")!==process.argv[2])throw Error();const m=new Module(file);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(bytes.toString("utf8")+"\nmodule.exports.__devsetuIdentity=installationIdentity;\n",file);const v=await m.exports.__devsetuIdentity(JSON.parse(data));if(!/^[a-f0-9]{64}$/.test(v))throw Error();process.stdout.write(v)}catch{process.exitCode=1}})'
 $info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=Join-Path $root 'node.exe';$info.Arguments='-e "'+$program.Replace('"','\"')+'" "'+$module+'" '+$expected;$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
 $process=[Diagnostics.Process]::new();$process.StartInfo=$info;$value=@{server=$Identity.server};if($Identity.PSObject.Properties.Name -contains 'discoveryIdentityOrigin'){$value.discoveryIdentityOrigin=$Identity.discoveryIdentityOrigin}
 try{[void]$process.Start();$bytes=[Text.Encoding]::UTF8.GetBytes(($value|ConvertTo-Json -Compress));$process.StandardInput.BaseStream.Write($bytes,0,$bytes.Length);$process.StandardInput.Close();if(-not $process.WaitForExit(15000)){$process.Kill();throw 'Connector discovery identity check deadline'};$result=$process.StandardOutput.ReadToEnd();if($process.ExitCode -ne 0 -or $result -cnotmatch '^[a-f0-9]{64}$'){throw 'Connector discovery identity check unavailable'};return $result}finally{$process.Dispose()}
}
function ScopeProof([string]$Server,[string]$Credential){
 try{$response=Invoke-WebRequest -UseBasicParsing -Uri ($Server.TrimEnd('/')+$identityEndpoint) -Method Post -ContentType 'application/json' -Body '{}' -Headers @{Authorization=('Bearer '+$Credential)} -MaximumRedirection 0 -TimeoutSec 10;return ($response.Content|ConvertFrom-Json)}catch{throw 'Preview server identity proof unavailable'}
}
function TaskIdentity([string]$Root,[string]$Id){
 $task=Get-ScheduledTask -TaskName ('FrevOS-Connector-'+$Id);$owner=$task.Principal.UserId
 if($owner -notmatch '^S-1-'){$owner=([Security.Principal.NTAccount]::new($owner)).Translate([Security.Principal.SecurityIdentifier]).Value}
 $expected='-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File "'+(Join-Path $Root 'Run-Connector.ps1')+'"'
 # Preserve either exact existing launcher generation. This tool never writes
 # a task definition or changes the machine's execution policy.
 if($owner -cne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value -or $task.Principal.RunLevel -cne 'Limited' -or $task.Principal.LogonType -cne 'Interactive' -or $task.Actions.Count -ne 1 -or $task.Actions[0].Execute -ine (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe') -or ($task.Actions[0].Arguments -cne $expected -and $task.Actions[0].Arguments -cne $expected.Replace('RemoteSigned','Bypass')) -or -not $task.Settings.Enabled){throw 'Preview connector task identity differs'}
 return $task
}
$extended=$Capability -cin @('Discovery','Transport','Software');$transport=$Capability -ceq 'Transport'
$names=if($Capability -ceq 'Software'){@('Connector.cjs','SoftwareClient.cjs','SoftwareNative.cjs','SoftwareNative.ps1','SoftwareProtocol.cjs','DemoApi.cjs','PreviewRelay.cjs','DiscoverySafety.cjs','GitDesktop.cjs','FrevOS.FolderPicker.exe')}elseif($extended){@('Connector.cjs','SystemDiscovery.cjs','DiscoverySafety.cjs','FolderBrowse.cjs','Browse-Folders.ps1')}elseif($Capability -ceq 'Git'){@('Connector.cjs','GitDesktop.cjs','FrevOS.FolderPicker.exe')}else{@('LocalDevelopment.cjs','PreviewRelay.cjs')}
$expectedAction=if($extended){'devsetu.'+$Capability.ToLowerInvariant()+'.connector-update.v1'}elseif($Capability -ceq 'Git'){'devsetu.git.connector-update.v1'}else{'devsetu.preview.connector-update.v1'}
$identityEndpoint=if($extended){'/v1/connector/connection-status'}elseif($Capability -ceq 'Git'){'/v1/connector/git-desktop/identity'}else{'/v1/connector/preview/identity'}
function VerifyProof($Proof,$Plan){
 $fields=if($extended){@('actor,deviceId,mode,profileId,ready,workspaceId','actor,deviceId,discoveryIdentityOrigin,mode,profileId,ready,workspaceId')}else{@('deviceId,profileId,workspaceId')}
 if((@($Proof.PSObject.Properties.Name|Sort-Object)-join ',') -cnotin $fields -or $Proof.deviceId -cne $Plan.deviceId -or $Proof.profileId -cne $Plan.profileId -or $Proof.workspaceId -cne $Plan.workspaceId){throw 'Preview server identity proof differs'}
 if($extended -and ($Proof.actor -cne $Plan.ownerId -or $Proof.mode -cne 'project' -or $Proof.ready -isnot [bool] -or -not $Proof.ready)){throw 'Preview connector owner or mode differs'}
}
if($DescribeDevice){
 if($PlanReference -or $PlanOnly){throw 'Describe does not accept an update intent'}
 $root=InstallRoot $DescribeDevice;Plain $root;$identity=ReadIdentity $root;[void](TaskIdentity $root $DescribeDevice)
 $profile=if($identity.PSObject.Properties.Name -contains 'profileId'){$identity.profileId}else{$null}
 if($identity.deviceId -cne $DescribeDevice -or ($null -ne $profile -and $profile -cnotmatch '^[a-z][a-z0-9-]{2,63}$') -or $identity.stateRoot -ine (Join-Path $root 'state')){throw 'Preview source identity differs'}
 $files=@{};foreach($name in $names){$file=Join-Path $root $name;if(Test-Path -LiteralPath $file){Plain $file;$files[$name]=Hash $file}else{$files[$name]=$null}}
 $description=@{version=1;deviceId=$DescribeDevice;profileId=$profile;installationRoot=$root;actorSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;configurationSha256=(Hash (Join-Path $root 'device.dpapi'));taskXmlSha256=[BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes((Export-ScheduledTask -TaskName ('FrevOS-Connector-'+$DescribeDevice))))).Replace('-','').ToLowerInvariant();files=$files}
 if($extended){$proof=ScopeProof $identity.server $identity.credential;if($proof.deviceId -cne $DescribeDevice -or $proof.profileId -cne $profile -or $proof.mode -cne 'project' -or $proof.actor -cnotmatch '^usr_[A-Za-z0-9_-]+$' -or $proof.workspaceId -cnotmatch '^ws_[A-Za-z0-9_-]+$' -or $proof.ready -isnot [bool] -or -not $proof.ready){throw 'Preview source account proof differs'};$description.ownerId=$proof.actor;$description.workspaceId=$proof.workspaceId}
 $description|ConvertTo-Json -Depth 5 -Compress
 $identity=$null;return
}
if(-not $PlanReference){throw 'A scoped preview connector update intent is required'}
Plain $PlanReference;if((Get-Item -LiteralPath $PlanReference).Length -gt 16384){throw 'Preview update intent capacity'}
$plan=Get-Content -LiteralPath $PlanReference -Raw|ConvertFrom-Json
$fields=@('action','actorSid','configurationSha256','createdAt','deviceId','expiresAt','files','id','manifestSha256','packageRoot','profileId','taskXmlSha256','version','workspaceId');if($extended){$fields+=,'ownerId'};if($transport){$fields+=,'transport'}
if((@($plan.PSObject.Properties.Name|Sort-Object)-join ',') -cne (@($fields|Sort-Object)-join ',') -or $plan.version -ne 1 -or $plan.action -cne $expectedAction -or $plan.id -cnotmatch '^pvu_[a-f0-9]{32}$' -or $plan.workspaceId -cnotmatch '^ws_[A-Za-z0-9_-]+$' -or $plan.actorSid -cne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value -or ($extended -and $plan.ownerId -cnotmatch '^usr_[A-Za-z0-9_-]+$')){throw 'Preview update intent scope differs'}
$now=[DateTimeOffset]::UtcNow
if(([DateTimeOffset]$plan.createdAt) -gt $now -or ([DateTimeOffset]$plan.expiresAt) -le $now -or (([DateTimeOffset]$plan.expiresAt)-([DateTimeOffset]$plan.createdAt)).TotalSeconds -gt 600){throw 'Preview update intent expired'}
$root=InstallRoot $plan.deviceId;Plain $root;$identity=ReadIdentity $root;[void](TaskIdentity $root $plan.deviceId)
if($identity.PSObject.Properties['mode'] -and $identity.mode -ceq 'system'){throw 'Pinned system runtime requires the full system connector updater; pairing is retained'}
if($identity.deviceId -cne $plan.deviceId -or (($identity.PSObject.Properties.Name -contains 'profileId') -and $identity.profileId -cne $plan.profileId) -or $identity.stateRoot -ine (Join-Path $root 'state') -or (Hash (Join-Path $root 'device.dpapi')) -cne $plan.configurationSha256){throw 'Preview enrollment changed'}
# Resolve a legacy implicit profile from current authenticated server authority,
# rather than introducing a project-name fallback in this updater.
$proof=ScopeProof $identity.server $identity.credential;VerifyProof $proof $plan
$package=[IO.Path]::GetFullPath($plan.packageRoot);Plain $package;$manifestFile=Join-Path $package 'release-manifest.json';Plain $manifestFile
if($plan.manifestSha256 -cnotmatch '^[a-f0-9]{64}$' -or (Hash $manifestFile) -cne $plan.manifestSha256 -or (Get-Item -LiteralPath $manifestFile).Length -gt 4000000){throw 'Preview release manifest differs'}
$manifest=Get-Content -LiteralPath $manifestFile -Raw|ConvertFrom-Json
if(@($plan.files).Count -ne $names.Count -or (@($plan.files.name|Sort-Object)-join ',') -cne (@($names|Sort-Object) -join ',')){throw 'Preview update files differ'}
foreach($item in $plan.files){
 if((@($item.PSObject.Properties.Name|Sort-Object)-join ',') -cne 'beforeSha256,name,sha256' -or $item.sha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'Preview sidecar intent differs'}
 $source=Join-Path $package ('deployment\servix\'+$item.name);Plain $source
 $entry=@($manifest.files|Where-Object path -CEQ ('deployment/servix/'+$item.name))
 if($entry.Count -ne 1 -or $entry[0].sha256 -cne $item.sha256 -or (Hash $source) -cne $item.sha256){throw 'Preview sidecar source differs'}
 $destination=Join-Path $root $item.name
 if(Test-Path -LiteralPath $destination){Plain $destination;if((Hash $destination) -cne $item.beforeSha256){throw 'Installed preview sidecar changed'}}elseif($null -ne $item.beforeSha256){throw 'Installed preview sidecar is missing'}
 if($item.name.EndsWith('.cjs')){
  & (Join-Path $root 'node.exe') --check $source *> $null
  if($LASTEXITCODE -ne 0){throw 'Preview sidecar syntax failed'}
 }elseif($item.name.EndsWith('.ps1')){
  $tokens=$null;$errors=$null;[void][Management.Automation.Language.Parser]::ParseFile($source,[ref]$tokens,[ref]$errors);if($errors.Count){throw 'Preview sidecar syntax failed'}
 }else{
  $header=[IO.File]::OpenRead($source);try{if($header.ReadByte() -ne 77 -or $header.ReadByte() -ne 90){throw 'Native picker image differs'}}finally{$header.Dispose()}
 }
}
$newServer=$null;$authorityFile=$null
if($transport){
 $route=$plan.transport
 if((@($route.PSObject.Properties.Name|Sort-Object)-join ',') -cne 'browserEntrySha256,platformRoot,server' -or $route.browserEntrySha256 -cnotmatch '^[a-f0-9]{64}$' -or $route.platformRoot -isnot [string] -or -not [IO.Path]::IsPathRooted($route.platformRoot)){throw 'Connector transport authority fields differ'}
 $platform=[IO.Path]::GetFullPath($route.platformRoot);Plain $platform
 $activeFile=Join-Path $platform 'state\active.json';Plain $activeFile
 if((Get-Item -LiteralPath $activeFile).Length -gt 65536 -or (Get-Content -LiteralPath $activeFile -Raw|ConvertFrom-Json).manifestSha256 -cne $plan.manifestSha256){throw 'Connector transport active artifact differs'}
 $authorityFile=Join-Path $platform 'servix\config\browser-entry.json';Plain $authorityFile
 if((Get-Item -LiteralPath $authorityFile).Length -gt 4096 -or (Hash $authorityFile) -cne $route.browserEntrySha256){throw 'Connector transport retained profile differs'}
 $entry=Get-Content -LiteralPath $authorityFile -Raw|ConvertFrom-Json
 if((@($entry.PSObject.Properties.Name|Sort-Object)-join ',') -cne 'basePath,connectorTransport,listen,proxyHosts,publicOrigin,version' -or $entry.version -isnot [int] -or $entry.version -ne 1 -or $entry.connectorTransport -isnot [bool] -or -not $entry.connectorTransport -or $entry.publicOrigin -isnot [string] -or $entry.publicOrigin -match '[\\\s%]' -or $entry.basePath -isnot [string] -or $entry.basePath.Length -gt 65 -or $entry.basePath -cnotmatch '^/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$'){throw 'Connector transport retained profile is not enabled'}
 $origin=[uri]$entry.publicOrigin
 if($origin.Scheme -cne 'https' -or $origin.UserInfo -or $origin.Query -or $origin.Fragment -or $origin.AbsolutePath -cne '/' -or $origin.GetLeftPart([UriPartial]::Authority) -cne $entry.publicOrigin){throw 'Connector transport requires the configured HTTPS origin'}
 if((@($entry.listen.PSObject.Properties.Name|Sort-Object)-join ',') -cne 'host,port' -or $entry.listen.host -cne '127.0.0.1' -or $entry.listen.port -isnot [int] -or $entry.listen.port -lt 1024 -or $entry.listen.port -gt 65535 -or @($entry.proxyHosts).Count -gt 4 -or @($entry.proxyHosts|Where-Object {$_ -isnot [string] -or $_.Length -gt 260 -or $_ -cnotmatch '^[a-zA-Z0-9.-]+(?::[0-9]{1,5})?$'}).Count){throw 'Connector transport retained listener differs'}
 $newServer=$entry.publicOrigin+$entry.basePath
 if($route.server -isnot [string] -or $route.server -cne $newServer -or $identity.server -ceq $newServer){throw 'Connector transport destination differs'}
 $publicProof=ScopeProof $newServer $identity.credential;VerifyProof $publicProof $plan
}
$identityOrigin=if($transport){IdentityNamespace $identity}else{$null};$oldDiscoveryIdentity=if($transport){DiscoveryIdentity $identity -Installed}else{$null}
if($transport -and (($proof.PSObject.Properties.Name -contains 'discoveryIdentityOrigin') -or ($publicProof.PSObject.Properties.Name -contains 'discoveryIdentityOrigin'))){
 if(($proof.PSObject.Properties.Name -notcontains 'discoveryIdentityOrigin') -or ($publicProof.PSObject.Properties.Name -notcontains 'discoveryIdentityOrigin') -or $proof.discoveryIdentityOrigin -cne $publicProof.discoveryIdentityOrigin){throw 'Connector server discovery namespace differs'}
 [void](IdentityNamespace ([pscustomobject]@{server=$identity.server;discoveryIdentityOrigin=$publicProof.discoveryIdentityOrigin}))
}
$protectedFields=ProtectedFields $identity
$permissionFiles=@('state\discovery-consent.json','state\notifications-consent.json','state\software\consent.json');$permissionHashes=@{};$permissionAcls=@{}
foreach($relative in $permissionFiles){$file=Join-Path $root $relative;if(Test-Path -LiteralPath $file){Plain $file;$permissionHashes[$relative]=Hash $file;$permissionAcls[$relative]=(Get-Acl -LiteralPath $file).Sddl}else{$permissionHashes[$relative]=$null}}
function VerifyPermissions {foreach($relative in $permissionFiles){$file=Join-Path $root $relative;$actual=if(Test-Path -LiteralPath $file){Plain $file;Hash $file}else{$null};if($actual -cne $permissionHashes[$relative] -or ($permissionAcls.ContainsKey($relative) -and (Get-Acl -LiteralPath $file).Sddl -cne $permissionAcls[$relative])){throw 'Connector local permissions changed'}}}
$taskName='FrevOS-Connector-'+$plan.deviceId;$taskXml=Export-ScheduledTask -TaskName $taskName
$taskHash=[BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($taskXml))).Replace('-','').ToLowerInvariant()
if($taskHash -cne $plan.taskXmlSha256){throw 'Preview task definition changed'}
$rootAcl=(Get-Acl -LiteralPath $root).Sddl
$configurationAcl=(Get-Acl -LiteralPath (Join-Path $root 'device.dpapi')).Sddl
$fileAcls=@{};foreach($item in $plan.files){if($null -ne $item.beforeSha256){$fileAcls[$item.name]=(Get-Acl -LiteralPath (Join-Path $root $item.name)).Sddl}}
function VerifySidecars([bool]$Restored){
 foreach($item in $plan.files){$file=Join-Path $root $item.name;$expected=if($Restored){$item.beforeSha256}else{$item.sha256};if($null -eq $expected){if(Test-Path -LiteralPath $file){throw 'Preview recovery retained an unreviewed sidecar'}}else{Plain $file;if((Hash $file) -cne $expected -or ($fileAcls.ContainsKey($item.name) -and (Get-Acl -LiteralPath $file).Sddl -cne $fileAcls[$item.name])){throw 'Preview sidecar hash or permissions differ'}}}
}
if($PlanOnly){@{status='READY';action=$plan.action;id=$plan.id;deviceId=$plan.deviceId;profileId=$plan.profileId;identityPreserved=$true;transportChange=$transport}|ConvertTo-Json -Compress;return}
$backup=Join-Path $root ('.local\preview-update-'+$plan.id)
if(Test-Path -LiteralPath $backup){throw 'Preview update intent already consumed'}
$backupParent=[IO.Path]::GetDirectoryName($backup);if(Test-Path -LiteralPath $backupParent){Plain $backupParent}
[void][IO.Directory]::CreateDirectory($backup);Plain $backup;[IO.File]::WriteAllText((Join-Path $backup 'intent.json'),($plan|ConvertTo-Json -Depth 7 -Compress),[Text.UTF8Encoding]::new($false))
[IO.File]::Copy((Join-Path $root 'device.dpapi'),(Join-Path $backup 'device.before.dpapi'),$false)
foreach($item in $plan.files){if($null -ne $item.beforeSha256){[IO.File]::Copy((Join-Path $root $item.name),(Join-Path $backup $item.name),$false)}}
function StopOwned {
 Disable-ScheduledTask -TaskName $taskName|Out-Null;Stop-ScheduledTask -TaskName $taskName
 $deadline=[DateTimeOffset]::UtcNow.AddSeconds(30)
 $nodePath=(Join-Path $root 'node.exe').Replace('\','\\').Replace("'","\'")
 while((Get-ScheduledTask -TaskName $taskName).State -ceq 'Running' -or @(Get-CimInstance -ClassName Win32_Process -Filter ("ExecutablePath='"+$nodePath+"'") -Property ProcessId,ExecutablePath).Count){if([DateTimeOffset]::UtcNow -gt $deadline){throw 'Preview connector stop deadline'};Start-Sleep -Milliseconds 200}
}
function AwaitRunning {$deadline=[DateTimeOffset]::UtcNow.AddSeconds(15);while((Get-ScheduledTask -TaskName $taskName).State -cne 'Running'){if([DateTimeOffset]::UtcNow -gt $deadline){throw 'Preview connector start deadline'};Start-Sleep -Milliseconds 200}}
$newConfigurationSha256=$null
try{
 StopOwned
 if((Hash (Join-Path $root 'device.dpapi')) -cne $plan.configurationSha256){throw 'Preview identity changed during update'}
 foreach($item in $plan.files){
  $destination=Join-Path $root $item.name;$temporary=$destination+'.'+$plan.id+'.tmp'
  IoRetry {[IO.File]::Copy((Join-Path $package ('deployment\servix\'+$item.name)),$temporary,$false)}
  if((Hash $temporary) -cne $item.sha256){throw 'Preview source changed before atomic replacement'}
  if($null -ne $item.beforeSha256){if((Hash $destination) -cne $item.beforeSha256){throw 'Preview sidecar changed during update'};CopyReviewedAcl $destination $temporary;IoRetry {[IO.File]::Replace($temporary,$destination,(Join-Path $backup ('atomic-'+$item.name)))}}else{IoRetry {[IO.File]::Move($temporary,$destination)}}
  if((Hash $destination) -cne $item.sha256){throw 'Preview sidecar replacement differs'}
 }
 if((Hash (Join-Path $root 'device.dpapi')) -cne $plan.configurationSha256 -or (Get-Acl -LiteralPath $root).Sddl -cne $rootAcl){throw 'Preview identity or permissions changed'}
 if($transport){
  if((Hash $authorityFile) -cne $plan.transport.browserEntrySha256 -or (Get-Content -LiteralPath (Join-Path $platform 'state\active.json') -Raw|ConvertFrom-Json).manifestSha256 -cne $plan.manifestSha256){throw 'Connector transport authority changed during update'}
  $identity.server=$newServer;if($identity.PSObject.Properties.Name -notcontains 'discoveryIdentityOrigin'){$identity|Add-Member -NotePropertyName discoveryIdentityOrigin -NotePropertyValue $identityOrigin}
  if((DiscoveryIdentity $identity) -cne $oldDiscoveryIdentity){throw 'Connector discovery identity would change'}
  $clear=[Text.Encoding]::UTF8.GetBytes(($identity|ConvertTo-Json -Depth 20 -Compress))
  try{$cipher=[Security.Cryptography.ProtectedData]::Protect($clear,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);$configuration=Join-Path $root 'device.dpapi';$temporary=$configuration+'.'+$plan.id+'.tmp';[IO.File]::WriteAllBytes($temporary,$cipher);CopyReviewedAcl $configuration $temporary;$newConfigurationSha256=Hash $temporary;IoRetry {[IO.File]::Replace($temporary,$configuration,(Join-Path $backup 'atomic-device.dpapi'))};if((Hash $configuration) -cne $newConfigurationSha256){throw 'Connector transport replacement differs'}}finally{[Array]::Clear($clear,0,$clear.Length)}
  $retained=ReadIdentity $root;if($retained.server -cne $newServer -or (IdentityNamespace $retained) -cne $identityOrigin -or (ProtectedFields $retained) -cne $protectedFields -or (DiscoveryIdentity $retained) -cne $oldDiscoveryIdentity){throw 'Connector protected fields changed'};$retained=$null
 }
 VerifyPermissions
 Enable-ScheduledTask -TaskName $taskName|Out-Null;Start-ScheduledTask -TaskName $taskName
 AwaitRunning
 if((Export-ScheduledTask -TaskName $taskName) -cne $taskXml -or (Get-Acl -LiteralPath (Join-Path $root 'device.dpapi')).Sddl -cne $configurationAcl){throw 'Preview task definition or enrollment permissions changed'}
 if($transport){$publicProof=ScopeProof $newServer $identity.credential;VerifyProof $publicProof $plan}
 VerifyPermissions
 VerifySidecars $false
 $result=@{status='PASS';action=$plan.action;id=$plan.id;workspaceId=$plan.workspaceId;deviceId=$plan.deviceId;profileId=$plan.profileId;manifestSha256=$plan.manifestSha256;pairingBytesPreserved=(-not $transport);pairingIdentityPreserved=$true;configurationFieldsPreservedExceptTransport=$true;discoveryIdentityPreserved=$true;transportChanged=$transport;taskDefinitionPreserved=$true;permissionsPreserved=$true;backup=$backup}
 [IO.File]::WriteAllText((Join-Path $backup 'result.json'),($result|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false));$result|ConvertTo-Json -Compress
}catch{
 $failure=$_;StopOwned
 $configuration=Join-Path $root 'device.dpapi';$current=Hash $configuration
 if($current -cne $plan.configurationSha256){if(-not $newConfigurationSha256 -or $current -cne $newConfigurationSha256){throw 'Preview recovery requires review of independent enrollment changes'};$temporary=$configuration+'.'+$plan.id+'.restore';[IO.File]::Copy((Join-Path $backup 'device.before.dpapi'),$temporary,$false);CopyReviewedAcl $configuration $temporary;IoRetry {[IO.File]::Replace($temporary,$configuration,(Join-Path $backup 'failed-device.dpapi'))}}
 foreach($item in $plan.files){$destination=Join-Path $root $item.name
  if(Test-Path -LiteralPath $destination){if((Hash $destination) -cnotin @($item.sha256,$item.beforeSha256)){throw 'Preview recovery requires review of independent changes'}}
  if($null -ne $item.beforeSha256){[IO.File]::Copy((Join-Path $backup $item.name),$destination,$true)}elseif(Test-Path -LiteralPath $destination){if([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($destination)) -cne $root){throw 'Preview recovery escaped its root'};Remove-Item -LiteralPath $destination -Force}
 }
 Enable-ScheduledTask -TaskName $taskName|Out-Null;Start-ScheduledTask -TaskName $taskName
 AwaitRunning
 if((Hash $configuration) -cne $plan.configurationSha256 -or (Get-Acl -LiteralPath $configuration).Sddl -cne $configurationAcl -or (Export-ScheduledTask -TaskName $taskName) -cne $taskXml -or (Get-Acl -LiteralPath $root).Sddl -cne $rootAcl){throw 'Preview recovery preservation failed'}
 VerifySidecars $true;VerifyPermissions
 [IO.File]::WriteAllText((Join-Path $backup 'recovery.json'),'{"status":"RESTORED"}',[Text.UTF8Encoding]::new($false));throw 'Preview update failed; previous sidecars restored; inspect scoped receipt'
}finally{$identity=$null}
