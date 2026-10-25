"use strict";
const path = require("node:path"),
  { execFile } = require("node:child_process");
const { within } = require("./DiscoverySafety.cjs");
// Browsing folder names does not inherit file-content/watch exclusions.
const metadataExcluded = (value) =>
  /(^|[\\/])(?:\.git|\.ssh|\.aws|\.azure|\.gnupg|\.kube|System Volume Information|\$Recycle\.Bin)(?:[\\/]|$)/i.test(
    value,
  );
const relative = (value) =>
  typeof value === "string" &&
  value.length <= 1024 &&
  !value.includes("\\") &&
  !value.includes(":") &&
  (!value ||
    value
      .split("/")
      .every((p) => p && p !== "." && p !== ".." && ![...p].some((c) => c.charCodeAt(0) < 32)));
function command(file, args, input) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      file,
      args,
      { windowsHide: true, timeout: 30000, maxBuffer: 131072 },
      (error, stdout) => {
        if (error) reject(Error("folder-browser-unavailable"));
        else {
          try {
            resolve(JSON.parse(stdout));
          } catch {
            reject(Error("folder-browser-unavailable"));
          }
        }
      },
    );
    child.stdin.on("error", () => reject(Error("folder-browser-unavailable")));
    child.stdin.end(JSON.stringify(input));
  });
}
async function browse(config, job, roots, consent) {
  try {
    if (!consent) throw Error("folder-consent-required");
    const request = job.request;
    if (
      job.version !== 1 ||
      job.workspaceId !== "ws_server20" ||
      !/^fb_[a-f0-9]{32}$/.test(job.requestId) ||
      request?.deviceId !== config.deviceId ||
      Date.parse(job.expiresAt) <= Date.now() ||
      !relative(request.path) ||
      !Number.isInteger(request.page) ||
      request.page < 0 ||
      request.page > 100 ||
      (request.fingerprint !== undefined && !/^[a-f0-9]{64}$/.test(request.fingerprint))
    )
      throw Error("folder-scope-denied");
    const allowed = [config.repository, ...roots];
    if (!allowed.includes(request.root)) throw Error("folder-scope-denied");
    const folder = path.resolve(request.root, ...request.path.split("/").filter(Boolean));
    if (
      !within(request.root, folder) ||
      metadataExcluded(request.path) ||
      within(config.stateRoot, folder) ||
      within(__dirname, folder)
    )
      throw Error("folder-scope-denied");
    const agentRoot = __dirname;
    const input = {
      root: request.root,
      path: request.path,
      page: request.page,
      ...(request.fingerprint ? { fingerprint: request.fingerprint } : {}),
      agentRoot,
    };
    const value =
      process.platform === "win32"
        ? await command(
            path.join(process.env.WINDIR, "System32/WindowsPowerShell/v1.0/powershell.exe"),
            [
              "-NoProfile",
              "-NonInteractive",
              "-ExecutionPolicy",
              "RemoteSigned",
              "-File",
              path.join(__dirname, "Browse-Folders.ps1"),
            ],
            input,
          )
        : await command("/usr/bin/python3", [path.join(__dirname, "Browse-Folders.py")], input);
    if (value.errorCode) throw Error(value.errorCode);
    if (
      !Array.isArray(value.entries) ||
      value.entries.length > 100 ||
      !/^[a-f0-9]{64}$/.test(value.fingerprint)
    )
      throw Error("folder-browser-unavailable");
    const result = {
      ...value,
      root: request.root,
      path: request.path,
      entries: value.entries.map((e) => {
        if (typeof e.name !== "string" || e.name.length > 255 || !relative(e.name) || !e.name)
          throw Error("folder-browser-unavailable");
        const selected = path.join(folder, e.name);
        return {
          name: e.name,
          path: (request.path ? request.path + "/" : "") + e.name,
          excluded:
            !!e.excluded ||
            metadataExcluded(e.name) ||
            within(agentRoot, selected) ||
            within(config.stateRoot, selected),
        };
      }),
    };
    return { ...job, status: "succeeded", result };
  } catch (e) {
    const known = [
      "folder-permission-denied",
      "folder-path-unavailable",
      "folder-scope-denied",
      "folder-changed",
      "folder-consent-required",
      "folder-request-expired",
    ];
    return {
      ...job,
      status: "failed",
      errorCode: known.includes(e.message) ? e.message : "folder-browser-unavailable",
    };
  }
}
async function preview(config, job, roots, consent, options = {}) {
  const fs = require("node:fs/promises"),
    http = require("node:http"),
    crypto = require("node:crypto");
  const { excluded, redact } = require("./DiscoverySafety.cjs");
  let server, directory, timer, resolveDecision;
  const failure = (errorCode) => ({
    ...job,
    status: errorCode === "content-approval-declined" ? "declined" : "failed",
    errorCode,
  });
  const plain = async (file) => {
    for (let p = file; ; p = path.dirname(p)) {
      if ((await fs.lstat(p)).isSymbolicLink()) throw Error("content-scope-denied");
      if (path.dirname(p) === p) break;
    }
  };
  try {
    const r = job.request;
    if (
      !consent ||
      job.version !== 1 ||
      job.workspaceId !== "ws_server20" ||
      job.status !== "working" ||
      !/^cp_[a-f0-9]{32}$/.test(job.requestId) ||
      r?.deviceId !== config.deviceId ||
      !r.path ||
      !relative(r.path) ||
      r.path.length > 512 ||
      ![config.repository, config.monitoringRoot, ...roots].includes(r.root) ||
      Date.parse(job.expiresAt) <= Date.now()
    )
      throw Error("content-scope-denied");
    const file = path.resolve(r.root, ...r.path.split("/"));
    if (
      !within(r.root, file) ||
      !roots.some((root) => within(root, file)) ||
      excluded(r.path) ||
      excluded(file) ||
      within(config.stateRoot, file) ||
      within(__dirname, file)
    )
      throw Error("content-scope-denied");
    await plain(file);
    const before = await fs.lstat(file);
    if (
      process.platform === "linux" &&
      !(
        await Promise.all(
          roots.filter((root) => within(root, file)).map(async (root) => (await fs.stat(root)).dev),
        )
      ).includes(before.dev)
    )
      throw Error("content-scope-denied");
    if (!before.isFile() || before.nlink !== 1 || before.size > 8192)
      throw Error("content-unavailable");
    await plain(config.stateRoot);
    directory = await fs.mkdtemp(path.join(config.stateRoot, "content-consent-"));
    const token = crypto.randomBytes(32).toString("base64url"),
      cookie = crypto.randomBytes(32).toString("base64url");
    const escaped = (s) =>
      String(s).replace(
        /[&<>"']/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
      );
    const decision = new Promise((resolve) => {
      resolveDecision = resolve;
    });
    let booted = false,
      decided = false,
      origin;
    server = http.createServer(async (req, res) => {
      try {
        const send = (code, body, type = "text/plain") => {
          res.writeHead(code, {
            "content-type": type,
            "cache-control": "no-store",
            "x-content-type-options": "nosniff",
            "content-security-policy": `default-src 'none'; script-src 'nonce-${token}'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'`,
          });
          res.end(body);
        };
        if (req.headers.host !== new URL(origin).host || req.method !== "POST")
          return send(403, "Request denied");
        let body = "";
        for await (const part of req) {
          body += part;
          if (body.length > 2048) {
            req.destroy();
            return;
          }
        }
        if (
          req.url === "/bootstrap" &&
          !booted &&
          req.headers.origin === "null" &&
          new URLSearchParams(body).get("session") === token
        ) {
          booted = true;
          res.setHeader(
            "set-cookie",
            `devsetu-content=${cookie}; HttpOnly; SameSite=Strict; Path=/`,
          );
          return send(
            200,
            `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>DevSetu · File content request</title><style>body{font:17px system-ui;max-width:720px;margin:8vh auto;padding:24px;background:#f5f7fb;color:#17253d}code{overflow-wrap:anywhere}button{padding:12px;margin:8px}#status{white-space:pre-wrap}</style><h1>File content request</h1><p>Requested by <strong>${escaped(job.actor)}</strong> in ${escaped(job.workspaceId)}.</p><p><code>${escaped(file)}</code></p><p>Allow this request once to read at most 8 KiB of UTF-8 text and send a masked snapshot to DevSetu. This does not grant access to other files or future changes. Secret masking cannot guarantee every sensitive value is detected; decline if this file is confidential.</p><button id="approve">Allow this file once</button><button id="decline">Decline</button><p id="status">Expires ${escaped(new Date(job.expiresAt).toLocaleString())}</p><script nonce="${token}">for(const id of ['approve','decline'])document.getElementById(id).onclick=async()=>{document.getElementById('approve').disabled=true;document.getElementById('decline').disabled=true;try{const r=await fetch('/decision',{method:'POST',headers:{'x-devsetu-content':'${token}'},body:id});document.getElementById('status').textContent=r.ok?'Decision recorded. You may close this tab.':'Request unavailable.';}catch{document.getElementById('status').textContent='Request unavailable.'}};</script>`,
            "text/html; charset=utf-8",
          );
        }
        if (
          req.url !== "/decision" ||
          !booted ||
          decided ||
          req.headers.origin !== origin ||
          !(req.headers.cookie || "").split("; ").includes(`devsetu-content=${cookie}`) ||
          req.headers["x-devsetu-content"] !== token ||
          !["approve", "decline"].includes(body)
        )
          return send(403, "Request denied");
        if (Date.parse(job.expiresAt) <= Date.now()) {
          send(410, "Request expired");
          resolveDecision("expired");
          return;
        }
        decided = true;
        send(200, "Decision recorded");
        resolveDecision(body);
      } catch {
        if (!res.headersSent) res.writeHead(400, { "cache-control": "no-store" });
        res.end("Request unavailable");
        resolveDecision("expired");
      }
    });
    server.requestTimeout = 5000;
    server.headersTimeout = 5000;
    server.maxConnections = 4;
    server.setTimeout(5000, (socket) => socket.destroy());
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    origin = "http://127.0.0.1:" + server.address().port;
    const html = path.join(directory, "request.html");
    await fs.writeFile(
      html,
      `<!doctype html><form method="post" action="${origin}/bootstrap"><input type="hidden" name="session" value="${token}"><button>Review file request</button></form><script>document.forms[0].submit()</script>`,
      { flag: "wx", mode: 0o600 },
    );
    options.onClose?.(() => resolveDecision("expired"));
    timer = setTimeout(
      () => resolveDecision("expired"),
      Math.max(1, Math.min(600000, Date.parse(job.expiresAt) - Date.now())),
    );
    const url = require("node:url").pathToFileURL(html).href;
    if (options.open) await options.open({ url, origin });
    else {
      const child = require("node:child_process").spawn(
        process.platform === "win32"
          ? path.join(process.env.WINDIR, "System32/rundll32.exe")
          : "xdg-open",
        process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url],
        { windowsHide: true, stdio: "ignore" },
      );
      child.once("error", () => resolveDecision("expired"));
    }
    const answer = await decision;
    if (answer !== "approve")
      return failure(
        answer === "decline" ? "content-approval-declined" : "content-request-expired",
      );
    const approvedAt = new Date().toISOString();
    await plain(file);
    const handle = await fs.open(
      file,
      require("node:fs").constants.O_RDONLY | (require("node:fs").constants.O_NOFOLLOW || 0),
    );
    let after;
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.nlink !== 1 || info.size > 8192)
        throw Error("content-unavailable");
      // A bounded read still holds if another process grows the file after stat.
      const buffer = Buffer.alloc(8193),
        { bytesRead } = await handle.read(buffer, 0, 8193, 0);
      if (bytesRead > 8192) throw Error("content-unavailable");
      await plain(file);
      const check = await fs.lstat(file);
      if (
        check.dev !== info.dev ||
        check.ino !== info.ino ||
        check.size !== info.size ||
        check.mtimeMs !== info.mtimeMs
      )
        throw Error("content-unavailable");
      const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, bytesRead));
      if (text.includes("\0")) throw Error("content-unavailable");
      after = redact(text);
    } finally {
      await handle.close();
    }
    if (Date.parse(job.expiresAt) <= Date.now()) throw Error("content-request-expired");
    return {
      ...job,
      status: "succeeded",
      result: { approvedAt, observedAt: new Date().toISOString(), after },
    };
  } catch (e) {
    return failure(
      ["content-scope-denied", "content-request-expired"].includes(e.message)
        ? e.message
        : "content-unavailable",
    );
  } finally {
    clearTimeout(timer);
    if (server)
      await new Promise((resolve) => {
        const limit = setTimeout(() => {
          server.closeAllConnections();
          resolve();
        }, 2000);
        server.close(() => {
          clearTimeout(limit);
          resolve();
        });
        server.closeIdleConnections();
      });
    if (directory) {
      await fs.unlink(path.join(directory, "request.html")).catch(() => {});
      await fs.rmdir(directory).catch(() => {});
    }
  }
}
async function search(config, job, trackingRoots, actualRoots, consent, options = {}) {
  const fs = require("node:fs/promises");
  const { excluded } = require("./DiscoverySafety.cjs");
  const now = options.now || Date.now,
    started = now();
  const result = { matches: [], scannedDirectories: 0, partial: false, gaps: [] };
  const gap = (code) => {
    result.partial = true;
    if (!result.gaps.includes(code)) result.gaps.push(code);
  };
  const normalized = (s) =>
    s
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]/gu, "");
  try {
    if (
      !consent ||
      job.version !== 1 ||
      job.workspaceId !== "ws_server20" ||
      !/^fd_[a-f0-9]{32}$/.test(job.id) ||
      job.request?.deviceId !== config.deviceId ||
      job.status !== "working" ||
      !Number.isFinite(Date.parse(job.expiresAt)) ||
      Date.parse(job.expiresAt) <= Date.now() ||
      !Array.isArray(job.roots) ||
      !job.roots.length ||
      job.roots.length > 64 ||
      job.roots.some((r) => !trackingRoots.includes(r) || !actualRoots.some((a) => within(a, r)))
    )
      throw Error("scope");
    const query =
      typeof job.query === "string" && job.query.length <= 120 ? normalized(job.query) : "";
    if (query.length < 2) {
      gap("query-unavailable");
      return { ...job, status: "succeeded", result };
    }
    const queue = [];
    for (const root of job.roots) {
      try {
        const info = await fs.lstat(root);
        if (!info.isDirectory() || info.isSymbolicLink()) {
          gap("path-unavailable");
          continue;
        }
        queue.push({ root, folder: root, dev: info.dev });
      } catch {
        gap("path-unavailable");
      }
    }
    while (
      queue.length &&
      result.scannedDirectories < 1000 &&
      now() - started < 2000 &&
      result.matches.length < 40
    ) {
      const { root, folder, dev } = queue.shift();
      result.scannedDirectories++;
      let directory;
      try {
        const current = await fs.lstat(folder);
        if (!current.isDirectory() || current.isSymbolicLink() || current.dev !== dev) {
          gap("path-unavailable");
          continue;
        }
        directory = await fs.opendir(folder);
        for await (const entry of directory) {
          if (now() - started >= 2000 || result.matches.length >= 40) {
            gap("search-limit");
            break;
          }
          if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
          const selected = path.join(folder, entry.name),
            rel = path.relative(root, selected).split(path.sep).join("/");
          if (
            !relative(rel) ||
            rel.length > 512 ||
            metadataExcluded(rel) ||
            excluded(
              path.relative(
                actualRoots.find((a) => within(a, selected)),
                selected,
              ),
            ) ||
            within(config.stateRoot, selected) ||
            within(__dirname, selected)
          )
            continue;
          if (normalized(entry.name).startsWith(query)) result.matches.push({ root, path: rel });
          if (queue.length < 1000) queue.push({ root, folder: selected, dev });
          else gap("search-limit");
        }
      } catch (e) {
        gap(e.code === "EACCES" || e.code === "EPERM" ? "permission-denied" : "path-unavailable");
      }
    }
    if (queue.length) gap("search-limit");
    return { ...job, status: "succeeded", result };
  } catch {
    return { ...job, status: "failed" };
  }
}
module.exports = { browse, preview, search };
