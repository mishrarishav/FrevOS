import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";

it("allows exactly the complete eight-file monitoring runtime and rejects operator data, extra scripts and tampering", async () => {
  const root = await mkdtemp(join(tmpdir(), "devsetu-monitor-manifest-"));
  const verifier = fileURLToPath(
    new URL("../../../deployment/server20/Verify-HttpManifest.mjs", import.meta.url),
  );
  const execute = promisify(execFile);
  const hash = (bytes: string) => createHash("sha256").update(bytes).digest("hex");
  const entries = new Map([
    ["apps/control-plane/dist/main.js", "export {};"],
    ["apps/control-plane/dist/config.js", "export {};"],
    ["apps/control-plane/dist/server.js", "export {};"],
    ["apps/control-plane/dist/server-monitoring.js", "export {};"],
    ["apps/control-plane/dist/server-monitoring-central.js", "export {};"],
    ["apps/control-plane/migrations/0008_server_monitoring_state.sql", "-- fixture only"],
    ["apps/control-center/dist/index.html", "<title>Fixture</title>"],
    ["deployment/server20/Postgres.ps1", "# fixture"],
    ["deployment/server20/Start-Server20.ps1", "# fixture"],
    ["deployment/server20/HttpCommon.ps1", "# fixture"],
    ["deployment/server20/Apply-InternalHttp.ps1", "# fixture"],
    ["deployment/server20/Verify-HttpManifest.mjs", "// fixture only"],
    ["deployment/server20/source-inventory.json", "{}"],
    ["prerequisites/node-v24.19.0-win-x64.zip", "fixture only"],
  ]);
  const monitoringFiles = [
    "Common.ps1",
    "Collector.ps1",
    "Worker.ps1",
    "Protect-Credential.ps1",
    "Install-Worker.ps1",
    "QueueCollector.mjs",
    "manifest.v1.json",
    "README.md",
  ];
  const put = async (path: string, body = "fixture only") => {
    entries.set(path, body);
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), body);
  };
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
    for (const [path, body] of entries) await put(path, body);
    expect(JSON.parse((await verify()).stdout).files).toHaveLength(entries.size);
    for (const name of monitoringFiles) await put(`deployment/server-monitoring/${name}`);
    expect(JSON.parse((await verify()).stdout).files).toHaveLength(entries.size);
    for (const name of [
      "registry.json",
      "Registry.json",
      "credentials/profile.xml",
      "private/credential.json",
      "Other.ps1",
      "README.md.bak",
      "QueueCollector.mjs.extra",
      "queue/requests/job.json",
    ]) {
      const path = `deployment/server-monitoring/${name}`;
      await put(path);
      await expect(verify()).rejects.toThrow();
      entries.delete(path);
      await rm(join(root, path));
    }
    // Windows names are case-insensitive; change the manifest spelling without
    // overwriting/deleting the already existing Collector.ps1 fixture.
    const collector = "deployment/server-monitoring/Collector.ps1";
    entries.delete(collector);
    entries.set("deployment/server-monitoring/collector.ps1", "fixture only");
    await expect(verify()).rejects.toThrow();
    entries.delete("deployment/server-monitoring/collector.ps1");
    entries.set(collector, "fixture only");
    const required = "deployment/server-monitoring/Worker.ps1";
    entries.delete(required);
    await rm(join(root, required));
    await expect(verify()).rejects.toThrow();
    await put(required);
    expect(JSON.parse((await verify()).stdout).files).toHaveLength(entries.size);
    await writeFile(join(root, required), "tampered");
    await expect(verify()).rejects.toThrow();
    await put(required);
    await writeFile(
      join(root, "deployment/server-monitoring/unmanifested-private.json"),
      "fixture only",
    );
    await expect(verify()).rejects.toThrow();
  } finally {
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !root.includes("devsetu-monitor-manifest-"))
      throw new Error("Unsafe fixture cleanup");
    await rm(root, { recursive: true, force: true });
  }
});
