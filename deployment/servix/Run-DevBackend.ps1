$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$backend='D:\servixDev\backend'
if(-not $PSScriptRoot.StartsWith('D:\servixDev\.runtime\frevos-server21\',[StringComparison]::OrdinalIgnoreCase)) {throw 'Wrong launcher root'}
$settings=@{}
foreach($line in [IO.File]::ReadAllLines((Join-Path $backend '.env'))) {
    if($line -match '^\s*([^#=\s]+)\s*=\s*(.*)\s*$') {$settings[$Matches[1]]=$Matches[2].Trim().Trim('"').Trim("'")}
}
if($settings.DB_NAME -cne 'servix_db_dev' -or $settings.DB_HOST -cne '10.9.69.31' -or $settings.DB_PORT -ne '3306') {throw 'Development database identity changed'}
$env:ENV_FILE=Join-Path $backend '.env'
foreach($key in @('DB_HOST','DB_PORT','DB_NAME','DB_USER','DB_PASSWORD')) {
    if(-not $settings.ContainsKey($key)) {throw 'Development database configuration incomplete'}
    [Environment]::SetEnvironmentVariable($key,$settings[$key],'Process')
}
$settings.Clear()
$env:PORT='5001';$env:NODE_ENV='development'
$env:UPLOAD_DIR='./uploads'
# A development database may contain copied mailbox settings. Keep mail local.
$env:MAIL_ENABLED='false';$env:ENABLE_EMAIL_LISTENER='false';$env:LOCAL_MAIL_DISABLED='true'
$env:LOCAL_OUTGOING_MAIL_DISABLED='true';$env:LOCAL_MAIL_LISTENER_DISABLED='true'
$env:AUTO_CLOSE_RESOLVED_ENABLED='false';$env:AUTO_RESOLVE_PENDING_USER_ENABLED='false'
$env:FRONTEND_URL='http://10.9.69.21:82'
$env:CORS_ORIGIN='http://10.9.69.21:82,http://localhost:82'
Set-Location -LiteralPath $backend
$ErrorActionPreference='Continue'
& 'C:\Program Files\nodejs\npm.cmd' start -- '--servix-backend-root=D:\servixDev\backend' '--servix-dev-profile=server21' *> (Join-Path $PSScriptRoot 'backend.log')
exit $LASTEXITCODE
