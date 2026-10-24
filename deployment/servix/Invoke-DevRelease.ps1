function Invoke-DevelopmentRelease {
    $root='D:\servixDev'
    $job=$PSScriptRoot
    $settings21=Read-SelectedEnv 'D:\servixDev\backend\.env'
    if($env:COMPUTERNAME -cne 'DCAPP9' -or $settings21.DB_NAME -cne 'servix_db_dev' -or $settings21.DB_HOST -cne '10.9.69.31') {throw 'Development target identity changed'}
    Import-Module (Join-Path $job 'DeploymentFiles.psm1') -Force
    Import-Module (Join-Path $job 'BackendArtifactSelection.psm1') -Force
    $operation=Get-Content -LiteralPath (Join-Path $job 'operation.json') -Raw | ConvertFrom-Json
    foreach($property in @('manifestSha256','archiveSha256','launcherSha256')) {if($operation.$property -notmatch '^[a-f0-9]{64}$') {throw 'Invalid operation identity'}}
    $manifestPath=Join-Path $job 'manifest.json'
    $archivePath=Join-Path $job 'release.zip'
    if((Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $operation.manifestSha256 -or (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $operation.archiveSha256) {throw 'Staged release digest mismatch'}
    $manifest=Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    $preservedPaths=@()
    if($operation.PSObject.Properties['preservedPaths']){$preservedPaths+=@($operation.preservedPaths)}
    if($manifest.PSObject.Properties['preservedPaths']){$preservedPaths+=@($manifest.preservedPaths)}
    Assert-PreservedPaths $preservedPaths
    if($manifest.schemaVersion -ne 1 -or $manifest.target -cne '10.9.69.21' -or $manifest.computer -cne 'DCAPP9' -or $manifest.root -cne $root -or $manifest.database -cne 'servix_db_dev' -or $manifest.mode -cnotin @('source-only-existing-dependencies','bundled-existing-dependencies')) {throw 'Wrong release target or deployment mode'}
    $builtBackend=$manifest.mode -ceq 'bundled-existing-dependencies'
    if($builtBackend -ne [bool]$manifest.PSObject.Properties['backendArtifact']){throw 'Backend artifact mode differs'}
    $payload=Join-Path $job 'payload'
    [void][IO.Directory]::CreateDirectory($payload)
    $expected=@{}
    $totalBytes=[long]0
    foreach($file in $manifest.files) {
        [void](Resolve-CodeFile $root $file.path)
        if($expected.ContainsKey($file.path.ToLowerInvariant()) -or $file.sha256 -notmatch '^[a-f0-9]{64}$' -or $file.bytes -lt 0) {throw 'Invalid release file'}
        $expected[$file.path.ToLowerInvariant()]=$file
        $totalBytes+=[long]$file.bytes
    }
    if($expected.Count -gt 10000 -or $totalBytes -gt 512MB -or $expected.Count -eq 0) {throw 'Release exceeds the development operator resource budget'}
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive=[IO.Compression.ZipFile]::OpenRead($archivePath)
    try {
        $seen=@{}
        foreach($entry in $archive.Entries) {
            $name=$entry.FullName.Replace('\','/')
            if($name.EndsWith('/')) {continue}
            if(-not $expected.ContainsKey($name.ToLowerInvariant()) -or $seen.ContainsKey($name.ToLowerInvariant()) -or $entry.Length -ne $expected[$name.ToLowerInvariant()].bytes) {throw 'Archive does not exactly match its release manifest'}
            $seen[$name.ToLowerInvariant()]=$true
            $destination=Resolve-CodeFile $payload $name
            [void][IO.Directory]::CreateDirectory((Split-Path -Parent $destination))
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$destination,$false)
            if((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant() -cne $expected[$name.ToLowerInvariant()].sha256) {throw 'Expanded code digest mismatch'}
        }
        if($seen.Count -ne $expected.Count) {throw 'Release archive is incomplete'}
    } finally {$archive.Dispose()}
    $selectionBefore=Get-BackendSelectionSnapshot $root
    $nextSelection=[pscustomobject]@{version=1;mode='source'}
    $backendVerified=$null
    if($builtBackend){
      $nextSelection=$manifest.backendArtifact
      Assert-BackendSelection $nextSelection
      $verifiedText=& (Get-Command node.exe -ErrorAction Stop).Source (Join-Path $job 'BackendArtifact.cjs') inspect $payload $root $nextSelection.descriptor $nextSelection.manifestSha256
      if($LASTEXITCODE -ne 0){throw 'Backend artifact or installed dependencies did not verify'}
      $backendVerified=$verifiedText|ConvertFrom-Json
    }
    # Resolve installed dependencies without importing application code or opening a DB.
    $dependencyCheck=@'
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const semver=require('C:/Program Files/nodejs/node_modules/npm/node_modules/semver');
const manifest=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
for(const project of ['backend','querysafe']) {
 const resolve=createRequire('D:/servixDev/'+project+'/package.json');
 for(const name of manifest.modules[project]) resolve.resolve(name);
 for(const [name,range] of Object.entries(manifest.dependencies[project])) {
  let dir=path.dirname(resolve.resolve(name)),found=false;
  while(dir!==path.dirname(dir)) {
   const filename=path.join(dir,'package.json');
   if(fs.existsSync(filename)) {
    const pkg=JSON.parse(fs.readFileSync(filename,'utf8'));
    if(pkg.name===name) {if(!semver.satisfies(pkg.version,range)) throw Error('Installed dependency version outside declared range');found=true;break;}
   }
   dir=path.dirname(dir);
  }
  if(!found) throw Error('Installed dependency identity unresolved');
 }
}
'@
    $dependencyFile=Join-Path $job 'check-dependencies.cjs'
    [IO.File]::WriteAllText($dependencyFile,$dependencyCheck,[Text.UTF8Encoding]::new($false))
    $dependencyLog=Join-Path $job 'dependency-check.log'
    $check21=Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' -ArgumentList ('"'+$dependencyFile+'" "'+$manifestPath+'"') -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput $dependencyLog -RedirectStandardError (Join-Path $job 'dependency-error.log')
    if($check21.ExitCode -ne 0) {throw 'Required module missing or outside its declared version range; dependency changes need a separate release'}
    $taskName='ServixDev-FrevOS-Backend'
    $task21=Get-ScheduledTask -TaskName $taskName
    $arguments=[string]$task21.Actions[0].Arguments
    if($task21.Actions.Count -ne 1 -or $task21.Actions[0].Execute -cne 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -or $arguments -cnotmatch '^-NoProfile -NonInteractive -WindowStyle Hidden -File "(D:\\servixDev\\\.runtime\\frevos-server21\\[a-f0-9]{32}\\Run-DevBackend\.ps1)"$') {throw 'Development task identity mismatch'}
    $launcher=$Matches[1]
    if((Get-FileHash -LiteralPath $launcher -Algorithm SHA256).Hash.ToLowerInvariant() -cne $operation.launcherSha256) {throw 'Development task launcher changed'}
    $listener=Get-NetTCPConnection -State Listen -LocalPort 5001 | Select-Object -First 1
    $process21=Get-CimInstance Win32_Process -Filter ('ProcessId='+$listener.OwningProcess)
    if(-not ([string]$process21.CommandLine).Contains('--servix-backend-root=D:\servixDev\backend') -or -not ([string]$process21.CommandLine).Contains('--servix-dev-profile=server21')) {throw 'Development listener is not owned; nothing stopped'}
    $previousFiles=@()
    if($operation.PSObject.Properties['previousManifestSha256']){
        if($operation.previousManifestSha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'Invalid previous artifact digest'}
        $previousPath=Join-Path $job 'previous-manifest.json'
        if((Get-FileHash -LiteralPath $previousPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $operation.previousManifestSha256){throw 'Previous artifact changed'}
        $previousManifest=Get-Content -LiteralPath $previousPath -Raw|ConvertFrom-Json
        if($previousManifest.PSObject.Properties['preservedPaths']){$preservedPaths+=@($previousManifest.preservedPaths)}
        Assert-PreservedPaths $preservedPaths
        if($previousManifest.target -cne '10.9.69.21' -or $previousManifest.computer -cne 'DCAPP9' -or $previousManifest.root -cne $root -or $previousManifest.schemaVersion -ne 1 -or $previousManifest.files.Count -gt 10000){throw 'Previous artifact target mismatch'}
        $previousFiles=@($previousManifest.files | Where-Object {-not(Test-PreservedCodePath $_.path $preservedPaths)})
        foreach($file in $previousFiles){$currentFile=Resolve-CodeFile $root $file.path;if($file.sha256 -cnotmatch '^[a-f0-9]{64}$' -or -not(Test-Path -LiteralPath $currentFile -PathType Leaf) -or (Get-FileHash -LiteralPath $currentFile -Algorithm SHA256).Hash.ToLowerInvariant() -cne $file.sha256){throw 'Installed release changed; no task was stopped'}}
    }
    $script:additionalPreservedPaths=@($preservedPaths | Select-Object -Unique)
    $persistent=@(Get-PersistentFiles)
    $persistent | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $job 'persistent-before.json') -Encoding UTF8
    $iisHash=(Get-FileHash -LiteralPath 'C:\Windows\System32\inetsrv\config\applicationHost.config' -Algorithm SHA256).Hash
    $prod=Get-NetTCPConnection -State Listen -LocalPort 5000 | Select-Object -First 1
    $prodProcess=Get-CimInstance Win32_Process -Filter ('ProcessId='+$prod.OwningProcess)
    $prodCreated=$prodProcess.CreationDate
    $backup=Join-Path $job 'code-backup'
    $stopped=$false
    $selectionReceipt=$null
    $keepFiles=$builtBackend -or $selectionBefore.exists
    try {
        Stop-ScheduledTask -TaskName $taskName
        $stopped=$true
        $stopDeadline=[DateTime]::UtcNow.AddSeconds(30)
        while(Get-NetTCPConnection -State Listen -LocalPort 5001 -ErrorAction SilentlyContinue) {
            if([DateTime]::UtcNow -gt $stopDeadline) {throw 'Owned task did not release dev port; no PID was killed'}
            Start-Sleep -Milliseconds 500
        }
        Install-CodeFiles $root $payload $manifest.files $backup $previousFiles $preservedPaths -OnlyChanges:$keepFiles -KeepExistingFiles:$keepFiles
        $selectionReceipt=Set-BackendArtifactSelection $root $nextSelection $selectionBefore (Join-Path $job 'selection-backup')
        Start-ScheduledTask -TaskName $taskName
        $health=Wait-DevelopmentHealth
        Assert-PersistentFiles $persistent
        $prodAfter=Get-NetTCPConnection -State Listen -LocalPort 5000 | Select-Object -First 1
        $prodProcessAfter=Get-CimInstance Win32_Process -Filter ('ProcessId='+$prodAfter.OwningProcess)
        if($prodAfter.OwningProcess -ne $prod.OwningProcess -or $prodProcessAfter.CreationDate -ne $prodCreated -or (Get-FileHash -LiteralPath 'C:\Windows\System32\inetsrv\config\applicationHost.config' -Algorithm SHA256).Hash -cne $iisHash) {throw 'Production listener/IIS changed independently; inspect before further work'}
        return @{id=$manifest.id;manifestSha256=$operation.manifestSha256;files=$manifest.files.Count;existingPersistentFilesPreserved=$true;persistentFileCount=$persistent.Count;productionListenerPreserved=$true;iisConfigurationPreserved=$true;health=$health;dependencyMode='existing-no-install';obsoleteFilesRemoved=($previousFiles.Count -gt 0 -and -not $keepFiles);backendArtifact=$backendVerified;retainedExistingFiles=$keepFiles}
    } catch {
        $originalError=$_
        $script:report.rollback=@{attempted=$stopped;filesRestored=$false;healthRestored=$false;databaseRollback=$false}
        if($stopped) {
            try {
                $currentTask=Get-ScheduledTask -TaskName $taskName
                if($currentTask.Actions[0].Arguments -cne $arguments) {throw 'Task changed during deployment; recovery ownership unresolved'}
                Stop-ScheduledTask -TaskName $taskName
                $stopDeadline=[DateTime]::UtcNow.AddSeconds(30)
                while(Get-NetTCPConnection -State Listen -LocalPort 5001 -ErrorAction SilentlyContinue) {if([DateTime]::UtcNow -gt $stopDeadline){throw 'Dev port retained during recovery'};Start-Sleep -Milliseconds 500}
                if(Test-Path -LiteralPath (Join-Path $backup 'journal.json')) {Restore-CodeFiles $root $backup -KeepNewFiles:$keepFiles}
                if($selectionReceipt){[void](Restore-BackendArtifactSelection $root $selectionReceipt (Join-Path $job 'selection-recovery'))}
                $script:report.rollback.filesRestored=$true
                Start-ScheduledTask -TaskName $taskName
                [void](Wait-DevelopmentHealth)
                Assert-PersistentFiles $persistent
                $script:report.rollback.healthRestored=$true
            } catch {$script:report.rollback.errorType=$_.Exception.GetType().Name}
        }
        throw $originalError
    }
}
function Wait-DevelopmentHealth {
    $deadline21=[DateTime]::UtcNow.AddSeconds(150)
    while([DateTime]::UtcNow -lt $deadline21) {
        try {
            $health21=Invoke-RestMethod -Uri 'http://127.0.0.1:5001/api/health' -TimeoutSec 3
            if($health21.status -eq 'OK' -and $health21.authBootstrapReady -and $health21.fullBootstrapReady) {return @{status='OK';authReady=$true;fullReady=$true}}
        } catch {}
        Start-Sleep -Seconds 2
    }
    throw 'Development bootstrap did not become healthy'
}
