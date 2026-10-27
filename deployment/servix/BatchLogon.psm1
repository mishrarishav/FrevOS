Set-StrictMode -Version Latest
function Initialize-BatchLogonApi {
 if('DevSetuBatchLogon' -as [type]){return}
 Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Security.Principal;
public static class DevSetuBatchLogon {
 [StructLayout(LayoutKind.Sequential)] struct OA { public uint Length; public IntPtr RootDirectory,ObjectName; public uint Attributes; public IntPtr SecurityDescriptor,SecurityQualityOfService; }
 [StructLayout(LayoutKind.Sequential)] struct US { public ushort Length,MaximumLength; public IntPtr Buffer; }
 [DllImport("advapi32.dll")] static extern uint LsaOpenPolicy(IntPtr name,ref OA attributes,uint access,out IntPtr handle);
 [DllImport("advapi32.dll")] static extern uint LsaEnumerateAccountRights(IntPtr policy,byte[] sid,out IntPtr rights,out uint count);
 [DllImport("advapi32.dll")] static extern uint LsaAddAccountRights(IntPtr policy,byte[] sid,US[] rights,uint count);
 [DllImport("advapi32.dll")] static extern uint LsaFreeMemory(IntPtr memory);
 [DllImport("advapi32.dll")] static extern uint LsaClose(IntPtr policy);
 [DllImport("advapi32.dll")] static extern uint LsaNtStatusToWinError(uint status);
 static byte[] Sid(string value){var s=new SecurityIdentifier(value);var b=new byte[s.BinaryLength];s.GetBinaryForm(b,0);return b;}
 public static string[] Rights(string sid){
  var oa=new OA();oa.Length=(uint)Marshal.SizeOf(oa);IntPtr policy;uint status=LsaOpenPolicy(IntPtr.Zero,ref oa,0x800,out policy);
  if(status!=0)throw new InvalidOperationException("Policy read unavailable");
  IntPtr buffer=IntPtr.Zero;try {uint count;status=LsaEnumerateAccountRights(policy,Sid(sid),out buffer,out count);
   if(status==0xc0000034 || status==0x8000001a)return new string[0];if(status!=0)throw new InvalidOperationException("Account rights unavailable: "+status.ToString("X8"));
   var result=new List<string>();int size=Marshal.SizeOf(typeof(US));for(int i=0;i<count;i++){var item=(US)Marshal.PtrToStructure(IntPtr.Add(buffer,i*size),typeof(US));result.Add(Marshal.PtrToStringUni(item.Buffer,item.Length/2));}return result.ToArray();
  }finally{if(buffer!=IntPtr.Zero)LsaFreeMemory(buffer);LsaClose(policy);}
 }
 public static void Grant(string sid){
  var oa=new OA();oa.Length=(uint)Marshal.SizeOf(oa);IntPtr policy;uint status=LsaOpenPolicy(IntPtr.Zero,ref oa,0x810,out policy);if(status!=0)throw new InvalidOperationException("Policy update unavailable");
  const string value="SeBatchLogonRight";IntPtr text=Marshal.StringToHGlobalUni(value);try {var right=new US{Length=(ushort)(value.Length*2),MaximumLength=(ushort)((value.Length+1)*2),Buffer=text};status=LsaAddAccountRights(policy,Sid(sid),new[]{right},1);if(status!=0)throw new InvalidOperationException("Batch right update denied");}finally{Marshal.FreeHGlobal(text);LsaClose(policy);}
 }
}
'@
}
function Get-CurrentBatchLogon {
 Initialize-BatchLogonApi
 $identity=[Security.Principal.WindowsIdentity]::GetCurrent();$allowed=$false;$denied=$false
 foreach($sid in @($identity.User.Value)+@($identity.Groups|ForEach-Object {$_.Value})){
  $rights=[DevSetuBatchLogon]::Rights($sid)
  if($rights -contains 'SeBatchLogonRight'){$allowed=$true}
  if($rights -contains 'SeDenyBatchLogonRight'){$denied=$true}
 }
 return @{allowed=$allowed;denied=$denied;ready=($allowed -and -not $denied);ownerSid=$identity.User.Value;ownerName=$identity.Name}
}
function Grant-CurrentBatchLogon([string]$ExpectedSid,[bool]$Approved){
 $state=Get-CurrentBatchLogon
 if($state.ownerSid -cne $ExpectedSid -or $state.denied){throw 'Runtime owner or deny right differs'}
 if(-not $state.allowed){if(-not $Approved){throw 'Explicit batch-logon approval required'};[DevSetuBatchLogon]::Grant($ExpectedSid)}
 $after=Get-CurrentBatchLogon;if(-not $after.ready){throw 'Batch-logon remains unavailable'}
 return @{assigned=(-not $state.allowed);ownerSid=$ExpectedSid}
}
Export-ModuleMember -Function Get-CurrentBatchLogon,Grant-CurrentBatchLogon
