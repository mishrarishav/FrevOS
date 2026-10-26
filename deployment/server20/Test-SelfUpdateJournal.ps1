$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'Run-SelfUpdate.ps1'),[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'Updater parse failed'}
$producer=@($ast.FindAll({param($node)$node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -ceq 'Publish-Result'},$true))
if($producer.Count -ne 1){throw 'Result producer ownership ambiguous'}
. ([ScriptBlock]::Create($producer[0].Extent.Text))
$temporary=[IO.Path]::GetFullPath([IO.Path]::GetTempPath());$root=Join-Path $temporary ('devsetu-journal-'+[guid]::NewGuid().ToString('N'))
try{
 foreach($part in @('results','private')){[void][IO.Directory]::CreateDirectory((Join-Path $root $part))}
 $request=@{requestId='su_'+('a'*32);candidateId='b'*32;manifestSha256='c'*64}
 foreach($state in @('activating','succeeded','succeeded','failed','succeeded')){
  Publish-Result $request $state
  $saved=Get-Content (Join-Path $root ('results\'+$request.requestId+'.json')) -Raw|ConvertFrom-Json
  if($saved.status -cne $state -or $saved.requestId -cne $request.requestId -or $saved.candidateId -cne $request.candidateId -or $saved.manifestSha256 -cne $request.manifestSha256){throw 'Result transition or identity mismatch'}
 }
 'PASS: native result publication supports activation, terminal updates and repeated recovery with identity preserved'
}finally{
 $resolved=[IO.Path]::GetFullPath($root)
 if(-not $resolved.StartsWith($temporary,[StringComparison]::OrdinalIgnoreCase) -or (Split-Path $resolved -Leaf) -cnotmatch '^devsetu-journal-[a-f0-9]{32}$'){throw 'Journal cleanup escaped owned root'}
 if(Test-Path -LiteralPath $resolved){Remove-Item -LiteralPath $resolved -Recurse -Force}
}
