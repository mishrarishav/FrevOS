$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
$fixture=Join-Path ([IO.Path]::GetTempPath()) ('frevos-persistent-inventory-'+[guid]::NewGuid().ToString('N'))
$root=Join-Path $fixture 'application'
try{
 if($root.Contains("'")){throw 'Fixture path cannot be represented safely'}
 [void][IO.Directory]::CreateDirectory($root)
 $paths=@('backend\uploads\first.txt','backend\uploads\second.txt','backend\database\third.txt','backend\.env','backend\.env.prd','backend\attachment\sixth.txt')
 foreach($relative in $paths){$file=Join-Path $root $relative;[void][IO.Directory]::CreateDirectory((Split-Path $file));[IO.File]::WriteAllText($file,'synthetic-'+$relative)}
 # Load only the actual inventory/assertion functions. Substitute their fixed
 # compatibility root with an owned fixture; never execute the target operator.
 $errors=$null;$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'Invoke-DevTarget.ps1'),[ref]$null,[ref]$errors)
 if($errors){throw 'Operator parsing failed'}
 $functions=@($ast.FindAll({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -in @('Get-PersistentFiles','Assert-PersistentFiles')},$false))
 if($functions.Count -ne 2){throw 'Inventory function contract changed'}
 foreach($function in $functions){Invoke-Expression ($function.Extent.Text.Replace('D:\servixDev',$root))}
 $script:additionalPreservedPaths=@('backend/uploads','backend/attachment')
 $before=@(Get-PersistentFiles)
 if($before.Count -ne $paths.Count){throw 'Every distinct protected file must be inventoried; repeated selected folders must deduplicate by path'}
 Assert-PersistentFiles $before
 $changed=Join-Path $root $paths[1];$bytes=[IO.File]::ReadAllBytes($changed);[IO.File]::WriteAllText($changed,'changed synthetic attachment')
 $denied=$false;try{Assert-PersistentFiles $before}catch{$denied=$true};if(-not $denied){throw 'Changed non-first protected file was accepted'}
 [IO.File]::WriteAllBytes($changed,$bytes);Assert-PersistentFiles $before
 Remove-Item -LiteralPath (Join-Path $root $paths[2])
 $denied=$false;try{Assert-PersistentFiles $before}catch{$denied=$true};if(-not $denied){throw 'Missing non-first protected file was accepted'}
 @{status='PASS';protectedFiles=$before.Count;changedNonFirstDenied=$true;missingNonFirstDenied=$true;duplicatePathsDeduplicated=$true;actualCustomerFilesUsed=$false}|ConvertTo-Json -Compress
}finally{
 $resolved=[IO.Path]::GetFullPath($fixture);$parent=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
 if([IO.Path]::GetDirectoryName($resolved) -cne $parent -or [IO.Path]::GetFileName($resolved) -cnotmatch '^frevos-persistent-inventory-[a-f0-9]{32}$'){throw 'Fixture cleanup scope differs'}
 if(Test-Path -LiteralPath $resolved){Remove-Item -LiteralPath $resolved -Recurse -Force}
}
