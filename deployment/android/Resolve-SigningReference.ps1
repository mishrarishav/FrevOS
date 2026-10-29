param([Parameter(Mandatory=$true)][string]$Reference)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.Security
$expected=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\private\signing-password.dpapi'))
if([IO.Path]::GetFullPath($Reference) -cne $expected -or (Get-Item -LiteralPath $expected).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Signing reference denied'}
$privateBytes=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($expected),$null,[Security.Cryptography.DataProtectionScope]::LocalMachine)
try{[Console]::Out.Write([Text.Encoding]::UTF8.GetString($privateBytes))}finally{[Array]::Clear($privateBytes,0,$privateBytes.Length)}
