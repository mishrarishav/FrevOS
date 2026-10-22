#requires -Version 5.1
param([ValidateSet('Plan','Apply')][string]$Action='Plan',
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ManifestSha256,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ArchiveSha256,
    [Parameter(Mandatory=$true)][ValidatePattern('^S-1-5-(\d+-)*\d+$')][string]$ActorSid,
    [switch]$Restore,[ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedCurrentManifestSha256)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$root='E:\FrevOS';$oldHash=$null
$stage='preflight';$consumed=$false;$stopped=$false;$runtimeChanged=$false;$stateChanged=$false;$actionChanged=$false;$bindingAdded=$false;$runnerCreated=$false;$runnerStopped=$false
$oldRuntimeBytes=$null;$newRuntimeBytes=$null;$runtime=$null
$sourceAcls=@();$sourceAclChanged=$false
$report=[ordered]@{host='DCAPP7';action=$Action;status='FAIL';configurationChanged=$false;databaseWritten=$false;publicOrigin='http://10.9.69.20';manifestSha256=$ManifestSha256}
function Save-Receipt {
    [IO.File]::WriteAllText((Join-Path $PSScriptRoot ('result-'+$Action.ToLowerInvariant()+'.json')),($report|ConvertTo-Json -Depth 6),[Text.UTF8Encoding]::new($false))
}
function Get-Hash([string]$Path){return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
function Write-Journal([string]$State){
    $entry=@{utc=[DateTimeOffset]::UtcNow.ToString('o');stage=$stage;state=$State;actorSid=$ActorSid;workspace='mishrarishav/FrevOS/server20';target='DCAPP7/10.9.69.20';manifestSha256=$ManifestSha256;correlationId=$job}|ConvertTo-Json -Compress
    $bytes=[Text.UTF8Encoding]::new($false).GetBytes($entry+"`n")
    $stream=[IO.FileStream]::new((Join-Path $PSScriptRoot 'journal.jsonl'),[IO.FileMode]::Append,[IO.FileAccess]::Write,[IO.FileShare]::Read,4096,[IO.FileOptions]::WriteThrough)
    try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
}
function Wait-Stopped {
    $deadline=[DateTimeOffset]::UtcNow.AddSeconds(30)
    while([DateTimeOffset]::UtcNow -lt $deadline){if(-not(Get-NetTCPConnection -State Listen -LocalPort 10000 -ErrorAction SilentlyContinue)){return};Start-Sleep -Milliseconds 250}
    throw 'Owned task did not stop its listener; no process will be killed'
}
function Wait-Healthy {
    $deadline=[DateTimeOffset]::UtcNow.AddSeconds(100)
    while([DateTimeOffset]::UtcNow -lt $deadline){try{$health=Invoke-WebRequest 'http://127.0.0.1:10000/health' -UseBasicParsing -TimeoutSec 15;if($health.StatusCode -eq 200 -and ($health.Content|ConvertFrom-Json).status -ceq 'ok'){return}}catch{};Start-Sleep -Seconds 1}
    throw 'Backend readiness timeout'
}
function Replace-Private([string]$Target,[byte[]]$Bytes,[string]$Label){
    Assert-NoReparsePath $Target
    $temp=Join-Path (Split-Path $Target) ('http-'+$job+'-'+$Label+'.tmp')
    $stream=[IO.FileStream]::new($temp,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{$stream.Write($Bytes,0,$Bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
    $access=[Security.AccessControl.AccessControlSections]::Access
    $acl=[Security.AccessControl.FileSecurity]::new()
    $acl.SetSecurityDescriptorSddlForm((Get-Acl -LiteralPath $Target).GetSecurityDescriptorSddlForm($access),$access)
    [IO.File]::SetAccessControl($temp,$acl)
    [IO.File]::Replace($temp,$Target,(Join-Path $PSScriptRoot ('replaced-'+$Label+'.bak')))
}
function New-HttpReleaseDirectory([string]$Path){
    Assert-NoReparsePath $Path
    if(Test-Path -LiteralPath $Path){throw 'Release directory collision'}
    $executionSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $acl=New-DirectoryAcl $executionSid 'Private'
    $inherit=[Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit
    if($executionSid -cne $ActorSid){[void]$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($ActorSid),[Security.AccessControl.FileSystemRights]::FullControl,$inherit,[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow))}
    [void]$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-19'),[Security.AccessControl.FileSystemRights]::ReadAndExecute,$inherit,[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow))
    [void][IO.Directory]::CreateDirectory($Path,$acl)
}
try {
    if($env:COMPUTERNAME -cne 'DCAPP7' -or -not(Get-NetIPAddress -AddressFamily IPv4|Where-Object IPAddress -EQ '10.9.69.20') -or (Split-Path $PSScriptRoot -Leaf) -cnotmatch '^servix-dashboard-[a-f0-9]{32}$'){throw 'Wrong execution boundary'}
    $job=(Split-Path $PSScriptRoot -Leaf).Substring(17)
    $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
    if(-not([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Administrator execution required'}
    foreach($rule in (Get-Acl -LiteralPath $PSScriptRoot).Access){$sid=$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value;if($rule.AccessControlType -eq 'Allow' -and $sid -notin @($ActorSid,'S-1-5-18','S-1-5-32-544')){throw 'Operator ACL mismatch'}}
    $archive=Join-Path $PSScriptRoot 'package.zip'
    if((Get-Hash $archive) -cne $ArchiveSha256){throw 'Archive integrity mismatch'}
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip=[IO.Compression.ZipFile]::OpenRead($archive)
    try {
        $names=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase);$total=0L
        foreach($entry in $zip.Entries){if($entry.FullName -match '(^|/)(\.|\.\.)(/|$)|[:\\\x00-\x1f]' -or $entry.FullName.StartsWith('/') -or $entry.FullName.EndsWith('/') -or -not $names.Add($entry.FullName) -or $entry.Length -gt 100000000){throw 'Unsafe archive entry'};$total+=$entry.Length;if($total -gt 160000000 -or $names.Count -gt 10000){throw 'Archive exceeds release budget'}}
        if(-not $names.Contains('release-manifest.json')){throw 'Missing archive manifest'}
        $candidate=Join-Path $PSScriptRoot 'candidate'
        if(-not(Test-Path -LiteralPath $candidate)){$zip.Dispose();$zip=$null;[IO.Compression.ZipFile]::ExtractToDirectory($archive,$candidate)}
    } finally {if($null -ne $zip){$zip.Dispose()}}
    # The outer archive digest is verified before importing its versioned helpers.
    . (Join-Path $candidate 'deployment\server20\Postgres.ps1')
    . (Join-Path $candidate 'deployment\server20\HttpCommon.ps1')
    $manifest=Test-HttpManifest $candidate $ManifestSha256
    $oldHash=[string]$manifest.previousManifestSha256
    if($oldHash -cnotmatch '^[a-f0-9]{64}$'){throw 'Invalid previous release identity'}
    if($Restore){if($ExpectedCurrentManifestSha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'Restore requires a current release identity'};$oldHash=$ExpectedCurrentManifestSha256}
    $oldRelease=Join-Path $root ('releases\'+$oldHash)
    $previous=Test-HttpManifest $oldRelease $oldHash
    Assert-ServixDelta $previous $manifest
    $stateFile=Join-Path $root 'state\active.json';$runtimeFile=Join-Path $root 'config\runtime.json'
    if(([IO.File]::ReadAllText($stateFile)|ConvertFrom-Json).manifestSha256 -cne $oldHash){throw 'Active release changed'}
    $oldRuntimeBytes=[IO.File]::ReadAllBytes($runtimeFile);$oldStateBytes=[IO.File]::ReadAllBytes($stateFile)
    $runtime=[Text.Encoding]::UTF8.GetString($oldRuntimeBytes)|ConvertFrom-Json
    $runtimeKeys=@('DATABASE_URL','FREVOS_PUBLIC_ORIGIN','FREVOS_ALLOW_INTERNAL_HTTP','FREVOS_AUTH_MODE','FREVOS_BASE_PATH','HOST','PORT','FREVOS_SERVIX_DEPLOYMENT_ROOT')
    if(@($runtime.PSObject.Properties).Count -ne 8 -or @($runtime.PSObject.Properties.Name|Where-Object {$_ -notin $runtimeKeys}).Count -or $runtime.FREVOS_PUBLIC_ORIGIN -cne 'http://10.9.69.20' -or $runtime.FREVOS_AUTH_MODE -cne 'local' -or $runtime.HOST -cne '127.0.0.1' -or $runtime.PORT -cne '10000' -or $runtime.FREVOS_BASE_PATH -cne ''){throw 'Previous runtime profile changed'}
    $task=Get-ScheduledTask -TaskName 'FrevOS-ControlPlane'
    $oldArguments='-NoProfile -NonInteractive -WindowStyle Hidden -File "'+(Join-Path $oldRelease 'deployment\server20\Start-Server20.ps1')+'"'
    $expectedExe=Join-Path $env:windir 'System32\WindowsPowerShell\v1.0\powershell.exe'
    if($task.State -ne 'Running' -or $task.Principal.UserId -cne 'LOCAL SERVICE' -or @($task.Actions).Count -ne 1 -or $task.Actions[0].Arguments -cne $oldArguments -or $task.Actions[0].Execute -ine $expectedExe){throw 'Control-plane task ownership mismatch'}
    if((Get-Service FrevOS-Postgres18).Status -ne 'Running'){throw 'Existing PostgreSQL unavailable'}
    Import-Module WebAdministration
    $site=Get-Website -Name FrevOS-Server20
    if($site.Id -ne 4 -or $site.PhysicalPath -cne 'E:\FrevOS\web' -or $site.ApplicationPool -cne 'FrevOS-Server20' -or $site.State -ne 'Started' -or @($site.Bindings.Collection|Where-Object bindingInformation -CEQ '10.9.69.20:80:').Count -ne 1){throw 'FrevOS IIS profile changed'}
    $previousRunner=Get-ScheduledTask -TaskName 'FrevOS-ServixDev-Activation'
    $previousRunnerArgs='-NoProfile -NonInteractive -WindowStyle Hidden -File "'+(Join-Path $oldRelease 'deployment\servix\Run-Activation.ps1')+'"'
    if($previousRunner.Actions.Count -ne 1 -or $previousRunner.Actions[0].Arguments -cne $previousRunnerArgs -or $previousRunner.State -ne 'Running'){throw 'Runner state or deployment activity changed'}
    Assert-ServixDeploymentIdle 'E:\FrevOS\servix'
    foreach($path in @('E:\FrevOS\git\servix.git\objects','E:\FrevOS\git\servix.git\refs\heads','E:\FrevOS\git\servix.git\refs')){Assert-NoReparsePath $path;if(-not(Test-Path -LiteralPath $path -PathType Container)){throw 'Git source directories changed'}}
    $gitIdentity=& 'C:\Program Files\Git\cmd\git.exe' -c safe.directory=E:\FrevOS\git\servix.git --git-dir=E:\FrevOS\git\servix.git config --get frevos.repositoryId
    if($LASTEXITCODE -ne 0 -or $gitIdentity.Trim() -cne 'gitrepo_6cb7e163f807493fa37963196c49fbac'){throw 'Git source identity changed'}
    if(-not(Test-Path -LiteralPath 'E:\FrevOS\servix\private\server21.credential.xml')){throw 'Servix target credential boundary unavailable'}
    $siblings=Get-HttpSiblingSites
    Wait-Healthy
    # Prove the executing principal can create the scoped runtime ACL before consuming approval.
    $probe=Join-Path $PSScriptRoot 'acl-preflight'
    New-HttpReleaseDirectory $probe
    [IO.Directory]::Delete($probe,$false)
    $report.previousManifestSha256=$oldHash;$report.actorSid=$ActorSid;$report.correlationId=$job
    if($Action -eq 'Plan'){$report.status='PASS';$report.delta='configured-component-deployments';Save-Receipt;return}
    $approval=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'approval.json'))|ConvertFrom-Json
    $now=[DateTimeOffset]::UtcNow;$issued=[DateTimeOffset]::Parse($approval.issuedUtc);$expires=[DateTimeOffset]::Parse($approval.expiresUtc)
    if($Restore -and (-not $approval.PSObject.Properties['operation'] -or $approval.operation -cne 'rollback' -or $approval.expectedCurrentManifestSha256 -cne $oldHash)){throw 'Restore approval does not bind the current release'}
    if($approval.action -cne 'devsetu.platform.components.v1' -or $approval.workspace -cne 'mishrarishav/FrevOS/server20' -or $approval.target -cne 'DCAPP7/10.9.69.20' -or $approval.actorSid -cne $ActorSid -or $approval.correlationId -cne $job -or $approval.manifestSha256 -cne $ManifestSha256 -or $approval.archiveSha256 -cne $ArchiveSha256 -or $approval.publicOrigin -cne 'http://10.9.69.20' -or $approval.authorization -cne 'owner-requested-configured-components' -or $issued -gt $now -or $expires -le $now -or $expires -le $issued -or ($expires-$issued).TotalMinutes -gt 15){throw 'Approval scope or expiry mismatch'}
    Write-NewPrivateText (Join-Path $PSScriptRoot 'approval-consumed.json') ($approval|ConvertTo-Json)
    $consumed=$true;Write-Journal 'started'
    $stage='source-git-permissions';Write-Journal 'started'
    # Source publication needs object and development-ref writes, never Git config/hooks
    # or access to deployment credentials. Retain exact ACL preimages for recovery.
    $incoming='E:\FrevOS\git\servix.git\refs\frevos'
    Assert-NoReparsePath $incoming
    if(-not(Test-Path -LiteralPath $incoming)){[void][IO.Directory]::CreateDirectory($incoming)}
    foreach($path in @('E:\FrevOS\git\servix.git\objects','E:\FrevOS\git\servix.git\refs\heads',$incoming)){
      $acl=Get-Acl -LiteralPath $path;$before=$acl.Sddl
      [void]$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-19'),[Security.AccessControl.FileSystemRights]::Modify,([Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit),[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow))
      $sourceAcls+=@{path=$path;before=$before;after=$acl.Sddl;file=$false}
      Write-NewPrivateText (Join-Path $PSScriptRoot ('source-acl-'+$sourceAcls.Count+'.json')) ($sourceAcls[-1]|ConvertTo-Json)
      $sourceAclChanged=$true;Set-Acl -LiteralPath $path -AclObject $acl
    }
    # Git transactions also own HEAD and root lock/packed-ref files. Permit new
    # root files, but do not grant deletion/replacement of existing config/hooks.
    foreach($path in @('E:\FrevOS\git\servix.git','E:\FrevOS\git\servix.git\HEAD')){
      Assert-NoReparsePath $path
      $acl=Get-Acl -LiteralPath $path;$before=$acl.Sddl
      $isDirectory=(Get-Item -LiteralPath $path).PSIsContainer
      if($isDirectory){
        [void]$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-19'),[Security.AccessControl.FileSystemRights]::CreateFiles,[Security.AccessControl.InheritanceFlags]::None,[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow))
        [void]$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-3-0'),[Security.AccessControl.FileSystemRights]::Modify,[Security.AccessControl.InheritanceFlags]::ObjectInherit,[Security.AccessControl.PropagationFlags]::InheritOnly,[Security.AccessControl.AccessControlType]::Allow))
      }else{
        [void]$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-19'),[Security.AccessControl.FileSystemRights]::Modify,[Security.AccessControl.AccessControlType]::Allow))
      }
      $sourceAcls+=@{path=$path;before=$before;after=$acl.Sddl;file=(-not $isDirectory)}
      Write-NewPrivateText (Join-Path $PSScriptRoot ('source-acl-'+$sourceAcls.Count+'.json')) ($sourceAcls[-1]|ConvertTo-Json)
      $sourceAclChanged=$true;Set-Acl -LiteralPath $path -AclObject $acl
    }
    Write-NewPrivateText (Join-Path $PSScriptRoot 'task-before.xml') (Export-ScheduledTask -TaskName FrevOS-ControlPlane)
    [IO.File]::WriteAllBytes((Join-Path $PSScriptRoot 'runtime-before.json'),$oldRuntimeBytes)
    [IO.File]::WriteAllBytes((Join-Path $PSScriptRoot 'active-before.json'),$oldStateBytes)
    Copy-Item -LiteralPath (Join-Path $env:windir 'System32\inetsrv\config\applicationHost.config') -Destination (Join-Path $PSScriptRoot 'applicationHost-before.config')
    Write-NewPrivateText (Join-Path $PSScriptRoot 'siblings-before.json') $siblings
    $release=Join-Path $root ('releases\'+$ManifestSha256)
    $stage='create-release';Write-Journal 'started'
    if($Restore -and (Test-Path -LiteralPath $release)){
      Assert-NoReparsePath $release
      [void](Test-HttpManifest $release $ManifestSha256)
    }else{
      New-HttpReleaseDirectory $release
      foreach($item in Get-ChildItem -LiteralPath $candidate -Force){Copy-Item -LiteralPath $item.FullName -Destination $release -Recurse}
    }
    [void](Test-HttpManifest $release $ManifestSha256)
    $stage='switch-runtime';Write-Journal 'started'
    Stop-ScheduledTask -TaskName 'FrevOS-ServixDev-Activation';$runnerStopped=$true
    Stop-ScheduledTask -TaskName FrevOS-ControlPlane;$stopped=$true;Wait-Stopped
    $runtime.FREVOS_SERVIX_DEPLOYMENT_ROOT='E:\FrevOS\servix'
    $newRuntimeBytes=[Text.UTF8Encoding]::new($false).GetBytes(($runtime|ConvertTo-Json));$runtime=$null
    [IO.File]::WriteAllBytes((Join-Path $PSScriptRoot 'runtime-after.json'),$newRuntimeBytes)
    Replace-Private $runtimeFile $newRuntimeBytes 'runtime';$runtimeChanged=$true
    Replace-Private $stateFile ([Text.UTF8Encoding]::new($false).GetBytes((@{manifestSha256=$ManifestSha256}|ConvertTo-Json))) 'active';$stateChanged=$true
    $newArguments='-NoProfile -NonInteractive -WindowStyle Hidden -File "'+(Join-Path $release 'deployment\server20\Start-Server20.ps1')+'"'
    Set-ScheduledTask -TaskName FrevOS-ControlPlane -Action (New-ScheduledTaskAction -Execute $expectedExe -Argument $newArguments)|Out-Null;$actionChanged=$true
    Start-ScheduledTask -TaskName FrevOS-ControlPlane
    Wait-Healthy
    $stage='install-self-update';Write-Journal 'started'
    & (Join-Path $release 'deployment\server20\Install-SelfUpdate.ps1') -ActorSid $ActorSid
    $stage='start-servix-activation';Write-Journal 'started'
    $runnerArguments='-NoProfile -NonInteractive -WindowStyle Hidden -File "'+(Join-Path $release 'deployment\servix\Run-Activation.ps1')+'"'
    $runnerAction=New-ScheduledTaskAction -Execute $expectedExe -Argument $runnerArguments
    $runnerPrincipal=New-ScheduledTaskPrincipal -UserId 'S-1-5-18' -LogonType ServiceAccount -RunLevel Highest
    $runnerSettings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
    Set-ScheduledTask -TaskName 'FrevOS-ServixDev-Activation' -Action $runnerAction|Out-Null
    $runnerCreated=$true
    Start-ScheduledTask -TaskName 'FrevOS-ServixDev-Activation'
    if((Get-HttpSiblingSites) -cne $siblings){throw 'Sibling IIS configuration changed'}
    $response=Invoke-WebRequest 'http://10.9.69.20/health' -UseBasicParsing -TimeoutSec 15
    if($response.StatusCode -ne 200 -or ($response.Content|ConvertFrom-Json).status -cne 'ok'){throw 'IIS HTTP readiness failed'}
    $homepageResponse=Invoke-WebRequest 'http://10.9.69.20/' -UseBasicParsing -TimeoutSec 15
    if($homepageResponse.StatusCode -ne 200 -or $homepageResponse.Content -notmatch '<title>DevSetu Control Center</title>'){throw 'IIS UI unavailable'}
    $report.status='PASS';$report.configurationChanged=$true;$report.httpHealth=200;$report.uiStatus=200;$report.siblingsPreserved=$true;$report.rollback='retained-private-backups';Write-Journal 'completed';Save-Receipt
} catch {
    $report.failedStage=$stage;$report.errorType=$_.Exception.GetType().Name;$report.errorId=$_.FullyQualifiedErrorId;$report.errorHResult=$_.Exception.HResult;$report.errorLine=$_.InvocationInfo.ScriptLineNumber
    if($consumed){
        try {
            $stage='restore-previous';Write-Journal 'started'
            if($sourceAclChanged){for($index=$sourceAcls.Count-1;$index -ge 0;$index--){$entry=$sourceAcls[$index];$currentSddl=(Get-Acl -LiteralPath $entry.path).Sddl;if($currentSddl -ceq $entry.before){continue};if($currentSddl -cne $entry.after){throw 'Source permissions changed outside this operation'};$acl=if($entry.file){[Security.AccessControl.FileSecurity]::new()}else{[Security.AccessControl.DirectorySecurity]::new()};$acl.SetSecurityDescriptorSddlForm($entry.before);Set-Acl -LiteralPath $entry.path -AclObject $acl}}
            if($runnerCreated){$ownedRunner=Get-ScheduledTask -TaskName 'FrevOS-ServixDev-Activation';if($ownedRunner.Actions.Count -ne 1 -or $ownedRunner.Actions[0].Arguments -cne $runnerArguments){throw 'Runner ownership changed'};Stop-ScheduledTask -TaskName 'FrevOS-ServixDev-Activation';Set-ScheduledTask -TaskName 'FrevOS-ServixDev-Activation' -Action $previousRunner.Actions[0]|Out-Null;Start-ScheduledTask -TaskName 'FrevOS-ServixDev-Activation'}
            if($stopped){
                $currentTask=Get-ScheduledTask -TaskName FrevOS-ControlPlane
                $ownedArguments=if($actionChanged){$newArguments}else{$oldArguments}
                if($currentTask.Actions[0].Arguments -cne $ownedArguments -or $currentTask.Principal.UserId -cne 'LOCAL SERVICE'){throw 'Task ownership changed during recovery'}
                Stop-ScheduledTask -TaskName FrevOS-ControlPlane;Wait-Stopped
                if($runtimeChanged){if((Get-Hash $runtimeFile) -cne (Get-Hash (Join-Path $PSScriptRoot 'runtime-after.json'))){throw 'Runtime changed outside this operation'};Replace-Private $runtimeFile $oldRuntimeBytes 'runtime-recovery'}
                if($stateChanged){if(([IO.File]::ReadAllText($stateFile)|ConvertFrom-Json).manifestSha256 -cne $ManifestSha256){throw 'Active identity changed'};Replace-Private $stateFile $oldStateBytes 'active-recovery'}
                Set-ScheduledTask -TaskName FrevOS-ControlPlane -Action $task.Actions[0]|Out-Null
                Start-ScheduledTask -TaskName FrevOS-ControlPlane;Wait-Healthy
            }
            if(-not $runnerCreated -and $runnerStopped){Start-ScheduledTask -TaskName 'FrevOS-ServixDev-Activation'}
            $report.restoredPrevious=$true;Write-Journal 'completed'
        } catch {$report.recoveryErrorType=$_.Exception.GetType().Name;$report.recoveryErrorId=$_.FullyQualifiedErrorId}
    }
    $report.configurationChanged=($runtimeChanged -or $stateChanged -or $actionChanged -or $bindingAdded) -and -not ($report.Contains('restoredPrevious') -and $report.restoredPrevious)
    Save-Receipt
} finally {
    if($null -ne $oldRuntimeBytes){[Array]::Clear($oldRuntimeBytes,0,$oldRuntimeBytes.Length)}
    if($null -ne $newRuntimeBytes){[Array]::Clear($newRuntimeBytes,0,$newRuntimeBytes.Length)}
    $runtime=$null
}
