import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";
it("ships every declared Linux monitoring runtime file in the installer source inventory", () => {
  const require = createRequire(import.meta.url);
  const { sourceFiles } = require("../../../deployment/servix/Setup-Linux.cjs");
  const { runtimeFiles } = require("../../../deployment/servix/SystemLinuxInstaller.cjs");
  expect(new Set(sourceFiles).size).toBe(sourceFiles.length);
  for (const file of runtimeFiles.filter((file: string) => !file.startsWith("runtime/")))
    expect(sourceFiles).toContain(file);
});
it("migrates and recovers actual Linux files, retains credentials and starts the installed monitoring/software connector", async () => {
  const env = createRequire(import.meta.url)(
    "../../../deployment/servix/NativePlatform.cjs",
  ).buildEnvironment();
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const { stdout } = await promisify(execFile)(
    "docker",
    [
      "run",
      "--rm",
      "--network",
      "none",
      "--user",
      "1000:1000",
      "--memory",
      "768m",
      "--cpus",
      "1",
      "-e",
      "HOME=/tmp/devsetu-software-fixture",
      "-v",
      root + ":/source:ro",
      "--entrypoint",
      "node",
      "node@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df",
      "/source/apps/control-plane/test/software-linux.fixture.cjs",
    ],
    { env, windowsHide: true, timeout: 90000, maxBuffer: 65536 },
  );
  expect(JSON.parse(stdout)).toMatchObject({
    status: "PASS",
    legacyMigration: true,
    credentialAndHistoryPreserved: true,
    failedStartRestored: true,
    installedConnectorHeartbeat: true,
    softwareCapability: true,
    actualLinuxInventory: true,
    systemd: "stubbed",
  });
}, 100000);
