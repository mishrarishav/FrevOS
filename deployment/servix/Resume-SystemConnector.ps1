#requires -Version 5.1
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
$text=[Console]::In.ReadToEnd();if($text.Length -gt 4096){throw 'Resume input exceeds budget'};$request=$text|ConvertFrom-Json;$text=$null
$fields=@($request.PSObject.Properties.Name|Sort-Object) -join ','
if($fields -cnotin @('deviceId,fileActivity,server,username','deviceId,fileActivity,previousServer,server,username')){throw 'Resume fields differ'}
if($request.deviceId -cnotmatch '^fc_[a-f0-9]{32}$' -or $request.fileActivity -isnot [bool]){throw 'Resume scope differs'}
$root=Join-Path $env:LOCALAPPDATA ('FrevOS\Connector\'+$request.deviceId)
for($cursor=$root;;){if((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked enrollment'};$parent=[IO.Path]::GetDirectoryName($cursor);if(-not $parent -or $parent -ceq $cursor){break};$cursor=$parent}
Add-Type -AssemblyName System.Security;$file=Join-Path $root 'device.dpapi'
function Assert-PlainPath([string]$target){
 for($cursor=$target;;){
  if(Test-Path -LiteralPath $cursor){if((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked resume path'}}elseif($cursor -cne $target){throw 'Resume parent is missing'}
  $parent=[IO.Path]::GetDirectoryName($cursor);if(-not $parent -or $parent -ceq $cursor){break};$cursor=$parent
 }
}
function Read-Owned([string]$target,[int]$limit=65536){
 Assert-PlainPath $target
 $item=Get-Item -LiteralPath $target -Force
 if($item.Attributes -band [IO.FileAttributes]::ReparsePoint -or $item.PSIsContainer -or $item.Length -gt $limit){throw 'Resume file scope differs'}
 return ,[IO.File]::ReadAllBytes($target)
}
function Bytes-Hash([byte[]]$value){$algorithm=[Security.Cryptography.SHA256]::Create();try{return ([BitConverter]::ToString($algorithm.ComputeHash($value))).Replace('-','').ToLowerInvariant()}finally{$algorithm.Dispose()}}
$beforeDevice=Read-Owned $file
$clear=[Security.Cryptography.ProtectedData]::Unprotect($beforeDevice,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
try{$config=[Text.Encoding]::UTF8.GetString($clear)|ConvertFrom-Json}finally{[Array]::Clear($clear,0,$clear.Length)}
$previousServer=if($fields -ceq 'deviceId,fileActivity,previousServer,server,username'){$request.previousServer}else{$request.server}
if($config.mode -cne 'system' -or $config.deviceId -cne $request.deviceId -or $config.server -cne $previousServer -or $config.accountName -cne $request.username -or $config.stateRoot -ine (Join-Path $root 'state')){throw 'Protected enrollment differs'}
$transportChanged=$config.server -cne $request.server
if($transportChanged){
 if(@(Get-ChildItem -LiteralPath (Join-Path $root 'state') -File -Filter 'enrollment-*.dpapi').Count -ge 3){throw 'Protected transport recovery copy capacity reached'}
 $next=[uri]$request.server
 if($next.Scheme -cne 'https' -or $next.UserInfo -or $next.Query -or $next.Fragment -or $next.AbsolutePath -cnotmatch '^/(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)?$'){throw 'HTTPS server base required'}
 # Verify the exact retained credential at the local user's selected TLS endpoint
 # before changing its protected enrollment or scheduled task.
 $check=Invoke-WebRequest ($request.server+'/v1/connector/system-status') -UseBasicParsing -Method Post -ContentType 'application/json' -Headers @{Authorization=('Bearer '+$config.credential)} -Body '{}' -MaximumRedirection 0 -TimeoutSec 15
 $status=$check.Content|ConvertFrom-Json
 if($check.StatusCode -ne 200 -or $status.deviceId -cne $config.deviceId -or $status.ready -ne $true){throw 'New endpoint does not recognize existing pairing'}
 if($config.accountName.StartsWith('pair:')){$sha=[Security.Cryptography.SHA256]::Create();try{$actorHash=([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes([string]$status.actor)))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()};if($config.accountName -cne ('pair:'+$actorHash.Substring(0,40))){throw 'New endpoint pairing owner differs'}}
 $check=$null;$status=$null
}
$manifestFile=Join-Path $root 'system-runtime-manifest.json';if((Get-FileHash -LiteralPath $manifestFile -Algorithm SHA256).Hash.ToLowerInvariant() -cne $config.runtimeManifestSha256){throw 'Runtime changed'}
$manifest=Get-Content -LiteralPath $manifestFile -Encoding UTF8 -Raw|ConvertFrom-Json
foreach($entry in $manifest.files.PSObject.Properties){if($entry.Name -cnotmatch '^[A-Za-z0-9][A-Za-z0-9.-]+$' -or (Get-FileHash -LiteralPath (Join-Path $root $entry.Name) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $entry.Value){throw 'Runtime changed'}}
$identity=[Security.Principal.WindowsIdentity]::GetCurrent();$name='FrevOS-Connector-'+$request.deviceId;$task=Get-ScheduledTask -TaskName $name
$execute=Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe';$arguments='-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File "'+(Join-Path $root 'Run-Connector.ps1')+'"'
$owner=$task.Principal.UserId;if($owner -notmatch '^S-1-'){$owner=([Security.Principal.NTAccount]::new($owner)).Translate([Security.Principal.SecurityIdentifier]).Value}
if($task.Actions.Count -ne 1 -or $task.Actions[0].Execute -ine $execute -or $task.Actions[0].Arguments -cne $arguments -or $owner -cne $identity.User.Value){throw 'Task identity differs'}
$wasRunning=$task.State -ceq 'Running';$wasEnabled=[bool]$task.Settings.Enabled
if(-not $wasEnabled){throw 'Existing connector task is disabled; no changes applied'}
$activityChanged=$config.fileActivity -ne $request.fileActivity
$changed=$activityChanged -or $transportChanged
$consentFile=Join-Path $root 'state\discovery-consent.json'
$beforeConsent=if(Test-Path -LiteralPath $consentFile){Read-Owned $consentFile 4096}else{$null}
$nextDevice=$beforeDevice;$nextConsent=$beforeConsent;$backup=Join-Path $root ('state\enrollment-'+[guid]::NewGuid().ToString('N')+'.dpapi')
$stage='prepare';$taskTouched=$false
function Assert-Task {
 $current=Get-ScheduledTask -TaskName $name;$currentOwner=$current.Principal.UserId
 if($currentOwner -notmatch '^S-1-'){$currentOwner=([Security.Principal.NTAccount]::new($currentOwner)).Translate([Security.Principal.SecurityIdentifier]).Value}
 if($current.Actions.Count -ne 1 -or $current.Actions[0].Execute -ine $execute -or $current.Actions[0].Arguments -cne $arguments -or $currentOwner -cne $identity.User.Value){throw 'Resume task ownership changed'}
 return $current
}
function Stop-Owned {
 $current=Assert-Task
 if($current.State -ceq 'Running'){Stop-ScheduledTask -TaskName $name;$deadline=[DateTime]::UtcNow.AddSeconds(15);while((Assert-Task).State -ceq 'Running'){if([DateTime]::UtcNow -gt $deadline){throw 'Monitor did not stop'};Start-Sleep -Milliseconds 200}}
}
function Start-Owned {
 Assert-Task|Out-Null;Start-ScheduledTask -TaskName $name
 $deadline=[DateTime]::UtcNow.AddSeconds(10)
 while((Assert-Task).State -cne 'Running'){if([DateTime]::UtcNow -gt $deadline){throw 'Monitor did not start'};Start-Sleep -Milliseconds 200}
}
function Replace-Owned([string]$target,[byte[]]$bytes,[string]$saveBefore=$null){
 Assert-PlainPath $target
 $temporary=$target+'.'+[guid]::NewGuid().ToString('N')+'.resume'
 try{
  if(Test-Path -LiteralPath $target){Read-Owned $target|Out-Null}
  $stream=[IO.File]::Open($temporary,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
  if(Test-Path -LiteralPath $target){
   $replacementBackup=if($saveBefore){$saveBefore}else{$target+'.'+[guid]::NewGuid().ToString('N')+'.resume-previous'}
   [IO.File]::Replace($temporary,$target,$replacementBackup)
   if(-not $saveBefore){[IO.File]::Delete($replacementBackup)}
  }else{[IO.File]::Move($temporary,$target)}
 }finally{if(Test-Path -LiteralPath $temporary){[IO.File]::Delete($temporary)}}
}
function Restore-Owned([string]$target,[byte[]]$previous,[byte[]]$proposed){
 if(Test-Path -LiteralPath $target){
  $current=Read-Owned $target
  if(($null -eq $previous -or (Bytes-Hash $current) -cne (Bytes-Hash $previous)) -and ($null -eq $proposed -or (Bytes-Hash $current) -cne (Bytes-Hash $proposed))){throw 'Resume recovery file changed independently'}
  if($null -eq $previous){[IO.File]::Delete($target)}elseif((Bytes-Hash $current) -cne (Bytes-Hash $previous)){Replace-Owned $target $previous}
 }elseif($null -ne $previous){throw 'Resume recovery original file is missing'}
}
try{
 if($changed){
  $config.fileActivity=$request.fileActivity;$config.server=$request.server;if($transportChanged){$config.allowInternalHttp=$false}
  $bytes=[Text.UTF8Encoding]::new($false).GetBytes(($config|ConvertTo-Json -Compress))
  try{$nextDevice=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)}finally{[Array]::Clear($bytes,0,$bytes.Length)}
  if($activityChanged){$nextConsent=[Text.UTF8Encoding]::new($false).GetBytes((@{version=1;deviceId=$request.deviceId;metadata=$request.fileActivity;approvedAt=[DateTimeOffset]::UtcNow.ToString('o')}|ConvertTo-Json -Compress))}
  if((Bytes-Hash (Read-Owned $file)) -cne (Bytes-Hash $beforeDevice)){throw 'Enrollment changed meanwhile'}
  if($null -ne $beforeConsent){if(-not(Test-Path -LiteralPath $consentFile) -or (Bytes-Hash (Read-Owned $consentFile 4096)) -cne (Bytes-Hash $beforeConsent)){throw 'Consent changed meanwhile'}}elseif(Test-Path -LiteralPath $consentFile){throw 'Consent changed meanwhile'}
  $stage='pause';$taskTouched=$true;Assert-Task|Out-Null;Disable-ScheduledTask -TaskName $name|Out-Null;Stop-Owned
  $stage='enrollment';Replace-Owned $file $nextDevice $backup
  if($activityChanged){$stage='consent';Replace-Owned $consentFile $nextConsent}
 }
 $stage='start';$taskTouched=$true;Assert-Task|Out-Null;Enable-ScheduledTask -TaskName $name|Out-Null
 if((Assert-Task).State -cne 'Running'){Start-Owned}
 $stage='shortcut';& (Join-Path $root 'Run-Connector.ps1') -CreateStatusShortcut
}catch{
 $applyError=$_;$recoveryError=$null
 try{
  if($taskTouched){Assert-Task|Out-Null;Disable-ScheduledTask -TaskName $name|Out-Null;Stop-Owned}
  if($taskTouched -and $changed){Restore-Owned $file $beforeDevice $nextDevice;if($activityChanged){Restore-Owned $consentFile $beforeConsent $nextConsent}}
  if($taskTouched){if($wasEnabled){Enable-ScheduledTask -TaskName $name|Out-Null}else{Disable-ScheduledTask -TaskName $name|Out-Null};if($wasRunning){Start-Owned}}
 }catch{$recoveryError=$_}
 $afterDeviceHash=$null;try{$afterDeviceHash=Bytes-Hash (Read-Owned $file)}catch{}
 $receipt=@{version=1;deviceId=$request.deviceId;operation='connector-resume';status=$(if($recoveryError){'RECOVERY_REQUIRED'}elseif($taskTouched){'FAILED_RECOVERED'}else{'FAILED_UNCHANGED'});stage=$stage;errorClass=$applyError.Exception.GetType().Name;errorLine=$applyError.InvocationInfo.ScriptLineNumber;beforeDeviceSha256=(Bytes-Hash $beforeDevice);afterDeviceSha256=$afterDeviceHash;taskWasRunning=$wasRunning;taskWasEnabled=$wasEnabled;at=[DateTimeOffset]::UtcNow.ToString('o')}
 if($recoveryError){$receipt.recoveryErrorClass=$recoveryError.Exception.GetType().Name;$receipt.recoveryErrorLine=$recoveryError.InvocationInfo.ScriptLineNumber}
 try{Replace-Owned (Join-Path $root 'state\resume-recovery.json') ([Text.UTF8Encoding]::new($false).GetBytes(($receipt|ConvertTo-Json -Compress)))}catch{[Console]::Error.WriteLine('ResumeReceipt:'+ $_.Exception.GetType().Name)}
 if($recoveryError){throw 'Connector resume requires recovery; retained protected backup and safe failure receipt'}
 if(-not $taskTouched){throw 'Connector resume rejected before changes; current enrollment retained'}
 throw ('Connector resume failed at '+$stage+'; previous protected enrollment, consent and task state restored')
}finally{$config=$null;$nextDevice=$null;$nextConsent=$null;$beforeDevice=$null;$beforeConsent=$null}
