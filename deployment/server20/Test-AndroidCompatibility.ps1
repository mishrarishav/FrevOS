$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$temporaryParent=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
$temporary=[IO.Path]::Combine($temporaryParent,('dvac-'+[guid]::NewGuid().ToString('N')))
[void][IO.Directory]::CreateDirectory($temporary)
function Write-Json([string]$Path,$Value){[void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($Path));[IO.File]::WriteAllText($Path,($Value|ConvertTo-Json -Depth 7 -Compress),[Text.UTF8Encoding]::new($false))}
function Candidate([string]$Name,[bool]$Android){
 $folder=Join-Path $temporary $Name;$inventory=Join-Path $folder 'deployment\server20\source-inventory.json'
 $files=if($Android){@(@{path='apps/android-connector/AndroidManifest.xml';sha256=('a'*64)})}else{@(@{path='package.json';sha256=('a'*64)})}
 Write-Json $inventory @{sourceBase=('b'*40);state='committed';files=$files}
 Write-Json (Join-Path $folder 'release-manifest.json') @{applicationSource=('b'*40);files=@(@{path='deployment/server20/source-inventory.json';sha256=(Get-FileHash -LiteralPath $inventory).Hash.ToLowerInvariant()})}
 return $folder
}
function Install-Current([string]$Source){
 $root=Join-Path $temporary ('i-'+[guid]::NewGuid().ToString('N'));$digest=(Get-FileHash -LiteralPath (Join-Path $Source 'release-manifest.json')).Hash.ToLowerInvariant()
 [void][IO.Directory]::CreateDirectory((Join-Path $root 'releases'));Copy-Item -LiteralPath $Source -Destination (Join-Path $root ('releases\'+$digest)) -Recurse
 Write-Json (Join-Path $root 'state\active.json') @{manifestSha256=$digest};return $root
}
function Archive-Candidate([string]$Source,[string]$Output){
 $archive=[IO.Compression.ZipFile]::Open($Output,[IO.Compression.ZipArchiveMode]::Create)
 try{foreach($file in Get-ChildItem -LiteralPath $Source -Recurse -File){[void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$file.FullName,$file.FullName.Substring($Source.Length+1).Replace('\','/'),[IO.Compression.CompressionLevel]::Optimal)}}finally{$archive.Dispose()}
}
try{
 $older=Candidate 'older' $false;$newer=Candidate 'newer' $true
 $olderZip=Join-Path $temporary 'older.zip';$newerZip=Join-Path $temporary 'newer.zip'
 Archive-Candidate $older $olderZip;Archive-Candidate $newer $newerZip
 $olderRoot=Install-Current $older;$newerRoot=Install-Current $newer
 $verifier=Join-Path $PSScriptRoot 'Verify-AndroidCompatibility.ps1'
 & $verifier -InstallationRoot $olderRoot -Archive $newerZip -ArchiveSha256 (Get-FileHash -LiteralPath $newerZip).Hash.ToLowerInvariant() -SourceHead ('b'*40)|Out-Null
 & $verifier -InstallationRoot $newerRoot -Archive $newerZip -ArchiveSha256 (Get-FileHash -LiteralPath $newerZip).Hash.ToLowerInvariant() -SourceHead ('b'*40)|Out-Null
 $denied=$false;try{& $verifier -InstallationRoot $newerRoot -Archive $olderZip -ArchiveSha256 (Get-FileHash -LiteralPath $olderZip).Hash.ToLowerInvariant() -SourceHead ('b'*40)|Out-Null}catch{if($_.Exception.Message -notlike 'Android compatibility boundary:*'){throw};$denied=$true}
 if(-not $denied){throw 'Incompatible Android downgrade was accepted'}
 $denied=$false;try{& $verifier -InstallationRoot $newerRoot -Archive $newerZip -ArchiveSha256 ('0'*64) -SourceHead ('b'*40)|Out-Null}catch{$denied=$true};if(-not $denied){throw 'Tampered Android archive accepted'}
 $denied=$false;try{& $verifier -InstallationRoot $newerRoot -Archive $newerZip -ArchiveSha256 (Get-FileHash -LiteralPath $newerZip).Hash.ToLowerInvariant() -SourceHead ('c'*40)|Out-Null}catch{$denied=$true};if(-not $denied){throw 'Different source accepted'}
 @{status='PASS';checks=5;newCapabilityAccepted=$true;sameCapabilityRecoveryAccepted=$true;incompatibleDowngradeDenied=$true;archiveAndSourceTamperingDenied=$true}|ConvertTo-Json -Compress
}finally{
 $resolved=[IO.Path]::GetFullPath($temporary)
 if([IO.Path]::GetDirectoryName($resolved) -cne $temporaryParent -or [IO.Path]::GetFileName($resolved) -cnotmatch '^dvac-[a-f0-9]{32}$'){throw 'Temporary compatibility fixture cleanup escaped its owned target'}
 Remove-Item -LiteralPath $resolved -Recurse -Force
}
