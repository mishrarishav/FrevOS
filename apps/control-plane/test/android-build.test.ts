import { createRequire } from "node:module";
import { readFile, mkdtemp, mkdir, writeFile, readdir, rm, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { join, dirname, basename, resolve } from "node:path";
import { tmpdir } from "node:os";

const builder = createRequire(import.meta.url)("../../../deployment/android/AndroidBuild.cjs");
const client = createRequire(import.meta.url)("../../../deployment/android/AndroidBuildClient.cjs");
const now = Date.parse("2026-10-29T00:00:00Z");
async function removeOwnedSdkFixture(root: string) {
  if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith("dva-"))
    throw Error("Temporary SDK fixture escaped its owned target");
  await rm(root, { recursive: true, force: true });
}
it.skipIf(process.platform !== "win32")(
  "accepts compatible Android recovery and rejects pre-Android downgrade, changed archive or source through the actual native operator guard",
  async () => {
    const systemRoot = process.env["WINDIR"];
    if (!systemRoot) throw Error("Windows runtime unavailable");
    const { stdout } = await promisify(execFile)(
      join(systemRoot, "System32/WindowsPowerShell/v1.0/powershell.exe"),
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "RemoteSigned",
        "-File",
        fileURLToPath(
          new URL("../../../deployment/server20/Test-AndroidCompatibility.ps1", import.meta.url),
        ),
      ],
      {
        env: createRequire(import.meta.url)(
          "../../../deployment/servix/NativePlatform.cjs",
        ).buildEnvironment(),
        timeout: 30000,
        windowsHide: true,
      },
    );
    expect(JSON.parse(stdout)).toMatchObject({
      status: "PASS",
      checks: 5,
      incompatibleDowngradeDenied: true,
      sameCapabilityRecoveryAccepted: true,
    });
  },
);
const scope = {
  workspaceId: "ws_fixture",
  profileId: "platform-fixture",
  repositoryId: "gitrepo_" + "a".repeat(32),
};
async function request() {
  const sources = await Promise.all(
    builder.sourcePaths.map(async (path: string) => {
      const bytes = await readFile(
        new URL("../../../apps/android-connector/" + path, import.meta.url),
      );
      return {
        path,
        data: bytes.toString("base64"),
        sha256: createHash("sha256").update(bytes).digest("hex"),
      };
    }),
  );
  return {
    version: 1,
    id: "ab_" + "b".repeat(32),
    operation: "build-android-apk",
    correlationId: "cj_" + "c".repeat(32),
    ...scope,
    sourceHead: "d".repeat(40),
    sourceState: "committed",
    expiresAt: new Date(now + 300000).toISOString(),
    sources,
  };
}
it("binds Android build requests to workspace, project, provider repository, exact source inventory and expiring job identity", async () => {
  const value = await request();
  expect(builder.validateRequest(value, scope, now)).toEqual(value);
  for (const patch of [
    { workspaceId: "ws_other" },
    { profileId: "outside" },
    { repositoryId: "gitrepo_" + "e".repeat(32) },
    { operation: "shell" },
    { command: "arbitrary" },
    { sourceHead: "HEAD" },
    { expiresAt: new Date(now).toISOString() },
    { expiresAt: new Date(now + 901000).toISOString() },
    { sources: value.sources.slice(1) },
    { sources: [...value.sources.slice(1), value.sources[1]] },
  ])
    expect(() => builder.validateRequest({ ...value, ...patch }, scope, now)).toThrow();
  const damaged = structuredClone(value);
  damaged.sources[1].sha256 = "0".repeat(64);
  expect(() => builder.validateRequest(damaged, scope, now)).toThrow("android-source-integrity");
  const traversal = structuredClone(value);
  traversal.sources[1].path = "../private/key";
  expect(() => builder.validateRequest(traversal, scope, now)).toThrow("android-source-invalid");
});
it("denies an Android manifest that requests unrelated sensitive permissions or changes the app identity", async () => {
  const value = await request();
  for (const text of [
    '<manifest package="org.other.app"/>',
    '<manifest package="org.devsetu.connector"><uses-permission android:name="android.permission.READ_SMS"/></manifest>',
    '<!DOCTYPE manifest><manifest package="org.devsetu.connector"/>',
  ]) {
    const altered = structuredClone(value),
      file = altered.sources[0],
      bytes = Buffer.from(text);
    file.data = bytes.toString("base64");
    file.sha256 = createHash("sha256").update(bytes).digest("hex");
    expect(() => builder.validateRequest(altered, scope, now)).toThrow(
      "android-manifest-scope-denied",
    );
  }
});

