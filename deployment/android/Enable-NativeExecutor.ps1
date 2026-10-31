param([Parameter(Mandatory=$true)][string]$PlanReference,[switch]$PlanOnly)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.Security
$stage='scope';$clearBytes=$null;$newBytes=$null;$config=$null;$stopped=$false;$backup=$null;$canRecord=$false
function Hash([string]$File){(Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant()}
function Plain([string]$File){for($cursor=[IO.Path]::GetFullPath($File);;$cursor=[IO.Path]::GetDirectoryName($cursor)){if([IO.File]::GetAttributes($cursor) -band [IO.FileAttributes]::ReparsePoint){throw 'Linked native enrollment path'};if($cursor -ceq [IO.Path]::GetPathRoot($cursor)){break}}}
function Serialize($Value){ConvertTo-Json -InputObject $Value -Depth 20 -Compress}
function Record($Value){if($canRecord){[IO.File]::WriteAllText((Join-Path ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($PlanReference))) 'native-enrollment-result.json'),(Serialize $Value),[Text.UTF8Encoding]::new($false))}}
try{
 $plan=Get-Content -LiteralPath $PlanReference -Raw|ConvertFrom-Json;$now=[DateTimeOffset]::UtcNow
 $executionSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
 if($plan.version -ne 1 -or $plan.action -cne 'native-executor:enable-android:v1' -or $plan.id -cnotmatch '^ae_[a-f0-9]{32}$' -or $plan.executorId -cnotmatch '^ex_[a-f0-9]{32}$' -or $plan.role -cnotin @('builder','destination') -or $plan.executionSid -cne $executionSid -or $plan.actorSid -cnotmatch '^S-1-' -or $plan.workspaceId -cnotmatch '^ws_[a-z0-9_-]+$' -or $plan.repositoryId -cnotmatch '^gitrepo_[a-f0-9]{32}$' -or $plan.ownerReference.Length -lt 10 -or ([DateTimeOffset]$plan.issuedAt) -gt $now -or ([DateTimeOffset]$plan.expiresAt) -le $now -or (([DateTimeOffset]$plan.expiresAt)-([DateTimeOffset]$plan.issuedAt)).TotalMinutes -gt 10){throw 'Native Android enrollment scope denied'}
 Plain $PlanReference
 if([IO.Path]::GetFileName($PlanReference) -cne 'plan.json' -or [IO.Path]::GetFileName([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($PlanReference))) -cnotin @(('native-'+$plan.id),('native-android-'+$plan.id))){throw 'Native intent directory differs'}
 $canRecord=$true
 $parent=if($plan.role -ceq 'builder'){Join-Path $env:LOCALAPPDATA 'DevSetu\Executors'}else{Join-Path $env:ProgramData 'DevSetu\Executors'}
 $install=Join-Path $parent $plan.executorId
 if([IO.Path]::GetFullPath($plan.installationRoot) -cne $install -or ($plan.role -ceq 'builder' -and $plan.actorSid -cne $executionSid) -or ($plan.role -ceq 'destination' -and $executionSid -cne 'S-1-5-18')){throw 'Native enrollment execution boundary differs'}
 Plain $install
 $scopeName=if($plan.role -ceq 'builder'){'CurrentUser'}else{'LocalMachine'}
 if([IO.File]::ReadAllText((Join-Path $install 'executor-scope.txt')) -cne $scopeName){throw 'Native credential protection scope differs'}
 $scope=[Enum]::Parse([Security.Cryptography.DataProtectionScope],$scopeName)
 $configPath=Join-Path $install 'executor.dpapi';$cipher=[IO.File]::ReadAllBytes($configPath)
 if((Hash $configPath) -cne $plan.configurationSha256){throw 'Native enrollment changed'}
 $clearBytes=[Security.Cryptography.ProtectedData]::Unprotect($cipher,$null,$scope)
 $config=[Text.Encoding]::UTF8.GetString($clearBytes)|ConvertFrom-Json
 $module=Join-Path $install 'NativePlatform.cjs'
 if($config.id -cne $plan.executorId -or $config.role -cne $plan.role -or $config.profileId -cne $plan.profileId -or $config.bindings.Count -ne 1 -or $config.bindings[0].nativeAdapter.file -cne $module -or $config.bindings[0].nativeAdapter.sha256 -cne (Hash $module)){throw 'Native adapter identity differs'}
 $allowed=if($plan.role -ceq 'builder'){@('NativePlatform.cjs','AndroidBuildClient.cjs','Verify-AndroidCompatibility.ps1','New-ServixDashboardRelease.ps1','HttpCommon.ps1')}else{@('NativePlatform.cjs','Verify-AndroidCompatibility.ps1')}
 if($plan.files.Count -ne $allowed.Count -or @($plan.files.name|Sort-Object -Unique).Count -ne $allowed.Count){throw 'Complete unique native operator inventory required'}
 foreach($file in $plan.files){
  if($file.name -cnotin $allowed -or $file.sha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'Native operator file denied'}
  Plain $file.source;if((Hash $file.source) -cne $file.sha256){throw 'Reviewed native source changed'}
  $target=Join-Path $install $file.name
  if(Test-Path -LiteralPath $target){Plain $target;if((Hash $target) -cne $file.beforeSha256){throw 'Native operator baseline differs'}}elseif($null -ne $file.beforeSha256){throw 'Native operator baseline missing'}
 }
 $taskName='DevSetu-Executor-'+$plan.executorId;$task=Get-ScheduledTask -TaskName $taskName
 $arguments='-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File "'+(Join-Path $install 'Run-Executor.ps1')+'"'
 $principal=$task.Principal.UserId;if($principal -notmatch '^S-1-'){$principal=([Security.Principal.NTAccount]::new($principal)).Translate([Security.Principal.SecurityIdentifier]).Value}
 if($task.Actions.Count -ne 1 -or $task.Actions[0].Execute -ine (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe') -or $task.Actions[0].Arguments -cne $arguments -or $principal -cne $executionSid -or ($plan.role -ceq 'builder' -and $task.Principal.RunLevel -cne 'Limited')){throw 'Native task identity differs'}
 $taskXml=Export-ScheduledTask -TaskName $taskName;$rootAcl=(Get-Acl -LiteralPath $install).Sddl
 $binding=$config.bindings[0]
 $platformRoot=if($plan.role -ceq 'builder'){$binding.nativeOptions.baselineRoot}else{$binding.nativeOptions.installationRoot}
 if((Get-Content -LiteralPath (Join-Path $platformRoot 'state\active.json') -Raw|ConvertFrom-Json).manifestSha256 -cne $plan.expectedActiveManifest){throw 'Active platform changed'}
 foreach($jobFile in Get-ChildItem -LiteralPath (Join-Path $platformRoot 'servix\jobs\components') -Filter 'job-cj_*.json'){$job=Get-Content -LiteralPath $jobFile.FullName -Raw|ConvertFrom-Json;if($job.executorId -ceq $plan.executorId -and $job.status -cnotin @('succeeded','failed')){throw 'Native executor has unresolved work'}}
 $beforeJson=Serialize $config;$changed=$beforeJson|ConvertFrom-Json
 $changed.bindings[0].nativeAdapter.sha256=($plan.files|Where-Object name -CEQ 'NativePlatform.cjs').sha256
 if($plan.role -ceq 'builder'){
  $reference=$plan.androidBuilder
  if($reference.version -ne 1 -or $reference.workspaceId -cne $plan.workspaceId -or $reference.profileId -cne $plan.profileId -or $reference.repositoryId -cne $plan.repositoryId -or $reference.certificateSha256 -cnotmatch '^[a-f0-9]{64}$' -or $reference.configurationSha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'Signed SDK enrollment differs'}
  Plain $reference.root
  $health=Get-Content -LiteralPath (Join-Path $reference.root 'results\service-health.json') -Raw|ConvertFrom-Json
  if($health.status -cne 'READY' -or $health.configSha256 -cne $reference.configurationSha256 -or ([DateTimeOffset]::UtcNow-([DateTimeOffset]$health.at)).TotalSeconds -gt 15 -or (Hash (Join-Path $reference.root 'bin\service-config.json')) -cne $reference.configurationSha256){throw 'Signed SDK worker is not freshly ready'}
  $referencePath=Join-Path $install 'android-builder.json'
  if(Test-Path -LiteralPath $referencePath){throw 'Existing Android enrollment requires a separate reviewed update'}
  $changed.bindings[0].nativeOptions|Add-Member -NotePropertyName androidBuilderReference -NotePropertyValue $referencePath
  $changed.bindings[0].nativeOptions|Add-Member -NotePropertyName androidBuilderClientSha256 -NotePropertyValue ($plan.files|Where-Object name -CEQ 'AndroidBuildClient.cjs').sha256
 }
 $normalized=(Serialize $changed)|ConvertFrom-Json;$normalized.bindings[0].nativeAdapter.sha256=$binding.nativeAdapter.sha256
 if($plan.role -ceq 'builder'){$normalized.bindings[0].nativeOptions.PSObject.Properties.Remove('androidBuilderReference');$normalized.bindings[0].nativeOptions.PSObject.Properties.Remove('androidBuilderClientSha256')}
 if((Serialize $normalized) -cne $beforeJson){throw 'Unrelated enrollment value changed'}
 $validation=[Diagnostics.ProcessStartInfo]::new();$validation.FileName=Join-Path $install 'node.exe';$validation.Arguments='"'+(Join-Path $install 'ComponentExecutor.cjs')+'" --validate';$validation.UseShellExecute=$false;$validation.CreateNoWindow=$true;$validation.RedirectStandardInput=$true;$validation.RedirectStandardOutput=$true;$validation.RedirectStandardError=$true
 $validator=[Diagnostics.Process]::new();$validator.StartInfo=$validation
 try{[void]$validator.Start();$out=$validator.StandardOutput.ReadToEndAsync();$err=$validator.StandardError.ReadToEndAsync();$validator.StandardInput.Write((Serialize $changed));$validator.StandardInput.Close();if(-not $validator.WaitForExit(15000)){$validator.Kill();throw 'Native enrollment validation deadline'};[void]$out.Result;[void]$err.Result;if($validator.ExitCode -ne 0){throw 'Native executor rejects proposed enrollment'}}finally{$validator.Dispose()}
 if($PlanOnly){@{version=1;status='READY';action=$plan.action;id=$plan.id;executorId=$plan.executorId;role=$plan.role;credentialValuePreserved=$true;taskUnchanged=$true;files=$allowed}|ConvertTo-Json -Compress;return}
 $stage='retain-enrollment';$backup=Join-Path $install ('.local\android-enrollment-'+$plan.id)
 if(([DateTimeOffset]$plan.expiresAt) -le [DateTimeOffset]::UtcNow){throw 'Native enrollment approval expired before consumption'}
 if(Test-Path -LiteralPath $backup){throw 'Native Android enrollment intent was already consumed'}
 [void][IO.Directory]::CreateDirectory($backup)
 [IO.File]::WriteAllBytes((Join-Path $backup 'executor.before.dpapi'),$cipher)
 foreach($file in $plan.files){$target=Join-Path $install $file.name;if(Test-Path -LiteralPath $target){[IO.File]::Copy($target,(Join-Path $backup $file.name),$false)}}
 [IO.File]::WriteAllText((Join-Path $backup 'intent.json'),(Serialize $plan),[Text.UTF8Encoding]::new($false))
 $stage='stop-owned-executor';Stop-ScheduledTask -TaskName $taskName;$stopped=$true
 $deadline=[DateTimeOffset]::UtcNow.AddSeconds(30)
 while((Get-ScheduledTask -TaskName $taskName).State -ceq 'Running'){if([DateTimeOffset]::UtcNow -ge $deadline){throw 'Native executor did not stop'};Start-Sleep -Milliseconds 250}
 if((Hash $configPath) -cne $plan.configurationSha256 -or (Export-ScheduledTask -TaskName $taskName) -cne $taskXml){throw 'Native enrollment changed during maintenance'}
 $stage='install-reviewed-files'
 foreach($file in $plan.files){$target=Join-Path $install $file.name;$temporary=$target+'.'+$plan.id+'.tmp';[IO.File]::Copy($file.source,$temporary,$false);if(Test-Path -LiteralPath $target){Set-Acl -LiteralPath $temporary -AclObject (Get-Acl -LiteralPath $target);[IO.File]::Replace($temporary,$target,(Join-Path $backup ('atomic-'+$file.name)))}else{[IO.File]::Move($temporary,$target)};if((Hash $target) -cne $file.sha256){throw 'Native operator replacement differs'}}
 if($plan.role -ceq 'builder'){[IO.File]::WriteAllText($referencePath,(Serialize $reference),[Text.UTF8Encoding]::new($false))}
 $newBytes=[Text.UTF8Encoding]::new($false).GetBytes((Serialize $changed))
 $newCipher=[Security.Cryptography.ProtectedData]::Protect($newBytes,$null,$scope)
 [IO.File]::WriteAllBytes($configPath,$newCipher)
 $check=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($configPath),$null,$scope)
 try{if([Text.Encoding]::UTF8.GetString($check) -cne [Text.Encoding]::UTF8.GetString($newBytes)){throw 'Native encrypted enrollment round trip differs'}}finally{[Array]::Clear($check,0,$check.Length)}
 if((Get-Acl -LiteralPath $install).Sddl -cne $rootAcl -or (Export-ScheduledTask -TaskName $taskName) -cne $taskXml){throw 'Native task or permissions changed'}
 Start-ScheduledTask -TaskName $taskName;$stopped=$false
 $receipt=@{version=1;status='PASS';action=$plan.action;id=$plan.id;executorId=$plan.executorId;role=$plan.role;workspaceId=$plan.workspaceId;repositoryId=$plan.repositoryId;credentialValueAndScopePreserved=$true;taskUnchanged=$true;permissionsUnchanged=$true;encryptedBeforeRetained=$true;at=[DateTimeOffset]::UtcNow.ToString('o')}
 [IO.File]::WriteAllText((Join-Path $backup 'result.json'),(Serialize $receipt),[Text.UTF8Encoding]::new($false));Record $receipt;$receipt|ConvertTo-Json -Compress
}catch{
 $failure=@{version=1;status='FAIL';stage=$stage;type=$_.Exception.GetType().Name;line=$_.InvocationInfo.ScriptLineNumber;innerType=$(if($_.Exception.InnerException){$_.Exception.InnerException.GetType().Name}else{$null});hresult=$_.Exception.HResult}
 if($stopped -and $backup -and (Export-ScheduledTask -TaskName $taskName) -ceq $taskXml){
  foreach($file in $plan.files){$old=Join-Path $backup $file.name;if(Test-Path -LiteralPath $old){if((Hash $old) -cne $file.beforeSha256){throw 'Retained native enrollment needs operator review'};[IO.File]::Copy($old,(Join-Path $install $file.name),$true)}}
  [IO.File]::WriteAllBytes($configPath,$cipher);Start-ScheduledTask -TaskName $taskName
 }
 Record $failure;$failure|ConvertTo-Json -Compress
 throw 'Native Android enrollment failed; inspect sanitized stage and retained encrypted before-state'
}finally{
 if($clearBytes){[Array]::Clear($clearBytes,0,$clearBytes.Length)}
 if($newBytes){[Array]::Clear($newBytes,0,$newBytes.Length)}
 $config=$null;$changed=$null;$normalized=$null;$beforeJson=$null
}
