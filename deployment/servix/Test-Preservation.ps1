$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'DeploymentFiles.psm1') -Force
$fixture=Join-Path ([IO.Path]::GetTempPath()) ('frevos-preservation-'+[guid]::NewGuid().ToString('N'))
$root=Join-Path $fixture 'live';$payload=Join-Path $fixture 'payload'
function Write-Fixture([string]$Base,[string]$Name,[string]$Text){$file=Join-Path $Base $Name;[void][IO.Directory]::CreateDirectory((Split-Path $file));[IO.File]::WriteAllText($file,$Text);return @{path=$Name;sha256=(Get-FileHash -LiteralPath $file).Hash.ToLowerInvariant()}}
try{
 $code=Write-Fixture $payload 'backend/src/app.js' 'new code'
 $replacement=Write-Fixture $payload 'frontend/attachment/same.txt' 'must never overwrite'
 $protected=Write-Fixture $root 'frontend/attachment/same.txt' 'customer attachment'
 $obsolete=Write-Fixture $root 'frontend/attachment/removed.txt' 'must never remove'
 $ordinary=Write-Fixture $payload 'frontend/attachment2/code.js' 'normal frontend code'
 $paths=@('frontend/ATTACHMENT')
 for($i=0;$i -lt 3;$i++){
  $backup=Join-Path $fixture ('backup'+$i)
  Install-CodeFiles $root $payload @($code,$replacement,$ordinary) $backup @($protected,$obsolete) $paths
  foreach($file in @($protected,$obsolete)){if((Get-FileHash -LiteralPath (Join-Path $root $file.path)).Hash.ToLowerInvariant() -cne $file.sha256){throw 'Attachment replacement/removal occurred'}}
  if(-not(Test-Path -LiteralPath (Join-Path $root $ordinary.path))){throw 'Literal path was incorrectly treated as a prefix glob'}
  Restore-CodeFiles $root $backup
 }
 foreach($bad in @('../escape','C:/attachment','frontend/*','frontend/NUL.txt','frontend/trailing.')){$denied=$false;try{Install-CodeFiles $root $payload @($code) (Join-Path $fixture 'invalid') @() @($bad)}catch{$denied=$true};if(-not $denied){throw 'Invalid preservation path accepted'}}
 'PASS: custom attachments preserved across replacement, obsolete-file removal and recovery; exact path matching; invalid paths denied'
}finally{
 $resolved=[IO.Path]::GetFullPath($fixture);$tempRoot=[IO.Path]::GetFullPath([IO.Path]::GetTempPath())
 if(-not $resolved.StartsWith($tempRoot,[StringComparison]::OrdinalIgnoreCase) -or (Split-Path $resolved -Leaf) -cnotmatch '^frevos-preservation-[a-f0-9]{32}$'){throw 'Fixture cleanup identity mismatch'}
 [IO.Directory]::Delete($resolved,$true)
}
