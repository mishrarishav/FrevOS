Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-MonitorSystem {
    if ([Security.Principal.WindowsIdentity]::GetCurrent().User.Value -ne 'S-1-5-18') { throw 'monitor-system-identity-required' }
}
function Assert-MonitorShape($Value, [string[]]$Required, [string[]]$Optional = @()) {
    if ($null -eq $Value -or $Value -is [string] -or $Value -is [array]) { throw 'monitor-invalid-object' }
    $names = @($Value.PSObject.Properties.Name)
    foreach ($name in $Required) { if ($names -notcontains $name) { throw 'monitor-missing-field' } }
    foreach ($name in $names) { if ($Required -notcontains $name -and $Optional -notcontains $name) { throw 'monitor-unknown-field' } }
}
function Test-MonitorPrivateAddress([string]$Address) {
    if ($Address -notmatch '^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$') { return $false }
    $v = @($Address.Split('.') | ForEach-Object { [int]$_ })
    foreach ($part in $v) { if ($part -gt 255) { return $false } }
    return ($v[0] -eq 10 -or ($v[0] -eq 172 -and $v[1] -ge 16 -and $v[1] -le 31) -or ($v[0] -eq 192 -and $v[1] -eq 168))
}
function Assert-MonitorNoReparse([string]$Path) {
    $full = [IO.Path]::GetFullPath($Path)
    $cursor = $full
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            $item = Get-Item -LiteralPath $cursor -Force
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'monitor-reparse-path-rejected' }
        }
        $parent = [IO.Directory]::GetParent($cursor)
        if ($null -eq $parent) { break }
        $cursor = $parent.FullName
    }
    return $full
}
function Assert-MonitorPrivateAcl([string]$Path) {
    $null = Assert-MonitorNoReparse $Path
    $acl = Get-Acl -LiteralPath $Path
    if (-not $acl.AreAccessRulesProtected) { throw 'monitor-private-acl-required' }
    if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -notin @('S-1-5-18','S-1-5-32-544')) { throw 'monitor-private-owner-required' }
    foreach ($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
        if ($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin @('S-1-5-18','S-1-5-32-544')) { throw 'monitor-private-acl-required' }
    }
}
function Set-MonitorDirectoryAcl([string]$Path, [string]$AppSid = '', [string]$AppRights = 'ReadAndExecute') {
    $null = Assert-MonitorNoReparse $Path
    if (-not (Test-Path -LiteralPath $Path)) { $null = New-Item -ItemType Directory -Path $Path }
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true,$false)
    $acl.SetOwner((New-Object Security.Principal.SecurityIdentifier('S-1-5-18')))
    foreach ($sid in @('S-1-5-18','S-1-5-32-544')) {
        $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($sid)),'FullControl','ContainerInherit,ObjectInherit','None','Allow')))
    }
    if ($AppSid) { $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($AppSid)),$AppRights,'ContainerInherit,ObjectInherit','None','Allow'))) }
    Set-Acl -LiteralPath $Path -AclObject $acl
}
function Assert-MonitorQueueAcl([string]$Path, [string]$AppSid, [bool]$Writable) {
    $null = Assert-MonitorNoReparse $Path
    $acl = Get-Acl -LiteralPath $Path
    if (-not $acl.AreAccessRulesProtected -or $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne 'S-1-5-18') { throw 'monitor-queue-acl-rejected' }
    $appRule = $false
    foreach ($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
        if ($rule.AccessControlType -ne 'Allow') { continue }
        $sid = $rule.IdentityReference.Value
        if ($sid -in @('S-1-5-18','S-1-5-32-544')) { continue }
        if ($sid -cne $AppSid) { throw 'monitor-queue-acl-rejected' }
        $appRule = $true
        $allowed = [Security.AccessControl.FileSystemRights]::ReadAndExecute -bor [Security.AccessControl.FileSystemRights]::Synchronize
        if ($Writable) { $allowed = [Security.AccessControl.FileSystemRights]::Modify -bor [Security.AccessControl.FileSystemRights]::Synchronize }
        if (($rule.FileSystemRights -band (-bnot $allowed)) -ne 0) { throw 'monitor-queue-acl-rejected' }
    }
    if (-not $appRule) { throw 'monitor-queue-app-access-missing' }
}
function Read-MonitorJson([string]$Path, [int]$MaxBytes = 1048576) {
    $null = Assert-MonitorNoReparse $Path
    $item = Get-Item -LiteralPath $Path -Force
    if ($item.PSIsContainer -or $item.Length -gt $MaxBytes -or $item.Length -lt 2) { throw 'monitor-json-size-rejected' }
    $text = [IO.File]::ReadAllText($item.FullName,[Text.Encoding]::UTF8)
    if ((Get-Command ConvertFrom-Json).Parameters.ContainsKey('DateKind')) { return ($text | ConvertFrom-Json -DateKind String) }
    return ($text | ConvertFrom-Json)
}
function Write-MonitorJsonNew([string]$Path, $Value, [int]$MaxBytes = 1048576) {
    $null = Assert-MonitorNoReparse $Path
    $data = [Text.Encoding]::UTF8.GetBytes(($Value | ConvertTo-Json -Depth 14 -Compress))
    if ($data.Length -gt $MaxBytes) { throw 'monitor-result-size-rejected' }
    $file = New-Object IO.FileStream($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try { $file.Write($data,0,$data.Length); $file.Flush($true) } finally { $file.Dispose() }
}
function Get-MonitorBinding([string]$WorkspaceId, $Target) {
    # DB revisions fence writes/leases; access grants and display edits must not
    # invalidate an unchanged operator-enrolled endpoint.
    $value = @($WorkspaceId,$Target.id,$Target.address,[string]$Target.port,$Target.transport,$Target.credentialProfile) -join "`n"
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($value))).Replace('-','').ToLowerInvariant()) } finally { $sha.Dispose() }
}
function Assert-MonitorTarget($Target, [string]$WorkspaceId) {
    Assert-MonitorShape $Target @('id','workspaceId','address','port','transport','credentialProfile','revision','enabled','endpointHost','authentication') @('expectedComputerName','approvedEndpointAddresses')
    if ($Target.id -notmatch '^srv_[a-f0-9]{32}$' -or $Target.workspaceId -cne $WorkspaceId -or $WorkspaceId -notmatch '^ws_[A-Za-z0-9][A-Za-z0-9_-]{0,119}$') { throw 'monitor-invalid-target-binding' }
    if (-not (Test-MonitorPrivateAddress $Target.address) -or $Target.port -isnot [int] -and $Target.port -isnot [long] -or $Target.port -lt 1 -or $Target.port -gt 65535) { throw 'monitor-invalid-endpoint' }
    if ($Target.transport -notin @('winrm-http','winrm-https','local') -or $Target.authentication -notin @('Kerberos','Negotiate') -or $Target.credentialProfile -notmatch '^[a-z][a-z0-9_-]{2,79}$') { throw 'monitor-invalid-transport' }
    if ($Target.enabled -isnot [bool] -or ($Target.revision -isnot [int] -and $Target.revision -isnot [long]) -or $Target.revision -lt 0 -or $Target.revision -gt 2147483647) { throw 'monitor-invalid-target-policy' }
    if ($Target.endpointHost -notmatch '^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$' -or $Target.endpointHost -match '\.\.') { throw 'monitor-invalid-endpoint-host' }
    if ($Target.PSObject.Properties['approvedEndpointAddresses']) {
        # Multi-interface names require a separate operator enrollment. Neither the
        # app request nor newly observed DNS addresses can enlarge this set.
        if ($Target.transport -eq 'local' -or $Target.authentication -cne 'Kerberos' -or -not $Target.PSObject.Properties['expectedComputerName'] -or $Target.expectedComputerName -notmatch '^[A-Za-z0-9][A-Za-z0-9-]{0,62}$' -or $Target.endpointHost -match '^[0-9.]+$') { throw 'monitor-invalid-approved-endpoint-policy' }
        $approved = $Target.approvedEndpointAddresses
        if ($approved -isnot [array] -or $approved.Count -lt 1 -or $approved.Count -gt 8) { throw 'monitor-invalid-approved-endpoint-set' }
        $seen = @{}
        foreach ($address in $approved) {
            if ($address -isnot [string] -or -not (Test-MonitorPrivateAddress $address) -or $seen.ContainsKey($address)) { throw 'monitor-invalid-approved-endpoint-set' }
            $seen[$address] = $true
        }
        if (-not $seen.ContainsKey($Target.address)) { throw 'monitor-approved-endpoint-primary-missing' }
    }
}
function Assert-MonitorResolvedEndpoint($Target, [string[]]$ResolvedAddresses) {
    $approved = @($Target.address)
    if ($Target.PSObject.Properties['approvedEndpointAddresses']) { $approved = @($Target.approvedEndpointAddresses) }
    # Require exact set equality, including all A/AAAA answers from the same
    # resolver used by WinRM. Extra, missing or public addresses fail closed.
    if ($null -eq $ResolvedAddresses -or $ResolvedAddresses.Count -lt 1 -or $ResolvedAddresses.Count -gt 64) { throw 'monitor-dns-binding-rejected' }
    $resolved = @($ResolvedAddresses | Sort-Object -Unique)
    if ($resolved.Count -ne $approved.Count) { throw 'monitor-dns-binding-rejected' }
    foreach ($address in $resolved) { if ($approved -cnotcontains $address) { throw 'monitor-dns-binding-rejected' } }
}
function Get-MonitorCredential([string]$ProtectedRoot, [string]$Profile) {
    Assert-MonitorSystem
    if ($Profile -notmatch '^[a-z][a-z0-9_-]{2,79}$') { throw 'monitor-invalid-profile' }
    $path = Join-Path (Join-Path $ProtectedRoot 'credentials') ($Profile + '.dpapi')
    Assert-MonitorPrivateAcl (Split-Path -Parent $path)
    $null = Assert-MonitorNoReparse $path
    if ((Get-Item -LiteralPath $path).Length -gt 65536) { throw 'monitor-invalid-credential-envelope' }
    $cipher = [IO.File]::ReadAllBytes($path)
    $plain = $null
    try {
        Add-Type -AssemblyName System.Security
        $plain = [Security.Cryptography.ProtectedData]::Unprotect($cipher,[Text.Encoding]::UTF8.GetBytes('DevSetu.ServerMonitoring.Credential.v1'),[Security.Cryptography.DataProtectionScope]::CurrentUser)
        $payload = [Text.Encoding]::UTF8.GetString($plain) | ConvertFrom-Json
        Assert-MonitorShape $payload @('version','credentialProfile','username','password')
        if ($payload.version -ne 1 -or $payload.credentialProfile -cne $Profile -or $payload.username -notmatch '^[A-Za-z0-9_.@\\-]{1,180}$' -or [string]::IsNullOrEmpty($payload.password)) { throw 'monitor-invalid-credential-envelope' }
        $secure = ConvertTo-SecureString -String $payload.password -AsPlainText -Force
        return (New-Object Management.Automation.PSCredential($payload.username,$secure))
    } finally { if ($null -ne $plain) { [Array]::Clear($plain,0,$plain.Length) }; $payload = $null }
}
