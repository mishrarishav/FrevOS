[CmdletBinding()]
param(
    [switch]$ConfirmSharedIisProxyChange
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$uatRoot = "D:\FrevOS-UAT"
$siteName = "tserver2.eeslindia.org"
$applicationName = "frevos"
$iisApplicationPath = "D:\Web Applications\tserver2.eeslindia.org\frevos"
$listenPort = 10000
$postgresPort = 5433
$serviceName = "FrevOS-UAT-PostgreSQL-18"
$taskName = "FrevOS-UAT-ControlPlane"
$deployAgentTaskName = "FrevOS-UAT-DeployAgent"
$publicOrigin = "https://tserver2.eeslindia.org"
$basePath = "/frevos"
$packageRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
$manifestFile = Join-Path $packageRoot "release-manifest.json"

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "Run this script from an elevated Administrator PowerShell window."
    }
}

function ConvertFrom-SecureValue([Security.SecureString]$Value) {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

function New-RandomSecret {
    $bytes = New-Object byte[] 32
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $generator.GetBytes($bytes)
        return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
    } finally {
        $generator.Dispose()
    }
}

function Write-Utf8NoBom([string]$Path, [string]$Value) {
    [IO.File]::WriteAllText($Path, $Value, [Text.UTF8Encoding]::new($false))
}

function Read-Utf8([string]$Path) {
    return [IO.File]::ReadAllText($Path, [Text.UTF8Encoding]::new($false))
}

function Set-ControlledAcl(
    [string]$Path,
    [switch]$AllowCurrentUserRead,
    [switch]$AllowLocalService,
    [switch]$AllowNetworkServiceRead,
    [switch]$AllowNetworkServiceModify
) {
    $acl = [Security.AccessControl.FileSecurity]::new()
    if ((Get-Item -LiteralPath $Path) -is [IO.DirectoryInfo]) {
        $acl = [Security.AccessControl.DirectorySecurity]::new()
    }
    $acl.SetAccessRuleProtection($true, $false)
    $inheritance = if ((Get-Item -LiteralPath $Path) -is [IO.DirectoryInfo]) {
        [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit
    } else {
        [Security.AccessControl.InheritanceFlags]::None
    }
    $propagation = [Security.AccessControl.PropagationFlags]::None
    foreach ($sid in @("S-1-5-18", "S-1-5-32-544")) {
        $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
            [Security.Principal.SecurityIdentifier]::new($sid),
            [Security.AccessControl.FileSystemRights]::FullControl,
            $inheritance,
            $propagation,
            [Security.AccessControl.AccessControlType]::Allow
        ))
    }
    if ($AllowCurrentUserRead) {
        $currentUserSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
        if ($null -eq $currentUserSid) { throw "The current installer identity has no Windows SID." }
        $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
            $currentUserSid,
            [Security.AccessControl.FileSystemRights]::Read,
            $inheritance,
            $propagation,
            [Security.AccessControl.AccessControlType]::Allow
        ))
    }
    if ($AllowLocalService) {
        $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
            [Security.Principal.SecurityIdentifier]::new("S-1-5-19"),
            [Security.AccessControl.FileSystemRights]::ReadAndExecute,
            $inheritance,
            $propagation,
            [Security.AccessControl.AccessControlType]::Allow
        ))
    }
    if ($AllowNetworkServiceModify) {
        $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
            [Security.Principal.SecurityIdentifier]::new("S-1-5-20"),
            [Security.AccessControl.FileSystemRights]::Modify,
            $inheritance,
            $propagation,
            [Security.AccessControl.AccessControlType]::Allow
        ))
    } elseif ($AllowNetworkServiceRead) {
        $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
            [Security.Principal.SecurityIdentifier]::new("S-1-5-20"),
            [Security.AccessControl.FileSystemRights]::ReadAndExecute,
            $inheritance,
            $propagation,
            [Security.AccessControl.AccessControlType]::Allow
        ))
    }
    Set-Acl -LiteralPath $Path -AclObject $acl
}

