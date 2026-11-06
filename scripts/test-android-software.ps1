param(
 [string]$SdkCache=(Join-Path $PSScriptRoot '..\.local\android-compile-cache'),
 [string]$CompilerImage='eclipse-temurin@sha256:82801f9dcdcbad5a05082aba8c86d1da5b72ccb498e71318b1f91b5a477887b3',
 [string]$AndroidSha256='d9eb9da824d9e247a352f570f01e1169e725b2954bca9e283a71786c59b59f9a',
 [string]$LambdaSha256='2feb8df434cae3218ed9ffe9bae01ddec101d1dc5e12824c4209f61e283e0d3d',
 [string]$JsonSha256='3ea61b2a06e31edf1c91134fe9106b0ebb16628be169f3db75bc7a2b06b45796'
)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$cache=[IO.Path]::GetFullPath($SdkCache)
foreach($entry in @(@{name='android';sha=$AndroidSha256},@{name='lambda';sha=$LambdaSha256},@{name='json';sha=$JsonSha256})){
 $file=Join-Path $cache ($entry.name+'.jar')
 if($entry.sha -cnotmatch '^[a-f0-9]{64}$' -or (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -cne $entry.sha){throw 'Public compile dependency hash differs'}
}
$local=[IO.Path]::GetFullPath((Join-Path $taskRoot '.local'))
$output=Join-Path $local ('android-validation-'+[guid]::NewGuid().ToString('N'))
if(-not $output.StartsWith($local+[IO.Path]::DirectorySeparatorChar) -or (Get-Item -LiteralPath $local -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Local validation output escaped scope'}
[void][IO.Directory]::CreateDirectory($output)
& node (Join-Path $PSScriptRoot 'create-android-policy-fixtures.mjs') (Join-Path $output 'fixtures.json')
if($LASTEXITCODE -ne 0){throw 'Shared contracts must be built before creating Android policy fixtures'}
$mounts=@('--mount',('type=bind,source='+$taskRoot+'\apps\android-connector,target=/src,readonly'),'--mount',('type=bind,source='+$cache+',target=/sdk,readonly'),'--mount',('type=bind,source='+$output+',target=/out'))
function Compile-Android([string[]]$compilerArguments){
 $dockerArguments=@('run','--rm','--memory=384m','--cpus=1','--pids-limit=128','--network=none','--read-only','--cap-drop=ALL','--security-opt','no-new-privileges','--tmpfs','/tmp:rw,noexec,nosuid,size=64m')+$mounts+@($CompilerImage)+$compilerArguments
 & docker @dockerArguments
 if($LASTEXITCODE -ne 0){throw 'Android local compiler/policy validation failed'}
}
$sources=Get-ChildItem -LiteralPath (Join-Path $taskRoot 'apps\android-connector\src\org\devsetu\connector') -File -Filter '*.java'|Sort-Object Name|ForEach-Object {'/src/src/org/devsetu/connector/'+$_.Name}
Compile-Android (@('javac','-J-Xmx256m','-proc:none','-XDrawDiagnostics','-source','8','-target','8','-bootclasspath','/sdk/android.jar','-classpath','/sdk/lambda.jar','-sourcepath','','-encoding','UTF-8','-d','/out/classes')+$sources)
Compile-Android @('javac','-J-Xmx128m','-proc:none','--release','8','-classpath','/sdk/json.jar:/out/classes','-d','/out/tests','/src/test/org/devsetu/connector/SoftwarePolicyTest.java')
Compile-Android @('java','-Xmx96m','-classpath','/sdk/json.jar:/out/classes:/out/tests','org.devsetu.connector.SoftwarePolicyTest','/out/fixtures.json')
$digests=@(Get-ChildItem -LiteralPath (Join-Path $taskRoot 'apps\android-connector\src\org\devsetu\connector') -File -Filter '*.java'|Sort-Object Name|ForEach-Object {@{name=$_.Name;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}})
$proof=@{status='PASS';sourceFiles=@($sources).Count;sourceDigests=$digests;compilerImage=$CompilerImage;androidJarSha256=$AndroidSha256;lambdaJarSha256=$LambdaSha256;testOnlyJsonJarSha256=$JsonSha256;policyCases=@((Get-Content -LiteralPath (Join-Path $output 'fixtures.json') -Raw|ConvertFrom-Json).cases).Count;nativeAndroidRuntimeTested=$false;signedApkBuilt=$false;remoteMutation=$false;at=[DateTimeOffset]::UtcNow.ToString('o')}
$proof|ConvertTo-Json -Depth 3|Set-Content -LiteralPath (Join-Path $output 'result.json') -Encoding utf8
$proof|ConvertTo-Json -Compress
Write-Output ('Evidence: '+(Join-Path $output 'result.json'))
