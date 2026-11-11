$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Collector.ps1')
$script:Passed = 0
function Assert-Test($Condition,[string]$Name) { if (-not $Condition) { throw ('fixture-failed: ' + $Name) }; $script:Passed++ }
function Assert-Rejected([scriptblock]$Action,[string]$Code,[string]$Name) {
    $rejected = $false
    try { & $Action } catch { $rejected = $_.Exception.Message -ceq $Code }
    Assert-Test $rejected $Name
}
foreach ($address in @('10.9.69.20','10.6.69.5','172.16.0.1','172.31.255.254','192.168.1.20')) { Assert-Test (Test-MonitorPrivateAddress $address) ('private-address-' + $address) }
foreach ($address in @('8.8.8.8','127.0.0.1','169.254.1.3','172.32.0.1','10.10.900','10.09.69.20','10.9.69.256','::1','http://10.9.69.20','10.9.69.20/path')) { Assert-Test (-not (Test-MonitorPrivateAddress $address)) 'reject-address' }
$target = [pscustomobject]@{id = 'srv_' + ('a' * 32); workspaceId = 'ws_fixture'; address = '10.9.69.20'; port = 5985; transport = 'local'; credentialProfile = 'fixture_profile'; revision = 1; enabled = $true; endpointHost = 'FIXTURE20'; authentication = 'Kerberos'; expectedComputerName = 'FIXTURE20'}
Assert-MonitorTarget $target 'ws_fixture'
$binding = Get-MonitorBinding 'ws_fixture' $target
$target.revision = 2
Assert-Test ((Get-MonitorBinding 'ws_fixture' $target) -ceq $binding) 'routine-revision-retains-enrollment'
$target.revision = 1
foreach ($edit in @(@{workspaceId = 'ws_other'},@{id = 'srv_' + ('b' * 32)},@{address = '10.9.69.21'},@{port = 5986},@{transport = 'winrm-https'},@{credentialProfile = 'other_profile'})) {
    $copy = $target.PSObject.Copy()
    foreach ($key in $edit.Keys) { $copy.$key = $edit[$key] }
    Assert-Test ((Get-MonitorBinding $copy.workspaceId $copy) -cne $binding) 'endpoint-identity-edit-requires-enrollment'
}
Assert-Test ($binding -eq '6af312024c22a0ff6544161a08aab04c23d3404e566793a364128d9afc4c7cfa') 'cross-runtime-binding'

