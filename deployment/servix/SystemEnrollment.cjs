"use strict";
const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os"),
  http = require("node:http"),
  crypto = require("node:crypto"),
  { spawn } = require("node:child_process");
const sessionHelper = require("./SetupSession.cjs");
const runtimeFiles = [
  "node.exe",
  "Connector.cjs",
  "Preservation.cjs",
  "SystemDiscovery.cjs",
  "DiscoverySafety.cjs",
  "FileAudit.cjs",
  "Read-WindowsFileAudit.ps1",
  "FolderBrowse.cjs",
  "Browse-Folders.ps1",
  "Run-Connector.ps1",
  "BuildProcess.psm1",
  "Install-SystemConnector.ps1",
];
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
function serverOrigin(value) {
  const u = new URL(value);
  if (
    !["http:", "https:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    u.pathname !== "/"
  )
    throw Error("server-url-invalid");
  return u.origin;
}
async function plain(file) {
  for (let p = path.resolve(file); ; p = path.dirname(p)) {
    try {
      if ((await fs.lstat(p)).isSymbolicLink()) throw Error("setup-linked-path");
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    if (path.dirname(p) === p) return;
  }
}
async function installRuntime(config, options = {}) {
  if (process.platform !== "win32" && !options.installRoot) throw Error("windows-setup-required");
  const folder =
    options.installRoot || path.join(process.env.LOCALAPPDATA, "FrevOS/Connector", config.deviceId);
  const packaged = JSON.parse(
    await fs.readFile(
      path.join(options.bundle || __dirname, "system-runtime-manifest.json"),
      "utf8",
    ),
  );
  if (
    packaged.version !== 1 ||
    Object.keys(packaged.files).sort().join("|") !== [...runtimeFiles].sort().join("|")
  )
    throw Error("setup-package-integrity");
  await plain(folder);
  await fs.mkdir(folder, { recursive: true, mode: 0o700 });
  await (options.protect || sessionHelper.protect)(folder, true);
  for (const name of runtimeFiles) {
    const bytes = await fs.readFile(path.join(options.bundle || __dirname, name));
    if (sha(bytes) !== packaged.files[name]) throw Error("setup-package-integrity");
    const target = path.join(folder, name);
    try {
      await fs.writeFile(target, bytes, { flag: "wx", mode: 0o600 });
    } catch (e) {
      if (e.code !== "EEXIST" || sha(await fs.readFile(target)) !== packaged.files[name])
        throw Error("setup-installed-files-changed");
    }
  }
  const manifest = Buffer.from(JSON.stringify(packaged));
  try {
    await fs.writeFile(path.join(folder, "system-runtime-manifest.json"), manifest, {
      flag: "wx",
      mode: 0o600,
    });
  } catch (e) {
    if (
      e.code !== "EEXIST" ||
      sha(await fs.readFile(path.join(folder, "system-runtime-manifest.json"))) !== sha(manifest)
    )
      throw Error("setup-installed-files-changed");
  }
  const enrollment = {
    ...config,
    stateRoot: path.join(folder, "state"),
    runtimeManifestSha256: sha(manifest),
  };
  await new Promise((resolve, reject) => {
    const child = spawn(
      path.join(process.env.WINDIR, "System32/WindowsPowerShell/v1.0/powershell.exe"),
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "RemoteSigned",
        "-File",
        path.join(folder, "Install-SystemConnector.ps1"),
      ],
      { windowsHide: true, stdio: ["pipe", "ignore", "ignore"] },
    );
    const timer = setTimeout(() => {
      child.kill();
      reject(Error("connector-registration-timeout"));
    }, 60000);
    child.once("error", () => {
      clearTimeout(timer);
      reject(Error("connector-registration-unavailable"));
    });
    child.once("exit", (v) => {
      clearTimeout(timer);
      v === 0 ? resolve() : reject(Error("connector-registration-failed"));
    });
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify(enrollment));
  });
  return folder;
}
async function serve(options = {}) {
  const defaultsFile =
    options.defaultsFile ||
    (process.platform === "win32" && !options.install
      ? path.join(process.env.LOCALAPPDATA, "DevSetu/Setup/connection.json")
      : undefined);
  let defaults;
  try {
    if (defaultsFile) {
      await plain(defaultsFile);
      const bytes = await fs.readFile(defaultsFile);
      if (bytes.length > 4096) throw Error();
      const value = JSON.parse(bytes);
      if (
        serverOrigin(value.server) !== value.server ||
        !/^fc_[a-f0-9]{32}$/.test(value.deviceId) ||
        typeof value.username !== "string" ||
        typeof value.fileActivity !== "boolean"
      )
        throw Error();
      defaults = value;
    }
  } catch {
    /* No remembered enrollment yet. */
  }
  const remember = async (value) => {
    if (!defaultsFile) return;
    await plain(defaultsFile);
    await fs.mkdir(path.dirname(defaultsFile), { recursive: true, mode: 0o700 });
    const temporary = defaultsFile + "." + crypto.randomBytes(8).toString("hex");
    await fs.writeFile(temporary, JSON.stringify(value), { flag: "wx", mode: 0o600 });
    await fs.rename(temporary, defaultsFile);
    defaults = value;
  };
  const token = crypto.randomBytes(32).toString("hex"),
    cookie = crypto.randomBytes(32).toString("hex"),
    cookieName = "devsetu-setup-" + crypto.randomBytes(8).toString("hex");
  let origin,
    entry,
    bootstrapped = false,
    pending,
    finished = false;
  const state = {
    phase: "ready",
    message: "Sign in to connect this computer. No project or Git installation is required.",
    systemName: os.hostname(),
    online: false,
    defaults: defaults
      ? {
          server: defaults.server,
          username: defaults.username,
          fileActivity: defaults.fileActivity,
        }
      : undefined,
  };
  let busy = false;
  const expires = Date.now() + 30 * 60000,
    fetcher = options.fetch || fetch,
    install = options.install || installRuntime;
  async function enroll(body) {
    let authCookie, csrf;
    try {
      const remote = serverOrigin(body.server);
      state.defaults = { server: remote, username: body.username, fileActivity: body.fileActivity };
      state.phase = "signing-in";
      state.message = "Signing in to DevSetu…";
      const login = await fetcher(remote + "/auth/login", {
        method: "POST",
        headers: { origin: remote, "content-type": "application/json" },
        body: JSON.stringify({ username: body.username, password: body.password }),
        redirect: "manual",
        signal: AbortSignal.timeout(20000),
      });
      body.password = "";
      if (login.status !== 204) throw Error("account-sign-in-failed");
      const cookies = login.headers.getSetCookie().map((v) => v.split(";")[0]);
      csrf = cookies
        .find((v) => v.startsWith("frevos-internal-csrf="))
        ?.slice("frevos-internal-csrf=".length);
      authCookie = cookies.join("; ");
      if (!csrf) throw Error("account-session-unavailable");
      const api = async (route, input) => {
        const r = await fetcher(remote + route, {
          method: input === undefined ? "GET" : "POST",
          headers: {
            origin: remote,
            cookie: authCookie,
            "x-csrf-token": csrf,
            "content-type": "application/json",
          },
          ...(input === undefined ? {} : { body: JSON.stringify(input) }),
          redirect: "error",
          signal: AbortSignal.timeout(20000),
        });
        if (!r.ok) {
          let code;
          try {
            code = (await r.json()).error;
          } catch {}
          throw Error(
            [
              "connector-device-limit",
              "connector-access-denied",
              "workspace-access-denied",
            ].includes(code)
              ? code
              : "server-request-failed",
          );
        }
        return r.json();
      };
      if (pending && (pending.server !== remote || pending.username !== body.username))
        throw Error("retry-original-account");
      if (!pending && defaults?.server === remote && defaults.username === body.username) {
        const devices = await api("/v1/workspaces/ws_server20/connectors");
        const device = devices.find(
          (d) =>
            d.deviceId === defaults.deviceId &&
            d.mode === "system" &&
            d.status === "active" &&
            Date.parse(d.expiresAt) > Date.now(),
        );
        if (device)
          pending = {
            server: remote,
            username: body.username,
            paired: { mode: "system", deviceId: device.deviceId },
            resume: true,
          };
      }
      if (!pending) {
        state.phase = "pairing";
        state.message = "Registering this computer…";
        const paired = await api("/v1/workspaces/ws_server20/connectors/pair", {
          version: 1,
          mode: "system",
          name: os.hostname().slice(0, 80),
        });
        if (
          paired.mode !== "system" ||
          !/^fc_[a-f0-9]{32}$/.test(paired.deviceId) ||
          !new RegExp("^" + paired.deviceId + "\\.[A-Za-z0-9_-]{43}$").test(paired.credential)
        )
          throw Error("server-pairing-scope-invalid");
        pending = { server: remote, username: body.username, paired };
      }
      const paired = pending.paired;
      state.phase = "installing";
      state.message = "Saving the protected connection and starting monitoring…";
      if (pending.resume) {
        state.message = "Reconnecting the existing system enrollment…";
        if (options.resume)
          await options.resume({
            deviceId: paired.deviceId,
            server: remote,
            username: body.username,
            fileActivity: body.fileActivity,
          });
        else {
          const script = path.join(entry.directory, "Resume-SystemConnector.ps1");
          await fs.writeFile(
            script,
            await fs.readFile(path.join(__dirname, "Resume-SystemConnector.ps1")),
            { mode: 0o600 },
          );
          await new Promise((resolve, reject) => {
            const c = spawn(
              path.join(process.env.WINDIR, "System32/WindowsPowerShell/v1.0/powershell.exe"),
              [
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "RemoteSigned",
                "-File",
                script,
              ],
              { windowsHide: true, stdio: ["pipe", "ignore", "ignore"] },
            );
            const timer = setTimeout(() => {
              c.kill();
              reject(Error("existing-connection-timeout"));
            }, 45000);
            c.once("error", () => {
              clearTimeout(timer);
              reject(Error("existing-connection-unavailable"));
            });
            c.once("exit", (v) => {
              clearTimeout(timer);
              v === 0 ? resolve() : reject(Error("existing-connection-unavailable"));
            });
            c.stdin.on("error", () => {});
            c.stdin.end(
              JSON.stringify({
                deviceId: paired.deviceId,
                server: remote,
                username: body.username,
                fileActivity: body.fileActivity,
              }),
            );
          });
        }
      } else
        await install({
          version: 1,
          mode: "system",
          server: remote,
          allowInternalHttp: remote.startsWith("http:"),
          deviceId: paired.deviceId,
          credential: paired.credential,
          monitoringRoot: os.homedir(),
          fileActivity: body.fileActivity,
          accountName: body.username,
        });
      await remember({
        server: remote,
        username: body.username,
        fileActivity: body.fileActivity,
        deviceId: paired.deviceId,
      });
      if (body.fileActivity) {
        const policy = {
          ...require("./SystemDiscovery.cjs").defaultPolicy,
          enabled: true,
          contentFolders: [],
        };
        const current = await api("/v1/workspaces/ws_server20/discovery");
        const record = current.systems.find((s) => s.deviceId === paired.deviceId)?.policy;
        if (!record)
          await api("/v1/workspaces/ws_server20/discovery/policy", {
            version: 1,
            deviceId: paired.deviceId,
            expectedRevision: 0,
            policy,
          });
      }
      state.phase = "waiting";
      state.message = "Connector started. Waiting for its first health report…";
      state.server = remote;
      const deadline = Date.now() + (options.heartbeatWait ?? 45000);
      do {
        const report = await api("/v1/workspaces/ws_server20/discovery");
        if (
          report.systems.some((s) => s.deviceId === paired.deviceId && s.online && s.observation)
        ) {
          state.phase = "connected";
          state.online = true;
          state.message =
            "Connected and reporting health. Open Discovery to view this computer. Projects can be added later.";
          pending = null;
          return;
        }
        await new Promise((r) => setTimeout(r, options.pollDelay ?? 1500));
      } while (Date.now() < deadline);
      state.phase = "waiting";
      state.message =
        "Installed. First health report is still pending. Check VPN and use Retry connection; the existing pairing will be reused.";
    } catch (e) {
      state.phase = "failed";
      state.errorCode = /^[a-z][a-z0-9-]{2,79}$/.test(e.message) ? e.message : "setup-unavailable";
      state.message =
        "Connection did not complete. " +
        state.errorCode +
        ". Correct the issue and retry; this window stays open.";
    } finally {
      body.password = "";
      authCookie = undefined;
      csrf = undefined;
      busy = false;
    }
  }
  const client = await fs.readFile(path.join(__dirname, "SystemEnrollmentClient.js"), "utf8");
  const html = () =>
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DevSetu · Connect this computer</title><style>body{font:16px system-ui;background:#f5f7fb;color:#17253d;margin:0}main{max-width:620px;margin:5vh auto;padding:28px;background:white;border:1px solid #d8dfe9;border-radius:12px}label{display:block;margin:14px 0}input:not([type=checkbox]){box-sizing:border-box;width:100%;padding:10px;margin-top:5px;border:1px solid #b9c5d5;border-radius:6px}button,a{display:inline-block;padding:10px 16px;margin:8px 8px 0 0}button{background:#175ddc;color:white;border:0;border-radius:6px;cursor:pointer}button:disabled{opacity:.6;cursor:not-allowed}#message{padding:14px;background:#eef3fc;white-space:pre-wrap;overflow-wrap:anywhere}small{color:#536078}main[aria-busy=true] #message{border-left:4px solid #175ddc}@media(max-width:650px){main{margin:0;border:0}}</style><main><h1>Connect this computer</h1><p>Monitor this computer first. Add projects when you are ready.</p><form id="form"><label>DevSetu server URL<input id="server" type="url" required placeholder="Your DevSetu address" autocomplete="url"></label><label>DevSetu username<input id="username" required maxlength="64" autocomplete="username"></label><label>Password<input id="password" type="password" required maxlength="128" autocomplete="current-password"></label><label><input id="activity" type="checkbox"> Enable file activity on readable local drives</label><small>Health includes computer name, OS, CPU, RAM and drive space. File activity excludes sensitive paths and requires server policy. File contents are not collected by this system-only connection.</small><p><button id="connect">Connect this computer</button><button id="recheck" type="button" hidden>Check connection</button></p></form><p id="message" role="status"></p><a id="discovery" hidden target="_blank" rel="noopener">Open Discovery</a><a id="projects" hidden target="_blank" rel="noopener">Add a project later</a><p><small>Existing account: use the same DevSetu login. New accounts must first accept their workspace invitation.</small></p></main><meta name="setup-token" content="${token}"><script>${client}</script></html>`;
  const server = http.createServer(async (req, res) => {
    const send = (code, value) => {
      res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(value));
    };
    if (req.headers.host !== new URL(origin).host || Date.now() > expires)
      return send(403, { error: "setup-session-expired" });
    const authorized = (req.headers.cookie || "")
      .split(";")
      .some((v) => v.trim() === cookieName + "=" + cookie);
    const render = (extra) => {
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
        "content-security-policy":
          "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
        ...extra,
      });
      res.end(html());
    };
    if (req.method === "GET" && req.url === "/favicon.ico") {
      res.writeHead(204);
      res.end();
      return;
    }
    let input = "";
    try {
      for await (const chunk of req) {
        input += chunk;
        if (input.length > 16384) throw Error("setup-input-capacity");
      }
      if (
        req.method === "POST" &&
        req.url === "/bootstrap" &&
        !bootstrapped &&
        req.headers.origin === "null" &&
        req.headers["content-type"] === "application/x-www-form-urlencoded"
      ) {
        const form = new URLSearchParams(input);
        if (form.size !== 1 || form.get("session") !== token) throw Error("setup-session-required");
        bootstrapped = true;
        return render({
          "set-cookie":
            cookieName + "=" + cookie + "; Path=/; HttpOnly; SameSite=Strict; Max-Age=1800",
        });
      }
      if (req.method === "GET" && req.url === "/" && authorized) return render({});
      if (
        req.method !== "POST" ||
        !authorized ||
        req.headers.origin !== origin ||
        req.headers["x-devsetu-setup"] !== token ||
        req.headers["content-type"] !== "application/json"
      )
        return send(403, { error: "setup-request-denied" });
      const body = JSON.parse(input);
      if (req.url === "/status" && !Object.keys(body).length) return send(200, { ...state, busy });
      if (req.url === "/connect") {
        if (busy) return send(409, { error: "connection-already-running" });
        if (state.online) return send(409, { error: "connection-already-completed" });
        if (
          Object.keys(body).sort().join(",") !== "fileActivity,password,server,username" ||
          typeof body.fileActivity !== "boolean" ||
          typeof body.username !== "string" ||
          !body.username ||
          body.username.length > 64 ||
          typeof body.password !== "string" ||
          !body.password ||
          body.password.length > 128 ||
          typeof body.server !== "string"
        )
          return send(400, { error: "setup-input-invalid" });
        serverOrigin(body.server);
        busy = true;
        delete state.errorCode;
        void enroll(body);
        return send(202, { accepted: true });
      }
      return send(400, { error: "setup-operation-denied" });
    } catch {
      return send(400, { error: "setup-request-invalid" });
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  origin = "http://127.0.0.1:" + server.address().port;
  try {
    entry = await sessionHelper.entry(origin, token);
  } catch (e) {
    server.close();
    throw e;
  }
  const timer = setTimeout(() => void close(), 30 * 60000);
  timer.unref();
  async function close() {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    server.close();
    await entry.close();
  }
  if (!options.noOpen) sessionHelper.open(entry.url);
  return { origin, pageUrl: entry.url, state, close };
}
module.exports = { serve, installRuntime, runtimeFiles, serverOrigin };
if (require.main === module)
  serve().catch(() => {
    process.stderr.write(
      "DevSetu setup could not open. Keep this window open and contact your workspace administrator.\n",
    );
    process.exitCode = 1;
  });
