# Native PS5 filesystem fixtures and scheduler doubles; no real task, secret or network.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Update-Enrollment.ps1')
. (Join-Path $PSScriptRoot 'Common.ps1')
$script:Passed = 0
function Assert-EnrollmentTest($Condition,[string]$Name) { if (-not $Condition) { throw ('enrollment-fixture-failed-' + $Name) }; $script:Passed++ }
function Assert-EnrollmentReject([scriptblock]$Operation,[string]$Code) { $rejected = $false; try { & $Operation } catch { $rejected = $_.Exception.Message -ceq $Code }; Assert-EnrollmentTest $rejected $Code }
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('DevSetuEnrollmentFixture-' + [Guid]::NewGuid().ToString('N'))
$expectedRoot = [IO.Path]::GetFullPath($temporary)
$null = New-Item -ItemType Directory -Path $temporary
$script:FixtureNow = [DateTime]::UtcNow
$script:FixtureTask = $null; $script:FixtureXml = $null; $script:FixtureSddl = 'fixture-task-security'; $script:Started = 0; $script:Stopped = 0; $script:FailDigest = ''; $script:HeartbeatAt = $null; $script:ActiveContext = $null; $script:FaultCollectorApply = $false
$script:NativeReplace = (Get-Command Replace-EnrollmentFile).ScriptBlock
function Replace-EnrollmentFile {
    param($Context,$Name,$Source,$Digest,$Suffix)
    if ($script:FaultCollectorApply -and $Name -ceq 'Collector.ps1' -and $Suffix -ceq 'apply') { throw 'enrollment-update-fixture-partial-failure' }
    & $script:NativeReplace $Context $Name $Source $Digest $Suffix
}
function Get-WorkerUpdateNow { return $script:FixtureNow }
function Assert-WorkerUpdateSystem { }
function Assert-WorkerUpdatePrivate { param($Path) }
function New-WorkerUpdateScope { param($Path) if (Test-Path -LiteralPath $Path) { throw 'worker-update-scope-already-exists' }; $null = New-Item -ItemType Directory -Path $Path }
function Get-EnrollmentFileState {
    param($Path)
    # Retain actual owner/group/DACL for native File.Replace tests; fixture files
    # deliberately belong to the test user rather than changing any real ACL.
    $acl = Get-Acl -LiteralPath $Path
    $sections = [Security.AccessControl.AccessControlSections]::Owner -bor [Security.AccessControl.AccessControlSections]::Group -bor [Security.AccessControl.AccessControlSections]::Access
    return @{sha256 = Get-WorkerUpdateHash $Path; sddl = $acl.GetSecurityDescriptorSddlForm($sections); acl = $acl}
}
function Get-ScheduledTask { param($TaskName,$TaskPath,$ErrorAction) return $script:FixtureTask }
function Export-ScheduledTask { param($TaskName,$TaskPath) return $script:FixtureXml.OuterXml }
function Get-EnrollmentTaskSddl { param($Context) return $script:FixtureSddl }
function Stop-ScheduledTask { param($TaskName,$TaskPath) $script:Stopped++; $script:FixtureTask.State = 'Ready' }
function New-ScheduledTaskAction { param($Execute,$Argument,$WorkingDirectory) return [pscustomobject]@{Execute = $Execute; Arguments = $Argument; WorkingDirectory = $WorkingDirectory} }
function Set-ScheduledTask {
    param($TaskName,$TaskPath,$Action)
    $script:FixtureTask.Actions = @($Action)
    $script:FixtureXml.SelectSingleNode("//*[local-name()='Arguments']").InnerText = $Action.Arguments
}
function Write-EnrollmentFixtureHeartbeat {
    $digest = [regex]::Match($script:FixtureTask.Actions[0].Arguments,'-RegistrySha256 ([a-f0-9]{64})').Groups[1].Value
    $file = Join-Path (Join-Path (Join-Path $script:ActiveContext.plan.queueRoot $script:ActiveContext.plan.workspaceId) 'results') 'heartbeat.json'
    [IO.File]::WriteAllText($file,(@{version = 1; state = 'running'; at = $script:FixtureNow.ToString('o'); registrySha256 = $digest; targetCount = $script:ActiveContext.targetCount; active = 0; transport = 'native-system-worker'} | ConvertTo-Json -Compress))
    $script:HeartbeatAt = $script:FixtureNow
}
function Start-ScheduledTask { param($TaskName,$TaskPath) $script:Started++; $script:FixtureTask.State = 'Running'; Write-EnrollmentFixtureHeartbeat }
function Start-Sleep {
    param($Milliseconds)
    $script:FixtureNow = $script:FixtureNow.AddMilliseconds($Milliseconds)
    if ($null -ne $script:ActiveContext -and $script:FixtureTask.State -eq 'Running' -and $script:FixtureTask.Actions[0].Arguments -notmatch $script:FailDigest -and ($script:FixtureNow - $script:HeartbeatAt).TotalSeconds -ge 5) { Write-EnrollmentFixtureHeartbeat }
}
function Write-EnrollmentFixtureJson([string]$Path,$Value) { [IO.File]::WriteAllText($Path,($Value | ConvertTo-Json -Depth 8 -Compress)) }
function New-EnrollmentFixture([string]$Suffix) {
    $root = Join-Path $temporary $Suffix; $source = Join-Path $root 'staged'; $private = Join-Path $root 'operator'; $queue = Join-Path $root 'queue'; $program = Join-Path $private 'program'; $credentials = Join-Path $private 'credentials'
    foreach ($directory in @($source,$program,$credentials,(Join-Path (Join-Path $queue 'ws_fixture') 'results'),(Join-Path (Join-Path $queue 'ws_fixture') 'requests'))) { $null = New-Item -ItemType Directory -Path $directory }
    $names = @('Common.ps1','Collector.ps1','Worker.ps1','Protect-Credential.ps1','Install-Worker.ps1')
    foreach ($name in $names) { [IO.File]::Copy((Join-Path $PSScriptRoot $name),(Join-Path $program $name)); [IO.File]::Copy((Join-Path $PSScriptRoot $name),(Join-Path $source $name)) }
    $before = @{version = 1; files = @($names | ForEach-Object { @{name = $_; sha256 = Get-WorkerUpdateHash (Join-Path $program $_)} })}
    Write-EnrollmentFixtureJson (Join-Path $source 'before-manifest.v1.json') $before
    [IO.File]::AppendAllText((Join-Path $source 'Common.ps1'),"`nfunction Assert-MonitorQueueAcl { param(`$Path,`$AppSid,`$Writable) }`n")
    [IO.File]::AppendAllText((Join-Path $source 'Collector.ps1'),"`n# approved fixture program delta`n")
    $after = @{version = 1; files = @($names | ForEach-Object { @{name = $_; sha256 = Get-WorkerUpdateHash (Join-Path $source $_)} })}
    Write-EnrollmentFixtureJson (Join-Path $source 'manifest.v1.json') $after
    $remote = [pscustomobject]@{id = ''; workspaceId = 'ws_fixture'; address = '10.0.0.9'; port = 5985; transport = 'winrm-http'; credentialProfile = 'fixture_profile'; revision = 1; enabled = $true; endpointHost = 'fixture9.example.internal'; authentication = 'Kerberos'; expectedComputerName = 'FIXTURE9'}
    $remote.id = Get-EnrollmentTargetId $remote
    $other = $remote.PSObject.Copy(); $other.address = '10.0.0.5'; $other.endpointHost = 'fixture5.example.internal'; $other.expectedComputerName = 'FIXTURE5'; $other.id = Get-EnrollmentTargetId $other
    $newRemote = $remote.PSObject.Copy(); $newRemote.port = 5052; $newRemote.id = Get-EnrollmentTargetId $newRemote; $newRemote.revision = 2
    Write-EnrollmentFixtureJson (Join-Path $private 'registry.v1.json') @{version = 1; workspaceId = 'ws_fixture'; targets = @($remote,$other)}
    Write-EnrollmentFixtureJson (Join-Path $source 'registry.v1.json') @{version = 1; workspaceId = 'ws_fixture'; targets = @($newRemote,$other)}
    [IO.File]::WriteAllText((Join-Path $credentials 'fixture_profile.dpapi'),'opaque encrypted fixture only')
    [IO.File]::WriteAllText((Join-Path $queue 'unrelated.txt'),'customer queue fixture')
    $plan = [pscustomobject]@{version = 1; kind = 'devsetu.monitoring-enrollment-update.v1'; id = 'sme_' + [Guid]::NewGuid().ToString('N'); actorId = 'usr_fixture_admin'; sourceHead = ('a' * 40); expectedComputerName = $env:COMPUTERNAME; workspaceId = 'ws_fixture'; protectedRoot = $private; queueRoot = $queue; stagingRoot = $source; oldRegistrySha256 = Get-WorkerUpdateHash (Join-Path $private 'registry.v1.json'); newRegistrySha256 = Get-WorkerUpdateHash (Join-Path $source 'registry.v1.json'); oldManifestSha256 = Get-WorkerUpdateHash (Join-Path $source 'before-manifest.v1.json'); newManifestSha256 = Get-WorkerUpdateHash (Join-Path $source 'manifest.v1.json'); appIdentitySid = 'S-1-5-19'; targetUpdates = @([pscustomobject]@{previousId = $remote.id; nextId = $newRemote.id}); createdAt = $script:FixtureNow.AddMinutes(-1).ToString('o'); expiresAt = $script:FixtureNow.AddHours(1).ToString('o')}
    $planPath = Join-Path $source 'plan.v1.json'; Write-EnrollmentFixtureJson $planPath $plan
    $partial = @{plan = $plan; workerPath = Join-Path $program 'Worker.ps1'}
    $arguments = Get-EnrollmentArguments $partial $plan.oldRegistrySha256
    $powerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $script:FixtureTask = [pscustomobject]@{State = 'Ready'; Principal = [pscustomobject]@{UserId = 'SYSTEM'; LogonType = 'ServiceAccount'; RunLevel = 'Highest'}; Actions = @([pscustomobject]@{Execute = $powerShell; Arguments = $arguments; WorkingDirectory = $program})}
    $escape = [Security.SecurityElement]::Escape($arguments)
    $script:FixtureXml = [xml]('<Task xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"><RegistrationInfo><URI>fixture</URI></RegistrationInfo><Triggers><BootTrigger><Enabled>true</Enabled></BootTrigger></Triggers><Principals><Principal><UserId>S-1-5-18</UserId><RunLevel>HighestAvailable</RunLevel></Principal></Principals><Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><ExecutionTimeLimit>PT0S</ExecutionTimeLimit></Settings><Actions><Exec><Command>powershell</Command><Arguments>' + $escape + '</Arguments><WorkingDirectory>fixture</WorkingDirectory></Exec></Actions></Task>')
    $script:FailDigest = 'never-a-digest'
    return @{plan = $plan; file = $planPath; hash = Get-WorkerUpdateHash $planPath; before = $before; after = $after; remote = $remote; other = $other; newRemote = $newRemote}
}
try {
    $fixture = New-EnrollmentFixture 'success'
    Assert-EnrollmentReject { Get-EnrollmentContext $fixture.file ('0' * 64) } 'enrollment-update-plan-hash-mismatch'
    $copy = $fixture.plan.PSObject.Copy(); $copy.actorId = 'not-an-actor'
    Assert-EnrollmentReject { Assert-EnrollmentPlan $copy $env:COMPUTERNAME $fixture.file } 'enrollment-update-plan-identity-rejected'
    $copy = $fixture.plan.PSObject.Copy(); $copy.expectedComputerName = 'OTHER'
    Assert-EnrollmentReject { Assert-EnrollmentPlan $copy $env:COMPUTERNAME $fixture.file } 'enrollment-update-plan-identity-rejected'
    $copy = $fixture.plan.PSObject.Copy(); $copy | Add-Member command 'not allowed'
    Assert-EnrollmentReject { Assert-EnrollmentPlan $copy $env:COMPUTERNAME $fixture.file } 'worker-update-invalid-shape'
    $copy = $fixture.plan.PSObject.Copy(); $copy.expiresAt = $script:FixtureNow.AddHours(5).ToString('o')
    Assert-EnrollmentReject { Assert-EnrollmentPlan $copy $env:COMPUTERNAME $fixture.file } 'enrollment-update-plan-expired'
    $copy = $fixture.plan.PSObject.Copy(); $copy.queueRoot = Join-Path $copy.protectedRoot 'queue'
    Assert-EnrollmentReject { Assert-EnrollmentPlan $copy $env:COMPUTERNAME $fixture.file } 'enrollment-update-scope-separation-required'
    $script:FixtureTask.Principal.UserId = 'OTHER'
    Assert-EnrollmentReject { Get-EnrollmentContext $fixture.file $fixture.hash } 'worker-update-owned-task-mismatch'
    $script:FixtureTask.Principal.UserId = 'SYSTEM'
    $context = Get-EnrollmentContext $fixture.file $fixture.hash; $script:ActiveContext = $context
    $planned = Invoke-EnrollmentUpdate $context 'Plan'
    Assert-EnrollmentTest ($planned.status -eq 'planned' -and $script:Stopped -eq 0 -and $script:Started -eq 0 -and -not (Test-Path -LiteralPath $context.scope)) 'plan-is-read-only'
    $script:FixtureXml.SelectSingleNode("//*[local-name()='ExecutionTimeLimit']").InnerText = 'PT1H'
    Assert-EnrollmentReject { Assert-EnrollmentState $context $false $context.plan.oldRegistrySha256 } 'enrollment-update-unrelated-task-change'
    $script:FixtureXml.SelectSingleNode("//*[local-name()='ExecutionTimeLimit']").InnerText = 'PT0S'
    $script:FixtureSddl = 'tampered-task-security'
    Assert-EnrollmentReject { Assert-EnrollmentState $context $false $context.plan.oldRegistrySha256 } 'enrollment-update-unrelated-task-change'
    $script:FixtureSddl = 'fixture-task-security'
    $bad = [pscustomobject]@{version = 1; workspaceId = 'ws_fixture'; targets = @($fixture.newRemote,$fixture.other.PSObject.Copy())}; $bad.targets[1].endpointHost = 'unlisted.example.internal'
    $old = [pscustomobject]@{version = 1; workspaceId = 'ws_fixture'; targets = @($fixture.remote,$fixture.other)}
    Assert-EnrollmentReject { Assert-EnrollmentRegistries $old $bad $fixture.plan } 'enrollment-update-unlisted-target-change'
    $bad = [pscustomobject]@{version = 1; workspaceId = 'ws_fixture'; targets = @($fixture.newRemote.PSObject.Copy(),$fixture.other)}; $bad.targets[0].credentialProfile = 'other_profile'
    Assert-EnrollmentReject { Assert-EnrollmentRegistries $old $bad $fixture.plan } 'enrollment-update-unapproved-target-change'
    $bad = [pscustomobject]@{version = 1; workspaceId = 'ws_fixture'; targets = @($fixture.newRemote.PSObject.Copy(),$fixture.other)}; $bad.targets[0].id = $fixture.remote.id
    Assert-EnrollmentReject { Assert-EnrollmentRegistries $old $bad $fixture.plan } 'enrollment-update-registry-target-rejected'
    $result = Invoke-EnrollmentUpdate $context 'Apply'
    Assert-EnrollmentTest ($result.status -eq 'succeeded' -and $result.health.advancingHeartbeats -and $result.fileSecurityPreserved) 'native-files-updated-with-advancing-health'
    Assert-EnrollmentTest (([DateTimeOffset]::Parse($result.health.secondAt) - [DateTimeOffset]::Parse($result.health.firstAt)).TotalSeconds -ge 5) 'two-observations-at-least-five-seconds-apart'
    Assert-EnrollmentState $context $true $context.plan.newRegistrySha256
    Assert-EnrollmentTest ($script:FixtureTask.Actions[0].Arguments -match $context.plan.newRegistrySha256 -and $script:FixtureTask.State -eq 'Running') 'only-owned-registry-task-argument-updated'
    Assert-EnrollmentTest ([IO.File]::ReadAllText((Join-Path $context.plan.queueRoot 'unrelated.txt')) -ceq 'customer queue fixture') 'customer-queue-untouched'
    foreach ($name in @('Common.ps1','Collector.ps1','Worker.ps1','Protect-Credential.ps1','Install-Worker.ps1','registry.v1.json')) {
        Assert-EnrollmentTest ((Get-WorkerUpdateHash (Join-Path $context.scope ($name + '.before'))) -ceq $context.states[$name].sha256) ('full-preimage-' + $name)
    }
    Assert-EnrollmentTest ((Test-Path -LiteralPath (Join-Path $context.scope 'receipt.json')) -and (Test-Path -LiteralPath (Join-Path $context.scope 'preimages.json'))) 'receipt-and-security-preimages-retained'
    Assert-EnrollmentReject { Get-EnrollmentContext $fixture.file $fixture.hash } 'enrollment-update-program-hash-mismatch'
    $fixture = New-EnrollmentFixture 'recovery'; $context = Get-EnrollmentContext $fixture.file $fixture.hash; $script:ActiveContext = $context
    $script:FailDigest = $context.plan.newRegistrySha256
    $failed = Invoke-EnrollmentUpdate $context 'Apply'
    Assert-EnrollmentTest ($failed.status -eq 'failed' -and $failed.code -eq 'worker-update-heartbeat-did-not-advance') 'one-new-heartbeat-never-passes'
    Assert-EnrollmentTest ($failed.recovery -eq 'old-programs-registry-task-restored-and-healthy') 'mapped-recovery-verifies-old-worker-health'
    Assert-EnrollmentState $context $false $context.plan.oldRegistrySha256
    Assert-EnrollmentTest ($script:FixtureTask.Actions[0].Arguments -match $context.plan.oldRegistrySha256 -and $script:FixtureTask.State -eq 'Running') 'old-task-digest-restored'
    foreach ($name in @('Common.ps1','Collector.ps1','registry.v1.json')) { Assert-EnrollmentTest (Test-Path -LiteralPath (Join-Path $context.scope ($name + '.restore.replaced'))) ('failed-new-byte-image-retained-' + $name) }
    $fixture = New-EnrollmentFixture 'partial-recovery'; $context = Get-EnrollmentContext $fixture.file $fixture.hash; $script:ActiveContext = $context
    $script:FaultCollectorApply = $true
    $failed = Invoke-EnrollmentUpdate $context 'Apply'
    $script:FaultCollectorApply = $false
    Assert-EnrollmentTest ($failed.status -eq 'failed' -and $failed.code -eq 'enrollment-update-fixture-partial-failure' -and $failed.recovery -eq 'old-programs-registry-task-restored-and-healthy') 'partial-replacement-restores-old-program-and-task'
    Assert-EnrollmentState $context $false $context.plan.oldRegistrySha256
    Assert-EnrollmentTest (-not (Test-Path -LiteralPath (Join-Path $context.scope 'registry.v1.json.apply.replaced'))) 'partial-failure-does-not-apply-later-registry'
    $fixture = New-EnrollmentFixture 'collision'; $context = Get-EnrollmentContext $fixture.file $fixture.hash
    $null = New-Item -ItemType Directory -Path $context.scope
    Assert-EnrollmentReject { Get-EnrollmentContext $fixture.file $fixture.hash } 'enrollment-update-scope-already-exists'
    $fixture = New-EnrollmentFixture 'credential-change'; $context = Get-EnrollmentContext $fixture.file $fixture.hash; $script:ActiveContext = $context
    [IO.File]::AppendAllText((Join-Path (Join-Path $context.plan.protectedRoot 'credentials') 'fixture_profile.dpapi'),'tampered')
    Assert-EnrollmentReject { Invoke-EnrollmentUpdate $context 'Apply' } 'enrollment-update-credential-changed'
    Assert-EnrollmentTest (-not (Test-Path -LiteralPath $context.scope)) 'changed-credential-never-starts-update'
    $fixture = New-EnrollmentFixture 'changed-source'; $context = Get-EnrollmentContext $fixture.file $fixture.hash; $script:ActiveContext = $context
    [IO.File]::AppendAllText($context.files['Collector.ps1'],'tampered')
    Assert-EnrollmentReject { Invoke-EnrollmentUpdate $context 'Apply' } 'enrollment-update-preservation-failed'
    Assert-EnrollmentTest (-not (Test-Path -LiteralPath $context.scope)) 'changed-preimage-does-not-stop-or-start-update'
    foreach ($name in @('Update-Enrollment.ps1','Test-EnrollmentUpdate.ps1')) { $tokens = $null; $errors = $null; $null = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $name),[ref]$tokens,[ref]$errors); Assert-EnrollmentTest ($errors.Count -eq 0) ('parser-' + $name) }
    @{status = 'PASS'; assertions = $script:Passed; remoteConnections = 0; realCredentialsRead = $false; nativeTasksChanged = $false; listeners = 0; databaseStarted = $false; actualFixtureAtomicReplace = $true; fullFileSecurityRoundtrip = $true; rollbackTested = $true} | ConvertTo-Json -Compress
} finally {
    $actual = [IO.Path]::GetFullPath($temporary)
    if ($actual -cne $expectedRoot -or [IO.Directory]::GetParent($actual).FullName.TrimEnd('\') -ine [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') -or [IO.Path]::GetFileName($actual) -notmatch '^DevSetuEnrollmentFixture-[a-f0-9]{32}$') { throw 'enrollment-fixture-cleanup-rejected' }
    Remove-Item -LiteralPath $actual -Recurse -Force
}
