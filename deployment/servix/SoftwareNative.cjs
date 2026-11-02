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
function run(file, args, { timeout = 90000, capacity = 3000000, interactive = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      shell: false,
      windowsHide: !interactive,
      env: environment(),
      stdio: ["ignore", interactive ? "ignore" : "pipe", "ignore"],
    });
    let output = "",
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
    child.on("error", () => finish(Error("software-native-unavailable")));
    child.on("close", (code) =>
      code === 0 || code === 3010
        ? finish(null, { output, restartRequired: code === 3010 })
        : finish(Error("software-native-failed")),
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
    result.items = [...unique.values()].sort((a, b) => a.name.localeCompare(b.name));
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
module.exports = { inventory, install, run, plain, environment, sha };
