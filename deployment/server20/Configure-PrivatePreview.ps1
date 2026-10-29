param([Parameter(Mandatory=$true)][string]$PlanReference,[switch]$PlanOnly)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
function Hash([string]$File){(Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant()}
function Plain([string]$File){for($cursor=[IO.Path]::GetFullPath($File);;$cursor=[IO.Path]::GetDirectoryName($cursor)){if([IO.File]::GetAttributes($cursor) -band [IO.FileAttributes]::ReparsePoint){throw 'Linked private preview path denied'};if($cursor -eq [IO.Path]::GetPathRoot($cursor)){break}}}
Plain $PlanReference;if((Get-Item -LiteralPath $PlanReference).Length -gt 32768){throw 'Private preview intent capacity'}
$plan=Get-Content -LiteralPath $PlanReference -Raw|ConvertFrom-Json
$properties='action,approvedBy,config,configBeforeSha256,controlTask,createdAt,deploymentRunId,executionSid,executorId,executorRoot,expiresAt,guardBeforeSha256,id,installationRoot,manifestSha256,nodeExecutable,nodeSha256,requestedBy,taskXmlSha256,version,workspaceId'
if((@($plan.PSObject.Properties.Name|Sort-Object)-join ',') -cne $properties -or $plan.version -ne 1 -or $plan.action -cne 'devsetu.private-preview.configure.v1' -or $plan.id -cnotmatch '^pvc_[a-f0-9]{32}$' -or $plan.executionSid -cne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value -or $plan.approvedBy.Length -lt 10 -or $plan.approvedBy.Length -gt 160 -or $plan.config.workspaceId -cne $plan.workspaceId -or $plan.executorId -cnotmatch '^ex_[a-f0-9]{32}$'){throw 'Private preview intent scope differs'}
$now=[DateTimeOffset]::UtcNow
if(([DateTimeOffset]$plan.createdAt) -gt $now -or ([DateTimeOffset]$plan.expiresAt) -le $now -or (([DateTimeOffset]$plan.expiresAt)-([DateTimeOffset]$plan.createdAt)).TotalSeconds -gt 600){throw 'Private preview approval expired'}
$root=[IO.Path]::GetFullPath($plan.installationRoot);Plain $root
if($root -ieq [IO.Path]::GetPathRoot($root) -or $plan.manifestSha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'Private preview installation scope differs'}
$activeFile=Join-Path $root 'state\active.json';$active=Get-Content -LiteralPath $activeFile -Raw|ConvertFrom-Json
if($active.manifestSha256 -cne $plan.manifestSha256){throw 'Private preview active release changed'}
$release=Join-Path $root ('releases\'+$plan.manifestSha256);Plain $release;$manifestFile=Join-Path $release 'release-manifest.json'
if((Hash $manifestFile) -cne $plan.manifestSha256){throw 'Private preview manifest identity differs'}
$manifest=Get-Content -LiteralPath $manifestFile -Raw|ConvertFrom-Json
if($plan.deploymentRunId -cnotmatch '^pr_[a-f0-9]{32}$' -or $plan.requestedBy -cnotmatch '^usr_[A-Za-z0-9_-]+$'){throw 'Private preview publication reference differs'}
$run=Get-Content -LiteralPath (Join-Path $root ('servix\jobs\components\run-'+$plan.deploymentRunId+'.json')) -Raw|ConvertFrom-Json
if($run.status -cne 'succeeded' -or $run.workspaceId -cne $plan.workspaceId -or $run.requestedBy -cne $plan.requestedBy -or $run.sourceHead -cne $manifest.applicationSource){throw 'Private preview publication authority differs'}
foreach($name in @('deployment/server20/Validate-PreviewConfig.mjs','deployment/server20/Verify-AndroidCompatibility.ps1','apps/control-plane/dist/preview-relay.js','deployment/server20/Start-Server20.ps1')){
 $entry=@($manifest.files|Where-Object path -CEQ $name);$file=Join-Path $release ($name.Replace('/','\'));Plain $file
 if($entry.Count -ne 1 -or (Hash $file) -cne $entry[0].sha256){throw 'Private preview release code differs'}
}
Plain $plan.nodeExecutable;if($plan.nodeSha256 -cnotmatch '^[a-f0-9]{64}$' -or (Hash $plan.nodeExecutable) -cne $plan.nodeSha256){throw 'Private preview validator runtime differs'}
$runtimeFile=Join-Path $root 'config\runtime.json';Plain $runtimeFile;$runtimeHash=Hash $runtimeFile;$runtime=Get-Content -LiteralPath $runtimeFile -Raw|ConvertFrom-Json
if([IO.Path]::GetFullPath($runtime.FREVOS_SERVIX_DEPLOYMENT_ROOT) -ine (Join-Path $root 'servix')){throw 'Private preview workspace root differs'}
$start=[Diagnostics.ProcessStartInfo]::new();$start.FileName=$plan.nodeExecutable;$start.Arguments='"'+(Join-Path $release 'deployment\server20\Validate-PreviewConfig.mjs')+'"';$start.WorkingDirectory=$release;$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
$child=[Diagnostics.Process]::new();$child.StartInfo=$start
try{[void]$child.Start();$out=$child.StandardOutput.ReadToEndAsync();$err=$child.StandardError.ReadToEndAsync();$child.StandardInput.Write((@{config=$plan.config;portal=$runtime.FREVOS_PUBLIC_ORIGIN}|ConvertTo-Json -Depth 9 -Compress));$child.StandardInput.Close();if(-not $child.WaitForExit(20000)){$child.Kill();throw 'Private preview validation deadline'};[void]$err.Result;if($child.ExitCode -ne 0){throw 'Private preview configuration rejected'};$normalized=$out.Result|ConvertFrom-Json}finally{$child.Dispose()}
$task=Get-ScheduledTask -TaskName $plan.controlTask;$taskXml=Export-ScheduledTask -TaskName $plan.controlTask
$taskHash=[BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($taskXml))).Replace('-','').ToLowerInvariant()
$expectedArguments='-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File "'+(Join-Path $release 'deployment\server20\Start-Server20.ps1')+'"'
$legacyArguments='-NoProfile -NonInteractive -WindowStyle Hidden -File "'+(Join-Path $release 'deployment\server20\Start-Server20.ps1')+'"'
if($taskHash -cne $plan.taskXmlSha256 -or @($task.Actions).Count -ne 1 -or $task.Actions[0].Arguments -cnotin @($expectedArguments,$legacyArguments) -or $task.Actions[0].Execute -ine (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe') -or -not $task.Settings.Enabled){throw 'Private preview control task identity differs'}
$executor=[IO.Path]::GetFullPath($plan.executorRoot);Plain $executor
if([IO.Path]::GetFileName($executor) -cne $plan.executorId){throw 'Private preview executor scope differs'}
foreach($file in Get-ChildItem -LiteralPath (Join-Path $root 'servix\jobs\components') -Filter 'job-cj_*.json'){$job=Get-Content -LiteralPath $file.FullName -Raw|ConvertFrom-Json;if($job.executorId -ceq $plan.executorId -and $job.status -cnotin @('succeeded','failed')){throw 'Private preview executor has unresolved work'}}
$guard=Join-Path $executor 'Verify-AndroidCompatibility.ps1';Plain $guard;if((Hash $guard) -cne $plan.guardBeforeSha256){throw 'Private preview compatibility guard changed'}
$configDirectory=Join-Path $root 'servix\config';$configFile=Join-Path $configDirectory 'preview-relay.json'
if(Test-Path -LiteralPath $configFile){Plain $configFile;if((Hash $configFile) -cne $plan.configBeforeSha256){throw 'Private preview configuration already differs'}}elseif($null -ne $plan.configBeforeSha256){throw 'Private preview baseline missing'}
$rootAcl=(Get-Acl -LiteralPath $root).Sddl
if($PlanOnly){$result=@{status='READY';id=$plan.id;action=$plan.action;manifestSha256=$plan.manifestSha256;origins=@($normalized.targets.origin);runtimeValuesPreserved=$true;taskDefinitionPreserved=$true};[IO.File]::WriteAllText((Join-Path ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($PlanReference))) 'plan-only-result.json'),($result|ConvertTo-Json -Depth 7 -Compress),[Text.UTF8Encoding]::new($false));$result|ConvertTo-Json -Compress;return}
$backup=Join-Path $root ('operator\private-preview-'+$plan.id)
if(Test-Path -LiteralPath $backup){throw 'Private preview intent was already consumed'}
[void][IO.Directory]::CreateDirectory($backup)
[IO.File]::WriteAllText((Join-Path $backup 'intent.json'),($plan|ConvertTo-Json -Depth 9 -Compress),[Text.UTF8Encoding]::new($false))
[IO.File]::Copy($guard,(Join-Path $backup 'guard.before.ps1'),$false)
if(Test-Path -LiteralPath $configFile){[IO.File]::Copy($configFile,(Join-Path $backup 'config.before.json'),$false)}
$changed=$false
try{
 $createdDirectory=-not(Test-Path -LiteralPath $configDirectory)
 [void][IO.Directory]::CreateDirectory($configDirectory);Plain $configDirectory
 $configurationBytes=[Text.UTF8Encoding]::new($false).GetBytes(($normalized|ConvertTo-Json -Depth 9 -Compress));$temporary=$configFile+'.'+$plan.id+'.tmp'
 [IO.File]::WriteAllBytes($temporary,$configurationBytes)
 # Only the new, non-secret configuration child needs the existing service's
 # read access. Parent/runtime/database/other project ACLs are untouched.
 $principal=$task.Principal.UserId;if($principal -notmatch '^S-1-'){$principal=([Security.Principal.NTAccount]::new($principal)).Translate([Security.Principal.SecurityIdentifier]).Value}
 $owners=@('S-1-5-18','S-1-5-32-544',$plan.executionSid)|Sort-Object -Unique
 if($createdDirectory){$directoryAcl=[Security.AccessControl.DirectorySecurity]::new();$directoryAcl.SetAccessRuleProtection($true,$false);foreach($owner in $owners){$directoryAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($owner),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))};$directoryAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($principal),'ReadAndExecute','ContainerInherit,ObjectInherit','None','Allow'));Set-Acl -LiteralPath $configDirectory -AclObject $directoryAcl}
 $acl=[Security.AccessControl.FileSecurity]::new();$acl.SetAccessRuleProtection($true,$false);foreach($owner in $owners){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($owner),'FullControl','Allow'))};$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($principal),'ReadAndExecute','Allow'));Set-Acl -LiteralPath $temporary -AclObject $acl
 if(Test-Path -LiteralPath $configFile){[IO.File]::Replace($temporary,$configFile,(Join-Path $backup 'atomic-config.json'))}else{[IO.File]::Move($temporary,$configFile)}
 $changed=$true
 $newGuard=Join-Path $release 'deployment\server20\Verify-AndroidCompatibility.ps1';$temporaryGuard=$guard+'.'+$plan.id+'.tmp';[IO.File]::Copy($newGuard,$temporaryGuard,$false);Set-Acl -LiteralPath $temporaryGuard -AclObject (Get-Acl -LiteralPath $guard);[IO.File]::Replace($temporaryGuard,$guard,(Join-Path $backup 'atomic-guard.ps1'))
 Stop-ScheduledTask -TaskName $plan.controlTask;$deadline=[DateTimeOffset]::UtcNow.AddSeconds(30)
 while((Get-ScheduledTask -TaskName $plan.controlTask).State -ceq 'Running'){if([DateTimeOffset]::UtcNow -gt $deadline){throw 'Private preview stop deadline'};Start-Sleep -Milliseconds 250}
 Start-ScheduledTask -TaskName $plan.controlTask
 $healthy=$false;$deadline=[DateTimeOffset]::UtcNow.AddSeconds(60)
 while([DateTimeOffset]::UtcNow -lt $deadline){try{$health=Invoke-WebRequest -UseBasicParsing -Uri ($runtime.FREVOS_PUBLIC_ORIGIN+'/health') -TimeoutSec 5;if($health.StatusCode -eq 200 -and ($health.Content|ConvertFrom-Json).status -ceq 'ok'){$healthy=$true;break}}catch{};Start-Sleep -Milliseconds 500}
 if(-not $healthy){throw 'Private preview health check failed'}
 if((Hash $runtimeFile) -cne $runtimeHash -or (Get-Content -LiteralPath $activeFile -Raw|ConvertFrom-Json).manifestSha256 -cne $plan.manifestSha256 -or (Export-ScheduledTask -TaskName $plan.controlTask) -cne $taskXml -or (Get-Acl -LiteralPath $root).Sddl -cne $rootAcl -or (Hash $guard) -cne (Hash $newGuard)){throw 'Private preview preservation check failed'}
 $result=@{status='PASS';action=$plan.action;id=$plan.id;manifestSha256=$plan.manifestSha256;workspaceId=$plan.workspaceId;origins=@($normalized.targets.origin);configSha256=(Hash $configFile);compatibilityGuardUpdated=$true;runtimeValuesPreserved=$true;taskDefinitionPreserved=$true;parentPermissionsPreserved=$true;databaseWritten=$false;firewallChanged=$false;dnsChanged=$false;httpHealth=200}
 [IO.File]::WriteAllText((Join-Path $backup 'result.json'),($result|ConvertTo-Json -Depth 7 -Compress),[Text.UTF8Encoding]::new($false));$result|ConvertTo-Json -Depth 7 -Compress
}catch{
 if($changed){Stop-ScheduledTask -TaskName $plan.controlTask;if($null -ne $plan.configBeforeSha256){[IO.File]::Copy((Join-Path $backup 'config.before.json'),$configFile,$true)}else{if([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($configFile)) -cne $configDirectory){throw 'Private preview recovery scope differs'};Remove-Item -LiteralPath $configFile -Force};[IO.File]::Copy((Join-Path $backup 'guard.before.ps1'),$guard,$true);Start-ScheduledTask -TaskName $plan.controlTask}
 [IO.File]::WriteAllText((Join-Path $backup 'recovery.json'),'{"status":"RESTORED"}',[Text.UTF8Encoding]::new($false));throw 'Private preview configuration failed; previous configuration restored; inspect scoped receipt'
}finally{$runtime=$null}
