Set-StrictMode -Version Latest
function Write-ServixResult([string]$Path,$Value){
 $temp=$Path+'.'+[guid]::NewGuid().ToString('N')+'.tmp'
 $stream=[IO.File]::Open($temp,[IO.FileMode]::CreateNew)
 try{$bytes=[Text.UTF8Encoding]::new($false).GetBytes(($Value|ConvertTo-Json -Depth 8));$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
 # Windows PowerShell 5.1 converts an untyped $null string argument to an
 # empty path. Keep one explicit previous file instead of a null backup path.
 if(Test-Path -LiteralPath $Path){[IO.File]::Replace($temp,$Path,($Path+'.previous'))}else{[IO.File]::Move($temp,$Path)}
}
Export-ModuleMember -Function Write-ServixResult
