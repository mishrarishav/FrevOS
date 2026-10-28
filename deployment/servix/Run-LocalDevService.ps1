#requires -Version 5.1
$ErrorActionPreference='Stop'
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
$launch=[Console]::ReadLine()|ConvertFrom-Json
Import-Module (Join-Path $PSScriptRoot 'BuildProcess.psm1') -Force
# Join our own kill-on-close job BEFORE starting application code. Descendants
# inherit it; no application is briefly started outside its containment job.
Initialize-ServixBuildGroup -MaxProcesses 32 -MaxMemoryBytes 8589934592
$parent=[Diagnostics.Process]::GetProcessById([int]$launch.parentId)
function Quote-Argument([string]$value) {
 if($value -notmatch '[\s"]' -and $value.Length){return $value}
 return '"'+[regex]::Replace([regex]::Replace($value,'(\\*)"','$1$1\"'),'(\\+)$','$1$1')+'"'
}
$info=[Diagnostics.ProcessStartInfo]::new()
$info.FileName=[string]$launch.executable
$info.Arguments=(@($launch.arguments|ForEach-Object {Quote-Argument ([string]$_)}) -join ' ')
$info.WorkingDirectory=[string]$launch.directory
$info.UseShellExecute=$false;$info.CreateNoWindow=$true
$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
$info.RedirectStandardInput=$true
$info.EnvironmentVariables.Clear()
foreach($property in $launch.environment.PSObject.Properties){$info.EnvironmentVariables[$property.Name]=[string]$property.Value}
$child=[Diagnostics.Process]::new();$child.StartInfo=$info
try {
 [void]$child.Start();[void]$child.Handle
 # Application processes never inherit the controller's private input pipe.
 $child.StandardInput.Close()
 # Raw customer output can contain credentials. It is never persisted or sent
 # to DevSetu; status and bounded health/process evidence are separate.
 $discardOut=$child.StandardOutput.BaseStream.CopyToAsync([IO.Stream]::Null)
 $discardErr=$child.StandardError.BaseStream.CopyToAsync([IO.Stream]::Null)
 @{pid=$child.Id;createdAt=$child.StartTime.ToUniversalTime().ToString('o')}|ConvertTo-Json -Compress|Write-Output
 $control=[ServixBuildGroup]::ReadControl()
 $deadline=[DateTime]::UtcNow.AddHours(8)
 while(-not $child.WaitForExit(400)) {
  if($control.IsCompleted -or $parent.HasExited -or [DateTime]::UtcNow -ge $deadline){break}
 }
 # Exiting this controller closes its non-inherited job handle, killing every
 # remaining child. No PID supplied by a browser is terminated here.
} finally {$child.Dispose();$parent.Dispose()}