function Set-InstallerOwnedDirectory([string]$Path) {
    $item = Get-Item -LiteralPath $Path
    if ($item -isnot [IO.DirectoryInfo]) { throw "Installer-owned path must be a directory." }

    $currentUserSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    if ($null -eq $currentUserSid) { throw "The current installer identity has no Windows SID." }

    $ownerAcl = Get-Acl -LiteralPath $Path
    $ownerAcl.SetOwner($currentUserSid)
    Set-Acl -LiteralPath $Path -AclObject $ownerAcl

    $accessAcl = Get-Acl -LiteralPath $Path
    $accessAcl.SetAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
        $currentUserSid,
        [Security.AccessControl.FileSystemRights]::FullControl,
        [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit,
        [Security.AccessControl.PropagationFlags]::None,
        [Security.AccessControl.AccessControlType]::Allow
    ))
    Set-Acl -LiteralPath $Path -AclObject $accessAcl
}

function Test-ReleaseManifest {
    if (-not (Test-Path -LiteralPath $manifestFile -PathType Leaf)) {
        throw "release-manifest.json is missing."
    }
    $manifest = Read-Utf8 $manifestFile | ConvertFrom-Json
    if ($manifest.sourceSha -notmatch "^[a-f0-9]{40}$" -or $manifest.basePath -ne $basePath) {
        throw "Release identity or base path is invalid."
    }
    foreach ($file in $manifest.files) {
        $relativePath = ([string]$file.path).Replace("/", "\")
        $candidate = [IO.Path]::GetFullPath((Join-Path $packageRoot $relativePath))
        if (-not $candidate.StartsWith("$packageRoot\", [StringComparison]::OrdinalIgnoreCase)) {
            throw "Manifest contains a path outside the release root."
        }
        if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
            throw "Manifest file is missing: $($file.path)"
        }
        $actualHash = (Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actualHash -ne [string]$file.sha256) {
            throw "Checksum mismatch for $($file.path)."
        }
    }
    return $manifest
}

function Assert-FileHash([string]$Path, [string]$ExpectedSha256) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Pinned prerequisite is missing: $([IO.Path]::GetFileName($Path))"
    }
    $actualHash = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne $ExpectedSha256) {
        throw "Pinned prerequisite checksum mismatch: $([IO.Path]::GetFileName($Path))"
    }
}

function Test-InstalledRelease([string]$Path, $ReleaseManifest) {
    foreach ($file in $ReleaseManifest.files) {
        $relativePath = [string]$file.path
        if (-not ($relativePath.StartsWith("apps/") -or $relativePath.StartsWith("database/"))) {
            continue
        }
        $candidate = Join-Path $Path $relativePath.Replace("/", "\")
        if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { return $false }
        if ((Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash.ToLowerInvariant() -ne [string]$file.sha256) {
            return $false
        }
    }
    return $true
}

function Wait-ForLocalHealth {
    for ($attempt = 1; $attempt -le 30; $attempt++) {
        try {
            $response = Invoke-WebRequest -Uri "http://127.0.0.1:$listenPort$basePath/health" -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -eq 200) { return }
        } catch {
            if ($attempt -eq 30) { throw }
        }
        Start-Sleep -Seconds 2
    }
    throw "FrevOS did not become healthy on the loopback listener."
}

Assert-Administrator
if (-not $ConfirmSharedIisProxyChange) {
    throw "IIS ARR proxy is a shared server setting. Review impact, then pass -ConfirmSharedIisProxyChange."
}
if (-not (Test-Path -LiteralPath "$env:windir\System32\inetsrv\appcmd.exe" -PathType Leaf)) {
    throw "IIS administration tools are unavailable."
}
if (-not (Test-Path -LiteralPath "$env:windir\System32\inetsrv\rewrite.dll" -PathType Leaf)) {
    throw "IIS URL Rewrite is unavailable."
}
$arrModule = Join-Path $env:ProgramFiles "IIS\Application Request Routing\requestRouter.dll"
if (-not (Test-Path -LiteralPath $arrModule -PathType Leaf)) {
    throw "IIS ARR is unavailable. Run Install-ArrPrerequisite.ps1 under its separate restart confirmation first."
}
if ((Get-NetTCPConnection -State Listen -LocalPort $listenPort -ErrorAction SilentlyContinue) -and
    $null -eq (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue)) {
    throw "Loopback application port $listenPort is already in use."
}
if (Get-NetTCPConnection -State Listen -LocalPort $postgresPort -ErrorAction SilentlyContinue) {
    $existingPostgres = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
    if ($null -eq $existingPostgres) {
        throw "PostgreSQL port $postgresPort is already in use by an uncontrolled process."
    }
}

$manifest = Test-ReleaseManifest
$releaseSha = [string]$manifest.sourceSha
$releaseDirectory = Join-Path $uatRoot "releases\$releaseSha"
$stateDirectory = Join-Path $uatRoot "state"
$configDirectory = Join-Path $uatRoot "config"
$runtimeDirectory = Join-Path $uatRoot "runtime"
$binDirectory = Join-Path $uatRoot "bin"
$backupDirectory = Join-Path $uatRoot "backups"
$iisBackupDirectory = Join-Path $uatRoot "iis-backups"
$automationDirectory = Join-Path $uatRoot "automation"
$activeReleaseFile = Join-Path $stateDirectory "active-release.txt"
$runtimeConfigFile = Join-Path $configDirectory "runtime.json"
$operationsConfigFile = Join-Path $configDirectory "operations.json"
$previousRelease = if (Test-Path -LiteralPath $activeReleaseFile) {
    (Read-Utf8 $activeReleaseFile).Trim()
} else { $null }

foreach ($directory in @($uatRoot, $stateDirectory, $configDirectory, $runtimeDirectory, $binDirectory, $backupDirectory, $iisBackupDirectory, $automationDirectory, (Split-Path $releaseDirectory))) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
}

