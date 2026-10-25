"use strict";
const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os"),
  { spawn } = require("node:child_process"),
  { pathToFileURL } = require("node:url");
async function protect(directory, install = false) {
  if (process.platform !== "win32") {
    await fs.chmod(directory, 0o700);
    return;
  }
  const native = path.join(__dirname, "FrevOS.FolderPicker.exe");
  try {
    await fs.access(native);
  } catch {
    if (install) throw Error("setup-native-helper-unavailable");
    return new Promise((resolve, reject) => {
      const c = spawn(
        path.join(process.env.WINDIR, "System32/WindowsPowerShell/v1.0/powershell.exe"),
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "RemoteSigned",
          "-File",
          path.join(__dirname, "Protect-SetupSession.ps1"),
        ],
        { windowsHide: true, stdio: ["pipe", "ignore", "ignore"] },
      );
      c.once("error", () => reject(Error("setup-session-protection-unavailable")));
      c.once("exit", (v) =>
        v === 0 ? resolve() : reject(Error("setup-session-protection-unavailable")),
      );
      c.stdin.on("error", () => {});
      c.stdin.end(directory);
    });
  }
  await new Promise((resolve, reject) => {
    const c = spawn(native, [install ? "--protect-install" : "--protect-setup"], {
      windowsHide: true,
      stdio: ["pipe", "ignore", "ignore"],
    });
    c.once("error", () => reject(Error("setup-session-protection-unavailable")));
    c.once("exit", (v) =>
      v === 0 ? resolve() : reject(Error("setup-session-protection-unavailable")),
    );
    c.stdin.on("error", () => {});
    c.stdin.end(directory);
  });
}
async function entry(origin, token) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "devsetu-setup-"));
  const cleanup = async () => {
    const real = await fs.realpath(directory);
    if (
      path.dirname(real) !== (await fs.realpath(os.tmpdir())) ||
      !/^devsetu-setup-[A-Za-z0-9]+$/.test(path.basename(real))
    )
      throw Error("setup-cleanup-scope");
    await fs.rm(real, { recursive: true, force: true });
  };
  try {
    await protect(directory);
    const file = path.join(directory, "setup.html");
    await fs.writeFile(
      file,
      '<!doctype html><meta charset="utf-8"><title>DevSetu setup</title><form method="post" action="' +
        origin +
        '/bootstrap"><input type="hidden" name="session" value="' +
        token +
        '"><button>Open DevSetu setup</button></form><script>document.forms[0].submit()</script>',
      { flag: "wx", mode: 0o600 },
    );
    return {
      directory,
      url: pathToFileURL(file).href,
      close: cleanup,
    };
  } catch (e) {
    await cleanup().catch(() => {});
    throw e;
  }
}
function open(url) {
  const child = spawn(
    process.platform === "win32"
      ? path.join(process.env.WINDIR, "System32/rundll32.exe")
      : "xdg-open",
    process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url],
    { windowsHide: true, stdio: "ignore" },
  );
  child.on("error", () => {});
}
module.exports = { protect, entry, open };
