param([Parameter(Mandatory=$true)][string]$PlanReference,[switch]$PlanOnly)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
$phase='intent'
trap {
 $failure=@{status='FAIL';phase=$phase;type=$_.Exception.GetType().Name;line=$_.InvocationInfo.ScriptLineNumber}
 $failure|ConvertTo-Json|Set-Content -LiteralPath (Join-Path ([IO.Path]::GetDirectoryName($PlanReference)) 'native-failure.json') -Encoding UTF8
 exit 1
}
function Hash([string]$File){(Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant()}
$plan=Get-Content -LiteralPath $PlanReference -Raw|ConvertFrom-Json
$keys='action,applicationHostBeforeSha256,createdAt,executionSid,expiresAt,id,installationRoot,manifestSha256,operators,profile,requestedBy,version,workspaceId'
if((@($plan.PSObject.Properties.Name|Sort-Object)-join ',') -cne $keys -or $plan.version -ne 1 -or $plan.action -cne 'devsetu.browser-entry.iis.v1' -or $plan.id -cnotmatch '^bgi_[a-f0-9]{32}$' -or $plan.executionSid -cne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value -or $plan.manifestSha256 -cnotmatch '^[a-f0-9]{64}$' -or $plan.workspaceId -cnotmatch '^ws_[a-z0-9_-]+$' -or $plan.requestedBy -cnotmatch '^usr_[A-Za-z0-9_-]+$'){throw 'Browser IIS native intent rejected'}
$now=[DateTimeOffset]::UtcNow;$issued=[DateTimeOffset]::Parse($plan.createdAt);$expires=[DateTimeOffset]::Parse($plan.expiresAt)
if($issued -gt $now -or $expires -le $now -or ($expires-$issued).TotalMinutes -gt 15){throw 'Browser IIS native intent expired'}
$root=[IO.Path]::GetFullPath($plan.installationRoot);$directory=[IO.Path]::GetDirectoryName($PlanReference)
if($root -ieq [IO.Path]::GetPathRoot($root) -or $directory -ine (Join-Path $root ('operator\browser-stage-'+$plan.id))){throw 'Browser IIS native staging escaped'}
$active=Get-Content -LiteralPath (Join-Path $root 'state\active.json') -Raw|ConvertFrom-Json
if($active.manifestSha256 -cne $plan.manifestSha256){throw 'Browser IIS application release moved'}
$files=@('BrowserEntryIisModel.psm1','Plan-BrowserEntryIis.ps1','Apply-BrowserEntryIis.ps1')
if((@($plan.operators.PSObject.Properties.Name|Sort-Object)-join ',') -cne (@($files|Sort-Object)-join ',')){throw 'Browser IIS native operator list differs'}
foreach($name in $files){if($plan.operators.$name -cnotmatch '^[a-f0-9]{64}$' -or (Hash (Join-Path $directory $name)) -cne $plan.operators.$name){throw 'Browser IIS native operator changed'}}
$profileFile=Join-Path $directory 'profile.json'
if($PlanOnly){
 $phase='mapped-iis-plan'
 if(Test-Path -LiteralPath $profileFile){throw 'Browser IIS native plan already prepared'}
 $plan.profile|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $profileFile -Encoding UTF8
 $output=& (Join-Path $directory 'Plan-BrowserEntryIis.ps1') -ProfileFile $profileFile -OutputDirectory $directory -ExpectedApplicationHostSha256 $plan.applicationHostBeforeSha256
 $result=$output|ConvertFrom-Json
 if($result.status -cne 'READY'){throw 'Browser IIS mapped plan failed'}
 $receipt=@{id=$plan.id;manifestSha256=$plan.manifestSha256;status='READY';result=$result;liveIisChanged=$false}
 $receipt|ConvertTo-Json -Depth 7|Set-Content -LiteralPath (Join-Path $directory 'plan-only-result.json') -Encoding UTF8
 $receipt|ConvertTo-Json -Depth 7 -Compress
}else{
 $phase='reviewed-iis-apply'
 $approval=Get-Content -LiteralPath (Join-Path $directory 'approval.json') -Raw|ConvertFrom-Json
 if($approval.operationId -cne $plan.id -or $approval.actor -cne $plan.requestedBy -or $approval.workspaceId -cne $plan.workspaceId -or $approval.executionSid -cne $plan.executionSid -or $approval.profileFile -cne 'profile.json'){throw 'Browser IIS activation actor or operation differs'}
 $result=& (Join-Path $directory 'Apply-BrowserEntryIis.ps1') -OperationDirectory $directory
 $receipt=@{id=$plan.id;manifestSha256=$plan.manifestSha256;status='PASS';result=($result|ConvertFrom-Json)}
 $receipt|ConvertTo-Json -Depth 7|Set-Content -LiteralPath (Join-Path $directory 'native-result.json') -Encoding UTF8
 $receipt|ConvertTo-Json -Depth 7 -Compress
}
