$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# Exercise exact production Worker bytes through three real heartbeat writes.
# Only platform authority checks and scheduling are mocked. All file replacement
# and queue cleanup run against a new, bounded temporary fixture; no collector
# request, database, listener, scheduled task or remote connection is created.
$fixtureParent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$fixtureRoot = Join-Path $fixtureParent ('devsetu-monitor-loop-' + [Guid]::NewGuid().ToString('N'))
$resolvedFixture = [IO.Path]::GetFullPath($fixtureRoot)
if (-not $resolvedFixture.StartsWith($fixtureParent.TrimEnd('\') + '\',[StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $resolvedFixture) -notmatch '^devsetu-monitor-loop-[a-f0-9]{32}$') { throw 'worker-loop-fixture-path-invalid' }
$null = New-Item -ItemType Directory -Path $fixtureRoot
$script:Assertions = 0
function Assert-Loop($Condition,[string]$Name) { if (-not $Condition) { throw ('worker-loop-fixture-failed: ' + $Name) }; $script:Assertions++ }
try {
    $program = Join-Path $fixtureRoot 'program'
    $protected = Join-Path $fixtureRoot 'private'
    $queue = Join-Path $fixtureRoot 'queue'
    $workspaceId = 'ws_loop_' + [Guid]::NewGuid().ToString('N')
    $workspaceRoot = Join-Path $queue $workspaceId
    $requests = Join-Path $workspaceRoot 'requests'
    $results = Join-Path $workspaceRoot 'results'
    $claims = Join-Path $protected 'claims'
    foreach ($directory in @($program,$protected,$queue,$workspaceRoot,$requests,$results,$claims)) { $null = New-Item -ItemType Directory -Path $directory -Force }
    $registryPath = Join-Path $protected 'registry.v1.json'
    [IO.File]::WriteAllText($registryPath,(@{version=1;workspaceId=$workspaceId;targets=@()} | ConvertTo-Json -Compress),[Text.Encoding]::UTF8)
    $registryHash = (Get-FileHash -LiteralPath $registryPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $sourceWorker = Join-Path $PSScriptRoot 'Worker.ps1'
    $stagedWorker = Join-Path $program 'Worker.ps1'
    [IO.File]::Copy($sourceWorker,$stagedWorker,$false)
    Assert-Loop ((Get-FileHash -LiteralPath $sourceWorker -Algorithm SHA256).Hash -ceq (Get-FileHash -LiteralPath $stagedWorker -Algorithm SHA256).Hash) 'exact-production-worker-bytes'

    $commonPath = (Join-Path $PSScriptRoot 'Common.ps1').Replace("'","''")
    $fixtureCommon = @'
. '__REAL_COMMON__'
function Assert-MonitorSystem { }
function Assert-MonitorPrivateAcl([string]$Path) { }
function Assert-MonitorQueueAcl([string]$Path,[string]$AppSid,[bool]$Writable) { }
$script:FixtureOriginalWrite = (Get-Command Write-MonitorJsonNew).ScriptBlock
$script:FixtureSleepCount = 0
function Write-MonitorJsonNew([string]$Path,$Value,[int]$MaxBytes=1048576) {
    & $script:FixtureOriginalWrite $Path $Value $MaxBytes
    if ((Split-Path -Leaf $Path) -match '^heartbeat-[a-f0-9]{32}\.tmp$') {
        [IO.File]::AppendAllText((Join-Path $ProtectedRoot 'heartbeat-journal.jsonl'),($Value | ConvertTo-Json -Depth 8 -Compress) + "`n",[Text.Encoding]::UTF8)
    }
}
function Start-Sleep([int]$Milliseconds) {
    $script:FixtureSleepCount++
    [IO.File]::WriteAllText((Join-Path $ProtectedRoot 'loop-count.txt'),[string]$script:FixtureSleepCount)
    # Advance the scheduling deadlines without sleeping. This forces each actual
    # Worker iteration to exercise both heartbeat and retention cleanup branches.
    $script:lastHeartbeat = [DateTime]::MinValue
    $script:lastCleanup = [DateTime]::MinValue
    if ($script:FixtureSleepCount -ge 3) { [IO.File]::WriteAllText((Join-Path $ProtectedRoot 'stop.requested'),'fixture stop') }
    if ($script:FixtureSleepCount -gt 3) { throw 'worker-loop-fixture-did-not-stop' }
}
'@
    [IO.File]::WriteAllText((Join-Path $program 'Common.ps1'),$fixtureCommon.Replace('__REAL_COMMON__',$commonPath),[Text.Encoding]::UTF8)
    $staleFiles = @()
    foreach ($directory in @($results,$claims,$requests)) {
        $extension = 'json'
        if ($directory -eq $requests) { $extension = 'cancel' }
        $stale = Join-Path $directory ('smr_' + [Guid]::NewGuid().ToString('N') + '.' + $extension)
        [IO.File]::WriteAllText($stale,'fixture stale transport receipt')
        [IO.File]::SetLastWriteTimeUtc($stale,[DateTime]::UtcNow.AddHours(-7))
        $staleFiles += $stale
    }
    $unrelated = Join-Path $results 'keep.txt'
    [IO.File]::WriteAllText($unrelated,'unrelated fixture file')
    & $stagedWorker -ProtectedRoot $protected -QueueRoot $queue -RegistrySha256 $registryHash -AppIdentitySid 'S-1-5-19' | Out-Null

    $journal = @(Get-Content -LiteralPath (Join-Path $protected 'heartbeat-journal.jsonl') | ForEach-Object { $_ | ConvertFrom-Json })
    Assert-Loop ($journal.Count -eq 3) 'three-real-heartbeat-writes'
    Assert-Loop ([IO.File]::ReadAllText((Join-Path $protected 'loop-count.txt')) -eq '3') 'worker-survived-three-loop-iterations'
    $heartbeat = [IO.File]::ReadAllText((Join-Path $results 'heartbeat.json')) | ConvertFrom-Json
    Assert-Loop ($heartbeat.at -ceq $journal[2].at) 'destination-is-last-heartbeat'
    Assert-Loop ($heartbeat.registrySha256 -ceq $registryHash) 'heartbeat-retains-registry-binding'
    Assert-Loop ($heartbeat.state -eq 'running' -and $heartbeat.active -eq 0 -and $heartbeat.targetCount -eq 0) 'empty-queue-remains-healthy'
    Assert-Loop (@(Get-ChildItem -LiteralPath $results -Filter 'heartbeat-*.tmp' -File).Count -eq 0) 'successful-replacements-consume-temp-files'
    Assert-Loop (Test-Path -LiteralPath (Join-Path $protected 'stop.requested') -PathType Leaf) 'exit-was-owned-stop-request'
    Assert-Loop ([IO.File]::ReadAllText($unrelated) -eq 'unrelated fixture file') 'cleanup-preserves-unrelated-file'
    foreach ($stale in $staleFiles) { Assert-Loop (-not (Test-Path -LiteralPath $stale)) 'cleanup-removes-only-stale-transport-receipt' }
    Assert-Loop (@(Get-ChildItem -LiteralPath $requests -File).Count -eq 0) 'no-collector-requests-or-remote-work'
    @{status='PASS';assertions=$script:Assertions;iterations=3;heartbeatWrites=$journal.Count;powerShellVersion=$PSVersionTable.PSVersion.ToString();remoteConnections=0;listeners=0;databaseStarted=$false;scheduledTasksCreated=0} | ConvertTo-Json -Compress
} finally {
    # The generated absolute target was checked against the explicit temp parent
    # before creation. Never enumerate or delete outside this one owned fixture.
    if (Test-Path -LiteralPath $resolvedFixture) { Remove-Item -LiteralPath $resolvedFixture -Recurse -Force }
}
