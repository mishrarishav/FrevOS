param([Parameter(Mandatory=$true)][string]$PlanReference,[switch]$ResumePrepared)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$plan=Get-Content -LiteralPath $PlanReference -Raw|ConvertFrom-Json
$actor=[Security.Principal.WindowsIdentity]::GetCurrent()
if($plan.version -ne 1 -or $plan.action -cne $(if($ResumePrepared){'android-sdk:resume-prepared'}else{'android-sdk:initialize'}) -or $plan.actorSid -cne $actor.User.Value -or $plan.workspaceId -cnotmatch '^ws_[a-z0-9_-]+$' -or $plan.profileId -cnotmatch '^[a-z0-9-]+$' -or $plan.repositoryId -cnotmatch '^gitrepo_[a-f0-9]{32}$' -or $plan.correlationId -cnotmatch '^as_[a-f0-9]{32}$'){throw 'SDK setup identity/scope denied'}
$issued=[DateTimeOffset]$plan.issuedAt;$expires=[DateTimeOffset]$plan.expiresAt;$now=[DateTimeOffset]::UtcNow
if($issued -gt $now -or $expires -le $now -or ($expires-$issued).TotalMinutes -gt 10 -or ($expires-$issued).TotalSeconds -le 0){throw 'SDK setup approval expired'}
if($plan.server -cnotmatch '^[a-zA-Z0-9.-]+$' -or $plan.localRoot -cnotmatch '^[A-Z]:\\[^:]+$' -or $plan.localRoot -match '(?:^|\\)\.\.?(?:\\|$)' -or $plan.localRoot.TrimEnd('\').Length -lt 8){throw 'Specific SDK target required'}
$localRoot=[IO.Path]::GetFullPath($plan.localRoot)
$relativeRoot=$localRoot.Substring(3)
$uncRoot='\\'+$plan.server+'\'+$localRoot.Substring(0,1).ToLowerInvariant()+'$\'+$relativeRoot
if($uncRoot -cne $plan.uncRoot){throw 'SDK target mapping mismatch'}
function Assert-Plain([string]$Path){$cursor=[IO.Path]::GetFullPath($Path);$volumeRoot=[IO.Path]::GetPathRoot($cursor).TrimEnd('\');while($cursor){if($cursor.TrimEnd('\') -ceq $volumeRoot){break};if(Test-Path -LiteralPath $cursor){if((Get-Item -Force -LiteralPath $cursor).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked SDK target denied'}};$parent=[IO.Path]::GetDirectoryName($cursor);if($parent -eq $cursor){break};$cursor=$parent}}
Assert-Plain $uncRoot
if(Test-Path -LiteralPath (Join-Path $uncRoot 'bin')){if(-not $ResumePrepared){throw 'SDK builder already installed; use an exact reviewed update'}}elseif($ResumePrepared){throw 'Prepared SDK operator missing'}
if($ResumePrepared){
 if($plan.resumeCorrelationId -cnotmatch '^as_[a-f0-9]{32}$'){throw 'SDK resume evidence required'}
 $previous=Get-Content -LiteralPath (Join-Path $uncRoot ('incoming\'+$plan.resumeCorrelationId+'.consumed.json')) -Raw|ConvertFrom-Json
 if($previous.actorSid -cne $actor.User.Value -or $previous.workspaceId -cne $plan.workspaceId -or $previous.target -cne $localRoot -or $previous.action -cne 'android-sdk:initialize'){throw 'SDK resume binding mismatch'}
 foreach($folder in @('sdk','requests','jobs','results','private')){if(@(Get-ChildItem -LiteralPath (Join-Path $uncRoot $folder) -Force).Count){throw 'SDK resume only supports an empty prepared installation'}}
 $preparedConfig=Get-Content -LiteralPath (Join-Path $uncRoot 'bin\service-config.json') -Raw|ConvertFrom-Json
 if($preparedConfig.phase -cne 'initialize' -or $preparedConfig.root -cne $localRoot -or $preparedConfig.workspaceId -cne $plan.workspaceId -or $preparedConfig.profileId -cne $plan.profileId -or $preparedConfig.repositoryId -cne $plan.repositoryId){throw 'SDK prepared configuration changed'}
}
$parentPath=Split-Path $uncRoot -Parent;$parentSddl=(Get-Acl -LiteralPath $parentPath).Sddl
foreach($file in $plan.operatorFiles){
 if($file.name -cnotin @('AndroidBuild.cjs','AndroidBuilderService.exe','Run-AndroidBuilder.ps1','Initialize-Sdk.ps1','Resolve-SigningReference.ps1','BuildProcess.psm1','node.exe') -or $file.sha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'SDK operator input denied'}
 Assert-Plain $file.source
 if((Get-FileHash -LiteralPath $file.source -Algorithm SHA256).Hash.ToLowerInvariant() -cne $file.sha256){throw 'SDK operator artifact changed'}
 if($ResumePrepared -and (Get-FileHash -LiteralPath (Join-Path $uncRoot ('bin\'+$file.name)) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $file.sha256){throw 'Prepared SDK operator bytes changed'}
}
if($plan.operatorFiles.Count -ne 7 -or @($plan.operatorFiles.name|Sort-Object -Unique).Count -ne 7){throw 'Complete unique SDK operator inventory required'}
$manifestPath=Join-Path $uncRoot 'incoming\toolchain-v1\toolchain-manifest.json'
if((Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $plan.toolchainManifestSha256){throw 'SDK archive manifest changed'}
$manifest=Get-Content -LiteralPath $manifestPath -Raw|ConvertFrom-Json
if($manifest.status -cne 'STAGED' -or $manifest.files.Count -ne 4 -or $plan.licenseApprovalReference.Length -lt 3){throw 'SDK toolchain approval missing'}
$serviceName='DevSetuAndroidBuilder'
$scExe=Join-Path $env:WINDIR 'System32\sc.exe'
$sidText=(& $scExe showsid $serviceName|Out-String)
$serviceSid=[regex]::Match($sidText,'S-1-5-80-(?:[0-9]+-){4}[0-9]+').Value
if(-not $serviceSid){throw 'Restricted service SID unavailable'}
$consumedPath=Join-Path $uncRoot ('incoming\'+$plan.correlationId+'.consumed.json')
$approvalBytes=[Text.UTF8Encoding]::new($false).GetBytes(($plan|ConvertTo-Json -Depth 8 -Compress))
$approvalHash=[BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($approvalBytes)).Replace('-','').ToLowerInvariant()
$approval=@{version=1;action=$plan.action;actorSid=$actor.User.Value;workspaceId=$plan.workspaceId;profileId=$plan.profileId;target=$localRoot;correlationId=$plan.correlationId;approvalSha256=$approvalHash;consumedAt=$now.ToString('o')}
$consume=[IO.File]::Open($consumedPath,[IO.FileMode]::CreateNew);try{$consumptionBytes=[Text.UTF8Encoding]::new($false).GetBytes(($approval|ConvertTo-Json -Compress));$consume.Write($consumptionBytes,0,$consumptionBytes.Length);$consume.Flush($true)}finally{$consume.Dispose()}
function Set-ScopedAcl([string]$Path,[string]$ServiceRights){
 $acl=Get-Acl -LiteralPath $Path;$acl.SetAccessRuleProtection($true,$false)
 foreach($sid in @($actor.User.Value,'S-1-5-18','S-1-5-32-544')|Select-Object -Unique){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))}
 $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($serviceSid),$ServiceRights,'ContainerInherit,ObjectInherit','None','Allow'))
 Set-Acl -LiteralPath $Path -AclObject $acl
}
Set-ScopedAcl $uncRoot 'ReadAndExecute'
foreach($folder in @('bin','sdk','requests','jobs','results','private')){[void][IO.Directory]::CreateDirectory((Join-Path $uncRoot $folder))}
foreach($folder in @('requests','jobs','results')){Set-ScopedAcl (Join-Path $uncRoot $folder) 'Modify'}
Set-ScopedAcl (Join-Path $uncRoot 'private') 'ReadAndExecute'
if(-not $ResumePrepared){foreach($file in $plan.operatorFiles){[IO.File]::Copy($file.source,(Join-Path $uncRoot ('bin\'+$file.name)),$false)}}
$serviceConfig=@{version=1;phase='initialize';root=$localRoot;workspaceId=$plan.workspaceId;profileId=$plan.profileId;repositoryId=$plan.repositoryId;archives=@($manifest.files|Select-Object id,filename,sha256);licenseApprovalReference=$plan.licenseApprovalReference;operatorEntrySha256=(Get-FileHash -LiteralPath (Join-Path $uncRoot 'bin\AndroidBuild.cjs') -Algorithm SHA256).Hash.ToLowerInvariant()}
$configurationPath=Join-Path $uncRoot 'bin\service-config.json'
[IO.File]::WriteAllText($configurationPath,($serviceConfig|ConvertTo-Json -Depth 6 -Compress),[Text.UTF8Encoding]::new($false))
function Invoke-ScopedService([string[]]$ServiceArguments){
 & $scExe ('\\'+$plan.server) @ServiceArguments|Out-Null
 if($LASTEXITCODE -ne 0){throw 'SDK service operation failed; retained setup evidence must be reviewed before retry'}
}
$binary='"'+[IO.Path]::Combine($localRoot,'bin\AndroidBuilderService.exe')+'"'
Invoke-ScopedService -ServiceArguments @('create',$serviceName,'binPath=',$binary,'start=','demand','obj=','LocalSystem','DisplayName=','DevSetu Android SDK builder')
Invoke-ScopedService -ServiceArguments @('start',$serviceName)
$until=[DateTimeOffset]::UtcNow.AddMinutes(8)
$sdkStatePath=Join-Path $uncRoot 'sdk\sdk-state.json'
while(-not(Test-Path -LiteralPath $sdkStatePath)){if([DateTimeOffset]::UtcNow -ge $until){throw 'SDK initialization deadline; service and evidence retained'};Start-Sleep -Seconds 3}
$sdkState=Get-Content -LiteralPath $sdkStatePath -Raw|ConvertFrom-Json
if($sdkState.version -ne 1 -or $sdkState.status -cne 'READY' -or $sdkState.tools.Count -ne 10){throw 'SDK initialization report invalid'}
Invoke-ScopedService -ServiceArguments @('stop',$serviceName)
Start-Sleep -Seconds 3
$serviceConfig.phase='worker'
[IO.File]::WriteAllText($configurationPath,($serviceConfig|ConvertTo-Json -Depth 6 -Compress),[Text.UTF8Encoding]::new($false))
Invoke-ScopedService -ServiceArguments @('config',$serviceName,'obj=',('NT SERVICE\'+$serviceName),'start=','auto')
Invoke-ScopedService -ServiceArguments @('sidtype',$serviceName,'unrestricted')
Invoke-ScopedService -ServiceArguments @('start',$serviceName)
$healthPath=Join-Path $uncRoot 'results\service-health.json';$healthUntil=[DateTimeOffset]::UtcNow.AddMinutes(2)
while(-not(Test-Path -LiteralPath $healthPath)){if([DateTimeOffset]::UtcNow -ge $healthUntil){throw 'Restricted SDK worker readiness deadline'};Start-Sleep -Seconds 2}
$health=Get-Content -LiteralPath $healthPath -Raw|ConvertFrom-Json
if($health.status -cne 'READY' -or ([DateTimeOffset]::UtcNow-([DateTimeOffset]$health.at)).TotalSeconds -gt 15){throw 'SDK worker health is stale'}
if((Get-Acl -LiteralPath $parentPath).Sddl -cne $parentSddl){throw 'Parent SDK permissions changed'}
$receipt=@{version=1;status='PASS';action=$plan.action;correlationId=$plan.correlationId;approvalSha256=$approvalHash;target=$localRoot;service=$serviceName;serviceSid=$serviceSid;tools=$sdkState.tools;workerHealth=$health;parentPermissionsPreserved=$true;signingIdentityCreated=$false;customerApplicationChanged=$false;appliedUtc=[DateTimeOffset]::UtcNow.ToString('o')}
[IO.File]::WriteAllText((Join-Path $uncRoot 'results\sdk-install-receipt.json'),($receipt|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
$receipt|ConvertTo-Json -Depth 8 -Compress
