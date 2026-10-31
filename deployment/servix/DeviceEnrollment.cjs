"use strict";
const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os"),
  http = require("node:http"),
  crypto = require("node:crypto"),
  { spawn } = require("node:child_process");
const sessions = require("./SetupSession.cjs"),
  runtime = require("./SystemEnrollment.cjs");
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const secret = () => crypto.randomBytes(32).toString("base64url");
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
async function readIndex(file) {
  try {
    await plain(file);
    const b = await fs.readFile(file);
    if (b.length > 4096) throw Error();
    const v = JSON.parse(b);
    if (!/^fc_[a-f0-9]{32}$/.test(v.deviceId) || runtime.serverOrigin(v.server) !== v.server)
      throw Error();
    return v;
  } catch {
    return null;
  }
}
async function saveIndex(file, value) {
  await plain(file);
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = file + "." + crypto.randomBytes(8).toString("hex");
  await fs.writeFile(tmp, JSON.stringify(value), { flag: "wx", mode: 0o600 });
  await fs.rename(tmp, file);
}
async function serve(options = {}) {
  const directory =
      options.preferences ||
      path.join(
        process.platform === "win32"
          ? process.env.LOCALAPPDATA
          : path.join(os.homedir(), ".local/share"),
        "DevSetu/Setup",
      ),
    connectionFile = path.join(directory, "connection.json"),
    pendingFile = path.join(directory, "pending.json");
  const initial = (await readIndex(connectionFile)) || (await readIndex(pendingFile));
  const token = secret(),
    cookie = secret(),
    cookieName = "devsetu-device-" + crypto.randomBytes(8).toString("hex");
  let origin,
    entry,
    bootstrapped = false,
    closed = false,
    busy = false,
    pending,
    forceNew = false;
  const state = {
    phase: "ready",
    message: "Connect this computer without sharing an administrator password.",
    online: false,
    notificationsSupported: options.notificationsSupported !== false,
    defaults: initial
      ? {
          server: initial.server,
          fileActivity: initial.fileActivity === true,
          notifications: initial.notifications === true,
        }
      : undefined,
  };
  const remoteFetch = options.fetch || fetch;
  const helper =
    options.helper ||
    (async (name, input) => {
      if (
        ![
          "Pairing-State.ps1",
          "Resume-SystemConnector.ps1",
          "Update-SystemConnector.ps1",
          "Notification-Consent.ps1",
        ].includes(name)
      )
        throw Error("setup-operation-denied");
      const script = path.join(entry.directory, name);
      await fs.writeFile(script, await fs.readFile(path.join(__dirname, name)), { mode: 0o600 });
      return new Promise((resolve, reject) => {
        const child = spawn(
          path.join(process.env.WINDIR, "System32/WindowsPowerShell/v1.0/powershell.exe"),
          ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "RemoteSigned", "-File", script],
          {
            windowsHide: true,
            env: sessions.windowsEnvironment(),
            stdio: ["pipe", "pipe", "ignore"],
          },
        );
        let output = "";
        const timer = setTimeout(
          () => {
            child.kill();
            reject(Error("protected-connection-timeout"));
          },
          name === "Update-SystemConnector.ps1" ? 120000 : 45000,
        );
        child.stdout.on("data", (b) => {
          output += b;
          if (output.length > 32768) {
            child.kill();
            reject(Error("protected-connection-capacity"));
          }
        });
        child.once("error", () => {
          clearTimeout(timer);
          reject(Error("protected-connection-unavailable"));
        });
        child.once("close", (code) => {
          clearTimeout(timer);
          if (code !== 0) return reject(Error("protected-connection-unavailable"));
          try {
            resolve(output ? JSON.parse(output) : {});
          } catch {
            reject(Error("protected-connection-invalid"));
          }
        });
        child.stdin.on("error", () => {});
        child.stdin.end(JSON.stringify(input));
      });
    });
  async function api(server, route, body, credential) {
    const r = await remoteFetch(server + route, {
      method: "POST",
      headers: {
        origin: server,
        "content-type": "application/json",
        ...(credential ? { authorization: "Bearer " + credential } : {}),
      },
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) {
      if (r.status === 401 && route === "/v1/connector/system-status") return null;
      let code;
      try {
        code = (await r.json()).error;
      } catch {}
      throw Error(
        [
          "pairing-target-changed",
          "pairing-rate-limited",
          "pairing-capacity",
          "connector-device-limit",
          "pairing-code-collision",
          "join-code-unavailable",
          "join-code-consumed",
          "join-redemption-scope-denied",
          "join-admin-required",
          "join-account-changed",
        ].includes(code)
          ? code
          : "server-request-failed",
      );
    }
    return r.json();
  }
  async function status(config) {
    const s = await api(config.server, "/v1/connector/system-status", {}, config.credential);
    if (s && s.deviceId !== config.deviceId) throw Error("connection-scope-invalid");
    return s;
  }
  async function prepare(server, fileActivity, approvalCode = "") {
    const existing = await readIndex(connectionFile);
    if (existing?.server === server && !forceNew && !approvalCode) {
      try {
        const config = await helper("Pairing-State.ps1", {
          operation: "connection",
          deviceId: existing.deviceId,
        });
        if (
          config.mode !== "system" ||
          config.server !== server ||
          config.deviceId !== existing.deviceId
        )
          throw Error();
        return { active: true, config };
      } catch {
        /* A missing protected connection can resume the pending proposal below. */
      }
    }
    const index = await readIndex(pendingFile);
    if (!forceNew && index?.server === server) {
      try {
        const proposal = await helper("Pairing-State.ps1", {
          operation: "pending",
          deviceId: index.deviceId,
        });
        if (
          proposal.server === server &&
          proposal.deviceId === index.deviceId &&
          proposal.fileActivity === fileActivity &&
          (!approvalCode || proposal.code === approvalCode)
        ) {
          if (
            Date.now() - Date.parse(proposal.createdAt) < (approvalCode ? 900000 : 600000) ||
            (await status(proposal))
          )
            return { proposal };
        }
      } catch {
        /* Use a new isolated proposal if the old local state is unavailable. */
      }
    }
    forceNew = false;
    const invitation = approvalCode
      ? await api(server, "/v1/connector/join/prepare", { version: 1, code: approvalCode })
      : null;
    if (
      invitation &&
      (invitation.platform !== process.platform ||
        invitation.fileActivity !== fileActivity ||
        !/^fc_[a-f0-9]{32}$/.test(invitation.deviceId))
    )
      throw Error("join-scope-mismatch");
    const deviceId = invitation?.deviceId ?? "fc_" + crypto.randomBytes(16).toString("hex"),
      alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const proposal = {
      version: 1,
      deviceId,
      server,
      name: os.hostname().slice(0, 80),
      platform: process.platform,
      architecture: process.arch,
      fileActivity,
      credential: deviceId + "." + secret(),
      pollSecret: secret(),
      code: approvalCode || [...crypto.randomBytes(8)].map((b) => alphabet[b & 31]).join(""),
      createdAt: new Date().toISOString(),
    };
    if (options.prepare) await options.prepare(proposal);
    else {
      const root = path.join(process.env.LOCALAPPDATA, "FrevOS/Connector", deviceId);
      await plain(root);
      await fs.mkdir(root, { recursive: true, mode: 0o700 });
      await sessions.protect(root, true);
      await helper("Pairing-State.ps1", { operation: "prepare", deviceId, state: proposal });
    }
    await saveIndex(pendingFile, { server, deviceId, fileActivity });
    return { proposal };
  }
  async function connect(body) {
    try {
      const approvalCode = (body.joinCode ?? "").toUpperCase().replace(/[\s-]/g, "");
      const server = runtime.serverOrigin(body.server);
      state.server = server;
      state.defaults = {
        server,
        fileActivity: body.fileActivity,
        notifications: body.notifications === true,
      };
      state.phase = "checking";
      state.message = "Checking this computer's protected connection…";
      if (pending && pending.server !== server) pending = null;
      if (pending?.proposal && pending.proposal.fileActivity !== body.fileActivity) {
        pending = null;
        forceNew = true;
      }
      if (pending?.proposal && approvalCode && pending.proposal.code !== approvalCode)
        pending = null;
      const prepared = pending || (await prepare(server, body.fileActivity, approvalCode));
      pending = prepared;
      pending.server = server;
      let config,
        approved,
        freshAfter = 0;
      if (prepared.active) {
        config = prepared.config;
        const current = await status(config);
        if (!current?.ready) throw Error("connection-no-longer-authorized");
        if (
          config.accountName?.startsWith("pair:") &&
          config.accountName !== "pair:" + sha(current.actor).slice(0, 40)
        )
          throw Error("connection-owner-changed");
        state.phase = "starting";
        state.message =
          "Verifying the package and updating the existing connector if needed. Your pairing and monitoring data are preserved…";
        if (!options.resume || options.update) {
          const manifest = await fs.readFile(
            path.join(options.bundle || __dirname, "system-runtime-manifest.json"),
          );
          const update = await (options.update || ((r) => helper("Update-SystemConnector.ps1", r)))(
            {
              deviceId: config.deviceId,
              server,
              username: config.accountName,
              bundle: options.bundle || __dirname,
              manifestSha256: sha(manifest),
            },
          );
          if (update?.updated) freshAfter = Date.now();
        }
        await (options.resume || ((r) => helper("Resume-SystemConnector.ps1", r)))({
          deviceId: config.deviceId,
          server,
          username: config.accountName,
          fileActivity: body.fileActivity,
        });
      } else {
        const p = prepared.proposal;
        const proof = p.deviceId + "." + p.pollSecret;
        approved = await status(p);
        if (!approved?.ready && approvalCode) {
          await api(server, "/v1/connector/join/redeem", {
            version: 1,
            code: approvalCode,
            deviceId: p.deviceId,
            platform: p.platform,
            architecture: p.architecture,
            name: p.name,
            fileActivity: p.fileActivity,
            credentialHash: sha(p.credential),
            pollHash: sha(proof),
          });
          approved = await status(p);
        }
        if (!approved?.ready) {
          let preview = await api(server, "/v1/connector/enrollment/start", {
            version: 1,
            deviceId: p.deviceId,
            name: p.name,
            platform: p.platform,
            architecture: p.architecture,
            fileActivity: p.fileActivity,
            credentialHash: sha(p.credential),
            pollHash: sha(proof),
            codeHash: sha(p.code),
          });
          state.phase = "approval";
          state.code = p.code.slice(0, 4) + "-" + p.code.slice(4);
          state.expiresAt = preview.expiresAt;
          state.deviceName = p.name;
          state.message =
            "Ask an administrator to open DevSetu Discovery → Approve connection, enter this code, select your account and confirm the computer name. No administrator password is needed on this computer.";
          while (!closed) {
            if (["expired", "rejected"].includes(preview.status)) {
              forceNew = true;
              pending = null;
              throw Error("pairing-" + preview.status);
            }
            if (preview.status === "approved") {
              approved = await status(p);
              if (approved?.ready) break;
            }
            await new Promise((r) => setTimeout(r, options.pollDelay ?? 2000));
            preview = await api(server, "/v1/connector/enrollment/poll", {}, proof);
          }
          if (closed) throw Error("setup-closed");
        }
        if (!approved?.ready || typeof approved.actor !== "string")
          throw Error("pairing-not-approved");
        state.phase = "installing";
        delete state.code;
        state.message = "Approved. Starting the protected system connector…";
        config = {
          version: 1,
          mode: "system",
          server,
          allowInternalHttp: server.startsWith("http:"),
          deviceId: p.deviceId,
          credential: p.credential,
          monitoringRoot: os.homedir(),
          fileActivity: p.fileActivity,
          accountName: "pair:" + sha(approved.actor).slice(0, 40),
        };
        await (options.install || runtime.installRuntime)(config);
      }
      if (!options.resume || options.notificationConsent)
        await (options.notificationConsent || ((r) => helper("Notification-Consent.ps1", r)))({
          version: 1,
          deviceId: config.deviceId,
          server,
          enabled: body.notifications === true,
        });
      await saveIndex(connectionFile, {
        server,
        deviceId: config.deviceId,
        username: config.accountName,
        fileActivity: body.fileActivity,
        notifications: body.notifications === true,
      });
      state.phase = "waiting";
      state.message = "Connector started. Waiting for an authenticated health report…";
      const deadline = Date.now() + (options.heartbeatWait ?? 45000);
      do {
        const report = await status(config);
        if (
          report?.ready &&
          report.online &&
          (!freshAfter ||
            (report.collectorVersion === 1 && Date.parse(report.observedAt) >= freshAfter))
        ) {
          state.phase = "connected";
          state.online = true;
          state.message =
            "Connected and reporting health. Monitoring continues after you close setup. Add projects separately when ready.";
          pending = null;
          return;
        }
        await new Promise((r) => setTimeout(r, options.pollDelay ?? 1500));
      } while (!closed && Date.now() < deadline);
      state.message =
        "Installed. First health report is pending. Check VPN and retry; the same protected device will be reused.";
    } catch (e) {
      if (e.message === "connection-no-longer-authorized") {
        forceNew = true;
        pending = null;
      }
      state.phase = "failed";
      state.errorCode = /^[a-z][a-z0-9-]{2,79}$/.test(e.message)
        ? e.message
        : "connection-unavailable";
      state.message =
        "Connection did not complete: " +
        state.errorCode +
        ". Correct the issue and retry. No administrator password is required.";
    } finally {
      busy = false;
    }
  }
  const client = await fs.readFile(path.join(__dirname, "DeviceEnrollmentClient.js"), "utf8");
  const html = () =>
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DevSetu · Connect this computer</title><style>body{margin:0;font:16px system-ui;background:#f5f7fb;color:#17253d}main{max-width:650px;margin:4vh auto;padding:28px;background:white;border:1px solid #d8dfe9;border-radius:12px}label{display:block;margin:16px 0}input[type=url]{box-sizing:border-box;width:100%;padding:12px;border:1px solid #bac6d7;border-radius:6px}button,a{display:inline-block;padding:11px 16px;margin:8px 8px 0 0}button{border:0;border-radius:6px;background:#175ddc;color:white;cursor:pointer}button:disabled{opacity:.6;cursor:not-allowed}#code{font-size:34px;letter-spacing:4px;font-weight:700}#message{background:#eef3fc;padding:14px;white-space:pre-wrap;overflow-wrap:anywhere}small{color:#536078}@media(max-width:680px){main{margin:0;border:0;padding:20px}}</style><main><h1>Connect this computer</h1><p>No administrator password. No project or Git required.</p><form id="form"><label>DevSetu server URL<input type="url" id="server" required autocomplete="url" placeholder="Your DevSetu address"></label><label>Approved join code (if provided)<input type="text" id="join-code" maxlength="16" autocomplete="off" placeholder="Code from Request to join approval"></label><label><input type="checkbox" id="activity"> Enable file activity on readable local drives</label><label><input type="checkbox" id="notifications"> Show individually approved DevSetu notifications from the account that paired this computer</label><small>Health includes CPU, RAM, operating system and drive space. File activity needs your choice here and approval in DevSetu. File contents and project execution are not included.</small><p><button id="connect">Connect this computer</button></p></form><section id="approval" hidden><h2>Approve from DevSetu</h2><p id="device"></p><p id="code"></p><button id="copy" type="button">Copy pairing code</button><a id="approve" target="_blank" rel="noopener">Open DevSetu Discovery</a><small>Use your own signed-in browser on this computer or another computer. Only approve the code shown on the computer you intend to connect.</small></section><p id="message" role="status"></p><a id="discovery" hidden target="_blank" rel="noopener">Open Discovery</a><a id="projects" hidden target="_blank" rel="noopener">Add a project later</a></main><meta name="setup-token" content="${token}"><script>${client}</script></html>`;
  const server = http.createServer(async (req, res) => {
    const send = (code, value) => {
      res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(value));
    };
    if (req.headers.host !== new URL(origin).host || closed)
      return send(403, { error: "setup-session-expired" });
    const authenticated = (req.headers.cookie || "")
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
    if (req.method === "GET" && req.url === "/" && authenticated) return render({});
    try {
      let input = "";
      for await (const c of req) {
        input += c;
        if (input.length > 16384) throw Error();
      }
      if (
        req.method === "POST" &&
        req.url === "/bootstrap" &&
        !bootstrapped &&
        req.headers.origin === "null" &&
        req.headers["content-type"] === "application/x-www-form-urlencoded"
      ) {
        const form = new URLSearchParams(input);
        if (form.size !== 1 || form.get("session") !== token) throw Error();
        bootstrapped = true;
        return render({
          "set-cookie":
            cookieName + "=" + cookie + "; Path=/; HttpOnly; SameSite=Strict; Max-Age=1800",
        });
      }
      if (
        req.method !== "POST" ||
        !authenticated ||
        req.headers.origin !== origin ||
        req.headers["content-type"] !== "application/json" ||
        req.headers["x-devsetu-setup"] !== token
      )
        return send(403, { error: "setup-request-denied" });
      const body = JSON.parse(input);
      if (req.url === "/status" && !Object.keys(body).length) return send(200, { ...state, busy });
      if (
        req.url !== "/connect" ||
        ![
          "fileActivity,server",
          "fileActivity,notifications,server",
          "fileActivity,joinCode,notifications,server",
          "fileActivity,joinCode,server",
        ].includes(Object.keys(body).sort().join(",")) ||
        (body.notifications !== undefined && typeof body.notifications !== "boolean") ||
        (body.notifications === true && options.notificationsSupported === false) ||
        (body.joinCode !== undefined &&
          (typeof body.joinCode !== "string" ||
            body.joinCode.length > 16 ||
            (!/^[A-HJ-NP-Z2-9]{8}$/.test(body.joinCode.toUpperCase().replace(/[\s-]/g, "")) &&
              body.joinCode !== ""))) ||
        typeof body.fileActivity !== "boolean" ||
        typeof body.server !== "string"
      )
        return send(400, { error: "setup-input-invalid" });
      if (busy || state.online) return send(409, { error: "connection-already-running" });
      runtime.serverOrigin(body.server);
      busy = true;
      delete state.errorCode;
      void connect(body);
      return send(202, { accepted: true });
    } catch {
      return send(400, { error: "setup-request-invalid" });
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  origin = "http://127.0.0.1:" + server.address().port;
  try {
    entry = await sessions.entry(origin, token);
  } catch (e) {
    server.close();
    throw e;
  }
  const timer = setTimeout(() => void close(), 1800000);
  timer.unref();
  async function close() {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    server.close();
    await entry.close();
  }
  if (!options.noOpen) sessions.open(entry.url);
  return { origin, pageUrl: entry.url, state, close };
}
module.exports = { serve };
if (require.main === module)
  serve()
    .then((setup) =>
      process.stdout.write(
        "DevSetu setup is ready. No administrator password is needed here.\nIf the browser did not open, open this private page:\n" +
          setup.pageUrl +
          "\n",
      ),
    )
    .catch(() => {
      process.stderr.write("DevSetu setup could not open. Keep this window open and retry.\n");
      process.exitCode = 1;
    });
