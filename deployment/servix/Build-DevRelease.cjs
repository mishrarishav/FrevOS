const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { builtinModules } = require("node:module");
const { parsePreservedPaths, isPreserved } = require("./Preservation.cjs");
const buildProfile = JSON.parse(
  fs.readFileSync(path.join(__dirname, "ReleaseBuildProfile.json"), "utf8"),
);
if (buildProfile.version !== 1 || buildProfile.frontend.routing !== "same-origin")
  throw Error("Build profile is unavailable");
const root = path.resolve(process.argv[2]);
const runtime = path.resolve(process.argv[3]);
const id = crypto.randomUUID().replaceAll("-", "");
const release = path.join(runtime, "release");
const payload = path.join(release, "payload");
const preservedPaths = parsePreservedPaths(
  JSON.parse(fs.readFileSync(path.join(runtime, "preserve.json"), "utf8")),
);
const validation = JSON.parse(fs.readFileSync(path.join(runtime, "validation.json"), "utf8"));
if (
  validation.version !== 1 ||
  validation.status !== "passed" ||
  !/^[a-f0-9]{40}$/.test(validation.sourceHead) ||
  !Array.isArray(validation.suites) ||
  validation.suites.some((s) => s.exitCode !== 0) ||
  !["frontend", "backend"].every((c) => validation.suites.some((s) => s.component === c))
)
  throw Error("Both components require passing validation");
fs.mkdirSync(payload, { recursive: true });
const digest = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const copyTree = (from, to) => {
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error("Source links are not deployment files");
    const source = path.join(from, entry.name),
      target = path.join(to, entry.name);
    if (isPreserved(path.relative(payload, target), preservedPaths)) continue;
    if (entry.isDirectory()) {
      fs.mkdirSync(target, { recursive: true });
      copyTree(source, target);
    } else if (entry.isFile()) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
    }
  }
};
// Both component artifacts are independent of destination-specific routing.
// Existing source-only artifacts stay restorable by the compatibility adapter.
let backendArtifact, backendDescriptor;
const backendOutput = path.join(root, "dist/servix-server");
const backendDescriptorFile = path.join(backendOutput, "backend-artifact.json");
if (fs.existsSync(backendDescriptorFile)) {
  const artifact = require("./BackendArtifact.cjs");
  const bytes = fs.readFileSync(backendDescriptorFile),
    identity = crypto.createHash("sha256").update(bytes).digest("hex");
  backendDescriptor = artifact.descriptor(bytes, identity);
  const entry = artifact.beneath(backendOutput, backendDescriptor.entry);
  if (
    digest(entry) !== backendDescriptor.sha256 ||
    fs.statSync(entry).size !== backendDescriptor.bytes
  )
    throw Error("Built backend differs from its descriptor");
  const descriptor =
    backendDescriptor.runtimeProjects[0] + "/.releases/" + identity + "/artifact.json";
  for (const [relative, content] of [
    [backendDescriptor.entry, fs.readFileSync(entry)],
    [descriptor, bytes],
  ]) {
    if (isPreserved(relative, preservedPaths))
      throw Error("Artifact collides with a protected path");
    const target = artifact.beneath(payload, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, { flag: "wx" });
  }
  backendArtifact = { version: 1, mode: "bundle", descriptor, manifestSha256: identity };
} else {
  copyTree(path.join(root, "backend/src"), path.join(payload, "backend/src"));
  copyTree(path.join(root, "querysafe/src"), path.join(payload, "querysafe/src"));
}
const buildPath = path.join(runtime, "frontend-output");
const log = fs.openSync(path.join(release, "frontend-build.log"), "w");
try {
  const build = spawnSync(
    process.env.ComSpec || "cmd.exe",
    ["/d", "/s", "/c", "npm.cmd run build:prod"],
    {
      cwd: path.join(root, "frontend"),
      env: {
        ...process.env,
        BUILD_PATH: buildPath,
        PUBLIC_URL: buildProfile.frontend.publicPath,
        REACT_APP_API_URL: "",
        REACT_APP_PORTAL_URL: "",
        CI: "false",
      },
      stdio: ["ignore", log, log],
      windowsHide: true,
      timeout: 600000,
    },
  );
  if (build.error || build.status !== 0)
    throw new Error("Frontend build failed; inspect the private build log");
} finally {
  fs.closeSync(log);
}
if (!fs.existsSync(path.join(buildPath, "index.html"))) throw new Error("Missing built frontend");
fs.mkdirSync(path.join(payload, "frontend"), { recursive: true });
copyTree(buildPath, path.join(payload, "frontend"));
const frontendArtifact = require("./FrontendArtifact.cjs").create(payload, buildProfile.frontend);
const files = [];
const modules = { backend: new Set(), querysafe: new Set() };
function inventory(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) inventory(file);
    else {
      const relative = path.relative(payload, file).replaceAll("\\", "/");
      files.push({ path: relative, sha256: digest(file), bytes: fs.statSync(file).size });
      const project = relative.split("/")[0];
      if (modules[project] && /\.[cm]?js$/.test(file)) {
        for (const match of fs
          .readFileSync(file, "utf8")
          .matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
          if (!match[1].startsWith(".") && !path.isAbsolute(match[1]))
            modules[project].add(match[1]);
        }
      }
    }
  }
}
inventory(payload);
if (backendDescriptor) {
  for (const dependency of backendDescriptor.dependencies)
    modules[dependency.project].add(dependency.name);
}
files.sort((a, b) => a.path.localeCompare(b.path));
const dependencies = {};
for (const project of ["backend", "querysafe"]) {
  const declared = JSON.parse(
    fs.readFileSync(path.join(root, project, "package.json"), "utf8"),
  ).dependencies;
  dependencies[project] = {};
  for (const specifier of modules[project]) {
    if (specifier.startsWith("node:") || builtinModules.includes(specifier)) continue;
    const parts = specifier.split("/");
    const name = specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
    if (!declared[name]) throw new Error("Runtime import has no declared dependency: " + name);
    dependencies[project][name] = declared[name];
  }
}
const manifest = {
  schemaVersion: 1,
  id,
  target: buildProfile.development.host,
  computer: buildProfile.development.computer,
  root: buildProfile.development.root,
  database: buildProfile.development.database,
  frontendArtifact,
  validation,
  mode: backendArtifact ? "bundled-existing-dependencies" : "source-only-existing-dependencies",
  ...(backendArtifact ? { backendArtifact } : {}),
  preservedPaths,
  modules: Object.fromEntries(
    Object.entries(modules).map(([key, values]) => [key, [...values].sort()]),
  ),
  dependencies,
  files,
};
fs.writeFileSync(path.join(release, "manifest.json"), JSON.stringify(manifest, null, 2));
const receipt = {
  id,
  release,
  files: files.length,
  manifestSha256: digest(path.join(release, "manifest.json")),
};
fs.writeFileSync(path.join(runtime, "release.json"), JSON.stringify(receipt, null, 2));
console.log(JSON.stringify(receipt));
