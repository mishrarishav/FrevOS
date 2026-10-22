Set-StrictMode -Version Latest
function Initialize-ServixBuildGroup {
 if(-not ('ServixBuildGroup' -as [type])){
  Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class ServixBuildGroup {
 [StructLayout(LayoutKind.Sequential)] struct Basic {
  public long ProcessTime, JobTime; public uint Flags;
  public UIntPtr MinWorkingSet, MaxWorkingSet; public uint ActiveProcesses;
  public UIntPtr Affinity; public uint Priority, Scheduling;
 }
 [StructLayout(LayoutKind.Sequential)] struct Counters { public ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes; }
 [StructLayout(LayoutKind.Sequential)] struct Limits {
  public Basic Basic; public Counters Counters;
  public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
 }
 [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr security, string name);
 [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job, int kind, IntPtr info, uint size);
 [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
 [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 // Unnamed, non-inherited handle stays owned by this build controller. The OS
 // closes it on controller exit, terminating every member, including descendants.
 static IntPtr owned = IntPtr.Zero;
 public static void Own() {
  if(owned != IntPtr.Zero) return;
  IntPtr job=CreateJobObject(IntPtr.Zero,null);
  if(job==IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
  Limits limits=new Limits(); limits.Basic.Flags=0x2000;
  int size=Marshal.SizeOf(typeof(Limits)); IntPtr data=Marshal.AllocHGlobal(size);
  try {
   Marshal.StructureToPtr(limits,data,false);
   if(!SetInformationJobObject(job,9,data,(uint)size) || !AssignProcessToJobObject(job,GetCurrentProcess())) throw new Win32Exception(Marshal.GetLastWin32Error());
   owned=job;
  } catch { CloseHandle(job); throw; }
  finally { Marshal.FreeHGlobal(data); }
 }
}
'@
 }
 [ServixBuildGroup]::Own()
}
function Invoke-ServixBuildProcess([string]$Executable,[string]$Arguments,[string]$Directory,[string]$Log,[int]$TimeoutSeconds){
 $info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=$Executable;$info.Arguments=$Arguments;$info.WorkingDirectory=$Directory
 $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
 $child=[Diagnostics.Process]::new();$child.StartInfo=$info
 $outFile=[IO.File]::Open($Log,[IO.FileMode]::CreateNew)
 $errFile=[IO.File]::Open(($Log+'.stderr'),[IO.FileMode]::CreateNew)
 try{
  [void]$child.Start()
  $out=$child.StandardOutput.BaseStream.CopyToAsync($outFile);$err=$child.StandardError.BaseStream.CopyToAsync($errFile)
  if(-not $child.WaitForExit($TimeoutSeconds*1000)){$child.Kill();throw [TimeoutException]::new('Build process deadline exceeded')}
  [void]$out.GetAwaiter().GetResult();[void]$err.GetAwaiter().GetResult()
  return $child.ExitCode
 }finally{$child.Dispose();$outFile.Dispose();$errFile.Dispose()}
}
Export-ModuleMember -Function Initialize-ServixBuildGroup,Invoke-ServixBuildProcess
