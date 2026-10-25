param([Parameter(Mandatory=$true)][string]$DeviceId,[ValidateSet('inspect','interrupt')][string]$Operation='inspect')
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
if($DeviceId -cnotmatch '^fc_[a-f0-9]{32}$'){throw 'Fixture scope differs'}
$base=[IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'FrevOS\Connector'));$root=Join-Path $base $DeviceId
if([IO.Path]::GetDirectoryName($root) -ine $base){throw 'Fixture root differs'}
for($p=$root;;){if((Get-Item -LiteralPath $p -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Fixture linked root'};$parent=[IO.Path]::GetDirectoryName($p);if(-not $parent -or $parent -ceq $p){break};$p=$parent}
Add-Type -AssemblyName System.Security
function Read-Fixture([string]$file){$bytes=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($file),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);try{$c=[Text.Encoding]::UTF8.GetString($bytes)|ConvertFrom-Json;$h=[BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes('usr_fixture'))).Replace('-','').ToLowerInvariant().Substring(0,40);if($c.mode -cne 'system' -or $c.deviceId -cne $DeviceId -or $c.accountName -cne ('pair:'+$h) -or ([uri]$c.server).Host -cne '127.0.0.1'){throw 'Only synthetic loopback fixtures allowed'};return $c}finally{[Array]::Clear($bytes,0,$bytes.Length)}}
$config=Read-Fixture (Join-Path $root 'device.dpapi');$task=Get-ScheduledTask -TaskName ('FrevOS-Connector-'+$DeviceId)
$owner=$task.Principal.UserId;if($owner -notmatch '^S-1-'){$owner=([Security.Principal.NTAccount]::new($owner)).Translate([Security.Principal.SecurityIdentifier]).Value}
$arguments='-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File "'+(Join-Path $root 'Run-Connector.ps1')+'"'
if($task.Actions.Count -ne 1 -or $task.Actions[0].Arguments -cne $arguments -or $task.Actions[0].Execute -ine (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe') -or $owner -cne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value -or $task.Principal.RunLevel -cne 'Limited'){throw 'Fixture task differs'}
if($Operation -ceq 'interrupt'){
 $stage=Get-ChildItem -LiteralPath $root -Directory|Where-Object{$_.Name -cmatch '^update-[a-f0-9]{32}$'}|Select-Object -First 1
 if(-not $stage){throw 'Fixture update backup missing'}
 $old=Read-Fixture (Join-Path $stage.FullName 'previous\device.dpapi');if($old.credential -cne $config.credential){throw 'Fixture recovery identity differs'}
 Disable-ScheduledTask -TaskName $task.TaskName|Out-Null;Stop-ScheduledTask -TaskName $task.TaskName
 $deadline=[DateTime]::UtcNow.AddSeconds(20);while((Get-ScheduledTask -TaskName $task.TaskName).State -ceq 'Running'){if([DateTime]::UtcNow -gt $deadline){throw 'Fixture stop failed'};Start-Sleep -Milliseconds 200}
 $j=@{version=1;deviceId=$DeviceId;folder=$stage.Name;oldHash=$old.runtimeManifestSha256;newHash=$config.runtimeManifestSha256}|ConvertTo-Json -Compress
 $file=Join-Path $root 'update-transaction.json';$stream=[IO.File]::Open($file,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$bytes=[Text.UTF8Encoding]::new($false).GetBytes($j);$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
 # Simulate interruption after replacing some runtime files, before completion.
 [IO.File]::WriteAllText((Join-Path $root 'SystemDiscovery.cjs'),'synthetic interrupted runtime',[Text.UTF8Encoding]::new($false))
}
$hash=[BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($config.credential))).Replace('-','').ToLowerInvariant()
@{manifestSha256=$config.runtimeManifestSha256;credentialFingerprint=$hash;fileActivity=$config.fileActivity;runLevel=[string]$task.Principal.RunLevel}|ConvertTo-Json -Compress
$config=$null
