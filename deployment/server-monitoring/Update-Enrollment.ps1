#requires -Version 5.1
param([ValidateSet('Plan','Apply')][string]$Action,[string]$PlanPath,[ValidatePattern('^[a-f0-9]{64}$')][string]$PlanSha256)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
# Reuse only this reviewed, fixed operator helper; no application input selects code.
$requestedAction = $Action; $requestedPlan = $PlanPath; $requestedDigest = $PlanSha256
$dependency = Join-Path $PSScriptRoot 'Update-Worker.ps1'
if ((Get-FileHash -LiteralPath $dependency -Algorithm SHA256).Hash.ToLowerInvariant() -cne '9a4ce5347d189ec04cbfdbffd65d5db243e321c42bed675160287a904836aeff') { throw 'enrollment-update-helper-hash-mismatch' }
. $dependency

function Assert-EnrollmentPlan($Plan,[string]$ComputerName,[string]$File) {
    Assert-WorkerUpdateShape $Plan @('version','kind','id','actorId','sourceHead','expectedComputerName','workspaceId','protectedRoot','queueRoot','stagingRoot','oldRegistrySha256','newRegistrySha256','oldManifestSha256','newManifestSha256','appIdentitySid','targetUpdates','createdAt','expiresAt')
    if ($Plan.version -ne 1 -or $Plan.kind -cne 'devsetu.monitoring-enrollment-update.v1' -or $Plan.id -notmatch '^sme_[a-f0-9]{32}$' -or $Plan.actorId -notmatch '^usr_[A-Za-z0-9][A-Za-z0-9_-]{0,119}$' -or $Plan.sourceHead -notmatch '^[a-f0-9]{40}$' -or $Plan.workspaceId -notmatch '^ws_[A-Za-z0-9][A-Za-z0-9_-]{0,119}$' -or $Plan.expectedComputerName -notmatch '^[A-Za-z0-9-]{1,63}$' -or $Plan.expectedComputerName -ine $ComputerName) { throw 'enrollment-update-plan-identity-rejected' }
    foreach ($name in @('oldRegistrySha256','newRegistrySha256','oldManifestSha256','newManifestSha256')) { if ($Plan.$name -notmatch '^[a-f0-9]{64}$') { throw 'enrollment-update-plan-digest-rejected' } }
    if ($Plan.oldRegistrySha256 -ceq $Plan.newRegistrySha256 -or $Plan.oldManifestSha256 -ceq $Plan.newManifestSha256 -or $Plan.appIdentitySid -notmatch '^S-1-5-(?:19|20|80-[0-9-]+)$' -or $Plan.targetUpdates -isnot [array] -or $Plan.targetUpdates.Count -lt 1 -or $Plan.targetUpdates.Count -gt 14) { throw 'enrollment-update-plan-policy-rejected' }
    $previous = @{}; $next = @{}
    foreach ($item in $Plan.targetUpdates) {
        Assert-WorkerUpdateShape $item @('previousId','nextId')
        if ($item.previousId -notmatch '^srv_[a-f0-9]{32}$' -or $item.nextId -notmatch '^srv_[a-f0-9]{32}$' -or $previous.ContainsKey($item.previousId) -or $next.ContainsKey($item.nextId)) { throw 'enrollment-update-target-mapping-rejected' }
        $previous[$item.previousId] = $true; $next[$item.nextId] = $true
    }
    foreach ($name in @('createdAt','expiresAt')) { if ([string]$Plan.$name -notmatch '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,7})?Z$') { throw 'enrollment-update-plan-time-rejected' } }
    $start = [DateTimeOffset]::Parse([string]$Plan.createdAt).UtcDateTime; $end = [DateTimeOffset]::Parse([string]$Plan.expiresAt).UtcDateTime; $now = Get-WorkerUpdateNow
    if ($start -gt $now -or $end -le $now -or $end -le $start -or ($end - $start).TotalHours -gt 4) { throw 'enrollment-update-plan-expired' }
    foreach ($name in @('protectedRoot','queueRoot','stagingRoot')) { $Plan.$name = Resolve-WorkerUpdatePath $Plan.$name }
    foreach ($pair in @(@($Plan.protectedRoot,$Plan.queueRoot),@($Plan.protectedRoot,$Plan.stagingRoot),@($Plan.queueRoot,$Plan.stagingRoot))) {
        if ($pair[0] -ieq $pair[1] -or $pair[0].StartsWith($pair[1] + '\',[StringComparison]::OrdinalIgnoreCase) -or $pair[1].StartsWith($pair[0] + '\',[StringComparison]::OrdinalIgnoreCase)) { throw 'enrollment-update-scope-separation-required' }
    }
    if ((Resolve-WorkerUpdatePath $File) -ine (Join-Path $Plan.stagingRoot 'plan.v1.json')) { throw 'enrollment-update-plan-path-mismatch' }
}
function Get-EnrollmentTargetId($Target) {
    $bytes = [Text.Encoding]::UTF8.GetBytes((@($Target.workspaceId,$Target.address,[string]$Target.port,$Target.transport) -join [char]0))
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ('srv_' + ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLowerInvariant().Substring(0,32)) } finally { $sha.Dispose() }
}
function Get-EnrollmentTargetJson($Target,[string[]]$Exclude = @()) {
    $value = [ordered]@{}
    foreach ($property in @($Target.PSObject.Properties | Sort-Object Name)) { if ($Exclude -cnotcontains $property.Name) { $value[$property.Name] = $property.Value } }
    return ([pscustomobject]$value | ConvertTo-Json -Depth 5 -Compress)
}
function Assert-EnrollmentRegistries($Before,$After,$Plan) {
    foreach ($registry in @($Before,$After)) {
        Assert-WorkerUpdateShape $registry @('version','workspaceId','targets')
        if ($registry.version -ne 1 -or $registry.workspaceId -cne $Plan.workspaceId -or $registry.targets -isnot [array] -or $registry.targets.Count -lt 1 -or $registry.targets.Count -gt 100) { throw 'enrollment-update-registry-rejected' }
        $ids = @{}; $addresses = @{}
        foreach ($target in $registry.targets) {
            Assert-MonitorTarget $target $Plan.workspaceId
            if ($target.id -cne (Get-EnrollmentTargetId $target) -or $ids.ContainsKey($target.id) -or $addresses.ContainsKey($target.address)) { throw 'enrollment-update-registry-target-rejected' }
            $ids[$target.id] = $true; $addresses[$target.address] = $true
        }
    }
    if ($Before.targets.Count -ne $After.targets.Count) { throw 'enrollment-update-target-count-changed' }
    $used = @{}
    foreach ($old in $Before.targets) {
        $mapping = @($Plan.targetUpdates | Where-Object previousId -CEQ $old.id)
        $nextId = $old.id; if ($mapping.Count -eq 1) { $nextId = $mapping[0].nextId; $used[$old.id] = $true }
        $matches = @($After.targets | Where-Object id -CEQ $nextId)
        if ($matches.Count -ne 1) { throw 'enrollment-update-target-mapping-rejected' }
        $new = $matches[0]
        if ($mapping.Count -eq 0) { if ((Get-EnrollmentTargetJson $old) -cne (Get-EnrollmentTargetJson $new)) { throw 'enrollment-update-unlisted-target-change' } }
        else {
            $allowed = @('id','port','endpointHost','authentication','expectedComputerName','approvedEndpointAddresses','revision')
            if ((Get-EnrollmentTargetJson $old $allowed) -cne (Get-EnrollmentTargetJson $new $allowed) -or (Get-EnrollmentTargetJson $old) -ceq (Get-EnrollmentTargetJson $new)) { throw 'enrollment-update-unapproved-target-change' }
            if ($new.transport -eq 'local') { throw 'enrollment-update-local-target-change-rejected' }
        }
    }
    if ($used.Count -ne $Plan.targetUpdates.Count) { throw 'enrollment-update-target-mapping-rejected' }
}
function Get-EnrollmentTaskXml($Context) {
    $text = Export-ScheduledTask -TaskName $Context.taskName -TaskPath '\'
    if ($text.Length -gt 65536) { throw 'enrollment-update-task-xml-limit' }
    $document = New-Object Xml.XmlDocument; $document.PreserveWhitespace = $false; $document.LoadXml($text)
    return $document
}
function Get-EnrollmentTaskSddl($Context) {
    $service = New-Object -ComObject 'Schedule.Service'; $service.Connect()
    return [string]$service.GetFolder('\').GetTask($Context.taskName).GetSecurityDescriptor(7)
}
function Get-EnrollmentArguments($Context,[string]$Digest) {
    return ('-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $Context.workerPath + '" -ProtectedRoot "' + $Context.plan.protectedRoot + '" -QueueRoot "' + $Context.plan.queueRoot + '" -RegistrySha256 ' + $Digest + ' -AppIdentitySid ' + $Context.plan.appIdentitySid)
}
function Assert-EnrollmentTask($Context,[string]$RegistryDigest) {
    $Context.arguments = Get-EnrollmentArguments $Context $RegistryDigest
    $null = Get-WorkerUpdateTask $Context
    $xml = Get-EnrollmentTaskXml $Context
    $arguments = @($xml.SelectNodes("//*[local-name()='Actions']/*[local-name()='Exec']/*[local-name()='Arguments']"))
    if ($arguments.Count -ne 1 -or $arguments[0].InnerText -cne $Context.arguments) { throw 'enrollment-update-task-xml-rejected' }
    $arguments[0].InnerText = Get-EnrollmentArguments $Context $Context.plan.oldRegistrySha256
    if ($xml.OuterXml -cne $Context.taskXml -or (Get-EnrollmentTaskSddl $Context) -cne $Context.taskSddl) { throw 'enrollment-update-unrelated-task-change' }
}
function Get-EnrollmentFileState([string]$Path) {
    $null = Resolve-WorkerUpdatePath $Path
    $acl = Get-Acl -LiteralPath $Path
    if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -notin @('S-1-5-18','S-1-5-32-544')) { throw 'enrollment-update-file-owner-rejected' }
    foreach ($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) { if ($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin @('S-1-5-18','S-1-5-32-544')) { throw 'enrollment-update-file-acl-rejected' } }
    $sections = [Security.AccessControl.AccessControlSections]::Owner -bor [Security.AccessControl.AccessControlSections]::Group -bor [Security.AccessControl.AccessControlSections]::Access
    return @{sha256 = Get-WorkerUpdateHash $Path; sddl = $acl.GetSecurityDescriptorSddlForm($sections); acl = $acl}
}
function Get-EnrollmentContext([string]$File,[string]$Digest) {
    Assert-WorkerUpdateSystem
    if ($Digest -notmatch '^[a-f0-9]{64}$' -or (Get-WorkerUpdateHash $File) -cne $Digest) { throw 'enrollment-update-plan-hash-mismatch' }
    Assert-WorkerUpdatePrivate (Split-Path -Parent $File)
    $plan = Read-WorkerUpdateJson $File 32768; Assert-EnrollmentPlan $plan $env:COMPUTERNAME $File
    foreach ($directory in @($plan.stagingRoot,$plan.protectedRoot,(Join-Path $plan.protectedRoot 'program'),(Join-Path $plan.protectedRoot 'credentials'))) { Assert-WorkerUpdatePrivate $directory }
    $before = Get-WorkerUpdateManifest (Join-Path $plan.stagingRoot 'before-manifest.v1.json') $plan.oldManifestSha256
    $after = Get-WorkerUpdateManifest (Join-Path $plan.stagingRoot 'manifest.v1.json') $plan.newManifestSha256
    $programRoot = Join-Path $plan.protectedRoot 'program'; $installed = @(Get-ChildItem -LiteralPath $programRoot -Force)
    if ($installed.Count -ne 5 -or @($installed | Where-Object { $_.PSIsContainer -or $_.Name -cnotin $before.files.name }).Count -ne 0) { throw 'enrollment-update-installed-program-set-rejected' }
    $states = @{}; $files = @{}
    foreach ($entry in $after.files) {
        $old = @($before.files | Where-Object name -CEQ $entry.name)[0]
        if (($entry.name -cin @('Common.ps1','Collector.ps1')) -eq ($old.sha256 -ceq $entry.sha256)) { throw 'enrollment-update-program-delta-rejected' }
        $path = Join-Path $programRoot $entry.name; $state = Get-EnrollmentFileState $path
        if ($state.sha256 -cne $old.sha256 -or (Get-WorkerUpdateHash (Join-Path $plan.stagingRoot $entry.name)) -cne $entry.sha256) { throw 'enrollment-update-program-hash-mismatch' }
        $states[$entry.name] = $state; $files[$entry.name] = $path
    }
    # Definitions are loaded only after their operator-manifest hash is checked.
    . (Join-Path $plan.stagingRoot 'Common.ps1')
    $registryPath = Join-Path $plan.protectedRoot 'registry.v1.json'; $states['registry.v1.json'] = Get-EnrollmentFileState $registryPath; $files['registry.v1.json'] = $registryPath
    if ($states['registry.v1.json'].sha256 -cne $plan.oldRegistrySha256 -or (Get-WorkerUpdateHash (Join-Path $plan.stagingRoot 'registry.v1.json')) -cne $plan.newRegistrySha256) { throw 'enrollment-update-registry-hash-mismatch' }
    $oldRegistry = Read-WorkerUpdateJson $registryPath 1048576; $newRegistry = Read-WorkerUpdateJson (Join-Path $plan.stagingRoot 'registry.v1.json') 1048576
    Assert-EnrollmentRegistries $oldRegistry $newRegistry $plan
    $credentialStates = @{}
    foreach ($name in (Get-WorkerUpdateCredentials (Join-Path $plan.protectedRoot 'credentials')).Keys) { $credentialStates[$name] = Get-EnrollmentFileState (Join-Path (Join-Path $plan.protectedRoot 'credentials') $name) }
    foreach ($target in $newRegistry.targets) { if (-not $credentialStates.ContainsKey($target.credentialProfile + '.dpapi')) { throw 'enrollment-update-profile-missing' } }
    $workspace = Join-Path $plan.queueRoot $plan.workspaceId
    foreach ($path in @($plan.queueRoot,$workspace,(Join-Path $workspace 'results'))) { Assert-MonitorQueueAcl $path $plan.appIdentitySid $false }
    Assert-MonitorQueueAcl (Join-Path $workspace 'requests') $plan.appIdentitySid $true
    $context = @{plan = $plan; planFile = $File; planSha256 = $Digest; before = $before; after = $after; files = $files; states = $states; credentialStates = $credentialStates; programRoot = $programRoot; workerPath = (Join-Path $programRoot 'Worker.ps1'); powerShell = (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'); taskName = ('DevSetu-ServerMonitoring-' + $plan.workspaceId); targetCount = $newRegistry.targets.Count; scope = (Join-Path (Join-Path $plan.protectedRoot 'updates') $plan.id)}
    $context.arguments = Get-EnrollmentArguments $context $plan.oldRegistrySha256; $null = Get-WorkerUpdateTask $context
    $context.taskXml = (Get-EnrollmentTaskXml $context).OuterXml; $context.taskSddl = Get-EnrollmentTaskSddl $context
    Assert-EnrollmentTask $context $plan.oldRegistrySha256
    if (Test-Path -LiteralPath $context.scope) { throw 'enrollment-update-scope-already-exists' }
    return $context
}
function Assert-EnrollmentState($Context,[bool]$Updated,[string]$TaskDigest) {
    if ((Get-WorkerUpdateHash $Context.planFile) -cne $Context.planSha256) { throw 'enrollment-update-approved-input-changed' }
    $null = Get-WorkerUpdateManifest (Join-Path $Context.plan.stagingRoot 'before-manifest.v1.json') $Context.plan.oldManifestSha256
    $null = Get-WorkerUpdateManifest (Join-Path $Context.plan.stagingRoot 'manifest.v1.json') $Context.plan.newManifestSha256
    foreach ($name in $Context.files.Keys) {
        $expected = $Context.states[$name].sha256
        if ($Updated) { if ($name -ceq 'registry.v1.json') { $expected = $Context.plan.newRegistrySha256 } else { $expected = @($Context.after.files | Where-Object name -CEQ $name)[0].sha256 } }
        $current = Get-EnrollmentFileState $Context.files[$name]
        if ($current.sha256 -cne $expected -or $current.sddl -cne $Context.states[$name].sddl) { throw 'enrollment-update-preservation-failed' }
    }
    $credentialRoot = Join-Path $Context.plan.protectedRoot 'credentials'; $currentNames = Get-WorkerUpdateCredentials $credentialRoot
    if ($currentNames.Count -ne $Context.credentialStates.Count) { throw 'enrollment-update-credential-set-changed' }
    foreach ($name in $Context.credentialStates.Keys) { $current = Get-EnrollmentFileState (Join-Path $credentialRoot $name); if ($current.sha256 -cne $Context.credentialStates[$name].sha256 -or $current.sddl -cne $Context.credentialStates[$name].sddl) { throw 'enrollment-update-credential-changed' } }
    Assert-EnrollmentTask $Context $TaskDigest
}
function Set-EnrollmentTaskDigest($Context,[string]$BeforeDigest,[string]$AfterDigest) {
    Assert-EnrollmentTask $Context $BeforeDigest
    $action = New-ScheduledTaskAction -Execute $Context.powerShell -Argument (Get-EnrollmentArguments $Context $AfterDigest) -WorkingDirectory $Context.programRoot
    $null = Set-ScheduledTask -TaskName $Context.taskName -TaskPath '\' -Action $action
    Assert-EnrollmentTask $Context $AfterDigest
}
function Replace-EnrollmentFile($Context,[string]$Name,[string]$Source,[string]$Digest,[string]$Suffix) {
    $next = Join-Path $Context.scope ($Name + '.' + $Suffix + '.next'); $replaced = Join-Path $Context.scope ($Name + '.' + $Suffix + '.replaced')
    if (Test-Path -LiteralPath $next) { throw 'enrollment-update-file-collision' }; if (Test-Path -LiteralPath $replaced) { throw 'enrollment-update-file-collision' }
    [IO.File]::Copy($Source,$next,$false)
    if ((Get-WorkerUpdateHash $next) -cne $Digest) { throw 'enrollment-update-staged-file-changed' }
    [IO.File]::SetAccessControl($next,$Context.states[$Name].acl)
    [IO.File]::Replace($next,$Context.files[$Name],$replaced)
    [IO.File]::SetAccessControl($Context.files[$Name],$Context.states[$Name].acl)
    $current = Get-EnrollmentFileState $Context.files[$Name]
    if ($current.sha256 -cne $Digest -or $current.sddl -cne $Context.states[$Name].sddl) { throw 'enrollment-update-file-replacement-failed' }
}
function Stop-EnrollmentTask($Context,[string]$Digest) {
    Assert-EnrollmentTask $Context $Digest; $Context.arguments = Get-EnrollmentArguments $Context $Digest
    Stop-OwnedWorkerUpdateTask $Context
}
function Wait-EnrollmentHealth($Context,[string]$Digest,[DateTime]$StartedAt) {
    $Context.plan | Add-Member -NotePropertyName registrySha256 -NotePropertyValue $Digest -Force
    try { $Context.arguments = Get-EnrollmentArguments $Context $Digest; return (Wait-WorkerUpdateHealth $Context $StartedAt) }
    finally { $Context.plan.PSObject.Properties.Remove('registrySha256') }
}
function Invoke-EnrollmentUpdate($Context,[string]$Mode) {
    Assert-WorkerUpdateSystem; Assert-EnrollmentPlan $Context.plan $env:COMPUTERNAME $Context.planFile
    Assert-EnrollmentState $Context $false $Context.plan.oldRegistrySha256
    if ($Mode -eq 'Plan') { return @{version = 1; status = 'planned'; id = $Context.plan.id; actorId = $Context.plan.actorId; sourceHead = $Context.plan.sourceHead; planSha256 = $Context.planSha256; oldRegistrySha256 = $Context.plan.oldRegistrySha256; newRegistrySha256 = $Context.plan.newRegistrySha256; newManifestSha256 = $Context.plan.newManifestSha256; targetUpdates = $Context.plan.targetUpdates; programsChanged = @('Common.ps1','Collector.ps1'); customerServicesChanged = $false} }
    New-WorkerUpdateScope $Context.scope
    $preimages = @(); $touched = @(); $taskUpdated = $false
    try {
        foreach ($name in $Context.files.Keys) { $state = $Context.states[$name]; $preimages += @{name = $name; sha256 = $state.sha256; sddl = $state.sddl}; [IO.File]::Copy($Context.files[$name],(Join-Path $Context.scope ($name + '.before')),$false) }
        [IO.File]::WriteAllText((Join-Path $Context.scope 'preimages.json'),($preimages | ConvertTo-Json -Depth 5 -Compress))
        [IO.File]::WriteAllText((Join-Path $Context.scope 'task.before.xml'),$Context.taskXml)
        [IO.File]::WriteAllText((Join-Path $Context.scope 'task.before.sddl'),$Context.taskSddl)
        [IO.File]::Copy((Join-Path $Context.plan.stagingRoot 'manifest.v1.json'),(Join-Path $Context.scope 'manifest.v1.json'),$false)
        Stop-EnrollmentTask $Context $Context.plan.oldRegistrySha256
        Assert-EnrollmentState $Context $false $Context.plan.oldRegistrySha256
        foreach ($name in @('Common.ps1','Collector.ps1','registry.v1.json')) {
            $digest = $Context.plan.newRegistrySha256; if ($name -cne 'registry.v1.json') { $digest = @($Context.after.files | Where-Object name -CEQ $name)[0].sha256 }
            $touched += $name; Replace-EnrollmentFile $Context $name (Join-Path $Context.plan.stagingRoot $name) $digest 'apply'
        }
        Assert-EnrollmentState $Context $true $Context.plan.oldRegistrySha256
        $taskUpdated = $true; Set-EnrollmentTaskDigest $Context $Context.plan.oldRegistrySha256 $Context.plan.newRegistrySha256
        $started = Get-WorkerUpdateNow; Start-ScheduledTask -TaskName $Context.taskName -TaskPath '\'
        $health = Wait-EnrollmentHealth $Context $Context.plan.newRegistrySha256 $started
        Assert-EnrollmentState $Context $true $Context.plan.newRegistrySha256
        $receipt = @{version = 1; status = 'succeeded'; id = $Context.plan.id; actorId = $Context.plan.actorId; sourceHead = $Context.plan.sourceHead; planSha256 = $Context.planSha256; oldRegistrySha256 = $Context.plan.oldRegistrySha256; newRegistrySha256 = $Context.plan.newRegistrySha256; newManifestSha256 = $Context.plan.newManifestSha256; credentialsPreserved = $true; fileSecurityPreserved = $true; taskDefinitionPreservedExceptRegistryDigest = $true; programsChanged = @('Common.ps1','Collector.ps1'); targetUpdates = $Context.plan.targetUpdates; health = $health; customerServicesChanged = $false}
    } catch {
        $code = 'enrollment-update-operation-failed'; if ($_.Exception.Message -match '^(?:enrollment|worker)-update-[a-z0-9-]+$') { $code = $_.Exception.Message }
        $recovery = 'manual-review-required'
        try {
            $taskDigest = $Context.plan.oldRegistrySha256
            if ($taskUpdated) { try { Assert-EnrollmentTask $Context $Context.plan.newRegistrySha256; $taskDigest = $Context.plan.newRegistrySha256 } catch { Assert-EnrollmentTask $Context $Context.plan.oldRegistrySha256 } }
            Stop-EnrollmentTask $Context $taskDigest
            foreach ($name in $touched) {
                $before = Join-Path $Context.scope ($name + '.before'); $current = Get-EnrollmentFileState $Context.files[$name]
                $newDigest = $Context.plan.newRegistrySha256; if ($name -cne 'registry.v1.json') { $newDigest = @($Context.after.files | Where-Object name -CEQ $name)[0].sha256 }
                if ($current.sha256 -cnotin @($Context.states[$name].sha256,$newDigest) -or (Get-WorkerUpdateHash $before) -cne $Context.states[$name].sha256) { throw 'enrollment-update-recovery-preimage-rejected' }
                Replace-EnrollmentFile $Context $name $before $Context.states[$name].sha256 'restore'
            }
            if ($taskDigest -cne $Context.plan.oldRegistrySha256) { Set-EnrollmentTaskDigest $Context $taskDigest $Context.plan.oldRegistrySha256 }
            Assert-EnrollmentState $Context $false $Context.plan.oldRegistrySha256
            $started = Get-WorkerUpdateNow; Start-ScheduledTask -TaskName $Context.taskName -TaskPath '\'
            $recoveryHealth = Wait-EnrollmentHealth $Context $Context.plan.oldRegistrySha256 $started
            Assert-EnrollmentState $Context $false $Context.plan.oldRegistrySha256
            $recovery = 'old-programs-registry-task-restored-and-healthy'
        } catch { }
        $receipt = @{version = 1; status = 'failed'; id = $Context.plan.id; actorId = $Context.plan.actorId; sourceHead = $Context.plan.sourceHead; planSha256 = $Context.planSha256; code = $code; recovery = $recovery; customerServicesChanged = $false}
    }
    Write-WorkerUpdateReceipt $Context $receipt; return $receipt
}
if ($requestedAction) {
    try { $value = Invoke-EnrollmentUpdate (Get-EnrollmentContext $requestedPlan $requestedDigest) $requestedAction; $value | ConvertTo-Json -Depth 8 -Compress; if ($value.status -eq 'failed') { exit 1 } }
    catch { $code = 'enrollment-update-operation-failed'; if ($_.Exception.Message -match '^(?:enrollment|worker)-update-[a-z0-9-]+$') { $code = $_.Exception.Message }; @{version = 1; status = 'failed'; code = $code; customerServicesChanged = $false} | ConvertTo-Json -Compress; exit 1 }
}
