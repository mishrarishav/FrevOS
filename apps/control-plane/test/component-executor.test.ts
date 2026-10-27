import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import { expect, it } from "vitest";

const executor = createRequire(import.meta.url)("../../../deployment/servix/ComponentExecutor.cjs");
const native = createRequire(import.meta.url)("../../../deployment/servix/NativePlatform.cjs");
const zip = promisify(gzip);
it("pins the enrolled Windows native security modules in the minimal build environment", () => {
  const env = native.buildEnvironment();
  if (process.platform === "win32")
    expect(env.PSModulePath).toBe(
      join(process.env["WINDIR"] || "", "System32/WindowsPowerShell/v1.0/Modules"),
    );
  expect(
    Object.keys(env).every((name) =>
      [
        "SystemRoot",
        "WINDIR",
        "PATH",
        "PATHEXT",
        "TEMP",
        "TMP",
        "USERPROFILE",
        "HOME",
        "LOCALAPPDATA",
        "APPDATA",
        "PSModulePath",
      ].includes(name),
    ),
  ).toBe(true);
});
it("retains safe native failure metadata without raw output, arguments or private values", () => {
  const sentinel = "private-value-must-never-be-recorded";
  const result = native.operationFailure(
    {
      code: 1,
      killed: false,
      stdout: `AssertionError: ${sentinel}\n at test/device-enrollment.test.ts:151:39`,
      stderr: `src/main.ts(12,7): ${sentinel}`,
      message: sentinel,
    },
    "ci",
  );
  expect(result).toMatchObject({
    version: 1,
    phase: "ci",
    exitCode: 1,
    killed: false,
    classifications: ["AssertionError"],
    locations: ["test/device-enrollment.test.ts:151:39", "src/main.ts(12,7)"],
  });
  expect(JSON.stringify(result)).not.toContain(sentinel);
  expect(native.operationFailure({ code: "ENOENT", stderr: "" }, "install")).toMatchObject({
    exitCode: null,
    classifications: ["ENOENT"],
    locations: [],
  });
});
const file = (path: string, text: string) => ({
  path,
  sha256: executor.sha(Buffer.from(text)),
  data: Buffer.from(text).toString("base64"),
});
it("binds native artifact references to exact source, manifest, ZIP digest and bounded size without caller paths", () => {
  const value = {
    version: 1,
    kind: "devsetu-native-artifact",
    sourceHead: "a".repeat(40),
    archiveSha256: "b".repeat(64),
    manifestSha256: "c".repeat(64),
    archiveBytes: 78185461,
  };
  expect(native.descriptor(Buffer.from(JSON.stringify(value)), value.sourceHead)).toEqual(value);
  for (const change of [
    { path: "C:\\outside" },
    { archiveSha256: "../outside" },
    { manifestSha256: "invalid" },
    { archiveBytes: 160000001 },
    { archiveBytes: 0 },
    { sourceHead: "d".repeat(40) },
    { version: 2 },
  ])
    expect(() =>
      native.descriptor(Buffer.from(JSON.stringify({ ...value, ...change })), value.sourceHead),
    ).toThrow("reference-invalid");
  expect(() => native.descriptor(Buffer.alloc(4097), value.sourceHead)).toThrow(
    "reference-invalid",
  );
});

it("rejects traversal, case aliases, file/directory collisions, protected content and control-file replacement before extraction", async () => {
  for (const files of [
    [file("../outside", "bad")],
    [file("index.js", "one"), file("INDEX.js", "two")],
    [file("code", "one"), file("code/file", "two")],
    [file("uploads/data", "bad")],
    [file(".runtime/devsetu-component.lock", "bad")],
    [file(".git/config", "bad")],
    [{ ...file("index.js", "one"), sha256: "0".repeat(64) }],
  ]) {
    await expect(
      executor.unpack(await zip(JSON.stringify({ version: 1, files })), ["uploads"]),
    ).rejects.toThrow();
  }
  expect(
    (
      await executor.unpack(
        await zip(JSON.stringify({ version: 1, files: [file("index.js", "good")] })),
        ["uploads"],
      )
    )[0].bytes.toString(),
  ).toBe("good");
});

it("restores the last healthy code after a real failed health probe, preserves data and refuses foreign locks and code drift", async () => {
  const root = await mkdtemp(join(tmpdir(), "devsetu-health-recovery-")),
    target = join(root, "target"),
    stateRoot = join(root, "state");
  await mkdir(target);
  await mkdir(stateRoot);
  await mkdir(join(target, "uploads"));
  await writeFile(join(target, "uploads/keep"), "persistent data");
  await writeFile(join(target, ".env"), "synthetic environment");
  const health = createServer(async (_q, r) => {
    try {
      const current = await readFile(join(target, "index.js"), "utf8");
      r.statusCode = current === "Release A" ? 200 : 503;
      r.end("health");
    } catch {
      r.statusCode = 503;
      r.end("unavailable");
    }
  });
  await new Promise<void>((r) => health.listen(0, "127.0.0.1", r));
  const binding = {
    id: "web",
    root: target,
    healthUrl: `http://127.0.0.1:${(health.address() as { port: number }).port}/health`,
    recipes: ["npm-static"],
    runtime: { kind: "none" },
  };
  const artifactA = await zip(
      JSON.stringify({ version: 1, files: [file("index.js", "Release A")] }),
    ),
    artifactB = await zip(JSON.stringify({ version: 1, files: [file("index.js", "Release B")] }));
  const a = {
    id: "cj_" + "a".repeat(32),
    component: { recipe: "npm-static", preservedPaths: ["uploads", ".env"] },
    input: { digest: executor.sha(artifactA), bytes: artifactA.length },
  };
  const b = {
    ...a,
    id: "cj_" + "b".repeat(32),
    input: { digest: executor.sha(artifactB), bytes: artifactB.length },
    previousArtifact: a.input,
  };
  try {
    const first = join(root, "first"),
      second = join(root, "second");
    await mkdir(first);
    await mkdir(second);
    await executor.activate({ stateRoot }, a, binding, artifactA, undefined, first);
    await expect(
      executor.activate({ stateRoot }, b, binding, artifactB, artifactA, second),
    ).rejects.toThrow("activation-failed-recovered");
    expect(await readFile(join(target, "index.js"), "utf8")).toBe("Release A");
    expect(await readFile(join(target, "uploads/keep"), "utf8")).toBe("persistent data");
    expect(await readFile(join(target, ".env"), "utf8")).toBe("synthetic environment");
    expect(
      JSON.parse(await readFile(join(stateRoot, "destinations/web/current.json"), "utf8")).digest,
    ).toBe(a.input.digest);
    await writeFile(join(target, "index.js"), "unapproved drift");
    await expect(
      executor.activate({ stateRoot }, b, binding, artifactB, artifactA, second),
    ).rejects.toThrow("code-drift");
    const lock = join(target, ".runtime/devsetu-component.lock");
    await writeFile(lock, "foreign claim");
    await expect(
      executor.activate({ stateRoot }, b, binding, artifactB, artifactA, second),
    ).rejects.toThrow("locked-recovery-required");
    expect(await readFile(lock, "utf8")).toBe("foreign claim");
  } finally {
    await new Promise<void>((r) => health.close(() => r()));
    await rm(root, { recursive: true, force: true });
  }
}, 60000);
