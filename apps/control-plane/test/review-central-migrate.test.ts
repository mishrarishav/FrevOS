import { createHash } from "node:crypto";
import { ReviewRecordSchema, ReviewRegisterSchema } from "@frevos/contracts";
import { expect, it, vi } from "vitest";
import {
  assertCentralMachine,
  assertFreshApproval,
  centralMigrationFailure,
  centralMigrationPaths,
  centralReviewStateMetadata,
  commitCentralReviewData,
  inspectCentralDatabase,
  privateAcl,
  ReviewCentralApprovalSchema,
  ReviewCentralPlanSchema,
  runReviewCentralMigration,
  validateCentralConnections,
  verifyPlainSqlBackup,
} from "../src/review-central-migrate.js";
import {
  prepareReviewMigration,
  ReviewMigrationMappingSchema,
  reviewMigrationHash,
} from "../src/review-migration.js";
import { ReviewWorkspaceStateSchema } from "../src/review-registers.js";

// No containers, filesystem fixtures, network listeners or database connections.
const at = "2026-11-11T12:00:00.000Z";
const now = Date.parse(at);
const id = "rmi_" + "a".repeat(32);
const sha = "a".repeat(64);
const plan = ReviewCentralPlanSchema.parse({
  version: 1,
  kind: "devsetu.reviews.central-migration.v1",
  id,
  installationRoot: "E:\\FixtureRuntime",
  expectedComputerName: "FIXTURE-SERVER",
  expectedDatabase: {
    host: "127.0.0.1",
    port: 6433,
    database: "fixture_reviews",
    runtimeRole: "fixture_runtime",
  },
  sourceSha256: sha,
  mappingSha256: "b".repeat(64),
  sqlSha256: "c".repeat(64),
  createdAt: "2026-11-11T11:00:00.000Z",
  expiresAt: "2026-11-11T13:00:00.000Z",
});
const approval = ReviewCentralApprovalSchema.parse({
  version: 1,
  kind: "devsetu.reviews.central-migration-approval.v1",
  migrationId: id,
  planSha256: sha,
  planResultSha256: sha,
  sourceSha256: plan.sourceSha256,
  mappingSha256: plan.mappingSha256,
  sqlSha256: plan.sqlSha256,
  expectedComputerName: plan.expectedComputerName,
  expectedDatabase: plan.expectedDatabase,
  requestedBy: "usr_target",
  decision: "approve",
  approvalReference: "Fixture operator approval",
  approvedAt: "2026-11-11T11:59:00.000Z",
  expiresAt: "2026-11-11T12:01:00.000Z",
});
const registerId = "rr_" + "a".repeat(32);
const source = ReviewWorkspaceStateSchema.parse({
  version: 1,
  workspaceId: "ws_source",
  registers: [
    {
      register: ReviewRegisterSchema.parse({
        id: registerId,
        workspaceId: "ws_source",
        revision: 1,
        name: "Fixture review register",
        description: "",
        fields: [],
        managementOptions: ["Internal"],
        lifecycleOptions: ["Active"],
        requirementOptions: ["Required"],
        decisionOptions: ["Keep"],
        linkPolicy: {
          allowedOrigins: [],
          allowPrivate: false,
          timeoutMs: 1000,
          maxBytes: 4096,
          maxRedirects: 0,
        },
        grants: [],
        createdAt: at,
        createdBy: "usr_source",
      }),
      records: [],
    },
  ],
  audit: [],
  previews: [],
});
const mapping = ReviewMigrationMappingSchema.parse({
  version: 1,
  id,
  sourceWorkspaceId: "ws_source",
  targetWorkspaceId: "ws_target",
  registerIds: [registerId],
  actors: { usr_source: "usr_target" },
  requestedBy: "usr_target",
  preparedAt: at,
  expectedDestinationHash: null,
});
const prepared = prepareReviewMigration(source, mapping, null);

