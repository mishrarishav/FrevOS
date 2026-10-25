#requires -Version 5.1
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
$text=[Console]::In.ReadToEnd();if($text.Length -gt 32768){throw 'Enrollment capacity'};$config=$text|ConvertFrom-Json;$text=$null
if((@($config.PSObject.Properties.Name|Sort-Object) -join ',') -cne 'accountName,allowInternalHttp,credential,deviceId,fileActivity,mode,monitoringRoot,runtimeManifestSha256,server,stateRoot,version'){throw 'System enrollment fields differ'}
if($config.version -ne 1 -or $config.mode -cne 'system' -or $config.deviceId -cnotmatch '^fc_[a-f0-9]{32}$' -or $config.credential -cnotmatch ('^'+$config.deviceId+'\.[A-Za-z0-9_-]{43}$') -or $config.runtimeManifestSha256 -cnotmatch '^[a-f0-9]{64}$' -or $config.fileActivity -isnot [bool] -or $config.accountName -isnot [string] -or $config.accountName.Length -lt 1 -or $config.accountName.Length -gt 64){throw 'System enrollment differs'}
$expected=Join-Path $env:LOCALAPPDATA ('FrevOS\Connector\'+$config.deviceId)
if($PSScriptRoot -ine $expected -or $config.stateRoot -ine (Join-Path $expected 'state') -or $config.monitoringRoot -ine [Environment]::GetFolderPath('UserProfile')){throw 'System enrollment location differs'}
$url=[uri]$config.server;if($url.Scheme -cnotin @('http','https') -or $url.UserInfo -or $url.Query -or $url.Fragment -or $url.AbsolutePath -cne '/'){throw 'Server origin differs'}
$identity=[Security.Principal.WindowsIdentity]::GetCurrent();$taskName='FrevOS-Connector-'+$config.deviceId
$file=Join-Path $expected 'device.dpapi';Add-Type -AssemblyName System.Security
if(-not(Test-Path -LiteralPath $file)){
 $bytes=[Text.UTF8Encoding]::new($false).GetBytes(($config|ConvertTo-Json -Compress));try{$encrypted=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);$stream=[IO.File]::Open($file,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$stream.Write($encrypted,0,$encrypted.Length)}finally{$stream.Dispose()}}finally{[Array]::Clear($bytes,0,$bytes.Length)}
}else{
 $clear=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($file),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);try{$prior=[Text.Encoding]::UTF8.GetString($clear)|ConvertFrom-Json;if($prior.deviceId -cne $config.deviceId -or $prior.credential -cne $config.credential -or $prior.server -cne $config.server -or $prior.mode -cne 'system' -or $prior.runtimeManifestSha256 -cne $config.runtimeManifestSha256 -or $prior.fileActivity -ne $config.fileActivity -or $prior.accountName -cne $config.accountName -or $prior.monitoringRoot -ine $config.monitoringRoot -or $prior.stateRoot -ine $config.stateRoot){throw 'Existing protected enrollment differs'}}finally{[Array]::Clear($clear,0,$clear.Length);$prior=$null}
}
[void][IO.Directory]::CreateDirectory((Join-Path $expected 'state'))
if($config.fileActivity){[IO.File]::WriteAllText((Join-Path $expected 'state\discovery-consent.json'),(@{version=1;deviceId=$config.deviceId;metadata=$true;approvedAt=[DateTimeOffset]::UtcNow.ToString('o')}|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))}
$execute=Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe';$arguments='-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File "'+(Join-Path $expected 'Run-Connector.ps1')+'"'
$existing=Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if($existing){$owner=$existing.Principal.UserId;if($owner -notmatch '^S-1-'){$owner=([Security.Principal.NTAccount]::new($owner)).Translate([Security.Principal.SecurityIdentifier]).Value};if($existing.Actions.Count -ne 1 -or $existing.Actions[0].Execute -ine $execute -or $existing.Actions[0].Arguments -cne $arguments -or $owner -cne $identity.User.Value){throw 'Task ownership differs'}}else{
 $action=New-ScheduledTaskAction -Execute $execute -Argument $arguments;$principal=New-ScheduledTaskPrincipal -UserId $identity.Name -LogonType Interactive -RunLevel Limited
 $settings=New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
 $logon=New-ScheduledTaskTrigger -AtLogOn -User $identity.Name;$recovery=New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
 Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal -Trigger @($logon,$recovery) -Settings $settings|Out-Null
}
if(-not $existing -or $existing.State -cne 'Running'){Start-ScheduledTask -TaskName $taskName}
$config=$null
