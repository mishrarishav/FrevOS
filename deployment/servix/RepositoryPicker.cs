using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using System.Runtime.InteropServices;

// A Windows GUI executable owns the interactive window. It receives no credential
// and only returns a locally chosen path; the installed connector validates it.
internal static class RepositoryPicker
{
    [DllImport("user32.dll", SetLastError=true)] private static extern IntPtr OpenInputDesktop(uint flags, bool inherit, uint access);
    [DllImport("user32.dll")] private static extern IntPtr GetThreadDesktop(uint threadId);
    [DllImport("user32.dll")] private static extern IntPtr GetProcessWindowStation();
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
    [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)] private static extern bool GetUserObjectInformation(IntPtr handle, int index, StringBuilder value, int length, out int needed);
    [DllImport("user32.dll")] private static extern bool CloseDesktop(IntPtr desktop);
    private static bool HasName(IntPtr handle, string expected)
    {
        var name = new StringBuilder(256); int needed;
        return handle != IntPtr.Zero && GetUserObjectInformation(handle, 2, name, 512, out needed) && name.ToString() == expected;
    }
    private static void RequireNativeDesktop()
    {
        if (!Environment.UserInteractive || System.Diagnostics.Process.GetCurrentProcess().SessionId == 0) throw new InvalidOperationException();
        var desktop = OpenInputDesktop(0, false, 0x0083);
        if (desktop == IntPtr.Zero) throw new InvalidOperationException();
        try
        {
            // An interactive connector already inherits this desktop. Reassigning
            // a thread after framework initialization can fail with ERROR_BUSY.
            if (!HasName(desktop, "Default") || !HasName(GetThreadDesktop(GetCurrentThreadId()), "Default") || !HasName(GetProcessWindowStation(), "WinSta0")) throw new InvalidOperationException();
        }
        finally { CloseDesktop(desktop); }
        // No desktop switch, elevation, ACL change or lock-screen interaction.
    }
    [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellItem
    {
        void BindToHandler(IntPtr bind, ref Guid handler, ref Guid iid, out IntPtr value);
        void GetParent(out IShellItem parent);
        void GetDisplayName(uint kind, out IntPtr name);
        void GetAttributes(uint mask, out uint attributes);
        void Compare(IShellItem other, uint hint, out int order);
    }
    [ComImport, Guid("42F85136-DB7E-439C-85F1-E4075D135FC8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IFolderDialog
    {
        [PreserveSig] int Show(IntPtr owner);
        void SetFileTypes(uint count, IntPtr types);
        void SetFileTypeIndex(uint index);
        void GetFileTypeIndex(out uint index);
        void Advise(IntPtr events, out uint cookie);
        void Unadvise(uint cookie);
        void SetOptions(uint options);
        void GetOptions(out uint options);
        void SetDefaultFolder(IShellItem folder);
        void SetFolder(IShellItem folder);
        void GetFolder(out IShellItem folder);
        void GetCurrentSelection(out IShellItem item);
        void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string name);
        void GetFileName(out IntPtr name);
        void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
        void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
        void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
        void GetResult(out IShellItem result);
        void AddPlace(IShellItem item, uint location);
        void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string extension);
        void Close(int result);
        void SetClientGuid(ref Guid client);
        void ClearClientData();
        void SetFilter(IntPtr filter);
    }
    [DllImport("shell32.dll", CharSet=CharSet.Unicode, PreserveSig=true)]
    private static extern int SHCreateItemFromParsingName(string path, IntPtr bind, ref Guid iid, out IShellItem item);
    private static string PickNativeFolder()
    {
        var dialog = (IFolderDialog)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")));
        IShellItem initial = null, result = null;
        try
        {
            uint options; dialog.GetOptions(out options);
            dialog.SetOptions(options | 0x20u | 0x40u | 0x800u | 0x8u | 0x02000000u);
            dialog.SetTitle("DevSetu - Choose folder"); dialog.SetOkButtonLabel("Choose folder");
            var iid = typeof(IShellItem).GUID;
            if (SHCreateItemFromParsingName(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), IntPtr.Zero, ref iid, out initial) >= 0) dialog.SetFolder(initial);
            int status = dialog.Show(IntPtr.Zero);
            if (status == unchecked((int)0x800704C7)) return null;
            Marshal.ThrowExceptionForHR(status);
            dialog.GetResult(out result); IntPtr value; result.GetDisplayName(0x80058000, out value);
            try { return Marshal.PtrToStringUni(value); } finally { Marshal.FreeCoTaskMem(value); }
        }
        finally { if(result != null) Marshal.ReleaseComObject(result); if(initial != null) Marshal.ReleaseComObject(initial); Marshal.ReleaseComObject(dialog); }
    }
    [STAThread]
    private static void Main(string[] args)
    {
        if (args.Length == 1 && (args[0] == "--protect-setup" || args[0] == "--protect-install"))
        {
            try {
                string inputPath;
                using (var reader = new System.IO.StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false))) inputPath = reader.ReadToEnd();
                var target = System.IO.Path.GetFullPath(inputPath);
                var temp = System.IO.Path.GetFullPath(System.IO.Path.GetTempPath()).TrimEnd('\\');
                var installRoot = System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"FrevOS","Connector");
                var expectedParent = args[0] == "--protect-install" ? installRoot : temp;
                var pattern = args[0] == "--protect-install" ? "^fc_[a-f0-9]{32}$" : "^devsetu-setup-[A-Za-z0-9]+$";
                if (!String.Equals(System.IO.Path.GetDirectoryName(target).TrimEnd('\\'), expectedParent.TrimEnd('\\'), StringComparison.OrdinalIgnoreCase) || !System.Text.RegularExpressions.Regex.IsMatch(System.IO.Path.GetFileName(target), pattern)) Environment.Exit(1);
                var directory = new System.IO.DirectoryInfo(target);
                if (!directory.Exists || (directory.Attributes & System.IO.FileAttributes.ReparsePoint) != 0) Environment.Exit(1);
                var owner = System.Security.Principal.WindowsIdentity.GetCurrent().User;
                var acl = new System.Security.AccessControl.DirectorySecurity();
                acl.SetOwner(owner); acl.SetAccessRuleProtection(true,false);
                foreach (var sid in new[] {owner,new System.Security.Principal.SecurityIdentifier("S-1-5-18")}) acl.AddAccessRule(new System.Security.AccessControl.FileSystemAccessRule(sid,System.Security.AccessControl.FileSystemRights.FullControl,System.Security.AccessControl.InheritanceFlags.ContainerInherit|System.Security.AccessControl.InheritanceFlags.ObjectInherit,System.Security.AccessControl.PropagationFlags.None,System.Security.AccessControl.AccessControlType.Allow));
                directory.SetAccessControl(acl); Environment.Exit(0);
            } catch { Environment.Exit(1); }
            return;
        }
        var output = new System.IO.StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false));
        output.AutoFlush = true;
        var serializer = new JavaScriptSerializer { MaxJsonLength = 4096 };
        try
        {
            string input;
            using (var reader = new System.IO.StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false))) input = reader.ReadToEnd();
            if (input.Length > 4096) throw new InvalidOperationException();
            var request = serializer.Deserialize<Dictionary<string, object>>(input);
            if (request.Count != 4 || Convert.ToInt32(request["version"], CultureInfo.InvariantCulture) != 1)
                throw new InvalidOperationException();
            var profile = (string)request["profileId"];
            var repository = (string)request["repository"];
            var expires = DateTimeOffset.Parse((string)request["expiresAt"], CultureInfo.InvariantCulture);
            if (profile.Length > 64 || repository.Length > 240 || expires <= DateTimeOffset.UtcNow || expires > DateTimeOffset.UtcNow.AddSeconds(95))
                throw new InvalidOperationException();
            if (args.Length == 1 && args[0] == "--choose-folder") RequireNativeDesktop();
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            if (args.Length == 1 && args[0] == "--choose-folder")
            {
                if (!Environment.UserInteractive || System.Diagnostics.Process.GetCurrentProcess().SessionId == 0)
                    throw new InvalidOperationException();
                var folderChoice = PickNativeFolder();
                output.WriteLine(serializer.Serialize(folderChoice != null && DateTimeOffset.UtcNow < expires
                    ? new Dictionary<string, object> { { "status", "selected" }, { "repository", folderChoice } }
                    : new Dictionary<string, object> { { "status", "cancelled" } }));
                return;
            }
            using (var form = new Form())
            using (var timer = new Timer())
            {
                form.Text = "DevSetu - Choose source folder";
                form.ClientSize = new System.Drawing.Size(600, 205);
                form.StartPosition = FormStartPosition.CenterScreen;
                form.FormBorderStyle = FormBorderStyle.FixedDialog;
                form.MaximizeBox = false;
                form.MinimizeBox = false;
                form.TopMost = true;
                var title = new Label { Text = "Connect the Git checkout for " + profile, AutoSize = false };
                title.SetBounds(18, 16, 565, 25);
                var hint = new Label { Text = "Existing files and Git history will stay in place.", AutoSize = false };
                hint.SetBounds(18, 43, 565, 25);
                var folder = new TextBox { Text = repository, MaxLength = 240, AccessibleName = "Local Git folder" };
                folder.SetBounds(18, 80, 455, 26);
                var browse = new Button { Text = "Browse..." };
                browse.SetBounds(482, 78, 100, 30);
                browse.Click += delegate
                {
                    using (var dialog = new FolderBrowserDialog())
                    {
                        dialog.Description = "Choose this project's Git checkout root";
                        dialog.SelectedPath = folder.Text;
                        dialog.ShowNewFolderButton = false;
                        if (dialog.ShowDialog(form) == DialogResult.OK) folder.Text = dialog.SelectedPath;
                    }
                };
                var countdown = new Label { AutoSize = false };
                countdown.SetBounds(18, 120, 565, 25);
                var cancel = new Button { Text = "Cancel", DialogResult = DialogResult.Cancel };
                cancel.SetBounds(356, 158, 100, 30);
                var connect = new Button { Text = "Use this folder", DialogResult = DialogResult.OK };
                connect.SetBounds(466, 158, 116, 30);
                form.AcceptButton = connect;
                form.CancelButton = cancel;
                form.Controls.AddRange(new Control[] { title, hint, folder, browse, countdown, cancel, connect });
                timer.Interval = 250;
                timer.Tick += delegate
                {
                    var remaining = (int)Math.Ceiling((expires - DateTimeOffset.UtcNow).TotalSeconds);
                    countdown.Text = "Request expires in " + Math.Max(0, remaining) + " seconds.";
                    if (remaining <= 0) { form.DialogResult = DialogResult.Cancel; form.Close(); }
                };
                timer.Start();
                var result = form.ShowDialog();
                timer.Stop();
                output.WriteLine(serializer.Serialize(result == DialogResult.OK && DateTimeOffset.UtcNow < expires
                    ? new Dictionary<string, object> { { "status", "selected" }, { "repository", folder.Text } }
                    : new Dictionary<string, object> { { "status", "cancelled" } }));
            }
        }
        catch { output.WriteLine("{\"status\":\"failed\"}"); }
        finally { output.Dispose(); }
    }
}
