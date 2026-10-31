param([Parameter(Mandatory=$true)][string]$PlanReference)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$plan=Get-Content -LiteralPath $PlanReference -Raw|ConvertFrom-Json
$actor=[Security.Principal.WindowsIdentity]::GetCurrent()
if($plan.version -ne 1 -or $plan.action -cne 'android-sdk:relocate' -or $plan.actorSid -cne $actor.User.Value -or $plan.id -cnotmatch '^am_[a-f0-9]{32}$' -or ([DateTimeOffset]$plan.expiresAt) -le [DateTimeOffset]::UtcNow -or (([DateTimeOffset]$plan.expiresAt)-([DateTimeOffset]$plan.issuedAt)).TotalMinutes -gt 10){throw 'SDK relocation approval invalid'}
if($plan.server -cnotmatch '^[A-Za-z0-9.-]+$'){throw 'SDK relocation server invalid'}
function Map-Root([string]$LocalRoot){$full=[IO.Path]::GetFullPath($LocalRoot);if($full -cnotmatch '^[A-Z]:\\[^:]+$' -or $full.Length -lt 8 -or $full -match '(?:^|\\)\.\.?(?:\\|$)'){throw 'Specific SDK directory required'};return ('\\'+$plan.server+'\'+$full.Substring(0,1).ToLowerInvariant()+'$\'+$full.Substring(3))}
$source=[IO.Path]::GetFullPath((Map-Root $plan.sourceLocalRoot));$destination=[IO.Path]::GetFullPath((Map-Root $plan.destinationLocalRoot))
if($source -cne $plan.sourceRoot -or $destination -cne $plan.destinationRoot -or [IO.Path]::GetPathRoot($source) -cne [IO.Path]::GetPathRoot($destination) -or (Test-Path -LiteralPath $destination) -or $source.StartsWith($destination+'\',[StringComparison]::OrdinalIgnoreCase) -or $destination.StartsWith($source+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'SDK source/destination boundary mismatch'}
if((Get-Item -Force -LiteralPath $source).Attributes -band [IO.FileAttributes]::ReparsePoint -or (Get-Item -Force -LiteralPath (Split-Path $source -Parent)).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked SDK source denied'}
if(@(Get-ChildItem -LiteralPath (Join-Path $source 'private') -Force).Count){throw 'SDK relocation requires separate secret review'}
$configuration=Get-Content -LiteralPath (Join-Path $source 'bin\service-config.json') -Raw|ConvertFrom-Json
if($configuration.root -cne $plan.sourceLocalRoot -or $configuration.phase -cne 'worker' -or $configuration.workspaceId -cne $plan.workspaceId -or $configuration.profileId -cne $plan.profileId -or $configuration.repositoryId -cne $plan.repositoryId){throw 'SDK relocation binding changed'}
$sourceParent=Split-Path $source -Parent;$sourceParentSddl=(Get-Acl -LiteralPath $sourceParent).Sddl;$sdkSddl=(Get-Acl -LiteralPath $source).Sddl
$evidence=Join-Path $source ('incoming\'+$plan.id+'.consumed.json');$stream=[IO.File]::Open($evidence,[IO.FileMode]::CreateNew)
try{$bytes=[Text.UTF8Encoding]::new($false).GetBytes(($plan|ConvertTo-Json -Depth 6 -Compress));$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
$sc=Join-Path $env:WINDIR 'System32\sc.exe'
& $sc ('\\'+$plan.server) stop DevSetuAndroidBuilder|Out-Null;if($LASTEXITCODE -notin @(0,1062)){throw 'SDK worker stop failed'}
Start-Sleep -Seconds 3
# Both resolved absolute targets above are on the enrolled share; only this new
# SDK installation is moved. No recursive deletion or application folder move.
[IO.Directory]::Move($source,$destination)
$configuration.root=$plan.destinationLocalRoot
[IO.File]::WriteAllText((Join-Path $destination 'bin\service-config.json'),($configuration|ConvertTo-Json -Depth 8 -Compress),[Text.UTF8Encoding]::new($false))
$newBinary='"'+[IO.Path]::Combine($plan.destinationLocalRoot,'bin\AndroidBuilderService.exe')+'"'
& $sc ('\\'+$plan.server) config DevSetuAndroidBuilder 'binPath=' $newBinary|Out-Null;if($LASTEXITCODE -ne 0){throw 'SDK service path update failed; retained directory is not removed'}
& $sc ('\\'+$plan.server) start DevSetuAndroidBuilder|Out-Null;if($LASTEXITCODE -ne 0){throw 'Relocated SDK worker start failed'}
if((Get-Acl -LiteralPath $sourceParent).Sddl -cne $sourceParentSddl -or (Get-Acl -LiteralPath $destination).Sddl -cne $sdkSddl){throw 'SDK relocation changed permissions'}
$receipt=@{version=1;status='APPLIED';id=$plan.id;source=$source;destination=$destination;SDKFilesRetained=$true;controlPlaneParentPermissionsPreserved=$true;signingIdentityChanged=$false}
[IO.File]::WriteAllText((Join-Path $destination 'results\sdk-relocation.json'),($receipt|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false));$receipt|ConvertTo-Json -Compress
