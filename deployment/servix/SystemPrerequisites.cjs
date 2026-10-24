"use strict";
const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
const { spawn } = require("node:child_process");
const { createHash } = require("node:crypto");
const nodeToolchain = require("./NodeToolchain.cjs");
const dotnetToolchain = require("./DotNetToolchain.cjs");
const ids = ["git", "node", "npm", "pnpm", "dotnet", "python", "user-service"];
const safeEnvironment = () =>
  Object.fromEntries(
    Object.entries(process.env).filter(([k]) =>
      /^(?:PATH|PATHEXT|SystemRoot|WINDIR|COMSPEC|TEMP|TMP|HOME|USERPROFILE|LOCALAPPDATA|APPDATA|ProgramFiles|ProgramFiles\(x86\)|ProgramW6432|ProgramData|SystemDrive|XDG_RUNTIME_DIR|DBUS_SESSION_BUS_ADDRESS|DISPLAY|WAYLAND_DISPLAY|LANG|LC_ALL)$/i.test(
        k,
      ),
    ),
  );
function run(file, args, timeout = 20000, env = safeEnvironment(), discard = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      windowsHide: true,
      stdio: ["ignore", discard ? "ignore" : "pipe", "ignore"],
      env,
    });
    let output = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(Error("prerequisite-command-timeout"));
    }, timeout);
    child.stdout?.on("data", (v) => {
      output += v;
      if (output.length > 65536) {
        child.kill();
        reject(Error("prerequisite-output-capacity"));
      }
    });
    child.on("error", () => {
      clearTimeout(timer);
      reject(Error("prerequisite-command-unavailable"));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve(output) : reject(Error("prerequisite-command-failed"));
    });
  });
}
let semver;
for (const file of [
  path.join(path.dirname(process.execPath), "node_modules/npm/node_modules/semver"),
  path.join(path.dirname(process.execPath), "../lib/node_modules/npm/node_modules/semver"),
  "/usr/share/nodejs/semver",
  "/usr/lib/node_modules/npm/node_modules/semver",
]) {
  try {
    semver = require(file);
    break;
  } catch {}
}
function matches(version, range) {
  if (
    !semver ||
    typeof version !== "string" ||
    typeof range !== "string" ||
    range.length > 120 ||
    !semver.valid(version) ||
    !semver.validRange(range)
  )
    return null;
  return semver.satisfies(version, range);
}
async function manifest(file) {
  try {
    const info = await fs.lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 262144) throw Error();
    return JSON.parse((await fs.readFile(file, "utf8")).replace(/^\uFEFF/, ""));
  } catch (e) {
    if (e.code === "ENOENT") return undefined;
    throw Error("prerequisite-manifest-review-required");
  }
}
async function requirements(repository) {
  const requirements = [{ id: "git", required: ">=2.30.0", source: "connector" }],
    blocked = [];
  if (process.platform === "linux")
    requirements.push(
      {
        id: "python",
        required: ">=3.9.0",
        source: "Linux pidfd and atomic environment adapter",
      },
      { id: "user-service", required: "1.0.0", source: "User systemd, session bus and cgroup-v2" },
    );
  const add = (id, required, source) => {
    if (
      !ids.includes(id) ||
      typeof required !== "string" ||
      !/^[v0-9xX*<>=^~|. +-]{1,120}$/.test(required)
    )
      throw Error("prerequisite-manifest-review-required");
    if (!requirements.some((r) => r.id === id && r.required === required))
      requirements.push({ id, required, source });
  };
  const folders = [repository];
  try {
    for (const entry of (await fs.readdir(repository, { withFileTypes: true })).slice(0, 200))
      if (
        entry.isDirectory() &&
        !entry.isSymbolicLink() &&
        !/^(?:\.|node_modules|vendor|dist|build)/.test(entry.name)
      )
        folders.push(path.join(repository, entry.name));
  } catch (e) {
    if (e.code !== "ENOENT") throw Error("prerequisite-folder-unavailable");
  }
  for (const folder of folders.slice(0, 32)) {
    const relative = path.relative(repository, folder) || ".",
      pkg = await manifest(path.join(folder, "package.json"));
    if (pkg) {
      add("node", pkg.engines?.node ?? ">=20.0.0", relative + "/package.json");
      add("npm", pkg.engines?.npm ?? ">=9.0.0", relative + "/package.json");
      if (pkg.packageManager) {
        const m = pkg.packageManager.match(
          /^(pnpm|npm)@(\d+\.\d+\.\d+)(?:\+sha(?:224|512)\.[a-f0-9]+)?$/,
        );
        if (m) add(m[1], m[2], relative + "/package.json");
        else blocked.push("Unsupported package manager declaration in " + relative);
      }
    }
    const global = await manifest(path.join(folder, "global.json"));
    if (global?.sdk?.version) add("dotnet", global.sdk.version, relative + "/global.json");
    let entries = [];
    try {
      entries = await fs.readdir(folder, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries
      .filter((e) => e.isFile() && e.name.endsWith(".csproj"))
      .slice(0, 12)) {
      const file = path.join(folder, entry.name),
        info = await fs.lstat(file);
      if (info.size > 65536) {
        blocked.push("Oversized .NET manifest");
        continue;
      }
      const text = await fs.readFile(file, "utf8");
      if (
        /<TargetFramework(?:Version)?>\s*(?:net4\d|v4\.)/i.test(text) &&
        process.platform !== "win32"
      )
        blocked.push("This .NET Framework project requires Windows");
      for (const m of text.matchAll(/\bnet(8|9|10)\.0\b/g))
        if (!global?.sdk?.version)
          add("dotnet", `>=${m[1]}.0.0 <${Number(m[1]) + 1}.0.0`, relative + "/" + entry.name);
    }
  }
  const custom = await manifest(path.join(repository, "devsetu.system.json"));
  if (custom) {
    if (
      Object.keys(custom).some((k) => !["version", "prerequisites"].includes(k)) ||
      custom.version !== 1 ||
      !Array.isArray(custom.prerequisites) ||
      custom.prerequisites.length > 12
    )
      throw Error("prerequisite-manifest-review-required");
    for (const requirement of custom.prerequisites) {
      if (Object.keys(requirement).some((k) => !["id", "required"].includes(k)))
        throw Error("prerequisite-manifest-review-required");
      add(requirement.id, requirement.required, "devsetu.system.json");
    }
  }
  if (requirements.length > 12)
    blocked.push("More than 12 tool requirements; review the project system policy");
  return { requirements: requirements.slice(0, 12), blocked };
}
async function platform() {
  if (!["x64", "arm64"].includes(process.arch))
    throw Error("prerequisite-architecture-unsupported");
  if (process.platform === "win32")
    return { family: "windows", name: "Windows", architecture: process.arch };
  if (process.platform !== "linux") throw Error("prerequisite-platform-unsupported");
  const release = await fs.readFile("/etc/os-release", "utf8"),
    id = release.match(/^ID=["']?([a-z0-9_-]+)/m)?.[1];
  if (!id || !["ubuntu", "debian", "rhel", "rocky"].includes(id))
    throw Error("prerequisite-distribution-unsupported");
  return {
    family: ["ubuntu", "debian"].includes(id) ? "apt" : "dnf",
    name: id,
    architecture: process.arch,
  };
}
const toolRoot = () =>
  path.join(
    process.env.LOCALAPPDATA || path.join(os.homedir(), ".local", "share"),
    "DevSetu",
    "toolchains",
  );
async function npmCli(repository) {
  if (repository) {
    const selected = await nodeToolchain.selection(repository);
    if (selected) return selected.npm;
  }
  const candidates = [
    path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"),
    path.join(path.dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js"),
  ];
  if (process.platform === "win32")
    for (const p of (process.env.PATH || "").split(path.delimiter))
      candidates.push(path.join(p, "node_modules/npm/bin/npm-cli.js"));
  else
    candidates.push(
      "/usr/share/nodejs/npm/bin/npm-cli.js",
      "/usr/lib/node_modules/npm/bin/npm-cli.js",
      "/usr/local/lib/node_modules/npm/bin/npm-cli.js",
    );
  for (const file of candidates) {
    try {
      if ((await fs.stat(file)).isFile()) return path.resolve(file);
    } catch {}
  }
  throw Error("prerequisite-npm-unavailable");
}
async function detected(id, repository) {
  let output;
  try {
    if (id === "user-service") {
      await fs.access("/sys/fs/cgroup/cgroup.controllers");
      const runtime = process.env.XDG_RUNTIME_DIR;
      if (runtime !== `/run/user/${process.getuid()}`) return [];
      await fs.access(path.join(runtime, "bus"));
      await run("/usr/bin/systemctl", ["--user", "show-environment"]);
      return ["1.0.0"];
    }
    const selected = repository ? await nodeToolchain.selection(repository) : null;
    if (id === "node") output = selected ? selected.version : process.versions.node;
    else if (id === "npm")
      output = await run(selected?.node ?? process.execPath, [
        await npmCli(repository),
        "--version",
      ]);
    else if (id === "pnpm") {
      const file = path.join(
        toolRoot(),
        process.platform === "win32"
          ? "node_modules/pnpm/bin/pnpm.cjs"
          : "lib/node_modules/pnpm/bin/pnpm.cjs",
      );
      try {
        output = await run(process.execPath, [file, "--version"]);
      } catch {
        if (process.platform === "win32")
          output = await run(
            path.join(process.env.WINDIR, "System32/WindowsPowerShell/v1.0/powershell.exe"),
            [
              "-NoProfile",
              "-NonInteractive",
              "-Command",
              "$ErrorActionPreference='Stop'; & (Get-Command pnpm.cmd -ErrorAction Stop).Source --version",
            ],
          );
        else output = await run("pnpm", ["--version"]);
      }
    } else if (id === "dotnet" && process.platform === "linux" && repository) {
      const versions = [];
      try {
        versions.push(
          ...((await run("dotnet", ["--list-sdks"])).match(/\b\d+\.\d+\.\d+\b/g) || []),
        );
      } catch {}
      for (const sdk of await dotnetToolchain.selections(repository)) {
        const directory = path.join(toolRoot(), "dotnet-" + sdk.version);
        try {
          await run(path.join(directory, "dotnet"), ["--info"], 30000, {
            ...safeEnvironment(),
            DOTNET_ROOT: directory,
            DOTNET_CLI_TELEMETRY_OPTOUT: "1",
            DOTNET_NOLOGO: "1",
          });
          versions.push(sdk.version);
        } catch {}
      }
      return [...new Set(versions)].slice(0, 20);
    } else
      output = await run(
        id === "dotnet" ? "dotnet" : id === "python" ? "/usr/bin/python3" : "git",
        [id === "dotnet" ? "--list-sdks" : "--version"],
      );
    return [...new Set(output.match(/\b\d+\.\d+\.\d+\b/g) || [])].slice(0, 20);
  } catch {
    return [];
  }
}
function recipe(requirement, system) {
  const { id, required } = requirement;
  if (id === "user-service")
    return {
      available: system.family !== "windows",
      source: "Existing signed OS repositories; user session service manager",
      privilege: "administrator",
      actions:
        system.family === "windows"
          ? []
          : [
              system.family === "apt"
                ? { file: "/usr/bin/apt-get", arguments: ["install", "--yes", "dbus-user-session"] }
                : { file: "/usr/bin/dnf", arguments: ["install", "--assumeyes", "dbus-daemon"] },
              {
                file: "/usr/bin/systemctl",
                arguments: ["--user", "start", "dbus.socket"],
                privilege: "user",
              },
            ],
      reason:
        "Requires a logged-in Linux user, systemd and cgroup-v2. Containers or disabled user namespaces may need administrator review.",
    };
  if (id === "node" || id === "npm")
    return {
      available: false,
      source: "Bundled Node/npm runtime",
      privilege: "user",
      actions: [],
      reason: "Install a connector runtime matching this project's version policy",
    };
  if (id === "pnpm") {
    const version = /^\d+\.\d+\.\d+$/.test(required) ? required : null;
    return version
      ? {
          available: true,
          source: "https://registry.npmjs.org/",
          privilege: "user",
          actions: [
            {
              file: process.execPath,
              arguments: [
                "<bundled-npm-cli>",
                "install",
                "--global",
                "--prefix",
                toolRoot(),
                "--ignore-scripts",
                "--no-audit",
                "--no-fund",
                "--registry",
                "https://registry.npmjs.org/",
                `pnpm@${version}`,
              ],
            },
          ],
        }
      : {
          available: false,
          source: "npm registry",
          privilege: "user",
          actions: [],
          reason: "Set an exact pnpm version in packageManager or devsetu.system.json",
        };
  }
  const major = id === "dotnet" ? Number(required.match(/\d+/)?.[0]) : undefined;
  if (id === "dotnet" && ![8, 9, 10].includes(major))
    return {
      available: false,
      source: "OS package manager",
      privilege: "administrator",
      actions: [],
      reason: "This .NET SDK version needs an explicitly supported installer",
    };
  if (system.family === "windows") {
    const packageId = id === "git" ? "Git.Git" : `Microsoft.DotNet.SDK.${major}`;
    const args = [
      "install",
      "--id",
      packageId,
      "--exact",
      "--source",
      "winget",
      "--accept-source-agreements",
      "--accept-package-agreements",
      "--disable-interactivity",
    ];
    if (id === "dotnet" && /^\d+\.\d+\.\d+$/.test(required)) args.push("--version", required);
    return {
      available: true,
      source: "Microsoft WinGet: " + packageId,
      privilege: id === "git" ? "user or OS authorization" : "administrator",
      actions: [{ file: "winget.exe", arguments: args }],
    };
  }
  const name = id === "git" ? "git" : id === "python" ? "python3" : `dotnet-sdk-${major}.0`;
  return {
    available: true,
    source: "Configured signed OS repositories (no repository added)",
    privilege: "administrator",
    actions:
      system.family === "apt"
        ? [
            { file: "/usr/bin/apt-get", arguments: ["update"] },
            {
              file: "/usr/bin/apt-get",
              arguments: ["install", "--yes", "--no-install-recommends", name],
            },
          ]
        : [{ file: "/usr/bin/dnf", arguments: ["install", "--assumeyes", name] }],
  };
}
async function inspect(repository) {
  const system = await platform(),
    { requirements: required, blocked } = await requirements(repository);
  const versions = new Map(
    await Promise.all(
      [...new Set(required.map((r) => r.id))].map(async (id) => [
        id,
        await detected(id, repository),
      ]),
    ),
  );
  const tools = required.map((r) => {
    const found = versions.get(r.id),
      results = found.map((v) => matches(v, r.required));
    const status = !found.length
      ? "missing"
      : results.includes(true)
        ? "ready"
        : results.includes(null)
          ? "review-required"
          : "version-mismatch";
    return { ...r, detected: found.join(", ") || null, status, install: recipe(r, system) };
  });
  if (tools.some((t) => ["node", "npm"].includes(t.id) && t.status !== "ready")) {
    const asset = await nodeToolchain.choose(required, matches);
    for (const tool of tools.filter(
      (t) => ["node", "npm"].includes(t.id) && t.status !== "ready",
    )) {
      if (asset)
        tool.install = {
          available: true,
          source: "https://nodejs.org/dist/ · SHA-256 " + asset.sha256,
          privilege: "user",
          actions: [
            { file: "DevSetu verified portable Node installer", arguments: [asset.filename] },
          ],
          asset,
        };
    }
  }
  if (process.platform === "linux")
    for (const tool of tools.filter((t) => t.id === "dotnet" && t.status !== "ready")) {
      const asset = await dotnetToolchain.choose(tool.required, matches);
      if (!asset) {
        tool.install = {
          available: false,
          source: "Microsoft .NET release metadata",
          privilege: "user",
          actions: [],
          reason:
            "A matching verified SDK download is unavailable; check connectivity and version policy",
        };
        continue;
      }
      try {
        const actions = await dotnetToolchain.nativeDependencies(system);
        tool.install = {
          available: true,
          source: `Microsoft .NET SDK ${asset.version} · SHA-512 ${asset.sha512}; native dependencies from existing signed OS repositories`,
          privilege: actions.length ? "administrator" : "user",
          actions,
          asset,
        };
      } catch {
        tool.install = {
          available: false,
          source: "Microsoft .NET SDK",
          privilege: "user",
          actions: [],
          reason: "This OS native dependency policy needs review",
        };
      }
    }
  const report = { version: 1, system, repository, blocked, tools };
  return {
    ...report,
    fingerprint: createHash("sha256").update(JSON.stringify(report)).digest("hex"),
  };
}
async function install(
  repository,
  preview,
  selected,
  runner = (file, args, timeout) => run(file, args, timeout, safeEnvironment(), true),
  elevation = "desktop",
) {
  const current = await inspect(repository);
  if (
    current.fingerprint !== preview ||
    !Array.isArray(selected) ||
    !selected.length ||
    selected.length > 12 ||
    new Set(selected).size !== selected.length
  )
    throw Error("prerequisite-preview-changed");
  const tools = selected.map((key) => current.tools.find((t) => `${t.id}:${t.required}` === key));
  if (tools.some((t) => !t || t.status === "ready" || !t.install.available))
    throw Error("prerequisite-selection-invalid");
  const receipts = [];
  let terminalAuthorized = false;
  for (const tool of tools) {
    let outcome = "installed";
    try {
      if (tool.install.asset && tool.install.asset.kind !== "dotnet-sdk") {
        await nodeToolchain.installAsset(repository, tool.install.asset);
        receipts.push({
          id: tool.id,
          required: tool.required,
          source: tool.install.source,
          outcome,
        });
        continue;
      }
      for (const action of tool.install.actions) {
        const args = [...action.arguments];
        if (args[0] === "<bundled-npm-cli>") args[0] = await npmCli();
        const root = process.platform === "linux" && process.getuid() === 0;
        if (
          process.platform === "linux" &&
          tool.install.privilege === "administrator" &&
          action.privilege !== "user" &&
          !root
        ) {
          if (elevation === "terminal") {
            if (!terminalAuthorized) {
              await new Promise((resolve, reject) => {
                const child = spawn("/usr/bin/sudo", ["-v"], {
                  stdio: ["inherit", "ignore", "inherit"],
                  env: safeEnvironment(),
                });
                const timer = setTimeout(() => {
                  child.kill();
                  reject(Error("os-authorization-expired"));
                }, 120000);
                child.once("error", () => {
                  clearTimeout(timer);
                  reject(Error("os-authorization-unavailable"));
                });
                child.once("exit", (code) => {
                  clearTimeout(timer);
                  code === 0 ? resolve() : reject(Error("os-authorization-denied"));
                });
              });
              terminalAuthorized = true;
            }
            await runner("/usr/bin/sudo", ["-n", "--", action.file, ...args], 600000);
          } else await runner("pkexec", [action.file, ...args], 600000);
        } else await runner(action.file, args, 600000);
      }
      if (tool.install.asset?.kind === "dotnet-sdk")
        await dotnetToolchain.install(repository, tool.install.asset, tool.source);
      if (process.platform === "win32") {
        const updated = await run(
          path.join(process.env.WINDIR, "System32/WindowsPowerShell/v1.0/powershell.exe"),
          [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "[Console]::Write([Environment]::GetEnvironmentVariable('PATH','Machine')+';'+[Environment]::GetEnvironmentVariable('PATH','User'))",
          ],
        );
        process.env.PATH = updated + path.delimiter + process.env.PATH;
      }
    } catch {
      outcome = "failed-or-cancelled";
    }
    receipts.push({ id: tool.id, required: tool.required, source: tool.install.source, outcome });
  }
  if (terminalAuthorized) await run("/usr/bin/sudo", ["-k"]).catch(() => {});
  return { receipts, report: await inspect(repository) };
}
module.exports = {
  inspect,
  install,
  requirements,
  matches,
  platform,
  npmCli,
  toolRoot,
  detected,
  recipe,
  safeEnvironment,
  run,
};
