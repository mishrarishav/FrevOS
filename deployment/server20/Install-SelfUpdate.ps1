# Called only inside the artifact-bound server20 activation boundary.
param([Parameter(Mandatory=$true)][string]$ActorSid)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
function New-SelfUpdateAcl([string]$ActorSid,[ValidateSet('none','read','modify')][string]$Access){
 # Create as the executing principal. Assigning ownership to a different SID at
 # creation needs a restore privilege that is not necessarily enabled in a task.
 $executionSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
 $acl=New-DirectoryAcl $executionSid 'Private'
 $inherit=[Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit
 if($ActorSid -cne $executionSid){[void]$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($ActorSid),[Security.AccessControl.FileSystemRights]::FullControl,$inherit,[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow))}
 if($Access -ne 'none'){
  $rights=if($Access -eq 'modify'){[Security.AccessControl.FileSystemRights]::Modify}else{[Security.AccessControl.FileSystemRights]::ReadAndExecute}
  [void]$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-19'),$rights,$inherit,[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow))
 }
 return $acl
}
$maintenance='E:\FrevOS\maintenance';$taskName='DevSetu-PlatformUpdater'
$exe=Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$arguments='-NoProfile -NonInteractive -WindowStyle Hidden -File "E:\FrevOS\maintenance\Run-SelfUpdate.ps1"'
$source=Join-Path $PSScriptRoot 'Run-SelfUpdate.ps1';$worker=Join-Path $maintenance 'Run-SelfUpdate.ps1'
if($env:COMPUTERNAME -cne 'DCAPP7' -or [Security.Principal.WindowsIdentity]::GetCurrent().User.Value -cne 'S-1-5-18'){throw 'Wrong updater installation boundary'}
if(Test-Path -LiteralPath $maintenance){
 Assert-NoReparsePath $maintenance
 $task=Get-ScheduledTask -TaskName $taskName
 if($task.Actions.Count -ne 1 -or $task.Actions[0].Execute -ine $exe -or $task.Actions[0].Arguments -cne $arguments -or $task.Principal.UserId -notin @('SYSTEM','S-1-5-18') -or (Get-FileHash -LiteralPath $worker).Hash -cne (Get-FileHash -LiteralPath $source).Hash){throw 'Installed updater ownership changed'}
 if($task.State -ne 'Running'){Start-ScheduledTask -TaskName $taskName}
 return
}
if(Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue){throw 'Updater task collision'}
foreach($relative in @('','private','requests','results')){
 $directory=if($relative){Join-Path $maintenance $relative}else{$maintenance}
 $access=if($relative -eq 'private'){'none'}elseif($relative -eq 'requests'){'modify'}else{'read'}
 $acl=New-SelfUpdateAcl $ActorSid $access
 [void][IO.Directory]::CreateDirectory($directory,$acl)
}
Copy-Item -LiteralPath $source -Destination $worker
$action=New-ScheduledTaskAction -Execute $exe -Argument $arguments
$principal=New-ScheduledTaskPrincipal -UserId 'S-1-5-18' -LogonType ServiceAccount -RunLevel Highest
$settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal -Settings $settings -Trigger (New-ScheduledTaskTrigger -AtStartup)|Out-Null
Start-ScheduledTask -TaskName $taskName
