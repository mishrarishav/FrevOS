[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateSet("Status", "Backup", "RestoreCheck", "Rollback")]
    [string]$Action,
    [string]$ReleaseSha,
    [switch]$ConfirmIsolatedRestoreCheck
)

$ErrorActionPreference = "Stop"
$uatRoot = "D:\FrevOS-UAT"
$taskName = "FrevOS-UAT-ControlPlane"
$serviceName = "FrevOS-UAT-PostgreSQL-18"
$activeReleaseFile = Join-Path $uatRoot "state\active-release.txt"
$operationsConfigFile = Join-Path $uatRoot "config\operations.json"
$postgresBin = Join-Path $uatRoot "runtime\postgresql-18.4\pgsql\bin"
$backupDirectory = Join-Path $uatRoot "backups"

function Write-Utf8NoBom([string]$Path, [string]$Value) {
    [IO.File]::WriteAllText($Path, $Value, [Text.UTF8Encoding]::new($false))
}

function Get-OperationsConfig {
    if (-not (Test-Path -LiteralPath $operationsConfigFile -PathType Leaf)) {
        throw "The FrevOS operations configuration is missing."
    }
    return Get-Content -LiteralPath $operationsConfigFile -Raw | ConvertFrom-Json
}

function Invoke-WithDatabasePassword([scriptblock]$Operation) {
    $config = Get-OperationsConfig
    $databaseUrl = [Uri]$config.MIGRATION_DATABASE_URL
    $previousPassword = $env:PGPASSWORD
    try {
        $env:PGPASSWORD = [Uri]::UnescapeDataString($databaseUrl.UserInfo.Split(":", 2)[1])
        & $Operation $databaseUrl
        if ($LASTEXITCODE -ne 0) {
            throw "PostgreSQL command failed with exit code $LASTEXITCODE."
        }
    } finally {
        $env:PGPASSWORD = $previousPassword
    }
}

switch ($Action) {
    "Status" {
        $service = Get-Service -Name $serviceName -ErrorAction Stop
        $task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
        $activeRelease = (Get-Content -LiteralPath $activeReleaseFile -Raw).Trim()
        $localHealth = Invoke-WebRequest -Uri "http://127.0.0.1:10000/frevos/health" -UseBasicParsing -TimeoutSec 15
        [pscustomobject]@{
            ActiveRelease = $activeRelease
            PostgreSQL = $service.Status
            ControlPlaneTask = $task.State
            LocalHealthStatus = $localHealth.StatusCode
        }
    }
    "Backup" {
        New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
        $stamp = [DateTime]::UtcNow.ToString("yyyyMMddTHHmmssZ")
        $target = Join-Path $backupDirectory "frevos-$stamp.dump"
        $partial = "$target.partial"
        if ((Test-Path -LiteralPath $target) -or (Test-Path -LiteralPath $partial)) {
            throw "Backup target already exists; refusing to overwrite."
        }
        try {
            Invoke-WithDatabasePassword {
                param($databaseUrl)
                & (Join-Path $postgresBin "pg_dump.exe") `
                    --host 127.0.0.1 --port 5433 --username frevos_migrator `
                    --dbname frevos --format custom --file $partial
                if ($LASTEXITCODE -ne 0) { return }
                & (Join-Path $postgresBin "pg_restore.exe") --list $partial | Out-Null
            }
            Move-Item -LiteralPath $partial -Destination $target
            Write-Output "Validated logical backup created: $([IO.Path]::GetFileName($target))"
        } finally {
            if (Test-Path -LiteralPath $partial) {
                Remove-Item -LiteralPath $partial -Force
            }
        }
    }
    "RestoreCheck" {
        if (-not $ConfirmIsolatedRestoreCheck) {
            throw "Pass -ConfirmIsolatedRestoreCheck for the fixed isolated restore database."
        }
        $source = Get-ChildItem -LiteralPath $backupDirectory -Filter "frevos-*.dump" -File |
            Sort-Object Name | Select-Object -Last 1
        if ($null -eq $source) {
            throw "No validated logical backup is available."
        }
        Invoke-WithDatabasePassword {
            param($databaseUrl)
            $dropDb = Join-Path $postgresBin "dropdb.exe"
            $createDb = Join-Path $postgresBin "createdb.exe"
            $restore = Join-Path $postgresBin "pg_restore.exe"
            $psql = Join-Path $postgresBin "psql.exe"
            try {
                & $dropDb --host 127.0.0.1 --port 5433 --username frevos_migrator --if-exists --force frevos_restore_check | Out-Null
                & $createDb --host 127.0.0.1 --port 5433 --username frevos_migrator frevos_restore_check
                if ($LASTEXITCODE -ne 0) { return }
                & $restore --host 127.0.0.1 --port 5433 --username frevos_migrator `
                    --dbname frevos_restore_check --exit-on-error $source.FullName | Out-Null
                if ($LASTEXITCODE -ne 0) { return }
                $validation = & $psql --host 127.0.0.1 --port 5433 --username frevos_migrator `
                    --dbname frevos_restore_check --tuples-only --no-align `
                    --command "SELECT CASE WHEN to_regclass('frevos.workspaces') IS NOT NULL AND to_regclass('public.frevos_schema_migrations') IS NOT NULL THEN 'ok' ELSE 'invalid' END"
                if ($LASTEXITCODE -ne 0 -or $validation.Trim() -ne "ok") {
                    throw "Isolated restore validation failed."
                }
            } finally {
                & $dropDb --host 127.0.0.1 --port 5433 --username frevos_migrator --if-exists --force frevos_restore_check | Out-Null
            }
        }
        Write-Output "Isolated restore check passed for $($source.Name); temporary database removed."
    }
    "Rollback" {
        if ($ReleaseSha -notmatch "^[a-f0-9]{40}$") {
            throw "Rollback requires an exact 40-character release SHA."
        }
        $target = [IO.Path]::GetFullPath((Join-Path $uatRoot "releases\$ReleaseSha"))
        if (-not (Test-Path -LiteralPath (Join-Path $target "release-manifest.json") -PathType Leaf)) {
            throw "The requested controlled release is unavailable."
        }
        Write-Utf8NoBom $activeReleaseFile $target
        Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        Start-ScheduledTask -TaskName $taskName
        Start-Sleep -Seconds 3
        $health = Invoke-WebRequest -Uri "http://127.0.0.1:10000/frevos/health" -UseBasicParsing -TimeoutSec 15
        if ($health.StatusCode -ne 200) {
            throw "Rollback release did not pass its local health check."
        }
        Write-Output "Rolled back application files to $ReleaseSha. Database state was not changed."
    }
}