# DNS policy fixtures are pure: no resolver, credential or network call is made.
$dnsTarget = $target.PSObject.Copy(); $dnsTarget.transport = 'winrm-http'; $dnsTarget.endpointHost = 'fixture.example.internal'
Assert-MonitorResolvedEndpoint $dnsTarget @('10.9.69.20')
Assert-MonitorResolvedEndpoint $dnsTarget @('10.9.69.20','10.9.69.20')
Assert-Test $true 'single-address-policy-remains-compatible'
Assert-Rejected { Assert-MonitorResolvedEndpoint $dnsTarget @('10.9.69.20','10.10.91.81') } 'monitor-dns-binding-rejected' 'unapproved-secondary-address-rejected'
Assert-Rejected { Assert-MonitorResolvedEndpoint $dnsTarget @() } 'monitor-dns-binding-rejected' 'empty-dns-answer-rejected'
Assert-Rejected { Assert-MonitorResolvedEndpoint $dnsTarget $null } 'monitor-dns-binding-rejected' 'null-dns-answer-rejected'
$multiTarget = $dnsTarget.PSObject.Copy()
$multiTarget | Add-Member -NotePropertyName approvedEndpointAddresses -NotePropertyValue @('10.9.69.20','10.10.91.81')
Assert-MonitorTarget $multiTarget 'ws_fixture'
Assert-MonitorResolvedEndpoint $multiTarget @('10.10.91.81','10.9.69.20')
Assert-Test $true 'explicit-approved-multi-interface-set-accepted'
Assert-Test ((Get-MonitorBinding 'ws_fixture' $multiTarget) -ceq (Get-MonitorBinding 'ws_fixture' $dnsTarget)) 'operator-dns-policy-retains-app-target-identity'
foreach ($answers in @(@('10.9.69.20'),@('10.9.69.20','10.10.91.82'),@('10.9.69.20','10.10.91.81','10.0.0.99'),@('10.9.69.20','2001:db8::1'),@('10.9.69.20','8.8.8.8'))) {
    Assert-Rejected { Assert-MonitorResolvedEndpoint $multiTarget $answers } 'monitor-dns-binding-rejected' 'dns-change-never-auto-enlarges-approved-set'
}
$copy = $multiTarget.PSObject.Copy(); $copy.authentication = 'Negotiate'
Assert-Rejected { Assert-MonitorTarget $copy 'ws_fixture' } 'monitor-invalid-approved-endpoint-policy' 'multi-interface-requires-kerberos'
$copy = $multiTarget.PSObject.Copy(); $copy.PSObject.Properties.Remove('expectedComputerName')
Assert-Rejected { Assert-MonitorTarget $copy 'ws_fixture' } 'monitor-invalid-approved-endpoint-policy' 'multi-interface-requires-computer-identity'
$copy = $multiTarget.PSObject.Copy(); $copy.expectedComputerName = '../other'
Assert-Rejected { Assert-MonitorTarget $copy 'ws_fixture' } 'monitor-invalid-approved-endpoint-policy' 'multi-interface-invalid-computer-identity-rejected'
$copy = $multiTarget.PSObject.Copy(); $copy.endpointHost = $copy.address
Assert-Rejected { Assert-MonitorTarget $copy 'ws_fixture' } 'monitor-invalid-approved-endpoint-policy' 'multi-interface-requires-hostname'
$copy = $multiTarget.PSObject.Copy(); $copy.transport = 'local'
Assert-Rejected { Assert-MonitorTarget $copy 'ws_fixture' } 'monitor-invalid-approved-endpoint-policy' 'multi-interface-not-valid-for-local-transport'
foreach ($policy in @(@('10.9.69.20','10.9.69.20'),@('10.9.69.20','8.8.8.8'),@('10.9.69.20','::1'),@('10.9.69.20','10.09.69.21'),@('10.9.69.20',42))) {
    $copy = $multiTarget.PSObject.Copy(); $copy.approvedEndpointAddresses = $policy
    Assert-Rejected { Assert-MonitorTarget $copy 'ws_fixture' } 'monitor-invalid-approved-endpoint-set' 'unbounded-or-nonprivate-enrollment-rejected'
}
$copy = $multiTarget.PSObject.Copy(); $copy.approvedEndpointAddresses = '10.9.69.20'
Assert-Rejected { Assert-MonitorTarget $copy 'ws_fixture' } 'monitor-invalid-approved-endpoint-set' 'approved-set-must-be-array'
$copy = $multiTarget.PSObject.Copy(); $copy.approvedEndpointAddresses = @()
Assert-Rejected { Assert-MonitorTarget $copy 'ws_fixture' } 'monitor-invalid-approved-endpoint-set' 'empty-approved-set-rejected'
$copy = $multiTarget.PSObject.Copy(); $copy.approvedEndpointAddresses = @(1..9 | ForEach-Object { '10.0.0.' + $_ })
Assert-Rejected { Assert-MonitorTarget $copy 'ws_fixture' } 'monitor-invalid-approved-endpoint-set' 'approved-set-capacity-bounded'
$copy = $multiTarget.PSObject.Copy(); $copy.approvedEndpointAddresses = @('10.10.91.81')
Assert-Rejected { Assert-MonitorTarget $copy 'ws_fixture' } 'monitor-approved-endpoint-primary-missing' 'primary-endpoint-required-in-enrollment'

