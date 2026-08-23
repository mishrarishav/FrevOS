[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$taskName = "FrevOS-Maintenance-Agent"
$installRoot = "D:\FrevOS-Agent\bin"
$source = Join-Path $PSScriptRoot "Invoke-FrevOsMaintenanceAgent.ps1"
$destination = Join-Path $installRoot "Invoke-FrevOsMaintenanceAgent.ps1"
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this installer in an Administrator PowerShell session."
}
foreach ($path in @("D:\FREVOS\.git", "D:\TrackGRN\server.env", $source)) {
    if (-not (Test-Path -LiteralPath $path)) { throw "Required FrevOS maintenance input is missing: $path" }
}
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($null -ne $existingTask -and $existingTask.State -eq "Running") {
    Stop-ScheduledTask -TaskName $taskName
    $deadline = [DateTime]::UtcNow.AddSeconds(10)
    do { Start-Sleep -Milliseconds 200; $existingTask = Get-ScheduledTask -TaskName $taskName } while (
        $existingTask.State -eq "Running" -and [DateTime]::UtcNow -lt $deadline)
    if ($existingTask.State -eq "Running") { throw "The existing maintenance agent did not stop cleanly." }
}
New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
Copy-Item -LiteralPath $source -Destination $destination -Force
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$destination`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $identity.Name
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
$taskPrincipal = New-ScheduledTaskPrincipal -UserId $identity.Name -LogonType Interactive -RunLevel Highest
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $taskPrincipal -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
$deadline = [DateTime]::UtcNow.AddSeconds(10)
do { Start-Sleep -Milliseconds 200; $installedTask = Get-ScheduledTask -TaskName $taskName } while (
    $installedTask.State -ne "Running" -and [DateTime]::UtcNow -lt $deadline)
if ($installedTask.State -ne "Running") { throw "The FrevOS maintenance agent did not start." }
Write-Host "FrevOS maintenance agent installed and started."
Write-Host "Task: $taskName"
Write-Host "Workspace: D:\FREVOS"
