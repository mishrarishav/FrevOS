// Full, quiesced SQLite engine recovery. No live overwrite, caller path or shell operation.
const fs = require("node:fs/promises"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { gzip, gunzip } = require("node:zlib"),
  { promisify } = require("node:util");
const { execFile, spawn } = require("node:child_process"),
  net = require("node:net");
const compress = promisify(gzip),
  expand = promisify(gunzip);
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const nativeEnvironment = (lockGit = true) =>
  Object.assign(
    Object.fromEntries(
      [
        "SystemRoot",
        "WINDIR",
        "PATH",
        "PATHEXT",
        "TEMP",
        "TMP",
        "USERPROFILE",
        "HOME",
        "LOCALAPPDATA",
        "APPDATA",
        "USER",
        "USERNAME",
        "USERDOMAIN",
      ].flatMap((k) => (process.env[k] === undefined ? [] : [[k, process.env[k]]])),
    ),
    {
      GIT_TERMINAL_PROMPT: "0",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
      GIT_CONFIG_COUNT: lockGit ? "3" : "0",
      GIT_CONFIG_KEY_0: "protocol.allow",
      GIT_CONFIG_VALUE_0: "never",
      GIT_CONFIG_KEY_1: "core.hooksPath",
      GIT_CONFIG_VALUE_1: "/dev/null",
      GIT_CONFIG_KEY_2: "core.fsmonitor",
      GIT_CONFIG_VALUE_2: "false",
    },
  );
const fail = (code) => {
  throw Error("repository-recovery-" + code);
};
const relative = (s) =>
  typeof s === "string" &&
  s.length > 0 &&
  s.length <= 1000 &&
  !/[\\:]/.test(s) &&
  ![...s].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) &&
  s.split("/").every((p) => p && p !== "." && p !== "..");
