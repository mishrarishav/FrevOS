param([Parameter(Mandatory=$true)][string]$ProtectedRoot, [string]$InputPath)
. (Join-Path $PSScriptRoot 'Common.ps1')
Assert-MonitorSystem
Assert-MonitorPrivateAcl $ProtectedRoot
$credentialRoot = Join-Path $ProtectedRoot 'credentials'
Set-MonitorDirectoryAcl $credentialRoot
$plain = $null; $cipher = $null; $request = $null
try {
    if ($InputPath) {
        $incomingRoot = Join-Path $ProtectedRoot 'incoming'
        Assert-MonitorPrivateAcl $incomingRoot
        $inputFull = Assert-MonitorNoReparse $InputPath
        if ((Split-Path -Parent $inputFull) -ine $incomingRoot -or (Split-Path -Leaf $inputFull) -notmatch '^credential-[a-f0-9]{32}\.json$') { throw 'monitor-protected-input-required' }
        $request = Read-MonitorJson $inputFull 32768
    } else {
        $reader = [Console]::In
        $buffer = New-Object char[] 32769
        $count = $reader.ReadBlock($buffer,0,$buffer.Length)
        if ($count -gt 32768 -or $count -lt 2) { throw 'monitor-credential-size-rejected' }
        $request = (-join $buffer[0..($count-1)]) | ConvertFrom-Json
        [Array]::Clear($buffer,0,$buffer.Length)
    }
    Assert-MonitorShape $request @('version','credentialProfile','username','password')
    if ($request.version -ne 1 -or $request.credentialProfile -notmatch '^[a-z][a-z0-9_-]{2,79}$' -or $request.username -notmatch '^[A-Za-z0-9_.@\\-]{1,180}$' -or $request.password -isnot [string] -or $request.password.Length -lt 1 -or $request.password.Length -gt 4096) { throw 'monitor-invalid-credential-input' }
    $destination = Join-Path $credentialRoot ($request.credentialProfile + '.dpapi')
    $null = Assert-MonitorNoReparse $destination
    if (Test-Path -LiteralPath $destination) { throw 'monitor-profile-already-exists' }
    Add-Type -AssemblyName System.Security
    $plain = [Text.Encoding]::UTF8.GetBytes(($request | ConvertTo-Json -Depth 3 -Compress))
    $cipher = [Security.Cryptography.ProtectedData]::Protect($plain,[Text.Encoding]::UTF8.GetBytes('DevSetu.ServerMonitoring.Credential.v1'),[Security.Cryptography.DataProtectionScope]::CurrentUser)
    $stream = New-Object IO.FileStream($destination,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try { $stream.Write($cipher,0,$cipher.Length); $stream.Flush($true) } finally { $stream.Dispose() }
    @{version = 1; status = 'sealed'; credentialProfile = $request.credentialProfile; protection = 'SYSTEM-DPAPI-CurrentUser'} | ConvertTo-Json -Compress
} catch {
    # A malformed private JSON payload must not appear in PowerShell's raw parse error.
    [Console]::Error.WriteLine('monitor-credential-operation-failed')
    exit 1
} finally {
    if ($null -ne $plain) { [Array]::Clear($plain,0,$plain.Length) }
    $request = $null
}