if (-not (Test-Path -LiteralPath $releaseDirectory)) {
    New-Item -ItemType Directory -Path $releaseDirectory | Out-Null
    foreach ($name in @("apps", "database")) {
        Copy-Item -LiteralPath (Join-Path $packageRoot $name) -Destination $releaseDirectory -Recurse
    }
    Copy-Item -LiteralPath $manifestFile -Destination $releaseDirectory
} elseif (-not (Test-InstalledRelease $releaseDirectory $manifest)) {
    throw "The existing immutable release directory does not match its source manifest."
}

$nodeArchive = Join-Path $packageRoot "prerequisites\node-v24.19.0-win-x64.zip"
$nodeHash = "57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73"
Assert-FileHash $nodeArchive $nodeHash
$nodeRoot = Join-Path $runtimeDirectory "node-v24.19.0-win-x64"
if (-not (Test-Path -LiteralPath (Join-Path $nodeRoot "node.exe") -PathType Leaf)) {
    Expand-Archive -LiteralPath $nodeArchive -DestinationPath $runtimeDirectory
}

$postgresArchive = Join-Path $packageRoot "prerequisites\postgresql-18.4-1-windows-x64-binaries.zip"
$postgresHash = "7effe34c0bf89027b3f171447d351cbc460f4566c8d0f643daec67f140787858"
Assert-FileHash $postgresArchive $postgresHash
$postgresRoot = Join-Path $runtimeDirectory "postgresql-18.4"
$postgresBin = Join-Path $postgresRoot "pgsql\bin"
if (-not (Test-Path -LiteralPath (Join-Path $postgresBin "postgres.exe") -PathType Leaf)) {
    New-Item -ItemType Directory -Path $postgresRoot -Force | Out-Null
    Expand-Archive -LiteralPath $postgresArchive -DestinationPath $postgresRoot
}

Copy-Item -LiteralPath (Join-Path $PSScriptRoot "Start-WindowsUat.ps1") -Destination $binDirectory -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "Invoke-WindowsUat.ps1") -Destination $binDirectory -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "Invoke-FrevOsUatDeployAgent.ps1") -Destination $binDirectory -Force

$dataDirectory = Join-Path $uatRoot "postgres-data"
$newDatabase = -not (Test-Path -LiteralPath (Join-Path $dataDirectory "PG_VERSION") -PathType Leaf)
if ($newDatabase -and ((Test-Path -LiteralPath $runtimeConfigFile) -or (Test-Path -LiteralPath $operationsConfigFile))) {
    throw "Configuration exists without a PostgreSQL data cluster. Stop for operator review."
}
if (-not $newDatabase -and ((-not (Test-Path -LiteralPath $runtimeConfigFile)) -or (-not (Test-Path -LiteralPath $operationsConfigFile)))) {
    throw "PostgreSQL data exists without both controlled configuration files. Stop for operator review."
}
if ($newDatabase -and (Test-Path -LiteralPath $dataDirectory -PathType Container) -and
    @(Get-ChildItem -LiteralPath $dataDirectory -Force).Count -gt 0) {
    throw "A partial PostgreSQL data directory exists without PG_VERSION. Stop for operator review."
}

