. (Join-Path $PSScriptRoot 'Common.ps1')

# Fixed, read-only program. No user-supplied PowerShell is evaluated on the server.
$script:MonitorSnapshotProgram = {
    $ErrorActionPreference = 'Stop'
    function SafeLabel($Value, [string]$Fallback = 'Unknown') {
        $text = ([string]$Value -replace '[\x00-\x1f\x7f]',' ').Trim()
        if (-not $text) { return $Fallback }
        return $text.Substring(0,[Math]::Min(240,$text.Length))
    }
    function CounterPercent($Value, [double]$Divisor = 1) {
        if ($null -eq $Value -or $Divisor -le 0) { return $null }
        $number = 0.0
        if (-not [double]::TryParse([string]$Value,[ref]$number) -or [double]::IsNaN($number) -or [double]::IsInfinity($number)) { return $null }
        return [Math]::Round([Math]::Min([double]100,[Math]::Max([double]0,$number / $Divisor)),2)
    }
    $os = Get-CimInstance -ClassName Win32_OperatingSystem -OperationTimeoutSec 8
    $computer = Get-CimInstance -ClassName Win32_ComputerSystem -OperationTimeoutSec 8
    $cores = [int]$computer.NumberOfLogicalProcessors
    if ($cores -lt 1 -or $cores -gt 4096) { throw 'monitor-core-count-unavailable' }
    $cpu = $null
    try {
        $counter = Get-CimInstance -ClassName Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'" -OperationTimeoutSec 8
        $cpu = CounterPercent $counter.PercentProcessorTime
    } catch {
        try { $cpu = CounterPercent ((Get-CimInstance Win32_Processor -OperationTimeoutSec 8 | Measure-Object LoadPercentage -Average).Average) } catch { }
    }
    $total = [long]$os.TotalVisibleMemorySize * 1024
    if ($total -le 0) { throw 'monitor-memory-unavailable' }
    $available = [Math]::Min($total,[Math]::Max([long]0,[long]$os.FreePhysicalMemory * 1024))
    $disks = @()
    try {
        $disks = @(Get-CimInstance -ClassName Win32_LogicalDisk -Filter 'DriveType=3' -OperationTimeoutSec 8 | Sort-Object DeviceID | Select-Object -First 64 | ForEach-Object {
            if ([long]$_.Size -gt 0) { @{ name = SafeLabel $_.DeviceID; totalBytes = [long]$_.Size; freeBytes = [Math]::Min([long]$_.Size,[Math]::Max([long]0,[long]$_.FreeSpace)) } }
        })
    } catch { }
    $received = $null; $sent = $null
    try {
        $interfaces = @(Get-CimInstance Win32_PerfFormattedData_Tcpip_NetworkInterface -OperationTimeoutSec 8 | Select-Object -First 64)
        if ($interfaces.Count -gt 0) {
            $received = [Math]::Max([double]0,[double](($interfaces | Measure-Object BytesReceivedPersec -Sum).Sum))
            $sent = [Math]::Max([double]0,[double](($interfaces | Measure-Object BytesSentPersec -Sum).Sum))
        }
    } catch { }
    $processes = @()
    try {
        $all = @(Get-CimInstance Win32_PerfFormattedData_PerfProc_Process -OperationTimeoutSec 8 | Where-Object { $_.Name -ne '_Total' -and $_.Name -ne 'Idle' -and [int]$_.IDProcess -gt 0 })
        $selected = @(@($all | Sort-Object PercentProcessorTime -Descending | Select-Object -First 10) + @($all | Sort-Object WorkingSetPrivate -Descending | Select-Object -First 10))
        $seen = @{}
        $processes = @($selected | ForEach-Object {
            $pidValue = [int]$_.IDProcess
            if (-not $seen.ContainsKey($pidValue)) {
                $seen[$pidValue] = $true
                @{ pid = $pidValue; name = SafeLabel $_.Name; cpuPercent = CounterPercent $_.PercentProcessorTime $cores; workingSetBytes = [Math]::Max([long]0,[long]$_.WorkingSetPrivate) }
            }
        })
    } catch {
        # Get-Process.CPU is cumulative seconds; it must never be shown as utilization.
        try { $processes = @(Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 10 | ForEach-Object { @{pid = $_.Id; name = SafeLabel $_.ProcessName; cpuPercent = $null; workingSetBytes = [Math]::Max([long]0,[long]$_.WorkingSet64)} }) } catch { }
    }
    $services = @()
    try {
        $services = @(Get-CimInstance Win32_Service -OperationTimeoutSec 8 | Sort-Object Name | Select-Object -First 1000 | ForEach-Object {
            @{ name = SafeLabel $_.Name; displayName = SafeLabel $_.DisplayName; state = SafeLabel $_.State; startMode = SafeLabel $_.StartMode; pid = [int]$_.ProcessId }
        })
    } catch { }
    $now = [DateTime]::UtcNow
    $uptime = [Math]::Max([double]0,($now - $os.LastBootUpTime.ToUniversalTime()).TotalSeconds)
    @{ observedAt = $now.ToString('o'); computerName = SafeLabel $computer.Name; osName = SafeLabel $os.Caption; uptimeSeconds = [Math]::Round($uptime); logicalProcessors = $cores; cpuPercent = $cpu; memoryTotalBytes = $total; memoryAvailableBytes = $available; disks = @($disks); network = @{receivedBytesPerSecond = $received; sentBytesPerSecond = $sent}; processes = @($processes); services = @($services) } | ConvertTo-Json -Depth 8 -Compress
}

