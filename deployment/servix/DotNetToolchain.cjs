"use strict";
const fs = require("node:fs/promises"),
  path = require("node:path"),
  { createHash, randomUUID } = require("node:crypto"),
  { promisify } = require("node:util"),
  { execFile } = require("node:child_process");
const run = promisify(execFile),
  { root } = require("./NodeToolchain.cjs");
const key = (repository) => createHash("sha256").update(path.resolve(repository)).digest("hex");
async function plain(file) {
  for (let current = path.resolve(file); ; ) {
    if ((await fs.lstat(current)).isSymbolicLink()) throw Error("dotnet-linked-path");
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}
async function selections(repository) {
  const file = path.join(root(), "selections", key(repository) + ".dotnet.json");
  try {
    await plain(file);
    if ((await fs.stat(file)).size > 8192) throw Error();
    const records = JSON.parse(await fs.readFile(file, "utf8"));
    if (!Array.isArray(records) || records.length > 12) throw Error();
    for (const record of records) {
      if (
        !/^(8|9|10)\.0\.\d+$/.test(record.version) ||
        !/^[a-f0-9]{128}$/.test(record.sha512) ||
        typeof record.context !== "string" ||
        record.context.length > 240 ||
        record.context.split("/").includes("..")
      )
        throw Error();
      await plain(path.join(root(), "dotnet-" + record.version, "dotnet"));
    }
    return records;
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw Error("dotnet-selection-invalid");
  }
}
const cache = new Map();
async function choose(required, matches) {
  const major = Number(required.match(/\d+/)?.[0]);
  if (![8, 9, 10].includes(major) || process.platform !== "linux") return null;
  try {
    let metadata = cache.get(major);
    if (!metadata || Date.now() - metadata.at > 300000) {
      const response = await fetch(
        `https://builds.dotnet.microsoft.com/dotnet/release-metadata/${major}.0/releases.json`,
        { redirect: "error", signal: AbortSignal.timeout(20000) },
      );
      if (!response.ok) throw Error();
      const text = await response.text();
      if (text.length > 10000000) throw Error();
      metadata = { at: Date.now(), value: JSON.parse(text) };
      cache.set(major, metadata);
    }
    const sdks = metadata.value.releases
      .flatMap((r) => r.sdks || [r.sdk])
      .filter(Boolean)
      .filter((s) => /^(8|9|10)\.0\.\d+$/.test(s.version))
      .sort((a, b) => Number(b.version.split(".")[2]) - Number(a.version.split(".")[2]));
    for (const sdk of sdks) {
      if (matches(sdk.version, required) !== true) continue;
      const file = sdk.files?.find(
        (f) => f.rid === `linux-${process.arch}` && f.name.endsWith(".tar.gz"),
      );
      if (!file || !/^[a-f0-9]{128}$/i.test(file.hash)) continue;
      const url = new URL(file.url);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        ![
          "builds.dotnet.microsoft.com",
          "download.visualstudio.microsoft.com",
          "dotnetcli.azureedge.net",
        ].includes(url.hostname)
      )
        continue;
      return {
        kind: "dotnet-sdk",
        version: sdk.version,
        url: url.href,
        sha512: file.hash.toLowerCase(),
        architecture: process.arch,
      };
    }
    return null;
  } catch {
    return null;
  }
}
async function nativeDependencies(system) {
  if (system.family === "dnf") {
    const required = [
        "glibc",
        "libgcc",
        "ca-certificates",
        "openssl-libs",
        "libstdc++",
        "libicu",
        "tzdata",
        "krb5-libs",
        "zlib",
      ],
      missing = [];
    for (const name of required) {
      try {
        await run("/usr/bin/rpm", ["-q", name], { timeout: 5000, maxBuffer: 4096 });
      } catch {
        missing.push(name);
      }
    }
    return missing.length
      ? [{ file: "/usr/bin/dnf", arguments: ["install", "--assumeyes", ...missing] }]
      : [];
  }
  const release = await fs.readFile("/etc/os-release", "utf8"),
    version = release.match(/^VERSION_ID=["']?([0-9.]+)/m)?.[1];
  let icu;
  try {
    const listing = (
      await run("/usr/bin/apt-cache", ["search", "--names-only", "^libicu[0-9]+$"], {
        timeout: 10000,
        maxBuffer: 16384,
      })
    ).stdout;
    icu = listing
      .split("\n")
      .map((l) => l.match(/^(libicu\d+) /)?.[1])
      .filter(Boolean)
      .sort((a, b) => Number(b.slice(6)) - Number(a.slice(6)))[0];
  } catch {}
  icu ||= {
    "debian:12": "libicu72",
    "debian:13": "libicu76",
    "ubuntu:22.04": "libicu70",
    "ubuntu:24.04": "libicu74",
  }[`${system.name}:${version}`];
  if (!icu) throw Error("dotnet-native-dependencies-review-required");
  const ssl =
    (system.name === "ubuntu" && Number(version) >= 24) ||
    (system.name === "debian" && Number(version) >= 13)
      ? "libssl3t64"
      : "libssl3";
  const required = [
      "libc6",
      "libgcc-s1",
      "ca-certificates",
      "libgssapi-krb5-2",
      icu,
      ssl,
      "libstdc++6",
      "zlib1g",
      "tzdata",
    ],
    missing = [];
  for (const name of required) {
    try {
      const result = (
        await run("/usr/bin/dpkg-query", ["-W", "-f=${Status}", name], {
          timeout: 5000,
          maxBuffer: 4096,
        })
      ).stdout;
      if (result !== "install ok installed") missing.push(name);
    } catch {
      missing.push(name);
    }
  }
  return missing.length
    ? [
        { file: "/usr/bin/apt-get", arguments: ["update"] },
        {
          file: "/usr/bin/apt-get",
          arguments: ["install", "--yes", "--no-install-recommends", ...missing],
        },
      ]
    : [];
}
async function install(repository, asset, source) {
  if (
    process.platform !== "linux" ||
    asset.kind !== "dotnet-sdk" ||
    !/^(8|9|10)\.0\.\d+$/.test(asset.version) ||
    !/^[a-f0-9]{128}$/.test(asset.sha512) ||
    asset.architecture !== process.arch
  )
    throw Error("dotnet-asset-invalid");
  const base = root();
  await fs.mkdir(base, { recursive: true, mode: 0o700 });
  await plain(base);
  const destination = path.join(base, "dotnet-" + asset.version),
    receipt = path.join(destination, ".devsetu-sdk.json");
  let exists = false;
  try {
    await plain(receipt);
    const record = JSON.parse(await fs.readFile(receipt, "utf8"));
    if (record.sha512 !== asset.sha512) throw Error();
    exists = true;
  } catch (e) {
    if (e.code !== "ENOENT") throw Error("dotnet-installation-collision");
  }
  if (!exists) {
    const staging = await fs.mkdtemp(path.join(base, "prepare-dotnet-"));
    await fs.chmod(staging, 0o700);
    try {
      const url = new URL(asset.url);
      if (
        url.protocol !== "https:" ||
        ![
          "builds.dotnet.microsoft.com",
          "download.visualstudio.microsoft.com",
          "dotnetcli.azureedge.net",
        ].includes(url.hostname)
      )
        throw Error("dotnet-source-invalid");
      const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(600000) });
      if (!response.ok || !response.body) throw Error("dotnet-download-unavailable");
      const archive = path.join(staging, "sdk.tar.gz"),
        handle = await fs.open(archive, "wx", 0o600),
        hash = createHash("sha512");
      let bytes = 0;
      try {
        for await (const chunk of response.body) {
          bytes += chunk.length;
          if (bytes > 500000000) throw Error("dotnet-capacity");
          hash.update(chunk);
          await handle.write(chunk);
        }
        await handle.sync();
      } finally {
        await handle.close();
      }
      if (hash.digest("hex") !== asset.sha512) throw Error("dotnet-integrity-failed");
      const listing = (
        await run("/usr/bin/tar", ["-tzf", archive], { timeout: 30000, maxBuffer: 4000000 })
      ).stdout;
      if (
        !listing
          .split("\n")
          .filter(Boolean)
          .every(
            (entry) =>
              !entry.startsWith("/") && !entry.includes("\\") && !entry.split("/").includes(".."),
          )
      )
        throw Error("dotnet-archive-scope");
      const prepared = path.join(staging, "sdk");
      await fs.mkdir(prepared, { mode: 0o700 });
      await run("/usr/bin/tar", ["-xzf", archive, "--no-same-owner", "-C", prepared], {
        timeout: 180000,
        maxBuffer: 4096,
      });
      await plain(path.join(prepared, "dotnet"));
      await fs.writeFile(
        path.join(prepared, ".devsetu-sdk.json"),
        JSON.stringify({ sha512: asset.sha512 }),
        { flag: "wx", mode: 0o600 },
      );
      await fs.rename(prepared, destination);
    } finally {
      if (
        path.dirname(staging) === path.resolve(base) &&
        path.basename(staging).startsWith("prepare-dotnet-")
      )
        await fs.rm(staging, { recursive: true, force: true });
    }
  }
  const records = await selections(repository),
    context = path.posix.dirname(source.replaceAll("\\", "/"));
  const updated = records.filter((r) => r.context !== context);
  updated.push({ version: asset.version, sha512: asset.sha512, context });
  const directory = path.join(base, "selections");
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await plain(directory);
  const file = path.join(directory, key(repository) + ".dotnet.json"),
    temporary = file + "." + randomUUID() + ".tmp";
  await fs.writeFile(temporary, JSON.stringify(updated), { flag: "wx", mode: 0o600 });
  await fs.rename(temporary, file);
}
async function forProject(repository, directory) {
  const records = await selections(repository),
    relative = path.relative(repository, directory).replaceAll("\\", "/") || ".";
  const scoped = records
    .filter(
      (r) => r.context === "." || relative === r.context || relative.startsWith(r.context + "/"),
    )
    .sort((a, b) => b.context.length - a.context.length);
  const selected = scoped[0];
  return selected
    ? {
        directory: path.join(root(), "dotnet-" + selected.version),
        executable: path.join(root(), "dotnet-" + selected.version, "dotnet"),
        version: selected.version,
      }
    : null;
}
module.exports = { choose, nativeDependencies, install, selections, forProject };
