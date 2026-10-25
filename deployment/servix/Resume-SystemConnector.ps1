#requires -Version 5.1
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
$text=[Console]::In.ReadToEnd();if($text.Length -gt 4096){throw 'Resume input exceeds budget'};$request=$text|ConvertFrom-Json;$text=$null
if((@($request.PSObject.Properties.Name|Sort-Object) -join ',') -cne 'deviceId,fileActivity,server,username'){throw 'Resume fields differ'}
if($request.deviceId -cnotmatch '^fc_[a-f0-9]{32}$' -or $request.fileActivity -isnot [bool]){throw 'Resume scope differs'}
$root=Join-Path $env:LOCALAPPDATA ('FrevOS\Connector\'+$request.deviceId)
for($cursor=$root;;){if((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked enrollment'};$parent=[IO.Path]::GetDirectoryName($cursor);if(-not $parent -or $parent -ceq $cursor){break};$cursor=$parent}
Add-Type -AssemblyName System.Security;$file=Join-Path $root 'device.dpapi';$clear=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($file),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
try{$config=[Text.Encoding]::UTF8.GetString($clear)|ConvertFrom-Json}finally{[Array]::Clear($clear,0,$clear.Length)}
if($config.mode -cne 'system' -or $config.deviceId -cne $request.deviceId -or $config.server -cne $request.server -or $config.accountName -cne $request.username -or $config.stateRoot -ine (Join-Path $root 'state')){throw 'Protected enrollment differs'}
$manifestFile=Join-Path $root 'system-runtime-manifest.json';if((Get-FileHash -LiteralPath $manifestFile -Algorithm SHA256).Hash.ToLowerInvariant() -cne $config.runtimeManifestSha256){throw 'Runtime changed'}
$manifest=Get-Content -LiteralPath $manifestFile -Encoding UTF8 -Raw|ConvertFrom-Json
foreach($entry in $manifest.files.PSObject.Properties){if($entry.Name -cnotmatch '^[A-Za-z0-9][A-Za-z0-9.-]+$' -or (Get-FileHash -LiteralPath (Join-Path $root $entry.Name) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $entry.Value){throw 'Runtime changed'}}
$identity=[Security.Principal.WindowsIdentity]::GetCurrent();$name='FrevOS-Connector-'+$request.deviceId;$task=Get-ScheduledTask -TaskName $name
$execute=Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe';$arguments='-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File "'+(Join-Path $root 'Run-Connector.ps1')+'"'
$owner=$task.Principal.UserId;if($owner -notmatch '^S-1-'){$owner=([Security.Principal.NTAccount]::new($owner)).Translate([Security.Principal.SecurityIdentifier]).Value}
if($task.Actions.Count -ne 1 -or $task.Actions[0].Execute -ine $execute -or $task.Actions[0].Arguments -cne $arguments -or $owner -cne $identity.User.Value){throw 'Task identity differs'}
$changed=$config.fileActivity -ne $request.fileActivity
if($changed){
 if($task.State -ceq 'Running'){Stop-ScheduledTask -TaskName $name;$deadline=[DateTime]::UtcNow.AddSeconds(15);while((Get-ScheduledTask -TaskName $name).State -ceq 'Running'){if([DateTime]::UtcNow -gt $deadline){throw 'Monitor did not stop'};Start-Sleep -Milliseconds 200}}
 $config.fileActivity=$request.fileActivity;$bytes=[Text.UTF8Encoding]::new($false).GetBytes(($config|ConvertTo-Json -Compress));try{$encrypted=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);$temporary=$file+'.'+[guid]::NewGuid().ToString('N');[IO.File]::WriteAllBytes($temporary,$encrypted);[IO.File]::Replace($temporary,$file,(Join-Path $root ('state\enrollment-'+[guid]::NewGuid().ToString('N')+'.dpapi')))}finally{[Array]::Clear($bytes,0,$bytes.Length)}
 [IO.File]::WriteAllText((Join-Path $root 'state\discovery-consent.json'),(@{version=1;deviceId=$request.deviceId;metadata=$request.fileActivity;approvedAt=[DateTimeOffset]::UtcNow.ToString('o')}|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))
}
if((Get-ScheduledTask -TaskName $name).State -cne 'Running'){Start-ScheduledTask -TaskName $name};$config=$null
