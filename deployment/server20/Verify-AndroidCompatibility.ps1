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
function Read-BoundedInstalled([string]$Root,[string]$Name,[int]$Maximum){
 $file=Join-Path $Root $Name
 for($cursor=$file;$cursor -cne $Root;$cursor=[IO.Path]::GetDirectoryName($cursor)){if((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Software compatibility linked metadata denied'}}
 if((Get-Item -LiteralPath $file).Length -gt $Maximum){throw 'Software compatibility metadata capacity'}
 return ,[IO.File]::ReadAllBytes($file)
}
function Get-SoftwareFormat($Manifest,[scriptblock]$ReadFile,[scriptblock]$Exists){
 $name='deployment/server20/software-data-format.json';$schema='apps/control-plane/node_modules/@frevos/contracts/dist/software-management.js'
 $entries=@($Manifest.files|Where-Object path -CEQ $name)
 if($entries.Count -eq 0){if(& $Exists $name){throw 'Software compatibility metadata is not manifest-bound'};return 1}
 if($entries.Count -ne 1){throw 'Software compatibility metadata repeated'}
 [byte[]]$bytes=& $ReadFile $name 4096
 $hash=[BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($bytes)).Replace('-','').ToLowerInvariant()
 if($hash -cne $entries[0].sha256){throw 'Software compatibility metadata identity differs'}
 $text=[Text.Encoding]::UTF8.GetString($bytes);$value=$text|ConvertFrom-Json
 if((@($value.PSObject.Properties.Name|Sort-Object)-join ',') -cne 'schemaSha256,softwareState,version' -or $value.version -ne 1 -or ($value.softwareState -isnot [int] -and $value.softwareState -isnot [long]) -or $value.softwareState -lt 1 -or $value.softwareState -gt 999 -or $value.schemaSha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'Software compatibility format metadata invalid'}
 $canonical='{"version":1,"softwareState":'+$value.softwareState+',"schemaSha256":"'+$value.schemaSha256+'"}'
 if($text -cne $canonical){throw 'Software compatibility format metadata is not canonical'}
 $schemaEntry=@($Manifest.files|Where-Object path -CEQ $schema)
 if($schemaEntry.Count -ne 1 -or $schemaEntry[0].sha256 -cne $value.schemaSha256){throw 'Software compatibility schema identity differs'}
 [byte[]]$schemaBytes=& $ReadFile $schema 1000000
 $schemaHash=[BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($schemaBytes)).Replace('-','').ToLowerInvariant()
 if($schemaHash -cne $value.schemaSha256){throw 'Software compatibility schema bytes differ'}
 return [int]$value.softwareState
}
function Get-SoftwareRequiredFormat([string]$root){
 $requiredFormat=1;$floorPath='servix/jobs/software/data-format.json'
 if(Test-Path -LiteralPath (Join-Path $root $floorPath)){
  [byte[]]$floorBytes=Read-BoundedInstalled $root $floorPath 4096;$floorText=[Text.Encoding]::UTF8.GetString($floorBytes);$floor=$floorText|ConvertFrom-Json
  if((@($floor.PSObject.Properties.Name|Sort-Object)-join ',') -cne 'softwareState,version' -or $floor.version -ne 1 -or ($floor.softwareState -isnot [int] -and $floor.softwareState -isnot [long]) -or $floor.softwareState -lt 1 -or $floor.softwareState -gt 999 -or $floorText -cne ('{"version":1,"softwareState":'+$floor.softwareState+'}')){throw 'Software compatibility persisted format floor invalid'}
  $requiredFormat=[int]$floor.softwareState
 }
 return $requiredFormat
}
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
 $beforeFormat=Get-SoftwareFormat $before {param($name,$maximum) Read-BoundedInstalled $previous $name $maximum} {param($name) Test-Path -LiteralPath (Join-Path $previous $name)}
 $candidateFormat=Get-SoftwareFormat $manifest {param($name,$maximum) Read-BoundedEntry $zip $name $maximum} {param($name) @($zip.Entries|Where-Object FullName -CEQ $name).Count -gt 0}
 $requiredFormat=Get-SoftwareRequiredFormat $root
 if($candidateFormat -lt $requiredFormat){throw 'Software compatibility boundary: retain a release that reads existing software observations, service jobs and Android inventories; no changes applied'}
 if((Includes-Android $beforeInventory) -and -not(Includes-Android $inventory)){throw 'Android compatibility boundary: use a release that supports existing Android records; no changes applied'}
 $previewMarker='packages/contracts/src/preview-relay.ts'
 if(@($beforeInventory.files|Where-Object path -CEQ $previewMarker).Count -and -not @($inventory.files|Where-Object path -CEQ $previewMarker).Count){throw 'Preview compatibility boundary: use a release that supports retained preview service plans; no changes applied'}
 $browserFile=Join-Path $root 'servix\config\browser-entry.json'
 if(Test-Path -LiteralPath $browserFile){
  if((Get-Item -LiteralPath $browserFile).Attributes -band [IO.FileAttributes]::ReparsePoint -or (Get-Item -LiteralPath $browserFile).Length -gt 4096){throw 'Browser entry compatibility profile rejected'}
  $browser=Get-Content -LiteralPath $browserFile -Raw|ConvertFrom-Json
  if($browser.version -ne 1 -or $browser.basePath -cnotmatch '^/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$' -or -not @($inventory.files|Where-Object path -CEQ 'apps/control-plane/src/browser-entry.ts').Count){throw 'Browser entry compatibility boundary: retain support for the configured browser entry; no changes applied'}
  $metadataBytes=Read-BoundedEntry $zip 'apps/control-center/dist-browser/browser-entry.json' 4096
  $metadataEntry=@($manifest.files|Where-Object path -CEQ 'apps/control-center/dist-browser/browser-entry.json')
  $metadataHash=[BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($metadataBytes)).Replace('-','').ToLowerInvariant()
  $metadata=[Text.Encoding]::UTF8.GetString($metadataBytes)|ConvertFrom-Json
  if(($browser.PSObject.Properties.Name -contains 'connectorTransport') -and $browser.connectorTransport -eq $true -and (-not($metadata.PSObject.Properties.Name -contains 'connectorTransport') -or $metadata.connectorTransport -ne 1)){throw 'Browser entry compatibility boundary: retain configured public connector transport; no changes applied'}
  if($metadataEntry.Count -ne 1 -or $metadataEntry[0].sha256 -cne $metadataHash -or $metadata.version -ne 1 -or $metadata.basePath -cne $browser.basePath){throw 'Browser entry compatibility boundary: built assets must match the retained browser entry; no changes applied'}
 }
}finally{$zip.Dispose()}
'PASS: Android data compatibility boundary retained'
