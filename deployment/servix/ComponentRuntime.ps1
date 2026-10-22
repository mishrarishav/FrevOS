# Local operator pins the exact task actions and its destination before enrollment.
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
$inputJson=[Console]::In.ReadToEnd()
if($inputJson.Length -gt 4096){throw 'Runtime input exceeds budget'}
$request=$inputJson|ConvertFrom-Json
if(@($request.PSObject.Properties.Name|Sort-Object) -join ',' -cne 'actionSha256,operation,root,taskName' -or $request.operation -cnotin @('start','stop') -or $request.actionSha256 -cnotmatch '^[a-f0-9]{64}$' -or $request.taskName -notmatch '^[A-Za-z0-9_. -]{1,120}$'){throw 'Invalid runtime request'}
$ownedTask=Get-ScheduledTask -TaskName $request.taskName -TaskPath '\'
$actions=@($ownedTask.Actions|ForEach-Object {[ordered]@{execute=$_.Execute;arguments=$_.Arguments;workingDirectory=$_.WorkingDirectory}})|ConvertTo-Json -Compress
$hash=[BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($actions))).Replace('-','').ToLowerInvariant()
if($hash -cne $request.actionSha256 -or -not $actions.ToLowerInvariant().Contains(([string]$request.root).Replace('\','\\').ToLowerInvariant())){throw 'Runtime ownership changed'}
if($request.operation -ceq 'stop'){Stop-ScheduledTask -InputObject $ownedTask; $until=[DateTime]::UtcNow.AddSeconds(20);while((Get-ScheduledTask -TaskName $request.taskName).State -eq 'Running'){if([DateTime]::UtcNow -ge $until){throw 'Runtime did not stop'};Start-Sleep -Milliseconds 250}}
else{Start-ScheduledTask -InputObject $ownedTask}
