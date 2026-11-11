#requires -Version 5.1
param(
    [ValidateSet('Plan','Apply')][string]$Action,
    [string]$PlanPath,
    [ValidatePattern('^[a-f0-9]{64}$')][string]$PlanSha256
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-WorkerUpdateSystem { if ([Security.Principal.WindowsIdentity]::GetCurrent().User.Value -ne 'S-1-5-18') { throw 'worker-update-system-required' } }
function Assert-WorkerUpdateShape($Value,[string[]]$Names) {
    if ($null -eq $Value -or $Value -is [string] -or $Value -is [array] -or (@($Value.PSObject.Properties.Name | Sort-Object) -join ',') -cne (@($Names | Sort-Object) -join ',')) { throw 'worker-update-invalid-shape' }
}
function Resolve-WorkerUpdatePath([string]$Path) {
    if (-not $Path -or $Path -notmatch '^[A-Za-z]:[\\/]' -or $Path.Length -gt 500 -or $Path -match '[\x00-\x1f\x7f"]') { throw 'worker-update-local-path-required' }
    $full = [IO.Path]::GetFullPath($Path).TrimEnd('\','/')
    if ($full.Length -le 3) { throw 'worker-update-local-path-required' }
    for ($cursor = $full; $cursor;) {
        if ((Test-Path -LiteralPath $cursor) -and ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'worker-update-reparse-rejected' }
        $parent = [IO.Directory]::GetParent($cursor); if ($null -eq $parent) { break }; $cursor = $parent.FullName
    }
    return $full
}
function Assert-WorkerUpdatePrivate([string]$Path) {
    $null = Resolve-WorkerUpdatePath $Path
    $acl = Get-Acl -LiteralPath $Path
    if (-not $acl.AreAccessRulesProtected -or $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -notin @('S-1-5-18','S-1-5-32-544')) { throw 'worker-update-private-acl-required' }
    foreach ($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
        if ($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin @('S-1-5-18','S-1-5-32-544')) { throw 'worker-update-private-acl-required' }
    }
}
function Read-WorkerUpdateJson([string]$Path,[int]$MaxBytes = 16384) {
    $pathFull = Resolve-WorkerUpdatePath $Path; $info = Get-Item -LiteralPath $pathFull -Force
    if ($info.PSIsContainer -or $info.Length -lt 2 -or $info.Length -gt $MaxBytes) { throw 'worker-update-file-limit' }
    return ([IO.File]::ReadAllText($pathFull,[Text.Encoding]::UTF8) | ConvertFrom-Json)
}
function Get-WorkerUpdateHash([string]$Path) { $null = Resolve-WorkerUpdatePath $Path; return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }
function Get-WorkerUpdateNow { return [DateTime]::UtcNow }
function Assert-WorkerUpdatePlan($Plan,[string]$ComputerName,[string]$File) {
    Assert-WorkerUpdateShape $Plan @('version','kind','id','expectedComputerName','workspaceId','protectedRoot','queueRoot','stagingRoot','registrySha256','oldWorkerSha256','newWorkerSha256','oldManifestSha256','newManifestSha256','appIdentitySid','createdAt','expiresAt')
    if ($Plan.version -ne 1 -or $Plan.kind -cne 'devsetu.monitoring-worker-update.v1' -or $Plan.id -notmatch '^smu_[a-f0-9]{32}$' -or $Plan.workspaceId -notmatch '^ws_[A-Za-z0-9][A-Za-z0-9_-]{0,119}$' -or $Plan.expectedComputerName -notmatch '^[A-Za-z0-9-]{1,63}$' -or $Plan.expectedComputerName -ine $ComputerName) { throw 'worker-update-plan-identity-rejected' }
    foreach ($name in @('registrySha256','oldWorkerSha256','newWorkerSha256','oldManifestSha256','newManifestSha256')) { if ($Plan.$name -notmatch '^[a-f0-9]{64}$') { throw 'worker-update-plan-digest-rejected' } }
    if ($Plan.oldWorkerSha256 -ceq $Plan.newWorkerSha256 -or $Plan.oldManifestSha256 -ceq $Plan.newManifestSha256 -or $Plan.appIdentitySid -notmatch '^S-1-5-(?:19|20|80-[0-9-]+)$') { throw 'worker-update-plan-policy-rejected' }
    foreach ($name in @('createdAt','expiresAt')) { if ([string]$Plan.$name -notmatch '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,7})?Z$') { throw 'worker-update-plan-time-rejected' } }
    $start = [DateTimeOffset]::Parse([string]$Plan.createdAt).UtcDateTime; $end = [DateTimeOffset]::Parse([string]$Plan.expiresAt).UtcDateTime; $now = Get-WorkerUpdateNow
    if ($start -gt $now -or $end -le $now -or $end -le $start -or ($end - $start).TotalHours -gt 24) { throw 'worker-update-plan-expired' }
    foreach ($name in @('protectedRoot','queueRoot','stagingRoot')) { $Plan.$name = Resolve-WorkerUpdatePath $Plan.$name }
    foreach ($pair in @(@($Plan.protectedRoot,$Plan.queueRoot),@($Plan.protectedRoot,$Plan.stagingRoot),@($Plan.queueRoot,$Plan.stagingRoot))) {
        if ($pair[0] -ieq $pair[1] -or $pair[0].StartsWith($pair[1] + '\',[StringComparison]::OrdinalIgnoreCase) -or $pair[1].StartsWith($pair[0] + '\',[StringComparison]::OrdinalIgnoreCase)) { throw 'worker-update-scope-separation-required' }
    }
    if ((Resolve-WorkerUpdatePath $File) -ine (Join-Path $Plan.stagingRoot 'plan.v1.json')) { throw 'worker-update-plan-path-mismatch' }
}
function Get-WorkerUpdateManifest([string]$Path,[string]$Digest) {
    if ((Get-WorkerUpdateHash $Path) -cne $Digest) { throw 'worker-update-manifest-hash-mismatch' }
    $value = Read-WorkerUpdateJson $Path; Assert-WorkerUpdateShape $value @('version','files')
    $names = @('Common.ps1','Collector.ps1','Worker.ps1','Protect-Credential.ps1','Install-Worker.ps1')
    if ($value.version -ne 1 -or @($value.files).Count -ne 5 -or @($value.files.name | Select-Object -Unique).Count -ne 5) { throw 'worker-update-manifest-rejected' }
    foreach ($item in $value.files) { Assert-WorkerUpdateShape $item @('name','sha256'); if ($item.name -cnotin $names -or $item.sha256 -notmatch '^[a-f0-9]{64}$') { throw 'worker-update-manifest-rejected' } }
    return $value
}
function Get-WorkerUpdateTask($Context) {
    $task = Get-ScheduledTask -TaskName $Context.taskName -TaskPath '\' -ErrorAction Stop
    if (@($task).Count -ne 1 -or $task.Principal.UserId -notin @('SYSTEM','S-1-5-18') -or [string]$task.Principal.LogonType -ne 'ServiceAccount' -or [string]$task.Principal.RunLevel -ne 'Highest' -or @($task.Actions).Count -ne 1 -or $task.Actions[0].Execute -ine $Context.powerShell -or $task.Actions[0].Arguments -cne $Context.arguments -or $task.Actions[0].WorkingDirectory -ine $Context.programRoot) { throw 'worker-update-owned-task-mismatch' }
    return $task
}
function Get-WorkerUpdateCredentials([string]$Root) {
    Assert-WorkerUpdatePrivate $Root
    $items = @(Get-ChildItem -LiteralPath $Root -Force)
    if ($items.Count -gt 100) { throw 'worker-update-credential-file-limit' }
    $result = @{}
    foreach ($item in $items) {
        if ($item.PSIsContainer -or $item.Name -notmatch '^[a-z][a-z0-9_-]{2,79}\.dpapi$' -or $item.Length -gt 65536) { throw 'worker-update-credential-file-rejected' }
        $result[$item.Name] = Get-WorkerUpdateHash $item.FullName
    }
    return $result
}
function Get-WorkerUpdateContext([string]$File,[string]$Digest) {
    Assert-WorkerUpdateSystem
    if ($Digest -notmatch '^[a-f0-9]{64}$' -or (Get-WorkerUpdateHash $File) -cne $Digest) { throw 'worker-update-plan-hash-mismatch' }
    Assert-WorkerUpdatePrivate (Split-Path -Parent $File)
    $plan = Read-WorkerUpdateJson $File; Assert-WorkerUpdatePlan $plan $env:COMPUTERNAME $File
    foreach ($directory in @($plan.stagingRoot,$plan.protectedRoot,(Join-Path $plan.protectedRoot 'program'),(Join-Path $plan.protectedRoot 'credentials'))) { Assert-WorkerUpdatePrivate $directory }
    $before = Get-WorkerUpdateManifest (Join-Path $plan.stagingRoot 'before-manifest.v1.json') $plan.oldManifestSha256
    $after = Get-WorkerUpdateManifest (Join-Path $plan.stagingRoot 'manifest.v1.json') $plan.newManifestSha256
    $programRoot = Join-Path $plan.protectedRoot 'program'
    $installed = @(Get-ChildItem -LiteralPath $programRoot -Force)
    if ($installed.Count -ne 5 -or @($installed | Where-Object { $_.PSIsContainer -or $_.Name -cnotin @('Common.ps1','Collector.ps1','Worker.ps1','Protect-Credential.ps1','Install-Worker.ps1') }).Count -ne 0) { throw 'worker-update-installed-program-set-mismatch' }
    foreach ($entry in $after.files) {
        $old = @($before.files | Where-Object { $_.name -ceq $entry.name })[0]
        if ($entry.name -ceq 'Worker.ps1') { if ($entry.sha256 -cne $plan.newWorkerSha256 -or $old.sha256 -cne $plan.oldWorkerSha256) { throw 'worker-update-worker-hash-mismatch' } }
        elseif ($old.sha256 -cne $entry.sha256) { throw 'worker-update-unrelated-program-delta' }
        if ((Get-WorkerUpdateHash (Join-Path $plan.stagingRoot $entry.name)) -cne $entry.sha256 -or (Get-WorkerUpdateHash (Join-Path $programRoot $entry.name)) -cne $old.sha256) { throw 'worker-update-program-hash-mismatch' }
    }
    $registryPath = Join-Path $plan.protectedRoot 'registry.v1.json'
    if ((Get-WorkerUpdateHash $registryPath) -cne $plan.registrySha256) { throw 'worker-update-registry-hash-mismatch' }
    $registry = Read-WorkerUpdateJson $registryPath 1048576; Assert-WorkerUpdateShape $registry @('version','workspaceId','targets')
    if ($registry.version -ne 1 -or $registry.workspaceId -cne $plan.workspaceId -or @($registry.targets).Count -gt 100) { throw 'worker-update-registry-mismatch' }
    $worker = Join-Path $programRoot 'Worker.ps1'; $powerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $arguments = '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $worker + '" -ProtectedRoot "' + $plan.protectedRoot + '" -QueueRoot "' + $plan.queueRoot + '" -RegistrySha256 ' + $plan.registrySha256 + ' -AppIdentitySid ' + $plan.appIdentitySid
    $context = @{plan = $plan; planFile = $File; planSha256 = $Digest; programRoot = $programRoot; workerPath = $worker; powerShell = $powerShell; arguments = $arguments; taskName = 'DevSetu-ServerMonitoring-' + $plan.workspaceId; before = $before; after = $after; registryPath = $registryPath; targetCount = @($registry.targets).Count; credentials = (Get-WorkerUpdateCredentials (Join-Path $plan.protectedRoot 'credentials')); scope = Join-Path (Join-Path $plan.protectedRoot 'updates') $plan.id}
    $null = Get-WorkerUpdateTask $context
    return $context
}
function Assert-WorkerUpdatePreserved($Context,[string]$WorkerDigest) {
    if ((Get-WorkerUpdateHash $Context.planFile) -cne $Context.planSha256 -or (Get-WorkerUpdateHash (Join-Path $Context.plan.stagingRoot 'manifest.v1.json')) -cne $Context.plan.newManifestSha256 -or (Get-WorkerUpdateHash (Join-Path $Context.plan.stagingRoot 'before-manifest.v1.json')) -cne $Context.plan.oldManifestSha256) { throw 'worker-update-approved-input-changed' }
    if ((Get-WorkerUpdateHash $Context.registryPath) -cne $Context.plan.registrySha256 -or (Get-WorkerUpdateHash $Context.workerPath) -cne $WorkerDigest) { throw 'worker-update-preservation-failed' }
    foreach ($entry in $Context.after.files) { if ($entry.name -cne 'Worker.ps1' -and (Get-WorkerUpdateHash (Join-Path $Context.programRoot $entry.name)) -cne $entry.sha256) { throw 'worker-update-preservation-failed' } }
    $current = Get-WorkerUpdateCredentials (Join-Path $Context.plan.protectedRoot 'credentials')
    if ($current.Count -ne $Context.credentials.Count) { throw 'worker-update-preservation-failed' }
    foreach ($key in $Context.credentials.Keys) { if (-not $current.ContainsKey($key) -or $current[$key] -cne $Context.credentials[$key]) { throw 'worker-update-preservation-failed' } }
    $null = Get-WorkerUpdateTask $Context
}
function New-WorkerUpdateScope([string]$Path) {
    $null = Resolve-WorkerUpdatePath $Path
    if (Test-Path -LiteralPath $Path) { throw 'worker-update-scope-already-exists' }
    $null = New-Item -ItemType Directory -Path $Path
    $acl = New-Object Security.AccessControl.DirectorySecurity; $acl.SetAccessRuleProtection($true,$false); $acl.SetOwner((New-Object Security.Principal.SecurityIdentifier('S-1-5-18')))
    foreach ($sid in @('S-1-5-18','S-1-5-32-544')) { $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($sid)),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))) }
    Set-Acl -LiteralPath $Path -AclObject $acl; Assert-WorkerUpdatePrivate $Path
}
function Stop-OwnedWorkerUpdateTask($Context) {
    $task = Get-WorkerUpdateTask $Context
    if ([string]$task.State -eq 'Running') {
        Stop-ScheduledTask -TaskName $Context.taskName -TaskPath '\'
        $end = (Get-WorkerUpdateNow).AddSeconds(15)
        while ([string](Get-WorkerUpdateTask $Context).State -eq 'Running') { if ((Get-WorkerUpdateNow) -ge $end) { throw 'worker-update-stop-timeout' }; Start-Sleep -Milliseconds 250 }
    }
}
function Wait-WorkerUpdateHealth($Context,[DateTime]$StartedAt) {
    $heartbeatPath = Join-Path (Join-Path (Join-Path $Context.plan.queueRoot $Context.plan.workspaceId) 'results') 'heartbeat.json'
    $first = $null; $end = (Get-WorkerUpdateNow).AddSeconds(45)
    while ((Get-WorkerUpdateNow) -lt $end) {
        $task = Get-WorkerUpdateTask $Context
        if ([string]$task.State -ne 'Running') { Start-Sleep -Milliseconds 500; continue }
        if (Test-Path -LiteralPath $heartbeatPath) {
            try {
                $heartbeat = Read-WorkerUpdateJson $heartbeatPath 8192
                Assert-WorkerUpdateShape $heartbeat @('version','state','at','registrySha256','targetCount','active','transport')
                $observed = [DateTimeOffset]::Parse([string]$heartbeat.at).UtcDateTime; $now = Get-WorkerUpdateNow
                if ($heartbeat.version -ne 1 -or $heartbeat.state -cne 'running' -or $heartbeat.transport -cne 'native-system-worker' -or $heartbeat.registrySha256 -cne $Context.plan.registrySha256 -or $heartbeat.targetCount -ne $Context.targetCount -or $heartbeat.active -lt 0 -or $heartbeat.active -gt 4 -or $observed -lt $StartedAt -or $observed -gt $now.AddSeconds(5) -or ($now - $observed).TotalSeconds -gt 15) { throw 'worker-update-heartbeat-invalid' }
                if ($null -eq $first) { $first = $observed }
                elseif (($observed - $first).TotalSeconds -ge 5) { return @{firstAt = $first.ToString('o'); secondAt = $observed.ToString('o'); health = 'healthy'; advancingHeartbeats = $true} }
            } catch { if ($_.Exception.Message -eq 'worker-update-owned-task-mismatch') { throw } }
        }
        Start-Sleep -Milliseconds 500
    }
    throw 'worker-update-heartbeat-did-not-advance'
}
function Write-WorkerUpdateReceipt($Context,$Value) {
    $destination = Join-Path $Context.scope 'receipt.json'; $data = [Text.Encoding]::UTF8.GetBytes(($Value | ConvertTo-Json -Depth 8 -Compress))
    $file = New-Object IO.FileStream($destination,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try { $file.Write($data,0,$data.Length); $file.Flush($true) } finally { $file.Dispose() }
}
function Invoke-WorkerUpdate($Context,[string]$Mode) {
    Assert-WorkerUpdateSystem
    Assert-WorkerUpdatePlan $Context.plan $env:COMPUTERNAME $Context.planFile
    Assert-WorkerUpdatePreserved $Context $Context.plan.oldWorkerSha256
    if ($Mode -eq 'Plan') { return @{version = 1; status = 'planned'; id = $Context.plan.id; planSha256 = $Context.planSha256; taskName = $Context.taskName; oldWorkerSha256 = $Context.plan.oldWorkerSha256; newWorkerSha256 = $Context.plan.newWorkerSha256; oldManifestSha256 = $Context.plan.oldManifestSha256; newManifestSha256 = $Context.plan.newManifestSha256; registrySha256 = $Context.plan.registrySha256; programsChanged = @('Worker.ps1'); customerServicesChanged = $false} }
    New-WorkerUpdateScope $Context.scope
    $beforePath = Join-Path $Context.scope 'Worker.before.ps1'; $nextPath = Join-Path $Context.scope 'Worker.next.ps1'; $changed = $false
    try {
        Stop-OwnedWorkerUpdateTask $Context
        Assert-WorkerUpdatePreserved $Context $Context.plan.oldWorkerSha256
        [IO.File]::Copy((Join-Path $Context.plan.stagingRoot 'Worker.ps1'),$nextPath,$false)
        if ((Get-WorkerUpdateHash $nextPath) -cne $Context.plan.newWorkerSha256) { throw 'worker-update-staged-file-changed' }
        [IO.File]::Replace($nextPath,$Context.workerPath,$beforePath)
        $changed = $true
        if ((Get-WorkerUpdateHash $beforePath) -cne $Context.plan.oldWorkerSha256) { throw 'worker-update-backup-changed' }
        Assert-WorkerUpdatePreserved $Context $Context.plan.newWorkerSha256
        $started = Get-WorkerUpdateNow; Start-ScheduledTask -TaskName $Context.taskName -TaskPath '\'
        $health = Wait-WorkerUpdateHealth $Context $started
        Assert-WorkerUpdatePreserved $Context $Context.plan.newWorkerSha256
        $receipt = @{version = 1; status = 'succeeded'; id = $Context.plan.id; planSha256 = $Context.planSha256; taskName = $Context.taskName; oldWorkerSha256 = $Context.plan.oldWorkerSha256; newWorkerSha256 = $Context.plan.newWorkerSha256; oldManifestSha256 = $Context.plan.oldManifestSha256; newManifestSha256 = $Context.plan.newManifestSha256; registrySha256 = $Context.plan.registrySha256; credentialsPreserved = $true; programsChanged = @('Worker.ps1'); health = $health; customerServicesChanged = $false}
        Write-WorkerUpdateReceipt $Context $receipt; return $receipt
    } catch {
        $code = 'worker-update-operation-failed'; if ($_.Exception.Message -match '^worker-update-[a-z0-9-]+$') { $code = $_.Exception.Message }
        $recovery = 'unchanged'
        if ($changed) {
            try {
                Stop-OwnedWorkerUpdateTask $Context
                Assert-WorkerUpdatePreserved $Context $Context.plan.newWorkerSha256
                if ((Get-WorkerUpdateHash $beforePath) -cne $Context.plan.oldWorkerSha256) { throw 'worker-update-backup-changed' }
                $restore = Join-Path $Context.scope 'Worker.restore.ps1'; [IO.File]::Copy($beforePath,$restore,$false)
                [IO.File]::Replace($restore,$Context.workerPath,(Join-Path $Context.scope 'Worker.failed.ps1'))
                Assert-WorkerUpdatePreserved $Context $Context.plan.oldWorkerSha256
                Start-ScheduledTask -TaskName $Context.taskName -TaskPath '\'; $recovery = 'old-worker-restored-and-started-health-unverified'
            } catch { $recovery = 'manual-review-required' }
        } else { try { $null = Get-WorkerUpdateTask $Context; Start-ScheduledTask -TaskName $Context.taskName -TaskPath '\' } catch { $recovery = 'manual-review-required' } }
        $receipt = @{version = 1; status = 'failed'; code = $code; id = $Context.plan.id; planSha256 = $Context.planSha256; recovery = $recovery; customerServicesChanged = $false}
        Write-WorkerUpdateReceipt $Context $receipt; return $receipt
    }
}
if ($Action) {
    try { $value = Invoke-WorkerUpdate (Get-WorkerUpdateContext $PlanPath $PlanSha256) $Action; $value | ConvertTo-Json -Depth 8 -Compress; if ($value.status -eq 'failed') { exit 1 } }
    catch { $code = 'worker-update-operation-failed'; if ($_.Exception.Message -match '^worker-update-[a-z0-9-]+$') { $code = $_.Exception.Message }; @{version = 1; status = 'failed'; code = $code; customerServicesChanged = $false} | ConvertTo-Json -Compress; exit 1 }
}
