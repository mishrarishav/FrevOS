$ErrorActionPreference='Stop';Set-StrictMode -Version Latest;Add-Type -AssemblyName System.Security
$parent=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\');$temporary=Join-Path $parent ('dvpex-'+[guid]::NewGuid().ToString('N'));[void][IO.Directory]::CreateDirectory($temporary)
$originalLocal=$env:LOCALAPPDATA;$env:LOCALAPPDATA=Join-Path $temporary 'local'
function Hash([string]$p){(Get-FileHash -LiteralPath $p).Hash.ToLowerInvariant()}
function Json([string]$p,$v){[void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($p));[IO.File]::WriteAllText($p,($v|ConvertTo-Json -Depth 9 -Compress),[Text.UTF8Encoding]::new($false))}
function Assert([bool]$value,[string]$code){if(-not $value){throw $code}}
$global:PreviewExecutorSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
function Get-ScheduledTask {param($TaskName);return [pscustomobject]@{State=$global:PreviewExecutorState;Principal=[pscustomobject]@{UserId=$global:PreviewExecutorSid;RunLevel='Limited'};Actions=@([pscustomobject]@{Execute=(Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe');Arguments=$global:PreviewExecutorArguments});Settings=[pscustomobject]@{Enabled=$global:PreviewExecutorEnabled}}}
function Export-ScheduledTask {param($TaskName);return '<fixture>'+$global:PreviewExecutorArguments+[string]$global:PreviewExecutorEnabled+'</fixture>'}
function Disable-ScheduledTask {param($TaskName);$global:PreviewExecutorEnabled=$false}
function Enable-ScheduledTask {param($TaskName);$global:PreviewExecutorEnabled=$true}
function Stop-ScheduledTask {param($TaskName);$global:PreviewExecutorState='Ready'}
function Start-ScheduledTask {param($TaskName);$global:PreviewExecutorStarts++;if($global:PreviewExecutorFailStart -and $global:PreviewExecutorStarts -eq 1){throw 'simulated-start-failure'};$global:PreviewExecutorState='Running'}
function Fixture {
 $id='ex_'+[guid]::NewGuid().ToString('N');$root=Join-Path $env:LOCALAPPDATA ('DevSetu\Executors\'+$id);[void][IO.Directory]::CreateDirectory($root)
 [IO.File]::WriteAllText((Join-Path $root 'NativePlatform.cjs'),'module.exports={}',[Text.UTF8Encoding]::new($false));[IO.File]::WriteAllText((Join-Path $root 'executor-scope.txt'),'CurrentUser',[Text.UTF8Encoding]::new($false))
 $platform=Join-Path $temporary ('platform-'+$id);$policy=Join-Path $temporary ('policy-'+$id+'.json');Json $policy @{version=1;workspaceId='ws_fixture';administrators=@()}
 $manifest=Join-Path $temporary ('manifest-'+$id+'.json');Json $manifest @{files=@(@{path='deployment/servix/DiscoveryAccessPolicy.json';sha256=(Hash $policy)})};$digest=Hash $manifest
 $release=Join-Path $platform ('releases\'+$digest);[void][IO.Directory]::CreateDirectory((Join-Path $release 'deployment\servix'));[IO.File]::Copy($policy,(Join-Path $release 'deployment\servix\DiscoveryAccessPolicy.json'),$false);[IO.File]::Copy($manifest,(Join-Path $release 'release-manifest.json'),$false)
 Json (Join-Path $platform 'state\active.json') @{manifestSha256=$digest};Json (Join-Path $platform 'servix\jobs\components\profile-fixture-platform.json') @{repository=@{id=('gitrepo_'+('c'*32))};components=@(@{builderId=$id})}
 $configuration=@{id=$id;credential='synthetic-fixture-only';profileId='fixture-platform';role='builder';bindings=@(@{nativeAdapter=@{file=(Join-Path $root 'NativePlatform.cjs');sha256=(Hash (Join-Path $root 'NativePlatform.cjs'))};nativeOptions=@{baselineRoot=$platform}})}
 $clear=[Text.UTF8Encoding]::new($false).GetBytes(($configuration|ConvertTo-Json -Depth 7 -Compress));try{$cipher=[Security.Cryptography.ProtectedData]::Protect($clear,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[IO.File]::WriteAllBytes((Join-Path $root 'executor.dpapi'),$cipher)}finally{[Array]::Clear($clear,0,$clear.Length)}
 $files=@();foreach($name in @('HttpCommon.ps1','New-ServixDashboardRelease.ps1')){$old=Join-Path $root $name;$source=Join-Path $temporary ($id+'-'+$name);[IO.File]::WriteAllText($old,'# previous operator',[Text.UTF8Encoding]::new($false));[IO.File]::WriteAllText($source,'# reviewed next operator',[Text.UTF8Encoding]::new($false));$files+=@{name=$name;source=$source;sha256=(Hash $source);beforeSha256=(Hash $old)}}
 $global:PreviewExecutorArguments='-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File "'+(Join-Path $root 'Run-Executor.ps1')+'"';$global:PreviewExecutorEnabled=$true;$global:PreviewExecutorState='Running';$global:PreviewExecutorStarts=0;$global:PreviewExecutorFailStart=$false
 $plan=@{version=1;id=('pve_'+[guid]::NewGuid().ToString('N'));action='devsetu.preview.executor-update.v1';workspaceId='ws_fixture';repositoryId=('gitrepo_'+('c'*32));profileId='fixture-platform';role='builder';executorId=$id;executionSid=$global:PreviewExecutorSid;ownerReference='Synthetic preview fixture only';installationRoot=$root;platformRoot=$platform;expectedActiveManifest=$digest;configurationSha256=(Hash (Join-Path $root 'executor.dpapi'));adapterSha256=(Hash (Join-Path $root 'NativePlatform.cjs'));issuedAt=[DateTimeOffset]::UtcNow.AddSeconds(-1).ToString('o');expiresAt=[DateTimeOffset]::UtcNow.AddMinutes(5).ToString('o');files=$files}
 $reference=Join-Path $temporary ($plan.id+'.json');Json $reference $plan;return @{root=$root;plan=$plan;reference=$reference}
}
try{
 $f=Fixture;$ready=& (Join-Path $PSScriptRoot 'Update-PreviewExecutor.ps1') -PlanReference $f.reference -PlanOnly|ConvertFrom-Json;Assert ($ready.status -ceq 'READY') 'Executor preflight failed'
 $result=& (Join-Path $PSScriptRoot 'Update-PreviewExecutor.ps1') -PlanReference $f.reference|ConvertFrom-Json
 Assert ($result.status -ceq 'PASS' -and (Hash (Join-Path $f.root 'executor.dpapi')) -ceq $f.plan.configurationSha256 -and $global:PreviewExecutorEnabled -and $global:PreviewExecutorState -ceq 'Running') 'Executor update lost its enrollment'
 $denied=$false;try{& (Join-Path $PSScriptRoot 'Update-PreviewExecutor.ps1') -PlanReference $f.reference|Out-Null}catch{$denied=$true};Assert $denied 'Executor update replay accepted'
 $g=Fixture;$global:PreviewExecutorFailStart=$true;$denied=$false;try{& (Join-Path $PSScriptRoot 'Update-PreviewExecutor.ps1') -PlanReference $g.reference|Out-Null}catch{$denied=$true};Assert $denied 'Simulated failure was accepted'
 foreach($file in $g.plan.files){Assert ((Hash (Join-Path $g.root $file.name)) -ceq $file.beforeSha256) 'Executor preimage not restored'}
 Assert ((Hash (Join-Path $g.root 'executor.dpapi')) -ceq $g.plan.configurationSha256 -and $global:PreviewExecutorState -ceq 'Running') 'Executor recovery changed identity'
 $h=Fixture;$h.plan.repositoryId='gitrepo_'+('d'*32);Json $h.reference $h.plan;$denied=$false;try{& (Join-Path $PSScriptRoot 'Update-PreviewExecutor.ps1') -PlanReference $h.reference -PlanOnly|Out-Null}catch{$denied=$true};Assert $denied 'Other provider repository accepted'
 @{status='PASS';checks=5;realWindowsFilesAndDpapi=$true;taskTransport='fixed-fixture-functions';nativeLiveAcceptance=$false;providerRepositoryBound=$true;enrollmentPreserved=$true;failedStartRestored=$true}|ConvertTo-Json -Compress
}finally{
 $env:LOCALAPPDATA=$originalLocal;$resolved=[IO.Path]::GetFullPath($temporary)
 if([IO.Path]::GetDirectoryName($resolved) -cne $parent -or [IO.Path]::GetFileName($resolved) -cnotmatch '^dvpex-[a-f0-9]{32}$'){throw 'Executor fixture cleanup escaped owned target'}
 Remove-Item -LiteralPath $resolved -Recurse -Force
}
