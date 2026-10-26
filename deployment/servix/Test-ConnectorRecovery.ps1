$ErrorActionPreference='Stop'
$id=[guid]::NewGuid().ToString('N')
$fixture=Join-Path ([IO.Path]::GetTempPath()) ('frevos-connector-recovery-'+$id)
$taskName='FrevOS-Connector-RecoveryTest-'+$id
[void][IO.Directory]::CreateDirectory($fixture)
$script=Join-Path $fixture 'probe.ps1';$marker=Join-Path $fixture 'runs.txt'
$scriptText='$p=Join-Path $PSScriptRoot ''runs.txt'';if(-not(Test-Path -LiteralPath $p)){[IO.File]::WriteAllText($p,''1'');exit -1073741510};[IO.File]::WriteAllText($p,''2'')'
[IO.File]::WriteAllText($script,$scriptText)
$exe=Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$arguments='-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+$script+'"'
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
$principal=New-ScheduledTaskPrincipal -UserId $identity.Name -LogonType Interactive -RunLevel Limited
$settings=New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
$owned=$false
try{
 $trigger=New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(15) -RepetitionInterval (New-TimeSpan -Minutes 1)
 Register-ScheduledTask -TaskName $taskName -Action (New-ScheduledTaskAction -Execute $exe -Argument $arguments) -Principal $principal -Settings $settings -Trigger $trigger | Out-Null
 $owned=$true
 Start-ScheduledTask -TaskName $taskName
 $deadline=(Get-Date).AddSeconds(35)
 while((Get-Date) -lt $deadline){if((Test-Path -LiteralPath $marker) -and [IO.File]::ReadAllText($marker) -ceq '2'){break};Start-Sleep -Milliseconds 250}
 if(-not(Test-Path -LiteralPath $marker) -or [IO.File]::ReadAllText($marker) -cne '2'){throw 'Scheduled recovery did not run after the interrupted process'}
 'PASS: a Limited per-user task with the connector settings restarted an interrupted process at its recovery trigger'
}finally{
 if($owned){$task=Get-ScheduledTask -TaskName $taskName;if($task.Actions.Count -ne 1 -or $task.Actions[0].Arguments -cne $arguments){throw 'Recovery fixture task ownership changed'};Stop-ScheduledTask -TaskName $taskName;Unregister-ScheduledTask -TaskName $taskName -Confirm:$false}
 $resolved=[IO.Path]::GetFullPath($fixture);$parent=[IO.Path]::GetFullPath([IO.Path]::GetTempPath())
 if(-not $resolved.StartsWith($parent,[StringComparison]::OrdinalIgnoreCase) -or (Split-Path $resolved -Leaf) -cne ('frevos-connector-recovery-'+$id)){throw 'Recovery fixture cleanup escaped its owned directory'}
 [IO.Directory]::Delete($resolved,$true)
}
