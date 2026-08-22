[CmdletBinding()]
param(
    [string]$OutputDirectory = "",
    [string]$PrerequisiteCache = ""
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path $repositoryRoot "artifacts\windows-uat"
}
if ([string]::IsNullOrWhiteSpace($PrerequisiteCache)) {
    $PrerequisiteCache = Join-Path $repositoryRoot ".local\windows-uat-cache"
}
$temporaryRoot = Join-Path $repositoryRoot ".local\windows-uat-build"
$basePath = "/frevos"

$prerequisites = @(
    [pscustomobject]@{
        Name = "node-v24.19.0-win-x64.zip"
        Uri = "https://nodejs.org/download/release/v24.19.0/node-v24.19.0-win-x64.zip"
        Sha256 = "57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73"
        License = "Node.js MIT and third-party notices"
    },
    [pscustomobject]@{
        Name = "postgresql-18.4-1-windows-x64-binaries.zip"
        Uri = "https://get.enterprisedb.com/postgresql/postgresql-18.4-1-windows-x64-binaries.zip"
        Sha256 = "7effe34c0bf89027b3f171447d351cbc460f4566c8d0f643daec67f140787858"
        License = "PostgreSQL License"
    },
    [pscustomobject]@{
        Name = "requestRouter_amd64.msi"
        Uri = "https://download.microsoft.com/download/e/9/8/e9849d6a-020e-47e4-9fd0-a023e99b54eb/requestRouter_amd64.msi"
        Sha256 = "fb61fdb7101795a34d5129cb37eee43ab675c7ed76ba3a3b23b039d8c90c2a4b"
        License = "Microsoft Application Request Routing license; non-open-source shared IIS prerequisite"
    }
)

function Invoke-Checked([string]$FilePath, [string[]]$Arguments) {
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$FilePath failed with exit code $LASTEXITCODE."
    }
}

