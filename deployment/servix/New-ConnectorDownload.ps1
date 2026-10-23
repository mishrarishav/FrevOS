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
 foreach($name in @('LocalDevelopment.cjs','LocalDevBoundary.cjs','Run-LocalDevService.ps1','LocalDevProcesses.ps1')){[void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,(Join-Path $PSScriptRoot $name),$name,[IO.Compression.CompressionLevel]::Optimal)}
 foreach($name in @('ComponentExecutor.cjs','ComponentRuntime.ps1','ComponentPlatform.ps1','NativePlatform.cjs','Setup-Executor.ps1','Setup-Executor.cmd','Run-Executor.ps1')){[void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,(Join-Path $PSScriptRoot $name),$name,[IO.Compression.CompressionLevel]::Optimal)}
 foreach($name in @('New-ServixDashboardRelease.ps1','HttpCommon.ps1','Verify-HttpManifest.mjs','Apply-ServixDashboard.ps1','Start-Server20.ps1','Install-SelfUpdate.ps1','Run-SelfUpdate.ps1')){[void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,(Join-Path $PSScriptRoot ('..\server20\'+$name)),$name,[IO.Compression.CompressionLevel]::Optimal)}
 foreach($name in @('node.exe','LICENSE')){
  $original=$runtime.GetEntry('node-v24.19.0-win-x64/'+$name)
  if($null -eq $original){throw 'Pinned runtime entry is missing'}
  $entry=$archive.CreateEntry($name,[IO.Compression.CompressionLevel]::Optimal)
  $source=$original.Open();$target=$entry.Open()
  try{$source.CopyTo($target)}finally{$target.Dispose();$source.Dispose()}
 }
}finally{$archive.Dispose();$runtime.Dispose()}
