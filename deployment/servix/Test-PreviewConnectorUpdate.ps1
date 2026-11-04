param([Parameter(Mandatory=$true)][string]$NodeExecutable,[ValidateSet('Preview','Git','Discovery','Transport')][string]$Capability='Preview')
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest;Add-Type -AssemblyName System.Security
$parent=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\');$temporary=Join-Path $parent ('dvpu-'+[guid]::NewGuid().ToString('N'));[void][IO.Directory]::CreateDirectory($temporary)
$extended=$Capability -cin @('Discovery','Transport');$transport=$Capability -ceq 'Transport'
$primary=if($extended -or $Capability -ceq 'Git'){'Connector.cjs'}else{'LocalDevelopment.cjs'};$secondary=if($extended){'SystemDiscovery.cjs'}elseif($Capability -ceq 'Git'){'GitDesktop.cjs'}else{'PreviewRelay.cjs'}
$originalLocal=$env:LOCALAPPDATA;$env:LOCALAPPDATA=Join-Path $temporary 'local'
function Hash([string]$p){(Get-FileHash -LiteralPath $p).Hash.ToLowerInvariant()}
function Json([string]$p,$v){[void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($p));[IO.File]::WriteAllText($p,($v|ConvertTo-Json -Depth 9 -Compress),[Text.UTF8Encoding]::new($false))}
function Assert([bool]$Condition,[string]$Code){if(-not $Condition){throw $Code}}
function ReadConfig([string]$Root){$clear=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes((Join-Path $Root 'device.dpapi')),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);try{return ([Text.Encoding]::UTF8.GetString($clear)|ConvertFrom-Json)}finally{[Array]::Clear($clear,0,$clear.Length)}}
$global:PreviewFixturesid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
function Get-ScheduledTask {param($TaskName);return [pscustomobject]@{State=$global:PreviewFixturestate;Principal=[pscustomobject]@{UserId=$global:PreviewFixturesid;RunLevel='Limited';LogonType='Interactive'};Actions=@([pscustomobject]@{Execute=(Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe');Arguments=$global:PreviewFixturearguments});Settings=[pscustomobject]@{Enabled=$global:PreviewFixtureenabled}}}
function Export-ScheduledTask {param($TaskName);return '<fixture>'+ $global:PreviewFixturearguments + [string]$global:PreviewFixtureenabled+'</fixture>'}
function Disable-ScheduledTask {param($TaskName);$global:PreviewFixtureenabled=$false}
function Enable-ScheduledTask {param($TaskName);$global:PreviewFixtureenabled=$true}
function Stop-ScheduledTask {param($TaskName);$global:PreviewFixturestate='Ready';if($global:PreviewFixtureLock){$global:PreviewFixtureLock.Dispose();$global:PreviewFixtureLock=$null}elseif($global:PreviewFixtureLockFile){$global:PreviewFixtureLock=[IO.File]::Open($global:PreviewFixtureLockFile,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read);$global:PreviewFixtureLockFile=$null}}
function Start-ScheduledTask {param($TaskName);$global:PreviewFixturestarts++;if($global:PreviewFixturefailStart -and $global:PreviewFixturestarts -eq 1){throw 'simulated-start-failure'};$global:PreviewFixturestate='Running'}
function Invoke-WebRequest {param([switch]$UseBasicParsing,$Uri,$Method,$ContentType,$Body,$Headers,$MaximumRedirection,$TimeoutSec);$endpoint=if($extended){'/v1/connector/connection-status'}elseif($Capability -ceq 'Git'){'/v1/connector/git-desktop/identity'}else{'/v1/connector/preview/identity'};if($Uri -cnotin @(('http://127.0.0.1:52000'+$endpoint),('https://public.fixture.invalid/workspace'+$endpoint)) -or $MaximumRedirection -ne 0 -or $Headers.Authorization -cne 'Bearer synthetic-fixture-credential'){throw 'Unexpected fixture transport'};$global:PreviewFixturequeries+=,$Uri;$proof=$global:PreviewFixtureproof.Clone();if($Uri.StartsWith('https:') -and $global:PreviewFixturewrongTarget){$proof.deviceId='fc_'+('f'*32)};return [pscustomobject]@{Content=($proof|ConvertTo-Json -Compress)}}
function Fixture([bool]$Legacy=$false){
 $id='fc_'+[guid]::NewGuid().ToString('N');$root=Join-Path $env:LOCALAPPDATA ('FrevOS\Connector\'+$id);[void][IO.Directory]::CreateDirectory((Join-Path $root 'state'))
 [IO.File]::Copy($NodeExecutable,(Join-Path $root 'node.exe'),$false)
 [IO.File]::WriteAllText((Join-Path $root 'Run-Connector.ps1'),'# Synthetic fixture; no task is registered',[Text.UTF8Encoding]::new($false))
 [IO.File]::WriteAllText((Join-Path $root $primary),'module.exports={version:1}',[Text.UTF8Encoding]::new($false))
 if($transport){
  # Retained legacy collector has no exported function and knows only the old URL.
  # This independently catches an updater comparing the new implementation twice.
  $legacyCollector=@'
const {promisify}=require('node:util'),{execFile}=require('node:child_process'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto');
async function installationIdentity(config){const value=(await promisify(execFile)(path.join(process.env.WINDIR,'System32/reg.exe'),['query','HKLM\\SOFTWARE\\Microsoft\\Cryptography','/v','MachineGuid'],{encoding:'utf8',windowsHide:true,timeout:10000})).stdout.match(/MachineGuid\s+REG_SZ\s+([a-f0-9-]+)/i)?.[1];if(!value)return null;return createHash('sha256').update(['devsetu-system-v1',new URL(config.server).origin,os.userInfo().username,value.toLowerCase()].join('\0')).digest('hex')};module.exports={version:1};
'@
  [IO.File]::WriteAllText((Join-Path $root 'SystemDiscovery.cjs'),$legacyCollector,[Text.UTF8Encoding]::new($false))
 }
 $config=@{version=1;deviceId=$id;server='http://127.0.0.1:52000';credential='synthetic-fixture-credential';stateRoot=(Join-Path $root 'state');repository='C:\fixture-project';fileActivity=$true;allowInternalHttp=$true;accountName='fixture-account';extraFields=@{retained='unchanged'}}
 if(-not $Legacy){$config.profileId='fixture-project'}
 $clear=[Text.UTF8Encoding]::new($false).GetBytes(($config|ConvertTo-Json -Compress))
 try{$cipher=[Security.Cryptography.ProtectedData]::Protect($clear,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[IO.File]::WriteAllBytes((Join-Path $root 'device.dpapi'),$cipher)}finally{[Array]::Clear($clear,0,$clear.Length)}
 $global:PreviewFixtureproof=@{workspaceId='ws_fixture';deviceId=$id;profileId=$(if($extended -and $Legacy){$null}else{'fixture-project'})};if($extended){$global:PreviewFixtureproof.actor='usr_fixture';$global:PreviewFixtureproof.mode='project';$global:PreviewFixtureproof.ready=$true};$global:PreviewFixturequeries=@();$global:PreviewFixturewrongTarget=$false;$global:PreviewFixtureenabled=$true;$global:PreviewFixturestate='Running';$global:PreviewFixturestarts=0;$global:PreviewFixturefailStart=$false;$global:PreviewFixtureLock=$null;$global:PreviewFixtureLockFile=$null
 $global:PreviewFixturearguments='-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy '+$(if($Legacy){'Bypass'}else{'RemoteSigned'})+' -File "'+(Join-Path $root 'Run-Connector.ps1')+'"'
 $description=& (Join-Path $PSScriptRoot 'Update-PreviewConnector.ps1') -Capability $Capability -DescribeDevice $id|ConvertFrom-Json
 $package=Join-Path $temporary ('package-'+$id);[void][IO.Directory]::CreateDirectory((Join-Path $package 'deployment\servix'))
 $runtimeNames=if($extended){@('Connector.cjs','SystemDiscovery.cjs','DiscoverySafety.cjs','FolderBrowse.cjs','Browse-Folders.ps1')}else{@($primary,$secondary)};if($Capability -ceq 'Git'){$runtimeNames+=,'FrevOS.FolderPicker.exe'};$files=@();foreach($name in $runtimeNames){$file=Join-Path $package ('deployment\servix\'+$name);if($name.EndsWith('.exe')){[IO.File]::Copy($NodeExecutable,$file,$false)}elseif($transport -and $name -cin @('SystemDiscovery.cjs','DiscoverySafety.cjs')){[IO.File]::Copy((Join-Path $PSScriptRoot $name),$file,$false)}else{[IO.File]::WriteAllText($file,$(if($name.EndsWith('.ps1')){'# Synthetic fixture version 2'}else{'module.exports={version:2}'}),[Text.UTF8Encoding]::new($false))};$files+=@{name=$name;sha256=(Hash $file);beforeSha256=$description.files.$name}}
 Json (Join-Path $package 'release-manifest.json') @{files=@($files|ForEach-Object {@{path=('deployment/servix/'+$_.name);sha256=$_.sha256}})}
 $plan=@{version=1;action=$(if($extended){'devsetu.'+$Capability.ToLowerInvariant()+'.connector-update.v1'}elseif($Capability -ceq 'Git'){'devsetu.git.connector-update.v1'}else{'devsetu.preview.connector-update.v1'});id=('pvu_'+[guid]::NewGuid().ToString('N'));workspaceId='ws_fixture';actorSid=$global:PreviewFixturesid;deviceId=$id;profileId=$(if($extended){$description.profileId}else{'fixture-project'});configurationSha256=$description.configurationSha256;taskXmlSha256=$description.taskXmlSha256;packageRoot=$package;manifestSha256=(Hash (Join-Path $package 'release-manifest.json'));createdAt=[DateTimeOffset]::UtcNow.AddSeconds(-1).ToString('o');expiresAt=[DateTimeOffset]::UtcNow.AddMinutes(5).ToString('o');files=$files}
 if($extended){$plan.ownerId=$description.ownerId}
 if($transport){$platform=Join-Path $temporary ('platform-'+$id);Json (Join-Path $platform 'state\active.json') @{manifestSha256=$plan.manifestSha256};$entry=Join-Path $platform 'servix\config\browser-entry.json';Json $entry @{version=1;publicOrigin='https://public.fixture.invalid';basePath='/workspace';connectorTransport=$true;proxyHosts=@('fixture-upstream');listen=@{host='127.0.0.1';port=3002}};$plan.transport=@{platformRoot=$platform;browserEntrySha256=(Hash $entry);server='https://public.fixture.invalid/workspace'}}
 Json (Join-Path $root 'state\discovery-consent.json') @{version=1;deviceId=$id;metadata=$true};Json (Join-Path $root 'state\software\consent.json') @{version=1;deviceId=$id;inventory=$true;install=$true}
 $reference=Join-Path $temporary ($plan.id+'.json');Json $reference $plan
 return @{root=$root;plan=$plan;reference=$reference;description=$description}
}
try{
 $f=Fixture $true;$before=Hash (Join-Path $f.root $primary)
 $ready=& (Join-Path $PSScriptRoot 'Update-PreviewConnector.ps1') -Capability $Capability -PlanReference $f.reference -PlanOnly|ConvertFrom-Json
 Assert ($ready.status -ceq 'READY' -and (Hash (Join-Path $f.root $primary)) -ceq $before) 'Preflight mutated runtime'
 $result=& (Join-Path $PSScriptRoot 'Update-PreviewConnector.ps1') -Capability $Capability -PlanReference $f.reference|ConvertFrom-Json
 Assert ($result.status -ceq 'PASS' -and ($transport -or (Hash (Join-Path $f.root 'device.dpapi')) -ceq $f.description.configurationSha256) -and $global:PreviewFixtureenabled -and $global:PreviewFixturestate -ceq 'Running') 'Update did not preserve enrollment'
 if($transport){$saved=ReadConfig $f.root;Assert ($saved.server -ceq 'https://public.fixture.invalid/workspace' -and $saved.discoveryIdentityOrigin -ceq 'http://127.0.0.1:52000' -and $saved.credential -ceq 'synthetic-fixture-credential' -and $saved.repository -ceq 'C:\fixture-project' -and $saved.extraFields.retained -ceq 'unchanged' -and $result.discoveryIdentityPreserved) 'Transport changed retained fields or system identity'}
 foreach($file in $f.plan.files){Assert ((Hash (Join-Path $f.root $file.name)) -ceq $file.sha256) 'Replacement differs'}
 Assert ((Hash (Join-Path $result.backup $primary)) -ceq $before) 'Preimage missing'
 $denied=$false;try{& (Join-Path $PSScriptRoot 'Update-PreviewConnector.ps1') -Capability $Capability -PlanReference $f.reference|Out-Null}catch{$denied=$true};Assert $denied 'Consumed update replayed'
 $g=Fixture;$global:PreviewFixturefailStart=$true;$old=Hash (Join-Path $g.root $primary);$denied=$false
 try{& (Join-Path $PSScriptRoot 'Update-PreviewConnector.ps1') -Capability $Capability -PlanReference $g.reference|Out-Null}catch{$denied=$true}
 $sidecarsRestored=$true;foreach($file in $g.plan.files){$installed=Join-Path $g.root $file.name;if($null -eq $file.beforeSha256){if(Test-Path -LiteralPath $installed){$sidecarsRestored=$false}}elseif(-not(Test-Path -LiteralPath $installed) -or (Hash $installed) -cne $file.beforeSha256){$sidecarsRestored=$false}}
 Assert ($denied -and $sidecarsRestored -and $global:PreviewFixturestarts -ge 2 -and (Hash (Join-Path $g.root $primary)) -ceq $old -and (Hash (Join-Path $g.root 'device.dpapi')) -ceq $g.description.configurationSha256 -and $global:PreviewFixturestate -ceq 'Running') 'Startup-failure recovery failed'
 $h=Fixture;$h.plan.expiresAt=[DateTimeOffset]::UtcNow.AddSeconds(-1).ToString('o');Json $h.reference $h.plan;$denied=$false
 try{& (Join-Path $PSScriptRoot 'Update-PreviewConnector.ps1') -Capability $Capability -PlanReference $h.reference|Out-Null}catch{$denied=$true};Assert $denied 'Expired approval accepted'
 $h.plan.expiresAt=[DateTimeOffset]::UtcNow.AddMinutes(5).ToString('o');$h.plan.workspaceId='ws_other';Json $h.reference $h.plan;$denied=$false
 try{& (Join-Path $PSScriptRoot 'Update-PreviewConnector.ps1') -Capability $Capability -PlanReference $h.reference -PlanOnly|Out-Null}catch{$denied=$true};Assert $denied 'Cross-workspace source proof accepted'
 if($Capability -ceq 'Git' -or $extended){
  $s=Fixture;$cipher=[IO.File]::ReadAllBytes((Join-Path $s.root 'device.dpapi'));$clear=[Security.Cryptography.ProtectedData]::Unprotect($cipher,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  try{$config=[Text.Encoding]::UTF8.GetString($clear)|ConvertFrom-Json;$config|Add-Member -NotePropertyName mode -NotePropertyValue 'system';$next=[Text.Encoding]::UTF8.GetBytes(($config|ConvertTo-Json -Compress));try{[IO.File]::WriteAllBytes((Join-Path $s.root 'device.dpapi'),[Security.Cryptography.ProtectedData]::Protect($next,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))}finally{[Array]::Clear($next,0,$next.Length)}}finally{[Array]::Clear($clear,0,$clear.Length)}
  $s.plan.configurationSha256=Hash (Join-Path $s.root 'device.dpapi');Json $s.reference $s.plan;$denied=$false;try{& (Join-Path $PSScriptRoot 'Update-PreviewConnector.ps1') -Capability $Capability -PlanReference $s.reference -PlanOnly|Out-Null}catch{$denied=$true};Assert ($denied -and $global:PreviewFixturestarts -eq 0) 'Pinned system accepted sidecar-only update'
 }
 if($transport){
  $locked=Fixture;$global:PreviewFixtureLockFile=Join-Path $locked.root 'device.dpapi';$before=Hash (Join-Path $locked.root $primary);$denied=$false
  try{& (Join-Path $PSScriptRoot 'Update-PreviewConnector.ps1') -Capability Transport -PlanReference $locked.reference|Out-Null}catch{$denied=$true}
  Assert ($denied -and -not $global:PreviewFixtureLock -and -not $global:PreviewFixtureLockFile -and $global:PreviewFixturestarts -ge 1 -and (Hash (Join-Path $locked.root 'device.dpapi')) -ceq $locked.description.configurationSha256 -and (Hash (Join-Path $locked.root $primary)) -ceq $before -and $global:PreviewFixturestate -ceq 'Running') 'Real sharing-violation recovery failed'
  $t=Fixture;$global:PreviewFixturewrongTarget=$true;$denied=$false;try{& (Join-Path $PSScriptRoot 'Update-PreviewConnector.ps1') -Capability Transport -PlanReference $t.reference -PlanOnly|Out-Null}catch{$denied=$true};Assert ($denied -and $global:PreviewFixturestarts -eq 0 -and (Hash (Join-Path $t.root 'device.dpapi')) -ceq $t.description.configurationSha256) 'Unrecognized public peer changed enrollment'
  $u=Fixture;$u.plan.transport.browserEntrySha256='0'*64;Json $u.reference $u.plan;$denied=$false;try{& (Join-Path $PSScriptRoot 'Update-PreviewConnector.ps1') -Capability Transport -PlanReference $u.reference -PlanOnly|Out-Null}catch{$denied=$true};Assert ($denied -and -not @($global:PreviewFixturequeries|Where-Object {$_ -like 'https:*'}).Count) 'Unretained route received a credential'
  $v=Fixture;$v.plan.transport.server='https://other.fixture.invalid/workspace';Json $v.reference $v.plan;$denied=$false;try{& (Join-Path $PSScriptRoot 'Update-PreviewConnector.ps1') -Capability Transport -PlanReference $v.reference -PlanOnly|Out-Null}catch{$denied=$true};Assert ($denied -and -not @($global:PreviewFixturequeries|Where-Object {$_ -like 'https:*'}).Count) 'Unconfigured destination received a credential'
  $w=Fixture;$file=Join-Path $w.plan.transport.platformRoot 'state\active.json';Json $file @{manifestSha256=('0'*64)};$denied=$false;try{& (Join-Path $PSScriptRoot 'Update-PreviewConnector.ps1') -Capability Transport -PlanReference $w.reference -PlanOnly|Out-Null}catch{$denied=$true};Assert ($denied -and $global:PreviewFixturestarts -eq 0) 'Inactive artifact changed transport'
 }
 @{status='PASS';checks=$(if($transport){13}elseif($Capability -ceq 'Git' -or $extended){8}else{7});realWindowsFilesAndDpapi=$true;taskTransport='fixed-fixture-functions';nativeLiveTaskAcceptance=$false;pairingPreserved=$true;discoveryIdentityPreserved=$true;legacyIdentityResolvedFromProof=$true;replayAndExpiryDenied=$true;failedStartRestored=$true}|ConvertTo-Json -Compress
}finally{
 if($global:PreviewFixtureLock){$global:PreviewFixtureLock.Dispose();$global:PreviewFixtureLock=$null}
 $env:LOCALAPPDATA=$originalLocal;$resolved=[IO.Path]::GetFullPath($temporary)
 if([IO.Path]::GetDirectoryName($resolved) -cne $parent -or [IO.Path]::GetFileName($resolved) -cnotmatch '^dvpu-[a-f0-9]{32}$'){throw 'Preview fixture cleanup escaped owned target'}
 Remove-Item -LiteralPath $resolved -Recurse -Force
}
