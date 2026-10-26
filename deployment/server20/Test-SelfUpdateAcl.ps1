param([Parameter(Mandatory=$true)][string]$PreviousPackageRoot)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
. (Join-Path $PreviousPackageRoot 'deployment\server20\Postgres.ps1')
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'Install-SelfUpdate.ps1'),[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'Installer parse failed'}
$factory=@($ast.FindAll({param($node)$node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -ceq 'New-SelfUpdateAcl'},$true))
if($factory.Count -ne 1){throw 'ACL factory ownership ambiguous'}
. ([ScriptBlock]::Create($factory[0].Extent.Text))
$temporary=[IO.Path]::GetFullPath([IO.Path]::GetTempPath());$root=Join-Path $temporary ('devsetu-acl-'+[guid]::NewGuid().ToString('N'))
$executionSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$actor='S-1-5-21-100-200-300-400'
try{
 [void][IO.Directory]::CreateDirectory($root)
 foreach($kind in @('none','read','modify')){
  $acl=New-SelfUpdateAcl -ActorSid $actor -Access $kind
  if($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -cne $executionSid){throw 'ACL owner must be the execution principal'}
  $path=Join-Path $root $kind;[void][IO.Directory]::CreateDirectory($path,$acl)
  $actual=Get-Acl -LiteralPath $path
  if($actual.GetOwner([Security.Principal.SecurityIdentifier]).Value -cne $executionSid){throw 'Native directory owner mismatch'}
  $rules=@($actual.Access|Where-Object {$_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -ceq 'S-1-5-19' -and $_.AccessControlType -eq 'Allow'})
  if($kind -eq 'none' -and $rules.Count){throw 'Private metadata exposed to runtime'}
  if($kind -ne 'none' -and $rules.Count -ne 1){throw 'Runtime ACL missing'}
  if($kind -eq 'read' -and (($rules[0].FileSystemRights -band [Security.AccessControl.FileSystemRights]::WriteData) -ne 0)){throw 'Read-only runtime can write'}
  if($kind -eq 'modify' -and (($rules[0].FileSystemRights -band [Security.AccessControl.FileSystemRights]::Modify) -ne [Security.AccessControl.FileSystemRights]::Modify)){throw 'Request publication rights missing'}
 }
 'PASS: native ACL creation uses execution ownership; scoped actor access; private/read/request permissions preserved'
}finally{
 $resolved=[IO.Path]::GetFullPath($root)
 if(-not $resolved.StartsWith($temporary,[StringComparison]::OrdinalIgnoreCase) -or (Split-Path $resolved -Leaf) -cnotmatch '^devsetu-acl-[a-f0-9]{32}$'){throw 'ACL fixture cleanup escaped owned root'}
 if(Test-Path -LiteralPath $resolved){Remove-Item -LiteralPath $resolved -Recurse -Force}
}
