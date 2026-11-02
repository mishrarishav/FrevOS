param([Parameter(Mandatory=$true)][string]$ConfigReference)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.Security
Add-Type -AssemblyName System.IO.Compression.FileSystem
$configuration=Get-Content -LiteralPath $ConfigReference -Raw|ConvertFrom-Json
if([Security.Principal.WindowsIdentity]::GetCurrent().User.Value -cne 'S-1-5-18' -or $configuration.phase -cne 'initialize-signing'){throw 'Signing initialization requires its approved one-time system boundary'}
$planPath=[IO.Path]::GetFullPath($configuration.signingSetupPlanReference)
$boundary=[IO.Path]::GetFullPath((Join-Path $configuration.root 'incoming'))+'\'
if(-not $planPath.StartsWith($boundary,[StringComparison]::OrdinalIgnoreCase) -or (Get-Item -LiteralPath $planPath).Attributes -band [IO.FileAttributes]::ReparsePoint -or (Get-FileHash -LiteralPath $planPath).Hash.ToLowerInvariant() -cne $configuration.signingSetupPlanSha256){throw 'Signing plan integrity mismatch'}
$plan=Get-Content -LiteralPath $planPath -Raw|ConvertFrom-Json
$now=[DateTimeOffset]::UtcNow
if($plan.version -ne 1 -or $plan.action -cne 'android-signing:create' -or $plan.id -cnotmatch '^ak_[a-f0-9]{32}$' -or $plan.workspaceId -cne $configuration.workspaceId -or $plan.profileId -cne $configuration.profileId -or $plan.repositoryId -cne $configuration.repositoryId -or $plan.applicationId -cne 'org.devsetu.connector' -or ([DateTimeOffset]$plan.expiresAt) -le $now -or (([DateTimeOffset]$plan.expiresAt)-([DateTimeOffset]$plan.issuedAt)).TotalMinutes -gt 10 -or $plan.sourceTreeSha256 -cnotmatch '^[a-f0-9]{64}$' -or $plan.prototypeApkSha256 -cnotmatch '^[a-f0-9]{64}$' -or $plan.ownerApprovalReference.Length -lt 10){throw 'Signing approval scope denied'}
$private=Join-Path $configuration.root 'private'
if((Get-Item -LiteralPath $private).Attributes -band [IO.FileAttributes]::ReparsePoint -or @(Get-ChildItem -LiteralPath $private -Force).Count -ne 0){throw 'Signing identity already exists or needs recovery; never replace it automatically'}
$sdk=Get-Content -LiteralPath (Join-Path $configuration.root 'sdk\sdk-state.json') -Raw|ConvertFrom-Json
$java=@($sdk.tools|Where-Object id -CEQ 'java')
$archive=@($configuration.archives|Where-Object id -CEQ 'jdk-21')
if($java.Count -ne 1 -or $archive.Count -ne 1){throw 'JDK signing tool scope unavailable'}
$keytool=Join-Path (Split-Path (Join-Path $configuration.root $java[0].path)) 'keytool.exe'
$archivePath=Join-Path $configuration.root ('incoming\toolchain-v1\'+$archive[0].filename)
if((Get-FileHash -LiteralPath $archivePath).Hash.ToLowerInvariant() -cne $archive[0].sha256){throw 'JDK archive integrity mismatch'}
$zip=[IO.Compression.ZipFile]::OpenRead($archivePath)
try{
 $entries=@($zip.Entries|Where-Object {$_.FullName -match '^[^/]+/bin/keytool\.exe$'})
 if($entries.Count -ne 1){throw 'JDK signing entry ambiguous'}
 $source=$entries[0].Open();$hasher=[Security.Cryptography.SHA256]::Create()
 try{$expected=[BitConverter]::ToString($hasher.ComputeHash($source)).Replace('-','').ToLowerInvariant()}finally{$hasher.Dispose();$source.Dispose()}
}finally{$zip.Dispose()}
if((Get-Item -LiteralPath $keytool).Attributes -band [IO.FileAttributes]::ReparsePoint -or (Get-FileHash -LiteralPath $keytool).Hash.ToLowerInvariant() -cne $expected){throw 'JDK signing executable changed'}
$consume=Join-Path $configuration.root ('incoming\'+$plan.id+'.consumed.json')
$stream=[IO.File]::Open($consume,[IO.FileMode]::CreateNew)
try{$record=[Text.UTF8Encoding]::new($false).GetBytes(($plan|ConvertTo-Json -Depth 7 -Compress));$stream.Write($record,0,$record.Length);$stream.Flush($true)}finally{$stream.Dispose()}
$random=New-Object byte[] 32;[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($random)
$password=[Convert]::ToBase64String($random).TrimEnd('=').Replace('+','-').Replace('/','_')
$plain=[Text.Encoding]::UTF8.GetBytes($password)
$store=Join-Path $private 'signing.p12';$passwordFile=Join-Path $private 'signing-password.dpapi';$certificate=Join-Path $private 'certificate.der'
function Invoke-SigningTool([string]$Arguments){
 $start=[Diagnostics.ProcessStartInfo]::new();$start.FileName=$keytool;$start.Arguments=$Arguments;$start.WorkingDirectory=$private;$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
 $start.EnvironmentVariables['DEVSETU_SIGNING_PASSWORD']=$password
 $process=[Diagnostics.Process]::new();$process.StartInfo=$start
 try{[void]$process.Start();$stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync();if(-not $process.WaitForExit(120000)){$process.Kill();throw 'Signing tool deadline'};[void]$stdout.Result;[void]$stderr.Result;if($process.ExitCode -ne 0){throw 'Signing tool failed; private recovery evidence retained'}}finally{$start.EnvironmentVariables.Remove('DEVSETU_SIGNING_PASSWORD');$process.Dispose()}
}
try{
 [IO.File]::WriteAllBytes($passwordFile,[Security.Cryptography.ProtectedData]::Protect($plain,$null,[Security.Cryptography.DataProtectionScope]::LocalMachine))
 Invoke-SigningTool ('-genkeypair -alias devsetu-android -keyalg RSA -keysize 3072 -sigalg SHA256withRSA -validity 10000 -dname "CN=DevSetu Android Connector" -storetype PKCS12 -keystore "'+$store+'" -storepass:env DEVSETU_SIGNING_PASSWORD -keypass:env DEVSETU_SIGNING_PASSWORD -noprompt')
 Invoke-SigningTool ('-exportcert -alias devsetu-android -keystore "'+$store+'" -storepass:env DEVSETU_SIGNING_PASSWORD -file "'+$certificate+'"')
 $certificateHash=(Get-FileHash -LiteralPath $certificate).Hash.ToLowerInvariant()
 $signing=@{keystore=$store;passwordReference=$passwordFile;alias='devsetu-android';certificateSha256=$certificateHash}
 $configuration|Add-Member -NotePropertyName signing -NotePropertyValue $signing
 [IO.File]::WriteAllText($ConfigReference,($configuration|ConvertTo-Json -Depth 8 -Compress),[Text.UTF8Encoding]::new($false))
 $result=@{version=1;status='PASS';id=$plan.id;applicationId=$plan.applicationId;workspaceId=$plan.workspaceId;profileId=$plan.profileId;repositoryId=$plan.repositoryId;certificateSha256=$certificateHash;privateIdentityCreated=$true;privateValuesDisclosed=$false;at=[DateTimeOffset]::UtcNow.ToString('o')}
 [IO.File]::WriteAllText((Join-Path $configuration.root ('results\'+$plan.id+'.json')),($result|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))
}finally{[Array]::Clear($random,0,$random.Length);[Array]::Clear($plain,0,$plain.Length);$password=$null}
