param([Parameter(Mandatory=$true)][string]$Node,[Parameter(Mandatory=$true)][string]$Script,[Parameter(Mandatory=$true)][string]$ArgumentsBase64)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'BuildProcess.psm1') -Force
Initialize-ServixBuildGroup -MaxProcesses 16 -MaxMemoryBytes 1073741824
$arguments=@([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($ArgumentsBase64))|ConvertFrom-Json)
$all=@($Script)+$arguments
foreach($arg in $all){if(([string]$arg).Contains('"') -or ([string]$arg).Contains("`n") -or ([string]$arg).Contains("`r")){throw 'Helper argument rejected'}}
$info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=$Node;$info.Arguments=(@($all|ForEach-Object {'"'+$_+'"'}) -join ' ')
$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true;$info.EnvironmentVariables['NODE_OPTIONS']=''
$p=[Diagnostics.Process]::new();$p.StartInfo=$info
try{
 if(-not $p.Start()){throw 'Helper unavailable'}
 $stdout=$p.StandardOutput.ReadToEndAsync();$stderr=$p.StandardError.ReadToEndAsync()
 $inputText=[Console]::In.ReadToEnd();$p.StandardInput.Write($inputText);$p.StandardInput.Close();$inputText=$null
 if(-not $p.WaitForExit(1200000)){$p.Kill();throw 'Helper timed out'}
 $outputText=$stdout.GetAwaiter().GetResult();[void]$stderr.GetAwaiter().GetResult()
 if($p.ExitCode -ne 0 -or [Text.Encoding]::UTF8.GetByteCount($outputText) -gt 1048576){throw 'Helper failed'}
 [Console]::Out.Write($outputText)
}catch{[Console]::Error.WriteLine('Promotion helper failed');exit 1}
finally{$p.Dispose();$inputText=$null}
