param([Parameter(Mandatory=$true)][string]$NodeArchive,[Parameter(Mandatory=$true)][string]$OutputPath)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.IO.Compression.FileSystem
$output=[IO.Path]::GetFullPath($OutputPath)
if(Test-Path -LiteralPath $output){throw 'Connector download already exists'}
$picker=Join-Path (Split-Path $output -Parent) 'FrevOS.FolderPicker.exe'
if(Test-Path -LiteralPath $picker){throw 'Native picker already exists'}
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if(-not(Test-Path -LiteralPath $compiler -PathType Leaf)){throw 'Existing Windows .NET compiler unavailable; no software will be installed'}
& $compiler /nologo /target:winexe /optimize+ /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll ('/out:'+$picker) (Join-Path $PSScriptRoot 'RepositoryPicker.cs')
if($LASTEXITCODE -ne 0){throw 'Native picker build failed'}
$runtime=[IO.Compression.ZipFile]::OpenRead([IO.Path]::GetFullPath($NodeArchive))
$archive=[IO.Compression.ZipFile]::Open($output,[IO.Compression.ZipArchiveMode]::Create)
try{
 [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$picker,'FrevOS.FolderPicker.exe',[IO.Compression.CompressionLevel]::Optimal)
 foreach($name in @('Connector.cjs','Preservation.cjs','Choose-Repository.ps1','RepositoryPicker.psm1','Setup-Connector.ps1','Run-Connector.ps1','BuildProcess.psm1','Setup.cmd')){[void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,(Join-Path $PSScriptRoot $name),$name,[IO.Compression.CompressionLevel]::Optimal)}
 foreach($name in @('LocalDevelopment.cjs','PreviewRelay.cjs','LocalDevBoundary.cjs','Run-LocalDevService.ps1','LocalDevProcesses.ps1','EnvironmentEditor.cjs','Write-LocalEnvironment.ps1')){[void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,(Join-Path $PSScriptRoot $name),$name,[IO.Compression.CompressionLevel]::Optimal)}
 foreach($name in @('DiscoverySafety.cjs','SystemDiscovery.cjs','SystemPrerequisites.cjs','SystemSetup.cjs','NodeToolchain.cjs','FolderBrowse.cjs','Browse-Folders.ps1')){[void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,(Join-Path $PSScriptRoot $name),$name,[IO.Compression.CompressionLevel]::Optimal)}
 foreach($name in @('FileAudit.cjs','Read-WindowsFileAudit.ps1')){[void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,(Join-Path $PSScriptRoot $name),$name,[IO.Compression.CompressionLevel]::Optimal)}
 [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,(Join-Path $PSScriptRoot 'Protect-SetupSession.ps1'),'Protect-SetupSession.ps1',[IO.Compression.CompressionLevel]::Optimal)
 [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,(Join-Path $PSScriptRoot 'DotNetToolchain.cjs'),'DotNetToolchain.cjs',[IO.Compression.CompressionLevel]::Optimal)
 [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,(Join-Path $PSScriptRoot 'SystemSetupClient.js'),'SystemSetupClient.js',[IO.Compression.CompressionLevel]::Optimal)
 foreach($name in @('SetupSession.cjs','SystemEnrollment.cjs','SystemEnrollmentClient.js','Install-SystemConnector.ps1','Resume-SystemConnector.ps1','Setup-Project.cmd','START-HERE.txt')){[void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,(Join-Path $PSScriptRoot $name),$name,[IO.Compression.CompressionLevel]::Optimal)}
 foreach($name in @('DeviceEnrollment.cjs','DeviceEnrollmentClient.js','Pairing-State.ps1','PairedLogin.psm1','Setup-Account.cmd','Update-SystemConnector.ps1','Notification-Consent.ps1')){[void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,(Join-Path $PSScriptRoot $name),$name,[IO.Compression.CompressionLevel]::Optimal)}
 $systemFiles=@('node.exe','Connector.cjs','Preservation.cjs','SystemDiscovery.cjs','DiscoverySafety.cjs','FileAudit.cjs','Read-WindowsFileAudit.ps1','FolderBrowse.cjs','Browse-Folders.ps1','Run-Connector.ps1','BuildProcess.psm1','Install-SystemConnector.ps1');$systemHashes=@{}
 foreach($name in $systemFiles){if($name -ceq 'node.exe'){$nodeEntry=$runtime.GetEntry('node-v24.19.0-win-x64/node.exe');$nodeStream=$nodeEntry.Open();try{$systemHashes[$name]=[BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($nodeStream)).Replace('-','').ToLowerInvariant()}finally{$nodeStream.Dispose()}}else{$systemHashes[$name]=(Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $name) -Algorithm SHA256).Hash.ToLowerInvariant()}}
 $systemEntry=$archive.CreateEntry('system-runtime-manifest.json',[IO.Compression.CompressionLevel]::Optimal);$systemStream=$systemEntry.Open();$systemWriter=[IO.StreamWriter]::new($systemStream,[Text.UTF8Encoding]::new($false));try{$systemWriter.Write((@{version=1;files=$systemHashes}|ConvertTo-Json -Depth 4 -Compress))}finally{$systemWriter.Dispose()}
 foreach($name in @('ComponentExecutor.cjs','ComponentRuntime.ps1','ComponentPlatform.ps1','NativePlatform.cjs','Setup-Executor.ps1','Setup-Executor.cmd','Run-Executor.ps1')){[void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,(Join-Path $PSScriptRoot $name),$name,[IO.Compression.CompressionLevel]::Optimal)}
 [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,(Join-Path $PSScriptRoot '..\android\AndroidBuildClient.cjs'),'AndroidBuildClient.cjs',[IO.Compression.CompressionLevel]::Optimal)
 [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,(Join-Path $PSScriptRoot '..\server20\Verify-AndroidCompatibility.ps1'),'Verify-AndroidCompatibility.ps1',[IO.Compression.CompressionLevel]::Optimal)
 foreach($name in @('New-ServixDashboardRelease.ps1','HttpCommon.ps1','Verify-HttpManifest.mjs','Apply-ServixDashboard.ps1','Start-Server20.ps1','Install-SelfUpdate.ps1','Run-SelfUpdate.ps1')){[void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,(Join-Path $PSScriptRoot ('..\server20\'+$name)),$name,[IO.Compression.CompressionLevel]::Optimal)}
 foreach($original in $runtime.Entries){
  if(-not $original.FullName.StartsWith('node-v24.19.0-win-x64/',[StringComparison]::Ordinal)){throw 'Pinned runtime scope is invalid'}
  $name=$original.FullName.Substring('node-v24.19.0-win-x64/'.Length)
  if($name.EndsWith('/') -or ($name -cnotin @('node.exe','LICENSE','npm','npm.cmd','npx','npx.cmd') -and -not $name.StartsWith('node_modules/npm/',[StringComparison]::Ordinal))){continue}
  if($name.Contains('..') -or $name.Contains('\')){throw 'Pinned runtime path is invalid'}
  $entry=$archive.CreateEntry($name,[IO.Compression.CompressionLevel]::Optimal)
  $source=$original.Open();$target=$entry.Open()
  try{$source.CopyTo($target)}finally{$target.Dispose();$source.Dispose()}
 }
}finally{$archive.Dispose();$runtime.Dispose()}
