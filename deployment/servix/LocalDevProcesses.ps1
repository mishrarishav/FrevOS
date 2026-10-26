#requires -Version 5.1
$ErrorActionPreference='Stop'
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
$request=[Console]::In.ReadToEnd()|ConvertFrom-Json
$port=[int]$request.port
if($port -lt 1024 -or $port -gt 65535){throw 'Invalid development port'}
$root=[IO.Path]::GetFullPath([string]$request.directory).TrimEnd('\')+'\'
function Find-PortProcess {
 $listeners=@(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
 $owners=@($listeners|Select-Object -ExpandProperty OwningProcess -Unique)
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
