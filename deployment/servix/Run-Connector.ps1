#requires -Version 5.1
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'BuildProcess.psm1') -Force
Initialize-ServixBuildGroup
Add-Type -AssemblyName System.Security
$encrypted=[IO.File]::ReadAllBytes((Join-Path $PSScriptRoot 'device.dpapi'))
$clear=[Security.Cryptography.ProtectedData]::Unprotect($encrypted,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
$info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=Join-Path $PSScriptRoot 'node.exe';$info.Arguments='"'+(Join-Path $PSScriptRoot 'Connector.cjs')+'"';$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true
# The device credential is sent over the private stdin pipe, never argv or environment.
$process=[Diagnostics.Process]::new();$process.StartInfo=$info
try{[void]$process.Start();$process.StandardInput.BaseStream.Write($clear,0,$clear.Length);$process.StandardInput.Close();[Array]::Clear($clear,0,$clear.Length);$process.WaitForExit();exit $process.ExitCode}finally{[Array]::Clear($clear,0,$clear.Length);$process.Dispose()}
