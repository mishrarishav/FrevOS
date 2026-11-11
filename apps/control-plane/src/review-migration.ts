import { createHash } from "node:crypto";
import { ReviewRegisterIdSchema, UserIdSchema, WorkspaceIdSchema } from "@frevos/contracts";
import { z } from "zod";
import { type ReviewWorkspaceDocument, ReviewWorkspaceStateSchema } from "./review-registers.js";

export const ReviewMigrationMappingSchema = z
  .object({
    version: z.literal(1),
    id: z.string().regex(/^rmi_[a-f0-9]{32}$/),
    sourceWorkspaceId: WorkspaceIdSchema,
    targetWorkspaceId: WorkspaceIdSchema,
    registerIds: z.array(ReviewRegisterIdSchema).min(1).max(100),
    actors: z.record(UserIdSchema, UserIdSchema),
    requestedBy: UserIdSchema,
    preparedAt: z.iso.datetime(),
    expectedDestinationHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
  })
  .strict();
export type ReviewMigrationMapping = z.infer<typeof ReviewMigrationMappingSchema>;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  }
  return value;
}
export function reviewMigrationHash(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}
function fail(code: string): never {
  throw new Error("review-migration:" + code);
}
function scope(document: ReviewWorkspaceDocument) {
  if (new Set(document.registers.map(data => data.register.id)).size !== document.registers.length)
    fail("duplicate-register-state");
  for (const data of document.registers) {
    if (data.register.workspaceId !== document.workspaceId) fail("nested-workspace-mismatch");
    if (new Set(data.records.map(record => record.id)).size !== data.records.length)
      fail("duplicate-record-state");
    for (const record of data.records)
      if (new Set(record.endpoints.map(endpoint => endpoint.id)).size !== record.endpoints.length)
        fail("duplicate-endpoint-state");
  }
}

/** Pure transformation. Destination membership and operator approval are checked at commit. */
export function prepareReviewMigration(
  sourceInput: unknown,
  mappingInput: unknown,
  destinationInput: unknown | null,
) {
  const mapping = ReviewMigrationMappingSchema.parse(mappingInput);
  const source = ReviewWorkspaceStateSchema.parse(sourceInput);
  scope(source);
  if (source.workspaceId !== mapping.sourceWorkspaceId) fail("source-workspace-mismatch");
  if (new Set(mapping.registerIds).size !== mapping.registerIds.length) fail("duplicate-register");
  if (Object.keys(mapping.actors).length > 1000) fail("actor-map-limit");
  const selected = source.registers.filter((data) =>
    mapping.registerIds.includes(data.register.id),
  );
  if (selected.length !== mapping.registerIds.length) fail("source-register-missing");
  const actor = (value: string) => {
    const mapped = mapping.actors[UserIdSchema.parse(value)];
    if (!mapped) fail("actor-mapping-required");
    return UserIdSchema.parse(mapped);
  };
  const destination: ReviewWorkspaceDocument =
    destinationInput === null
      ? {
          version: 1,
          workspaceId: mapping.targetWorkspaceId,
          registers: [],
          audit: [],
          previews: [],
        }
      : ReviewWorkspaceStateSchema.parse(destinationInput);
  if (destination.workspaceId !== mapping.targetWorkspaceId) fail("target-workspace-mismatch");
  scope(destination);
  if (
    (destinationInput === null ? null : reviewMigrationHash(destination)) !==
    mapping.expectedDestinationHash
  )
    fail("destination-changed");
  if (destination.registers.some((data) => mapping.registerIds.includes(data.register.id)))
    fail("register-already-exists");
  const imported = structuredClone(selected);
  for (const data of imported) {
    data.register.workspaceId = mapping.targetWorkspaceId;
    data.register.createdBy = actor(data.register.createdBy);
    data.register.grants = data.register.grants.map((grant) => ({
      ...grant,
      userId: actor(grant.userId),
    }));
    if (
      new Set(data.register.grants.map((grant) => grant.userId)).size !==
      data.register.grants.length
    )
      fail("grant-mapping-collision");
    for (const record of data.records) {
      record.updatedBy = actor(record.updatedBy);
      for (const entry of record.provenance) entry.importedBy = actor(entry.importedBy);
      for (const entry of record.assignmentHistory) entry.by = actor(entry.by);
      for (const entry of record.reviews) entry.by = actor(entry.by);
      for (const entry of record.checks) entry.by = actor(entry.by);
    }
    if (data.monitoring) {
      const monitor = data.monitoring;
      if (monitor.configuredBy) monitor.configuredBy = actor(monitor.configuredBy);
      for (const read of monitor.reads) read.userId = actor(read.userId);
      for (const run of monitor.runs) {
        run.requestedBy = actor(run.requestedBy);
        if (run.status === "running") {
          run.status = "interrupted";
          run.finishedAt = mapping.preparedAt;
          run.message =
            "The source process was stopped for migration; pending requests were not replayed.";
          for (const item of run.items)
            if (["running", "pending"].includes(item.status)) {
              item.status = "interrupted";
              item.result = null;
              item.message = "Migration stopped this attempt; no remote result is inferred.";
            }
        }
      }
      monitor.lease = null;
      monitor.bindings = [];
      monitor.nextRunAt = null;
      // Require deliberate enrollment and enablement under the real central administrator.
      if (monitor.schedule) monitor.schedule.enabled = false;
    }
  }
  const importedAudit = source.audit
    .filter((entry) => mapping.registerIds.includes(entry.registerId))
    .map((entry) => ({ ...entry, by: actor(entry.by) }));
  const document = ReviewWorkspaceStateSchema.parse({
    ...destination,
    registers: [...destination.registers, ...imported],
    audit: [
      ...destination.audit,
      ...importedAudit,
      ...imported.map((data) => ({
        at: mapping.preparedAt,
        by: mapping.requestedBy,
        action: "central-import",
        registerId: data.register.id,
        revision: data.register.revision,
      })),
    ].slice(-1000),
    // Existing destination previews remain valid; source test previews are never transplanted.
    previews: destination.previews,
  });
  if (Buffer.byteLength(JSON.stringify(document)) > 33554432) fail("storage-limit");
  return {
    document,
    importedHash: reviewMigrationHash(imported),
    mappingHash: reviewMigrationHash(mapping),
    targetUserIds: [...new Set([mapping.requestedBy, ...Object.values(mapping.actors)])].sort(),
    counts: {
      registers: imported.length,
      records: imported.reduce((total, data) => total + data.records.length, 0),
      endpoints: imported.reduce(
        (total, data) => total + data.records.reduce((n, r) => n + r.endpoints.length, 0),
        0,
      ),
      reports: imported.reduce((total, data) => total + (data.monitoring?.runs.length ?? 0), 0),
    },
  };
}
