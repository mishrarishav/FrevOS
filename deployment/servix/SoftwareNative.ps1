param([ValidateSet('Inventory','Signature','Services','ServiceStart','ServiceStop')][string]$Action='Inventory',[string]$PackagePath,[string]$Thumbprint,[string]$ServiceName,[string]$DefinitionSha256)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
try {
 if($Action -cin @('Services','ServiceStart','ServiceStop')){
  Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices; using System.Diagnostics; using System.Threading;
public static class DevSetuScm {
 [StructLayout(LayoutKind.Sequential)] public struct Status { public uint Type,State,Controls,Win32Exit,ServiceExit,Checkpoint,WaitHint,Pid,Flags; }
 [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr OpenSCManager(string machine,string database,uint access);
 [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr OpenService(IntPtr scm,string name,uint access);
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool CloseServiceHandle(IntPtr h);
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool QueryServiceStatusEx(IntPtr h,int level,out Status status,int size,out int needed);
 [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool StartService(IntPtr h,int count,IntPtr args);
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool ControlService(IntPtr h,uint control,out Status status);
 public static bool Can(string name,uint access) { var scm=OpenSCManager(null,null,1);if(scm==IntPtr.Zero)return false;try { var h=OpenService(scm,name,access);if(h==IntPtr.Zero)return false;CloseServiceHandle(h);return true; } finally {CloseServiceHandle(scm);} }
 public static int Act(string name,bool start) { var scm=OpenSCManager(null,null,1);if(scm==IntPtr.Zero)return Marshal.GetLastWin32Error();try {var h=OpenService(scm,name,4|(start?16u:32u));if(h==IntPtr.Zero)return Marshal.GetLastWin32Error();try {Status s;int needed;int size=Marshal.SizeOf(typeof(Status));if(!QueryServiceStatusEx(h,0,out s,size,out needed))return Marshal.GetLastWin32Error();uint target=start?4u:1u;if(s.State==target)return 0;if(start){if(!StartService(h,0,IntPtr.Zero))return Marshal.GetLastWin32Error();}else{if(!ControlService(h,1,out s))return Marshal.GetLastWin32Error();}var timer=Stopwatch.StartNew();while(timer.ElapsedMilliseconds<45000){if(!QueryServiceStatusEx(h,0,out s,size,out needed))return Marshal.GetLastWin32Error();if(s.State==target)return 0;Thread.Sleep(200);}return 1460;}finally{CloseServiceHandle(h);}}finally{CloseServiceHandle(scm);} }
}
'@
  function SText($v,[int]$max=180){return (([string]$v -replace '[\x00-\x1f\x7f]',' ').Trim()).Substring(0,[Math]::Min($max,(([string]$v -replace '[\x00-\x1f\x7f]',' ').Trim()).Length))}
  function SHash($v){$bytes=[Text.Encoding]::UTF8.GetBytes(($v|ConvertTo-Json -Compress));$hash=[Security.Cryptography.SHA256]::Create();try{return [BitConverter]::ToString($hash.ComputeHash($bytes)).Replace('-','').ToLowerInvariant()}finally{$hash.Dispose()}}
  function Definition($s){return SHash @('windows-scm',[string]$s.Name,[string]$s.PathName,[string]$s.StartName,[string]$s.ServiceType)}
  function Protected($s){return $s.Name -match '^(?:RpcSs|RpcEptMapper|DcomLaunch|EventLog|SamSs|LSM|WinDefend|BFE|MpsSvc|Schedule|Winmgmt|Dnscache|Dhcp|nsi|NlaSvc|Netlogon|KeyIso|SecurityHealthService)$' -or $s.ServiceType -match 'Driver' -or ([string]$s.PathName).IndexOf($PSScriptRoot,[StringComparison]::OrdinalIgnoreCase) -ge 0 -or [string]$s.Name -cnotmatch '^[A-Za-z0-9][A-Za-z0-9_.@$ -]{0,179}$'}
  if($Action -cne 'Services'){
   if($ServiceName -cnotmatch '^[A-Za-z0-9][A-Za-z0-9_.@$ -]{0,179}$' -or $DefinitionSha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'Service scope differs'}
   $s=Get-CimInstance -ClassName Win32_Service -Filter ("Name='"+$ServiceName+"'")
   if(-not $s -or (Protected $s) -or (Definition $s) -cne $DefinitionSha256){[Console]::Out.Write('{"result":"service-changed"}');exit}
   $errorCode=[DevSetuScm]::Act($ServiceName,($Action -ceq 'ServiceStart'))
   $result=if($errorCode -eq 0){if($Action -ceq 'ServiceStart'){'service-started'}else{'service-stopped'}}elseif($errorCode -eq 5){'os-permission-denied'}elseif($errorCode -eq 1051){'dependents-running'}elseif($errorCode -eq 1460){'interrupted'}else{'failed'}
   [Console]::Out.Write((@{result=$result}|ConvertTo-Json -Compress));exit
  }
  $items=[Collections.Generic.List[object]]::new();$all=@(Get-CimInstance -ClassName Win32_Service -ErrorAction Stop);$truncated=$all.Count -gt 5000
  foreach($s in @($all|Sort-Object DisplayName,Name|Select-Object -First 5000)){
   $protected=Protected $s
   $state=switch([string]$s.State){'Running'{'running'}'Stopped'{'stopped'}'Paused'{'paused'}'Start Pending'{'start-pending'}'Stop Pending'{'stop-pending'}default{'unknown'}}
   $row=@{id=(SHash @('windows-scm',([string]$s.Name).ToLowerInvariant()));name=(SText $s.Name);displayName=(SText $s.DisplayName);manager='windows-scm';definitionSha256=(Definition $s);status=$state;startupType=(SText $s.StartMode);canStart=(-not $protected -and [DevSetuScm]::Can($s.Name,16));canStop=(-not $protected -and [bool]$s.AcceptStop -and [DevSetuScm]::Can($s.Name,32));protected=$protected}
   if($s.Description){$row.description=SText $s.Description 600};$items.Add($row)
  }
  [Console]::Out.Write((@{version=1;observedAt=[DateTimeOffset]::UtcNow.ToString('o');platform='win32';status=if($truncated){'partial'}else{'ready'};truncated=$truncated;items=@($items.ToArray())}|ConvertTo-Json -Depth 5 -Compress));exit
 }
 if($Action -ceq 'Signature'){
  if(-not [IO.Path]::IsPathRooted($PackagePath) -or $Thumbprint -cnotmatch '^[a-fA-F0-9]{40,64}$'){throw 'Signature scope'}
  $s=Get-AuthenticodeSignature -LiteralPath $PackagePath
  if($s.Status -ne 'Valid' -or $s.SignerCertificate.Thumbprint -ine $Thumbprint){throw 'Signature mismatch'}
  [Console]::Out.Write('{"verified":true}');exit
 }
 $rows=[Collections.Generic.List[object]]::new();$partial=$false;$truncated=$false
 function Text($v){if($null -eq $v){return ''};return ([string]$v -replace '[\x00-\x1f\x7f]',' ').Trim().Substring(0,[Math]::Min(180,([string]$v -replace '[\x00-\x1f\x7f]',' ').Trim().Length))}
 foreach($hive in @([Microsoft.Win32.RegistryHive]::LocalMachine,[Microsoft.Win32.RegistryHive]::CurrentUser)){
  foreach($view in @([Microsoft.Win32.RegistryView]::Registry64,[Microsoft.Win32.RegistryView]::Registry32)){
   $base=$null;$uninstall=$null
   try{
    $base=[Microsoft.Win32.RegistryKey]::OpenBaseKey($hive,$view)
    $uninstall=$base.OpenSubKey('Software\Microsoft\Windows\CurrentVersion\Uninstall',$false)
    if($null -eq $uninstall){continue}
    foreach($name in $uninstall.GetSubKeyNames()){
     if($rows.Count -ge 5000){$truncated=$true;break};$key=$null
     try{
      $key=$uninstall.OpenSubKey($name,$false);if($null -eq $key){continue}
      $display=Text ($key.GetValue('DisplayName'));if(-not $display){continue}
      $row=@{name=$display;source='registry'};$v=Text ($key.GetValue('DisplayVersion'));$p=Text ($key.GetValue('Publisher'));$date=[string]$key.GetValue('InstallDate')
      if($v){$row.version=$v};if($p){$row.publisher=$p};if($date -cmatch '^\d{8}$'){try{$row.installedOn=([DateTime]::ParseExact($date,'yyyyMMdd',[Globalization.CultureInfo]::InvariantCulture)).ToString('yyyy-MM-dd')}catch{}}
      $rows.Add($row)
     }catch{$partial=$true}finally{if($key){$key.Dispose()}}
    }
   }catch{$partial=$true}finally{if($uninstall){$uninstall.Dispose()};if($base){$base.Dispose()}}
  }
 }
 try{
  Get-AppxPackage -ErrorAction Stop | ForEach-Object {
   if($rows.Count -ge 5000){$truncated=$true;return};$name=Text $_.Name
   if($name){$rows.Add(@{name=$name;version=(Text $_.Version);publisher=(Text $_.Publisher);source='appx'})}
  }
 }catch{$partial=$true}
 $value=@{version=1;observedAt=[DateTimeOffset]::UtcNow.ToString('o');platform='win32';scope='windows-machine-and-connector-user';status=if($partial -or $truncated){'partial'}else{'ready'};truncated=$truncated;items=@($rows.ToArray())}
 [Console]::Out.Write(($value|ConvertTo-Json -Depth 5 -Compress))
}catch{[Console]::Error.WriteLine('Software inspection unavailable');exit 1}
