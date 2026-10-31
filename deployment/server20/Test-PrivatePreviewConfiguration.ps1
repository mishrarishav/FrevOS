param([Parameter(Mandatory=$true)][string]$NodeExecutable)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
$parent=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\');$temporary=Join-Path $parent ('dvpconfig-'+[guid]::NewGuid().ToString('N'));[void][IO.Directory]::CreateDirectory($temporary)
function Hash([string]$p){(Get-FileHash -LiteralPath $p).Hash.ToLowerInvariant()}
function Json([string]$p,$v){[void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($p));[IO.File]::WriteAllText($p,($v|ConvertTo-Json -Depth 9 -Compress),[Text.UTF8Encoding]::new($false))}
function Assert([bool]$value,[string]$code){if(-not $value){throw $code}}
$global:PreviewConfigSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
function Get-ScheduledTask {param($TaskName);return [pscustomobject]@{State=$global:PreviewConfigState;Principal=[pscustomobject]@{UserId=$global:PreviewConfigSid};Actions=@([pscustomobject]@{Execute=(Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe');Arguments=$global:PreviewConfigArguments});Settings=[pscustomobject]@{Enabled=$true}}}
function Export-ScheduledTask {param($TaskName);return '<fixture>'+$global:PreviewConfigArguments+'</fixture>'}
function Stop-ScheduledTask {param($TaskName);$global:PreviewConfigState='Ready'}
function Start-ScheduledTask {param($TaskName);$global:PreviewConfigStarts++;if($global:PreviewConfigFailStart -and $global:PreviewConfigStarts -eq 1){throw 'simulated-start-failure'};$global:PreviewConfigState='Running'}
function Invoke-WebRequest {param([switch]$UseBasicParsing,$Uri,$TimeoutSec);if(-not $Uri.EndsWith('/health')){throw 'Unexpected fixture URL'};return [pscustomobject]@{StatusCode=200;Content='{"status":"ok"}'}}
function Fixture {
 $root=Join-Path $temporary ('installation-'+[guid]::NewGuid().ToString('N'));$candidate=Join-Path $temporary ('candidate-'+[guid]::NewGuid().ToString('N'));[void][IO.Directory]::CreateDirectory($candidate)
 $sourceRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'));$module=Join-Path $sourceRoot 'apps\control-plane\dist\preview-relay.js'
 if(-not(Test-Path -LiteralPath $module)){throw 'Build the actual control plane before this fixture'}
 $validator=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'Validate-PreviewConfig.mjs')).Replace('../../apps/control-plane/dist/preview-relay.js',([uri]$module).AbsoluteUri)
 $files=@()
 foreach($name in @('deployment/server20/Validate-PreviewConfig.mjs','deployment/server20/Verify-AndroidCompatibility.ps1','apps/control-plane/dist/preview-relay.js','deployment/server20/Start-Server20.ps1')){
  $file=Join-Path $candidate ($name.Replace('/','\'));[void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($file))
  if($name.EndsWith('Validate-PreviewConfig.mjs')){[IO.File]::WriteAllText($file,$validator,[Text.UTF8Encoding]::new($false))}elseif($name.EndsWith('preview-relay.js')){[IO.File]::Copy($module,$file,$false)}elseif($name.EndsWith('Verify-AndroidCompatibility.ps1')){[IO.File]::Copy((Join-Path $PSScriptRoot 'Verify-AndroidCompatibility.ps1'),$file,$false)}else{[IO.File]::WriteAllText($file,'# Synthetic fixture; no native task is registered',[Text.UTF8Encoding]::new($false))}
  $files+=@{path=$name;sha256=(Hash $file)}
 }
 Json (Join-Path $candidate 'release-manifest.json') @{applicationSource=('b'*40);files=$files};$digest=Hash (Join-Path $candidate 'release-manifest.json')
 $release=Join-Path $root ('releases\'+$digest);[void][IO.Directory]::CreateDirectory((Join-Path $root 'releases'));Move-Item -LiteralPath $candidate -Destination $release
 Json (Join-Path $root 'state\active.json') @{manifestSha256=$digest};Json (Join-Path $root 'config\runtime.json') @{FREVOS_SERVIX_DEPLOYMENT_ROOT=(Join-Path $root 'servix');FREVOS_PUBLIC_ORIGIN='http://127.0.0.1:51099';DATABASE_URL='synthetic-fixture-only'}
 $run='pr_'+[guid]::NewGuid().ToString('N');Json (Join-Path $root ('servix\jobs\components\run-'+$run+'.json')) @{status='succeeded';workspaceId='ws_fixture';requestedBy='usr_fixture';sourceHead=('b'*40)}
 $executorId='ex_'+[guid]::NewGuid().ToString('N');$executor=Join-Path $temporary $executorId;[void][IO.Directory]::CreateDirectory($executor);[IO.File]::WriteAllText((Join-Path $executor 'Verify-AndroidCompatibility.ps1'),'# previous guard',[Text.UTF8Encoding]::new($false))
 $global:PreviewConfigArguments='-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File "'+(Join-Path $release 'deployment\server20\Start-Server20.ps1')+'"';$global:PreviewConfigState='Running';$global:PreviewConfigStarts=0;$global:PreviewConfigFailStart=$false
 $xml=Export-ScheduledTask 'fixture';$taskHash=[BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($xml))).Replace('-','').ToLowerInvariant()
 $config=@{version=1;workspaceId='ws_fixture';listen=@{host='127.0.0.1';port=51100};targets=@(@{origin='http://localhost:51100';deviceId=('fc_'+('a'*32));profileId='fixture-project';serviceId='web'})}
 $plan=@{version=1;id=('pvc_'+[guid]::NewGuid().ToString('N'));action='devsetu.private-preview.configure.v1';approvedBy='Synthetic fixture approval only';executionSid=$global:PreviewConfigSid;workspaceId='ws_fixture';requestedBy='usr_fixture';deploymentRunId=$run;installationRoot=$root;manifestSha256=$digest;nodeExecutable=$NodeExecutable;nodeSha256=(Hash $NodeExecutable);controlTask='Synthetic-Preview-Control';taskXmlSha256=$taskHash;executorRoot=$executor;executorId=$executorId;guardBeforeSha256=(Hash (Join-Path $executor 'Verify-AndroidCompatibility.ps1'));configBeforeSha256=$null;config=$config;createdAt=[DateTimeOffset]::UtcNow.AddSeconds(-1).ToString('o');expiresAt=[DateTimeOffset]::UtcNow.AddMinutes(5).ToString('o')}
 $reference=Join-Path $temporary ($plan.id+'.json');Json $reference $plan;return @{root=$root;reference=$reference;plan=$plan}
}
try{
 $f=Fixture;$runtimeHash=Hash (Join-Path $f.root 'config\runtime.json')
 $ready=& (Join-Path $PSScriptRoot 'Configure-PrivatePreview.ps1') -PlanReference $f.reference -PlanOnly|ConvertFrom-Json
 Assert ($ready.status -ceq 'READY' -and -not(Test-Path -LiteralPath (Join-Path $f.root 'servix\config\preview-relay.json'))) 'Preflight changed application configuration'
 $result=& (Join-Path $PSScriptRoot 'Configure-PrivatePreview.ps1') -PlanReference $f.reference|ConvertFrom-Json
 Assert ($result.status -ceq 'PASS' -and (Hash (Join-Path $f.root 'config\runtime.json')) -ceq $runtimeHash -and $global:PreviewConfigState -ceq 'Running') 'Configuration apply failed preservation'
 $denied=$false;try{& (Join-Path $PSScriptRoot 'Configure-PrivatePreview.ps1') -PlanReference $f.reference|Out-Null}catch{$denied=$true};Assert $denied 'Applied configuration intent replayed'
 $g=Fixture;$global:PreviewConfigFailStart=$true;$oldGuard=$g.plan.guardBeforeSha256;$denied=$false
 try{& (Join-Path $PSScriptRoot 'Configure-PrivatePreview.ps1') -PlanReference $g.reference|Out-Null}catch{$denied=$true}
 Assert ($denied -and -not(Test-Path -LiteralPath (Join-Path $g.root 'servix\config\preview-relay.json')) -and (Hash (Join-Path $g.plan.executorRoot 'Verify-AndroidCompatibility.ps1')) -ceq $oldGuard -and $global:PreviewConfigState -ceq 'Running') 'Configuration recovery failed'
 $h=Fixture;$h.plan.requestedBy='usr_elsewhere';Json $h.reference $h.plan;$denied=$false
 try{& (Join-Path $PSScriptRoot 'Configure-PrivatePreview.ps1') -PlanReference $h.reference -PlanOnly|Out-Null}catch{$denied=$true};Assert $denied 'Other actor publication accepted'
 $legacy=Fixture;$global:PreviewConfigArguments=$global:PreviewConfigArguments.Replace(' -ExecutionPolicy RemoteSigned','')
 $xml=Export-ScheduledTask 'fixture';$legacy.plan.taskXmlSha256=[BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($xml))).Replace('-','').ToLowerInvariant();Json $legacy.reference $legacy.plan
 $result=& (Join-Path $PSScriptRoot 'Configure-PrivatePreview.ps1') -PlanReference $legacy.reference|ConvertFrom-Json
 Assert ($result.status -ceq 'PASS' -and $global:PreviewConfigArguments -cnotmatch 'ExecutionPolicy') 'Legacy default-policy launcher changed'
 @{status='PASS';checks=6;realConfigValidationAndFiles=$true;taskAndHealthTransport='fixed-fixture-functions';nativeLiveAcceptance=$false;runtimePreserved=$true;failedStartRestored=$true;publicationActorBound=$true;legacyLauncherPreserved=$true}|ConvertTo-Json -Compress
}finally{
 $resolved=[IO.Path]::GetFullPath($temporary)
 if([IO.Path]::GetDirectoryName($resolved) -cne $parent -or [IO.Path]::GetFileName($resolved) -cnotmatch '^dvpconfig-[a-f0-9]{32}$'){throw 'Private preview fixture cleanup escaped owned target'}
 Remove-Item -LiteralPath $resolved -Recurse -Force
}
