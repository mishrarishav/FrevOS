import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
import { expect, it } from "vitest";
import { JoinRequestInputSchema, JoinRequestSchema } from "@frevos/contracts";
const require = createRequire(import.meta.url);
const { statusLauncher } = require("../../../deployment/servix/SystemLinuxInstaller.cjs");
it.skipIf(process.platform !== "win32")(
  "creates and cleans up an actual scoped Windows desktop shortcut and branded icon",
  async () => {
    const root = fileURLToPath(new URL("../../../", import.meta.url));
    const script = fileURLToPath(new URL("./connection-shortcut.fixture.ps1", import.meta.url));
    const result = await promisify(execFile)(
      join(process.env["WINDIR"]!, "System32/WindowsPowerShell/v1.0/powershell.exe"),
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "RemoteSigned",
        "-File",
        script,
        "-SourceRoot",
        resolve(root),
      ],
      {
        windowsHide: true,
        timeout: 30000,
        env: {
          ...process.env,
          PSModulePath: join(process.env["WINDIR"]!, "System32/WindowsPowerShell/v1.0/Modules"),
        },
      },
    );
    expect(JSON.parse(result.stdout)).toEqual({
      status: "PASS",
      desktopShortcut: true,
      brandedIcon: true,
      credentialInArguments: false,
    });
  },
  35000,
);

it("creates a per-user Linux launcher without shell commands, credentials or unescaped desktop placeholders", () => {
  const entry = statusLauncher(
    "/home/fixture name/100%/fc_fixture",
    "/home/fixture name/100%/fc_fixture/device.json",
  );
  expect(entry).toContain(' --connection-status "/home/fixture name/100%%/fc_fixture/device.json"');
  expect(entry).toContain("Terminal=false");
  expect(entry).not.toContain("credential=");
  for (const folder of ["relative", "/home/a\nExec=evil", "/home/a\\b"])
    expect(() => statusLauncher(folder, "/home/a/device.json")).toThrow();
});
it("keeps the same automatic device-binding contract for Windows/Linux/Android and strips it from safe request records", () => {
  for (const platform of ["win32", "linux", "android"]) {
    const request = JoinRequestInputSchema.parse({
      version: 1,
      mode: "existing",
      username: "fixture.user",
      password: "synthetic-only",
      displayName: "Fixture",
      platform,
      deviceId: "fc_" + "a".repeat(32),
      codeHash: "b".repeat(64),
      fileActivity: false,
      autoConnection: {
        name: "Fixture device",
        architecture: platform === "android" ? "arm64" : "x64",
        credentialHash: "c".repeat(64),
        pollHash: "d".repeat(64),
      },
    });
    expect(request.autoConnection!.name).toBe("Fixture device");
    expect(() =>
      JoinRequestSchema.parse({
        ...request,
        id: "jr_" + "a".repeat(32),
        ownerUserId: "usr_fixture",
        status: "pending",
        createdAt: "2026-11-02T00:00:00Z",
        expiresAt: "2026-11-03T00:00:00Z",
        digest: "e".repeat(64),
      }),
    ).toThrow();
  }
});
