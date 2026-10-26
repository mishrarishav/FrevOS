# The existing server20 adapter remains an explicit compatibility boundary.
# This worker lives outside the application task that Apply replaces.
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
$inputText=[Console]::In.ReadToEnd();if($inputText.Length -gt 16384){throw 'Invalid platform request'}
$request=$inputText|ConvertFrom-Json
if($request.installationRoot -cne 'E:\FrevOS' -or $request.jobId -cnotmatch '^cj_[a-f0-9]{32}$' -or $request.runId -cnotmatch '^pr_[a-f0-9]{32}$' -or $request.requestedBy -cne 'usr_windows_admin' -or $request.sourceHead -cnotmatch '^[a-f0-9]{40}$' -or $request.archiveSha256 -cnotmatch '^[a-f0-9]{64}$' -or $request.manifestSha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'Platform binding mismatch'}
if((Get-FileHash -LiteralPath $request.archive).Hash.ToLowerInvariant() -cne $request.archiveSha256){throw 'Platform artifact changed'}
$identity=[Security.Principal.WindowsIdentity]::GetCurrent();$actorSid=$identity.User.Value
if(-not([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Native destination requires its own authorized administrator worker'}
$id=$request.jobId.Substring(3);$job=Join-Path $request.installationRoot ('operator\servix-dashboard-'+$id)
if(Test-Path -LiteralPath $job){throw 'Platform request already claimed'}
$acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetAccessRuleProtection($true,$false);$acl.SetOwner([Security.Principal.SecurityIdentifier]::new($actorSid))
foreach($sid in @($actorSid,'S-1-5-18','S-1-5-32-544')|Select-Object -Unique){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))}
[void][IO.Directory]::CreateDirectory($job,$acl)
Copy-Item -LiteralPath $request.archive -Destination (Join-Path $job 'package.zip')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Apply-ServixDashboard.ps1') -Destination (Join-Path $job 'Apply-ServixDashboard.ps1')
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive=[IO.Compression.ZipFile]::OpenRead((Join-Path $job 'package.zip'))
try{
 $entries=@($archive.Entries|Where-Object FullName -CEQ 'release-manifest.json');if($entries.Count -ne 1 -or $entries[0].Length -gt 4000000){throw 'Platform manifest missing'}
 $stream=$entries[0].Open();$memory=[IO.MemoryStream]::new();try{$stream.CopyTo($memory);$manifestBytes=$memory.ToArray()}finally{$stream.Dispose();$memory.Dispose()}
 $manifest=[Text.Encoding]::UTF8.GetString($manifestBytes)|ConvertFrom-Json
 $manifestHash=[BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($manifestBytes)).Replace('-','').ToLowerInvariant()
 if($manifestHash -cne $request.manifestSha256){throw 'Platform manifest reference changed'}
 if($manifest.applicationSource -cne $request.sourceHead){throw 'Platform build source mismatch'}
}finally{$archive.Dispose()}
$script=Join-Path $job 'Apply-ServixDashboard.ps1'
$restoreArguments=@{}
if($request.operation -ceq 'rollback'){$restoreArguments.Restore=$true;$restoreArguments.ExpectedCurrentManifestSha256=[string](Get-Content -LiteralPath (Join-Path $request.installationRoot 'state\active.json') -Raw|ConvertFrom-Json).manifestSha256}elseif($request.operation -cne 'deploy'){throw 'Unknown platform operation'}
& $script -Action Plan -ManifestSha256 $manifestHash -ArchiveSha256 $request.archiveSha256 -ActorSid $actorSid @restoreArguments *> (Join-Path $job 'plan.log')
$plan=Get-Content -LiteralPath (Join-Path $job 'result-plan.json') -Raw|ConvertFrom-Json
if($plan.status -cne 'PASS' -or $plan.manifestSha256 -cne $manifestHash -or $plan.databaseWritten -ne $false){throw 'Native platform plan denied'}
$now=[DateTimeOffset]::UtcNow
$approval=@{action='devsetu.platform.components.v1';workspace='mishrarishav/FrevOS/server20';target='DCAPP7/10.9.69.20';actorSid=$actorSid;correlationId=$id;manifestSha256=$manifestHash;archiveSha256=$request.archiveSha256;publicOrigin=$manifest.publicOrigin;authorization='owner-requested-configured-components';issuedUtc=$now.ToString('o');expiresUtc=$now.AddMinutes(10).ToString('o')}
if($request.operation -ceq 'rollback'){$approval.operation='rollback';$approval.expectedCurrentManifestSha256=$restoreArguments.ExpectedCurrentManifestSha256}
[IO.File]::WriteAllText((Join-Path $job 'change-context.json'),($request|Select-Object runId,jobId,requestedBy,sourceHead,changeDetails|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText((Join-Path $job 'approval.json'),($approval|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
& $script -Action Apply -ManifestSha256 $manifestHash -ArchiveSha256 $request.archiveSha256 -ActorSid $actorSid @restoreArguments *> (Join-Path $job 'apply.log')
$receipt=Get-Content -LiteralPath (Join-Path $job 'result-apply.json') -Raw|ConvertFrom-Json
if($receipt.status -cne 'PASS' -or $receipt.manifestSha256 -cne $manifestHash -or $receipt.databaseWritten -ne $false){throw 'Native platform activation requires receipt inspection'}
