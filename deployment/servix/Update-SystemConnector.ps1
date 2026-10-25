#requires -Version 5.1
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
$text=[Console]::In.ReadToEnd();if($text.Length -gt 8192){throw 'Update input capacity'};$request=$text|ConvertFrom-Json;$text=$null
if((@($request.PSObject.Properties.Name|Sort-Object)-join ',') -cne 'bundle,deviceId,manifestSha256,server,username' -or $request.deviceId -cnotmatch '^fc_[a-f0-9]{32}$' -or $request.manifestSha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'Update scope differs'}
$root=Join-Path $env:LOCALAPPDATA ('FrevOS\Connector\'+$request.deviceId)
$names=@('node.exe','Connector.cjs','Preservation.cjs','SystemDiscovery.cjs','DiscoverySafety.cjs','FileAudit.cjs','Read-WindowsFileAudit.ps1','FolderBrowse.cjs','Browse-Folders.ps1','Run-Connector.ps1','BuildProcess.psm1','Install-SystemConnector.ps1')
function Assert-Plain([string]$file){for($p=[IO.Path]::GetFullPath($file);;){$item=Get-Item -LiteralPath $p -Force;if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked update path'};$parent=[IO.Path]::GetDirectoryName($p);if(-not $parent -or $parent -ceq $p){break};$p=$parent}}
function Read-Config([string]$file){Assert-Plain $file;$clear=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($file),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);try{$c=[Text.Encoding]::UTF8.GetString($clear)|ConvertFrom-Json;if($c.mode -cne 'system' -or $c.deviceId -cne $request.deviceId -or $c.server -cne $request.server -or $c.accountName -cne $request.username -or $c.stateRoot -ine (Join-Path $root 'state')){throw 'Protected update scope differs'};return $c}finally{[Array]::Clear($clear,0,$clear.Length)}}
function Verify-Runtime([string]$folder,[string]$hash){
 $manifest=Join-Path $folder 'system-runtime-manifest.json';Assert-Plain $manifest
 if((Get-Item -LiteralPath $manifest).Length -gt 16384 -or (Get-FileHash -LiteralPath $manifest -Algorithm SHA256).Hash.ToLowerInvariant() -cne $hash){throw 'Update manifest differs'}
 $m=Get-Content -LiteralPath $manifest -Encoding UTF8 -Raw|ConvertFrom-Json
 if($m.version -ne 1 -or (@($m.files.PSObject.Properties.Name|Sort-Object)-join ',') -cne (@($names|Sort-Object)-join ',')){throw 'Update file set differs'}
 foreach($n in $names){$file=Join-Path $folder $n;Assert-Plain $file;if($m.files.$n -cnotmatch '^[a-f0-9]{64}$' -or (Get-Item -LiteralPath $file).Length -gt 150000000 -or (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -cne $m.files.$n){throw 'Update file integrity differs'}}
}
function Replace-Owned([string]$source,[string]$target){
 Assert-Plain $source;Assert-Plain $target
 $temporary=$target+'.'+[guid]::NewGuid().ToString('N')+'.update';$backup=$temporary+'.previous'
 $bytes=[IO.File]::ReadAllBytes($source)
 $stream=[IO.File]::Open($temporary,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
 try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
 [IO.File]::Replace($temporary,$target,$backup)
 Assert-Plain $backup;[IO.File]::Delete($backup)
 if([IO.Path]::GetExtension($target) -cin @('.ps1','.psm1','.exe')){if(Get-Item -LiteralPath $target -Stream Zone.Identifier -ErrorAction SilentlyContinue){Remove-Item -LiteralPath $target -Stream Zone.Identifier -Force}}
}
Add-Type -AssemblyName System.Security;Assert-Plain $root;Assert-Plain (Join-Path $root 'state')
$config=Read-Config (Join-Path $root 'device.dpapi')
$identity=[Security.Principal.WindowsIdentity]::GetCurrent();$taskName='FrevOS-Connector-'+$request.deviceId;$task=Get-ScheduledTask -TaskName $taskName
$owner=$task.Principal.UserId;if($owner -notmatch '^S-1-'){$owner=([Security.Principal.NTAccount]::new($owner)).Translate([Security.Principal.SecurityIdentifier]).Value}
$execute=Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe';$arguments='-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File "'+(Join-Path $root 'Run-Connector.ps1')+'"'
if($task.Actions.Count -ne 1 -or $task.Actions[0].Execute -ine $execute -or $task.Actions[0].Arguments -cne $arguments -or $owner -cne $identity.User.Value -or $task.Principal.RunLevel -cne 'Limited' -or $task.Principal.LogonType -cne 'Interactive'){throw 'Update task identity differs'}
function Stop-Owned {Disable-ScheduledTask -TaskName $taskName|Out-Null;if((Get-ScheduledTask -TaskName $taskName).State -ceq 'Running'){Stop-ScheduledTask -TaskName $taskName};$deadline=[DateTime]::UtcNow.AddSeconds(20);while((Get-ScheduledTask -TaskName $taskName).State -ceq 'Running'){if([DateTime]::UtcNow -gt $deadline){throw 'Update task did not stop'};Start-Sleep -Milliseconds 200}}
$journal=Join-Path $root 'update-transaction.json'
function Restore-Pending {
 Assert-Plain $journal;if((Get-Item -LiteralPath $journal).Length -gt 4096){throw 'Update journal capacity'};$j=Get-Content -LiteralPath $journal -Encoding UTF8 -Raw|ConvertFrom-Json
 if((@($j.PSObject.Properties.Name|Sort-Object)-join ',') -cne 'deviceId,folder,newHash,oldHash,version' -or $j.version -ne 1 -or $j.deviceId -cne $request.deviceId -or $j.folder -cnotmatch '^update-[a-f0-9]{32}$' -or $j.oldHash -cnotmatch '^[a-f0-9]{64}$' -or $j.newHash -cnotmatch '^[a-f0-9]{64}$'){throw 'Update journal differs'}
 $backup=Join-Path (Join-Path $root $j.folder) 'previous';$old=Read-Config (Join-Path $backup 'device.dpapi')
 if($old.runtimeManifestSha256 -cne $j.oldHash -or $old.credential -cne $config.credential -or $config.runtimeManifestSha256 -cnotin @($j.oldHash,$j.newHash)){throw 'Update recovery differs'}
 Verify-Runtime $backup $j.oldHash;Stop-Owned
 foreach($n in @($names)+@('system-runtime-manifest.json','device.dpapi')){Replace-Owned (Join-Path $backup $n) (Join-Path $root $n)}
 Verify-Runtime $root $j.oldHash;Enable-ScheduledTask -TaskName $taskName|Out-Null;Start-ScheduledTask -TaskName $taskName;[IO.File]::Delete($journal)
}
if(Test-Path -LiteralPath $journal){Restore-Pending;$config=Read-Config (Join-Path $root 'device.dpapi')}
if(-not (Get-ScheduledTask -TaskName $taskName).Settings.Enabled){throw 'Existing connector task is disabled'}
Verify-Runtime $root $config.runtimeManifestSha256
if($config.runtimeManifestSha256 -ceq $request.manifestSha256){[Console]::Out.Write('{"updated":false}');exit}
if(-not [IO.Path]::IsPathRooted($request.bundle)){throw 'Update package path differs'};Verify-Runtime $request.bundle $request.manifestSha256
if(@(Get-ChildItem -LiteralPath $root -Directory -Force|Where-Object{$_.Name -cmatch '^update-[a-f0-9]{32}$'}).Count -ge 3){throw 'Connector recovery copy capacity reached'}
# Staging and recovery inherit the existing private per-user enrollment ACL.
$folder='update-'+[guid]::NewGuid().ToString('N');$stage=Join-Path $root $folder;$previous=Join-Path $stage 'previous';$next=Join-Path $stage 'next';[void][IO.Directory]::CreateDirectory($previous);[void][IO.Directory]::CreateDirectory($next)
foreach($n in @($names)+@('system-runtime-manifest.json')){[IO.File]::Copy((Join-Path $root $n),(Join-Path $previous $n),$false);[IO.File]::Copy((Join-Path $request.bundle $n),(Join-Path $next $n),$false)}
[IO.File]::Copy((Join-Path $root 'device.dpapi'),(Join-Path $previous 'device.dpapi'),$false)
Verify-Runtime $previous $config.runtimeManifestSha256;Verify-Runtime $next $request.manifestSha256
$bytes=[Text.UTF8Encoding]::new($false).GetBytes((@{version=1;deviceId=$request.deviceId;folder=$folder;oldHash=$config.runtimeManifestSha256;newHash=$request.manifestSha256}|ConvertTo-Json -Compress));$stream=[IO.File]::Open($journal,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
try{
 Stop-Owned
 foreach($n in @($names)+@('system-runtime-manifest.json')){Replace-Owned (Join-Path $next $n) (Join-Path $root $n)}
 Verify-Runtime $root $request.manifestSha256
 $config.runtimeManifestSha256=$request.manifestSha256;$clear=[Text.UTF8Encoding]::new($false).GetBytes(($config|ConvertTo-Json -Compress));try{$encrypted=[Security.Cryptography.ProtectedData]::Protect($clear,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[IO.File]::WriteAllBytes((Join-Path $next 'device.dpapi'),$encrypted)}finally{[Array]::Clear($clear,0,$clear.Length)}
 Replace-Owned (Join-Path $next 'device.dpapi') (Join-Path $root 'device.dpapi')
 Enable-ScheduledTask -TaskName $taskName|Out-Null;Start-ScheduledTask -TaskName $taskName;[IO.File]::Delete($journal)
 [Console]::Out.Write('{"updated":true}')
}catch{[Console]::Error.WriteLine('UpdateApply:'+$_.Exception.GetType().Name+':'+$_.InvocationInfo.ScriptLineNumber);try{Restore-Pending}catch{[Console]::Error.WriteLine('UpdateRecovery:'+$_.Exception.GetType().Name+':'+$_.InvocationInfo.ScriptLineNumber);throw 'Connector update requires recovery; retained private backup'};throw 'Connector update failed; previous runtime restored'}
$config=$null
