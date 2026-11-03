$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'BrowserEntryIisModel.psm1') -Force
$profile=[pscustomobject]@{version=1;siteName='ExistingSite';basePath='/workspace';poolName='BrowserEntry';farmName='BrowserEntry-Upstream';physicalPath='D:\BrowserEntry\public';publicOrigin='https://gateway.example.org';upstreamOrigin='http://127.0.0.1:3002';allowedClients=@('10.20.30.9');httpsOnly=$false}
Test-BrowserEntryIisProfile $profile
$cases=@(
 @{publicOrigin='http://gateway.example.org'},
 @{publicOrigin='https://gateway.example.org/other'},
 @{upstreamOrigin='http://203.0.113.1'},
 @{upstreamOrigin='http://127.0.0.1/other'},
 @{basePath='/workspace/other'},
 @{farmName='bad/name'},
 @{physicalPath='D:\'},
 @{physicalPath='D:\BrowserEntry\..\other'},
 @{allowedClients=@()},
 @{allowedClients=@('0:0:0:0:0:0:0:1')},
 @{unexpected=$true}
)
foreach($case in $cases){$copy=$profile|ConvertTo-Json -Depth 5|ConvertFrom-Json;foreach($key in $case.Keys){$copy|Add-Member -NotePropertyName $key -NotePropertyValue $case[$key] -Force};$rejected=$false;try{Test-BrowserEntryIisProfile $copy}catch{$rejected=$true};if(-not $rejected){throw 'Unsafe browser IIS profile accepted'}}
@{status='PASS';validProfiles=1;rejectedProfiles=$cases.Count;liveIisChanged=$false}|ConvertTo-Json -Compress
