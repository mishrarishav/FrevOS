Set-StrictMode -Version Latest

function Test-BrowserEntryIisProfile($Profile) {
 $keys='allowedClients,basePath,farmName,httpsOnly,physicalPath,poolName,publicOrigin,siteName,upstreamOrigin,version'
 if((@($Profile.PSObject.Properties.Name|Sort-Object)-join ',') -cne $keys -or $Profile.version -ne 1){throw 'Browser IIS profile schema differs'}
 foreach($key in @('siteName','poolName','farmName')){if($Profile.$key -cnotmatch '^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$'){throw 'Browser IIS name rejected'}}
 if($Profile.basePath -cnotmatch '^/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$' -or $Profile.httpsOnly -isnot [bool]){throw 'Browser IIS path or protocol rejected'}
 $public=[Uri]$Profile.publicOrigin;$upstream=[Uri]$Profile.upstreamOrigin
 if($public.Scheme -cne 'https' -or $public.GetLeftPart([UriPartial]::Authority) -cne $Profile.publicOrigin -or $public.UserInfo){throw 'Browser IIS public origin rejected'}
 $ip=$null
 if($upstream.Scheme -cne 'http' -or $upstream.GetLeftPart([UriPartial]::Authority) -cne $Profile.upstreamOrigin -or $upstream.UserInfo -or -not [Net.IPAddress]::TryParse($upstream.Host,[ref]$ip) -or $ip.AddressFamily -ne 'InterNetwork'){throw 'Browser IIS upstream rejected'}
 $octets=$ip.GetAddressBytes();if(-not($octets[0] -in @(10,127) -or ($octets[0] -eq 192 -and $octets[1] -eq 168) -or ($octets[0] -eq 172 -and $octets[1] -ge 16 -and $octets[1] -le 31))){throw 'Browser IIS upstream must be private'}
 if($Profile.allowedClients -isnot [Array] -or $Profile.allowedClients.Count -gt 16){throw 'Browser IIS client list rejected'}
 foreach($client in $Profile.allowedClients){$address=$null;if(-not [Net.IPAddress]::TryParse($client,[ref]$address) -or $address.AddressFamily -ne 'InterNetwork' -or $address.ToString() -cne $client){throw 'Browser IIS client address rejected'}}
 if(-not $Profile.httpsOnly -and $Profile.allowedClients.Count -eq 0){throw 'Private upstream requires explicit client addresses'}
 $physical=[IO.Path]::GetFullPath($Profile.physicalPath)
 if($physical -ine $Profile.physicalPath -or $physical -notmatch '^[A-Za-z]:\\' -or $physical -ieq [IO.Path]::GetPathRoot($physical) -or $physical.TrimEnd('\') -ine $physical -or $physical.Contains('..')){throw 'Browser IIS directory rejected'}
}

function Get-BrowserEntryIisFingerprint([string]$Path,$Profile) {
 $settings=[Xml.XmlReaderSettings]::new();$settings.DtdProcessing=[Xml.DtdProcessing]::Prohibit;$settings.XmlResolver=$null
 $reader=[Xml.XmlReader]::Create($Path,$settings)
 try{$xml=[Xml.XmlDocument]::new();$xml.PreserveWhitespace=$false;$xml.XmlResolver=$null;$xml.Load($reader)}finally{$reader.Dispose()}
 $site=$xml.SelectSingleNode('/configuration/system.applicationHost/sites/site[@name="'+$Profile.siteName+'"]')
 if(-not $site){throw 'Browser IIS existing site missing'}
 foreach($node in @($site.SelectNodes('application[@path="'+$Profile.basePath+'"]'))){[void]$site.RemoveChild($node)}
 foreach($query in @(('/configuration/system.applicationHost/applicationPools/add[@name="'+$Profile.poolName+'"]'),('/configuration/webFarms/webFarm[@name="'+$Profile.farmName+'"]'),('/configuration/location[@path="'+$Profile.siteName+$Profile.basePath+'"]'))){foreach($node in @($xml.SelectNodes($query))){[void]$node.ParentNode.RemoveChild($node)}}
 $hash=[Security.Cryptography.SHA256]::Create();try{return ([BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($xml.OuterXml)))).Replace('-','').ToLowerInvariant()}finally{$hash.Dispose()}
}

function Add-BrowserEntryIisModel($Manager,$Profile) {
 Test-BrowserEntryIisProfile $Profile
 $site=$Manager.Sites[$Profile.siteName];$config=$Manager.GetApplicationHostConfiguration()
 if(-not $site -or $site.Applications[$Profile.basePath] -or $Manager.ApplicationPools[$Profile.poolName]){throw 'Browser IIS application/site/pool collision'}
 foreach($s in $Manager.Sites){foreach($app in $s.Applications){foreach($directory in $app.VirtualDirectories){$existing=[Environment]::ExpandEnvironmentVariables([string]$directory.PhysicalPath).TrimEnd('\');if($existing -and ($Profile.physicalPath -ieq $existing -or $Profile.physicalPath.StartsWith($existing+'\',[StringComparison]::OrdinalIgnoreCase) -or $existing.StartsWith($Profile.physicalPath+'\',[StringComparison]::OrdinalIgnoreCase))){throw 'Browser IIS directory conflicts with an existing application'}}}}
 if(-not [bool]$config.GetSection('system.webServer/proxy').GetAttributeValue('enabled')){throw 'Existing ARR proxy required'}
 $farms=$config.GetSection('webFarms').GetCollection();foreach($f in $farms){if($f.GetAttributeValue('name') -ieq $Profile.farmName){throw 'Browser IIS farm collision'}}
 $pool=$Manager.ApplicationPools.Add($Profile.poolName);$pool.ManagedRuntimeVersion=''
 $application=$site.Applications.Add($Profile.basePath,$Profile.physicalPath);$application.ApplicationPoolName=$Profile.poolName
 $farm=$farms.CreateElement('webFarm');$farm.SetAttributeValue('name',$Profile.farmName)
 $protocol=$farm.GetChildElement('applicationRequestRouting').GetChildElement('protocol');$protocol.SetAttributeValue('preserveHostHeader',$false);$protocol.SetAttributeValue('reverseRewriteHostInResponseHeaders',$false);$protocol.SetAttributeValue('timeout',[TimeSpan]::FromSeconds(30))
 $upstream=[Uri]$Profile.upstreamOrigin;$backends=$farm.GetCollection();$backend=$backends.CreateElement('server');$backend.SetAttributeValue('address',$upstream.Host);$backend.GetChildElement('applicationRequestRouting').SetAttributeValue('httpPort',[uint32]$upstream.Port);$backends.Add($backend);$farms.Add($farm)
 $location=$Profile.siteName+$Profile.basePath
 $config.GetSection('system.webServer/httpErrors',$location).SetAttributeValue('existingResponse','PassThrough')
 $rules=$config.GetSection('system.webServer/rewrite/rules',$location).GetCollection();$rules.Clear()
 if($Profile.httpsOnly -or $Profile.allowedClients.Count){
  $deny=$rules.CreateElement('rule');$deny.SetAttributeValue('name','Browser entry transport boundary');$deny.SetAttributeValue('stopProcessing',$true);$deny.GetChildElement('match').SetAttributeValue('url','(.*)')
  $conditions=$deny.GetChildElement('conditions');$conditions.SetAttributeValue('logicalGrouping','MatchAny');$conditions=$conditions.GetCollection()
  if($Profile.httpsOnly){$condition=$conditions.CreateElement('add');$condition.SetAttributeValue('input','{HTTPS}');$condition.SetAttributeValue('pattern','^OFF$');$conditions.Add($condition)}
  if($Profile.allowedClients.Count){$condition=$conditions.CreateElement('add');$condition.SetAttributeValue('input','{REMOTE_ADDR}');$condition.SetAttributeValue('pattern',('^(?:'+((@($Profile.allowedClients|ForEach-Object{[regex]::Escape($_)}))-join '|')+')$'));$condition.SetAttributeValue('negate',$true);$conditions.Add($condition)}
  $action=$deny.GetChildElement('action');$action.SetAttributeValue('type','CustomResponse');$action.SetAttributeValue('statusCode',[uint32]403);$action.SetAttributeValue('statusReason','Forbidden');$action.SetAttributeValue('statusDescription','Browser entry transport boundary');$rules.Add($deny)
 }
 $rule=$rules.CreateElement('rule');$rule.SetAttributeValue('name','Browser entry proxy');$rule.SetAttributeValue('stopProcessing',$true);$rule.GetChildElement('match').SetAttributeValue('url','(.*)')
 $action=$rule.GetChildElement('action');$action.SetAttributeValue('type','Rewrite');$action.SetAttributeValue('url',('http://'+$Profile.farmName+$Profile.basePath+'/{R:1}'));$action.SetAttributeValue('appendQueryString',$true);$rules.Add($rule)
}

function Remove-BrowserEntryIisModel($Manager,$Profile) {
 $site=$Manager.Sites[$Profile.siteName];$app=$site.Applications[$Profile.basePath]
 if(-not $app -or $app.ApplicationPoolName -cne $Profile.poolName -or $app.VirtualDirectories['/'].PhysicalPath -ine $Profile.physicalPath){throw 'Browser IIS recovery ownership differs'}
 [void]$site.Applications.Remove($app);$config=$Manager.GetApplicationHostConfiguration();$config.RemoveLocationPath($Profile.siteName+$Profile.basePath)
 $pool=$Manager.ApplicationPools[$Profile.poolName];if(-not $pool){throw 'Browser IIS recovery pool missing'};[void]$Manager.ApplicationPools.Remove($pool)
 $farms=$config.GetSection('webFarms').GetCollection();foreach($farm in @($farms)){if($farm.GetAttributeValue('name') -ceq $Profile.farmName){[void]$farms.Remove($farm)}}
}

Export-ModuleMember -Function Test-BrowserEntryIisProfile,Get-BrowserEntryIisFingerprint,Add-BrowserEntryIisModel,Remove-BrowserEntryIisModel
