#requires -Version 5.1
Set-StrictMode -Version Latest
function Test-HttpManifest([string]$Root,[string]$Digest) {
    $verifier=Join-Path $PSScriptRoot 'Verify-HttpManifest.mjs'
    $node=if($env:COMPUTERNAME -ceq 'DCAPP7'){'E:\FrevOS\node\node-v24.19.0-win-x64\node.exe'}else{(Get-Command node.exe).Source}
    $info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=$node;$info.UseShellExecute=$false;$info.CreateNoWindow=$true
    $info.Arguments='"'+$verifier+'" "'+[IO.Path]::GetFullPath($Root)+'" "'+$Digest+'"'
    $info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    $child=[Diagnostics.Process]::new();$child.StartInfo=$info
    try {
        if(-not $child.Start()){throw 'Verifier did not start'}
        $out=$child.StandardOutput.ReadToEndAsync();$err=$child.StandardError.ReadToEndAsync()
        if(-not $child.WaitForExit(60000)){$child.Kill();throw 'Verifier exceeded deadline'}
        $text=$out.GetAwaiter().GetResult();[void]$err.GetAwaiter().GetResult()
        if($child.ExitCode -ne 0 -or $text.Length -gt 4000000){throw 'Release verification failed'}
        return ($text|ConvertFrom-Json)
    } finally {$child.Dispose()}
}
function Assert-HttpDelta($Previous,$Candidate) {
    $before=@{};foreach($file in $Previous.files){$before[$file.path]=$file.sha256}
    $after=@{};foreach($file in $Candidate.files){$after[$file.path]=$file.sha256}
    foreach($path in @(@($before.Keys)+@($after.Keys)|Sort-Object -Unique)){
        if($before.ContainsKey($path) -and $after.ContainsKey($path) -and $before[$path] -ceq $after[$path]){continue}
        if($path -match '^apps/control-plane/dist/(config|server)\.(js|js\.map|d\.ts|d\.ts\.map)$' -or $path -match '^apps/control-plane/node_modules/@frevos/contracts/dist/(auth-cookies|index)\.(js|js\.map|d\.ts|d\.ts\.map)$' -or $path -match '^apps/control-center/dist/' -or $path -cin @('deployment/server20/Start-Server20.ps1','deployment/server20/HttpCommon.ps1','deployment/server20/Apply-InternalHttp.ps1','deployment/server20/Verify-HttpManifest.mjs','deployment/server20/source-inventory.json','deployment/server20/Install-SelfUpdate.ps1','deployment/server20/Run-SelfUpdate.ps1')){continue}
        if($path -ceq 'deployment/server20/Install-Server20.ps1' -and -not $after.ContainsKey($path)){continue}
        throw ('Unexpected HTTP patch delta: '+$path)
    }
}
function Get-HttpSiblingSites {
    return @(Get-Website|Where-Object Name -NE 'FrevOS-Server20'|Sort-Object Name|ForEach-Object {@{name=$_.Name;state=[string]$_.State;path=[string]$_.PhysicalPath;pool=[string]$_.ApplicationPool;bindings=@($_.Bindings.Collection|ForEach-Object {$_.protocol+'|'+$_.bindingInformation})}})|ConvertTo-Json -Depth 6 -Compress
}
function Assert-ServixDelta($Previous,$Candidate) {
    $before=@{};foreach($file in $Previous.files){$before[$file.path]=$file.sha256}
    $after=@{};foreach($file in $Candidate.files){$after[$file.path]=$file.sha256}
    foreach($path in @(@($before.Keys)+@($after.Keys)|Sort-Object -Unique)){
        if($before.ContainsKey($path) -and $after.ContainsKey($path) -and $before[$path] -ceq $after[$path]){continue}
        if($path -match '^apps/control-plane/dist/(config|server|main|repositories|local-accounts|self-updates|developer-connectors|servix-deployment|deployment-settings|component-deployments|component-git|atomic-record)\.(js|js\.map|d\.ts|d\.ts\.map)$' -or $path -match '^apps/control-plane/node_modules/@frevos/contracts/dist/(deployment-change|servix-deployment|developer-connectors|deployment-settings|local-accounts|component-deployments|index)\.(js|js\.map|d\.ts|d\.ts\.map)$' -or $path -match '^apps/control-center/dist/' -or $path -match '^deployment/servix/[A-Za-z0-9.-]+$' -or $path -cin @('deployment/server20/Start-Server20.ps1','deployment/server20/HttpCommon.ps1','deployment/server20/Apply-ServixDashboard.ps1','deployment/server20/Verify-HttpManifest.mjs','deployment/server20/source-inventory.json','deployment/server20/Install-SelfUpdate.ps1','deployment/server20/Run-SelfUpdate.ps1')){continue}
        throw ('Unexpected Servix dashboard delta: '+$path)
    }
}
function Assert-ServixDeploymentIdle([string]$Root){
 if(@(Get-ChildItem -LiteralPath (Join-Path $Root 'requests') -File -Filter 'sd_*.json').Count){throw 'A deployment activation is pending'}
 foreach($file in Get-ChildItem -LiteralPath (Join-Path $Root 'jobs') -File -Filter 'sd_*.json'){
  $job=Get-Content -LiteralPath $file.FullName -Raw|ConvertFrom-Json
  if($job.version -ne 1 -or $job.workspaceId -cne 'ws_server20' -or $job.target -cne 'server21-servix-development' -or $file.Name -cne ($job.requestId+'.json') -or $job.status -notin @('failed','succeeded')){throw 'Deployment state is active or unresolved'}
 }
 foreach($claim in Get-ChildItem -LiteralPath (Join-Path $Root 'private\claims') -Directory){
  if($claim.Name -cnotmatch '^sd_[a-f0-9]{32}$'){throw 'Unknown deployment claim identity'}
  $approval=Get-Content -LiteralPath (Join-Path $claim.FullName 'approval.json') -Raw|ConvertFrom-Json
  $result=Get-Content -LiteralPath (Join-Path $Root ('results\'+$claim.Name+'.json')) -Raw|ConvertFrom-Json
  if($approval.requestId -cne $claim.Name -or $approval.workspaceId -cne 'ws_server20' -or $approval.target -cne 'server21-servix-development' -or $result.requestId -cne $claim.Name -or $result.sourceHead -cne $approval.sourceHead -or $result.artifactDigest -cne $approval.artifactDigest -or $result.status -notin @('succeeded','failed')){throw 'Consumed activation is unresolved'}
 }
}
