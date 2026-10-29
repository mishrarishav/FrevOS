param([Parameter(Mandatory=$true)][string]$InstallationRoot,[Parameter(Mandatory=$true)][string]$Archive,[Parameter(Mandatory=$true)][string]$ArchiveSha256,[Parameter(Mandatory=$true)][string]$SourceHead)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.IO.Compression.FileSystem
function Read-BoundedEntry($Zip,[string]$Name,[int]$Maximum){
 $entries=@($Zip.Entries|Where-Object FullName -CEQ $Name)
 if($entries.Count -ne 1 -or $entries[0].Length -gt $Maximum){throw 'Android compatibility metadata missing or oversized'}
 $source=$entries[0].Open();$destination=[IO.MemoryStream]::new();$buffer=New-Object byte[] 8192
 try{while(($count=$source.Read($buffer,0,$buffer.Length)) -gt 0){if($destination.Length+$count -gt $Maximum){throw 'Android compatibility metadata capacity'};$destination.Write($buffer,0,$count)};return ,$destination.ToArray()}finally{$source.Dispose();$destination.Dispose()}
}
function Includes-Android($Inventory){return @($Inventory.files|Where-Object path -CEQ 'apps/android-connector/AndroidManifest.xml').Count -eq 1}
if($ArchiveSha256 -cnotmatch '^[a-f0-9]{64}$' -or $SourceHead -cnotmatch '^[a-f0-9]{40}$' -or (Get-Item -LiteralPath $Archive).Attributes -band [IO.FileAttributes]::ReparsePoint -or (Get-FileHash -LiteralPath $Archive).Hash.ToLowerInvariant() -cne $ArchiveSha256){throw 'Android compatibility archive identity mismatch'}
$root=[IO.Path]::GetFullPath($InstallationRoot)
if($root -ieq [IO.Path]::GetPathRoot($root) -or (Get-Item -LiteralPath $root).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Android compatibility installation scope denied'}
$active=Get-Content -LiteralPath (Join-Path $root 'state\active.json') -Raw|ConvertFrom-Json
if($active.manifestSha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'Android compatibility current release identity invalid'}
$previous=Join-Path $root ('releases\'+$active.manifestSha256);$previousManifestFile=Join-Path $previous 'release-manifest.json'
if((Get-FileHash -LiteralPath $previousManifestFile).Hash.ToLowerInvariant() -cne $active.manifestSha256){throw 'Android compatibility active manifest changed'}
$before=Get-Content -LiteralPath $previousManifestFile -Raw|ConvertFrom-Json
$inventoryFile=Join-Path $previous 'deployment\server20\source-inventory.json'
$beforeEntry=@($before.files|Where-Object path -CEQ 'deployment/server20/source-inventory.json')
if($beforeEntry.Count -ne 1 -or (Get-FileHash -LiteralPath $inventoryFile).Hash.ToLowerInvariant() -cne $beforeEntry[0].sha256){throw 'Android compatibility active inventory changed'}
$beforeInventory=Get-Content -LiteralPath $inventoryFile -Raw|ConvertFrom-Json
$zip=[IO.Compression.ZipFile]::OpenRead([IO.Path]::GetFullPath($Archive))
try{
 $manifest=[Text.Encoding]::UTF8.GetString((Read-BoundedEntry $zip 'release-manifest.json' 4000000))|ConvertFrom-Json
 $inventoryBytes=Read-BoundedEntry $zip 'deployment/server20/source-inventory.json' 2000000
 $entry=@($manifest.files|Where-Object path -CEQ 'deployment/server20/source-inventory.json')
 $inventoryHash=[BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($inventoryBytes)).Replace('-','').ToLowerInvariant()
 if($manifest.applicationSource -cne $SourceHead -or $entry.Count -ne 1 -or $entry[0].sha256 -cne $inventoryHash){throw 'Android compatibility candidate source identity mismatch'}
 $inventory=[Text.Encoding]::UTF8.GetString($inventoryBytes)|ConvertFrom-Json
 if($inventory.sourceBase -cne $SourceHead -or $inventory.state -cne 'committed'){throw 'Android compatibility candidate source is not committed'}
 if((Includes-Android $beforeInventory) -and -not(Includes-Android $inventory)){throw 'Android compatibility boundary: use a release that supports existing Android records; no changes applied'}
}finally{$zip.Dispose()}
'PASS: Android data compatibility boundary retained'