it("refuses changed workspace, job, configuration, source, signature and artifact bytes before exporting a trusted Android build result", async () => {
  const root = await mkdtemp(join(tmpdir(), "dva-"));
  try {
    for (const name of ["requests", "results", "jobs"]) await mkdir(join(root, name));
    const reference = {
      version: 1,
      root,
      ...scope,
      configurationSha256: "1".repeat(64),
      certificateSha256: "2".repeat(64),
    };
    const referencePath = join(root, "reference.json");
    await writeFile(referencePath, JSON.stringify(reference));
    const bytes = Buffer.from("synthetic signed-service artifact fixture; not an installable APK"),
      digest = createHash("sha256").update(bytes).digest("hex");
    const patches = [
      { workspaceId: "ws_other" },
      { repositoryId: "gitrepo_" + "f".repeat(32) },
      { correlationId: "cj_" + "f".repeat(32) },
      { configurationSha256: "f".repeat(64) },
      { sourceHead: "f".repeat(40) },
      { sourceState: "local-uncommitted" },
      { certificateSha256: "f".repeat(64) },
      { status: "UNSIGNED" },
      { sourceTreeSha256: "f".repeat(64) },
      {},
    ];
    const handled = new Set<string>();
    for (let index = 0; index <= patches.length; index++) {
      await writeFile(
        join(root, "results/service-health.json"),
        JSON.stringify({
          version: 1,
          status: "READY",
          at: new Date().toISOString(),
          configSha256: reference.configurationSha256,
        }),
      );
      const outputRoot = join(root, "output-" + index),
        correlationId = "cj_" + "c".repeat(32);
      const emulateTrustedService = (async () => {
        const deadline = Date.now() + 10000;
        let filename: string | undefined;
        while (Date.now() < deadline) {
          filename = (await readdir(join(root, "requests"))).find(
            (name) => /^ab_[a-f0-9]{32}\.json$/.test(name) && !handled.has(name),
          );
          if (filename) break;
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        if (!filename) throw Error("Fixture request not received");
        handled.add(filename);
        const request = JSON.parse(await readFile(join(root, "requests", filename), "utf8"));
        await mkdir(join(root, "jobs", request.id));
        await writeFile(
          join(root, "jobs", request.id, "DevSetu-Android.apk"),
          index === patches.length - 1 ? Buffer.from("modified artifact bytes") : bytes,
        );
        const sourceTreeSha256 = createHash("sha256")
          .update(
            JSON.stringify(
              request.sources
                .map(({ path, sha256 }: { path: string; sha256: string }) => ({ path, sha256 }))
                .sort((a: { path: string }, b: { path: string }) => a.path.localeCompare(b.path)),
            ),
          )
          .digest("hex");
        const report = {
          version: 1,
          status: "SIGNED",
          sdkJobId: request.id,
          correlationId,
          ...scope,
          configurationSha256: reference.configurationSha256,
          sourceHead: "d".repeat(40),
          sourceState: "committed",
          sourceTreeSha256,
          apkSha256: digest,
          apkBytes: bytes.length,
          certificateSha256: reference.certificateSha256,
          ...(patches[index] ?? {}),
        };
        await writeFile(join(root, "results", filename + ".tmp"), JSON.stringify(report));
        await rename(join(root, "results", filename + ".tmp"), join(root, "results", filename));
      })();
      const result = client.submit({
        reference: referencePath,
        sourceRoot: resolve(fileURLToPath(new URL("../../../", import.meta.url))),
        sourceHead: "d".repeat(40),
        correlationId,
        outputRoot,
      });
      if (index < patches.length) {
        await expect(result).rejects.toThrow(
          index === patches.length - 1
            ? "android-artifact-integrity"
            : "android-artifact-provenance-mismatch",
        );
        expect((await readdir(root)).includes("output-" + index)).toBe(false);
      } else {
        expect((await result).report.status).toBe("SIGNED");
        expect(await readFile(join(outputRoot, "DevSetu-Android.apk"))).toEqual(bytes);
      }
      await emulateTrustedService;
    }
    await writeFile(
      join(root, "results/service-health.json"),
      JSON.stringify({
        version: 1,
        status: "READY",
        at: new Date(Date.now() - 60000).toISOString(),
        configSha256: reference.configurationSha256,
      }),
    );
    await expect(
      client.submit({
        reference: referencePath,
        sourceRoot: process.cwd(),
        sourceHead: "d".repeat(40),
        correlationId: "cj_" + "c".repeat(32),
        outputRoot: join(root, "offline-output"),
      }),
    ).rejects.toThrow("android-builder-offline-or-changed");
    expect(await readdir(join(root, "requests"))).toHaveLength(patches.length + 1);
  } finally {
    await removeOwnedSdkFixture(root);
  }
});
