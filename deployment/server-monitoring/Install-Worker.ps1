param(
    [Parameter(Mandatory=$true)][ValidateSet('Install','Check')][string]$Action,
    [Parameter(Mandatory=$true)][string]$ProtectedRoot,
    [Parameter(Mandatory=$true)][string]$QueueRoot,
    [Parameter(Mandatory=$true)][ValidatePattern('^ws_[A-Za-z0-9][A-Za-z0-9_-]{0,119}$')][string]$WorkspaceId,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$RegistrySha256,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ManifestSha256,
    [ValidatePattern('^S-1-5-(?:19|20|80-[0-9-]+)$')][string]$AppIdentitySid = 'S-1-5-19'
)
. (Join-Path $PSScriptRoot 'Common.ps1')
Assert-MonitorSystem
$source = Assert-MonitorNoReparse $PSScriptRoot
$ProtectedRoot = Assert-MonitorNoReparse $ProtectedRoot
$QueueRoot = Assert-MonitorNoReparse $QueueRoot
if ($ProtectedRoot -eq $QueueRoot -or $QueueRoot.StartsWith($ProtectedRoot.TrimEnd('\') + '\',[StringComparison]::OrdinalIgnoreCase) -or $ProtectedRoot.StartsWith($QueueRoot.TrimEnd('\') + '\',[StringComparison]::OrdinalIgnoreCase)) { throw 'monitor-private-queue-separation-required' }
$manifestPath = Join-Path $source 'manifest.v1.json'
if ((Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ManifestSha256) { throw 'monitor-manifest-hash-mismatch' }
$manifest = Read-MonitorJson $manifestPath 16384
Assert-MonitorShape $manifest @('version','files')
$expectedFiles = @('Common.ps1','Collector.ps1','Worker.ps1','Protect-Credential.ps1','Install-Worker.ps1')
if ($manifest.version -ne 1 -or @($manifest.files).Count -ne $expectedFiles.Count) { throw 'monitor-invalid-manifest' }
foreach ($item in $manifest.files) {
    Assert-MonitorShape $item @('name','sha256')
    if ($item.name -cnotin $expectedFiles -or $item.sha256 -notmatch '^[a-f0-9]{64}$' -or (Get-FileHash -LiteralPath (Join-Path $source $item.name) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $item.sha256) { throw 'monitor-program-hash-mismatch' }
}
if (@($manifest.files.name | Select-Object -Unique).Count -ne $expectedFiles.Count) { throw 'monitor-invalid-manifest' }
$registryPath = Join-Path $ProtectedRoot 'registry.v1.json'
if ((Get-FileHash -LiteralPath $registryPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $RegistrySha256) { throw 'monitor-registry-hash-mismatch' }
$registry = Read-MonitorJson $registryPath
Assert-MonitorShape $registry @('version','workspaceId','targets')
if ($registry.version -ne 1 -or $registry.workspaceId -cne $WorkspaceId -or @($registry.targets).Count -gt 100) { throw 'monitor-invalid-registry' }
foreach ($target in $registry.targets) { Assert-MonitorTarget $target $WorkspaceId }
$programRoot = Join-Path $ProtectedRoot 'program'
$workspaceRoot = Join-Path $QueueRoot $WorkspaceId
$taskName = 'DevSetu-ServerMonitoring-' + $WorkspaceId
$powerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$workerPath = Join-Path $programRoot 'Worker.ps1'
foreach ($argument in @($ProtectedRoot,$QueueRoot,$workerPath)) { if ($argument.Contains('"') -or $argument.Contains("`r") -or $argument.Contains("`n")) { throw 'monitor-invalid-task-path' } }
$arguments = '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $workerPath + '" -ProtectedRoot "' + $ProtectedRoot + '" -QueueRoot "' + $QueueRoot + '" -RegistrySha256 ' + $RegistrySha256 + ' -AppIdentitySid ' + $AppIdentitySid
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($null -ne $existing) {
    if ($existing.Principal.UserId -notin @('SYSTEM','S-1-5-18') -or @($existing.Actions).Count -ne 1 -or $existing.Actions[0].Execute -ine $powerShell -or $existing.Actions[0].Arguments -cne $arguments) { throw 'monitor-task-collision-review-required' }
}
if ($Action -eq 'Install') {
    Set-MonitorDirectoryAcl $ProtectedRoot
    Set-MonitorDirectoryAcl $programRoot
    Set-MonitorDirectoryAcl (Join-Path $ProtectedRoot 'credentials')
    Set-MonitorDirectoryAcl (Join-Path $ProtectedRoot 'incoming')
    Set-MonitorDirectoryAcl (Join-Path $ProtectedRoot 'claims')
    Set-MonitorDirectoryAcl $QueueRoot $AppIdentitySid
    Set-MonitorDirectoryAcl $workspaceRoot $AppIdentitySid
    Set-MonitorDirectoryAcl (Join-Path $workspaceRoot 'requests') $AppIdentitySid 'Modify'
    Set-MonitorDirectoryAcl (Join-Path $workspaceRoot 'results') $AppIdentitySid
    foreach ($item in $manifest.files) {
        $destination = Join-Path $programRoot $item.name
        $null = Assert-MonitorNoReparse $destination
        if ((Test-Path -LiteralPath $destination) -and (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant() -cne $item.sha256) { throw 'monitor-installed-program-change-review-required' }
        if (-not (Test-Path -LiteralPath $destination)) { [IO.File]::Copy((Join-Path $source $item.name),$destination,$false) }
    }
    if ($null -eq $existing) {
        $taskAction = New-ScheduledTaskAction -Execute $powerShell -Argument $arguments -WorkingDirectory $programRoot
        $trigger = New-ScheduledTaskTrigger -AtStartup
        $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
        $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable
        $null = Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $trigger -Principal $principal -Settings $settings
    }
    if ((Get-ScheduledTask -TaskName $taskName).State -ne 'Running') { Start-ScheduledTask -TaskName $taskName }
}
foreach ($directory in @($ProtectedRoot,$programRoot,(Join-Path $ProtectedRoot 'credentials'),(Join-Path $ProtectedRoot 'claims'))) { Assert-MonitorPrivateAcl $directory }
Assert-MonitorQueueAcl $QueueRoot $AppIdentitySid $false
Assert-MonitorQueueAcl $workspaceRoot $AppIdentitySid $false
Assert-MonitorQueueAcl (Join-Path $workspaceRoot 'results') $AppIdentitySid $false
Assert-MonitorQueueAcl (Join-Path $workspaceRoot 'requests') $AppIdentitySid $true
foreach ($item in $manifest.files) { if ((Get-FileHash -LiteralPath (Join-Path $programRoot $item.name) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $item.sha256) { throw 'monitor-installed-program-hash-mismatch' } }
$heartbeatPath = Join-Path (Join-Path $workspaceRoot 'results') 'heartbeat.json'
$heartbeatAge = $null
if (Test-Path -LiteralPath $heartbeatPath) {
    $heartbeat = Read-MonitorJson $heartbeatPath 8192
    if ($heartbeat.registrySha256 -cne $RegistrySha256) { throw 'monitor-heartbeat-registry-mismatch' }
    $heartbeatAge = [Math]::Max([double]0,([DateTime]::UtcNow - [DateTime]::Parse($heartbeat.at).ToUniversalTime()).TotalSeconds)
}
$workerState = [string](Get-ScheduledTask -TaskName $taskName).State
$health = 'starting'
if ($workerState -ne 'Running') { $health = 'stopped' }
elseif ($null -ne $heartbeatAge -and $heartbeatAge -le 15) { $health = 'healthy' }
elseif ($null -ne $heartbeatAge) { $health = 'stale' }
@{version = 1; status = 'verified'; health = $health; taskName = $taskName; workerState = $workerState; heartbeatAgeSeconds = $heartbeatAge; registrySha256 = $RegistrySha256; targetCount = @($registry.targets).Count; credentials = 'SYSTEM-DPAPI-CurrentUser'; customerServicesChanged = $false} | ConvertTo-Json -Compress
