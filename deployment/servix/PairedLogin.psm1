#requires -Version 5.1
Set-StrictMode -Version Latest
function Complete-DevSetuPairedLogin {
 param([Parameter(Mandatory=$true)][string]$Server,[Parameter(Mandatory=$true)]$Response,[Parameter(Mandatory=$true)]$Session)
 $origin=[uri]$Server
 if($origin.Scheme -notin @('https','http') -or $origin.UserInfo -or $origin.Query -or $origin.Fragment -or $origin.AbsolutePath -ne '/'){throw 'Invalid DevSetu origin'}
 if($Response.StatusCode -eq 204){return}
 if($Response.StatusCode -ne 202){throw 'DevSetu sign in was not confirmed'}
 $challenge=$Response.Content|ConvertFrom-Json
 if($challenge.status -cne 'device-verification-required' -or $challenge.challengeId -cnotmatch '^dl_[a-f0-9]{64}$' -or @($challenge.ports).Count -lt 1 -or @($challenge.ports).Count -gt 10){throw 'Invalid paired login challenge'}
 foreach($port in @($challenge.ports)){
  if($port -isnot [int] -or $port -lt 1024 -or $port -gt 65535){throw 'Invalid paired login port'}
 }
 foreach($port in @($challenge.ports)){
  try{
   $local=Invoke-WebRequest ('http://127.0.0.1:'+$port+'/device-login') -UseBasicParsing -Method Post -ContentType 'application/json' -Headers @{Origin=$Server} -MaximumRedirection 0 -TimeoutSec 4 -Body (@{version=1;challengeId=$challenge.challengeId}|ConvertTo-Json -Compress)
   $proof=$local.Content|ConvertFrom-Json
   if(@($proof.PSObject.Properties.Name|Sort-Object) -join ',' -cne 'challengeId,proof,version' -or $proof.version -ne 1 -or $proof.challengeId -cne $challenge.challengeId -or $proof.proof -cnotmatch '^[a-f0-9]{64}$'){continue}
   $completed=Invoke-WebRequest ($Server+'/auth/device-login/complete') -UseBasicParsing -Method Post -ContentType 'application/json' -Headers @{Origin=$Server} -WebSession $Session -MaximumRedirection 0 -TimeoutSec 15 -Body ($proof|ConvertTo-Json -Compress)
   if($completed.StatusCode -eq 204){return}
  }catch{# Another owned computer may be offline; try only the validated loopback ports.
  }finally{$proof=$null;$local=$null}
 }
 throw 'Sign in from your own registered computer with its updated system connector running'
}
Export-ModuleMember -Function Complete-DevSetuPairedLogin
