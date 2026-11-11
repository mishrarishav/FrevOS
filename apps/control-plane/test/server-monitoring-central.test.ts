import { createHash } from "node:crypto";
import {
  ReviewRecordSchema,
  ReviewRegisterSchema,
  ServerMonitorPolicySchema,
} from "@frevos/contracts";
import type { PoolClient } from "pg";
import { expect, it, vi } from "vitest";
import { reviewMigrationHash } from "../src/review-migration.js";
import { ReviewWorkspaceStateSchema } from "../src/review-registers.js";
import {
  applyCentralMonitoringSchema,
  assertCentralMonitoringApproval,
  centralMonitoringFailure,
  commitCentralMonitoring,
  monitoringCentralPaths,
  prepareCentralMonitoring,
  ServerMonitoringCentralPlanSchema,
} from "../src/server-monitoring-central.js";
import { serverMonitorTargetId } from "../src/server-monitoring.js";

// Pure planning and recording SQL doubles only; no databases, native processes or files.
const at = "2030-01-01T00:00:00.000Z",
  ws = "ws_fixture",
  user = "usr_owner",
  id = `smb_${"a".repeat(32)}`,
  registerId = `rr_${"b".repeat(32)}`;
const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const plan = ServerMonitoringCentralPlanSchema.parse({
  version: 1,
  kind: "devsetu.server-monitoring.central-bootstrap.v1",
  id,
  installationRoot: "E:\\FixtureRuntime",
  expectedComputerName: "FIXTURE-SERVER",
  expectedDatabase: {
    host: "127.0.0.1",
    port: 6433,
    database: "fixture",
    runtimeRole: "fixture_runtime",
  },
  workspaceId: ws,
  requestedBy: user,
  enrollmentSha256: "a".repeat(64),
  sqlSha256: "b".repeat(64),
  policy: ServerMonitorPolicySchema.parse({ enabled: true }),
  createdAt: at,
  expiresAt: "2030-01-01T01:00:00.000Z",
});
function source() {
  const register = ReviewRegisterSchema.parse({
    id: registerId,
    workspaceId: ws,
    revision: 1,
    name: "Applications",
    description: "",
    fields: [],
    managementOptions: ["Managed", "Vendor"],
    lifecycleOptions: ["Active"],
    requirementOptions: ["Required"],
    decisionOptions: ["Keep"],
    grants: [],
    createdAt: at,
    createdBy: user,
    linkPolicy: {
      allowedOrigins: [],
      allowPrivate: false,
      timeoutMs: 1000,
      maxBytes: 4096,
      maxRedirects: 0,
    },
  });
  const record = (index: number, hosting: string, management = "Managed") =>
    ReviewRecordSchema.parse({
      id: `rec_${index.toString(16).padStart(32, "0")}`,
      revision: 1,
      title: `App ${index}`,
      description: "",
      department: "",
      management,
      businessOwner: "",
      spoc: "",
      technicalAssignee: "",
      lifecycle: "",
      requirement: "",
      recordedAccess: "",
      fields: { hosting },
      endpoints: [],
      updatedAt: at,
      updatedBy: user,
      provenance: [],
      assignmentHistory: [],
      reviews: [],
      checks: [],
    });
  return ReviewWorkspaceStateSchema.parse({
    version: 1,
    workspaceId: ws,
    registers: [
      {
        register,
        records: [
          record(1, "10.42.1.4"),
          record(2, "10.42.1.5"),
          record(3, "10.42.1.4"),
          record(4, "10.42.1.20", "Vendor"),
        ],
      },
    ],
    audit: [],
    previews: [],
  });
}
function enrollment() {
  return {
    version: 1,
    workspaceId: ws,
    enabled: true,
    queueRoot: "E:\\FixtureRuntime\\monitor-queue",
    timeoutMs: 60000,
    concurrency: 2,
    sourcePolicies: [{ registerId, managementValues: ["Managed"], hostingField: "hosting" }],
    targets: [
      {
        id: serverMonitorTargetId(ws, "10.42.1.4", 5985, "local"),
        address: "10.42.1.4",
        port: 5985,
        transport: "local",
        credentialProfile: "monitor-account",
      },
      {
        id: serverMonitorTargetId(ws, "10.42.1.5", 5985, "winrm-http"),
        address: "10.42.1.5",
        port: 5985,
        transport: "winrm-http",
        credentialProfile: "monitor-account",
      },
    ],
  };
}
const authority = async () => ({ active: true, administrator: true });