it("verifies a completed plain SQL export across chunk boundaries without claiming a restored database", async () => {
  const sql = Buffer.from(
    "--\r\n-- PostgreSQL database dump\r\n--\r\n\r\n\\restrict Fixture123\r\nSELECT 'fixture only';\r\n\r\n--\r\n-- PostgreSQL database dump complete\r\n--\r\n\r\n\\unrestrict Fixture123\r\n\r\n",
  );
  async function* chunks() {
    for (let index = 0; index < sql.length; index += 7) yield sql.subarray(index, index + 7);
  }
  await expect(verifyPlainSqlBackup(chunks(), 0)).resolves.toEqual({
    format: "plain-sql",
    verification: "export-exit/header/footer/sha256",
    restoreTested: false,
    sha256: createHash("sha256").update(sql).digest("hex"),
    bytes: sql.length,
  });
  async function* content(value: Buffer) {
    yield value;
  }
  await expect(verifyPlainSqlBackup(content(sql), 1)).rejects.toThrow(
    "database-backup-export-failed",
  );
  await expect(
    verifyPlainSqlBackup(
      content(sql.subarray(0, sql.indexOf("-- PostgreSQL database dump complete"))),
      0,
    ),
  ).rejects.toThrow("database-backup-footer-incomplete");
  await expect(
    verifyPlainSqlBackup(
      content(Buffer.concat([sql, Buffer.from("SELECT 'unexpected trailing SQL';\n")])),
      0,
    ),
  ).rejects.toThrow("database-backup-footer-incomplete");
  await expect(
    verifyPlainSqlBackup(content(Buffer.from("PGDMP" + "x".repeat(100))), 0),
  ).rejects.toThrow("database-backup-header-invalid");
});

it("bounds backup verification bytes, chunks and retained marker windows", async () => {
  async function* content(value: Buffer) {
    yield value;
  }
  await expect(verifyPlainSqlBackup(content(Buffer.alloc(101)), 0, 100)).rejects.toThrow(
    "database-backup-byte-limit",
  );
  await expect(verifyPlainSqlBackup(content(Buffer.alloc(65537)), 0)).rejects.toThrow(
    "database-backup-chunk-limit",
  );
  const start = Buffer.from("--\n-- PostgreSQL database dump\n--\n\n");
  const end = Buffer.from("\n--\n-- PostgreSQL database dump complete\n--\n\n");
  async function* large() {
    yield start;
    for (let n = 0; n < 10; n++) yield Buffer.alloc(65536, 32);
    yield end;
  }
  const evidence = await verifyPlainSqlBackup(large(), 0);
  expect(evidence.bytes).toBe(start.length + 10 * 65536 + end.length);
  expect(evidence.restoreTested).toBe(false);
});

it("returns only workspace-bound canonical review-state hashes and aggregate counts for readback", () => {
  const document = structuredClone(prepared.document);
  document.registers[0]?.records.push(
    ReviewRecordSchema.parse({
      id: "rec_" + "a".repeat(32),
      revision: 1,
      title: "Private fixture application",
      description: "",
      department: "",
      management: "Internal",
      businessOwner: "",
      spoc: "",
      technicalAssignee: "",
      lifecycle: "Active",
      requirement: "Required",
      recordedAccess: "",
      fields: {},
      endpoints: [
        {
          id: "ep_" + "a".repeat(32),
          label: "Application",
          url: "https://example.invalid/private",
          expectedText: "",
          expectedStatuses: [200],
        },
        {
          id: "ep_" + "b".repeat(32),
          label: "Diagnostic",
          url: "https://example.invalid/status",
          expectedText: "",
          expectedStatuses: [200],
        },
      ],
      updatedAt: at,
      updatedBy: "usr_target",
      provenance: [],
      assignmentHistory: [],
      reviews: [],
      checks: [],
    }),
  );
  const metadata = centralReviewStateMetadata(document, "ws_target");
  expect(metadata).toEqual({
    workspaceId: "ws_target",
    documentHash: reviewMigrationHash(document),
    registers: 1,
    records: 1,
    endpoints: 2,
    reports: 0,
  });
  expect(Object.keys(metadata).sort()).toEqual([
    "documentHash",
    "endpoints",
    "records",
    "registers",
    "reports",
    "workspaceId",
  ]);
  expect(JSON.stringify(metadata)).not.toMatch(
    /Private fixture|example\.invalid|private|diagnostic/i,
  );
  expect(() => centralReviewStateMetadata(prepared.document, "ws_other")).toThrow(
    "review-state-workspace-mismatch",
  );
  expect(() => centralReviewStateMetadata({ workspaceId: "ws_target" }, "ws_target")).toThrow();
});

