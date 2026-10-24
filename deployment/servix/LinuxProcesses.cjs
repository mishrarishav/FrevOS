"use strict";
const fs = require("node:fs/promises"),
  path = require("node:path");
const { execFile } = require("node:child_process"),
  { promisify } = require("node:util");
const run = promisify(execFile);
let timing;
async function identity(pid) {
  if (!Number.isInteger(pid) || pid <= 1) throw Error("local-development-process-check-failed");
  const text = await fs.readFile(`/proc/${pid}/stat`, "utf8"),
    end = text.lastIndexOf(")"),
    fields = text.slice(end + 2).split(" ");
  if (!timing) {
    const boot = Number((await fs.readFile("/proc/stat", "utf8")).match(/^btime (\d+)$/m)?.[1]);
    const ticks = Number(
      (await run("/usr/bin/getconf", ["CLK_TCK"], { timeout: 5000 })).stdout.trim(),
    );
    if (!boot || !ticks) throw Error("local-development-process-check-failed");
    timing = { boot, ticks };
  }
  return {
    pid,
    parentId: Number(fields[1]),
    ticks: fields[19],
    createdAt: new Date(
      timing.boot * 1000 + (Number(fields[19]) * 1000) / timing.ticks,
    ).toISOString(),
  };
}
async function scoped(pid, input) {
  const root = await fs.realpath(input.directory);
  for (let depth = 0; depth < 24 && pid > 1; depth++) {
    if ((await fs.stat(`/proc/${pid}`)).uid !== process.getuid()) return false;
    const current = await identity(pid);
    if (input.controllerId && pid === input.controllerId) return true;
    const executable = await fs.readlink(`/proc/${pid}/exe`),
      name = path.basename(executable);
    const argv = (await fs.readFile(`/proc/${pid}/cmdline`, "utf8")).split("\0");
    let candidate;
    if (name === "node" && /\.(?:cjs|mjs|js)$/.test(argv[1] || "")) candidate = argv[1];
    if (name === "dotnet" && /\.dll$/.test(argv[1] || "")) candidate = argv[1];
    if (name === "dotnet" && argv[1] === "run" && argv.includes("--project"))
      candidate = argv[argv.indexOf("--project") + 1];
    if (candidate) {
      const location = path.isAbsolute(candidate)
        ? candidate
        : path.resolve(await fs.readlink(`/proc/${pid}/cwd`), candidate);
      const file = await fs.realpath(location);
      if (file === root || file.startsWith(root + "/")) return true;
    }
    const parent = current.parentId > 1 ? await identity(current.parentId) : null;
    if (!parent || Number(parent.ticks) > Number(current.ticks)) return false;
    pid = current.parentId;
  }
  return false;
}
async function listener(port) {
  const inodes = new Set();
  for (const file of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    const text = await fs.readFile(file, "utf8");
    for (const line of text.trim().split("\n").slice(1)) {
      const fields = line.trim().split(/\s+/);
      if (parseInt(fields[1].split(":").at(-1), 16) === port && fields[3] === "0A")
        inodes.add(fields[9]);
    }
  }
  const owners = [];
  if (!inodes.size) return null;
  for (const name of (await fs.readdir("/proc")).filter((n) => /^\d+$/.test(n)).slice(0, 20000)) {
    const pid = Number(name);
    try {
      if ((await fs.stat(`/proc/${pid}`)).uid !== process.getuid()) continue;
      for (const fd of (await fs.readdir(`/proc/${pid}/fd`)).slice(0, 4096)) {
        let link;
        try {
          link = await fs.readlink(`/proc/${pid}/fd/${fd}`);
        } catch {
          continue;
        }
        const inode = link.match(/^socket:\[(\d+)\]$/)?.[1];
        if (inode && inodes.has(inode)) {
          owners.push(pid);
          break;
        }
      }
    } catch {
      /* Inaccessible or exited process supplies no authority. */
    }
  }
  return owners.length === 1 ? owners[0] : null;
}
async function query(input) {
  if (
    !Number.isInteger(input.port) ||
    input.port < 1024 ||
    input.port > 65535 ||
    !path.isAbsolute(input.directory)
  )
    throw Error("local-development-process-check-failed");
  const pid = await listener(input.port);
  if (!pid) return null;
  const born = await identity(pid),
    owned = await scoped(pid, input);
  if (input.operation === "stop") {
    if (!owned || pid !== input.expectedPid || born.createdAt !== input.expectedCreatedAt)
      throw Error("local-development-process-identity-changed");
    const fresh = await listener(input.port);
    if (fresh !== pid || (await identity(pid)).ticks !== born.ticks || !(await scoped(pid, input)))
      throw Error("local-development-process-identity-changed");
    // Python's pidfd APIs bind termination to this kernel process, never a reused PID.
    const helper = path.join(__dirname, "Stop-LinuxProcess.py");
    try {
      await run("/usr/bin/python3", [helper, String(pid), born.ticks, String(process.getuid())], {
        timeout: 15000,
        maxBuffer: 256,
      });
    } catch {
      throw Error("local-development-linux-pidfd-required");
    }
    return { stopped: true };
  }
  return {
    pid,
    name: path.basename(await fs.readlink(`/proc/${pid}/exe`)),
    createdAt: born.createdAt,
    projectOwned: owned,
  };
}
module.exports = { identity, query, listener };
