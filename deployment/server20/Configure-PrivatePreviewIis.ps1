param([Parameter(Mandatory=$true)][string]$PlanReference,[switch]$PlanOnly)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
function Hash([string]$File){(Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant()}
function Plain([string]$File){for($p=[IO.Path]::GetFullPath($File);;$p=[IO.Path]::GetDirectoryName($p)){if([IO.File]::GetAttributes($p) -band [IO.FileAttributes]::ReparsePoint){throw 'Linked private IIS path denied'};if($p -ieq [IO.Path]::GetPathRoot($p)){break}}}
function WriteJson([string]$File,$Value,[switch]$New){$b=[Text.UTF8Encoding]::new($false).GetBytes(($Value|ConvertTo-Json -Depth 12 -Compress));$mode=if($New){[IO.FileMode]::CreateNew}else{[IO.FileMode]::Create};$s=[IO.File]::Open($File,$mode);try{$s.Write($b,0,$b.Length);$s.Flush($true)}finally{$s.Dispose()}}
trap{if(Get-Variable -Name plan -ErrorAction SilentlyContinue){$failure=@{status='FAIL';id=$plan.id;manifestSha256=$plan.manifestSha256;type=$_.Exception.GetType().Name;line=$_.InvocationInfo.ScriptLineNumber;code=$_.FullyQualifiedErrorId;serverChanged=$false};$name=if($PlanOnly){'plan-only-result.json'}else{'result.json'};WriteJson (Join-Path $PSScriptRoot $name) $failure;exit 0};throw}
Plain $PlanReference
$directory=[IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($PlanReference))
if($directory -ine [IO.Path]::GetFullPath($PSScriptRoot) -or (Get-Item -LiteralPath $PlanReference).Length -gt 32768){throw 'Private IIS intent path differs'}
$plan=Get-Content -LiteralPath $PlanReference -Raw|ConvertFrom-Json
if((@($plan.PSObject.Properties.Name|Sort-Object)-join ',') -cne 'action,createdAt,executionSid,expiresAt,id,installationRoot,manifestSha256,payloadSha256,version' -or $plan.version -ne 1 -or $plan.action -cne 'devsetu.private-preview.iis.v1' -or $plan.id -cnotmatch '^pvi_[a-f0-9]{32}$' -or $plan.executionSid -cne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value -or $plan.executionSid -cne 'S-1-5-18'){throw 'Private IIS intent identity differs'}
$now=[DateTimeOffset]::UtcNow;if(([DateTimeOffset]$plan.createdAt) -gt $now -or ([DateTimeOffset]$plan.expiresAt) -le $now -or (([DateTimeOffset]$plan.expiresAt)-([DateTimeOffset]$plan.createdAt)).TotalSeconds -gt 600){throw 'Private IIS intent expired'}
$payloadFile=Join-Path $directory 'payload.json';Plain $payloadFile
if((Get-Item -LiteralPath $payloadFile).Length -gt 32768 -or (Hash $payloadFile) -cne $plan.payloadSha256){throw 'Private IIS payload integrity differs'}
$payload=Get-Content -LiteralPath $payloadFile -Raw|ConvertFrom-Json
foreach($pair in @(@('Configure-PrivatePreviewIis.ps1','mainSha256'),@('PrivatePreviewIisModel.psm1','modelSha256'),@('Configure-PrivatePreview.ps1','configSha256'))){$file=Join-Path $directory $pair[0];Plain $file;if((Hash $file) -cne $payload.operators.($pair[1])){throw 'Private IIS operator integrity differs'}}
Import-Module (Join-Path $directory 'PrivatePreviewIisModel.psm1') -Force -DisableNameChecking
Test-PrivatePreviewIisPayload $payload -RequireFrozen:(-not $PlanOnly)
if($payload.manifestSha256 -cne $plan.manifestSha256 -or $payload.installationRoot -cne $plan.installationRoot){throw 'Private IIS target differs'}
foreach($rule in (Get-Acl -LiteralPath $directory).Access){if($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin @('S-1-5-18','S-1-5-32-544',$payload.operatorSid)){throw 'Private IIS staging permissions differ'}}
$root=[IO.Path]::GetFullPath($payload.installationRoot);Plain $root
$active=Get-Content -LiteralPath (Join-Path $root 'state\active.json') -Raw|ConvertFrom-Json
if($active.manifestSha256 -cne $payload.manifestSha256){throw 'Private IIS active release changed'}
$release=Join-Path $root ('releases\'+$payload.manifestSha256)
$manifestFile=Join-Path $release 'release-manifest.json';if((Hash $manifestFile) -cne $payload.manifestSha256){throw 'Private IIS manifest integrity differs'}
$manifest=Get-Content -LiteralPath $manifestFile -Raw|ConvertFrom-Json
if($manifest.targetHost -ine $env:COMPUTERNAME -or $manifest.targetAddress -cne $payload.iis.address -or $payload.target -cne ($manifest.targetHost+'/'+$manifest.targetAddress)){throw 'Private IIS machine binding differs'}
$currentFile=Join-Path $root 'servix\config\preview-relay.json';Plain $currentFile
if((Hash $currentFile) -cne $payload.configBeforeSha256){throw 'Private IIS relay baseline changed'}
$current=Get-Content -LiteralPath $currentFile -Raw|ConvertFrom-Json
$expected=$current|ConvertTo-Json -Depth 10|ConvertFrom-Json
if(@($expected.targets).Count -ne 1){throw 'Private IIS operation requires one configured origin'}
$expected.listen.host='127.0.0.1';$expected.targets[0].origin='http://'+$payload.iis.hostname
if((ConvertTo-PrivatePreviewCanonical $expected) -cne (ConvertTo-PrivatePreviewCanonical $payload.relay)){throw 'Private IIS relay changes exceed route scope'}
$ipv4=@([Net.Dns]::GetHostAddresses($payload.iis.hostname)|Where-Object AddressFamily -EQ InterNetwork)
if(-not $ipv4.Count -or @($ipv4|Where-Object IPAddressToString -NE $payload.iis.address).Count){throw 'Private IIS DNS does not resolve to its binding'}
$physical=Get-PrivatePreviewIisRoot $payload;if(Test-Path -LiteralPath $physical){throw 'Private IIS physical root already exists'}
$appHost=Join-Path $env:WINDIR 'System32\inetsrv\config\applicationHost.config';Plain $appHost
if((Hash $appHost) -cne $payload.applicationHostBeforeSha256){throw 'Private IIS configuration baseline changed'}
$childDirectory=Join-Path $directory 'config';[void][IO.Directory]::CreateDirectory($childDirectory)
function New-ConfigIntent($Config,[string]$Before,[string]$Id,[string]$Reference){
 $time=[DateTimeOffset]::UtcNow
 $value=@{version=2;action='devsetu.private-preview.configure.v2';id=$Id;approvedBy=$Reference;executionSid='S-1-5-18';workspaceId=$payload.workspaceId;requestedBy=$payload.requestedBy;candidateId=$payload.activation.candidateId;activationRequestId=$payload.activation.requestId;installationRoot=$root;manifestSha256=$payload.manifestSha256;nodeExecutable=$payload.node.file;nodeSha256=$payload.node.sha256;controlTask=$payload.controlTask.name;taskXmlSha256=$payload.controlTask.sha256;executorRoot=$payload.executor.root;executorId=$payload.executor.id;guardBeforeSha256=$payload.executor.guardSha256;configBeforeSha256=$Before;config=$Config;createdAt=$time.ToString('o');expiresAt=$time.AddMinutes(10).ToString('o')}
 $file=Join-Path $childDirectory ($Id+'.json');WriteJson $file $value;return $file
}
$child=New-ConfigIntent $payload.relay $payload.configBeforeSha256 ('pvc_'+$plan.id.Substring(4)) 'Owner requested private IIS route preparation and exact activation review'
& (Join-Path $directory 'Configure-PrivatePreview.ps1') -PlanReference $child -PlanOnly|Out-Null
Add-Type -Path (Join-Path $env:WINDIR 'System32\inetsrv\Microsoft.Web.Administration.dll')
$beforeFingerprint=Get-PrivatePreviewIisFingerprint $appHost $payload.iis
$mapped=Join-Path $directory 'applicationHost.proposed.config';[IO.File]::Copy($appHost,$mapped,$true)
$manager=[Microsoft.Web.Administration.ServerManager]::new($mapped)
try{Add-PrivatePreviewIisModel $manager $payload;$manager.CommitChanges()}finally{$manager.Dispose()}
if((Hash $appHost) -cne $payload.applicationHostBeforeSha256 -or (Get-PrivatePreviewIisFingerprint $mapped $payload.iis) -cne $beforeFingerprint){throw 'Private IIS mapped preparation changed sibling configuration'}
$mappedHash=Hash $mapped;if($payload.expectedIisSha256 -and $mappedHash -cne $payload.expectedIisSha256){throw 'Private IIS mapped artifact differs from review'}
$recoveryCopy=Join-Path $directory 'applicationHost.recovery-check.config';[IO.File]::Copy($mapped,$recoveryCopy,$true)
$manager=[Microsoft.Web.Administration.ServerManager]::new($recoveryCopy)
try{Remove-PrivatePreviewIisModel $manager $payload;$manager.CommitChanges()}finally{$manager.Dispose()}
if((Get-PrivatePreviewIisFingerprint $recoveryCopy $payload.iis) -cne $beforeFingerprint -or (Hash $appHost) -cne $payload.applicationHostBeforeSha256){throw 'Private IIS mapped recovery preservation failed'}
if($PlanOnly){$result=@{status='READY';action=$plan.action;id=$plan.id;manifestSha256=$payload.manifestSha256;payloadSha256=$plan.payloadSha256;proposedApplicationHostSha256=$mappedHash;existingIisFingerprint=$beforeFingerprint;binding=($payload.iis.address+':80:'+$payload.iis.hostname);site=$payload.iis.siteName;pool=$payload.iis.poolName;farm=$payload.iis.farmName;mappedSchemaValidated=$true;mappedRecoveryValidated=$true;siblingConfigurationPreserved=$true;serverChanged=$false};WriteJson (Join-Path $directory 'plan-only-result.json') $result;$result|ConvertTo-Json -Compress;return}
$approval=Get-Content -LiteralPath (Join-Path $directory 'approval.json') -Raw|ConvertFrom-Json
Test-PrivatePreviewIisApproval $approval $plan $payload
WriteJson (Join-Path $directory 'approval-consumed.json') $approval -New
[IO.File]::Copy($appHost,(Join-Path $directory 'applicationHost.before.config'),$false)
[IO.File]::Copy($currentFile,(Join-Path $directory 'relay.before.json'),$false)
$iisChanged=$false;$relayChanged=$false;$folderCreated=$false;$afterHash=$null;$status=$null
try{
 [void][IO.Directory]::CreateDirectory($physical);$folderCreated=$true
 $acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetAccessRuleProtection($true,$false)
 foreach($sid in @('S-1-5-18','S-1-5-32-544',$payload.operatorSid)|Sort-Object -Unique){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))}
 foreach($sid in @('S-1-5-17','S-1-5-32-568')){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),'ReadAndExecute','ContainerInherit,ObjectInherit','None','Allow'))}
 [IO.Directory]::SetAccessControl($physical,$acl)
 $manager=[Microsoft.Web.Administration.ServerManager]::new()
 try{if((Hash $appHost) -cne $payload.applicationHostBeforeSha256){throw 'Private IIS baseline changed before commit'};Add-PrivatePreviewIisModel $manager $payload;$manager.CommitChanges();$iisChanged=$true}finally{$manager.Dispose()}
 $afterHash=Hash $appHost
 if($afterHash -cne $mappedHash -or (Get-PrivatePreviewIisFingerprint $appHost $payload.iis) -cne $beforeFingerprint){throw 'Private IIS live change differs from mapped review'}
 $child=New-ConfigIntent $payload.relay $payload.configBeforeSha256 ('pvc_'+$plan.id.Substring(4)) ('Owner exact private IIS approval '+$plan.id)
 & (Join-Path $directory 'Configure-PrivatePreview.ps1') -PlanReference $child|Out-Null
 $relayChanged=$true
 $request=[Net.HttpWebRequest]::Create('http://'+$payload.iis.address+'/');$request.Host=$payload.iis.hostname;$request.Proxy=$null;$request.AllowAutoRedirect=$false;$request.Timeout=15000
 $response=$null;try{$response=$request.GetResponse()}catch [Net.WebException]{if($_.Exception.Response){$response=$_.Exception.Response}else{throw}}
 try{$status=[int]$response.StatusCode;$stream=$response.GetResponseStream();$reader=[IO.StreamReader]::new($stream);try{$characters=New-Object char[] 128;$count=$reader.ReadBlock($characters,0,$characters.Length);$denial=[string]::new($characters,0,$count)}finally{$reader.Dispose()}}finally{$response.Dispose()}
 if($status -ne 401 -or $denial -cne 'preview-open-from-devsetu'){throw 'Private IIS proxy did not preserve the exact unauthenticated relay response'}
 $health=Invoke-WebRequest -UseBasicParsing -Uri ($payload.portalOrigin+'/health') -TimeoutSec 10
 if($health.StatusCode -ne 200 -or ($health.Content|ConvertFrom-Json).status -cne 'ok' -or (Get-PrivatePreviewIisFingerprint $appHost $payload.iis) -cne $beforeFingerprint){throw 'Private IIS portal or sibling verification failed'}
 $result=@{status='PASS';action=$plan.action;id=$plan.id;manifestSha256=$payload.manifestSha256;payloadSha256=$plan.payloadSha256;applicationHostSha256=(Hash $appHost);previewOrigin=('http://'+$payload.iis.hostname);unauthenticatedPreviewStatus=$status;portalHealth=200;existingIisPreserved=$true;dnsChanged=$false;firewallChanged=$false;databaseWritten=$false;activeApplicationUnchanged=$true}
 WriteJson (Join-Path $directory 'result.json') $result;$result|ConvertTo-Json -Compress
}catch{
 $failure=@{status='FAIL';action=$plan.action;id=$plan.id;manifestSha256=$payload.manifestSha256;type=$_.Exception.GetType().Name;line=$_.InvocationInfo.ScriptLineNumber;unauthenticatedPreviewStatus=$status;iisChanged=$iisChanged;relayChanged=$relayChanged;recovered=$false}
 try{
  if($relayChanged){$restore=New-ConfigIntent $current (Hash $currentFile) ('pvc_'+[guid]::NewGuid().ToString('N')) ('Recovery of owned private IIS operation '+$plan.id);& (Join-Path $directory 'Configure-PrivatePreview.ps1') -PlanReference $restore|Out-Null}
  if($iisChanged){if((Hash $appHost) -cne $afterHash){throw 'IIS changed outside this operation; retained for owner recovery'};$manager=[Microsoft.Web.Administration.ServerManager]::new();try{Remove-PrivatePreviewIisModel $manager $payload;$manager.CommitChanges()}finally{$manager.Dispose()}}
  if((Get-PrivatePreviewIisFingerprint $appHost $payload.iis) -cne $beforeFingerprint -or (Hash $currentFile) -cne $payload.configBeforeSha256){throw 'Private IIS recovery preservation differs'}
  if($folderCreated -and [IO.Path]::GetFullPath($physical) -ceq (Get-PrivatePreviewIisRoot $payload) -and @(Get-ChildItem -LiteralPath $physical -Force).Count -eq 0){[IO.Directory]::Delete($physical,$false)}
  $failure.recovered=$true
 }catch{$failure.recoveryType=$_.Exception.GetType().Name}
 WriteJson (Join-Path $directory 'result.json') $failure;$failure|ConvertTo-Json -Compress;exit 1
}
