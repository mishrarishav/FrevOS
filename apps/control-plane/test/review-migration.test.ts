import {
  type ReviewCheckResult,
  ReviewRecordInputSchema,
  ReviewRecordSchema,
  ReviewRegisterSchema,
} from "@frevos/contracts";
import { expect, it } from "vitest";
import { prepareReviewMigration, reviewMigrationHash } from "../src/review-migration.js";
import { ReviewWorkspaceStateSchema } from "../src/review-registers.js";

const selected = "rr_" + "a".repeat(32),
  synthetic = "rr_" + "b".repeat(32),
  existing = "rr_" + "c".repeat(32),
  recordId = "rec_" + "a".repeat(32),
  endpointId = "ep_" + "a".repeat(32);
const at = "2026-11-10T12:00:00.000Z",
  preparedAt = "2026-11-11T12:00:00.000Z";
function register(id = selected, workspaceId = "ws_source", createdBy = "usr_owner") {
  return ReviewRegisterSchema.parse({
    id,
    workspaceId,
    revision: 5,
    name: "Configured application reviews",
    description: "Business content",
    fields: [
      {
        key: "browserOutcome",
        label: "Browser observation",
        type: "text",
        required: false,
        options: [],
      },
    ],
    managementOptions: ["Internal", "Partner"],
    lifecycleOptions: ["Active"],
    requirementOptions: ["Required"],
    decisionOptions: ["Keep", "Review"],
    linkPolicy: {
      allowedOrigins: ["https://example.invalid"],
      allowPrivate: false,
      timeoutMs: 1000,
      maxBytes: 4096,
      maxRedirects: 1,
    },
    grants: [
      { userId: "usr_reader", role: "viewer" },
      { userId: "usr_reviewer", role: "reviewer" },
    ],
    createdAt: at,
    createdBy,
  });
}
const measured: ReviewCheckResult = {
  status: "healthy",
  httpStatus: 200,
  finalUrl: "https://example.invalid/app",
  message: "Expected application matched",
  title: "Application",
  elapsedMs: 5,
  checkedAt: at,
  tls: [
    {
      url: "https://example.invalid/app",
      hostname: "example.invalid",
      port: 443,
      verification: "verified",
      validFrom: "2026-01-01T00:00:00.000Z",
      validTo: "2026-12-01T00:00:00.000Z",
      subject: "Example",
      issuer: "Example issuer",
      fingerprint256: "AA:BB",
      errorCode: null,
      observedAt: at,
    },
  ],
};
function input() {
  return ReviewRecordInputSchema.parse({
    title: "Application",
    description: "Preserve this text",
    department: "Operations",
    management: "Internal",
    businessOwner: "Person label, not an account ID",
    spoc: "Business SPOC",
    technicalAssignee: "Assigned engineer",
    lifecycle: "Active",
    requirement: "Required",
    recordedAccess: "Accessible",
    fields: { browserOutcome: "Actual page visible" },
    endpoints: [
      {
        id: endpointId,
        label: "Application",
        url: "https://example.invalid/app",
        expectedText: "Application",
        expectedStatuses: [200],
      },
    ],
  });
}
function record() {
  return ReviewRecordSchema.parse({
    ...input(),
    id: recordId,
    revision: 7,
    updatedAt: at,
    updatedBy: "usr_owner",
    provenance: [
      {
        sourceHash: "a".repeat(64),
        fileName: "applications.xlsx",
        sheet: "Applications",
        row: 2,
        cells: { businessOwner: "E2", title: "B2" },
        importedAt: at,
        importedBy: "usr_owner",
      },
    ],
    assignmentHistory: [
      {
        businessOwner: "Previous owner",
        spoc: "Previous SPOC",
        technicalAssignee: "Previous engineer",
        at,
        by: "usr_past",
      },
    ],
    reviews: [
      {
        id: "rev_" + "a".repeat(32),
        decision: "Keep",
        note: "Original review",
        nextAction: "Confirm assignment",
        dueDate: "2026-12-01",
        at,
        by: "usr_reviewer",
      },
    ],
    checks: [{ ...measured, endpointId, by: "usr_owner", current: true }],
  });
}
function preview(registerId = selected, workspaceId = "ws_source", actor = "usr_owner") {
  return {
    actor,
    workspaceId,
    preview: {
      id: "rip_" + "a".repeat(32),
      registerId,
      revision: 5,
      sourceHash: "a".repeat(64),
      fileName: "fixture.xlsx",
      sheet: "Applications",
      expiresAt: "2026-11-12T00:00:00.000Z",
      rows: [
        { row: 2, record: input(), candidateRecordId: null, defaultAction: "create", issues: [] },
      ],
    },
    mapping: { title: "A" },
    blockedRows: [],
  };
}
function source() {
  const item = {
    recordId,
    recordTitle: "Application",
    endpointId,
    endpointLabel: "Application",
    url: "https://example.invalid/app",
    status: "completed",
    result: measured,
    message: "Measured",
  };
  return ReviewWorkspaceStateSchema.parse({
    version: 1,
    workspaceId: "ws_source",
    registers: [
      {
        register: register(),
        records: [record()],
        monitoring: {
          schedule: {
            enabled: true,
            weekdays: [3],
            time: "09:00",
            timeZone: "Asia/Kolkata",
            accessibleValues: ["Accessible"],
            sslWarningDays: [10, 15],
          },
          scheduleRevision: 3,
          configuredBy: "usr_owner",
          configuredAt: at,
          nextRunAt: "2026-11-18T03:30:00.000Z",
          runs: [
            {
              id: "rrun_" + "a".repeat(32),
              trigger: "manual",
              occurrenceKey: null,
              scheduledFor: null,
              startedAt: at,
              finishedAt: at,
              status: "completed",
              requestedBy: "usr_reviewer",
              scheduleRevision: 3,
              eligibleRecords: 1,
              skippedRecords: 0,
              skippedEndpoints: 0,
              message: "Original report",
              items: [item],
            },
            {
              id: "rrun_" + "b".repeat(32),
              trigger: "scheduled",
              occurrenceKey: "original-slot",
              scheduledFor: at,
              startedAt: at,
              finishedAt: null,
              status: "running",
              requestedBy: "usr_owner",
              scheduleRevision: 3,
              eligibleRecords: 1,
              skippedRecords: 0,
              skippedEndpoints: 0,
              message: "In progress",
              items: [
                item,
                { ...item, status: "running", result: measured },
                { ...item, status: "pending", result: null },
              ],
            },
          ],
          alerts: [
            {
              id: "ral_" + "a".repeat(32),
              kind: "ssl-expiring",
              recordId,
              endpointId,
              title: "Certificate reminder",
              message: "Retained observation",
              createdAt: at,
              observedAt: at,
              expiresAt: "2026-12-01T00:00:00.000Z",
              thresholdDays: 15,
              resolvedAt: null,
              readAt: null,
            },
          ],
          reads: [{ alertId: "ral_" + "a".repeat(32), userId: "usr_reader", at }],
          alertKeys: [{ id: "ral_" + "a".repeat(32), key: "a".repeat(64) }],
          bindings: [
            {
              runId: "rrun_" + "b".repeat(32),
              policyHash: "a".repeat(64),
              truncated: false,
              items: ["a".repeat(64)],
            },
          ],
          lease: {
            owner: "rworker_" + "a".repeat(32),
            fence: 5,
            expiresAt: "2026-11-12T00:00:00.000Z",
          },
        },
      },
      { register: { ...register(synthetic), createdBy: "usr_synthetic", grants: [] }, records: [] },
    ],
    audit: [
      { at, by: "usr_owner", action: "save-record", registerId: selected, recordId, revision: 5 },
      { at, by: "usr_synthetic", action: "save-register", registerId: synthetic, revision: 1 },
    ],
    previews: [preview()],
  });
}
function mapping() {
  return {
    version: 1,
    id: "rmi_" + "a".repeat(32),
    sourceWorkspaceId: "ws_source",
    targetWorkspaceId: "ws_target",
    registerIds: [selected],
    actors: {
      usr_owner: "usr_live_owner",
      usr_reader: "usr_live_reader",
      usr_reviewer: "usr_live_reviewer",
      usr_past: "usr_live_past",
    },
    requestedBy: "usr_operator",
    preparedAt,
    expectedDestinationHash: null as string | null,
  };
}
function destination() {
  return ReviewWorkspaceStateSchema.parse({
    version: 1,
    workspaceId: "ws_target",
    registers: [
      { register: { ...register(existing, "ws_target", "usr_existing"), grants: [] }, records: [] },
    ],
    audit: [],
    previews: [preview(existing, "ws_target", "usr_existing")],
  });
}

