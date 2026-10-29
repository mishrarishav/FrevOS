param([Parameter(Mandatory=$true)][string]$PreviousPackageRoot,[switch]$BootstrapMaintenance,[string]$SourceRoot,[string]$ReleaseOutputRoot,[string]$AndroidArtifactReference,[string]$AndroidBuilderReference)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$root=if($SourceRoot){[IO.Path]::GetFullPath($SourceRoot)}else{[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))}
. (Join-Path $PreviousPackageRoot 'deployment\server20\Postgres.ps1')
. (Join-Path $PSScriptRoot 'HttpCommon.ps1')
$old=(Get-FileHash -LiteralPath (Join-Path $PreviousPackageRoot 'release-manifest.json') -Algorithm SHA256).Hash.ToLowerInvariant()
$previous=Test-HttpManifest $PreviousPackageRoot $old
$sourceHead=(& git -C $root rev-parse HEAD|Out-String).Trim()
if($LASTEXITCODE -ne 0 -or $sourceHead -cnotmatch '^[a-f0-9]{40}$'){throw 'Source identity unavailable'}
function Assert-PackagedRuntimeModules([string]$PackageRoot) {
 $boundary=[IO.Path]::GetFullPath($PackageRoot)+'\';$queue=[Collections.Generic.Queue[string]]::new();$seen=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
 $queue.Enqueue((Join-Path $PackageRoot 'apps\control-plane\dist\main.js'));$queue.Enqueue((Join-Path $PackageRoot 'apps\control-plane\node_modules\@frevos\contracts\dist\index.js'))
 while($queue.Count){
  $file=[IO.Path]::GetFullPath($queue.Dequeue());if(-not $file.StartsWith($boundary,[StringComparison]::OrdinalIgnoreCase) -or -not $file.EndsWith('.js',[StringComparison]::OrdinalIgnoreCase)){throw 'Packaged module escaped application'}
  if(-not $seen.Add($file)){continue};if($seen.Count -gt 256){throw 'Packaged module capacity'}
  Assert-NoReparsePath $file
  if(-not(Test-Path -LiteralPath $file -PathType Leaf) -or (Get-Item -LiteralPath $file).Length -gt 2000000){throw 'Packaged runtime module missing'}
  $code=[IO.File]::ReadAllText($file)
  foreach($match in [regex]::Matches($code,'\b(?:from\s*|import\s*)["''](?<module>\.[^"''\r\n]+)["'']')){$queue.Enqueue([IO.Path]::GetFullPath((Join-Path ([IO.Path]::GetDirectoryName($file)) $match.Groups['module'].Value)))}
 }
}
function Get-SourceGuard {
 $paths=@()
 foreach($relative in @('apps\control-center\src','apps\control-plane\src','packages\contracts\src','deployment\servix','deployment\server20')){$paths+=@(Get-ChildItem -LiteralPath (Join-Path $root $relative) -Recurse -File|Select-Object -ExpandProperty FullName)}
 foreach($relative in @('apps\android-connector','deployment\android')){if(Test-Path -LiteralPath (Join-Path $root $relative)){$paths+=@(Get-ChildItem -LiteralPath (Join-Path $root $relative) -Recurse -File|Select-Object -ExpandProperty FullName)}}
 foreach($relative in @('apps/control-center/index.html','apps/control-center/public/favicon.svg','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','apps\control-center\package.json','apps\control-plane\package.json','packages\contracts\package.json')){$paths+=Join-Path $root $relative}
 $paths+=@(Get-ChildItem -LiteralPath $root -Filter 'tsconfig*.json' -File|Select-Object -ExpandProperty FullName)
 $paths+=Join-Path $root 'packages\contracts\tsconfig.build.json'
 return @($paths|Sort-Object -Unique|ForEach-Object {@{path=$_.Substring($root.Length+1);sha256=(Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant()}})|ConvertTo-Json -Compress
}
$sourceState=if((& git -C $root status --porcelain=v1|Out-String).Trim()){'local-uncommitted'}else{'committed'}
$sourceGuard=Get-SourceGuard
$artifactRoot=if($ReleaseOutputRoot){[IO.Path]::GetFullPath($ReleaseOutputRoot)}else{Join-Path $root '.local'}
if($ReleaseOutputRoot){if($artifactRoot -ieq [IO.Path]::GetPathRoot($artifactRoot) -or -not(Test-Path -LiteralPath $artifactRoot -PathType Container)){throw 'Choose an existing specific release output directory'};Assert-NoReparsePath $artifactRoot}
Push-Location $root
try{
 & pnpm.cmd run build
 if($LASTEXITCODE -ne 0){throw 'Application build failed'}
 try{$env:VITE_FREVOS_AUTH_MODE='local';& pnpm.cmd --filter '@frevos/control-center' run build;if($LASTEXITCODE -ne 0){throw 'Local-auth UI build failed'}}finally{Remove-Item Env:VITE_FREVOS_AUTH_MODE -ErrorAction SilentlyContinue}
 $id=[guid]::NewGuid().ToString('N');$output=Join-Path $artifactRoot ('servix-release-'+$id);$package=Join-Path $output 'package'
 [void][IO.Directory]::CreateDirectory($output);Copy-Item -LiteralPath $PreviousPackageRoot -Destination $package -Recurse
 # The baseline remains sealed. This one pinned security update is imported
 # from the frozen application installation and included in the new manifest.
 $zodLink=Get-Item -LiteralPath (Join-Path $root 'apps\control-plane\node_modules\zod')
 $zodSource=if($zodLink.Target){[IO.Path]::GetFullPath([string]@($zodLink.Target)[0])}else{$zodLink.FullName}
 if(-not $zodSource.StartsWith((Join-Path $root 'node_modules')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Zod dependency escaped frozen installation'}
 Assert-NoReparsePath $zodSource
 if((Get-Content -LiteralPath (Join-Path $zodSource 'package.json') -Raw|ConvertFrom-Json).version -cne '4.6.6'){throw 'Pinned Zod security dependency mismatch'}
 $zodDestination=Join-Path $package 'apps\control-plane\node_modules\zod'
 if(-not [IO.Path]::GetFullPath($zodDestination).StartsWith([IO.Path]::GetFullPath($output)+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Dependency replacement escaped package'}
 Assert-NoReparsePath $zodDestination;Remove-Item -LiteralPath $zodDestination -Recurse -Force
 Copy-Item -LiteralPath $zodSource -Destination $zodDestination -Recurse
 foreach($relative in @('apps\control-plane\package.json','apps\control-plane\node_modules\@frevos\contracts\package.json')){
  $metadataPath=Join-Path $package $relative;Assert-NoReparsePath $metadataPath
  $metadata=Get-Content -LiteralPath $metadataPath -Raw|ConvertFrom-Json
  if($metadata.dependencies.zod -cnotin @('4.4.3','4.6.6')){throw 'Unexpected sealed Zod dependency metadata'}
  $metadata.dependencies.zod='4.6.6'
  [IO.File]::WriteAllText($metadataPath,($metadata|ConvertTo-Json -Depth 10),[Text.UTF8Encoding]::new($false))
 }
 foreach($name in @('main','config','server','repositories','local-accounts','self-updates','developer-connectors','servix-deployment','deployment-settings','component-deployments','component-git','atomic-record','local-development','agent-workspace','agent-notifications','model-secrets','model-gateway','project-folder-search','artifact-promotions')){foreach($suffix in @('js','js.map','d.ts','d.ts.map')){Copy-Item -LiteralPath (Join-Path $root ('apps\control-plane\dist\'+$name+'.'+$suffix)) -Destination (Join-Path $package ('apps\control-plane\dist\'+$name+'.'+$suffix))}}
 foreach($name in @('deployment-change','servix-deployment','developer-connectors','deployment-settings','local-accounts','component-deployments','local-development','index','artifact-promotions')){foreach($suffix in @('js','js.map','d.ts','d.ts.map')){Copy-Item -LiteralPath (Join-Path $root ('packages\contracts\dist\'+$name+'.'+$suffix)) -Destination (Join-Path $package ('apps\control-plane\node_modules\@frevos\contracts\dist\'+$name+'.'+$suffix))}}
 foreach($suffix in @('js','js.map','d.ts','d.ts.map')){
  foreach($name in @('device-logins','discovery-access','join-requests')){Copy-Item -LiteralPath (Join-Path $root ('apps\control-plane\dist\'+$name+'.'+$suffix)) -Destination (Join-Path $package ('apps\control-plane\dist\'+$name+'.'+$suffix))}
  foreach($name in @('device-login','join-requests')){Copy-Item -LiteralPath (Join-Path $root ('packages\contracts\dist\'+$name+'.'+$suffix)) -Destination (Join-Path $package ('apps\control-plane\node_modules\@frevos\contracts\dist\'+$name+'.'+$suffix))}
  Copy-Item -LiteralPath (Join-Path $root ('packages\contracts\dist\agent-workspace.'+$suffix)) -Destination (Join-Path $package ('apps\control-plane\node_modules\@frevos\contracts\dist\agent-workspace.'+$suffix))
  Copy-Item -LiteralPath (Join-Path $root ('apps\control-plane\dist\system-discovery.'+$suffix)) -Destination (Join-Path $package ('apps\control-plane\dist\system-discovery.'+$suffix))
  Copy-Item -LiteralPath (Join-Path $root ('packages\contracts\dist\system-discovery.'+$suffix)) -Destination (Join-Path $package ('apps\control-plane\node_modules\@frevos\contracts\dist\system-discovery.'+$suffix))
 }
 $ui=Join-Path $package 'apps\control-center\dist'
 if(-not [IO.Path]::GetFullPath($ui).StartsWith([IO.Path]::GetFullPath($output)+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'UI cleanup escaped package'}
 Assert-NoReparsePath $ui;Remove-Item -LiteralPath $ui -Recurse -Force;Copy-Item -LiteralPath (Join-Path $root 'apps\control-center\dist') -Destination $ui -Recurse
 $servixOperator=Join-Path $package 'deployment\servix'
 [void][IO.Directory]::CreateDirectory($servixOperator)
 foreach($file in Get-ChildItem -LiteralPath (Join-Path $root 'deployment\servix') -File){Copy-Item -LiteralPath $file.FullName -Destination $servixOperator}
 $connectorZip=Join-Path $servixOperator 'connector.zip'
 if(Test-Path -LiteralPath $connectorZip){Assert-NoReparsePath $connectorZip;Remove-Item -LiteralPath $connectorZip}
 $compiledPicker=Join-Path $servixOperator 'FrevOS.FolderPicker.exe'
 if(Test-Path -LiteralPath $compiledPicker){
  Assert-NoReparsePath $compiledPicker
  $ownedPicker=@($previous.files|Where-Object path -CEQ 'deployment/servix/FrevOS.FolderPicker.exe')
  if($ownedPicker.Count -ne 1 -or (Get-FileHash -LiteralPath $compiledPicker).Hash.ToLowerInvariant() -cne $ownedPicker[0].sha256){throw 'Copied native picker ownership changed'}
  Remove-Item -LiteralPath $compiledPicker
 }
 & (Join-Path $root 'deployment\servix\New-ConnectorDownload.ps1') -NodeArchive (Join-Path $PreviousPackageRoot 'prerequisites\node-v24.19.0-win-x64.zip') -OutputPath $connectorZip
 $linuxDownload=Join-Path $servixOperator 'devsetu-connector-linux-x64.tar.gz'
 if(Test-Path -LiteralPath $linuxDownload){Assert-NoReparsePath $linuxDownload;Remove-Item -LiteralPath $linuxDownload}
 & (Get-Command node.exe -ErrorAction Stop).Source (Join-Path $root 'deployment\servix\New-LinuxDownload.mjs') --output $linuxDownload
 if($LASTEXITCODE -ne 0){throw 'Linux connector download build failed'}
 if(Test-Path -LiteralPath (Join-Path $root 'apps\android-connector\AndroidManifest.xml')){
  if(-not $AndroidArtifactReference -or -not $AndroidBuilderReference){throw 'The reviewed Server20 Android SDK artifact and enrolled builder references are required'}
  Assert-NoReparsePath $AndroidArtifactReference
  $android=Get-Content -LiteralPath $AndroidArtifactReference -Raw|ConvertFrom-Json
  if($android.version -ne 1 -or $android.status -cne 'SIGNED' -or $android.sourceState -cne 'committed' -or $sourceState -cne 'committed' -or $android.sourceHead -cne $sourceHead -or $android.apkSha256 -cnotmatch '^[a-f0-9]{64}$' -or $android.certificateSha256 -cnotmatch '^[a-f0-9]{64}$' -or $android.apkBytes -lt 1 -or $android.apkBytes -gt 10000000 -or $android.sdkJobId -cnotmatch '^ab_[a-f0-9]{32}$' -or $android.correlationId -cnotmatch '^cj_[a-f0-9]{32}$'){throw 'Android artifact is unsigned, uncommitted or outside the reviewed source/job'}
  Assert-NoReparsePath $AndroidBuilderReference
  $enrolled=Get-Content -LiteralPath $AndroidBuilderReference -Raw|ConvertFrom-Json
  if($enrolled.version -ne 1 -or -not [IO.Path]::IsPathRooted($enrolled.root) -or $enrolled.configurationSha256 -cnotmatch '^[a-f0-9]{64}$' -or $enrolled.certificateSha256 -cnotmatch '^[a-f0-9]{64}$' -or $enrolled.configurationSha256 -cne $android.configurationSha256 -or $enrolled.certificateSha256 -cne $android.certificateSha256){throw 'Android build did not use the enrolled SDK configuration and signing certificate'}
  $sdkReceipt=Join-Path $enrolled.root ('results\'+$android.sdkJobId+'.json');Assert-NoReparsePath $sdkReceipt
  $authoritative=Get-Content -LiteralPath $sdkReceipt -Raw|ConvertFrom-Json
  foreach($field in @('version','status','sourceState','sourceHead','sourceTreeSha256','apkSha256','apkBytes','certificateSha256','configurationSha256','sdkJobId','correlationId','workspaceId','profileId','repositoryId')){if($authoritative.$field -cne $android.$field){throw 'Android SDK receipt differs from the local artifact reference'}}
  Assert-NoReparsePath $android.apkPath
  if((Get-Item -LiteralPath $android.apkPath).Length -ne $android.apkBytes -or (Get-FileHash -LiteralPath $android.apkPath).Hash.ToLowerInvariant() -cne $android.apkSha256){throw 'Android APK integrity mismatch'}
  # Recompute the same ordered seven-file source digest as the enrolled SDK client.
  $sourceFiles=@(@{path='AndroidManifest.xml';sha256=(Get-FileHash -LiteralPath (Join-Path $root 'apps\android-connector\AndroidManifest.xml')).Hash.ToLowerInvariant()})
  foreach($name in @('ConnectorApi','LoginProofServer','MainActivity','MonitorService','PrivateState','ServerOrigin')){$relative='src/org/devsetu/connector/'+$name+'.java';$sourceFiles+=@{path=$relative;sha256=(Get-FileHash -LiteralPath (Join-Path $root ('apps/android-connector/'+$relative))).Hash.ToLowerInvariant()}}
  $ordered=@($sourceFiles|ForEach-Object {[ordered]@{path=$_.path;sha256=$_.sha256}})
  $treeBytes=[Text.UTF8Encoding]::new($false).GetBytes((ConvertTo-Json -InputObject $ordered -Compress))
  $treeHash=[BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($treeBytes)).Replace('-','').ToLowerInvariant()
  if($treeHash -cne $android.sourceTreeSha256){throw 'Android compiler source inventory differs from platform source'}
  Copy-Item -LiteralPath $android.apkPath -Destination (Join-Path $servixOperator 'devsetu-connector-android.apk') -Force
  $publicAndroid=@{version=1;sourceHead=$sourceHead;sourceTreeSha256=$treeHash;apkSha256=$android.apkSha256;apkBytes=$android.apkBytes;certificateSha256=$android.certificateSha256;sdkJobId=$android.sdkJobId;correlationId=$android.correlationId;configurationSha256=$android.configurationSha256}
  [IO.File]::WriteAllText((Join-Path $servixOperator 'android-artifact.json'),($publicAndroid|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))
 }
 foreach($name in @('HttpCommon.ps1','Start-Server20.ps1','Apply-ServixDashboard.ps1','Verify-HttpManifest.mjs','Install-SelfUpdate.ps1','Run-SelfUpdate.ps1')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $package 'deployment\server20')}
 if($BootstrapMaintenance){
  if($AndroidArtifactReference){throw 'Android enrollment cannot be enabled through the historical maintenance bootstrap'}
  # Bootstrap adds only the authenticated platform updater. Keep the preceding
  # UI and account configuration until the subsequent dashboard-driven release.
  $uiAbsolute=[IO.Path]::GetFullPath($ui);$outputAbsolute=[IO.Path]::GetFullPath($output)+'\'
  if(-not $uiAbsolute.StartsWith($outputAbsolute,[StringComparison]::OrdinalIgnoreCase)){throw 'Bootstrap UI path escaped package'}
  Assert-NoReparsePath $ui;Remove-Item -LiteralPath $ui -Recurse -Force;Copy-Item -LiteralPath (Join-Path $PreviousPackageRoot 'apps\control-center\dist') -Destination $ui -Recurse
  foreach($suffix in @('js','js.map','d.ts','d.ts.map')){Copy-Item -LiteralPath (Join-Path $PreviousPackageRoot ('apps\control-plane\dist\main.'+$suffix)) -Destination (Join-Path $package ('apps\control-plane\dist\main.'+$suffix)) -Force}
  $mainFile=Join-Path $package 'apps\control-plane\dist\main.js'
  $main=[IO.File]::ReadAllText($mainFile)
  if(-not $main.Contains('publicOrigin: config.publicOrigin,')){throw 'Bootstrap composition anchor changed'}
  $main='import { SelfUpdates } from "./self-updates.js";'+[Environment]::NewLine+$main.Replace('publicOrigin: config.publicOrigin,','publicOrigin: config.publicOrigin, ...(config.servixRoot ? {selfUpdates:new SelfUpdates(join(config.servixRoot,"..","maintenance"))}:{}),')
  $main=$main -replace '(?m)^//# sourceMappingURL=.*$',''
  [IO.File]::WriteAllText($mainFile,$main,[Text.UTF8Encoding]::new($false))
 }
 if((Get-SourceGuard) -cne $sourceGuard){throw 'Source changed during the release build; no artifact will be published'}
 Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Verify-AndroidCompatibility.ps1') -Destination (Join-Path $package 'deployment\server20\Verify-AndroidCompatibility.ps1')
 Assert-PackagedRuntimeModules $package
 $inputs=@('apps/control-center/src/EnvironmentVariables.tsx','apps/control-center/src/environment-seal.ts','packages/contracts/src/local-development.ts','apps/control-plane/src/local-development.ts','apps/control-center/src/LocalDevelopmentPage.tsx')+@('apps/control-plane/src/atomic-record.ts','packages/contracts/src/component-deployments.ts','apps/control-plane/src/component-deployments.ts','apps/control-plane/src/component-git.ts','apps/control-center/src/ComponentDeployments.tsx','packages/contracts/src/deployment-change.ts','apps/control-center/src/DeploymentActionDialog.tsx','apps/control-center/src/PlatformProjectDetails.tsx','apps/control-plane/src/local-accounts.ts','apps/control-plane/src/self-updates.ts','apps/control-center/src/AccountControls.tsx','apps/control-center/src/main.tsx','packages/contracts/src/local-accounts.ts','deployment/server20/Install-SelfUpdate.ps1','deployment/server20/Run-SelfUpdate.ps1','apps/control-center/index.html','apps/control-center/public/favicon.svg','apps/control-center/package.json','pnpm-lock.yaml','pnpm-workspace.yaml','apps/control-plane/src/config.ts','apps/control-plane/src/main.ts','apps/control-plane/src/server.ts','apps/control-plane/src/repositories.ts','apps/control-plane/src/developer-connectors.ts','apps/control-plane/src/servix-deployment.ts','apps/control-center/src/api.ts','apps/control-center/src/App.tsx','apps/control-center/src/DeploymentsPage.tsx','apps/control-center/src/RecordWorkspace.tsx','apps/control-center/src/WorkspaceDialog.tsx','apps/control-center/src/DeveloperAccess.tsx','apps/control-center/src/deployment-request-id.ts','apps/control-center/src/servix-deployment-state.ts','apps/control-center/src/styles.css','apps/control-center/src/DeploymentSettingsPage.tsx','apps/control-center/src/routing.ts','apps/control-plane/src/deployment-settings.ts','packages/contracts/src/deployment-settings.ts','packages/contracts/src/servix-deployment.ts','packages/contracts/src/developer-connectors.ts','packages/contracts/src/index.ts')+@(Get-ChildItem (Join-Path $root 'deployment\servix') -File|ForEach-Object {'deployment/servix/'+$_.Name})+@('deployment/server20/HttpCommon.ps1','deployment/server20/Start-Server20.ps1','deployment/server20/Apply-ServixDashboard.ps1','deployment/server20/Verify-HttpManifest.mjs','deployment/server20/New-ServixDashboardRelease.ps1')
 $inputs+=@('packages/contracts/src/system-discovery.ts','apps/control-plane/src/system-discovery.ts','apps/control-center/src/DiscoveryPage.tsx','apps/control-plane/package.json','packages/contracts/package.json','packages/contracts/tsconfig.build.json')
 $inputs+=@('apps/control-center/src/FolderBrowser.tsx','apps/control-center/src/discovery-systems.ts')
 $inputs+=@('apps/control-plane/src/agent-workspace.ts','apps/control-plane/src/model-secrets.ts','apps/control-plane/src/model-gateway.ts','packages/contracts/src/agent-workspace.ts','apps/control-center/src/HealthGraphs.tsx')
 $inputs+=@('apps/control-plane/src/agent-notifications.ts','apps/control-center/src/AgentsPage.tsx','apps/control-center/src/AgentNetwork.tsx','apps/control-center/src/model-seal.ts','apps/control-center/src/AgentNotificationsPanel.tsx','apps/control-plane/src/project-folder-search.ts')
 $inputs+=@('apps/control-plane/src/artifact-promotions.ts','packages/contracts/src/artifact-promotions.ts','apps/control-center/src/ArtifactPromotionsPage.tsx')
 $inputs+=@('apps/control-plane/src/device-logins.ts','apps/control-plane/src/discovery-access.ts','apps/control-plane/src/join-requests.ts','packages/contracts/src/device-login.ts','packages/contracts/src/join-requests.ts','apps/control-center/src/JoinRequestForm.tsx','apps/control-center/src/JoinRequestsInbox.tsx','apps/control-center/src/SystemPairingDialog.tsx')
 $inputs+=@('apps/control-center/src/connector-platform.ts')
 $inputs+=@('deployment/server20/Verify-AndroidCompatibility.ps1')
 foreach($relative in @('apps/android-connector','deployment/android')){if(Test-Path -LiteralPath (Join-Path $root $relative)){$inputs+=@(Get-ChildItem -LiteralPath (Join-Path $root $relative) -Recurse -File|ForEach-Object {$_.FullName.Substring($root.Length+1).Replace('\','/')})}}
 $inventory=@($inputs|ForEach-Object {@{path=$_;sha256=(Get-FileHash -LiteralPath (Join-Path $root $_) -Algorithm SHA256).Hash.ToLowerInvariant()}})
 [IO.File]::WriteAllText((Join-Path $package 'deployment\server20\source-inventory.json'),(@{sourceBase=$sourceHead;state=$sourceState;bootstrapMaintenance=[bool]$BootstrapMaintenance;bootstrapParentManifest=$old;files=$inventory}|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
 $files=@(Get-ChildItem -LiteralPath $package -Recurse -File|Where-Object FullName -NE (Join-Path $package 'release-manifest.json')|Sort-Object FullName|ForEach-Object {@{path=$_.FullName.Substring($package.Length+1).Replace('\','/');bytes=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}})
 $manifest=@{schemaVersion=4;applicationSource=$sourceHead;operatorSource='owner-selected-servix-git-v1';previousManifestSha256=$old;dependencyArtifactSha256='de56c5684970bbe7a053318f532b81d1df562a55d5258e033e636cd11c06eef9';buildId=$id;createdUtc=[DateTimeOffset]::UtcNow.ToString('o');targetHost='DCAPP7';targetAddress='10.9.69.20';publicOrigin='http://10.9.69.20';basePath='';authMode='local';nodeVersion='24.19.0';postgresqlVersion='18.4';files=$files}
 [IO.File]::WriteAllText((Join-Path $package 'release-manifest.json'),($manifest|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
 $digest=(Get-FileHash -LiteralPath (Join-Path $package 'release-manifest.json') -Algorithm SHA256).Hash.ToLowerInvariant()
 $verified=Test-HttpManifest $package $digest;Assert-ServixDelta $previous $verified
 Add-Type -AssemblyName System.IO.Compression
 Add-Type -AssemblyName System.IO.Compression.FileSystem
 $archive=Join-Path $output 'package.zip'
 $stream=[IO.File]::Open($archive,[IO.FileMode]::CreateNew);$zip=[IO.Compression.ZipArchive]::new($stream,[IO.Compression.ZipArchiveMode]::Create,$false)
 try{foreach($file in Get-ChildItem -LiteralPath $package -Recurse -File){[void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,$file.FullName,$file.FullName.Substring($package.Length+1).Replace('\','/'),[IO.Compression.CompressionLevel]::Fastest)}}finally{$zip.Dispose();$stream.Dispose()}
 $receipt=@{package=$package;archive=$archive;manifestSha256=$digest;archiveSha256=(Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant();files=$files.Count}
 [void][IO.Directory]::CreateDirectory((Join-Path $root '.local'));[IO.File]::WriteAllText((Join-Path $root '.local\servix-release.json'),($receipt|ConvertTo-Json),[Text.UTF8Encoding]::new($false));$receipt|ConvertTo-Json
}finally{Pop-Location}
