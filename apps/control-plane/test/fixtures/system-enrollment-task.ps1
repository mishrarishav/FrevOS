param([Parameter(Mandatory=$true)][string]$DeviceId,[ValidateSet('inspect','remove')][string]$Operation='inspect')
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
if($DeviceId -cnotmatch '^fc_[a-f0-9]{32}$'){throw 'Fixture identity differs'}
$base=[IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'FrevOS\Connector'))
$root=[IO.Path]::GetFullPath((Join-Path $base $DeviceId))
if([IO.Path]::GetDirectoryName($root) -ine $base){throw 'Fixture cleanup scope differs'}
$name='FrevOS-Connector-'+$DeviceId;$task=Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
if(Test-Path -LiteralPath (Join-Path $root 'device.dpapi')){
 Add-Type -AssemblyName System.Security
 $clear=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes((Join-Path $root 'device.dpapi')),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
 try{$config=[Text.Encoding]::UTF8.GetString($clear)|ConvertFrom-Json}finally{[Array]::Clear($clear,0,$clear.Length)}
 if($config.mode -cne 'system' -or $config.deviceId -cne $DeviceId -or $config.accountName -cne 'synthetic-enrollment-fixture' -or ([uri]$config.server).Host -cne '127.0.0.1'){throw 'Fixture protected scope differs'}
 $config=$null
}
if($task){
 $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
 $expected='-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File "'+(Join-Path $root 'Run-Connector.ps1')+'"'
 $owner=$task.Principal.UserId;if($owner -notmatch '^S-1-'){$owner=([Security.Principal.NTAccount]::new($owner)).Translate([Security.Principal.SecurityIdentifier]).Value}
 if($task.Actions.Count -ne 1 -or $task.Actions[0].Arguments -cne $expected -or $task.Actions[0].Execute -ine (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe') -or $owner -cne $identity.User.Value){throw 'Fixture task ownership differs'}
 if($Operation -ceq 'inspect'){@{present=$true;state=[string]$task.State;runLevel=[string]$task.Principal.RunLevel}|ConvertTo-Json -Compress;exit}
 Stop-ScheduledTask -TaskName $name
 $deadline=[DateTime]::UtcNow.AddSeconds(15)
 while((Get-ScheduledTask -TaskName $name).State -ceq 'Running'){if([DateTime]::UtcNow -gt $deadline){throw 'Fixture task still running'};Start-Sleep -Milliseconds 200}
 Unregister-ScheduledTask -TaskName $name -Confirm:$false
}
if($Operation -ceq 'remove' -and (Test-Path -LiteralPath $root)){
 $resolved=(Resolve-Path -LiteralPath $root).ProviderPath
 if([IO.Path]::GetDirectoryName($resolved) -ine $base -or [IO.Path]::GetFileName($resolved) -cne $DeviceId -or ((Get-Item -LiteralPath $root -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Fixture resolved cleanup differs'}
 Remove-Item -LiteralPath $resolved -Recurse -Force
}
if($Operation -ceq 'inspect'){'{"present":false}'}
