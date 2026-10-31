param([ValidateSet('Prepare','Protect','Unprotect')][string]$Action,[Parameter(Mandatory=$true)][string]$Directory,[string]$ScopeSha256,[string]$FileSha256)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
$boundaryStage='path'
try {
 $target=[IO.Path]::GetFullPath($Directory)
 if(-not [IO.Path]::IsPathRooted($Directory) -or (Split-Path $target -Leaf) -cnotmatch '^pm_[a-f0-9]{32}$'){throw 'Backup directory scope'}
 for($p=$target;$p;$p=Split-Path $p){if((Test-Path -LiteralPath $p) -and ((Get-Item -LiteralPath $p -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked backup directory'};if((Split-Path $p) -eq $p){break}}
 $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
 if($Action -ceq 'Prepare'){
  $boundaryStage='acl-prepare'
  if(Test-Path -LiteralPath $target){throw 'Backup directory collision'}
  [void][IO.Directory]::CreateDirectory($target)
  $acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetOwner($sid);$acl.SetAccessRuleProtection($true,$false)
  foreach($who in @($sid,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($who,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))}
  [IO.DirectoryInfo]::new($target).SetAccessControl($acl)
 }
 $boundaryStage='acl-verify'
 $checked=Get-Acl -LiteralPath $target
 if($checked.GetOwner([Security.Principal.SecurityIdentifier]).Value -cne $sid.Value -or -not $checked.AreAccessRulesProtected){throw 'Backup directory owner'}
 foreach($rule in $checked.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){if($rule.IdentityReference.Value -cnotin @($sid.Value,'S-1-5-18') -or $rule.AccessControlType -cne 'Allow'){throw 'Backup directory ACL'}}
 if($Action -ceq 'Prepare'){@{status='PASS';ownerSid=$sid.Value;privateDirectory=$true}|ConvertTo-Json -Compress;exit 0}
 if($ScopeSha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'Backup scope digest'}
 Add-Type -AssemblyName System.Security
 $file=Join-Path $target 'database.sql.gz.dpapi';$buffer=New-Object byte[] 1048576;$magic=[Text.Encoding]::ASCII.GetBytes('DSDB0001');$stream=$null;$blocks=0L
 $boundaryStage='stream'
 if($Action -ceq 'Protect'){
  $stream=[IO.File]::Open($file,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try {
   $stream.Write($magic,0,8);$scope=[Text.Encoding]::ASCII.GetBytes($ScopeSha256);$stream.Write($scope,0,64);$inputStream=[Console]::OpenStandardInput()
   for(;;){$length=0;while($length -lt $buffer.Length){$n=$inputStream.Read($buffer,$length,$buffer.Length-$length);if($n -eq 0){break};$length+=$n};if($length -eq 0){break}
    $clear=New-Object byte[] $length;[Array]::Copy($buffer,$clear,$length)
    try{$entropy=[Text.Encoding]::UTF8.GetBytes(('devsetu-servix-backup-v1:'+$ScopeSha256+':'+$blocks));$sealed=[Security.Cryptography.ProtectedData]::Protect($clear,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)}finally{[Array]::Clear($clear,0,$clear.Length)}
    $size=[BitConverter]::GetBytes([uint32]$sealed.Length);$stream.Write($size,0,4);$stream.Write($sealed,0,$sealed.Length);$blocks++
   }
   if($blocks -lt 1){throw 'Empty backup'};$stream.Write(([BitConverter]::GetBytes([uint32]0)),0,4);$stream.Flush($true)
  }finally{$stream.Dispose()}
  @{status='PASS';blocks=$blocks;sha256=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant();bytes=(Get-Item -LiteralPath $file).Length;protection='CurrentUser-DPAPI'}|ConvertTo-Json -Compress
 }else{
  if($FileSha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'Backup file digest'}
  $stream=[IO.File]::Open($file,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
  try{
   $hash=[Security.Cryptography.SHA256]::Create();try{$actual=([BitConverter]::ToString($hash.ComputeHash($stream))).Replace('-','').ToLowerInvariant()}finally{$hash.Dispose()}
   if($actual -cne $FileSha256){throw 'Backup file changed'};$stream.Position=0
   $header=New-Object byte[] 72;if($stream.Read($header,0,72) -ne 72 -or [Text.Encoding]::ASCII.GetString($header,0,8) -cne 'DSDB0001' -or [Text.Encoding]::ASCII.GetString($header,8,64) -cne $ScopeSha256){throw 'Backup header differs'}
   $outputStream=[Console]::OpenStandardOutput();$lengthBytes=New-Object byte[] 4
   for(;;){if($stream.Read($lengthBytes,0,4) -ne 4){throw 'Truncated backup'};$length=[BitConverter]::ToUInt32($lengthBytes,0);if($length -eq 0){if($blocks -lt 1 -or $stream.Position -ne $stream.Length){throw 'Backup terminal differs'};break};if($length -lt 1 -or $length -gt 1114112){throw 'Backup block budget'}
    $sealed=New-Object byte[] $length;$offset=0;while($offset -lt $length){$n=$stream.Read($sealed,$offset,$length-$offset);if($n -eq 0){throw 'Truncated backup block'};$offset+=$n}
    $entropy=[Text.Encoding]::UTF8.GetBytes(('devsetu-servix-backup-v1:'+$ScopeSha256+':'+$blocks));$clear=[Security.Cryptography.ProtectedData]::Unprotect($sealed,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    try{if($clear.Length -lt 1 -or $clear.Length -gt 1048576){throw 'Backup clear budget'};$outputStream.Write($clear,0,$clear.Length)}finally{[Array]::Clear($clear,0,$clear.Length)};$blocks++
   };$outputStream.Flush()
  }finally{$stream.Dispose()}
 }
}catch{[Console]::Error.WriteLine(('Private backup boundary failed: '+$boundaryStage+'; '+$_.Exception.GetType().Name+'; '+$_.InvocationInfo.ScriptLineNumber+'; '+$_.FullyQualifiedErrorId+'; '+$_.Exception.HResult));exit 1}
