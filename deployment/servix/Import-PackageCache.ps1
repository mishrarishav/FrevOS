param([string]$Action,[string]$ManifestSha256,[string]$ArchiveSha256,[string]$ActorSid)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$report=[ordered]@{host=$env:COMPUTERNAME;action=$Action;manifestSha256=$ManifestSha256;databaseWritten=$false;status='FAIL'}
try{
 if($env:COMPUTERNAME -cne 'DCAPP7'){throw 'Wrong cache host'}
 $approval=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'approval.json') -Raw|ConvertFrom-Json
 if($approval.action -cne 'frevos.servix.cache.import.v1' -or $approval.actorSid -cne $ActorSid -or $approval.target -cne 'DCAPP7/servix/npm-cache' -or $approval.workspace -cne 'ws_server20' -or $approval.correlationId -cne (Split-Path $PSScriptRoot -Leaf) -or [DateTimeOffset]::Parse($approval.expiresUtc) -le [DateTimeOffset]::UtcNow){throw 'Cache approval mismatch'}
 foreach($entry in @(@('manifest.json',$approval.cacheManifestSha256),@('cache.zip',$approval.cacheArchiveSha256),@('Import-PackageCache.cjs',$approval.importerSha256))){if((Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $entry[0])).Hash.ToLowerInvariant() -cne $entry[1]){throw 'Cache input digest mismatch'}}
 $manifest=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'manifest.json') -Raw|ConvertFrom-Json
 if($manifest.version -ne 1 -or $manifest.target -cne 'DCAPP7/servix/npm-cache' -or $manifest.repositoryId -cne 'gitrepo_6cb7e163f807493fa37963196c49fbac' -or $manifest.packages.Count -gt 5000){throw 'Cache target mismatch'}
 $expected=@{};$total=0L
 foreach($package in $manifest.packages){if($package.name -cnotmatch '^[a-f0-9]{64}\.tgz$' -or $expected.ContainsKey($package.name) -or $package.bytes -lt 0 -or $package.bytes -gt 64MB){throw 'Unsafe cache package inventory'};$expected[$package.name]=$package;$total+=[long]$package.bytes}
 if($total -gt 1GB -or $total -eq 0){throw 'Cache exceeds resource budget'}
 Add-Type -AssemblyName System.IO.Compression
 Add-Type -AssemblyName System.IO.Compression.FileSystem
 $zip=[IO.Compression.ZipFile]::OpenRead((Join-Path $PSScriptRoot 'cache.zip'));$payload=Join-Path $PSScriptRoot 'expanded';[void][IO.Directory]::CreateDirectory($payload)
 try{
  $seen=@{}
  foreach($file in $zip.Entries){if(-not $expected.ContainsKey($file.FullName) -or $seen.ContainsKey($file.FullName) -or $file.Length -ne $expected[$file.FullName].bytes){throw 'Cache archive differs from inventory'};$seen[$file.FullName]=$true;[IO.Compression.ZipFileExtensions]::ExtractToFile($file,(Join-Path $payload $file.FullName),$false)}
  if($seen.Count -ne $expected.Count){throw 'Cache archive incomplete'}
 }finally{$zip.Dispose()}
 $consumed=Join-Path $PSScriptRoot 'approval-consumed.json';$stream=[IO.File]::Open($consumed,[IO.FileMode]::CreateNew)
 try{$bytes=[Text.UTF8Encoding]::new($false).GetBytes(($approval|ConvertTo-Json));$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
 & 'E:\FrevOS\node\node-v24.19.0-win-x64\node.exe' (Join-Path $PSScriptRoot 'Import-PackageCache.cjs') $PSScriptRoot $approval.cacheManifestSha256 *> (Join-Path $PSScriptRoot 'cache-import.log')
 if($LASTEXITCODE -ne 0){throw 'npm cache import failed'}
 $report.cache=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'cache-result.json') -Raw|ConvertFrom-Json
 $report.status='PASS'
}catch{$report.error=@{type=$_.Exception.GetType().Name;line=$_.InvocationInfo.ScriptLineNumber;id=$_.FullyQualifiedErrorId}}
[IO.File]::WriteAllText((Join-Path $PSScriptRoot ('result-'+$Action.ToLowerInvariant()+'.json')),($report|ConvertTo-Json -Depth 7),[Text.UTF8Encoding]::new($false))
