Set-StrictMode -Version Latest
function Get-PrivatePreviewHash([string]$File){(Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant()}
function ConvertTo-PrivatePreviewCanonical($Value){
 if($null -eq $Value){return 'null'}
 if($Value -is [Collections.IDictionary]){return '{'+((@($Value.Keys|Sort-Object)|ForEach-Object {($_|ConvertTo-Json -Compress)+':'+(ConvertTo-PrivatePreviewCanonical $Value[$_])})-join ',')+'}'}
 if($Value -is [Array]){return '['+((@($Value|ForEach-Object {ConvertTo-PrivatePreviewCanonical $_}))-join ',')+']'}
 if($Value.GetType().FullName -ceq 'System.Management.Automation.PSCustomObject'){return '{'+((@($Value.PSObject.Properties.Name|Sort-Object)|ForEach-Object {($_|ConvertTo-Json -Compress)+':'+(ConvertTo-PrivatePreviewCanonical $Value.$_)})-join ',')+'}'}
 return ($Value|ConvertTo-Json -Compress)
}
function Test-PrivatePreviewIisPayload($Payload,[switch]$RequireFrozen){
 $keys='activation,applicationHostBeforeSha256,configBeforeSha256,controlTask,executor,expectedIisSha256,iis,installationRoot,manifestSha256,node,operators,operatorSid,portalOrigin,relay,requestedBy,target,version,workspaceId'
 if((@($Payload.PSObject.Properties.Name|Sort-Object)-join ',') -cne $keys -or ($Payload.version -isnot [int] -and $Payload.version -isnot [long])){throw 'Private IIS payload schema differs'}
 foreach($pair in @(@('activation','candidateId,requestId'),@('controlTask','name,sha256'),@('executor','guardSha256,id,root'),@('iis','address,directory,farmName,hostname,poolName,port,siteName'),@('node','file,sha256'),@('operators','configSha256,mainSha256,modelSha256,sourceHead'))){if((@($Payload.($pair[0]).PSObject.Properties.Name|Sort-Object)-join ',') -cne $pair[1]){throw 'Private IIS nested schema differs'}}
 if(($Payload.iis.port -isnot [int] -and $Payload.iis.port -isnot [long]) -or ($Payload.relay.listen.port -isnot [int] -and $Payload.relay.listen.port -isnot [long])){throw 'Private IIS port type invalid'}
 if($Payload.version -ne 1 -or $Payload.workspaceId -cnotmatch '^ws_[A-Za-z0-9_-]+$' -or $Payload.requestedBy -cnotmatch '^usr_[A-Za-z0-9_-]+$' -or $Payload.manifestSha256 -cnotmatch '^[a-f0-9]{64}$' -or $Payload.operatorSid -cnotmatch '^S-1-5-(\d+-)*\d+$'){throw 'Private IIS payload identity differs'}
 foreach($value in @($Payload.iis.siteName,$Payload.iis.poolName,$Payload.iis.farmName)){if($value -cnotmatch '^[A-Za-z][A-Za-z0-9-]{2,79}$'){throw 'Private IIS resource name invalid'}}
 if($Payload.iis.directory -cnotmatch '^preview-iis(?:-[a-z0-9-]+)?$' -or $Payload.iis.port -ne 80 -or $Payload.iis.hostname -cnotmatch '^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$' -or $Payload.iis.hostname.Contains('..')){throw 'Private IIS route invalid'}
 $address=$null;if(-not [Net.IPAddress]::TryParse($Payload.iis.address,[ref]$address) -or $address.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork){throw 'Private IIS address invalid'}
 $a=$address.GetAddressBytes();if(-not($a[0] -eq 10 -or ($a[0] -eq 172 -and $a[1] -ge 16 -and $a[1] -le 31) -or ($a[0] -eq 192 -and $a[1] -eq 168))){throw 'Private IIS address must be private'}
 $root=[IO.Path]::GetFullPath($Payload.installationRoot);if($Payload.installationRoot -notmatch '^[A-Za-z]:\\' -or $root -ieq [IO.Path]::GetPathRoot($root) -or $Payload.installationRoot.TrimEnd('\') -cne $root.TrimEnd('\')){throw 'Private IIS root invalid'}
 if($Payload.relay.listen.host -cne '127.0.0.1' -or $Payload.relay.listen.port -lt 1024 -or $Payload.relay.listen.port -gt 65535 -or @($Payload.relay.targets).Count -ne 1 -or $Payload.relay.workspaceId -cne $Payload.workspaceId){throw 'Private IIS backend invalid'}
 $origin='http://'+$Payload.iis.hostname
 if($Payload.relay.targets[0].origin -cne $origin -or ([uri]$Payload.portalOrigin).DnsSafeHost -ieq $Payload.iis.hostname){throw 'Private IIS origin isolation invalid'}
 foreach($hash in @($Payload.applicationHostBeforeSha256,$Payload.configBeforeSha256,$Payload.operators.mainSha256,$Payload.operators.modelSha256,$Payload.operators.configSha256)){if($hash -cnotmatch '^[a-f0-9]{64}$'){throw 'Private IIS digest invalid'}}
 if($RequireFrozen -and ($Payload.operators.sourceHead -cnotmatch '^[a-f0-9]{40}$' -or $Payload.expectedIisSha256 -cnotmatch '^[a-f0-9]{64}$')){throw 'Frozen private IIS operator and mapped artifact required'}
}
function Get-PrivatePreviewIisRoot($Payload){Join-Path (Join-Path ([IO.Path]::GetFullPath($Payload.installationRoot)) 'servix') $Payload.iis.directory}
function Test-PrivatePreviewIisApproval($Approval,$Plan,$Payload,[DateTimeOffset]$Now=[DateTimeOffset]::UtcNow){
 $keys='action,actor,actorSid,correlationId,decision,expiresUtc,issuedUtc,manifestSha256,operatorSha256,payloadSha256,questionItemId,target,version,workspaceId'
 if((@($Approval.PSObject.Properties.Name|Sort-Object)-join ',') -cne $keys -or $Approval.version -isnot [int] -or $Approval.version -ne 1 -or $Approval.decision -cne 'approved' -or $Approval.action -cne $Plan.action -or $Approval.correlationId -cne $Plan.id -or $Approval.payloadSha256 -cne $Plan.payloadSha256 -or $Approval.manifestSha256 -cne $Payload.manifestSha256 -or $Approval.operatorSha256 -cne $Payload.operators.mainSha256 -or $Approval.workspaceId -cne $Payload.workspaceId -or $Approval.target -cne $Payload.target -or $Approval.actor -cne $Payload.requestedBy -or $Approval.actorSid -cne $Payload.operatorSid -or $Approval.questionItemId -isnot [string] -or $Approval.questionItemId.Length -lt 10 -or ([DateTimeOffset]$Approval.issuedUtc) -gt $Now -or ([DateTimeOffset]$Approval.expiresUtc) -le $Now -or (([DateTimeOffset]$Approval.expiresUtc)-([DateTimeOffset]$Approval.issuedUtc)).TotalMinutes -gt 15){throw 'Exact private IIS routing approval required'}
}
function Get-PrivatePreviewIisFingerprint([string]$File,$Iis){
 $document=[xml][IO.File]::ReadAllText($File)
 foreach($xpath in @('/configuration/system.applicationHost/sites/site','/configuration/system.applicationHost/applicationPools/add','/configuration/webFarms/webFarm','/configuration/location')){
  foreach($node in @($document.SelectNodes($xpath))){
   $remove=($xpath.EndsWith('/site') -and $node.GetAttribute('name') -ceq $Iis.siteName) -or ($xpath.EndsWith('/add') -and $node.GetAttribute('name') -ceq $Iis.poolName) -or ($xpath.EndsWith('/webFarm') -and $node.GetAttribute('name') -ceq $Iis.farmName) -or ($xpath.EndsWith('/location') -and $node.GetAttribute('path') -ceq $Iis.siteName)
   if($remove){[void]$node.ParentNode.RemoveChild($node)}
  }
 }
 $farms=$document.SelectSingleNode('/configuration/webFarms');if($farms -and $farms.Attributes.Count -eq 0 -and @($farms.ChildNodes|Where-Object NodeType -EQ Element).Count -eq 0){[void]$farms.ParentNode.RemoveChild($farms)}
 $hash=[Security.Cryptography.SHA256]::Create();try{[BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($document.OuterXml))).Replace('-','').ToLowerInvariant()}finally{$hash.Dispose()}
}
function Add-PrivatePreviewIisModel($Manager,$Payload){
 $iis=$Payload.iis;$configuration=$Manager.GetApplicationHostConfiguration()
 if($Manager.Sites[$iis.siteName] -or $Manager.ApplicationPools[$iis.poolName]){throw 'Private IIS resource collision'}
 foreach($site in $Manager.Sites){foreach($binding in $site.Bindings){if($binding.Host -ieq $iis.hostname){throw 'Private IIS hostname collision'}}}
 $global=$configuration.GetSection('system.webServer/proxy');if(-not [bool]$global.GetAttributeValue('enabled')){throw 'Existing ARR proxy must be enabled'}
 $before=[bool]$global.GetAttributeValue('preserveHostHeader')
 $pool=$Manager.ApplicationPools.Add($iis.poolName);$pool.ManagedRuntimeVersion=''
 $site=$Manager.Sites.Add($iis.siteName,'http',($iis.address+':80:'+$iis.hostname),(Get-PrivatePreviewIisRoot $Payload));$site.Applications['/'].ApplicationPoolName=$iis.poolName
 $site.ServerAutoStart=$true;$site.GetChildElement('logFile').SetAttributeValue('enabled',$false);$site.GetChildElement('traceFailedRequestsLogging').SetAttributeValue('enabled',$false)
 $farms=$configuration.GetSection('webFarms').GetCollection();foreach($existing in $farms){if($existing.GetAttributeValue('name') -ceq $iis.farmName){throw 'Private IIS farm collision'}}
 $farm=$farms.CreateElement('webFarm');$farm.SetAttributeValue('name',$iis.farmName)
 $protocol=$farm.GetChildElement('applicationRequestRouting').GetChildElement('protocol');$protocol.SetAttributeValue('preserveHostHeader',$true);$protocol.SetAttributeValue('reverseRewriteHostInResponseHeaders',$false);$protocol.SetAttributeValue('timeout',[TimeSpan]::FromSeconds(30))
 $servers=$farm.GetCollection();$backend=$servers.CreateElement('server');$backend.SetAttributeValue('address','127.0.0.1');$backend.GetChildElement('applicationRequestRouting').SetAttributeValue('httpPort',[uint32]$Payload.relay.listen.port);$servers.Add($backend);$farms.Add($farm)
 $rules=$configuration.GetSection('system.webServer/rewrite/rules',$iis.siteName).GetCollection();$rules.Clear();$rule=$rules.CreateElement('rule');$rule.SetAttributeValue('name','DevSetu private preview');$rule.SetAttributeValue('stopProcessing',$true);$rule.GetChildElement('match').SetAttributeValue('url','(.*)');$action=$rule.GetChildElement('action');$action.SetAttributeValue('type','Rewrite');$action.SetAttributeValue('url',('http://'+$iis.farmName+'/{R:1}'));$action.SetAttributeValue('appendQueryString',$true);$rules.Add($rule)
 if([bool]$global.GetAttributeValue('preserveHostHeader') -ne $before){throw 'Global ARR setting changed'}
}
function Remove-PrivatePreviewIisModel($Manager,$Payload){
 $iis=$Payload.iis;$site=$Manager.Sites[$iis.siteName]
 if(-not $site -or $site.Applications['/'].VirtualDirectories['/'].PhysicalPath -ine (Get-PrivatePreviewIisRoot $Payload) -or $site.Applications['/'].ApplicationPoolName -cne $iis.poolName){throw 'Owned IIS site identity changed'}
 [void]$Manager.Sites.Remove($site);$configuration=$Manager.GetApplicationHostConfiguration();$configuration.RemoveLocationPath($iis.siteName)
 $pool=$Manager.ApplicationPools[$iis.poolName];if($pool){[void]$Manager.ApplicationPools.Remove($pool)}
 $farms=$configuration.GetSection('webFarms').GetCollection();foreach($farm in @($farms)){if($farm.GetAttributeValue('name') -ceq $iis.farmName){[void]$farms.Remove($farm)}}
}
Export-ModuleMember -Function Get-PrivatePreviewHash,ConvertTo-PrivatePreviewCanonical,Test-PrivatePreviewIisPayload,Test-PrivatePreviewIisApproval,Get-PrivatePreviewIisRoot,Get-PrivatePreviewIisFingerprint,Add-PrivatePreviewIisModel,Remove-PrivatePreviewIisModel
