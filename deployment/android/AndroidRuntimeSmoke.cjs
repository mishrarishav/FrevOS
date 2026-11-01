// Fixed, isolated emulator smoke check. No user-supplied command, device serial,
// filesystem target or real phone is accepted by this operator operation.
const fs = require("node:fs/promises"),
  raw = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  net = require("node:net"),
  { spawn } = require("node:child_process");
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
async function hashFile(file) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of raw.createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
function inside(root, relative) {
  const target = path.resolve(root, relative);
  if (!target.startsWith(path.resolve(root) + path.sep)) throw Error("android-runtime-path-denied");
  return target;
}
async function plain(root, file) {
  for (let cursor = path.resolve(file); ; cursor = path.dirname(cursor)) {
    if ((await fs.lstat(cursor)).isSymbolicLink()) throw Error("android-runtime-path-linked");
    if (cursor === path.resolve(root)) return;
    if (path.dirname(cursor) === cursor) throw Error("android-runtime-path-denied");
  }
}
async function json(root, file) {
  await plain(root, file);
  if ((await fs.stat(file)).size > 65536) throw Error("android-runtime-input-capacity");
  return JSON.parse(await fs.readFile(file, "utf8"));
}
async function available(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", () => reject(Error("android-runtime-ports-in-use")));
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
}
async function run(file, args, cwd, env, allowAbsent = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      cwd,
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "",
      bytes = 0;
    const timer = setTimeout(() => child.kill(), 90000);
    const receive = (data) => {
      bytes += data.length;
      if (bytes > 65536) child.kill();
      else output += data;
    };
    child.stdout.on("data", receive);
    child.stderr.on("data", receive);
    child.once("error", () => {
      clearTimeout(timer);
      reject(Error("android-runtime-tool-start-failed"));
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0 || (allowAbsent && code === 1)) resolve(output);
      else {
        const error = Error("android-runtime-tool-failed");
        error.toolExitCode = code;
        reject(error);
      }
    });
  });
}
async function smoke(configPath) {
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  if (config.phase !== "runtime-smoke") throw Error("android-runtime-mode-denied");
  const planPath = inside(
    config.root,
    path.relative(config.root, config.runtimeSmokePlanReference),
  );
  await plain(config.root, planPath);
  if (sha(await fs.readFile(planPath)) !== config.runtimeSmokePlanSha256)
    throw Error("android-runtime-plan-integrity");
  const plan = await json(config.root, planPath),
    now = Date.now();
  if (
    plan.version !== 1 ||
    plan.action !== "android-runtime:smoke" ||
    !/^at_[a-f0-9]{32}$/.test(plan.id) ||
    plan.workspaceId !== config.workspaceId ||
    plan.profileId !== config.profileId ||
    plan.repositoryId !== config.repositoryId ||
    plan.targetLocalRoot !== config.root ||
    !/^ab_[a-f0-9]{32}$/.test(plan.apkJobId) ||
    !/^[a-f0-9]{40}$/.test(plan.sourceHead) ||
    !/^[a-f0-9]{64}$/.test(plan.apkSha256) ||
    Date.parse(plan.expiresAt) <= now ||
    Date.parse(plan.issuedAt) > now ||
    Date.parse(plan.expiresAt) - Date.parse(plan.issuedAt) > 900000
  )
    throw Error("android-runtime-scope-denied");
  const receipt = inside(config.root, "results/" + plan.id + ".json"),
    directory = inside(config.root, "jobs/" + plan.id);
  await fs.mkdir(directory);
  await fs.writeFile(
    inside(directory, "consumed.json"),
    JSON.stringify({
      version: 1,
      id: plan.id,
      action: plan.action,
      actorSid: plan.actorSid,
      workspaceId: plan.workspaceId,
      profileId: plan.profileId,
      repositoryId: plan.repositoryId,
      apkSha256: plan.apkSha256,
      expiresAt: plan.expiresAt,
    }),
    { flag: "wx" },
  );
  let phase = "integrity",
    emulator,
    adbDaemon,
    checks = {};
  const classifications = new Set();
  const env = Object.fromEntries(
    ["SystemRoot", "WINDIR", "TEMP", "TMP", "PATH"].flatMap((key) =>
      process.env[key] ? [[key, process.env[key]]] : [],
    ),
  );
  env.ANDROID_EMULATOR_HOME = inside(directory, "home");
  env.ANDROID_AVD_HOME = inside(directory, "avd");
  env.ANDROID_USER_HOME = env.ANDROID_EMULATOR_HOME;
  env.ANDROID_SDK_HOME = directory;
  env.ANDROID_SDK_ROOT = inside(config.root, "sdk");
  env.USERPROFILE = inside(directory, "profile");
  env.HOME = env.USERPROFILE;
  env.LOCALAPPDATA = inside(env.USERPROFILE, "AppData/Local");
  env.APPDATA = inside(env.USERPROFILE, "AppData/Roaming");
  env.TEMP = inside(directory, "temp");
  env.TMP = env.TEMP;
  const adbSocket = "tcp:localhost:5049";
  env.ADB_SERVER_SOCKET = adbSocket;
  env.ANDROID_ADB_SERVER_ADDRESS = "localhost";
  env.ANDROID_ADB_SERVER_PORT = "5049";
  env.ADB_MDNS_AUTO_CONNECT = "0";
  env.ADB_LOCAL_TRANSPORT_MAX_PORT = "5589";
  let adb;
  try {
    const resources = require("node:os");
    if (resources.freemem() < 6 * 1024 ** 3 || resources.availableParallelism() < 4)
      throw Error("android-runtime-host-capacity-insufficient");
    const built = await json(
      config.root,
      inside(config.root, "results/" + plan.apkJobId + ".json"),
    );
    if (
      built.status !== "SIGNED" ||
      built.sourceHead !== plan.sourceHead ||
      built.apkSha256 !== plan.apkSha256 ||
      !config.signing ||
      built.certificateSha256 !== config.signing.certificateSha256
    )
      throw Error("android-runtime-artifact-mismatch");
    const apk = inside(config.root, "jobs/" + plan.apkJobId + "/DevSetu-Android.apk");
    await plain(config.root, apk);
    if ((await hashFile(apk)) !== plan.apkSha256) throw Error("android-runtime-artifact-integrity");
    const sdk = await json(config.root, inside(config.root, "sdk/sdk-state.json")),
      runtime = await json(config.root, inside(config.root, "sdk/runtime-state.json"));
    if (runtime.status !== "READY" || runtime.tools.length !== 7)
      throw Error("android-runtime-not-installed");
    const adbTool = sdk.tools.find((tool) => tool.id === "adb");
    const tools = [...runtime.tools, adbTool];
    for (const tool of tools) {
      if (!tool || !/^[a-f0-9]{64}$/.test(tool.sha256))
        throw Error("android-runtime-tool-not-enrolled");
      const file = inside(config.root, tool.path);
      await plain(config.root, file);
      if ((await hashFile(file)) !== tool.sha256) throw Error("android-runtime-tool-integrity");
    }
    const tool = (id) => inside(config.root, tools.find((entry) => entry.id === id).path);
    adb = tool("adb");
    const emulatorDirectory = path.dirname(tool("emulator"));
    env.PATH = [
      emulatorDirectory,
      path.join(emulatorDirectory, "lib64"),
      path.join(emulatorDirectory, "lib64/qt/lib"),
      env.PATH,
    ]
      .filter(Boolean)
      .join(path.delimiter);
    checks.signedArtifactIntegrity = true;
    for (const port of [5049, 5588, 5589]) await available(port);
    const avd = inside(env.ANDROID_AVD_HOME, "DevSetuSmoke.avd");
    await fs.mkdir(avd, { recursive: true });
    await fs.mkdir(env.ANDROID_EMULATOR_HOME, { recursive: true });
    for (const owned of [env.USERPROFILE, env.LOCALAPPDATA, env.APPDATA, env.TEMP])
      await fs.mkdir(owned, { recursive: true });
    phase = "runtime-engine-check";
    await run(tool("qemu"), ["-version"], directory, env);
    checks.runtimeEngineExecutable = true;
    const image = path.dirname(tool("system"));
    await fs.writeFile(
      inside(env.ANDROID_AVD_HOME, "DevSetuSmoke.ini"),
      "avd.ini.encoding=UTF-8\npath=" + avd + "\ntarget=android-36\n",
      { flag: "wx" },
    );
    await fs.writeFile(
      inside(avd, "config.ini"),
      "avd.ini.encoding=UTF-8\nabi.type=x86_64\nhw.cpu.arch=x86_64\nhw.cpu.ncore=2\nhw.ramSize=2048\nhw.lcd.width=480\nhw.lcd.height=800\nhw.lcd.density=160\nhw.gpu.enabled=yes\nhw.gpu.mode=swiftshader\nimage.sysdir.1=" +
        image +
        path.sep +
        "\ntag.id=default\ntag.display=Default Android System Image\nPlayStore.enabled=false\ndisk.dataPartition.size=2G\n",
      { flag: "wx" },
    );
    phase = "emulator-boot";
    adbDaemon = spawn(adb, ["-L", adbSocket, "--one-device", plan.id, "server", "nodaemon"], {
      cwd: directory,
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const classifyAdb = (data) => {
      const output = data.toString();
      for (const [code, pattern] of Object.entries({
        "adb-bind-failed": /cannot bind|address already in use|could not install.*listener/i,
        "adb-option-rejected": /unknown option|unrecognized option|usage:/i,
        "adb-version-conflict": /server version.*doesn.t match|killing.*daemon/i,
        "adb-file-access": /access is denied|permission denied|cannot open/i,
        "adb-server-start-failed": /failed to start|could not start|cannot start/i,
        "adb-address-in-use": /\b10048\b/,
        "adb-address-unavailable": /\b10049\b/,
        "adb-socket-access-denied": /\b10013\b/,
        "adb-profile-unavailable":
          /could not create.*android|cannot mkdir|home directory|user profile/i,
      }))
        if (pattern.test(output)) classifications.add(code);
    };
    adbDaemon.stdout.on("data", classifyAdb);
    adbDaemon.stderr.on("data", classifyAdb);
    adbDaemon.once("error", () => classifications.add("adb-start-failed"));
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (adbDaemon.exitCode !== null) throw Error("android-runtime-adb-exited");
    emulator = spawn(
      tool("emulator"),
      [
        "-avd",
        "DevSetuSmoke",
        "-sysdir",
        image,
        "-kernel",
        tool("kernel"),
        "-ramdisk",
        tool("ramdisk"),
        "-system",
        tool("system"),
        "-ports",
        "5588,5589",
        "-no-window",
        "-no-snapshot",
        "-no-audio",
        "-no-boot-anim",
        "-camera-back",
        "none",
        "-camera-front",
        "none",
        "-gpu",
        "swiftshader",
        "-accel",
        "off",
        "-memory",
        "2048",
        "-cores",
        "2",
      ],
      { cwd: directory, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    const classify = (data) => {
      const output = data.toString();
      for (const flag of [
        "WHPX",
        "HAXM",
        "hypervisor",
        "requires hardware acceleration",
        "TCG",
        "PANIC",
        "FATAL",
        "Unknown AVD",
        "Access is denied",
      ])
        if (output.includes(flag)) classifications.add(flag);
      const reasons = {
        "missing-kernel": /configuration is missing a kernel file/i,
        "sdk-system-path":
          /broken AVD system path|cannot find AVD system path|define ANDROID_SDK_ROOT/i,
        "cpu-acceleration-required": /requires hardware acceleration/i,
        "user-data-initialization": /userdata|data partition|initdata/i,
        "graphics-initialization": /(?:failed|could not|cannot).*(?:Vulkan|OpenGL|GPU)/i,
        "runtime-file-access": /access is denied|permission denied/i,
        "invalid-avd-configuration": /unknown AVD|could not read.*ini|invalid AVD/i,
      };
      for (const [code, pattern] of Object.entries(reasons))
        if (pattern.test(output)) classifications.add(code);
    };
    emulator.stdout.on("data", classify);
    emulator.stderr.on("data", classify);
    emulator.once("error", () => classifications.add("emulator-start-failed"));
    const bootDeadline = Date.now() + 480000;
    let booted = false;
    while (Date.now() < bootDeadline) {
      if (emulator.exitCode !== null) throw Error("android-runtime-emulator-exited");
      if (adbDaemon.exitCode !== null) throw Error("android-runtime-adb-exited");
      try {
        if (
          (
            await run(
              adb,
              ["-s", "emulator-5588", "shell", "getprop", "sys.boot_completed"],
              directory,
              env,
            )
          ).trim() === "1"
        ) {
          booted = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    if (!booted) throw Error("android-runtime-boot-deadline");
    checks.androidBoot = true;
    phase = "install";
    if (
      !(await run(adb, ["-s", "emulator-5588", "install", "-r", apk], directory, env)).includes(
        "Success",
      )
    )
      throw Error("android-runtime-install-failed");
    checks.install = true;
    phase = "launch";
    const launch = await run(
      adb,
      [
        "-s",
        "emulator-5588",
        "shell",
        "am",
        "start",
        "-W",
        "-n",
        "org.devsetu.connector/.MainActivity",
      ],
      directory,
      env,
    );
    if (!/Status:\s*ok/.test(launch)) throw Error("android-runtime-launch-failed");
    if (
      !/^[0-9\s]+$/.test(
        (
          await run(
            adb,
            ["-s", "emulator-5588", "shell", "pidof", "org.devsetu.connector"],
            directory,
            env,
          )
        ).trim(),
      )
    )
      throw Error("android-runtime-process-missing");
    checks.launch = true;
    phase = "same-apk-update";
    if (
      !(await run(adb, ["-s", "emulator-5588", "install", "-r", apk], directory, env)).includes(
        "Success",
      )
    )
      throw Error("android-runtime-update-failed");
    checks.sameApkUpdate = true;
    await run(
      adb,
      ["-s", "emulator-5588", "shell", "am", "force-stop", "org.devsetu.connector"],
      directory,
      env,
    );
    checks.ownedAppStop = true;
    const result = {
      version: 1,
      status: "PASS",
      id: plan.id,
      sourceHead: plan.sourceHead,
      apkSha256: plan.apkSha256,
      checks,
      physicalDeviceTested: false,
      nativePairingTested: false,
      at: new Date().toISOString(),
    };
    await fs.writeFile(receipt, JSON.stringify(result), { flag: "wx" });
  } catch (error) {
    await fs.writeFile(
      receipt,
      JSON.stringify({
        version: 1,
        status: "FAIL",
        id: plan.id,
        phase,
        checks,
        code: /^[a-z-]{1,80}$/.test(error.message) ? error.message : "android-runtime-failed",
        classifications: [...classifications],
        runtimeHost: {
          platform: process.platform,
          release: require("node:os").release(),
          version: require("node:os").version(),
        },
        toolExitCode: Number.isInteger(error.toolExitCode) ? error.toolExitCode : null,
        emulatorExitCode: emulator?.exitCode ?? null,
        adbExitCode: adbDaemon?.exitCode ?? null,
        physicalDeviceTested: false,
        nativePairingTested: false,
        at: new Date().toISOString(),
      }),
      { flag: "wx" },
    );
  } finally {
    if (emulator && emulator.exitCode === null) emulator.kill();
    if (adbDaemon && adbDaemon.exitCode === null) adbDaemon.kill();
  }
}
if (require.main === module && process.argv.length === 4 && process.argv[2] === "--config")
  smoke(process.argv[3]).catch(() => {
    process.exitCode = 1;
  });
