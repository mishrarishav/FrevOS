"use strict";
const fs = require("node:fs/promises"),
  path = require("node:path"),
  http = require("node:http"),
  crypto = require("node:crypto"),
  { fork, spawn } = require("node:child_process");
const native = require("./SoftwareNative.cjs"),
  protocol = require("./SoftwareProtocol.cjs"),
  { forward } = require("./PreviewRelay.cjs");
const page = `<!doctype html><meta charset="utf-8"><title>DevSetu software management</title><style>body{font:16px system-ui;max-width:850px;margin:35px auto;padding:18px;background:#101820;color:#e5f5f8}section{border:1px solid #38505a;border-radius:10px;padding:16px;margin:16px 0}label{display:block;margin:15px 0}button{padding:10px 18px}pre{white-space:pre-wrap;word-break:break-word}</style><h1>Software management on this computer</h1><p>Monitoring pairing and existing projects stay unchanged.</p><section><label><input id="inventory" type="checkbox"> Share installed-program inventory with my DevSetu account and workspace administrators</label><p>Windows: machine and this user's registered programs/app packages. Linux: installed package-manager records. Portable programs and other users' private apps may not appear.</p><label><input id="install" type="checkbox"> Trust administrator-approved catalogue installs and temporary demo services on this computer</label><p>One-time DevSetu permission. Administrators can act without another DevSetu confirmation. Native OS installer or privilege prompts may still appear. You can turn this permission off here.</p><button id="save">Save permissions</button></section><p id="status" role="status">Loading…</p><pre id="progress"></pre><script>const nonce=__NONCE__;let initial=true;async function refresh(){try{const r=await fetch('/status');const s=await r.json();if(initial){document.getElementById('inventory').checked=s.consent.inventory;document.getElementById('install').checked=s.consent.install;initial=false}document.getElementById('status').textContent=s.connected?'Connector reporting software capability':'Waiting for DevSetu connection';document.getElementById('progress').textContent=s.progress}catch{document.getElementById('status').textContent='Connector unavailable; keep it running'}}document.getElementById('save').onclick=async()=>{const r=await fetch('/consent',{method:'POST',headers:{'content-type':'application/json','x-devsetu-local':nonce},body:JSON.stringify({inventory:document.getElementById('inventory').checked,install:document.getElementById('install').checked})});if(r.ok){initial=true;refresh()}else document.getElementById('status').textContent='Permission change failed'};refresh();setInterval(refresh,2500)</script>`;
async function atomic(file, value) {
  await native.plain(file);
  const temp = file + "." + crypto.randomBytes(16).toString("hex") + ".tmp",
    h = await fs.open(temp, "wx", 0o600);
  try {
    await h.writeFile(JSON.stringify(value));
    await h.sync();
  } finally {
    await h.close();
  }
  await fs.rename(temp, file);
}
async function start(config, api, options = {}) {
  if (!["win32", "linux"].includes(process.platform) && !options.test) return { stop() {} };
  const root = path.join(config.stateRoot, "software");
  await native.plain(root);
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const consentFile = path.join(root, "consent.json"),
    program = path.join(__dirname, "DemoApi.cjs"),
    programSha256 = native.sha(await fs.readFile(program));
  let consent = { inventory: false, install: false },
    connected = false,
    progress = "Enable software permissions once to use the catalogue.",
    identity,
    busy = false,
    stopped = false,
    observing = false,
    previewBusy = false;
  let operation;
  const demos = new Map(),
    nonce = crypto.randomBytes(24).toString("hex");
  try {
    await native.plain(consentFile);
    const s = JSON.parse(await fs.readFile(consentFile, "utf8"));
    if (
      s.version !== 1 ||
      s.deviceId !== config.deviceId ||
      typeof s.inventory !== "boolean" ||
      typeof s.install !== "boolean"
    )
      throw Error("software-consent-invalid");
    consent = { inventory: s.inventory, install: s.install };
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  async function reloadConsent() {
    try {
      await native.plain(consentFile);
      const info = await fs.stat(consentFile);
      if (info.size > 2048) throw Error();
      const value = JSON.parse(await fs.readFile(consentFile, "utf8"));
      if (
        value.version !== 1 ||
        value.deviceId !== config.deviceId ||
        typeof value.inventory !== "boolean" ||
        typeof value.install !== "boolean"
      )
        throw Error();
      consent = { inventory: value.inventory, install: value.install };
    } catch {
      consent = { inventory: false, install: false };
    }
    if (!consent.install)
      for (const demo of demos.values()) demo.child.send?.({ operation: "stop" });
  }
  const server = http.createServer(async (req, res) => {
    const origin = "http://127.0.0.1:" + server.address().port;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'",
    );
    const send = (status, value) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(value));
    };
    if (
      req.headers.host !== "127.0.0.1:" + server.address().port ||
      (req.headers.origin && req.headers.origin !== origin)
    )
      return send(403, { error: "local-origin-required" });
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(page.replace("__NONCE__", JSON.stringify(nonce)));
      return;
    }
    if (req.method === "GET" && req.url === "/status")
      return send(200, { consent, connected, progress });
    if (
      req.method !== "POST" ||
      req.url !== "/consent" ||
      req.headers.origin !== origin ||
      req.headers["x-devsetu-local"] !== nonce
    )
      return send(403, { error: "local-confirmation-required" });
    try {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 2048) throw Error();
      }
      const s = JSON.parse(body);
      if (
        Object.keys(s).sort().join() !== "install,inventory" ||
        typeof s.inventory !== "boolean" ||
        typeof s.install !== "boolean"
      )
        throw Error();
      await atomic(consentFile, {
        version: 1,
        deviceId: config.deviceId,
        ...s,
        approvedAt: new Date().toISOString(),
      });
      consent = s;
      if (!s.install) for (const demo of demos.values()) demo.child.send?.({ operation: "stop" });
      progress = "Permissions saved. Use DevSetu Software on this system card.";
      send(200, { saved: true });
    } catch {
      send(400, { error: "permission-change-failed" });
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const localStatus = path.join(config.stateRoot, "software-status.json");
  await atomic(localStatus, {
    version: 1,
    deviceId: config.deviceId,
    pid: process.pid,
    port: server.address().port,
  });
  const endpoint = "/v1/connector/software/";
  const observations = () => ({
    version: 1,
    platform: process.platform,
    inventoryConsent: consent.inventory,
    installConsent: consent.install,
    programSha256,
    ...(operation ? { operation } : {}),
    services: (consent.install ? [...demos.values()] : [])
      .filter((d) => d.child.connected && Date.parse(d.expiresAt) > Date.now())
      .map(({ service }) => service),
  });
  const authorize = async (job) => {
    await reloadConsent();
    protocol.validateJob(job, identity);
    if (!consent.install) throw Error("software-consent-revoked");
    const result = await api(endpoint + "authorize", {
      requestId: job.request.requestId,
      digest: job.digest,
    });
    if (result.authorized !== true) throw Error("software-execution-denied");
  };
  const receiptFile = (id) => path.join(root, id + ".json");
  const complete = async (job, result, inventory, restartRequired) =>
    api(endpoint + "complete", {
      requestId: job.request.requestId,
      digest: job.digest,
      result,
      ...(inventory ? { inventory } : {}),
      ...(restartRequired !== undefined ? { restartRequired } : {}),
    });
  async function execute(job) {
    protocol.validateJob(job, identity);
    const request = job.request,
      file = receiptFile(request.requestId);
    await native.plain(file);
    try {
      await fs.access(file);
      throw Error("software-receipt-replay");
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    if ((await fs.readdir(root)).filter((n) => /^sw_[a-f0-9]{32}\.json$/.test(n)).length >= 256)
      throw Error("software-receipt-capacity");
    const receipt = {
      version: 1,
      id: request.requestId,
      digest: job.digest,
      expiresAt: job.expiresAt,
      consumedAt: new Date().toISOString(),
    };
    const stream = await fs.open(file, "wx", 0o600);
    try {
      await stream.writeFile(JSON.stringify(receipt));
      await stream.sync();
    } finally {
      await stream.close();
    }
    let result = "failed",
      inventory,
      restartRequired;
    operation = {
      requestId: request.requestId,
      stage:
        request.operation === "inventory"
          ? "scanning"
          : job.package?.recipe === "demo-api"
            ? "starting-demo"
            : "downloading",
      startedAt: new Date().toISOString(),
    };
    try {
      if (request.operation === "inventory") {
        if (!consent.inventory) throw Error("software-consent-revoked");
        progress = "Reading installed-program inventory…";
        inventory = await (options.inventory ?? native.inventory)();
        await reloadConsent();
        if (!consent.inventory) throw Error("software-consent-revoked");
        result = "inventory-updated";
      } else if (request.operation === "stop-demo") {
        const demo = demos.get(request.serviceId);
        demo?.child.send?.({ operation: "stop" });
        demos.delete(request.serviceId);
        result = "demo-stopped";
      } else {
        await authorize(job);
        progress =
          "Installing approved package: " +
          job.package.name +
          ". Check native OS installer prompts if shown.";
        if (job.package.recipe === "demo-api") {
          if (
            job.package.platform !== process.platform ||
            job.package.programSha256 !== programSha256 ||
            demos.size
          )
            throw Error("software-demo-denied");
          const expiresAt = new Date(
            Date.parse(job.approval.consumedAt) + request.lifetimeSeconds * 1000,
          ).toISOString();
          const child = fork(program, [], {
            env: native.environment(),
            stdio: ["ignore", "ignore", "ignore", "ipc"],
            windowsHide: true,
          });
          const service = {
            id: job.package.id,
            jobId: request.requestId,
            digest: job.digest,
            port: request.port,
            expiresAt,
          };
          await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(Error("software-demo-timeout")), 10000);
            child.once("error", () => {
              clearTimeout(timer);
              reject(Error("software-demo-failed"));
            });
            child.once("exit", () => {
              clearTimeout(timer);
              reject(Error("software-demo-failed"));
            });
            child.once("message", (m) => {
              clearTimeout(timer);
              m?.ready === true ? resolve() : reject(Error("software-demo-failed"));
            });
            child.send({
              instance: request.requestId,
              name: job.package.name,
              port: request.port,
              expiresAt,
            });
          }).catch((e) => {
            child.disconnect();
            throw e;
          });
          child.on("exit", () => demos.delete(job.package.id));
          demos.set(job.package.id, { child, service, expiresAt });
          result = "demo-started";
        } else {
          const installed = await (options.install ?? native.install)(
            job.package,
            path.join(root, "cache"),
            {
              beforeExecute: () => authorize(job),
              progress: (stage) => {
                operation = { ...operation, stage };
                progress =
                  stage === "waiting-for-os"
                    ? "Waiting for native installer / OS authorization. DevSetu will not restart this computer."
                    : stage === "verifying"
                      ? "Verifying approved installer bytes…"
                      : "Downloading the approved installer…";
              },
            },
          );
          restartRequired = installed?.restartRequired === true;
          result = "installed";
        }
      }
    } catch (e) {
      result = /interrupted|timeout/.test(e.message) ? "interrupted" : "failed";
      if (!consent.inventory) inventory = undefined;
    }
    operation = undefined;
    await atomic(file, {
      ...receipt,
      result,
      ...(restartRequired !== undefined ? { restartRequired } : {}),
    });
    await complete(job, result, inventory, restartRequired);
    progress =
      result === "installed"
        ? restartRequired
          ? "Installed. A restart is required; DevSetu did not restart this computer."
          : "Approved installation completed."
        : result === "demo-started"
          ? "Temporary API running on this computer."
          : result === "inventory-updated"
            ? "Software inventory reported."
            : result === "demo-stopped"
              ? "Temporary API stopped."
              : "Operation did not complete; check DevSetu history. No automatic retry.";
    await api(endpoint + "observe", observations());
  }
  const poll = async () => {
    if (stopped || busy) return;
    busy = true;
    try {
      await reloadConsent();
      identity ??= await api(endpoint + "identity", {});
      if (identity.deviceId !== config.deviceId) throw Error("software-identity-denied");
      await api(endpoint + "observe", observations());
      connected = true;
      for (const name of (await fs.readdir(root))
        .filter((n) => /^sw_[a-f0-9]{32}\.json$/.test(n))
        .slice(0, 256)) {
        const file = path.join(root, name);
        await native.plain(file);
        const receipt = JSON.parse(await fs.readFile(file, "utf8"));
        if (!receipt.reconciled) {
          const extra =
            receipt.result === "inventory-updated" && consent.inventory
              ? { inventory: await (options.inventory ?? native.inventory)() }
              : {};
          await api(endpoint + "complete", {
            requestId: receipt.id,
            digest: receipt.digest,
            result: receipt.result ?? "interrupted",
            ...(receipt.restartRequired !== undefined
              ? { restartRequired: receipt.restartRequired }
              : {}),
            ...extra,
          });
          await atomic(file, {
            ...receipt,
            result: receipt.result ?? "interrupted",
            reconciled: true,
          });
        }
      }
      const { job } = await api(endpoint + "claim", {});
      if (job) {
        try {
          await execute(job);
        } catch {
          await complete(job, "interrupted");
        }
      }
    } catch {
      connected = false;
    } finally {
      busy = false;
    }
  };
  const observe = async () => {
    if (stopped || observing) return;
    observing = true;
    try {
      await reloadConsent();
      await api(endpoint + "observe", observations());
      connected = true;
    } catch {
      connected = false;
    } finally {
      observing = false;
    }
  };
  const runtime = {
    previewTarget: async (job) => {
      await reloadConsent();
      const demo = demos.get(job.serviceId);
      if (
        !consent.install ||
        !demo ||
        !demo.child.connected ||
        Date.parse(demo.expiresAt) <= Date.now() ||
        job.workspaceId !== identity?.workspaceId ||
        job.deviceId !== config.deviceId ||
        job.profileId !== "software-" + job.serviceId ||
        job.revision !== 1 ||
        job.fingerprint !== demo.service.digest
      )
        throw Error("software-preview-denied");
      return { port: demo.service.port };
    },
  };
  const preview = async () => {
    if (stopped || previewBusy || !consent.install || !demos.size) return;
    previewBusy = true;
    try {
      const { jobs } = await api("/v1/connector/software-preview/claim", {});
      for (const job of jobs ?? []) {
        const result = await forward(job, runtime);
        await api("/v1/connector/preview/complete", result);
      }
    } catch {
    } finally {
      previewBusy = false;
    }
  };
  const timers = [
    setInterval(() => void poll(), 3000),
    setInterval(() => void observe(), 5000),
    setInterval(() => void preview(), 150),
  ];
  void poll();
  return {
    port: server.address().port,
    url: "http://127.0.0.1:" + server.address().port + "/",
    stop: async () => {
      stopped = true;
      for (const t of timers) clearInterval(t);
      for (const demo of demos.values()) demo.child.send?.({ operation: "stop" });
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
module.exports = { start, atomic };
