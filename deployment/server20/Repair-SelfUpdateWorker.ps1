# Bounded native journal repair. It cannot deploy an application or accept commands.
param([ValidateSet('Plan','Apply')][string]$Action='Plan',
 [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ManifestSha256,
 [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ArchiveSha256,
 [Parameter(Mandatory=$true)][string]$ActorSid)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
$root='E:\FrevOS\maintenance';$name='DevSetu-PlatformUpdater';$worker=Join-Path $root 'Run-SelfUpdate.ps1'
$report=[ordered]@{host='DCAPP7';action=$Action;status='FAIL';manifestSha256=$ManifestSha256;databaseWritten=$false;applicationRedeployed=$false}
$changed=$false;$stopped=$false
function Hash([string]$File){return (Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant()}
function Check-Task {
 $value=Get-ScheduledTask -TaskName $name
 $sid=if($value.Principal.UserId -match '^S-1-'){[Security.Principal.SecurityIdentifier]::new($value.Principal.UserId).Value}else{[Security.Principal.NTAccount]::new($value.Principal.UserId).Translate([Security.Principal.SecurityIdentifier]).Value}
 if($sid -cne 'S-1-5-18' -or $value.Actions.Count -ne 1 -or $value.Actions[0].Execute -ine (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe') -or $value.Actions[0].Arguments -cne '-NoProfile -NonInteractive -WindowStyle Hidden -File "E:\FrevOS\maintenance\Run-SelfUpdate.ps1"'){throw 'Updater task ownership changed'}
 return $value
}
try{
 if($env:COMPUTERNAME -cne 'DCAPP7' -or [Security.Principal.WindowsIdentity]::GetCurrent().User.Value -cne 'S-1-5-18' -or (Split-Path $PSScriptRoot -Leaf) -cnotmatch '^servix-dashboard-[a-f0-9]{32}$'){throw 'Wrong repair boundary'}
 $cid=(Split-Path $PSScriptRoot -Leaf).Substring(17)
 foreach($rule in (Get-Acl -LiteralPath $PSScriptRoot).Access){if($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin @($ActorSid,'S-1-5-18','S-1-5-32-544')){throw 'Private repair ACL changed'}}
 $manifestFile=Join-Path $PSScriptRoot 'worker-repair-manifest.json';$repair=Get-Content -LiteralPath $manifestFile -Raw|ConvertFrom-Json
 if($repair.version -ne 1 -or $repair.target -cne 'DCAPP7/10.9.69.20' -or $repair.currentManifest -cne $ManifestSha256 -or $repair.beforeSha256 -cnotmatch '^[a-f0-9]{64}$' -or $repair.afterSha256 -cnotmatch '^[a-f0-9]{64}$' -or $repair.requestId -cnotmatch '^su_[a-f0-9]{32}$' -or $repair.candidateId -cnotmatch '^[a-f0-9]{32}$'){throw 'Invalid repair manifest'}
 if((Get-Content 'E:\FrevOS\state\active.json' -Raw|ConvertFrom-Json).manifestSha256 -cne $ManifestSha256){throw 'Application release changed'}
 $applicationManifestPath='E:\FrevOS\releases\'+$ManifestSha256+'\release-manifest.json'
 if((Hash $applicationManifestPath) -cne $ManifestSha256){throw 'Application manifest integrity changed'}
 $applicationManifest=Get-Content $applicationManifestPath -Raw|ConvertFrom-Json
 $owned=@($applicationManifest.files|Where-Object path -CEQ 'deployment/server20/Run-SelfUpdate.ps1')
 if($owned.Count -ne 1 -or $owned[0].sha256 -cne $repair.beforeSha256 -or (Hash $worker) -cne $repair.beforeSha256 -or (Hash (Join-Path $PSScriptRoot 'Run-SelfUpdate.ps1')) -cne $repair.afterSha256){throw 'Worker source identity changed'}
 $candidateJob='E:\FrevOS\operator\servix-dashboard-'+$repair.candidateId
 $receipt=Get-Content (Join-Path $candidateJob 'result-apply.json') -Raw|ConvertFrom-Json
 if($receipt.status -cne 'PASS' -or $receipt.manifestSha256 -cne $ManifestSha256 -or $receipt.databaseWritten -ne $false){throw 'Application activation is not proven complete'}
 $request=Get-Content (Join-Path $root ('requests\'+$repair.candidateId+'.json')) -Raw|ConvertFrom-Json
 if($request.requestId -cne $repair.requestId -or $request.manifestSha256 -cne $ManifestSha256 -or $request.candidateId -cne $repair.candidateId){throw 'Repair request identity changed'}
 $task=Check-Task
 $health=Invoke-WebRequest 'http://10.9.69.20/health' -UseBasicParsing -TimeoutSec 10
 if($health.StatusCode -ne 200 -or ($health.Content|ConvertFrom-Json).status -cne 'ok'){throw 'Application is not healthy'}
 $report.workerManifestSha256=Hash $manifestFile;$report.requestId=$repair.requestId;$report.actorSid=$ActorSid;$report.correlationId=$cid
 if($Action -eq 'Plan'){$report.status='PASS'}else{
  $approval=Get-Content (Join-Path $PSScriptRoot 'approval.json') -Raw|ConvertFrom-Json
  $now=[DateTimeOffset]::UtcNow;$issued=[DateTimeOffset]::Parse($approval.issuedUtc);$expires=[DateTimeOffset]::Parse($approval.expiresUtc)
  if($approval.action -cne 'frevos.server20.updater-journal-repair.v1' -or $approval.actorSid -cne $ActorSid -or $approval.workspace -cne 'mishrarishav/FrevOS/server20' -or $approval.target -cne 'DCAPP7/10.9.69.20' -or $approval.correlationId -cne $cid -or $approval.manifestSha256 -cne $ManifestSha256 -or $approval.workerManifestSha256 -cne $report.workerManifestSha256 -or $issued -gt $now -or $expires -le $now -or ($expires-$issued).TotalMinutes -gt 15){throw 'Repair approval mismatch'}
  $consumed=Join-Path $PSScriptRoot 'approval-consumed.json';$stream=[IO.File]::Open($consumed,[IO.FileMode]::CreateNew);$stream.Dispose()
  Copy-Item -LiteralPath $worker -Destination (Join-Path $PSScriptRoot 'worker-before.ps1')
  Export-ScheduledTask -TaskName $name|Set-Content (Join-Path $PSScriptRoot 'task-before.xml')
  Disable-ScheduledTask -TaskName $name|Out-Null;Stop-ScheduledTask -TaskName $name;$stopped=$true
  $deadline=[DateTimeOffset]::UtcNow.AddSeconds(15)
  while((Get-ScheduledTask -TaskName $name).State -eq 'Running'){if([DateTimeOffset]::UtcNow -gt $deadline){throw 'Updater did not stop'};Start-Sleep -Milliseconds 200}
  [void](Check-Task)
  if((Hash $worker) -cne $repair.beforeSha256){throw 'Stopped updater source changed'}
  $temp=Join-Path $root ('worker-'+$cid+'.tmp');Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Run-SelfUpdate.ps1') -Destination $temp
  [IO.File]::Replace($temp,$worker,(Join-Path $PSScriptRoot 'worker-replaced.ps1'));$changed=$true
  if((Hash $worker) -cne $repair.afterSha256){throw 'Repaired updater integrity mismatch'}
  Enable-ScheduledTask -TaskName $name|Out-Null;Start-ScheduledTask -TaskName $name
  $deadline=[DateTimeOffset]::UtcNow.AddSeconds(20);$published=$false
  while([DateTimeOffset]::UtcNow -lt $deadline){
   $result=Get-Content (Join-Path $root ('results\'+$repair.requestId+'.json')) -Raw|ConvertFrom-Json
   if($result.status -ceq 'succeeded' -and $result.requestId -ceq $repair.requestId -and $result.manifestSha256 -ceq $ManifestSha256 -and $result.candidateId -ceq $repair.candidateId){$published=$true;break};Start-Sleep -Milliseconds 250
  }
  if(-not $published){throw 'Updater did not reconcile the completed request'}
  $report.status='PASS';$report.resultReconciled=$true;$report.workerSha256=$repair.afterSha256;$report.taskPreserved=$true
 }
}catch{
 $report.errorType=$_.Exception.GetType().Name;$report.errorId=$_.FullyQualifiedErrorId;$report.errorLine=$_.InvocationInfo.ScriptLineNumber
 if($stopped){try{[void](Check-Task);if((Hash $worker) -cnotin @($repair.beforeSha256,$repair.afterSha256)){throw 'Updater ownership changed; retained for recovery'};if($changed -and (Hash $worker) -ceq $repair.afterSha256){Stop-ScheduledTask -TaskName $name;Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'worker-before.ps1') -Destination $worker -Force};Enable-ScheduledTask -TaskName $name|Out-Null;Start-ScheduledTask -TaskName $name;$report.previousWorkerRestored=$true}catch{$report.recoveryErrorType=$_.Exception.GetType().Name}}
}
[IO.File]::WriteAllText((Join-Path $PSScriptRoot ('result-'+$Action.ToLowerInvariant()+'.json')),($report|ConvertTo-Json -Depth 6),[Text.UTF8Encoding]::new($false))
