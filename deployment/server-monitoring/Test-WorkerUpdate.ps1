# In-process filesystem/Task Scheduler doubles only. No task, real credential or remote operation.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Update-Worker.ps1')
$script:Passed = 0
function Assert-UpdateTest($Condition,[string]$Name) { if (-not $Condition) { throw ('worker-update-fixture-failed-' + $Name) }; $script:Passed++ }
function Assert-UpdateReject([scriptblock]$Operation,[string]$Code) { $rejected = $false; try { & $Operation } catch { $rejected = $_.Exception.Message -ceq $Code }; Assert-UpdateTest $rejected $Code }
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('DevSetuWorkerUpdateFixture-' + [Guid]::NewGuid().ToString('N'))
$expectedRoot = [IO.Path]::GetFullPath($temporary)
$source = Join-Path $temporary 'staged'; $private = Join-Path $temporary 'operator'; $queue = Join-Path $temporary 'queue'; $program = Join-Path $private 'program'; $credentials = Join-Path $private 'credentials'
$null = New-Item -ItemType Directory -Path $source
foreach ($directory in @($program,$credentials,(Join-Path (Join-Path $queue 'ws_fixture') 'results'))) { $null = New-Item -ItemType Directory -Path $directory }
$script:FixtureNow = [DateTime]::UtcNow
$script:FixtureTask = $null; $script:Started = 0; $script:Stopped = 0; $script:OneHeartbeatOnly = $false; $script:HeartbeatAt = $null; $script:StartAt = $null
function Get-WorkerUpdateNow { return $script:FixtureNow }
function Assert-WorkerUpdateSystem { }
function Assert-WorkerUpdatePrivate { param($Path) }
function New-WorkerUpdateScope { param($Path) if (Test-Path -LiteralPath $Path) { throw 'worker-update-scope-already-exists' }; $null = New-Item -ItemType Directory -Path $Path }
function Get-ScheduledTask { param($TaskName,$TaskPath,$ErrorAction) return $script:FixtureTask }
function Stop-ScheduledTask { param($TaskName,$TaskPath) $script:Stopped++; $script:FixtureTask.State = 'Ready' }
function Write-FixtureHeartbeat {
    $file = Join-Path (Join-Path (Join-Path $queue 'ws_fixture') 'results') 'heartbeat.json'
    [IO.File]::WriteAllText($file,(@{version = 1; state = 'running'; at = $script:FixtureNow.ToString('o'); registrySha256 = $script:Plan.registrySha256; targetCount = 0; active = 0; transport = 'native-system-worker'} | ConvertTo-Json -Compress))
    $script:HeartbeatAt = $script:FixtureNow
}
function Start-ScheduledTask { param($TaskName,$TaskPath) $script:Started++; $script:FixtureTask.State = 'Running'; $script:StartAt = $script:FixtureNow; Write-FixtureHeartbeat }
function Start-Sleep {
    param($Milliseconds)
    $script:FixtureNow = $script:FixtureNow.AddMilliseconds($Milliseconds)
    if ($null -ne $script:StartAt -and -not $script:OneHeartbeatOnly -and ($script:FixtureNow - $script:HeartbeatAt).TotalSeconds -ge 5) { Write-FixtureHeartbeat }
}
try {
    $names = @('Common.ps1','Collector.ps1','Worker.ps1','Protect-Credential.ps1','Install-Worker.ps1')
    foreach ($name in $names) { [IO.File]::WriteAllText((Join-Path $program $name),('# old fixture ' + $name)); [IO.File]::Copy((Join-Path $program $name),(Join-Path $source $name)) }
    $before = [pscustomobject]@{version = 1; files = @($names | ForEach-Object { [pscustomobject]@{name = $_; sha256 = (Get-WorkerUpdateHash (Join-Path $program $_))} })}
    [IO.File]::WriteAllText((Join-Path $source 'before-manifest.v1.json'),($before | ConvertTo-Json -Depth 4 -Compress))
    [IO.File]::WriteAllText((Join-Path $source 'Worker.ps1'),'# new fixture worker')
    $after = [pscustomobject]@{version = 1; files = @($names | ForEach-Object { [pscustomobject]@{name = $_; sha256 = (Get-WorkerUpdateHash (Join-Path $source $_))} })}
    [IO.File]::WriteAllText((Join-Path $source 'manifest.v1.json'),($after | ConvertTo-Json -Depth 4 -Compress))
    [IO.File]::WriteAllText((Join-Path $private 'registry.v1.json'),'{"version":1,"workspaceId":"ws_fixture","targets":[]}')
    [IO.File]::WriteAllText((Join-Path $credentials 'fixture_profile.dpapi'),'opaque encrypted fixture only')
    [IO.File]::WriteAllText((Join-Path $queue 'unrelated.txt'),'unrelated queue fixture')
    $script:Plan = [pscustomobject]@{version = 1; kind = 'devsetu.monitoring-worker-update.v1'; id = 'smu_' + ('a' * 32); expectedComputerName = $env:COMPUTERNAME; workspaceId = 'ws_fixture'; protectedRoot = $private; queueRoot = $queue; stagingRoot = $source; registrySha256 = (Get-WorkerUpdateHash (Join-Path $private 'registry.v1.json')); oldWorkerSha256 = (Get-WorkerUpdateHash (Join-Path $program 'Worker.ps1')); newWorkerSha256 = (Get-WorkerUpdateHash (Join-Path $source 'Worker.ps1')); oldManifestSha256 = (Get-WorkerUpdateHash (Join-Path $source 'before-manifest.v1.json')); newManifestSha256 = (Get-WorkerUpdateHash (Join-Path $source 'manifest.v1.json')); appIdentitySid = 'S-1-5-19'; createdAt = $script:FixtureNow.AddMinutes(-1).ToString('o'); expiresAt = $script:FixtureNow.AddHours(1).ToString('o')}
    $planPath = Join-Path $source 'plan.v1.json'
    [IO.File]::WriteAllText($planPath,($script:Plan | ConvertTo-Json -Compress)); $planHash = Get-WorkerUpdateHash $planPath
    $worker = Join-Path $program 'Worker.ps1'
    $arguments = '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $worker + '" -ProtectedRoot "' + $private + '" -QueueRoot "' + $queue + '" -RegistrySha256 ' + $script:Plan.registrySha256 + ' -AppIdentitySid S-1-5-19'
    $script:FixtureTask = [pscustomobject]@{State = 'Ready'; Principal = [pscustomobject]@{UserId = 'SYSTEM'; LogonType = 'ServiceAccount'; RunLevel = 'Highest'}; Actions = @([pscustomobject]@{Execute = (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'); Arguments = $arguments; WorkingDirectory = $program})}
    Assert-UpdateReject { Get-WorkerUpdateContext $planPath ('0' * 64) } 'worker-update-plan-hash-mismatch'
    $copy = $script:Plan.PSObject.Copy(); $copy.expectedComputerName = 'WRONG-COMPUTER'
    Assert-UpdateReject { Assert-WorkerUpdatePlan $copy $env:COMPUTERNAME $planPath } 'worker-update-plan-identity-rejected'
    $copy = $script:Plan.PSObject.Copy(); $copy | Add-Member command 'not allowed'
    Assert-UpdateReject { Assert-WorkerUpdatePlan $copy $env:COMPUTERNAME $planPath } 'worker-update-invalid-shape'
    $copy = $script:Plan.PSObject.Copy(); $copy.queueRoot = Join-Path $private 'queue'
    Assert-UpdateReject { Assert-WorkerUpdatePlan $copy $env:COMPUTERNAME $planPath } 'worker-update-scope-separation-required'
    $copy = $script:Plan.PSObject.Copy(); $copy.expiresAt = $script:FixtureNow.AddSeconds(-1).ToString('o')
    Assert-UpdateReject { Assert-WorkerUpdatePlan $copy $env:COMPUTERNAME $planPath } 'worker-update-plan-expired'
    $script:FixtureTask.Principal.UserId = 'OTHER'
    Assert-UpdateReject { Get-WorkerUpdateContext $planPath $planHash } 'worker-update-owned-task-mismatch'
    $script:FixtureTask.Principal.UserId = 'SYSTEM'
    $context = Get-WorkerUpdateContext $planPath $planHash
    $planned = Invoke-WorkerUpdate $context 'Plan'
    Assert-UpdateTest ($planned.status -eq 'planned' -and $script:Started -eq 0 -and $script:Stopped -eq 0 -and -not (Test-Path -LiteralPath $context.scope)) 'plan-never-stops-or-writes'
    $credentialHash = Get-WorkerUpdateHash (Join-Path $credentials 'fixture_profile.dpapi')
    $updated = Invoke-WorkerUpdate $context 'Apply'
    Assert-UpdateTest ($updated.status -eq 'succeeded' -and $updated.health.advancingHeartbeats -and $script:Started -eq 1) 'updated-with-two-advancing-heartbeats'
    Assert-UpdateTest (([DateTimeOffset]::Parse($updated.health.secondAt) - [DateTimeOffset]::Parse($updated.health.firstAt)).TotalSeconds -ge 5) 'health-requires-five-seconds-new-observation'
    Assert-UpdateTest ((Get-WorkerUpdateHash $worker) -ceq $script:Plan.newWorkerSha256 -and (Get-WorkerUpdateHash (Join-Path $context.scope 'Worker.before.ps1')) -ceq $script:Plan.oldWorkerSha256) 'actual-atomic-replace-and-backup'
    Assert-UpdateTest ((Get-WorkerUpdateHash (Join-Path $credentials 'fixture_profile.dpapi')) -ceq $credentialHash -and (Get-WorkerUpdateHash $context.registryPath) -ceq $script:Plan.registrySha256 -and [IO.File]::ReadAllText((Join-Path $queue 'unrelated.txt')) -ceq 'unrelated queue fixture') 'registry-credentials-and-queue-preserved'
    Assert-UpdateTest (Test-Path -LiteralPath (Join-Path $context.scope 'receipt.json')) 'bounded-receipt-written'
    foreach ($name in @('Common.ps1','Collector.ps1','Protect-Credential.ps1','Install-Worker.ps1')) { Assert-UpdateTest ((Get-WorkerUpdateHash (Join-Path $program $name)) -ceq (Get-WorkerUpdateHash (Join-Path $source $name))) ('unrelated-program-retained-' + $name) }

    # A second independent update fixture proves mapped recovery of the real bytes
    # and rejects a worker that produces only its first heartbeat then disappears.
    [IO.File]::Copy((Join-Path $context.scope 'Worker.before.ps1'),$worker,$true)
    $script:Plan.id = 'smu_' + ('b' * 32)
    [IO.File]::WriteAllText($planPath,($script:Plan | ConvertTo-Json -Compress)); $planHash = Get-WorkerUpdateHash $planPath
    $recoveryContext = Get-WorkerUpdateContext $planPath $planHash
    $script:OneHeartbeatOnly = $true
    $failed = Invoke-WorkerUpdate $recoveryContext 'Apply'
    Assert-UpdateTest ($failed.status -eq 'failed' -and $failed.code -eq 'worker-update-heartbeat-did-not-advance') 'one-shot-heartbeat-never-accepted'
    Assert-UpdateTest ($failed.recovery -eq 'old-worker-restored-and-started-health-unverified' -and (Get-WorkerUpdateHash $worker) -ceq $script:Plan.oldWorkerSha256) 'mapped-recovery-restores-exact-old-worker'
    Assert-UpdateTest ((Get-WorkerUpdateHash (Join-Path $recoveryContext.scope 'Worker.failed.ps1')) -ceq $script:Plan.newWorkerSha256) 'failed-new-worker-retained-for-review'
    Assert-UpdateTest ($script:Stopped -ge 1 -and (Get-WorkerUpdateHash (Join-Path $credentials 'fixture_profile.dpapi')) -ceq $credentialHash) 'only-owned-task-stopped-no-secret-rewrite'
    $badManifest = $after.PSObject.Copy(); $badManifest.files = @($after.files | ForEach-Object { $entry = $_.PSObject.Copy(); if ($entry.name -eq 'Collector.ps1') { $entry.sha256 = 'd' * 64 }; $entry })
    [IO.File]::WriteAllText((Join-Path $source 'manifest.v1.json'),($badManifest | ConvertTo-Json -Depth 4 -Compress)); $script:Plan.newManifestSha256 = Get-WorkerUpdateHash (Join-Path $source 'manifest.v1.json')
    [IO.File]::WriteAllText($planPath,($script:Plan | ConvertTo-Json -Compress)); $planHash = Get-WorkerUpdateHash $planPath
    Assert-UpdateReject { Get-WorkerUpdateContext $planPath $planHash } 'worker-update-unrelated-program-delta'
    foreach ($name in @('Update-Worker.ps1','Test-WorkerUpdate.ps1')) { $tokens = $null; $errors = $null; $null = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $name),[ref]$tokens,[ref]$errors); Assert-UpdateTest ($errors.Count -eq 0) ('parser-' + $name) }
    @{status = 'PASS'; assertions = $script:Passed; nativeTasksChanged = $false; realCredentialsRead = $false; remoteConnections = 0; databaseStarted = $false; listeners = 0; actualFixtureAtomicReplace = $true; rollbackTested = $true} | ConvertTo-Json -Compress
} finally {
    $actual = [IO.Path]::GetFullPath($temporary)
    if ($actual -cne $expectedRoot -or [IO.Directory]::GetParent($actual).FullName.TrimEnd('\') -ine [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') -or [IO.Path]::GetFileName($actual) -notmatch '^DevSetuWorkerUpdateFixture-[a-f0-9]{32}$') { throw 'worker-update-fixture-cleanup-rejected' }
    Remove-Item -LiteralPath $actual -Recurse -Force
}
