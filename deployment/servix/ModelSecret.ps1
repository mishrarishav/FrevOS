#requires -Version 5.1
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
$text=[Console]::In.ReadToEnd();if($text.Length -gt 8192){throw 'Secret boundary capacity'};$request=$text|ConvertFrom-Json;$text=$null
$names=@($request.PSObject.Properties.Name|Sort-Object)-join ','
if($request.version -ne 1 -or $request.id -cnotmatch '^[a-f0-9]{32}$' -or $request.operation -cnotin @('create','read') -or $names -cnotin @('id,operation,root,version','id,operation,root,value,version')){throw 'Secret boundary scope differs'}
if(($request.operation -ceq 'create' -and $names -cne 'id,operation,root,value,version') -or ($request.operation -ceq 'read' -and $names -cne 'id,operation,root,version')){throw 'Secret boundary fields differ'}
$root=[IO.Path]::GetFullPath($request.root);if(-not [IO.Path]::IsPathRooted($request.root) -or [IO.Path]::GetFileName($root) -cne 'secrets' -or [IO.Path]::GetFileName([IO.Path]::GetDirectoryName($root)) -cnotmatch '^ws_[A-Za-z0-9_-]{1,120}$'){throw 'Secret storage scope differs'}
for($p=$root;;){if(Test-Path -LiteralPath $p){if((Get-Item -LiteralPath $p -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked secret storage'}};$parent=[IO.Path]::GetDirectoryName($p);if(-not $parent -or $parent -ceq $p){break};$p=$parent}
$identity=[Security.Principal.WindowsIdentity]::GetCurrent();$system=[Security.Principal.SecurityIdentifier]::new('S-1-5-18')
if(-not(Test-Path -LiteralPath $root)){
 [void][IO.Directory]::CreateDirectory($root);$acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetAccessRuleProtection($true,$false);$acl.SetOwner($identity.User)
 foreach($sid in @($identity.User,$system)){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,[Security.AccessControl.FileSystemRights]::FullControl,([Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit),[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow))};[IO.DirectoryInfo]::new($root).SetAccessControl($acl)
}
$actual=Get-Acl -LiteralPath $root
if($actual.GetOwner([Security.Principal.SecurityIdentifier]).Value -cne $identity.User.Value -or -not $actual.AreAccessRulesProtected){throw 'Secret storage ownership differs'}
foreach($rule in $actual.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){if($rule.AccessControlType -ceq 'Allow' -and $rule.IdentityReference.Value -cnotin @($identity.User.Value,$system.Value)){throw 'Secret storage grants differ'}}
$file=Join-Path $root ($request.id+'.dpapi');Add-Type -AssemblyName System.Security
if($request.operation -ceq 'create'){
 if($request.value -isnot [string] -or $request.value.Length -gt 4096 -or @(Get-ChildItem -LiteralPath $root -File).Count -ge 1000){throw 'Secret storage capacity'}
 $clear=[Text.UTF8Encoding]::new($false).GetBytes($request.value);try{$sealed=[Security.Cryptography.ProtectedData]::Protect($clear,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);$handle=[IO.File]::Open($file,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$handle.Write($sealed,0,$sealed.Length);$handle.Flush($true)}finally{$handle.Dispose()}}finally{[Array]::Clear($clear,0,$clear.Length)}
}else{
 $info=Get-Item -LiteralPath $file -Force;if($info.Attributes -band [IO.FileAttributes]::ReparsePoint -or $info.Length -gt 16384 -or $info.PSIsContainer){throw 'Secret storage file differs'}
 $clear=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($file),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
 try{[Console]::Out.Write([Text.Encoding]::UTF8.GetString($clear))}finally{[Array]::Clear($clear,0,$clear.Length)}
}
$request=$null
