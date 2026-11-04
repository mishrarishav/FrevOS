"use strict";
const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os"),
  { createHash, randomBytes } = require("node:crypto");
const { run } = require("./SystemPrerequisites.cjs");
const { serverOrigin } = require("./SystemEnrollment.cjs");
const legacyRuntimeFiles = [
  "Connector.cjs",
  "Preservation.cjs",
  "SystemDiscovery.cjs",
  "DiscoverySafety.cjs",
  "FileAudit.cjs",
  "FolderBrowse.cjs",
  "Browse-Folders.py",
  "runtime/bin/node",
];
const runtimeFiles = [
  ...legacyRuntimeFiles,
  "SoftwareClient.cjs",
  "SoftwareNative.cjs",
  "SoftwareNative.ps1",
  "SoftwareProtocol.cjs",
  "DemoApi.cjs",
  "PreviewRelay.cjs",
];
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
function statusLauncher(folder, credentialFile) {
  const values = [
    path.posix.join(folder, "runtime/bin/node"),
    path.posix.join(folder, "Connector.cjs"),
    credentialFile,
  ];
  if (
    values.some(
      (value) =>
        !path.posix.isAbsolute(value) ||
        value.includes("\\") ||
        [...value].some(
          (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
        ),
    )
  )
    throw Error("linux-status-launcher-path-invalid");
  const quote = (value) => '"' + value.replaceAll('"', '\\"').replaceAll("%", "%%") + '"';
  return (
    "[Desktop Entry]\nType=Application\nName=DevSetu Connection Status\nComment=Check this computer connection\nTerminal=false\nIcon=" +
    path.posix.join(folder, "devsetu-status.svg") +
    "\nExec=" +
    values.slice(0, 2).map(quote).join(" ") +
    " --connection-status " +
    quote(credentialFile) +
    "\n"
  );
}
async function plain(file, uid = process.getuid()) {
  for (let current = path.resolve(file); ; current = path.dirname(current)) {
    const info = await fs.lstat(current);
    if (info.isSymbolicLink()) throw Error("linux-connection-linked-path");
    if (current === path.resolve(file) && info.uid !== uid)
      throw Error("linux-connection-owner-mismatch");
    if (path.dirname(current) === current) break;
  }
}
async function privateDirectory(directory) {
  // Inspect existing ancestors before mkdir can traverse them.
  let ancestor = path.resolve(directory);
  for (;;) {
    try {
      await fs.lstat(ancestor);
      break;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      ancestor = path.dirname(ancestor);
    }
  }
  await plain(ancestor);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await plain(directory);
  await fs.chmod(directory, 0o700);
}
async function readPrivate(file) {
  await plain(file);
  const info = await fs.lstat(file);
  if (!info.isFile() || info.size > 32768 || info.mode & 0o077)
    throw Error("linux-connection-protection-invalid");
  return JSON.parse(await fs.readFile(file, "utf8"));
}
async function writePrivate(file, value, fresh = false) {
  await privateDirectory(path.dirname(file));
  try {
    await plain(file);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const temporary = fresh ? file : file + "." + randomBytes(8).toString("hex"),
    handle = await fs.open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(JSON.stringify(value));
    await handle.sync();
  } finally {
    await handle.close();
  }
  if (!fresh) await fs.rename(temporary, file);
}
function context(options = {}) {
  if (process.platform !== "linux" || process.arch !== "x64" || process.getuid() === 0)
    throw Error("linux-user-x64-required");
  const home = os.homedir(),
    parent = path.join(home, ".local/share/FrevOS/Connector"),
    bundle = options.bundle || __dirname,
    execute = options.run || run;
  const directory = (id) => {
    if (!/^fc_[a-f0-9]{32}$/.test(id)) throw Error("linux-device-id-invalid");
    return path.join(parent, id);
  };
  const unit = (id) => {
    directory(id);
    return `devsetu-connector-${id}.service`;
  };
  async function createStatusLauncher(config) {
    const applications = path.join(home, ".local/share/applications");
    await plain(path.dirname(applications));
    await fs.mkdir(applications, { recursive: true, mode: 0o700 });
    await plain(applications);
    const offlineFile = path.join(directory(config.deviceId), "connection-offline.html");
    const offline = require("./Connector.cjs").connectionOfflinePage;
    try {
      await fs.writeFile(offlineFile, offline, { flag: "wx", mode: 0o600 });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      await plain(offlineFile);
      if ((await fs.readFile(offlineFile, "utf8")) !== offline)
        throw Error("linux-existing-status-page-changed");
    }
    const iconFile = path.join(directory(config.deviceId), "devsetu-status.svg");
    const icon =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#0d191f"/><text x="14" y="47" font-family="sans-serif" font-weight="700" font-size="44" fill="#00d2d8">D</text></svg>';
    try {
      await fs.writeFile(iconFile, icon, { flag: "wx", mode: 0o600 });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      await plain(iconFile);
      if ((await fs.readFile(iconFile, "utf8")) !== icon)
        throw Error("linux-existing-status-icon-changed");
    }
    const entry = path.join(applications, "devsetu-status-" + config.deviceId + ".desktop");
    const text = statusLauncher(
      directory(config.deviceId),
      path.join(directory(config.deviceId), "device.json"),
    );
    try {
      await fs.writeFile(entry, text, { flag: "wx", mode: 0o600 });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      await plain(entry);
      if ((await fs.readFile(entry, "utf8")) !== text)
        throw Error("linux-existing-launcher-changed");
    }
    const desktop = path.join(home, "Desktop");
    try {
      await plain(desktop);
      const desktopEntry = path.join(desktop, path.basename(entry));
      try {
        await fs.writeFile(desktopEntry, text, { flag: "wx", mode: 0o700 });
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        await plain(desktopEntry);
        if ((await fs.readFile(desktopEntry, "utf8")) !== text)
          throw Error("linux-existing-desktop-entry-changed");
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  async function preflight() {
    await plain(home);
    await execute("/usr/bin/systemctl", ["--user", "show-environment"]);
    await fs.access("/sys/fs/cgroup/cgroup.controllers");
  }
  async function packageFiles() {
    const file = path.join(bundle, "system-runtime-manifest.json");
    await plain(file);
    const bytes = await fs.readFile(file),
      manifest = JSON.parse(bytes);
    if (
      bytes.length > 32768 ||
      manifest.version !== 1 ||
      Object.keys(manifest).sort().join() !== "files,version" ||
      Object.keys(manifest.files).sort().join() !== [...runtimeFiles].sort().join()
    )
      throw Error("setup-package-integrity");
    const files = new Map();
    for (const name of runtimeFiles) {
      const source = path.join(bundle, name);
      await plain(source);
      const info = await fs.lstat(source);
      if (!info.isFile() || info.size > 150000000) throw Error("setup-package-integrity");
      const value = await fs.readFile(source);
      if (sha(value) !== manifest.files[name]) throw Error("setup-package-integrity");
      files.set(name, value);
    }
    return { bytes, manifest, files };
  }
  async function connection(id) {
    const config = await readPrivate(path.join(directory(id), "device.json"));
    if (
      config.version !== 1 ||
      config.mode !== "system" ||
      config.deviceId !== id ||
      serverOrigin(config.server) !== config.server ||
      config.stateRoot !== path.join(directory(id), "state") ||
      !new RegExp("^" + id + "\\.[A-Za-z0-9_-]{43}$").test(config.credential) ||
      config.repository ||
      config.profileId ||
      config.centralRepository
    )
      throw Error("linux-connection-scope-invalid");
    return config;
  }
  async function installed(config) {
    const folder = directory(config.deviceId),
      manifestFile = path.join(folder, "system-runtime-manifest.json");
    await plain(manifestFile);
    const bytes = await fs.readFile(manifestFile),
      manifest = JSON.parse(bytes);
    if (
      sha(bytes) !== config.runtimeManifestSha256 ||
      (Object.keys(manifest.files).sort().join() !== [...runtimeFiles].sort().join() &&
        Object.keys(manifest.files).sort().join() !== [...legacyRuntimeFiles].sort().join())
    )
      throw Error("linux-installed-files-changed");
    for (const name of Object.keys(manifest.files)) {
      const file = path.join(folder, name);
      await plain(file);
      if (sha(await fs.readFile(file)) !== manifest.files[name])
        throw Error("linux-installed-files-changed");
    }
  }
  async function resume(input) {
    await preflight();
    const config = await connection(input.deviceId);
    if (
      config.server !== (input.previousServer || input.server) ||
      config.accountName !== input.username
    )
      throw Error("linux-connection-scope-invalid");
    await installed(config);
    if (config.server !== input.server) {
      if (
        (await fs.readdir(directory(config.deviceId))).filter((name) =>
          /^transport-before-[a-f0-9]{16}\.json$/.test(name),
        ).length >= 3
      )
        throw Error("linux-transport-recovery-capacity");
      if (!input.server.startsWith("https:") || serverOrigin(input.server) !== input.server)
        throw Error("linux-transport-https-required");
      const response = await (options.fetch || fetch)(
        input.server + "/v1/connector/system-status",
        {
          method: "POST",
          headers: {
            authorization: "Bearer " + config.credential,
            "content-type": "application/json",
          },
          body: "{}",
          redirect: "error",
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!response.ok) throw Error("linux-transport-pairing-unrecognized");
      const status = await response.json();
      if (
        status.deviceId !== config.deviceId ||
        status.ready !== true ||
        (config.accountName.startsWith("pair:") &&
          config.accountName !== "pair:" + sha(Buffer.from(status.actor)).slice(0, 40))
      )
        throw Error("linux-transport-pairing-unrecognized");
      await writePrivate(
        path.join(
          directory(config.deviceId),
          "transport-before-" + randomBytes(8).toString("hex") + ".json",
        ),
        config,
        true,
      );
      await execute("/usr/bin/systemctl", ["--user", "stop", unit(config.deviceId)], 30000);
      try {
        await writePrivate(path.join(directory(config.deviceId), "device.json"), {
          ...config,
          server: input.server,
          allowInternalHttp: false,
        });
        await execute("/usr/bin/systemctl", ["--user", "start", unit(config.deviceId)], 30000);
        await execute("/usr/bin/systemctl", ["--user", "is-active", unit(config.deviceId)]);
      } catch {
        await writePrivate(path.join(directory(config.deviceId), "device.json"), config);
        await execute("/usr/bin/systemctl", ["--user", "start", unit(config.deviceId)], 30000);
        throw Error("linux-transport-recovered-previous-endpoint");
      }
    }
    await writePrivate(path.join(config.stateRoot, "discovery-consent.json"), {
      version: 1,
      deviceId: config.deviceId,
      metadata: input.fileActivity === true,
      approvedAt: new Date().toISOString(),
    });
    await execute("/usr/bin/systemctl", ["--user", "start", unit(config.deviceId)], 30000);
    await execute("/usr/bin/systemctl", ["--user", "is-active", unit(config.deviceId)]);
    await createStatusLauncher(config);
  }
  async function install(config) {
    await preflight();
    const packaged = await packageFiles(),
      folder = directory(config.deviceId);
    if (
      config.mode !== "system" ||
      serverOrigin(config.server) !== config.server ||
      config.repository ||
      config.profileId ||
      config.centralRepository ||
      !new RegExp("^" + config.deviceId + "\\.[A-Za-z0-9_-]{43}$").test(config.credential)
    )
      throw Error("linux-connection-scope-invalid");
    await privateDirectory(folder);
    for (const [name, bytes] of packaged.files) {
      const target = path.join(folder, name);
      await privateDirectory(path.dirname(target));
      try {
        await fs.writeFile(target, bytes, {
          flag: "wx",
          mode: name === "runtime/bin/node" ? 0o700 : 0o600,
        });
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        await plain(target);
        if (sha(await fs.readFile(target)) !== sha(bytes))
          throw Error("linux-installed-files-changed");
      }
    }
    const manifestFile = path.join(folder, "system-runtime-manifest.json");
    try {
      await fs.writeFile(manifestFile, packaged.bytes, { flag: "wx", mode: 0o600 });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      await plain(manifestFile);
      if (sha(await fs.readFile(manifestFile)) !== sha(packaged.bytes))
        throw Error("linux-installed-files-changed");
    }
    const stateRoot = path.join(folder, "state"),
      credentialFile = path.join(folder, "device.json");
    await privateDirectory(stateRoot);
    const saved = {
      ...config,
      stateRoot,
      credentialFile,
      runtimeManifestSha256: sha(packaged.bytes),
    };
    try {
      await writePrivate(credentialFile, saved, true);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (JSON.stringify(await connection(config.deviceId)) !== JSON.stringify(saved))
        throw Error("linux-connection-scope-invalid");
    }
    await writePrivate(path.join(stateRoot, "discovery-consent.json"), {
      version: 1,
      deviceId: config.deviceId,
      metadata: config.fileActivity === true,
      approvedAt: new Date().toISOString(),
    });
    const units = path.join(home, ".config/systemd/user");
    await privateDirectory(units);
    const target = path.join(units, unit(config.deviceId)),
      text = require("./Setup-Linux.cjs").unitText(folder, credentialFile);
    try {
      await fs.writeFile(target, text, { flag: "wx", mode: 0o600 });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      await plain(target);
      if ((await fs.readFile(target, "utf8")) !== text)
        throw Error("linux-existing-service-changed");
    }
    await execute("/usr/bin/systemctl", ["--user", "daemon-reload"]);
    await execute(
      "/usr/bin/systemctl",
      ["--user", "enable", "--now", unit(config.deviceId)],
      30000,
    );
    await execute("/usr/bin/systemctl", ["--user", "is-active", unit(config.deviceId)]);
    await createStatusLauncher(config);
  }
  async function update(input) {
    await preflight();
    const config = await connection(input.deviceId),
      packaged = await packageFiles(),
      folder = directory(input.deviceId);
    if (
      config.server !== input.server ||
      config.accountName !== input.username ||
      sha(packaged.bytes) !== input.manifestSha256
    )
      throw Error("linux-connection-scope-invalid");
    await installed(config);
    if (config.runtimeManifestSha256 === sha(packaged.bytes)) return { updated: false };
    const updates = path.join(folder, "updates");
    await privateDirectory(updates);
    if ((await fs.readdir(updates)).length >= 3) throw Error("linux-update-recovery-capacity");
    const revision = path.join(updates, randomBytes(16).toString("hex"));
    await privateDirectory(revision);
    const before = new Map(),
      oldRuntime = JSON.parse(
        await fs.readFile(path.join(folder, "system-runtime-manifest.json"), "utf8"),
      ),
      added = [];
    for (const name of runtimeFiles.filter((n) => !Object.keys(oldRuntime.files).includes(n))) {
      const file = path.join(folder, name);
      await plain(path.dirname(file));
      try {
        await plain(file);
        throw Error("linux-unpinned-runtime-addition");
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      added.push(name);
    }
    for (const name of [
      ...Object.keys(oldRuntime.files),
      "system-runtime-manifest.json",
      "device.json",
    ]) {
      const file = path.join(folder, name);
      await plain(file);
      const bytes = await fs.readFile(file);
      before.set(name, bytes);
      await privateDirectory(path.dirname(path.join(revision, name)));
      const saved = await fs.open(path.join(revision, name), "wx", 0o600);
      try {
        await saved.writeFile(bytes);
        await saved.sync();
      } finally {
        await saved.close();
      }
    }
    await writePrivate(
      path.join(revision, "intent.json"),
      {
        version: 1,
        deviceId: config.deviceId,
        server: config.server,
        previousSha256: config.runtimeManifestSha256,
        nextSha256: sha(packaged.bytes),
        preparedAt: new Date().toISOString(),
      },
      true,
    );
    async function replace(name, bytes) {
      const target = path.join(folder, name),
        temporary = target + "." + randomBytes(8).toString("hex");
      await plain(path.dirname(target));
      try {
        await plain(target);
        if (added.includes(name)) throw Error("linux-unpinned-runtime-addition");
      } catch (e) {
        if (e.code !== "ENOENT" || !added.includes(name)) throw e;
      }
      const file = await fs.open(temporary, "wx", name === "runtime/bin/node" ? 0o700 : 0o600);
      try {
        await file.writeFile(bytes);
        await file.sync();
      } finally {
        await file.close();
      }
      await fs.rename(temporary, target);
    }
    await execute("/usr/bin/systemctl", ["--user", "stop", unit(config.deviceId)], 30000);
    try {
      // Replace only files in the verified owned runtime inventory. Projects,
      // monitoring state, pending credentials and unknown files are retained.
      for (const [name, bytes] of packaged.files) await replace(name, bytes);
      await replace("system-runtime-manifest.json", packaged.bytes);
      await writePrivate(path.join(folder, "device.json"), {
        ...config,
        runtimeManifestSha256: sha(packaged.bytes),
      });
      await installed(await connection(config.deviceId));
      await execute("/usr/bin/systemctl", ["--user", "start", unit(config.deviceId)], 30000);
      await execute("/usr/bin/systemctl", ["--user", "is-active", unit(config.deviceId)]);
      await writePrivate(
        path.join(revision, "completed.json"),
        {
          version: 1,
          completedAt: new Date().toISOString(),
        },
        true,
      );
      return { updated: true };
    } catch {
      await execute("/usr/bin/systemctl", ["--user", "stop", unit(config.deviceId)], 30000);
      for (const [name, bytes] of before) await replace(name, bytes);
      for (const name of added) {
        const file = path.join(folder, name);
        await plain(path.dirname(file));
        try {
          await plain(file);
          const bytes = await fs.readFile(file);
          if (sha(bytes) !== sha(packaged.files.get(name)))
            throw Error("linux-new-runtime-recovery-differs");
          await fs.unlink(file);
        } catch (e) {
          if (e.code !== "ENOENT") throw e;
        }
      }
      await installed(await connection(config.deviceId));
      await execute("/usr/bin/systemctl", ["--user", "start", unit(config.deviceId)], 30000);
      throw Error("linux-update-recovered-previous-runtime");
    }
  }
  return {
    preflight,
    softwareConsent: async (input) => {
      const config = await connection(input.deviceId);
      if (
        !config ||
        config.server !== input.server ||
        config.accountName !== input.username ||
        typeof input.inventory !== "boolean" ||
        typeof input.install !== "boolean"
      )
        throw Error("linux-software-consent-denied");
      await installed(config);
      const folder = path.join(directory(input.deviceId), "state", "software");
      await privateDirectory(folder);
      await writePrivate(
        path.join(folder, "consent.json"),
        {
          version: 1,
          deviceId: input.deviceId,
          inventory: input.inventory,
          install: input.install,
          approvedAt: new Date().toISOString(),
        },
        false,
      );
    },
    install,
    resume,
    update,
    prepare: async (proposal) => {
      await preflight();
      await packageFiles();
      await writePrivate(path.join(directory(proposal.deviceId), "pending.json"), proposal, true);
    },
    helper: async (name, input) => {
      if (name !== "Pairing-State.ps1") throw Error("linux-setup-operation-denied");
      if (input.operation === "connection") return connection(input.deviceId);
      if (input.operation === "pending")
        return readPrivate(path.join(directory(input.deviceId), "pending.json"));
      throw Error("linux-setup-operation-denied");
    },
  };
}
module.exports = { context, runtimeFiles, statusLauncher };
