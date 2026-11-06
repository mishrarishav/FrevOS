import { createHash } from "node:crypto";
import { lstat, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const softwareSchemaPath =
  "apps/control-plane/node_modules/@frevos/contracts/dist/software-management.js";
export const softwareMetadataPath = "deployment/server20/software-data-format.json";
// This qualification executes the actual packaged pure contract module, not a
// filename marker or an unrelated checkout's schemas. The native guard never
// executes a candidate's code; it verifies this metadata's binding to its bytes.
export function qualifySoftwareSchemas(schemas) {
  const at = "2026-11-06T00:00:00.000Z",
    deviceId = `fc_${"a".repeat(32)}`,
    digest = "b".repeat(64);
  const service = {
    id: digest,
    name: "FixtureService",
    displayName: "Fixture service",
    manager: "windows-scm",
    definitionSha256: digest,
    status: "running",
    startupType: "Manual",
    canStart: true,
    canStop: true,
    protected: false,
  };
  const inventory = {
    version: 1,
    observedAt: at,
    platform: "android",
    status: "ready",
    scope: "android-current-user",
    truncated: false,
    items: [{ id: digest, name: "Fixture app", source: "android-user" }],
  };
  const snapshot = {
    version: 1,
    observedAt: at,
    platform: "win32",
    status: "ready",
    truncated: false,
    items: [service],
  };
  const observation = {
    version: 1,
    platform: "win32",
    inventoryConsent: true,
    installConsent: false,
    programSha256: digest,
    services: [],
    serviceManagement: { version: 1, controlConsent: false },
    serviceInventory: snapshot,
  };
  schemas.SoftwareObservationSchema.parse(observation);
  schemas.SoftwareObservationSchema.parse({
    ...observation,
    platform: "android",
    serviceInventory: undefined,
  });
  schemas.SoftwareInventorySchema.parse(inventory);
  schemas.SoftwareInventorySchema.parse({
    ...inventory,
    platform: "win32",
    scope: "windows-machine-and-connector-user",
    items: [{ id: digest, name: "Legacy app", source: "registry" }],
  });
  for (const operation of ["services-inventory", "start-service", "stop-service"]) {
    const control = operation !== "services-inventory";
    const job = schemas.SoftwareJobSchema.parse({
      version: 1,
      workspaceId: "ws_format",
      actor: "usr_format",
      request: {
        version: 1,
        requestId: `sw_${"c".repeat(32)}`,
        deviceId,
        operation,
        ...(control ? { serviceId: digest, policyRevision: 1 } : {}),
      },
      digest,
      createdAt: at,
      expiresAt: "2026-11-06T01:00:00.000Z",
      status: "succeeded",
      result: control
        ? operation === "start-service"
          ? "service-started"
          : "service-stopped"
        : "services-updated",
      ...(control
        ? {
            service,
            approval: {
              version: 1,
              action: "software.service.v1",
              workspaceId: "ws_format",
              actor: "usr_format",
              target: deviceId,
              correlationId: `sw_${"c".repeat(32)}`,
              artifactSha256: digest,
              digest,
              issuedAt: at,
              expiresAt: "2026-11-06T00:05:00.000Z",
              consumedAt: at,
            },
          }
        : {}),
    });
    if (job.request.operation !== operation) throw Error("Software format qualification failed");
  }
  return 2;
}
export async function writeSoftwareDataFormat(packageRoot) {
  const root = resolve(packageRoot),
    file = join(root, softwareSchemaPath);
  if ((await lstat(root)).isSymbolicLink()) throw Error("Software format linked package root");
  for (const relative of [softwareSchemaPath, "deployment/server20"]) {
    let cursor = root;
    for (const part of relative.split("/")) {
      cursor = join(cursor, part);
      if ((await lstat(cursor)).isSymbolicLink())
        throw Error("Software format linked package path");
    }
  }
  const info = await lstat(file);
  if (!info.isFile() || info.size > 1000000) throw Error("Software format schema capacity");
  const bytes = await readFile(file),
    schemas = await import(pathToFileURL(file).href);
  const metadata = {
    version: 1,
    softwareState: qualifySoftwareSchemas(schemas),
    schemaSha256: createHash("sha256").update(bytes).digest("hex"),
  };
  if (!bytes.equals(await readFile(file)))
    throw Error("Software format schema changed during qualification");
  try {
    const existing = await lstat(join(root, softwareMetadataPath));
    if (!existing.isFile() || existing.isSymbolicLink() || existing.size > 4096)
      throw Error("Software format metadata path rejected");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await writeFile(join(root, softwareMetadataPath), JSON.stringify(metadata), { flag: "w" });
  return metadata;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.stdout.write(JSON.stringify(await writeSoftwareDataFormat(process.argv[2])) + "\n");
  } catch {
    process.stderr.write("Packaged software data format qualification failed\n");
    process.exitCode = 1;
  }
}
