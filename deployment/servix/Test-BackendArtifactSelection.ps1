$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'BackendArtifactSelection.psm1') -Force
$fixture=Join-Path ([IO.Path]::GetTempPath()) ('backend-selection-'+[guid]::NewGuid().ToString('N'))
try{
 [void][IO.Directory]::CreateDirectory($fixture)
 $upload=Join-Path $fixture 'backend\uploads\existing.txt';[void][IO.Directory]::CreateDirectory((Split-Path $upload));[IO.File]::WriteAllText($upload,'existing user data')
 $beforeUpload=(Get-FileHash -LiteralPath $upload).Hash
 $empty=Get-BackendSelectionSnapshot $fixture
 if($empty.exists){throw 'Unexpected initial selection'}
 $digest='a'*64;$selection=[pscustomobject]@{version=1;mode='bundle';descriptor=('backend/.releases/'+$digest+'/artifact.json');manifestSha256=$digest}
 $receipt=Set-BackendArtifactSelection $fixture $selection $empty (Join-Path $fixture 'operation\before')
 $current=Get-BackendSelectionSnapshot $fixture
 if(-not $current.exists -or $current.sha256 -cne $receipt.afterSha256){throw 'Selection readback differs'}
 $denied=$false;try{[void](Set-BackendArtifactSelection $fixture $selection $empty (Join-Path $fixture 'operation\stale'))}catch{$denied=$true};if(-not $denied){throw 'Stale selection accepted'}
 [void](Restore-BackendArtifactSelection $fixture $receipt (Join-Path $fixture 'operation\recovery'))
 $source=Get-BackendSelectionSnapshot $fixture;$value=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($source.content))|ConvertFrom-Json
 if($value.mode -cne 'source'){throw 'Source recovery differs'}
 $again=Set-BackendArtifactSelection $fixture $selection $source (Join-Path $fixture 'operation\again')
 [void](Restore-BackendArtifactSelection $fixture $again (Join-Path $fixture 'operation\again-recovery'))
 if((Get-FileHash -LiteralPath $upload).Hash -cne $beforeUpload){throw 'Existing upload changed'}
 if(-not(Test-Path -LiteralPath (Join-Path $fixture 'operation\before\artifact-selection-before.json'))){throw 'Selection backup missing'}
 foreach($bad in @([pscustomobject]@{version=1;mode='source';extra='denied'},[pscustomobject]@{version=1;mode='bundle';manifestSha256=$digest;descriptor='../escape'})){$denied=$false;try{Assert-BackendSelection $bad}catch{$denied=$true};if(-not $denied){throw 'Invalid selection accepted'}}
 'PASS: atomic artifact selection, source recovery, stale/preimage denial, retained backups and existing uploads preserved'
}finally{
 $absolute=[IO.Path]::GetFullPath($fixture);$parent=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
 if([IO.Path]::GetDirectoryName($absolute) -ine $parent -or [IO.Path]::GetFileName($absolute) -cnotmatch '^backend-selection-[a-f0-9]{32}$'){throw 'Fixture cleanup escaped its root'}
 [IO.Directory]::Delete($absolute,$true)
}
