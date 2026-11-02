param([Parameter(Mandatory=$true)][string]$PlanReference)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$plan=Get-Content -LiteralPath $PlanReference -Raw|ConvertFrom-Json
$actor=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$now=[DateTimeOffset]::UtcNow
if($plan.version -ne 1 -or $plan.action -cne 'android-signing:create' -or $plan.id -cnotmatch '^ak_[a-f0-9]{32}$' -or $plan.actorSid -cne $actor -or $plan.ownerApprovalReference.Length -lt 10 -or ([DateTimeOffset]$plan.issuedAt) -gt $now -or ([DateTimeOffset]$plan.expiresAt) -le $now -or (([DateTimeOffset]$plan.expiresAt)-([DateTimeOffset]$plan.issuedAt)).TotalMinutes -gt 10 -or $plan.server -cnotmatch '^[A-Za-z0-9.-]+$'){throw 'Explicit fresh signing approval is required'}
$configFile=Join-Path $plan.root 'bin\service-config.json'
$configuration=Get-Content -LiteralPath $configFile -Raw|ConvertFrom-Json
if($configuration.phase -cne 'worker' -or $configuration.workspaceId -cne $plan.workspaceId -or $configuration.profileId -cne $plan.profileId -or $configuration.repositoryId -cne $plan.repositoryId -or $configuration.root -cne $plan.targetLocalRoot -or $configuration.PSObject.Properties.Name -contains 'signing' -or $plan.applicationId -cne 'org.devsetu.connector'){throw 'Signing target already initialized or scope differs'}
$mapped='\\'+$plan.server+'\'+$configuration.root.Substring(0,1).ToLowerInvariant()+'$\'+$configuration.root.Substring(3)
if($mapped -cne $plan.root -or (Get-Item -LiteralPath $plan.root).Attributes -band [IO.FileAttributes]::ReparsePoint -or @(Get-ChildItem -LiteralPath (Join-Path $plan.root 'private') -Force).Count){throw 'Signing target mapping or empty private boundary invalid'}
foreach($request in Get-ChildItem -LiteralPath (Join-Path $plan.root 'requests') -Filter 'ab_*.json'){if(-not(Test-Path -LiteralPath (Join-Path $plan.root ('results\'+$request.Name)))){throw 'SDK builder has an unresolved job'}}
if($plan.operatorFiles.Count -ne 2 -or @($plan.operatorFiles.name|Sort-Object -Unique).Count -ne 2){throw 'Reviewed signing operator inventory required'}
foreach($file in $plan.operatorFiles){
 if($file.name -cnotin @('Run-AndroidBuilder.ps1','Initialize-SigningIdentity.ps1') -or (Get-FileHash -LiteralPath $file.source).Hash.ToLowerInvariant() -cne $file.sha256 -or (Get-Item -LiteralPath $file.source).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Signing operator source changed'}
 $target=Join-Path $plan.root ('bin\'+$file.name)
 if($file.name -ceq 'Run-AndroidBuilder.ps1'){if((Get-FileHash -LiteralPath $target).Hash.ToLowerInvariant() -cne $file.beforeSha256){throw 'Signing runner baseline changed'}}elseif(Test-Path -LiteralPath $target){throw 'Signing operator already staged; reconcile previous attempt'}
}
$rootAcl=(Get-Acl -LiteralPath $plan.root).Sddl;$privateAcl=(Get-Acl -LiteralPath (Join-Path $plan.root 'private')).Sddl
$incoming=Join-Path $plan.root ('incoming\'+$plan.id+'.json')
$stream=[IO.File]::Open($incoming,[IO.FileMode]::CreateNew)
try{$bytes=[Text.UTF8Encoding]::new($false).GetBytes(($plan|ConvertTo-Json -Depth 8 -Compress));$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
$sc=Join-Path $env:WINDIR 'System32\sc.exe'
function Scoped-Service([string[]]$Arguments){& $sc ('\\'+$plan.server) @Arguments|Out-Null;if($LASTEXITCODE -ne 0){throw 'Signing setup service operation failed; reconcile retained plan before retry'}}
Scoped-Service @('stop','DevSetuAndroidBuilder');Start-Sleep -Seconds 3
foreach($file in $plan.operatorFiles){$target=Join-Path $plan.root ('bin\'+$file.name);if($file.name -ceq 'Run-AndroidBuilder.ps1'){$temporary=$target+'.'+$plan.id+'.tmp';[IO.File]::Copy($file.source,$temporary,$false);[IO.File]::Replace($temporary,$target,($target+'.'+$plan.id+'.before'))}else{[IO.File]::Copy($file.source,$target,$false)}}
$configuration.phase='initialize-signing'
$configuration|Add-Member -NotePropertyName signingSetupPlanReference -NotePropertyValue ([IO.Path]::Combine($configuration.root,'incoming',($plan.id+'.json')))
$configuration|Add-Member -NotePropertyName signingSetupPlanSha256 -NotePropertyValue (Get-FileHash -LiteralPath $incoming).Hash.ToLowerInvariant()
[IO.File]::WriteAllText($configFile,($configuration|ConvertTo-Json -Depth 8 -Compress),[Text.UTF8Encoding]::new($false))
# The fixed signing-only phase does not process build requests under SYSTEM.
Scoped-Service @('config','DevSetuAndroidBuilder','obj=','LocalSystem');Scoped-Service @('start','DevSetuAndroidBuilder')
$receipt=Join-Path $plan.root ('results\'+$plan.id+'.json');$deadline=[DateTimeOffset]::UtcNow.AddMinutes(4)
while(-not(Test-Path -LiteralPath $receipt)){if([DateTimeOffset]::UtcNow -ge $deadline){throw 'Signing initialization deadline; private state and scoped approval retained for recovery'};Start-Sleep -Seconds 2}
$result=Get-Content -LiteralPath $receipt -Raw|ConvertFrom-Json
if($result.status -cne 'PASS' -or $result.id -cne $plan.id -or $result.certificateSha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'Signing result not verified'}
Scoped-Service @('stop','DevSetuAndroidBuilder');Start-Sleep -Seconds 3
$configuration=Get-Content -LiteralPath $configFile -Raw|ConvertFrom-Json
if($configuration.signing.certificateSha256 -cne $result.certificateSha256){throw 'Signing identity configuration mismatch'}
$configuration.phase='worker';$configuration.PSObject.Properties.Remove('signingSetupPlanReference');$configuration.PSObject.Properties.Remove('signingSetupPlanSha256')
[IO.File]::WriteAllText($configFile,($configuration|ConvertTo-Json -Depth 8 -Compress),[Text.UTF8Encoding]::new($false))
Scoped-Service @('config','DevSetuAndroidBuilder','obj=','NT SERVICE\DevSetuAndroidBuilder');Scoped-Service @('start','DevSetuAndroidBuilder')
if((Get-Acl -LiteralPath $plan.root).Sddl -cne $rootAcl -or (Get-Acl -LiteralPath (Join-Path $plan.root 'private')).Sddl -cne $privateAcl){throw 'Signing boundary permissions changed'}
$result|ConvertTo-Json -Compress
