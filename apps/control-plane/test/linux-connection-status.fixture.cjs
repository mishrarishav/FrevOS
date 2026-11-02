// Run only in the owned, non-root, network-isolated Linux verification container.
const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os"),
  crypto = require("node:crypto"),
  assert = require("node:assert/strict");
(async () => {
  assert.equal(process.platform, "linux");
  assert.notEqual(process.getuid(), 0);
  const home = os.homedir();
  assert.equal(home, "/tmp/devsetu-fixture");
  await fs.mkdir(home, { recursive: true, mode: 0o700 });
  await fs.mkdir(path.join(home, "Desktop"), { mode: 0o700 });
  const apps = path.join(home, ".local/share/applications");
  await fs.mkdir(apps, { recursive: true, mode: 0o755 });
  await fs.chmod(apps, 0o755);
  const adapter = require("../../../deployment/servix/SystemLinuxInstaller.cjs");
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
    hashes[name] = crypto
      .createHash("sha256")
      .update(await fs.readFile(target))
      .digest("hex");
  }
  await fs.writeFile(
    path.join(bundle, "system-runtime-manifest.json"),
    JSON.stringify({ version: 1, files: hashes }),
  );
  const commands = [];
  const runtime = adapter.context({
    bundle,
    run: async (executable, args) => {
      assert.equal(executable, "/usr/bin/systemctl");
      assert.equal(args[0], "--user");
      commands.push(args[1]);
      return "";
    },
  });
  const id = "fc_" + "a".repeat(32);
  const config = {
    version: 1,
    mode: "system",
    deviceId: id,
    server: "https://synthetic.invalid",
    allowInternalHttp: false,
    credential: id + "." + crypto.randomBytes(32).toString("base64url"),
    monitoringRoot: home,
    fileActivity: false,
    accountName: "pair:" + "b".repeat(40),
  };
  await runtime.install(config);
  const directory = path.join(home, ".local/share/FrevOS/Connector", id);
  const app = path.join(apps, "devsetu-status-" + id + ".desktop");
  const desktop = path.join(home, "Desktop", path.basename(app));
  assert.equal(await fs.readFile(app, "utf8"), await fs.readFile(desktop, "utf8"));
  assert.match(await fs.readFile(app, "utf8"), /--connection-status/);
  assert.match(await fs.readFile(path.join(directory, "devsetu-status.svg"), "utf8"), />D</);
  assert.match(
    await fs.readFile(path.join(directory, "connection-offline.html"), "utf8"),
    /Connector is offline/,
  );
  assert.equal((await fs.stat(apps)).mode & 0o777, 0o755);
  assert.equal((await fs.stat(path.join(directory, "device.json"))).mode & 0o077, 0);
  const privateBefore = await fs.readFile(path.join(directory, "device.json"));
  await runtime.resume({
    deviceId: id,
    server: config.server,
    username: config.accountName,
    fileActivity: false,
  });
  assert.deepEqual(await fs.readFile(path.join(directory, "device.json")), privateBefore);
  await fs.writeFile(app, "user-owned unknown launcher");
  await assert.rejects(
    () =>
      runtime.resume({
        deviceId: id,
        server: config.server,
        username: config.accountName,
        fileActivity: false,
      }),
    /linux-existing-launcher-changed/,
  );
  assert.equal(await fs.readFile(app, "utf8"), "user-owned unknown launcher");
  console.log(
    JSON.stringify({
      status: "PASS",
      applicationLauncher: true,
      desktopLauncher: true,
      brandedIcon: true,
      offlinePage: true,
      preservedSharedDirectoryMode: true,
      preservedCredential: true,
      preservedUnknownLauncher: true,
      systemd: "stubbed",
    }),
  );
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
