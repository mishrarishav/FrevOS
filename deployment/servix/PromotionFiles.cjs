"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { createRequire } = require("node:module");
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const fail = (code) => {
  throw Error(`promotion-${code}`);
};
function plain(file) {
  for (let at = path.resolve(file); ; at = path.dirname(at)) {
    try {
      if (fs.lstatSync(at).isSymbolicLink()) fail("linked-path");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (path.dirname(at) === at) return;
  }
}
function beneath(root, relative) {
  if (
    typeof relative !== "string" ||
    !relative ||
    relative.includes("\\") ||
    relative
      .split("/")
      .some(
        (s) =>
          !s ||
          [".", ".."].includes(s) ||
          s.includes(":") ||
          [...s].some((c) => c.charCodeAt(0) < 32),
      )
  )
    fail("relative-path");
  const file = path.resolve(root, relative);
  if (!(file + path.sep).toLowerCase().startsWith((path.resolve(root) + path.sep).toLowerCase()))
    fail("path-scope");
  plain(file);
  return file;
}
function hash(file) {
  plain(file);
  const fd = fs.openSync(file, "r"),
    value = crypto.createHash("sha256"),
    buffer = Buffer.alloc(1024 * 1024);
  try {
    if (!fs.fstatSync(fd).isFile()) fail("file-kind");
    for (;;) {
      const size = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (!size) break;
      value.update(buffer.subarray(0, size));
    }
    return value.digest("hex");
  } finally {
    fs.closeSync(fd);
  }
}
function resolveNode(context, observed) {
  const expected = path.resolve(context.target.node);
  plain(expected);
  if (typeof observed !== "string" || !path.isAbsolute(observed)) fail("runtime-executable");
  const actual = fs.realpathSync.native(observed),
    compare = (value) => (process.platform === "win32" ? value.toLowerCase() : value);
  if (compare(actual) !== compare(expected)) fail("runtime-executable");
  return { executable: expected, sha256: hash(expected) };
}
function writeNew(file, bytes) {
  plain(file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const fd = fs.openSync(file, "wx", 0o600);
  try {
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
function inventory(roots, excluded = []) {
  const result = [],
    seen = new Set();
  let bytes = 0;
  const skip = new Set(excluded.map((s) => path.resolve(s).toLowerCase()));
  for (const root of roots) {
    plain(root);
    if (!fs.existsSync(root)) continue;
    const todo = [path.resolve(root)];
    while (todo.length) {
      const item = todo.pop(),
        key = item.toLowerCase();
      if (seen.has(key) || skip.has(key)) continue;
      seen.add(key);
      plain(item);
      const stat = fs.lstatSync(item);
      if (stat.isDirectory())
        for (const name of fs.readdirSync(item)) todo.push(path.join(item, name));
      else if (stat.isFile()) {
        bytes += stat.size;
        if (result.length >= 200000 || bytes > 1024 ** 4) fail("inventory-budget");
        result.push({ path: item, bytes: stat.size, sha256: hash(item) });
      } else fail("file-kind");
    }
  }
  result.sort((a, b) => a.path.localeCompare(b.path));
  return { files: result, bytes, sha256: sha(Buffer.from(JSON.stringify(result))) };
}
function verify(snapshot) {
  if (
    !Array.isArray(snapshot.files) ||
    snapshot.files.length > 200000 ||
    sha(Buffer.from(JSON.stringify(snapshot.files))) !== snapshot.sha256
  )
    fail("inventory-integrity");
  let checked = 0;
  for (const item of snapshot.files) {
    if (
      !fs.existsSync(item.path) ||
      fs.statSync(item.path).size !== item.bytes ||
      hash(item.path) !== item.sha256
    )
      fail("protected-file-changed");
    checked++;
  }
  return checked;
}
function profile(target) {
  const file = beneath(target.root, "backend/.env"),
    bytes = fs.readFileSync(file);
  const requireAtTarget = createRequire(beneath(target.root, "backend/package.json"));
  const values = requireAtTarget("dotenv").parse(bytes);
  if (
    values.PORT !== String(target.port) ||
    values.NODE_ENV !== "production" ||
    !values.DB_HOST ||
    !values.DB_NAME ||
    !values.DB_USER
  )
    fail("environment-binding");
  return {
    environmentSha256: sha(bytes),
    databaseTargetSha256: sha(
      Buffer.from(
        JSON.stringify({
          host: values.DB_HOST,
          port: values.DB_PORT || "3306",
          name: values.DB_NAME,
          user: values.DB_USER,
        }),
      ),
    ),
  };
}
function inspect(context) {
  const target = context.target;
  plain(target.root);
  plain(context.staging);
  const artifact = require(path.join(context.staging, "BackendArtifact.cjs"));
  const verified = artifact.inspect(
    path.join(context.staging, "payload"),
    target.root,
    context.descriptor,
    context.descriptorSha256,
  );
  const definition = JSON.parse(
    fs.readFileSync(beneath(path.join(context.staging, "payload"), context.descriptor), "utf8"),
  );
  const roots = [
    ...target.preservedPaths.map((p) => beneath(target.root, p)),
    ...target.additionalProtectedRoots,
    ...target.protectedConfigurationFiles,
  ];
  const frontend =
    context.target.releaseMode === "application"
      ? require("./FrontendArtifact.cjs").inspect(context)
      : null;
  const frontendRoot = target.frontend?.root ?? "frontend";
  if (
    frontend &&
    verified.runtimeProjects.some(
      (p) =>
        p === frontendRoot || p.startsWith(frontendRoot + "/") || frontendRoot.startsWith(p + "/"),
    )
  )
    fail("component-overlap");
  for (const project of [...verified.runtimeProjects, frontendRoot]) {
    const directory = beneath(target.root, project);
    if (!fs.existsSync(directory)) continue;
    for (const filename of fs.readdirSync(directory))
      if (/^\.env(?:\.|$)/.test(filename))
        roots.push(beneath(target.root, `${project}/${filename}`));
    for (const folder of ["src", "uploads", "attachment", "attachments", "database", "assets-data"])
      roots.push(beneath(target.root, `${project}/${folder}`));
  }
  roots.push(beneath(target.root, frontendRoot));
  const state = inventory(
    roots,
    frontend ? frontend.files.map((f) => beneath(target.root, `${frontend.root}/${f.path}`)) : [],
  );
  const source = [];
  for (const project of verified.runtimeProjects) {
    const records = inventory([beneath(target.root, `${project}/src`)]);
    for (const item of records.files)
      if (/\.(?:[cm]?js|json)$/.test(item.path))
        source.push({
          path: path.relative(target.root, item.path).split(path.sep).join("/"),
          sha256: item.sha256,
        });
  }
  if (!source.length || source.length > 2048 || !Array.isArray(definition.modules))
    fail("source-recovery-budget");
  const snapshot = {
    version: 1,
    inventory: state,
    source,
    profile: profile(target),
    nodeSha256: hash(target.node),
    artifact: verified,
    ...(frontend ? { frontend } : {}),
  };
  const bytes = Buffer.from(JSON.stringify(snapshot));
  writeNew(path.join(context.staging, "snapshot.json"), bytes);
  return {
    snapshotSha256: sha(bytes),
    protection: { files: state.files.length, bytes: state.bytes, sha256: state.sha256 },
    profile: snapshot.profile,
    nodeSha256: snapshot.nodeSha256,
    artifact: verified,
    ...(frontend
      ? {
          frontend: {
            sha256: frontend.binding.sha256,
            files: frontend.files.length,
            bytes: frontend.files.reduce((n, f) => n + f.bytes, 0),
            indexSha256: frontend.files.find((f) => f.path === frontend.entry).sha256,
          },
        }
      : {}),
  };
}
function readSnapshot(context) {
  const bytes = fs.readFileSync(path.join(context.staging, "snapshot.json"));
  if (sha(bytes) !== context.snapshotSha256) fail("snapshot-integrity");
  return JSON.parse(bytes);
}
function check(context) {
  const snapshot = readSnapshot(context);
  if (
    JSON.stringify(profile(context.target)) !== JSON.stringify(snapshot.profile) ||
    hash(context.target.node) !== snapshot.nodeSha256
  )
    fail("runtime-drift");
  return { verified: verify(snapshot.inventory) };
}
function stage(context) {
  check(context);
  const snapshot = readSnapshot(context),
    target = context.target;
  const runtime = beneath(target.root, `.runtime/devsetu-promotions/${context.id}`);
  if (fs.existsSync(runtime)) fail("runtime-collision");
  fs.mkdirSync(runtime, { recursive: true });
  const files = [context.descriptor, snapshot.artifact.entry];
  for (const relative of files) {
    const input = beneath(path.join(context.staging, "payload"), relative),
      output = beneath(target.root, relative),
      expected = hash(input);
    if (fs.existsSync(output)) {
      if (hash(output) !== expected) fail("artifact-collision");
    } else writeNew(output, fs.readFileSync(input));
  }
  const sourceBytes = Buffer.from(JSON.stringify(snapshot.source));
  writeNew(path.join(runtime, "source-before.json"), sourceBytes);
  for (const filename of [
    "BackendArtifact.cjs",
    "ProductionBackendRuntime.cjs",
    "Run-SavedBackend.ps1",
  ])
    writeNew(path.join(runtime, filename), fs.readFileSync(path.join(context.staging, filename)));
  const cfg = {
    version: 1,
    workspaceId: target.workspaceId,
    profileId: target.profileId,
    computer: target.computer,
    root: target.root,
    project: "backend",
    runtimeProjects: snapshot.artifact.runtimeProjects,
    port: target.port,
    ownerSid: context.ownerSid,
    nodeSha256: snapshot.nodeSha256,
    environmentSha256: snapshot.profile.environmentSha256,
    databaseTargetSha256: snapshot.profile.databaseTargetSha256,
    helperSha256: hash(path.join(runtime, "BackendArtifact.cjs")),
    entrySha256: hash(path.join(runtime, "ProductionBackendRuntime.cjs")),
    sourceSnapshotSha256: sha(sourceBytes),
    descriptor: context.descriptor,
    manifestSha256: context.descriptorSha256,
  };
  const config = Buffer.from(JSON.stringify(cfg)),
    configurationSha256 = sha(config);
  writeNew(path.join(runtime, "runtime.json"), config);
  writeNew(
    path.join(runtime, "node-binding.json"),
    Buffer.from(JSON.stringify({ configurationSha256, executable: target.node })),
  );
  const frontendPlanSha256 = snapshot.frontend
    ? require("./FrontendArtifact.cjs").stage(context, runtime, snapshot.frontend)
    : undefined;
  return {
    runtime,
    configurationSha256,
    launcherSha256: hash(path.join(runtime, "Run-SavedBackend.ps1")),
    ...(frontendPlanSha256 ? { frontendPlanSha256 } : {}),
  };
}
module.exports = {
  sha,
  plain,
  beneath,
  hash,
  resolveNode,
  writeNew,
  inventory,
  verify,
  profile,
  inspect,
  check,
  stage,
};
if (require.main === module) {
  try {
    const action = process.argv[2],
      context = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
    if (
      ![
        "inspect",
        "check",
        "stage",
        "resolve-node",
        "frontend-apply",
        "frontend-check",
        "frontend-recover",
      ].includes(action)
    )
      fail("action");
    process.stdout.write(
      JSON.stringify(
        action === "resolve-node"
          ? resolveNode(context, process.argv[4])
          : action.startsWith("frontend-")
            ? require("./FrontendArtifact.cjs")[
                action === "frontend-check" ? "verify" : action.slice(9)
              ](context, process.argv[4])
            : module.exports[action](context),
      ),
    );
  } catch {
    process.stderr.write("Promotion file verification failed\n");
    process.exitCode = 1;
  }
}
