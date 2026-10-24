Set-StrictMode -Version Latest
function Assert-BackendPlainPath([string]$Path){
 for($cursor=[IO.Path]::GetFullPath($Path);;){if(Test-Path -LiteralPath $cursor){if((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked backend selection path'}};$parent=[IO.Path]::GetDirectoryName($cursor);if(-not $parent -or $parent -ceq $cursor){return};$cursor=$parent}
}
function Get-BackendSelectionPath([string]$Root){
 $absolute=[IO.Path]::GetFullPath($Root).TrimEnd('\');if($absolute -ieq [IO.Path]::GetPathRoot($absolute)){throw 'Backend selection requires a project root'}
 $file=Join-Path $absolute 'backend\.runtime\devsetu-backend-artifact.json';Assert-BackendPlainPath $file;return $file
}
function Assert-BackendSelection($Value){
 if($null -eq $Value -or $Value.version -ne 1 -or $Value.mode -cnotin @('source','bundle')){throw 'Invalid backend selection'}
 $names=@($Value.PSObject.Properties.Name|Sort-Object) -join ','
 if($Value.mode -ceq 'source'){if($names -cne 'mode,version'){throw 'Invalid source selection'};return}
 if($names -cne 'descriptor,manifestSha256,mode,version' -or $Value.manifestSha256 -cnotmatch '^[a-f0-9]{64}$' -or $Value.descriptor -cne ('backend/.releases/'+$Value.manifestSha256+'/artifact.json')){throw 'Invalid bundled selection'}
}
function Get-BackendSelectionSnapshot([string]$Root){
 $file=Get-BackendSelectionPath $Root
 if(-not(Test-Path -LiteralPath $file)){return @{exists=$false;sha256=$null;content=$null}}
 if(-not(Test-Path -LiteralPath $file -PathType Leaf) -or (Get-Item -LiteralPath $file).Length -gt 4096){throw 'Invalid backend selection file'}
 $bytes=[IO.File]::ReadAllBytes($file);$value=[Text.Encoding]::UTF8.GetString($bytes)|ConvertFrom-Json;Assert-BackendSelection $value
 return @{exists=$true;sha256=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant();content=[Convert]::ToBase64String($bytes)}
}
function Set-BackendArtifactSelection([string]$Root,$Selection,$Expected,[string]$Backup){
 Assert-BackendSelection $Selection;$file=Get-BackendSelectionPath $Root
 $absolute=[IO.Path]::GetFullPath($Root).TrimEnd('\')+'\';$saved=[IO.Path]::GetFullPath($Backup)
 if(-not $saved.StartsWith($absolute,[StringComparison]::OrdinalIgnoreCase)){throw 'Selection backup escaped the project'}
 Assert-BackendPlainPath $saved
 $current=Get-BackendSelectionSnapshot $Root
 if($current.exists -ne $Expected.exists -or $current.sha256 -cne $Expected.sha256){throw 'Backend selection changed concurrently'}
 [void][IO.Directory]::CreateDirectory($saved)
 $journal=Join-Path $saved 'artifact-selection-before.json';if(Test-Path -LiteralPath $journal){throw 'Selection backup already exists'}
 [IO.File]::WriteAllText($journal,($current|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))
 [void][IO.Directory]::CreateDirectory((Split-Path -Parent $file))
 $temporary=$file+'.'+[guid]::NewGuid().ToString('N')+'.tmp'
 $bytes=[Text.Encoding]::UTF8.GetBytes(($Selection|ConvertTo-Json -Compress));$stream=[IO.File]::Open($temporary,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
 try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
 $again=Get-BackendSelectionSnapshot $Root
 if($again.exists -ne $current.exists -or $again.sha256 -cne $current.sha256){throw 'Backend selection changed before activation'}
 if($current.exists){[IO.File]::Replace($temporary,$file,(Join-Path $saved 'artifact-selection-replaced.json'))}else{[IO.File]::Move($temporary,$file)}
 $after=Get-BackendSelectionSnapshot $Root
 return @{before=$current;afterSha256=$after.sha256;mode=$Selection.mode}
}
function Restore-BackendArtifactSelection([string]$Root,$Receipt,[string]$Backup){
 $current=Get-BackendSelectionSnapshot $Root
 if(-not $current.exists -or $current.sha256 -cne $Receipt.afterSha256){throw 'Backend selection drifted before recovery'}
 $selection=if($Receipt.before.exists){[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Receipt.before.content))|ConvertFrom-Json}else{[pscustomobject]@{version=1;mode='source'}}
 return Set-BackendArtifactSelection $Root $selection $current $Backup
}
Export-ModuleMember -Function Assert-BackendSelection,Get-BackendSelectionSnapshot,Set-BackendArtifactSelection,Restore-BackendArtifactSelection
