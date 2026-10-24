// Real compatibility-adapter packaging; the fixture frontend has a tiny real npm build.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "backend-packaging-"));
const source = path.join(fixture, "source");
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
function put(root, file, bytes) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
}
function run(name, preserved = [], success = true) {
  const runtime = path.join(fixture, name);
  put(runtime, "preserve.json", JSON.stringify(preserved));
  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, "Build-DevRelease.cjs"), source, runtime],
    { encoding: "utf8", windowsHide: true, timeout: 30000 },
  );
  assert.equal(result.status === 0, success, "packaging exit status");
  if (success) return JSON.parse(fs.readFileSync(path.join(runtime, "release/manifest.json")));
}
try {
  for (const project of ["backend", "querysafe"]) {
    put(source, project + "/package.json", JSON.stringify({ name: project, dependencies: {} }));
    put(source, project + "/src/index.js", "module.exports='source-only sentinel';");
  }
  put(source, "backend/.env", "SYNTHETIC_ENV=must-not-package");
  put(source, "backend/uploads/attachment.txt", "must-not-package-user-content");
  put(
    source,
    "frontend/package.json",
    JSON.stringify({ name: "packaging-fixture", scripts: { "build:prod": "node build.cjs" } }),
  );
  put(
    source,
    "frontend/build.cjs",
    "const fs=require('node:fs'),path=require('node:path');fs.mkdirSync(process.env.BUILD_PATH,{recursive:true});fs.writeFileSync(path.join(process.env.BUILD_PATH,'index.html'),'<html>fixture</html>');",
  );
  const bundle = Buffer.from("module.exports='compiled application fixture';\n"),
    digest = hash(bundle);
  const descriptor = Buffer.from(
    JSON.stringify({
      version: 1,
      kind: "node-backend-bundle",
      entry: "backend/.releases/" + digest + "/server.cjs",
      sha256: digest,
      bytes: bundle.length,
      nodeTarget: "node18",
      dependencies: [],
      modules: ["backend/src/index.js"],
      runtimeProjects: ["backend", "querysafe"],
      containsEnvironment: false,
      containsUserFiles: false,
    }),
  );
  const identity = hash(descriptor),
    descriptorFile = "dist/servix-server/backend-artifact.json";
  put(source, descriptorFile, descriptor);
  put(source, "dist/servix-server/backend/.releases/" + digest + "/server.cjs", bundle);
  const manifest = run("bundled");
  assert.equal(manifest.mode, "bundled-existing-dependencies");
  assert.deepEqual(manifest.backendArtifact, {
    version: 1,
    mode: "bundle",
    descriptor: "backend/.releases/" + identity + "/artifact.json",
    manifestSha256: identity,
  });
  assert.equal(manifest.files.filter((file) => file.path.startsWith("backend/")).length, 2);
  assert(!manifest.files.some((file) => /(?:\/src\/|\/uploads\/|\.env)/.test(file.path)));
  assert.equal(manifest.files.find((file) => file.path.endsWith("/server.cjs")).sha256, digest);
  assert.equal(
    manifest.files.find((file) => file.path.endsWith("/artifact.json")).sha256,
    identity,
  );
  run("protected", ["backend/.releases"], false);
  put(source, "dist/servix-server/backend/.releases/" + digest + "/server.cjs", "changed bytes");
  run("tampered", [], false);
  // Retain the build under another name to exercise the old saved-source compatibility path.
  const from = path.resolve(source, descriptorFile),
    to = path.resolve(source, "dist/retained-descriptor.json");
  assert(from.startsWith(source + path.sep) && to.startsWith(source + path.sep));
  fs.renameSync(from, to);
  const legacy = run("legacy");
  assert.equal(legacy.mode, "source-only-existing-dependencies");
  assert(legacy.files.some((file) => file.path === "backend/src/index.js"));
  console.log(
    "PASS: immutable backend-only payload, exact descriptor and bundle digests, protected-path/tamper denial and legacy packaging",
  );
} finally {
  const absolute = path.resolve(fixture);
  assert.equal(path.dirname(absolute), path.resolve(os.tmpdir()));
  assert(/^backend-packaging-[A-Za-z0-9]+$/.test(path.basename(absolute)));
  fs.rmSync(absolute, { recursive: true, force: true });
}