type QueryResult = { rows: Record<string, unknown>[]; rowCount?: number };
function dataClient(
  options: {
    receipt?: Record<string, unknown>;
    existing?: Record<string, unknown>;
    members?: Record<string, unknown>[];
  } = {},
) {
  const query = vi.fn(async (sql: string, _values?: unknown[]): Promise<QueryResult> => {
    if (sql.startsWith("SELECT migration_id"))
      return { rows: options.receipt ? [options.receipt] : [] };
    if (sql.startsWith("SELECT revision::text"))
      return { rows: options.existing ? [options.existing] : [] };
    if (sql.startsWith("SELECT workspace_id")) return { rows: [{ workspace_id: "ws_target" }] };
    if (sql.startsWith("SELECT user_id"))
      return {
        rows: options.members ?? [
          { user_id: "usr_target", granted_scopes: ["project:read", "reviews:admin"] },
        ],
      };
    if (/^(INSERT INTO|UPDATE) frevos\.review_workspace_state/.test(sql))
      return { rows: [{ revision: "1" }] };
    return { rows: [] };
  });
  return { query, client: { query } as unknown as Parameters<typeof commitCentralReviewData>[0] };
}
const writeStatements = (query: ReturnType<typeof dataClient>["query"]) =>
  query.mock.calls.filter(([sql]) => /^(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)/.test(sql));

it("derives every artifact/result path under one normalized operator migration directory", () => {
  const directory = `${plan.installationRoot}\\operator\\reviews-migrations\\${id}`;
  const paths = centralMigrationPaths(plan, `${directory}\\plan.json`);
  const artifactPlan = ReviewCentralPlanSchema.parse({
    ...plan,
    artifactId: "rmi_" + "b".repeat(32),
  });
  expect(centralMigrationPaths(artifactPlan, paths.plan)).toEqual(paths);
  expect(() => ReviewCentralPlanSchema.parse({ ...plan, artifactId: "../other" })).toThrow();
  expect(paths.source).toBe(`${directory}\\source.json`);
  expect(paths.inspected).toBe(`${directory}\\results\\inspect-result.json`);
  expect(paths.result).toBe(`${directory}\\results\\plan-result.json`);
  expect(paths.applied).toBe(`${directory}\\results\\apply-result.json`);
  expect(paths.sql).toBe(`${directory}\\package\\migrations\\0007_review_workspace_state.sql`);
  expect(() => centralMigrationPaths(plan, "E:\\different\\plan.json")).toThrow(
    "plan-path-mismatch",
  );
  for (const installationRoot of [
    "\\\\server\\share",
    "E:\\FixtureRuntime\\..\\elsewhere",
    "E:\\unsafe\u0001",
  ])
    expect(() => centralMigrationPaths({ ...plan, installationRoot }, paths.plan)).toThrow(
      "installation-root-invalid",
    );
});

