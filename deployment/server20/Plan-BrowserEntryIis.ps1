param([Parameter(Mandatory=$true)][string]$ProfileFile,[Parameter(Mandatory=$true)][string]$OutputDirectory,[Parameter(Mandatory=$true)][string]$ExpectedApplicationHostSha256)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'BrowserEntryIisModel.psm1') -Force
$profile=Get-Content -LiteralPath $ProfileFile -Raw|ConvertFrom-Json
Test-BrowserEntryIisProfile $profile
if($ExpectedApplicationHostSha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'Expected IIS hash required'}
$appHost=Join-Path $env:WINDIR 'System32\inetsrv\config\applicationHost.config'
function Hash([string]$File){(Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant()}
if((Hash $appHost) -cne $ExpectedApplicationHostSha256){throw 'IIS baseline changed'}
$directory=[IO.Path]::GetFullPath($OutputDirectory)
if($directory -ieq [IO.Path]::GetPathRoot($directory) -or -not(Test-Path -LiteralPath $directory -PathType Container) -or (Get-Item -LiteralPath $directory).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Specific plain operation directory required'}
if(Test-Path -LiteralPath $profile.physicalPath){throw 'Browser IIS physical directory already exists'}
$mapped=Join-Path $directory 'applicationHost.proposed.config';$recovery=Join-Path $directory 'applicationHost.recovery-check.config'
if((Test-Path -LiteralPath $mapped) -or (Test-Path -LiteralPath $recovery)){throw 'Operation output already exists'}
Add-Type -Path (Join-Path $env:WINDIR 'System32\inetsrv\Microsoft.Web.Administration.dll')
$fingerprint=Get-BrowserEntryIisFingerprint $appHost $profile
[IO.File]::Copy($appHost,$mapped,$false)
$manager=[Microsoft.Web.Administration.ServerManager]::new($mapped)
try{Add-BrowserEntryIisModel $manager $profile|Out-Null;$manager.CommitChanges()}finally{$manager.Dispose()}
if((Get-BrowserEntryIisFingerprint $mapped $profile) -cne $fingerprint -or (Hash $appHost) -cne $ExpectedApplicationHostSha256){throw 'Mapped route changed sibling configuration'}
[IO.File]::Copy($mapped,$recovery,$false)
$manager=[Microsoft.Web.Administration.ServerManager]::new($recovery)
try{Remove-BrowserEntryIisModel $manager $profile;$manager.CommitChanges()}finally{$manager.Dispose()}
if((Get-BrowserEntryIisFingerprint $recovery $profile) -cne $fingerprint -or (Hash $appHost) -cne $ExpectedApplicationHostSha256){throw 'Mapped recovery preservation failed'}
$result=[pscustomobject]@{status='READY';computerName=$env:COMPUTERNAME;applicationHostBeforeSha256=$ExpectedApplicationHostSha256;applicationHostProposedSha256=(Hash $mapped);profileSha256=(Hash $ProfileFile);modelSha256=(Hash (Join-Path $PSScriptRoot 'BrowserEntryIisModel.psm1'));siblingFingerprint=$fingerprint;basePath=$profile.basePath;siteName=$profile.siteName;mappedRecovery=$true;liveIisChanged=$false;physicalApplicationCreated=$false}
$result|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $directory 'plan-result.json') -Encoding UTF8
$result|ConvertTo-Json -Compress
