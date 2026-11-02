// Actual files/processes in a test-owned non-root, network-isolated container.
const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os"),
  crypto = require("node:crypto"),
  assert = require("node:assert/strict"),
  http = require("node:http"),
  { spawn } = require("node:child_process"),
  { once } = require("node:events");
const hash = (b) => crypto.createHash("sha256").update(b).digest("hex");
(async () => {
  assert.equal(process.platform, "linux");
  assert.notEqual(process.getuid(), 0);
  assert.equal(os.homedir(), "/tmp/devsetu-software-fixture");
  const home = os.homedir();
  await fs.mkdir(home, { recursive: true, mode: 0o700 });
  await fs.mkdir(path.join(home, ".local/share/applications"), { recursive: true });
  const adapter = require("../../../deployment/servix/SystemLinuxInstaller.cjs"),
    native = require("../../../deployment/servix/SoftwareNative.cjs");
  const bundle = path.join(home, "bundle");
  await fs.mkdir(bundle);
  const hashes = {};
  for (const name of adapter.runtimeFiles) {
    const target = path.join(bundle, name);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(
      name === "runtime/bin/node" ? process.execPath : path.join("/source/deployment/servix", name),
      target,
    );
    hashes[name] = hash(await fs.readFile(target));
  }
  const manifest = Buffer.from(JSON.stringify({ version: 1, files: hashes }));
  await fs.writeFile(path.join(bundle, "system-runtime-manifest.json"), manifest);
  let failStart = false;
  const runtime = adapter.context({
    bundle,
    run: async (executable, args) => {
      assert.equal(executable, "/usr/bin/systemctl");
      assert.equal(args[0], "--user");
      if (failStart && args[1] === "start") {
        failStart = false;
        throw Error("synthetic systemd start failure");
      }
      return "";
    },
  });
  const additions = [
    "SoftwareClient.cjs",
    "SoftwareNative.cjs",
    "SoftwareNative.ps1",
    "SoftwareProtocol.cjs",
    "DemoApi.cjs",
    "PreviewRelay.cjs",
  ];
  async function legacy(letter) {
    const id = "fc_" + letter.repeat(32),
      config = {
        version: 1,
        mode: "system",
        deviceId: id,
        server: "https://synthetic.invalid",
        credential: id + "." + crypto.randomBytes(32).toString("base64url"),
        monitoringRoot: home,
        fileActivity: false,
        accountName: "pair:" + "b".repeat(40),
      };
    await runtime.install(config);
    const root = path.join(home, ".local/share/FrevOS/Connector", id),
      file = path.join(root, "device.json");
    const saved = JSON.parse(await fs.readFile(file, "utf8"));
    const oldFiles = { ...hashes };
    for (const name of additions) {
      await fs.unlink(path.join(root, name));
      delete oldFiles[name];
    }
    const oldManifest = Buffer.from(JSON.stringify({ version: 1, files: oldFiles }));
    await fs.writeFile(path.join(root, "system-runtime-manifest.json"), oldManifest);
    saved.runtimeManifestSha256 = hash(oldManifest);
    await fs.writeFile(file, JSON.stringify(saved), { mode: 0o600 });
    await fs.writeFile(path.join(root, "state/retained.txt"), "retained monitoring history");
    return { root, config: saved, bytes: await fs.readFile(file) };
  }
  const first = await legacy("a");
  assert.equal(
    (
      await runtime.update({
        deviceId: first.config.deviceId,
        server: first.config.server,
        username: first.config.accountName,
        manifestSha256: hash(manifest),
      })
    ).updated,
    true,
  );
  const upgraded = JSON.parse(await fs.readFile(path.join(first.root, "device.json"), "utf8"));
  assert.equal(upgraded.credential, first.config.credential);
  assert.equal(upgraded.runtimeManifestSha256, hash(manifest));
  assert.equal(
    await fs.readFile(path.join(first.root, "state/retained.txt"), "utf8"),
    "retained monitoring history",
  );
  await runtime.softwareConsent({
    deviceId: upgraded.deviceId,
    server: upgraded.server,
    username: upgraded.accountName,
    inventory: true,
    install: true,
  });
  assert.equal(
    JSON.parse(await fs.readFile(path.join(first.root, "state/software/consent.json"), "utf8"))
      .install,
    true,
  );
  const second = await legacy("b");
  failStart = true;
  await assert.rejects(
    () =>
      runtime.update({
        deviceId: second.config.deviceId,
        server: second.config.server,
        username: second.config.accountName,
        manifestSha256: hash(manifest),
      }),
    /recovered-previous-runtime/,
  );
  assert.deepEqual(await fs.readFile(path.join(second.root, "device.json")), second.bytes);
  for (const name of additions)
    await assert.rejects(() => fs.access(path.join(second.root, name)), { code: "ENOENT" });
  const inventory = await native.inventory();
  assert.equal(inventory.platform, "linux");
  assert.ok(["ready", "partial"].includes(inventory.status));
  assert.ok(inventory.items.length > 0);
  let heartbeat = false,
    software = false;
  const server = http.createServer(async (req, res) => {
    for await (const b of req) {
    }
    let result = {};
    if (req.url === "/v1/connector/heartbeat") heartbeat = true;
    if (req.url === "/v1/connector/software/identity")
      result = { workspaceId: "ws_fixture", deviceId: upgraded.deviceId };
    if (req.url === "/v1/connector/software/observe") {
      software = true;
      result = { observed: true };
    }
    if (req.url.endsWith("/claim")) result = { job: null };
    if (req.url === "/v1/connector/discovery/policy")
      result = {
        revision: 1,
        policy: {
          ...require("../../../deployment/servix/SystemDiscovery.cjs").defaultPolicy,
          enabled: false,
        },
      };
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(result));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const child = spawn(process.execPath, [path.join(first.root, "Connector.cjs")], {
    stdio: ["pipe", "ignore", "pipe"],
  });
  let diagnostic = "";
  child.stderr.on("data", (b) => (diagnostic += b));
  child.stdin.end(
    JSON.stringify({
      ...upgraded,
      server: "http://127.0.0.1:" + server.address().port,
      allowInternalHttp: true,
    }),
  );
  try {
    const deadline = Date.now() + 15000;
    while ((!heartbeat || !software) && Date.now() < deadline) {
      if (child.exitCode !== null) throw Error("connector exited before heartbeat");
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(heartbeat && software);
    assert.equal(diagnostic, "");
  } finally {
    child.kill();
    await once(child, "exit");
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
  console.log(
    JSON.stringify({
      status: "PASS",
      legacyMigration: true,
      credentialAndHistoryPreserved: true,
      failedStartRestored: true,
      softwareConsent: true,
      actualLinuxInventory: true,
      installedConnectorHeartbeat: true,
      softwareCapability: true,
      systemd: "stubbed",
      realLinuxDesktopAcceptance: false,
    }),
  );
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
