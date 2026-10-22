$ErrorActionPreference='Stop';Add-Type -AssemblyName System.Security
Import-Module (Join-Path $PSScriptRoot 'BuildProcess.psm1') -Force;Initialize-ServixBuildGroup
$scopeText=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'executor-scope.txt'))
if($scopeText -cnotin @('CurrentUser','LocalMachine')){throw 'Invalid executor credential scope'}
$scope=[Security.Cryptography.DataProtectionScope]::$scopeText
$bytes=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes((Join-Path $PSScriptRoot 'executor.dpapi')),$null,$scope)
$role=([Text.Encoding]::UTF8.GetString($bytes)|ConvertFrom-Json).role
if($role -ceq 'builder' -and ([Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){[Array]::Clear($bytes,0,$bytes.Length);throw 'Build workers must run without administrator elevation'}
$info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=Join-Path $PSScriptRoot 'node.exe';$info.Arguments='"'+(Join-Path $PSScriptRoot 'ComponentExecutor.cjs')+'"';$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true
$child=[Diagnostics.Process]::new();$child.StartInfo=$info
try{[void]$child.Start();$child.StandardInput.BaseStream.Write($bytes,0,$bytes.Length);$child.StandardInput.Close();[Array]::Clear($bytes,0,$bytes.Length);$child.WaitForExit();exit $child.ExitCode}finally{[Array]::Clear($bytes,0,$bytes.Length);$child.Dispose()}
