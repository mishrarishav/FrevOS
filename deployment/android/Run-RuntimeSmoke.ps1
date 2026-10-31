param([Parameter(Mandatory=$true)][string]$PlanReference)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$plan=Get-Content -LiteralPath $PlanReference -Raw|ConvertFrom-Json
$now=[DateTimeOffset]::UtcNow
if($plan.version -ne 1 -or $plan.action -cne 'android-runtime:smoke' -or $plan.id -cnotmatch '^at_[a-f0-9]{32}$' -or $plan.actorSid -cne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value -or ([DateTimeOffset]$plan.issuedAt) -gt $now -or ([DateTimeOffset]$plan.expiresAt) -le $now -or (([DateTimeOffset]$plan.expiresAt)-([DateTimeOffset]$plan.issuedAt)).TotalMinutes -gt 15 -or $plan.server -cnotmatch '^[A-Za-z0-9.-]+$'){throw 'Android runtime smoke scope denied'}
$configPath=Join-Path $plan.root 'bin\service-config.json';$config=Get-Content -LiteralPath $configPath -Raw|ConvertFrom-Json
$mapped='\\'+$plan.server+'\'+$config.root.Substring(0,1).ToLowerInvariant()+'$\'+$config.root.Substring(3)
if($mapped -cne $plan.root -or $config.root -cne $plan.targetLocalRoot -or $config.phase -cne 'worker' -or $config.workspaceId -cne $plan.workspaceId -or $config.profileId -cne $plan.profileId -or $config.repositoryId -cne $plan.repositoryId -or (Get-FileHash -LiteralPath $configPath).Hash.ToLowerInvariant() -cne $plan.configurationSha256 -or (Get-FileHash -LiteralPath (Join-Path $plan.root 'bin\Run-AndroidBuilder.ps1')).Hash.ToLowerInvariant() -cne $plan.runnerSha256){throw 'Android runtime builder enrollment changed'}
if(-not(Test-Path -LiteralPath (Join-Path $plan.root 'sdk\runtime-state.json')) -or $config.PSObject.Properties.Name -notcontains 'signing'){throw 'Signed Android artifact and runtime SDK must be ready first'}
if((Get-FileHash -LiteralPath $plan.moduleSource).Hash.ToLowerInvariant() -cne $plan.moduleSha256 -or (Get-Item -LiteralPath $plan.moduleSource).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Runtime operator source changed'}
$module=Join-Path $plan.root 'bin\AndroidRuntimeSmoke.cjs'
if(Test-Path -LiteralPath $module){if((Get-FileHash -LiteralPath $module).Hash.ToLowerInvariant() -cne $plan.moduleSha256){throw 'Runtime operator update needs separate review'}}
foreach($request in Get-ChildItem -LiteralPath (Join-Path $plan.root 'requests') -Filter 'ab_*.json'){if(-not(Test-Path -LiteralPath (Join-Path $plan.root ('results\'+$request.Name)))){throw 'SDK compiler has an unresolved job'}}
$rootAcl=(Get-Acl -LiteralPath $plan.root).Sddl
$incoming=Join-Path $plan.root ('incoming\'+$plan.id+'.json');$stream=[IO.File]::Open($incoming,[IO.FileMode]::CreateNew)
try{$bytes=[Text.UTF8Encoding]::new($false).GetBytes(($plan|ConvertTo-Json -Depth 8 -Compress));$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
$sc=Join-Path $env:WINDIR 'System32\sc.exe'
function Scoped-Service([string[]]$Arguments){& $sc ('\\'+$plan.server) @Arguments|Out-Null;if($LASTEXITCODE -ne 0 -and -not($Arguments[0] -ceq 'stop' -and $LASTEXITCODE -eq 1062)){throw 'Android runtime service operation failed; reconcile retained test before retry'}}
Scoped-Service @('stop','DevSetuAndroidBuilder');Start-Sleep -Seconds 3
if(-not(Test-Path -LiteralPath $module)){[IO.File]::Copy($plan.moduleSource,$module,$false)}
$before=[IO.File]::ReadAllBytes($configPath);[IO.File]::WriteAllBytes((Join-Path $plan.root ('incoming\'+$plan.id+'.configuration-before.json')),$before)
$config.phase='runtime-smoke'
$config|Add-Member -NotePropertyName runtimeSmokePlanReference -NotePropertyValue ([IO.Path]::Combine($config.root,'incoming',($plan.id+'.json'))) -Force
$config|Add-Member -NotePropertyName runtimeSmokePlanSha256 -NotePropertyValue (Get-FileHash -LiteralPath $incoming).Hash.ToLowerInvariant() -Force
$config|Add-Member -NotePropertyName runtimeSmokeModuleSha256 -NotePropertyValue $plan.moduleSha256 -Force
[IO.File]::WriteAllText($configPath,($config|ConvertTo-Json -Depth 8 -Compress),[Text.UTF8Encoding]::new($false));$testConfigHash=(Get-FileHash -LiteralPath $configPath).Hash.ToLowerInvariant()
Scoped-Service @('start','DevSetuAndroidBuilder')
$receipt=Join-Path $plan.root ('results\'+$plan.id+'.json');$deadline=[DateTimeOffset]::UtcNow.AddMinutes(12)
while(-not(Test-Path -LiteralPath $receipt)){if([DateTimeOffset]::UtcNow -ge $deadline){throw 'Android runtime test deadline; owned process group and evidence need reconciliation'};Start-Sleep -Seconds 3}
$result=Get-Content -LiteralPath $receipt -Raw|ConvertFrom-Json
Scoped-Service @('stop','DevSetuAndroidBuilder');Start-Sleep -Seconds 3
if((Get-FileHash -LiteralPath $configPath).Hash.ToLowerInvariant() -cne $testConfigHash){throw 'SDK enrollment changed during runtime test'}
[IO.File]::WriteAllBytes($configPath,$before);Scoped-Service @('start','DevSetuAndroidBuilder')
if((Get-Acl -LiteralPath $plan.root).Sddl -cne $rootAcl){throw 'Runtime SDK root permissions changed'}
$result|ConvertTo-Json -Depth 7 -Compress
if($result.status -cne 'PASS'){exit 1}
