param([Parameter(Mandatory=$true)][ValidateSet('Observe','Activate')][string]$Action,[Parameter(Mandatory=$true)][string]$ContextFile,[pscredential]$RuntimeCredential)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
function Digest([string]$File){return (Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant()}
function Save-New([string]$File,$Value){$bytes=[Text.UTF8Encoding]::new($false).GetBytes(($Value|ConvertTo-Json -Depth 30 -Compress));$stream=[IO.File]::Open($File,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}}
function Hash-Text([string]$Text){$h=[Security.Cryptography.SHA256]::Create();try{return ([BitConverter]::ToString($h.ComputeHash([Text.Encoding]::UTF8.GetBytes($Text)))).Replace('-','').ToLowerInvariant()}finally{$h.Dispose()}}
function Port-Process {
 $listeners=@(Get-NetTCPConnection -State Listen -LocalPort $target.port -ErrorAction SilentlyContinue|Select-Object -ExpandProperty OwningProcess -Unique)
 if($listeners.Count -ne 1){throw 'Exactly one reviewed listener required'}
 $p=Get-CimInstance Win32_Process -Filter ('ProcessId='+$listeners[0]);$owner=Invoke-CimMethod -InputObject $p -MethodName GetOwnerSid
 if($owner.ReturnValue -ne 0){throw 'Runtime executable/owner unavailable'}
 $executable=Run-Files 'resolve-node' ([string]$p.ExecutablePath)
 if($executable.executable -ine $target.node){throw 'Runtime executable differs from the configured canonical toolchain'}
 return @{pid=[int]$p.ProcessId;created=$p.CreationDate.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ');ownerSid=[string]$owner.Sid;commandSha256=(Hash-Text ([string]$p.CommandLine));command=[string]$p.CommandLine}
}
function Healthy {
 $v=Invoke-RestMethod -Uri $target.healthUrl -TimeoutSec 5
 if($v.status -cne 'OK' -or -not $v.authBootstrapReady -or -not $v.fullBootstrapReady){throw 'Application readiness unavailable'}
}
function Run-Files([string]$Operation,[string]$ObservedNode=''){
 $arguments=@((Join-Path $PSScriptRoot 'PromotionFiles.cjs'),$Operation,$ContextFile)
 if($Operation -ceq 'resolve-node'){$arguments+=$ObservedNode}
 if($Operation -like 'frontend-*'){$arguments+=$runtime.frontendPlanSha256}
 $out=& $target.node @arguments 2>$null
 if($LASTEXITCODE -ne 0){throw 'Target files did not verify'}
 return (($out -join '')|ConvertFrom-Json)
}
function Task-OwnerSid([string]$Value){
 if($Value -cmatch '^S-1-5-(?:[0-9]+-)*[0-9]+$'){return [Security.Principal.SecurityIdentifier]::new($Value).Value}
 if([string]::Equals($Value,$identity.Name,[StringComparison]::OrdinalIgnoreCase)){return $identity.User.Value}
 return ([Security.Principal.NTAccount]::new($Value)).Translate([Security.Principal.SecurityIdentifier]).Value
}
function Task-Owned {
 $t=Get-ScheduledTask -TaskName $target.taskName -ErrorAction Stop
 $sid=Task-OwnerSid ([string]$t.Principal.UserId)
 $taskXml=[xml](Export-ScheduledTask -TaskName $target.taskName);$taskXml.XmlResolver=$null
 if($sid -cne $context.ownerSid -or $t.Actions.Count -ne 1 -or $t.Actions[0].Execute -ine $powershell -or $t.Actions[0].Arguments -cne $taskArguments -or $t.Actions[0].WorkingDirectory -ine (Join-Path $target.root 'backend') -or [string]$taskXml.Task.Principals.Principal.RunLevel -cne 'LeastPrivilege' -or [string]$taskXml.Task.Principals.Principal.LogonType -cne 'Password' -or [string]$taskXml.Task.Triggers.BootTrigger.Enabled -cne 'true' -or [string]$taskXml.Task.Triggers.BootTrigger.Delay -cne 'PT30S'){throw 'Managed task ownership changed'}
 return $t
}
function Wait-Ready {
 $until=[DateTime]::UtcNow.AddSeconds(90)
 do{try{Healthy;return}catch{if([DateTime]::UtcNow -gt $until){throw 'Application did not become ready'};Start-Sleep -Seconds 2}}while($true)
}
function Wait-Free {
 $until=[DateTime]::UtcNow.AddSeconds(20)
 while(Get-NetTCPConnection -State Listen -LocalPort $target.port -ErrorAction SilentlyContinue){if([DateTime]::UtcNow -gt $until){throw 'Reviewed port was not released'};Start-Sleep -Milliseconds 250}
}
function Assert-ManagedListener($Expected=$runtime) {
 $running=Port-Process;$entry=Join-Path $Expected.runtime 'ProductionBackendRuntime.cjs'
 $args=[regex]::Match($running.command.Trim(),'^(?:"[^"]+"|\S+)\s+(?:"([^"]+)"|(\S+))\s+([a-f0-9]{64})$')
 $observedEntry=if($args.Groups[1].Success){$args.Groups[1].Value}else{$args.Groups[2].Value}
 if($running.ownerSid -cne $context.ownerSid -or -not $args.Success -or $observedEntry -ine $entry -or $args.Groups[3].Value -cne $Expected.configurationSha256){throw 'Ready listener is not the reviewed managed runtime'}
 return @{pid=$running.pid;createdAt=$running.created;ownerSid=$running.ownerSid;commandSha256=$running.commandSha256}
}
function Read-ManagedTask($Process,[string]$Phase){
 $t=Get-ScheduledTask -TaskName $target.taskName -ErrorAction Stop
 $xml=Export-ScheduledTask -TaskName $target.taskName
 $document=[xml]$xml;$document.XmlResolver=$null
 $sid=Task-OwnerSid ([string]$t.Principal.UserId)
 $candidate=@{arguments=[string]$t.Actions[0].Arguments;execute=[string]$t.Actions[0].Execute;expectedPowerShell=$powershell;actions=@($t.Actions).Count;workingDirectory=[string]$t.Actions[0].WorkingDirectory;ownerSid=$sid;process=$Process;taskXml=[string]$xml;leastPrivilege=([string]$document.Task.Principals.Principal.RunLevel -ceq 'LeastPrivilege');passwordLogon=([string]$document.Task.Principals.Principal.LogonType -ceq 'Password');bootStart=([bool]$document.Task.Triggers.BootTrigger -and [string]$document.Task.Triggers.BootTrigger.Enabled -ceq 'true' -and [string]$document.Task.Triggers.BootTrigger.Delay -ceq 'PT30S')}
 $file=Join-Path $PSScriptRoot ('managed-'+$Phase+'.json');Save-New $file $candidate
 $out=& $target.node (Join-Path $PSScriptRoot 'ManagedRuntime.cjs') $ContextFile $file 2>$null
 if($LASTEXITCODE -ne 0){throw 'Existing task does not match successful controller evidence'}
 return (($out -join '')|ConvertFrom-Json)
}
function Restore-ReviewedTask {
 $secret=$RuntimeCredential.GetNetworkCredential().Password
 try{[void]$folder.RegisterTask($target.taskName,[string]$context.observation.managed.taskXml,4,$RuntimeCredential.UserName,$secret,1,$null)}finally{$secret=$null}
}
function Verify-RecoveredFrontend {
 if($frontendAttempted){
  $verification=& $target.node (Join-Path $PSScriptRoot 'PublishedRelease.cjs') --recover $ContextFile $runtime.frontendPlanSha256 2>$null
  if($LASTEXITCODE -ne 0){throw 'Recovered public frontend did not verify'}
 }
}
$context=Get-Content -LiteralPath $ContextFile -Raw|ConvertFrom-Json;$target=$context.target
$powershell=Join-Path $env:windir 'System32\WindowsPowerShell\v1.0\powershell.exe'
if($env:COMPUTERNAME -cne $target.computer -or $context.id -cnotmatch '^pm_[a-f0-9]{32}$' -or [IO.Path]::GetFullPath($PSScriptRoot) -ine [IO.Path]::GetFullPath($context.staging)){throw 'Target observation scope differs'}
foreach($entry in $context.operatorHashes.PSObject.Properties){if($entry.Name -cnotmatch '^[A-Za-z0-9.-]+$' -or (Digest (Join-Path $PSScriptRoot $entry.Name)) -cne $entry.Value){throw 'Target operator changed'}}
Import-Module (Join-Path $PSScriptRoot 'BatchLogon.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'BackendArtifactSelection.psm1') -Force
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
if($Action -ceq 'Observe'){
 $process=Port-Process
 if($identity.User.Value -cne $process.ownerSid){throw 'Same runtime owner required'}
 $managed=$null;$existingTask=Get-ScheduledTask -TaskName $target.taskName -ErrorAction SilentlyContinue
 if($existingTask){$managed=Read-ManagedTask $process 'prepare'}
 else{
  if($process.command -notmatch '(?:^|\s|\")src[\\/]index\.js(?:\s|$|\")'){throw 'Same-owner manual source runtime required for initial adoption'}
  if((Get-BackendSelectionSnapshot $target.root).exists){throw 'Unowned backend selection requires separate adoption'}
 }
 Healthy
 $nodeVersion=(& $target.node --version|Out-String).Trim();if($nodeVersion -cne $target.nodeVersion){throw 'Node version changed'}
 $batch=Get-CurrentBatchLogon
 if($batch.denied){throw 'Batch-logon deny right requires operator review'}
 $files=Run-Files inspect
 $observation=@{version=1;process=@{pid=$process.pid;created=$process.created;ownerSid=$process.ownerSid;commandSha256=$process.commandSha256};owner=$identity.Name;nodeVersion=$nodeVersion;batchLogonReady=$batch.ready;taskAlreadyExists=[bool]$existingTask;files=$files}
 if($managed){$observation.managed=$managed}
 Save-New (Join-Path $PSScriptRoot 'observation.json') $observation
 return $observation
}
$isManaged=[bool]$context.observation.PSObject.Properties['managed']
$changedSelection=$null;$taskRegistered=$false;$taskRegistrationStarted=$false;$manualStopped=$false;$runtime=$null;$probeName=$null;$batchAssigned=$false;$frontendAttempted=$false;$result=@{status='recovery-required';healthVerified=$false;protectedFilesVerified=0}
try{
 if($null -eq $RuntimeCredential -or $identity.User.Value -cne $context.ownerSid){throw 'Runtime credential identity differs'}
 $process=Port-Process
 foreach($key in @('pid','created','ownerSid','commandSha256')){if($process[$key] -cne $context.observation.process.$key){throw 'Reviewed manual runtime changed'}}
 Healthy
 [void](Run-Files check)
 $batch=Get-CurrentBatchLogon
 if($batch.denied -or (-not $batch.ready -and -not $context.allowBatchLogon)){throw 'Batch-logon approval missing or deny right present'}
 if($isManaged){$prior=Read-ManagedTask $process 'activation';if($prior.taskXmlSha256 -cne $context.observation.managed.taskXmlSha256 -or $prior.id -cne $context.observation.managed.id){throw 'Reviewed managed task changed'}}
 elseif(Get-ScheduledTask -TaskName $target.taskName -ErrorAction SilentlyContinue){throw 'Runtime task collision'}
 $runtime=Run-Files stage
 $batchChange=Grant-CurrentBatchLogon $context.ownerSid ([bool]$context.allowBatchLogon);$batchAssigned=$batchChange.assigned
 $powershell=Join-Path $env:windir 'System32\WindowsPowerShell\v1.0\powershell.exe'
 $taskArguments='-NoProfile -NonInteractive -WindowStyle Hidden -File "'+(Join-Path $runtime.runtime 'Run-SavedBackend.ps1')+'" -ConfigurationSha256 '+$runtime.configurationSha256
 $escape={param([string]$v)[Security.SecurityElement]::Escape($v)}
 $ownerXml=& $escape $context.ownerSid;$exeXml=& $escape $powershell;$argsXml=& $escape $taskArguments;$workXml=& $escape (Join-Path $target.root 'backend')
 $prefix='<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"><RegistrationInfo><Description>DevSetu reviewed promotion '+$context.id+'</Description></RegistrationInfo>'
 $principal='<Principals><Principal id="ExistingOwner"><UserId>'+$ownerXml+'</UserId><LogonType>Password</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>'
 $settings='<Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><StartWhenAvailable>true</StartWhenAvailable><Enabled>true</Enabled><Hidden>true</Hidden><ExecutionTimeLimit>PT0S</ExecutionTimeLimit><RestartOnFailure><Interval>PT1M</Interval><Count>3</Count></RestartOnFailure></Settings>'
 $xml=$prefix+'<Triggers><BootTrigger><Enabled>true</Enabled><Delay>PT30S</Delay></BootTrigger></Triggers>'+$principal+$settings+'<Actions Context="ExistingOwner"><Exec><Command>'+$exeXml+'</Command><Arguments>'+$argsXml+'</Arguments><WorkingDirectory>'+$workXml+'</WorkingDirectory></Exec></Actions></Task>'
 $before=Get-BackendSelectionSnapshot $target.root
 Save-New (Join-Path $runtime.runtime 'cutover-before.json') @{process=$context.observation.process;selection=$before;taskName=$target.taskName;configurationSha256=$runtime.configurationSha256;managed=$isManaged;previous=if($isManaged){$context.observation.managed}else{$null}}
 # COM registration avoids PowerShell parameter-binding logs containing a password.
 $scheduler=New-Object -ComObject 'Schedule.Service';$scheduler.Connect();$folder=$scheduler.GetFolder('\')
 $password=$RuntimeCredential.GetNetworkCredential().Password
 try{
  $probeName=$target.taskName+'-Check-'+$context.id.Substring(3,8)
  $marker=Join-Path $runtime.runtime 'owner-check.json'
  $probeScript=Join-Path $runtime.runtime 'Check-Owner.ps1'
  $probeText='$ErrorActionPreference=''Stop'';$value=@{ownerSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;computer=$env:COMPUTERNAME};[IO.File]::WriteAllText((Join-Path $PSScriptRoot ''owner-check.json''),($value|ConvertTo-Json),[Text.UTF8Encoding]::new($false))'
  [IO.File]::WriteAllText($probeScript,$probeText,[Text.UTF8Encoding]::new($false))
  $probeArguments=& $escape ('-NoProfile -NonInteractive -WindowStyle Hidden -File "'+$probeScript+'"')
  $probeXml=$prefix+$principal+$settings+'<Actions Context="ExistingOwner"><Exec><Command>'+$exeXml+'</Command><Arguments>'+$probeArguments+'</Arguments><WorkingDirectory>'+$workXml+'</WorkingDirectory></Exec></Actions></Task>'
  [void]$folder.RegisterTask($probeName,$probeXml,2,$RuntimeCredential.UserName,$password,1,$null)
  $probe=$folder.GetTask($probeName);[void]$probe.Run($null)
  $until=[DateTime]::UtcNow.AddSeconds(40)
  while(-not(Test-Path -LiteralPath $marker)){if([DateTime]::UtcNow -gt $until){throw 'Same-owner task logon probe failed'};Start-Sleep -Milliseconds 250}
  $checked=Get-Content -LiteralPath $marker -Raw|ConvertFrom-Json
  if($checked.ownerSid -cne $context.ownerSid -or $checked.computer -cne $target.computer){throw 'Same-owner task logon probe differs'}
  if($probe.State -in @(2,4)){$probe.Stop(0)};$folder.DeleteTask($probeName,0);$probeName=$null
  $registrationMode=if($isManaged){4}else{2}
  $taskRegistrationStarted=$true
  [void]$folder.RegisterTask($target.taskName,$xml,$registrationMode,$RuntimeCredential.UserName,$password,1,$null);$taskRegistered=$true
 }finally{$password=$null}
 [void](Task-Owned)
 $selectionNow=Get-BackendSelectionSnapshot $target.root
 if($selectionNow.sha256 -cne $before.sha256 -or $selectionNow.exists -ne $before.exists){throw 'Backend selection changed before cutover'}
 if(-not $isManaged -and $before.exists){throw 'Backend selection changed before first adoption'}
 $process=Port-Process
 foreach($key in @('pid','created','ownerSid','commandSha256')){if($process[$key] -cne $context.observation.process.$key){throw 'Manual process changed before cutover'}}
 [void](Run-Files check)
 $manualStopped=$true
 if($isManaged){Stop-ScheduledTask -TaskName $target.taskName}else{Stop-Process -Id $process.pid -ErrorAction Stop}
 Wait-Free
 $selection=[pscustomobject]@{version=1;mode='bundle';descriptor=$context.descriptor;manifestSha256=$context.descriptorSha256}
 $changedSelection=Set-BackendArtifactSelection $target.root $selection $before (Join-Path $runtime.runtime 'selection-before')
 Start-ScheduledTask -TaskName $target.taskName
 Wait-Ready
 $managed=Assert-ManagedListener
 $frontend=$null
 if($runtime.PSObject.Properties['frontendPlanSha256']){$frontendAttempted=$true;$frontend=Run-Files 'frontend-apply'}
 if($frontend){
  $published=& $target.node (Join-Path $PSScriptRoot 'PublishedRelease.cjs') $ContextFile $runtime.frontendPlanSha256 2>$null
  if($LASTEXITCODE -ne 0){throw 'Published frontend does not match the tested release'}
 }
 $proof=Run-Files check
 Save-New (Join-Path $runtime.runtime 'activation-receipt.json') @{version=1;id=$context.id;status='succeeded';configurationSha256=$runtime.configurationSha256;selection=$changedSelection;files=$proof.verified;process=$managed;databaseRestored=$false;frontend=$frontend}
 $result=@{status='succeeded';healthVerified=$true;protectedFilesVerified=$proof.verified;configurationSha256=$runtime.configurationSha256;runtime=$runtime.runtime;launcherArguments=$taskArguments}
 if($frontend){$result.frontendDigest=$frontend.sha256;$result.frontendVerified=$true}
}catch{
 $registrationUncertain=$false
 if($taskRegistrationStarted -and -not $taskRegistered){
  try{[void](Task-Owned);$taskRegistered=$true}catch{
   if($isManaged){try{if((Hash-Text ([string](Export-ScheduledTask -TaskName $target.taskName))) -cne $context.observation.managed.taskXmlSha256){$registrationUncertain=$true}}catch{$registrationUncertain=$true}}
   elseif(Get-ScheduledTask -TaskName $target.taskName -ErrorAction SilentlyContinue){$registrationUncertain=$true}
  }
 }
 if($registrationUncertain){$result=@{status='recovery-required';healthVerified=$false;protectedFilesVerified=0;databaseRestored=$false}}
 elseif($isManaged -and $taskRegistered -and $runtime){
  try{
   [void](Task-Owned)
   if($manualStopped){
    Stop-ScheduledTask -TaskName $target.taskName
    $listeners=@(Get-NetTCPConnection -State Listen -LocalPort $target.port -ErrorAction SilentlyContinue)
    if($listeners.Count){$owned=Port-Process;$entry=Join-Path $runtime.runtime 'ProductionBackendRuntime.cjs';if($owned.ownerSid -cne $context.ownerSid -or -not $owned.command.Contains($entry) -or -not $owned.command.Contains($runtime.configurationSha256)){throw 'Recovery listener is not the new managed runtime'};Stop-Process -Id $owned.pid -ErrorAction Stop}
    Wait-Free
    if($frontendAttempted){[void](Run-Files 'frontend-recover')}
    if($changedSelection){[void](Restore-BackendArtifactSelection $target.root $changedSelection (Join-Path $runtime.runtime 'selection-recovery'))}
   }
   Restore-ReviewedTask
   if($manualStopped){Start-ScheduledTask -TaskName $target.taskName}
   Wait-Ready;[void](Assert-ManagedListener $context.observation.managed);$proof=Run-Files check
   Verify-RecoveredFrontend
   $result=@{status='recovered';healthVerified=$true;protectedFilesVerified=$proof.verified;databaseRestored=$false;runtimeTaskRegistered=$true}
  }catch{$result=@{status='recovery-required';healthVerified=$false;protectedFilesVerified=0;databaseRestored=$false}}
 }elseif($manualStopped -and $taskRegistered -and $runtime){
  try{
   [void](Task-Owned);Stop-ScheduledTask -TaskName $target.taskName
   $listeners=@(Get-NetTCPConnection -State Listen -LocalPort $target.port -ErrorAction SilentlyContinue)
   if($listeners.Count){$owned=Port-Process;$expectedEntry=Join-Path $runtime.runtime 'ProductionBackendRuntime.cjs';if($owned.ownerSid -cne $context.ownerSid -or -not $owned.command.Contains($expectedEntry) -or -not $owned.command.Contains($runtime.configurationSha256)){throw 'Recovery listener is not owned'};Stop-Process -Id $owned.pid -ErrorAction Stop}
   Wait-Free
   if($frontendAttempted){[void](Run-Files 'frontend-recover')}
   if($changedSelection){[void](Restore-BackendArtifactSelection $target.root $changedSelection (Join-Path $runtime.runtime 'selection-recovery'))}
   else{[void](Set-BackendArtifactSelection $target.root ([pscustomobject]@{version=1;mode='source'}) (Get-BackendSelectionSnapshot $target.root) (Join-Path $runtime.runtime 'selection-recovery'))}
   Start-ScheduledTask -TaskName $target.taskName;Wait-Ready;[void](Assert-ManagedListener);$proof=Run-Files check;Verify-RecoveredFrontend
   $result=@{status='recovered';healthVerified=$true;protectedFilesVerified=$proof.verified;databaseRestored=$false}
  }catch{$result=@{status='recovery-required';healthVerified=$false;protectedFilesVerified=0;databaseRestored=$false}}
 }else{
  if($taskRegistered){try{[void](Task-Owned);Unregister-ScheduledTask -TaskName $target.taskName -Confirm:$false;$taskRegistered=$false}catch{$result.status='recovery-required'}}
  if($result.status -cne 'recovery-required'){$result=@{status='failed';healthVerified=$false;protectedFilesVerified=0;manualRuntimeRetained=$true}}
  elseif(-not $taskRegistered){$result=@{status='failed';healthVerified=$false;protectedFilesVerified=0;manualRuntimeRetained=$true}}
 }
}finally{
 if($probeName){try{$probe=$folder.GetTask($probeName);if($probe.Xml -notlike ('*DevSetu reviewed promotion '+$context.id+'*')){throw 'Probe ownership changed'};if($probe.State -in @(2,4)){$probe.Stop(0)};$folder.DeleteTask($probeName,0)}catch{$result.status='recovery-required'}}
 $RuntimeCredential=$null
}
$result.batchLogonAssigned=$batchAssigned;$result.runtimeTaskRegistered=$taskRegistered
return $result
