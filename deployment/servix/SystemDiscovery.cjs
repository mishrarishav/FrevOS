"use strict";
const fs = require("node:fs/promises"),
  { watch } = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const { randomUUID, createHash } = require("node:crypto");
const { execFile } = require("node:child_process");
const {
  excluded,
  redact,
  within,
  pseudoPath,
  defaultActivitySettings,
  retainActivity,
  activityCategory,
} = require("./DiscoverySafety.cjs");
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
  priorityFolders: [],
};
async function notificationCapability() {
  if (process.platform === "win32") return "windows-balloon";
  if (
    process.platform === "linux" &&
    (process.env.DISPLAY || process.env.WAYLAND_DISPLAY) &&
    process.env.DBUS_SESSION_BUS_ADDRESS
  ) {
    try {
      await fs.access("/usr/bin/notify-send");
      return "linux-desktop";
    } catch {}
  }
  return "unavailable";
}
async function showNotification(job, options = {}) {
  const platform = options.platform || process.platform;
  const invoke =
    options.invoke ||
    ((file, args, input) =>
      new Promise((resolve) => {
        const child = execFile(
          file,
          args,
          { windowsHide: true, timeout: 12000, maxBuffer: 1024 },
          (error) => resolve(!error),
        );
        child.stdin?.on("error", () => {});
        child.stdin?.end(input || "");
      }));
  if (platform === "win32") {
    const script =
      "$ErrorActionPreference='Stop';[Console]::InputEncoding=[Text.UTF8Encoding]::new($false);Add-Type -AssemblyName System.Windows.Forms;Add-Type -AssemblyName System.Drawing;$r=[Console]::In.ReadToEnd()|ConvertFrom-Json;if($r.version -ne 1 -or $r.title.Length -gt 80 -or $r.message.Length -gt 800){exit 2};$n=[Windows.Forms.NotifyIcon]::new();try{$n.Icon=[Drawing.SystemIcons]::Information;$n.Text='DevSetu';$n.Visible=$true;$n.BalloonTipTitle=$r.title;$n.BalloonTipText=$r.message;$n.ShowBalloonTip(7000);Start-Sleep -Milliseconds 8000}finally{$n.Dispose()}";
    const ok = await invoke(
      path.join(
        process.env.WINDIR || "C:/Windows",
        "System32/WindowsPowerShell/v1.0/powershell.exe",
      ),
      ["-NoProfile", "-NonInteractive", "-Command", script],
      JSON.stringify({ version: 1, title: job.title, message: job.message }),
    );
    return ok ? "display-requested" : "unsupported";
  }
  if (platform === "linux")
    return (await invoke("/usr/bin/notify-send", [
      "--app-name=DevSetu",
      "--expire-time=8000",
      "--",
      job.title,
      job.message,
    ]))
      ? "display-requested"
      : "unsupported";
  return "unsupported";
}
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
async function installationIdentity(config) {
  try {
    const value =
      process.platform === "win32"
        ? (
            await run(path.join(process.env.WINDIR, "System32/reg.exe"), [
              "query",
              "HKLM\\SOFTWARE\\Microsoft\\Cryptography",
              "/v",
              "MachineGuid",
            ])
          ).match(/MachineGuid\s+REG_SZ\s+([a-f0-9-]+)/i)?.[1]
        : (await fs.readFile("/etc/machine-id", "utf8")).trim();
    if (!value || !/^[a-f0-9-]{16,64}$/i.test(value)) return null;
    return createHash("sha256")
      .update(
        [
          "devsetu-system-v1",
          new URL(config.server).origin,
          os.userInfo().username,
          value.toLowerCase(),
        ].join("\0"),
      )
      .digest("hex");
  } catch {
    return null;
  }
}
class SystemDiscovery {
  constructor(config, api, options = {}) {
    this.config =
      config.mode === "system"
        ? { ...config, repository: config.monitoringRoot, profileId: null }
        : config;
    if (config.mode === "system") this.sourceVerified = true;
    this.api = api;
    this.rootProvider = options.rootProvider || localRoots;
    this.showNotification = options.showNotification || showNotification;
    this.notificationCapability = options.notificationCapability || notificationCapability;
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
    this.workQueue = [];
    this.working = false;
    this.activity = defaultActivitySettings;
    this.scanQueue = [];
    this.broadQueue = [];
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
    this.installationId = await installationIdentity(this.config);
  }
  skip(root, file) {
    const relative = path.relative(root, file);
    return (
      !within(root, file) ||
      (process.platform === "linux" && pseudoPath(file)) ||
      (!!relative && excluded(relative)) ||
      within(this.config.stateRoot, file) ||
      this.policy.excludedFolders.some((p) => within(path.resolve(this.config.repository, p), file))
    );
  }
  selected(file) {
    return (
      this.config.mode !== "system" &&
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
    const retained = retainActivity(this.queue, this.policy, this.activity);
    const dropped = this.queue.length - retained.length;
    this.queue = retained;
    if (dropped) {
      this.dropped += dropped;
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
        this.scheduleRecord(root, file, type);
      }, 250),
    );
  }
  scheduleRecord(root, file, type) {
    const noise =
      activityCategory({ root, path: path.relative(root, file) }, this.activity) === "noise";
    const noiseLimit = Math.floor((256 * this.activity.noisePercent) / 100);
    if (noise && this.workQueue.filter((j) => j.noise).length >= noiseLimit) {
      this.dropped++;
      this.gap("buffer-overflow");
      return;
    }
    if (this.workQueue.length >= 256) {
      const discard = noise ? -1 : this.workQueue.findIndex((j) => j.noise);
      this.dropped++;
      this.gap("buffer-overflow");
      if (discard === -1) return;
      this.workQueue.splice(discard, 1);
    }
    this.workQueue.push({ root, file, type, noise });
    if (this.working) return;
    this.working = true;
    this.work = (async () => {
      try {
        while (this.workQueue.length && !this.stopped) {
          const job = this.workQueue.shift();
          try {
            await this.record(job.root, job.file, job.type);
          } catch {
            this.gap("content-unavailable");
          }
        }
      } finally {
        this.working = false;
      }
    })();
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
      if (!this.watchers.has(file)) {
        if (this.scanQueue.length < this.policy.maxDirectories) {
          this.scanQueue.push({ root, directory: file });
          void this.scan();
        } else this.gap("watch-limit");
      }
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
      while (
        (this.scanQueue.length || this.broadQueue.length) &&
        !this.stopped &&
        generation === this.generation
      ) {
        const {
          root,
          directory,
          priority = true,
        } = this.scanQueue.shift() ?? this.broadQueue.shift();
        if (this.skip(root, directory) || this.watchers.has(directory)) continue;
        if (this.directories.size >= this.policy.maxDirectories) {
          this.gap("watch-limit");
          this.scanQueue.length = 0;
          this.broadQueue.length = 0;
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
              const queue = priority ? this.scanQueue : this.broadQueue;
              if (queue.length < this.policy.maxDirectories)
                queue.push({ root, directory: file, priority });
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
      if ((this.scanQueue.length || this.broadQueue.length) && !this.stopped) void this.scan();
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
    this.broadQueue.length = 0;
    for (const timer of this.pendingFiles.values()) clearTimeout(timer);
    this.pendingFiles.clear();
    this.workQueue.length = 0;
  }
  async configure(record) {
    this.notificationSupported = record.notifications?.version === 1;
    this.folderSearchSupported = record.folderSearch?.version === 1;
    // Old servers do not advertise this capability: omit new telemetry there.
    this.activity = record.activity?.settings ?? defaultActivitySettings;
    this.activitySupported = record.activity?.settings?.version === 1;
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
    for (const folder of (this.policy.priorityFolders ?? []).slice(0, 12)) {
      const allowed = [this.config.repository, ...(this.policy.allLocalDrives ? this.roots : [])];
      if (
        !allowed.includes(folder.root) ||
        typeof folder.path !== "string" ||
        folder.path.includes("\\") ||
        folder.path.includes(":") ||
        (folder.path && folder.path.split("/").some((p) => !p || p === "." || p === ".."))
      ) {
        this.gap("permission-denied");
        continue;
      }
      const directory = path.resolve(folder.root, ...folder.path.split("/").filter(Boolean));
      if (within(folder.root, directory))
        this.scanQueue.push({ root: folder.root, directory, priority: true });
    }
    for (const root of this.roots)
      if (root !== this.config.repository)
        this.broadQueue.push({ root, directory: root, priority: false });
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
        const report =
          this.config.mode === "system"
            ? { tools: [] }
            : await require("./SystemPrerequisites.cjs").inspect(this.config.repository);
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
      installationId: this.installationId ?? null,
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
        ...(this.activitySupported
          ? {
              collector: {
                version: 1,
                rss: process.memoryUsage().rss,
                heapUsed: process.memoryUsage().heapUsed,
                pendingJobs:
                  this.pendingFiles.size + this.workQueue.length + (this.working ? 1 : 0),
                maxPendingJobs: 1257,
              },
            }
          : {}),
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
    clearInterval(this.folderTimer);
    clearInterval(this.contentTimer);
    clearInterval(this.notificationTimer);
    clearInterval(this.searchTimer);
    this.closeContent?.();
    this.closeWatchers();
    await this.work;
    await this.persist();
  }
  async folderTick() {
    if (this.folderBusy || this.stopped) return;
    this.folderBusy = true;
    try {
      const { job } = await this.api("/v1/connector/discovery/folders/claim", {});
      if (job) {
        const roots = await this.rootProvider();
        const result = await require("./FolderBrowse.cjs").browse(
          this.config,
          job,
          roots,
          this.consent,
        );
        if (!this.stopped) await this.api("/v1/connector/discovery/folders/complete", result);
      }
    } catch {
      /* Folder metadata transport never launches a process or changes scope. */
    } finally {
      this.folderBusy = false;
    }
  }
  async contentTick() {
    if (
      this.contentBusy ||
      this.stopped ||
      !this.consent ||
      !this.policy.enabled ||
      !this.activitySupported
    )
      return;
    this.contentBusy = true;
    try {
      const { job } = await this.api("/v1/connector/discovery/content/claim", {});
      if (job) {
        const result = await require("./FolderBrowse.cjs").preview(
          this.config,
          job,
          await this.rootProvider(),
          this.consent,
          {
            onClose: (close) => {
              this.closeContent = close;
            },
          },
        );
        if (!this.stopped) await this.api("/v1/connector/discovery/content/complete", result);
      }
    } catch {
      /* Expired/offline previews never grant persistent file access. */
    } finally {
      this.contentBusy = false;
      this.closeContent = undefined;
    }
  }
  async searchTick() {
    if (
      this.stopped ||
      this.searchBusy ||
      !this.folderSearchSupported ||
      !this.consent ||
      !this.policy.enabled
    )
      return;
    this.searchBusy = true;
    try {
      const { job } = await this.api("/v1/connector/discovery/project-folders/claim", {});
      if (job) {
        const result = await require("./FolderBrowse.cjs").search(
          this.config,
          job,
          this.roots,
          await this.rootProvider(),
          this.consent,
        );
        if (!this.stopped)
          await this.api("/v1/connector/discovery/project-folders/complete", result);
      }
    } catch {
      /* Metadata requests never grant content or execution authority. */
    } finally {
      this.searchBusy = false;
    }
  }
  async notificationConsent() {
    try {
      const file = path.join(this.config.stateRoot, "notifications-consent.json"),
        info = await fs.lstat(file);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 4096) return false;
      const c = JSON.parse(await fs.readFile(file, "utf8"));
      return (
        c.version === 1 &&
        c.deviceId === this.config.deviceId &&
        c.server === this.config.server &&
        c.accountName === this.config.accountName &&
        c.enabled === true
      );
    } catch {
      return false;
    }
  }
  async notificationTick() {
    if (this.stopped || this.notificationBusy || !this.notificationSupported) return;
    this.notificationBusy = true;
    try {
      const enabled = await this.notificationConsent(),
        capability = await this.notificationCapability();
      const { job } = await this.api("/v1/connector/notifications/claim", {
        version: 1,
        enabled,
        capability,
      });
      if (!job || !enabled || this.stopped) return;
      const a = job.approval,
        now = Date.now(),
        digest = createHash("sha256")
          .update(
            JSON.stringify([
              job.version,
              job.workspaceId,
              job.actor,
              job.id,
              job.runId,
              job.deviceId,
              job.title,
              job.message,
              job.createdAt,
            ]),
          )
          .digest("hex");
      if (
        job.version !== 1 ||
        typeof job.actor !== "string" ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(job.actor) ||
        !/^ws_[A-Za-z0-9_-]{1,120}$/.test(job.workspaceId) ||
        !/^ar_[a-f0-9]{32}$/.test(job.runId) ||
        !/^nt_[a-f0-9]{32}$/.test(job.id) ||
        job.deviceId !== this.config.deviceId ||
        job.status !== "delivering" ||
        typeof job.title !== "string" ||
        !job.title ||
        job.title.length > 80 ||
        typeof job.message !== "string" ||
        !job.message ||
        job.message.length > 800 ||
        [...(job.title + job.message)].some(
          (c) => c.charCodeAt(0) < 32 && c !== "\n" && c !== "\t",
        ) ||
        job.digest !== digest ||
        !a ||
        a.version !== 1 ||
        a.actor !== job.actor ||
        a.workspaceId !== job.workspaceId ||
        a.target !== job.deviceId ||
        a.correlationId !== job.id ||
        a.action !== "notification:deliver" ||
        a.digest !== digest ||
        a.expiresAt !== job.expiresAt ||
        !a.consumedAt ||
        [job.createdAt, a.issuedAt, a.expiresAt, a.consumedAt].some(
          (v) => !Number.isFinite(Date.parse(v)),
        ) ||
        Date.parse(a.expiresAt) - Date.parse(a.issuedAt) > 600000 ||
        Date.parse(a.expiresAt) <= Date.parse(a.issuedAt) ||
        Date.parse(a.consumedAt) > Date.parse(a.expiresAt) ||
        Date.parse(a.consumedAt) < Date.parse(a.issuedAt) ||
        Date.parse(a.consumedAt) > now + 60000 ||
        Date.parse(a.issuedAt) < Date.parse(job.createdAt) ||
        Date.parse(job.expiresAt) <= now ||
        Date.parse(a.issuedAt) > now + 60000
      )
        return;
      if (
        this.config.accountName?.startsWith("pair:") &&
        this.config.accountName !==
          "pair:" + createHash("sha256").update(job.actor).digest("hex").slice(0, 40)
      )
        return;
      const file = path.join(this.storage, "notification-receipts.json");
      let receipts = [];
      try {
        const info = await fs.lstat(file);
        if (!info.isFile() || info.isSymbolicLink() || info.size > 20000) return;
        receipts = JSON.parse(await fs.readFile(file, "utf8"));
        if (
          !Array.isArray(receipts) ||
          receipts.length > 100 ||
          receipts.some((r) => !/^nt_[a-f0-9]{32}$/.test(r.id))
        )
          return;
      } catch (e) {
        if (e.code !== "ENOENT") return;
      }
      let status = "declined";
      if (!receipts.some((r) => r.id === job.id) && (await this.notificationConsent())) {
        const temp = file + "." + randomUUID() + ".tmp",
          handle = await fs.open(temp, "wx", 0o600);
        try {
          await handle.writeFile(
            JSON.stringify([...receipts, { id: job.id, at: new Date().toISOString() }].slice(-100)),
          );
          await handle.sync();
        } finally {
          await handle.close();
        }
        await fs.rename(temp, file);
        status = await this.showNotification(job);
      }
      if (!this.stopped)
        await this.api("/v1/connector/notifications/complete", {
          version: 1,
          id: job.id,
          digest,
          status,
        });
    } catch {
      /* Delivery uncertainty never authorizes a retry or executable action. */
    } finally {
      this.notificationBusy = false;
    }
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
      void collector.folderTick();
      collector.folderTimer = setInterval(() => void collector.folderTick(), 2000);
      collector.contentTimer = setInterval(() => void collector.contentTick(), 3000);
      collector.notificationTimer = setInterval(() => void collector.notificationTick(), 5000);
      collector.searchTimer = setInterval(() => void collector.searchTick(), 2000);
    })
    .catch(() => {
      /* Discovery failure never launches services or changes enrollment. */
    });
  return collector;
}
module.exports = {
  SystemDiscovery,
  start,
  localRoots,
  operatingSystem,
  defaultPolicy: defaults,
  showNotification,
  notificationCapability,
};
