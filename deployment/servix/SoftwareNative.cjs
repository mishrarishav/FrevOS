"use strict";
const fs = require("node:fs/promises"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  { spawn } = require("node:child_process");
const safety = require("./DiscoverySafety.cjs");
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const environment = () =>
  Object.fromEntries(
    Object.entries(process.env).filter(([k]) =>
      /^(?:PATH|PATHEXT|SystemRoot|WINDIR|COMSPEC|TEMP|TMP|HOME|USERPROFILE|LOCALAPPDATA|APPDATA|ProgramFiles|ProgramFiles\(x86\)|ProgramData|SystemDrive|DISPLAY|WAYLAND_DISPLAY|XDG_RUNTIME_DIR|DBUS_SESSION_BUS_ADDRESS|LANG|LC_ALL)$/i.test(
        k,
      ),
    ),
  );
function run(
  file,
  args,
  { timeout = 90000, capacity = 3000000, interactive = false, diagnose = false } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      shell: false,
      windowsHide: !interactive,
      env: environment(),
      stdio: ["ignore", interactive ? "ignore" : "pipe", diagnose ? "pipe" : "ignore"],
    });
    let output = "",
      denied = false,
      settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      error ? reject(error) : resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(Error("software-process-interrupted"));
    }, timeout);
    child.stdout?.on("data", (b) => {
      output += b;
      if (Buffer.byteLength(output) > capacity) {
        child.kill();
        finish(Error("software-output-capacity"));
      }
    });
    child.stderr?.on("data", (b) => {
      if (
        /access denied|permission denied|interactive authentication required|authentication is required/i.test(
          b.toString().slice(0, 8192),
        )
      )
        denied = true;
    });
    child.on("error", () => finish(Error("software-native-unavailable")));
    child.on("close", (code) =>
      code === 0 || code === 3010
        ? finish(null, { output, restartRequired: code === 3010 })
        : finish(Error(denied ? "os-permission-denied" : "software-native-failed")),
    );
  });
}
const powershell = () =>
  path.join(process.env.WINDIR, "System32/WindowsPowerShell/v1.0/powershell.exe");
