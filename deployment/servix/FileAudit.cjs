"use strict";
const fs = require("node:fs/promises"),
  path = require("node:path");
const { spawn } = require("node:child_process");
function fields(line) {
  return Object.fromEntries(
    [...line.matchAll(/\b([a-z][a-z0-9_]*)=("[^"\r\n]*"|[^ \r\n]+)/g)].map((m) => [
      m[1],
      m[2].replace(/^"|"$/g, ""),
    ]),
  );
}
function linuxEvent(lines) {
  const syscall = lines.find((l) => l.startsWith("type=SYSCALL ")),
    call = syscall && fields(syscall);
  if (
    !call ||
    call.success !== "yes" ||
    !/^\d+$/.test(call.pid || "") ||
    !/^\d+$/.test(call.uid || "")
  )
    return [];
  const cwd = fields(lines.find((l) => l.startsWith("type=CWD ")) || "").cwd;
  const message = syscall.match(/msg=audit\((\d+(?:\.\d+)?):(\d+)\)/);
  if (!message) return [];
  const arch = call.arch,
    number = Number(call.syscall);
  const writes =
    arch === "c000003e"
      ? [82, 83, 84, 85, 86, 87, 88, 258, 259, 263, 264, 265, 266, 316]
      : arch === "c00000b7"
        ? [34, 35, 36, 37, 38, 276]
        : [];
  const open =
    arch === "c000003e"
      ? number === 2
        ? "a1"
        : number === 257
          ? "a2"
          : null
      : arch === "c00000b7" && number === 56
        ? "a2"
        : null;
  const write =
    writes.includes(number) ||
    (open &&
      /^[a-f0-9]{1,16}$/i.test(call[open] || "") &&
      (BigInt("0x" + call[open]) & 0x643n) !== 0n);
  if (!write) return [];
  const result = [];
  for (const line of lines.filter((l) => l.startsWith("type=PATH "))) {
    const entry = fields(line);
    if (!entry.name || entry.nametype === "PARENT") continue;
    let name = entry.name;
    if (!line.includes('name="') && /^(?:[a-f0-9]{2})+$/i.test(name)) {
      try {
        name = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(name, "hex"));
      } catch {
        continue;
      }
    }
    const file = path.posix.isAbsolute(name)
      ? name
      : cwd && path.posix.isAbsolute(cwd)
        ? path.posix.resolve(cwd, name)
        : null;
    if (!file) continue;
    result.push({
      file,
      at: new Date(Number(message[1]) * 1000).toISOString(),
      kind:
        entry.nametype === "DELETE"
          ? "deleted"
          : entry.nametype === "CREATE"
            ? "created"
            : "modified",
      attribution: {
        kind: "os-audit",
        user: "uid:" + call.uid,
        pid: Number(call.pid),
        process: path.posix.basename(call.exe || ""),
        recordId: message[2] + ":" + (entry.item || "0"),
        auditSource: "linux-audit",
      },
    });
  }
  return result;
}
class FileAudit {
  constructor() {
    this.seen = new Set();
    this.pending = new Map();
    this.offset = null;
    this.inode = null;
    this.carry = "";
  }
  async windows() {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(
        path.join(process.env.WINDIR, "System32/WindowsPowerShell/v1.0/powershell.exe"),
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "RemoteSigned",
          "-File",
          path.join(__dirname, "Read-WindowsFileAudit.ps1"),
        ],
        { windowsHide: true, stdio: ["pipe", "pipe", "ignore"] },
      );
      let out = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(Error());
      }, 15000);
      child.stdout.on("data", (b) => {
        out += b;
        if (out.length > 262144) {
          child.kill();
          reject(Error());
        }
      });
      child.on("error", () => {
        clearTimeout(timer);
        reject(Error());
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        try {
          if (code !== 0) throw Error();
          resolve(JSON.parse(out));
        } catch {
          reject(Error());
        }
      });
      child.stdin.on("error", () => {});
      child.stdin.end(JSON.stringify({ seconds: 30 }));
    });
    const events = [];
    for (const entry of result.events) {
      const key = entry.recordId + ":" + entry.at;
      if (this.seen.has(key)) continue;
      this.seen.add(key);
      events.push({
        file: entry.file,
        kind: entry.kind,
        at: new Date(entry.at).toISOString(),
        attribution: {
          kind: "os-audit",
          user: entry.user,
          pid: entry.pid,
          process: entry.process,
          recordId: entry.recordId,
          auditSource: "windows-security-4663",
        },
      });
    }
    if (this.seen.size > 1000) this.seen = new Set([...this.seen].slice(-500));
    return { available: true, gap: result.overflow, events };
  }
  async linux() {
    const file = "/var/log/audit/audit.log";
    for (const current of ["/var", "/var/log", "/var/log/audit", file])
      if ((await fs.lstat(current)).isSymbolicLink()) throw Error();
    const handle = await fs.open(
      file,
      require("node:fs").constants.O_RDONLY | require("node:fs").constants.O_NOFOLLOW,
    );
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.uid !== 0 || (info.mode & 0o022) !== 0 || info.nlink !== 1)
        throw Error();
      if (this.offset === null) {
        this.offset = info.size;
        this.inode = info.ino;
        return { available: true, gap: true, events: [] };
      }
      let gap = false;
      if (this.inode !== info.ino || info.size < this.offset) {
        this.offset = 0;
        this.inode = info.ino;
        this.pending.clear();
        this.carry = "";
        gap = true;
      }
      if (info.size - this.offset > 1048576) {
        this.offset = info.size;
        this.pending.clear();
        this.carry = "";
        return { available: true, gap: true, events: [] };
      }
      const buffer = Buffer.alloc(65536),
        read = await handle.read(buffer, 0, buffer.length, this.offset);
      this.offset += read.bytesRead;
      const text = this.carry + buffer.subarray(0, read.bytesRead).toString("utf8"),
        lines = text.split("\n");
      this.carry = lines.pop();
      if (this.carry.length > 8192) {
        this.carry = "";
        gap = true;
      }
      const events = [];
      for (const line of lines) {
        if (line.length > 8192 || !/^type=(?:SYSCALL|PATH|CWD|EOE) /.test(line)) continue;
        const id = line.match(/msg=audit\((\d+(?:\.\d+)?:\d+)\)/)?.[1];
        if (!id) continue;
        if (line.startsWith("type=EOE ")) {
          events.push(...linuxEvent(this.pending.get(id) || []));
          this.pending.delete(id);
          continue;
        }
        if (this.pending.size >= 200 && !this.pending.has(id)) {
          this.pending.clear();
          gap = true;
        }
        const records = this.pending.get(id) || [];
        if (records.length < 50) records.push(line);
        else gap = true;
        this.pending.set(id, records);
      }
      // auditd can omit EOE in its text log. A successful SYSCALL declares how
      // many PATH items belong to it; collect only complete groups, even when
      // records span multiple bounded reads.
      for (const [id, records] of this.pending) {
        const call = records.find((line) => line.startsWith("type=SYSCALL "));
        const items = call && fields(call).items;
        if (
          items &&
          /^\d+$/.test(items) &&
          records.filter((line) => line.startsWith("type=PATH ")).length >= Number(items)
        ) {
          events.push(...linuxEvent(records));
          this.pending.delete(id);
        }
      }
      return { available: true, gap, events };
    } finally {
      await handle.close();
    }
  }
  async poll() {
    try {
      return await (process.platform === "win32" ? this.windows() : this.linux());
    } catch {
      return { available: false, gap: false, events: [] };
    }
  }
}
module.exports = { FileAudit, linuxEvent };
