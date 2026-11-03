$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
$tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'Apply-BrowserEntryIis.ps1'),[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'External health operator parse failed'}
$function=$ast.FindAll({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -ceq 'Test-BrowserEntryExternalReceipt'},$true)
if($function.Count -ne 1){throw 'Exact receipt validator required'}
. ([scriptblock]::Create($function[0].Extent.Text))
$now=[DateTimeOffset]::UtcNow
$request=[pscustomobject]@{operationId=('bgi_'+('a'*32));correlationId=('bg_'+('b'*32));uri='https://gateway.example/workspace/health';observerSid='S-1-5-21-1-2-3-1001';certificateSha256=('c'*64);applicationHostSha256=('d'*64);issuedAt=$now.AddSeconds(-5).ToString('o')}
$receipt=[pscustomobject]@{version=1;operationId=$request.operationId;correlationId=$request.correlationId;uri=$request.uri;observerSid=$request.observerSid;certificateSha256=$request.certificateSha256;applicationHostSha256=$request.applicationHostSha256;requestSha256=('e'*64);observedAt=$now.ToString('o');tlsValidated=$true;httpStatus=200;bodyStatus='ok'}
[void](Test-BrowserEntryExternalReceipt $receipt $request ('e'*64))
$cases=@(@{version=2},@{operationId=('bgi_'+('f'*32))},@{correlationId=('bg_'+('f'*32))},@{uri='https://other.example/workspace/health'},@{observerSid='S-1-5-18'},@{certificateSha256=('f'*64)},@{applicationHostSha256=('f'*64)},@{requestSha256=('f'*64)},@{tlsValidated=$false},@{tlsValidated='true'},@{httpStatus=401},@{bodyStatus='not-ready'},@{observedAt=$now.AddMinutes(-10).ToString('o')},@{observedAt=$now.AddMinutes(10).ToString('o')},@{arbitrary='extra'})
foreach($patch in $cases){$bad=$receipt|ConvertTo-Json|ConvertFrom-Json;foreach($key in $patch.Keys){$bad|Add-Member -NotePropertyName $key -NotePropertyValue $patch[$key] -Force};$denied=$false;try{[void](Test-BrowserEntryExternalReceipt $bad $request ('e'*64))}catch{$denied=$true};if(-not $denied){throw 'Unsafe external health receipt accepted'}}
@{status='PASS';checks=(1+$cases.Count);actualOperatorValidator=$true;tlsAndIdentityAndRequestBound=$true;staleAndMalformedDenied=$true}|ConvertTo-Json -Compress
