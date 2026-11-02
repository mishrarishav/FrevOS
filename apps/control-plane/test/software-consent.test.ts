import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";
it.skipIf(process.platform !== "win32")(
  "persists and revokes real Windows software consent while retaining DPAPI bytes/ACL and refusing a different pairing",
  async () => {
    const env = createRequire(import.meta.url)(
      "../../../deployment/servix/NativePlatform.cjs",
    ).buildEnvironment();
    const { stdout } = await promisify(execFile)(
      join(process.env["WINDIR"]!, "System32/WindowsPowerShell/v1.0/powershell.exe"),
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "RemoteSigned",
        "-File",
        fileURLToPath(new URL("./software-consent.fixture.ps1", import.meta.url)),
        "-SourceScript",
        fileURLToPath(new URL("../../../deployment/servix/Software-Consent.ps1", import.meta.url)),
      ],
      { env, windowsHide: true, timeout: 20000, maxBuffer: 65536 },
    );
    expect(JSON.parse(stdout)).toMatchObject({
      status: "PASS",
      nativeWindowsDpapi: true,
      localOptIn: true,
      localRevocation: true,
      wrongPairingDenied: true,
      pairingBytesAndPermissionsPreserved: true,
      liveEnrollmentChanged: false,
      softwareInstalled: false,
    });
  },
  25000,
);
