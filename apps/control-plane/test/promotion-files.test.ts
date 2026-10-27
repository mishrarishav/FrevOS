import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";

const require = createRequire(import.meta.url),
  files = require("../../../deployment/servix/PromotionFiles.cjs");
const run = promisify(execFile),
  roots: string[] = [],
  hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");
afterEach(async () => {
  for (const root of roots.splice(0)) {
    expect(dirname(resolve(root))).toBe(resolve(tmpdir()));
    expect(root).toContain("promotion-native-");
    await rm(root, { recursive: true, force: true });
  }
});
async function fixture() {
  const base = await mkdtemp(join(tmpdir(), "promotion-native-"));
  roots.push(base);
  const root = join(base, "application"),
    staging = join(base, "staging");
  const put = async (relative: string, value: string | Buffer, where = root) => {
    const file = join(where, relative);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, value);
    return file;
  };
  const listener = createServer();
  await new Promise<void>((ok) => listener.listen(0, "127.0.0.1", ok));
  const port = (listener.address() as { port: number }).port;
  await new Promise<void>((ok) => listener.close(() => ok()));
  await put(
    "backend/package.json",
    JSON.stringify({ name: "isolated-backend", dependencies: { dotenv: "1.0.0" } }),
  );
  await put(
    "backend/node_modules/dotenv/package.json",
    '{"name":"dotenv","version":"1.0.0","main":"index.js"}',
  );
  await put(
    "backend/node_modules/dotenv/index.js",
    "exports.parse=b=>Object.fromEntries(b.toString().trim().split('\\n').map(s=>{const i=s.indexOf('=');return [s.slice(0,i),s.slice(i+1)]}));",
  );
  await put("querysafe/package.json", '{"name":"isolated-sibling"}');
  const source =
    "const fs=require('node:fs'),path=require('node:path');fs.writeFileSync(path.resolve(__dirname,'../../observed.json'),JSON.stringify({mode:'source',cwd:process.cwd(),marker:process.env.FIXTURE_MARKER}));";
  await put("backend/src/index.js", source);
  await put("querysafe/src/index.js", "module.exports={fixture:true};");
  await put("backend/uploads/original.txt", "retained synthetic attachment");
  await put("backend/uploads/second.txt", "different original");
  await put("frontend/index.html", "<h1>Retained frontend</h1>");
  const environment = `PORT=${port}\nNODE_ENV=production\nDB_HOST=synthetic-db\nDB_NAME=synthetic_db\nDB_USER=synthetic_user\nDB_PASSWORD=synthetic_only\nFIXTURE_MARKER=bound-environment\n`;
  await put("backend/.env", environment);
  const body = Buffer.from(
    "const fs=require('node:fs'),path=require('node:path');fs.writeFileSync(path.resolve(__dirname,'../../../observed.json'),JSON.stringify({mode:'bundle',cwd:process.cwd(),marker:process.env.FIXTURE_MARKER}));",
  );
  const entry = `backend/.releases/${hash(body)}/server.cjs`;
  await put(`payload/${entry}`, body, staging);
  const definition = Buffer.from(
    JSON.stringify({
      version: 1,
      kind: "node-backend-bundle",
      entry,
      sha256: hash(body),
      bytes: body.length,
      nodeTarget: "node18",
      dependencies: [{ project: "backend", name: "dotenv", range: "1.0.0" }],
      modules: ["backend/src/index.js", "querysafe/src/index.js"],
      runtimeProjects: ["backend", "querysafe"],
      containsEnvironment: false,
      containsUserFiles: false,
    }),
  );
  const descriptorSha256 = hash(definition),
    descriptor = `backend/.releases/${descriptorSha256}/artifact.json`;
  await put(`payload/${descriptor}`, definition, staging);
  for (const name of [
    "PromotionFiles.cjs",
    "ProductionBackendRuntime.cjs",
    "Run-SavedBackend.ps1",
    "BackendArtifact.cjs",
  ])
    await copyFile(resolve("../../deployment/servix", name), await put(name, "", staging));
  const context = {
    id: `pm_${"c".repeat(32)}`,
    target: {
      root,
      node: process.execPath,
      port,
      // biome-ignore lint/complexity/useLiteralKeys: TypeScript requires bracket access for environment index signatures.
      computer: process.env["COMPUTERNAME"] ?? "fixture-host",
      workspaceId: "ws_fixture",
      profileId: "fixture-production",
      preservedPaths: ["backend/uploads", "backend/.env"],
      additionalProtectedRoots: [],
      protectedConfigurationFiles: [],
    },
    staging,
    descriptor,
    descriptorSha256,
    ownerSid: "S-1-5-21-123-456-789-1234",
    snapshotSha256: "",
  };
  return {
    base,
    root,
    staging,
    put,
    context,
    environment,
    source,
    entry,
    bundleSha256: hash(body),
  };
}
it("stages identical saved bytes, starts the real managed entry and recovers retained source without changing data", async () => {
  const f = await fixture();
  const before = files.inspect(f.context);
  f.context.snapshotSha256 = before.snapshotSha256;
  const staged = files.stage(f.context),
    pointer = join(f.root, "backend/.runtime/devsetu-backend-artifact.json");
  expect(files.hash(join(f.root, f.entry))).toBe(f.bundleSha256);
  await mkdir(dirname(pointer), { recursive: true });
  await writeFile(
    pointer,
    JSON.stringify({
      version: 1,
      mode: "bundle",
      descriptor: f.context.descriptor,
      manifestSha256: f.context.descriptorSha256,
    }),
  );
  const launch = () =>
    run(
      process.execPath,
      [join(staged.runtime, "ProductionBackendRuntime.cjs"), staged.configurationSha256],
      {
        windowsHide: true,
        cwd: f.base,
        env: { ...process.env, COMPUTERNAME: f.context.target.computer },
        maxBuffer: 4096,
      },
    );
  await launch();
  expect(JSON.parse(await readFile(join(f.root, "observed.json"), "utf8"))).toEqual({
    mode: "bundle",
    cwd: join(f.root, "backend"),
    marker: "bound-environment",
  });
  await writeFile(pointer, '{"version":1,"mode":"source"}');
  await launch();
  expect(JSON.parse(await readFile(join(f.root, "observed.json"), "utf8")).mode).toBe("source");
  expect(files.check(f.context).verified).toBe(before.protection.files);
  expect(await readFile(join(f.root, "backend/uploads/original.txt"), "utf8")).toBe(
    "retained synthetic attachment",
  );
  await expect(readFile(join(f.root, "backend/src/index.js"), "utf8")).resolves.toBe(f.source);
  await expect(readFile(join(f.root, "backend/.env"), "utf8")).resolves.toBe(f.environment);
  await expect(readFile(join(f.root, "frontend/index.html"), "utf8")).resolves.toContain(
    "Retained frontend",
  );
  await rm(join(f.root, "observed.json"));
  await f.put("backend/src/index.js", "changed source");
  await expect(launch()).rejects.toThrow();
  await expect(readFile(join(f.root, "observed.json"))).rejects.toThrow();
});
it("denies modified or missing non-first protected files, environment drift, collisions and path escape", async () => {
  const f = await fixture();
  const observation = files.inspect(f.context);
  f.context.snapshotSha256 = observation.snapshotSha256;
  await f.put("backend/uploads/second.txt", "changed");
  expect(() => files.check(f.context)).toThrow("protected-file-changed");
  await f.put("backend/uploads/second.txt", "different original");
  await rm(join(f.root, "backend/uploads/original.txt"));
  expect(() => files.check(f.context)).toThrow("protected-file-changed");
  await f.put("backend/uploads/original.txt", "retained synthetic attachment");
  await f.put("backend/.env", f.environment.replace("synthetic_db", "other_db"));
  expect(() => files.check(f.context)).toThrow("runtime-drift");
  await f.put("backend/.env", f.environment);
  await f.put(f.entry, "colliding bytes");
  expect(() => files.stage(f.context)).toThrow("artifact-collision");
  expect(() => files.beneath(f.root, "../outside")).toThrow("relative-path");
  expect(() => files.beneath(f.root, "C:/outside")).toThrow("relative-path");
  const outside = join(f.base, "outside");
  await mkdir(outside);
  await symlink(outside, join(f.root, "linked"), process.platform === "win32" ? "junction" : "dir");
  expect(() => files.inventory([join(f.root, "linked")])).toThrow("linked-path");
});
