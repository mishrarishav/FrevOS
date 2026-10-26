"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { createRequire } = require("node:module");
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const identity = /^[a-f0-9]{64}$/;
const folder = /^[a-z][a-z0-9-]{1,47}$/;
const forbidden = new Set([
  "uploads",
  "attachment",
  "attachments",
  "database",
  "node_modules",
  "logs",
  "backups",
  "backup",
]);
function fail(code) {
  throw Error(code);
}
function keys(value, expected) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(",") !== expected.sort().join(",")
  )
    fail("backend-artifact-shape");
}
function plain(file) {
  for (let cursor = path.resolve(file); ; cursor = path.dirname(cursor)) {
    if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink())
      fail("backend-artifact-linked");
    if (path.dirname(cursor) === cursor) break;
  }
}
function beneath(root, relative) {
  if (
    typeof relative !== "string" ||
    relative.length > 1024 ||
    relative.includes("\\") ||
    relative.split("/").some((p) => !p || p === "." || p === ".." || !/^[A-Za-z0-9_.@ -]+$/.test(p))
  )
    fail("backend-artifact-path");
  const base = path.resolve(root),
    file = path.resolve(base, ...relative.split("/"));
  const compare = (s) => (process.platform === "win32" ? s.toLowerCase() : s);
  if (base === path.parse(base).root || !compare(file).startsWith(compare(base + path.sep)))
    fail("backend-artifact-path");
  plain(file);
  return file;
}
function read(file, limit) {
  plain(file);
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.size < 1 || stat.size > limit) fail("backend-artifact-capacity");
  return fs.readFileSync(file);
}
function descriptor(bytes, expected) {
  if (!identity.test(expected) || sha(bytes) !== expected) fail("backend-artifact-integrity");
  let value;
  try {
    value = JSON.parse(bytes);
  } catch {
    fail("backend-artifact-json");
  }
  keys(value, [
    "version",
    "kind",
    "entry",
    "sha256",
    "bytes",
    "nodeTarget",
    "dependencies",
    "modules",
    "runtimeProjects",
    "containsEnvironment",
    "containsUserFiles",
  ]);
  if (
    value.version !== 1 ||
    value.kind !== "node-backend-bundle" ||
    !identity.test(value.sha256) ||
    !Number.isSafeInteger(value.bytes) ||
    value.bytes < 1 ||
    value.bytes > 32 * 1024 * 1024 ||
    value.nodeTarget !== "node18" ||
    value.containsEnvironment !== false ||
    value.containsUserFiles !== false
  )
    fail("backend-artifact-shape");
  if (
    !Array.isArray(value.runtimeProjects) ||
    value.runtimeProjects.length < 1 ||
    value.runtimeProjects.length > 16 ||
    new Set(value.runtimeProjects).size !== value.runtimeProjects.length ||
    value.runtimeProjects.some((p) => !folder.test(p) || forbidden.has(p))
  )
    fail("backend-artifact-projects");
  if (value.entry !== value.runtimeProjects[0] + "/.releases/" + value.sha256 + "/server.cjs")
    fail("backend-artifact-entry");
  if (
    !Array.isArray(value.modules) ||
    !value.modules.length ||
    value.modules.length > 2048 ||
    new Set(value.modules).size !== value.modules.length ||
    value.modules.some(
      (p) =>
        typeof p !== "string" ||
        p.length > 512 ||
        !value.runtimeProjects.some((name) => p.startsWith(name + "/src/")) ||
        p
          .split("/")
          .some(
            (part) =>
              !part || part === "." || part === ".." || /^\.env/i.test(part) || forbidden.has(part),
          ) ||
        !/^[A-Za-z0-9_.@/ -]+\.(?:[cm]?js|json)$/.test(p),
    )
  )
    fail("backend-artifact-modules");
  if (!Array.isArray(value.dependencies) || value.dependencies.length > 256)
    fail("backend-artifact-dependencies");
  const seen = new Set();
  for (const dep of value.dependencies) {
    keys(dep, ["project", "name", "range"]);
    if (
      !value.runtimeProjects.includes(dep.project) ||
      typeof dep.name !== "string" ||
      !/^(?:@[A-Za-z0-9_.-]+\/)?[A-Za-z0-9_.-]+$/.test(dep.name) ||
      dep.name === "." ||
      dep.name === ".." ||
      typeof dep.range !== "string" ||
      !dep.range ||
      dep.range.length > 128 ||
      !/^[A-Za-z0-9.*+^~<>=| -]+$/.test(dep.range) ||
      seen.has(dep.project + ":" + dep.name)
    )
      fail("backend-artifact-dependencies");
    seen.add(dep.project + ":" + dep.name);
  }
  return value;
}
function semverLibrary() {
  return require(
    require.resolve("semver", {
      paths: [
        path.join(path.dirname(process.execPath), "node_modules/npm"),
        path.join(path.dirname(process.execPath), "../lib/node_modules/npm"),
      ],
    }),
  );
}
function dependencies(root, value, semver = semverLibrary()) {
  const snapshots = [];
  for (const dep of value.dependencies) {
    if (!semver.validRange(dep.range)) fail("backend-artifact-dependency-range");
    const projectRoot = beneath(root, dep.project);
    const requireFromProject = createRequire(beneath(root, dep.project + "/package.json"));
    let resolved;
    try {
      resolved = requireFromProject.resolve(dep.name);
    } catch {
      fail("backend-artifact-dependency-missing");
    }
    const allowed = path.join(projectRoot, "node_modules") + path.sep;
    const compare = (s) => (process.platform === "win32" ? s.toLowerCase() : s);
    if (!compare(path.resolve(resolved)).startsWith(compare(allowed)))
      fail("backend-artifact-dependency-scope");
    if (!fs.existsSync(resolved) || !fs.lstatSync(resolved).isFile())
      fail("backend-artifact-dependency-missing");
    plain(resolved);
    let directory = path.dirname(resolved),
      found = false;
    while (compare(directory + path.sep).startsWith(compare(allowed))) {
      const file = path.join(directory, "package.json");
      if (fs.existsSync(file)) {
        const bytes = read(file, 1024 * 1024);
        let metadata;
        try {
          metadata = JSON.parse(bytes);
        } catch {
          fail("backend-artifact-dependency-json");
        }
        if (metadata.name === dep.name) {
          if (!semver.satisfies(metadata.version, dep.range))
            fail("backend-artifact-dependency-version");
          snapshots.push({
            project: dep.project,
            name: dep.name,
            version: metadata.version,
            manifestSha256: sha(bytes),
          });
          found = true;
          break;
        }
      }
      directory = path.dirname(directory);
    }
    if (!found) fail("backend-artifact-dependency-identity");
  }
  return snapshots;
}
function inspect(artifactRoot, runtimeRoot, relative, expected, options = {}) {
  plain(runtimeRoot);
  const bytes = read(beneath(artifactRoot, relative), 256 * 1024);
  const value = descriptor(bytes, expected);
  if (relative !== value.runtimeProjects[0] + "/.releases/" + expected + "/artifact.json")
    fail("backend-artifact-descriptor-path");
  const file = beneath(artifactRoot, value.entry),
    bundle = read(file, 32 * 1024 * 1024);
  if (bundle.length !== value.bytes || sha(bundle) !== value.sha256)
    fail("backend-artifact-bundle-integrity");
  return {
    version: 1,
    mode: "bundle",
    descriptor: relative,
    manifestSha256: expected,
    entry: value.entry,
    bundleSha256: value.sha256,
    bytes: value.bytes,
    dependencies: dependencies(runtimeRoot, value, options.semver),
    runtimeProjects: value.runtimeProjects,
  };
}
function selection(applicationRoot, primaryProject) {
  if (!folder.test(primaryProject) || forbidden.has(primaryProject))
    fail("backend-artifact-projects");
  const file = beneath(applicationRoot, primaryProject + "/.runtime/devsetu-backend-artifact.json");
  if (!fs.existsSync(file)) return { version: 1, mode: "source" };
  let value;
  try {
    value = JSON.parse(read(file, 4096));
  } catch {
    fail("backend-artifact-selection-json");
  }
  if (value?.version === 1 && value.mode === "source") {
    keys(value, ["version", "mode"]);
    return value;
  }
  keys(value, ["version", "mode", "descriptor", "manifestSha256"]);
  if (
    value.version !== 1 ||
    value.mode !== "bundle" ||
    !identity.test(value.manifestSha256) ||
    value.descriptor !== primaryProject + "/.releases/" + value.manifestSha256 + "/artifact.json"
  )
    fail("backend-artifact-selection");
  const result = inspect(applicationRoot, applicationRoot, value.descriptor, value.manifestSha256);
  if (result.runtimeProjects[0] !== primaryProject) fail("backend-artifact-selection");
  return { ...result, executable: beneath(applicationRoot, result.entry) };
}
module.exports = { descriptor, inspect, selection, beneath, sha };
if (require.main === module) {
  try {
    const [operation, ...args] = process.argv.slice(2);
    let result;
    if (operation === "inspect" && args.length === 4) result = inspect(...args);
    else if (operation === "select" && args.length === 2) result = selection(...args);
    else fail("backend-artifact-input");
    process.stdout.write(JSON.stringify(result) + "\n");
  } catch (error) {
    process.stderr.write(
      /^backend-artifact-[a-z-]+$/.test(error.message)
        ? error.message + "\n"
        : "backend-artifact-unavailable\n",
    );
    process.exitCode = 1;
  }
}
