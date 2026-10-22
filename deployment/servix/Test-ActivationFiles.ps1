$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'ActivationFiles.psm1') -Force
$fixture=Join-Path ([IO.Path]::GetTempPath()) ('servix-heartbeat-'+[guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($fixture)
try{
 $path=Join-Path $fixture 'heartbeat.json'
 foreach($number in @(1,2,3)){Write-ServixResult $path @{counter=$number};if((Get-Content -LiteralPath $path -Raw|ConvertFrom-Json).counter -ne $number){throw 'Atomic heartbeat did not advance'}}
 if((Get-Content -LiteralPath ($path+'.previous') -Raw|ConvertFrom-Json).counter -ne 2){throw 'Bounded previous heartbeat missing'}
 if(@(Get-ChildItem -LiteralPath $fixture -Filter '*.tmp').Count){throw 'Atomic publication left temporary files'}
 'PASS: Windows PowerShell repeated atomic publication and bounded previous state'
}finally{
 $resolved=[IO.Path]::GetFullPath($fixture);$tempRoot=[IO.Path]::GetFullPath([IO.Path]::GetTempPath())
 if(-not $resolved.StartsWith($tempRoot,[StringComparison]::OrdinalIgnoreCase) -or (Split-Path $resolved -Leaf) -cnotmatch '^servix-heartbeat-[a-f0-9]{32}$'){throw 'Fixture cleanup escaped its owned temporary root'}
 [IO.Directory]::Delete($resolved,$true)
}
