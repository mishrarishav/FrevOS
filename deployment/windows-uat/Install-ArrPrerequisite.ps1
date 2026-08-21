[CmdletBinding()]
param(
    [switch]$ConfirmSharedIisRestart
)

$ErrorActionPreference = "Stop"

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "Run this script from an elevated Administrator PowerShell window."
    }
}

Assert-Administrator
if (-not $ConfirmSharedIisRestart) {
    throw "ARR installation can restart shared IIS services. Review impact, then pass -ConfirmSharedIisRestart."
}

$packageRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
$installer = Join-Path $packageRoot "prerequisites\requestRouter_amd64.msi"
if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) {
    throw "The pinned ARR x64 installer is not present in this release."
}
if ((Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant() -ne
    "fb61fdb7101795a34d5129cb37eee43ab675c7ed76ba3a3b23b039d8c90c2a4b") {
    throw "The pinned ARR x64 installer checksum is invalid."
}
if (-not (Test-Path -LiteralPath "$env:windir\System32\inetsrv\rewrite.dll" -PathType Leaf)) {
    throw "IIS URL Rewrite must be installed before ARR. No module was installed."
}

$process = Start-Process -FilePath "msiexec.exe" -ArgumentList @(
    "/i",
    ('"{0}"' -f $installer),
    "/qn",
    "/norestart",
    "/l*v",
    ('"{0}"' -f (Join-Path $env:TEMP "frevos-arr-install.log"))
) -Wait -PassThru
if ($process.ExitCode -notin @(0, 3010)) {
    throw "ARR installation failed with exit code $($process.ExitCode)."
}

$arrModule = Join-Path $env:ProgramFiles "IIS\Application Request Routing\requestRouter.dll"
if (-not (Test-Path -LiteralPath $arrModule -PathType Leaf)) {
    throw "ARR installer completed but requestRouter.dll is unavailable."
}

Write-Output "ARR prerequisite installed. Reboot the server first if msiexec returned 3010."
