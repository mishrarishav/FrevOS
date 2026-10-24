#requires -Version 5.1
$ErrorActionPreference='Stop'
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
$inputPath=[Console]::In.ReadToEnd()
$target=[IO.Path]::GetFullPath($inputPath)
$temp=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
if([IO.Path]::GetDirectoryName($target).TrimEnd('\') -ine $temp -or [IO.Path]::GetFileName($target) -cnotmatch '^devsetu-setup-[A-Za-z0-9]+$'){throw 'Invalid private setup session'}
$directory=Get-Item -LiteralPath $target -Force
if(-not $directory.PSIsContainer -or ($directory.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Invalid setup directory'}
$identity=[Security.Principal.WindowsIdentity]::GetCurrent().User
$acl=[Security.AccessControl.DirectorySecurity]::new()
$acl.SetOwner($identity);$acl.SetAccessRuleProtection($true,$false)
foreach($sid in @($identity,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,[Security.AccessControl.FileSystemRights]::FullControl,[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow))}
$directory.SetAccessControl($acl)
