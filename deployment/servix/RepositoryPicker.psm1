# The connector owns configuration parsing and persistence. No remote path or
# executable is accepted: Git comes only from this user's installed DPAPI file.
function Set-FrevOSRepository {
 param([Parameter(Mandatory=$true)][string]$InstallRoot,[Parameter(Mandatory=$true)]$Selection,[Parameter(Mandatory=$true)][string]$Repository)
 $ErrorActionPreference='Stop'
 Add-Type -AssemblyName System.Security
 if($Selection.requestId -cnotmatch '^fp_[a-f0-9]{32}$' -or $Selection.deviceId -cnotmatch '^fc_[a-f0-9]{32}$' -or $Selection.profileId -cnotmatch '^[a-z][a-z0-9-]{2,63}$'){throw 'Invalid folder request'}
 $expires=[DateTimeOffset]::Parse($Selection.expiresAt)
 if($expires -le [DateTimeOffset]::UtcNow -or $expires -gt [DateTimeOffset]::UtcNow.AddSeconds(95)){throw 'Folder request expired'}
 $file=Join-Path $InstallRoot 'device.dpapi'
 if((Get-Item -LiteralPath $file).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Configuration identity unavailable'}
 $encrypted=[IO.File]::ReadAllBytes($file)
 $clear=[Security.Cryptography.ProtectedData]::Unprotect($encrypted,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
 try{$config=[Text.UTF8Encoding]::new($false).GetString($clear)|ConvertFrom-Json}finally{[Array]::Clear($clear,0,$clear.Length)}
 $profile=if($config.PSObject.Properties.Name -contains 'profileId'){$config.profileId}else{'servix-development'}
 if($config.deviceId -cne $Selection.deviceId -or $profile -cne $Selection.profileId){throw 'Configuration identity mismatch'}
 $folder=(Get-Item -LiteralPath $Repository -Force)
 if(-not $folder.PSIsContainer -or ($folder.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Choose an existing checkout folder'}
 $full=$folder.FullName.TrimEnd('\')
 if($full -cnotmatch '^[A-Za-z]:\\' -or $full.Length -gt 240){throw 'Choose a local Windows drive checkout'}
 if($env:COMPUTERNAME -ceq 'DCAPP9' -and ($full -ieq 'D:\Servix' -or $full.StartsWith('D:\Servix\',[StringComparison]::OrdinalIgnoreCase))){throw 'Production is excluded'}
 $top=(& $config.git -C $full rev-parse --show-toplevel 2>$null)
 if($LASTEXITCODE -ne 0 -or [IO.Path]::GetFullPath($top.Trim()).TrimEnd('\') -ine $full){throw 'Choose the Git checkout root'}
 $central=($config.PSObject.Properties.Name -contains 'centralRepository')
 $remoteName=if($central){[string]$config.centralRepository.remoteName}elseif($profile -ceq 'servix-development'){'frevos'}else{'origin'}
 $origin=(& $config.git -C $full remote get-url $remoteName 2>$null)
 if($LASTEXITCODE -ne 0){throw 'Repository origin unavailable'}
 $origins=@([string]$config.repositoryOrigin)
 if($profile -ceq 'servix-development'){$origins=@('//10.9.69.20/e$/FrevOS/git/servix.git')}
 if($origin.Trim() -cnotin $origins){throw 'Folder does not match this project repository'}
 $head=(& $config.git -C $full rev-parse HEAD 2>$null)
 if($LASTEXITCODE -ne 0 -or $head.Trim() -cnotmatch '^[a-f0-9]{40}$'){throw 'Repository commit unavailable'}
 $branch=(& $config.git -C $full symbolic-ref --short HEAD 2>$null)
 if($LASTEXITCODE -ne 0){throw 'Choose a checkout on a local branch'}
 if([DateTimeOffset]::UtcNow -ge $expires){throw 'Folder request expired'}
 $config.repository=$full
 $config.repositoryOrigin=$origin.Trim()
 $bytes=[Text.UTF8Encoding]::new($false).GetBytes(($config|ConvertTo-Json -Compress))
 $tmp=Join-Path $InstallRoot ($Selection.requestId+'.tmp')
 $backup=Join-Path $InstallRoot ($Selection.requestId+'.dpapi.bak')
 if((Test-Path -LiteralPath $tmp) -or (Test-Path -LiteralPath $backup)){throw 'Folder request already used'}
 if(@(Get-ChildItem -LiteralPath $InstallRoot -Filter 'fp_*.dpapi.bak').Count -ge 64){throw 'Connector folder backup capacity reached'}
 try {
  $protected=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $handle=[IO.File]::Open($tmp,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try{$handle.Write($protected,0,$protected.Length);$handle.Flush($true)}finally{$handle.Dispose()}
  if((Get-FileHash -LiteralPath $file).Hash -cne ([BitConverter]::ToString(([Security.Cryptography.SHA256]::Create()).ComputeHash($encrypted))).Replace('-','')){throw 'Configuration changed while choosing folder'}
  [IO.File]::Replace($tmp,$file,$backup)
 } finally {
  [Array]::Clear($bytes,0,$bytes.Length)
  $config=$null
  if(Test-Path -LiteralPath $tmp){Remove-Item -LiteralPath $tmp -Force}
 }
 $proof=@{version=1;profileId=$profile;repository=$full;origin=$origin.Trim();head=$head.Trim();branch=$branch.Trim();checkedAt=[DateTimeOffset]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')}
 if($profile -ceq 'servix-development'){$proof.repositoryId='gitrepo_6cb7e163f807493fa37963196c49fbac';$proof.remoteName='frevos'}
 if($central){$proof.repositoryId=[string]$config.centralRepository.id;$proof.remoteName=[string]$config.centralRepository.remoteName}
 return $proof
}
Export-ModuleMember -Function Set-FrevOSRepository
