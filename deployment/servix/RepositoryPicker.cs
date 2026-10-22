using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;

// A Windows GUI executable owns the interactive window. It receives no credential
// and only returns a locally chosen path; the installed connector validates it.
internal static class RepositoryPicker
{
    [STAThread]
    private static void Main()
    {
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
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
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
