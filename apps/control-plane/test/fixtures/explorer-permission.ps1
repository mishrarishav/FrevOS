param([Parameter(Mandatory=$true)][string]$Directory,[switch]$Restore)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
$folder=[IO.Path]::GetFullPath($Directory);$parent=[IO.Path]::GetDirectoryName($folder)
if([IO.Path]::GetFileName($folder) -cne 'restricted' -or [IO.Path]::GetFileName($parent) -cnotmatch '^devsetu-permission-runtime-[A-Za-z0-9_-]+$' -or [IO.Path]::GetDirectoryName($parent) -ine [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')){throw 'Permission fixture escaped its temporary directory'}
for($cursor=$folder;;$cursor=[IO.Path]::GetDirectoryName($cursor)){if((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Permission fixture link denied'};if($cursor -ceq [IO.Path]::GetPathRoot($cursor)){break}}
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
$rights=[Security.AccessControl.FileSystemRights]::CreateFiles -bor [Security.AccessControl.FileSystemRights]::CreateDirectories
$rule=[Security.AccessControl.FileSystemAccessRule]::new($sid,$rights,[Security.AccessControl.AccessControlType]::Deny)
$acl=Get-Acl -LiteralPath $folder
if($Restore){[void]$acl.RemoveAccessRuleSpecific($rule)}else{$acl.AddAccessRule($rule)}
Set-Acl -LiteralPath $folder -AclObject $acl
[Console]::Out.Write('{"fixture":true}')
