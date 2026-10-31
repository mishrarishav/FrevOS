param([Parameter(Mandatory=$true)][string]$ConfigReference,[switch]$RuntimeOnly,[switch]$VerifyExtracted)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.IO.Compression.FileSystem
if($VerifyExtracted -and -not $RuntimeOnly){throw 'Retained verification is limited to official runtime archives'}
$configuration=Get-Content -LiteralPath $ConfigReference -Raw|ConvertFrom-Json
$sdkBoundary=[IO.Path]::GetFullPath((Join-Path $configuration.root 'sdk'))+'\'
$reportPath=Join-Path $configuration.root $(if($RuntimeOnly){'sdk\runtime-state.json'}else{'sdk\sdk-state.json'})
if(Test-Path -LiteralPath $reportPath){throw 'SDK state already exists; use the verified retained toolchain'}
$extracted=@{}
$archives=if($RuntimeOnly){$configuration.runtimeArchives}else{$configuration.archives}
$allowedIds=if($RuntimeOnly){@('emulator-37.2.12','aosp-api36-x64-r2')}else{@('jdk-21','platform-36-r2','build-tools-36','platform-tools-37.0.1')}
if($archives.Count -ne $allowedIds.Count -or @($archives.id|Sort-Object -Unique).Count -ne $allowedIds.Count){throw 'SDK complete unique archive inventory required'}
foreach($archive in $archives){
 if($archive.id -cnotin $allowedIds -or $archive.filename -cnotmatch '^[A-Za-z0-9_.+-]+\.zip$' -or $archive.sha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'SDK archive scope invalid'}
 $staging=if($RuntimeOnly){'incoming\runtime-test-v1\'}else{'incoming\toolchain-v1\'}
 $archivePath=Join-Path $configuration.root ($staging+$archive.filename)
 if((Get-Item -LiteralPath $archivePath).Attributes -band [IO.FileAttributes]::ReparsePoint -or (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $archive.sha256){throw 'SDK archive identity changed'}
 $destination=[IO.Path]::GetFullPath((Join-Path $configuration.root ('sdk\'+$archive.id)))
 if(-not($destination+'\').StartsWith($sdkBoundary,[StringComparison]::OrdinalIgnoreCase)){throw 'SDK extraction directory escaped scope'}
 if($VerifyExtracted){if(-not(Test-Path -LiteralPath $destination -PathType Container) -or (Get-Item -LiteralPath $destination).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Retained SDK runtime directory unavailable'}}
 elseif(Test-Path -LiteralPath $destination){throw 'SDK extraction directory must be new and in scope'}
 else{[void][IO.Directory]::CreateDirectory($destination)}
 $zip=[IO.Compression.ZipFile]::OpenRead($archivePath)
 try{
  $totalBytes=0L;$expectedFiles=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  if($zip.Entries.Count -gt 20000){throw 'SDK archive file limit'}
  $expanded=($zip.Entries|Measure-Object -Property Length -Sum).Sum
  $reserve=if($RuntimeOnly){8GB}else{2GB}
  $volume=[IO.DriveInfo]::new([IO.Path]::GetPathRoot($configuration.root))
  $requiredFree=if($VerifyExtracted){$reserve}else{$expanded+$reserve}
  if($volume.AvailableFreeSpace -lt $requiredFree){throw 'SDK extraction needs additional free disk space while preserving application headroom'}
  foreach($entry in $zip.Entries){
   $relative=$entry.FullName.Replace('/','\');$segments=$relative.TrimEnd('\').Split('\')
   if(-not $relative -or [IO.Path]::IsPathRooted($relative) -or $relative.Contains(':') -or @($segments|Where-Object {$_ -in @('','.','..')}).Count -or (($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000){throw 'Unsafe SDK archive entry'}
   $target=[IO.Path]::GetFullPath((Join-Path $destination $relative))
   if(-not $target.StartsWith($destination+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'SDK extraction escape'}
   $totalBytes+=$entry.Length;$capacity=if($RuntimeOnly){5000000000L}else{1500000000L};if($totalBytes -gt $capacity){throw 'SDK expansion limit'}
   if($relative.EndsWith('\')){if(-not $VerifyExtracted){[void][IO.Directory]::CreateDirectory($target)};continue}
   if(-not $expectedFiles.Add($target)){throw 'Duplicate SDK archive file'}
   if($VerifyExtracted){
    for($cursor=$target;;$cursor=[IO.Path]::GetDirectoryName($cursor)){if([IO.File]::GetAttributes($cursor) -band [IO.FileAttributes]::ReparsePoint){throw 'Linked retained SDK runtime entry'};if($cursor -ceq $destination){break}}
    if(-not(Test-Path -LiteralPath $target -PathType Leaf) -or (Get-Item -LiteralPath $target).Length -ne $entry.Length){throw 'Retained SDK runtime entry differs'}
    $sourceStream=$entry.Open();$hasher=[Security.Cryptography.SHA256]::Create()
    try{$expectedHash=[BitConverter]::ToString($hasher.ComputeHash($sourceStream)).Replace('-','').ToLowerInvariant()}finally{$hasher.Dispose();$sourceStream.Dispose()}
    if((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -cne $expectedHash){throw 'Retained SDK runtime bytes differ'}
    continue
   }
   [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))
   $sourceStream=$entry.Open();$targetStream=[IO.File]::Open($target,[IO.FileMode]::CreateNew)
   try{$sourceStream.CopyTo($targetStream);$targetStream.Flush($true)}finally{$targetStream.Dispose();$sourceStream.Dispose()}
  }
  if($VerifyExtracted){
   $pending=[Collections.Generic.Stack[string]]::new();$pending.Push($destination);$actualFiles=0
   while($pending.Count){foreach($item in [IO.Directory]::EnumerateFileSystemEntries($pending.Pop())){$attributes=[IO.File]::GetAttributes($item);if($attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked retained SDK runtime inventory'};if($attributes -band [IO.FileAttributes]::Directory){$pending.Push($item)}else{if(-not $expectedFiles.Contains($item)){throw 'Unenrolled retained SDK runtime file'};$actualFiles++}}}
   if($actualFiles -ne $expectedFiles.Count){throw 'Retained SDK runtime inventory differs'}
  }
 }finally{$zip.Dispose()}
 $extracted[$archive.id]=$destination
}
$descriptors=if($RuntimeOnly){@(
 @{id='emulator';root='emulator-37.2.12';name='emulator.exe'},@{id='qemu';root='emulator-37.2.12';name='qemu-system-x86_64.exe'},
 @{id='kernel';root='aosp-api36-x64-r2';name='kernel-ranchu'},@{id='ramdisk';root='aosp-api36-x64-r2';name='ramdisk.img'},
 @{id='system';root='aosp-api36-x64-r2';name='system.img'},@{id='vendor';root='aosp-api36-x64-r2';name='vendor.img'},@{id='empty-data';root='aosp-api36-x64-r2';name='empty_data_disk'}
)}else{@(
 @{id='java';root='jdk-21';name='java.exe'},@{id='javac';root='jdk-21';name='javac.exe'},@{id='jar';root='jdk-21';name='jar.exe'},
 @{id='android';root='platform-36-r2';name='android.jar'},@{id='lambda';root='build-tools-36';name='core-lambda-stubs.jar'},@{id='d8';root='build-tools-36';name='d8.jar'},
 @{id='aapt2';root='build-tools-36';name='aapt2.exe'},@{id='zipalign';root='build-tools-36';name='zipalign.exe'},
 @{id='apksigner';root='build-tools-36';name='apksigner.jar'},@{id='adb';root='platform-tools-37.0.1';name='adb.exe'}
)}
$tools=@($descriptors|ForEach-Object {
 $descriptor=$_;$candidates=@(Get-ChildItem -LiteralPath $extracted[$descriptor.root] -Recurse -File -Filter $descriptor.name)
 if($candidates.Count -ne 1){throw 'SDK tool discovery is ambiguous'}
 $tool=$candidates[0];@{id=$descriptor.id;path=$tool.FullName.Substring(([IO.Path]::GetFullPath($configuration.root)+'\').Length);sha256=(Get-FileHash -LiteralPath $tool.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
})
$state=@{version=1;status='READY';tools=$tools;licenseReference='https://developer.android.com/studio#terms-and-conditions';licenseApprovalReference=$configuration.licenseApprovalReference;initializedUtc=[DateTimeOffset]::UtcNow.ToString('o')}
$serialized=$state|ConvertTo-Json -Depth 6 -Compress
$temporary=$reportPath+'.'+[guid]::NewGuid().ToString('N')+'.tmp'
[IO.File]::WriteAllText($temporary,$serialized,[Text.UTF8Encoding]::new($false));[IO.File]::Move($temporary,$reportPath)
Write-Output 'SDK initialization completed; no signing key or application data changed.'
