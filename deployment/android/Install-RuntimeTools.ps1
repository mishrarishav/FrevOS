param([Parameter(Mandatory=$true)][string]$PlanReference,[switch]$VerifyExtracted)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$plan=Get-Content -LiteralPath $PlanReference -Raw|ConvertFrom-Json
$actor=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;$now=[DateTimeOffset]::UtcNow
$expectedAction=if($VerifyExtracted){'android-sdk:verify-retained-runtime-tools'}else{'android-sdk:install-runtime-tools'}
if($plan.version -ne 1 -or $plan.action -cne $expectedAction -or $plan.id -cnotmatch '^ar_[a-f0-9]{32}$' -or $plan.actorSid -cne $actor -or ([DateTimeOffset]$plan.issuedAt) -gt $now -or ([DateTimeOffset]$plan.expiresAt) -le $now -or (([DateTimeOffset]$plan.expiresAt)-([DateTimeOffset]$plan.issuedAt)).TotalMinutes -gt 10 -or $plan.server -cnotmatch '^[A-Za-z0-9.-]+$'){throw 'Runtime SDK setup approval expired or invalid'}
$configPath=Join-Path $plan.root 'bin\service-config.json';$config=Get-Content -LiteralPath $configPath -Raw|ConvertFrom-Json
$mapped='\\'+$plan.server+'\'+$config.root.Substring(0,1).ToLowerInvariant()+'$\'+$config.root.Substring(3)
if($mapped -cne $plan.root -or $config.phase -cne 'worker' -or $config.workspaceId -cne $plan.workspaceId -or $config.profileId -cne $plan.profileId -or $config.repositoryId -cne $plan.repositoryId -or (Test-Path -LiteralPath (Join-Path $plan.root 'sdk\runtime-state.json'))){throw 'Runtime SDK target differs or is already initialized'}
if($VerifyExtracted -and (Get-FileHash -LiteralPath $configPath).Hash.ToLowerInvariant() -cne $plan.configurationSha256){throw 'Retained runtime builder configuration changed'}
foreach($name in @('Initialize-Sdk.ps1','Run-AndroidBuilder.ps1')){if((Get-FileHash -LiteralPath (Join-Path $plan.root ('bin\'+$name))).Hash.ToLowerInvariant() -cne $plan.operatorHashes.$name){throw 'Runtime SDK operator changed'}}
if($plan.archives.Count -ne 2 -or @($plan.archives.id|Sort-Object -Unique).Count -ne 2){throw 'Two unique official runtime archives required'}
foreach($archive in $plan.archives){if($archive.id -cnotin @('emulator-37.2.12','aosp-api36-x64-r2') -or $archive.filename -cnotmatch '^[A-Za-z0-9_.-]+\.zip$' -or $archive.sha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'Runtime archive scope denied'};if(-not(Test-Path -LiteralPath (Join-Path $plan.root ('incoming\runtime-test-v1\'+$archive.filename)) -PathType Leaf)){throw 'Runtime archive not copied'}}
foreach($request in Get-ChildItem -LiteralPath (Join-Path $plan.root 'requests') -Filter 'ab_*.json'){if(-not(Test-Path -LiteralPath (Join-Path $plan.root ('results\'+$request.Name)))){throw 'SDK compiler has an unresolved job'}}
$approval=Join-Path $plan.root ('incoming\'+$plan.id+'.consumed.json');$stream=[IO.File]::Open($approval,[IO.FileMode]::CreateNew)
try{$bytes=[Text.UTF8Encoding]::new($false).GetBytes(($plan|ConvertTo-Json -Depth 8 -Compress));$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
$rootAcl=(Get-Acl -LiteralPath $plan.root).Sddl;$sc=Join-Path $env:WINDIR 'System32\sc.exe'
function Scoped-Service([string[]]$Arguments){& $sc ('\\'+$plan.server) @Arguments|Out-Null;if($LASTEXITCODE -ne 0 -and -not($Arguments[0] -ceq 'stop' -and $LASTEXITCODE -eq 1062)){throw 'Runtime SDK service operation failed; reconcile retained setup before retry'}}
Scoped-Service @('stop','DevSetuAndroidBuilder');Start-Sleep -Seconds 3
$before=[IO.File]::ReadAllBytes($configPath)
$config.phase='initialize-runtime';$config|Add-Member -NotePropertyName runtimeArchives -NotePropertyValue $plan.archives -Force
$config|Add-Member -NotePropertyName verifyExtractedRuntime -NotePropertyValue ([bool]$VerifyExtracted) -Force
[IO.File]::WriteAllText($configPath,($config|ConvertTo-Json -Depth 8 -Compress),[Text.UTF8Encoding]::new($false))
$initializationHash=(Get-FileHash -LiteralPath $configPath).Hash.ToLowerInvariant()
try{
# Only the fixed SDK archive extractor executes under SYSTEM; no build request is processed.
$startedAt=[DateTimeOffset]::UtcNow
Scoped-Service @('config','DevSetuAndroidBuilder','obj=','LocalSystem');Scoped-Service @('start','DevSetuAndroidBuilder')
$statePath=Join-Path $plan.root 'sdk\runtime-state.json';$deadline=[DateTimeOffset]::UtcNow.AddMinutes(8)
while(-not(Test-Path -LiteralPath $statePath)){
 if([DateTimeOffset]::UtcNow -ge $deadline){throw 'Runtime SDK extraction deadline; retained state requires review'}
 $process=Get-Content -LiteralPath (Join-Path $plan.root 'results\service-process.json') -Raw|ConvertFrom-Json
 if($process.stage -ceq 'child-exited' -and $process.exitCode -ne 0 -and ([DateTimeOffset]$process.at) -ge $startedAt){throw 'Runtime SDK initializer failed; retained files require reviewed verification'}
 Start-Sleep -Seconds 3
}
$state=Get-Content -LiteralPath $statePath -Raw|ConvertFrom-Json
if($state.status -cne 'READY' -or $state.tools.Count -ne 7 -or @($state.tools|Where-Object id -CEQ 'empty-data').Count -ne 1){throw 'Runtime SDK evidence invalid'}
}finally{
Scoped-Service @('stop','DevSetuAndroidBuilder');Start-Sleep -Seconds 3
if((Get-FileHash -LiteralPath $configPath).Hash.ToLowerInvariant() -cne $initializationHash){throw 'SDK configuration changed during initialization; retain state for review'}
[IO.File]::WriteAllBytes($configPath,$before)
Scoped-Service @('config','DevSetuAndroidBuilder','obj=','NT SERVICE\DevSetuAndroidBuilder');Scoped-Service @('start','DevSetuAndroidBuilder')
if((Get-Acl -LiteralPath $plan.root).Sddl -cne $rootAcl){throw 'Runtime SDK root permissions changed'}
}
$receipt=@{version=1;status='PASS';id=$plan.id;runtimeSDKToolsInstalled=$true;retainedFilesVerified=([bool]$VerifyExtracted);signingIdentityChanged=$false;customerApplicationChanged=$false;rootPermissionsPreserved=$true}
[IO.File]::WriteAllText((Join-Path $plan.root 'results\runtime-install.json'),($receipt|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false));$receipt|ConvertTo-Json -Compress