it("checks ACL rules as direct SIDs in a bounded trusted Windows process without changing access", () => {
  const native = vi.fn(() => ({ status: 0 }));
  const environment = {
    SystemRoot: "C:\\Windows",
    TEMP: "C:\\FixtureTemp",
    USERPROFILE: "C:\\Users\\Fixture",
    PSModulePath: "C:\\untrusted",
    PGPASSWORD: "fixture-only",
    PGOPTIONS: "fixture-only",
    DATABASE_URL: "fixture-only",
    MIGRATION_DATABASE_URL: "fixture-only",
    DB_PASSWORD: "fixture-only",
  };
  privateAcl(
    "E:\\private-fixture",
    native as unknown as Parameters<typeof privateAcl>[1],
    environment,
  );
  expect(native).toHaveBeenCalledOnce();
  const [executable, args, options] = native.mock.calls[0] as unknown as [
    string,
    string[],
    {
      timeout: number;
      cwd: string;
      env: Record<string, string>;
      stdio: string;
      windowsHide: boolean;
    },
  ];
  expect(executable).toBe("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
  expect(args.join(" ")).toContain(
    "GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])",
  );
  expect(args.join(" ")).not.toMatch(/\.Translate\(|Set-Acl|fixture-only/);
  expect(options).toMatchObject({
    timeout: 45000,
    cwd: "C:\\Windows\\System32",
    stdio: "ignore",
    windowsHide: true,
  });
  expect(options.env["TEMP"]).toBe(environment.TEMP);
  expect(options.env["PSModulePath"]).toBe(
    "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules",
  );
  for (const key of [
    "PGPASSWORD",
    "PGOPTIONS",
    "DATABASE_URL",
    "MIGRATION_DATABASE_URL",
    "DB_PASSWORD",
  ])
    expect(options.env).not.toHaveProperty(key);
  expect(options.env["DEVSETU_MIGRATION_PRIVATE_PATH"]).toBe("E:\\private-fixture");
});

it("fails closed and distinguishes broad ACL access, timeout and unavailable checks", () => {
  const environment = { SystemRoot: "C:\\Windows" };
  const check = (result: unknown) => () =>
    privateAcl(
      "E:\\fixture",
      vi.fn(() => result) as unknown as Parameters<typeof privateAcl>[1],
      environment,
    );
  expect(check({ status: 9 })).toThrow("private-acl-wide-access");
  expect(check({ status: null, error: { code: "ETIMEDOUT" } })).toThrow("private-acl-timeout");
  expect(check({ status: 1 })).toThrow("private-acl-unavailable");
  expect(check({ status: null, error: { code: "ENOENT" } })).toThrow("private-acl-unavailable");
  expect(() =>
    privateAcl("E:\\fixture", vi.fn() as unknown as Parameters<typeof privateAcl>[1], {}),
  ).toThrow("private-acl-unavailable");
});

it("requires the exact native computer and fresh bounded plan without allowing a remote DB target", async () => {
  expect(() => assertCentralMachine(plan, "FIXTURE-SERVER", now)).not.toThrow();
  expect(() => assertCentralMachine(plan, "fixture-server", now)).not.toThrow();
  expect(() => assertCentralMachine(plan, "OTHER-SERVER", now)).toThrow("computer-mismatch");
  expect(() => assertCentralMachine(plan, "fixture-server.example.invalid", now)).toThrow(
    "computer-mismatch",
  );
  const mismatch = new Error("review-central-migrate:computer-mismatch");
  expect(centralMigrationFailure(mismatch, "fixture-server.example.invalid")).toEqual({
    status: "failed",
    code: mismatch.message,
    observedComputerName: "fixture-server.example.invalid",
  });
  expect(centralMigrationFailure(mismatch, "unsafe\nvalue")).not.toHaveProperty(
    "observedComputerName",
  );
  expect(
    centralMigrationFailure(new Error("untrusted error with sensitive details"), "FIXTURE-SERVER"),
  ).toEqual({
    status: "failed",
    code: "review-central-migrate:operation-failed",
  });
  expect(() => assertCentralMachine(plan, "FIXTURE-SERVER", Date.parse(plan.expiresAt))).toThrow(
    "plan-stale",
  );
  expect(() =>
    assertCentralMachine(plan, "FIXTURE-SERVER", Date.parse(plan.expiresAt), true),
  ).not.toThrow();
  expect(() =>
    assertCentralMachine(
      { ...plan, expiresAt: "2026-11-13T13:00:00.000Z" },
      "FIXTURE-SERVER",
      now,
      true,
    ),
  ).toThrow("plan-stale");
  expect(() =>
    assertCentralMachine(
      { ...plan, expectedDatabase: { ...plan.expectedDatabase, host: "192.0.2.1" } },
      "FIXTURE-SERVER",
      now,
    ),
  ).toThrow("native-local-database-binding-required");
  await expect(runReviewCentralMigration([])).rejects.toThrow("usage-inspect-plan-apply-planfile");
});

it("binds both protected connections to the approved target and rejects TLS-query or role substitutions", () => {
  const runtime = {
    DATABASE_URL: "postgresql://fixture_runtime:fixture-only@127.0.0.1:6433/fixture_reviews",
  };
  const admin = {
    version: 1,
    host: "127.0.0.1",
    port: 6433,
    database: "fixture_reviews",
    username: "fixture_operator",
    password: "fixture-only",
    purpose: "Migration fixture",
  };
  expect(validateCentralConnections(plan, runtime, admin).admin.username).toBe("fixture_operator");
  // The native installer stores the cluster-admin default, not the runtime DB.
  expect(
    validateCentralConnections(plan, runtime, { ...admin, database: "postgres" }).admin.database,
  ).toBe("postgres");
  for (const DATABASE_URL of [
    runtime.DATABASE_URL + "?sslmode=disable",
    runtime.DATABASE_URL.replace("6433", "5432"),
    runtime.DATABASE_URL.replace("fixture_runtime", "fixture_operator"),
    "invalid fixture connection",
  ])
    expect(() => validateCentralConnections(plan, { DATABASE_URL }, admin)).toThrow(
      /^review-central-migrate:runtime-/,
    );
  expect(() =>
    validateCentralConnections(plan, runtime, { ...admin, username: "fixture_runtime" }),
  ).toThrow("admin-target-mismatch");
  expect(() => validateCentralConnections(plan, runtime, { ...admin, database: "other" })).toThrow(
    "admin-target-mismatch",
  );
});

it("revalidates approval freshness and all immutable bindings at the final commit boundary", () => {
  const context = { plan, planHash: sha };
  const validate = (value = approval, time = now) =>
    assertFreshApproval(value, context, sha, "usr_target", time);
  expect(() => validate()).not.toThrow();
  expect(() => validate(approval, Date.parse(approval.expiresAt))).toThrow(
    "approval-mismatch-or-stale",
  );
  for (const changed of [
    { ...approval, expectedComputerName: "OTHER-SERVER" },
    { ...approval, requestedBy: ReviewCentralApprovalSchema.shape.requestedBy.parse("usr_other") },
    { ...approval, planResultSha256: "d".repeat(64) },
    { ...approval, sqlSha256: "d".repeat(64) },
    { ...approval, expectedDatabase: { ...approval.expectedDatabase, database: "other" } },
    { ...approval, approvedAt: "2026-11-11T12:00:01.000Z" },
    { ...approval, expiresAt: "2026-11-13T12:00:00.000Z" },
  ])
    expect(() => validate(changed)).toThrow("approval-mismatch-or-stale");
});

it("inspects bounded public metadata in a read-only transaction and rolls back wrong server identity", async () => {
  function inspection(serverAddress = "127.0.0.1", failureCode?: string) {
    const release = vi.fn();
    const query = vi.fn(async (sql: string): Promise<QueryResult> => {
      if (failureCode && sql.startsWith("SELECT workspace_id,display_name"))
        throw Object.assign(new Error("Private SQL details must never appear in diagnostics"), {
          code: failureCode,
        });
      if (sql.startsWith("SELECT current_database"))
        return {
          rows: [
            {
              database: "fixture_reviews",
              server_address: serverAddress,
              server_port: 6433,
              server_version: "18.1",
            },
          ],
        };
      if (sql.startsWith("SELECT to_regclass"))
        return { rows: [{ history: "frevos_schema_migrations", state: null, receipts: null }] };
      if (sql.startsWith("SELECT version"))
        return { rows: [{ version: "0001_core.sql", sha256: sha }] };
      if (sql.startsWith("SELECT workspace_id,display_name"))
        return {
          rows: [
            { workspace_id: "ws_target", display_name: "Fixture workspace", status: "active" },
          ],
        };
      if (sql.startsWith("SELECT workspace_id,user_id"))
        return {
          rows: [
            {
              workspace_id: "ws_target",
              user_id: "usr_target",
              status: "active",
              granted_scopes: ["project:read"],
            },
          ],
        };
      return { rows: [] };
    });
    const connect = vi.fn(async () => ({ query, release }));
    return {
      query,
      release,
      pool: { connect } as unknown as Parameters<typeof inspectCentralDatabase>[0],
    };
  }
  const accepted = inspection();
  const result = await inspectCentralDatabase(accepted.pool, plan.expectedDatabase);
  expect(result.users).toEqual([
    {
      workspace_id: "ws_target",
      user_id: "usr_target",
      status: "active",
      granted_scopes: ["project:read"],
    },
  ]);
  expect(accepted.query.mock.calls[0]?.[0]).toBe("BEGIN READ ONLY");
  expect(
    accepted.query.mock.calls.find(([sql]) => sql.startsWith("SELECT current_database"))?.[0],
  ).toContain("host(inet_server_addr()) AS server_address");
  expect(accepted.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
  expect(accepted.query.mock.calls.map(([sql]) => sql).join("\n")).not.toMatch(
    /password|credentials|SELECT \*/i,
  );
  expect(accepted.release).toHaveBeenCalledOnce();
  const denied = inspection("192.0.2.10");
  await expect(inspectCentralDatabase(denied.pool, plan.expectedDatabase)).rejects.toThrow(
    "database-identity-mismatch",
  );
  expect(denied.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  expect(denied.release).toHaveBeenCalledOnce();
  const sqlFailure = inspection("127.0.0.1", "42P01");
  await expect(inspectCentralDatabase(sqlFailure.pool, plan.expectedDatabase)).rejects.toThrow(
    "review-central-migrate:database-inspection-workspaces-42p01",
  );
  expect(sqlFailure.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  const unsafeCode = inspection("127.0.0.1", "untrusted detail");
  await expect(inspectCentralDatabase(unsafeCode.pool, plan.expectedDatabase)).rejects.toThrow(
    "review-central-migrate:database-inspection-workspaces-failed",
  );
});

it("locks the configured workspace and rechecks authority immediately before saving state and receipt", async () => {
  const mock = dataClient();
  const authority = vi.fn(async () => undefined);
  const result = await commitCentralReviewData(
    mock.client,
    source,
    mapping,
    sha,
    sha,
    prepared.importedHash,
    authority,
  );
  expect(result.status).toBe("succeeded");
  expect(authority).toHaveBeenCalledTimes(3);
  expect(mock.query.mock.calls.find(([sql]) => sql.includes("pg_advisory_xact_lock"))?.[1]).toEqual(
    ["frevos/reviews/ws_target"],
  );
  expect(mock.query.mock.calls.find(([sql]) => sql.startsWith("SELECT user_id"))?.[0]).toContain(
    "FOR SHARE",
  );
  const writes = writeStatements(mock.query);
  expect(writes).toHaveLength(2);
  expect(writes[0]?.[0]).toMatch(/^INSERT INTO frevos\.review_workspace_state/);
  expect(writes[1]?.[1]).toEqual(["ws_target", id, sha, sha, prepared.importedHash, "usr_target"]);
  expect(JSON.parse(String(writes[0]?.[1]?.[1])).registers[0].register.createdBy).toBe(
    "usr_target",
  );
});

it("accepts only the exact existing migration receipt without reading or rewriting later destination state", async () => {
  const receipt = {
    migration_id: id,
    imported_sha256: prepared.importedHash,
    requested_by: "usr_target",
  };
  const previous = dataClient({ receipt });
  const authority = vi.fn(async () => undefined);
  await expect(
    commitCentralReviewData(
      previous.client,
      { intentionally: "not used on idempotent retry" },
      mapping,
      sha,
      sha,
      prepared.importedHash,
      authority,
    ),
  ).resolves.toMatchObject({ status: "already-succeeded", migrationId: id });
  expect(writeStatements(previous.query)).toHaveLength(0);
  expect(previous.query.mock.calls.some(([sql]) => sql.includes("SELECT revision"))).toBe(false);
  for (const changed of [
    { ...receipt, migration_id: "rmi_" + "b".repeat(32) },
    { ...receipt, requested_by: "usr_other" },
    { ...receipt, imported_sha256: "d".repeat(64) },
  ]) {
    const rejected = dataClient({ receipt: changed });
    await expect(
      commitCentralReviewData(
        rejected.client,
        source,
        mapping,
        sha,
        sha,
        prepared.importedHash,
        authority,
      ),
    ).rejects.toThrow("receipt-identity-mismatch");
    expect(writeStatements(rejected.query)).toHaveLength(0);
  }
});

it("rejects changed source, inactive membership and late approval expiry before the affected write", async () => {
  const changed = dataClient();
  await expect(
    commitCentralReviewData(
      changed.client,
      source,
      mapping,
      sha,
      sha,
      "d".repeat(64),
      async () => undefined,
    ),
  ).rejects.toThrow("planned-import-changed");
  expect(writeStatements(changed.query)).toHaveLength(0);
  const inactive = dataClient({ members: [] });
  await expect(
    commitCentralReviewData(
      inactive.client,
      source,
      mapping,
      sha,
      sha,
      prepared.importedHash,
      async () => undefined,
    ),
  ).rejects.toThrow("target-actor-membership-invalid");
  expect(writeStatements(inactive.query)).toHaveLength(0);
  const expiring = dataClient();
  let checks = 0;
  await expect(
    commitCentralReviewData(
      expiring.client,
      source,
      mapping,
      sha,
      sha,
      prepared.importedHash,
      async () => {
        checks += 1;
        assertFreshApproval(
          approval,
          { plan, planHash: sha },
          sha,
          "usr_target",
          checks === 3 ? Date.parse(approval.expiresAt) : now,
        );
      },
    ),
  ).rejects.toThrow("approval-mismatch-or-stale");
  // The caller's APP-role transaction rolls back its earlier state write. No receipt is inserted.
  expect(
    writeStatements(expiring.query).some(([sql]) => sql.includes("review_migration_receipts")),
  ).toBe(false);
  expect(checks).toBe(3);
});