async function plain(file) {
  for (let p = path.resolve(file); ; p = path.dirname(p)) {
    try {
      if ((await fs.lstat(p)).isSymbolicLink()) fail("linked-path");
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    if (path.dirname(p) === p) break;
  }
}
function within(root, target) {
  const r = path.relative(path.resolve(root), path.resolve(target));
  return r && r !== ".." && !r.startsWith(".." + path.sep) && !path.isAbsolute(r);
}
function iniSettings(text) {
  let section = "";
  const result = new Map();
  for (const row of text.split(/\r?\n/)) {
    const line = row.trim();
    if (!line || /^[;#]/.test(line)) continue;
    if (/^\[[\w.-]+\]$/.test(line)) {
      section = line.slice(1, -1).toLowerCase();
      continue;
    }
    const at = line.indexOf("=");
    if (at < 1) fail("configuration-format");
    const key = section + "." + line.slice(0, at).trim().toUpperCase();
    if (result.has(key)) fail("duplicate-setting");
    result.set(key, line.slice(at + 1).trim());
  }
  return result;
}
class GitRecovery {
  constructor(config, lifecycle, key) {
    this.config = config;
    this.lifecycle = lifecycle;
    this.key = key;
    this.tail = Promise.resolve();
  }
  async validate(requireSource = true) {
    const c = this.config;
    if (
      !/^forge_[a-f0-9]{32}$/.test(c.installationId) ||
      !/^ws_[A-Za-z0-9_-]+$/.test(c.workspaceId) ||
      ![c.workRoot, c.backupRoot, c.restoreRoot].every(path.isAbsolute) ||
      new Set(
        [c.workRoot, c.backupRoot, c.restoreRoot].map((p) =>
          process.platform === "win32" ? path.resolve(p).toLowerCase() : path.resolve(p),
        ),
      ).size !== 3 ||
      [c.backupRoot, c.restoreRoot].some((p) => within(c.workRoot, p) || within(p, c.workRoot)) ||
      within(c.backupRoot, c.restoreRoot) ||
      within(c.restoreRoot, c.backupRoot) ||
      !Number.isSafeInteger(c.maxBytes) ||
      c.maxBytes < 1024 ||
      c.maxBytes > 1073741824 ||
      !Number.isSafeInteger(c.maxFiles) ||
      c.maxFiles < 1 ||
      c.maxFiles > 100000
    )
      fail("configuration-invalid");
    for (const p of [c.workRoot, c.backupRoot, c.restoreRoot]) await plain(p);
    if (!requireSource) return;
    const file = path.join(c.workRoot, "app.ini");
    await plain(file);
    if ((await fs.stat(file)).size > 262144) fail("configuration-capacity");
    const text = await fs.readFile(file, "utf8"),
      settings = iniSettings(text);
    if (settings.get("database.DB_TYPE") !== "sqlite3") fail("database-adapter-required");
    for (const k of ["database.PATH", "repository.ROOT", "server.APP_DATA_PATH"]) {
      const v = settings.get(k);
      if (!v || !path.isAbsolute(v) || !within(c.workRoot, v)) fail("external-storage-unsupported");
    }
    for (const [k, v] of settings) {
      if (/(?:\.PATH|_PATH|\.ROOT|_DIR|_FILE)$/.test(k) && v) {
        if (/%\(|\$\{|~/.test(v)) fail("indirect-path-unsupported");
        const target = path.resolve(c.workRoot, v);
        if (!within(c.workRoot, target) && target !== path.resolve(c.workRoot))
          fail("external-path-unsupported");
      }
      if (/_URI$/.test(k) && v.startsWith("file:")) {
        const target = v.slice(5);
        if (!path.isAbsolute(target) || !within(c.workRoot, target))
          fail("external-path-unsupported");
      }
      if (
        (/\.STORAGE_TYPE$/.test(k) && !["local", ""].includes(v)) ||
        (/\.TYPE$/.test(k) && /s3|azure|minio/i.test(v))
      )
        fail("external-storage-unsupported");
      if (
        path.isAbsolute(v) &&
        !within(c.workRoot, v) &&
        path.resolve(v) !== path.resolve(c.workRoot)
      )
        fail("external-path-unsupported");
    }
    return { text, settings };
  }
  serialize(work) {
    const next = this.tail.then(work, work);
    this.tail = next.catch(() => {});
    return next;
  }
  async keyBytes() {
    const key = await this.key();
    if (!Buffer.isBuffer(key) || key.length !== 32) fail("key-unavailable");
    return key;
  }
  async backup() {
    return this.serialize(async () => {
      await this.validate();
      const c = this.config;
      await fs.mkdir(c.backupRoot, { recursive: true, mode: 0o700 });
      if ((await fs.readdir(c.backupRoot)).length >= 200) fail("retention-capacity");
      const key = await this.keyBytes();
      const wasRunning = await this.lifecycle.running();
      let stopped = false;
      try {
        if (wasRunning) await this.lifecycle.stop();
        if (await this.lifecycle.running()) fail("engine-not-quiesced");
        stopped = true;
        const entries = [];
        let total = 0;
        const walk = async (root, prefix = "") => {
          for (const item of await fs.readdir(root, { withFileTypes: true })) {
            const rel = prefix + item.name;
            if (!relative(rel)) fail("unsafe-path");
            const file = path.join(root, item.name);
            await plain(file);
            if (item.isSymbolicLink()) fail("linked-path");
            if (item.isDirectory()) await walk(file, rel + "/");
            else if (item.isFile()) {
              const stat = await fs.stat(file);
              total += stat.size;
              if (entries.length >= c.maxFiles || total > c.maxBytes) fail("snapshot-capacity");
              const bytes = await fs.readFile(file);
              if (bytes.length !== stat.size) fail("source-changed");
              entries.push({ path: rel, sha256: sha(bytes), bytes: bytes.toString("base64") });
            } else fail("unsupported-file");
          }
        };
        await walk(c.workRoot);
        if (await this.lifecycle.running()) fail("engine-restarted-during-backup");
        const identity = {
          version: 1,
          id: "gbackup_" + crypto.randomBytes(16).toString("hex"),
          installationId: c.installationId,
          workspaceId: c.workspaceId,
          createdAt: new Date().toISOString(),
        };
        const content = await compress(
          Buffer.from(
            JSON.stringify({ ...identity, sourceRoot: path.resolve(c.workRoot), entries }),
          ),
          { level: 6 },
        );
        const iv = crypto.randomBytes(12),
          cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
        cipher.setAAD(Buffer.from(JSON.stringify(identity)));
        const sealed = Buffer.concat([
          iv,
          cipher.update(content),
          cipher.final(),
          cipher.getAuthTag(),
        ]);
        const manifest = {
          ...identity,
          sha256: sha(sealed),
          bytes: sealed.length,
          files: entries.length,
          uncompressedBytes: total,
        };
        const archive = path.join(c.backupRoot, identity.id + ".sealed");
        const h = await fs.open(archive, "wx", 0o600);
        try {
          await h.writeFile(sealed);
          await h.sync();
        } finally {
          await h.close();
        }
        const m = await fs.open(path.join(c.backupRoot, identity.id + ".json"), "wx", 0o600);
        try {
          await m.writeFile(JSON.stringify(manifest));
          await m.sync();
        } finally {
          await m.close();
        }
        return manifest;
      } finally {
        key.fill(0);
        if (wasRunning && (stopped || !(await this.lifecycle.running())))
          await this.lifecycle.start();
      }
    });
  }
  async list() {
    await this.validate(false);
    await fs.mkdir(this.config.backupRoot, { recursive: true, mode: 0o700 });
    const names = await fs.readdir(this.config.backupRoot);
    if (names.length > 200) fail("retention-capacity");
    const result = [];
    for (const name of names)
      if (/^gbackup_[a-f0-9]{32}\.json$/.test(name)) {
        const file = path.join(this.config.backupRoot, name);
        await plain(file);
        if ((await fs.stat(file)).size > 4096) fail("manifest-invalid");
        const m = JSON.parse(await fs.readFile(file, "utf8"));
        if (
          m.id + ".json" !== name ||
          m.workspaceId !== this.config.workspaceId ||
          m.installationId !== this.config.installationId ||
          !/^[a-f0-9]{64}$/.test(m.sha256)
        )
          fail("manifest-invalid");
        result.push(m);
      }
    return result;
  }
  async restoreIsolated(id, expectedSha256) {
    return this.serialize(async () => {
      await this.validate(false);
      if (!/^gbackup_[a-f0-9]{32}$/.test(id) || !/^[a-f0-9]{64}$/.test(expectedSha256))
        fail("request-invalid");
      const c = this.config,
        m = (await this.list()).find((m) => m.id === id);
      if (!m || m.sha256 !== expectedSha256) fail("backup-changed");
      const file = path.join(c.backupRoot, id + ".sealed");
      await plain(file);
      if ((await fs.stat(file)).size !== m.bytes || m.bytes > c.maxBytes * 2)
        fail("archive-capacity");
      const sealed = await fs.readFile(file);
      if (sha(sealed) !== expectedSha256) fail("archive-integrity");
      const identity = {
        version: m.version,
        id: m.id,
        installationId: m.installationId,
        workspaceId: m.workspaceId,
        createdAt: m.createdAt,
      };
      const key = await this.keyBytes();
      let payload;
      try {
        const decipher = crypto.createDecipheriv("aes-256-gcm", key, sealed.subarray(0, 12));
        decipher.setAAD(Buffer.from(JSON.stringify(identity)));
        decipher.setAuthTag(sealed.subarray(-16));
        const compressed = Buffer.concat([
          decipher.update(sealed.subarray(12, -16)),
          decipher.final(),
        ]);
        payload = JSON.parse(
          (await expand(compressed, { maxOutputLength: c.maxBytes * 2 + 16777216 })).toString(
            "utf8",
          ),
        );
      } catch {
        fail("archive-authentication");
      } finally {
        key.fill(0);
      }
      if (
        JSON.stringify({ ...identity }) !==
          JSON.stringify({
            version: payload.version,
            id: payload.id,
            installationId: payload.installationId,
            workspaceId: payload.workspaceId,
            createdAt: payload.createdAt,
          }) ||
        !Array.isArray(payload.entries) ||
        payload.entries.length !== m.files ||
        payload.entries.length > c.maxFiles
      )
        fail("payload-invalid");
      const names = new Set();
      let total = 0;
      for (const entry of payload.entries) {
        if (
          !relative(entry.path) ||
          names.has(entry.path.toLowerCase()) ||
          typeof entry.bytes !== "string" ||
          entry.bytes.length > c.maxBytes * 2
        )
          fail("unsafe-path");
        names.add(entry.path.toLowerCase());
        const bytes = Buffer.from(entry.bytes, "base64");
        total += bytes.length;
        if (total > c.maxBytes || sha(bytes) !== entry.sha256) fail("file-integrity");
      }
      await fs.mkdir(c.restoreRoot, { recursive: true, mode: 0o700 });
      const root = await fs.mkdtemp(path.join(c.restoreRoot, "isolated-"));
      for (const entry of payload.entries) {
        const dest = path.join(root, ...entry.path.split("/"));
        if (!within(root, dest)) fail("restore-scope");
        await plain(dest);
        await fs.mkdir(path.dirname(dest), { recursive: true, mode: 0o700 });
        await fs.writeFile(dest, Buffer.from(entry.bytes, "base64"), { flag: "wx", mode: 0o600 });
      }
      return {
        version: 1,
        id,
        sha256: expectedSha256,
        status: "restored-isolated",
        root,
        files: payload.entries.length,
        uncompressedBytes: total,
        sourceRoot: payload.sourceRoot,
      };
    });
  }
}
function createNativeRecovery(config, key) {
  const command = async (action, requireSource = true) => {
    if (process.platform !== "win32") fail("service-adapter-required");
    await plain(config.binary);
    if (sha(await fs.readFile(config.binary)) !== config.binarySha256) fail("binary-identity");
    const binary = path.join(
      process.env.WINDIR || "C:/Windows",
      "System32/WindowsPowerShell/v1.0/powershell.exe",
    );
    return new Promise((resolve, reject) => {
      const child = spawn(
        binary,
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "RemoteSigned",
          "-File",
          path.join(__dirname, "GitService.ps1"),
          "-Action",
          action,
        ],
        {
          windowsHide: true,
          env: Object.fromEntries(
            Object.entries(process.env).filter(([k]) => k.toLowerCase() !== "psmodulepath"),
          ),
          stdio: ["pipe", "pipe", "ignore"],
        },
      );
      let output = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(Error("repository-recovery-service-deadline"));
      }, 45000);
      child.stdout.on("data", (b) => {
        output += b;
        if (output.length > 4096) child.kill();
      });
      child.on("error", () => {
        clearTimeout(timer);
        reject(Error("repository-recovery-service-boundary"));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        try {
          if (code !== 0) throw Error();
          const value = JSON.parse(output);
          if (typeof value.running !== "boolean") throw Error();
          resolve(value);
        } catch {
          reject(Error("repository-recovery-service-boundary"));
        }
      });
      child.stdin.end(
        JSON.stringify({
          serviceName: config.serviceName,
          binary: config.binary,
          binarySha256: config.binarySha256,
          expectedCommandLine: config.expectedCommandLine,
          workRoot: config.workRoot,
          privateRoots: requireSource
            ? [config.workRoot, config.backupRoot, config.restoreRoot]
            : [config.backupRoot, config.restoreRoot],
        }),
      );
    });
  };
  const recovery = new GitRecovery(
    config,
    {
      running: async () => (await command("State")).running,
      stop: () => command("Stop"),
      start: () => command("Start"),
    },
    key,
  );
  const restore = recovery.restoreIsolated.bind(recovery);
  recovery.restoreIsolated = async (id, digest) => {
    await command("Storage", false);
    return restore(id, digest);
  };
  recovery.verify = async (result) => verifyIsolatedEngine(config, result);
  return recovery;
}
async function verifyIsolatedEngine(config, result, check) {
  if (!within(config.restoreRoot, result.root)) fail("restore-scope");
  await plain(config.binary);
  if (sha(await fs.readFile(config.binary)) !== config.binarySha256) fail("binary-identity");
  const original = await fs.readFile(path.join(result.root, "app.ini"), "utf8");
  const socket = net.createServer();
  await new Promise((r) => socket.listen(0, "127.0.0.1", r));
  const port = socket.address().port;
  await new Promise((r) => socket.close(r));
  let section = "";
  const changes = {
    "server.HTTP_ADDR": "127.0.0.1",
    "server.HTTP_PORT": String(port),
    "server.PROTOCOL": "http",
    "server.DOMAIN": "127.0.0.1",
    "server.ROOT_URL": `http://127.0.0.1:${port}/`,
    "server.DISABLE_SSH": "true",
    "mailer.ENABLED": "false",
    "service.DISABLE_REGISTRATION": "true",
  };
  const seen = new Set(),
    sections = new Set();
  const rows = [];
  const finish = () => {
    for (const [k, v] of Object.entries(changes))
      if (k.startsWith(section + ".") && !seen.has(k)) {
        rows.push(k.slice(section.length + 1) + " = " + v);
        seen.add(k);
      }
  };
  for (const row of original.split(/\r?\n/)) {
    const line = row.trim();
    if (/^\[[\w.-]+\]$/.test(line)) {
      finish();
      section = line.slice(1, -1).toLowerCase();
      sections.add(section);
      rows.push(row);
      continue;
    }
    const at = line.indexOf("=");
    if (at > 0 && !/^[;#]/.test(line)) {
      const name = line.slice(0, at).trim(),
        key = section + "." + name.toUpperCase();
      let value = line.slice(at + 1).trim();
      value = value
        .split(result.sourceRoot)
        .join(result.root)
        .split(result.sourceRoot.replaceAll("\\", "/"))
        .join(result.root.replaceAll("\\", "/"));
      if (
        path.isAbsolute(value) &&
        !within(result.root, value) &&
        path.resolve(value) !== path.resolve(result.root)
      )
        fail("isolated-external-path");
      rows.push(name + " = " + (changes[key] ?? value));
      seen.add(key);
    } else rows.push(row);
  }
  finish();
  for (const [key, value] of Object.entries(changes))
    if (!seen.has(key)) {
      const split = key.indexOf(".");
      rows.push("[" + key.slice(0, split) + "]", key.slice(split + 1) + " = " + value);
      seen.add(key);
    }
  const ini = path.join(result.root, "devsetu-isolated.ini");
  await fs.writeFile(ini, rows.join("\n"), { flag: "wx", mode: 0o600 });
  if (!check) {
    try {
      await promisify(execFile)(
        config.binary,
        [
          "--work-path",
          result.root,
          "--config",
          ini,
          "doctor",
          "check",
          "--run",
          "check-db-consistency",
          "--log-file",
          "-",
        ],
        {
          cwd: result.root,
          env: nativeEnvironment(),
          windowsHide: true,
          timeout: 120000,
          maxBuffer: 1048576,
        },
      );
    } catch {
      fail("isolated-database-check");
    }
    return {
      ...result,
      status: "verified-isolated",
      databaseHealth: "consistent",
      verifiedAt: new Date().toISOString(),
    };
  }
  const child = spawn(config.binary, ["--work-path", result.root, "--config", ini, "web"], {
    // Synthetic acceptance only: the engine initializes its Git settings here.
    // Never write those settings into the operator's global Git configuration.
    env: {
      ...nativeEnvironment(false),
      GIT_CONFIG_GLOBAL: path.join(result.root, "isolated.gitconfig"),
    },
    windowsHide: true,
    stdio: "ignore",
  });
  let failed = false;
  child.on("error", () => {
    failed = true;
  });
  try {
    let ready = false;
    for (let i = 0; i < 75 && !failed; i++) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/healthz`, {
          redirect: "error",
          signal: AbortSignal.timeout(1000),
        });
        if (response.ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 200));
    }
    if (!ready) fail("isolated-engine-health");
    if (check) await check(`http://127.0.0.1:${port}`);
    return {
      ...result,
      status: "verified-isolated",
      engineHealth: "healthy",
      verifiedAt: new Date().toISOString(),
    };
  } finally {
    if (!child.killed) {
      try {
        await promisify(execFile)(
          config.binary,
          ["--work-path", result.root, "--config", ini, "manager", "shutdown"],
          { env: nativeEnvironment(false), windowsHide: true, timeout: 10000, maxBuffer: 4096 },
        );
      } catch {
        child.kill();
      }
    }
  }
}
module.exports = { GitRecovery, createNativeRecovery, verifyIsolatedEngine, relative, iniSettings };
