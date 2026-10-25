#requires -Version 5.1
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
$text=[Console]::In.ReadToEnd();if($text.Length -gt 4096){throw 'Notification consent capacity'};$request=$text|ConvertFrom-Json;$text=$null
if((@($request.PSObject.Properties.Name|Sort-Object)-join ',') -cne 'deviceId,enabled,server,version' -or $request.version -ne 1 -or $request.deviceId -cnotmatch '^fc_[a-f0-9]{32}$' -or $request.enabled -isnot [bool]){throw 'Notification consent scope differs'}
$root=Join-Path $env:LOCALAPPDATA ('FrevOS\Connector\'+$request.deviceId)
for($p=$root;;){if((Get-Item -LiteralPath $p -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked notification consent'};$parent=[IO.Path]::GetDirectoryName($p);if(-not $parent -or $parent -ceq $p){break};$p=$parent}
Add-Type -AssemblyName System.Security;$clear=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes((Join-Path $root 'device.dpapi')),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
try{$config=[Text.Encoding]::UTF8.GetString($clear)|ConvertFrom-Json}finally{[Array]::Clear($clear,0,$clear.Length)}
if($config.mode -cne 'system' -or $config.deviceId -cne $request.deviceId -or $config.server -cne $request.server -or $config.stateRoot -ine (Join-Path $root 'state')){throw 'Protected notification consent differs'}
$state=Join-Path $root 'state';if((Get-Item -LiteralPath $state -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked notification state'}
$file=Join-Path $state 'notifications-consent.json'
if(Test-Path -LiteralPath $file){if((Get-Item -LiteralPath $file -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked notification consent'};$prior=Get-Content -LiteralPath $file -Encoding UTF8 -Raw|ConvertFrom-Json;if($prior.version -eq 1 -and $prior.deviceId -ceq $config.deviceId -and $prior.server -ceq $config.server -and $prior.accountName -ceq $config.accountName -and $prior.enabled -eq $request.enabled){[Console]::Out.Write('{"saved":true}');exit}}
$value=@{version=1;deviceId=$config.deviceId;server=$config.server;accountName=$config.accountName;enabled=$request.enabled;approvedAt=[DateTimeOffset]::UtcNow.ToString('o')}|ConvertTo-Json -Compress
$temporary=$file+'.'+[guid]::NewGuid().ToString('N');$bytes=[Text.UTF8Encoding]::new($false).GetBytes($value);$handle=[IO.File]::Open($temporary,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$handle.Write($bytes,0,$bytes.Length);$handle.Flush($true)}finally{$handle.Dispose()}
if(Test-Path -LiteralPath $file){
 $backup=Join-Path $state 'notifications-consent.previous.json'
 if(Test-Path -LiteralPath $backup){if((Get-Item -LiteralPath $backup -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked notification recovery'};$saved=Get-Content -LiteralPath $backup -Encoding UTF8 -Raw|ConvertFrom-Json;if($saved.version -ne 1 -or $saved.deviceId -cne $config.deviceId -or $saved.server -cne $config.server -or $saved.accountName -cne $config.accountName){throw 'Notification recovery scope differs'}}
 [IO.File]::Replace($temporary,$file,$backup)
}else{[IO.File]::Move($temporary,$file)}
$config=$null;[Console]::Out.Write('{"saved":true}')
