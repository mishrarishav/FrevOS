param([string]$Action,[string]$ManifestSha256,[string]$ArchiveSha256,[string]$ActorSid)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$report=[ordered]@{host=$env:COMPUTERNAME;action=$Action;manifestSha256=$ManifestSha256;databaseWritten=$false;status='FAIL'}
function Set-ServixAcl([string]$Path,[string]$LocalRights='ReadAndExecute'){
 $acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetAccessRuleProtection($true,$false)
 foreach($sid in @('S-1-5-18','S-1-5-32-544',$ActorSid)){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))}
 if($LocalRights){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-19'),$LocalRights,'ContainerInherit,ObjectInherit','None','Allow'))}
 Set-Acl -LiteralPath $Path -AclObject $acl
}
try{
 if($env:COMPUTERNAME -cne 'DCAPP7'){throw 'Wrong Git server'}
 $root='E:\FrevOS\servix'
 if(Test-Path -LiteralPath $root){throw 'Existing Servix controller profile must be inspected before provisioning'}
 [void][IO.Directory]::CreateDirectory($root);Set-ServixAcl $root
 foreach($name in @('jobs','builds','requests','npm-cache')){[void][IO.Directory]::CreateDirectory((Join-Path $root $name));Set-ServixAcl (Join-Path $root $name) 'Modify'}
 foreach($name in @('results','private','private\claims')){[void][IO.Directory]::CreateDirectory((Join-Path $root $name));Set-ServixAcl (Join-Path $root $name) $(if($name -eq 'results'){'ReadAndExecute'}else{''})}
 $transport=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'transport.json') -Raw|ConvertFrom-Json
 if($transport.host -cne '10.9.69.21'){throw 'Wrong target credential binding'}
 $credential=[pscredential]::new($transport.username,(ConvertTo-SecureString -String $transport.password -AsPlainText -Force));$transport=$null
 $credential|Export-Clixml -LiteralPath (Join-Path $root 'private\server21.credential.xml')
 Remove-Item -LiteralPath (Join-Path $PSScriptRoot 'transport.json')
 $trusted=[string](Get-Item WSMan:\localhost\Client\TrustedHosts).Value
 if($trusted -ne '*' -and '10.9.69.21' -notin @($trusted.Split(',')|ForEach-Object {$_.Trim()})){
  [IO.File]::WriteAllText((Join-Path $root 'private\trusted-hosts-before.txt'),$trusted)
  $updated=if($trusted){$trusted+',10.9.69.21'}else{'10.9.69.21'}
  Set-Item WSMan:\localhost\Client\TrustedHosts -Value $updated -Force
  $report.trustedHostAdded='10.9.69.21'
 }
 $session=New-PSSession -ComputerName '10.9.69.21' -Port 5985 -Authentication Negotiate -Credential $credential -SessionOption (New-PSSessionOption -OpenTimeout 12000)
 try{
  $identity=Invoke-Command -Session $session -ScriptBlock {
   if($env:COMPUTERNAME -cne 'DCAPP9'){throw 'Wrong development machine'}
   $health=Invoke-RestMethod 'http://127.0.0.1:5001/api/health' -TimeoutSec 5
   @{computer=$env:COMPUTERNAME;health=$health.status;developmentTask=(Get-ScheduledTask -TaskName 'ServixDev-FrevOS-Backend').State.ToString();productionListener=(Get-NetTCPConnection -State Listen -LocalPort 5000|Select-Object -First 1).OwningProcess}
  }
  if($identity.computer -cne 'DCAPP9' -or $identity.health -cne 'OK'){throw 'Target development readiness failed'}
  $report.target=@{computer=$identity.computer;health=$identity.health;productionPid=$identity.productionListener}
 }finally{Remove-PSSession $session;$credential=$null}
 $git='C:\Program Files\Git\cmd\git.exe';$repo='E:\FrevOS\git\servix.git'
 if(Test-Path -LiteralPath $repo){throw 'Existing Git repository collision'}
 [void][IO.Directory]::CreateDirectory($repo);Set-ServixAcl $repo
 & $git init --bare --initial-branch=frevos-dev $repo *> (Join-Path $root 'private\git-init.log')
 if($LASTEXITCODE -ne 0){throw 'Git initialization failed'}
 & $git ('--git-dir='+$repo) config receive.denyNonFastForwards true
 & $git ('--git-dir='+$repo) config receive.denyDeletes true
 & $git ('--git-dir='+$repo) config frevos.repositoryId gitrepo_6cb7e163f807493fa37963196c49fbac
 $report.gitRepository=$repo;$report.buildIdentity='LOCAL SERVICE';$report.activationIdentity='SYSTEM';$report.status='PASS'
}catch{$report.errorType=$_.Exception.GetType().Name;$report.errorLine=$_.InvocationInfo.ScriptLineNumber;$report.errorId=$_.FullyQualifiedErrorId}
finally{if(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'transport.json')){Remove-Item -LiteralPath (Join-Path $PSScriptRoot 'transport.json')}}
[IO.File]::WriteAllText((Join-Path $PSScriptRoot ('result-'+$Action.ToLowerInvariant()+'.json')),($report|ConvertTo-Json -Depth 6),[Text.UTF8Encoding]::new($false))
