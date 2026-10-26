param([ValidateSet('Inspect','Start','Deploy')][string]$Action='Inspect')
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$report=[ordered]@{status='FAIL';action=$Action;computer=$env:COMPUTERNAME;productionChanged=$false}
$deploymentLock21=$null
$script:additionalPreservedPaths=@()
function Read-SelectedEnv([string]$File) {
    $values=@{}
    foreach($line in [IO.File]::ReadAllLines($File)) {
        if($line -match '^\s*([^#=\s]+)\s*=\s*(.*)\s*$') {
            $values[$Matches[1]]=$Matches[2].Trim().Trim('"').Trim("'")
        }
    }
    return $values
}
function Get-PersistentFiles {
    $files=@()
    foreach($relative in @('backend\uploads','backend\database')) {
        $folder=Join-Path 'D:\servixDev' $relative
        if(Test-Path -LiteralPath $folder) {
            foreach($file in Get-ChildItem -LiteralPath $folder -File -Recurse) {
                $files+=@{path=$file.FullName;sha256=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash}
            }
        }
    }
    foreach($file in @('D:\servixDev\backend\.env','D:\servixDev\backend\.env.prd')) {
        if(Test-Path -LiteralPath $file) {$files+=@{path=$file;sha256=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash}}
    }
    foreach($relative in $script:additionalPreservedPaths){
        $target=[IO.Path]::GetFullPath((Join-Path 'D:\servixDev' $relative.Replace('/','\')))
        if(-not $target.StartsWith('D:\servixDev\',[StringComparison]::OrdinalIgnoreCase)){throw 'Persistent path escaped development root'}
        $cursor=$target
        while($cursor.Length -ge 'D:\servixDev'.Length){if((Test-Path -LiteralPath $cursor) -and (Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked persistent folder rejected'};$cursor=Split-Path -Parent $cursor}
        if(Test-Path -LiteralPath $target){
            $stack=[Collections.Generic.Stack[string]]::new();$stack.Push($target)
            while($stack.Count){
                $item=Get-Item -LiteralPath $stack.Pop() -Force
                if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked persistent content rejected'}
                if($item.PSIsContainer){foreach($child in Get-ChildItem -LiteralPath $item.FullName -Force){$stack.Push($child.FullName)}}
                else{$files+=@{path=$item.FullName;sha256=(Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash}}
                if($files.Count -gt 100000 -or $stack.Count -gt 100000){throw 'Persistent inventory exceeds budget'}
            }
        }
    }
    # Windows PowerShell 5.1 does not resolve dictionary keys for named sort
    # properties; use an expression so distinct protected files stay distinct.
    return @($files | Sort-Object { $_.path } -Unique)
}
function Assert-PersistentFiles([object[]]$Before) {
    foreach($file in $Before) {
        if(-not (Test-Path -LiteralPath $file.path -PathType Leaf) -or (Get-FileHash -LiteralPath $file.path -Algorithm SHA256).Hash -ne $file.sha256) {throw 'An existing persistent file changed; inspect retained evidence'}
    }
}
try {
    if(-not $PSScriptRoot.StartsWith('D:\servixDev\.runtime\frevos-server21\',[StringComparison]::OrdinalIgnoreCase)) {throw 'Wrong operator location'}
    if($Action -ne 'Inspect') {
        $deploymentLock21=[IO.File]::Open('D:\servixDev\.runtime\frevos-server21\deployment.lock',[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
    }
    $backend='D:\servixDev\backend'
    $frontend='D:\servixDev\frontend'
    $envFile=Join-Path $backend '.env'
    $settings=Read-SelectedEnv $envFile
    $report.environment=[ordered]@{}
    foreach($key in @('PORT','NODE_ENV','DB_HOST','DB_PORT','DB_NAME','UPLOAD_DIR','FRONTEND_URL','CORS_ORIGIN','MAIL_ENABLED','ENABLE_EMAIL_LISTENER')) {
        if($settings.ContainsKey($key)) {$report.environment[$key]=$settings[$key]}
    }
    $report.nodeVersion=(& node.exe --version | Out-String).Trim()
    $report.nodePath=(Get-Command node.exe).Source
    $report.listeners=@(Get-NetTCPConnection -State Listen | Where-Object {$_.LocalPort -in @(5000,5001,5002,82,3000)} | ForEach-Object {
        $process21=Get-CimInstance Win32_Process -Filter ('ProcessId='+$_.OwningProcess)
        [pscustomobject]@{port=$_.LocalPort;pid=$_.OwningProcess;name=$process21.Name;created=$process21.CreationDate.ToUniversalTime().ToString('o');devMarker=([string]$process21.CommandLine).Contains('D:\servixDev');productionMarker=([string]$process21.CommandLine).Contains('D:\Servix\')}
    })
    $report.devFiles=@(Get-ChildItem -LiteralPath $backend -Force | Select-Object Name,Mode)
    $report.uploadFiles=@(Get-ChildItem -LiteralPath (Join-Path $backend 'uploads') -File -Recurse).Count
    $report.health=@()
    foreach($port21 in @(5001,5002)) {
        try {
            $health=Invoke-RestMethod -Uri "http://127.0.0.1:$port21/api/health" -TimeoutSec 4
            $report.health+=@{port=$port21;status=$health.status;authReady=$health.authBootstrapReady;fullReady=$health.fullBootstrapReady}
        } catch {$report.health+=@{port=$port21;status='unavailable'}}
    }
    if($Action -eq 'Start') {
        if($env:COMPUTERNAME -ne 'DCAPP9' -or $settings.DB_NAME -cne 'servix_db_dev' -or $settings.DB_HOST -cne '10.9.69.31') {throw 'Wrong development database or machine'}
        if(Get-NetTCPConnection -State Listen -LocalPort 5001 -ErrorAction SilentlyContinue) {throw 'Development port is occupied; no process was stopped'}
        $taskName='ServixDev-FrevOS-Backend'
        if(Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {throw 'Development task already exists; inspect before replacing'}
        $persistentBefore=@(Get-PersistentFiles)
        $persistentBefore | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'persistent-before.json') -Encoding UTF8
        $launcher=Join-Path $PSScriptRoot 'Run-DevBackend.ps1'
        $taskArgs='-NoProfile -NonInteractive -WindowStyle Hidden -File "'+$launcher+'"'
        $taskAction=New-ScheduledTaskAction -Execute 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -Argument $taskArgs -WorkingDirectory $backend
        $principal=New-ScheduledTaskPrincipal -UserId 'S-1-5-18' -LogonType ServiceAccount -RunLevel Highest
        $taskSettings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -StartWhenAvailable
        $trigger=New-ScheduledTaskTrigger -AtStartup
        Register-ScheduledTask -TaskName $taskName -Action $taskAction -Principal $principal -Settings $taskSettings -Trigger $trigger | Out-Null
        $report.createdTask=$taskName
        Start-ScheduledTask -TaskName $taskName
        $deadline=[DateTime]::UtcNow.AddSeconds(150)
        $ready=$false
        while([DateTime]::UtcNow -lt $deadline) {
            try {
                $health=Invoke-RestMethod -Uri 'http://127.0.0.1:5001/api/health' -TimeoutSec 3
                if($health.status -eq 'OK' -and $health.authBootstrapReady -and $health.fullBootstrapReady) {$ready=$true;break}
            } catch {}
            Start-Sleep -Seconds 2
        }
        if(-not $ready) {
            $owned=Get-ScheduledTask -TaskName $taskName
            if($owned.Actions.Count -eq 1 -and $owned.Actions[0].Arguments -ceq $taskArgs) {Stop-ScheduledTask -TaskName $taskName}
            throw 'Development health failed; retained task and logs for diagnosis'
        }
        $listener=Get-NetTCPConnection -State Listen -LocalPort 5001 | Select-Object -First 1
        $process21=Get-CimInstance Win32_Process -Filter ('ProcessId='+$listener.OwningProcess)
        if(-not ([string]$process21.CommandLine).Contains('--servix-backend-root=D:\servixDev\backend') -or -not ([string]$process21.CommandLine).Contains('--servix-dev-profile=server21')) {throw 'Development listener identity mismatch'}
        $report.started=@{port=5001;pid=$listener.OwningProcess;created=$process21.CreationDate.ToUniversalTime().ToString('o');task=$taskName;authReady=$health.authBootstrapReady;fullReady=$health.fullBootstrapReady;mailDisabled=$true}
        $before=@($report.listeners | Where-Object {$_.port -eq 5000})
        $after=@(Get-NetTCPConnection -State Listen -LocalPort 5000 | ForEach-Object {$p=Get-CimInstance Win32_Process -Filter ('ProcessId='+$_.OwningProcess);@{pid=$_.OwningProcess;created=$p.CreationDate.ToUniversalTime().ToString('o')}})
        if($before.Count -ne $after.Count -or ($before.Count -gt 0 -and ($before[0].pid -ne $after[0].pid -or $before[0].created -ne $after[0].created))) {throw 'Production listener changed independently; inspect before further work'}
        $report.productionListenerPreserved=$true
        Assert-PersistentFiles $persistentBefore
        $report.existingPersistentFilesPreserved=$true
        $report.persistentFileCount=$persistentBefore.Count
    } elseif($Action -eq 'Deploy') {
        . (Join-Path $PSScriptRoot 'Invoke-DevRelease.ps1')
        $report.release=Invoke-DevelopmentRelease
    }
    $report.status='PASS'
} catch {$report.errorType=$_.Exception.GetType().Name;$report.errorId=$_.FullyQualifiedErrorId}
try {[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'result.json'),($report|ConvertTo-Json -Depth 9),[Text.UTF8Encoding]::new($false))}
finally {if($deploymentLock21){$deploymentLock21.Dispose()}}
if($report.status -ne 'PASS') {exit 1}
