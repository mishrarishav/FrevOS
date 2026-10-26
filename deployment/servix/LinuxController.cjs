"use strict";
const path = require("node:path"),
  fs = require("node:fs/promises");
const { spawn } = require("node:child_process"),
  { randomUUID } = require("node:crypto");
const { run, safeEnvironment } = require("./SystemPrerequisites.cjs");
const { identity } = require("./LinuxProcesses.cjs");
async function controller(launch) {
  const unit = launch.connectorUnit;
  if (!/^devsetu-connector-fc_[a-f0-9]{32}\.service$/.test(unit || ""))
    throw Error("local-development-linux-systemd-required");
  const main = await run("/usr/bin/systemctl", [
    "--user",
    "show",
    unit,
    "--property=MainPID",
    "--value",
  ]);
  if (Number(main.trim()) !== process.pid) throw Error("local-development-linux-systemd-required");
  const quotePath = (value) =>
    '"' + value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("%", "%%") + '"';
  return new Promise((resolve, reject) => {
    const child = spawn(
      "/usr/bin/systemd-run",
      [
        "--user",
        "--quiet",
        "--pipe",
        "--wait",
        "--collect",
        "--service-type=exec",
        `--unit=devsetu-local-${randomUUID()}`,
        `--property=BindsTo=${unit}`,
        `--property=After=${unit}`,
        "--property=KillMode=control-group",
        "--property=MemoryMax=8G",
        "--property=TasksMax=256",
        "--property=CPUQuota=200%",
        "--property=RuntimeMaxSec=8h",
        "--property=NoNewPrivileges=yes",
        "--property=RestrictSUIDSGID=yes",
        "--property=PrivateTmp=yes",
        "--property=PrivateUsers=yes",
        "--property=ProtectSystem=strict",
        "--property=ProtectHome=read-only",
        "--property=ProtectControlGroups=yes",
        `--property=ReadWritePaths=${quotePath(launch.directory)}`,
        `--property=InaccessiblePaths=${quotePath(launch.credentialFile)} ${quotePath(launch.stateRoot)}`,
        process.execPath,
        path.join(__dirname, "LinuxController.cjs"),
        "--application",
      ],
      { stdio: ["pipe", "pipe", "ignore"], env: safeEnvironment() },
    );
    let output = "",
      settled = false;
    const timer = setTimeout(() => {
      child.stdin.end();
      reject(Error("local-development-controller-timeout"));
    }, 20000);
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.length > 4096) {
        child.stdin.end();
        return;
      }
      if (settled || !output.includes("\n")) return;
      try {
        const info = JSON.parse(output.trim());
        if (!Number.isInteger(info.pid) || !Number.isFinite(Date.parse(info.createdAt)))
          throw Error();
        settled = true;
        clearTimeout(timer);
        resolve({ child, pid: info.pid, startedAt: info.createdAt });
      } catch {
        clearTimeout(timer);
        child.stdin.end();
        reject(Error("local-development-controller-failed"));
      }
    });
    child.on("error", () => {
      clearTimeout(timer);
      reject(Error("local-development-controller-failed"));
    });
    child.on("exit", () => {
      clearTimeout(timer);
      if (!settled) reject(Error("local-development-controller-failed"));
    });
    child.stdin.on("error", () => {});
    void identity(process.pid)
      .then((born) => child.stdin.write(JSON.stringify({ ...launch, parent: born }) + "\n"))
      .catch(() => {
        child.stdin.end();
        reject(Error("local-development-process-check-failed"));
      });
  });
}
async function application() {
  const finish = () => process.exit(0);
  let resolveFirst,
    firstSeen = false;
  const firstLine = new Promise((resolve) => {
    resolveFirst = resolve;
  });
  const readline = require("node:readline").createInterface({ input: process.stdin });
  readline.on("line", (line) => {
    if (firstSeen) finish();
    else {
      firstSeen = true;
      resolveFirst(line);
    }
  });
  readline.on("close", finish);
  const first = await firstLine;
  if (first.length > 131072) throw Error();
  const launch = JSON.parse(first);
  if (
    !path.isAbsolute(launch.directory) ||
    !path.isAbsolute(launch.executable) ||
    !Array.isArray(launch.arguments)
  )
    throw Error();
  if ((await identity(launch.parent.pid)).ticks !== launch.parent.ticks) throw Error();
  const group = (await fs.readFile("/proc/self/cgroup", "utf8")).trim().match(/^0::(.+)$/)?.[1];
  if (!group || group.includes("..")) throw Error("linux-cgroup-v2-required");
  const limits = path.join("/sys/fs/cgroup", group);
  const memory = (await fs.readFile(path.join(limits, "memory.max"), "utf8")).trim();
  const processes = (await fs.readFile(path.join(limits, "pids.max"), "utf8")).trim();
  const cpu = (await fs.readFile(path.join(limits, "cpu.max"), "utf8")).trim().split(" ");
  if (
    !/^\d+$/.test(memory) ||
    Number(memory) > 8589934592 ||
    !/^\d+$/.test(processes) ||
    Number(processes) > 256 ||
    cpu[0] === "max" ||
    Number(cpu[0]) / Number(cpu[1]) > 2
  )
    throw Error("linux-containment-unavailable");
  // Write locations are limited to the project and the unit's private /tmp.
  const home = await fs.mkdtemp("/tmp/devsetu-home-");
  const child = spawn(launch.executable, launch.arguments, {
    cwd: launch.directory,
    env: {
      ...launch.environment,
      HOME: home,
      XDG_RUNTIME_DIR: home,
      DOTNET_CLI_HOME: home,
      NUGET_PACKAGES: path.join(home, ".nuget/packages"),
    },
    stdio: "ignore",
  });
  child.once("exit", finish);
  await new Promise((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
  const info = await identity(child.pid);
  process.stdout.write(JSON.stringify({ pid: child.pid, createdAt: info.createdAt }) + "\n");
  setInterval(() => {
    void identity(launch.parent.pid)
      .then((p) => {
        if (p.ticks !== launch.parent.ticks) finish();
      })
      .catch(finish);
  }, 500);
}
if (require.main === module && process.argv[2] === "--application")
  application().catch(() => {
    process.exitCode = 1;
  });
module.exports = { controller };
