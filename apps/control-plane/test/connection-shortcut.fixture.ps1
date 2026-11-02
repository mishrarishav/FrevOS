#requires -Version 5.1
param([Parameter(Mandatory=$true)][string]$SourceRoot)
$ErrorActionPreference='Stop'
$id='fc_'+[guid]::NewGuid().ToString('N')
$parent=[IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'FrevOS\Connector'))
$root=Join-Path $parent $id
$desktop=[Environment]::GetFolderPath('DesktopDirectory')
$link=Join-Path $desktop ('DevSetu Connection Status '+$id.Substring(3,6)+'.lnk')
$marker=Join-Path $root 'shortcut-fixture-marker.txt'
if((Test-Path -LiteralPath $root) -or (Test-Path -LiteralPath $link)){throw 'Fixture collision'}
$shell=$null;$shortcut=$null
try{
 [void][IO.Directory]::CreateDirectory($root)
 [IO.File]::WriteAllText($marker,$id)
 foreach($name in @('Run-Connector.ps1','BuildProcess.psm1')){[IO.File]::Copy((Join-Path $SourceRoot ('deployment\servix\'+$name)),(Join-Path $root $name),$false)}
 $files=@{};foreach($name in @('Run-Connector.ps1','BuildProcess.psm1')){$files[$name]=(Get-FileHash -LiteralPath (Join-Path $root $name) -Algorithm SHA256).Hash.ToLowerInvariant()}
 $manifest=Join-Path $root 'system-runtime-manifest.json';[IO.File]::WriteAllText($manifest,(@{version=1;files=$files}|ConvertTo-Json -Compress))
 Add-Type -AssemblyName System.Security
 $config=@{version=1;mode='system';deviceId=$id;runtimeManifestSha256=(Get-FileHash -LiteralPath $manifest -Algorithm SHA256).Hash.ToLowerInvariant()}
 $clear=[Text.Encoding]::UTF8.GetBytes(($config|ConvertTo-Json -Compress))
 try{[IO.File]::WriteAllBytes((Join-Path $root 'device.dpapi'),[Security.Cryptography.ProtectedData]::Protect($clear,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))}finally{[Array]::Clear($clear,0,$clear.Length)}
 & (Join-Path $root 'Run-Connector.ps1') -CreateStatusShortcut
 if(-not(Test-Path -LiteralPath $link -PathType Leaf)){throw 'Shortcut missing'}
 $shell=New-Object -ComObject WScript.Shell;$shortcut=$shell.CreateShortcut($link)
 if($shortcut.Arguments -notlike '*Run-Connector.ps1" -ConnectionStatus' -or $shortcut.WorkingDirectory -ine $root -or $shortcut.Arguments.Contains('device.dpapi')){throw 'Shortcut scope differs'}
 Add-Type -AssemblyName System.Drawing
 $icon=[Drawing.Icon]::new((Join-Path $root 'devsetu-status.ico'));try{if($icon.Width -lt 32){throw 'Icon missing'}}finally{$icon.Dispose()}
 [Console]::Out.Write('{"status":"PASS","desktopShortcut":true,"brandedIcon":true,"credentialInArguments":false}')
}finally{
 if($shortcut){[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shortcut)}
 if($shell){[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell)}
 if(Test-Path -LiteralPath $link){
  $resolvedLink=[IO.Path]::GetFullPath($link)
  if([IO.Path]::GetDirectoryName($resolvedLink) -ine $desktop -or [IO.Path]::GetFileName($resolvedLink) -cne ('DevSetu Connection Status '+$id.Substring(3,6)+'.lnk')){throw 'Shortcut cleanup escaped'}
  Remove-Item -LiteralPath $resolvedLink -Force
 }
 if(Test-Path -LiteralPath $root){
  $resolvedRoot=(Resolve-Path -LiteralPath $root).Path
  if([IO.Path]::GetDirectoryName($resolvedRoot) -ine $parent -or [IO.Path]::GetFileName($resolvedRoot) -cne $id -or
     (Get-Item -LiteralPath $resolvedRoot).Attributes -band [IO.FileAttributes]::ReparsePoint -or
     [IO.File]::ReadAllText($marker) -cne $id){throw 'Fixture cleanup escaped'}
  Remove-Item -LiteralPath $resolvedRoot -Recurse -Force
 }
}
