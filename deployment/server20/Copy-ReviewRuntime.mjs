import { createHash } from "node:crypto";
import { lstat, mkdir, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const within = (root, file) => {
  const part = relative(root, file);
  return part === "" || (!isAbsolute(part) && part !== ".." && !part.startsWith(".." + sep));
};
const fail = (message) => {
  throw Error("review-runtime-" + message);
};
async function plain(file) {
  for (let current = resolve(file); ; current = dirname(current)) {
    try {
      if ((await lstat(current)).isSymbolicLink()) fail("linked-path-denied");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (dirname(current) === current) break;
  }
}
async function bytes(file, max = 4 * 1024 * 1024) {
  await plain(file);
  const stat = await lstat(file);
  if (!stat.isFile() || stat.size > max) fail("file-limit");
  const content = await readFile(file);
  if (content.length !== stat.size) fail("source-changed");
  return content;
}
const json = async (file) => JSON.parse((await bytes(file)).toString("utf8"));
const validName = (name) =>
  /^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/i.test(name) &&
  !name
    .split("/")
    .some((part) => [".", "..", "constructor", "prototype", "__proto__"].includes(part));
const versionOnly = (value) => /^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9.-]+)?$/.test(value ?? "");
function unquote(value) {
  return /^(['"]).*\1$/.test(value) ? value.slice(1, -1) : value;
}
function snapshot(lock, name, version) {
  const key = name + "@" + version;
  const entries = lock.split(/\r?\n/);
  let start = -1;
  for (let line = 0; line < entries.length; line++) {
    const match = /^ {2}(.+?):(?: \{\})?$/.exec(entries[line]);
    if (match && unquote(match[1]) === key) {
      start = line + 1;
      break;
    }
  }
  if (start < 0) fail("dependency-not-in-lock");
  const edges = new Map();
  let collecting = false;
  for (let line = start; line < entries.length; line++) {
    const current = entries[line];
    if (/^ {2}\S/.test(current)) break;
    if (/^ {4}\S/.test(current))
      collecting = /^ {4}(?:dependencies|optionalDependencies):$/.test(current);
    if (!collecting) continue;
    const edge = /^ {6}(.+?): (.+)$/.exec(current);
    if (edge) {
      const dependency = unquote(edge[1]),
        resolved = unquote(edge[2]);
      if (!validName(dependency) || !versionOnly(resolved)) fail("unsupported-lock-edge");
      edges.set(dependency, resolved);
    }
  }
  return edges;
}

/** Copies bounded built Reviews/monitoring overlays into a disposable release. No install hooks or network. */
export async function copyReviewRuntime({
  sourceRoot: sourceInput,
  packageRoot: packageInput,
  includeMonitoring = false,
}) {
  if (typeof includeMonitoring !== "boolean") fail("monitoring-option-invalid");
  const sourceRoot = resolve(sourceInput),
    packageRoot = resolve(packageInput);
  if (
    basename(packageRoot) !== "package" ||
    !/^servix-release-[a-f0-9]{32}$/.test(basename(dirname(packageRoot)))
  )
    fail("destination-is-not-release-output");
  await plain(sourceRoot);
  await plain(packageRoot);
  if (!(await lstat(sourceRoot)).isDirectory() || !(await lstat(packageRoot)).isDirectory())
    fail("root-not-directory");
  await bytes(join(packageRoot, "release-manifest.json"));
  const sourcePackage = await json(join(sourceRoot, "apps/control-plane/package.json"));
  const targetMetadataPath = join(packageRoot, "apps/control-plane/package.json");
  const targetPackage = await json(targetMetadataPath);
  const contractsMetadata = await json(
    join(packageRoot, "apps/control-plane/node_modules/@frevos/contracts/package.json"),
  );
  if (
    sourcePackage.name !== "@frevos/control-plane" ||
    targetPackage.name !== sourcePackage.name ||
    contractsMetadata.name !== "@frevos/contracts"
  )
    fail("application-package-mismatch");
  const lockBytes = await bytes(join(sourceRoot, "pnpm-lock.yaml"), 8 * 1024 * 1024);
  const lockText = lockBytes.toString("utf8");
  const importer = /\r?\n {2}apps\/control-plane:\r?\n([\s\S]*?)(?=\r?\n {2}\S|$)/.exec(
    lockText,
  )?.[1];
  if (!importer) fail("application-lock-importer-missing");
  const lock = lockText.split(/\r?\nsnapshots:\r?\n/)[1];
  if (!lock) fail("lock-snapshots-missing");
  const installation = await realpath(join(sourceRoot, "node_modules"));
  if (!within(sourceRoot, installation)) fail("installation-escaped-source");
  await plain(installation);
  const files = [];
  const dependencies = [];
  let totalBytes = 0;
  async function stage(source, destination) {
    if (!within(packageRoot, destination)) fail("destination-escaped-package");
    const content = await bytes(source);
    totalBytes += content.length;
    if (files.length >= 10000 || totalBytes > 100 * 1024 * 1024) fail("copy-capacity");
    files.push({ source, destination, content, sha256: hash(content) });
  }
  const sourceFiles = await readdir(join(sourceRoot, "apps/control-plane/src"), {
    withFileTypes: true,
  });
  const modules = sourceFiles
    .filter((file) => file.isFile() && /^review-[a-z0-9-]+\.ts$/.test(file.name))
    .map((file) => file.name.slice(0, -3))
    .sort();
  if (
    modules.length > 32 ||
    !["review-authority", "review-registers", "review-workbook", "review-link-checker"].every(
      (name) => modules.includes(name),
    )
  )
    fail("module-set-invalid");
  for (const name of modules)
    for (const suffix of ["js", "js.map", "d.ts", "d.ts.map"])
      await stage(
        join(sourceRoot, `apps/control-plane/dist/${name}.${suffix}`),
        join(packageRoot, `apps/control-plane/dist/${name}.${suffix}`),
      );
  for (const suffix of ["js", "js.map", "d.ts", "d.ts.map"])
    await stage(
      join(sourceRoot, `packages/contracts/dist/review-registers.${suffix}`),
      join(
        packageRoot,
        `apps/control-plane/node_modules/@frevos/contracts/dist/review-registers.${suffix}`,
      ),
    );
  await stage(
    join(sourceRoot, "apps/control-plane/migrations/0007_review_workspace_state.sql"),
    join(packageRoot, "apps/control-plane/migrations/0007_review_workspace_state.sql"),
  );

  const monitoringNames = [
    "server-monitoring",
    "server-monitoring-runtime",
    "server-monitoring-store",
  ];
  const optionalMonitoringNames = ["server-monitoring-central"];
  const monitoringModules = sourceFiles
    .filter((file) => file.isFile() && /^server-monitoring(?:-[a-z0-9-]+)?\.ts$/.test(file.name))
    .map((file) => file.name.slice(0, -3))
    .sort();
  if (includeMonitoring || monitoringModules.length) {
    if (
      monitoringModules.length > monitoringNames.length + optionalMonitoringNames.length ||
      !monitoringNames.every((name) => monitoringModules.includes(name)) ||
      monitoringModules.some(
        (name) => !monitoringNames.includes(name) && !optionalMonitoringNames.includes(name),
      )
    )
      fail("monitoring-module-set-invalid");
    for (const name of monitoringModules)
      for (const suffix of ["js", "js.map", "d.ts", "d.ts.map"])
        await stage(
          join(sourceRoot, `apps/control-plane/dist/${name}.${suffix}`),
          join(packageRoot, `apps/control-plane/dist/${name}.${suffix}`),
        );
    for (const suffix of ["js", "js.map", "d.ts", "d.ts.map"])
      await stage(
        join(sourceRoot, `packages/contracts/dist/server-monitoring.${suffix}`),
        join(
          packageRoot,
          `apps/control-plane/node_modules/@frevos/contracts/dist/server-monitoring.${suffix}`,
        ),
      );
    await stage(
      join(sourceRoot, "apps/control-plane/migrations/0008_server_monitoring_state.sql"),
      join(packageRoot, "apps/control-plane/migrations/0008_server_monitoring_state.sql"),
    );
    const operatorFiles = [
      "Common.ps1",
      "Collector.ps1",
      "Worker.ps1",
      "Protect-Credential.ps1",
      "Install-Worker.ps1",
    ];
    const manifestPath = join(sourceRoot, "deployment/server-monitoring/manifest.v1.json");
    const operatorManifest = await json(manifestPath);
    if (
      operatorManifest?.version !== 1 ||
      !Array.isArray(operatorManifest.files) ||
      operatorManifest.files.length !== operatorFiles.length ||
      Object.keys(operatorManifest).sort().join(",") !== "files,version" ||
      new Set(operatorManifest.files.map((file) => file?.name)).size !== operatorFiles.length ||
      operatorManifest.files.some(
        (file) =>
          !file ||
          Object.keys(file).sort().join(",") !== "name,sha256" ||
          !operatorFiles.includes(file.name) ||
          !/^[a-f0-9]{64}$/.test(file.sha256),
      )
    )
      fail("monitoring-operator-manifest-invalid");
    for (const file of operatorManifest.files) {
      const source = join(sourceRoot, "deployment/server-monitoring", file.name);
      if (hash(await bytes(source)) !== file.sha256) fail("monitoring-operator-manifest-mismatch");
      await stage(source, join(packageRoot, "deployment/server-monitoring", file.name));
    }
    // An operator enrollment or credential file is never part of a release overlay.
    for (const name of ["QueueCollector.mjs", "manifest.v1.json", "README.md"])
      await stage(
        join(sourceRoot, "deployment/server-monitoring", name),
        join(packageRoot, "deployment/server-monitoring", name),
      );
  }

  async function resolveDependency(from, name) {
    if (!validName(name)) fail("dependency-name-denied");
    for (let current = from; within(sourceRoot, current); current = dirname(current)) {
      const link = join(current, "node_modules", name);
      try {
        const physical = await realpath(link);
        if (!within(installation, physical)) fail("dependency-escaped-installation");
        await plain(physical);
        return physical;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      if (current === sourceRoot) break;
    }
    return fail("dependency-missing");
  }
  async function copyPackage(source, destination, expectedName, expectedVersion, ancestry) {
    if (dependencies.length >= 128 || ancestry.length >= 12 || ancestry.includes(source))
      fail("dependency-closure-capacity");
    const metadata = await json(join(source, "package.json"));
    if (
      metadata.name !== expectedName ||
      metadata.version !== expectedVersion ||
      !versionOnly(metadata.version)
    )
      fail("dependency-version-mismatch");
    const edges = snapshot(lock, metadata.name, metadata.version);
    const required = new Set([
      ...Object.keys(metadata.dependencies ?? {}),
      ...Object.keys(metadata.optionalDependencies ?? {}),
      ...Object.keys(metadata.peerDependencies ?? {}),
    ]);
    if ([...required].some((name) => !edges.has(name))) fail("dependency-lock-edge-missing");
    dependencies.push({
      name: metadata.name,
      version: metadata.version,
      path: relative(packageRoot, destination).replaceAll("\\", "/"),
    });
    async function directory(sourceDirectory, targetDirectory, depth = 0) {
      if (depth > 20) fail("dependency-directory-capacity");
      await plain(sourceDirectory);
      const entries = await readdir(sourceDirectory, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === "node_modules") continue;
        const sourceFile = join(sourceDirectory, entry.name),
          targetFile = join(targetDirectory, entry.name);
        if (entry.isSymbolicLink()) fail("linked-dependency-file");
        if (entry.isDirectory()) await directory(sourceFile, targetFile, depth + 1);
        else if (entry.isFile()) await stage(sourceFile, targetFile);
        else fail("nonplain-dependency-file");
      }
    }
    await directory(source, destination);
    for (const [dependency, version] of edges) {
      if (!required.has(dependency)) fail("unexpected-lock-dependency");
      const physical = await resolveDependency(source, dependency);
      await copyPackage(
        physical,
        join(destination, "node_modules", dependency),
        dependency,
        version,
        [...ancestry, source],
      );
    }
  }
  const selected = ["fflate", "fast-xml-parser"];
  for (const name of selected) {
    const version = sourcePackage.dependencies?.[name];
    if (!versionOnly(version)) fail("dependency-must-be-exactly-pinned");
    const imported = new RegExp(
      `^ {6}${name}:\\r?\\n {8}specifier: (.+)\\r?\\n {8}version: (.+)$`,
      "m",
    ).exec(importer);
    if (
      !imported ||
      unquote(imported[1].trim()) !== version ||
      unquote(imported[2].trim()) !== version
    )
      fail("application-lock-version-mismatch");
    const physical = await resolveDependency(join(sourceRoot, "apps/control-plane"), name);
    await copyPackage(
      physical,
      join(packageRoot, "apps/control-plane/node_modules", name),
      name,
      version,
      [],
    );
  }
  // Fully plan and hash the closure before touching the disposable package.
  for (const file of files)
    if (hash(await bytes(file.source)) !== file.sha256) fail("source-changed");
  for (const name of selected) {
    const destination = join(packageRoot, "apps/control-plane/node_modules", name);
    if (!within(packageRoot, destination) || destination === packageRoot)
      fail("dependency-cleanup-escaped");
    await plain(destination);
    await rm(destination, { recursive: true, force: true });
  }
  for (const file of files) {
    await plain(file.destination);
    await mkdir(dirname(file.destination), { recursive: true });
    await writeFile(file.destination, file.content, { mode: 0o600 });
    if (hash(await bytes(file.destination)) !== file.sha256) fail("copied-file-differs");
  }
  targetPackage.dependencies = {
    ...targetPackage.dependencies,
    ...Object.fromEntries(selected.map((name) => [name, sourcePackage.dependencies[name]])),
  };
  await writeFile(targetMetadataPath, JSON.stringify(targetPackage, null, 2) + "\n", {
    mode: 0o600,
  });
  if (hash(await bytes(join(sourceRoot, "pnpm-lock.yaml"), 8 * 1024 * 1024)) !== hash(lockBytes))
    fail("lock-changed");
  const receipt = {
    version: 1,
    lockSha256: hash(lockBytes),
    modules,
    monitoringModules,
    dependencies,
    files: files.map(({ destination, sha256, content }) => ({
      path: relative(packageRoot, destination).replaceAll("\\", "/"),
      sha256,
      bytes: content.length,
    })),
  };
  const proof = join(packageRoot, "deployment/server20/review-runtime-proof.json");
  await plain(proof);
  await mkdir(dirname(proof), { recursive: true });
  await writeFile(proof, JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600 });
  return {
    version: 1,
    modules,
    monitoringModules,
    dependencies: dependencies.length,
    files: files.length,
    proofSha256: hash(await bytes(proof)),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [sourceRoot, packageRoot, ...extra] = process.argv.slice(2);
  if (
    !sourceRoot ||
    !packageRoot ||
    extra.length > 1 ||
    (extra.length === 1 && extra[0] !== "--monitoring")
  )
    fail("arguments-invalid");
  copyReviewRuntime({ sourceRoot, packageRoot, includeMonitoring: extra[0] === "--monitoring" })
    .then((receipt) => process.stdout.write(JSON.stringify(receipt) + "\n"))
    .catch((error) => {
      process.stderr.write(String(error.message) + "\n");
      process.exitCode = 1;
    });
}
