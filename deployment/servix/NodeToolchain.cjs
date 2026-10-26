"use strict";
const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
const { createHash, randomUUID } = require("node:crypto"),
  { promisify } = require("node:util"),
  { execFile } = require("node:child_process");
const run = promisify(execFile);
const root = () =>
  path.join(
    process.env.LOCALAPPDATA || path.join(os.homedir(), ".local", "share"),
    "DevSetu",
    "toolchains",
  );
const key = (repository) =>
  createHash("sha256")
    .update(
      process.platform === "win32"
        ? path.resolve(repository).toLowerCase()
        : path.resolve(repository),
    )
    .digest("hex");
function names(version, platform = process.platform, arch = process.arch) {
  if (
    !/^\d+\.\d+\.\d+$/.test(version) ||
    !["win32", "linux"].includes(platform) ||
    !["x64", "arm64"].includes(arch)
  )
    throw Error("node-toolchain-unsupported");
  const folder = `node-v${version}-${platform === "win32" ? "win" : "linux"}-${arch}`;
  const filename = folder + (platform === "win32" ? ".zip" : ".tar.xz");
  return {
    folder,
    filename,
    node: platform === "win32" ? "node.exe" : "bin/node",
    npm:
      platform === "win32"
        ? "node_modules/npm/bin/npm-cli.js"
        : "lib/node_modules/npm/bin/npm-cli.js",
  };
}
async function plain(file) {
  for (let current = path.resolve(file); ; ) {
    if ((await fs.lstat(current)).isSymbolicLink()) throw Error("node-toolchain-linked-path");
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}
async function selection(repository) {
  try {
    const file = path.join(root(), "selections", key(repository) + ".json");
    await plain(file);
    const info = await fs.lstat(file);
    if (info.size > 2048 || !info.isFile()) throw Error();
    const record = JSON.parse(await fs.readFile(file, "utf8"));
    if (record.repository !== key(repository) || !/^[a-f0-9]{64}$/.test(record.archiveSha256))
      throw Error();
    const n = names(record.version),
      directory = path.join(root(), n.folder);
    const node = path.join(directory, n.node),
      npm = path.join(directory, n.npm);
    await plain(node);
    await plain(npm);
    return { node, npm, version: record.version };
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw Error("node-toolchain-selection-invalid");
  }
}
let cached;
async function metadata() {
  if (cached && Date.now() - cached.at < 300000) return cached.value;
  const response = await fetch("https://nodejs.org/dist/index.json", {
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Error("node-release-index-unavailable");
  const text = await response.text();
  if (text.length > 2_000_000) throw Error("node-release-index-capacity");
  const value = JSON.parse(text);
  if (!Array.isArray(value)) throw Error();
  cached = { at: Date.now(), value };
  return value;
}
async function asset(version, platform = process.platform, arch = process.arch) {
  const n = names(version, platform, arch);
  const response = await fetch(`https://nodejs.org/dist/v${version}/SHASUMS256.txt`, {
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Error("node-checksum-unavailable");
  const text = await response.text();
  if (text.length > 65536) throw Error();
  const line = text
    .split("\n")
    .map((s) => s.trim().split(/\s+/))
    .find((v) => v[1] === n.filename && /^[a-f0-9]{64}$/.test(v[0]));
  if (!line) throw Error("node-release-asset-unavailable");
  return { version, platform, architecture: arch, filename: n.filename, sha256: line[0] };
}
async function choose(requirements, matches) {
  try {
    const releases = await metadata();
    for (const release of releases) {
      const version = /^v(22|24)\.\d+\.\d+$/.test(release.version)
        ? release.version.slice(1)
        : null;
      if (!version || typeof release.npm !== "string") continue;
      if (
        requirements
          .filter((r) => r.id === "node")
          .every((r) => matches(version, r.required) === true) &&
        requirements
          .filter((r) => r.id === "npm")
          .every((r) => matches(release.npm, r.required) === true)
      )
        return await asset(version);
    }
    return null;
  } catch {
    return null;
  }
}
async function installAsset(repository, reviewed, targetRoot = root()) {
  const expected = await asset(reviewed.version, reviewed.platform, reviewed.architecture);
  if (JSON.stringify(reviewed) !== JSON.stringify(expected) || targetRoot !== root())
    throw Error("node-release-preview-changed");
  const n = names(reviewed.version),
    base = root();
  await fs.mkdir(base, { recursive: true, mode: 0o700 });
  await plain(base);
  const directory = path.join(base, n.folder),
    ready = path.join(directory, ".devsetu-runtime.json");
  let exists = false;
  try {
    await plain(ready);
    const saved = JSON.parse(await fs.readFile(ready, "utf8"));
    if (saved.sha256 !== reviewed.sha256) throw Error();
    exists = true;
  } catch (e) {
    if (e.code !== "ENOENT") throw Error("node-toolchain-collision");
  }
  if (!exists) {
    const staging = await fs.mkdtemp(path.join(base, "prepare-")),
      archive = path.join(staging, n.filename);
    await fs.chmod(staging, 0o700);
    // Cleanup is limited to this verified freshly-created staging directory.
    try {
      const response = await fetch(`https://nodejs.org/dist/v${reviewed.version}/${n.filename}`, {
        redirect: "error",
        signal: AbortSignal.timeout(300000),
      });
      if (!response.ok || !response.body) throw Error("node-download-unavailable");
      const stream = await fs.open(archive, "wx", 0o600),
        hash = createHash("sha256");
      let size = 0;
      try {
        for await (const chunk of response.body) {
          size += chunk.length;
          if (size > 150_000_000) throw Error("node-download-capacity");
          hash.update(chunk);
          await stream.write(chunk);
        }
        await stream.sync();
      } finally {
        await stream.close();
      }
      if (hash.digest("hex") !== reviewed.sha256) throw Error("node-download-integrity");
      const tar =
        process.platform === "win32"
          ? path.join(process.env.WINDIR, "System32/tar.exe")
          : "/usr/bin/tar";
      const listing = (
        await run(tar, ["-tf", archive], {
          windowsHide: true,
          maxBuffer: 2_000_000,
          timeout: 30000,
        })
      ).stdout;
      if (
        !listing
          .split(/\r?\n/)
          .filter(Boolean)
          .every(
            (entry) =>
              entry.startsWith(n.folder + "/") &&
              !entry.split("/").includes("..") &&
              !entry.includes("\\"),
          )
      )
        throw Error("node-archive-scope");
      await run(tar, ["-xf", archive, "-C", staging], {
        windowsHide: true,
        maxBuffer: 4096,
        timeout: 120000,
      });
      const prepared = path.join(staging, n.folder);
      await plain(path.join(prepared, n.node));
      await fs.writeFile(
        path.join(prepared, ".devsetu-runtime.json"),
        JSON.stringify({ sha256: reviewed.sha256 }),
        { flag: "wx", mode: 0o600 },
      );
      await fs.rename(prepared, directory);
    } finally {
      if (
        path.dirname(staging) === path.resolve(base) &&
        path.basename(staging).startsWith("prepare-")
      )
        await fs.rm(staging, { recursive: true, force: true });
    }
  }
  await fs.mkdir(path.join(base, "selections"), { recursive: true, mode: 0o700 });
  await plain(path.join(base, "selections"));
  const file = path.join(base, "selections", key(repository) + ".json"),
    temporary = file + "." + randomUUID() + ".tmp";
  await fs.writeFile(
    temporary,
    JSON.stringify({
      repository: key(repository),
      version: reviewed.version,
      archiveSha256: reviewed.sha256,
    }),
    { flag: "wx", mode: 0o600 },
  );
  await fs.rename(temporary, file);
  return selection(repository);
}
module.exports = { selection, choose, installAsset, asset, names, root };
