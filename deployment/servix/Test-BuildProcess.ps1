$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'BuildProcess.psm1') -Force
$fixture=Join-Path ([IO.Path]::GetTempPath()) ('servix-process-'+[guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($fixture)
$exe='C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
$complete=$false
try{
 $warning=Join-Path $fixture 'warning.ps1'
 [IO.File]::WriteAllText($warning,"[Console]::Error.WriteLine('warning');exit 0")
 if((Invoke-ServixBuildProcess $exe ('-NoProfile -NonInteractive -File "'+$warning+'"') $fixture (Join-Path $fixture 'warning.log') 10) -ne 0){throw 'stderr changed a successful exit code'}
 if((Get-Content (Join-Path $fixture 'warning.log.stderr') -Raw).Trim() -cne 'warning'){throw 'stderr evidence missing'}
 [IO.File]::WriteAllText($warning,'exit 7')
 if((Invoke-ServixBuildProcess $exe ('-NoProfile -NonInteractive -File "'+$warning+'"') $fixture (Join-Path $fixture 'failure.log') 10) -ne 7){throw 'Native failure was lost'}
 $owner=Join-Path $fixture 'owner.ps1';$child=Join-Path $fixture 'child.ps1';$identity=Join-Path $fixture 'child.json'
 [IO.File]::WriteAllText($child,('[IO.File]::WriteAllText('''+$identity+''',($PID|ConvertTo-Json));Start-Sleep -Seconds 60'))
 $module=Join-Path $PSScriptRoot 'BuildProcess.psm1'
 $ownerText='Import-Module '''+$module+''' -Force;Initialize-ServixBuildGroup;Start-Process -FilePath '''+$exe+''' -WindowStyle Hidden -ArgumentList ''-NoProfile -NonInteractive -File "'+$child+'"''|Out-Null;while(-not(Test-Path -LiteralPath '''+$identity+''')){Start-Sleep -Milliseconds 50}'
 [IO.File]::WriteAllText($owner,$ownerText)
 if((Invoke-ServixBuildProcess $exe ('-NoProfile -NonInteractive -File "'+$owner+'"') $fixture (Join-Path $fixture 'owner.log') 15) -ne 0){throw 'Build group initialization failed'}
 $childId=[int](Get-Content $identity -Raw|ConvertFrom-Json)
 Start-Sleep -Milliseconds 300
 if(Get-Process -Id $childId -ErrorAction SilentlyContinue){throw 'A descendant survived its owning build controller'}
 $complete=$true
 'PASS: stderr/exit semantics, native failure, build group and descendant cleanup'
}finally{
 if($complete){
  $resolved=[IO.Path]::GetFullPath($fixture);$tempRoot=[IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  if(-not $resolved.StartsWith($tempRoot,[StringComparison]::OrdinalIgnoreCase) -or (Split-Path $resolved -Leaf) -cnotmatch '^servix-process-[a-f0-9]{32}$'){throw 'Fixture cleanup escaped its owned temporary root'}
  [IO.Directory]::Delete($resolved,$true)
 }else{Write-Warning ('Retained failed process fixture: '+$fixture)}
}
