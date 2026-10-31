$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$runnerResults=[IO.Path]::GetFullPath([IO.Path]::Combine($PSScriptRoot,'..','results'))
[IO.File]::WriteAllText([IO.Path]::Combine($runnerResults,'runner-entry.json'),'{"version":1,"stage":"script-entered"}',[Text.UTF8Encoding]::new($false))
$nodePath=Join-Path $PSScriptRoot 'node.exe'
$workerPath=Join-Path $PSScriptRoot 'AndroidBuild.cjs'
$configPath=Join-Path $PSScriptRoot 'service-config.json'
$serviceConfiguration=Get-Content -LiteralPath $configPath -Raw|ConvertFrom-Json
try{
 Import-Module (Join-Path $PSScriptRoot 'BuildProcess.psm1') -Force
 Initialize-ServixBuildGroup
}catch{
 $diagnostic=@{version=1;status='FAILED';stage='process-containment';code=$_.Exception.GetType().Name}
 [IO.File]::WriteAllText((Join-Path $serviceConfiguration.root 'results\runner-failure.json'),($diagnostic|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))
 throw 'Android worker containment unavailable'
}
if($serviceConfiguration.phase -ceq 'initialize-signing'){
 & (Join-Path $PSScriptRoot 'Initialize-SigningIdentity.ps1') -ConfigReference $configPath
 while($true){Start-Sleep -Seconds 5}
}
if($serviceConfiguration.phase -ceq 'initialize-runtime'){
 $verifyRetained=$serviceConfiguration.PSObject.Properties.Name -contains 'verifyExtractedRuntime' -and $serviceConfiguration.verifyExtractedRuntime -eq $true
 & (Join-Path $PSScriptRoot 'Initialize-Sdk.ps1') -ConfigReference $configPath -RuntimeOnly -VerifyExtracted:$verifyRetained
 while($true){Start-Sleep -Seconds 5}
}
if($serviceConfiguration.phase -ceq 'runtime-smoke'){
 if(([Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Android runtime smoke check must use the restricted SDK service identity'}
 $smoke=Join-Path $PSScriptRoot 'AndroidRuntimeSmoke.cjs'
 if((Get-Item -LiteralPath $smoke).Attributes -band [IO.FileAttributes]::ReparsePoint -or (Get-FileHash -LiteralPath $smoke).Hash.ToLowerInvariant() -cne $serviceConfiguration.runtimeSmokeModuleSha256){throw 'Android runtime operator identity changed'}
 & $nodePath --preserve-symlinks-main $smoke --config $configPath
 exit $LASTEXITCODE
}
if($serviceConfiguration.phase -ceq 'initialize'){
 & (Join-Path $PSScriptRoot 'Initialize-Sdk.ps1') -ConfigReference $configPath
 if(-not(Test-Path -LiteralPath (Join-Path $serviceConfiguration.root 'sdk\sdk-state.json') -PathType Leaf)){throw 'SDK initialization failed'}
 while($true){Start-Sleep -Seconds 5}
}
if($serviceConfiguration.phase -cne 'worker' -or ([Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Android build worker requires its restricted service identity'}
$entryCursor=$workerPath
while($true){if([IO.File]::GetAttributes($entryCursor) -band [IO.FileAttributes]::ReparsePoint){throw 'Linked SDK worker entry denied'};if($entryCursor -ceq $serviceConfiguration.root){break};$entryCursor=[IO.Path]::GetDirectoryName($entryCursor);if(-not $entryCursor){throw 'SDK worker entry escaped its root'}}
if((Get-FileHash -LiteralPath $workerPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $serviceConfiguration.operatorEntrySha256){throw 'SDK worker entry identity changed'}
# The enrolled entry and every parent inside its sealed root are checked above.
# Avoid Node canonicalizing unrelated protected control-plane ancestors.
& $nodePath --preserve-symlinks-main $workerPath --worker $configPath
exit $LASTEXITCODE
