$ErrorActionPreference='Stop'
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
try {
 $inputText=[Console]::In.ReadToEnd();if($inputText.Length -gt 8192){throw 'folder-scope-denied'}
 $request=$inputText|ConvertFrom-Json
 Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class DevSetuFolderLocks {
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern SafeFileHandle CreateFile(string p,uint a,uint s,IntPtr sec,uint c,uint f,IntPtr t);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle h,out Info i);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern uint GetFinalPathNameByHandle(SafeFileHandle h,StringBuilder b,uint n,uint f);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateDirectory(string path,IntPtr security);
 [StructLayout(LayoutKind.Sequential)] struct Info {public uint Attributes,CreateLow,CreateHigh,AccessLow,AccessHigh,WriteLow,WriteHigh,Volume,SizeHigh,SizeLow,Links,IndexHigh,IndexLow;}
 public static IDisposable Lock(string directory) {
  var handles=new List<SafeFileHandle>();
  try {
   var all=new Stack<string>();for(string current=Path.GetFullPath(directory);current!=null;current=Path.GetDirectoryName(current))all.Push(current);
   foreach(var current in all) {
    var h=CreateFile(current,0x81,3,IntPtr.Zero,3,0x02200000,IntPtr.Zero);
    if(h.IsInvalid){int code=Marshal.GetLastWin32Error();h.Dispose();throw new Exception(code==5?"folder-permission-denied":code==32?"folder-changed":"folder-path-unavailable");}
    handles.Add(h);Info i;if(!GetFileInformationByHandle(h,out i)||(i.Attributes&0x400)!=0||(i.Attributes&0x10)==0)throw new Exception("folder-scope-denied");
    var b=new StringBuilder(32768);if(GetFinalPathNameByHandle(h,b,(uint)b.Capacity,0)==0)throw new Exception("folder-scope-denied");
    var actual=b.ToString();if(actual.StartsWith("\\\\?\\"))actual=actual.Substring(4);
    if(!String.Equals(actual.TrimEnd('\\'),Path.GetFullPath(current).TrimEnd('\\'),StringComparison.OrdinalIgnoreCase))throw new Exception("folder-scope-denied");
   }
   return new Held(handles);
  }catch{foreach(var h in handles)h.Dispose();throw;}
 }
 sealed class Held:IDisposable{List<SafeFileHandle> hs;public Held(List<SafeFileHandle> value){hs=value;}public void Dispose(){for(int i=hs.Count-1;i>=0;i--)hs[i].Dispose();}}
 public static void Create(string file,bool directory) {
  if(directory){if(!CreateDirectory(file,IntPtr.Zero)){int code=Marshal.GetLastWin32Error();throw new Exception(code==183?"folder-already-exists":code==5?"folder-permission-denied":"folder-path-unavailable");}}
  else {try{using(var stream=new FileStream(file,FileMode.CreateNew,FileAccess.Write,FileShare.None)) {stream.Flush(true);}}catch(IOException error){if(File.Exists(file)||Directory.Exists(file))throw new Exception("folder-already-exists");throw new Exception("folder-path-unavailable",error);}catch(UnauthorizedAccessException){throw new Exception("folder-permission-denied");}}
 }
}
'@
 $root=[IO.Path]::GetFullPath([string]$request.root);$relative=[string]$request.path;$page=[int]$request.page
 if($relative -match '(^|/)(\.|\.\.|)(/|$)|[:\\\x00-\x1f]' -and $relative -or $page -lt 0 -or $page -gt 100){throw 'folder-scope-denied'}
 $target=if($relative){[IO.Path]::GetFullPath((Join-Path $root $relative.Replace('/','\')))}else{$root}
 if($target -ine $root -and -not $target.StartsWith($root.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'folder-scope-denied'}
 $held=[DevSetuFolderLocks]::Lock($target)
 try {
  $created=$null
  if($request.PSObject.Properties.Name -contains 'create'){
   $created=$request.create;$name=[string]$created.name
   if((@($created.PSObject.Properties.Name)|Sort-Object) -join ',' -cne 'kind,name' -or $created.kind -cnotin @('file','directory') -or -not $name -or $name.Length -gt 255 -or $name -match '[\\/:*?"<>|\x00-\x1f\x7f]|[. ]$|^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)' -or $page -ne 0 -or $request.PSObject.Properties.Name -contains 'fingerprint'){throw 'folder-scope-denied'}
   [DevSetuFolderLocks]::Create((Join-Path $target $name),$created.kind -ceq 'directory')
  }
  $before=[IO.Directory]::GetLastWriteTimeUtc($target).Ticks;$names=[Collections.Generic.List[object]]::new();$scanned=0;$truncated=$false
  foreach($entry in [IO.Directory]::EnumerateFileSystemEntries($target)){
   if($scanned -ge 10000){$truncated=$true;break};$scanned++
   try{
    $attributes=[IO.File]::GetAttributes($entry);$directory=[bool]($attributes -band [IO.FileAttributes]::Directory);$linked=[bool]($attributes -band [IO.FileAttributes]::ReparsePoint)
    if(-not $directory -and -not $request.includeFiles){continue}
    $name=[IO.Path]::GetFileName($entry);if($name -match '[\x00-\x1f\x7f]'){$truncated=$true;continue}
    $metadata=@{name=$name;excluded=$linked}
    if($request.includeFiles){$metadata.kind=if($linked){'link'}elseif($directory){'directory'}else{'file'};if(-not $linked){$info=if($directory){[IO.DirectoryInfo]::new($entry)}else{[IO.FileInfo]::new($entry)};$metadata.modifiedAt=$info.LastWriteTimeUtc.ToString('yyyy-MM-ddTHH:mm:ss.fffZ');if(-not $directory){$metadata.size=$info.Length}}}
    $names.Add($metadata)
   }catch{$truncated=$true}
  }
  if($before -ne [IO.Directory]::GetLastWriteTimeUtc($target).Ticks){throw 'folder-changed'}
  $sorted=@($names|Sort-Object {if($_.kind -and $_.kind -cne 'directory'){1}else{0}},{$_.name.ToUpperInvariant()},{$_.name})
  $identity=[string]$before+"`n"+((@($sorted|ForEach-Object {$_.name+'|'+[string]$_.excluded+'|'+$_.kind+'|'+$_.size+'|'+$_.modifiedAt})) -join "`n")
  $sha=[Security.Cryptography.SHA256]::Create();try{$fingerprint=([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($identity)))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
  if($request.PSObject.Properties.Name -contains 'fingerprint' -and $request.fingerprint -cne $fingerprint){throw 'folder-changed'}
  $offset=$page*100;$next=if($offset+100 -lt $sorted.Count){$page+1}else{$null}
  $result=@{fingerprint=$fingerprint;entries=@($sorted|Select-Object -Skip $offset -First 100);nextPage=$next;truncated=$truncated;scannedEntries=$scanned};if($created){$result.created=$created};$result|ConvertTo-Json -Depth 5 -Compress|Write-Output
 }finally{$held.Dispose()}
}catch {
 $code=[string]$_.Exception.GetBaseException().Message
 if($code -notin @('folder-permission-denied','folder-path-unavailable','folder-scope-denied','folder-changed','folder-already-exists')){$code='folder-browser-unavailable'}
 @{errorCode=$code}|ConvertTo-Json -Compress|Write-Output
}