# Pure in-process fixtures: no remote connections, listener, database or installed collector.
$script:FixtureUnsupported = $false
function Get-CimInstance {
    param($ClassName,$Filter,$OperationTimeoutSec)
    switch ($ClassName) {
        'Win32_OperatingSystem' { return [pscustomobject]@{TotalVisibleMemorySize = 8388608; FreePhysicalMemory = 2097152; Caption = 'Fixture Windows'; LastBootUpTime = [DateTime]::UtcNow.AddHours(-1)} }
        'Win32_ComputerSystem' { return [pscustomobject]@{Name = 'FIXTURE20'; NumberOfLogicalProcessors = 8} }
        'Win32_PerfFormattedData_PerfOS_Processor' { if ($script:FixtureUnsupported) { throw 'fixture unsupported' }; return [pscustomobject]@{PercentProcessorTime = 73} }
        'Win32_Processor' { throw 'fixture unsupported' }
        'Win32_LogicalDisk' { return [pscustomobject]@{DeviceID = 'C:'; Size = 10000; FreeSpace = 4000} }
        'Win32_PerfFormattedData_Tcpip_NetworkInterface' { if ($script:FixtureUnsupported) { throw 'fixture unsupported' }; return [pscustomobject]@{BytesReceivedPersec = 200; BytesSentPersec = 100} }
        'Win32_PerfFormattedData_PerfProc_Process' {
            if ($script:FixtureUnsupported) { throw 'fixture unsupported' }
            return @([pscustomobject]@{IDProcess = 4; Name = 'Fixture'; PercentProcessorTime = 400; WorkingSetPrivate = 5000},[pscustomobject]@{IDProcess = 0; Name = 'Idle'; PercentProcessorTime = 0; WorkingSetPrivate = 0})
        }
        'Win32_Service' { return [pscustomobject]@{Name = 'FixtureSvc'; DisplayName = 'Fixture Service'; State = 'Running'; StartMode = 'Auto'; ProcessId = 4; StartName = 'must-not-leak'; PathName = 'must-not-leak'} }
        default { throw 'unexpected fixture class' }
    }
}
function Get-Process { return [pscustomobject]@{Id = 44; ProcessName = 'FixtureFallback'; CPU = 999999; WorkingSet64 = 5000} }
$json = & $script:MonitorSnapshotProgram
$value = $json | ConvertFrom-Json
Assert-Test ($value.cpuPercent -eq 73) 'whole-computer-current-percent'
Assert-Test ($value.logicalProcessors -eq 8) 'logical-core-count'
Assert-Test ($value.processes.Count -eq 1 -and $value.processes[0].cpuPercent -eq 50) 'process-percent-normalized-to-cores'
Assert-Test ($value.memoryTotalBytes -eq 8589934592 -and $value.memoryAvailableBytes -eq 2147483648) 'memory-kib-to-bytes'
Assert-Test ($value.network.receivedBytesPerSecond -eq 200) 'network-rate-counter'
Assert-Test ($value.disks.Count -eq 1 -and $value.disks[0].freeBytes -eq 4000) 'disk-free-bytes'
Assert-Test ($value.services.Count -eq 1 -and $value.services[0].state -eq 'Running') 'service-metadata'
Assert-Test ($json -notmatch 'must-not-leak|StartName|PathName|CommandLine') 'no-credential-bearing-service-fields'
$script:FixtureUnsupported = $true
$value = (& $script:MonitorSnapshotProgram) | ConvertFrom-Json
Assert-Test ($null -eq $value.cpuPercent) 'unsupported-cpu-null'
Assert-Test ($null -eq $value.processes[0].cpuPercent -and $value.processes[0].pid -eq 44) 'never-use-cumulative-process-cpu'
Assert-Test ($null -eq $value.network.receivedBytesPerSecond -and $null -eq $value.network.sentBytesPerSecond) 'unsupported-network-null'
$script:FixtureAcl = New-Object Security.AccessControl.DirectorySecurity
$script:FixtureAcl.SetAccessRuleProtection($true,$false)
$script:FixtureAcl.SetOwner((New-Object Security.Principal.SecurityIdentifier('S-1-5-18')))
$script:FixtureAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier('S-1-5-18')),'FullControl','ContainerInherit,ObjectInherit','None','Allow')))
$script:FixtureAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier('S-1-5-19')),'ReadAndExecute','ContainerInherit,ObjectInherit','None','Allow')))
function Get-Acl { param($LiteralPath) return $script:FixtureAcl }
Assert-MonitorQueueAcl $PSScriptRoot 'S-1-5-19' $false
Assert-Test $true 'result-queue-app-readonly-acl'
$script:FixtureAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier('S-1-5-19')),'Modify','ContainerInherit,ObjectInherit','None','Allow')))
$rejected = $false
try { Assert-MonitorQueueAcl $PSScriptRoot 'S-1-5-19' $false } catch { $rejected = $_.Exception.Message -eq 'monitor-queue-acl-rejected' }
Assert-Test $rejected 'result-queue-app-write-rejected'
Assert-MonitorQueueAcl $PSScriptRoot 'S-1-5-19' $true
Assert-Test $true 'request-queue-app-modify-acl'
$script:FixtureAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier('S-1-5-11')),'ReadAndExecute','ContainerInherit,ObjectInherit','None','Allow')))
$rejected = $false
try { Assert-MonitorQueueAcl $PSScriptRoot 'S-1-5-19' $true } catch { $rejected = $_.Exception.Message -eq 'monitor-queue-acl-rejected' }
Assert-Test $rejected 'unrelated-account-queue-acl-rejected'
if ([Security.Principal.WindowsIdentity]::GetCurrent().User.Value -ne 'S-1-5-18') {
    $rejected = $false
    try { Assert-MonitorSystem } catch { $rejected = $_.Exception.Message -eq 'monitor-system-identity-required' }
    Assert-Test $rejected 'regular-user-cannot-unseal-system-profile'
}
foreach ($file in Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.ps1' -File) {
    $tokens = $null; $errors = $null
    $null = [Management.Automation.Language.Parser]::ParseFile($file.FullName,[ref]$tokens,[ref]$errors)
    Assert-Test ($errors.Count -eq 0) ('parser-' + $file.Name)
}
$commands = @($script:MonitorSnapshotProgram.Ast.FindAll({param($node) $node -is [Management.Automation.Language.CommandAst]},$true) | ForEach-Object { $_.GetCommandName() })
Assert-Test (@($commands | Where-Object { $_ -match '^(Set-|Start-|Stop-|Restart-|Remove-|New-|Invoke-|Add-|Enable-|Disable-)' }).Count -eq 0) 'fixed-remote-program-has-no-mutation-verbs'
@{status = 'PASS'; assertions = $script:Passed; remoteConnections = 0; listeners = 0; databaseStarted = $false} | ConvertTo-Json -Compress
