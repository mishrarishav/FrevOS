Set-StrictMode -Version Latest
function Assert-PreservedPaths([string[]]$Paths){
    if($Paths.Count -gt 192){throw 'Too many preservation paths'}
    foreach($relative in $Paths){
        if($relative.Length -eq 0 -or $relative.Length -gt 180){throw 'Invalid preservation path'}
        foreach($part in $relative.Replace('\','/').Split('/')){
            if($part -cnotmatch '^[A-Za-z0-9_. -]+$' -or $part -in @('.','..') -or $part -match '[. ]$|^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)'){throw 'Invalid preservation path'}
        }
    }
}
function Test-PreservedCodePath([string]$Relative,[string[]]$PreservedPaths=@()){
    $value=$Relative.Replace('\','/')
    foreach($prefix in $PreservedPaths){$p=$prefix.Replace('\','/');if($value -ieq $p -or $value.StartsWith($p+'/',[StringComparison]::OrdinalIgnoreCase)){return $true}}
    return $false
}
function Resolve-CodeFile {
    param([string]$Root,[string]$Relative)
    if(($Relative -notmatch '^(backend/src/|querysafe/src/|frontend/)[A-Za-z0-9_./@()+ ,\[\]-]+$' -and $Relative -cnotmatch '^backend/\.releases/[a-f0-9]{64}/(server\.cjs|artifact\.json)$') -or $Relative.Contains('..') -or $Relative.Contains('//')) {throw 'File is outside the managed code paths'}
    if(@($Relative.Split('/') | Where-Object {$_ -in @('uploads','database','assets-data','node_modules','.runtime','logs','backups') -or $_.StartsWith('.env',[StringComparison]::OrdinalIgnoreCase)}).Count -gt 0) {throw 'Persistent/runtime file is not a deployment file'}
    $fullRoot=[IO.Path]::GetFullPath($Root).TrimEnd('\')
    $target=[IO.Path]::GetFullPath((Join-Path $fullRoot $Relative.Replace('/','\')))
    if(-not $target.StartsWith($fullRoot+'\',[StringComparison]::OrdinalIgnoreCase)) {throw 'Code file escaped its root'}
    # Check existing parents as well as the leaf, so junctions cannot redirect writes.
    $cursor=$target
    while($cursor.Length -gt $fullRoot.Length) {
        if(Test-Path -LiteralPath $cursor) {if((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {throw 'Linked code path is not supported'}}
        $cursor=Split-Path -Parent $cursor
    }
    if((Get-Item -LiteralPath $fullRoot -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {throw 'Linked deployment root'}
    return $target
}
function Install-CodeFiles {
    param([string]$Root,[string]$Payload,[object[]]$Files,[string]$Backup,[object[]]$PreviousFiles=@(),[string[]]$PreservedPaths=@(),[switch]$OnlyChanges,[switch]$KeepExistingFiles)
    Assert-PreservedPaths $PreservedPaths
    $Files=@($Files | Where-Object {-not(Test-PreservedCodePath $_.path $PreservedPaths)})
    $PreviousFiles=@($PreviousFiles | Where-Object {-not(Test-PreservedCodePath $_.path $PreservedPaths)})
    $seen=@{}
    # Validate the entire manifest and source before creating any live file.
    foreach($file in $Files) {
        if($file.sha256 -notmatch '^[a-f0-9]{64}$' -or $seen.ContainsKey($file.path.ToLowerInvariant())) {throw 'Invalid or duplicate code manifest entry'}
        $seen[$file.path.ToLowerInvariant()]=$true
        $target=Resolve-CodeFile $Root $file.path
        $source=Resolve-CodeFile $Payload $file.path
        if(-not (Test-Path -LiteralPath $source -PathType Leaf) -or (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant() -cne $file.sha256) {throw 'Code payload integrity mismatch'}
        if(Test-Path -LiteralPath $target -PathType Container) {throw 'Code file collides with an existing directory'}
        if($file.path -cmatch '^backend/\.releases/' -and (Test-Path -LiteralPath $target -PathType Leaf) -and (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -cne $file.sha256){throw 'Immutable artifact collision'}
    }
    $obsolete=@();$previousSeen=@{}
    foreach($file in $PreviousFiles){
        $target=Resolve-CodeFile $Root $file.path
        if($file.sha256 -cnotmatch '^[a-f0-9]{64}$' -or $previousSeen.ContainsKey($file.path.ToLowerInvariant())){throw 'Invalid previous code inventory'}
        $previousSeen[$file.path.ToLowerInvariant()]=$true
        # An earlier release owns a deletion only while its exact post-image is
        # still installed. Validate every previous file before any live mutation.
        if(-not(Test-Path -LiteralPath $target -PathType Leaf) -or (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -cne $file.sha256){throw 'Installed code differs from the expected current release'}
        if(-not $KeepExistingFiles -and -not $seen.ContainsKey($file.path.ToLowerInvariant())){$obsolete+= $file}
    }
    $unchanged=@()
    if($OnlyChanges){$changed=@();foreach($file in $Files){$target=Resolve-CodeFile $Root $file.path;if((Test-Path -LiteralPath $target -PathType Leaf) -and (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ceq $file.sha256){$unchanged+=$file}else{$changed+=$file}};$Files=$changed}
    [void][IO.Directory]::CreateDirectory($Backup)
    $journal=@()
    foreach($file in $Files) {
        $target=Resolve-CodeFile $Root $file.path
        $source=Resolve-CodeFile $Payload $file.path
        $old=Resolve-CodeFile $Backup $file.path
        $exists=Test-Path -LiteralPath $target -PathType Leaf
        if($exists) {[void][IO.Directory]::CreateDirectory((Split-Path -Parent $old));Copy-Item -LiteralPath $target -Destination $old}
        $journal+=@{path=$file.path;existed=$exists;newSha256=$file.sha256;oldSha256=if($exists){(Get-FileHash -LiteralPath $old -Algorithm SHA256).Hash.ToLowerInvariant()}else{$null}}
    }
    foreach($file in $obsolete){
        $target=Resolve-CodeFile $Root $file.path;$old=Resolve-CodeFile $Backup $file.path
        [void][IO.Directory]::CreateDirectory((Split-Path -Parent $old));Copy-Item -LiteralPath $target -Destination $old
        if((Get-FileHash -LiteralPath $old -Algorithm SHA256).Hash.ToLowerInvariant() -cne $file.sha256){throw 'Obsolete code changed during backup'}
        $journal+=@{path=$file.path;existed=$true;newSha256=$null;oldSha256=$file.sha256}
    }
    # Write-ahead journal makes a partial copy recoverable, including newly created files.
    $journal | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $Backup 'journal.json') -Encoding UTF8
    foreach($file in $Files) {
        $target=Resolve-CodeFile $Root $file.path
        $source=Resolve-CodeFile $Payload $file.path
        $preimage=$journal | Where-Object {$_.path -ceq $file.path}
        if($preimage.existed) {
            if(-not (Test-Path -LiteralPath $target -PathType Leaf) -or (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -cne $preimage.oldSha256) {throw 'Code changed during backup; activation stopped'}
        } elseif(Test-Path -LiteralPath $target) {throw 'An independent file appeared during backup; activation stopped'}
        [void][IO.Directory]::CreateDirectory((Split-Path -Parent $target))
        Copy-Item -LiteralPath $source -Destination $target -Force
        if((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -cne $file.sha256) {throw 'Installed code hash mismatch'}
    }
    foreach($file in $obsolete){
        $target=Resolve-CodeFile $Root $file.path
        if(-not(Test-Path -LiteralPath $target -PathType Leaf) -or (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -cne $file.sha256){throw 'Obsolete code changed before removal'}
        Remove-Item -LiteralPath $target -Force
    }
    foreach($file in $unchanged){$target=Resolve-CodeFile $Root $file.path;if(-not(Test-Path -LiteralPath $target -PathType Leaf) -or (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -cne $file.sha256){throw 'Unchanged code drifted during activation'}}
}
function Restore-CodeFiles {
    param([string]$Root,[string]$Backup,[switch]$KeepNewFiles)
    $journal=Get-Content -LiteralPath (Join-Path $Backup 'journal.json') -Raw | ConvertFrom-Json
    foreach($file in $journal) {
        $target=Resolve-CodeFile $Root $file.path
        $old=Resolve-CodeFile $Backup $file.path
        if($file.existed) {
            if((Get-FileHash -LiteralPath $old -Algorithm SHA256).Hash.ToLowerInvariant() -cne $file.oldSha256) {throw 'Code backup integrity mismatch'}
            if(Test-Path -LiteralPath $target -PathType Leaf) {
                $current=(Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
                if($current -cne $file.newSha256 -and $current -cne $file.oldSha256) {throw 'Code changed after deployment; recovery requires review'}
            }
            Copy-Item -LiteralPath $old -Destination $target -Force
        }
        elseif(Test-Path -LiteralPath $target -PathType Leaf) {
            # Remove only a new file whose post-image is still owned by this operation.
            if((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -cne $file.newSha256) {throw 'New code file changed after deployment; recovery requires review'}
            if(-not $KeepNewFiles){Remove-Item -LiteralPath $target -Force}
        }
    }
}
Export-ModuleMember -Function Resolve-CodeFile,Install-CodeFiles,Restore-CodeFiles,Assert-PreservedPaths,Test-PreservedCodePath
