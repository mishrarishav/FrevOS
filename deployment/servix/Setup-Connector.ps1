#requires -Version 5.1
param([switch]$NonInteractiveEnrollment,[switch]$ResumeEnrollment)
$ErrorActionPreference='Stop'
if($ResumeEnrollment -and -not $NonInteractiveEnrollment){throw 'Resume requires the existing paired enrollment reference'}
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'BuildProcess.psm1') -Force
Initialize-ServixBuildGroup
# Reuse the per-user scheduled-task lifecycle from the existing TrackGRN companion.
# This connector does not require administrator elevation or a server Windows password.
if($NonInteractiveEnrollment){
 $text=[Console]::In.ReadToEnd();if($text.Length -gt 32768){throw 'Enrollment input exceeds budget'}
 $enrollment=$text|ConvertFrom-Json;$text=$null
 if(@($enrollment.PSObject.Properties.Name|Sort-Object) -join ',' -cne 'paired,repository,server,username'){throw 'Invalid source enrollment envelope'}
 $server=[string]$enrollment.server;$serverUri=[uri]$server
 if($serverUri.Scheme -notin @('http','https') -or $serverUri.UserInfo -or $serverUri.Query -or $serverUri.Fragment -or $serverUri.AbsolutePath -ne '/'){throw 'Invalid server origin'}
 $git=(Get-Command git.exe -ErrorAction Stop).Source;$username=[string]$enrollment.username;$paired=$enrollment.paired
 if($paired.deviceId -cnotmatch '^fc_[a-f0-9]{32}$' -or $paired.credential -cnotmatch ('^'+$paired.deviceId+'\.[A-Za-z0-9_-]{43}$') -or $paired.profileId -cnotmatch '^[a-z][a-z0-9-]{2,63}$'){throw 'Invalid paired source'}
 $profileId=[string]$paired.profileId;$repository=[IO.Path]::GetFullPath([string]$enrollment.repository)
 if($env:COMPUTERNAME -ceq 'DCAPP9' -and ($repository -ieq 'D:\Servix' -or $repository.StartsWith('D:\Servix\',[StringComparison]::OrdinalIgnoreCase))){throw 'Production is excluded'}
 $clone=-not(Test-Path -LiteralPath (Join-Path $repository '.git'))
 if($clone -and (Test-Path -LiteralPath $repository) -and @(Get-ChildItem -LiteralPath $repository -Force).Count){throw 'Choose an empty new checkout or an existing Git checkout'}
 $enrollment=$null
}else{
$server=(Read-Host 'DevSetu server URL').TrimEnd('/')
$serverUri=[uri]$server
if($serverUri.Scheme -notin @('http','https') -or $serverUri.UserInfo -or $serverUri.Query -or $serverUri.Fragment -or $serverUri.AbsolutePath -ne '/'){throw 'Use the DevSetu server origin without credentials or a path'}
$username=Read-Host 'DevSetu username'
$inviteSecure=Read-Host 'Invitation code (leave empty if your account already exists)' -AsSecureString
$invite=[Net.NetworkCredential]::new('unused',$inviteSecure).Password
$secure=Read-Host 'Your DevSetu password (or choose a new password for the invitation)' -AsSecureString
$password=[Net.NetworkCredential]::new('unused',$secure).Password
$session=New-Object Microsoft.PowerShell.Commands.WebRequestSession
try{
 if($invite){Invoke-WebRequest ($server+'/v1/developers/redeem') -UseBasicParsing -Method Post -ContentType 'application/json' -Body (@{version=1;code=$invite;password=$password}|ConvertTo-Json -Compress)|Out-Null}
 Invoke-WebRequest ($server+'/auth/login') -UseBasicParsing -Method Post -ContentType 'application/json' -Headers @{Origin=$server} -WebSession $session -Body (@{username=$username;password=$password}|ConvertTo-Json -Compress)|Out-Null
}finally{$password=$null;$invite=$null;$secure=$null;$inviteSecure=$null}
$csrf=$session.Cookies.GetCookies([uri]$server)['frevos-internal-csrf'].Value
$profiles=@(((Invoke-WebRequest ($server+'/v1/workspaces/ws_server20/deployment-settings') -UseBasicParsing -WebSession $session).Content|ConvertFrom-Json)|Where-Object {$_.runner -cne 'devsetu-platform' -and (-not ($_.PSObject.Properties.Name -contains 'archived') -or -not $_.archived)})
$pipelines=(Invoke-WebRequest ($server+'/v1/workspaces/ws_server20/component-deployments') -UseBasicParsing -WebSession $session).Content|ConvertFrom-Json
$profiles=@($profiles|Where-Object {$_.profileId -cnotin @($pipelines.profiles.profileId)})+@($pipelines.profiles|Where-Object {-not $_.archived})
if(-not $profiles.Count){throw 'Create a project in DevSetu Projects configuration first'}
Add-Type -AssemblyName System.Windows.Forms
$form=New-Object Windows.Forms.Form;$form.Text='DevSetu - connect a project';$form.Width=650;$form.Height=240;$form.StartPosition='CenterScreen'
$label=New-Object Windows.Forms.Label;$label.Text='Project';$label.SetBounds(16,16,600,24)
$projects=New-Object Windows.Forms.ComboBox;$projects.DropDownStyle='DropDownList';$projects.SetBounds(16,42,600,28)
foreach($profile in $profiles){[void]$projects.Items.Add($profile.displayName+' ['+$profile.profileId+']')}
$folder=New-Object Windows.Forms.TextBox;$folder.SetBounds(16,104,500,28)
$folderLabel=New-Object Windows.Forms.Label;$folderLabel.Text='Local Git folder (choose this laptop''s code folder)';$folderLabel.SetBounds(16,78,600,24)
$browse=New-Object Windows.Forms.Button;$browse.Text='Browse...';$browse.SetBounds(524,102,90,30)
$browse.Add_Click({$dialog=New-Object Windows.Forms.FolderBrowserDialog;$dialog.Description='Choose your local project Git checkout';$dialog.SelectedPath=$folder.Text;if($dialog.ShowDialog() -eq 'OK'){$folder.Text=$dialog.SelectedPath};$dialog.Dispose()})
$projects.Add_SelectedIndexChanged({$folder.Text=[string]$profiles[$projects.SelectedIndex].sourceFolder})
$projects.SelectedIndex=0
$connect=New-Object Windows.Forms.Button;$connect.Text='Connect project';$connect.SetBounds(446,150,168,32);$connect.DialogResult='OK';$form.AcceptButton=$connect
$form.Controls.AddRange(@($label,$projects,$folderLabel,$folder,$browse,$connect))
try{if($form.ShowDialog() -ne 'OK'){throw 'Setup cancelled'};$profileId=[string]$profiles[$projects.SelectedIndex].profileId;$repository=[IO.Path]::GetFullPath($folder.Text)}finally{$form.Dispose()}
if($env:COMPUTERNAME -ceq 'DCAPP9' -and ($repository -ieq 'D:\Servix' -or $repository.StartsWith('D:\Servix\',[StringComparison]::OrdinalIgnoreCase))){throw 'Production is excluded'}
$clone=-not(Test-Path -LiteralPath (Join-Path $repository '.git'))
if($clone -and $profileId -cne 'servix-development' -and $profileId -cnotin @($pipelines.profiles.profileId)){throw 'Choose an existing Git checkout for this project'}
if($clone -and (Test-Path -LiteralPath $repository) -and @(Get-ChildItem -LiteralPath $repository -Force).Count){throw 'For a new checkout choose an empty folder'}
$readinessText= & (Join-Path $PSScriptRoot 'node.exe') (Join-Path $PSScriptRoot 'SystemSetup.cjs') --repository $repository
if($LASTEXITCODE -ne 0){throw 'System check was cancelled or required tools are not ready'}
$readiness=$readinessText|ConvertFrom-Json
if(-not $readiness.ready){throw 'Complete the system check before pairing'}
$env:PATH=[Environment]::GetEnvironmentVariable('PATH','Machine')+';'+[Environment]::GetEnvironmentVariable('PATH','User')+';'+$env:PATH
$git=(Get-Command git.exe -ErrorAction Stop).Source
$pair=Invoke-WebRequest ($server+'/v1/workspaces/ws_server20/connectors/pair') -UseBasicParsing -Method Post -ContentType 'application/json' -Headers @{Origin=$server;'x-csrf-token'=$csrf} -WebSession $session -Body (@{version=1;name=$env:COMPUTERNAME;profileId=$profileId}|ConvertTo-Json -Compress)
$paired=$pair.Content|ConvertFrom-Json
}
$repositoryOrigin=[string]$paired.repositoryOrigin
$central=($paired.PSObject.Properties.Name -contains 'centralRepository')
if(-not $clone -and $profileId -cne 'servix-development' -and -not $central){
 $remote=(& $git -C $repository remote get-url origin 2>$null)
 if($LASTEXITCODE -ne 0 -or $remote.Trim() -cnotin @($paired.repositoryOrigins)){
  Invoke-WebRequest ($server+'/v1/workspaces/ws_server20/connectors/'+$paired.deviceId+'/revoke') -UseBasicParsing -Method Post -ContentType 'application/json' -Headers @{Origin=$server;'x-csrf-token'=$csrf} -WebSession $session -Body '{}'|Out-Null
  throw 'The selected checkout does not match your authorized repository'
 }
 $repositoryOrigin=$remote.Trim()
}
if([string]::IsNullOrWhiteSpace($repositoryOrigin)){throw 'Repository profile is missing'}
$install=Join-Path $env:LOCALAPPDATA 'FrevOS\Connector'
[void][IO.Directory]::CreateDirectory($install)
$destination=Join-Path $install $paired.deviceId
if(Test-Path -LiteralPath $destination){
 if(-not $ResumeEnrollment -or (Test-Path -LiteralPath (Join-Path $destination 'device.dpapi'))){throw 'Device installation collision'}
 foreach($name in @('Connector.cjs','Preservation.cjs','Choose-Repository.ps1','RepositoryPicker.psm1','FrevOS.FolderPicker.exe','Run-Connector.ps1','BuildProcess.psm1','LocalDevelopment.cjs','LocalDevBoundary.cjs','Run-LocalDevService.ps1','LocalDevProcesses.ps1','EnvironmentEditor.cjs','Write-LocalEnvironment.ps1','DiscoverySafety.cjs','SystemDiscovery.cjs','FolderBrowse.cjs','Browse-Folders.ps1','SystemPrerequisites.cjs','SystemSetup.cjs','NodeToolchain.cjs','node.exe')){if((Get-FileHash -LiteralPath (Join-Path $destination $name)).Hash -cne (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $name)).Hash){throw 'Interrupted installation bytes changed'}}
}else{[void][IO.Directory]::CreateDirectory($destination)}
function Copy-ReviewedRuntimeFile([string]$Name){
 if($Name -cnotmatch '^[A-Za-z0-9][A-Za-z0-9.-]+$'){throw 'Runtime sidecar name differs'}
 $source=Join-Path $PSScriptRoot $Name;$target=Join-Path $destination $Name
 # Materialize the reviewed bytes into the new private installation; retain the
 # original download's Zone.Identifier and the machine's execution policy.
 $bytes=[IO.File]::ReadAllBytes($source);[IO.File]::WriteAllBytes($target,$bytes)
 if((Get-FileHash -LiteralPath $target).Hash -cne (Get-FileHash -LiteralPath $source).Hash){throw 'Installed runtime bytes differ'}
}
foreach($name in @('Connector.cjs','Preservation.cjs','Choose-Repository.ps1','RepositoryPicker.psm1','FrevOS.FolderPicker.exe','Run-Connector.ps1','BuildProcess.psm1','LocalDevelopment.cjs','LocalDevBoundary.cjs','Run-LocalDevService.ps1','LocalDevProcesses.ps1','EnvironmentEditor.cjs','Write-LocalEnvironment.ps1','DiscoverySafety.cjs','SystemDiscovery.cjs','FolderBrowse.cjs','Browse-Folders.ps1','SystemPrerequisites.cjs','SystemSetup.cjs','NodeToolchain.cjs','node.exe')){Copy-ReviewedRuntimeFile $name}
foreach($name in @('FileAudit.cjs','Read-WindowsFileAudit.ps1','Protect-SetupSession.ps1','DotNetToolchain.cjs','SystemSetupClient.js','SetupSession.cjs','npm','npm.cmd','npx','npx.cmd')){
 $target=Join-Path $destination $name
 if($ResumeEnrollment -and (Test-Path -LiteralPath $target) -and (Get-FileHash -LiteralPath $target).Hash -cne (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $name)).Hash){throw 'Interrupted audit collector bytes changed'}
 Copy-ReviewedRuntimeFile $name
}
$npmSource=Join-Path $PSScriptRoot 'node_modules\npm';$npmDestination=Join-Path $destination 'node_modules\npm'
if(Test-Path -LiteralPath $npmDestination){
 foreach($file in Get-ChildItem -LiteralPath $npmSource -Recurse -File){$relative=$file.FullName.Substring($npmSource.Length+1);if((Get-FileHash -LiteralPath $file.FullName).Hash -cne (Get-FileHash -LiteralPath (Join-Path $npmDestination $relative)).Hash){throw 'Interrupted npm runtime bytes changed'}}
 if(@(Get-ChildItem -LiteralPath $npmSource -Recurse -File).Count -ne @(Get-ChildItem -LiteralPath $npmDestination -Recurse -File).Count){throw 'Interrupted npm runtime inventory changed'}
}else{[void][IO.Directory]::CreateDirectory((Join-Path $destination 'node_modules'));Copy-Item -LiteralPath $npmSource -Destination (Join-Path $destination 'node_modules') -Recurse}
$configFields=@{version=1;server=$server;allowInternalHttp=($serverUri.Scheme -ceq 'http');deviceId=$paired.deviceId;credential=$paired.credential;profileId=$profileId;repository=$repository;repositoryOrigin=$repositoryOrigin;git=$git;stateRoot=(Join-Path $destination 'state')}
if($central){$configFields.centralRepository=$paired.centralRepository}
$config=$configFields|ConvertTo-Json -Compress
if($clone -or $profileId -ceq 'servix-development' -or $central){
 $mode=if($clone){'--initialize'}else{'--bind'}
 $info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=Join-Path $destination 'node.exe';$info.Arguments='"'+(Join-Path $destination 'Connector.cjs')+'" '+$mode;$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true
 $child=[Diagnostics.Process]::new();$child.StartInfo=$info
 $configBytes=[Text.UTF8Encoding]::new($false).GetBytes($config)
 try{[void]$child.Start();$child.StandardInput.BaseStream.Write($configBytes,0,$configBytes.Length);$child.StandardInput.Close();if(-not $child.WaitForExit(240000)){$child.Kill();throw 'Checkout download timed out'};if($child.ExitCode -ne 0){throw 'Checkout could not be connected to server20; existing files were not replaced'}}catch{if(-not $NonInteractiveEnrollment){Invoke-WebRequest ($server+'/v1/workspaces/ws_server20/connectors/'+$paired.deviceId+'/revoke') -UseBasicParsing -Method Post -ContentType 'application/json' -Headers @{Origin=$server;'x-csrf-token'=$csrf} -WebSession $session -Body '{}'|Out-Null};throw}finally{[Array]::Clear($configBytes,0,$configBytes.Length);$child.Dispose()}
}
if(-not $NonInteractiveEnrollment){
 $projectCheckText= & (Join-Path $destination 'node.exe') (Join-Path $destination 'SystemSetup.cjs') --check $repository
 if($LASTEXITCODE -ne 0){throw 'Project system check failed'}
 $projectCheck=$projectCheckText|ConvertFrom-Json
 if(@($projectCheck.blocked).Count -gt 0 -or @($projectCheck.tools|Where-Object {$_.status -cne 'ready'}).Count -gt 0){
  $reviewArguments=@('--repository',$repository);if($readiness.discoveryConsent){$reviewArguments+='--initial-consent'}
  $readinessText= & (Join-Path $destination 'node.exe') (Join-Path $destination 'SystemSetup.cjs') @reviewArguments
  if($LASTEXITCODE -ne 0){throw 'Complete project prerequisite review before starting the connector'}
  $readiness=$readinessText|ConvertFrom-Json
  if(-not $readiness.ready){throw 'Project prerequisites are not ready'}
 }
}
if(-not $NonInteractiveEnrollment -and $readiness.discoveryConsent){
 [void][IO.Directory]::CreateDirectory((Join-Path $destination 'state'))
 [IO.File]::WriteAllText((Join-Path $destination 'state\discovery-consent.json'),(@{version=1;deviceId=$paired.deviceId;metadata=$true;approvedAt=[DateTimeOffset]::UtcNow.ToString('o')}|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))
 Invoke-WebRequest ($server+'/v1/workspaces/ws_server20/discovery/policy') -UseBasicParsing -Method Post -ContentType 'application/json' -Headers @{Origin=$server;'x-csrf-token'=$csrf} -WebSession $session -Body (@{version=1;deviceId=$paired.deviceId;expectedRevision=0;policy=$readiness.discoveryPolicy}|ConvertTo-Json -Depth 5 -Compress)|Out-Null
}
$branch=(& $git -C $repository symbolic-ref --short HEAD 2>$null)
if($LASTEXITCODE -ne 0){throw 'Select an existing local branch before setup'}
if($branch.Trim() -in @('main','master')){& $git -C $repository switch -c ('frevos/'+$paired.deviceId);if($LASTEXITCODE -ne 0){throw 'Could not create a dedicated development branch'}}
$gitName=& $git -C $repository config --get user.name
if($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($gitName)){& $git -C $repository config user.name $username;if($LASTEXITCODE -ne 0){throw 'Could not configure the local commit author'}}
$gitEmail=& $git -C $repository config --get user.email
if($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($gitEmail)){& $git -C $repository config user.email ($username+'@frevos.invalid');if($LASTEXITCODE -ne 0){throw 'Could not configure the local commit identity'}}
Add-Type -AssemblyName System.Security
$bytes=[Text.UTF8Encoding]::new($false).GetBytes($config)
try{[IO.File]::WriteAllBytes((Join-Path $destination 'device.dpapi'),[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))}finally{[Array]::Clear($bytes,0,$bytes.Length);$config=$null;$paired=$null;$pair=$null}
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
$taskName='FrevOS-Connector-'+(Split-Path $destination -Leaf)
$action=New-ScheduledTaskAction -Execute (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe') -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File "'+(Join-Path $destination 'Run-Connector.ps1')+'"')
$principal=New-ScheduledTaskPrincipal -UserId $identity.Name -LogonType Interactive -RunLevel Limited
$settings=New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
$logon=New-ScheduledTaskTrigger -AtLogOn -User $identity.Name
# Restart-on-failure alone misses interrupted processes reported as completed by Windows.
# IgnoreNew makes this an idle-task recovery check, never a second connector process.
$recovery=New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal -Trigger @($logon,$recovery) -Settings $settings|Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Host 'Connected. In DevSetu select this device and click Deploy. Revoke an old laptop from DevSetu.'
@{status='PASS';deviceId=(Split-Path $destination -Leaf);installation=$destination;taskName=$taskName}|ConvertTo-Json -Compress
