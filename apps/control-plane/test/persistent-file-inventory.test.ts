import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";

it.skipIf(process.platform !== "win32")(
  "inventories every protected file on Windows PowerShell 5.1 and rejects non-first drift",
  async () => {
    const result = await promisify(execFile)(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        fileURLToPath(
          new URL("../../../deployment/servix/Test-PersistentInventory.ps1", import.meta.url),
        ),
      ],
      { windowsHide: true, timeout: 30000 },
    );
    expect(JSON.parse(result.stdout.trim())).toMatchObject({
      status: "PASS",
      protectedFiles: 6,
      changedNonFirstDenied: true,
      missingNonFirstDenied: true,
      duplicatePathsDeduplicated: true,
      actualCustomerFilesUsed: false,
    });
  },
);
