param(
    [Parameter(Mandatory=$true)][string]$ProtectedRoot,
    [Parameter(Mandatory=$true)][string]$QueueRoot,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$RegistrySha256,
    [ValidatePattern('^S-1-5-(?:19|20|80-[0-9-]+)$')][string]$AppIdentitySid = 'S-1-5-19',
    [switch]$Once
)
. (Join-Path $PSScriptRoot 'Common.ps1')
Assert-MonitorSystem
$ProtectedRoot = Assert-MonitorNoReparse $ProtectedRoot
$QueueRoot = Assert-MonitorNoReparse $QueueRoot
Assert-MonitorPrivateAcl $ProtectedRoot
$registryPath = Join-Path $ProtectedRoot 'registry.v1.json'
if ((Get-FileHash -LiteralPath $registryPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $RegistrySha256) { throw 'monitor-registry-hash-mismatch' }
$registry = Read-MonitorJson $registryPath
Assert-MonitorShape $registry @('version','workspaceId','targets')
if ($registry.version -ne 1 -or $registry.workspaceId -notmatch '^ws_[A-Za-z0-9][A-Za-z0-9_-]{0,119}$' -or @($registry.targets).Count -gt 100) { throw 'monitor-invalid-registry' }
$targets = @{}
foreach ($target in $registry.targets) {
    Assert-MonitorTarget $target $registry.workspaceId
    if ($targets.ContainsKey($target.id)) { throw 'monitor-duplicate-target' }
    $targets[$target.id] = $target
}
$workspaceRoot = Join-Path $QueueRoot $registry.workspaceId
$requests = Join-Path $workspaceRoot 'requests'
$results = Join-Path $workspaceRoot 'results'
$claims = Join-Path $ProtectedRoot 'claims'
foreach ($path in @($workspaceRoot,$requests,$results,$claims)) { $null = Assert-MonitorNoReparse $path; if (-not (Test-Path -LiteralPath $path -PathType Container)) { throw 'monitor-queue-not-installed' } }
Assert-MonitorPrivateAcl $claims
Assert-MonitorQueueAcl $QueueRoot $AppIdentitySid $false
Assert-MonitorQueueAcl $workspaceRoot $AppIdentitySid $false
Assert-MonitorQueueAcl $results $AppIdentitySid $false
Assert-MonitorQueueAcl $requests $AppIdentitySid $true
$mutexName = 'Global\DevSetuServerMonitoring_' + $RegistrySha256.Substring(0,24)
$mutex = New-Object Threading.Mutex($false,$mutexName)
if (-not $mutex.WaitOne(0)) { $mutex.Dispose(); throw 'monitor-worker-already-running' }
$pool = [RunspaceFactory]::CreateRunspacePool(1,4)
$pool.Open()
$running = New-Object Collections.ArrayList
$collector = Join-Path $PSScriptRoot 'Collector.ps1'
$runner = { param($Program,$Target,$WorkspaceId,$PrivateRoot) . $Program; Invoke-MonitorTarget $Target $WorkspaceId $PrivateRoot }
$lastCleanup = [DateTime]::MinValue
$lastHeartbeat = [DateTime]::MinValue
function Write-Result($Envelope, [string]$Id) {
    $temporary = Join-Path $results ($Id + '-' + [Guid]::NewGuid().ToString('N') + '.tmp')
    try { Write-MonitorJsonNew $temporary $Envelope; [IO.File]::Move($temporary,(Join-Path $results ($Id + '.json'))) }
    finally { if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force } }
}
function Write-Heartbeat {
    $value = @{version = 1; state = 'running'; at = [DateTime]::UtcNow.ToString('o'); registrySha256 = $RegistrySha256; targetCount = $targets.Count; active = $running.Count; transport = 'native-system-worker'}
    $temporary = Join-Path $results ('heartbeat-' + [Guid]::NewGuid().ToString('N') + '.tmp')
    Write-MonitorJsonNew $temporary $value 8192
    $destination = Join-Path $results 'heartbeat.json'
    if (Test-Path -LiteralPath $destination) { [IO.File]::Replace($temporary,$destination,$null) } else { [IO.File]::Move($temporary,$destination) }
}
try {
    do {
        $now = [DateTime]::UtcNow
        foreach ($job in @($running.ToArray())) {
            $cancelled = Test-Path -LiteralPath (Join-Path $requests ($job.id + '.cancel'))
            if ($job.handle.IsCompleted -or $cancelled -or $now -gt $job.deadline) {
                $result = @{status = 'error'; computerName = $null}
                try {
                    if (-not $cancelled -and $job.handle.IsCompleted) {
                        $output = @($job.pipeline.EndInvoke($job.handle))
                        if ($output.Count -eq 1 -and $output[0].status -in @('connected','auth-failed','access-denied','unreachable','winrm-unavailable','unsupported','error')) { $result = $output[0] }
                    } else { $job.pipeline.Stop() }
                    if (-not $cancelled) {
                        $envelope = @{version = 1; requestId = $job.id; workspaceId = $registry.workspaceId; targetId = $job.targetId; binding = $job.binding; completedAt = [DateTime]::UtcNow.ToString('o'); transport = $job.transport; result = $result}
                        Write-Result $envelope $job.id
                    }
                } catch { # A malformed result never becomes a connected observation.
                    $null = $_
                } finally { $job.pipeline.Dispose(); $null = $running.Remove($job) }
            }
        }
        if (Test-Path -LiteralPath (Join-Path $ProtectedRoot 'stop.requested')) { break }
        foreach ($file in @(Get-ChildItem -LiteralPath $requests -Filter 'smr_*.json' -File | Sort-Object LastWriteTimeUtc | Select-Object -First 100)) {
            if ($running.Count -ge 4) { break }
            if ($file.Name -notmatch '^smr_[a-f0-9]{32}\.json$') { continue }
            $id = $file.BaseName
            if (Test-Path -LiteralPath (Join-Path $claims ($id + '.json'))) { continue }
            $validEnvelope = $false
            try {
                $request = Read-MonitorJson $file.FullName 4096
                Assert-MonitorShape $request @('version','requestId','workspaceId','targetId','action','binding','issuedAt','expiresAt')
                if ($request.version -ne 1 -or $request.requestId -cne $id -or $request.workspaceId -cne $registry.workspaceId -or $request.targetId -notmatch '^srv_[a-f0-9]{32}$' -or $request.action -notin @('check','sample') -or $request.binding -notmatch '^[a-f0-9]{64}$') { throw 'monitor-invalid-request' }
                if ($request.issuedAt -notmatch '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,7})?Z$' -or $request.expiresAt -notmatch '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,7})?Z$') { throw 'monitor-invalid-request-time' }
                $issued = [DateTimeOffset]::Parse($request.issuedAt,[Globalization.CultureInfo]::InvariantCulture).UtcDateTime
                $expires = [DateTimeOffset]::Parse($request.expiresAt,[Globalization.CultureInfo]::InvariantCulture).UtcDateTime
                if ($issued -gt $now.AddSeconds(15) -or $issued -lt $now.AddMinutes(-2) -or $expires -le $now -or $expires -gt $issued.AddSeconds(120) -or $expires -le $issued) { throw 'monitor-expired-request' }
                $validEnvelope = $true
                if (-not $targets.ContainsKey($request.targetId)) { throw 'monitor-target-not-enrolled' }
                $target = $targets[$request.targetId]
                if ($request.binding -cne (Get-MonitorBinding $registry.workspaceId $target)) { throw 'monitor-target-binding-mismatch' }
                Write-MonitorJsonNew (Join-Path $claims ($id + '.json')) @{version = 1; requestId = $id; at = $now.ToString('o')} 4096
                $null = Assert-MonitorNoReparse (Join-Path $requests ($id + '.cancel'))
                if (Test-Path -LiteralPath (Join-Path $requests ($id + '.cancel'))) { continue }
                $pipeline = [PowerShell]::Create()
                $pipeline.RunspacePool = $pool
                $null = $pipeline.AddScript($runner.ToString()).AddArgument($collector).AddArgument($target).AddArgument($registry.workspaceId).AddArgument($ProtectedRoot)
                $handle = $pipeline.BeginInvoke()
                $null = $running.Add(@{id = $id; targetId = $target.id; binding = $request.binding; transport = $target.transport; pipeline = $pipeline; handle = $handle; deadline = $expires})
            } catch {
                # Do not log arbitrary app-supplied content, addresses or exceptions.
                # Invalid envelopes are never executed. Adapter times out and reports a fixed error.
                if ($validEnvelope -and -not (Test-Path -LiteralPath (Join-Path $claims ($id + '.json')))) {
                    try {
                        Write-MonitorJsonNew (Join-Path $claims ($id + '.json')) @{version = 1; requestId = $id; at = $now.ToString('o')} 4096
                        $requestedTransport = 'winrm-http'
                        if ($targets.ContainsKey($request.targetId)) { $requestedTransport = $targets[$request.targetId].transport }
                        Write-Result @{version = 1; requestId = $id; workspaceId = $registry.workspaceId; targetId = $request.targetId; binding = $request.binding; completedAt = [DateTime]::UtcNow.ToString('o'); transport = $requestedTransport; result = @{status = 'unsupported'; computerName = $null}} $id
                    } catch { $null = $_ }
                }
            }
        }
        if (($now - $lastHeartbeat).TotalSeconds -ge 5) { Write-Heartbeat; $lastHeartbeat = $now }
        if (($now - $lastCleanup).TotalMinutes -ge 1) {
            # Only this worker's exact receipt/result names are eligible, never customer files.
            foreach ($directory in @($results,$claims,$requests)) {
                $cutoff = $now.AddMinutes(-5)
                $maxFiles = 1000
                if ($directory -eq $claims) { $cutoff = $now.AddHours(-6); $maxFiles = 5000 }
                if ($directory -eq $requests) { $maxFiles = 512 }
                $retained = @(Get-ChildItem -LiteralPath $directory -File | Where-Object { $_.Name -match '^smr_[a-f0-9]{32}\.(json|cancel)$' } | Sort-Object LastWriteTimeUtc -Descending)
                $index = 0
                foreach ($old in $retained) {
                    $index++
                    if ($old.LastWriteTimeUtc -ge $cutoff -and $index -le $maxFiles) { continue }
                    if ($old.LastWriteTimeUtc -ge $now.AddMinutes(-3)) { continue }
                    $null = Assert-MonitorNoReparse $old.FullName
                    Remove-Item -LiteralPath $old.FullName -Force
                }
            }
            $lastCleanup = $now
        }
        if ($Once -and $running.Count -eq 0) { break }
        Start-Sleep -Milliseconds 250
    } while ($true)
} finally {
    foreach ($job in @($running.ToArray())) { try { $job.pipeline.Stop() } finally { $job.pipeline.Dispose() } }
    $pool.Close(); $pool.Dispose(); $mutex.ReleaseMutex(); $mutex.Dispose()
}
