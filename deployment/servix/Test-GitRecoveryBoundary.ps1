$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
$parent=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\');$root=Join-Path $parent ('dvgitrecovery-'+[guid]::NewGuid().ToString('N'));[void][IO.Directory]::CreateDirectory($root)
function Assert([bool]$Value,[string]$Code){if(-not $Value){throw $Code}}
$originalInput=[Console]::In
try{
 $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
 $paths=@();foreach($name in @('engine','backups','restores')){$p=Join-Path $root $name;[void][IO.Directory]::CreateDirectory($p);$security=[Security.AccessControl.DirectorySecurity]::new();$security.SetAccessRuleProtection($true,$false);$security.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'));[IO.Directory]::SetAccessControl($p,$security);$paths+=,$p}
 $binary=Join-Path $root 'fixture-engine.exe';[IO.File]::WriteAllText($binary,'Synthetic inert file; never executed')
 $global:GitRecoveryFixtureState='Stopped';$global:GitRecoveryFixtureStarts=0;$global:GitRecoveryFixtureStops=0
 $global:GitRecoveryFixtureCommand='"'+$binary+'" web --work-path "'+$paths[0]+'" --config "'+(Join-Path $paths[0] 'app.ini')+'"'
 function Get-CimInstance {param($ClassName,$Filter);if($ClassName -cne 'Win32_Service' -or $Filter -cne "Name='FixturePrivateGit'"){throw 'Unexpected service query'};return [pscustomobject]@{PathName=$global:GitRecoveryFixtureCommand}}
 function Get-Service {param($Name);if($Name -cne 'FixturePrivateGit'){throw 'Unexpected service query'};$s=[pscustomobject]@{Status=$global:GitRecoveryFixtureState};$s|Add-Member ScriptMethod WaitForStatus {param($expected,$timeout);if($this.Status -cne $expected){throw 'Unexpected state'}};return $s}
 function Start-Service {param($Name);if($Name -cne 'FixturePrivateGit'){throw 'Unexpected service start'};$global:GitRecoveryFixtureState='Running';$global:GitRecoveryFixtureStarts++}
 function Stop-Service {param($Name);if($Name -cne 'FixturePrivateGit'){throw 'Unexpected service stop'};$global:GitRecoveryFixtureState='Stopped';$global:GitRecoveryFixtureStops++}
 $request=@{serviceName='FixturePrivateGit';binary=$binary;binarySha256=(Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash.ToLowerInvariant();expectedCommandLine=$global:GitRecoveryFixtureCommand;workRoot=$paths[0];privateRoots=$paths}
 function InvokeBoundary([string]$Action){[Console]::SetIn([IO.StringReader]::new(($request|ConvertTo-Json -Compress)));$global:LASTEXITCODE=0;$value=& (Join-Path $PSScriptRoot 'GitService.ps1') -Action $Action;if($LASTEXITCODE -ne 0){throw 'Boundary rejected'};return ($value|ConvertFrom-Json)}
 Assert ((InvokeBoundary 'State').running -eq $false) 'Stopped state differs'
 Assert ((InvokeBoundary 'Start').running -eq $true -and $global:GitRecoveryFixtureStarts -eq 1) 'Enrolled service did not start'
 Assert ((InvokeBoundary 'Stop').running -eq $false -and $global:GitRecoveryFixtureStops -eq 1) 'Enrolled service did not stop'
 $request.workRoot=Join-Path $root 'other-engine';$denied=$false;try{InvokeBoundary 'Start'|Out-Null}catch{$denied=$true};Assert ($denied -and $global:GitRecoveryFixtureStarts -eq 1) 'Mismatched service data root accepted'
 $request.workRoot=$paths[0];$request.binarySha256='0'*64;$denied=$false;try{InvokeBoundary 'Start'|Out-Null}catch{$denied=$true};Assert $denied 'Changed executable accepted'
 $request.binarySha256=(Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash.ToLowerInvariant();$wide=[IO.Directory]::GetAccessControl($paths[2]);$wide.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-1-0'),'ReadAndExecute','ContainerInherit,ObjectInherit','None','Allow'));[IO.Directory]::SetAccessControl($paths[2],$wide)
 $denied=$false;try{InvokeBoundary 'Storage'|Out-Null}catch{$denied=$true};Assert $denied 'Broad plaintext restore storage accepted'
 $wide.RemoveAccessRuleAll([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-1-0'),'ReadAndExecute','ContainerInherit,ObjectInherit','None','Allow'))
 $wide.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-21-111-222-333-513'),'ReadAndExecute','ContainerInherit,ObjectInherit','None','Allow'));[IO.Directory]::SetAccessControl($paths[2],$wide)
 $denied=$false;try{InvokeBoundary 'Storage'|Out-Null}catch{$denied=$true};Assert $denied 'Unreviewed domain/group access accepted'
 @{status='PASS';checks=7;realWindowsFilesAndAcls=$true;serviceTransport='fixed-fixture-functions';liveServiceAcceptance=$false}|ConvertTo-Json -Compress
}finally{
 [Console]::SetIn($originalInput);$resolved=[IO.Path]::GetFullPath($root)
 if([IO.Path]::GetDirectoryName($resolved) -cne $parent -or [IO.Path]::GetFileName($resolved) -cnotmatch '^dvgitrecovery-[a-f0-9]{32}$'){throw 'Recovery fixture cleanup escaped owned root'}
 Remove-Item -LiteralPath $resolved -Recurse -Force
}
