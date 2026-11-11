# Pure filesystem/runspace fixtures only: no remote endpoint, SYSTEM task or real secret.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Common.ps1')
. (Join-Path $PSScriptRoot 'Configure-Central.ps1')
$script:Passed = 0
function Assert-CentralTest($Condition,[string]$Name) { if (-not $Condition) { throw ('central-fixture-failed-' + $Name) }; $script:Passed++ }
function Assert-CentralReject([scriptblock]$Operation,[string]$Code) {
    $rejected = $false
    try { & $Operation } catch { $rejected = $_.Exception.Message -eq $Code }
    Assert-CentralTest $rejected $Code
}
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('DevSetuCentralFixture-' + [Guid]::NewGuid().ToString('N'))
$expectedRoot = [IO.Path]::GetFullPath($temporary)
$source = Join-Path $temporary 'source'
$private = Join-Path $temporary 'operator'
$queue = Join-Path $temporary 'queue'
$null = New-Item -ItemType Directory -Path $source
try {
    foreach ($name in @('Common.ps1','Collector.ps1','Worker.ps1','Protect-Credential.ps1','Install-Worker.ps1','manifest.v1.json')) { [IO.File]::Copy((Join-Path $PSScriptRoot $name),(Join-Path $source $name)) }
    $registryPath = Join-Path $source 'registry.v1.json'
    [IO.File]::WriteAllText($registryPath,'{"version":1,"workspaceId":"ws_fixture","targets":[]}')
    $plan = [pscustomobject]@{version = 1; id = 'smc_' + ('a' * 32); expectedComputerName = $env:COMPUTERNAME; workspaceId = 'ws_fixture'; protectedRoot = $private; queueRoot = $queue; sourceRoot = $source; registryPath = $registryPath; registrySha256 = (Get-FileHash -LiteralPath $registryPath).Hash.ToLowerInvariant(); manifestSha256 = (Get-FileHash -LiteralPath (Join-Path $source 'manifest.v1.json')).Hash.ToLowerInvariant(); appIdentitySid = 'S-1-5-19'; credentialProfile = 'fixture_profile'}
    $planPath = Join-Path $source 'plan.v1.json'
    Assert-CentralPlan $plan $env:COMPUTERNAME $planPath
    Assert-CentralTest $true 'valid-closed-plan'
    $copy = $plan.PSObject.Copy(); $copy | Add-Member command 'not allowed'
    Assert-CentralReject { Assert-CentralPlan $copy $env:COMPUTERNAME $planPath } 'central-invalid-shape'
    $copy = $plan.PSObject.Copy(); $copy.expectedComputerName = 'WRONG-COMPUTER'
    Assert-CentralReject { Assert-CentralPlan $copy $env:COMPUTERNAME $planPath } 'central-plan-identity-rejected'
    $copy = $plan.PSObject.Copy(); $copy.queueRoot = '\\server\share'
    Assert-CentralReject { Assert-CentralPlan $copy $env:COMPUTERNAME $planPath } 'central-local-specific-path-required'
    $copy = $plan.PSObject.Copy(); $copy.queueRoot = Join-Path $private 'queue'
    Assert-CentralReject { Assert-CentralPlan $copy $env:COMPUTERNAME $planPath } 'central-scope-separation-required'
    $copy = $plan.PSObject.Copy(); $copy.registryPath = Join-Path $private 'registry.v1.json'
    Assert-CentralReject { Assert-CentralPlan $copy $env:COMPUTERNAME $planPath } 'central-staged-path-binding-rejected'
    $copy = $plan.PSObject.Copy(); $copy.credentialProfile = '../profile'
    Assert-CentralReject { Assert-CentralPlan $copy $env:COMPUTERNAME $planPath } 'central-plan-policy-rejected'

    # Identity and ACL enforcement are covered by Test-Native.ps1. Mock them only
    # inside this unprivileged fixture process to test real plan/program hashing.
    function Assert-CentralSystem { }
    function Assert-CentralPrivateDirectory { param($Path) }
    [IO.File]::WriteAllText($planPath,($plan | ConvertTo-Json -Compress))
    $planHash = (Get-FileHash -LiteralPath $planPath).Hash.ToLowerInvariant()
    Assert-CentralReject { Get-CentralContext $planPath ('0' * 64) } 'central-plan-hash-mismatch'
    $context = Get-CentralContext $planPath $planHash
    Assert-CentralTest ($context.plan.id -ceq $plan.id) 'hashed-plan-and-programs'
    $worker = Join-Path $source 'Worker.ps1'
    [IO.File]::AppendAllText($worker,"`r`n# unreviewed fixture delta")
    Assert-CentralReject { Get-CentralContext $planPath $planHash } 'central-program-hash-mismatch'
    [IO.File]::Copy((Join-Path $PSScriptRoot 'Worker.ps1'),$worker,$true)

    $incomingRoot = Join-Path $private 'incoming'
    $null = New-Item -ItemType Directory -Path $incomingRoot
    $inputFile = Get-CentralIncoming $context
    $decoy = Join-Path $incomingRoot ('credential-' + ('b' * 32) + '.json')
    [IO.File]::WriteAllText($inputFile,'opaque fixture input only')
    [IO.File]::WriteAllText($decoy,'unrelated fixture remains')
    $inputHash = (Get-FileHash -LiteralPath $inputFile).Hash.ToLowerInvariant()
    $script:ProfileVerified = 0
    function Assert-CentralProfile { param($Context) $script:ProfileVerified++ }
    Remove-CentralSealedInput $context $inputHash
    Assert-CentralTest ($script:ProfileVerified -eq 1 -and -not (Test-Path -LiteralPath $inputFile) -and (Test-Path -LiteralPath $decoy)) 'only-verified-exact-input-removed'
    [IO.File]::WriteAllText($inputFile,'changed fixture input')
    Assert-CentralReject { Remove-CentralSealedInput $context $inputHash } 'central-input-changed-retained'
    Assert-CentralTest (Test-Path -LiteralPath $inputFile) 'changed-input-retained'
    function Assert-CentralProfile { param($Context) throw 'fixture-profile-verification-failed' }
    Assert-CentralReject { Remove-CentralSealedInput $context ((Get-FileHash -LiteralPath $inputFile).Hash.ToLowerInvariant()) } 'fixture-profile-verification-failed'
    Assert-CentralTest (Test-Path -LiteralPath $inputFile) 'failed-unseal-never-deletes-input'

    $script:Modes = @()
    $script:Ensured = 0
    function Ensure-CentralProfile { param($Context) $script:Ensured++ }
    function Invoke-CentralWorkerCheck {
        param($Context,$Mode)
        $script:Modes += $Mode
        if ($Mode -eq 'Install') { return [pscustomobject]@{health = 'starting'; heartbeatAgeSeconds = $null} }
        return [pscustomobject]@{health = 'healthy'; heartbeatAgeSeconds = 1}
    }
    $installed = Invoke-CentralInstall $context
    Assert-CentralTest ($script:Ensured -eq 1 -and ($script:Modes -join ',') -ceq 'Install,Check' -and $installed.health -eq 'healthy') 'install-waits-for-matching-health'

    # A tiny fixed inert fixture program exercises the actual bounded runspace
    # transport and receipt writer. The production manifest rejects this delta.
    [IO.File]::WriteAllText((Join-Path $source 'Collector.ps1'),"function Invoke-MonitorTarget { param(`$Target,`$WorkspaceId,`$ProtectedRoot) return @{status='connected';computerName='Fixture';snapshot=@{fixture=`$true}} }")
    $script:Registry = [pscustomobject]@{version = 1; workspaceId = 'ws_fixture'; targets = @([pscustomobject]@{id = 'srv_' + ('c' * 32); address = '10.0.0.20'; transport = 'local'},[pscustomobject]@{id = 'srv_' + ('d' * 32); address = '10.0.0.21'; transport = 'winrm-http'})}
    function Get-CentralRegistry { param($Context) return $script:Registry }
    function Assert-MonitorPrivateAcl { param($Path) }
    $null = New-Item -ItemType Directory -Path (Join-Path $private 'receipts')
    $probe = Invoke-CentralProbe $context
    Assert-CentralTest ($probe.targetCount -eq 2 -and $probe.statusCounts.connected -eq 2) 'bounded-probe-receipt-count'
    Assert-CentralTest ($probe.connectedByTransport.local -eq 1 -and $probe.connectedByTransport.'winrm-http' -eq 1) 'local-never-counted-as-winrm'
    $receipt = Read-MonitorJson (Join-Path (Join-Path $private 'receipts') $probe.receiptFileName)
    Assert-CentralTest ($receipt.observations.Count -eq 2 -and $probe.receiptBytes -lt 8388608) 'bounded-private-metric-receipt'
    $script:Registry.targets = @(1..21 | ForEach-Object { [pscustomobject]@{id = 'srv_' + ('e' * 32); address = '10.0.0.20'; transport = 'local'} })
    Assert-CentralReject { Invoke-CentralProbe $context } 'central-probe-target-capacity'

    foreach ($file in @('Configure-Central.ps1','Test-Central.ps1')) {
        $tokens = $null; $errors = $null
        $null = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $file),[ref]$tokens,[ref]$errors)
        Assert-CentralTest ($errors.Count -eq 0) ('parser-' + $file)
    }
    @{status = 'PASS'; assertions = $script:Passed; remoteConnections = 0; listeners = 0; databaseStarted = $false; nativeTaskInstalled = $false; realCredentialAccess = $false} | ConvertTo-Json -Compress
} finally {
    $actual = [IO.Path]::GetFullPath($temporary)
    if ($actual -cne $expectedRoot -or [IO.Directory]::GetParent($actual).FullName.TrimEnd('\') -ine [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') -or [IO.Path]::GetFileName($actual) -notmatch '^DevSetuCentralFixture-[a-f0-9]{32}$') { throw 'central-fixture-cleanup-rejected' }
    Remove-Item -LiteralPath $actual -Recurse -Force
}
