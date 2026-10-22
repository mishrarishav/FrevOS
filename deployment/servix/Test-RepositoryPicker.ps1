$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
Import-Module (Join-Path $PSScriptRoot 'RepositoryPicker.psm1') -Force
Add-Type -AssemblyName System.Security
$temporary=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
$root=Join-Path $temporary ('frevos-picker-'+[guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($root)
function Assert($Condition,[string]$Message){if(-not $Condition){throw $Message}}
try {
 $git=(Get-Command git.exe -ErrorAction Stop).Source
 $repo=Join-Path $root ('checkout-caf'+[char]0xe9);[void][IO.Directory]::CreateDirectory($repo)
 & $git -C $repo init --initial-branch=feature/picker 2>$null|Out-Null
 & $git -C $repo config user.name 'Picker fixture'
 & $git -C $repo config user.email 'fixture@example.invalid'
 & $git -C $repo -c commit.gpgsign=false commit --allow-empty -m 'fixture' 2>$null|Out-Null
 & $git -C $repo remote add origin 'https://fixture.invalid/team/app.git'
 $head=(& $git -C $repo rev-parse HEAD).Trim()
 $device='fc_'+('a'*32);$credential='fixture-opaque-credential'
 $config=@{version=1;deviceId=$device;profileId='fixture-project';repository=(Join-Path $root 'old-checkout');repositoryOrigin='https://fixture.invalid/team/app.git';credential=$credential;git=$git;server='https://fixture.invalid';stateRoot=(Join-Path $root 'state')}
 $bytes=[Text.Encoding]::UTF8.GetBytes(($config|ConvertTo-Json -Compress))
 $file=Join-Path $root 'device.dpapi'
 try{[IO.File]::WriteAllBytes($file,[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))}finally{[Array]::Clear($bytes,0,$bytes.Length)}
 $originalHash=(Get-FileHash -LiteralPath $file).Hash
 $selection=@{requestId='fp_'+('b'*32);deviceId=$device;profileId='fixture-project';expiresAt=[DateTimeOffset]::UtcNow.AddSeconds(90).ToString('o')}
 foreach($change in @(@{deviceId='fc_'+('f'*32)},@{profileId='wrong-project'},@{expiresAt=[DateTimeOffset]::UtcNow.AddSeconds(-1).ToString('o')})){
  $request=$selection.Clone();foreach($key in $change.Keys){$request[$key]=$change[$key]}
  $denied=$false;try{Set-FrevOSRepository -InstallRoot $root -Selection $request -Repository $repo|Out-Null}catch{$denied=$true}
  Assert $denied 'Invalid request was accepted'
  Assert ((Get-FileHash -LiteralPath $file).Hash -ceq $originalHash) 'Denied request changed configuration'
 }
 $child=Join-Path $repo 'subfolder';[void][IO.Directory]::CreateDirectory($child)
 $denied=$false;try{Set-FrevOSRepository -InstallRoot $root -Selection $selection -Repository $child|Out-Null}catch{$denied=$true}
 Assert $denied 'Non-root folder accepted'
 & $git -C $repo remote set-url origin 'https://wrong.invalid/other.git'
 $denied=$false;try{Set-FrevOSRepository -InstallRoot $root -Selection $selection -Repository $repo|Out-Null}catch{$denied=$true}
 Assert $denied 'Other project accepted'
 & $git -C $repo remote set-url origin $config.repositoryOrigin
 $source=Set-FrevOSRepository -InstallRoot $root -Selection $selection -Repository $repo
 Assert ($source.repository -ieq $repo -and $source.head -ceq $head) 'Repository proof mismatch'
 $clear=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($file),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
 try{$saved=[Text.Encoding]::UTF8.GetString($clear)|ConvertFrom-Json;Assert ($saved.repository -ieq $repo -and $saved.credential -ceq $credential) 'Private configuration was not preserved'}finally{[Array]::Clear($clear,0,$clear.Length);$saved=$null}
 Assert ((Get-FileHash -LiteralPath (Join-Path $root ($selection.requestId+'.dpapi.bak'))).Hash -ceq $originalHash) 'Backup does not match old configuration'
 Assert ((& $git -C $repo rev-parse HEAD).Trim() -ceq $head) 'Git HEAD changed'
 Assert (-not (& $git -C $repo status --porcelain=v1)) 'Git working tree changed'
 $denied=$false;try{Set-FrevOSRepository -InstallRoot $root -Selection $selection -Repository $repo|Out-Null}catch{$denied=$true}
 Assert $denied 'Request replay accepted'
 foreach($name in @('Choose-Repository.ps1','RepositoryPicker.psm1')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $root $name)}
 $bridgeSelection=$selection.Clone();$bridgeSelection.requestId='fp_'+('c'*32);$bridgeSelection.status='choosing';$bridgeSelection.expiresAt=[DateTimeOffset]::UtcNow.AddSeconds(90).ToString('o')
 $info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe';$info.Arguments='-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+(Join-Path $root 'Choose-Repository.ps1')+'"';$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true;$info.StandardOutputEncoding=[Text.UTF8Encoding]::new($false)
 $process=[Diagnostics.Process]::new();$process.StartInfo=$info
 try{[void]$process.Start();$out=$process.StandardOutput.ReadToEndAsync();$err=$process.StandardError.ReadToEndAsync();$bodyBytes=[Text.UTF8Encoding]::new($false).GetBytes((@{selection=$bridgeSelection;repository=$repo}|ConvertTo-Json -Compress));$process.StandardInput.BaseStream.Write($bodyBytes,0,$bodyBytes.Length);$process.StandardInput.Close();if(-not $process.WaitForExit(15000)){$process.Kill();throw 'Picker bridge exceeded deadline'};$result=$out.GetAwaiter().GetResult()|ConvertFrom-Json;[void]$err.GetAwaiter().GetResult();Assert ($process.ExitCode -eq 0 -and $result.status -ceq 'selected' -and $result.source.repository -ieq $repo) 'Hidden UTF-8 picker persistence bridge failed'}finally{$process.Dispose()}
 $servixInstall=Join-Path $root 'servix-device';[void][IO.Directory]::CreateDirectory($servixInstall)
 & $git -C $repo remote add frevos '//10.9.69.20/e$/FrevOS/git/servix.git'
 $servixConfig=$config.Clone();$servixConfig.profileId='servix-development';$servixConfig.repositoryOrigin='https://legacy.invalid/unused.git'
 $servixBytes=[Text.Encoding]::UTF8.GetBytes(($servixConfig|ConvertTo-Json -Compress))
 try{[IO.File]::WriteAllBytes((Join-Path $servixInstall 'device.dpapi'),[Security.Cryptography.ProtectedData]::Protect($servixBytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))}finally{[Array]::Clear($servixBytes,0,$servixBytes.Length)}
 $servixSelection=$selection.Clone();$servixSelection.profileId='servix-development';$servixSelection.requestId='fp_'+('d'*32);$servixSelection.expiresAt=[DateTimeOffset]::UtcNow.AddSeconds(90).ToString('o')
 $centralProof=Set-FrevOSRepository -InstallRoot $servixInstall -Selection $servixSelection -Repository $repo
 Assert ($centralProof.origin -ceq '//10.9.69.20/e$/FrevOS/git/servix.git' -and $centralProof.repositoryId -ceq 'gitrepo_6cb7e163f807493fa37963196c49fbac' -and $centralProof.remoteName -ceq 'frevos') 'Server20 repository identity missing'
 Assert ((& $git -C $repo remote get-url origin).Trim() -ceq 'https://fixture.invalid/team/app.git') 'Legacy origin changed'
 Assert ((& $git -C $repo rev-parse HEAD).Trim() -ceq $head) 'Central selection changed HEAD'
 'PASS: native picker identity, expiry, root and origin; server20 named-remote proof; legacy origin, Git and credential preserved; backups and replay denial'
} finally {
 $resolved=[IO.Path]::GetFullPath($root)
 if($resolved -cne $root -or -not $resolved.StartsWith($temporary+'\',[StringComparison]::OrdinalIgnoreCase) -or (Get-Item -LiteralPath $root).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Fixture cleanup ownership changed'}
 Remove-Item -LiteralPath $root -Recurse -Force
}
