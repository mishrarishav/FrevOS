param([Parameter(Mandatory=$true)][string]$PlanPath,[Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$PlanSha256)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
if((Get-FileHash -LiteralPath $PlanPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $PlanSha256){throw 'monitor-probe-plan-identity'}
$plan=Get-Content -LiteralPath $PlanPath -Raw|ConvertFrom-Json
if($plan.version -ne 1 -or $plan.action -cne 'probe' -or $plan.id -notmatch '^smo_[a-f0-9]{32}$' -or $plan.expectedComputerName -ine $env:COMPUTERNAME -or [DateTime]::Parse($plan.expiresAt).ToUniversalTime() -le [DateTime]::UtcNow -or @($plan.targets).Count -gt 64){throw 'monitor-probe-scope'}
$base=Split-Path -Parent $PlanPath
foreach($path in @($base,$PlanPath)){
 for($current=$path;$current;$current=[IO.Path]::GetDirectoryName($current)){
  if(((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'monitor-probe-linked-path'}
 }
}
$results=New-Object Collections.Generic.List[object]
foreach($target in $plan.targets){
 $ip=$null
 if($target.management -cne 'Internal' -or -not [Net.IPAddress]::TryParse($target.address,[ref]$ip)){throw 'monitor-probe-target-scope'}
 $o=$ip.GetAddressBytes()
 if($o.Length -ne 4 -or -not($o[0] -eq 10 -or ($o[0] -eq 172 -and $o[1] -ge 16 -and $o[1] -le 31) -or ($o[0] -eq 192 -and $o[1] -eq 168))){throw 'monitor-probe-target-scope'}
 $ports=@{}
 foreach($port in @(5985,5986,445)){
  $tcp=New-Object Net.Sockets.TcpClient
  try{$pending=$tcp.ConnectAsync([string]$target.address,$port);$ports[[string]$port]=($pending.Wait(1800) -and $tcp.Connected)}catch{$ports[[string]$port]=$false}finally{$tcp.Dispose()}
 }
 $endpoint=[string]$target.address;$pinned=$false
 try{
  $ptr=@(Resolve-DnsName -Name $target.address -Type PTR -DnsOnly -QuickTimeout -ErrorAction Stop|Where-Object NameHost|Select-Object -ExpandProperty NameHost)
  if($ptr.Count -eq 1){
   $name=$ptr[0].TrimEnd('.')
   if($name -match '^[A-Za-z0-9][A-Za-z0-9.-]{0,251}[A-Za-z0-9]$'){
    $forward=@(Resolve-DnsName -Name $name -Type A -DnsOnly -QuickTimeout -ErrorAction Stop|Where-Object IPAddress|Select-Object -ExpandProperty IPAddress)
    if($forward.Count -ge 1 -and @($forward|Where-Object {$_ -cne $target.address}).Count -eq 0){$endpoint=$name;$pinned=$true}
   }
  }
 }catch{}
 $results.Add(@{address=[string]$target.address;endpointHost=$endpoint;dnsPinned=$pinned;http5985=$ports['5985'];https5986=$ports['5986'];smb445=$ports['445'];credentialAttempted=$false;authenticated=$false})
}
$receipt=@{version=1;id=$plan.id;action='probe';planSha256=$PlanSha256;computerName=$env:COMPUTERNAME;observedAt=[DateTime]::UtcNow.ToString('o');status='PASS';vendorAttempts=0;targets=@($results.ToArray())}
$path=Join-Path $base 'probe-result.json'
$stream=[IO.File]::Open($path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
try{$bytes=[Text.Encoding]::UTF8.GetBytes(($receipt|ConvertTo-Json -Depth 8 -Compress));$stream.Write($bytes,0,$bytes.Length)}finally{$stream.Dispose()}
