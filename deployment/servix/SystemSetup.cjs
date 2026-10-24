"use strict";
const http = require("node:http"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
const { randomBytes, randomUUID } = require("node:crypto");
const { spawn } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const prerequisites = require("./SystemPrerequisites.cjs");
const setupClient = require("node:fs").readFileSync(
  path.join(__dirname, "SystemSetupClient.js"),
  "utf8",
);
const page = String.raw`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DevSetu · System check</title>
<style>body{font:15px system-ui;margin:0;background:#f6f7fb;color:#18263c}main{max-width:980px;margin:36px auto;padding:24px;background:white;border:1px solid #d9dfeb;border-radius:12px}h1{font-size:24px}header{position:sticky;top:0;background:white;padding:12px 0}button{padding:10px 16px;border-radius:7px;border:1px solid #cad3e1;background:#fff;cursor:pointer;margin:4px}button.primary{background:#175ddc;color:white}button:disabled{opacity:.5;cursor:wait}article{border-top:1px solid #dde3ee;padding:16px 0}small{display:block;color:#556479}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f5fa;padding:12px}label{display:block;margin:12px 0}#message{white-space:pre-wrap}#tools{max-height:55vh;overflow:auto}@media(max-width:600px){main{margin:0;padding:16px;border:0}}</style>
<style>main{overflow-wrap:anywhere}</style>
<main><header><h1>DevSetu · System check</h1><p id="system">Checking tools and project requirements…</p><button id="check">Recheck system</button><button class="primary" id="install" disabled>Install selected</button><button class="primary" id="finish" disabled>Continue setup</button></header>
<p id="folder"></p><div id="tools"></div><p>Enrolled devices report OS, tool readiness, CPU, RAM and disk health. Project packages, environment profiles and database access are configured separately.</p><label><input type="checkbox" id="consent">Enable file activity for configured local drives, with existing OS audit attribution when readable. Text history is limited to selected project folders.</label>
<p>Review each package source and required privilege. Installation may show an operating-system authorization prompt. Your running applications are not stopped.</p><p id="message" role="status"></p></main>
<meta name="devsetu-setup-csrf" content=__TOKEN__><script>${setupClient}</script></html>`;
async function serve(repository, options = {}) {
  repository = path.resolve(repository);
  const token = randomBytes(32).toString("hex"),
    correlationId = randomUUID();
  const sessionCookie = randomBytes(32).toString("hex"),
    cookieName = "devsetu-setup-" + correlationId;
  let bootstrapped = false;
  let origin,
    installing = false,
    completed = false;
  const expires = Date.now() + 30 * 60000;
  let finish;
  const result = new Promise((resolve) => {
    finish = resolve;
  });
  const server = http.createServer(async (request, response) => {
    const send = (code, value) => {
      response.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify(value));
    };
    if (request.headers.host !== new URL(origin).host || Date.now() > expires)
      return send(403, { error: "Setup session expired" });
    if (request.method === "GET" && request.url === "/favicon.ico") {
      response.writeHead(204);
      response.end();
      return;
    }
    const authorizedCookie = (request.headers.cookie || "")
      .split(";")
      .some((v) => v.trim() === cookieName + "=" + sessionCookie);
    const render = (headers = {}) => {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
        "content-security-policy":
          "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
        ...headers,
      });
      let html = page.replace("__TOKEN__", JSON.stringify(token));
      if (options.initialConsent) html = html.replace('id="consent"', 'id="consent" checked');
      response.end(html);
    };
    if (
      request.method === "POST" &&
      request.url === "/bootstrap" &&
      !bootstrapped &&
      request.headers.origin === "null" &&
      request.headers["content-type"] === "application/x-www-form-urlencoded"
    ) {
      try {
        let input = "";
        for await (const chunk of request) {
          input += chunk;
          if (input.length > 1024) throw Error();
        }
        const form = new URLSearchParams(input);
        if (form.size !== 1 || form.get("session") !== token) throw Error();
        bootstrapped = true;
        return render({
          "set-cookie": `${cookieName}=${sessionCookie}; Path=/; HttpOnly; SameSite=Strict; Max-Age=1800`,
        });
      } catch {
        return send(403, { error: "Private setup session required" });
      }
    }
    if (request.method === "GET" && request.url === "/" && authorizedCookie && !completed)
      return render();
    if (
      request.method !== "POST" ||
      request.headers.origin !== origin ||
      !authorizedCookie ||
      request.headers["x-devsetu-setup"] !== token ||
      request.headers["content-type"] !== "application/json" ||
      completed
    )
      return send(403, { error: "Setup request denied" });
    let ownsInstall = false;
    try {
      let input = "";
      for await (const chunk of request) {
        input += chunk;
        if (input.length > 16384) throw Error();
      }
      const body = JSON.parse(input);
      if (request.url === "/check" && !Object.keys(body).length)
        return send(200, await prerequisites.inspect(repository));
      if (
        request.url === "/install" &&
        Object.keys(body).sort().join(",") === "operationId,preview,selected"
      ) {
        if (installing) return send(409, { error: "An installation is already running" });
        if (
          typeof body.operationId !== "string" ||
          !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(body.operationId) ||
          typeof body.preview !== "string" ||
          !/^[a-f0-9]{64}$/.test(body.preview) ||
          !Array.isArray(body.selected) ||
          body.selected.length < 1 ||
          body.selected.length > 12 ||
          body.selected.some(
            (s) =>
              typeof s !== "string" ||
              !/^(?:git|node|npm|pnpm|dotnet|python):[v0-9xX*<>=^~|. +-]{1,120}$/.test(s),
          )
        )
          throw Error();
        installing = true;
        ownsInstall = true;
        const approval = {
          version: 1,
          correlationId,
          actionId: body.operationId,
          actor: os.userInfo().username,
          target: repository,
          approvedAt: new Date().toISOString(),
          expiresAt: new Date(expires).toISOString(),
          preview: body.preview,
          selected: body.selected,
        };
        const directory =
          options.receiptsRoot || path.join(prerequisites.toolRoot(), "setup-receipts");
        await fs.mkdir(directory, { recursive: true, mode: 0o700 });
        if ((await fs.lstat(directory)).isSymbolicLink()) throw Error();
        // Persist the exact human-reviewed intent before executing any package operation.
        await fs.writeFile(
          path.join(directory, approval.actionId + ".intent.json"),
          JSON.stringify(approval),
          { flag: "wx", mode: 0o600 },
        );
        try {
          const installed = await prerequisites.install(
            repository,
            body.preview,
            body.selected,
            options.runner,
            options.elevation ??
              (process.platform === "linux" && process.stdin.isTTY ? "terminal" : "desktop"),
          );
          await fs.writeFile(
            path.join(directory, approval.actionId + ".result.json"),
            JSON.stringify({
              actionId: approval.actionId,
              completedAt: new Date().toISOString(),
              receipts: installed.receipts,
            }),
            { flag: "wx", mode: 0o600 },
          );
          return send(200, installed);
        } finally {
          installing = false;
        }
      }
      if (
        request.url === "/finish" &&
        Object.keys(body).sort().join(",") === "discoveryConsent,preview" &&
        typeof body.discoveryConsent === "boolean" &&
        !installing
      ) {
        const check = await prerequisites.inspect(repository);
        if (
          check.fingerprint !== body.preview ||
          check.blocked.length ||
          check.tools.some((t) => t.status !== "ready")
        )
          return send(409, { error: "Requirements changed. Recheck the system" });
        completed = true;
        send(200, { ready: true });
        setTimeout(() => {
          server.close();
          finish({
            ready: true,
            discoveryConsent: body.discoveryConsent,
            discoveryPolicy: {
              ...require("./SystemDiscovery.cjs").defaultPolicy,
              enabled: body.discoveryConsent,
            },
          });
        }, 300);
        return;
      }
      return send(400, { error: "Unsupported setup operation" });
    } catch {
      if (ownsInstall) installing = false;
      return send(400, {
        error:
          "System check or selected installation could not complete. Recheck the system and package manager availability",
      });
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = "http://127.0.0.1:" + server.address().port;
  const sessionDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "devsetu-setup-"));
  const cleanup = async () => {
    const resolved = await fs.realpath(sessionDirectory),
      temporaryRoot = await fs.realpath(os.tmpdir());
    if (
      path.dirname(resolved) === temporaryRoot &&
      path.basename(resolved).startsWith("devsetu-setup-")
    )
      await fs.rm(resolved, { recursive: true, force: true });
  };
  let pageUrl;
  try {
    await fs.chmod(sessionDirectory, 0o700);
    if (process.platform === "win32")
      await new Promise((resolve, reject) => {
        const child = spawn(
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
        child.on("error", reject);
        child.on("exit", (code) =>
          code === 0 ? resolve() : reject(Error("private-setup-session-unavailable")),
        );
        child.stdin.on("error", () => {});
        child.stdin.end(sessionDirectory);
      });
    const pageFile = path.join(sessionDirectory, "system-check.html");
    const privatePage = `<!doctype html><html lang="en"><meta charset="utf-8"><title>DevSetu system check</title><form method="post" action="${origin}/bootstrap"><input type="hidden" name="session" value="${token}"><button type="submit">Open private system check</button></form><script>document.forms[0].submit()</script></html>`;
    await fs.writeFile(pageFile, privatePage, { flag: "wx", mode: 0o600 });
    pageUrl = pathToFileURL(pageFile).href;
  } catch (error) {
    server.close();
    await cleanup().catch(() => {});
    throw error;
  }
  const timer = setTimeout(() => {
    server.close();
    finish({ ready: false, discoveryConsent: false });
  }, 30 * 60000);
  timer.unref();
  void result
    .finally(async () => {
      clearTimeout(timer);
      await cleanup();
    })
    .catch(() => {});
  if (!options.noOpen) {
    const command =
      process.platform === "win32"
        ? path.join(process.env.WINDIR, "System32/rundll32.exe")
        : "xdg-open";
    const child = spawn(
      command,
      process.platform === "win32" ? ["url.dll,FileProtocolHandler", pageUrl] : [pageUrl],
      { windowsHide: true, stdio: "ignore" },
    );
    child.on("error", () => {
      /* A terminal launcher may show the non-secret loopback address. */
    });
    if (process.platform !== "win32")
      process.stderr.write("Open the private local system-check window: " + pageUrl + "\n");
  }
  return {
    origin,
    pageUrl,
    result,
    close: () => {
      server.close();
      finish({ ready: false, discoveryConsent: false });
    },
  };
}
if (require.main === module) {
  const args = process.argv.slice(2);
  (async () => {
    if (args[0] === "--check" && args.length === 2) {
      process.stdout.write(
        JSON.stringify(await prerequisites.inspect(path.resolve(args[1]))) + "\n",
      );
      return;
    }
    if (
      args[0] !== "--repository" ||
      ![2, 3].includes(args.length) ||
      (args.length === 3 && args[2] !== "--initial-consent")
    )
      throw Error();
    const setup = await serve(args[1], { initialConsent: args[2] === "--initial-consent" });
    const result = await setup.result;
    process.stdout.write(JSON.stringify(result) + "\n");
    process.exitCode = result.ready ? 0 : 1;
  })().catch(() => {
    process.stderr.write("DevSetu system check unavailable\n");
    process.exitCode = 1;
  });
}
module.exports = { serve };
