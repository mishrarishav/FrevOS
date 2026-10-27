Set-StrictMode -Version Latest
$script:PromotionInitialized=$false
function Assert-BackendPlainPath([string]$Path){
 for($p=[IO.Path]::GetFullPath($Path);;){if((Test-Path -LiteralPath $p) -and ((Get-Item -LiteralPath $p -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked promotion path rejected'};$parent=[IO.Path]::GetDirectoryName($p);if(-not $parent -or $parent -ceq $p){return};$p=$parent}
}
function Write-PromotionJson([string]$File,$Value,[switch]$New){
 $text=$Value|ConvertTo-Json -Depth 40 -Compress
 if($New){$s=[IO.File]::Open($File,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$b=[Text.UTF8Encoding]::new($false).GetBytes($text);$s.Write($b,0,$b.Length);$s.Flush($true)}finally{$s.Dispose()};return}
 $tmp=$File+'.'+[guid]::NewGuid().ToString('N')+'.tmp';Write-PromotionJson $tmp $Value -New
 if(Test-Path -LiteralPath $File){[IO.File]::Replace($tmp,$File,($File+'.previous'))}else{[IO.File]::Move($tmp,$File)}
}
function New-PromotionPrivate([string]$Directory){
 Assert-BackendPlainPath $Directory
 if(Test-Path -LiteralPath $Directory){throw 'Promotion private directory collision'}
 [void][IO.Directory]::CreateDirectory($Directory)
 $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
 $acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetOwner($sid);$acl.SetAccessRuleProtection($true,$false)
 $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
 [IO.DirectoryInfo]::new($Directory).SetAccessControl($acl)
}
function Invoke-PromotionNode([string]$Node,[string]$File,[string[]]$Arguments,[string]$InputText=''){
 $info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=$Node;$info.UseShellExecute=$false;$info.CreateNoWindow=$true
 $all=@($File)+$Arguments
 if((Split-Path $File -Leaf) -ceq 'PromotionBackup.cjs'){
  $info.FileName=Join-Path $env:windir 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $argsJson=ConvertTo-Json -InputObject @($Arguments) -Compress
  $all=@('-NoProfile','-NonInteractive','-File',(Join-Path $PSScriptRoot 'Run-PromotionHelper.ps1'),'-Node',$Node,'-Script',$File,'-ArgumentsBase64',[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($argsJson)))
 }
 foreach($arg in $all){if($arg.Contains('"') -or $arg.Contains("`n") -or $arg.Contains("`r")){throw 'Operator argument shape rejected'}}
 $info.Arguments=(@($all|ForEach-Object {'"'+$_+'"'}) -join ' ')
 $info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true;$info.EnvironmentVariables['NODE_OPTIONS']=''
 $info.EnvironmentVariables.Remove('PSModulePath')
 $p=[Diagnostics.Process]::new();$p.StartInfo=$info
 try{
  if(-not $p.Start()){throw 'Promotion helper unavailable'}
  $stdout=$p.StandardOutput.ReadToEndAsync();$stderr=$p.StandardError.ReadToEndAsync()
  # PowerShell 5.1 console pipes may use an OEM code page. Preserve JSON values
  # as ASCII escapes until the private Node child parses the input.
  $asciiInput=[regex]::Replace($InputText,'[^\x00-\x7f]',{param($m) '\u'+([int][char]$m.Value).ToString('x4')})
  $p.StandardInput.Write($asciiInput);$p.StandardInput.Close();$InputText=$null;$asciiInput=$null
  if(-not $p.WaitForExit(1500000)){$p.Kill();throw 'Promotion helper timed out'}
  $out=$stdout.GetAwaiter().GetResult();[void]$stderr.GetAwaiter().GetResult()
  if($p.ExitCode -ne 0 -or [Text.Encoding]::UTF8.GetByteCount($out) -gt 2097152){throw 'Promotion helper did not verify'}
  return $out
 }finally{if(-not $p.HasExited){$p.Kill()};$p.Dispose();$InputText=$null}
}
function Get-PromotionHash([string]$File){Assert-BackendPlainPath $File;return (Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant()}
function Get-PromotionObservedManaged($Observation){
 # Remoting preserves hashtables as dictionaries, whose keys are not exposed
 # through PSObject.Properties. Keep the verified managed binding in the review.
 $hasManaged=if($Observation -is [Collections.IDictionary]){$Observation.Contains('managed')}else{[bool]$Observation.PSObject.Properties['managed']}
 if([bool]$Observation.taskAlreadyExists -ne [bool]$hasManaged){throw 'Observed managed task evidence missing or inconsistent'}
 if(-not $hasManaged){return $null}
 $managed=$Observation.managed
 if(-not $managed -or $managed.id -cnotmatch '^pm_[a-f0-9]{32}$'){throw 'Observed managed task identity rejected'}
 return $managed
}
function ConvertTo-PromotionBackupInput([string]$Directory,[string]$ScopeSha256,$Client,$Database){
 Add-Type -AssemblyName System.Web.Extensions
 if(-not ('DevSetuPromotionBackupInputV1' -as [type])){
  Add-Type -TypeDefinition @'
public sealed class DevSetuPromotionDatabaseV1 {
 public string host, database, user, password;
 public int port;
}
public sealed class DevSetuPromotionBackupInputV1 {
 public string directory, scopeSha256, clientRoot, clientSha256, dumpSha256, version;
 public DevSetuPromotionDatabaseV1 environment;
}
'@
 }
 # Strongly typed fields unwrap PowerShell path/hash output objects. Reflection
 # must see only this fixed private wire schema, never provider/PSObject metadata.
 $value=[DevSetuPromotionBackupInputV1]::new();$value.directory=$Directory;$value.scopeSha256=$ScopeSha256
 $value.clientRoot=[string]$Client.root;$value.clientSha256=[string]$Client.clientSha256;$value.dumpSha256=[string]$Client.dumpSha256;$value.version=[string]$Client.version
 $value.environment=[DevSetuPromotionDatabaseV1]::new();$value.environment.host=[string]$Database.host;$value.environment.port=[int]$Database.port
 $value.environment.database=[string]$Database.database;$value.environment.user=[string]$Database.user;$value.environment.password=[string]$Database.password
 try{return [System.Web.Script.Serialization.JavaScriptSerializer]::new().Serialize($value)}finally{$value.environment.password=$null;$value=$null}
}
function Set-PromotionProgress([string]$PublicRoot,[string]$Id,[string]$Stage,[string]$Workspace){
 Write-PromotionJson (Join-Path $PublicRoot 'results\heartbeat.json') @{version=1;workspaceId=$Workspace;at=[DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')}
 Write-PromotionJson (Join-Path $PublicRoot ('results\'+$Id+'.json')) @{version=1;id=$Id;status='working';stage=$Stage;updatedAt=[DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')}
}
function Get-PromotionMysql([string]$PrivateRoot){
 $tools=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'PromotionTools.json') -Raw|ConvertFrom-Json
 $pin=$tools.mysql
 if($tools.version -ne 1 -or $pin.url -cnotmatch '^https://cdn\.mysql\.com/archives/mysql-8\.0/mysql-8\.0\.[0-9]{1,3}-winx64\.zip$' -or $pin.sha256 -cnotmatch '^[a-f0-9]{64}$' -or $pin.directory -cnotmatch '^mysql-8\.0\.[0-9]{1,3}-winx64$' -or $pin.bytes -lt 1 -or $pin.bytes -gt 314572800){throw 'Backup tool pin rejected'}
 $cache=Join-Path $PrivateRoot 'tools';[void][IO.Directory]::CreateDirectory($cache);Assert-BackendPlainPath $cache
 $archive=Join-Path $cache ($pin.sha256+'.zip')
 if(-not(Test-Path -LiteralPath $archive)){
  $download=$archive+'.download';if(Test-Path -LiteralPath $download){throw 'Interrupted backup-tool download requires inspection'}
  [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest -UseBasicParsing -Uri $pin.url -OutFile $download -TimeoutSec 600
  if((Get-Item -LiteralPath $download).Length -ne $pin.bytes -or (Get-PromotionHash $download) -cne $pin.sha256){throw 'Backup tool archive integrity failed'}
  [IO.File]::Move($download,$archive)
 }
 if((Get-Item -LiteralPath $archive).Length -ne $pin.bytes -or (Get-PromotionHash $archive) -cne $pin.sha256){throw 'Backup tool cache differs'}
 $destination=Join-Path $cache $pin.sha256
 Add-Type -AssemblyName System.IO.Compression.FileSystem
 $zip=[IO.Compression.ZipFile]::OpenRead($archive)
 try{
  foreach($name in @('mysql.exe','mysqldump.exe','libcrypto-1_1-x64.dll','libssl-1_1-x64.dll')){
   $entries=@($zip.Entries|Where-Object FullName -CEQ ($pin.directory+'/bin/'+$name));if($entries.Count -ne 1 -or $entries[0].Length -gt 33554432){throw 'Backup client file missing'}
   $file=Join-Path $destination ('bin\'+$name);Assert-BackendPlainPath $file
   $inputStream=$entries[0].Open();$sha=[Security.Cryptography.SHA256]::Create();try{$expected=([BitConverter]::ToString($sha.ComputeHash($inputStream))).Replace('-','').ToLowerInvariant()}finally{$inputStream.Dispose();$sha.Dispose()}
   if(Test-Path -LiteralPath $file){if((Get-PromotionHash $file) -cne $expected){throw 'Backup client cache changed'}}else{[void][IO.Directory]::CreateDirectory((Split-Path $file));[IO.Compression.ZipFileExtensions]::ExtractToFile($entries[0],$file,$false)}
  }
 }finally{$zip.Dispose()}
 return @{root=$destination;version=$pin.version;clientSha256=(Get-PromotionHash (Join-Path $destination 'bin\mysql.exe'));dumpSha256=(Get-PromotionHash (Join-Path $destination 'bin\mysqldump.exe'))}
}
function Get-PromotionManagedEvidence([string]$PrivateRoot,[string]$PublicRoot,$Job){
 $known=@()
 foreach($claim in @(Get-ChildItem -LiteralPath (Join-Path $PrivateRoot 'claims') -Directory | Sort-Object Name)){
  if($claim.Name -cnotmatch '^pm_[a-f0-9]{32}$'){throw 'Managed receipt identity rejected'}
  $receiptFile=Join-Path $claim.FullName 'target-receipt.json';$jobFile=Join-Path $PublicRoot ('jobs\'+$claim.Name+'.json')
  if(-not(Test-Path -LiteralPath $receiptFile) -or -not(Test-Path -LiteralPath $jobFile)){continue}
  $old=Get-Content -LiteralPath $jobFile -Raw|ConvertFrom-Json
  if($old.action -cne 'promote' -or $old.requestedBy -cne $Job.requestedBy -or $old.workspaceId -cne $Job.workspaceId -or $old.target.profileId -cne $Job.target.profileId -or $old.target.host -cne $Job.target.host -or $old.target.root -cne $Job.target.root -or $old.target.repositoryId -cne $Job.target.repositoryId){continue}
  $receipt=Get-Content -LiteralPath $receiptFile -Raw|ConvertFrom-Json
  if($receipt.status -cne 'succeeded' -or -not $receipt.runtimeTaskRegistered){continue}
  $prepared=Join-Path $PrivateRoot ('claims\'+$old.reviewId)
  $sealed=Get-Content -LiteralPath (Join-Path $prepared 'review.json') -Raw|ConvertFrom-Json
  $contextFile=Join-Path $prepared 'prepared-context.json';$hashesFile=Join-Path $prepared 'operator-hashes.json'
  if((Get-PromotionHash $contextFile) -cne $sealed.review.privateSnapshotSha256 -or (Get-PromotionHash $hashesFile) -cne $sealed.review.runtimeSha256){throw 'Previous managed evidence changed'}
  $context=Get-Content -LiteralPath $contextFile -Raw|ConvertFrom-Json
  $entry=@{id=$old.id;runtime=$receipt.runtime;configurationSha256=$receipt.configurationSha256;launcherArguments=$receipt.launcherArguments;ownerSid=$context.ownerSid;descriptor=$context.descriptor;descriptorSha256=$context.descriptorSha256;launcherSha256=$context.operatorHashes.'Run-SavedBackend.ps1'}
  if($receipt.PSObject.Properties['frontendDigest']){$entry.frontendDigest=$receipt.frontendDigest}
  $known+=$entry
 }
 if($known.Count -gt 1000){throw 'Managed evidence budget exceeded'}
 return @($known | Select-Object -Last 30)
}
function Get-PromotionSavedBackend($Job,[scriptblock]$ReadRelease,[string]$Root){
 $bindings=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'PromotionConnections.json') -Raw|ConvertFrom-Json
 $repository=$bindings.repositories.PSObject.Properties[$Job.target.repositoryId].Value
 if(-not $repository){throw 'Repository registry binding missing'}
 $identity=& $repository.git -c ('safe.directory='+$repository.path) ('--git-dir='+$repository.path) config --get frevos.repositoryId
 if($LASTEXITCODE -ne 0 -or ($identity|Out-String).Trim() -cne $Job.target.repositoryId){throw 'Promotion repository identity changed'}
 $saved=& $ReadRelease $Job.developmentRequestId
 $proof=$saved.approval;$claim=Join-Path $Root ('private\claims\'+$Job.developmentRequestId)
 $receipt=Get-Content -LiteralPath (Join-Path $claim 'target-receipt.json') -Raw|ConvertFrom-Json
 $manifest=Get-Content -LiteralPath $saved.manifest -Raw|ConvertFrom-Json
 if($proof.workspaceId -cne $Job.workspaceId -or $receipt.status -cne 'PASS' -or -not $receipt.release.existingPersistentFilesPreserved -or -not $receipt.release.backendArtifact -or $manifest.mode -cne 'bundled-existing-dependencies' -or $receipt.release.backendArtifact.manifestSha256 -cne $manifest.backendArtifact.manifestSha256){throw 'Successful tested backend receipt required'}
 $descriptor=[string]$manifest.backendArtifact.descriptor;$digest=[string]$manifest.backendArtifact.manifestSha256
 if($descriptor -cne ('backend/.releases/'+$digest+'/artifact.json') -or $digest -cnotmatch '^[a-f0-9]{64}$'){throw 'Saved backend descriptor scope differs'}
 $descriptorFile=Join-Path $saved.build ('release\payload\'+$descriptor.Replace('/','\'))
 if((Get-PromotionHash $descriptorFile) -cne $digest){throw 'Saved descriptor changed'}
 $definition=Get-Content -LiteralPath $descriptorFile -Raw|ConvertFrom-Json
 if($definition.entry -cnotmatch '^backend/\.releases/[a-f0-9]{64}/server\.cjs$'){throw 'Saved backend entry scope differs'}
 $files=@()
 foreach($relative in @($descriptor,[string]$definition.entry)){
  $records=@($manifest.files|Where-Object path -CEQ $relative);$source=Join-Path $saved.build ('release\payload\'+$relative.Replace('/','\'))
  if($records.Count -ne 1 -or (Get-PromotionHash $source) -cne $records[0].sha256 -or (Get-Item -LiteralPath $source).Length -ne $records[0].bytes){throw 'Saved backend file changed'}
  $files+=@{relative=$relative;file=$source;sha256=$records[0].sha256;bytes=$records[0].bytes}
 }
 $artifact=@{sourceHead=$proof.sourceHead;releaseManifestSha256=$proof.artifactDigest;descriptorSha256=$digest;bundleSha256=$definition.sha256}
 $front=$null
 if($Job.target.PSObject.Properties['releaseMode'] -and $Job.target.releaseMode -ceq 'application'){
  if(-not $manifest.PSObject.Properties['frontendArtifact'] -or -not $Job.target.PSObject.Properties['frontend'] -or -not $receipt.release.PSObject.Properties['frontendArtifact'] -or -not $receipt.release.frontendArtifact -or $receipt.release.frontendArtifact.sha256 -cne $manifest.frontendArtifact.sha256){throw 'Successful complete Development release required'}
  if(-not $manifest.PSObject.Properties['validation'] -or $manifest.validation.version -ne 1 -or $manifest.validation.status -cne 'passed' -or $manifest.validation.sourceHead -cne $proof.sourceHead -or -not $receipt.release.validationVerified){throw 'Source-bound frontend/backend test evidence required'}
  $front=$manifest.frontendArtifact;$frontRoot=[string]$Job.target.frontend.root
  if($front.sha256 -cnotmatch '^[a-f0-9]{64}$' -or $front.descriptor -cne ($frontRoot+'/.releases/'+$front.sha256+'/artifact.json')){throw 'Frontend descriptor scope differs'}
  $frontFile=Join-Path $saved.build ('release\payload\'+$front.descriptor.Replace('/','\'))
  if((Get-PromotionHash $frontFile) -cne $front.sha256){throw 'Frontend descriptor changed'}
  $static=Get-Content -LiteralPath $frontFile -Raw|ConvertFrom-Json
  if($static.version -ne 1 -or $static.kind -cne 'static-application' -or $static.routing -cne 'same-origin' -or $static.root -cne $frontRoot -or $static.files.Count -lt 1 -or $static.files.Count -gt 10000){throw 'Portable frontend artifact required'}
  $relativeFiles=@([pscustomobject]@{path=$front.descriptor;sha256=$front.sha256;bytes=(Get-Item -LiteralPath $frontFile).Length})
  $frontBytes=0L;$seen=@{}
  foreach($record in $static.files){
   $name=[string]$record.path
   if($name -cnotmatch '^[A-Za-z0-9_./@()+ ,\[\]-]+$' -or $name.Contains('//') -or @($name.Split('/')|Where-Object {$_ -in @('.','..','web.config','uploads','attachment','attachments','database','node_modules','.runtime','logs','backups') -or $_.StartsWith('.',[StringComparison]::OrdinalIgnoreCase)}).Count -or $seen.ContainsKey($name.ToLowerInvariant()) -or $record.sha256 -cnotmatch '^[a-f0-9]{64}$' -or $record.bytes -lt 0){throw 'Frontend file scope rejected'}
   foreach($protected in $Job.target.frontend.preservedFiles){if($name -ieq $protected -or $name.StartsWith($protected+'/',[StringComparison]::OrdinalIgnoreCase)){throw 'Frontend routing/data is protected'}}
   $seen[$name.ToLowerInvariant()]=$true;$frontBytes+=[long]$record.bytes
   $relativeFiles+=[pscustomobject]@{path=($frontRoot+'/'+$name);sha256=$record.sha256;bytes=$record.bytes}
  }
  if($frontBytes -gt 512MB -or @($static.files|Where-Object path -CEQ $static.entry).Count -ne 1){throw 'Frontend resource budget or entry invalid'}
  foreach($record in $relativeFiles){
   $relative=[string]$record.path;$records=@($manifest.files|Where-Object path -CEQ $relative);$source=Join-Path $saved.build ('release\payload\'+$relative.Replace('/','\'))
   if($records.Count -ne 1 -or $records[0].sha256 -cne $record.sha256 -or (Get-PromotionHash $source) -cne $record.sha256 -or (Get-Item -LiteralPath $source).Length -ne $record.bytes){throw 'Saved frontend file changed'}
   $files+=@{relative=$relative;file=$source;sha256=$record.sha256;bytes=$record.bytes}
  }
  $artifact.frontend=@{descriptor=$front.descriptor;sha256=$front.sha256;indexSha256=@($static.files|Where-Object path -CEQ $static.entry)[0].sha256;files=$static.files.Count;bytes=$frontBytes}
 }
 return @{descriptor=$descriptor;descriptorSha256=$digest;entry=$definition.entry;bundleSha256=$definition.sha256;files=$files;artifact=$artifact;frontendArtifact=$front}
}
function Invoke-PromotionWork([string]$Root,[string]$PublicRoot,[string]$PrivateRoot,$Job,[string]$PrivateJob,[string]$Node,[scriptblock]$ReadRelease){
 $session=$null;$credential=$null;$backupInput=$null
 try{
  $target=$Job.target
  $bindings=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'PromotionConnections.json') -Raw|ConvertFrom-Json
  $connection=$bindings.connections.PSObject.Properties[$target.connectionReference].Value
  if(-not $connection -or $connection.host -cne $target.host -or $connection.credentialRelativePath -cnotmatch '^private/[A-Za-z0-9.-]+\.credential\.xml$'){throw 'Approved connection registry mismatch'}
  $credentialFile=Join-Path $Root $connection.credentialRelativePath.Replace('/','\');Assert-BackendPlainPath $credentialFile
  $credential=Import-Clixml -LiteralPath $credentialFile
  $session=New-PSSession -ComputerName $connection.host -Authentication Negotiate -Credential $credential -SessionOption (New-PSSessionOption -OpenTimeout 15000 -OperationTimeout 1200000 -IdleTimeout 1800000)
  if($Job.action -ceq 'prepare'){
   Set-PromotionProgress $PublicRoot $Job.id 'verifying-saved-development-artifact' $Job.workspaceId
   $saved=Get-PromotionSavedBackend $Job $ReadRelease $Root
   $staging=Join-Path $target.scratchRoot $Job.id
   Invoke-Command -Session $session -ArgumentList $target,$staging -ScriptBlock {
    param($target,$staging)
    if($env:COMPUTERNAME -cne $target.computer -or [IO.Path]::GetFullPath((Split-Path $staging)) -ine [IO.Path]::GetFullPath($target.scratchRoot) -or (Split-Path $staging -Leaf) -cnotmatch '^pm_[a-f0-9]{32}$' -or (Test-Path -LiteralPath $staging)){throw 'Target scratch scope differs'}
    for($p=$staging;$p;$p=Split-Path $p){if((Test-Path -LiteralPath $p) -and ((Get-Item -LiteralPath $p -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked scratch path'};if((Split-Path $p) -eq $p){break}}
    [void][IO.Directory]::CreateDirectory($staging);$acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetAccessRuleProtection($true,$false)
    foreach($sid in @('S-1-5-18',[Security.Principal.WindowsIdentity]::GetCurrent().User.Value)){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))};[IO.DirectoryInfo]::new($staging).SetAccessControl($acl)
   }
   $hashes=[ordered]@{}
   foreach($name in @('BackendArtifact.cjs','BackendArtifactSelection.psm1','PromotionFiles.cjs','FrontendArtifact.cjs','PublishedRelease.cjs','ManagedRuntime.cjs','ProductionBackendRuntime.cjs','Run-SavedBackend.ps1','BatchLogon.psm1','Invoke-PromotionTarget.ps1','Read-PromotionEnvironment.cjs')){
    $source=Join-Path $PSScriptRoot $name;$hashes[$name]=Get-PromotionHash $source;Copy-Item -LiteralPath $source -Destination (Join-Path $staging $name) -ToSession $session
   }
   foreach($file in $saved.files){$destination=Join-Path $staging ('payload\'+$file.relative.Replace('/','\'));Invoke-Command -Session $session -ArgumentList (Split-Path $destination) -ScriptBlock {param($dir);[void][IO.Directory]::CreateDirectory($dir)};Copy-Item -LiteralPath $file.file -Destination $destination -ToSession $session}
   $context=@{version=1;id=$Job.id;target=$target;staging=$staging;descriptor=$saved.descriptor;descriptorSha256=$saved.descriptorSha256;operatorHashes=$hashes}
   $context.knownManaged=@(Get-PromotionManagedEvidence $PrivateRoot $PublicRoot $Job)
   if($saved.frontendArtifact){$context.frontendArtifact=$saved.frontendArtifact}
   Write-PromotionJson (Join-Path $PrivateJob 'context.json') $context -New
   Copy-Item -LiteralPath (Join-Path $PrivateJob 'context.json') -Destination (Join-Path $staging 'context.json') -ToSession $session
   Set-PromotionProgress $PublicRoot $Job.id 'reading-runtime-and-protected-inventory' $Job.workspaceId
   $observation=Invoke-Command -Session $session -ArgumentList $staging,$hashes['Invoke-PromotionTarget.ps1'] -ScriptBlock {param($dir,$hash);$script=Join-Path $dir 'Invoke-PromotionTarget.ps1';if((Get-FileHash -LiteralPath $script).Hash.ToLowerInvariant() -cne $hash){throw 'Observer changed'};& $script -Action Observe -ContextFile (Join-Path $dir 'context.json')}
   $observedManaged=Get-PromotionObservedManaged $observation
   Write-PromotionJson (Join-Path $PrivateJob 'observation.json') $observation -New
   $context.snapshotSha256=$observation.files.snapshotSha256;$context.ownerSid=$observation.process.ownerSid;$context.observation=$observation
   Set-PromotionProgress $PublicRoot $Job.id 'preparing-pinned-backup-client' $Job.workspaceId
   $client=Get-PromotionMysql $PrivateRoot
   if($client.version -cne $target.databaseVersion){throw 'Matching backup client required'}
   $backupRoot=Join-Path $PrivateRoot 'backups';[void][IO.Directory]::CreateDirectory($backupRoot);$backupDir=Join-Path $backupRoot $Job.id
   & (Join-Path $PSScriptRoot 'Protect-PromotionBackup.ps1') -Action Prepare -Directory $backupDir | Out-Null
   if($LASTEXITCODE -and $LASTEXITCODE -ne 0){throw 'Backup protection unavailable'}
   $scopeFile=Join-Path $backupDir 'scope.json';Write-PromotionJson $scopeFile @{version=1;workspaceId=$Job.workspaceId;actor=$Job.requestedBy;requestId=$Job.id;targetSha256=$Job.targetSha256;artifact=$saved.artifact;databaseTargetSha256=$observation.files.profile.databaseTargetSha256} -New
   Set-PromotionProgress $PublicRoot $Job.id 'reading-private-database-binding' $Job.workspaceId
   $databaseBinding=Invoke-Command -Session $session -ArgumentList $target,$observation.files.profile.environmentSha256,$staging,$hashes['Read-PromotionEnvironment.cjs'] -ScriptBlock {
    param($target,$expected,$staging,$helperHash)
    $envfile=Join-Path $target.root 'backend\.env';if((Get-FileHash -LiteralPath $envfile).Hash.ToLowerInvariant() -cne $expected){throw 'Environment changed before backup'}
    $helper=Join-Path $staging 'Read-PromotionEnvironment.cjs'
    if((Get-FileHash -LiteralPath $helper).Hash.ToLowerInvariant() -cne $helperHash){throw 'Private binding helper changed'}
    $text=& $target.node $helper $target.root $expected 2>$null;if($LASTEXITCODE -ne 0){throw 'Private database binding unavailable'}
    Add-Type -AssemblyName System.Web.Extensions
    $privateJson=[System.Web.Script.Serialization.JavaScriptSerializer]::new()
    $value=$privateJson.DeserializeObject(($text -join ''));$text=$null
    $secret=[Security.SecureString]::new();foreach($character in ([string]$value.password).ToCharArray()){$secret.AppendChar($character)};$secret.MakeReadOnly()
    $credential=[pscredential]::new([string]$value.user,$secret);$value.password=$null
    return @{host=$value.host;port=$value.port;database=$value.database;credential=$credential}
   }
   if($databaseBinding.credential -isnot [pscredential]){throw 'Encrypted credential transport required'}
   $database=@{host=$databaseBinding.host;port=[int]$databaseBinding.port;database=$databaseBinding.database;user=$databaseBinding.credential.UserName;password=$databaseBinding.credential.GetNetworkCredential().Password};$databaseBinding=$null
   if($database.host -in @('localhost','127.0.0.1','::1')){$database.host=$target.host}
   Set-PromotionProgress $PublicRoot $Job.id 'encoding-private-backup-input' $Job.workspaceId
   $backupInput=ConvertTo-PromotionBackupInput $backupDir (Get-PromotionHash $scopeFile) $client $database
   Set-PromotionProgress $PublicRoot $Job.id 'capturing-and-verifying-encrypted-backup' $Job.workspaceId
   $backupText=Invoke-PromotionNode $Node (Join-Path $PSScriptRoot 'PromotionBackup.cjs') @() $backupInput;$backupInput=$null;$database=$null
   $backup=$backupText|ConvertFrom-Json
   $backupSummary=@{reference=('promotion-backup/'+$Job.id);createdAt=$backup.createdAt;sha256=$backup.sha256;bytes=$backup.bytes;databaseVersion=$backup.databaseVersion;encrypted=$true;integrityVerified=$true;isolatedRestoreTested=$false}
   $context.backup=$backupSummary
   Write-PromotionJson (Join-Path $PrivateJob 'prepared-context.json') $context -New
   $runtimeFile=Join-Path $PrivateJob 'operator-hashes.json';Write-PromotionJson $runtimeFile $hashes -New
   $review=@{version=1;id=$Job.id;workspaceId=$Job.workspaceId;requestedBy=$Job.requestedBy;profileId=$target.profileId;profileRevision=$Job.profileRevision;targetSha256=$Job.targetSha256;createdAt=[DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ');expiresAt=[DateTime]::UtcNow.AddMinutes(15).ToString('yyyy-MM-ddTHH:mm:ss.fffZ');developmentRequestId=$Job.developmentRequestId;artifact=$saved.artifact;process=@{pid=$observation.process.pid;createdAt=$observation.process.created;owner=$observation.owner;nodeVersion=$observation.nodeVersion;batchLogonReady=$observation.batchLogonReady;taskAlreadyExists=$observation.taskAlreadyExists};protection=$observation.files.protection;backup=$backupSummary;runtimeSha256=(Get-PromotionHash $runtimeFile);privateSnapshotSha256=(Get-PromotionHash (Join-Path $PrivateJob 'prepared-context.json'))}
   if($observedManaged){$review.process.managedRuntimeVerified=$true;$review.process.previousPromotionId=$observedManaged.id}
   $reviewInput=Join-Path $PrivateJob 'review-input.json';Write-PromotionJson $reviewInput $review -New
   $envelope=(Invoke-PromotionNode $Node (Join-Path $PSScriptRoot 'PromotionProtocol.mjs') @('seal-review',$reviewInput,(Join-Path $PrivateJob 'review.json')))|ConvertFrom-Json
   return @{version=1;id=$Job.id;status='prepared';stage='ready-for-exact-production-review';updatedAt=[DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ');review=$envelope.review;reviewSha256=$envelope.sha256}
  }
  Set-PromotionProgress $PublicRoot $Job.id 'rechecking-reviewed-production-scope' $Job.workspaceId
  $prepared=Join-Path $PrivateRoot ('claims\'+$Job.reviewId)
  $review=(Invoke-PromotionNode $Node (Join-Path $PSScriptRoot 'PromotionProtocol.mjs') @('verify-review',(Join-Path $PrivateJob ($Job.id+'.json')),(Join-Path $prepared 'review.json')))|ConvertFrom-Json
  if((Get-PromotionHash (Join-Path $prepared 'prepared-context.json')) -cne $review.privateSnapshotSha256 -or (Get-PromotionHash (Join-Path $prepared 'operator-hashes.json')) -cne $review.runtimeSha256){throw 'Private review context changed'}
  $context=Get-Content -LiteralPath (Join-Path $prepared 'prepared-context.json') -Raw|ConvertFrom-Json
  foreach($hash in $context.operatorHashes.PSObject.Properties){if((Get-PromotionHash (Join-Path $PSScriptRoot $hash.Name)) -cne $hash.Value){throw 'Reviewed controller changed'}}
  $backupFile=Join-Path $PrivateRoot ('backups\'+$Job.reviewId+'\database.sql.gz.dpapi')
  if((Get-PromotionHash $backupFile) -cne $review.backup.sha256){throw 'Fresh protected backup changed'}
  [void](Get-PromotionSavedBackend $Job $ReadRelease $Root)
  $context.id=$Job.id;$context|Add-Member -NotePropertyName allowBatchLogon -NotePropertyValue ([bool]$Job.approval.acknowledgements.assignBatchLogonIfMissing)
  $activationFile=Join-Path $PrivateJob 'activation.json';Write-PromotionJson $activationFile $context -New
  $remoteActivation=Join-Path $context.staging ($Job.id+'.json');Copy-Item -LiteralPath $activationFile -Destination $remoteActivation -ToSession $session
  Write-PromotionJson (Join-Path $PrivateJob 'approval-consumed.json') @{version=1;id=$Job.id;reviewSha256=$Job.reviewSha256;targetSha256=$Job.targetSha256;artifact=$review.artifact;workspaceId=$Job.workspaceId;actor=$Job.requestedBy;consumedAt=[DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')} -New
  Set-PromotionProgress $PublicRoot $Job.id 'adopting-reviewed-owner-and-promoting-backend' $Job.workspaceId
  $remote=Invoke-Command -Session $session -ArgumentList $context.staging,$remoteActivation,(Get-PromotionHash $activationFile),$credential -ScriptBlock {
   param($staging,$file,$hash,$credential)
   if((Get-FileHash -LiteralPath $file).Hash.ToLowerInvariant() -cne $hash){throw 'Activation context changed'}
   & (Join-Path $staging 'Invoke-PromotionTarget.ps1') -Action Activate -ContextFile $file -RuntimeCredential $credential
  }
  Write-PromotionJson (Join-Path $PrivateJob 'target-receipt.json') $remote -New
  $status=[string]$remote.status
  if($status -cnotin @('succeeded','failed','recovered','recovery-required')){throw 'Target receipt unavailable'}
  if($status -in @('succeeded','recovered')){
   $health=Invoke-RestMethod -Uri $target.publicHealthUrl -TimeoutSec 15
   if($health.status -cne 'OK' -or -not $health.authBootstrapReady -or -not $health.fullBootstrapReady){$status='recovery-required'}
  }
  $out=@{version=1;id=$Job.id;status=$status;stage=('production-'+$status);updatedAt=[DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ');healthVerified=([bool]$remote.healthVerified -and $status -in @('succeeded','recovered'));protectedFilesVerified=[int]$remote.protectedFilesVerified;artifactDigest=$review.artifact.bundleSha256;batchLogonAssigned=[bool]$remote.batchLogonAssigned;runtimeTaskRegistered=[bool]$remote.runtimeTaskRegistered;sourceHead=$review.artifact.sourceHead}
  if($remote.PSObject.Properties['frontendDigest']){$out.frontendDigest=$remote.frontendDigest;$out.frontendVerified=[bool]$remote.frontendVerified}
  return $out
 }finally{if($session){Remove-PSSession $session};$credential=$null;$backupInput=$null;$database=$null;$databaseBinding=$null}
}
function Invoke-PromotionQueue([string]$Root,[scriptblock]$ReadRelease){
 Import-Module (Join-Path $PSScriptRoot 'BackendArtifactSelection.psm1') -Force
 $public=Join-Path $Root 'jobs\promotions';$private=Join-Path $Root 'private\promotions';$node=Join-Path (Split-Path $Root) 'node\node-v24.19.0-win-x64\node.exe'
 foreach($dir in @($public,(Join-Path $public 'jobs'),(Join-Path $public 'audit'),(Join-Path $public 'results'))){Assert-BackendPlainPath $dir;[void][IO.Directory]::CreateDirectory($dir)}
 if(-not(Test-Path -LiteralPath $private)){New-PromotionPrivate $private}
 Assert-BackendPlainPath $private
 if(-not $script:PromotionInitialized){
  $results=Join-Path $public 'results';$acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetOwner([Security.Principal.SecurityIdentifier]::new('S-1-5-18'));$acl.SetAccessRuleProtection($true,$false)
  $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-18'),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
  $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-19'),'ReadAndExecute','ContainerInherit,ObjectInherit','None','Allow'));[IO.DirectoryInfo]::new($results).SetAccessControl($acl)
  [void][IO.Directory]::CreateDirectory((Join-Path $private 'claims'))
  foreach($old in Get-ChildItem -LiteralPath (Join-Path $private 'claims') -Directory){
   if($old.Name -cnotmatch '^pm_[a-f0-9]{32}$'){throw 'Promotion claim identity rejected'}
   $resultFile=Join-Path $public ('results\'+$old.Name+'.json')
   $r=if(Test-Path -LiteralPath $resultFile){Get-Content -LiteralPath $resultFile -Raw|ConvertFrom-Json}else{$null}
   if(-not $r -or $r.status -ceq 'working'){
    $original=Get-Content -LiteralPath (Join-Path $old.FullName ($old.Name+'.json')) -Raw|ConvertFrom-Json
    $interrupted=if($original.action -ceq 'prepare' -and -not(Test-Path -LiteralPath (Join-Path $old.FullName 'approval-consumed.json'))){'failed'}else{'recovery-required'}
    if($interrupted -ceq 'failed'){
     $temporaryCredential=Join-Path $private ('backups\'+$old.Name+'\client.private.cnf');Assert-BackendPlainPath $temporaryCredential
     if(Test-Path -LiteralPath $temporaryCredential){[IO.File]::Delete($temporaryCredential)}
    }
    Write-PromotionJson $resultFile @{version=1;id=$old.Name;status=$interrupted;stage='worker-interrupted-no-replay';updatedAt=[DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ');errorCode='promotion-interrupted'}
   }
  }
  $script:PromotionInitialized=$true
 }
 $registry=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'PromotionRegistry.json') -Raw|ConvertFrom-Json
 if($registry.targets.Count -lt 1){return}
 Write-PromotionJson (Join-Path $public 'results\heartbeat.json') @{version=1;workspaceId=$registry.targets[0].workspaceId;at=[DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')}
 foreach($file in Get-ChildItem -LiteralPath (Join-Path $public 'jobs') -File -Filter 'pm_*.json'){
  if($file.Name -cnotmatch '^pm_[a-f0-9]{32}\.json$'){continue}
  $id=$file.BaseName;$claim=Join-Path $private ('claims\'+$id)
  if(Test-Path -LiteralPath $claim){continue}
  Assert-BackendPlainPath $file.FullName
  if($file.Length -gt 65536){continue}
  New-PromotionPrivate $claim
  $copy=Join-Path $claim $file.Name;[IO.File]::WriteAllBytes($copy,[IO.File]::ReadAllBytes($file.FullName))
  $began=$false
  try{
   $raw=Get-Content -LiteralPath $copy -Raw|ConvertFrom-Json
   if($raw.target.profileId -cnotmatch '^[a-z][a-z0-9-]{2,63}$'){throw 'Promotion target identifier rejected'}
   $profileFile=Join-Path $Root ('jobs\configuration\'+$raw.target.profileId+'.json')
   $job=(Invoke-PromotionNode $node (Join-Path $PSScriptRoot 'PromotionProtocol.mjs') @('validate',$copy,(Join-Path $PSScriptRoot 'PromotionRegistry.json'),$profileFile))|ConvertFrom-Json
   $runtimeFile=Join-Path (Split-Path $Root) 'config\runtime.json'
   [void](Invoke-PromotionNode $node (Join-Path $PSScriptRoot 'PromotionProtocol.mjs') @('authorize',$copy,$runtimeFile))
   # Existing legacy activity must be terminal before independent Production work.
   foreach($legacy in Get-ChildItem -LiteralPath (Join-Path $Root 'jobs') -File -Filter 'sd_*.json'){$record=Get-Content -LiteralPath $legacy.FullName -Raw|ConvertFrom-Json;if($record.status -cnotin @('succeeded','failed')){throw 'Development runner busy or unresolved'}}
   $began=$true
   $result=Invoke-PromotionWork $Root $public $private $job $claim $node $ReadRelease
  }catch{
   $status=if($began -and $raw.action -ceq 'promote' -and (Test-Path -LiteralPath (Join-Path $claim 'approval-consumed.json'))){'recovery-required'}else{'failed'}
   $failedStage='worker-stopped-safely'
   try{
    $progressFile=Join-Path $public ('results\'+$id+'.json');Assert-BackendPlainPath $progressFile
    if((Get-Item $progressFile).Length -le 4096){
     $progress=Get-Content $progressFile -Raw|ConvertFrom-Json
     $knownStages=@('verifying-saved-development-artifact','reading-runtime-and-protected-inventory','preparing-pinned-backup-client','reading-private-database-binding','encoding-private-backup-input','capturing-and-verifying-encrypted-backup','rechecking-reviewed-production-scope','adopting-reviewed-owner-and-promoting-backend')
     if($progress.id -ceq $id -and $progress.status -ceq 'working' -and $progress.stage -cin $knownStages){$failedStage=$progress.stage+'-failed'}
    }
   }catch{}
   $result=@{version=1;id=$id;status=$status;stage=$failedStage;updatedAt=[DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ');errorCode='promotion-verification-failed'}
   Write-PromotionJson (Join-Path $claim 'safe-error.json') @{type=$_.Exception.GetType().Name;line=$_.InvocationInfo.ScriptLineNumber;id=$_.FullyQualifiedErrorId} -New
  }
  Write-PromotionJson (Join-Path $claim 'result.json') $result -New
  Write-PromotionJson (Join-Path $public ('results\'+$id+'.json')) $result
 }
}
Export-ModuleMember -Function Invoke-PromotionQueue
