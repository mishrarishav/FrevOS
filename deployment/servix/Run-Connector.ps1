#requires -Version 5.1
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'BuildProcess.psm1') -Force
Initialize-ServixBuildGroup
Add-Type -AssemblyName System.Security
$encrypted=[IO.File]::ReadAllBytes((Join-Path $PSScriptRoot 'device.dpapi'))
$clear=[Security.Cryptography.ProtectedData]::Unprotect($encrypted,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
$scope=[Text.Encoding]::UTF8.GetString($clear)|ConvertFrom-Json
if($scope.PSObject.Properties['mode'] -and $scope.mode -ceq 'system'){
 $manifestFile=Join-Path $PSScriptRoot 'system-runtime-manifest.json'
 if((Get-FileHash -LiteralPath $manifestFile -Algorithm SHA256).Hash.ToLowerInvariant() -cne $scope.runtimeManifestSha256){throw 'Installed system runtime changed'}
 $manifest=Get-Content -LiteralPath $manifestFile -Encoding UTF8 -Raw|ConvertFrom-Json
 if($manifest.version -ne 1 -or @($manifest.files.PSObject.Properties).Count -gt 16){throw 'Installed runtime manifest differs'}
 foreach($file in $manifest.files.PSObject.Properties){if($file.Name -cnotmatch '^[A-Za-z0-9][A-Za-z0-9.-]+$' -or $file.Value -cnotmatch '^[a-f0-9]{64}$' -or (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $file.Name) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $file.Value){throw 'Installed system runtime changed'}}
}
$scope=$null
$info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=Join-Path $PSScriptRoot 'node.exe';$info.Arguments='"'+(Join-Path $PSScriptRoot 'Connector.cjs')+'"';$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true
# The device credential is sent over the private stdin pipe, never argv or environment.
$process=[Diagnostics.Process]::new();$process.StartInfo=$info
try{[void]$process.Start();$process.StandardInput.BaseStream.Write($clear,0,$clear.Length);$process.StandardInput.Close();[Array]::Clear($clear,0,$clear.Length);$process.WaitForExit();exit $process.ExitCode}finally{[Array]::Clear($clear,0,$clear.Length);$process.Dispose()}
