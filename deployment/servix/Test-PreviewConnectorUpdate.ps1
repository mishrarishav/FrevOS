param([Parameter(Mandatory=$true)][string]$NodeExecutable)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest;Add-Type -AssemblyName System.Security
$parent=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\');$temporary=Join-Path $parent ('dvpu-'+[guid]::NewGuid().ToString('N'));[void][IO.Directory]::CreateDirectory($temporary)
$originalLocal=$env:LOCALAPPDATA;$env:LOCALAPPDATA=Join-Path $temporary 'local'
function Hash([string]$p){(Get-FileHash -LiteralPath $p).Hash.ToLowerInvariant()}
function Json([string]$p,$v){[void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($p));[IO.File]::WriteAllText($p,($v|ConvertTo-Json -Depth 9 -Compress),[Text.UTF8Encoding]::new($false))}
function Assert([bool]$Condition,[string]$Code){if(-not $Condition){throw $Code}}
$global:PreviewFixturesid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
function Get-ScheduledTask {param($TaskName);return [pscustomobject]@{State=$global:PreviewFixturestate;Principal=[pscustomobject]@{UserId=$global:PreviewFixturesid;RunLevel='Limited';LogonType='Interactive'};Actions=@([pscustomobject]@{Execute=(Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe');Arguments=$global:PreviewFixturearguments});Settings=[pscustomobject]@{Enabled=$global:PreviewFixtureenabled}}}
function Export-ScheduledTask {param($TaskName);return '<fixture>'+ $global:PreviewFixturearguments + [string]$global:PreviewFixtureenabled+'</fixture>'}
function Disable-ScheduledTask {param($TaskName);$global:PreviewFixtureenabled=$false}
function Enable-ScheduledTask {param($TaskName);$global:PreviewFixtureenabled=$true}
function Stop-ScheduledTask {param($TaskName);$global:PreviewFixturestate='Ready'}
function Start-ScheduledTask {param($TaskName);$global:PreviewFixturestarts++;if($global:PreviewFixturefailStart -and $global:PreviewFixturestarts -eq 1){throw 'simulated-start-failure'};$global:PreviewFixturestate='Running'}
function Invoke-WebRequest {param([switch]$UseBasicParsing,$Uri,$Method,$ContentType,$Body,$Headers,$MaximumRedirection,$TimeoutSec);if(-not $Uri.EndsWith('/v1/connector/preview/identity') -or $Headers.Authorization -cne 'Bearer synthetic-fixture-credential'){throw 'Unexpected fixture transport'};return [pscustomobject]@{Content=($global:PreviewFixtureproof|ConvertTo-Json -Compress)}}
function Fixture([bool]$Legacy=$false){
 $id='fc_'+[guid]::NewGuid().ToString('N');$root=Join-Path $env:LOCALAPPDATA ('FrevOS\Connector\'+$id);[void][IO.Directory]::CreateDirectory((Join-Path $root 'state'))
 [IO.File]::Copy($NodeExecutable,(Join-Path $root 'node.exe'),$false)
 [IO.File]::WriteAllText((Join-Path $root 'Run-Connector.ps1'),'# Synthetic fixture; no task is registered',[Text.UTF8Encoding]::new($false))
 [IO.File]::WriteAllText((Join-Path $root 'LocalDevelopment.cjs'),'module.exports={version:1}',[Text.UTF8Encoding]::new($false))
 $config=@{version=1;deviceId=$id;server='http://127.0.0.1:52000';credential='synthetic-fixture-credential';stateRoot=(Join-Path $root 'state')}
 if(-not $Legacy){$config.profileId='fixture-project'}
 $clear=[Text.UTF8Encoding]::new($false).GetBytes(($config|ConvertTo-Json -Compress))
 try{$cipher=[Security.Cryptography.ProtectedData]::Protect($clear,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[IO.File]::WriteAllBytes((Join-Path $root 'device.dpapi'),$cipher)}finally{[Array]::Clear($clear,0,$clear.Length)}
 $global:PreviewFixtureproof=@{workspaceId='ws_fixture';deviceId=$id;profileId='fixture-project'};$global:PreviewFixtureenabled=$true;$global:PreviewFixturestate='Running';$global:PreviewFixturestarts=0;$global:PreviewFixturefailStart=$false
 $global:PreviewFixturearguments='-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy '+$(if($Legacy){'Bypass'}else{'RemoteSigned'})+' -File "'+(Join-Path $root 'Run-Connector.ps1')+'"'
 $description=& (Join-Path $PSScriptRoot 'Update-PreviewConnector.ps1') -DescribeDevice $id|ConvertFrom-Json
 $package=Join-Path $temporary ('package-'+$id);[void][IO.Directory]::CreateDirectory((Join-Path $package 'deployment\servix'))
 $files=@();foreach($name in @('LocalDevelopment.cjs','PreviewRelay.cjs')){$file=Join-Path $package ('deployment\servix\'+$name);[IO.File]::WriteAllText($file,'module.exports={version:2}',[Text.UTF8Encoding]::new($false));$files+=@{name=$name;sha256=(Hash $file);beforeSha256=$description.files.$name}}
 Json (Join-Path $package 'release-manifest.json') @{files=@($files|ForEach-Object {@{path=('deployment/servix/'+$_.name);sha256=$_.sha256}})}
 $plan=@{version=1;action='devsetu.preview.connector-update.v1';id=('pvu_'+[guid]::NewGuid().ToString('N'));workspaceId='ws_fixture';actorSid=$global:PreviewFixturesid;deviceId=$id;profileId='fixture-project';configurationSha256=$description.configurationSha256;taskXmlSha256=$description.taskXmlSha256;packageRoot=$package;manifestSha256=(Hash (Join-Path $package 'release-manifest.json'));createdAt=[DateTimeOffset]::UtcNow.AddSeconds(-1).ToString('o');expiresAt=[DateTimeOffset]::UtcNow.AddMinutes(5).ToString('o');files=$files}
 $reference=Join-Path $temporary ($plan.id+'.json');Json $reference $plan
 return @{root=$root;plan=$plan;reference=$reference;description=$description}
}
try{
 $f=Fixture $true;$before=Hash (Join-Path $f.root 'LocalDevelopment.cjs')
 $ready=& (Join-Path $PSScriptRoot 'Update-PreviewConnector.ps1') -PlanReference $f.reference -PlanOnly|ConvertFrom-Json
 Assert ($ready.status -ceq 'READY' -and (Hash (Join-Path $f.root 'LocalDevelopment.cjs')) -ceq $before) 'Preflight mutated runtime'
 $result=& (Join-Path $PSScriptRoot 'Update-PreviewConnector.ps1') -PlanReference $f.reference|ConvertFrom-Json
 Assert ($result.status -ceq 'PASS' -and (Hash (Join-Path $f.root 'device.dpapi')) -ceq $f.description.configurationSha256 -and $global:PreviewFixtureenabled -and $global:PreviewFixturestate -ceq 'Running') 'Update did not preserve enrollment'
 foreach($file in $f.plan.files){Assert ((Hash (Join-Path $f.root $file.name)) -ceq $file.sha256) 'Replacement differs'}
 Assert ((Hash (Join-Path $result.backup 'LocalDevelopment.cjs')) -ceq $before) 'Preimage missing'
 $denied=$false;try{& (Join-Path $PSScriptRoot 'Update-PreviewConnector.ps1') -PlanReference $f.reference|Out-Null}catch{$denied=$true};Assert $denied 'Consumed update replayed'
 $g=Fixture;$global:PreviewFixturefailStart=$true;$old=Hash (Join-Path $g.root 'LocalDevelopment.cjs');$denied=$false
 try{& (Join-Path $PSScriptRoot 'Update-PreviewConnector.ps1') -PlanReference $g.reference|Out-Null}catch{$denied=$true}
 Assert ($denied -and (Hash (Join-Path $g.root 'LocalDevelopment.cjs')) -ceq $old -and -not(Test-Path -LiteralPath (Join-Path $g.root 'PreviewRelay.cjs')) -and (Hash (Join-Path $g.root 'device.dpapi')) -ceq $g.description.configurationSha256 -and $global:PreviewFixturestate -ceq 'Running') 'Startup-failure recovery failed'
 $h=Fixture;$h.plan.expiresAt=[DateTimeOffset]::UtcNow.AddSeconds(-1).ToString('o');Json $h.reference $h.plan;$denied=$false
 try{& (Join-Path $PSScriptRoot 'Update-PreviewConnector.ps1') -PlanReference $h.reference|Out-Null}catch{$denied=$true};Assert $denied 'Expired approval accepted'
 $h.plan.expiresAt=[DateTimeOffset]::UtcNow.AddMinutes(5).ToString('o');$h.plan.workspaceId='ws_other';Json $h.reference $h.plan;$denied=$false
 try{& (Join-Path $PSScriptRoot 'Update-PreviewConnector.ps1') -PlanReference $h.reference -PlanOnly|Out-Null}catch{$denied=$true};Assert $denied 'Cross-workspace source proof accepted'
 @{status='PASS';checks=7;realWindowsFilesAndDpapi=$true;taskTransport='fixed-fixture-functions';nativeLiveTaskAcceptance=$false;pairingPreserved=$true;legacyIdentityResolvedFromProof=$true;replayAndExpiryDenied=$true;failedStartRestored=$true}|ConvertTo-Json -Compress
}finally{
 $env:LOCALAPPDATA=$originalLocal;$resolved=[IO.Path]::GetFullPath($temporary)
 if([IO.Path]::GetDirectoryName($resolved) -cne $parent -or [IO.Path]::GetFileName($resolved) -cnotmatch '^dvpu-[a-f0-9]{32}$'){throw 'Preview fixture cleanup escaped owned target'}
 Remove-Item -LiteralPath $resolved -Recurse -Force
}
