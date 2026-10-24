"use strict";
const fs = require("node:fs/promises"),
  { watch } = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const { randomUUID } = require("node:crypto");
const { execFile } = require("node:child_process");
const { excluded, redact, within } = require("./DiscoverySafety.cjs");
const textExtensions = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".cjs",
  ".mjs",
  ".cs",
  ".css",
  ".html",
  ".sql",
  ".md",
  ".txt",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".json",
]);
const defaults = {
  version: 1,
  enabled: false,
  allLocalDrives: true,
  useExistingAudit: true,
  contentFolders: [],
  excludedFolders: [],
  retentionDays: 7,
  maxEvents: 2000,
  maxDirectories: 10000,
};
function run(file, args) {
  return new Promise((resolve, reject) =>
    execFile(file, args, { windowsHide: true, timeout: 15000, maxBuffer: 32768 }, (e, out) =>
      e ? reject(Error("system-probe-unavailable")) : resolve(out),
    ),
  );
}
async function localRoots() {
  if (process.platform === "win32") {
    const shell = path.join(process.env.WINDIR, "System32/WindowsPowerShell/v1.0/powershell.exe");
    const output = await run(shell, [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$ErrorActionPreference='Stop'; @(Get-CimInstance Win32_LogicalDisk | Where-Object {$_.DriveType -in @(2,3)} | ForEach-Object {$_.DeviceID+'\\'}) | ConvertTo-Json -Compress",
    ]);
    return [JSON.parse(output)]
      .flat()
      .filter((v) => /^[A-Za-z]:\\$/.test(v))
      .slice(0, 64);
  }
  const lines = (await fs.readFile("/proc/self/mountinfo", "utf8")).split("\n");
  const roots = [];
  for (const line of lines) {
    const [fields, mount] = line.split(" - ");
    if (!mount) continue;
    const type = mount.split(" ")[0],
      point = fields.split(" ")[4]?.replace(/\\040/g, " ");
    if (
      point &&
      (point === "/" || /^(?:ext[234]|xfs|btrfs|vfat|exfat|ntfs3?|zfs|f2fs)$/.test(type))
    )
      roots.push(point);
  }
  return [...new Set(roots)].slice(0, 64);
}
async function operatingSystem() {
  if (process.platform === "win32") return "Windows " + os.release();
  try {
    const line = (await fs.readFile("/etc/os-release", "utf8"))
      .split("\n")
      .find((s) => s.startsWith("PRETTY_NAME="));
    return line ? line.slice(12).replace(/^"|"$/g, "").slice(0, 100) : "Linux " + os.release();
  } catch {
    return "Linux " + os.release();
  }
}
class SystemDiscovery {
  constructor(config, api, options = {}) {
    this.config = config;
    this.api = api;
    this.rootProvider = options.rootProvider || localRoots;
    this.policy = { ...defaults };
    this.revision = 0;
    this.storage = path.join(config.stateRoot, "discovery");
    this.watchers = new Map();
    this.directories = new Set();
    this.known = new Set();
    this.versions = new Map();
    this.pendingFiles = new Map();
    this.queue = [];
    this.sequence = 0;
    this.bootId = randomUUID();
    this.gaps = new Set(["restart-history-unavailable"]);
    this.roots = [];
    this.cpu = null;
    this.dropped = 0;
    this.stopped = false;
    this.busy = false;
    this.work = Promise.resolve();
    this.scanQueue = [];
    this.scanning = false;
    this.dirty = false;
    this.generation = 0;
    this.audit = new (require("./FileAudit.cjs").FileAudit)();
    this.auditAvailable = false;
  }
  gap(code) {
    const existed = this.gaps.has(code);
    this.gaps.add(code);
    if (!existed && this.policy.enabled && this.consent)
      this.enqueue({
        root: this.config.repository,
        path: `[coverage gap: ${code}]`,
        kind: "gap",
        source: "collector",
      });
  }
  async initialize() {
    await fs.mkdir(this.storage, { recursive: true, mode: 0o700 });
    const info = await fs.lstat(this.storage);
    if (info.isSymbolicLink()) throw Error("discovery-linked-storage");
    try {
      const consentFile = path.join(this.config.stateRoot, "discovery-consent.json");
      const info = await fs.lstat(consentFile);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 1024) throw Error();
      const consent = JSON.parse(await fs.readFile(consentFile, "utf8"));
      this.consent =
        consent.version === 1 &&
        consent.deviceId === this.config.deviceId &&
        consent.metadata === true;
    } catch {
      this.consent = false;
    }
    try {
      const file = path.join(this.storage, "spool.json"),
        info = await fs.lstat(file);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 1_500_000) throw Error();
      const saved = JSON.parse(await fs.readFile(file, "utf8"));
      if (
        !/^[a-f0-9-]{36}$/.test(saved.bootId) ||
        !Number.isSafeInteger(saved.sequence) ||
        !Array.isArray(saved.queue)
      )
        throw Error();
      this.bootId = saved.bootId;
      this.sequence = saved.sequence;
      this.localRetention =
        Number.isInteger(saved.retentionDays) &&
        saved.retentionDays >= 1 &&
        saved.retentionDays <= 30
          ? saved.retentionDays
          : 7;
      this.queue = saved.queue
        .filter(
          (e) =>
            typeof e.path === "string" &&
            !excluded(e.path) &&
            Date.parse(e.at) > Date.now() - this.localRetention * 86400000,
        )
        .slice(-10000)
        .map((e) => ({
          ...e,
          ...(e.content
            ? {
                content: {
                  ...e.content,
                  before: redact(e.content.before),
                  after: redact(e.content.after),
                },
              }
            : {}),
        }));
    } catch {
      /* A new baseline cannot reconstruct offline edits. */
    }
    this.os = await operatingSystem();
  }
  skip(root, file) {
    const relative = path.relative(root, file);
    return (
      !within(root, file) ||
      (!!relative && excluded(relative)) ||
      within(this.config.stateRoot, file) ||
      this.policy.excludedFolders.some((p) => within(path.resolve(this.config.repository, p), file))
    );
  }
  selected(file) {
    return (
      within(this.config.repository, file) &&
      this.policy.contentFolders.some((p) =>
        within(path.resolve(this.config.repository, p), file),
      ) &&
      !excluded(path.relative(this.config.repository, file)) &&
      textExtensions.has(path.extname(file).toLowerCase())
    );
  }
  async content(file) {
    if (!this.selected(file)) return undefined;
    // Open the final component without following a link, then recheck every parent.
    let cursor = file;
    while (within(this.config.repository, cursor)) {
      if ((await fs.lstat(cursor)).isSymbolicLink()) throw Error("linked-file");
      if (cursor === this.config.repository) break;
      cursor = path.dirname(cursor);
    }
    const handle = await fs.open(
      file,
      require("node:fs").constants.O_RDONLY | (require("node:fs").constants.O_NOFOLLOW || 0),
    );
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > 8192 || info.nlink !== 1) return undefined;
      const bytes = await handle.readFile();
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return redact(text);
    } finally {
      await handle.close();
    }
  }
  async persist() {
    if (!this.dirty) return;
    const file = path.join(this.storage, "spool.json"),
      temporary = file + "." + randomUUID() + ".tmp";
    const sequence = this.sequence;
    const handle = await fs.open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(
        JSON.stringify({
          bootId: this.bootId,
          sequence: this.sequence,
          queue: this.queue,
          retentionDays: this.localRetention ?? this.policy.retentionDays,
        }),
      );
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(temporary, file);
    this.dirty = this.sequence !== sequence;
  }
  enqueue(event) {
    this.queue.push({
      sequence: ++this.sequence,
      at: new Date().toISOString(),
      ...event,
      source: event.source ?? "filesystem-notification",
      attribution: event.attribution ?? "unavailable",
    });
    while (
      this.queue.length > this.policy.maxEvents ||
      Buffer.byteLength(JSON.stringify(this.queue)) > 1_000_000
    ) {
      this.queue.shift();
      this.dropped++;
      this.gap("buffer-overflow");
    }
    this.dirty = true;
  }
  changed(root, file, type) {
    if (this.stopped || this.skip(root, file)) return;
    const key = file;
    const pending = this.pendingFiles.get(key);
    if (pending) clearTimeout(pending);
    if (!pending && this.pendingFiles.size >= 1000) {
      this.dropped++;
      this.gap("buffer-overflow");
      return;
    }
    this.pendingFiles.set(
      key,
      setTimeout(() => {
        this.pendingFiles.delete(key);
        this.work = this.work
          .then(() => this.record(root, file, type))
          .catch(() => this.gap("content-unavailable"));
      }, 250),
    );
  }
  async record(root, file, type) {
    if (!this.policy.enabled || this.stopped) return;
    let info;
    try {
      info = await fs.lstat(file);
    } catch (e) {
      if (e.code !== "ENOENT") {
        this.gap("permission-denied");
        return;
      }
    }
    if (info?.isSymbolicLink() || (info && !info.isDirectory() && !info.isFile())) return;
    const existed = this.known.has(file),
      before = this.versions.get(file);
    const kind = !info
      ? "deleted"
      : existed
        ? type === "rename"
          ? "renamed-or-replaced"
          : "modified"
        : "created";
    if (info && this.known.size < 100000) this.known.add(file);
    else if (!info) this.known.delete(file);
    const existingWatcher = this.watchers.get(file);
    if (
      (existingWatcher &&
        (type === "rename" ||
          !info ||
          info.dev !== existingWatcher.directoryId.dev ||
          info.ino !== existingWatcher.directoryId.ino)) ||
      (!info && this.directories.has(file))
    ) {
      // A directory can be removed/recreated or moved while its old inode is
      // still watched. Retire that watcher before installing the new baseline.
      for (const [directory, watcher] of this.watchers)
        if (within(file, directory)) {
          watcher.close();
          this.watchers.delete(directory);
        }
      for (const directory of this.directories)
        if (within(file, directory)) this.directories.delete(directory);
      for (const known of this.known)
        if (known !== file && within(file, known)) this.known.delete(known);
      for (const version of this.versions.keys())
        if (within(file, version)) this.versions.delete(version);
      this.gap("watch-failed");
    }
    if (info?.isDirectory()) {
      this.enqueue({ root, path: path.relative(root, file).replaceAll("\\", "/"), kind });
      this.scanQueue.push({ root, directory: file });
      void this.scan();
      return;
    }
    let content;
    if (this.selected(file)) {
      if (!info) {
        this.versions.delete(file);
        if (before !== undefined) content = { before, after: "", status: "removed" };
      } else {
        try {
          const after = await this.content(file);
          if (after !== undefined) {
            content = {
              before: before ?? "",
              after,
              status: before === undefined ? "baseline-unavailable" : "redacted-text",
            };
            if (this.versions.size < 256 || this.versions.has(file)) this.versions.set(file, after);
            else this.gap("content-unavailable");
          } else this.gap("content-unavailable");
        } catch {
          this.gap("content-unavailable");
        }
      }
    }
    this.enqueue({
      root,
      path: path.relative(root, file).replaceAll("\\", "/"),
      kind,
      ...(content ? { content } : {}),
    });
  }
  async scan() {
    if (this.scanning || this.stopped) return;
    this.scanning = true;
    const generation = this.generation;
    try {
      while (this.scanQueue.length && !this.stopped && generation === this.generation) {
        const { root, directory } = this.scanQueue.shift();
        if (this.skip(root, directory) || this.watchers.has(directory)) continue;
        if (this.directories.size >= this.policy.maxDirectories) {
          this.gap("watch-limit");
          this.scanQueue.length = 0;
          break;
        }
        try {
          const info = await fs.lstat(directory);
          if (generation !== this.generation) break;
          if (!info.isDirectory() || info.isSymbolicLink()) continue;
          // Each approved local mount is queued separately. Never descend through a
          // parent watcher into a different (possibly network or pseudo) filesystem.
          if (process.platform === "linux" && info.dev !== (await fs.stat(root)).dev) continue;
          const watcher = watch(directory, { persistent: false }, (type, name) => {
            if (!name) {
              this.gap("watch-failed");
              return;
            }
            this.changed(root, path.join(directory, String(name)), type);
          });
          watcher.on("error", () => {
            this.gap("watch-failed");
            watcher.close();
            if (this.watchers.get(directory) === watcher) this.watchers.delete(directory);
          });
          watcher.directoryId = { dev: info.dev, ino: info.ino };
          this.watchers.set(directory, watcher);
          this.directories.add(directory);
          const entries = await fs.readdir(directory, { withFileTypes: true });
          for (const entry of entries) {
            if (generation !== this.generation) break;
            const file = path.join(directory, entry.name);
            if (entry.isSymbolicLink() || this.skip(root, file)) continue;
            if (this.known.size < 100000) this.known.add(file);
            else this.gap("watch-limit");
            if (entry.isDirectory()) {
              if (this.scanQueue.length < this.policy.maxDirectories)
                this.scanQueue.push({ root, directory: file });
              else this.gap("watch-limit");
            } else if (entry.isFile() && this.selected(file) && this.versions.size < 256) {
              try {
                const text = await this.content(file);
                if (text !== undefined && generation === this.generation)
                  this.versions.set(file, text);
              } catch {
                this.gap("content-unavailable");
              }
            }
          }
        } catch (e) {
          this.gap(
            e.code === "EACCES" || e.code === "EPERM" ? "permission-denied" : "watch-failed",
          );
        }
        await new Promise((resolve) => setImmediate(resolve));
      }
    } finally {
      this.scanning = false;
      if (this.scanQueue.length && !this.stopped) void this.scan();
    }
  }
  closeWatchers() {
    this.generation++;
    for (const watcher of this.watchers.values()) watcher.close();
    this.watchers.clear();
    this.directories.clear();
    this.known.clear();
    this.versions.clear();
    this.scanQueue.length = 0;
    for (const timer of this.pendingFiles.values()) clearTimeout(timer);
    this.pendingFiles.clear();
  }
  async configure(record) {
    if (
      JSON.stringify(record.policy) === JSON.stringify(this.policy) &&
      record.revision === this.revision &&
      this.repository === this.config.repository &&
      this.verified === this.sourceVerified &&
      this.started
    )
      return;
    this.closeWatchers();
    await this.work;
    this.policy = record.policy;
    this.localRetention = this.policy.retentionDays;
    this.revision = record.revision;
    this.started = true;
    this.repository = this.config.repository;
    this.verified = this.sourceVerified;
    this.trackingStarted = Date.now();
    // New content scope must never replay a prior scope's buffered contents.
    this.queue = this.queue.map((event) => {
      if (
        event.root === this.config.repository &&
        this.policy.contentFolders.some((p) => p === "." || event.path.startsWith(p + "/"))
      )
        return event;
      const { content: _, ...metadata } = event;
      return metadata;
    });
    this.dirty = true;
    if (!this.policy.enabled || !this.consent || this.sourceVerified === false) {
      if (!this.consent) this.gap("local-enrollment-required");
      this.queue = [];
      return;
    }
    try {
      this.roots = this.policy.allLocalDrives
        ? await this.rootProvider()
        : [this.config.repository];
    } catch {
      this.roots = [];
      this.gap("watch-failed");
    }
    this.scanQueue.push({ root: this.config.repository, directory: this.config.repository });
    for (const root of this.roots)
      if (root !== this.config.repository) this.scanQueue.push({ root, directory: root });
    void this.scan();
  }
  async sample() {
    const cpus = os.cpus();
    let idle = 0,
      total = 0;
    for (const cpu of cpus) {
      idle += cpu.times.idle;
      total += Object.values(cpu.times).reduce((a, n) => a + n, 0);
    }
    const previous = this.cpu;
    this.cpu = { idle, total };
    const cpuPercent =
      previous && total > previous.total
        ? Math.max(0, Math.min(100, 100 * (1 - (idle - previous.idle) / (total - previous.total))))
        : null;
    const disks = [];
    let roots = this.roots;
    if (!roots.length) {
      try {
        roots = await this.rootProvider();
      } catch {
        roots = [];
      }
    }
    for (const root of roots.slice(0, 64)) {
      try {
        const s = await fs.statfs(root);
        disks.push({ root, total: s.blocks * s.bsize, available: s.bavail * s.bsize });
      } catch {
        this.gap("permission-denied");
      }
    }
    if (!this.toolsAt || Date.now() - this.toolsAt > 60000) {
      try {
        const report = await require("./SystemPrerequisites.cjs").inspect(this.config.repository);
        this.tools = report.tools.map(({ id, required, detected, status }) => ({
          id,
          required,
          detected,
          status,
        }));
      } catch {
        this.tools = [];
      }
      this.toolsAt = Date.now();
    }
    return {
      systemName: os.hostname().slice(0, 128),
      platform: process.platform,
      os: this.os,
      architecture: process.arch,
      tools: this.tools ?? [],
      cpuPercent,
      cpuCount: Math.max(1, cpus.length),
      memoryTotal: os.totalmem(),
      memoryAvailable: os.freemem(),
      uptimeSeconds: os.uptime(),
      disks,
    };
  }
  async tick() {
    if (this.busy || this.stopped) return;
    this.busy = true;
    try {
      const record = await this.api("/v1/connector/discovery/policy", {});
      if (this.verifyRepository) {
        try {
          await this.verifyRepository();
          this.sourceVerified = true;
        } catch {
          this.sourceVerified = false;
          this.gap("source-unverified");
        }
      }
      await this.configure(record);
      if (
        this.policy.enabled &&
        this.consent &&
        this.sourceVerified !== false &&
        this.policy.useExistingAudit
      ) {
        const audit = await this.audit.poll();
        this.auditAvailable = audit.available;
        if (!audit.available) this.gap("audit-unavailable");
        if (audit.gap) this.gap("audit-gap");
        for (const entry of audit.events) {
          if (Date.parse(entry.at) < this.trackingStarted) continue;
          const root = within(this.config.repository, entry.file)
            ? this.config.repository
            : this.policy.allLocalDrives
              ? this.roots.find((r) => within(r, entry.file))
              : undefined;
          if (!root || this.skip(root, entry.file)) continue;
          const relative = path.relative(root, entry.file).replaceAll("\\", "/");
          if (relative.length > 512 || entry.attribution.process.length > 160) {
            this.gap("audit-gap");
            continue;
          }
          this.enqueue({
            root,
            path: relative,
            at: entry.at,
            kind: entry.kind,
            source: "os-audit",
            attribution: entry.attribution,
          });
        }
      } else this.auditAvailable = false;
      const cutoff = Date.now() - this.policy.retentionDays * 86400000;
      this.queue = this.queue.filter((e) => Date.parse(e.at) >= cutoff);
      const snapshot = {
        version: 1,
        deviceId: this.config.deviceId,
        profileId: this.config.profileId,
        bootId: this.bootId,
        at: new Date().toISOString(),
        policyRevision: this.revision,
        system: await this.sample(),
        coverage: {
          status: !this.policy.enabled
            ? "disabled"
            : !this.consent || [...this.gaps].some((g) => g !== "restart-history-unavailable")
              ? "partial"
              : this.scanning
                ? "starting"
                : "collecting",
          roots: this.roots,
          watchedDirectories: this.watchers.size,
          gaps: [...this.gaps],
          attribution: this.auditAvailable ? "os-audit" : "unavailable",
          droppedEvents: this.dropped,
        },
        events: this.queue.slice(0, 20),
      };
      await this.persist();
      const result = await this.api("/v1/connector/discovery/observe", snapshot);
      if (result.accepted && result.bootId === this.bootId) {
        this.queue = this.queue.filter((e) => e.sequence > result.sequence);
        this.dirty = true;
        this.gaps.delete("network-unavailable");
      }
      await this.persist();
    } catch (error) {
      this.gap("network-unavailable");
      this.queue = this.queue.filter(
        (e) => Date.parse(e.at) >= Date.now() - (this.localRetention ?? 7) * 86400000,
      );
      if (/^connector-http-(?:401|403)$/.test(error.message)) {
        this.closeWatchers();
        this.queue = [];
        this.consent = false;
        this.dirty = true;
      }
      await this.persist().catch(() => {});
    } finally {
      this.busy = false;
    }
  }
  async stop() {
    this.stopped = true;
    clearInterval(this.timer);
    this.closeWatchers();
    await this.work;
    await this.persist();
  }
}
function start(config, api, verifyRepository) {
  const collector = new SystemDiscovery(config, api);
  collector.verifyRepository = verifyRepository;
  void collector
    .initialize()
    .then(() => {
      if (collector.stopped) return;
      void collector.tick();
      collector.timer = setInterval(() => void collector.tick(), 5000);
    })
    .catch(() => {
      /* Discovery failure never launches services or changes enrollment. */
    });
  return collector;
}
module.exports = { SystemDiscovery, start, localRoots, operatingSystem, defaultPolicy: defaults };
