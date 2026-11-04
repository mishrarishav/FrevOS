param([string]$ChildRoot,[switch]$Unrecognized,[ValidateSet('none','start','consent')][string]$Failure='none',[switch]$InitiallyStopped,[switch]$Disabled)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
Add-Type -AssemblyName System.Security
$parent=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\');$temporary=Join-Path $parent ('dvct-'+[guid]::NewGuid().ToString('N'));$oldLocal=$env:LOCALAPPDATA
if(-not $ChildRoot){[void][IO.Directory]::CreateDirectory($temporary);$env:LOCALAPPDATA=Join-Path $temporary 'local'}
function Hash($file){(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()}
function Json($file,$value){[IO.File]::WriteAllText($file,($value|ConvertTo-Json -Depth 8 -Compress),[Text.UTF8Encoding]::new($false))}
function ReadIdentity($file){$clear=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($file),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);try{return [Text.Encoding]::UTF8.GetString($clear)|ConvertFrom-Json}finally{[Array]::Clear($clear,0,$clear.Length)}}
function Get-ScheduledTask {
 param($TaskName)
 [pscustomobject]@{State=$global:TransportFixtureState;Settings=[pscustomobject]@{Enabled=$global:TransportFixtureEnabled};Principal=[pscustomobject]@{UserId=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value};Actions=@([pscustomobject]@{Execute=(Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe');Arguments=('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File "'+(Join-Path $global:TransportFixtureRoot 'Run-Connector.ps1')+'"')})}
}
function Disable-ScheduledTask {param($TaskName);$global:TransportFixtureEnabled=$false}
function Enable-ScheduledTask {param($TaskName);$global:TransportFixtureEnabled=$true;if($global:TransportFixtureState -ceq 'Disabled'){$global:TransportFixtureState='Ready'}}
function Stop-ScheduledTask {
 param($TaskName)
 $global:TransportFixtureStops++;$global:TransportFixtureState='Ready'
 if($global:TransportFixtureFailure -ceq 'consent' -and -not $global:TransportFixtureInjected){
  # A real Windows sharing violation after enrollment replacement. Read access
  # remains available, but atomic consent replacement is denied until recovery.
  $global:TransportFixtureInjected=$true
  $global:TransportFixtureLock=[IO.File]::Open((Join-Path $global:TransportFixtureRoot 'state\discovery-consent.json'),[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
 }
}
function Start-ScheduledTask {
 param($TaskName)
 $global:TransportFixtureStarts++
 if(-not $global:TransportFixtureEnabled){throw 'Fixture task was not enabled'}
 if($global:TransportFixtureFailure -ceq 'start' -and -not $global:TransportFixtureInjected){$global:TransportFixtureInjected=$true;throw 'Synthetic task start failure'}
 if($global:TransportFixtureLock){$global:TransportFixtureLock.Dispose();$global:TransportFixtureLock=$null}
 $global:TransportFixtureState='Running'
}
function Invoke-WebRequest {
 param($Uri,[switch]$UseBasicParsing,$Method,$ContentType,$Headers,$Body,$MaximumRedirection,$TimeoutSec)
 if($Uri -cne 'https://public.fixture.invalid/workspace/v1/connector/system-status' -or $Headers.Authorization -cne ('Bearer '+$global:TransportFixtureCredential) -or $MaximumRedirection -ne 0){throw 'Fixture transport scope differs'}
 [pscustomobject]@{StatusCode=200;Content=(@{deviceId=$(if($global:TransportFixtureBad){'fc_'+('f'*32)}else{$global:TransportFixtureId});ready=$true;actor='usr_fixture'}|ConvertTo-Json -Compress)}
}
if($ChildRoot){
 if([IO.Path]::GetDirectoryName($ChildRoot) -ine (Join-Path $env:LOCALAPPDATA 'FrevOS\Connector') -or [IO.Path]::GetFileName($ChildRoot) -cnotmatch '^fc_[a-f0-9]{32}$'){throw 'Child fixture scope differs'}
 $saved=ReadIdentity (Join-Path $ChildRoot 'device.dpapi');$global:TransportFixtureRoot=$ChildRoot;$global:TransportFixtureId=$saved.deviceId;$global:TransportFixtureCredential=$saved.credential;$global:TransportFixtureBad=[bool]$Unrecognized;$global:TransportFixtureStops=0;$global:TransportFixtureStarts=0;$global:TransportFixtureEnabled=-not $Disabled;$global:TransportFixtureState=$(if($Disabled){'Disabled'}elseif($InitiallyStopped){'Ready'}else{'Running'});$global:TransportFixtureFailure=$Failure;$global:TransportFixtureInjected=$false;$global:TransportFixtureLock=$null
 try{& (Join-Path $PSScriptRoot 'Resume-SystemConnector.ps1')}finally{
  if($global:TransportFixtureLock){$global:TransportFixtureLock.Dispose();$global:TransportFixtureLock=$null}
  Json (Join-Path $ChildRoot 'state\fixture-task.json') @{stops=$global:TransportFixtureStops;starts=$global:TransportFixtureStarts;state=$global:TransportFixtureState;enabled=$global:TransportFixtureEnabled}
 }
 return
}
function New-Fixture {
 $id='fc_'+[guid]::NewGuid().ToString('N');$root=Join-Path $env:LOCALAPPDATA ('FrevOS\Connector\'+$id);[void][IO.Directory]::CreateDirectory((Join-Path $root 'state'))
 [IO.File]::WriteAllText((Join-Path $root 'Run-Connector.ps1'),'param([switch]$CreateStatusShortcut)')
 $runtimeHash=Hash (Join-Path $root 'Run-Connector.ps1');Json (Join-Path $root 'system-runtime-manifest.json') @{version=1;files=@{'Run-Connector.ps1'=$runtimeHash}}
 $sha=[Security.Cryptography.SHA256]::Create();try{$actorHash=([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes('usr_fixture')))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
 $config=@{version=1;mode='system';deviceId=$id;server='http://127.0.0.1:52000';allowInternalHttp=$true;credential=($id+'.'+('b'*43));accountName=('pair:'+$actorHash.Substring(0,40));fileActivity=$false;stateRoot=(Join-Path $root 'state');runtimeManifestSha256=(Hash (Join-Path $root 'system-runtime-manifest.json'))}
 $clear=[Text.Encoding]::UTF8.GetBytes(($config|ConvertTo-Json -Compress));try{[IO.File]::WriteAllBytes((Join-Path $root 'device.dpapi'),[Security.Cryptography.ProtectedData]::Protect($clear,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))}finally{[Array]::Clear($clear,0,$clear.Length)}
 [IO.File]::WriteAllText((Join-Path $root 'state\software-consent.json'),'synthetic retained software consent')
 [IO.File]::WriteAllText((Join-Path $root 'state\discovery-consent.json'),'{"version":1,"metadata":false,"retained":"exact original consent bytes"}')
 return @{root=$root;config=$config;before=(Hash (Join-Path $root 'device.dpapi'));consent=(Hash (Join-Path $root 'state\discovery-consent.json'));software=(Hash (Join-Path $root 'state\software-consent.json'));request=@{deviceId=$id;server='https://public.fixture.invalid/workspace';previousServer=$config.server;username=$config.accountName;fileActivity=$false}}
}
function Resume($fixture,[string]$failure='none',[bool]$bad=$false,[bool]$stopped=$false,[bool]$disabled=$false){
 $info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe';$info.Arguments='-NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File "'+$PSCommandPath+'" -ChildRoot "'+$fixture.root+'" -Failure '+$failure+$(if($bad){' -Unrecognized'}else{''})+$(if($stopped){' -InitiallyStopped'}else{''})+$(if($disabled){' -Disabled'}else{''});$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
 $process=[Diagnostics.Process]::new();$process.StartInfo=$info
 try{
  [void]$process.Start();$process.StandardInput.Write(($fixture.request|ConvertTo-Json -Compress));$process.StandardInput.Close()
  if(-not $process.WaitForExit(25000)){$process.Kill();throw 'Transport fixture child timed out'}
  $stdout=$process.StandardOutput.ReadToEnd();$diagnostic=$process.StandardError.ReadToEnd();$success=$process.ExitCode -eq 0
  $task=Get-Content -LiteralPath (Join-Path $fixture.root 'state\fixture-task.json') -Raw|ConvertFrom-Json
  $receiptFile=Join-Path $fixture.root 'state\resume-recovery.json';$receipt=if(Test-Path -LiteralPath $receiptFile){Get-Content -LiteralPath $receiptFile -Raw|ConvertFrom-Json}else{$null}
  return @{success=$success;task=$task;receipt=$receipt}
 }finally{$process.Dispose()}
}
function Assert-Retained($fixture){
 if((Hash (Join-Path $fixture.root 'device.dpapi')) -cne $fixture.before){throw 'Recovery did not restore exact encrypted enrollment bytes'}
 if((Hash (Join-Path $fixture.root 'state\discovery-consent.json')) -cne $fixture.consent){throw 'Recovery did not restore exact discovery consent bytes'}
 if((Hash (Join-Path $fixture.root 'state\software-consent.json')) -cne $fixture.software){throw 'Recovery changed software consent bytes'}
}
try{
 $f=New-Fixture;$rejected=Resume $f 'none' $true
 if($rejected.success -or $rejected.task.stops -ne 0){throw 'Unrecognized endpoint reached task mutation'};Assert-Retained $f
 $connected=Resume $f;$after=ReadIdentity (Join-Path $f.root 'device.dpapi')
 if(-not $connected.success -or $after.server -cne $f.request.server -or $after.deviceId -cne $f.config.deviceId -or $after.credential -cne $f.config.credential -or $after.accountName -cne $f.config.accountName -or $after.runtimeManifestSha256 -cne $f.config.runtimeManifestSha256 -or $after.allowInternalHttp -ne $false -or $after.discoveryIdentityOrigin -cne ([uri]$f.config.server).GetLeftPart([UriPartial]::Authority) -or $connected.task.state -cne 'Running' -or -not $connected.task.enabled -or (Hash (Join-Path $f.root 'state\software-consent.json')) -cne $f.software -or (Hash (Join-Path $f.root 'state\discovery-consent.json')) -cne $f.consent){throw 'Transport migration changed retained identity/runtime/consent'}
 $backups=@(Get-ChildItem -LiteralPath (Join-Path $f.root 'state') -Filter 'enrollment-*.dpapi');if($backups.Count -ne 1 -or (ReadIdentity $backups[0].FullName).server -cne $f.config.server){throw 'Previous protected endpoint was not retained'}
 $current=Hash (Join-Path $f.root 'device.dpapi');$stale=Resume $f;if($stale.success -or (Hash (Join-Path $f.root 'device.dpapi')) -cne $current){throw 'Stale migration request changed current enrollment'}
 foreach($case in @(@{failure='consent';stopped=$false;stage='consent'},@{failure='start';stopped=$false;stage='start'},@{failure='start';stopped=$true;stage='start'})){
  $fixture=New-Fixture;$fixture.request.fileActivity=$true;$result=Resume $fixture $case.failure $false $case.stopped
  Assert-Retained $fixture
  if($result.success -or $result.task.state -cne $(if($case.stopped){'Ready'}else{'Running'}) -or -not $result.task.enabled -or $result.receipt.status -cne 'FAILED_RECOVERED' -or $result.receipt.stage -cne $case.stage -or $result.receipt.beforeDeviceSha256 -cne $fixture.before -or $result.receipt.afterDeviceSha256 -cne $fixture.before -or -not $result.receipt.errorClass -or $result.receipt.errorLine -lt 1){throw 'Failed resume did not restore the previous task state and safe failure proof'}
 }
 $disabledFixture=New-Fixture;$disabledResult=Resume $disabledFixture 'none' $false $true $true;Assert-Retained $disabledFixture
 if($disabledResult.success -or $disabledResult.task.state -cne 'Disabled' -or $disabledResult.task.enabled -or $disabledResult.task.stops -ne 0 -or $disabledResult.task.starts -ne 0){throw 'Disabled enrollment task was changed'}
 @{status='PASS';checks=8;pairingPreserved=$true;protectedBackup=$true;unrecognizedEndpointDenied=$true;staleIntentDenied=$true;failedConsentRestored=$true;failedStartRestored=$true;stoppedTaskRestored=$true;disabledTaskRetained=$true;failureProofRetained=$true;transport='fixed-fixture-functions-and-real-file-sharing'}|ConvertTo-Json -Compress
}finally{
 $env:LOCALAPPDATA=$oldLocal;$resolved=[IO.Path]::GetFullPath($temporary)
 if([IO.Path]::GetDirectoryName($resolved) -cne $parent -or [IO.Path]::GetFileName($resolved) -cnotmatch '^dvct-[a-f0-9]{32}$'){throw 'Transport fixture cleanup escaped owned target'}
 Remove-Item -LiteralPath $resolved -Recurse -Force
}
