#requires -Version 5.1
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
Import-Module (Join-Path $PSScriptRoot 'RepositoryPicker.psm1') -Force
try {
 $inputText=[Console]::In.ReadToEnd()
 if($inputText.Length -gt 4096){throw 'Request capacity'}
 $request=$inputText|ConvertFrom-Json
 $selection=$request.selection
 if($selection.requestId -cnotmatch '^fp_[a-f0-9]{32}$' -or $selection.status -cne 'choosing'){throw 'Invalid folder request'}
 $expires=[DateTimeOffset]::Parse($selection.expiresAt)
 if($expires -le [DateTimeOffset]::UtcNow -or $expires -gt [DateTimeOffset]::UtcNow.AddSeconds(95)){throw 'Folder request expired'}
  $source=Set-FrevOSRepository -InstallRoot $PSScriptRoot -Selection $selection -Repository ([string]$request.repository)
  @{status='selected';source=$source}|ConvertTo-Json -Compress
} catch {
 $message=$_.Exception.GetBaseException().Message
 $code=if($message -eq 'Choose the Git checkout root'){'folder-not-git'}elseif($message -in @('Folder does not match this project repository','Repository origin unavailable')){'folder-wrong-repository'}elseif($_.Exception.GetBaseException() -is [UnauthorizedAccessException]){'folder-inaccessible'}else{'folder-selection-unavailable'}
 @{status='failed';errorCode=$code}|ConvertTo-Json -Compress;exit 0
}
