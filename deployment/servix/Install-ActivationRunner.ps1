param([string]$Action,[string]$ManifestSha256,[string]$ArchiveSha256,[string]$ActorSid)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$report=[ordered]@{host=$env:COMPUTERNAME;action=$Action;manifestSha256=$ManifestSha256;databaseWritten=$false;status='FAIL';taskChanged=$false}
$changed=$false
try{
 if($env:COMPUTERNAME -cne 'DCAPP7'){throw 'Wrong worker target'}
 $base='E:\FrevOS\servix';$active='36d666e3f49b0bceb7ac31a1882c94176036a01bd66b628ae84a41b0c43e173c'
 if((Get-Content 'E:\FrevOS\state\active.json' -Raw|ConvertFrom-Json).manifestSha256 -cne $active){throw 'Application changed'}
 $manifestFile=Join-Path $PSScriptRoot 'worker\operator-manifest.json'
 $digest=(Get-FileHash -LiteralPath $manifestFile -Algorithm SHA256).Hash.ToLowerInvariant()
 $manifest=Get-Content -LiteralPath $manifestFile -Raw|ConvertFrom-Json
 if($manifest.version -ne 1 -or $manifest.host -cne 'DCAPP7' -or $manifest.applicationManifestSha256 -cne $active -or $manifest.files.Count -ne 6){throw 'Invalid worker manifest'}
 foreach($file in $manifest.files){if($file.name -cnotmatch '^[A-Za-z0-9.-]+$' -or (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot ('worker\'+$file.name))).Hash.ToLowerInvariant() -cne $file.sha256){throw 'Worker integrity mismatch'}}
 $approval=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'approval.json') -Raw|ConvertFrom-Json
 if($approval.action -cne 'frevos.server20.servix-worker.v1' -or $approval.target -cne 'DCAPP7/10.9.69.20' -or $approval.workspace -cne 'ws_server20' -or $approval.actorSid -cne $ActorSid -or $approval.correlationId -cne (Split-Path $PSScriptRoot -Leaf) -or $approval.workerManifestSha256 -cne $digest -or [DateTimeOffset]::Parse($approval.expiresUtc) -le [DateTimeOffset]::UtcNow){throw 'Worker approval mismatch'}
 if(@(Get-ChildItem (Join-Path $base 'requests') -File -Filter 'sd_*.json').Count -or @(Get-ChildItem (Join-Path $base 'private\claims') -Directory).Count){throw 'Deployment exists; runner upgrade blocked'}
 $task=Get-ScheduledTask -TaskName 'FrevOS-ServixDev-Activation'
 $exe='C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
 $oldArgs='-NoProfile -NonInteractive -WindowStyle Hidden -File "E:\FrevOS\releases\'+$active+'\deployment\servix\Run-Activation.ps1"'
 if($task.Actions.Count -ne 1 -or $task.Actions[0].Execute -cne $exe -or $task.Actions[0].Arguments -cne $oldArgs -or $task.Principal.UserId -notin @('SYSTEM','S-1-5-18') -or $task.State -eq 'Running'){throw 'Expected failed worker identity changed'}
 $destination=Join-Path $base ('operators\'+$digest)
 if(Test-Path -LiteralPath $destination){throw 'Worker destination collision'}
 [void][IO.Directory]::CreateDirectory($destination)
 $acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetAccessRuleProtection($true,$false)
 foreach($sid in @('S-1-5-18','S-1-5-32-544',$ActorSid)){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))}
 Set-Acl -LiteralPath $destination -AclObject $acl
 foreach($file in Get-ChildItem (Join-Path $PSScriptRoot 'worker') -File){Copy-Item -LiteralPath $file.FullName -Destination $destination}
 foreach($file in $manifest.files){if((Get-FileHash -LiteralPath (Join-Path $destination $file.name)).Hash.ToLowerInvariant() -cne $file.sha256){throw 'Installed worker digest changed'}}
 Export-ScheduledTask -TaskName 'FrevOS-ServixDev-Activation'|Set-Content -LiteralPath (Join-Path $PSScriptRoot 'task-before.xml')
 [IO.File]::WriteAllText((Join-Path $PSScriptRoot 'approval-consumed.json'),($approval|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
 $newArgs='-NoProfile -NonInteractive -WindowStyle Hidden -File "'+(Join-Path $destination 'Run-Activation.ps1')+'"'
 Set-ScheduledTask -TaskName 'FrevOS-ServixDev-Activation' -Action (New-ScheduledTaskAction -Execute $exe -Argument $newArgs)|Out-Null;$changed=$true
 Start-ScheduledTask -TaskName 'FrevOS-ServixDev-Activation'
 Start-Sleep -Seconds 3
 $first=(Get-Content (Join-Path $base 'results\heartbeat.json') -Raw|ConvertFrom-Json).at
 Start-Sleep -Seconds 3
 $second=(Get-Content (Join-Path $base 'results\heartbeat.json') -Raw|ConvertFrom-Json).at
 if($first -ceq $second -or (Get-ScheduledTask -TaskName 'FrevOS-ServixDev-Activation').State -ne 'Running' -or ([DateTime]::UtcNow-[DateTime]::Parse($second).ToUniversalTime()).TotalSeconds -gt 10){throw 'Worker did not maintain heartbeat'}
 $report.workerManifestSha256=$digest;$report.status='PASS';$report.taskChanged=$true;$report.heartbeatAdvanced=$true
}catch{
 $report.error=@{type=$_.Exception.GetType().Name;id=$_.FullyQualifiedErrorId;line=$_.InvocationInfo.ScriptLineNumber}
 if($changed){try{$current=Get-ScheduledTask -TaskName 'FrevOS-ServixDev-Activation';if($current.Actions[0].Arguments -cne $newArgs){throw 'Worker ownership changed'};Stop-ScheduledTask -TaskName 'FrevOS-ServixDev-Activation';Set-ScheduledTask -TaskName 'FrevOS-ServixDev-Activation' -Action $task.Actions[0]|Out-Null;$report.previousTaskRestored=$true}catch{$report.recoveryError=$_.Exception.GetType().Name}}
}
[IO.File]::WriteAllText((Join-Path $PSScriptRoot ('result-'+$Action.ToLowerInvariant()+'.json')),($report|ConvertTo-Json -Depth 7),[Text.UTF8Encoding]::new($false))
