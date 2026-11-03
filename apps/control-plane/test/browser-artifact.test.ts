import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";

it("verifies the closed public asset tree and still rejects tampering, missing runtime and unrelated paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "devsetu-browser-artifact-"));
  const execute = promisify(execFile);
  const verifier = fileURLToPath(
    new URL("../../../deployment/server20/Verify-HttpManifest.mjs", import.meta.url),
  );
  const entries = new Map<string, string>([
    ["apps/control-plane/dist/main.js", "export {};"],
    ["apps/control-plane/dist/config.js", "export {};"],
    ["apps/control-plane/dist/server.js", "export {};"],
    ["apps/control-plane/dist/browser-entry.js", "export {};"],
    ["apps/control-center/dist/index.html", "<title>Internal fixture</title>"],
    ["apps/control-center/dist-browser/index.html", "<title>Browser fixture</title>"],
    [
      "apps/control-center/dist-browser/browser-entry.json",
      JSON.stringify({ version: 1, basePath: "/workspace" }),
    ],
    ["deployment/server20/Postgres.ps1", "# fixture"],
    ["deployment/server20/Start-Server20.ps1", "# fixture"],
    ["deployment/server20/HttpCommon.ps1", "# fixture"],
    ["deployment/server20/Apply-InternalHttp.ps1", "# fixture"],
    ["deployment/server20/Verify-HttpManifest.mjs", "// fixture data only"],
    ["deployment/server20/source-inventory.json", "{}"],
    ["prerequisites/node-v24.19.0-win-x64.zip", "fixture data only"],
  ]);
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  const verify = async () => {
    const manifest = JSON.stringify({
      schemaVersion: 4,
      applicationSource: "a".repeat(40),
      targetHost: "DCAPP7",
      targetAddress: "10.9.69.20",
      basePath: "",
      authMode: "local",
      nodeVersion: "24.19.0",
      postgresqlVersion: "18.4",
      publicOrigin: "http://10.9.69.20",
      operatorSource: "owner-selected-servix-git-v1",
      dependencyArtifactSha256: "de56c5684970bbe7a053318f532b81d1df562a55d5258e033e636cd11c06eef9",
      previousManifestSha256: "b".repeat(64),
      files: [...entries].map(([path, body]) => ({
        path,
        bytes: Buffer.byteLength(body),
        sha256: hash(body),
      })),
    });
    await writeFile(join(root, "release-manifest.json"), manifest);
    return execute(process.execPath, [verifier, root, hash(manifest)], { timeout: 15000 });
  };
  try {
    for (const [relative, body] of entries) {
      await mkdir(dirname(join(root, relative)), { recursive: true });
      await writeFile(join(root, relative), body);
    }
    expect(JSON.parse((await verify()).stdout).files).toHaveLength(entries.size);
    entries.set(
      "apps/control-center/dist-browser/browser-entry.json",
      JSON.stringify({ version: 1, basePath: "/workspace/other" }),
    );
    await writeFile(
      join(root, "apps/control-center/dist-browser/browser-entry.json"),
      entries.get("apps/control-center/dist-browser/browser-entry.json") ?? "",
    );
    await expect(verify()).rejects.toThrow();
    entries.set(
      "apps/control-center/dist-browser/browser-entry.json",
      JSON.stringify({ version: 1, basePath: "/workspace" }),
    );
    await writeFile(
      join(root, "apps/control-center/dist-browser/browser-entry.json"),
      entries.get("apps/control-center/dist-browser/browser-entry.json") ?? "",
    );
    await writeFile(join(root, "apps/control-center/dist-browser/index.html"), "tampered");
    await expect(verify()).rejects.toThrow();
    await writeFile(
      join(root, "apps/control-center/dist-browser/index.html"),
      entries.get("apps/control-center/dist-browser/index.html") ?? "",
    );
    entries.delete("apps/control-plane/dist/browser-entry.js");
    await rm(join(root, "apps/control-plane/dist/browser-entry.js"));
    await expect(verify()).rejects.toThrow();
    entries.set("apps/control-plane/dist/browser-entry.js", "export {};");
    await writeFile(join(root, "apps/control-plane/dist/browser-entry.js"), "export {};");
    entries.set("apps/unrelated/secret.json", "{}");
    await mkdir(join(root, "apps/unrelated"));
    await writeFile(join(root, "apps/unrelated/secret.json"), "{}");
    await expect(verify()).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it.skipIf(process.platform !== "win32")(
  "retains active browser entry support and rejects mismatched recovery assets",
  async () => {
    const execute = promisify(execFile);
    const script = fileURLToPath(
      new URL("../../../deployment/server20/Test-AndroidCompatibility.ps1", import.meta.url),
    );
    const result = await execute(
      join(process.env["WINDIR"] ?? "C:/Windows", "System32/WindowsPowerShell/v1.0/powershell.exe"),
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "RemoteSigned", "-File", script],
      {
        timeout: 60000,
        env: createRequire(import.meta.url)(
          "../../../deployment/servix/NativePlatform.cjs",
        ).buildEnvironment(),
      },
    );
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "PASS",
      checks: 13,
      activeBrowserEntryRetained: true,
      inactiveEntryRecoveryAllowed: true,
      mismatchedBrowserAssetsDenied: true,
    });
  },
);