if ($newDatabase) {
    $migratorPassword = New-RandomSecret
    $runtimePassword = New-RandomSecret
    $encodedMigratorPassword = [Uri]::EscapeDataString($migratorPassword)
    $encodedRuntimePassword = [Uri]::EscapeDataString($runtimePassword)
    $migrationDatabaseUrl = "postgresql://frevos_migrator:${encodedMigratorPassword}@127.0.0.1:$postgresPort/frevos"
    $databaseUrl = "postgresql://frevos_runtime:${encodedRuntimePassword}@127.0.0.1:$postgresPort/frevos"

    New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null
    Set-InstallerOwnedDirectory -Path $dataDirectory
    $passwordFile = Join-Path $configDirectory ("initdb-" + [guid]::NewGuid().ToString("N") + ".tmp")
    try {
        Write-Utf8NoBom $passwordFile $migratorPassword
        Set-ControlledAcl -Path $passwordFile -AllowCurrentUserRead
        & (Join-Path $postgresBin "initdb.exe") --pgdata $dataDirectory --username frevos_migrator `
            --encoding UTF8 --auth-host scram-sha-256 --auth-local scram-sha-256 --pwfile $passwordFile
        if ($LASTEXITCODE -ne 0) { throw "PostgreSQL initialization failed." }
    } finally {
        if (Test-Path -LiteralPath $passwordFile) { Remove-Item -LiteralPath $passwordFile -Force }
    }
    Add-Content -LiteralPath (Join-Path $dataDirectory "postgresql.conf") -Value @(
        "listen_addresses = '127.0.0.1'",
        "port = $postgresPort",
        "password_encryption = 'scram-sha-256'"
    )
    Set-ControlledAcl -Path $dataDirectory -AllowNetworkServiceModify
} else {
    if ((Get-Content -LiteralPath (Join-Path $dataDirectory "PG_VERSION") -Raw).Trim() -ne "18") {
        throw "Only the controlled PostgreSQL 18 data cluster is accepted."
    }
    $runtimeConfig = Read-Utf8 $runtimeConfigFile | ConvertFrom-Json
    $operationsConfig = Read-Utf8 $operationsConfigFile | ConvertFrom-Json
    $databaseUrl = [string]$runtimeConfig.DATABASE_URL
    $migrationDatabaseUrl = [string]$operationsConfig.MIGRATION_DATABASE_URL
    $migratorPassword = [Uri]::UnescapeDataString(([Uri]$migrationDatabaseUrl).UserInfo.Split(":", 2)[1])
    $runtimePassword = [Uri]::UnescapeDataString(([Uri]$databaseUrl).UserInfo.Split(":", 2)[1])
}

$trackGrnAgentToken = $null
if (Test-Path -LiteralPath $runtimeConfigFile -PathType Leaf) {
    $existingRuntimeConfig = Read-Utf8 $runtimeConfigFile | ConvertFrom-Json
    if ($null -ne $existingRuntimeConfig.PSObject.Properties["FREVOS_TRACKGRN_AGENT_TOKEN"]) {
        $trackGrnAgentToken = [string]$existingRuntimeConfig.FREVOS_TRACKGRN_AGENT_TOKEN
    }
}
if ([string]::IsNullOrWhiteSpace($trackGrnAgentToken)) {
    $secureTrackGrnAgentToken = Read-Host `
        "TrackGRN companion token (minimum 32 characters; use the same value in D:\TrackGRN\server.env)" `
        -AsSecureString
    $trackGrnAgentToken = ConvertFrom-SecureValue $secureTrackGrnAgentToken
    $secureTrackGrnAgentToken = $null
}
if ($trackGrnAgentToken.Length -lt 32 -or $trackGrnAgentToken.Length -gt 256) {
    throw "The TrackGRN companion token must contain between 32 and 256 characters."
}

$runtimeConfig = [ordered]@{
    DATABASE_URL = $databaseUrl
    FREVOS_PUBLIC_ORIGIN = $publicOrigin
    FREVOS_AUTH_MODE = "local"
    FREVOS_BASE_PATH = $basePath
    HOST = "127.0.0.1"
    PORT = "$listenPort"
    FREVOS_TRACKGRN_AGENT_TOKEN = $trackGrnAgentToken
}
$operationsConfig = [ordered]@{
    MIGRATION_DATABASE_URL = $migrationDatabaseUrl
}
Write-Utf8NoBom $runtimeConfigFile ($runtimeConfig | ConvertTo-Json)
Write-Utf8NoBom $operationsConfigFile ($operationsConfig | ConvertTo-Json)
Set-ControlledAcl -Path $runtimeConfigFile -AllowLocalService
Set-ControlledAcl -Path $operationsConfigFile
$trackGrnAgentToken = $null

$postgresService = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($null -eq $postgresService) {
    & (Join-Path $postgresBin "pg_ctl.exe") register -N $serviceName -D $dataDirectory -S auto -U "NT AUTHORITY\NetworkService"
    if ($LASTEXITCODE -ne 0) { throw "PostgreSQL service registration failed." }
}
Start-Service -Name $serviceName
$deadline = [DateTime]::UtcNow.AddSeconds(30)
do {
    & (Join-Path $postgresBin "pg_isready.exe") --host 127.0.0.1 --port $postgresPort --username frevos_migrator | Out-Null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 1
} while ([DateTime]::UtcNow -lt $deadline)
if ($LASTEXITCODE -ne 0) { throw "PostgreSQL did not become ready." }

$previousPgPassword = $env:PGPASSWORD
try {
    $env:PGPASSWORD = $migratorPassword
    $psql = Join-Path $postgresBin "psql.exe"
    $createdb = Join-Path $postgresBin "createdb.exe"
    $databaseExists = & $psql --host 127.0.0.1 --port $postgresPort --username frevos_migrator `
        --dbname postgres --tuples-only --no-align --command "SELECT 1 FROM pg_database WHERE datname = 'frevos'"
    if ($LASTEXITCODE -ne 0) { throw "Could not inspect the FrevOS database." }
    if ([string]::IsNullOrWhiteSpace([string]$databaseExists) -or ([string]$databaseExists).Trim() -ne "1") {
        & $createdb --host 127.0.0.1 --port $postgresPort --username frevos_migrator --owner frevos_migrator frevos
        if ($LASTEXITCODE -ne 0) { throw "Could not create the FrevOS database." }
    }
    $roleSql = @'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'frevos_runtime') THEN
    CREATE ROLE frevos_runtime LOGIN PASSWORD '__RUNTIME_PASSWORD__'
      NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;
'@.Replace("__RUNTIME_PASSWORD__", $runtimePassword)
    $roleFile = Join-Path $configDirectory ("role-" + [guid]::NewGuid().ToString("N") + ".tmp.sql")
    try {
        Write-Utf8NoBom $roleFile $roleSql
        Set-ControlledAcl -Path $roleFile -AllowCurrentUserRead
        & $psql --host 127.0.0.1 --port $postgresPort --username frevos_migrator --dbname frevos `
            --set ON_ERROR_STOP=on --file $roleFile
        if ($LASTEXITCODE -ne 0) { throw "Could not prepare the runtime database role." }
    } finally {
        if (Test-Path -LiteralPath $roleFile) { Remove-Item -LiteralPath $roleFile -Force }
    }

    $nodeExecutable = Join-Path $nodeRoot "node.exe"
    $previousMigrationUrl = $env:MIGRATION_DATABASE_URL
    $previousDatabaseUrl = $env:DATABASE_URL
    try {
        $env:MIGRATION_DATABASE_URL = $migrationDatabaseUrl
        $env:DATABASE_URL = $databaseUrl
        & $nodeExecutable (Join-Path $releaseDirectory "apps\control-plane\dist\migrate.js")
        if ($LASTEXITCODE -ne 0) { throw "FrevOS database migration failed." }
    } finally {
        $env:MIGRATION_DATABASE_URL = $previousMigrationUrl
        $env:DATABASE_URL = $previousDatabaseUrl
    }

    $localCredentialCount = & $psql --host 127.0.0.1 --port $postgresPort --username frevos_migrator `
        --dbname frevos --tuples-only --no-align --command "SELECT count(*) FROM frevos.local_credentials"
    if ($LASTEXITCODE -ne 0) { throw "Could not inspect local FrevOS credentials." }
    if ($localCredentialCount.Trim() -eq "0") {
        $localUsername = (Read-Host "Initial local admin username (letters, numbers, dot, underscore or hyphen)").Trim().ToLowerInvariant()
        $localDisplayName = (Read-Host "Initial local admin display name").Trim()
        $localPassword = ConvertFrom-SecureValue (Read-Host "Initial local admin password (minimum 8 characters)" -AsSecureString)
        $localPasswordConfirmation = ConvertFrom-SecureValue (Read-Host "Confirm initial local admin password" -AsSecureString)
        if ($localUsername -notmatch "^[a-z0-9][a-z0-9._-]{2,63}$") { throw "Invalid local admin username." }
        if ([string]::IsNullOrWhiteSpace($localDisplayName) -or $localDisplayName.Length -gt 120) { throw "Invalid local admin display name." }
        if ($localPassword.Length -lt 8 -or $localPassword.Length -gt 128 -or $localPassword.Contains("`n") -or $localPassword.Contains("`r")) {
            throw "Invalid local admin password."
        }
        if ($localPassword -cne $localPasswordConfirmation) { throw "Local admin passwords do not match." }

        $bootstrapVariableNames = @(
            "DATABASE_URL", "FREVOS_PUBLIC_ORIGIN", "FREVOS_AUTH_MODE", "FREVOS_BASE_PATH", "HOST", "PORT",
            "FREVOS_BOOTSTRAP_USERNAME", "FREVOS_BOOTSTRAP_DISPLAY_NAME", "FREVOS_BOOTSTRAP_PASSWORD"
        )
        $previousBootstrapEnvironment = @{}
        foreach ($name in $bootstrapVariableNames) {
            $previousBootstrapEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
        }
        try {
            foreach ($name in @("DATABASE_URL", "FREVOS_PUBLIC_ORIGIN", "FREVOS_AUTH_MODE", "FREVOS_BASE_PATH", "HOST", "PORT")) {
                [Environment]::SetEnvironmentVariable($name, [string]$runtimeConfig[$name], "Process")
            }
            [Environment]::SetEnvironmentVariable("FREVOS_BOOTSTRAP_USERNAME", $localUsername, "Process")
            [Environment]::SetEnvironmentVariable("FREVOS_BOOTSTRAP_DISPLAY_NAME", $localDisplayName, "Process")
            [Environment]::SetEnvironmentVariable("FREVOS_BOOTSTRAP_PASSWORD", $localPassword, "Process")
            & $nodeExecutable (Join-Path $releaseDirectory "apps\control-plane\dist\bootstrap-local-user.js")
            if ($LASTEXITCODE -ne 0) { throw "Initial local administrator bootstrap failed." }
        } finally {
            foreach ($name in $bootstrapVariableNames) {
                [Environment]::SetEnvironmentVariable($name, $previousBootstrapEnvironment[$name], "Process")
            }
            $localPassword = $null
            $localPasswordConfirmation = $null
        }
    }

    & $psql --host 127.0.0.1 --port $postgresPort --username frevos_migrator --dbname frevos `
        --set ON_ERROR_STOP=on --file (Join-Path $releaseDirectory "database\seed.sql")
    if ($LASTEXITCODE -ne 0) { throw "FrevOS personal workspace seed failed." }
} finally {
    $env:PGPASSWORD = $previousPgPassword
}

Import-Module WebAdministration
if (-not (Test-Path "IIS:\Sites\$siteName")) { throw "The controlled IIS site does not exist." }
$applicationHostConfig = Join-Path $env:windir "System32\inetsrv\config\applicationHost.config"
$iisBackup = Join-Path $iisBackupDirectory ("applicationHost-" + [DateTime]::UtcNow.ToString("yyyyMMddTHHmmssZ") + ".config")
Copy-Item -LiteralPath $applicationHostConfig -Destination $iisBackup

New-Item -ItemType Directory -Path $iisApplicationPath -Force | Out-Null
$webConfig = (Read-Utf8 (Join-Path $PSScriptRoot "web.config.template")).Replace("__PORT__", "$listenPort")
Write-Utf8NoBom (Join-Path $iisApplicationPath "web.config") $webConfig

$poolName = "FrevOS-UAT"
if (-not (Test-Path "IIS:\AppPools\$poolName")) { New-WebAppPool -Name $poolName | Out-Null }
Set-ItemProperty "IIS:\AppPools\$poolName" -Name managedRuntimeVersion -Value ""
Set-ItemProperty "IIS:\AppPools\$poolName" -Name processModel.identityType -Value 4
$existingApplication = Get-WebApplication -Site $siteName -Name $applicationName -ErrorAction SilentlyContinue
if ($null -eq $existingApplication) {
    New-WebApplication -Site $siteName -Name $applicationName -PhysicalPath $iisApplicationPath -ApplicationPool $poolName | Out-Null
} elseif ([IO.Path]::GetFullPath([string]$existingApplication.PhysicalPath) -ne [IO.Path]::GetFullPath($iisApplicationPath)) {
    throw "An uncontrolled IIS /frevos application already exists."
}

$appcmd = Join-Path $env:windir "System32\inetsrv\appcmd.exe"
& $appcmd set config /section:system.webServer/proxy /enabled:true /preserveHostHeader:true /reverseRewriteHostInResponseHeaders:false /commit:apphost | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Could not enable the reviewed IIS ARR proxy setting." }

Write-Utf8NoBom $activeReleaseFile $releaseDirectory
Set-ControlledAcl -Path $runtimeDirectory -AllowLocalService -AllowNetworkServiceRead
Set-ControlledAcl -Path $binDirectory -AllowLocalService
Set-ControlledAcl -Path $releaseDirectory -AllowLocalService
Set-ControlledAcl -Path $stateDirectory -AllowLocalService
Set-ControlledAcl -Path $activeReleaseFile -AllowLocalService
Set-ControlledAcl -Path $automationDirectory

$taskBackup = Join-Path $stateDirectory "previous-task.xml"
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($null -ne $existingTask) { Write-Utf8NoBom $taskBackup (Export-ScheduledTask -TaskName $taskName) }
$taskAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument (
    '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "{0}"' -f (Join-Path $binDirectory "Start-WindowsUat.ps1")
)
$taskTrigger = New-ScheduledTaskTrigger -AtStartup
$taskPrincipal = New-ScheduledTaskPrincipal -UserId "NT AUTHORITY\LOCAL SERVICE" -LogonType ServiceAccount -RunLevel Highest
$taskSettings = New-ScheduledTaskSettingsSet -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $taskTrigger -Principal $taskPrincipal -Settings $taskSettings -Force | Out-Null

$existingDeployAgentTask = Get-ScheduledTask -TaskName $deployAgentTaskName -ErrorAction SilentlyContinue
if ($null -eq $existingDeployAgentTask) {
    $deployAgentAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument (
        '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "{0}"' -f (Join-Path $binDirectory "Invoke-FrevOsUatDeployAgent.ps1")
    )
    $deployAgentTrigger = New-ScheduledTaskTrigger -AtStartup
    $deployAgentPrincipal = New-ScheduledTaskPrincipal -UserId "NT AUTHORITY\SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    $deployAgentSettings = New-ScheduledTaskSettingsSet -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
    Register-ScheduledTask -TaskName $deployAgentTaskName -Action $deployAgentAction -Trigger $deployAgentTrigger -Principal $deployAgentPrincipal -Settings $deployAgentSettings | Out-Null
    Start-ScheduledTask -TaskName $deployAgentTaskName
}

try {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Start-ScheduledTask -TaskName $taskName
    Wait-ForLocalHealth
    $iisStatus = $null
    try {
        $iisProbe = Invoke-WebRequest -Uri "http://127.0.0.1$basePath/health" `
            -Headers @{ Host = "tserver2.eeslindia.org" } -MaximumRedirection 0 `
            -UseBasicParsing -TimeoutSec 15
        $iisStatus = [int]$iisProbe.StatusCode
    } catch {
        if ($null -ne $_.Exception.Response) { $iisStatus = [int]$_.Exception.Response.StatusCode }
    }
    if ($iisStatus -notin @(200, 301, 302, 307, 308)) { throw "Local IIS application probe failed." }
} catch {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($null -ne $previousRelease -and (Test-Path -LiteralPath $previousRelease)) {
        Write-Utf8NoBom $activeReleaseFile $previousRelease
        Start-ScheduledTask -TaskName $taskName
    }
    throw
}

Write-Output "FrevOS Windows UAT deployed successfully."
Write-Output "Source SHA: $releaseSha"
Write-Output "IIS loopback probe returned HTTP $iisStatus."
Write-Output "External health to verify independently: $publicOrigin$basePath/health"
Write-Output "Application to verify independently: $publicOrigin$basePath/"
Write-Output "No migration credential was exposed to the running web process."
