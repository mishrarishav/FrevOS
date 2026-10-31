param([Parameter(Mandatory=$true)][string]$PlanReference)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$plan=Get-Content -LiteralPath $PlanReference -Raw|ConvertFrom-Json
$currentActor=[Security.Principal.WindowsIdentity]::GetCurrent()
if($plan.version -ne 1 -or $plan.action -cne 'android-sdk:update-operator' -or $plan.actorSid -cne $currentActor.User.Value -or $plan.id -cnotmatch '^au_[a-f0-9]{32}$' -or ([DateTimeOffset]$plan.expiresAt) -le [DateTimeOffset]::UtcNow -or (([DateTimeOffset]$plan.expiresAt)-([DateTimeOffset]$plan.issuedAt)).TotalMinutes -gt 5){throw 'SDK operator update scope expired or invalid'}
if($plan.server -cnotmatch '^[a-zA-Z0-9.-]+$' -or $plan.root -cnotmatch '^\\\\[^\\]+\\[a-z]\$\\.+$' -or $plan.files.Count -lt 1 -or $plan.files.Count -gt 3 -or @($plan.files.name|Sort-Object -Unique).Count -ne $plan.files.Count){throw 'SDK operator target invalid'}
$configPath=Join-Path $plan.root 'bin\service-config.json'
$configuration=Get-Content -LiteralPath $configPath -Raw|ConvertFrom-Json
$recoverRuntime=$plan.PSObject.Properties.Name -contains 'failedRuntimeInitializationId'
if($configuration.workspaceId -cne $plan.workspaceId -or $configuration.profileId -cne $plan.profileId -or $configuration.repositoryId -cne $plan.repositoryId){throw 'SDK operator binding changed'}
if($recoverRuntime){
 if($configuration.phase -cne 'initialize-runtime' -or $plan.failedRuntimeInitializationId -cnotmatch '^ar_[a-f0-9]{32}$' -or (Get-FileHash -LiteralPath $configPath).Hash.ToLowerInvariant() -cne $plan.configurationSha256 -or (Test-Path -LiteralPath (Join-Path $plan.root 'sdk\runtime-state.json'))){throw 'Failed SDK runtime recovery scope differs'}
 $failed=Get-Content -LiteralPath (Join-Path $plan.root ('incoming\'+$plan.failedRuntimeInitializationId+'.consumed.json')) -Raw|ConvertFrom-Json
 $process=Get-Content -LiteralPath (Join-Path $plan.root 'results\service-process.json') -Raw|ConvertFrom-Json
 if($failed.action -cne 'android-sdk:install-runtime-tools' -or $failed.workspaceId -cne $plan.workspaceId -or $failed.profileId -cne $plan.profileId -or $failed.repositoryId -cne $plan.repositoryId -or $process.stage -cne 'child-exited' -or $process.exitCode -eq 0 -or $process.actorSid -cne 'S-1-5-18' -or ([DateTimeOffset]$process.at) -lt ([DateTimeOffset]$failed.issuedAt)){throw 'SDK runtime initializer failure is not proven'}
}elseif($configuration.phase -cne 'worker'){throw 'SDK operator is not in worker mode'}
$bin=Join-Path $plan.root 'bin';$rootSddl=(Get-Acl -LiteralPath $plan.root).Sddl
foreach($file in $plan.files){
 if($file.name -cnotin @('AndroidBuild.cjs','Run-AndroidBuilder.ps1','Initialize-Sdk.ps1','AndroidBuilderService.exe','AndroidRuntimeSmoke.cjs') -or $file.beforeSha256 -cnotmatch '^[a-f0-9]{64}$' -or $file.afterSha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'SDK operator update file denied'}
 $target=Join-Path $bin $file.name
 if((Get-Item -Force -LiteralPath $target).Attributes -band [IO.FileAttributes]::ReparsePoint -or (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -cne $file.beforeSha256 -or (Get-FileHash -LiteralPath $file.source -Algorithm SHA256).Hash.ToLowerInvariant() -cne $file.afterSha256){throw 'SDK operator bytes changed'}
}
$approvalPath=Join-Path $plan.root ('incoming\'+$plan.id+'.consumed.json')
$approvalStream=[IO.File]::Open($approvalPath,[IO.FileMode]::CreateNew)
try{$approvalRecord=[Text.UTF8Encoding]::new($false).GetBytes(($plan|ConvertTo-Json -Depth 7 -Compress));$approvalStream.Write($approvalRecord,0,$approvalRecord.Length);$approvalStream.Flush($true)}finally{$approvalStream.Dispose()}
$sc=Join-Path $env:WINDIR 'System32\sc.exe'
& $sc ('\\'+$plan.server) stop DevSetuAndroidBuilder|Out-Null
if($LASTEXITCODE -notin @(0,1062)){throw 'Scoped SDK worker stop failed'}
Start-Sleep -Seconds 3
$backup=Join-Path $plan.root ('incoming\'+$plan.id+'-before');[void][IO.Directory]::CreateDirectory($backup)
foreach($file in $plan.files){
 $target=Join-Path $bin $file.name;$temporary=$target+'.'+[guid]::NewGuid().ToString('N')+'.tmp'
 [IO.File]::Copy($file.source,$temporary,$false)
 [IO.File]::Replace($temporary,$target,(Join-Path $backup $file.name))
}
$entryDigest=(Get-FileHash -LiteralPath (Join-Path $bin 'AndroidBuild.cjs') -Algorithm SHA256).Hash.ToLowerInvariant()
if($configuration.PSObject.Properties.Name -contains 'operatorEntrySha256'){$configuration.operatorEntrySha256=$entryDigest}else{$configuration|Add-Member -NotePropertyName operatorEntrySha256 -NotePropertyValue $entryDigest}
[IO.File]::WriteAllText((Join-Path $bin 'service-config.json'),($configuration|ConvertTo-Json -Depth 8 -Compress),[Text.UTF8Encoding]::new($false))
if($recoverRuntime){
 $configuration.phase='worker';$configuration.PSObject.Properties.Remove('verifyExtractedRuntime')
 [IO.File]::WriteAllText($configPath,($configuration|ConvertTo-Json -Depth 8 -Compress),[Text.UTF8Encoding]::new($false))
 & $sc ('\\'+$plan.server) config DevSetuAndroidBuilder 'obj=' 'NT SERVICE\DevSetuAndroidBuilder'|Out-Null
 if($LASTEXITCODE -ne 0){throw 'SDK runtime recovery could not restore restricted worker identity'}
}
& $sc ('\\'+$plan.server) start DevSetuAndroidBuilder|Out-Null
if($LASTEXITCODE -ne 0){throw 'Scoped SDK worker restart failed'}
if((Get-Acl -LiteralPath $plan.root).Sddl -cne $rootSddl){throw 'SDK root permissions changed'}
@{version=1;status='APPLIED';id=$plan.id;failedRuntimeRecovered=$recoverRuntime;signingIdentityChanged=$false;SDKFilesPreserved=$true;parentPermissionsPreserved=$true}|ConvertTo-Json -Compress
