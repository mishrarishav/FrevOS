#requires -Version 5.1
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
$root='E:\FrevOS\maintenance'
if($env:COMPUTERNAME -cne 'DCAPP7' -or $PSScriptRoot -cne $root -or [Security.Principal.WindowsIdentity]::GetCurrent().User.Value -cne 'S-1-5-18'){throw 'Wrong updater boundary'}
$lock=[IO.File]::Open((Join-Path $root 'private\worker.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
function Publish-Result($request,[string]$Status){
 $path=Join-Path $root ('results\'+$request.requestId+'.json');$temp=$path+'.tmp'
 $data=@{version=1;requestId=$request.requestId;candidateId=$request.candidateId;manifestSha256=$request.manifestSha256;status=$Status;updatedAt=[DateTimeOffset]::UtcNow.ToString('o')}|ConvertTo-Json -Compress
 [IO.File]::WriteAllText($temp,$data,[Text.UTF8Encoding]::new($false))
 if(Test-Path -LiteralPath $path){[IO.File]::Replace($temp,$path,(Join-Path $root ('private\result-before-'+$request.requestId+'.json')))}else{[IO.File]::Move($temp,$path)}
}
try{while($true){
 foreach($file in Get-ChildItem -LiteralPath (Join-Path $root 'requests') -File -Filter '*.json'){
  $request=$null
  try{
   $request=Get-Content -LiteralPath $file.FullName -Raw|ConvertFrom-Json
   if(@($request.PSObject.Properties).Count -ne 7 -or $request.version -ne 1 -or $request.requestId -cnotmatch '^su_[a-f0-9]{32}$' -or $request.candidateId -cnotmatch '^[a-f0-9]{32}$' -or $request.manifestSha256 -cnotmatch '^[a-f0-9]{64}$' -or $request.previousManifestSha256 -cnotmatch '^[a-f0-9]{64}$' -or $request.actor -cne 'usr_windows_admin' -or $file.BaseName -cne $request.candidateId){throw 'Invalid updater request'}
   $resultPath=Join-Path $root ('results\'+$request.requestId+'.json')
   if(Test-Path -LiteralPath $resultPath){$oldResult=Get-Content -LiteralPath $resultPath -Raw|ConvertFrom-Json;if($oldResult.status -in @('succeeded','failed')){continue}}
   $approval=Get-Content -LiteralPath (Join-Path $root ('private\'+$request.candidateId+'.json')) -Raw|ConvertFrom-Json
   $job='E:\FrevOS\operator\servix-dashboard-'+$request.candidateId
   $script=Join-Path $job 'Apply-ServixDashboard.ps1'
   if($approval.manifestSha256 -cne $request.manifestSha256 -or $approval.previousManifestSha256 -cne $request.previousManifestSha256 -or $approval.actorSid -cnotmatch '^S-1-5-(\d+-)*\d+$' -or (Get-FileHash -LiteralPath $script).Hash.ToLowerInvariant() -cne $approval.scriptSha256){throw 'Prepared updater authorization changed'}
   $claim=Join-Path $root ('private\claim-'+$request.candidateId)
   $receipt=Join-Path $job 'result-apply.json'
   if(Test-Path -LiteralPath $claim){
    if(Test-Path -LiteralPath $receipt){$saved=Get-Content -LiteralPath $receipt -Raw|ConvertFrom-Json;if($saved.status -ceq 'PASS' -and $saved.manifestSha256 -ceq $request.manifestSha256 -and (Get-Content 'E:\FrevOS\state\active.json' -Raw|ConvertFrom-Json).manifestSha256 -ceq $request.manifestSha256){Publish-Result $request 'succeeded';continue}}
    Publish-Result $request 'failed';continue
   }
   $now=[DateTimeOffset]::UtcNow;$issued=[DateTimeOffset]::Parse($request.issuedAt);$expires=[DateTimeOffset]::Parse($approval.expiresAt)
   if($issued -gt $now.AddSeconds(5) -or $issued -lt $now.AddMinutes(-15) -or $expires -le $now -or ($expires-$issued).TotalMinutes -gt 15 -or (Get-Content 'E:\FrevOS\state\active.json' -Raw|ConvertFrom-Json).manifestSha256 -cne $request.previousManifestSha256){throw 'Expired or stale updater request'}
   $stream=[IO.File]::Open($claim,[IO.FileMode]::CreateNew);$stream.Dispose()
   Publish-Result $request 'activating'
   & (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe') -NoProfile -NonInteractive -WindowStyle Hidden -File $script -Action Apply -ManifestSha256 $approval.manifestSha256 -ArchiveSha256 $approval.archiveSha256 -ActorSid $approval.actorSid *> (Join-Path $root ('private\'+$request.requestId+'.log'))
   $applied=Get-Content -LiteralPath $receipt -Raw|ConvertFrom-Json
   if($LASTEXITCODE -ne 0 -or $applied.status -cne 'PASS' -or $applied.manifestSha256 -cne $request.manifestSha256 -or (Get-Content 'E:\FrevOS\state\active.json' -Raw|ConvertFrom-Json).manifestSha256 -cne $request.manifestSha256){throw 'Updater activation failed'}
   Publish-Result $request 'succeeded'
  }catch{
   if($null -ne $request -and $request.requestId -cmatch '^su_[a-f0-9]{32}$' -and $request.candidateId -cmatch '^[a-f0-9]{32}$' -and $request.manifestSha256 -cmatch '^[a-f0-9]{64}$'){Publish-Result $request 'failed'}
  }
 }
 Start-Sleep -Seconds 1
}}finally{$lock.Dispose()}