function Get-MonitorFailureStatus($ErrorRecord) {
    $id = [string]$ErrorRecord.FullyQualifiedErrorId
    $message = [string]$ErrorRecord.Exception.Message
    if ($id -match 'LogonFailure|AuthenticationFailed|InvalidCredential' -or $message -match '0x8009030c|0x8007052e|logon failure|user name or password is incorrect') { return 'auth-failed' }
    if ($id -match 'AccessDenied|UnauthorizedAccess' -or $message -match '0x80070005|Access is denied') { return 'access-denied' }
    if ($id -match 'InvalidClass|NotSupported' -or $message -match 'monitor-memory-unavailable|monitor-core-count-unavailable|invalid class|not supported') { return 'unsupported' }
    if ($message -match 'monitor-endpoint-unreachable') { return 'unreachable' }
    if ($id -match 'PSSessionOpenFailed|PSRemotingTransportException|WinRM' -or $message -match 'WinRM|WS-Management|TrustedHosts|Kerberos|monitor-dns-binding-rejected|monitor-winrm-port-closed') { return 'winrm-unavailable' }
    return 'error'
}
function Invoke-MonitorTarget($Target, [string]$WorkspaceId, [string]$ProtectedRoot) {
    Assert-MonitorTarget $Target $WorkspaceId
    if (-not $Target.enabled) { return @{status = 'unsupported'; computerName = $null} }
    $session = $null
    try {
        if ($Target.transport -eq 'local') {
            # Explicit enrollment is required. This is never reported as a WinRM login.
            if (-not $Target.PSObject.Properties['expectedComputerName'] -or $Target.expectedComputerName -ine $env:COMPUTERNAME) { throw 'monitor-local-binding-rejected' }
            $local = @([Net.Dns]::GetHostAddresses([Net.Dns]::GetHostName()) | ForEach-Object { $_.ToString() })
            if ($local -notcontains $Target.address) { throw 'monitor-local-binding-rejected' }
            $json = & $script:MonitorSnapshotProgram
        } else {
            $addresses = @([Net.Dns]::GetHostAddresses($Target.endpointHost) | ForEach-Object { $_.ToString() })
            # A hostname may not resolve outside its exact enrolled IPv4 endpoint.
            if ($addresses.Count -lt 1 -or @($addresses | Where-Object { $_ -cne $Target.address }).Count -gt 0) { throw 'monitor-dns-binding-rejected' }
            $tcp = New-Object Net.Sockets.TcpClient
            try {
                $pending = $tcp.BeginConnect($Target.address,[int]$Target.port,$null,$null)
                if (-not $pending.AsyncWaitHandle.WaitOne(3000,$false)) { throw 'monitor-endpoint-unreachable' }
                $tcp.EndConnect($pending)
            } catch {
                if ($_.Exception.InnerException -is [Net.Sockets.SocketException] -and $_.Exception.InnerException.SocketErrorCode -eq [Net.Sockets.SocketError]::ConnectionRefused) { throw 'monitor-winrm-port-closed' }
                throw 'monitor-endpoint-unreachable'
            } finally { $tcp.Dispose() }
            $credential = Get-MonitorCredential $ProtectedRoot $Target.credentialProfile
            $options = New-PSSessionOption -OpenTimeout 8000 -OperationTimeout 12000 -IdleTimeout 60000 -MaximumReceivedDataSizePerCommand 2097152 -MaximumReceivedObjectSize 2097152
            $parameters = @{ComputerName = $Target.endpointHost; Port = [int]$Target.port; Credential = $credential; Authentication = $Target.authentication; SessionOption = $options; ErrorAction = 'Stop'}
            if ($Target.transport -eq 'winrm-https') { $parameters.UseSSL = $true }
            $session = New-PSSession @parameters
            $json = Invoke-Command -Session $session -ScriptBlock $script:MonitorSnapshotProgram -ErrorAction Stop
        }
        if ($json -isnot [string] -or [Text.Encoding]::UTF8.GetByteCount($json) -gt 1048576) { throw 'monitor-invalid-snapshot' }
        $snapshot = $json | ConvertFrom-Json
        if ($Target.PSObject.Properties['expectedComputerName'] -and $Target.expectedComputerName -and $snapshot.computerName -ine $Target.expectedComputerName) { throw 'monitor-computer-identity-mismatch' }
        return @{status = 'connected'; computerName = $snapshot.computerName; snapshot = $snapshot}
    } catch { return @{status = Get-MonitorFailureStatus $_; computerName = $null} }
    finally { if ($null -ne $session) { Remove-PSSession -Session $session -ErrorAction SilentlyContinue }; $credential = $null }
}
