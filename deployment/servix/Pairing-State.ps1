#requires -Version 5.1
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
$text=[Console]::In.ReadToEnd();if($text.Length -gt 16384){throw 'Pairing input capacity'};$request=$text|ConvertFrom-Json;$text=$null
if($request.deviceId -cnotmatch '^fc_[a-f0-9]{32}$' -or $request.operation -cnotin @('prepare','pending','connection')){throw 'Pairing state scope differs'}
$root=Join-Path $env:LOCALAPPDATA ('FrevOS\Connector\'+$request.deviceId)
for($cursor=$root;;){if((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked pairing path'};$parent=[IO.Path]::GetDirectoryName($cursor);if(-not $parent -or $parent -ceq $cursor){break};$cursor=$parent}
Add-Type -AssemblyName System.Security
$file=Join-Path $root 'pairing.dpapi'
if($request.operation -ceq 'prepare'){
 if((@($request.PSObject.Properties.Name|Sort-Object)-join ',') -cne 'deviceId,operation,state'){throw 'Pairing fields differ'}
 $state=$request.state
 if((@($state.PSObject.Properties.Name|Sort-Object)-join ',') -cne 'architecture,code,createdAt,credential,deviceId,fileActivity,name,platform,pollSecret,server,version'){throw 'Pending fields differ'}
 if($state.version -ne 1 -or $state.deviceId -cne $request.deviceId -or $state.credential -cnotmatch ('^'+$state.deviceId+'\.[A-Za-z0-9_-]{43}$') -or $state.pollSecret -cnotmatch '^[A-Za-z0-9_-]{43}$' -or $state.code -cnotmatch '^[A-HJ-NP-Z2-9]{8}$' -or $state.fileActivity -isnot [bool]){throw 'Pending scope differs'}
 $url=[uri]$state.server;if($url.Scheme -cnotin @('http','https') -or $url.UserInfo -or $url.Query -or $url.Fragment -or $url.AbsolutePath -cne '/'){throw 'Server differs'}
 $bytes=[Text.UTF8Encoding]::new($false).GetBytes(($state|ConvertTo-Json -Compress));try{$encrypted=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);$stream=[IO.File]::Open($file,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$stream.Write($encrypted,0,$encrypted.Length);$stream.Flush($true)}finally{$stream.Dispose()}}finally{[Array]::Clear($bytes,0,$bytes.Length)}
 [Console]::Out.Write('{"saved":true}');exit
}
if((@($request.PSObject.Properties.Name|Sort-Object)-join ',') -cne 'deviceId,operation'){throw 'Pairing read fields differ'}
if($request.operation -ceq 'connection'){$file=Join-Path $root 'device.dpapi'}
$clear=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($file),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
try{
 $config=[Text.Encoding]::UTF8.GetString($clear)|ConvertFrom-Json
 if($config.deviceId -cne $request.deviceId -or $config.credential -cnotmatch ('^'+$config.deviceId+'\.[A-Za-z0-9_-]{43}$')){throw 'Protected pairing differs'}
 if($request.operation -ceq 'connection' -and $config.mode -cne 'system'){throw 'System purpose required'}
 # Only the private parent pipe receives this value. It is never argv or a log.
 [Console]::Out.Write([Text.Encoding]::UTF8.GetString($clear))
}finally{[Array]::Clear($clear,0,$clear.Length);$config=$null}
