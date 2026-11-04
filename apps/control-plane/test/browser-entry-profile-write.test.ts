import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it.skipIf(process.platform !== "win32")(
  "updates an existing browser profile with the actual Windows operator expression and preserves a locked preimage",
  async () => {
    const result = await promisify(execFile)(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "RemoteSigned",
        "-File",
        fileURLToPath(
          new URL(
            "../../../deployment/server20/Test-BrowserEntryProfileReplacement.ps1",
            import.meta.url,
          ),
        ),
      ],
      {
        windowsHide: true,
        timeout: 15000,
        env: Object.fromEntries(
          Object.entries(process.env).filter(([key]) => key.toLowerCase() !== "psmodulepath"),
        ),
      },
    );
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "PASS",
      checks: 3,
      actualOperatorExpression: true,
      existingProfileReplaced: true,
      lockedPreimagePreserved: true,
      savedProfileRecovery: true,
      externalChanges: false,
    });
  },
  20000,
);
