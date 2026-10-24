#requires -Version 5.1
$ErrorActionPreference='Stop'
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$request=[Console]::In.ReadToEnd()|ConvertFrom-Json
$seconds=[int]$request.seconds
if($seconds -lt 1 -or $seconds -gt 60){throw 'Invalid audit window'}
try{$records=@(Get-WinEvent -FilterHashtable @{LogName='Security';Id=4663;StartTime=[DateTime]::Now.AddSeconds(-$seconds)} -MaxEvents 201 -ErrorAction Stop)}catch{if($_.FullyQualifiedErrorId -like 'NoMatchingEventsFound*'){$records=@()}else{throw}}
$events=@()
foreach($record in $records|Select-Object -First 200){
 $xml=[xml]$record.ToXml();$fields=@{}
 foreach($field in $xml.Event.EventData.Data){$fields[[string]$field.Name]=[string]$field.'#text'}
 if($fields.ObjectType -cne 'File' -or -not $fields.ObjectName -or $fields.SubjectUserSid -cnotmatch '^S-[0-9-]{3,160}$'){continue}
 $mask=[Convert]::ToInt64($fields.AccessMask.Replace('0x',''),16)
 if(($mask -band 0x10106) -eq 0){continue}
 $pidValue=[Convert]::ToInt32($fields.ProcessId.Replace('0x',''),16)
 if($pidValue -le 0){continue}
 $events+=@{at=$record.TimeCreated.ToUniversalTime().ToString('o');file=$fields.ObjectName;kind=$(if($mask -band 0x10000){'deleted'}else{'modified'});user=$fields.SubjectUserSid;pid=$pidValue;process=[IO.Path]::GetFileName($fields.ProcessName);recordId=[string]$record.RecordId}
}
@{available=$true;overflow=($records.Count -gt 200);events=@($events)}|ConvertTo-Json -Depth 5 -Compress|Write-Output
