import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";
const environment = createRequire(import.meta.url)(
  "../../../deployment/servix/NativePlatform.cjs",
).buildEnvironment();
for (const [script, checks] of [
  ["servix/Test-PreviewConnectorUpdate.ps1", 7],
  ["server20/Test-PrivatePreviewConfiguration.ps1", 6],
  ["server20/Test-PreviewExecutorUpdate.ps1", 5],
] as const) {
  it.skipIf(process.platform !== "win32")(
    `runs real Windows file/protection preservation and fixed transport failure recovery: ${script}`,
    async () => {
      const args = [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "RemoteSigned",
        "-File",
        fileURLToPath(new URL("../../../deployment/" + script, import.meta.url)),
      ];
      if (script.includes("PrivatePreviewConfiguration")) {
        // The clean CI checkout has no backend dist yet (the main build follows
        // coverage). This fixture executes the real compiled validator.
        await promisify(execFile)(
          process.env["ComSpec"] ?? "C:\\Windows\\System32\\cmd.exe",
          ["/d", "/s", "/c", "pnpm run build"],
          {
            cwd: fileURLToPath(new URL("../", import.meta.url)),
            env: environment,
            windowsHide: true,
            timeout: 60000,
            maxBuffer: 65536,
          },
        );
      }
      if (!script.includes("Executor")) args.push("-NodeExecutable", process.execPath);
      const { stdout } = await promisify(execFile)(
        join(
          process.env["WINDIR"] ?? "C:\\Windows",
          "System32/WindowsPowerShell/v1.0/powershell.exe",
        ),
        args,
        { env: environment, windowsHide: true, timeout: 90000, maxBuffer: 65536 },
      );
      expect(JSON.parse(stdout)).toMatchObject({ status: "PASS", checks });
    },
    100000,
  );
}
