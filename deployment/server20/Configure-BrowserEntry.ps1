param([Parameter(Mandatory=$true)][string]$PlanReference,[switch]$PlanOnly)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
function Hash([string]$File){(Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant()}
function Plain([string]$File){for($cursor=[IO.Path]::GetFullPath($File);;$cursor=[IO.Path]::GetDirectoryName($cursor)){if([IO.File]::GetAttributes($cursor) -band [IO.FileAttributes]::ReparsePoint){throw 'Linked browser entry path rejected'};if($cursor -eq [IO.Path]::GetPathRoot($cursor)){break}}}
Plain $PlanReference
$plan=Get-Content -LiteralPath $PlanReference -Raw|ConvertFrom-Json
$keys='action,activationRequestId,approvedBy,candidateId,config,configBeforeSha256,controlTask,createdAt,executionSid,expiresAt,id,installationRoot,manifestSha256,nodeExecutable,nodeSha256,requestedBy,runtimeBeforeSha256,taskXmlSha256,version,workspaceId'
if((@($plan.PSObject.Properties.Name|Sort-Object)-join ',') -cne $keys -or $plan.version -ne 1 -or $plan.action -cne 'devsetu.browser-entry.configure.v1' -or $plan.id -cnotmatch '^bge_[a-f0-9]{32}$' -or $plan.executionSid -cne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value -or $plan.requestedBy -cnotmatch '^usr_[A-Za-z0-9_-]+$' -or $plan.workspaceId -cnotmatch '^ws_[A-Za-z0-9_-]+$' -or $plan.approvedBy.Length -lt 10 -or $plan.manifestSha256 -cnotmatch '^[a-f0-9]{64}$' -or $plan.candidateId -cnotmatch '^[a-f0-9]{32}$' -or $plan.activationRequestId -cnotmatch '^su_[a-f0-9]{32}$'){throw 'Browser entry intent scope rejected'}
$now=[DateTimeOffset]::UtcNow;$issued=[DateTimeOffset]::Parse($plan.createdAt);$expires=[DateTimeOffset]::Parse($plan.expiresAt)
if($issued -gt $now -or $expires -le $now -or ($expires-$issued).TotalMinutes -gt 15){throw 'Browser entry intent expired'}
$root=[IO.Path]::GetFullPath($plan.installationRoot);Plain $root
if($root -ieq [IO.Path]::GetPathRoot($root)){throw 'Browser entry root rejected'}
$directory=[IO.Path]::GetDirectoryName($PlanReference)
if($directory -ine (Join-Path $root ('operator\browser-stage-'+$plan.id))){throw 'Browser entry operation directory differs'}
$active=Get-Content -LiteralPath (Join-Path $root 'state\active.json') -Raw|ConvertFrom-Json
if($active.manifestSha256 -cne $plan.manifestSha256){throw 'Browser entry active manifest differs'}
$release=Join-Path $root ('releases\'+$plan.manifestSha256)
$manifestFile=Join-Path $release 'release-manifest.json';Plain $manifestFile
if((Hash $manifestFile) -cne $plan.manifestSha256){throw 'Browser entry manifest identity differs'}
$manifest=Get-Content -LiteralPath $manifestFile -Raw|ConvertFrom-Json
$request=Get-Content -LiteralPath (Join-Path $root ('maintenance\requests\'+$plan.candidateId+'.json')) -Raw|ConvertFrom-Json
$result=Get-Content -LiteralPath (Join-Path $root ('maintenance\results\'+$plan.activationRequestId+'.json')) -Raw|ConvertFrom-Json
$receipt=Get-Content -LiteralPath (Join-Path $root ('operator\servix-dashboard-'+$plan.candidateId+'\result-apply.json')) -Raw|ConvertFrom-Json
if($request.actor -cne $plan.requestedBy -or $request.requestId -cne $plan.activationRequestId -or $request.candidateId -cne $plan.candidateId -or $request.manifestSha256 -cne $plan.manifestSha256 -or $result.requestId -cne $plan.activationRequestId -or $result.candidateId -cne $plan.candidateId -or $result.status -cne 'succeeded' -or $result.manifestSha256 -cne $plan.manifestSha256 -or $receipt.status -cne 'PASS' -or $receipt.manifestSha256 -cne $plan.manifestSha256){throw 'Browser entry activation authority differs'}
foreach($relative in @('deployment/server20/Validate-BrowserEntry.mjs','apps/control-plane/dist/browser-entry.js','apps/control-plane/dist/main.js','apps/control-center/dist-browser/browser-entry.json','deployment/servix/DiscoveryAccessPolicy.json')){$file=Join-Path $release $relative;Plain $file;$entry=@($manifest.files|Where-Object path -CEQ $relative);if($entry.Count -ne 1 -or (Hash $file) -cne $entry[0].sha256){throw 'Browser entry released code changed'}}
if((Get-Content -LiteralPath (Join-Path $release 'deployment\servix\DiscoveryAccessPolicy.json') -Raw|ConvertFrom-Json).workspaceId -cne $plan.workspaceId){throw 'Browser entry workspace differs'}
Plain $plan.nodeExecutable
if((Hash $plan.nodeExecutable) -cne $plan.nodeSha256){throw 'Browser entry node runtime differs'}
$runtimeFile=Join-Path $root 'config\runtime.json';Plain $runtimeFile
if((Hash $runtimeFile) -cne $plan.runtimeBeforeSha256){throw 'Existing runtime configuration changed'}
$runtime=Get-Content -LiteralPath $runtimeFile -Raw|ConvertFrom-Json
$destination=Join-Path $runtime.FREVOS_SERVIX_DEPLOYMENT_ROOT 'config\browser-entry.json'
if([IO.Path]::GetFullPath($destination) -ine (Join-Path $root 'servix\config\browser-entry.json')){throw 'Browser entry destination escaped'}
if(Test-Path -LiteralPath $destination){Plain $destination;if((Hash $destination) -cne $plan.configBeforeSha256){throw 'Browser entry configuration preimage differs'}}elseif($plan.configBeforeSha256 -cne 'absent'){throw 'Browser entry configuration missing'}
$taskXml=Export-ScheduledTask -TaskName $plan.controlTask
$digest=[Security.Cryptography.SHA256]::Create();try{$taskHash=([BitConverter]::ToString($digest.ComputeHash([Text.Encoding]::UTF8.GetBytes($taskXml)))).Replace('-','').ToLowerInvariant()}finally{$digest.Dispose()}
$task=Get-ScheduledTask -TaskName $plan.controlTask
$expectedArguments='-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File "'+(Join-Path $release 'deployment\server20\Start-Server20.ps1')+'"'
$legacyArguments='-NoProfile -NonInteractive -WindowStyle Hidden -File "'+(Join-Path $release 'deployment\server20\Start-Server20.ps1')+'"'
if($taskHash -cne $plan.taskXmlSha256 -or @($task.Actions).Count -ne 1 -or -not $task.Settings.Enabled -or $task.Actions[0].Execute -ine (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe') -or $task.Actions[0].Arguments -cnotin @($expectedArguments,$legacyArguments)){throw 'Browser entry control task differs'}
$proposed=Join-Path $directory 'browser-entry.proposed.json'
if(Test-Path -LiteralPath $proposed){Plain $proposed;if([IO.File]::ReadAllText($proposed) -cne ($plan.config|ConvertTo-Json -Depth 6)){throw 'Browser entry prepared profile changed'}}else{[IO.File]::WriteAllText($proposed,($plan.config|ConvertTo-Json -Depth 6),[Text.UTF8Encoding]::new($false))}
$normalized=& $plan.nodeExecutable (Join-Path $release 'deployment\server20\Validate-BrowserEntry.mjs') $release $proposed
if($LASTEXITCODE -ne 0){throw 'Browser entry configuration rejected'}
$normalized=$normalized|ConvertFrom-Json
if($normalized.listen.port -eq [int]$runtime.PORT){throw 'Browser entry port conflicts with internal listener'}
if($PlanOnly){$value=@{status='READY';id=$plan.id;manifestSha256=$plan.manifestSha256;publicOrigin=$normalized.publicOrigin;basePath=$normalized.basePath;runtimeChanged=$false};$value|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $directory 'plan-only-result.json') -Encoding UTF8;$value|ConvertTo-Json -Compress;return}
$consumed=Join-Path $directory 'approval-consumed.json';$stream=[IO.File]::Open($consumed,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
try{$bytes=[Text.Encoding]::UTF8.GetBytes(($plan|ConvertTo-Json -Depth 8));$stream.Write($bytes,0,$bytes.Length)}finally{$stream.Dispose()}
$previous=if(Test-Path -LiteralPath $destination){[IO.File]::ReadAllBytes($destination)}else{$null}
try{
 if($previous){[IO.File]::WriteAllBytes((Join-Path $directory 'browser-entry.before.json'),$previous)}
 $temporary=Join-Path (Split-Path $destination -Parent) ($plan.id+'.tmp');[IO.File]::Copy($proposed,$temporary,$false)
 if($previous){[IO.File]::Replace($temporary,$destination,[NullString]::Value)}else{[IO.File]::Move($temporary,$destination)}
 Stop-ScheduledTask -TaskName $plan.controlTask;Start-ScheduledTask -TaskName $plan.controlTask
 $ready=$false;for($attempt=0;$attempt -lt 30;$attempt++){try{$private=Invoke-WebRequest -UseBasicParsing -Uri ($runtime.FREVOS_PUBLIC_ORIGIN+'/health') -TimeoutSec 2;$public=Invoke-WebRequest -UseBasicParsing -Uri ('http://127.0.0.1:'+$normalized.listen.port+$normalized.basePath+'/health') -TimeoutSec 2;if($private.StatusCode -eq 200 -and $public.StatusCode -eq 200){$ready=$true;break}}catch{};Start-Sleep -Milliseconds 500}
 if(-not $ready -or (Hash $runtimeFile) -cne $plan.runtimeBeforeSha256){throw 'Browser entry health or runtime preservation failed'}
 $value=@{status='PASS';id=$plan.id;manifestSha256=$plan.manifestSha256;configSha256=(Hash $destination);internalHealth=200;browserHealth=200;runtimeSha256=$plan.runtimeBeforeSha256;publicOrigin=$normalized.publicOrigin;basePath=$normalized.basePath}
 $value|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $directory 'native-result.json') -Encoding UTF8;$value|ConvertTo-Json -Compress
}catch{
 $failure=@{status='FAIL';id=$plan.id;manifestSha256=$plan.manifestSha256;recovered=$false;type=$_.Exception.GetType().Name}
 try{if($previous){[IO.File]::WriteAllBytes($destination,$previous)}elseif(Test-Path -LiteralPath $destination){if((Hash $destination) -cne (Hash $proposed)){throw 'Browser entry recovery ownership changed'};[IO.File]::Delete($destination)};Stop-ScheduledTask -TaskName $plan.controlTask;Start-ScheduledTask -TaskName $plan.controlTask;$healthy=$false;for($attempt=0;$attempt -lt 20;$attempt++){try{$response=Invoke-WebRequest -UseBasicParsing -Uri ($runtime.FREVOS_PUBLIC_ORIGIN+'/health') -TimeoutSec 2;if($response.StatusCode -eq 200 -and ($response.Content|ConvertFrom-Json).status -ceq 'ok'){$healthy=$true;break}}catch{};Start-Sleep -Milliseconds 500};if(-not $healthy -or (Hash $runtimeFile) -cne $plan.runtimeBeforeSha256){throw 'Browser entry recovery health failed'};$failure.recovered=$true}catch{$failure.recoveryType=$_.Exception.GetType().Name}
 $failure|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $directory 'native-result.json') -Encoding UTF8
 throw 'Browser entry configuration failed; inspect protected result'
}
