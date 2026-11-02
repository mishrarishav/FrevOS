param([string]$ContextFile,[string]$StateFile,[ValidateSet('Observe','Activate')][string]$Action)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
$env:PSModulePath=Join-Path $env:windir 'System32\WindowsPowerShell\v1.0\Modules'
$fixtureContext=Get-Content -LiteralPath $ContextFile -Raw|ConvertFrom-Json
$fixtureState=Get-Content -LiteralPath $StateFile -Raw|ConvertFrom-Json
if(-not [IO.Path]::GetFullPath($StateFile).StartsWith(([IO.Path]::GetFullPath($env:TEMP).TrimEnd('\')+'\promotion-lifecycle-'),[StringComparison]::OrdinalIgnoreCase)){throw 'Fixture scope rejected'}
$global:DevSetuFixtureContext=$fixtureContext;$global:DevSetuFixtureState=$fixtureState;$global:DevSetuFixtureProbes=@{}
function global:Trace-Fixture([string]$Step){[IO.File]::AppendAllText($global:DevSetuFixtureStateFile+'.steps',$Step+"`n")}
$global:DevSetuFixtureStateFile=$StateFile
function global:Get-NetTCPConnection {param($State,$LocalPort,$ErrorAction) if($global:DevSetuFixtureState.running){[pscustomobject]@{OwningProcess=$global:DevSetuFixtureState.pid}}}
function global:Get-CimInstance {param($ClassName,$Filter) [pscustomobject]@{ProcessId=$global:DevSetuFixtureState.pid;CreationDate=[DateTime]::Parse($global:DevSetuFixtureState.created).ToUniversalTime();ExecutablePath=$global:DevSetuFixtureContext.target.node;CommandLine=$global:DevSetuFixtureState.command}}
function global:Invoke-CimMethod {param($InputObject,$MethodName) @{ReturnValue=0;Sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value}}
function global:Invoke-RestMethod {param($Uri,$TimeoutSec) Trace-Fixture 'health';@{status='OK';authBootstrapReady=$true;fullBootstrapReady=$true}}
function global:Get-ScheduledTask {
 param($TaskName,$TaskPath,$ErrorAction)
 if(-not $global:DevSetuFixtureState.taskXml){if($ErrorAction -eq 'Stop'){throw 'Fixture task missing'};return}
 $x=[xml]$global:DevSetuFixtureState.taskXml
 [pscustomobject]@{Principal=[pscustomobject]@{UserId=[Security.Principal.WindowsIdentity]::GetCurrent().Name};Actions=@([pscustomobject]@{Execute=[string]$x.Task.Actions.Exec.Command;Arguments=[string]$x.Task.Actions.Exec.Arguments;WorkingDirectory=[string]$x.Task.Actions.Exec.WorkingDirectory})}
}
function global:Export-ScheduledTask {param($TaskName,$TaskPath) [string]$global:DevSetuFixtureState.taskXml}
function global:Stop-ScheduledTask {param($TaskName) $global:DevSetuFixtureState.running=$false}
function global:Stop-Process {param($Id,$ErrorAction) if($Id -ne $global:DevSetuFixtureState.pid){throw 'Fixture process mismatch'};$global:DevSetuFixtureState.running=$false}
function global:Start-ScheduledTask {
 param($TaskName)
 $x=[xml]$global:DevSetuFixtureState.taskXml;$a=[string]$x.Task.Actions.Exec.Arguments
 if($a -cnotmatch '-File "([^"]+Run-SavedBackend\.ps1)" -ConfigurationSha256 ([a-f0-9]{64})$'){throw 'Fixture task action invalid'}
 $entry=Join-Path (Split-Path $Matches[1]) 'ProductionBackendRuntime.cjs';$hash=$Matches[2]
 $global:DevSetuFixtureState.command='"'+$global:DevSetuFixtureContext.target.node+'" "'+$entry+'" '+$hash
 $global:DevSetuFixtureState.running=$true;$global:DevSetuFixtureState.pid+=1;$global:DevSetuFixtureState.created=[DateTime]::UtcNow.ToString('o')
}
function global:Unregister-ScheduledTask {param($TaskName,$Confirm) $global:DevSetuFixtureState.taskXml=$null}
$global:DevSetuFixtureFolder=[pscustomobject]@{}
$global:DevSetuFixtureFolder|Add-Member ScriptMethod RegisterTask {
 param($name,$xml,$mode,$user,$secret,$logon,$sddl)
 Trace-Fixture ('register-'+[string]$mode)
 if($name -eq $global:DevSetuFixtureContext.target.taskName){
  if(($mode -eq 2 -and $global:DevSetuFixtureState.taskXml) -or ($mode -eq 4 -and -not $global:DevSetuFixtureState.taskXml)){throw 'Fixture create/update mode differs'}
  # Model Windows export normalization: these defaults may be omitted.
  $global:DevSetuFixtureState.taskXml=$xml.Replace('<RunLevel>LeastPrivilege</RunLevel>','').Replace('<Enabled>true</Enabled>','');$global:DevSetuFixtureState.registrationModes+=@([int]$mode)
  if($global:DevSetuFixtureState.PSObject.Properties['failAfterRegistration'] -and $global:DevSetuFixtureState.failAfterRegistration){$global:DevSetuFixtureState.failAfterRegistration=$false;throw 'Synthetic interruption after task registration'}
 }else{$global:DevSetuFixtureProbes[$name]=$xml}
}
$global:DevSetuFixtureFolder|Add-Member ScriptMethod GetTask {
 param($name)
 $task=[pscustomobject]@{Xml=$global:DevSetuFixtureProbes[$name];State=3}
 $task|Add-Member ScriptMethod Run {param($unused) Trace-Fixture 'probe-run';$x=[xml]$this.Xml;$args=[string]$x.Task.Actions.Exec.Arguments;if($args -cnotmatch '-File "([^"]+Check-Owner\.ps1)"'){throw 'Fixture probe scope'};& $Matches[1];Trace-Fixture 'probe-finished'}
 $task|Add-Member ScriptMethod Stop {param($unused)}
 return $task
}
$global:DevSetuFixtureFolder|Add-Member ScriptMethod DeleteTask {param($name,$flags) if(-not $global:DevSetuFixtureProbes.ContainsKey($name)){throw 'Fixture probe missing'};$global:DevSetuFixtureProbes.Remove($name)}
function global:New-Object {
 param($ComObject)
 if($ComObject -cne 'Schedule.Service'){throw 'Fixture COM boundary'}
 $scheduler=[pscustomobject]@{}
 $scheduler|Add-Member ScriptMethod Connect {}
 $scheduler|Add-Member ScriptMethod GetFolder {param($name) return $global:DevSetuFixtureFolder}
 $scheduler|Add-Member ScriptMethod NewTask {
  param($flags)
  $definition=[pscustomobject]@{RawXml='';Principal=$null;Actions=$null;Triggers=$null;Settings=$null}
  $definition|Add-Member ScriptProperty XmlText {return $this.RawXml} {
   param($value)
   $this.RawXml=$value;$x=[xml]$value
   $get={param($xpath,$fallback) $node=$x.SelectSingleNode($xpath);if($node){$node.InnerText}else{$fallback}}
   $principal="/*[local-name()='Task']/*[local-name()='Principals']/*[local-name()='Principal']"
   $level=& $get ($principal+"/*[local-name()='RunLevel']") 'LeastPrivilege'
   $logon=& $get ($principal+"/*[local-name()='LogonType']") ''
   $this.Principal=[pscustomobject]@{UserId=(& $get ($principal+"/*[local-name()='UserId']") '');RunLevel=$(if($level -ceq 'LeastPrivilege'){0}else{1});LogonType=$(if($logon -ceq 'Password'){1}else{0})}
   $exec=$x.SelectSingleNode("/*[local-name()='Task']/*[local-name()='Actions']/*[local-name()='Exec']")
   $action=[pscustomobject]@{Type=0;Path=[string]$exec.Command;Arguments=[string]$exec.Arguments;WorkingDirectory=[string]$exec.WorkingDirectory}
   $this.Actions=[pscustomobject]@{Count=$x.SelectNodes("/*[local-name()='Task']/*[local-name()='Actions']/*").Count;Value=$action}
   $this.Actions|Add-Member ScriptMethod Item {param($index) if($index -ne 1){throw 'Fixture action index'};return $this.Value}
   $triggerPath="/*[local-name()='Task']/*[local-name()='Triggers']/*[local-name()='BootTrigger']"
   $enabled=& $get ($triggerPath+"/*[local-name()='Enabled']") 'true'
   $trigger=[pscustomobject]@{Type=8;Enabled=($enabled -ceq 'true');Delay=(& $get ($triggerPath+"/*[local-name()='Delay']") '')}
   $this.Triggers=[pscustomobject]@{Count=$x.SelectNodes("/*[local-name()='Task']/*[local-name()='Triggers']/*").Count;Value=$trigger}
   $this.Triggers|Add-Member ScriptMethod Item {param($index) if($index -ne 1){throw 'Fixture trigger index'};return $this.Value}
   $this.Settings=[pscustomobject]@{Enabled=((& $get "/*[local-name()='Task']/*[local-name()='Settings']/*[local-name()='Enabled']" 'true') -ceq 'true')}
  }
  return $definition
 }
 return $scheduler
}
try{
 $credential=[pscredential]::new([Security.Principal.WindowsIdentity]::GetCurrent().Name,(ConvertTo-SecureString 'synthetic-fixture-only' -AsPlainText -Force))
 $result=& (Join-Path $fixtureContext.staging 'Invoke-PromotionTarget.ps1') -Action $Action -ContextFile $ContextFile -RuntimeCredential $credential
 $result|ConvertTo-Json -Depth 40 -Compress
}finally{
 [IO.File]::WriteAllText($StateFile,($global:DevSetuFixtureState|ConvertTo-Json -Depth 20 -Compress),[Text.UTF8Encoding]::new($false))
}