it("preserves selected business/evidence content, explicitly maps every actor and excludes synthetic registers", () => {
  const original = source(),
    before = structuredClone(original),
    result = prepareReviewMigration(original, mapping(), null),
    data = result.document.registers[0]!,
    saved = data.records[0]!;
  expect(result.counts).toEqual({ registers: 1, records: 1, endpoints: 1, reports: 2 });
  expect(result.document.workspaceId).toBe("ws_target");
  expect(data.register.workspaceId).toBe("ws_target");
  expect(data.register.createdBy).toBe("usr_live_owner");
  expect(result.document.registers.some((data) => data.register.id === synthetic)).toBe(false);
  expect(saved.fields).toEqual(before.registers[0]!.records[0]!.fields);
  expect(saved.businessOwner).toBe(before.registers[0]!.records[0]!.businessOwner);
  expect(saved.endpoints).toEqual(before.registers[0]!.records[0]!.endpoints);
  expect(saved.description).toBe("Preserve this text");
  expect(saved.updatedBy).toBe("usr_live_owner");
  expect(saved.provenance).toEqual([
    { ...before.registers[0]!.records[0]!.provenance[0], importedBy: "usr_live_owner" },
  ]);
  expect(saved.assignmentHistory[0]!.by).toBe("usr_live_past");
  expect(saved.reviews[0]).toEqual({
    ...before.registers[0]!.records[0]!.reviews[0],
    by: "usr_live_reviewer",
  });
  expect(saved.checks[0]).toEqual({
    ...before.registers[0]!.records[0]!.checks[0],
    by: "usr_live_owner",
  });
  expect(data.register.grants).toEqual([
    { userId: "usr_live_reader", role: "viewer" },
    { userId: "usr_live_reviewer", role: "reviewer" },
  ]);
  expect(data.monitoring!.configuredBy).toBe("usr_live_owner");
  expect(data.monitoring!.reads[0]!.userId).toBe("usr_live_reader");
  expect(data.monitoring!.runs[0]!.requestedBy).toBe("usr_live_reviewer");
  expect(result.document.audit.every((entry) => entry.by !== "usr_synthetic")).toBe(true);
  expect(result.document.audit.at(-1)!.by).toBe("usr_operator");
  expect(original).toEqual(before);
});
it("pauses automatic work, removes runtime ownership/previews and never fabricates results for interrupted jobs", () => {
  const before = source(),
    result = prepareReviewMigration(before, mapping(), null),
    monitor = result.document.registers[0]!.monitoring!;
  expect(monitor.schedule!.enabled).toBe(false);
  expect(monitor.lease).toBeNull();
  expect(monitor.bindings).toEqual([]);
  expect(monitor.nextRunAt).toBeNull();
  expect(result.document.previews).toEqual([]);
  expect(monitor.runs[0]).toEqual({
    ...before.registers[0]!.monitoring!.runs[0],
    requestedBy: "usr_live_reviewer",
  });
  const interrupted = monitor.runs[1]!;
  expect(interrupted.status).toBe("interrupted");
  expect(interrupted.finishedAt).toBe(preparedAt);
  expect(interrupted.items[0]!.result).toEqual(measured);
  expect(
    interrupted.items
      .slice(1)
      .every((item) => item.status === "interrupted" && item.result === null),
  ).toBe(true);
  expect(interrupted.message).toContain("not replayed");
});
it("keeps existing destination content/previews and does not grant access merely because an actor was mapped", () => {
  const input = source();
  input.registers[0]!.register.grants = [];
  const existing = destination(),
    before = structuredClone(existing),
    map = { ...mapping(), expectedDestinationHash: reviewMigrationHash(existing) },
    result = prepareReviewMigration(input, map, existing);
  expect(result.document.registers[0]).toEqual(before.registers[0]);
  expect(result.document.previews).toEqual(before.previews);
  expect(result.document.registers[1]!.register.grants).toEqual([]);
  expect(existing).toEqual(before);
  expect(result.targetUserIds).toEqual([
    "usr_live_owner",
    "usr_live_past",
    "usr_live_reader",
    "usr_live_reviewer",
    "usr_operator",
  ]);
});
it("rejects destination conflicts and stale hashes before changing either input", () => {
  const original = source(),
    target = destination(),
    before = structuredClone(target);
  expect(() => prepareReviewMigration(original, mapping(), target)).toThrow("destination-changed");
  target.registers.push({
    ...original.registers[0]!,
    register: { ...original.registers[0]!.register, workspaceId: target.workspaceId },
  });
  const map = { ...mapping(), expectedDestinationHash: reviewMigrationHash(target) };
  expect(() => prepareReviewMigration(original, map, target)).toThrow("register-already-exists");
  expect(before.registers[0]).toEqual(target.registers[0]);
  expect(original.registers[0]!.register.workspaceId).toBe("ws_source");
});
it("requires complete actor mappings and rejects grant collisions instead of widening roles", () => {
  const incomplete = {
    ...mapping(),
    actors: {
      usr_owner: "usr_live_owner",
      usr_reader: "usr_live_reader",
      usr_reviewer: "usr_live_reviewer",
    },
  };
  expect(() => prepareReviewMigration(source(), incomplete, null)).toThrow(
    "actor-mapping-required",
  );
  const colliding = mapping();
  colliding.actors.usr_reviewer = colliding.actors.usr_reader;
  expect(() => prepareReviewMigration(source(), colliding, null)).toThrow(
    "grant-mapping-collision",
  );
});
it("rejects mixed workspace scopes in source and destination rather than silently rewriting them", () => {
  const mixed = source();
  mixed.registers[0]!.register.workspaceId = "ws_foreign" as typeof mixed.workspaceId;
  expect(() => prepareReviewMigration(mixed, mapping(), null)).toThrow("nested-workspace-mismatch");
  const target = destination();
  target.registers[0]!.register.workspaceId = "ws_foreign" as typeof target.workspaceId;
  expect(() =>
    prepareReviewMigration(
      source(),
      { ...mapping(), expectedDestinationHash: reviewMigrationHash(target) },
      target,
    ),
  ).toThrow("nested-workspace-mismatch");
});
it("produces stable canonical hashes across object-key ordering and changes them when evidence changes", () => {
  const original = source(),
    map = mapping(),
    first = prepareReviewMigration(original, map, null),
    reordered = JSON.parse(JSON.stringify(original));
  reordered.registers[0].records[0].fields = Object.fromEntries(
    Object.entries(reordered.registers[0].records[0].fields).reverse(),
  );
  const second = prepareReviewMigration(
    reordered,
    { ...map, actors: Object.fromEntries(Object.entries(map.actors).reverse()) },
    null,
  );
  expect(second.importedHash).toBe(first.importedHash);
  expect(second.mappingHash).toBe(first.mappingHash);
  expect(reviewMigrationHash({ a: { x: 1, y: 2 }, b: 3 })).toBe(
    reviewMigrationHash({ b: 3, a: { y: 2, x: 1 } }),
  );
  reordered.registers[0].records[0].fields.browserOutcome = "Changed evidence";
  expect(prepareReviewMigration(reordered, map, null).importedHash).not.toBe(first.importedHash);
});
