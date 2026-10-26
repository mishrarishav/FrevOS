#requires -Version 5.1
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
try {
    $root='E:\FrevOS'
    $state=[IO.File]::ReadAllText((Join-Path $root 'state\active.json'))|ConvertFrom-Json
    if($state.manifestSha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'Invalid release'}
    $release=Join-Path $root ('releases\'+$state.manifestSha256)
    . (Join-Path $release 'deployment\server20\Postgres.ps1')
    . (Join-Path $release 'deployment\server20\HttpCommon.ps1')
    $manifest=Test-HttpManifest $release $state.manifestSha256
    if($manifest.schemaVersion -notin @(3,4)){throw 'Expected HTTP release'}
    $config=[IO.File]::ReadAllText((Join-Path $root 'config\runtime.json'))|ConvertFrom-Json
    $allowed=@('DATABASE_URL','FREVOS_PUBLIC_ORIGIN','FREVOS_ALLOW_INTERNAL_HTTP','FREVOS_AUTH_MODE','FREVOS_BASE_PATH','HOST','PORT')
    if($manifest.schemaVersion -eq 4){$allowed+= 'FREVOS_SERVIX_DEPLOYMENT_ROOT';if($config.FREVOS_SERVIX_DEPLOYMENT_ROOT -cne 'E:\FrevOS\servix'){throw 'Invalid Servix profile'}}
    if(@($config.PSObject.Properties.Name).Count -ne $allowed.Count -or @($config.PSObject.Properties.Name|Where-Object {$_ -notin $allowed}).Count -or $config.HOST -cne '127.0.0.1' -or $config.PORT -cne '10000' -or $config.FREVOS_PUBLIC_ORIGIN -cne $manifest.publicOrigin -or $config.FREVOS_ALLOW_INTERNAL_HTTP -cne 'true' -or $config.FREVOS_AUTH_MODE -cne 'local' -or $config.FREVOS_BASE_PATH -cne ''){throw 'Invalid HTTP runtime profile'}
    $url=[Uri]$config.DATABASE_URL
    if($url.Scheme -cne 'postgresql' -or $url.Host -cne '127.0.0.1' -or $url.Port -ne 5433 -or $url.AbsolutePath -cne '/frevos' -or $url.UserInfo.Split(':')[0] -cne 'frevos_runtime' -or $url.Query){throw 'Invalid runtime database'}
    foreach($variable in @(Get-ChildItem Env:)){if($variable.Name -match '^(PG|FREVOS|DATABASE_URL$|MIGRATION_DATABASE_URL$|NODE_OPTIONS$)'){Remove-Item -LiteralPath ('Env:'+$variable.Name)}}
    foreach($name in $allowed){[Environment]::SetEnvironmentVariable($name,[string]$config.$name,'Process')}
    & 'E:\FrevOS\node\node-v24.19.0-win-x64\node.exe' (Join-Path $release 'apps\control-plane\dist\main.js') *> $null
    exit $LASTEXITCODE
} catch {exit 1}
