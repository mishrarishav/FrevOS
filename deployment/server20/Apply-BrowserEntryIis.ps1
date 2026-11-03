param([Parameter(Mandatory=$true)][string]$OperationDirectory)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
$directory=[IO.Path]::GetFullPath($OperationDirectory)
if($directory -ieq [IO.Path]::GetPathRoot($directory) -or -not(Test-Path -LiteralPath $directory -PathType Container)){throw 'Specific browser operation directory required'}
foreach($path in @($directory,(Join-Path $directory 'approval.json'),(Join-Path $directory 'plan-result.json'))){if((Get-Item -LiteralPath $path).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Browser operation link rejected'}}
Import-Module (Join-Path $PSScriptRoot 'BrowserEntryIisModel.psm1') -Force
function Hash([string]$File){(Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant()}
function Test-BrowserEntryExternalReceipt($Receipt,$Request,[string]$RequestSha256){
 $fields='applicationHostSha256,bodyStatus,certificateSha256,correlationId,httpStatus,observedAt,observerSid,operationId,requestSha256,tlsValidated,uri,version'
 $now=[DateTimeOffset]::UtcNow;$at=[DateTimeOffset]::Parse($Receipt.observedAt)
 if((@($Receipt.PSObject.Properties.Name|Sort-Object)-join ',') -cne $fields -or $Receipt.version -ne 1 -or $Receipt.operationId -cne $Request.operationId -or $Receipt.correlationId -cne $Request.correlationId -or $Receipt.requestSha256 -cne $RequestSha256 -or $Receipt.uri -cne $Request.uri -or $Receipt.observerSid -cne $Request.observerSid -or $Receipt.applicationHostSha256 -cne $Request.applicationHostSha256 -or $Receipt.certificateSha256 -cne $Request.certificateSha256 -or $Receipt.tlsValidated -isnot [bool] -or -not $Receipt.tlsValidated -or $Receipt.httpStatus -ne 200 -or $Receipt.bodyStatus -cne 'ok' -or $at -lt [DateTimeOffset]::Parse($Request.issuedAt) -or $at -gt $now.AddSeconds(60) -or ($now-$at).TotalSeconds -gt 120){throw 'External HTTPS health receipt rejected'}
 return $true
}
function Wait-BrowserEntryExternalHealth($Approval,$Plan,[string]$Directory,[Uri]$Health){
 $options=$Approval.externalHealth
 if((@($options.PSObject.Properties.Name|Sort-Object)-join ',') -cne 'certificateSha256,observerSid' -or $options.certificateSha256 -cnotmatch '^[a-f0-9]{64}$' -or $options.observerSid -cne $Approval.executionSid -or $Health.Scheme -cne 'https'){throw 'External HTTPS observer scope rejected'}
 $requestFile=Join-Path $Directory 'external-health-request.json';$receiptFile=Join-Path $Directory 'external-health-result.json'
 if((Test-Path -LiteralPath $requestFile) -or (Test-Path -LiteralPath $receiptFile)){throw 'External health observation already requested'}
 $request=@{version=1;operationId=$Approval.operationId;correlationId=$Approval.correlationId;uri=$Health.AbsoluteUri;observerSid=$options.observerSid;certificateSha256=$options.certificateSha256;applicationHostSha256=$Plan.applicationHostProposedSha256;issuedAt=[DateTimeOffset]::UtcNow.ToString('o')}
 $temporary=Join-Path $Directory 'external-health-request.tmp';[IO.File]::WriteAllText($temporary,($request|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false));[IO.File]::Move($temporary,$requestFile)
 $requestHash=Hash $requestFile;$deadline=[DateTimeOffset]::UtcNow.AddSeconds(75)
 do{
  if(Test-Path -LiteralPath $receiptFile){
   try{
    $item=Get-Item -LiteralPath $receiptFile
    if($item.PSIsContainer -or $item.Attributes -band [IO.FileAttributes]::ReparsePoint -or $item.Length -gt 16384){throw 'External health receipt file rejected'}
    foreach($rule in (Get-Acl -LiteralPath $receiptFile).Access){if($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin @($Approval.executionSid,'S-1-5-18','S-1-5-32-544')){throw 'External health receipt access widened'}}
    $receiptText=Get-Content -LiteralPath $receiptFile -Raw
   }catch{if($_.Exception -is [IO.IOException] -or $_.Exception.InnerException -is [IO.IOException]){Start-Sleep -Milliseconds 100;continue};throw}
   $receipt=$receiptText|ConvertFrom-Json
   [void](Test-BrowserEntryExternalReceipt $receipt $request $requestHash)
   return @{StatusCode=200;Content='{"status":"ok"}';proof=$receipt}
  }
  Start-Sleep -Milliseconds 250
 }while([DateTimeOffset]::UtcNow -lt $deadline)
 throw 'External HTTPS health observation deadline'
}
$planFile=Join-Path $directory 'plan-result.json';$plan=Get-Content -LiteralPath $planFile -Raw|ConvertFrom-Json
$approval=Get-Content -LiteralPath (Join-Path $directory 'approval.json') -Raw|ConvertFrom-Json
$keys='action,actor,computerName,correlationId,executionSid,expiresAt,issuedAt,operationId,planSha256,profileFile,publicHealthUri,reference,version,workspaceId'
if($approval.PSObject.Properties.Name -ccontains 'externalHealth'){$keys=(@($keys.Split(',')+'externalHealth'|Sort-Object)-join ',')}
if((@($approval.PSObject.Properties.Name|Sort-Object)-join ',') -cne $keys -or $approval.version -ne 1 -or $approval.action -cne 'devsetu.browser-entry.iis.activate.v1' -or $approval.operationId -cnotmatch '^bgi_[a-f0-9]{32}$' -or $approval.correlationId -cnotmatch '^bg_[a-f0-9]{32}$' -or $approval.workspaceId -cnotmatch '^ws_[a-z0-9_-]{1,100}$' -or $approval.actor -cnotmatch '^usr_[A-Za-z0-9_-]{1,100}$' -or $approval.reference.Length -lt 10){throw 'Browser IIS approval schema rejected'}
$now=[DateTimeOffset]::UtcNow;$issued=[DateTimeOffset]::Parse($approval.issuedAt);$expires=[DateTimeOffset]::Parse($approval.expiresAt)
if($issued -gt $now -or $expires -le $now -or ($expires-$issued).TotalMinutes -gt 15 -or $approval.computerName -cne $env:COMPUTERNAME -or $approval.executionSid -cne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value -or $approval.planSha256 -cne (Hash $planFile)){throw 'Browser IIS approval identity, time or plan differs'}
if($approval.profileFile -cnotmatch '^[A-Za-z0-9.-]+\.json$'){throw 'Browser IIS profile filename rejected'}
$profileFile=Join-Path $directory $approval.profileFile;$profile=Get-Content -LiteralPath $profileFile -Raw|ConvertFrom-Json
Test-BrowserEntryIisProfile $profile
$mapped=Join-Path $directory 'applicationHost.proposed.config';$appHost=Join-Path $env:WINDIR 'System32\inetsrv\config\applicationHost.config'
if($plan.status -cne 'READY' -or -not $plan.mappedRecovery -or $plan.liveIisChanged -or $plan.computerName -cne $env:COMPUTERNAME -or (Hash $profileFile) -cne $plan.profileSha256 -or (Hash (Join-Path $PSScriptRoot 'BrowserEntryIisModel.psm1')) -cne $plan.modelSha256 -or (Hash $mapped) -cne $plan.applicationHostProposedSha256 -or (Hash $appHost) -cne $plan.applicationHostBeforeSha256 -or (Test-Path -LiteralPath $profile.physicalPath)){throw 'Browser IIS reviewed input or live baseline differs'}
$health=[Uri]$approval.publicHealthUri
if($profile.httpsOnly){if($health.AbsoluteUri -cne ($profile.publicOrigin+$profile.basePath+'/health')){throw 'Browser IIS public health differs'}}
elseif($health.AbsoluteUri -cne ($profile.upstreamOrigin+$profile.basePath+'/health')){throw 'Browser IIS private health differs'}
$consumed=Join-Path $directory 'approval-consumed.json';$stream=[IO.File]::Open($consumed,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
try{$bytes=[Text.Encoding]::UTF8.GetBytes(($approval|ConvertTo-Json -Compress));$stream.Write($bytes,0,$bytes.Length)}finally{$stream.Dispose()}
[IO.File]::Copy($appHost,(Join-Path $directory 'applicationHost.before.config'),$false)
Add-Type -Path (Join-Path $env:WINDIR 'System32\inetsrv\Microsoft.Web.Administration.dll')
$created=$false;$changed=$false
try{
 [void][IO.Directory]::CreateDirectory($profile.physicalPath);$created=$true
 $acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetAccessRuleProtection($true,$false)
 foreach($sid in @('S-1-5-18','S-1-5-32-544',$approval.executionSid)|Select-Object -Unique){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))}
 $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-32-568'),'ReadAndExecute','ContainerInherit,ObjectInherit','None','Allow'));[IO.Directory]::SetAccessControl($profile.physicalPath,$acl)
 [IO.File]::WriteAllText((Join-Path $profile.physicalPath 'web.config'),'<configuration />',[Text.UTF8Encoding]::new($false))
 $manager=[Microsoft.Web.Administration.ServerManager]::new()
 try{if((Hash $appHost) -cne $plan.applicationHostBeforeSha256){throw 'Browser IIS baseline moved before commit'};Add-BrowserEntryIisModel $manager $profile|Out-Null;$manager.CommitChanges();$changed=$true}finally{$manager.Dispose()}
 if((Hash $appHost) -cne $plan.applicationHostProposedSha256 -or (Get-BrowserEntryIisFingerprint $appHost $profile) -cne $plan.siblingFingerprint){throw 'Browser IIS live result differs from mapped review'}
 if($approval.PSObject.Properties.Name -ccontains 'externalHealth'){$response=Wait-BrowserEntryExternalHealth $approval $plan $directory $health}else{$response=Invoke-WebRequest -UseBasicParsing -Uri $health -TimeoutSec 20}
 if($response.StatusCode -ne 200 -or ($response.Content|ConvertFrom-Json).status -cne 'ok'){throw 'Browser IIS application health failed'}
 $result=@{status='PASS';operationId=$approval.operationId;correlationId=$approval.correlationId;actor=$approval.actor;workspaceId=$approval.workspaceId;planSha256=$approval.planSha256;applicationHostSha256=(Hash $appHost);siblingFingerprint=$plan.siblingFingerprint;healthStatus=200;completedAt=[DateTimeOffset]::UtcNow.ToString('o')}
 if($approval.PSObject.Properties.Name -ccontains 'externalHealth'){$result.httpsProbe=@{mode='external-verified-https';certificateSha256=$response.proof.certificateSha256;observerSid=$response.proof.observerSid;requestSha256=$response.proof.requestSha256;systemTrustAndDnsChanged=$false}}
 $result|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $directory 'result.json') -Encoding UTF8
 $result|ConvertTo-Json -Compress
}catch{
 $failure=@{status='FAIL';operationId=$approval.operationId;type=$_.Exception.GetType().Name;hresult=$_.Exception.HResult;line=$_.InvocationInfo.ScriptLineNumber;recovered=$false}
 try{
  if($changed){$manager=[Microsoft.Web.Administration.ServerManager]::new();try{Remove-BrowserEntryIisModel $manager $profile;$manager.CommitChanges()}finally{$manager.Dispose()}}
  if((Get-BrowserEntryIisFingerprint $appHost $profile) -cne $plan.siblingFingerprint){throw 'Sibling configuration differs during owned recovery'}
  if($created){$owned=Join-Path $profile.physicalPath 'web.config';if([IO.File]::ReadAllText($owned) -cne '<configuration />' -or @(Get-ChildItem -LiteralPath $profile.physicalPath -Force).Count -ne 1){throw 'Owned directory changed during recovery'};[IO.File]::Delete($owned);[IO.Directory]::Delete($profile.physicalPath,$false)}
  $failure.recovered=$true
 }catch{$failure.recoveryType=$_.Exception.GetType().Name}
 $failure|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $directory 'result.json') -Encoding UTF8
 throw 'Browser IIS activation failed; inspect protected result'
}