it("builds a deterministic exact-enrollment seed with actual source references and no telemetry", async () => {
  const reviews = source(),
    before = reviewMigrationHash(reviews);
  const prepared = await prepareCentralMonitoring(plan, enrollment(), reviews, authority);
  const repeated = await prepareCentralMonitoring(plan, enrollment(), reviews, authority);
  expect(prepared.documentSha256).toBe(repeated.documentSha256);
  expect(prepared.counts).toEqual({
    targets: 2,
    sourceReferences: 3,
    excludedRecords: 1,
    localTargets: 1,
  });
  expect(
    prepared.document.targets.every(
      (target) =>
        target.history.length === 0 &&
        target.latest === null &&
        target.access.status === "unverified",
    ),
  ).toBe(true);
  expect(prepared.document.targets[0]?.sourceRefs).toHaveLength(2);
  expect(prepared.document.policy.enabled).toBe(true);
  expect(reviewMigrationHash(reviews)).toBe(before);
  expect(JSON.stringify(prepared.document)).not.toContain("10.42.1.20");
});
it("rejects inactive or non-administrator actors and foreign workspaces", async () => {
  await expect(
    prepareCentralMonitoring(plan, enrollment(), source(), async () => ({
      active: false,
      administrator: true,
    })),
  ).rejects.toThrow("requester-not-administrator");
  await expect(
    prepareCentralMonitoring(plan, enrollment(), source(), async () => ({
      active: true,
      administrator: false,
    })),
  ).rejects.toThrow("requester-not-administrator");
  await expect(
    prepareCentralMonitoring(
      { ...plan, workspaceId: "ws_foreign" },
      enrollment(),
      source(),
      authority,
    ),
  ).rejects.toThrow("enrollment-workspace-mismatch");
});
it("rejects forged IDs, duplicate machines and enrolled servers lacking authorized source evidence", async () => {
  const forged = enrollment();
  forged.targets[0]!.id = `srv_${"c".repeat(32)}`;
  await expect(prepareCentralMonitoring(plan, forged, source(), authority)).rejects.toThrow(
    "target-identity-mismatch",
  );
  const duplicate = enrollment();
  duplicate.targets.push({
    ...duplicate.targets[0]!,
    id: serverMonitorTargetId(ws, "10.42.1.4", 5986, "winrm-https"),
    transport: "winrm-https",
    port: 5986,
  });
  await expect(prepareCentralMonitoring(plan, duplicate, source(), authority)).rejects.toThrow(
    "duplicate-physical-target",
  );
  const extra = enrollment();
  extra.targets.push({
    ...extra.targets[1]!,
    id: serverMonitorTargetId(ws, "10.42.1.6", 5985, "winrm-http"),
    address: "10.42.1.6",
  });
  await expect(prepareCentralMonitoring(plan, extra, source(), authority)).rejects.toThrow(
    "enrollment-source-coverage-mismatch",
  );
});
it("binds protected operator paths and an explicit bounded plan approval", () => {
  const path = `E:\\FixtureRuntime\\operator\\server-monitoring-migrations\\${id}\\plan.json`;
  expect(monitoringCentralPaths(plan, path).configuration).toBe(
    "E:\\FixtureRuntime\\config\\server-monitoring.json",
  );
  expect(() => monitoringCentralPaths(plan, "E:\\different\\plan.json")).toThrow(
    "plan-path-mismatch",
  );
  expect(() =>
    monitoringCentralPaths({ ...plan, installationRoot: "E:\\FixtureRuntime\\..\\Other" }, path),
  ).toThrow("installation-root-invalid");
  const approve = {
    version: 1,
    kind: "devsetu.server-monitoring.central-bootstrap-approval.v1",
    id,
    planSha256: "a".repeat(64),
    planResultSha256: "b".repeat(64),
    requestedBy: user,
    decision: "approve",
    approvalReference: "Owner task authorization",
    approvedAt: at,
    expiresAt: "2030-01-01T00:10:00.000Z",
  };
  expect(
    assertCentralMonitoringApproval(approve, plan, "a".repeat(64), "b".repeat(64), Date.parse(at)),
  ).toEqual(approve);
  expect(() =>
    assertCentralMonitoringApproval(
      { ...approve, requestedBy: "usr_other" },
      plan,
      "a".repeat(64),
      "b".repeat(64),
      Date.parse(at),
    ),
  ).toThrow("approval-mismatch-or-stale");
  expect(() =>
    assertCentralMonitoringApproval(
      approve,
      plan,
      "a".repeat(64),
      "b".repeat(64),
      Date.parse("2030-01-01T00:11:00.000Z"),
    ),
  ).toThrow("approval-mismatch-or-stale");
});

