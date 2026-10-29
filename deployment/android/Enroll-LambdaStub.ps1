param([Parameter(Mandatory=$true)][string]$PlanReference)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.IO.Compression.FileSystem
$plan=Get-Content -LiteralPath $PlanReference -Raw|ConvertFrom-Json
if($plan.version -ne 1 -or $plan.action -cne 'android-sdk:enroll-lambda-stub' -or $plan.actorSid -cne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value -or $plan.id -cnotmatch '^al_[a-f0-9]{32}$' -or ([DateTimeOffset]$plan.expiresAt) -le [DateTimeOffset]::UtcNow -or (([DateTimeOffset]$plan.expiresAt)-([DateTimeOffset]$plan.issuedAt)).TotalMinutes -gt 5){throw 'SDK tool enrollment scope denied'}
$configuration=Get-Content -LiteralPath (Join-Path $plan.root 'bin\service-config.json') -Raw|ConvertFrom-Json
if($configuration.workspaceId -cne $plan.workspaceId -or $configuration.profileId -cne $plan.profileId -or $configuration.repositoryId -cne $plan.repositoryId){throw 'SDK scope differs'}
$stateFile=Join-Path $plan.root 'sdk\sdk-state.json'
if((Get-FileHash -LiteralPath $stateFile).Hash.ToLowerInvariant() -cne $plan.stateSha256){throw 'SDK inventory changed'}
$state=Get-Content -LiteralPath $stateFile -Raw|ConvertFrom-Json
if($state.status -cne 'READY' -or @($state.tools|Where-Object id -CEQ 'lambda').Count){throw 'SDK lambda stub already enrolled or inventory invalid'}
$archive=@($configuration.archives|Where-Object id -CEQ 'build-tools-36')
if($archive.Count -ne 1){throw 'SDK archive identity unavailable'}
$archivePath=Join-Path $plan.root ('incoming\toolchain-v1\'+$archive[0].filename)
if((Get-FileHash -LiteralPath $archivePath).Hash.ToLowerInvariant() -cne $archive[0].sha256){throw 'SDK archive identity changed'}
$zip=[IO.Compression.ZipFile]::OpenRead($archivePath)
try{
 $entry=@($zip.Entries|Where-Object FullName -CEQ 'android-16/core-lambda-stubs.jar')
 if($entry.Count -ne 1 -or $entry[0].Length -gt 100000){throw 'SDK lambda archive entry invalid'}
 $stream=$entry[0].Open();$hash=[Security.Cryptography.SHA256]::Create()
 try{$expected=[BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-','').ToLowerInvariant()}finally{$hash.Dispose();$stream.Dispose()}
}finally{$zip.Dispose()}
$relative='sdk\build-tools-36\android-16\core-lambda-stubs.jar';$stub=Join-Path $plan.root $relative
if((Get-Item -LiteralPath $stub).Attributes -band [IO.FileAttributes]::ReparsePoint -or (Get-FileHash -LiteralPath $stub).Hash.ToLowerInvariant() -cne $expected){throw 'SDK lambda stub integrity mismatch'}
$record=Join-Path $plan.root ('incoming\'+$plan.id+'.consumed.json')
$stream=[IO.File]::Open($record,[IO.FileMode]::CreateNew)
try{$bytes=[Text.UTF8Encoding]::new($false).GetBytes(($plan|ConvertTo-Json -Compress));$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
$state.tools+=@{id='lambda';path=$relative;sha256=$expected}
$temporary=$stateFile+'.'+$plan.id+'.tmp'
[IO.File]::WriteAllText($temporary,($state|ConvertTo-Json -Depth 7 -Compress),[Text.UTF8Encoding]::new($false))
[IO.File]::Replace($temporary,$stateFile,($stateFile+'.'+$plan.id+'.before'))
@{version=1;status='PASS';id=$plan.id;officialArchiveVerified=$true;tool='lambda';sha256=$expected;signingIdentityChanged=$false}|ConvertTo-Json -Compress
