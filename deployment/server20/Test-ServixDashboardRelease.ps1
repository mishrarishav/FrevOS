param([Parameter(Mandatory=$true)][string]$PackageRoot,[Parameter(Mandatory=$true)][string]$ManifestSha256,[Parameter(Mandatory=$true)][string]$PreviousPackageRoot)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
. (Join-Path $PreviousPackageRoot 'deployment\server20\Postgres.ps1')
. (Join-Path $PSScriptRoot 'HttpCommon.ps1')
$before=Test-HttpManifest $PreviousPackageRoot ((Get-FileHash -LiteralPath (Join-Path $PreviousPackageRoot 'release-manifest.json') -Algorithm SHA256).Hash.ToLowerInvariant())
$after=Test-HttpManifest $PackageRoot $ManifestSha256
Assert-ServixDelta $before $after
$denied=$false;try{[void](Test-HttpManifest $PackageRoot ('0'*64))}catch{$denied=$true};if(-not $denied){throw 'Wrong manifest digest accepted'}
$migration=$after.files|Where-Object path -Like 'apps/control-plane/migrations/*'|Select-Object -First 1
$original=$migration.sha256;$migration.sha256='0'*64;$denied=$false
try{Assert-ServixDelta $before $after}catch{$denied=$true}finally{$migration.sha256=$original}
if(-not $denied){throw 'Database migration delta accepted'}
foreach($file in @((Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.ps1'))+@((Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot '..\servix') -Filter '*.ps1'))){
 $tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseFile($file.FullName,[ref]$tokens,[ref]$errors)
 if($errors.Count){throw ('PowerShell syntax failed: '+$file.Name)}
 foreach($assignment in $ast.FindAll({param($node) $node -is [Management.Automation.Language.AssignmentStatementAst] -and $node.Left -is [Management.Automation.Language.VariableExpressionAst]},$true)){
  if(($assignment.Left.VariablePath.UserPath -split ':')[-1] -in @('HOME','PID','Host','PSHOME','true','false','null')){throw 'Reserved variable assignment'}
 }
}
'PASS: exact artifact; bounded delta; wrong digest and migration denial; PowerShell syntax and reserved names'
