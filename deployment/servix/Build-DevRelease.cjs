const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { builtinModules } = require("node:module");
const { parsePreservedPaths, isPreserved } = require("./Preservation.cjs");
const root = path.resolve(process.argv[2]);
const runtime = path.resolve(process.argv[3]);
const id = crypto.randomUUID().replaceAll("-", "");
const release = path.join(runtime, "release");
const payload = path.join(release, "payload");
const preservedPaths = parsePreservedPaths(
  JSON.parse(fs.readFileSync(path.join(runtime, "preserve.json"), "utf8")),
);
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
// Explicit code ownership: never package a backend root, env, DB or uploads folder.
copyTree(path.join(root, "backend/src"), path.join(payload, "backend/src"));
copyTree(path.join(root, "querysafe/src"), path.join(payload, "querysafe/src"));
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
        PUBLIC_URL: "/",
        REACT_APP_API_URL: "http://10.9.69.21:82/api",
        REACT_APP_PORTAL_URL: "http://10.9.69.21:82",
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
fs.copyFileSync(path.join(__dirname, "web.config"), path.join(buildPath, "web.config"));
if (!fs.existsSync(path.join(buildPath, "index.html"))) throw new Error("Missing built frontend");
fs.mkdirSync(path.join(payload, "frontend"), { recursive: true });
copyTree(buildPath, path.join(payload, "frontend"));
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
  target: "10.9.69.21",
  computer: "DCAPP9",
  root: "D:\\servixDev",
  database: "servix_db_dev",
  mode: "source-only-existing-dependencies",
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
