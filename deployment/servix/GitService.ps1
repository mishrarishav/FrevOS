param([ValidateSet('State','Start','Stop','Storage')][string]$Action)
$ErrorActionPreference='Stop'; Set-StrictMode -Version Latest
try {
 $request=[Console]::In.ReadToEnd()|ConvertFrom-Json
 if($request.serviceName -cnotmatch '^[A-Za-z][A-Za-z0-9_-]{0,79}$' -or $request.binarySha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'Invalid service enrollment'}
 for($cursor=[IO.Path]::GetFullPath($request.binary);;$cursor=[IO.Path]::GetDirectoryName($cursor)){
  if([IO.File]::GetAttributes($cursor) -band [IO.FileAttributes]::ReparsePoint){throw 'Linked service executable'}
  if($cursor -eq [IO.Path]::GetPathRoot($cursor)){break}
 }
 if((Get-FileHash -LiteralPath $request.binary -Algorithm SHA256).Hash.ToLowerInvariant() -cne $request.binarySha256){throw 'Service executable identity changed'}
 foreach($directory in $request.privateRoots){
  if(-not [IO.Directory]::Exists($directory)){throw 'Protected recovery directories must be enrolled first'}
  for($cursor=[IO.Path]::GetFullPath($directory);;$cursor=[IO.Path]::GetDirectoryName($cursor)){
   if([IO.File]::GetAttributes($cursor) -band [IO.FileAttributes]::ReparsePoint){throw 'Linked recovery directory'}
   if($cursor -eq [IO.Path]::GetPathRoot($cursor)){break}
  }
  $security=[IO.Directory]::GetAccessControl($directory)
  $allowed=@('S-1-5-18','S-1-5-32-544',[Security.Principal.WindowsIdentity]::GetCurrent().User.Value,$security.GetOwner([Security.Principal.SecurityIdentifier]).Value)
  foreach($rule in $security.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){
   $sid=$rule.IdentityReference.Value
   if($rule.AccessControlType -eq 'Allow' -and ($sid -notin $allowed -or $sid -in @('S-1-1-0','S-1-5-11','S-1-5-32-545','S-1-5-32-546'))){throw 'Recovery directory has unreviewed access'}
  }
 }
 if($Action -eq 'Storage'){@{running=$false}|ConvertTo-Json -Compress;return}
 $service=Get-CimInstance Win32_Service -Filter ('Name='''+$request.serviceName+'''')
 if($null -eq $service -or $service.PathName -cne $request.expectedCommandLine){throw 'Service runtime binding changed'}
 $image=if($service.PathName.StartsWith('"')){[regex]::Match($service.PathName,'^"([^"]+)"').Groups[1].Value}else{($service.PathName -split ' ')[0]}
 if([IO.Path]::GetFullPath($image) -ine [IO.Path]::GetFullPath($request.binary)){throw 'Service image changed'}
 $arguments=@([regex]::Matches($service.PathName,'"[^"\r\n]*"|[^\s"\r\n]+')|ForEach-Object {$_.Value.Trim('"')})
 function Option([string]$Long,[string]$Short){
  $values=@();for($i=1;$i -lt $arguments.Count;$i++){
   if($arguments[$i] -ceq $Long -or $arguments[$i] -ceq $Short){if($i+1 -ge $arguments.Count){throw 'Missing enrolled argument'};$values+=,$arguments[$i+1];$i++}
   elseif($arguments[$i].StartsWith($Long+'=')){$values+=,$arguments[$i].Substring($Long.Length+1)}
  };if($values.Count -ne 1){throw 'Ambiguous enrolled argument'};return $values[0]
 }
 if('web' -cnotin $arguments -or [IO.Path]::GetFullPath((Option '--work-path' '-w')).TrimEnd('\') -ine [IO.Path]::GetFullPath($request.workRoot).TrimEnd('\') -or [IO.Path]::GetFullPath((Option '--config' '-c')) -ine [IO.Path]::GetFullPath((Join-Path $request.workRoot 'app.ini'))){throw 'Service data binding changed'}
 if($Action -eq 'Stop'){Stop-Service -Name $request.serviceName; (Get-Service -Name $request.serviceName).WaitForStatus('Stopped',[TimeSpan]::FromSeconds(30))}
 if($Action -eq 'Start'){Start-Service -Name $request.serviceName; (Get-Service -Name $request.serviceName).WaitForStatus('Running',[TimeSpan]::FromSeconds(30))}
 @{running=((Get-Service -Name $request.serviceName).Status -eq 'Running')}|ConvertTo-Json -Compress
}catch{[Console]::Error.WriteLine('repository-recovery-service-boundary');exit 1}
