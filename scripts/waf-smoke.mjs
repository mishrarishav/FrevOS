import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { parseWafEnvironment } from "./waf-config.mjs";

const exec = promisify(execFile),
  root = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  nonce = randomBytes(10).toString("hex"),
  owner = `devsetu-waf-smoke-${nonce}`,
  backend = `${owner}-backend`,
  network = `${owner}-network`,
  envFile = join(root, `.local/${owner}.env`),
  canary = `synthetic-private-${randomBytes(16).toString("hex")}`,
  results = [],
  hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
let createdNetwork = false,
  createdBackend = false,
  composeStarted = false,
  report,
  failure;
const cleanupFailures = [];
const docker = async (args, timeout = 60000) =>
  (
    await exec("docker", args, {
      cwd: root,
      windowsHide: true,
      timeout,
      maxBuffer: 2000000,
    })
  ).stdout.trim();
const compose = (args) =>
  docker([
    "compose",
    "--project-name",
    owner,
    "--env-file",
    envFile,
    "-f",
    join(root, "compose.waf.yaml"),
    ...args,
  ]);
async function port() {
  const server = createServer();
  await new Promise((accept, reject) =>
    server.once("error", reject).listen(0, "127.0.0.1", accept),
  );
  const result = server.address().port;
  await new Promise((accept, reject) => server.close((e) => (e ? reject(e) : accept())));
  return result;
}
async function request(base, path, options = {}) {
  return fetch(base + path, {
    ...options,
    headers: { "user-agent": "DevSetu-Local-WAF-Validation/1.0", ...options.headers },
    signal: AbortSignal.timeout(30000),
    redirect: "manual",
  });
}
async function checked(name, check) {
  await check();
  results.push({ name, status: "PASS" });
}
async function webSocketEcho(origin) {
  await new Promise((accept, reject) => {
    const ws = new WebSocket(`${origin.replace(/^http/, "ws")}/devsetu/ws`),
      timer = setTimeout(() => {
        ws.close();
        reject(Error("WAF WebSocket echo timed out"));
      }, 10000);
    ws.addEventListener("open", () => ws.send("local-echo"));
    ws.addEventListener("message", (e) => {
      try {
        assert.equal(e.data, "local-echo");
        clearTimeout(timer);
        ws.close();
        accept();
      } catch (error) {
        reject(error);
      }
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(Error("WAF WebSocket upgrade failed"));
    });
  });
}
await mkdir(join(root, ".local"), { recursive: true });
const reportPath = join(root, ".local/waf-smoke-result.json");
await writeFile(
  reportPath,
  JSON.stringify({ status: "RUNNING", runId: owner, observedAt: new Date().toISOString() }),
);
const baseline = await docker(["ps", "-q", "--filter", "name=frevos-local-"]);
try {
  const baseValues = parseWafEnvironment(
      await readFile(join(root, "deployment/waf/waf.env.example"), "utf8"),
    ),
    listenPort = await port();
  // A separate bridge keeps the fixture away from app/database networks. Docker
  // internal networks suppress published ports; both listeners publish loopback.
  await docker(["network", "create", "--label", `devsetu.waf.smoke=${nonce}`, network]);
  createdNetwork = true;
  const nodeImage = await docker([
    "image",
    "inspect",
    "node:24.19.0-bookworm-slim",
    "--format",
    "{{.Id}}",
  ]);
  await docker([
    "run",
    "--detach",
    "--name",
    backend,
    "--label",
    `devsetu.waf.smoke=${nonce}`,
    "--network",
    network,
    "--publish",
    "127.0.0.1::8080",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges:true",
    "--memory",
    "96m",
    "--pids-limit",
    "32",
    "--user",
    "1000:1000",
    "--mount",
    `type=bind,src=${join(root, "deployment/waf/smoke-backend.cjs")},dst=/smoke.cjs,readonly`,
    "--entrypoint",
    "node",
    nodeImage,
    "/smoke.cjs",
  ]);
  createdBackend = true;
  const address = await docker(["port", backend, "8080/tcp"]),
    direct = `http://${address}`,
    front = `http://127.0.0.1:${listenPort}`;
  const attacks = [
    "/devsetu/health?q=1%27%20OR%20%271%27%3D%271%27%20--",
    "/devsetu/health?q=%3Cscript%3Ealert%281%29%3C%2Fscript%3E",
  ];
  await checked("Synthetic upstream would accept the attack test URLs", async () => {
    for (const path of attacks) assert.equal((await request(direct, path)).status, 200);
  });
  for (const mode of ["On", "DetectionOnly"]) {
    const values = parseWafEnvironment(
      Object.entries({
        ...baseValues,
        FREVOS_WAF_NETWORK: network,
        FREVOS_WAF_PORT: String(listenPort),
        FREVOS_WAF_UPSTREAM: `http://${backend}:8080`,
        FREVOS_WAF_BASE_PATH: "/devsetu",
        FREVOS_WAF_BODY_LIMIT: "1048576",
        FREVOS_WAF_NOFILES_LIMIT: "1048576",
        FREVOS_WAF_TRANSPORT_LIMIT: "4194304",
        FREVOS_WAF_MODE: mode,
      })
        .map(([key, value]) => `${key}=${value}`)
        .join("\n"),
    );
    await writeFile(
      envFile,
      Object.entries(values)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n"),
      { mode: 0o600 },
    );
    composeStarted = true;
    await compose(["up", "--detach", "--wait", "--no-deps", "--force-recreate", "waf"]);
    await checked(
      mode === "On"
        ? "On: real CRS blocks SQL injection and XSS"
        : "DetectionOnly: suspicious test requests remain allowed",
      async () => {
        for (const path of attacks)
          assert.equal((await request(front, path)).status, mode === "On" ? 403 : 200);
      },
    );
    await checked(
      `${mode}: Hindi JSON, prefix, Origin, cookies and fake authorization remain intact`,
      async () => {
        const body = JSON.stringify({ message: "नमस्ते, यह केवल स्थानीय परीक्षण है।", private: canary }),
          cookie = `DevSetuSmokeSession=${canary}`,
          authorization = `Bearer ${canary}`,
          response = await request(front, `/devsetu/echo?private=${canary}`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              origin: "https://smoke.invalid",
              cookie,
              authorization,
              "x-forwarded-for": "203.0.113.99",
            },
            body,
          });
        assert.equal(response.status, 200);
        const result = await response.json();
        assert.equal(result.path, "/devsetu/echo");
        assert.equal(result.origin, "https://smoke.invalid");
        assert.equal(result.host, new URL(front).host);
        assert.equal(result.bytes, Buffer.byteLength(body));
        assert.equal(result.sha256, hash(body));
        assert.equal(result.cookieSha256, hash(cookie));
        assert.equal(result.authorizationSha256, hash(authorization));
        assert.ok(!result.forwardedFor.includes("203.0.113.99"));
      },
    );
    await checked(
      `${mode}: login-like cookie paths and application 401 are preserved`,
      async () => {
        const response = await request(front, "/devsetu/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        });
        assert.equal(response.status, 200);
        assert.equal(
          response.headers.get("set-cookie"),
          "DevSetuSmokeSession=fake; Path=/devsetu; HttpOnly; SameSite=Lax",
        );
        assert.equal((await request(front, "/devsetu/denied")).status, 401);
      },
    );
    await checked(`${mode}: file upload and exact ZIP bytes pass`, async () => {
      const form = new FormData();
      form.set("upload", new Blob([canary], { type: "text/plain" }), "smoke.txt");
      assert.equal(
        (await request(front, "/devsetu/echo", { method: "POST", body: form })).status,
        200,
      );
      const file = await request(front, "/devsetu/download.zip");
      assert.equal(file.status, 200);
      assert.equal(file.headers.get("content-type"), "application/zip");
      assert.equal(
        Buffer.from(await file.arrayBuffer()).toString("hex"),
        "504b0506000000000000000000000000000000000000",
      );
    });
    await checked(`${mode}: WebSocket upgrade and direct-proxy SSE pass`, async () => {
      await webSocketEcho(front);
      const stream = await request(front, "/devsetu/sse");
      assert.equal(stream.status, 200);
      assert.equal(stream.headers.get("content-type"), "text/event-stream");
      assert.equal(await stream.text(), "data: first\n\ndata: second\n\n");
    });
    const binaryRoutes = [
        ["/devsetu/v1/executor/jobs/cj_smoke/artifact", "application/octet-stream"],
        ["/devsetu/v1/connector/git-desktop/cj_smoke/publish", "application/octet-stream"],
        ["/devsetu/v1/connector/source-seed", "application/x-git-bundle"],
        ["/devsetu/v1/connector/jobs/cj_smoke/bundle", "application/x-git-bundle"],
      ],
      binary = Buffer.alloc(2 * 1024 * 1024, 65);
    binary.write(canary);
    await checked(
      `${mode}: exact binary business routes stream above the inspection limit`,
      async () => {
        for (const [path, type] of binaryRoutes) {
          const response = await request(front, path, {
            method: "POST",
            headers: { "content-type": type },
            body: binary,
          });
          assert.equal(response.status, 200);
          const result = await response.json();
          assert.equal(result.bytes, binary.length);
          assert.equal(result.sha256, hash(binary));
        }
      },
    );
    if (mode === "On") {
      await checked(
        "On: wrong route, MIME and method do not receive binary-body exemptions",
        async () => {
          for (const [path, type, method, body] of [
            ["/devsetu/echo", "application/octet-stream", "POST", binary],
            [
              binaryRoutes[0][0],
              "application/json",
              "POST",
              JSON.stringify({ data: "a".repeat(binary.length) }),
            ],
            [binaryRoutes[0][0], "application/octet-stream", "PUT", binary],
            [
              "/devsetu/devsetu/v1/connector/source-seed",
              "application/x-git-bundle",
              "POST",
              binary,
            ],
          ]) {
            const response = await request(front, path, {
              method,
              headers: { "content-type": type },
              body,
            });
            assert.ok(
              [403, 413].includes(response.status),
              "An unapproved binary body received an exemption",
            );
          }
        },
      );
      await checked("On: binary-body exemption retains query attack inspection", async () => {
        const response = await request(
          front,
          `${binaryRoutes[0][0]}?q=%3Cscript%3Ealert%281%29%3C%2Fscript%3E`,
          {
            method: "POST",
            headers: { "content-type": "application/octet-stream" },
            body: "ok",
          },
        );
        assert.equal(response.status, 403);
      });
    }
    await checked(
      `${mode}: transport body ceiling still rejects exempt oversized uploads`,
      async () => {
        const response = await request(front, binaryRoutes[0][0], {
          method: "POST",
          headers: { "content-type": "application/octet-stream" },
          body: Buffer.alloc(4 * 1024 * 1024 + 1, 65),
        });
        assert.equal(response.status, 413);
      },
    );
    await checked(`${mode}: raw request canaries never appear in container logs`, async () => {
      const container = await compose(["ps", "--quiet", "waf"]),
        logs = await docker(["logs", container]);
      assert.ok(!logs.includes(canary), "Raw request content leaked to WAF logs");
      assert.ok(!logs.includes("DevSetuSmokeSession="), "Cookie value leaked to WAF logs");
      assert.ok(!logs.includes("alert(1)"), "Raw matched attack data leaked to WAF logs");
    });
  }
  for (const id of baseline.split(/\r?\n/).filter(Boolean))
    assert.equal(await docker(["inspect", id, "--format", "{{.State.Running}}"]), "true");
  report = {
    status: "PASS",
    runId: owner,
    observedAt: new Date().toISOString(),
    kind: "actual-local-Coraza-and-synthetic-upstream",
    image: baseValues.FREVOS_WAF_IMAGE,
    results,
    existingLocalContainersPreserved: true,
    actualDevSetuLoginOrConnectorAcceptance: false,
    laptopPreviewStreamingSupport: false,
    liveDeploymentPerformed: false,
  };
} catch (error) {
  failure = error;
} finally {
  if (composeStarted)
    await compose(["down"]).catch(() => cleanupFailures.push("WAF container cleanup failed"));
  if (createdBackend)
    await docker(["rm", "--force", backend]).catch(() =>
      cleanupFailures.push("Synthetic upstream cleanup failed"),
    );
  if (createdNetwork)
    await docker(["network", "rm", network]).catch(() =>
      cleanupFailures.push("Synthetic network cleanup failed"),
    );
  await unlink(envFile).catch((e) => {
    if (e.code !== "ENOENT") cleanupFailures.push("Temporary config cleanup failed");
  });
}
if (failure || cleanupFailures.length) {
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        status: "FAIL",
        runId: owner,
        observedAt: new Date().toISOString(),
        results,
        fixtureCleanupVerified: cleanupFailures.length === 0,
        liveDeploymentPerformed: false,
      },
      null,
      2,
    ),
  );
  if (failure) throw failure;
  throw Error(cleanupFailures.join("; "));
}
report.fixtureCleanupVerified = true;
await writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