function windowsArgs(action) {
  return [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "RemoteSigned",
    "-File",
    path.join(__dirname, "SoftwareNative.ps1"),
    "-Action",
    action,
  ];
}
const clean = (v) => {
  const s = safety
    .redact(
      [...String(v ?? "")]
        .map((c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? " " : c))
        .join("")
        .trim(),
    )
    .slice(0, 180);
  return s || undefined;
};
async function inventory(options = {}) {
  const platform = options.platform ?? process.platform,
    exec = options.run ?? run;
  let result;
  try {
    if (platform === "win32")
      result = JSON.parse(
        (await exec(powershell(), windowsArgs("Inventory"))).output.replace(/^\uFEFF/, ""),
      );
    else if (platform === "linux") {
      let source = "dpkg",
        output;
      try {
        output = (
          await exec("/usr/bin/dpkg-query", [
            "-W",
            "-f",
            "${binary:Package}\t${Version}\t${Maintainer}\n",
          ])
        ).output;
      } catch {
        source = "rpm";
        output = (
          await exec("/usr/bin/rpm", [
            "-qa",
            "--queryformat",
            "%{NAME}\t%{VERSION}-%{RELEASE}\t%{VENDOR}\n",
          ])
        ).output;
      }
      const lines = output.trim().split("\n").filter(Boolean);
      result = {
        version: 1,
        observedAt: new Date().toISOString(),
        platform,
        scope: "linux-package-manager",
        status: lines.length > 5000 ? "partial" : "ready",
        truncated: lines.length > 5000,
        items: lines.slice(0, 5000).map((line) => {
          const [name, version, publisher] = line.split("\t");
          return { name, version, publisher, source };
        }),
      };
    } else throw Error("software-platform-unsupported");
    if (
      !result ||
      !Array.isArray(result.items) ||
      result.items.length > 5000 ||
      !["ready", "partial"].includes(result.status)
    )
      throw Error("software-inventory-invalid");
    const unique = new Map();
    for (const raw of result.items) {
      const item = { name: clean(raw.name), source: raw.source };
      if (!item.name || !["registry", "appx", "dpkg", "rpm"].includes(item.source)) continue;
      for (const key of ["version", "publisher"]) {
        const v = clean(raw[key]);
        if (v) item[key] = v;
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw.installedOn ?? "")) item.installedOn = raw.installedOn;
      const id = sha(JSON.stringify(item));
      unique.set(id, { id, ...item });
    }
    result.observedAt = new Date(result.observedAt).toISOString();
    result.platform = platform;
    const sorted = [...unique.values()].sort((a, b) => a.name.localeCompare(b.name));
    result.items = [];
    let payloadBytes = 1024;
    for (const item of sorted) {
      payloadBytes += Buffer.byteLength(JSON.stringify(item)) + 1;
      if (payloadBytes > 2500000) {
        result.status = "partial";
        result.truncated = true;
        break;
      }
      result.items.push(item);
    }
    return result;
  } catch {
    return {
      version: 1,
      observedAt: new Date().toISOString(),
      platform: platform === "win32" ? "win32" : "linux",
      scope: platform === "win32" ? "windows-machine-and-connector-user" : "linux-package-manager",
      status: "unavailable",
      truncated: false,
      items: [],
    };
  }
}
async function plain(file) {
  for (let p = path.resolve(file); ; p = path.dirname(p)) {
    try {
      if ((await fs.lstat(p)).isSymbolicLink()) throw Error("software-linked-path");
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    if (path.dirname(p) === p) return;
  }
}
const serviceNameValid = (name, manager) =>
  typeof name === "string" &&
  name.length <= 180 &&
  (manager === "windows-scm"
    ? /^[A-Za-z0-9][A-Za-z0-9_.@$ -]{0,179}$/.test(name)
    : /^[A-Za-z0-9][A-Za-z0-9_.@:-]*\.service$/.test(name));
function serviceMetadata(value, max = 180) {
  return [...String(value ?? "")]
    .map((c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? " " : c))
    .join("")
    .trim()
    .slice(0, max);
}
function linuxService(row, manager, options) {
  const name = row.Id,
    protectedService =
      !serviceNameValid(name, manager) ||
      /^(?:systemd-|(?:dbus|NetworkManager|networking|sshd?|polkit|auditd|firewalld)(?:[.@-]|$))/i.test(
        name,
      ) ||
      (options.deviceId && name === `devsetu-connector-${options.deviceId}.service`);
  return {
    id: sha(JSON.stringify([manager, name])),
    name: serviceMetadata(name),
    displayName: serviceMetadata(row.Description || name),
    manager,
    definitionSha256: sha(
      JSON.stringify([manager, name, row.ExecStart ?? "", row.User ?? "", row.FragmentPath ?? ""]),
    ),
    status:
      row.ActiveState === "active"
        ? "running"
        : row.ActiveState === "inactive"
          ? "stopped"
          : row.ActiveState === "failed"
            ? "failed"
            : row.ActiveState === "activating"
              ? "start-pending"
              : row.ActiveState === "deactivating"
                ? "stop-pending"
                : "unknown",
    startupType: serviceMetadata(row.UnitFileState || "unknown"),
    protected: !!protectedService,
    canStart: !protectedService && row.CanStart === "yes" && row.RefuseManualStart !== "yes",
    canStop: !protectedService && row.CanStop === "yes" && row.RefuseManualStop !== "yes",
  };
}
async function linuxServices(manager, options = {}, selected) {
  const exec = options.run ?? run,
    scope = manager === "systemd-user" ? "--user" : "--system",
    base = [scope, "--no-ask-password", "--no-pager"];
  let names = selected ? [selected] : [];
  if (!selected) {
    const collected = [];
    for (const command of [
      ["list-unit-files", "--type=service", "--no-legend"],
      ["list-units", "--all", "--type=service", "--plain", "--no-legend"],
    ]) {
      try {
        const r = await exec("/usr/bin/systemctl", [...base, ...command], { timeout: 15000 });
        collected.push(
          ...r.output
            .trim()
            .split(/\r?\n/)
            .map((l) => l.trim().split(/\s+/)[0]),
        );
      } catch {}
    }
    names = [...new Set(collected.filter((n) => serviceNameValid(n, manager)))].sort();
  }
  if (!names.length) return { items: [], available: false, truncated: false };
  const truncated = names.length > 5000,
    items = [];
  for (let i = 0; i < Math.min(names.length, 5000); i += 64) {
    const r = await exec(
      "/usr/bin/systemctl",
      [
        ...base,
        "show",
        "--property=Id,Description,ActiveState,SubState,UnitFileState,FragmentPath,ExecStart,User,CanStart,CanStop,RefuseManualStart,RefuseManualStop",
        "--",
        ...names.slice(i, Math.min(i + 64, 5000)),
      ],
      { timeout: 15000 },
    );
    for (const block of r.output.trim().split(/\r?\n\s*\r?\n/)) {
      const row = Object.fromEntries(
        block
          .split(/\r?\n/)
          .filter((l) => l.includes("="))
          .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
      );
      if (row.Id && serviceNameValid(row.Id, manager))
        items.push(linuxService(row, manager, options));
    }
  }
  return { items, available: true, truncated };
}
async function serviceInventory(options = {}) {
  const platform = options.platform ?? process.platform,
    exec = options.run ?? run;
  let snapshot;
  try {
    if (platform === "win32")
      snapshot = JSON.parse(
        (await exec(powershell(), windowsArgs("Services"), { timeout: 60000 })).output.replace(
          /^\uFEFF/,
          "",
        ),
      );
    else if (platform === "linux") {
      const results = [];
      for (const manager of ["systemd-system", "systemd-user"]) {
        try {
          results.push(await linuxServices(manager, options));
        } catch {
          results.push({ items: [], available: false, truncated: false });
        }
      }
      snapshot = {
        version: 1,
        observedAt: new Date().toISOString(),
        platform,
        status: results.every((r) => !r.available)
          ? "unavailable"
          : results.some((r) => !r.available || r.truncated)
            ? "partial"
            : "ready",
        truncated: results.some((r) => r.truncated),
        items: results.flatMap((r) => r.items),
      };
    } else throw Error("unsupported");
    if (!snapshot || !Array.isArray(snapshot.items)) throw Error("invalid");
    let bytes = 1024;
    const items = [];
    for (const raw of snapshot.items) {
      if (
        !/^[a-f0-9]{64}$/.test(raw.id) ||
        !/^[a-f0-9]{64}$/.test(raw.definitionSha256) ||
        !["windows-scm", "systemd-system", "systemd-user"].includes(raw.manager)
      )
        continue;
      const item = {
        ...raw,
        name: serviceMetadata(raw.name),
        displayName: serviceMetadata(raw.displayName),
        startupType: serviceMetadata(raw.startupType),
        ...(raw.description
          ? { description: safety.redact(serviceMetadata(raw.description, 600)).slice(0, 600) }
          : {}),
      };
      bytes += Buffer.byteLength(JSON.stringify(item));
      if (items.length >= 5000 || bytes > 2500000) {
        snapshot.status = "partial";
        snapshot.truncated = true;
        break;
      }
      items.push(item);
    }
    return { ...snapshot, observedAt: new Date(snapshot.observedAt).toISOString(), items };
  } catch {
    return {
      version: 1,
      observedAt: new Date().toISOString(),
      platform: platform === "win32" ? "win32" : "linux",
      status: "unavailable",
      truncated: false,
      items: [],
    };
  }
}
async function serviceAction(service, operation, options = {}) {
  if (
    !service ||
    !["start-service", "stop-service"].includes(operation) ||
    !serviceNameValid(service.name, service.manager) ||
    service.protected ||
    !/^[a-f0-9]{64}$/.test(service.definitionSha256)
  )
    throw Error("service-scope-denied");
  const exec = options.run ?? run,
    platform = options.platform ?? process.platform;
  if (platform === "win32" && service.manager === "windows-scm") {
    await options.beforeExecute?.();
    const r = await exec(
      powershell(),
      [
        ...windowsArgs(operation === "start-service" ? "ServiceStart" : "ServiceStop"),
        "-ServiceName",
        service.name,
        "-DefinitionSha256",
        service.definitionSha256,
      ],
      { timeout: 60000 },
    );
    const result = JSON.parse(r.output.replace(/^\uFEFF/, ""));
    if (
      ![
        "service-started",
        "service-stopped",
        "os-permission-denied",
        "service-changed",
        "dependents-running",
        "interrupted",
        "failed",
      ].includes(result.result)
    )
      throw Error("service-result-denied");
    return result;
  }
  if (platform !== "linux" || !["systemd-system", "systemd-user"].includes(service.manager))
    throw Error("service-platform-denied");
  const fresh = (await linuxServices(service.manager, options, service.name)).items[0];
  if (!fresh || fresh.protected || fresh.definitionSha256 !== service.definitionSha256)
    return { result: "service-changed" };
  // systemctl uses fixed operations, zero custom arguments, no shell/elevation.
  // Avoid cascading stop transactions: refuse when active dependent units exist.
  const scope = service.manager === "systemd-user" ? "--user" : "--system";
  if (operation === "stop-service") {
    const r = await exec(
      "/usr/bin/systemctl",
      [
        scope,
        "--no-ask-password",
        "--no-pager",
        "show",
        "--property=RequiredBy,BoundBy,ConsistsOf,PropagatesStopTo",
        "--",
        service.name,
      ],
      { timeout: 15000 },
    );
    const dependents = [
      ...new Set(
        r.output
          .split(/\r?\n/)
          .flatMap((l) => (l.includes("=") ? l.slice(l.indexOf("=") + 1).split(/\s+/) : []))
          .filter(Boolean),
      ),
    ];
    if (
      dependents.length > 128 ||
      dependents.some(
        (n) =>
          n.startsWith("-") ||
          /[\\/]/.test(n) ||
          [...n].some((c) => c.charCodeAt(0) <= 32 || c.charCodeAt(0) === 127),
      )
    )
      return { result: "dependents-running" };
    if (dependents.length) {
      const states = await exec(
        "/usr/bin/systemctl",
        [
          scope,
          "--no-ask-password",
          "--no-pager",
          "show",
          "--property=ActiveState",
          "--",
          ...dependents,
        ],
        { timeout: 15000 },
      );
      if (/ActiveState=(?:active|activating|deactivating)/.test(states.output))
        return { result: "dependents-running" };
    }
  }
  await options.beforeExecute?.();
  try {
    await exec(
      "/usr/bin/systemctl",
      [
        scope,
        "--no-ask-password",
        "--no-pager",
        operation === "start-service" ? "start" : "stop",
        "--",
        service.name,
      ],
      { timeout: 45000, diagnose: true },
    );
  } catch (e) {
    return {
      result:
        e.message === "os-permission-denied"
          ? "os-permission-denied"
          : /interrupted|timeout/.test(e.message)
            ? "interrupted"
            : "failed",
    };
  }
  const after = (await linuxServices(service.manager, options, service.name)).items[0];
  return {
    result:
      after?.status === (operation === "start-service" ? "running" : "stopped")
        ? operation === "start-service"
          ? "service-started"
          : "service-stopped"
        : "interrupted",
  };
}
async function fileDigest(file) {
  await plain(file);
  const handle = await fs.open(file, "r"),
    h = crypto.createHash("sha256");
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > 262144000) throw Error("software-cache-capacity");
    for await (const chunk of handle.createReadStream({ autoClose: false, highWaterMark: 65536 }))
      h.update(chunk);
    return { sha256: h.digest("hex"), bytes: info.size };
  } finally {
    await handle.close();
  }
}
async function cacheCapacity(root, incoming) {
  const entries = await fs.readdir(root);
  if (entries.length >= 32) throw Error("software-cache-capacity");
  let size = incoming;
  for (const name of entries) {
    const file = path.join(root, name);
    await plain(file);
    const info = await fs.stat(file);
    if (!info.isFile()) throw Error("software-cache-entry-denied");
    size += info.size;
    if (size > 524288000) throw Error("software-cache-capacity");
  }
}
async function install(pkg, root, options = {}) {
  const platform = options.platform ?? process.platform,
    exec = options.run ?? run;
  if (
    pkg.recipe === "demo-api" ||
    pkg.platform !== platform ||
    !(platform === "win32"
      ? pkg.recipe === "windows-msi"
      : ["linux-deb", "linux-rpm"].includes(pkg.recipe))
  )
    throw Error("software-recipe-denied");
  if (platform === "linux" && process.getuid?.() === 0 && !options.test)
    throw Error("software-privileged-connector-denied");
  const asset = pkg.asset,
    u = new URL(asset.url);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    !/^[a-f0-9]{64}$/.test(asset.sha256) ||
    !Number.isInteger(asset.bytes) ||
    asset.bytes < 1 ||
    asset.bytes > 262144000
  )
    throw Error("software-asset-denied");
  await plain(root);
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  await cacheCapacity(root, asset.bytes);
  const extension =
      pkg.recipe === "windows-msi" ? ".msi" : pkg.recipe === "linux-deb" ? ".deb" : ".rpm",
    file = path.join(root, asset.sha256 + extension);
  await plain(file);
  options.progress?.("downloading");
  const response = await (options.fetch ?? fetch)(asset.url, {
    redirect: "error",
    signal: AbortSignal.timeout(300000),
    headers: { "Accept-Encoding": "identity" },
  });
  if (!response.ok || !response.body) throw Error("software-download-failed");
  const temp = file + "." + crypto.randomBytes(16).toString("hex") + ".download",
    h = crypto.createHash("sha256"),
    handle = await fs.open(temp, "wx", 0o600);
  let bytes = 0;
  try {
    for await (const part of response.body) {
      bytes += part.length;
      if (bytes > asset.bytes) throw Error("software-download-capacity");
      h.update(part);
      await handle.write(part);
    }
    await handle.sync();
  } catch (e) {
    await handle.close();
    await fs.unlink(temp);
    throw e;
  }
  await handle.close();
  options.progress?.("verifying");
  if (bytes !== asset.bytes || h.digest("hex") !== asset.sha256) {
    await fs.unlink(temp);
    throw Error("software-artifact-mismatch");
  }
  // Stream cached bytes; an installer never needs a package-sized RAM buffer.
  try {
    const existing = await fileDigest(file);
    if (existing.sha256 !== asset.sha256 || existing.bytes !== asset.bytes)
      throw Error("software-cache-mismatch");
    await fs.unlink(temp);
  } catch (e) {
    if (e.code !== "ENOENT") {
      await fs.unlink(temp);
      throw e;
    }
    await fs.rename(temp, file);
  }
  const verified = await fileDigest(file);
  if (verified.sha256 !== asset.sha256 || verified.bytes !== asset.bytes)
    throw Error("software-cached-artifact-mismatch");
  if (platform === "win32") {
    if (asset.signerThumbprint)
      await exec(powershell(), [
        ...windowsArgs("Signature"),
        "-PackagePath",
        file,
        "-Thumbprint",
        asset.signerThumbprint,
      ]);
    await options.beforeExecute?.();
    options.progress?.("waiting-for-os");
    return exec(path.join(process.env.WINDIR, "System32/msiexec.exe"), ["/i", file, "/norestart"], {
      interactive: true,
      timeout: 900000,
    });
  }
  await options.beforeExecute?.();
  options.progress?.("waiting-for-os");
  return exec(
    "/usr/bin/pkexec",
    [
      pkg.recipe === "linux-deb" ? "/usr/bin/dpkg" : "/usr/bin/rpm",
      pkg.recipe === "linux-deb" ? "--install" : "--install",
      file,
    ],
    { interactive: true, timeout: 900000 },
  );
}
module.exports = {
  inventory,
  install,
  serviceInventory,
  serviceAction,
  serviceNameValid,
  run,
  plain,
  environment,
  sha,
};
