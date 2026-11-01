#requires -Version 5.1
$ErrorActionPreference='Stop'
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
$request=[Console]::In.ReadToEnd()|ConvertFrom-Json
$port=[int]$request.port
if($port -lt 1024 -or $port -gt 65535){throw 'Invalid development port'}
$root=[IO.Path]::GetFullPath([string]$request.directory).TrimEnd('\')+'\'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
namespace DevSetu {
 public static class LocalTcpOwners {
  [DllImport("iphlpapi.dll")]
  private static extern uint GetExtendedTcpTable(IntPtr table, ref uint size, bool sorted, uint family, uint tableClass, uint reserved);
  public static uint[] Find(int port) {
   var owners = new HashSet<uint>();
   foreach (uint family in new uint[] { 2, 23 }) {
    uint size = 0;
    uint code = GetExtendedTcpTable(IntPtr.Zero, ref size, false, family, 3, 0);
    if (family == 23 && code == 50) continue;
    if (code != 0 && code != 122) throw new Win32Exception((int)code);
    bool complete = false;
    for (int attempt = 0; attempt < 3; attempt++) {
     if (size < 4 || size > 4194304) throw new InvalidOperationException("TCP inventory capacity");
     uint allocated = size;
     IntPtr table = Marshal.AllocHGlobal((int)allocated);
     try {
      code = GetExtendedTcpTable(table, ref size, false, family, 3, 0);
      if (code == 122) continue;
      if (code != 0) throw new Win32Exception((int)code);
      int stride = family == 2 ? 24 : 56;
      int portOffset = family == 2 ? 8 : 20;
      uint count = (uint)Marshal.ReadInt32(table);
      if (size > allocated || count > (allocated - 4) / stride) throw new InvalidOperationException("TCP inventory changed");
      for (uint i = 0; i < count; i++) {
       IntPtr row = IntPtr.Add(table, 4 + (int)i * stride);
       int localPort = (Marshal.ReadByte(row, portOffset) << 8) | Marshal.ReadByte(row, portOffset + 1);
       if (localPort == port) owners.Add((uint)Marshal.ReadInt32(row, stride - 4));
      }
      complete = true;
      break;
     } finally { Marshal.FreeHGlobal(table); }
    }
    if (!complete) throw new InvalidOperationException("TCP inventory changed");
   }
   var result = new uint[owners.Count]; owners.CopyTo(result); return result;
  }
 }
}
'@
function Find-PortProcess {
 # The CIM TCP provider can omit live listeners. IP Helper supplies the actual
 # IPv4/IPv6 owner table; a reachable port alone never grants stop authority.
 $owners=@([DevSetu.LocalTcpOwners]::Find($port))
 if($owners.Count -ne 1){return $null}
 return Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$owners[0])
}
function Test-ProjectProcess($process) {
 $current=$process
 for($depth=0;$current -and $depth -lt 16;$depth++) {
  if($current.ProcessId -le 4){return $false}
  if($request.controllerId -and $current.ProcessId -eq [int]$request.controllerId){return $true}
  if($current.ExecutablePath -and ([string]$current.ExecutablePath).StartsWith($root,[StringComparison]::OrdinalIgnoreCase)){return $true}
  # Only the application script/project proves scope. An unrelated executable
  # receiving a project file as data must never become killable.
  if($current.Name -in @('node.exe','dotnet.exe') -and $current.CommandLine) {
   $arguments=@([regex]::Matches([string]$current.CommandLine,'"[^"\r\n]*"|[^\s"\r\n]+')|ForEach-Object {$_.Value.Trim('"')})
   $candidate=$null
   if($arguments.Count -gt 1) {
    if($current.Name -eq 'node.exe' -and $arguments[1] -match '\.(?:cjs|mjs|js)$'){$candidate=$arguments[1]}
    elseif($current.Name -eq 'dotnet.exe' -and $arguments[1] -match '\.dll$'){$candidate=$arguments[1]}
    elseif($current.Name -eq 'dotnet.exe' -and $arguments[1] -eq 'run') {
     $projectIndex=[Array]::IndexOf($arguments,'--project')
     if($projectIndex -ge 2 -and $projectIndex+1 -lt $arguments.Count){$candidate=$arguments[$projectIndex+1]}
    }
   }
   if($candidate -and $candidate -match '^[A-Za-z]:[\\/]') {
    try {if(([IO.Path]::GetFullPath($candidate).TrimEnd('\')+'\').StartsWith($root,[StringComparison]::OrdinalIgnoreCase)){return $true}}catch{}
   }
  }
  if(-not $current.ParentProcessId){break}
  $parent=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$current.ParentProcessId)
  if($parent -and $parent.CreationDate -gt $current.CreationDate){break}
  $current=$parent
 }
 return $false
}
$process=Find-PortProcess
if(-not $process){Write-Output 'null';exit}
$created=$process.CreationDate.ToUniversalTime().ToString('o')
$owned=Test-ProjectProcess $process
if($request.operation -eq 'stop') {
 if(-not $owned -or $process.ProcessId -ne [int]$request.expectedPid -or $created -ne [string]$request.expectedCreatedAt){throw 'Process identity or project ownership changed'}
 # Re-read immediately before termination; never turn an observed port into
 # authority over an unrelated or replaced process.
 $fresh=Find-PortProcess
 if(-not $fresh -or $fresh.ProcessId -ne $process.ProcessId -or $fresh.CreationDate -ne $process.CreationDate -or -not(Test-ProjectProcess $fresh)){throw 'Process changed'}
 & (Join-Path $env:WINDIR 'System32\taskkill.exe') /PID ([string]$process.ProcessId) /T /F *> $null
 if($LASTEXITCODE -ne 0){throw 'Could not stop verified project process'}
 Write-Output '{"stopped":true}';exit
}
@{pid=[int]$process.ProcessId;name=[string]$process.Name;createdAt=$created;projectOwned=[bool]$owned}|ConvertTo-Json -Compress|Write-Output
