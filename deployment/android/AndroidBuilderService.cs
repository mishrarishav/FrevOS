using System;
using System.Diagnostics;
using System.IO;
using System.ServiceProcess;
using System.Security.Principal;
using System.Collections.Generic;
using System.Text.RegularExpressions;

// SCM starts only this installed operator runner; requests contain no command line.
public sealed class AndroidBuilderService : ServiceBase {
    private Process worker;
    private bool stopping;
    private string results;
    private readonly object gate = new object();
    private readonly HashSet<string> codes = new HashSet<string>();
    private string startupError;
    private void Record(string stage, int exitCode) {
        try { lock(gate) {
            string temporary = Path.Combine(results,"service-process.json.tmp");
            string sid = WindowsIdentity.GetCurrent().User.Value;
            bool admin = new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator);
            string flags = String.Join("\",\"", codes);
            string safeError=(startupError??"").Replace("\\","\\\\").Replace("\"","\\\"").Replace("\r","").Replace("\n","");
            string record = "{\"version\":1,\"stage\":\""+stage+"\",\"exitCode\":"+exitCode+",\"actorSid\":\""+sid+"\",\"administrator\":"+(admin?"true":"false")+",\"codes\":["+(flags.Length==0?"":"\""+flags+"\"")+"],\"bootstrapError\":\""+safeError+"\",\"at\":\""+DateTime.UtcNow.ToString("o")+"\"}";
            File.WriteAllText(temporary,record);
            string target=Path.Combine(results,"service-process.json");
            if(File.Exists(target)) File.Replace(temporary,target,null); else File.Move(temporary,target);
        }} catch { /* Diagnostics never widen permissions or emit child output. */ }
    }
    private void Classify(string line) {
        if(line==null) return;
        lock(gate) {
            // Only before any signing identity or request exists. Never retain
            // compiler output, credentials or a raw SDK child stream.
            if(startupError==null && line.IndexOf("Error",StringComparison.Ordinal)>=0 &&
               !File.Exists(Path.Combine(results,"..","private","signing-password.dpapi")) &&
               Directory.GetFiles(Path.Combine(results,"..","requests"),"ab_*.json").Length==0) {
                string safe=Regex.Replace(line,@"'[^']*'|""[^""]*""|[A-Za-z0-9_+/=\-]{24,}","[redacted]");
                startupError=safe.Length>240?safe.Substring(0,240):safe;
            }
            foreach(string code in new[]{"Access is denied","UnauthorizedAccessException","PSSecurityException","not digitally signed","running scripts is disabled","cannot be loaded","Add-Type","ParserError","cannot find","out of memory","EPERM","EACCES","ENOENT","MethodInvocationException","operation not permitted","argument","does not exist","Error","Exception","drive","script","not recognized","Node.js"}) {
                if(line.IndexOf(code,StringComparison.OrdinalIgnoreCase)>=0) codes.Add(code);
            }
        }
    }
    public AndroidBuilderService() { ServiceName = "DevSetuAndroidBuilder"; CanStop = true; }
    protected override void OnStart(string[] args) {
        string root = Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location);
        results=Path.GetFullPath(Path.Combine(root,"..","results"));
        Record("starting",0);
        var start = new ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell\\v1.0\\powershell.exe"));
        start.Arguments = "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File \"" + Path.Combine(root, "Run-AndroidBuilder.ps1") + "\"";
        start.UseShellExecute = false; start.CreateNoWindow = true;
        start.RedirectStandardOutput=true;start.RedirectStandardError=true;
        worker=new Process();worker.StartInfo=start;
        worker.OutputDataReceived+=(sender,eventArgs)=>Classify(eventArgs.Data);
        worker.ErrorDataReceived+=(sender,eventArgs)=>Classify(eventArgs.Data);
        worker.EnableRaisingEvents=true;
        Process started=worker;
        worker.Exited+=(sender,eventArgs)=>{try{started.WaitForExit();Record("child-exited",started.ExitCode);}catch{Record("child-exited",-1);}if(!stopping)System.Threading.ThreadPool.QueueUserWorkItem(ignore=>{try{Stop();}catch{}});};
        worker.Start();worker.BeginOutputReadLine();worker.BeginErrorReadLine();
    }
    protected override void OnStop() {
        stopping=true;
        if (worker != null) { try { if (!worker.HasExited) worker.Kill(); } finally { worker.Dispose(); worker = null; } }
    }
    public static void Main() { ServiceBase.Run(new AndroidBuilderService()); }
}