function schemaClient(options: { tracked?: string; untracked?: boolean; unsafe?: boolean } = {}) {
  const calls: { sql: string; values: unknown[] }[] = [];
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    calls.push({ sql, values });
    if (sql.includes("FROM pg_roles"))
      return {
        rows: [
          { rolname: "frevos_owner", rolsuper: false, rolbypassrls: false },
          { rolname: "frevos_app", rolsuper: false, rolbypassrls: false },
        ],
      };
    if (sql.startsWith("SELECT sha256"))
      return { rows: options.tracked ? [{ sha256: options.tracked }] : [] };
    if (sql.includes("to_regclass"))
      return {
        rows: [{ monitoring: options.untracked ? "frevos.server_monitoring_state" : null }],
      };
    if (sql.includes("FROM pg_class"))
      return {
        rows: [
          { relrowsecurity: true, relforcerowsecurity: !options.unsafe, owner: "frevos_owner" },
        ],
      };
    return { rows: [] };
  });
  return { client: { query } as unknown as Pick<PoolClient, "query">, calls };
}
it("applies only the hash-bound migration8 and validates forced RLS without altering roles or Reviews", async () => {
  const sql = Buffer.from(
    "SET LOCAL ROLE frevos_owner; CREATE TABLE frevos.server_monitoring_state(dummy text); RESET ROLE;",
  );
  const f = schemaClient();
  expect(await applyCentralMonitoringSchema(f.client, sql, digest(sql))).toBe("applied");
  expect(f.calls.some((call) => call.sql === sql.toString())).toBe(true);
  expect(f.calls.find((call) => call.sql.startsWith("INSERT INTO public"))?.values).toEqual([
    "0008_server_monitoring_state.sql",
    digest(sql),
  ]);
  expect(
    f.calls.some((call) => /CREATE ROLE|ALTER ROLE|UPDATE frevos.review_/i.test(call.sql)),
  ).toBe(false);
  const prior = schemaClient({ tracked: digest(sql) });
  expect(await applyCentralMonitoringSchema(prior.client, sql, digest(sql))).toBe(
    "already-applied",
  );
  expect(prior.calls.some((call) => call.sql === sql.toString())).toBe(false);
  await expect(
    applyCentralMonitoringSchema(
      schemaClient({ tracked: "a".repeat(64) }).client,
      sql,
      digest(sql),
    ),
  ).rejects.toThrow("migration-checksum-mismatch");
  await expect(
    applyCentralMonitoringSchema(schemaClient({ untracked: true }).client, sql, digest(sql)),
  ).rejects.toThrow("untracked-monitoring-schema");
  await expect(
    applyCentralMonitoringSchema(schemaClient({ unsafe: true }).client, sql, digest(sql)),
  ).rejects.toThrow("monitoring-schema-verification-failed");
});
it("performs a new-only workspace-scoped insert after locking and rechecking source/owner authority", async () => {
  const reviews = source(),
    prepared = await prepareCentralMonitoring(plan, enrollment(), reviews, authority),
    queries: string[] = [];
  let existing = false,
    active = true;
  const client = {
    query: async (sql: string) => {
      queries.push(sql);
      if (sql.startsWith("SELECT workspace_id")) return { rows: [{}] };
      if (sql.startsWith("SELECT granted_scopes"))
        return { rows: active ? [{ granted_scopes: ["project:read"] }] : [] };
      if (sql.startsWith("SELECT document FROM frevos.review_"))
        return { rows: [{ document: reviews }] };
      if (sql.startsWith("SELECT document FROM frevos.server_"))
        return { rows: existing ? [{}] : [] };
      if (sql.startsWith("INSERT")) return { rows: [{ revision: 1 }] };
      return { rows: [] };
    },
  } as unknown as Pick<PoolClient, "query">;
  const check = vi.fn(async () => {});
  const result = await commitCentralMonitoring(
    client,
    plan,
    prepared.document,
    reviewMigrationHash(reviews),
    check,
  );
  expect(result.targets).toBe(2);
  expect(check).toHaveBeenCalledTimes(2);
  expect(queries.some((query) => query.endsWith("FOR SHARE"))).toBe(true);
  expect(queries.some((query) => query.endsWith("FOR UPDATE"))).toBe(true);
  expect(queries.filter((query) => query.startsWith("INSERT"))).toHaveLength(1);
  existing = true;
  await expect(
    commitCentralMonitoring(client, plan, prepared.document, reviewMigrationHash(reviews), check),
  ).rejects.toThrow("monitoring-state-already-exists");
  existing = false;
  active = false;
  await expect(
    commitCentralMonitoring(client, plan, prepared.document, reviewMigrationHash(reviews), check),
  ).rejects.toThrow("requester-membership-invalid");
  active = true;
  await expect(
    commitCentralMonitoring(client, plan, prepared.document, "a".repeat(64), check),
  ).rejects.toThrow("review-state-changed");
});
it("never prints raw database, credential, registry or filesystem error details", () => {
  expect(centralMonitoringFailure(new Error("PGPASSWORD=secret; host=private"))).toEqual({
    status: "failed",
    code: "server-monitoring-central:operation-failed",
  });
  expect(
    centralMonitoringFailure(new Error("server-monitoring-central:review-state-changed")).code,
  ).toBe("server-monitoring-central:review-state-changed");
});
