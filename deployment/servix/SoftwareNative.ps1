param([ValidateSet('Inventory','Signature')][string]$Action='Inventory',[string]$PackagePath,[string]$Thumbprint)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
try {
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
