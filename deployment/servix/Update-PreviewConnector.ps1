param([string]$PlanReference,[string]$DescribeDevice,[switch]$PlanOnly,[ValidateSet('Preview','Git')][string]$Capability='Preview')
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
function TaskIdentity([string]$Root,[string]$Id){
 $task=Get-ScheduledTask -TaskName ('FrevOS-Connector-'+$Id);$owner=$task.Principal.UserId
 if($owner -notmatch '^S-1-'){$owner=([Security.Principal.NTAccount]::new($owner)).Translate([Security.Principal.SecurityIdentifier]).Value}
 $expected='-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File "'+(Join-Path $Root 'Run-Connector.ps1')+'"'
 # Preserve either exact existing launcher generation. This tool never writes
 # a task definition or changes the machine's execution policy.
 if($owner -cne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value -or $task.Principal.RunLevel -cne 'Limited' -or $task.Principal.LogonType -cne 'Interactive' -or $task.Actions.Count -ne 1 -or $task.Actions[0].Execute -ine (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe') -or ($task.Actions[0].Arguments -cne $expected -and $task.Actions[0].Arguments -cne $expected.Replace('RemoteSigned','Bypass')) -or -not $task.Settings.Enabled){throw 'Preview connector task identity differs'}
 return $task
}
$names=if($Capability -ceq 'Git'){@('Connector.cjs','GitDesktop.cjs','FrevOS.FolderPicker.exe')}else{@('LocalDevelopment.cjs','PreviewRelay.cjs')}
$expectedAction=if($Capability -ceq 'Git'){'devsetu.git.connector-update.v1'}else{'devsetu.preview.connector-update.v1'}
$identityEndpoint=if($Capability -ceq 'Git'){'/v1/connector/git-desktop/identity'}else{'/v1/connector/preview/identity'}
if($DescribeDevice){
 if($PlanReference -or $PlanOnly){throw 'Describe does not accept an update intent'}
 $root=InstallRoot $DescribeDevice;Plain $root;$identity=ReadIdentity $root;[void](TaskIdentity $root $DescribeDevice)
 $profile=if($identity.PSObject.Properties.Name -contains 'profileId'){$identity.profileId}else{$null}
 if($identity.deviceId -cne $DescribeDevice -or ($null -ne $profile -and $profile -cnotmatch '^[a-z][a-z0-9-]{2,63}$') -or $identity.stateRoot -ine (Join-Path $root 'state')){throw 'Preview source identity differs'}
 $files=@{};foreach($name in $names){$file=Join-Path $root $name;if(Test-Path -LiteralPath $file){Plain $file;$files[$name]=Hash $file}else{$files[$name]=$null}}
 @{version=1;deviceId=$DescribeDevice;profileId=$profile;installationRoot=$root;actorSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;configurationSha256=(Hash (Join-Path $root 'device.dpapi'));taskXmlSha256=[BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes((Export-ScheduledTask -TaskName ('FrevOS-Connector-'+$DescribeDevice))))).Replace('-','').ToLowerInvariant();files=$files}|ConvertTo-Json -Depth 5 -Compress
 $identity=$null;return
}
if(-not $PlanReference){throw 'A scoped preview connector update intent is required'}
Plain $PlanReference;if((Get-Item -LiteralPath $PlanReference).Length -gt 16384){throw 'Preview update intent capacity'}
$plan=Get-Content -LiteralPath $PlanReference -Raw|ConvertFrom-Json
if((@($plan.PSObject.Properties.Name|Sort-Object)-join ',') -cne 'action,actorSid,configurationSha256,createdAt,deviceId,expiresAt,files,id,manifestSha256,packageRoot,profileId,taskXmlSha256,version,workspaceId' -or $plan.version -ne 1 -or $plan.action -cne $expectedAction -or $plan.id -cnotmatch '^pvu_[a-f0-9]{32}$' -or $plan.workspaceId -cnotmatch '^ws_[A-Za-z0-9_-]+$' -or $plan.actorSid -cne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value){throw 'Preview update intent scope differs'}
$now=[DateTimeOffset]::UtcNow
if(([DateTimeOffset]$plan.createdAt) -gt $now -or ([DateTimeOffset]$plan.expiresAt) -le $now -or (([DateTimeOffset]$plan.expiresAt)-([DateTimeOffset]$plan.createdAt)).TotalSeconds -gt 600){throw 'Preview update intent expired'}
$root=InstallRoot $plan.deviceId;Plain $root;$identity=ReadIdentity $root;[void](TaskIdentity $root $plan.deviceId)
if($identity.PSObject.Properties['mode'] -and $identity.mode -ceq 'system'){throw 'Pinned system runtime requires the full system connector updater; pairing is retained'}
if($identity.deviceId -cne $plan.deviceId -or (($identity.PSObject.Properties.Name -contains 'profileId') -and $identity.profileId -cne $plan.profileId) -or $identity.stateRoot -ine (Join-Path $root 'state') -or (Hash (Join-Path $root 'device.dpapi')) -cne $plan.configurationSha256){throw 'Preview enrollment changed'}
# Resolve a legacy implicit profile from current authenticated server authority,
# rather than introducing a project-name fallback in this updater.
try{$proofResponse=Invoke-WebRequest -UseBasicParsing -Uri ($identity.server.TrimEnd('/')+$identityEndpoint) -Method Post -ContentType 'application/json' -Body '{}' -Headers @{Authorization=('Bearer '+$identity.credential)} -MaximumRedirection 0 -TimeoutSec 10;$proof=$proofResponse.Content|ConvertFrom-Json}catch{throw 'Preview server identity proof unavailable'}
if((@($proof.PSObject.Properties.Name|Sort-Object)-join ',') -cne 'deviceId,profileId,workspaceId' -or $proof.deviceId -cne $plan.deviceId -or $proof.profileId -cne $plan.profileId -or $proof.workspaceId -cne $plan.workspaceId){throw 'Preview server identity proof differs'}
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
 }else{
  $header=[IO.File]::OpenRead($source);try{if($header.ReadByte() -ne 77 -or $header.ReadByte() -ne 90){throw 'Native picker image differs'}}finally{$header.Dispose()}
 }
}
$taskName='FrevOS-Connector-'+$plan.deviceId;$taskXml=Export-ScheduledTask -TaskName $taskName
$taskHash=[BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($taskXml))).Replace('-','').ToLowerInvariant()
if($taskHash -cne $plan.taskXmlSha256){throw 'Preview task definition changed'}
$rootAcl=(Get-Acl -LiteralPath $root).Sddl
if($PlanOnly){@{status='READY';action=$plan.action;id=$plan.id;deviceId=$plan.deviceId;profileId=$plan.profileId;identityPreserved=$true}|ConvertTo-Json -Compress;return}
$backup=Join-Path $root ('.local\preview-update-'+$plan.id)
if(Test-Path -LiteralPath $backup){throw 'Preview update intent already consumed'}
[void][IO.Directory]::CreateDirectory($backup);[IO.File]::WriteAllText((Join-Path $backup 'intent.json'),($plan|ConvertTo-Json -Depth 7 -Compress),[Text.UTF8Encoding]::new($false))
[IO.File]::Copy((Join-Path $root 'device.dpapi'),(Join-Path $backup 'device.before.dpapi'),$false)
foreach($item in $plan.files){if($null -ne $item.beforeSha256){[IO.File]::Copy((Join-Path $root $item.name),(Join-Path $backup $item.name),$false)}}
function StopOwned {
 Disable-ScheduledTask -TaskName $taskName|Out-Null;Stop-ScheduledTask -TaskName $taskName
 $deadline=[DateTimeOffset]::UtcNow.AddSeconds(30)
 while((Get-ScheduledTask -TaskName $taskName).State -ceq 'Running'){if([DateTimeOffset]::UtcNow -gt $deadline){throw 'Preview connector stop deadline'};Start-Sleep -Milliseconds 200}
}
try{
 StopOwned
 if((Hash (Join-Path $root 'device.dpapi')) -cne $plan.configurationSha256){throw 'Preview identity changed during update'}
 foreach($item in $plan.files){
  $destination=Join-Path $root $item.name;$temporary=$destination+'.'+$plan.id+'.tmp'
  [IO.File]::Copy((Join-Path $package ('deployment\servix\'+$item.name)),$temporary,$false)
  if($null -ne $item.beforeSha256){if((Hash $destination) -cne $item.beforeSha256){throw 'Preview sidecar changed during update'};CopyReviewedAcl $destination $temporary;[IO.File]::Replace($temporary,$destination,(Join-Path $backup ('atomic-'+$item.name)))}else{[IO.File]::Move($temporary,$destination)}
  if((Hash $destination) -cne $item.sha256){throw 'Preview sidecar replacement differs'}
 }
 if((Hash (Join-Path $root 'device.dpapi')) -cne $plan.configurationSha256 -or (Get-Acl -LiteralPath $root).Sddl -cne $rootAcl){throw 'Preview identity or permissions changed'}
 Enable-ScheduledTask -TaskName $taskName|Out-Null;Start-ScheduledTask -TaskName $taskName
 if((Export-ScheduledTask -TaskName $taskName) -cne $taskXml){throw 'Preview task definition changed'}
 $result=@{status='PASS';action=$plan.action;id=$plan.id;workspaceId=$plan.workspaceId;deviceId=$plan.deviceId;profileId=$plan.profileId;manifestSha256=$plan.manifestSha256;pairingBytesPreserved=$true;taskDefinitionPreserved=$true;permissionsPreserved=$true;backup=$backup}
 [IO.File]::WriteAllText((Join-Path $backup 'result.json'),($result|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false));$result|ConvertTo-Json -Compress
}catch{
 $failure=$_;StopOwned
 foreach($item in $plan.files){$destination=Join-Path $root $item.name
  if(Test-Path -LiteralPath $destination){if((Hash $destination) -cnotin @($item.sha256,$item.beforeSha256)){throw 'Preview recovery requires review of independent changes'}}
  if($null -ne $item.beforeSha256){[IO.File]::Copy((Join-Path $backup $item.name),$destination,$true)}elseif(Test-Path -LiteralPath $destination){if([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($destination)) -cne $root){throw 'Preview recovery escaped its root'};Remove-Item -LiteralPath $destination -Force}
 }
 Enable-ScheduledTask -TaskName $taskName|Out-Null;Start-ScheduledTask -TaskName $taskName
 [IO.File]::WriteAllText((Join-Path $backup 'recovery.json'),'{"status":"RESTORED"}',[Text.UTF8Encoding]::new($false));throw 'Preview update failed; previous sidecars restored; inspect scoped receipt'
}finally{$identity=$null}
