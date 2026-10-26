$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'DeploymentFiles.psm1') -Force
$fixture=Join-Path ([IO.Path]::GetTempPath()) ('retained-artifact-'+[guid]::NewGuid().ToString('N'))
function Put([string]$Base,[string]$Relative,[string]$Text){$file=Join-Path $Base $Relative;[void][IO.Directory]::CreateDirectory((Split-Path $file));[IO.File]::WriteAllText($file,$Text);return @{path=$Relative;bytes=[Text.Encoding]::UTF8.GetByteCount($Text);sha256=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()}}
try{
 $root=Join-Path $fixture 'live';$payload=Join-Path $fixture 'payload'
 $old=Put $root 'backend/src/old.js' 'retained source'
 $same=Put $root 'frontend/index.html' 'unchanged frontend';[void](Put $payload 'frontend/index.html' 'unchanged frontend')
 $upload=Put $root 'backend/uploads/user.txt' 'existing user upload'
 $envFile=Put $root 'backend/.env' 'existing environment'
 $bundle=Put $payload ('backend/.releases/'+('a'*64)+'/server.cjs') 'new immutable code'
 $backup=Join-Path $fixture 'backup'
 $timestamp=(Get-Item -LiteralPath (Join-Path $root $same.path)).LastWriteTimeUtc
 Install-CodeFiles $root $payload @($bundle,$same) $backup @($old,$same) @() -OnlyChanges -KeepExistingFiles
 if(-not(Test-Path -LiteralPath (Join-Path $root $old.path))){throw 'Existing code was deleted'}
 if((Get-Item -LiteralPath (Join-Path $root $same.path)).LastWriteTimeUtc -ne $timestamp){throw 'Unchanged file was recopied'}
 $journal=@(Get-Content -LiteralPath (Join-Path $backup 'journal.json') -Raw|ConvertFrom-Json);if($journal.Count -ne 1 -or $journal[0].path -cne $bundle.path){throw 'Changed-file journal differs'}
 Restore-CodeFiles $root $backup -KeepNewFiles
 foreach($entry in @($old,$same,$upload,$envFile,$bundle)){if((Get-FileHash -LiteralPath (Join-Path $root $entry.path) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $entry.sha256){throw 'Existing/retained file changed'}}
 [void](Put $payload $bundle.path 'different immutable code')
 $denied=$false;try{Install-CodeFiles $root $payload @(@{path=$bundle.path;sha256=(Get-FileHash -LiteralPath (Join-Path $payload $bundle.path) -Algorithm SHA256).Hash.ToLowerInvariant()}) (Join-Path $fixture 'collision') -KeepExistingFiles}catch{$denied=$true};if(-not $denied){throw 'Immutable collision accepted'}
 'PASS: changed-files only, unchanged timestamps, no obsolete-file deletion, retained immutable artifacts/recovery and user data preserved'
}finally{
 $absolute=[IO.Path]::GetFullPath($fixture);$parent=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
 if([IO.Path]::GetDirectoryName($absolute) -ine $parent -or [IO.Path]::GetFileName($absolute) -cnotmatch '^retained-artifact-[a-f0-9]{32}$'){throw 'Fixture cleanup escaped its root'}
 [IO.Directory]::Delete($absolute,$true)
}
