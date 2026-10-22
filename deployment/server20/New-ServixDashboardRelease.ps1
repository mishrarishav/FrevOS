param([Parameter(Mandatory=$true)][string]$PreviousPackageRoot,[switch]$BootstrapMaintenance,[string]$SourceRoot)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$root=if($SourceRoot){[IO.Path]::GetFullPath($SourceRoot)}else{[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))}
. (Join-Path $PreviousPackageRoot 'deployment\server20\Postgres.ps1')
. (Join-Path $PSScriptRoot 'HttpCommon.ps1')
$old=(Get-FileHash -LiteralPath (Join-Path $PreviousPackageRoot 'release-manifest.json') -Algorithm SHA256).Hash.ToLowerInvariant()
$previous=Test-HttpManifest $PreviousPackageRoot $old
$sourceHead=(& git -C $root rev-parse HEAD|Out-String).Trim()
if($LASTEXITCODE -ne 0 -or $sourceHead -cnotmatch '^[a-f0-9]{40}$'){throw 'Source identity unavailable'}
function Get-SourceGuard {
 $paths=@()
 foreach($relative in @('apps\control-center\src','apps\control-plane\src','packages\contracts\src','deployment\servix','deployment\server20')){$paths+=@(Get-ChildItem -LiteralPath (Join-Path $root $relative) -Recurse -File|Select-Object -ExpandProperty FullName)}
 foreach($relative in @('apps/control-center/index.html','apps/control-center/public/favicon.svg','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','apps\control-center\package.json','apps\control-plane\package.json','packages\contracts\package.json')){$paths+=Join-Path $root $relative}
 $paths+=@(Get-ChildItem -LiteralPath $root -Filter 'tsconfig*.json' -File|Select-Object -ExpandProperty FullName)
 return @($paths|Sort-Object -Unique|ForEach-Object {@{path=$_.Substring($root.Length+1);sha256=(Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant()}})|ConvertTo-Json -Compress
}
$sourceState=if((& git -C $root status --porcelain=v1|Out-String).Trim()){'local-uncommitted'}else{'committed'}
$sourceGuard=Get-SourceGuard
Push-Location $root
try{
 & pnpm.cmd run build
 if($LASTEXITCODE -ne 0){throw 'Application build failed'}
 try{$env:VITE_FREVOS_AUTH_MODE='local';& pnpm.cmd --filter '@frevos/control-center' run build;if($LASTEXITCODE -ne 0){throw 'Local-auth UI build failed'}}finally{Remove-Item Env:VITE_FREVOS_AUTH_MODE -ErrorAction SilentlyContinue}
 $id=[guid]::NewGuid().ToString('N');$output=Join-Path $root ('.local\servix-release-'+$id);$package=Join-Path $output 'package'
 [void][IO.Directory]::CreateDirectory($output);Copy-Item -LiteralPath $PreviousPackageRoot -Destination $package -Recurse
 foreach($name in @('main','config','server','repositories','local-accounts','self-updates','developer-connectors','servix-deployment','deployment-settings','component-deployments','component-git','atomic-record')){foreach($suffix in @('js','js.map','d.ts','d.ts.map')){Copy-Item -LiteralPath (Join-Path $root ('apps\control-plane\dist\'+$name+'.'+$suffix)) -Destination (Join-Path $package ('apps\control-plane\dist\'+$name+'.'+$suffix))}}
 foreach($name in @('deployment-change','servix-deployment','developer-connectors','deployment-settings','local-accounts','component-deployments','index')){foreach($suffix in @('js','js.map','d.ts','d.ts.map')){Copy-Item -LiteralPath (Join-Path $root ('packages\contracts\dist\'+$name+'.'+$suffix)) -Destination (Join-Path $package ('apps\control-plane\node_modules\@frevos\contracts\dist\'+$name+'.'+$suffix))}}
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
 foreach($name in @('HttpCommon.ps1','Start-Server20.ps1','Apply-ServixDashboard.ps1','Verify-HttpManifest.mjs','Install-SelfUpdate.ps1','Run-SelfUpdate.ps1')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $package 'deployment\server20')}
 if($BootstrapMaintenance){
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
 $inputs=@('apps/control-plane/src/atomic-record.ts','packages/contracts/src/component-deployments.ts','apps/control-plane/src/component-deployments.ts','apps/control-plane/src/component-git.ts','apps/control-center/src/ComponentDeployments.tsx','packages/contracts/src/deployment-change.ts','apps/control-center/src/DeploymentActionDialog.tsx','apps/control-center/src/PlatformProjectDetails.tsx','apps/control-plane/src/local-accounts.ts','apps/control-plane/src/self-updates.ts','apps/control-center/src/AccountControls.tsx','apps/control-center/src/main.tsx','packages/contracts/src/local-accounts.ts','deployment/server20/Install-SelfUpdate.ps1','deployment/server20/Run-SelfUpdate.ps1','apps/control-center/index.html','apps/control-center/public/favicon.svg','apps/control-center/package.json','pnpm-lock.yaml','pnpm-workspace.yaml','apps/control-plane/src/config.ts','apps/control-plane/src/main.ts','apps/control-plane/src/server.ts','apps/control-plane/src/repositories.ts','apps/control-plane/src/developer-connectors.ts','apps/control-plane/src/servix-deployment.ts','apps/control-center/src/api.ts','apps/control-center/src/App.tsx','apps/control-center/src/DeploymentsPage.tsx','apps/control-center/src/RecordWorkspace.tsx','apps/control-center/src/WorkspaceDialog.tsx','apps/control-center/src/DeveloperAccess.tsx','apps/control-center/src/deployment-request-id.ts','apps/control-center/src/servix-deployment-state.ts','apps/control-center/src/styles.css','apps/control-center/src/DeploymentSettingsPage.tsx','apps/control-center/src/routing.ts','apps/control-plane/src/deployment-settings.ts','packages/contracts/src/deployment-settings.ts','packages/contracts/src/servix-deployment.ts','packages/contracts/src/developer-connectors.ts','packages/contracts/src/index.ts')+@(Get-ChildItem (Join-Path $root 'deployment\servix') -File|ForEach-Object {'deployment/servix/'+$_.Name})+@('deployment/server20/HttpCommon.ps1','deployment/server20/Start-Server20.ps1','deployment/server20/Apply-ServixDashboard.ps1','deployment/server20/Verify-HttpManifest.mjs','deployment/server20/New-ServixDashboardRelease.ps1')
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
 [IO.File]::WriteAllText((Join-Path $root '.local\servix-release.json'),($receipt|ConvertTo-Json),[Text.UTF8Encoding]::new($false));$receipt|ConvertTo-Json
}finally{Pop-Location}
