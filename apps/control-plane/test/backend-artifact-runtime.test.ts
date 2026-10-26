import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { expect, it } from "vitest";

const runtime = createRequire(import.meta.url)("../../../deployment/servix/BackendArtifact.cjs");
const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
async function cleanup(root: string) {
  expect(dirname(resolve(root))).toBe(resolve(tmpdir()));
  expect(basename(root).startsWith("devsetu-bundle-test-")).toBe(true);
  await rm(root, { recursive: true, force: true });
}
async function put(root: string, relative: string, value: string) {
  const file = join(root, relative);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, value);
  return file;
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "devsetu-bundle-test-"));
  const payload = join(root, "payload"),
    application = join(root, "application");
  const bytes = "module.exports = { ready: true };\n",
    bundle = hash(bytes);
  const entry = `backend/.releases/${bundle}/server.cjs`;
  const value = {
    version: 1,
    kind: "node-backend-bundle",
    entry,
    sha256: bundle,
    bytes: Buffer.byteLength(bytes),
    nodeTarget: "node18",
    dependencies: [{ project: "backend", name: "fixture-dependency", range: "^1.0.0" }],
    modules: ["backend/src/index.js"],
    runtimeProjects: ["backend"],
    containsEnvironment: false,
    containsUserFiles: false,
  };
  const descriptorBytes = JSON.stringify(value),
    digest = hash(descriptorBytes);
  const descriptor = `backend/.releases/${digest}/artifact.json`;
  await put(payload, descriptor, descriptorBytes);
  await put(payload, entry, bytes);
  await put(application, "backend/package.json", JSON.stringify({ name: "fixture-backend" }));
  await put(
    application,
    "backend/node_modules/fixture-dependency/package.json",
    JSON.stringify({ name: "fixture-dependency", version: "1.2.0", main: "index.js" }),
  );
  await put(
    application,
    "backend/node_modules/fixture-dependency/index.js",
    "throw Error('verification must not execute packages');",
  );
  const upload = await put(application, "backend/uploads/existing.txt", "owned upload");
  const environment = await put(application, "backend/.env", "PRIVATE_FIXTURE=excluded");
  return {
    root,
    payload,
    application,
    bytes,
    bundle,
    entry,
    value,
    digest,
    descriptor,
    upload,
    environment,
  };
}

it("verifies a staged bundle against installed dependencies without importing application/package code or changing uploads", async () => {
  const f = await fixture();
  try {
    const result = runtime.inspect(f.payload, f.application, f.descriptor, f.digest);
    expect(result.entry).toBe(f.entry);
    expect(result.bundleSha256).toBe(f.bundle);
    expect(result.dependencies[0].version).toBe("1.2.0");
    expect(await readFile(f.upload, "utf8")).toBe("owned upload");
    expect(await readFile(f.environment, "utf8")).toBe("PRIVATE_FIXTURE=excluded");
    expect(runtime.selection(f.application, "backend")).toEqual({ version: 1, mode: "source" });
    await put(f.application, f.descriptor, JSON.stringify(f.value));
    await put(f.application, f.entry, f.bytes);
    await put(
      f.application,
      "backend/.runtime/devsetu-backend-artifact.json",
      JSON.stringify({
        version: 1,
        mode: "bundle",
        descriptor: f.descriptor,
        manifestSha256: f.digest,
      }),
    );
    expect(runtime.selection(f.application, "backend").executable).toBe(
      join(f.application, f.entry),
    );
    await put(
      f.application,
      "backend/.runtime/devsetu-backend-artifact.json",
      JSON.stringify({ version: 1, mode: "source" }),
    );
    expect(runtime.selection(f.application, "backend").mode).toBe("source");
  } finally {
    await cleanup(f.root);
  }
});

it("rejects tampered payloads, wrong installed versions, missing dependencies and unapproved selection paths", async () => {
  const f = await fixture();
  try {
    expect(() => runtime.inspect(f.payload, f.application, f.descriptor, "0".repeat(64))).toThrow(
      "integrity",
    );
    await put(f.payload, f.entry, "changed");
    expect(() => runtime.inspect(f.payload, f.application, f.descriptor, f.digest)).toThrow(
      "bundle-integrity",
    );
    await put(f.payload, f.entry, f.bytes);
    await put(
      f.application,
      "backend/node_modules/fixture-dependency/package.json",
      JSON.stringify({ name: "fixture-dependency", version: "2.0.0", main: "index.js" }),
    );
    expect(() => runtime.inspect(f.payload, f.application, f.descriptor, f.digest)).toThrow(
      "dependency-version",
    );
    const removed = resolve(f.application, "backend/node_modules/fixture-dependency");
    expect(removed.startsWith(resolve(f.root) + sep)).toBe(true);
    await rm(removed, { recursive: true });
    expect(() => runtime.inspect(f.payload, f.application, f.descriptor, f.digest)).toThrow(
      "dependency-missing",
    );
    await put(
      f.application,
      "backend/.runtime/devsetu-backend-artifact.json",
      JSON.stringify({
        version: 1,
        mode: "bundle",
        descriptor: "../elsewhere",
        manifestSha256: f.digest,
      }),
    );
    expect(() => runtime.selection(f.application, "backend")).toThrow("selection");
    for (const relative of ["../outside", "/absolute", "backend/../../outside", "backend\\outside"])
      expect(() => runtime.beneath(f.application, relative)).toThrow("path");
  } finally {
    await cleanup(f.root);
  }
});

it("rejects linked artifacts and malformed/expanded descriptor contracts", async () => {
  const f = await fixture();
  try {
    const external = join(f.root, "external");
    await mkdir(external);
    await symlink(external, join(f.payload, "linked"), "junction");
    expect(() => runtime.beneath(f.payload, "linked/data.json")).toThrow("linked");
    for (const patch of [
      { entry: "backend/uploads/user.js" },
      { modules: ["backend/uploads/data.js"] },
      { runtimeProjects: ["uploads"] },
      { containsEnvironment: true },
      { dependencies: [{ project: "other", name: "fixture", range: "*" }] },
      { extra: "unapproved" },
    ]) {
      const bytes = Buffer.from(JSON.stringify({ ...f.value, ...patch }));
      expect(() => runtime.descriptor(bytes, hash(bytes))).toThrow();
    }
  } finally {
    await cleanup(f.root);
  }
});
