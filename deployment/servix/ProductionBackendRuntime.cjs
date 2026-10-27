"use strict";
// Operator-owned application entry. No credentials are persisted or logged here.
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  { createRequire } = require("node:module");
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const fail = (code) => {
  const error = new Error(code);
  error.safeCode = code;
  throw error;
};
function file(filename, maximum) {
  for (let cursor = path.resolve(filename); ; cursor = path.dirname(cursor)) {
    if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) fail("linked-path");
    if (path.dirname(cursor) === cursor) break;
  }
  const stat = fs.statSync(filename);
  if (!stat.isFile() || stat.size > maximum) fail("file-budget");
  return fs.readFileSync(filename);
}
function start(directory, expected) {
  if (!/^[a-f0-9]{64}$/.test(expected || "")) fail("configuration-identity");
  const bytes = file(path.join(directory, "runtime.json"), 32768);
  if (sha(bytes) !== expected) fail("configuration-integrity");
  const cfg = JSON.parse(bytes),
    keys = [
      "version",
      "workspaceId",
      "profileId",
      "computer",
      "root",
      "project",
      "runtimeProjects",
      "port",
      "ownerSid",
      "nodeSha256",
      "environmentSha256",
      "databaseTargetSha256",
      "helperSha256",
      "entrySha256",
      "sourceSnapshotSha256",
      "descriptor",
      "manifestSha256",
    ];
  if (
    Object.keys(cfg).sort().join(",") !== keys.sort().join(",") ||
    cfg.version !== 1 ||
    !/^ws_[a-zA-Z0-9_-]+$/.test(cfg.workspaceId) ||
    !/^[-a-z0-9]+$/.test(cfg.profileId) ||
    cfg.computer !== process.env.COMPUTERNAME ||
    !path.isAbsolute(cfg.root) ||
    path.parse(cfg.root).root === path.resolve(cfg.root) ||
    !Number.isInteger(cfg.port) ||
    cfg.port < 1 ||
    cfg.port > 65535 ||
    !/^S-1-5-(?:\d+-)*\d+$/.test(cfg.ownerSid) ||
    !Array.isArray(cfg.runtimeProjects) ||
    !cfg.runtimeProjects.includes(cfg.project) ||
    cfg.runtimeProjects.some((name) => !/^[a-z][a-z0-9-]{1,47}$/.test(name))
  )
    fail("configuration-shape");
  for (const key of [
    "nodeSha256",
    "environmentSha256",
    "databaseTargetSha256",
    "helperSha256",
    "entrySha256",
    "sourceSnapshotSha256",
    "manifestSha256",
  ])
    if (!/^[a-f0-9]{64}$/.test(cfg[key])) fail("configuration-shape");
  const nodeBytes = fs.readFileSync(process.execPath);
  if (nodeBytes.length > 160 * 1024 * 1024 || sha(nodeBytes) !== cfg.nodeSha256)
    fail("node-toolchain-changed");
  const root = path.resolve(cfg.root),
    compare = (value) => (process.platform === "win32" ? value.toLowerCase() : value);
  if (
    !compare(path.resolve(directory)).startsWith(compare(`${root + path.sep}.runtime${path.sep}`))
  )
    fail("runtime-scope");
  if (
    sha(file(path.join(directory, "ProductionBackendRuntime.cjs"), 1024 * 1024)) !==
      cfg.entrySha256 ||
    sha(file(path.join(directory, "BackendArtifact.cjs"), 1024 * 1024)) !== cfg.helperSha256
  )
    fail("runtime-integrity");
  const artifact = require(path.join(directory, "BackendArtifact.cjs"));
  // Verify the approved immutable bundle/dependencies even during source recovery.
  const verified = artifact.inspect(root, root, cfg.descriptor, cfg.manifestSha256);
  if (
    verified.runtimeProjects[0] !== cfg.project ||
    JSON.stringify(verified.runtimeProjects) !== JSON.stringify(cfg.runtimeProjects)
  )
    fail("project-binding-changed");
  const selected = artifact.selection(root, cfg.project);
  if (selected.mode === "bundle" && selected.manifestSha256 !== cfg.manifestSha256)
    fail("unapproved-artifact");
  const profile = artifact.beneath(root, `${cfg.project}/.env`),
    environment = file(profile, 1024 * 1024);
  if (sha(environment) !== cfg.environmentSha256) fail("environment-revision-changed");
  const resolve = createRequire(artifact.beneath(root, `${cfg.project}/package.json`));
  const values = resolve("dotenv").parse(environment);
  if (
    values.PORT !== String(cfg.port) ||
    values.NODE_ENV !== "production" ||
    !values.DB_HOST ||
    !values.DB_NAME ||
    !values.DB_USER
  )
    fail("production-profile-incomplete");
  const fingerprint = sha(
    Buffer.from(
      JSON.stringify({
        host: values.DB_HOST,
        port: values.DB_PORT || "3306",
        name: values.DB_NAME,
        user: values.DB_USER,
      }),
    ),
  );
  if (fingerprint !== cfg.databaseTargetSha256) fail("database-target-changed");
  if (selected.mode === "source") {
    const snapshotBytes = file(path.join(directory, "source-before.json"), 2 * 1024 * 1024);
    if (sha(snapshotBytes) !== cfg.sourceSnapshotSha256) fail("source-snapshot-integrity");
    const snapshot = JSON.parse(snapshotBytes);
    if (!Array.isArray(snapshot) || !snapshot.length || snapshot.length > 2048)
      fail("source-snapshot-shape");
    for (const entry of snapshot) {
      if (
        !cfg.runtimeProjects.some((name) => entry.path.startsWith(`${name}/src/`)) ||
        !/\.(?:[cm]?js|json)$/.test(entry.path) ||
        !/^[a-f0-9]{64}$/.test(entry.sha256) ||
        sha(file(artifact.beneath(root, entry.path), 32 * 1024 * 1024)) !== entry.sha256
      )
        fail("source-recovery-drift");
    }
  }
  for (const [key, value] of Object.entries(values)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) fail("environment-key");
    process.env[key] = value;
  }
  process.env.ENV_FILE = profile;
  delete process.env.NODE_OPTIONS;
  process.chdir(artifact.beneath(root, cfg.project));
  const executable =
    selected.mode === "bundle"
      ? selected.executable
      : artifact.beneath(root, `${cfg.project}/src/index.js`);
  require(executable);
  return { mode: selected.mode, manifestSha256: cfg.manifestSha256 };
}
module.exports = { start };
if (require.main === module) {
  try {
    start(__dirname, process.argv[2]);
  } catch (error) {
    // Only finite controller codes; app stdout/stderr are discarded by the task.
    const code = /^[a-z-]+$/.test(error.safeCode || "") ? error.safeCode : "startup-unavailable";
    process.stderr.write(`DevSetu runtime ${code}\n`);
    process.exitCode = 1;
  }
}
