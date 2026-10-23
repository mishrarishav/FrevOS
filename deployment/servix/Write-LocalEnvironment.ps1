# Private connector pipe only. Never emit input, paths, values or exception text.
$ErrorActionPreference='Stop'
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
Set-StrictMode -Version Latest
$temporary=$null;$locked=$null
try {
 $inputText=[Console]::In.ReadToEnd()
 if($inputText.Length -gt 1048576){throw 'capacity'}
 $request=$inputText|ConvertFrom-Json
 $target=[IO.Path]::GetFullPath([string]$request.file)
 if([IO.Path]::GetFileName($target) -cnotmatch '^\.env(?:\.[A-Za-z0-9_-]+)?$' -or [string]$request.expectedDigest -cnotmatch '^[a-f0-9]{64}$'){throw 'scope'}
 $current=$target
 while($current){$item=Get-Item -LiteralPath $current -Force;if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'linked'};$current=[IO.Path]::GetDirectoryName($current)}
 if(-not(Test-Path -LiteralPath $target -PathType Leaf)){throw 'missing'}
 $locked=[IO.File]::Open($target,[IO.FileMode]::Open,[IO.FileAccess]::Read,([IO.FileShare]::Read -bor [IO.FileShare]::Delete))
 if($locked.Length -gt 65536){throw 'capacity'}
 $sha=[Security.Cryptography.SHA256]::Create()
 try{$digest=([BitConverter]::ToString($sha.ComputeHash($locked))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
 if($digest -cne $request.expectedDigest){throw 'changed'}
 $bytes=[Text.UTF8Encoding]::new($false,$true).GetBytes([string]$request.content)
 if($bytes.Length -gt 65536){throw 'capacity'}
 $acl=[IO.File]::GetAccessControl($target,[Security.AccessControl.AccessControlSections]::Access)
 $temporary=Join-Path ([IO.Path]::GetDirectoryName($target)) ('.devsetu-env-'+[guid]::NewGuid().ToString('N')+'.tmp')
 # Create with the source DACL before writing any values; never broaden access.
 $stream=[IO.FileStream]::new($temporary,[IO.FileMode]::CreateNew,[Security.AccessControl.FileSystemRights]::Write,[IO.FileShare]::None,4096,[IO.FileOptions]::WriteThrough,$acl)
 try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose();[Array]::Clear($bytes,0,$bytes.Length)}
 if((Get-Item -LiteralPath $target -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'linked'}
 # ReplaceFile is atomic and retains the existing target's security descriptor.
 [IO.File]::Replace($temporary,$target,[NullString]::Value)
 $temporary=$null
 [Console]::Out.WriteLine('saved')
} catch { exit 1 }
finally {
 if($null -ne $locked){$locked.Dispose()}
 if($null -ne $temporary -and (Test-Path -LiteralPath $temporary)){
  $resolved=[IO.Path]::GetFullPath($temporary)
  if([IO.Path]::GetDirectoryName($resolved) -ceq [IO.Path]::GetDirectoryName($target) -and [IO.Path]::GetFileName($resolved) -cmatch '^\.devsetu-env-[a-f0-9]{32}\.tmp$'){Remove-Item -LiteralPath $resolved -Force}
 }
}
