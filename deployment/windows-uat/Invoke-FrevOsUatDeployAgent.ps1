[CmdletBinding()]
param([switch]$Once)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$uatRoot = "D:\FrevOS-UAT"
$automationRoot = Join-Path $uatRoot "automation"
$inbox = Join-Path $automationRoot "inbox"
$outbox = Join-Path $automationRoot "outbox"
$processed = Join-Path $automationRoot "processed"
$failed = Join-Path $automationRoot "failed"
$workRoot = Join-Path $automationRoot "work"
$logRoot = Join-Path $automationRoot "logs"
$packages = Join-Path $automationRoot "packages"

function Write-AtomicJson([string]$Path, [object]$Value) {
    $partial = "$Path.partial"
    [IO.File]::WriteAllText($partial, ($Value | ConvertTo-Json -Depth 8 -Compress), [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $partial -Destination $Path -Force
}

function Assert-ControlledPath([string]$Path, [string]$Parent) {
    $resolved = [IO.Path]::GetFullPath($Path)
    $resolvedParent = [IO.Path]::GetFullPath($Parent).TrimEnd("\")
    if (-not $resolved.StartsWith("$resolvedParent\", [StringComparison]::OrdinalIgnoreCase)) {
        throw "work-path-invalid"
    }
}

function Assert-SafeArchive([string]$Archive) {
    $entries = @(& tar.exe -tf $Archive 2>$null)
    if ($LASTEXITCODE -ne 0 -or $entries.Count -eq 0 -or $entries.Count -gt 100000) {
        throw "archive-invalid"
    }
    foreach ($entry in $entries) {
        $value = ([string]$entry).Replace("\", "/")
        if ([string]::IsNullOrWhiteSpace($value) -or $value.StartsWith("/") -or
            $value -match "(^|/)\.\.(/|$)" -or $value.Contains(":")) {
            throw "archive-path-invalid"
        }
    }
}

function Process-Request([IO.FileInfo]$RequestFile) {
    $request = Get-Content -LiteralPath $RequestFile.FullName -Raw | ConvertFrom-Json
    $operationId = [string]$request.operationId
    $sourceSha = [string]$request.sourceSha
    $archiveFile = [string]$request.archiveFile
    $archiveSha256 = [string]$request.archiveSha256
    if ([int]$request.schemaVersion -ne 1 -or
        $operationId -cnotmatch "^op_[a-f0-9]{48}$" -or
        $sourceSha -cnotmatch "^[a-f0-9]{40}$" -or
        $archiveSha256 -cnotmatch "^[a-f0-9]{64}$" -or
        $archiveFile -cne "frevos-windows-uat-$sourceSha.zip") {
        throw "request-invalid"
    }
    $responsePath = Join-Path $outbox "$operationId.json"
    if (Test-Path -LiteralPath $responsePath -PathType Leaf) {
        Move-Item -LiteralPath $RequestFile.FullName -Destination (Join-Path $processed $RequestFile.Name) -Force
        return
    }
    $archivePath = Join-Path $inbox $archiveFile
    if (-not (Test-Path -LiteralPath $archivePath -PathType Leaf)) { throw "archive-missing" }
    $actualHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -cne $archiveSha256) { throw "archive-hash-mismatch" }
    Assert-SafeArchive $archivePath
    $workPath = Join-Path $workRoot $operationId
    Assert-ControlledPath $workPath $workRoot
    if (Test-Path -LiteralPath $workPath) { throw "work-path-conflict" }
    New-Item -ItemType Directory -Path $workPath | Out-Null
    & tar.exe -xf $archivePath -C $workPath
    if ($LASTEXITCODE -ne 0) { throw "archive-extract-failed" }
    $releaseManifestPath = Join-Path $workPath "release-manifest.json"
    if (-not (Test-Path -LiteralPath $releaseManifestPath -PathType Leaf)) { throw "release-manifest-missing" }
    $releaseManifest = Get-Content -LiteralPath $releaseManifestPath -Raw | ConvertFrom-Json
    if ([string]$releaseManifest.sourceSha -cne $sourceSha) { throw "release-source-mismatch" }
    $installer = Join-Path $workPath "deployment\windows-uat\Install-WindowsUat.ps1"
    if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) { throw "release-installer-missing" }
    $logPath = Join-Path $logRoot "$operationId.log"
    $previous = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        $output = @(& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass `
            -File $installer -ConfirmSharedIisProxyChange 2>&1)
        $exitCode = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previous }
    @($output | Select-Object -Last 300) | Set-Content -LiteralPath $logPath -Encoding UTF8
    if ($exitCode -ne 0) { throw "installer-failed" }
    $health = Invoke-WebRequest -Uri "http://127.0.0.1/frevos/health" `
        -Headers @{ Host = "tserver2.eeslindia.org" } -MaximumRedirection 0 `
        -UseBasicParsing -TimeoutSec 30
    if ([int]$health.StatusCode -ne 200) { throw "local-health-failed" }
    $releasePath = Join-Path $uatRoot "releases\$sourceSha"
    Write-AtomicJson $responsePath ([ordered]@{
        schemaVersion = 1
        operationId = $operationId
        status = "succeeded"
        sourceSha = $sourceSha
        archiveSha256 = $archiveSha256
        releasePath = $releasePath
        healthStatus = 200
        completedAt = [DateTime]::UtcNow.ToString("o")
    })
    Move-Item -LiteralPath $RequestFile.FullName -Destination (Join-Path $processed $RequestFile.Name) -Force
    Move-Item -LiteralPath $archivePath -Destination (Join-Path $packages $archiveFile) -Force
    Remove-Item -LiteralPath $workPath -Recurse -Force
}

foreach ($directory in @($inbox, $outbox, $processed, $failed, $workRoot, $logRoot, $packages)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
}
$mutex = New-Object Threading.Mutex($false, "Global\FrevOS-UAT-DeployAgent")
$ownsMutex = $false
try { $ownsMutex = $mutex.WaitOne(0) }
catch [Threading.AbandonedMutexException] { $ownsMutex = $true }
if (-not $ownsMutex) { $mutex.Dispose(); exit 0 }
try {
    do {
        $request = Get-ChildItem -LiteralPath $inbox -Filter "op_*.json" -File |
            Sort-Object CreationTimeUtc, Name | Select-Object -First 1
        if ($null -eq $request) {
            if (-not $Once) { Start-Sleep -Seconds 5 }
            continue
        }
        try { Process-Request $request }
        catch {
            $operationId = [IO.Path]::GetFileNameWithoutExtension($request.Name)
            if ($operationId -notmatch "^op_[a-f0-9]{48}$") { $operationId = "op_invalid" }
            $sourceSha = "unknown"
            try {
                $candidate = Get-Content -LiteralPath $request.FullName -Raw | ConvertFrom-Json
                if ([string]$candidate.sourceSha -match "^[a-f0-9]{40}$") { $sourceSha = [string]$candidate.sourceSha }
            } catch { }
            Write-AtomicJson (Join-Path $outbox "$operationId.json") ([ordered]@{
                schemaVersion = 1
                operationId = $operationId
                status = "failed"
                sourceSha = $sourceSha
                errorCode = "server-deploy-failed"
                completedAt = [DateTime]::UtcNow.ToString("o")
            })
            Move-Item -LiteralPath $request.FullName -Destination (Join-Path $failed $request.Name) -Force
        }
    } while (-not $Once)
} finally {
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
