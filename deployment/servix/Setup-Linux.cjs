"use strict";
const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
const { spawn } = require("node:child_process"),
  { Writable } = require("node:stream");
const { run } = require("./SystemPrerequisites.cjs");
const { serve } = require("./SystemSetup.cjs");
const sourceFiles = [
  "SystemLinuxInstaller.cjs",
  "Setup-SystemLinux.cjs",
  "DeviceEnrollment.cjs",
  "DeviceEnrollmentClient.js",
  "SystemEnrollment.cjs",
  "SetupSession.cjs",
  "Connector.cjs",
  "Preservation.cjs",
  "LocalDevelopment.cjs",
  "PreviewRelay.cjs",
  "LocalDevBoundary.cjs",
  "EnvironmentEditor.cjs",
  "DiscoverySafety.cjs",
  "FileAudit.cjs",
  "SystemDiscovery.cjs",
  "FolderBrowse.cjs",
  "Browse-Folders.py",
  "SystemPrerequisites.cjs",
  "SystemSetup.cjs",
  "SystemSetupClient.js",
  "NodeToolchain.cjs",
  "DotNetToolchain.cjs",
  "LinuxController.cjs",
  "LinuxProcesses.cjs",
  "Stop-LinuxProcess.py",
  "Write-LinuxEnvironment.py",
];
async function plain(file) {
  for (let current = path.resolve(file); ; ) {
    if ((await fs.lstat(current)).isSymbolicLink()) throw Error("linked-enrollment-path");
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}
const quote = (value) =>
  '"' + value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("%", "%%") + '"';
function unitText(directory, configFile) {
  if (
    [directory, configFile].some(
      (value) =>
        !path.posix.isAbsolute(value) ||
        value.includes("\\") ||
        [...value].some(
          (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
        ),
    )
  )
    throw Error("source-service-path-invalid");
  return `[Unit]\nDescription=DevSetu enrolled source connector\nAfter=network-online.target\n\n[Service]\nType=exec\nExecStart=${quote(path.join(directory, "runtime/bin/node"))} ${quote(path.join(directory, "Connector.cjs"))}\nWorkingDirectory=${directory.replaceAll("%", "%%")}\nStandardInput=file:${configFile.replaceAll("%", "%%")}\nStandardOutput=null\nStandardError=null\nEnvironment=${quote("PATH=" + path.join(directory, "runtime/bin") + ":" + path.join(require("./SystemPrerequisites.cjs").toolRoot(), "bin") + ":/usr/local/bin:/usr/bin:/bin")}\nEnvironment=XDG_RUNTIME_DIR=/run/user/${process.getuid()}\nEnvironment=DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/${process.getuid()}/bus\nRestart=on-failure\nRestartSec=10\nKillMode=control-group\nTimeoutStopSec=15\nNoNewPrivileges=yes\nUMask=0077\n\n[Install]\nWantedBy=default.target\n`;
}
async function privateProcess(executable, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ["pipe", "ignore", "ignore"] });
    const timer = setTimeout(() => {
      child.kill();
      reject(Error("source-enrollment-timeout"));
    }, 240000);
    child.on("error", () => {
      clearTimeout(timer);
      reject(Error("source-enrollment-failed"));
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(Error("source-enrollment-failed"));
    });
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify(input));
  });
}
async function enroll(envelope, reviewProject) {
  if (process.platform !== "linux" || process.getuid() === 0)
    throw Error("source-enrollment-requires-linux-user");
  if (
    Object.keys(envelope).sort().join(",") !== "discoveryConsent,paired,repository,server,username"
  )
    throw Error("source-enrollment-envelope-invalid");
  const { paired, server, username } = envelope,
    repository = path.resolve(envelope.repository);
  let discoveryConsent = envelope.discoveryConsent;
  if (
    !/^fc_[a-f0-9]{32}$/.test(paired.deviceId) ||
    !new RegExp("^" + paired.deviceId + "\\.[A-Za-z0-9_-]{43}$").test(paired.credential) ||
    !/^[a-z][a-z0-9-]{2,63}$/.test(paired.profileId) ||
    typeof discoveryConsent !== "boolean"
  )
    throw Error("source-enrollment-envelope-invalid");
  const url = new URL(server);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw Error("source-enrollment-origin-invalid");
  // Verify the user's existing service manager before pairing/copying anything.
  await run("/usr/bin/systemctl", ["--user", "show-environment"]);
  await fs.access("/sys/fs/cgroup/cgroup.controllers");
  const home = await fs.realpath(os.homedir());
  await plain(home);
  const parent = path.join(home, ".local/share/FrevOS/Connector");
  await fs.mkdir(parent, { recursive: true, mode: 0o700 });
  await plain(parent);
  const directory = path.join(parent, paired.deviceId);
  await fs.mkdir(directory, { mode: 0o700 });
  const stateRoot = path.join(directory, "state");
  await fs.mkdir(stateRoot, { mode: 0o700 });
  const credentialFile = path.join(directory, "device.json"),
    unit = `devsetu-connector-${paired.deviceId}.service`;
  const git = (await run("/usr/bin/which", ["git"])).trim();
  if (!path.isAbsolute(git)) throw Error("source-git-unavailable");
  let rootExists = true;
  try {
    await plain(repository);
  } catch (e) {
    if (e.code === "ENOENT") rootExists = false;
    else throw e;
  }
  if (repository === "/" || /^\/(?:proc|sys|dev|run|etc|usr|boot|var)(?:\/|$)/.test(repository))
    throw Error("source-folder-outside-user-scope");
  if (rootExists && (await fs.stat(repository)).uid !== process.getuid())
    throw Error("source-folder-owner-mismatch");
  if (!rootExists) {
    await fs.mkdir(repository, { recursive: true, mode: 0o700 });
    await plain(repository);
  }
  const clone = !(await fs.readdir(repository)).includes(".git");
  if (clone && (await fs.readdir(repository)).length) throw Error("source-folder-not-empty");
  for (const file of sourceFiles) {
    await plain(path.join(__dirname, file));
    await fs.copyFile(
      path.join(__dirname, file),
      path.join(directory, file),
      require("node:fs").constants.COPYFILE_EXCL,
    );
  }
  const runtime = path.join(__dirname, "runtime");
  await plain(runtime);
  await fs.cp(runtime, path.join(directory, "runtime"), {
    recursive: true,
    force: false,
    errorOnExist: true,
  });
  await fs.chmod(path.join(directory, "runtime/bin/node"), 0o755);
  const config = {
    version: 1,
    server: url.origin,
    allowInternalHttp: url.protocol === "http:",
    deviceId: paired.deviceId,
    credential: paired.credential,
    profileId: paired.profileId,
    repository,
    repositoryOrigin: paired.repositoryOrigin,
    git,
    stateRoot,
    linuxService: unit,
    credentialFile,
    ...(paired.centralRepository ? { centralRepository: paired.centralRepository } : {}),
  };
  await privateProcess(
    path.join(directory, "runtime/bin/node"),
    [path.join(directory, "Connector.cjs"), clone ? "--initialize" : "--bind"],
    config,
  );
  const projectCheck = await require("./SystemPrerequisites.cjs").inspect(repository);
  if (projectCheck.blocked.length || projectCheck.tools.some((tool) => tool.status !== "ready")) {
    if (!reviewProject) throw Error("project-prerequisites-review-required");
    const reviewed = await reviewProject(repository, discoveryConsent);
    if (!reviewed.ready) throw Error("project-prerequisites-review-required");
    discoveryConsent = reviewed.discoveryConsent;
  }
  const branch = (await run(git, ["-C", repository, "symbolic-ref", "--short", "HEAD"])).trim();
  if (["main", "master"].includes(branch))
    await run(git, ["-C", repository, "switch", "-c", "frevos/" + paired.deviceId]);
  for (const [key, value] of [
    ["user.name", username],
    ["user.email", username + "@frevos.invalid"],
  ]) {
    try {
      await run(git, ["-C", repository, "config", "--get", key]);
    } catch {
      await run(git, ["-C", repository, "config", key, value]);
    }
  }
  await fs.writeFile(credentialFile, JSON.stringify(config), { flag: "wx", mode: 0o600 });
  if (discoveryConsent)
    await fs.writeFile(
      path.join(stateRoot, "discovery-consent.json"),
      JSON.stringify({
        version: 1,
        deviceId: paired.deviceId,
        metadata: true,
        approvedAt: new Date().toISOString(),
      }),
      { flag: "wx", mode: 0o600 },
    );
  const units = path.join(home, ".config/systemd/user");
  await fs.mkdir(units, { recursive: true, mode: 0o700 });
  await plain(units);
  await fs.writeFile(path.join(units, unit), unitText(directory, credentialFile), {
    flag: "wx",
    mode: 0o600,
  });
  await run("/usr/bin/systemctl", ["--user", "daemon-reload"]);
  await run("/usr/bin/systemctl", ["--user", "enable", "--now", unit], 30000);
  await run("/usr/bin/systemctl", ["--user", "is-active", unit]);
  return {
    status: "PASS",
    deviceId: paired.deviceId,
    installation: directory,
    service: unit,
    discoveryConsent,
  };
}
async function interactive() {
  if (!process.stdin.isTTY || process.platform !== "linux" || process.getuid() === 0) throw Error();
  let hidden = false;
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!hidden) process.stderr.write(chunk);
      callback();
    },
  });
  const rl = require("node:readline").createInterface({
    input: process.stdin,
    output,
    terminal: true,
  });
  const ask = (prompt, secret = false) =>
    new Promise((resolve) => {
      hidden = secret;
      if (secret) process.stderr.write(prompt);
      rl.question(secret ? "" : prompt, (answer) => {
        hidden = false;
        if (secret) process.stderr.write("\n");
        resolve(answer);
      });
    });
  let paired, api;
  try {
    const server = (await ask("DevSetu server origin: ")).trim().replace(/\/$/, "");
    const url = new URL(server);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      throw Error();
    if (
      url.protocol === "http:" &&
      (await ask("Use this internal HTTP/VPN origin? Type YES: ")) !== "YES"
    )
      throw Error();
    const repository = path.resolve(
      await ask("Local project folder (existing checkout or empty new folder): "),
    );
    rl.pause();
    process.stdin.setRawMode(false);
    const setup = await serve(repository, { elevation: "terminal" }),
      ready = await setup.result;
    rl.resume();
    process.stdin.setRawMode(true);
    if (!ready.ready) throw Error();
    await run("/usr/bin/systemctl", ["--user", "show-environment"]);
    await fs.access("/sys/fs/cgroup/cgroup.controllers");
    const username = (await ask("DevSetu username: ")).trim();
    if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(username)) throw Error();
    let password = await ask("DevSetu password: ", true);
    let login = await fetch(server + "/auth/login", {
      method: "POST",
      redirect: "error",
      headers: { origin: server, "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(15000),
    });
    password = null;
    login = await require("./Connector.cjs").completeDeviceLogin(server, login);
    if (!login.ok) throw Error();
    const cookies = login.headers.getSetCookie().map((c) => c.split(";")[0]),
      csrf = cookies
        .find((c) => c.startsWith("frevos-internal-csrf=") || c.startsWith("__Host-frevos-csrf="))
        ?.split("=")
        .slice(1)
        .join("=");
    if (!csrf) throw Error();
    api = async (route, body) => {
      const response = await fetch(server + route, {
        method: body ? "POST" : "GET",
        redirect: "error",
        headers: {
          origin: server,
          "content-type": "application/json",
          "x-csrf-token": decodeURIComponent(csrf),
          cookie: cookies.join("; "),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw Error("source-enrollment-api-unavailable");
      return response.json();
    };
    const state = await api("/v1/workspaces/ws_server20/component-deployments");
    const profiles = state.profiles.filter((p) => !p.archived);
    if (!profiles.length) throw Error();
    profiles.forEach((p, i) => {
      process.stderr.write(`${i + 1}. ${p.displayName} [${p.profileId}]\n`);
    });
    const selected = Number(await ask("Project number: ")) - 1;
    if (!Number.isInteger(selected) || !profiles[selected]) throw Error();
    paired = await api("/v1/workspaces/ws_server20/connectors/pair", {
      version: 1,
      profileId: profiles[selected].profileId,
      name: os.hostname().slice(0, 80),
    });
    const enrolled = await enroll(
      {
        server,
        username,
        repository,
        paired,
        discoveryConsent: ready.discoveryConsent,
      },
      async (folder, consent) => {
        rl.pause();
        process.stdin.setRawMode(false);
        try {
          return await (await serve(folder, { elevation: "terminal", initialConsent: consent }))
            .result;
        } finally {
          rl.resume();
          process.stdin.setRawMode(true);
        }
      },
    );
    if (enrolled.discoveryConsent)
      await api("/v1/workspaces/ws_server20/discovery/policy", {
        version: 1,
        deviceId: paired.deviceId,
        expectedRevision: 0,
        policy: { ...require("./SystemDiscovery.cjs").defaultPolicy, enabled: true },
      });
    return enrolled;
  } catch {
    if (paired && api)
      await api("/v1/workspaces/ws_server20/connectors/" + paired.deviceId + "/revoke", {}).catch(
        () => {},
      );
    throw Error("source-enrollment-failed");
  } finally {
    rl.close();
  }
}
if (require.main === module)
  interactive()
    .then((result) => process.stdout.write(JSON.stringify(result) + "\n"))
    .catch(() => {
      process.stderr.write(
        "DevSetu Linux enrollment did not complete. Check project requirements, VPN/login, repository identity and the user systemd/cgroup-v2 service manager. Existing projects were not replaced.\n",
      );
      process.exitCode = 1;
    });
module.exports = { enroll, unitText, sourceFiles };
