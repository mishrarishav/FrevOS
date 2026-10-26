#requires -Version 5.1
param([Parameter(Mandatory=$true)][string]$PreviousPackageRoot)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
Push-Location $root
try {
    if((& git.exe rev-parse HEAD).Trim() -cne 'bc4530746c01269b3795a25edad63efad9364b9f'){throw 'Unexpected source base'}
    . (Join-Path $PreviousPackageRoot 'deployment\server20\Postgres.ps1')
    . (Join-Path $PSScriptRoot 'HttpCommon.ps1')
    $previous=Test-HttpManifest $PreviousPackageRoot 'de56c5684970bbe7a053318f532b81d1df562a55d5258e033e636cd11c06eef9'
    if(@(Get-ChildItem Env:|Where-Object Name -Like 'VITE_*').Count){throw 'Unexpected Vite build environment'}
    try{$env:VITE_FREVOS_AUTH_MODE='local';& pnpm.cmd --filter '@frevos/control-center' run build;if($LASTEXITCODE -ne 0){throw 'UI build failed'}}finally{Remove-Item Env:VITE_FREVOS_AUTH_MODE -ErrorAction SilentlyContinue}
    $id=[guid]::NewGuid().ToString('N');$output=Join-Path $root ('.local\http-release-'+$id);$package=Join-Path $output 'package'
    [void][IO.Directory]::CreateDirectory($output)
    Copy-Item -LiteralPath $PreviousPackageRoot -Destination $package -Recurse
    foreach($name in @('config','server')){foreach($suffix in @('js','js.map','d.ts','d.ts.map')){Copy-Item -LiteralPath (Join-Path $root ('apps\control-plane\dist\'+$name+'.'+$suffix)) -Destination (Join-Path $package ('apps\control-plane\dist\'+$name+'.'+$suffix))}}
    foreach($name in @('auth-cookies','index')){foreach($suffix in @('js','js.map','d.ts','d.ts.map')){Copy-Item -LiteralPath (Join-Path $root ('packages\contracts\dist\'+$name+'.'+$suffix)) -Destination (Join-Path $package ('apps\control-plane\node_modules\@frevos\contracts\dist\'+$name+'.'+$suffix))}}
    $ui=Join-Path $package 'apps\control-center\dist'
    $absolute=[IO.Path]::GetFullPath($ui)
    if(-not $absolute.StartsWith([IO.Path]::GetFullPath($output)+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'UI cleanup escaped output'}
    Assert-NoReparsePath $ui
    Remove-Item -LiteralPath $ui -Recurse -Force
    Copy-Item -LiteralPath (Join-Path $root 'apps\control-center\dist') -Destination $ui -Recurse
    Remove-Item -LiteralPath (Join-Path $package 'deployment\server20\Install-Server20.ps1')
    foreach($name in @('HttpCommon.ps1','Start-Server20.ps1','Apply-InternalHttp.ps1','Verify-HttpManifest.mjs')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $package 'deployment\server20')}
    $inputs=@('apps/control-plane/src/config.ts','apps/control-plane/src/server.ts','apps/control-center/src/api.ts','packages/contracts/src/auth-cookies.ts','packages/contracts/src/index.ts','deployment/server20/HttpCommon.ps1','deployment/server20/Start-Server20.ps1','deployment/server20/Apply-InternalHttp.ps1','deployment/server20/Verify-HttpManifest.mjs','deployment/server20/New-InternalHttpRelease.ps1')
    $inventory=@($inputs|ForEach-Object {@{path=$_;sha256=(Get-FileHash -LiteralPath (Join-Path $root $_) -Algorithm SHA256).Hash.ToLowerInvariant()}})
    [IO.File]::WriteAllText((Join-Path $package 'deployment\server20\source-inventory.json'),(@{sourceBase='bc4530746c01269b3795a25edad63efad9364b9f';state='local-uncommitted';files=$inventory}|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
    $files=@(Get-ChildItem -LiteralPath $package -Recurse -File|Where-Object FullName -NE (Join-Path $package 'release-manifest.json')|Sort-Object FullName|ForEach-Object {@{path=$_.FullName.Substring($package.Length+1).Replace('\','/');bytes=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}})
    $manifest=@{schemaVersion=3;applicationSource='bc4530746c01269b3795a25edad63efad9364b9f';operatorSource='owner-selected-internal-http-v1';dependencyArtifactSha256='de56c5684970bbe7a053318f532b81d1df562a55d5258e033e636cd11c06eef9';buildId=$id;createdUtc=[DateTimeOffset]::UtcNow.ToString('o');targetHost='DCAPP7';targetAddress='10.9.69.20';publicOrigin='http://10.9.69.20';basePath='';authMode='local';nodeVersion='24.19.0';postgresqlVersion='18.4';files=$files}
    [IO.File]::WriteAllText((Join-Path $package 'release-manifest.json'),($manifest|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
    $digest=(Get-FileHash -LiteralPath (Join-Path $package 'release-manifest.json') -Algorithm SHA256).Hash.ToLowerInvariant()
    $verified=Test-HttpManifest $package $digest;Assert-HttpDelta $previous $verified
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive=Join-Path $output 'package.zip'
    $stream=[IO.File]::Open($archive,[IO.FileMode]::CreateNew);$zip=[IO.Compression.ZipArchive]::new($stream,[IO.Compression.ZipArchiveMode]::Create,$false)
    try{foreach($file in Get-ChildItem -LiteralPath $package -Recurse -File){$name=$file.FullName.Substring($package.Length+1).Replace('\','/');[void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,$file.FullName,$name,[IO.Compression.CompressionLevel]::Fastest)}}finally{$zip.Dispose();$stream.Dispose()}
    $receipt=@{package=$package;archive=$archive;manifestSha256=$digest;archiveSha256=(Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant();buildId=$id;files=$files.Count;publicOrigin='http://10.9.69.20'}
    [IO.File]::WriteAllText((Join-Path $root '.local\http-release.json'),($receipt|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
    $receipt|ConvertTo-Json -Compress
} finally {Pop-Location}
