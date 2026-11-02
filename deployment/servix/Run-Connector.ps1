#requires -Version 5.1
param([switch]$ConnectionStatus,[switch]$CreateStatusShortcut)
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'BuildProcess.psm1') -Force
Add-Type -AssemblyName System.Security
$encrypted=[IO.File]::ReadAllBytes((Join-Path $PSScriptRoot 'device.dpapi'))
$clear=[Security.Cryptography.ProtectedData]::Unprotect($encrypted,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
$scope=[Text.Encoding]::UTF8.GetString($clear)|ConvertFrom-Json
if($scope.PSObject.Properties['mode'] -and $scope.mode -ceq 'system'){
 $manifestFile=Join-Path $PSScriptRoot 'system-runtime-manifest.json'
 if((Get-FileHash -LiteralPath $manifestFile -Algorithm SHA256).Hash.ToLowerInvariant() -cne $scope.runtimeManifestSha256){throw 'Installed system runtime changed'}
 $manifest=Get-Content -LiteralPath $manifestFile -Encoding UTF8 -Raw|ConvertFrom-Json
 if($manifest.version -ne 1 -or @($manifest.files.PSObject.Properties).Count -gt 32){throw 'Installed runtime manifest differs'}
 foreach($file in $manifest.files.PSObject.Properties){if($file.Name -cnotmatch '^[A-Za-z0-9][A-Za-z0-9.-]+$' -or $file.Value -cnotmatch '^[a-f0-9]{64}$' -or (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $file.Name) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $file.Value){throw 'Installed system runtime changed'}}
}
if($ConnectionStatus -or $CreateStatusShortcut){
 try{
  $expected=Join-Path $env:LOCALAPPDATA ('FrevOS\Connector\'+$scope.deviceId)
  if($scope.mode -cne 'system' -or $scope.deviceId -cnotmatch '^fc_[a-f0-9]{32}$' -or $PSScriptRoot -ine $expected){throw 'Status scope differs'}
  if($CreateStatusShortcut){
   $desktop=[Environment]::GetFolderPath('DesktopDirectory')
   if(-not(Test-Path -LiteralPath $desktop -PathType Container)){throw 'Desktop unavailable'}
   $link=Join-Path $desktop ('DevSetu Connection Status '+$scope.deviceId.Substring(3,6)+'.lnk')
   if((Test-Path -LiteralPath $link) -and ((Get-Item -LiteralPath $link).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked status shortcut'}
   $execute=Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
   $iconFile=Join-Path $expected 'devsetu-status.ico'
   if((Test-Path -LiteralPath $iconFile) -and ((Get-Item -LiteralPath $iconFile).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked status icon'}
   if(-not(Test-Path -LiteralPath $iconFile)){
    Add-Type -AssemblyName System.Drawing
    if(-not('DevSetuStatusIconNative' -as [type])){Add-Type 'using System;using System.Runtime.InteropServices;public static class DevSetuStatusIconNative{[DllImport("user32.dll")]public static extern bool DestroyIcon(IntPtr value);}'}
    $bitmap=New-Object Drawing.Bitmap 64,64;$graphics=[Drawing.Graphics]::FromImage($bitmap)
    $font=New-Object Drawing.Font 'Segoe UI',32,([Drawing.FontStyle]::Bold)
    $brush=New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(0,210,216))
    try{
     $graphics.Clear([Drawing.Color]::FromArgb(13,25,31));$graphics.DrawString('D',$font,$brush,10,4)
     $handle=$bitmap.GetHicon();try{$icon=[Drawing.Icon]::FromHandle($handle);$stream=[IO.File]::Open($iconFile,[IO.FileMode]::CreateNew);try{$icon.Save($stream)}finally{$stream.Dispose();$icon.Dispose()}}finally{[void][DevSetuStatusIconNative]::DestroyIcon($handle)}
    }finally{$brush.Dispose();$font.Dispose();$graphics.Dispose();$bitmap.Dispose()}
   }
   $arguments='-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File "'+(Join-Path $expected 'Run-Connector.ps1')+'" -ConnectionStatus'
   $shell=New-Object -ComObject WScript.Shell
   try{
    $shortcut=$shell.CreateShortcut($link)
    if((Test-Path -LiteralPath $link) -and ($shortcut.TargetPath -ine $execute -or $shortcut.Arguments -cne $arguments)){throw 'Existing shortcut differs'}
    $shortcut.TargetPath=$execute;$shortcut.Arguments=$arguments;$shortcut.WorkingDirectory=$expected
    $shortcut.Description='DevSetu: check this computer connection'
    $shortcut.IconLocation=$iconFile+',0'
    $shortcut.Save()
   }finally{if($shortcut){[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shortcut)};[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell)}
  }else{
   $statusFile=Join-Path $expected 'state\connection-status.json'
   if((Get-Item -LiteralPath (Join-Path $expected 'state')).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked status directory'}
   if((Get-Item -LiteralPath $statusFile).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked status path'}
   if((Get-Item -LiteralPath $statusFile).Length -gt 512){throw 'Status capacity'}
   $status=Get-Content -LiteralPath $statusFile -Raw|ConvertFrom-Json
   if($status.version -ne 1 -or $status.deviceId -cne $scope.deviceId -or $status.port -isnot [int] -or $status.port -lt 1024 -or $status.port -gt 65535 -or $status.pid -lt 1){throw 'Status differs'}
   $process=Get-Process -Id $status.pid
   if($process.Path -ine (Join-Path $expected 'node.exe')){throw 'Connector offline'}
   Start-Process ('http://127.0.0.1:'+$status.port+'/connection-status') -WindowStyle Hidden
  }
 }catch{
  if($CreateStatusShortcut){throw}
  Add-Type -AssemblyName System.Windows.Forms
  [void][Windows.Forms.MessageBox]::Show('The DevSetu connector is offline or its status is unavailable. Keep your Windows user signed in and open DevSetu setup to check the saved connection.','DevSetu connection status')
 }finally{[Array]::Clear($clear,0,$clear.Length);$scope=$null}
 return
}
Initialize-ServixBuildGroup
$scope=$null
$info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=Join-Path $PSScriptRoot 'node.exe';$info.Arguments='"'+(Join-Path $PSScriptRoot 'Connector.cjs')+'"';$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true
# The device credential is sent over the private stdin pipe, never argv or environment.
$process=[Diagnostics.Process]::new();$process.StartInfo=$info
try{[void]$process.Start();$process.StandardInput.BaseStream.Write($clear,0,$clear.Length);$process.StandardInput.Close();[Array]::Clear($clear,0,$clear.Length);$process.WaitForExit();exit $process.ExitCode}finally{[Array]::Clear($clear,0,$clear.Length);$process.Dispose()}
