#requires -Version 5.1
# Local artifact/operator boundaries only; never invokes the live operator.
param([Parameter(Mandatory=$true)][string]$PackageRoot,[Parameter(Mandatory=$true)][string]$ManifestSha256,[Parameter(Mandatory=$true)][string]$PreviousPackageRoot)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
. (Join-Path $PreviousPackageRoot 'deployment\server20\Postgres.ps1')
. (Join-Path $PSScriptRoot 'HttpCommon.ps1')
$before=Test-HttpManifest $PreviousPackageRoot 'de56c5684970bbe7a053318f532b81d1df562a55d5258e033e636cd11c06eef9'
$after=Test-HttpManifest $PackageRoot $ManifestSha256
Assert-HttpDelta $before $after
$denied=$false
try{[void](Test-HttpManifest $PackageRoot ('0'*64))}catch{$denied=$true}
if(-not $denied){throw 'Wrong digest unexpectedly accepted'}
$migration=$after.files|Where-Object path -Like 'apps/control-plane/migrations/*'|Select-Object -First 1
$original=$migration.sha256;$migration.sha256='0'*64;$denied=$false
try{Assert-HttpDelta $before $after}catch{$denied=$true}finally{$migration.sha256=$original}
if(-not $denied){throw 'Database migration delta unexpectedly accepted'}
foreach($file in Get-ChildItem -LiteralPath $PSScriptRoot -Filter *.ps1){
    $tokens=$null;$parseErrors=$null;$ast=[Management.Automation.Language.Parser]::ParseFile($file.FullName,[ref]$tokens,[ref]$parseErrors)
    if($parseErrors.Count){throw 'PowerShell syntax failed'}
    $assignments=$ast.FindAll({param($node) $node -is [Management.Automation.Language.AssignmentStatementAst] -and $node.Left -is [Management.Automation.Language.VariableExpressionAst]},$true)
    foreach($assignment in $assignments){$name=($assignment.Left.VariablePath.UserPath -split ':')[-1];if($name -in @('HOME','PID','Host','PSHOME','true','false','null')){throw ('Reserved variable assignment: '+$file.Name+':'+$assignment.Extent.StartLineNumber)}}
}
'PASS: package integrity; bounded delta; wrong digest/migration denial; PowerShell syntax; reserved-variable assignments'
