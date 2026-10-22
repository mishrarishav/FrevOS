# Fixed privileged activation boundary; builds run separately as LOCAL SERVICE.
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$root='E:\FrevOS\servix'
if($env:COMPUTERNAME -cne 'DCAPP7' -or [Security.Principal.WindowsIdentity]::GetCurrent().User.Value -cne 'S-1-5-18'){throw 'Wrong runner identity'}
$lock=[IO.File]::Open((Join-Path $root 'private\runner.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
Import-Module (Join-Path $PSScriptRoot 'ActivationFiles.psm1') -Force
function Assert-PlainPath([string]$Path){
 $cursor=[IO.Path]::GetFullPath($Path)
 while($cursor){if((Test-Path -LiteralPath $cursor) -and ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked activation path rejected'};$parent=Split-Path -Parent $cursor;if($parent -eq $cursor){break};$cursor=$parent}
}
function Read-SuccessfulRelease([string]$Id,[bool]$AllowAlias=$true){
 if($Id -cnotmatch '^sd_[a-f0-9]{32}$'){throw 'Invalid saved release identity'}
 $claim=Join-Path $root ('private\claims\'+$Id);Assert-PlainPath $claim
 $proof=Get-Content -LiteralPath (Join-Path $claim 'approval.json') -Raw|ConvertFrom-Json
 $receipt=Get-Content -LiteralPath (Join-Path $claim 'target-receipt.json') -Raw|ConvertFrom-Json
 if($proof.requestId -cne $Id -or $proof.workspaceId -cne 'ws_server20' -or $proof.target -cne 'server21-servix-development' -or $proof.status -cne 'activating' -or $proof.sourceHead -cnotmatch '^[a-f0-9]{40}$' -or $proof.artifactDigest -cnotmatch '^[a-f0-9]{64}$' -or $proof.archiveSha256 -cnotmatch '^[a-f0-9]{64}$' -or $receipt.status -cne 'PASS' -or $receipt.computer -cne 'DCAPP9' -or $receipt.release.manifestSha256 -cne $proof.artifactDigest -or -not $receipt.release.existingPersistentFilesPreserved -or -not $receipt.release.productionListenerPreserved){throw 'Saved release has no successful private receipt'}
 $origin=if($proof.PSObject.Properties['releaseRequestId']){[string]$proof.releaseRequestId}else{$Id}
 if($origin -cnotmatch '^sd_[a-f0-9]{32}$'){throw 'Invalid artifact origin'}
 if($origin -cne $Id){
  if(-not $AllowAlias){throw 'Saved artifact aliases must resolve directly to an original build'}
  $original=Read-SuccessfulRelease $origin $false
  if($original.origin -cne $origin -or $original.approval.sourceHead -cne $proof.sourceHead -or $original.approval.artifactDigest -cne $proof.artifactDigest -or $original.approval.archiveSha256 -cne $proof.archiveSha256){throw 'Saved artifact origin mismatch'}
 }
 $build=Join-Path $root ('builds\'+$origin);Assert-PlainPath $build
 $manifest=Join-Path $build 'release\manifest.json';Assert-PlainPath $manifest
 if((Get-FileHash -LiteralPath $manifest -Algorithm SHA256).Hash.ToLowerInvariant() -cne $proof.artifactDigest){throw 'Saved manifest changed'}
 return @{origin=$origin;build=$build;manifest=$manifest;approval=$proof}
}
function Activate-Servix($approval,[string]$Id,[string]$PrivateJob){
 if($approval.version -ne 1 -or $approval.requestId -cne $Id -or $approval.workspaceId -cne 'ws_server20' -or $approval.target -cne 'server21-servix-development' -or $approval.status -cne 'activating' -or $approval.sourceHead -cnotmatch '^[a-f0-9]{40}$' -or $approval.artifactDigest -cnotmatch '^[a-f0-9]{64}$' -or $approval.archiveSha256 -cnotmatch '^[a-f0-9]{64}$' -or $approval.requestedBy -cnotmatch '^usr_[A-Za-z0-9_-]+$'){throw 'Wrong activation approval'}
 $now=[DateTimeOffset]::UtcNow;$expires=[DateTimeOffset]::Parse($approval.expiresAt);$issued=[DateTimeOffset]::Parse($approval.createdAt)
 if($issued -gt $now -or $expires -le $now -or ($expires-$issued).TotalMinutes -gt 40){throw 'Expired activation approval'}
 $releaseId=if($approval.PSObject.Properties['releaseRequestId']){[string]$approval.releaseRequestId}else{$Id}
 if($releaseId -cnotmatch '^sd_[a-f0-9]{32}$'){throw 'Invalid activation artifact origin'}
 if($releaseId -cne $Id){
  if(-not $approval.PSObject.Properties['operation'] -or $approval.operation -cnotin @('rollback','restore')){throw 'Saved artifact requires a restore operation'}
  $selected=Read-SuccessfulRelease $releaseId
  if($selected.origin -cne $releaseId -or $selected.approval.sourceHead -cne $approval.sourceHead -or $selected.approval.artifactDigest -cne $approval.artifactDigest -or $selected.approval.archiveSha256 -cne $approval.archiveSha256){throw 'Restore artifact identity mismatch'}
 }
 $build=Join-Path $root ('builds\'+$releaseId)
 $previous=$null
 $activeFile=Join-Path $root 'private\active-release.json'
 if($approval.PSObject.Properties['previousRequestId']){
  $previous=Read-SuccessfulRelease ([string]$approval.previousRequestId)
  if(Test-Path -LiteralPath $activeFile){
   $current=Get-Content -LiteralPath $activeFile -Raw|ConvertFrom-Json
   if($current.version -ne 1 -or $current.requestId -cne $approval.previousRequestId -or $current.releaseRequestId -cne $previous.origin -or $current.artifactDigest -cne $previous.approval.artifactDigest -or $current.sourceHead -cne $previous.approval.sourceHead){throw 'Current deployed release changed'}
  }
 }elseif(Test-Path -LiteralPath $activeFile){throw 'An active release must be explicitly bound'}
 foreach($pair in @(@('release.zip',$approval.archiveSha256),@('release\manifest.json',$approval.artifactDigest))){
  $file=Join-Path $build $pair[0];Assert-PlainPath $file
  Copy-Item -LiteralPath $file -Destination (Join-Path $PrivateJob (Split-Path $file -Leaf))
  if((Get-FileHash -LiteralPath (Join-Path $PrivateJob (Split-Path $file -Leaf)) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $pair[1]){throw 'Activation artifact changed'}
 }
 $credential=Import-Clixml -LiteralPath (Join-Path $root 'private\server21.credential.xml')
 $session=$null
 try{
  $session=New-PSSession -ComputerName '10.9.69.21' -Port 5985 -Authentication Negotiate -Credential $credential -SessionOption (New-PSSessionOption -OpenTimeout 15000 -OperationTimeout 240000)
  $remoteJob='D:\servixDev\.runtime\frevos-server21\'+$Id.Substring(3)
  Invoke-Command -Session $session -ArgumentList $remoteJob -ScriptBlock {
   param($job)
   if($env:COMPUTERNAME -cne 'DCAPP9' -or $job -cnotmatch '^D:\\servixDev\\\.runtime\\frevos-server21\\[a-f0-9]{32}$' -or (Test-Path -LiteralPath $job)){throw 'Target identity or unique operation mismatch'}
   [void][IO.Directory]::CreateDirectory($job)
   $acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetAccessRuleProtection($true,$false)
   foreach($sid in @('S-1-5-18','S-1-5-32-544',[Security.Principal.WindowsIdentity]::GetCurrent().User.Value)){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))}
   Set-Acl -LiteralPath $job -AclObject $acl
  }
  $hashes=@{}
  foreach($name in @('Invoke-DevTarget.ps1','Invoke-DevRelease.ps1','DeploymentFiles.psm1','Run-DevBackend.ps1')){
   $file=Join-Path $PSScriptRoot $name;$hashes[$name]=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
   Copy-Item -LiteralPath $file -Destination (Join-Path $remoteJob $name) -ToSession $session
  }
  $operation=@{manifestSha256=$approval.artifactDigest;archiveSha256=$approval.archiveSha256;launcherSha256=$hashes['Run-DevBackend.ps1']}
  if($approval.PSObject.Properties['preservedPaths']){$operation.preservedPaths=@($approval.preservedPaths)}
  $stagedNames=@('manifest.json','release.zip','operation.json')
  if($previous){
   $operation.previousManifestSha256=$previous.approval.artifactDigest
   Copy-Item -LiteralPath $previous.manifest -Destination (Join-Path $PrivateJob 'previous-manifest.json')
   $stagedNames+='previous-manifest.json'
  }
  [IO.File]::WriteAllText((Join-Path $PrivateJob 'operation.json'),($operation|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
  foreach($name in $stagedNames){Copy-Item -LiteralPath (Join-Path $PrivateJob $name) -Destination (Join-Path $remoteJob $name) -ToSession $session}
  # Consumed request lives in SYSTEM-only storage before any target mutation.
  Invoke-Command -Session $session -ArgumentList $remoteJob,$hashes -ScriptBlock {
   param($job,$hashes)
   foreach($name in $hashes.Keys){if((Get-FileHash -LiteralPath (Join-Path $job $name) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $hashes[$name]){throw 'Remote operator digest mismatch'}}
   & (Join-Path $job 'Invoke-DevTarget.ps1') -Action Deploy
  }
  $report=Invoke-Command -Session $session -ArgumentList $remoteJob -ScriptBlock {param($job);Get-Content -LiteralPath (Join-Path $job 'result.json') -Raw|ConvertFrom-Json}
  $report | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $PrivateJob 'target-receipt.json') -Encoding UTF8
  if($report.status -cne 'PASS' -or $report.computer -cne 'DCAPP9' -or $report.release.manifestSha256 -cne $approval.artifactDigest -or -not $report.release.existingPersistentFilesPreserved -or -not $report.release.productionListenerPreserved){throw 'Target activation failed or recovery required'}
  $health=Invoke-RestMethod 'http://10.9.69.21:82/api/health' -TimeoutSec 10
  if($health.status -cne 'OK' -or -not $health.authBootstrapReady -or -not $health.fullBootstrapReady){throw 'Hosted development health failed'}
  Write-ServixResult $activeFile @{version=1;requestId=$Id;releaseRequestId=$releaseId;sourceHead=$approval.sourceHead;artifactDigest=$approval.artifactDigest}
  return [int]$report.release.persistentFileCount
 }finally{if($session){Remove-PSSession $session};$credential=$null}
}
try{
 # A consumed operation is never replayed after a process interruption.
 foreach($claim in Get-ChildItem -LiteralPath (Join-Path $root 'private\claims') -Directory){
  if($claim.Name -cmatch '^sd_[a-f0-9]{32}$' -and -not(Test-Path -LiteralPath (Join-Path $root ('results\'+$claim.Name+'.json')))){
   $old=Get-Content -LiteralPath (Join-Path $claim.FullName 'approval.json') -Raw|ConvertFrom-Json
   Write-ServixResult (Join-Path $root ('results\'+$claim.Name+'.json')) @{requestId=$claim.Name;sourceHead=$old.sourceHead;artifactDigest=$old.artifactDigest;status='recovery-required';errorCode='activation-interrupted'}
  }
 }
 while($true){
  Write-ServixResult (Join-Path $root 'results\heartbeat.json') @{host='DCAPP7';at=[DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')}
  foreach($request in Get-ChildItem -LiteralPath (Join-Path $root 'requests') -File -Filter 'sd_*.json'){
   if($request.Name -cnotmatch '^sd_[a-f0-9]{32}\.json$'){continue}
   $id=[IO.Path]::GetFileNameWithoutExtension($request.Name);$privateJob=Join-Path $root ('private\claims\'+$id)
   if(Test-Path -LiteralPath $privateJob){continue}
   Assert-PlainPath $request.FullName
   if($request.Length -gt 16384){continue}
   [void][IO.Directory]::CreateDirectory($privateJob)
   # Recreate in the private directory: an NTFS move would retain the
   # web identity's original writable ACL and ownership on the approval.
   $bytes=[IO.File]::ReadAllBytes($request.FullName)
   if($bytes.Length -gt 16384){throw 'Oversized approval'}
   [IO.File]::WriteAllBytes((Join-Path $privateJob 'approval.json'),$bytes)
   [IO.File]::Delete($request.FullName)
   $approval=Get-Content -LiteralPath (Join-Path $privateJob 'approval.json') -Raw|ConvertFrom-Json
   $result=@{requestId=$id;sourceHead=$approval.sourceHead;artifactDigest=$approval.artifactDigest;status='recovery-required';errorCode='activation-failed-inspect-receipt'}
   try{
    $count=Activate-Servix $approval $id $privateJob
    $result=@{requestId=$id;sourceHead=$approval.sourceHead;artifactDigest=$approval.artifactDigest;status='succeeded';preservedFiles=$count}
   }catch{
    [IO.File]::WriteAllText((Join-Path $privateJob 'error.json'),(@{type=$_.Exception.GetType().Name;line=$_.InvocationInfo.ScriptLineNumber;id=$_.FullyQualifiedErrorId}|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
   }
   Write-ServixResult (Join-Path $root ('results\'+$id+'.json')) $result
  }
  Start-Sleep -Seconds 2
 }
}finally{$lock.Dispose()}
