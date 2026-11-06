import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import * as contracts from "@frevos/contracts";
import { expect, it } from "vitest";

async function removePackageFixture(root: string) {
  if (
    dirname(resolve(root)) !== resolve(tmpdir()) ||
    !basename(root).startsWith("software-format-package-")
  )
    throw Error("Fixture cleanup scope differs");
  await rm(root, { recursive: true, force: true });
}

it("generates canonical format metadata from real compiled schemas in an isolated package layout", async () => {
  const root = await mkdtemp(join(tmpdir(), "software-format-package-"));
  try {
    const packagePath = join(root, "apps/control-plane/node_modules/@frevos/contracts"),
      require = createRequire(import.meta.url),
      contractsRoot = dirname(
        dirname(
          fileURLToPath(new URL("../../../packages/contracts/dist/index.js", import.meta.url)),
        ),
      );
    await mkdir(packagePath, { recursive: true });
    await mkdir(join(root, "deployment/server20"), { recursive: true });
    await cp(join(contractsRoot, "dist"), join(packagePath, "dist"), { recursive: true });
    await cp(join(contractsRoot, "package.json"), join(packagePath, "package.json"));
    await cp(
      await realpath(dirname(require.resolve("zod/package.json"))),
      join(root, "apps/control-plane/node_modules/zod"),
      { recursive: true },
    );
    const module = await import(
        new URL("../../../deployment/server20/SoftwareDataFormat.mjs", import.meta.url).href
      ),
      metadata = await module.writeSoftwareDataFormat(root),
      schemaBytes = await readFile(join(packagePath, "dist/software-management.js"));
    expect(metadata).toEqual({
      version: 1,
      softwareState: 2,
      schemaSha256: createHash("sha256").update(schemaBytes).digest("hex"),
    });
    expect(
      await readFile(join(root, "deployment/server20/software-data-format.json"), "utf8"),
    ).toBe(JSON.stringify(metadata));
  } finally {
    await removePackageFixture(root);
  }
});

it("qualifies new software formats from the actual schemas and rejects a reader missing new persisted records", async () => {
  const module = await import(
    new URL("../../../deployment/server20/SoftwareDataFormat.mjs", import.meta.url).href
  );
  expect(module.qualifySoftwareSchemas(contracts)).toBe(2);
  expect(() =>
    module.qualifySoftwareSchemas({
      ...contracts,
      SoftwareObservationSchema: {
        parse: () => {
          throw Error("legacy strict observation");
        },
      },
    }),
  ).toThrow();
  expect(() =>
    module.qualifySoftwareSchemas({
      ...contracts,
      SoftwareJobSchema: {
        parse: () => {
          throw Error("legacy service job");
        },
      },
    }),
  ).toThrow();
  expect(() =>
    module.qualifySoftwareSchemas({
      ...contracts,
      SoftwareInventorySchema: {
        parse: () => {
          throw Error("legacy Android inventory");
        },
      },
    }),
  ).toThrow();
});
it("keeps recovery checks before pointer writes and declares the actual inventory UI helper as a build input", async () => {
  const apply = await readFile(
    new URL("../../../deployment/server20/Apply-ServixDashboard.ps1", import.meta.url),
    "utf8",
  );
  const activate = apply.indexOf("Assert-SoftwareDataCompatible $root $release $ManifestSha256"),
    activationWrite = apply.indexOf("Replace-Private $stateFile", activate);
  expect(activate).toBeGreaterThan(
    apply.indexOf("Stop-ScheduledTask -TaskName FrevOS-ControlPlane;$stopped=$true;Wait-Stopped"),
  );
  expect(activationWrite).toBeGreaterThan(activate);
  const restore = apply.indexOf("Assert-SoftwareDataCompatible $root $oldRelease $oldHash");
  expect(restore).toBeGreaterThan(apply.indexOf("$stage='restore-previous'"));
  expect(
    apply.indexOf("Replace-Private $stateFile $oldStateBytes 'active-recovery'", restore),
  ).toBeGreaterThan(restore);
  const packageCode = await readFile(
    new URL("../../../deployment/server20/New-ServixDashboardRelease.ps1", import.meta.url),
    "utf8",
  );
  const inputs = packageCode.slice(
    packageCode.indexOf(" $inputs=@("),
    packageCode.indexOf(" $inventory=@("),
  );
  expect(inputs).toContain("'apps/control-center/src/software-inventory-status.ts'");
  expect(packageCode).toContain("'deployment\\server20\\SoftwareDataFormat.mjs'");
});
it.skipIf(process.platform !== "win32")(
  "guards actual native downgrade and post-stop recovery using the protected persisted software format floor",
  async () => {
    const systemRoot = process.env["WINDIR"];
    if (!systemRoot) throw Error("Windows runtime missing");
    const { stdout } = await promisify(execFile)(
      systemRoot + "/System32/WindowsPowerShell/v1.0/powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "RemoteSigned",
        "-File",
        fileURLToPath(
          new URL("../../../deployment/server20/Test-SoftwareCompatibility.ps1", import.meta.url),
        ),
      ],
      {
        windowsHide: true,
        timeout: 30000,
        env: createRequire(import.meta.url)(
          "../../../deployment/servix/NativePlatform.cjs",
        ).buildEnvironment(),
      },
    );
    expect(JSON.parse(stdout)).toMatchObject({
      status: "PASS",
      checks: 12,
      safePreWriteRecoveryAllowed: true,
      incompatibleWrittenStateDenied: true,
      postStopRecoveryChecked: true,
      schemaTamperingDenied: true,
      malformedFloorDenied: true,
      remoteMutation: false,
    });
  },
);