function Assert-ControlledPath([string]$Path, [string]$ExpectedParent) {
    $resolved = [IO.Path]::GetFullPath($Path)
    $parent = [IO.Path]::GetFullPath($ExpectedParent)
    if (-not $resolved.StartsWith("$parent\", [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to modify a path outside $parent."
    }
}

function Get-RelativePath([string]$BaseDirectory, [string]$TargetPath) {
    $baseUri = [Uri]((([IO.Path]::GetFullPath($BaseDirectory)).TrimEnd("\") + "\"))
    $targetUri = [Uri][IO.Path]::GetFullPath($TargetPath)
    return [Uri]::UnescapeDataString($baseUri.MakeRelativeUri($targetUri).ToString()).Replace("/", "\")
}

function Write-Utf8NoBom([string]$Path, [string]$Value) {
    [IO.File]::WriteAllText($Path, $Value, [Text.UTF8Encoding]::new($false))
}

Push-Location $repositoryRoot
try {
    Invoke-Checked "git.exe" @("diff", "--quiet")
    Invoke-Checked "git.exe" @("diff", "--cached", "--quiet")
    if ((git.exe status --porcelain --untracked-files=all).Count -ne 0) {
        throw "Release builds require a clean checkout with no untracked files."
    }
    $sourceSha = (git.exe rev-parse --verify HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or $sourceSha -notmatch "^[a-f0-9]{40}$") {
        throw "Could not resolve the exact source SHA."
    }
    $sourceTimestamp = (git.exe show -s --format=%cI $sourceSha).Trim()
    if ($LASTEXITCODE -ne 0) { throw "Could not resolve the source timestamp." }

    $previousBasePath = $env:FREVOS_BASE_PATH
    $previousUiAuthMode = $env:VITE_FREVOS_AUTH_MODE
    try {
        $env:FREVOS_BASE_PATH = $basePath
        $env:VITE_FREVOS_AUTH_MODE = "local"
        Invoke-Checked "pnpm.cmd" @("install", "--frozen-lockfile")
        Invoke-Checked "pnpm.cmd" @("run", "build")
    } finally {
        $env:FREVOS_BASE_PATH = $previousBasePath
        $env:VITE_FREVOS_AUTH_MODE = $previousUiAuthMode
    }

    Assert-ControlledPath $temporaryRoot (Join-Path $repositoryRoot ".local")
    if (Test-Path -LiteralPath $temporaryRoot) {
        Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
    }
    $packageRoot = Join-Path $temporaryRoot "package"
    $controlPlaneTarget = Join-Path $packageRoot "apps\control-plane"
    foreach ($directory in @(
        $controlPlaneTarget,
        (Join-Path $packageRoot "apps\control-center"),
        (Join-Path $packageRoot "database"),
        (Join-Path $packageRoot "deployment\windows-uat"),
        (Join-Path $packageRoot "deployment\windows-agent"),
        (Join-Path $packageRoot "prerequisites"),
        $PrerequisiteCache,
        $OutputDirectory
    )) {
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }

    Invoke-Checked "pnpm.cmd" @(
        "--config.node-linker=hoisted",
        "--filter",
        "@frevos/control-plane",
        "deploy",
        "--prod",
        $controlPlaneTarget
    )
    foreach ($unneeded in @("coverage", "src", "test", "README.md", "tsconfig.build.json", "tsconfig.json", "vitest.config.ts")) {
        $target = Join-Path $controlPlaneTarget $unneeded
        if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
    }
    Get-ChildItem -LiteralPath (Join-Path $controlPlaneTarget "dist") -Recurse -File |
        Where-Object { $_.Name.EndsWith(".map") -or $_.Name.EndsWith(".d.ts") } |
        Remove-Item -Force
    foreach ($entryPoint in @("main.js", "migrate.js", "bootstrap-local-user.js", "server.js")) {
        if (-not (Test-Path -LiteralPath (Join-Path $controlPlaneTarget "dist\$entryPoint") -PathType Leaf)) {
            throw "Compiled control-plane entry point is missing after release pruning: $entryPoint"
        }
    }

    Copy-Item -LiteralPath (Join-Path $repositoryRoot "apps\control-center\dist") `
        -Destination (Join-Path $packageRoot "apps\control-center") -Recurse
    Copy-Item -LiteralPath (Join-Path $repositoryRoot "deployment\windows-uat\seed.sql") `
        -Destination (Join-Path $packageRoot "database\seed.sql")
    Copy-Item -Path (Join-Path $repositoryRoot "deployment\windows-uat\*.ps1") `
        -Destination (Join-Path $packageRoot "deployment\windows-uat")
    Copy-Item -LiteralPath (Join-Path $repositoryRoot "deployment\windows-uat\web.config.template") `
        -Destination (Join-Path $packageRoot "deployment\windows-uat")
    Copy-Item -Path (Join-Path $repositoryRoot "deployment\windows-agent\*.ps1") `
        -Destination (Join-Path $packageRoot "deployment\windows-agent")
    Copy-Item -LiteralPath (Join-Path $repositoryRoot "deployment\windows-agent\README.md") `
        -Destination (Join-Path $packageRoot "deployment\windows-agent")

    foreach ($prerequisite in $prerequisites) {
        $cachedFile = Join-Path $PrerequisiteCache $prerequisite.Name
        if (-not (Test-Path -LiteralPath $cachedFile -PathType Leaf)) {
            Invoke-WebRequest -Uri $prerequisite.Uri -OutFile $cachedFile -UseBasicParsing
        }
        $actualHash = (Get-FileHash -LiteralPath $cachedFile -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actualHash -ne $prerequisite.Sha256) {
            throw "Pinned prerequisite checksum mismatch: $($prerequisite.Name)"
        }
        Copy-Item -LiteralPath $cachedFile -Destination (Join-Path $packageRoot "prerequisites")
    }

    $files = Get-ChildItem -LiteralPath $packageRoot -Recurse -File |
        Sort-Object FullName |
        ForEach-Object {
            [ordered]@{
                path = (Get-RelativePath $packageRoot $_.FullName).Replace("\", "/")
                sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
                bytes = $_.Length
            }
        }
    $manifest = [ordered]@{
        schemaVersion = 1
        sourceSha = $sourceSha
        sourceTimestamp = $sourceTimestamp
        basePath = $basePath
        publicOrigin = "https://tserver2.eeslindia.org"
        nodeVersion = "24.19.0"
        postgresqlVersion = "18.4"
        arrVersion = "3.0.5311"
        prerequisites = $prerequisites
        files = $files
    }
    Write-Utf8NoBom (Join-Path $packageRoot "release-manifest.json") ($manifest | ConvertTo-Json -Depth 8)

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = Join-Path $OutputDirectory "frevos-windows-uat-$sourceSha.zip"
    if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
    [IO.Compression.ZipFile]::CreateFromDirectory(
        $packageRoot,
        $archive,
        [IO.Compression.CompressionLevel]::Fastest,
        $false
    )
    $archiveHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    Write-Output "Release: $archive"
    Write-Output "Source SHA: $sourceSha"
    Write-Output "Archive SHA-256: $archiveHash"
} finally {
    Pop-Location
}
