#requires -Version 5.1
param(
    [ValidateSet('Prepare','Install','Check','Probe')][string]$Action,
    [string]$PlanPath,
    [ValidatePattern('^[a-f0-9]{64}$')][string]$PlanSha256
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-CentralSystem {
    if ([Security.Principal.WindowsIdentity]::GetCurrent().User.Value -ne 'S-1-5-18') { throw 'central-system-required' }
}
function Resolve-CentralPath([string]$Path) {
    if (-not $Path -or $Path.Length -gt 500 -or $Path -notmatch '^[A-Za-z]:[\\/]' -or $Path -match '[\x00-\x1f\x7f"]') { throw 'central-local-specific-path-required' }
    $full = [IO.Path]::GetFullPath($Path).TrimEnd('\','/')
    if ($full.Length -le 3) { throw 'central-local-specific-path-required' }
    for ($cursor = $full; $cursor; ) {
        if ((Test-Path -LiteralPath $cursor) -and ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'central-reparse-path-rejected' }
        $parent = [IO.Directory]::GetParent($cursor)
        if ($null -eq $parent) { break }; $cursor = $parent.FullName
    }
    return $full
}
function Assert-CentralShape($Value, [string[]]$Names) {
    if ($null -eq $Value -or $Value -is [string] -or $Value -is [array] -or (@($Value.PSObject.Properties.Name | Sort-Object) -join ',') -cne (@($Names | Sort-Object) -join ',')) { throw 'central-invalid-shape' }
}
function Read-CentralJson([string]$Path, [int]$MaxBytes) {
    $pathFull = Resolve-CentralPath $Path
    $item = Get-Item -LiteralPath $pathFull -Force
    if ($item.PSIsContainer -or $item.Length -lt 2 -or $item.Length -gt $MaxBytes) { throw 'central-json-size-rejected' }
    return ([IO.File]::ReadAllText($pathFull,[Text.Encoding]::UTF8) | ConvertFrom-Json)
}
function Assert-CentralPrivateDirectory([string]$Path) {
    $null = Resolve-CentralPath $Path
    $acl = Get-Acl -LiteralPath $Path
    if (-not $acl.AreAccessRulesProtected -or $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -notin @('S-1-5-18','S-1-5-32-544')) { throw 'central-private-acl-required' }
    foreach ($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
        if ($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin @('S-1-5-18','S-1-5-32-544')) { throw 'central-private-acl-required' }
    }
}
function Assert-CentralPlan($Plan, [string]$ActualComputerName, [string]$ActualPlanPath) {
    Assert-CentralShape $Plan @('version','id','expectedComputerName','workspaceId','protectedRoot','queueRoot','sourceRoot','registryPath','registrySha256','manifestSha256','appIdentitySid','credentialProfile')
    if ($Plan.version -ne 1 -or $Plan.id -notmatch '^smc_[a-f0-9]{32}$' -or $Plan.expectedComputerName -notmatch '^[A-Za-z0-9][A-Za-z0-9-]{0,62}$' -or $Plan.expectedComputerName -ine $ActualComputerName -or $Plan.workspaceId -notmatch '^ws_[A-Za-z0-9][A-Za-z0-9_-]{0,119}$') { throw 'central-plan-identity-rejected' }
    if ($Plan.registrySha256 -notmatch '^[a-f0-9]{64}$' -or $Plan.manifestSha256 -notmatch '^[a-f0-9]{64}$' -or $Plan.appIdentitySid -notmatch '^S-1-5-(?:19|20|80-[0-9-]+)$' -or $Plan.credentialProfile -notmatch '^[a-z][a-z0-9_-]{2,79}$') { throw 'central-plan-policy-rejected' }
    foreach ($name in @('protectedRoot','queueRoot','sourceRoot','registryPath')) { $Plan.$name = Resolve-CentralPath $Plan.$name }
    foreach ($pair in @(@($Plan.protectedRoot,$Plan.queueRoot),@($Plan.protectedRoot,$Plan.sourceRoot),@($Plan.queueRoot,$Plan.sourceRoot))) {
        if ($pair[0] -ieq $pair[1] -or $pair[0].StartsWith($pair[1] + '\',[StringComparison]::OrdinalIgnoreCase) -or $pair[1].StartsWith($pair[0] + '\',[StringComparison]::OrdinalIgnoreCase)) { throw 'central-scope-separation-required' }
    }
    if ((Resolve-CentralPath $ActualPlanPath) -ine (Join-Path $Plan.sourceRoot 'plan.v1.json') -or $Plan.registryPath -ine (Join-Path $Plan.sourceRoot 'registry.v1.json')) { throw 'central-staged-path-binding-rejected' }
}
function Get-CentralContext([string]$File, [string]$Digest) {
    Assert-CentralSystem
    if ($Digest -notmatch '^[a-f0-9]{64}$') { throw 'central-plan-hash-required' }
    $full = Resolve-CentralPath $File
    Assert-CentralPrivateDirectory (Split-Path -Parent $full)
    if ((Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash.ToLowerInvariant() -cne $Digest) { throw 'central-plan-hash-mismatch' }
    $plan = Read-CentralJson $full 16384
    Assert-CentralPlan $plan $env:COMPUTERNAME $full
    Assert-CentralPrivateDirectory $plan.sourceRoot
    $manifestPath = Join-Path $plan.sourceRoot 'manifest.v1.json'
    if ((Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $plan.manifestSha256) { throw 'central-manifest-hash-mismatch' }
    $manifest = Read-CentralJson $manifestPath 16384
    Assert-CentralShape $manifest @('version','files')
    $names = @('Common.ps1','Collector.ps1','Worker.ps1','Protect-Credential.ps1','Install-Worker.ps1')
    if ($manifest.version -ne 1 -or @($manifest.files).Count -ne 5 -or @($manifest.files.name | Select-Object -Unique).Count -ne 5) { throw 'central-manifest-rejected' }
    foreach ($fileEntry in $manifest.files) {
        Assert-CentralShape $fileEntry @('name','sha256')
        if ($fileEntry.name -cnotin $names -or $fileEntry.sha256 -notmatch '^[a-f0-9]{64}$') { throw 'central-manifest-rejected' }
        $program = Resolve-CentralPath (Join-Path $plan.sourceRoot $fileEntry.name)
        if ((Get-FileHash -LiteralPath $program -Algorithm SHA256).Hash.ToLowerInvariant() -cne $fileEntry.sha256) { throw 'central-program-hash-mismatch' }
    }
    if ((Get-FileHash -LiteralPath $plan.registryPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $plan.registrySha256) { throw 'central-registry-hash-mismatch' }
    return @{plan = $plan; planSha256 = $Digest; manifest = $manifest}
}
function Get-CentralRegistry($Context) {
    $plan = $Context.plan
    $registry = Read-MonitorJson $plan.registryPath
    Assert-MonitorShape $registry @('version','workspaceId','targets')
    if ($registry.version -ne 1 -or $registry.workspaceId -cne $plan.workspaceId -or @($registry.targets).Count -lt 1 -or @($registry.targets).Count -gt 100) { throw 'central-registry-rejected' }
    $seen = @{}
    foreach ($target in $registry.targets) {
        Assert-MonitorTarget $target $plan.workspaceId
        if ($seen.ContainsKey($target.id) -or $target.credentialProfile -cne $plan.credentialProfile) { throw 'central-registry-profile-rejected' }
        if ($target.transport -eq 'local' -and (-not $target.PSObject.Properties['expectedComputerName'] -or $target.expectedComputerName -ine $plan.expectedComputerName)) { throw 'central-local-enrollment-rejected' }
        $seen[$target.id] = $true
    }
    return $registry
}
function Assert-CentralPrepared($Context) {
    $plan = $Context.plan
    Assert-MonitorPrivateAcl $plan.protectedRoot
    $marker = Read-MonitorJson (Join-Path $plan.protectedRoot 'enrollment.v1.json') 4096
    Assert-MonitorShape $marker @('version','id','planSha256','workspaceId','registrySha256')
    if ($marker.version -ne 1 -or $marker.id -cne $plan.id -or $marker.planSha256 -cne $Context.planSha256 -or $marker.workspaceId -cne $plan.workspaceId -or $marker.registrySha256 -cne $plan.registrySha256) { throw 'central-enrollment-marker-mismatch' }
    if ((Get-FileHash -LiteralPath (Join-Path $plan.protectedRoot 'registry.v1.json') -Algorithm SHA256).Hash.ToLowerInvariant() -cne $plan.registrySha256) { throw 'central-protected-registry-mismatch' }
}
function Invoke-CentralPrepare($Context) {
    $plan = $Context.plan
    $registry = Get-CentralRegistry $Context
    if (Test-Path -LiteralPath $plan.protectedRoot) {
        if (Test-Path -LiteralPath (Join-Path $plan.protectedRoot 'enrollment.v1.json')) { Assert-CentralPrepared $Context; return @{status = 'prepared'; targetCount = @($registry.targets).Count} }
        if (@(Get-ChildItem -LiteralPath $plan.protectedRoot -Force).Count -ne 0) { throw 'central-nonempty-unowned-private-root' }
    }
    Set-MonitorDirectoryAcl $plan.protectedRoot
    foreach ($name in @('incoming','credentials','receipts')) { Set-MonitorDirectoryAcl (Join-Path $plan.protectedRoot $name) }
    [IO.File]::Copy($plan.registryPath,(Join-Path $plan.protectedRoot 'registry.v1.json'),$false)
    Write-MonitorJsonNew (Join-Path $plan.protectedRoot 'enrollment.v1.json') @{version = 1; id = $plan.id; planSha256 = $Context.planSha256; workspaceId = $plan.workspaceId; registrySha256 = $plan.registrySha256} 4096
    Assert-CentralPrepared $Context
    return @{status = 'prepared'; targetCount = @($registry.targets).Count}
}
function Get-CentralIncoming($Context) { return (Join-Path (Join-Path $Context.plan.protectedRoot 'incoming') ('credential-' + $Context.plan.id.Substring(4) + '.json')) }
function Assert-CentralProfile($Context) {
    $credential = Get-MonitorCredential $Context.plan.protectedRoot $Context.plan.credentialProfile
    try { if ($null -eq $credential -or $credential.Password.Length -lt 1) { throw 'central-profile-verification-failed' } }
    finally { if ($null -ne $credential) { $credential.Password.Dispose() }; $credential = $null }
}
function Remove-CentralSealedInput($Context, [string]$InputSha256) {
    Assert-CentralProfile $Context
    $inputFile = Get-CentralIncoming $Context
    $null = Assert-MonitorNoReparse $inputFile
    if ($InputSha256 -notmatch '^[a-f0-9]{64}$' -or (Get-FileHash -LiteralPath $inputFile -Algorithm SHA256).Hash.ToLowerInvariant() -cne $InputSha256) { throw 'central-input-changed-retained' }
    Remove-Item -LiteralPath $inputFile -Force
}
function Ensure-CentralProfile($Context) {
    $plan = $Context.plan
    Assert-CentralPrepared $Context
    $inputFile = Get-CentralIncoming $Context
    $profileFile = Join-Path (Join-Path $plan.protectedRoot 'credentials') ($plan.credentialProfile + '.dpapi')
    $null = Assert-MonitorNoReparse $profileFile
    if (Test-Path -LiteralPath $profileFile) {
        if (Test-Path -LiteralPath $inputFile) { throw 'central-existing-profile-input-retained' }
        Assert-CentralProfile $Context
        return
    }
    Assert-MonitorPrivateAcl (Split-Path -Parent $inputFile)
    $request = Read-MonitorJson $inputFile 32768
    Assert-MonitorShape $request @('version','credentialProfile','username','password')
    if ($request.credentialProfile -cne $plan.credentialProfile) { throw 'central-input-profile-mismatch' }
    $request = $null
    $inputHash = (Get-FileHash -LiteralPath $inputFile -Algorithm SHA256).Hash.ToLowerInvariant()
    $output = @(& (Join-Path $plan.sourceRoot 'Protect-Credential.ps1') -ProtectedRoot $plan.protectedRoot -InputPath $inputFile)
    $receipt = ($output -join '') | ConvertFrom-Json
    Assert-MonitorShape $receipt @('version','status','credentialProfile','protection')
    if ($receipt.version -ne 1 -or $receipt.status -cne 'sealed' -or $receipt.credentialProfile -cne $plan.credentialProfile -or $receipt.protection -cne 'SYSTEM-DPAPI-CurrentUser') { throw 'central-profile-seal-failed' }
    Remove-CentralSealedInput $Context $inputHash
}
function Invoke-CentralWorkerCheck($Context, [string]$Mode) {
    $plan = $Context.plan
    $output = @(& (Join-Path $plan.sourceRoot 'Install-Worker.ps1') -Action $Mode -ProtectedRoot $plan.protectedRoot -QueueRoot $plan.queueRoot -WorkspaceId $plan.workspaceId -RegistrySha256 $plan.registrySha256 -ManifestSha256 $plan.manifestSha256 -AppIdentitySid $plan.appIdentitySid)
    $receipt = ($output -join '') | ConvertFrom-Json
    if ($receipt.version -ne 1 -or $receipt.status -cne 'verified' -or $receipt.registrySha256 -cne $plan.registrySha256) { throw 'central-worker-check-invalid' }
    return $receipt
}
function Invoke-CentralInstall($Context) {
    Ensure-CentralProfile $Context
    $receipt = Invoke-CentralWorkerCheck $Context 'Install'
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    while ($receipt.health -cne 'healthy' -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 500; $receipt = Invoke-CentralWorkerCheck $Context 'Check' }
    if ($receipt.health -cne 'healthy' -or $receipt.heartbeatAgeSeconds -gt 15) { throw 'central-worker-health-timeout' }
    return $receipt
}
function Invoke-CentralProbe($Context) {
    Ensure-CentralProfile $Context
    $registry = Get-CentralRegistry $Context
    if (@($registry.targets).Count -gt 20) { throw 'central-probe-target-capacity' }
    $pool = [RunspaceFactory]::CreateRunspacePool(1,4); $pool.Open()
    $pending = New-Object 'Collections.Generic.Queue[object]'
    foreach ($target in $registry.targets) { $pending.Enqueue($target) }
    $running = New-Object Collections.ArrayList
    $observations = New-Object Collections.ArrayList
    $program = Join-Path $Context.plan.sourceRoot 'Collector.ps1'
    $runner = {param($Program,$Target,$WorkspaceId,$PrivateRoot) . $Program; Invoke-MonitorTarget $Target $WorkspaceId $PrivateRoot}
    $deadline = [DateTime]::UtcNow.AddSeconds(120)
    try {
        while ($pending.Count -or $running.Count) {
            $now = [DateTime]::UtcNow
            while ($pending.Count -and $running.Count -lt 4 -and $now -lt $deadline) {
                $target = $pending.Dequeue(); $pipeline = [PowerShell]::Create(); $pipeline.RunspacePool = $pool
                $null = $pipeline.AddScript($runner.ToString()).AddArgument($program).AddArgument($target).AddArgument($registry.workspaceId).AddArgument($Context.plan.protectedRoot)
                $null = $running.Add(@{target = $target; pipeline = $pipeline; handle = $pipeline.BeginInvoke(); deadline = $now.AddSeconds(45)})
            }
            foreach ($job in @($running.ToArray())) {
                if ($job.handle.IsCompleted -or $now -ge $job.deadline -or $now -ge $deadline) {
                    $result = @{status = 'error'; computerName = $null}
                    try {
                        if ($job.handle.IsCompleted) { $output = @($job.pipeline.EndInvoke($job.handle)); if ($output.Count -eq 1 -and $output[0].status -in @('connected','auth-failed','access-denied','unreachable','winrm-unavailable','unsupported','error')) { $result = $output[0] } }
                        else { $job.pipeline.Stop() }
                    } catch { $null = $_ } finally { $job.pipeline.Dispose(); $null = $running.Remove($job) }
                    $null = $observations.Add(@{targetId = $job.target.id; address = $job.target.address; transport = $job.target.transport; result = $result})
                }
            }
            if ($now -ge $deadline) { while ($pending.Count) { $target = $pending.Dequeue(); $null = $observations.Add(@{targetId = $target.id; address = $target.address; transport = $target.transport; result = @{status = 'error'; computerName = $null}}) } }
            if ($pending.Count -or $running.Count) { Start-Sleep -Milliseconds 100 }
        }
    } finally { foreach ($job in @($running.ToArray())) { try { $job.pipeline.Stop() } finally { $job.pipeline.Dispose() } }; $pool.Close(); $pool.Dispose() }
    $receipt = @{version = 1; id = $Context.plan.id; workspaceId = $registry.workspaceId; planSha256 = $Context.planSha256; observedAt = [DateTime]::UtcNow.ToString('o'); observations = @($observations.ToArray())}
    $receiptName = $Context.plan.id + '-probe-' + [Guid]::NewGuid().ToString('N') + '.json'
    $directory = Join-Path $Context.plan.protectedRoot 'receipts'
    Assert-MonitorPrivateAcl $directory
    $receiptPath = Join-Path $directory $receiptName
    Write-MonitorJsonNew $receiptPath $receipt 8388608
    $counts = @{}
    $connectedTransports = @{}
    foreach ($observation in $observations) {
        $status = [string]$observation.result.status; if (-not $counts.ContainsKey($status)) { $counts[$status] = 0 }; $counts[$status]++
        if ($status -eq 'connected') { $kind = [string]$observation.transport; if (-not $connectedTransports.ContainsKey($kind)) { $connectedTransports[$kind] = 0 }; $connectedTransports[$kind]++ }
    }
    $retained = @(Get-ChildItem -LiteralPath $directory -File | Where-Object { $_.Name -match '^smc_[a-f0-9]{32}-probe-[a-f0-9]{32}\.json$' } | Sort-Object LastWriteTimeUtc -Descending)
    foreach ($old in @($retained | Select-Object -Skip 20)) { $null = Assert-MonitorNoReparse $old.FullName; Remove-Item -LiteralPath $old.FullName -Force }
    return @{status = 'probed'; targetCount = $observations.Count; statusCounts = $counts; connectedByTransport = $connectedTransports; receiptFileName = $receiptName; receiptSha256 = (Get-FileHash -LiteralPath $receiptPath -Algorithm SHA256).Hash.ToLowerInvariant(); receiptBytes = (Get-Item -LiteralPath $receiptPath).Length}
}

if ($MyInvocation.InvocationName -ne '.') {
    $context = $null
    try {
        if (-not $Action -or -not $PlanPath -or -not $PlanSha256) { throw 'central-arguments-required' }
        $context = Get-CentralContext $PlanPath $PlanSha256
        . (Join-Path $context.plan.sourceRoot 'Common.ps1')
        $result = switch ($Action) {
            'Prepare' { Invoke-CentralPrepare $context }
            'Install' { Invoke-CentralInstall $context }
            'Check' { Assert-CentralPrepared $context; Assert-CentralProfile $context; Invoke-CentralWorkerCheck $context 'Check' }
            'Probe' { Invoke-CentralProbe $context }
        }
        @{version = 1; id = $context.plan.id; action = $Action; result = $result} | ConvertTo-Json -Depth 6 -Compress
    } catch {
        $code = 'central-operation-failed'
        if ($_.Exception.Message -match '^(?:central|monitor)-[a-z0-9-]{1,100}$') { $code = $_.Exception.Message }
        @{version = 1; action = $Action; status = 'failed'; code = $code} | ConvertTo-Json -Compress
        exit 1
    }
}
