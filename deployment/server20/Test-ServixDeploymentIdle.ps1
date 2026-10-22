$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'HttpCommon.ps1')
$fixture=Join-Path ([IO.Path]::GetTempPath()) ('servix-idle-'+[guid]::NewGuid().ToString('N'))
foreach($name in @('jobs','requests','results','private\claims')){[void][IO.Directory]::CreateDirectory((Join-Path $fixture $name))}
function Expect-Denied {
 $denied=$false;try{Assert-ServixDeploymentIdle $fixture}catch{$denied=$true}
 if(-not $denied){throw 'An unresolved deployment allowed maintenance'}
}
try{
 Assert-ServixDeploymentIdle $fixture
 $id='sd_'+('a'*32);$file=Join-Path $fixture ('jobs\'+$id+'.json')
 $job=@{version=1;workspaceId='ws_server20';target='server21-servix-development';requestId=$id;status='building'}
 $job|ConvertTo-Json|Set-Content $file;Expect-Denied
 $job.status='succeeded';$job|ConvertTo-Json|Set-Content $file
 $claim=Join-Path $fixture ('private\claims\'+$id);[void][IO.Directory]::CreateDirectory($claim)
 $approval=@{requestId=$id;workspaceId='ws_server20';target='server21-servix-development';sourceHead=('b'*40);artifactDigest=('c'*64)}
 $approval|ConvertTo-Json|Set-Content (Join-Path $claim 'approval.json');Expect-Denied
 $result=@{requestId=$id;sourceHead=$approval.sourceHead;artifactDigest=$approval.artifactDigest;status='succeeded'}
 $receipt=Join-Path $fixture ('results\'+$id+'.json');$result|ConvertTo-Json|Set-Content $receipt
 Assert-ServixDeploymentIdle $fixture
 $result.status='recovery-required';$result|ConvertTo-Json|Set-Content $receipt;Expect-Denied
 $result.status='succeeded';$result.artifactDigest='d'*64;$result|ConvertTo-Json|Set-Content $receipt;Expect-Denied
 'PASS: empty idle, active denial, missing receipt denial, completed receipt, uncertain and mismatched receipts'
}finally{
 $resolved=[IO.Path]::GetFullPath($fixture);$tempRoot=[IO.Path]::GetFullPath([IO.Path]::GetTempPath())
 if(-not $resolved.StartsWith($tempRoot,[StringComparison]::OrdinalIgnoreCase) -or (Split-Path $resolved -Leaf) -cnotmatch '^servix-idle-[a-f0-9]{32}$'){throw 'Fixture cleanup escaped its owned root'}
 [IO.Directory]::Delete($resolved,$true)
}
