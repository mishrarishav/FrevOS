$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'PrivatePreviewIisModel.psm1') -Force -DisableNameChecking
function Fixture {
 return (@{version=1;workspaceId='ws_fixture';requestedBy='usr_fixture';manifestSha256=('a'*64);operatorSid='S-1-5-21-1-2-3-4';installationRoot='C:\fixture';target='FIXTURE/10.1.2.3';portalOrigin='http://10.1.2.3';activation=@{candidateId=('b'*32);requestId=('su_'+('c'*32))};applicationHostBeforeSha256=('d'*64);configBeforeSha256=('e'*64);controlTask=@{name='fixture';sha256=('a'*64)};executor=@{id=('ex_'+('a'*32));root='C:\fixture-executor';guardSha256=('a'*64)};node=@{file='C:\fixture\node\node.exe';sha256=('a'*64)};operators=@{mainSha256=('a'*64);modelSha256=('a'*64);configSha256=('a'*64);sourceHead=('b'*40)};expectedIisSha256=('f'*64);iis=@{siteName='FixturePreview';poolName='FixturePreview';farmName='FixturePreview-Upstream';directory='preview-iis';address='10.1.2.3';hostname='fixture.internal';port=80};relay=@{version=1;workspaceId='ws_fixture';listen=@{host='127.0.0.1';port=51860};targets=@(@{origin='http://fixture.internal'})}}|ConvertTo-Json -Depth 12|ConvertFrom-Json)
}
$p=Fixture;Test-PrivatePreviewIisPayload $p -RequireFrozen
$cases=@(
 {param($p)$p.iis.directory='..\customer'},
 {param($p)$p.iis.address='8.8.8.8'},
 {param($p)$p.iis.port='80'},
 {param($p)$p.relay.listen.port='51860'},
 {param($p)$p.relay.listen.host='0.0.0.0'},
 {param($p)$p.iis.hostname='fixture.internal/path'},
 {param($p)$p.portalOrigin='http://fixture.internal'},
 {param($p)$p.operators.sourceHead=$null},
 {param($p)$p.expectedIisSha256=$null},
 {param($p)$p|Add-Member -NotePropertyName command -NotePropertyValue 'unsupported'},
 {param($p)$p.iis|Add-Member -NotePropertyName command -NotePropertyValue 'unsupported'},
 {param($p)$p.version='1'}
)
foreach($change in $cases){$p=Fixture;& $change $p;$denied=$false;try{Test-PrivatePreviewIisPayload $p -RequireFrozen}catch{$denied=$true};if(-not $denied){throw 'Invalid private IIS payload accepted'}}
if((ConvertTo-PrivatePreviewCanonical ([pscustomobject]@{b=2;a=@(1)})) -cne '{"a":[1],"b":2}'){throw 'Private IIS canonical data differs'}
$p=Fixture;$now=[DateTimeOffset]::UtcNow;$plan=[pscustomobject]@{id=('pvi_'+('a'*32));action='devsetu.private-preview.iis.v1';payloadSha256=('b'*64)}
$approval=[pscustomobject]@{version=1;decision='approved';action=$plan.action;correlationId=$plan.id;payloadSha256=$plan.payloadSha256;manifestSha256=$p.manifestSha256;operatorSha256=$p.operators.mainSha256;workspaceId=$p.workspaceId;target=$p.target;actor=$p.requestedBy;actorSid=$p.operatorSid;questionItemId='owner-exact-review-fixture';issuedUtc=$now.AddSeconds(-1).ToString('o');expiresUtc=$now.AddMinutes(14).ToString('o')}
Test-PrivatePreviewIisApproval $approval $plan $p $now
foreach($key in @($approval.PSObject.Properties.Name)){
 $bad=$approval|ConvertTo-Json|ConvertFrom-Json
 $bad.$key=switch($key){version {'1'};questionItemId {''};issuedUtc {$now.AddMinutes(1).ToString('o')};expiresUtc {$now.AddSeconds(-1).ToString('o')};default {'mismatched'}}
 $denied=$false;try{Test-PrivatePreviewIisApproval $bad $plan $p $now}catch{$denied=$true};if(-not $denied){throw 'Mismatched private IIS approval accepted'}
}
$bad=$approval|ConvertTo-Json|ConvertFrom-Json;$bad.expiresUtc=$now.AddMinutes(16).ToString('o')
$denied=$false;try{Test-PrivatePreviewIisApproval $bad $plan $p $now}catch{$denied=$true};if(-not $denied){throw 'Overlong private IIS approval accepted'}
@{status='PASS';checks=30;invalidPayloadCases=$cases.Count;invalidApprovalCases=15;liveIisChanged=$false}|ConvertTo-Json -Compress
