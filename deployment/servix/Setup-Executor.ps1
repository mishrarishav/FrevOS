#requires -Version 5.1
param([switch]$NonInteractiveEnrollment)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
Add-Type -AssemblyName System.Windows.Forms;Add-Type -AssemblyName System.Security
if($NonInteractiveEnrollment){
 $text=[Console]::In.ReadToEnd();if($text.Length -gt 65536){throw 'Enrollment input exceeds budget'}
 $enrollment=$text|ConvertFrom-Json;$text=$null
 if(@($enrollment.PSObject.Properties.Name|Sort-Object) -join ',' -cne 'binding,paired,profileId,recipe,role,server'){throw 'Invalid enrollment envelope'}
 $server=[string]$enrollment.server;$uri=[uri]$server
 if($uri.Scheme -notin @('http','https') -or $uri.UserInfo -or $uri.Query -or $uri.Fragment -or $uri.AbsolutePath -ne '/'){throw 'Invalid server origin'}
 $profileId=[string]$enrollment.profileId;$role=[string]$enrollment.role;$recipe=[string]$enrollment.recipe
 if($profileId -cnotmatch '^[a-z][a-z0-9-]{2,63}$' -or $role -cnotin @('builder','destination') -or $recipe -cnotin @('npm-static','node-source','dotnet-publish','devsetu-native')){throw 'Invalid enrollment role'}
 $binding=@{};foreach($property in $enrollment.binding.PSObject.Properties){$binding[$property.Name]=$property.Value}
 $paired=$enrollment.paired
 if($paired.id -cnotmatch '^ex_[a-f0-9]{32}$' -or $paired.credential -cnotmatch ('^'+$paired.id+'\.[A-Za-z0-9_-]{43}$')){throw 'Invalid paired executor'}
 $root=[IO.Path]::GetFullPath([string]$binding.root)
 if($root -ieq [IO.Path]::GetPathRoot($root) -or (Get-Item -LiteralPath $root).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Choose a specific plain folder'}
 if($env:COMPUTERNAME -ceq 'DCAPP9' -and ($root -ieq 'D:\Servix' -or $root.StartsWith('D:\Servix\',[StringComparison]::OrdinalIgnoreCase))){throw 'Production is excluded'}
 $identity=[Security.Principal.WindowsIdentity]::GetCurrent();$admin=([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
 if(($role -ceq 'builder' -and $admin) -or ($role -ceq 'destination' -and -not $admin)){throw 'Enrollment execution identity does not match the selected role'}
 $enrollment=$null
}else{
$server=(Read-Host 'DevSetu server URL').TrimEnd('/');$uri=[uri]$server
if($uri.Scheme -notin @('http','https') -or $uri.UserInfo -or $uri.Query -or $uri.Fragment -or $uri.AbsolutePath -ne '/'){throw 'Use a server origin without credentials or a path'}
$username=Read-Host 'DevSetu username';$secure=Read-Host 'DevSetu password' -AsSecureString
$session=New-Object Microsoft.PowerShell.Commands.WebRequestSession
try{$password=[Net.NetworkCredential]::new('unused',$secure).Password;Invoke-WebRequest ($server+'/auth/login') -UseBasicParsing -WebSession $session -Method Post -ContentType 'application/json' -Headers @{Origin=$server} -Body (@{username=$username;password=$password}|ConvertTo-Json -Compress)|Out-Null}finally{$password=$null;$secure=$null}
$csrf=$session.Cookies.GetCookies([uri]$server)['frevos-internal-csrf'].Value
$state=(Invoke-WebRequest ($server+'/v1/workspaces/ws_server20/component-deployments') -UseBasicParsing -WebSession $session).Content|ConvertFrom-Json
$profiles=@($state.profiles|Where-Object {-not $_.archived});if(-not $profiles.Count){throw 'Save a component project in DevSetu first'}
$form=New-Object Windows.Forms.Form;$form.Text='DevSetu System connector - build or destination';$form.Width=650;$form.Height=290;$form.StartPosition='CenterScreen'
$projects=New-Object Windows.Forms.ComboBox;$projects.DropDownStyle='DropDownList';$projects.SetBounds(16,20,600,28);foreach($profile in $profiles){[void]$projects.Items.Add($profile.displayName+' ['+$profile.profileId+']')};$projects.SelectedIndex=0
$roles=New-Object Windows.Forms.ComboBox;$roles.DropDownStyle='DropDownList';$roles.SetBounds(16,64,600,28);[void]$roles.Items.Add('Build system (unprivileged user)');[void]$roles.Items.Add('Destination server');$roles.SelectedIndex=0
$recipes=New-Object Windows.Forms.ComboBox;$recipes.DropDownStyle='DropDownList';$recipes.SetBounds(16,108,600,28);foreach($recipe in @('npm-static','node-source','dotnet-publish','devsetu-native')){[void]$recipes.Items.Add($recipe)};$recipes.SelectedIndex=0
$label=New-Object Windows.Forms.Label;$label.SetBounds(16,150,600,40);$label.Text='A source connector is installed with Setup.cmd. This setup enrolls one local build or destination binding; run it again for another binding.'
$connect=New-Object Windows.Forms.Button;$connect.SetBounds(420,202,196,32);$connect.Text='Configure this system';$connect.DialogResult='OK';$form.AcceptButton=$connect;$form.Controls.AddRange(@($projects,$roles,$recipes,$label,$connect))
try{if($form.ShowDialog() -ne 'OK'){return};$profileId=[string]$profiles[$projects.SelectedIndex].profileId;$role=if($roles.SelectedIndex -eq 0){'builder'}else{'destination'};$recipe=[string]$recipes.SelectedItem}finally{$form.Dispose()}
$identity=[Security.Principal.WindowsIdentity]::GetCurrent();$admin=([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if($role -ceq 'builder' -and $admin){throw 'Run build-system setup without administrator elevation; customer build scripts must not run as administrator'}
if($role -ceq 'destination' -and -not $admin){throw 'Destination setup requires administrator elevation once to install its always-on SYSTEM worker'}
$bindingId=(Read-Host 'Binding ID (e.g. frontend, api, platform)').Trim();if($bindingId -cnotmatch '^[a-z][a-z0-9-]{2,63}$'){throw 'Invalid binding ID'}
$dialog=New-Object Windows.Forms.FolderBrowserDialog;$dialog.Description=if($role -ceq 'builder'){'Choose an empty build workspace'}else{'Choose this component destination folder'}
try{if($dialog.ShowDialog() -ne 'OK'){return};$root=[IO.Path]::GetFullPath($dialog.SelectedPath)}finally{$dialog.Dispose()}
if($root -ieq [IO.Path]::GetPathRoot($root) -or (Get-Item -LiteralPath $root).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Choose a specific plain folder'}
if($env:COMPUTERNAME -ceq 'DCAPP9' -and ($root -ieq 'D:\Servix' -or $root.StartsWith('D:\Servix\',[StringComparison]::OrdinalIgnoreCase))){throw 'Production is excluded'}
$health=if($role -ceq 'destination'){Read-Host 'Health check URL for this component'}else{$server+'/health'}
$binding=@{id=$bindingId;root=$root;healthUrl=$health;recipes=@($recipe);runtime=@{kind='none'}}
if($role -ceq 'destination' -and $recipe -cne 'devsetu-native'){
 $taskName=Read-Host 'Existing owned runtime scheduled task name (blank for static files / externally managed runtime)'
 if($taskName){$ownedTask=Get-ScheduledTask -TaskName $taskName -TaskPath '\';$actions=@($ownedTask.Actions|ForEach-Object {[ordered]@{execute=$_.Execute;arguments=$_.Arguments;workingDirectory=$_.WorkingDirectory}})|ConvertTo-Json -Compress
  if(-not $actions.ToLowerInvariant().Contains($root.Replace('\','\\').ToLowerInvariant())){throw 'Task does not identify this destination folder'}
  $binding.runtime=@{kind='windows-task';taskName=$taskName;actionSha256=([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($actions)))).Replace('-','').ToLowerInvariant()}
 }
}
if($recipe -ceq 'devsetu-native'){
 if($role -ceq 'builder'){$baseline=Read-Host 'Existing platform installation root (read-only baseline, local or authenticated UNC path)';$pnpm=(Get-Command pnpm.cmd).Source;$pnpmCli=Join-Path (Split-Path $pnpm) 'node_modules\pnpm\bin\pnpm.mjs';if(-not(Test-Path -LiteralPath $pnpmCli)){throw 'Pinned pnpm CLI unavailable; install no software automatically'};$binding.nativeOptions=@{baselineRoot=$baseline;pnpmCli=$pnpmCli}}
 else{$binding.nativeOptions=@{installationRoot=$root}}
 if($role -ceq 'builder'){$shortOutput=Read-Host 'Short local release output directory (existing specific folder, avoids Windows path limits)';$outputRoot=[IO.Path]::GetFullPath($shortOutput);if($outputRoot -ieq [IO.Path]::GetPathRoot($outputRoot) -or -not(Test-Path -LiteralPath $outputRoot -PathType Container) -or (Get-Item -LiteralPath $outputRoot).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Choose an existing plain output folder'};$binding.nativeOptions.releaseOutputRoot=$outputRoot}
 $binding.nativeOptions.artifactStore=Read-Host 'Enrolled immutable artifact directory (authenticated UNC on builder; corresponding local directory on destination)'
}
$paired=(Invoke-WebRequest ($server+'/v1/workspaces/ws_server20/component-deployments/executors') -UseBasicParsing -WebSession $session -Method Post -ContentType 'application/json' -Headers @{Origin=$server;'x-csrf-token'=$csrf} -Body (@{profileId=$profileId;role=$role;name=($env:COMPUTERNAME+' / '+$bindingId)}|ConvertTo-Json -Compress)).Content|ConvertFrom-Json
}
$installBase=if($role -ceq 'destination'){$env:ProgramData}else{$env:LOCALAPPDATA}
$install=Join-Path $installBase ('DevSetu\Executors\'+$paired.id);if(Test-Path -LiteralPath $install){throw 'Installation collision'}
[void][IO.Directory]::CreateDirectory($install)
$acl=Get-Acl -LiteralPath $install;$acl.SetAccessRuleProtection($true,$false)
$permitted=if($role -ceq 'destination'){@('S-1-5-18','S-1-5-32-544')}else{@($identity.User.Value,'S-1-5-18','S-1-5-32-544')}
foreach($sid in $permitted|Select-Object -Unique){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))}
if($role -ceq 'destination'){$acl.SetOwner([Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'))}
Set-Acl -LiteralPath $install -AclObject $acl
foreach($name in @('ComponentExecutor.cjs','ComponentRuntime.ps1','ComponentPlatform.ps1','NativePlatform.cjs','Preservation.cjs','Run-Executor.ps1','BuildProcess.psm1','node.exe','New-ServixDashboardRelease.ps1','HttpCommon.ps1','Verify-HttpManifest.mjs','Apply-ServixDashboard.ps1','Start-Server20.ps1','Install-SelfUpdate.ps1','Run-SelfUpdate.ps1')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $install}
if($recipe -ceq 'devsetu-native'){$binding.nativeAdapter=@{file=(Join-Path $install 'NativePlatform.cjs');sha256=(Get-FileHash -LiteralPath (Join-Path $install 'NativePlatform.cjs')).Hash.ToLowerInvariant()}}
$config=@{version=1;server=$server;allowInternalHttp=($uri.Scheme -ceq 'http');id=$paired.id;credential=$paired.credential;profileId=$profileId;role=$role;stateRoot=(Join-Path $install 'state');bindings=@($binding)}
if($role -ceq 'builder'){$config.git=(Get-Command git.exe).Source;$npm=Get-Command npm.cmd -ErrorAction SilentlyContinue;if($npm){$config.npmCli=Join-Path (Split-Path $npm.Source) 'node_modules\npm\bin\npm-cli.js'};$dotnet=Get-Command dotnet.exe -ErrorAction SilentlyContinue;if($dotnet){$config.dotnet=$dotnet.Source}}
$validation=[Diagnostics.ProcessStartInfo]::new();$validation.FileName=Join-Path $install 'node.exe';$validation.Arguments='"'+(Join-Path $install 'ComponentExecutor.cjs')+'" --validate';$validation.UseShellExecute=$false;$validation.CreateNoWindow=$true;$validation.RedirectStandardInput=$true
$validator=[Diagnostics.Process]::new();$validator.StartInfo=$validation
try{[void]$validator.Start();$validator.StandardInput.Write(($config|ConvertTo-Json -Depth 8 -Compress));$validator.StandardInput.Close();if(-not $validator.WaitForExit(15000)){$validator.Kill();throw 'Enrollment validation timed out'};if($validator.ExitCode -ne 0){throw 'Enrollment validation failed'}}finally{$validator.Dispose()}
$scope=if($role -ceq 'destination'){[Security.Cryptography.DataProtectionScope]::LocalMachine}else{[Security.Cryptography.DataProtectionScope]::CurrentUser}
[IO.File]::WriteAllText((Join-Path $install 'executor-scope.txt'),[string]$scope)
$bytes=[Text.UTF8Encoding]::new($false).GetBytes(($config|ConvertTo-Json -Depth 8 -Compress));try{[IO.File]::WriteAllBytes((Join-Path $install 'executor.dpapi'),[Security.Cryptography.ProtectedData]::Protect($bytes,$null,$scope))}finally{[Array]::Clear($bytes,0,$bytes.Length);$paired=$null;$config=$null}
$name='DevSetu-Executor-'+(Split-Path $install -Leaf);$action=New-ScheduledTaskAction -Execute (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe') -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File "'+(Join-Path $install 'Run-Executor.ps1')+'"')
$principal=if($role -ceq 'destination'){New-ScheduledTaskPrincipal -UserId 'S-1-5-18' -LogonType ServiceAccount -RunLevel Highest}else{New-ScheduledTaskPrincipal -UserId $identity.Name -LogonType Interactive -RunLevel Limited}
$settings=New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
$triggers=@($(if($role -ceq 'destination'){New-ScheduledTaskTrigger -AtStartup}else{New-ScheduledTaskTrigger -AtLogOn -User $identity.Name}),(New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)))
Register-ScheduledTask -TaskName $name -Action $action -Principal $principal -Settings $settings -Trigger $triggers|Out-Null;Start-ScheduledTask -TaskName $name
Write-Host 'Connected. Select this build/destination connection in Projects > Components and save. The dashboard shows its live status.'
@{status='PASS';executorId=(Split-Path $install -Leaf);role=$role;installation=$install;taskName=$name}|ConvertTo-Json -Compress
