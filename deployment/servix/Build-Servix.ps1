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
# Extract npm's many small files into the build identity's private local profile.
# Keep durable logs/artifacts in the configured controller store; never install
# dependencies in a customer working directory or in the destination application.
if([Security.Principal.WindowsIdentity]::GetCurrent().User.Value -cne 'S-1-5-19'){throw 'Wrong build identity'}
$localProfile=[Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
if([string]::IsNullOrWhiteSpace($localProfile)){throw 'Private build profile is unavailable'}
$scratchBase=[IO.Path]::GetFullPath((Join-Path $localProfile 'DevSetu\BuildScratch'))
$scratch=Join-Path $scratchBase $RequestId
if(-not $scratch.StartsWith(([IO.Path]::GetFullPath($localProfile).TrimEnd('\')+'\'),[StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $scratch)){throw 'Build scratch scope or identity collision'}
for($cursor=$scratch;;){if((Test-Path -LiteralPath $cursor) -and ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked build scratch rejected'};$parent=[IO.Path]::GetDirectoryName($cursor);if(-not $parent -or $parent -ceq $cursor){break};$cursor=$parent}
$drive=[IO.DriveInfo]::new([IO.Path]::GetPathRoot($scratchBase));if($drive.AvailableFreeSpace -lt 2GB){throw 'Private build scratch requires at least 2 GB free'}
$source=Join-Path $scratch 'source';[void][IO.Directory]::CreateDirectory($source)
[IO.File]::WriteAllText((Join-Path $job 'workspace.json'),(@{version=1;identity='LOCAL SERVICE';source=$source;artifacts=$job;privateScratch=$true}|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
$buildProfile=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'ReleaseBuildProfile.json') -Raw|ConvertFrom-Json
$git=[string]$buildProfile.git.executable;$repo=[string]$buildProfile.git.repository
if($buildProfile.version -ne 1 -or -not [IO.Path]::IsPathRooted($git) -or -not [IO.Path]::IsPathRooted($repo) -or $buildProfile.git.repositoryId -cnotmatch '^gitrepo_[a-f0-9]{32}$'){throw 'Git build tool profile is unavailable'}
$archive=Join-Path $job 'source.zip'
$stage='git-export'
$identityLog=Join-Path $job 'repository-identity.log'
if((Invoke-ServixBuildProcess $git ('-c "safe.directory='+$repo+'" "--git-dir='+$repo+'" config --get frevos.repositoryId') $job $identityLog 30) -ne 0 -or (Get-Content -LiteralPath $identityLog -Raw).Trim() -cne $buildProfile.git.repositoryId){throw 'Build repository identity differs'}
$optionalLog=Join-Path $job 'backend-build-inputs.log'
if((Invoke-ServixBuildProcess $git ('-c "safe.directory='+$repo+'" "--git-dir='+$repo+'" ls-tree --name-only '+$SourceHead+' -- backend/package-lock.json backend/scripts backend/tests') $job $optionalLog 30) -ne 0){throw 'Backend build input lookup failed'}
$optional=@(Get-Content -LiteralPath $optionalLog|Where-Object {$_ -cin @('backend/package-lock.json','backend/scripts','backend/tests')})
$gitArguments='-c "safe.directory='+$repo+'" "--git-dir='+$repo+'" archive --format=zip "--output='+$archive+'" '+$SourceHead+' backend/src backend/package.json querysafe/src querysafe/package.json frontend '+($optional -join ' ')
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
if((Invoke-ServixBuildProcess $node ('"'+$npm+'" ci --ignore-scripts --offline --no-audit --no-fund') (Join-Path $source 'frontend') (Join-Path $job 'install.log') 1200) -ne 0){throw 'Locked frontend dependency installation failed'}
$stage='backend-build'
$backendPackage=Get-Content -LiteralPath (Join-Path $source 'backend\package.json') -Raw|ConvertFrom-Json
if($backendPackage.PSObject.Properties.Name -contains 'devDependencies' -and $backendPackage.devDependencies.PSObject.Properties.Name -contains 'esbuild'){
 if($backendPackage.scripts.'build:release' -cne 'node scripts/buildRelease.js' -or $backendPackage.devDependencies.esbuild -cnotmatch '^\d+\.\d+\.\d+$'){throw 'Backend build recipe is not pinned'}
 if((Invoke-ServixBuildProcess $node ('"'+$npm+'" ci --ignore-scripts --offline --no-audit --no-fund') (Join-Path $source 'backend') (Join-Path $job 'backend-install.log') 600) -ne 0){throw 'Locked backend build-tool installation failed'}
 if((Invoke-ServixBuildProcess $node ('"'+$npm+'" run build:release') (Join-Path $source 'backend') (Join-Path $job 'backend-build.log') 120) -ne 0){throw 'Backend artifact compilation failed'}
 if(-not(Test-Path -LiteralPath (Join-Path $source 'dist\servix-server\backend-artifact.json') -PathType Leaf)){throw 'Backend build did not produce its descriptor'}
}
$stage='application-tests'
$suites=@();$testIndex=0;$oldCi=$env:CI;$env:CI='true'
try{
 foreach($test in $buildProfile.tests){
  if($test.component -cnotin @('backend','frontend') -or $test.project -cnotmatch '^[a-z][a-z0-9-]{1,47}$' -or $test.script -cnotmatch '^test(?::[A-Za-z0-9_-]+)*$' -or $test.recipe -cnotin @('npm-test','react-tests')){throw 'Validation recipe rejected'}
  $directory=Join-Path $source $test.project;$package=Get-Content -LiteralPath (Join-Path $directory 'package.json') -Raw|ConvertFrom-Json
  if(-not $package.scripts.PSObject.Properties[$test.script]){throw 'Required validation script missing'}
  $testArguments='"'+$npm+'" --ignore-scripts run '+$test.script
  if($test.recipe -ceq 'react-tests'){$testArguments+=' -- --watchAll=false --runInBand'}
  if((Invoke-ServixBuildProcess $node $testArguments $directory (Join-Path $job ('validation-'+$testIndex+'.log')) 300) -ne 0){throw 'Application validation failed; no deployment was queued'}
  $suites+=@{component=$test.component;project=$test.project;script=$test.script;recipe=$test.recipe;exitCode=0};$testIndex++
 }
 if(@($suites|Where-Object component -CEQ 'frontend').Count -eq 0 -or @($suites|Where-Object component -CEQ 'backend').Count -eq 0){throw 'Both components require validation'}
 [IO.File]::WriteAllText((Join-Path $job 'validation.json'),(@{version=1;status='passed';sourceHead=$SourceHead;suites=$suites}|ConvertTo-Json -Depth 10 -Compress),[Text.UTF8Encoding]::new($false))
}finally{$env:CI=$oldCi}
$stage='frontend-build'
$buildArguments='"'+(Join-Path $PSScriptRoot 'Build-DevRelease.cjs')+'" "'+$source+'" "'+$job+'"'
if((Invoke-ServixBuildProcess $node $buildArguments $job (Join-Path $job 'build.log') 660) -ne 0){throw 'Frontend artifact build failed'}
$manifest=Join-Path $job 'release\manifest.json';$releaseZip=Join-Path $job 'release.zip'
$stage='artifact-packaging'
[IO.Compression.ZipFile]::CreateFromDirectory((Join-Path $job 'release\payload'),$releaseZip)
$result=@{manifestSha256=(Get-FileHash -LiteralPath $manifest -Algorithm SHA256).Hash.ToLowerInvariant();archiveSha256=(Get-FileHash -LiteralPath $releaseZip -Algorithm SHA256).Hash.ToLowerInvariant()}
[IO.File]::WriteAllText((Join-Path $job 'artifact.json'),($result|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
