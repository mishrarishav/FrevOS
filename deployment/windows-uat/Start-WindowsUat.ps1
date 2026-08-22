[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$uatRoot = "D:\FrevOS-UAT"
$activeReleaseFile = Join-Path $uatRoot "state\active-release.txt"
$runtimeConfigFile = Join-Path $uatRoot "config\runtime.json"
$nodeExecutable = Join-Path $uatRoot "runtime\node-v24.19.0-win-x64\node.exe"

function Read-Utf8([string]$Path) {
    return [IO.File]::ReadAllText($Path, [Text.UTF8Encoding]::new($false))
}

if (-not (Test-Path -LiteralPath $activeReleaseFile -PathType Leaf)) {
    throw "The active FrevOS release pointer is missing."
}
if (-not (Test-Path -LiteralPath $runtimeConfigFile -PathType Leaf)) {
    throw "The FrevOS runtime configuration is missing."
}
if (-not (Test-Path -LiteralPath $nodeExecutable -PathType Leaf)) {
    throw "The pinned Node.js runtime is missing."
}

$releaseDirectory = (Read-Utf8 $activeReleaseFile).Trim()
$expectedReleaseRoot = [IO.Path]::GetFullPath((Join-Path $uatRoot "releases"))
$resolvedRelease = [IO.Path]::GetFullPath($releaseDirectory)
if (-not $resolvedRelease.StartsWith("$expectedReleaseRoot\", [StringComparison]::OrdinalIgnoreCase)) {
    throw "The active release pointer is outside the controlled release root."
}

$entryPoint = Join-Path $resolvedRelease "apps\control-plane\dist\main.js"
if (-not (Test-Path -LiteralPath $entryPoint -PathType Leaf)) {
    throw "The active FrevOS entry point is missing."
}

$runtime = Read-Utf8 $runtimeConfigFile | ConvertFrom-Json
[Environment]::SetEnvironmentVariable("MIGRATION_DATABASE_URL", $null, "Process")
[Environment]::SetEnvironmentVariable("PGPASSWORD", $null, "Process")
$allowedVariables = @(
    "DATABASE_URL",
    "FREVOS_PUBLIC_ORIGIN",
    "FREVOS_AUTH_MODE",
    "FREVOS_BASE_PATH",
    "HOST",
    "PORT",
    "FREVOS_TRACKGRN_AGENT_TOKEN"
)
$configuredVariables = @($runtime.PSObject.Properties.Name)
if (($configuredVariables | Where-Object { $_ -notin $allowedVariables }).Count -ne 0 -or
    ($allowedVariables | Where-Object { $_ -notin $configuredVariables }).Count -ne 0) {
    throw "The FrevOS runtime configuration does not match the exact web-process allowlist."
}
foreach ($name in $allowedVariables) {
    [Environment]::SetEnvironmentVariable($name, [string]$runtime.$name, "Process")
}

& $nodeExecutable $entryPoint
exit $LASTEXITCODE
