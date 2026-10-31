param([Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ConfigurationSha256)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
$configFile=Join-Path $PSScriptRoot 'runtime.json'
if((Get-FileHash -LiteralPath $configFile -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ConfigurationSha256){throw 'Runtime configuration changed'}
$config=Get-Content -LiteralPath $configFile -Raw|ConvertFrom-Json
if($config.version -ne 1 -or $env:COMPUTERNAME -cne $config.computer -or [Security.Principal.WindowsIdentity]::GetCurrent().User.Value -cne $config.ownerSid){throw 'Runtime owner/host differs'}
$binding=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'node-binding.json') -Raw|ConvertFrom-Json
if($binding.configurationSha256 -cne $ConfigurationSha256 -or (Get-FileHash -LiteralPath $binding.executable -Algorithm SHA256).Hash.ToLowerInvariant() -cne $config.nodeSha256){throw 'Node toolchain changed'}
if(Get-NetTCPConnection -State Listen -LocalPort $config.port -ErrorAction SilentlyContinue){throw 'Application port is occupied; nothing stopped'}
$env:NODE_OPTIONS=$null
$ErrorActionPreference='Continue'
# Application output may include secrets. Keep it out of controller receipts.
& $binding.executable (Join-Path $PSScriptRoot 'ProductionBackendRuntime.cjs') $ConfigurationSha256 *> $null
exit $LASTEXITCODE
