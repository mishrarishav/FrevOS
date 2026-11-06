$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
. (Join-Path $PSScriptRoot 'HttpCommon.ps1')
$parent=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\');$temporary=Join-Path $parent ('dvsoftware-'+[guid]::NewGuid().ToString('N').Substring(0,16));if(Test-Path -LiteralPath $temporary){throw 'Software fixture collision'};[void][IO.Directory]::CreateDirectory($temporary);$script:softwareFixtureIndex=0
function Json($file,$value){[void][IO.Directory]::CreateDirectory((Split-Path $file));[IO.File]::WriteAllText($file,($value|ConvertTo-Json -Depth 6 -Compress),[Text.UTF8Encoding]::new($false))}
function Hash($file){(Get-FileHash -LiteralPath $file).Hash.ToLowerInvariant()}
function Candidate($name,[int]$format=0){
 $folder=Join-Path $temporary $name;$inventory=Join-Path $folder 'deployment/server20/source-inventory.json';Json $inventory @{sourceBase=('b'*40);state='committed';files=@(@{path='apps/android-connector/AndroidManifest.xml';sha256=('a'*64)})}
 $entries=@(@{path='deployment/server20/source-inventory.json';sha256=(Hash $inventory)})
 if($format){
  # Synthetic schema bytes qualify hash/format handling only. Actual packaged
  # schemas are exercised separately by SoftwareDataFormat's qualification tests.
  $schema='apps/control-plane/node_modules/@frevos/contracts/dist/software-management.js';$schemaFile=Join-Path $folder $schema
  [void][IO.Directory]::CreateDirectory((Split-Path $schemaFile));[IO.File]::WriteAllText($schemaFile,'// Synthetic format fixture only',[Text.UTF8Encoding]::new($false));$schemaHash=Hash $schemaFile
  $metadata=Join-Path $folder 'deployment/server20/software-data-format.json';[IO.File]::WriteAllText($metadata,('{"version":1,"softwareState":'+$format+',"schemaSha256":"'+$schemaHash+'"}'),[Text.UTF8Encoding]::new($false))
  $entries+=@{path=$schema;sha256=$schemaHash};$entries+=@{path='deployment/server20/software-data-format.json';sha256=(Hash $metadata)}
 }
 Json (Join-Path $folder 'release-manifest.json') @{applicationSource=('b'*40);files=$entries};return $folder
}
function Install($source){$script:softwareFixtureIndex++;$root=Join-Path $temporary ('i'+$script:softwareFixtureIndex);$digest=Hash (Join-Path $source 'release-manifest.json');[void][IO.Directory]::CreateDirectory((Join-Path $root 'releases'));Copy-Item -LiteralPath $source -Destination (Join-Path $root ('releases/'+$digest)) -Recurse;Json (Join-Path $root 'state/active.json') @{manifestSha256=$digest};return $root}
function Archive($source,$name){$output=Join-Path $temporary ($name+'.zip');$zip=[IO.Compression.ZipFile]::Open($output,[IO.Compression.ZipArchiveMode]::Create);try{foreach($f in Get-ChildItem -LiteralPath $source -Recurse -File){[void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,$f.FullName,$f.FullName.Substring($source.Length+1).Replace('\','/'),[IO.Compression.CompressionLevel]::Optimal)}}finally{$zip.Dispose()};return $output}
function Verify($root,$archive){& (Join-Path $PSScriptRoot 'Verify-AndroidCompatibility.ps1') -InstallationRoot $root -Archive $archive -ArchiveSha256 (Hash $archive) -SourceHead ('b'*40)|Out-Null}
function Denied([scriptblock]$action){$denied=$false;try{& $action}catch{if($_.Exception.Message -notlike 'Software compatibility*'){throw};$denied=$true};if(-not $denied){throw 'Incompatible software recovery accepted'}}
try{
 $legacy=Candidate 'legacy';$modern=Candidate 'modern' 2;$legacyZip=Archive $legacy 'legacy';$modernZip=Archive $modern 'modern';$legacyRoot=Install $legacy;$modernRoot=Install $modern
 Verify $legacyRoot $legacyZip;Verify $legacyRoot $modernZip;Verify $modernRoot $modernZip
 # A newly started release with no incompatible writes may still auto-recover.
 Verify $modernRoot $legacyZip;Assert-SoftwareDataCompatible $modernRoot $legacy (Hash (Join-Path $legacy 'release-manifest.json'))
 $floor=Join-Path $modernRoot 'servix/jobs/software/data-format.json';[void][IO.Directory]::CreateDirectory((Split-Path $floor));[IO.File]::WriteAllText($floor,'{"version":1,"softwareState":2}',[Text.UTF8Encoding]::new($false))
 Denied {Verify $modernRoot $legacyZip};Denied {Assert-SoftwareDataCompatible $modernRoot $legacy (Hash (Join-Path $legacy 'release-manifest.json'))}
 Verify $modernRoot $modernZip;Assert-SoftwareDataCompatible $modernRoot $modern (Hash (Join-Path $modern 'release-manifest.json'))
 $schemaFile=Join-Path $modern 'apps/control-plane/node_modules/@frevos/contracts/dist/software-management.js';[IO.File]::AppendAllText($schemaFile,'tampered')
 $badSchema=Archive $modern 'bad-schema';Denied {Verify $modernRoot $badSchema};Denied {Assert-SoftwareDataCompatible $modernRoot $modern (Hash (Join-Path $modern 'release-manifest.json'))}
 [IO.File]::WriteAllText($floor,'{"version":1,"softwareState":"2"}',[Text.UTF8Encoding]::new($false));Denied {Verify $modernRoot $modernZip}
 @{status='PASS';checks=12;legacyCompatible=$true;safePreWriteRecoveryAllowed=$true;incompatibleWrittenStateDenied=$true;postStopRecoveryChecked=$true;schemaTamperingDenied=$true;malformedFloorDenied=$true;remoteMutation=$false}|ConvertTo-Json -Compress
}finally{if([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($temporary)) -cne $parent -or [IO.Path]::GetFileName($temporary) -cnotmatch '^dvsoftware-[a-f0-9]{16}$' -or (Get-Item -LiteralPath $temporary).Attributes -band [IO.FileAttributes]::ReparsePoint -or @(Get-ChildItem -LiteralPath $temporary -Recurse -Force|Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count){throw 'Software compatibility fixture cleanup escaped scope'};Remove-Item -LiteralPath $temporary -Recurse -Force}
