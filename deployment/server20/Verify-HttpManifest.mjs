import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir, readFile } from "node:fs/promises";
import { join, parse, relative, resolve, sep } from "node:path";

const [rootArg, digest] = process.argv.slice(2);
const root = resolve(rootArg ?? "missing");
const fail = () => {
  throw Error("Release integrity or profile mismatch");
};
const hash = async (path) => {
  const h = createHash("sha256");
  for await (const chunk of createReadStream(path)) h.update(chunk);
  return h.digest("hex");
};
try {
  if (!/^[a-f0-9]{64}$/.test(digest ?? "")) fail();
  for (let p = root; ; p = resolve(p, "..")) {
    if ((await lstat(p)).isSymbolicLink()) fail();
    if (p === parse(p).root) break;
  }
  const bytes = await readFile(join(root, "release-manifest.json"));
  if (bytes.length > 4000000 || createHash("sha256").update(bytes).digest("hex") !== digest) fail();
  const m = JSON.parse(bytes);
  const old = "de56c5684970bbe7a053318f532b81d1df562a55d5258e033e636cd11c06eef9";
  if (
    !/^[a-f0-9]{40}$/.test(m.applicationSource) ||
    m.targetHost !== "DCAPP7" ||
    m.targetAddress !== "10.9.69.20" ||
    m.basePath !== "" ||
    m.authMode !== "local" ||
    m.nodeVersion !== "24.19.0" ||
    m.postgresqlVersion !== "18.4"
  )
    fail();
  if (m.schemaVersion === 1) {
    if (digest !== old || m.publicOrigin !== "https://10.9.69.20:8443") fail();
  } else if (m.schemaVersion === 3) {
    if (
      m.publicOrigin !== "http://10.9.69.20" ||
      m.operatorSource !== "owner-selected-internal-http-v1" ||
      m.dependencyArtifactSha256 !== old
    )
      fail();
  } else if (m.schemaVersion === 4) {
    if (
      m.publicOrigin !== "http://10.9.69.20" ||
      m.operatorSource !== "owner-selected-servix-git-v1" ||
      !/^[a-f0-9]{64}$/.test(m.previousManifestSha256) ||
      m.dependencyArtifactSha256 !== old
    )
      fail();
  } else fail();
  if (!Array.isArray(m.files) || m.files.length > 10000) fail();
  const expected = new Map();
  let size = 0;
  for (const f of m.files) {
    if (
      typeof f.path !== "string" ||
      !/^(apps\/control-plane\/|apps\/control-center\/dist\/|deployment\/(?:server20|servix)\/|prerequisites\/)/.test(
        f.path,
      ) ||
      /(^|\/)(\.|\.\.)(\/|$)|[:\\]/.test(f.path) ||
      [...f.path].some((character) => character.charCodeAt(0) < 32) ||
      f.path.endsWith("/") ||
      !/^[a-f0-9]{64}$/.test(f.sha256) ||
      !Number.isSafeInteger(f.bytes) ||
      f.bytes < 0 ||
      f.bytes > 100000000
    )
      fail();
    const key = f.path.toLowerCase();
    if (expected.has(key)) fail();
    expected.set(key, f);
    size += f.bytes;
    if (size > 160000000) fail();
  }
  for (const required of [
    "apps/control-plane/dist/main.js",
    "apps/control-plane/dist/config.js",
    "apps/control-plane/dist/server.js",
    "apps/control-center/dist/index.html",
    "deployment/server20/Postgres.ps1",
    "deployment/server20/Start-Server20.ps1",
    "prerequisites/node-v24.19.0-win-x64.zip",
  ])
    if (!expected.has(required.toLowerCase())) fail();
  if (m.schemaVersion === 3 || m.schemaVersion === 4)
    for (const required of [
      "deployment/server20/HttpCommon.ps1",
      "deployment/server20/Apply-InternalHttp.ps1",
      "deployment/server20/Verify-HttpManifest.mjs",
      "deployment/server20/source-inventory.json",
    ])
      if (!expected.has(required.toLowerCase())) fail();
  const queue = [root],
    actual = new Map();
  while (queue.length) {
    const dir = queue.pop();
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isSymbolicLink()) fail();
      if (entry.isDirectory()) queue.push(path);
      else if (entry.isFile()) {
        const name = relative(root, path).split(sep).join("/");
        if (actual.has(name.toLowerCase())) fail();
        actual.set(name.toLowerCase(), { name, path });
        if (actual.size > 10001) fail();
      } else fail();
    }
  }
  if (actual.size !== expected.size + 1 || !actual.has("release-manifest.json")) fail();
  const entries = [...expected.entries()];
  let index = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (index < entries.length) {
        const [key, f] = entries[index++];
        const entry = actual.get(key);
        if (!entry) fail();
        const info = await lstat(entry.path);
        if (
          info.isSymbolicLink() ||
          !info.isFile() ||
          info.size !== f.bytes ||
          (await hash(entry.path)) !== f.sha256
        )
          fail();
      }
    }),
  );
  process.stdout.write(JSON.stringify(m));
} catch {
  process.stderr.write("Release verification failed");
  process.exitCode = 1;
}
