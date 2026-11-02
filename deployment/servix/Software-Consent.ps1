#requires -Version 5.1
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
Add-Type -AssemblyName System.Security
$text=[Console]::In.ReadToEnd();if($text.Length -gt 4096){throw 'Software consent capacity'};$inputValue=$text|ConvertFrom-Json;$text=$null
if((@($inputValue.PSObject.Properties.Name|Sort-Object)-join ',') -cne 'deviceId,install,inventory,server,username' -or $inputValue.deviceId -cnotmatch '^fc_[a-f0-9]{32}$' -or $inputValue.inventory -isnot [bool] -or $inputValue.install -isnot [bool]){throw 'Software consent scope differs'}
$root=Join-Path $env:LOCALAPPDATA ('FrevOS\Connector\'+$inputValue.deviceId)
function Plain([string]$File){for($p=[IO.Path]::GetFullPath($File);;$p=[IO.Path]::GetDirectoryName($p)){if((Get-Item -LiteralPath $p -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked software consent path'};if($p -ceq [IO.Path]::GetPathRoot($p)){break}}}
Plain $root;$file=Join-Path $root 'device.dpapi';Plain $file
$clear=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($file),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
try{$config=[Text.Encoding]::UTF8.GetString($clear)|ConvertFrom-Json;if($config.mode -cne 'system' -or $config.deviceId -cne $inputValue.deviceId -or $config.server -cne $inputValue.server -or $config.accountName -cne $inputValue.username -or $config.stateRoot -ine (Join-Path $root 'state')){throw 'Software consent pairing differs'}}finally{[Array]::Clear($clear,0,$clear.Length);$config=$null}
$state=Join-Path $root 'state';Plain $state;$directory=Join-Path $state 'software'
if(Test-Path -LiteralPath $directory){Plain $directory}else{[void][IO.Directory]::CreateDirectory($directory);Plain $directory}
$destination=Join-Path $directory 'consent.json';if(Test-Path -LiteralPath $destination){Plain $destination}
$temp=Join-Path $directory ('consent-'+[guid]::NewGuid().ToString('N')+'.tmp')
$bytes=[Text.UTF8Encoding]::new($false).GetBytes((@{version=1;deviceId=$inputValue.deviceId;inventory=$inputValue.inventory;install=$inputValue.install;approvedAt=[DateTimeOffset]::UtcNow.ToString('o')}|ConvertTo-Json -Compress))
$stream=[IO.File]::Open($temp,[IO.FileMode]::CreateNew);try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
if(Test-Path -LiteralPath $destination){[IO.File]::Replace($temp,$destination,$null)}else{[IO.File]::Move($temp,$destination)}
[Console]::Out.Write('{"saved":true}')
