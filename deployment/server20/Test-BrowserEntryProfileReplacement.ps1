param([string]$OperatorReference=(Join-Path $PSScriptRoot 'Configure-BrowserEntry.ps1'))
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
$tokens=$null;$parseErrors=$null;$operator=[Management.Automation.Language.Parser]::ParseFile($OperatorReference,[ref]$tokens,[ref]$parseErrors)
if($parseErrors.Count){throw 'Browser profile operator has syntax errors'}
$calls=@($operator.FindAll({param($node) $node -is [Management.Automation.Language.InvokeMemberExpressionAst] -and $node.Static -and $node.Expression.Extent.Text -ceq '[IO.File]' -and $node.Member.Extent.Text -ceq 'Replace' -and $node.Arguments.Count -eq 3 -and $node.Arguments[0].Extent.Text -ceq '$temporary' -and $node.Arguments[1].Extent.Text -ceq '$destination'},$true))
if($calls.Count -ne 1){throw 'Browser profile atomic replacement call differs'}
$expression=[scriptblock]::Create($calls[0].Extent.Text)
$parent=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\');$owned=Join-Path $parent ('dvbp-'+[guid]::NewGuid().ToString('N'));[void][IO.Directory]::CreateDirectory($owned)
function Digest([byte[]]$bytes){$hash=[Security.Cryptography.SHA256]::Create();try{return [Convert]::ToBase64String($hash.ComputeHash($bytes))}finally{$hash.Dispose()}}
try{
 $destination=Join-Path $owned 'browser-entry.json';$temporary=Join-Path $owned 'bge-verified.tmp'
 $before=[Text.UTF8Encoding]::new($false).GetBytes('{"version":1,"publicOrigin":"https://edge.fixture","basePath":"/workspace","proxyHosts":["entry-upstream"],"listen":{"host":"127.0.0.1","port":3002}}')
 $proposed=[Text.UTF8Encoding]::new($false).GetBytes('{"version":1,"publicOrigin":"https://edge.fixture","basePath":"/workspace","proxyHosts":["entry-upstream"],"listen":{"host":"127.0.0.1","port":3002},"connectorTransport":true}')
 [IO.File]::WriteAllBytes($destination,$before);[IO.File]::WriteAllBytes($temporary,$proposed)
 & $expression
 if((Digest ([IO.File]::ReadAllBytes($destination))) -cne (Digest $proposed) -or (Test-Path -LiteralPath $temporary)){throw 'Existing configured profile was not atomically replaced'}
 [IO.File]::WriteAllBytes($destination,$before);[IO.File]::WriteAllBytes($temporary,$proposed)
 $locked=[IO.File]::Open($destination,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read);$denied=$false
 try{try{& $expression}catch{$denied=$true}}finally{$locked.Dispose()}
 if(-not $denied -or (Digest ([IO.File]::ReadAllBytes($destination))) -cne (Digest $before)){throw 'Locked profile changed before atomic replacement succeeded'}
 # The existing operator's recovery path retains exact saved profile bytes.
 [IO.File]::WriteAllBytes($destination,$before)
 if((Digest ([IO.File]::ReadAllBytes($destination))) -cne (Digest $before)){throw 'Saved profile recovery differs'}
 @{status='PASS';checks=3;actualOperatorExpression=$true;existingProfileReplaced=$true;lockedPreimagePreserved=$true;savedProfileRecovery=$true;externalChanges=$false}|ConvertTo-Json -Compress
}finally{if([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($owned)) -cne $parent -or [IO.Path]::GetFileName($owned) -cnotmatch '^dvbp-[a-f0-9]{32}$'){throw 'Browser profile fixture escaped owned temporary directory'};Remove-Item -LiteralPath $owned -Recurse -Force}
