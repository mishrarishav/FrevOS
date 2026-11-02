"use strict";
// Static application files only. Destination routing, environments and user data
// never belong to this artifact. All live replacements use reviewed preimages.
const fs = require("node:fs"),
  path = require("node:path");
const u = () => require("./PromotionFiles.cjs");
const digest = /^[a-f0-9]{64}$/;
const fail = () => {
  throw Error("frontend-artifact-verification-failed");
};
function relative(value) {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 240 ||
    value.includes("\\") ||
    value
      .split("/")
      .some(
        (p) =>
          !p ||
          p === "." ||
          p === ".." ||
          p.includes(":") ||
          [...p].some((c) => c.charCodeAt(0) < 32) ||
          /^\.env(?:\.|$)/i.test(p) ||
          /^(?:uploads|attachments?|database|node_modules|\.runtime|logs|backups)$/i.test(p),
      )
  )
    fail();
  return value;
}
function excluded(file, preserved) {
  return preserved.some(
    (p) =>
      file.toLowerCase() === p.toLowerCase() ||
      file.toLowerCase().startsWith(p.toLowerCase() + "/"),
  );
}
function definition(bytes, expected) {
  if (!digest.test(expected) || u().sha(bytes) !== expected || bytes.length > 4 * 1024 * 1024)
    fail();
  const d = JSON.parse(bytes);
  if (
    d.version !== 1 ||
    d.kind !== "static-application" ||
    d.routing !== "same-origin" ||
    Object.keys(d).sort().join() !==
      ["version", "kind", "root", "entry", "routing", "files"].sort().join() ||
    !Array.isArray(d.files) ||
    !d.files.length ||
    d.files.length > 10000
  )
    fail();
  relative(d.root);
  relative(d.entry);
  const seen = new Set();
  let bytesTotal = 0;
  for (const f of d.files) {
    relative(f.path);
    if (
      Object.keys(f).sort().join() !== "bytes,path,sha256" ||
      !digest.test(f.sha256) ||
      !Number.isSafeInteger(f.bytes) ||
      f.bytes < 0 ||
      /(?:^|\/)web\.config$/i.test(f.path) ||
      f.path.split("/").some((p) => p.startsWith(".")) ||
      seen.has(f.path.toLowerCase())
    )
      fail();
    seen.add(f.path.toLowerCase());
    bytesTotal += f.bytes;
  }
  if (bytesTotal > 512 * 1024 * 1024 || !d.files.some((f) => f.path === d.entry)) fail();
  return d;
}
function create(payload, config) {
  if (config.routing !== "same-origin" || !Array.isArray(config.preservedFiles)) fail();
  relative(config.root);
  relative(config.entry);
  const root = u().beneath(payload, config.root),
    files = [];
  const walk = (dir, prefix = "") => {
    u().plain(dir);
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix + item.name;
      if (excluded(rel, config.preservedFiles)) continue;
      relative(rel);
      if (item.isSymbolicLink() || item.name.startsWith(".")) fail();
      if (item.isDirectory()) walk(path.join(dir, item.name), rel + "/");
      else if (item.isFile())
        files.push({
          path: rel,
          bytes: fs.statSync(path.join(dir, item.name)).size,
          sha256: u().hash(path.join(dir, item.name)),
        });
      else fail();
    }
  };
  walk(root);
  files.sort((a, b) => a.path.localeCompare(b.path));
  const bytes = Buffer.from(
    JSON.stringify({
      version: 1,
      kind: "static-application",
      root: config.root,
      entry: config.entry,
      routing: config.routing,
      files,
    }),
  );
  const sha256 = u().sha(bytes),
    descriptor = `${config.root}/.releases/${sha256}/artifact.json`;
  definition(bytes, sha256);
  u().writeNew(u().beneath(payload, descriptor), bytes);
  return { version: 1, descriptor, sha256 };
}
function read(payload, binding, config) {
  if (
    !binding ||
    !digest.test(binding.sha256) ||
    binding.descriptor !== `${config.root}/.releases/${binding.sha256}/artifact.json`
  )
    fail();
  const d = definition(fs.readFileSync(u().beneath(payload, binding.descriptor)), binding.sha256);
  if (d.root !== config.root || d.files.some((f) => excluded(f.path, config.preservedFiles)))
    fail();
  for (const f of d.files) {
    const file = u().beneath(payload, `${d.root}/${f.path}`);
    if (fs.statSync(file).size !== f.bytes || u().hash(file) !== f.sha256) fail();
  }
  return d;
}
function stateFile(context) {
  return u().beneath(context.target.root, ".runtime/devsetu-frontend-artifact.json");
}
function current(context) {
  const file = stateFile(context);
  if (!fs.existsSync(file)) return { exists: false, sha256: null };
  const bytes = fs.readFileSync(file),
    binding = JSON.parse(bytes);
  const d = read(context.target.root, binding, context.target.frontend);
  return { exists: true, sha256: u().sha(bytes), binding, files: d.files.length };
}
function inspect(context) {
  const d = read(
    path.join(context.staging, "payload"),
    context.frontendArtifact,
    context.target.frontend,
  );
  if (
    d.files.some((f) => excluded(`${d.root}/${f.path}`, context.target.preservedPaths || [])) ||
    excluded(context.frontendArtifact.descriptor, context.target.preservedPaths || [])
  )
    fail();
  const before = d.files.map((f) => {
    const file = u().beneath(context.target.root, `${d.root}/${f.path}`);
    if (!fs.existsSync(file)) return { ...f, before: null };
    const stat = fs.statSync(file);
    if (!stat.isFile()) fail();
    return { ...f, before: { sha256: u().hash(file), bytes: stat.size } };
  });
  return {
    binding: context.frontendArtifact,
    root: d.root,
    entry: d.entry,
    files: before,
    current: current(context),
  };
}
function same(file, expected) {
  u().plain(file);
  return expected
    ? fs.existsSync(file) &&
        fs.statSync(file).isFile() &&
        fs.statSync(file).size === expected.bytes &&
        u().hash(file) === expected.sha256
    : !fs.existsSync(file);
}
function before(context, snapshot) {
  read(path.join(context.staging, "payload"), snapshot.binding, context.target.frontend);
  if (JSON.stringify(current(context)) !== JSON.stringify(snapshot.current)) fail();
  for (const f of snapshot.files)
    if (!same(u().beneath(context.target.root, `${snapshot.root}/${f.path}`), f.before)) fail();
}
function stage(context, runtime, snapshot) {
  before(context, snapshot);
  const manifestBytes = fs.readFileSync(
    u().beneath(path.join(context.staging, "payload"), snapshot.binding.descriptor),
  );
  const manifestTarget = u().beneath(context.target.root, snapshot.binding.descriptor);
  if (fs.existsSync(manifestTarget)) {
    if (u().hash(manifestTarget) !== snapshot.binding.sha256) fail();
  } else u().writeNew(manifestTarget, manifestBytes);
  for (const f of snapshot.files) {
    const source = u().beneath(path.join(context.staging, "payload"), `${snapshot.root}/${f.path}`);
    const next = u().beneath(runtime, `frontend-next/${f.path}`);
    u().writeNew(next, fs.readFileSync(source));
    if (f.before) {
      const original = u().beneath(context.target.root, `${snapshot.root}/${f.path}`);
      const backup = u().beneath(runtime, `frontend-before/${f.path}`);
      u().writeNew(backup, fs.readFileSync(original));
      if (!same(backup, f.before) || !same(original, f.before)) fail();
    }
  }
  const oldState = stateFile(context);
  if (snapshot.current.exists)
    u().writeNew(path.join(runtime, "frontend-state-before.json"), fs.readFileSync(oldState));
  const plan = Buffer.from(JSON.stringify(snapshot));
  u().writeNew(path.join(runtime, "frontend-plan.json"), plan);
  return u().sha(plan);
}
function plan(context, expected) {
  if (!digest.test(expected)) fail();
  const runtime = u().beneath(context.target.root, `.runtime/devsetu-promotions/${context.id}`);
  const bytes = fs.readFileSync(path.join(runtime, "frontend-plan.json"));
  if (u().sha(bytes) !== expected) fail();
  const value = JSON.parse(bytes);
  if (
    JSON.stringify(value.binding) !== JSON.stringify(context.frontendArtifact) ||
    value.root !== context.target.frontend.root
  )
    fail();
  return { runtime, value };
}
function replace(file, bytes, expected, journal) {
  if (!same(file, expected)) fail();
  const temp = file + ".devsetu-" + require("node:crypto").randomUUID() + ".tmp";
  u().writeNew(temp, bytes);
  if (!same(file, expected)) fail();
  u().writeNew(journal, Buffer.from(JSON.stringify({ expected, sha256: u().sha(bytes) })));
  fs.renameSync(temp, file);
  if (u().hash(file) !== u().sha(bytes)) fail();
}
function ordered(files, entry) {
  return [...files].sort(
    (a, b) => Number(a.path === entry) - Number(b.path === entry) || a.path.localeCompare(b.path),
  );
}
function apply(context, expected) {
  const { runtime, value: v } = plan(context, expected);
  before(context, v);
  for (const [i, f] of ordered(v.files, v.entry).entries()) {
    const file = u().beneath(context.target.root, `${v.root}/${f.path}`),
      next = u().beneath(runtime, `frontend-next/${f.path}`);
    if (!same(next, f)) fail();
    if (f.before?.sha256 === f.sha256 && f.before.bytes === f.bytes) continue;
    replace(file, fs.readFileSync(next), f.before, path.join(runtime, `frontend-apply-${i}.json`));
  }
  const state = stateFile(context),
    bytes = Buffer.from(JSON.stringify(v.binding));
  const prior = v.current.exists
    ? {
        sha256: v.current.sha256,
        bytes: fs.statSync(path.join(runtime, "frontend-state-before.json")).size,
      }
    : null;
  replace(state, bytes, prior, path.join(runtime, "frontend-state-apply.json"));
  return verify(context, expected);
}
function verify(context, expected) {
  const { value: v } = plan(context, expected),
    state = current(context);
  if (!state.exists || state.binding.sha256 !== v.binding.sha256) fail();
  const d = read(context.target.root, v.binding, context.target.frontend);
  return {
    sha256: v.binding.sha256,
    indexSha256: d.files.find((f) => f.path === d.entry).sha256,
    files: d.files.length,
  };
}
function recover(context, expected) {
  const { runtime, value: v } = plan(context, expected);
  for (const [i, f] of ordered(v.files, v.entry).entries()) {
    const target = u().beneath(context.target.root, `${v.root}/${f.path}`);
    if (same(target, f.before)) continue;
    if (!same(target, f)) fail();
    if (!f.before) {
      // Keep new hashed assets, but restore an originally absent entry by moving
      // the exact operator-owned file into the retained recovery directory.
      if (f.path === v.entry) {
        const retained = u().beneath(runtime, `frontend-recovered/${f.path}`);
        u().plain(retained);
        if (fs.existsSync(retained)) fail();
        fs.mkdirSync(path.dirname(retained), { recursive: true });
        fs.renameSync(target, retained);
      }
      continue;
    }
    const backup = u().beneath(runtime, `frontend-before/${f.path}`);
    if (!same(backup, f.before)) fail();
    replace(target, fs.readFileSync(backup), f, path.join(runtime, `frontend-recover-${i}.json`));
  }
  const file = stateFile(context),
    now = fs.existsSync(file) ? fs.readFileSync(file) : null;
  const next = Buffer.from(JSON.stringify(v.binding));
  if (v.current.exists) {
    const old = fs.readFileSync(path.join(runtime, "frontend-state-before.json"));
    if (u().sha(old) !== v.current.sha256) fail();
    if (now && u().sha(now) === u().sha(next))
      replace(
        file,
        old,
        { sha256: u().sha(now), bytes: now.length },
        path.join(runtime, "frontend-state-recover.json"),
      );
    else if (!now || u().sha(now) !== v.current.sha256) fail();
  } else if (now && u().sha(now) === u().sha(next)) {
    // The pointer is operator-owned and was absent before this activation.
    const retained = path.join(runtime, "frontend-state-recovered.json");
    if (fs.existsSync(retained)) fail();
    fs.renameSync(file, retained);
  } else if (now) fail();
  for (const f of v.files.filter((f) => f.before))
    if (!same(u().beneath(context.target.root, `${v.root}/${f.path}`), f.before)) fail();
  return { recovered: true, files: v.files.length };
}
function recoveryState(context, expected) {
  const { value: v } = plan(context, expected);
  for (const f of v.files.filter((f) => f.before))
    if (!same(u().beneath(context.target.root, `${v.root}/${f.path}`), f.before)) fail();
  const state = current(context);
  if (JSON.stringify(state) !== JSON.stringify(v.current)) fail();
  const entry = v.files.find((f) => f.path === v.entry);
  if (!entry.before && fs.existsSync(u().beneath(context.target.root, `${v.root}/${v.entry}`)))
    fail();
  return { binding: state.exists ? state.binding : null, entry: v.entry, before: entry.before };
}
module.exports = {
  create,
  definition,
  read,
  current,
  inspect,
  before,
  stage,
  apply,
  verify,
  recover,
  recoveryState,
};
if (require.main === module) {
  try {
    const manifest = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
    const config = JSON.parse(fs.readFileSync(process.argv[4], "utf8")).frontend;
    const d = read(process.argv[2], manifest.frontendArtifact, config);
    process.stdout.write(
      JSON.stringify({
        sha256: manifest.frontendArtifact.sha256,
        files: d.files.length,
        indexSha256: d.files.find((f) => f.path === d.entry).sha256,
      }),
    );
  } catch {
    process.stderr.write("Frontend artifact verification failed\n");
    process.exitCode = 1;
  }
}
