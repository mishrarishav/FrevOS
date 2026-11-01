param([Parameter(Mandatory=$true)][string]$PlanReference,[switch]$PlanOnly)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest;Add-Type -AssemblyName System.Security
function CopyReviewedAcl([string]$Source,[string]$Destination){
 $sections=[Security.AccessControl.AccessControlSections]::Access -bor [Security.AccessControl.AccessControlSections]::Owner -bor [Security.AccessControl.AccessControlSections]::Group
 $security=[Security.AccessControl.FileSecurity]::new();$security.SetSecurityDescriptorBinaryForm([IO.File]::GetAccessControl($Source).GetSecurityDescriptorBinaryForm(),$sections)
 [IO.File]::SetAccessControl($Destination,$security)
 if([IO.File]::GetAccessControl($Destination).GetSecurityDescriptorSddlForm($sections) -cne [IO.File]::GetAccessControl($Source).GetSecurityDescriptorSddlForm($sections)){throw 'Reviewed file permissions differ'}
}
function Hash([string]$File){(Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant()}
function Plain([string]$File){for($cursor=[IO.Path]::GetFullPath($File);;$cursor=[IO.Path]::GetDirectoryName($cursor)){if([IO.File]::GetAttributes($cursor) -band [IO.FileAttributes]::ReparsePoint){throw 'Linked preview executor path denied'};if($cursor -eq [IO.Path]::GetPathRoot($cursor)){break}}}
Plain $PlanReference;if((Get-Item -LiteralPath $PlanReference).Length -gt 16384){throw 'Preview executor intent capacity'}
$plan=Get-Content -LiteralPath $PlanReference -Raw|ConvertFrom-Json;$now=[DateTimeOffset]::UtcNow
if((@($plan.PSObject.Properties.Name|Sort-Object)-join ',') -cne 'action,adapterSha256,configurationSha256,executionSid,executorId,expectedActiveManifest,expiresAt,files,id,installationRoot,issuedAt,ownerReference,platformRoot,profileId,repositoryId,role,version,workspaceId'){throw 'Preview executor intent fields differ'}
if($plan.version -ne 1 -or $plan.action -cne 'devsetu.preview.executor-update.v1' -or $plan.id -cnotmatch '^pve_[a-f0-9]{32}$' -or $plan.executorId -cnotmatch '^ex_[a-f0-9]{32}$' -or $plan.role -cnotin @('builder','destination') -or $plan.executionSid -cne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value -or $plan.workspaceId -cnotmatch '^ws_[A-Za-z0-9_-]+$' -or $plan.repositoryId -cnotmatch '^gitrepo_[a-f0-9]{32}$' -or $plan.ownerReference.Length -lt 10 -or ([DateTimeOffset]$plan.issuedAt) -gt $now -or ([DateTimeOffset]$plan.expiresAt) -le $now -or (([DateTimeOffset]$plan.expiresAt)-([DateTimeOffset]$plan.issuedAt)).TotalSeconds -gt 600){throw 'Preview executor intent scope differs'}
$parent=if($plan.role -ceq 'builder'){Join-Path $env:LOCALAPPDATA 'DevSetu\Executors'}else{Join-Path $env:ProgramData 'DevSetu\Executors'}
$root=Join-Path $parent $plan.executorId;Plain $root
if([IO.Path]::GetFullPath($plan.installationRoot) -cne $root -or ($plan.role -ceq 'destination' -and $plan.executionSid -cne 'S-1-5-18')){throw 'Preview executor execution boundary differs'}
$scope=if($plan.role -ceq 'builder'){'CurrentUser'}else{'LocalMachine'}
if([IO.File]::ReadAllText((Join-Path $root 'executor-scope.txt')) -cne $scope -or (Hash (Join-Path $root 'executor.dpapi')) -cne $plan.configurationSha256 -or (Hash (Join-Path $root 'NativePlatform.cjs')) -cne $plan.adapterSha256){throw 'Preview executor enrollment changed'}
if($plan.profileId -cnotmatch '^[a-z][a-z0-9-]{2,63}$'){throw 'Preview executor profile denied'}
$clear=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes((Join-Path $root 'executor.dpapi')),$null,([Enum]::Parse([Security.Cryptography.DataProtectionScope],$scope)))
try{$enrollment=[Text.Encoding]::UTF8.GetString($clear)|ConvertFrom-Json}finally{[Array]::Clear($clear,0,$clear.Length)}
if($enrollment.id -cne $plan.executorId -or $enrollment.role -cne $plan.role -or $enrollment.profileId -cne $plan.profileId -or $enrollment.bindings.Count -ne 1 -or $enrollment.bindings[0].nativeAdapter.file -cne (Join-Path $root 'NativePlatform.cjs') -or $enrollment.bindings[0].nativeAdapter.sha256 -cne $plan.adapterSha256){throw 'Preview executor binding differs'}
$boundRoot=if($plan.role -ceq 'builder'){$enrollment.bindings[0].nativeOptions.baselineRoot}else{$enrollment.bindings[0].nativeOptions.installationRoot}
if([IO.Path]::GetFullPath($boundRoot) -cne [IO.Path]::GetFullPath($plan.platformRoot)){throw 'Preview executor platform binding differs'}
$enrollment=$null
Plain $plan.platformRoot
if((Get-Content -LiteralPath (Join-Path $plan.platformRoot 'state\active.json') -Raw|ConvertFrom-Json).manifestSha256 -cne $plan.expectedActiveManifest){throw 'Preview executor active platform changed'}
$release=Join-Path $plan.platformRoot ('releases\'+$plan.expectedActiveManifest);$manifestFile=Join-Path $release 'release-manifest.json'
if((Hash $manifestFile) -cne $plan.expectedActiveManifest){throw 'Preview executor active manifest differs'}
$manifest=Get-Content -LiteralPath $manifestFile -Raw|ConvertFrom-Json;$policyFile=Join-Path $release 'deployment\servix\DiscoveryAccessPolicy.json';$policyEntry=@($manifest.files|Where-Object path -CEQ 'deployment/servix/DiscoveryAccessPolicy.json')
if($policyEntry.Count -ne 1 -or (Hash $policyFile) -cne $policyEntry[0].sha256 -or (Get-Content -LiteralPath $policyFile -Raw|ConvertFrom-Json).workspaceId -cne $plan.workspaceId){throw 'Preview executor workspace policy differs'}
$profile=Get-Content -LiteralPath (Join-Path $plan.platformRoot ('servix\jobs\components\profile-'+$plan.profileId+'.json')) -Raw|ConvertFrom-Json
$roleField=if($plan.role -ceq 'builder'){'builderId'}else{'destinationId'}
if($profile.repository.id -cne $plan.repositoryId -or -not @($profile.components|Where-Object {$_.$roleField -ceq $plan.executorId}).Count){throw 'Preview executor provider repository differs'}
foreach($file in Get-ChildItem -LiteralPath (Join-Path $plan.platformRoot 'servix\jobs\components') -Filter 'job-cj_*.json'){$job=Get-Content -LiteralPath $file.FullName -Raw|ConvertFrom-Json;if($job.executorId -ceq $plan.executorId -and $job.status -cnotin @('succeeded','failed')){throw 'Preview executor has unresolved work'}}
$allowed=if($plan.role -ceq 'builder'){@('HttpCommon.ps1','New-ServixDashboardRelease.ps1')}else{@('HttpCommon.ps1','Verify-AndroidCompatibility.ps1')}
if(@($plan.files).Count -ne 2 -or (@($plan.files.name|Sort-Object)-join ',') -cne ($allowed -join ',')){throw 'Preview executor file inventory differs'}
foreach($file in $plan.files){
 if((@($file.PSObject.Properties.Name|Sort-Object)-join ',') -cne 'beforeSha256,name,sha256,source'){throw 'Preview executor sidecar fields differ'}
 Plain $file.source;Plain (Join-Path $root $file.name)
 if($file.sha256 -cnotmatch '^[a-f0-9]{64}$' -or (Hash $file.source) -cne $file.sha256 -or (Hash (Join-Path $root $file.name)) -cne $file.beforeSha256){throw 'Preview executor file bytes differ'}
 $tokens=$null;$parseErrors=$null;[void][Management.Automation.Language.Parser]::ParseFile($file.source,[ref]$tokens,[ref]$parseErrors);if($parseErrors.Count){throw 'Preview executor script parse failed'}
}
$taskName='DevSetu-Executor-'+$plan.executorId;$task=Get-ScheduledTask -TaskName $taskName;$principal=$task.Principal.UserId
if($principal -notmatch '^S-1-'){$principal=([Security.Principal.NTAccount]::new($principal)).Translate([Security.Principal.SecurityIdentifier]).Value}
$arguments='-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File "'+(Join-Path $root 'Run-Executor.ps1')+'"'
if($task.Actions.Count -ne 1 -or $task.Actions[0].Execute -ine (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe') -or $task.Actions[0].Arguments -cne $arguments -or $principal -cne $plan.executionSid -or -not $task.Settings.Enabled -or ($plan.role -ceq 'builder' -and $task.Principal.RunLevel -cne 'Limited')){throw 'Preview executor task identity differs'}
$taskXml=Export-ScheduledTask -TaskName $taskName;$rootAcl=(Get-Acl -LiteralPath $root).Sddl
$referenceDirectory=[IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($PlanReference))
if($PlanOnly){$result=@{status='READY';id=$plan.id;action=$plan.action;executorId=$plan.executorId;enrollmentBytesPreserved=$true};[IO.File]::WriteAllText((Join-Path $referenceDirectory 'plan-only-result.json'),($result|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false));$result|ConvertTo-Json -Compress;return}
$backup=Join-Path $root ('.local\preview-executor-'+$plan.id)
if(Test-Path -LiteralPath $backup){throw 'Preview executor intent consumed'}
[void][IO.Directory]::CreateDirectory($backup);[IO.File]::WriteAllText((Join-Path $backup 'intent.json'),($plan|ConvertTo-Json -Depth 7 -Compress),[Text.UTF8Encoding]::new($false))
[IO.File]::Copy((Join-Path $root 'executor.dpapi'),(Join-Path $backup 'executor.before.dpapi'),$false)
foreach($file in $plan.files){[IO.File]::Copy((Join-Path $root $file.name),(Join-Path $backup $file.name),$false)}
function StopOwned {Disable-ScheduledTask -TaskName $taskName|Out-Null;Stop-ScheduledTask -TaskName $taskName;$deadline=[DateTimeOffset]::UtcNow.AddSeconds(30);while((Get-ScheduledTask -TaskName $taskName).State -ceq 'Running'){if([DateTimeOffset]::UtcNow -gt $deadline){throw 'Preview executor stop deadline'};Start-Sleep -Milliseconds 250}}
try{
 StopOwned
 if((Hash (Join-Path $root 'executor.dpapi')) -cne $plan.configurationSha256){throw 'Preview executor changed during maintenance'}
 foreach($file in $plan.files){$destination=Join-Path $root $file.name;$temporary=$destination+'.'+$plan.id+'.tmp';if((Hash $destination) -cne $file.beforeSha256){throw 'Preview executor file changed during maintenance'};[IO.File]::Copy($file.source,$temporary,$false);CopyReviewedAcl $destination $temporary;[IO.File]::Replace($temporary,$destination,(Join-Path $backup ('atomic-'+$file.name)));if((Hash $destination) -cne $file.sha256){throw 'Preview executor replacement differs'}}
 Enable-ScheduledTask -TaskName $taskName|Out-Null;Start-ScheduledTask -TaskName $taskName
 if((Hash (Join-Path $root 'executor.dpapi')) -cne $plan.configurationSha256 -or (Export-ScheduledTask -TaskName $taskName) -cne $taskXml -or (Get-Acl -LiteralPath $root).Sddl -cne $rootAcl -or (Hash (Join-Path $root 'NativePlatform.cjs')) -cne $plan.adapterSha256){throw 'Preview executor preservation failed'}
 $result=@{status='PASS';id=$plan.id;action=$plan.action;executorId=$plan.executorId;configurationBytesPreserved=$true;adapterBytesPreserved=$true;taskDefinitionPreserved=$true;rootPermissionsPreserved=$true;backup=$backup}
 [IO.File]::WriteAllText((Join-Path $referenceDirectory 'preview-executor-result.json'),($result|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false));$result|ConvertTo-Json -Compress
}catch{
 StopOwned
 foreach($file in $plan.files){$destination=Join-Path $root $file.name;if((Hash $destination) -cnotin @($file.beforeSha256,$file.sha256)){throw 'Preview executor recovery requires review of independent changes'};[IO.File]::Copy((Join-Path $backup $file.name),$destination,$true)}
 Enable-ScheduledTask -TaskName $taskName|Out-Null;Start-ScheduledTask -TaskName $taskName
 [IO.File]::WriteAllText((Join-Path $referenceDirectory 'preview-executor-result.json'),'{"status":"RESTORED"}',[Text.UTF8Encoding]::new($false));throw 'Preview executor update failed; previous operators restored'
}
