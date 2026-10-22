param([Parameter(Mandatory=$true)][ValidatePattern('^sd_[a-f0-9]{32}$')][string]$RequestId,
 [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$SourceHead,
 [string]$PreservationFile)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
if($env:COMPUTERNAME -cne 'DCAPP7'){throw 'Wrong build host'}
$root='E:\FrevOS\servix';$job=Join-Path $root ('builds\'+$RequestId)
$stage='prepare'
trap {
 try {if(Test-Path -LiteralPath $job){[IO.File]::WriteAllText((Join-Path $job 'failure.json'),(@{stage=$stage;type=$_.Exception.GetType().Name;line=$_.InvocationInfo.ScriptLineNumber}|ConvertTo-Json),[Text.UTF8Encoding]::new($false))}}catch{}
 exit 1
}
if(Test-Path -LiteralPath $job){throw 'Build identity already exists'}
[void][IO.Directory]::CreateDirectory($job)
if($PreservationFile){
 if($PreservationFile -cne (Join-Path $root ('jobs\preserve-'+$RequestId+'.json')) -or (Get-Item -LiteralPath $PreservationFile).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Invalid preservation snapshot'}
 Copy-Item -LiteralPath $PreservationFile -Destination (Join-Path $job 'preserve.json')
}else{[IO.File]::WriteAllText((Join-Path $job 'preserve.json'),'[]')}
Import-Module (Join-Path $PSScriptRoot 'BuildProcess.psm1') -Force
Initialize-ServixBuildGroup
$source=Join-Path $job 'source';[void][IO.Directory]::CreateDirectory($source)
$git='C:\Program Files\Git\cmd\git.exe';$repo='E:\FrevOS\git\servix.git'
$archive=Join-Path $job 'source.zip'
$stage='git-export'
$gitArguments='-c "safe.directory='+$repo+'" "--git-dir='+$repo+'" archive --format=zip "--output='+$archive+'" '+$SourceHead+' backend/src backend/package.json querysafe/src querysafe/package.json frontend'
if((Invoke-ServixBuildProcess $git $gitArguments $job (Join-Path $job 'git.log') 60) -ne 0){throw 'Git source export failed'}
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$stage='source-verification'
$zip=[IO.Compression.ZipFile]::OpenRead($archive)
try {
 $seen=@{};$size=0L
 foreach($entry in $zip.Entries){
  $name=$entry.FullName
  if($name.EndsWith('/')){continue}
  if($name -match '(^|/)(\.|\.\.)(/|$)|[:\\\x00-\x1f]' -or $name.StartsWith('/') -or $seen.ContainsKey($name.ToLowerInvariant()) -or (($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000){throw 'Unsafe Git source entry'}
  $seen[$name.ToLowerInvariant()]=$true;$size+=$entry.Length
  if($size -gt 256MB -or $seen.Count -gt 15000){throw 'Source exceeds build budget'}
 }
}finally{$zip.Dispose()}
[IO.Compression.ZipFile]::ExtractToDirectory($archive,$source)
$env:npm_config_cache=Join-Path $root 'npm-cache';$env:npm_config_audit='false';$env:npm_config_fund='false';$env:npm_config_update_notifier='false'
$node='E:\FrevOS\node\node-v24.19.0-win-x64\node.exe';$npm='E:\FrevOS\node\node-v24.19.0-win-x64\node_modules\npm\bin\npm-cli.js'
$stage='dependency-install'
if((Invoke-ServixBuildProcess $node ('"'+$npm+'" ci --ignore-scripts') (Join-Path $source 'frontend') (Join-Path $job 'install.log') 600) -ne 0){throw 'Locked frontend dependency installation failed'}
$stage='frontend-build'
$buildArguments='"'+(Join-Path $PSScriptRoot 'Build-DevRelease.cjs')+'" "'+$source+'" "'+$job+'"'
if((Invoke-ServixBuildProcess $node $buildArguments $job (Join-Path $job 'build.log') 660) -ne 0){throw 'Frontend artifact build failed'}
$manifest=Join-Path $job 'release\manifest.json';$releaseZip=Join-Path $job 'release.zip'
$stage='artifact-packaging'
[IO.Compression.ZipFile]::CreateFromDirectory((Join-Path $job 'release\payload'),$releaseZip)
$result=@{manifestSha256=(Get-FileHash -LiteralPath $manifest -Algorithm SHA256).Hash.ToLowerInvariant();archiveSha256=(Get-FileHash -LiteralPath $releaseZip -Algorithm SHA256).Hash.ToLowerInvariant()}
[IO.File]::WriteAllText((Join-Path $job 'artifact.json'),($result|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
