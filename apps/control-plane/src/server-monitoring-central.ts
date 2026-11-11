import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, open, readFile } from "node:fs/promises";
import { hostname } from "node:os";
import { resolve, win32 } from "node:path";
import { pathToFileURL } from "node:url";
import { ServerMonitorPolicySchema, UserIdSchema, WorkspaceIdSchema } from "@frevos/contracts";
import type { PoolClient } from "pg";
import { z } from "zod";
import {
  createDatabasePool,
  verifyApplicationRole,
  withApplicationTransaction,
} from "./database.js";
import { DiscoveryAccessPolicySchema, isDiscoveryAdministrator } from "./discovery-access.js";
import { WorkspaceRepository } from "./repositories.js";
import { reviewAuthority } from "./review-authority.js";
import {
  assertCentralMachine,
  inspectCentralDatabase,
  privateAcl,
  ReviewCentralPlanSchema,
  validateCentralConnections,
  verifyPlainSqlBackup,
  type ReviewCentralPlan,
} from "./review-central-migrate.js";
import { reviewMigrationHash } from "./review-migration.js";
import { ReviewWorkspaceStateSchema } from "./review-registers.js";
import {
  ServerMonitoringDocumentSchema,
  ServerMonitoringService,
  serverMonitorTargetId,
  type ServerMonitoringStore,
} from "./server-monitoring.js";
import {
  ServerMonitoringRuntimeSchema,
  serverMonitoringTargetAllowed,
} from "./server-monitoring-runtime.js";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const sqlName = "0008_server_monitoring_state.sql";
const policyEntry = "deployment/servix/DiscoveryAccessPolicy.json";
const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
function fail(code: string): never {
  throw new Error(`server-monitoring-central:${code}`);
}
function json(bytes: Buffer): unknown {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("invalid-json");
  }
}
export const ServerMonitoringCentralPlanSchema = z
  .object({
    version: z.literal(1),
    kind: z.literal("devsetu.server-monitoring.central-bootstrap.v1"),
    id: z.string().regex(/^smb_[a-f0-9]{32}$/),
    installationRoot: z.string().min(3).max(200),
    expectedComputerName: z.string().regex(/^[A-Za-z0-9-]{1,63}$/),
    expectedDatabase: ReviewCentralPlanSchema.shape.expectedDatabase,
    workspaceId: WorkspaceIdSchema,
    requestedBy: UserIdSchema,
    enrollmentSha256: digest,
    sqlSha256: digest,
    expectedReviewSha256: digest.optional(),
    policy: ServerMonitorPolicySchema,
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
  })
  .strict();
export type ServerMonitoringCentralPlan = z.infer<typeof ServerMonitoringCentralPlanSchema>;
export const ServerMonitoringCentralApprovalSchema = z
  .object({
    version: z.literal(1),
    kind: z.literal("devsetu.server-monitoring.central-bootstrap-approval.v1"),
    id: z.string().regex(/^smb_[a-f0-9]{32}$/),
    planSha256: digest,
    planResultSha256: digest,
    requestedBy: UserIdSchema,
    decision: z.literal("approve"),
    approvalReference: z.string().trim().min(1).max(1000),
    approvedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
  })
  .strict();
function reviewBinding(plan: ServerMonitoringCentralPlan): ReviewCentralPlan {
  return {
    version: 1,
    kind: "devsetu.reviews.central-migration.v1",
    id: `rmi_${plan.id.slice(4)}`,
    installationRoot: plan.installationRoot,
    expectedComputerName: plan.expectedComputerName,
    expectedDatabase: plan.expectedDatabase,
    createdAt: plan.createdAt,
    expiresAt: plan.expiresAt,
  };
}
export function monitoringCentralPaths(plan: ServerMonitoringCentralPlan, planFile: string) {
  if (
    !/^[A-Za-z]:\\/.test(plan.installationRoot) ||
    win32.normalize(plan.installationRoot) !== plan.installationRoot ||
    [...plan.installationRoot].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    fail("installation-root-invalid");
  const base = win32.join(
    plan.installationRoot,
    "operator",
    "server-monitoring-migrations",
    plan.id,
  );
  const paths = {
    base,
    plan: win32.join(base, "plan.json"),
    enrollment: win32.join(base, "enrollment.json"),
    sql: win32.join(base, "package", "migrations", sqlName),
    inspected: win32.join(base, "results", "inspect-result.json"),
    planned: win32.join(base, "results", "plan-result.json"),
    applied: win32.join(base, "results", "apply-result.json"),
    approval: win32.join(base, "approval.json"),
    claim: win32.join(base, "results", "approval.claimed.json"),
    backup: win32.join(base, "backup", "before-0008.sql"),
    runtime: win32.join(plan.installationRoot, "config", "runtime.json"),
    configuration: win32.join(plan.installationRoot, "config", "server-monitoring.json"),
    admin: win32.join(plan.installationRoot, "operator", "postgres-admin.json"),
    active: win32.join(plan.installationRoot, "state", "active.json"),
    pgDump: win32.join(plan.installationRoot, "postgresql18", "pgsql", "bin", "pg_dump.exe"),
  };
  if (win32.resolve(planFile).toLowerCase() !== paths.plan.toLowerCase())
    fail("plan-path-mismatch");
  return paths;
}
async function plainPath(path: string) {
  for (let current = path; ; current = win32.dirname(current)) {
    try {
      if ((await lstat(current)).isSymbolicLink()) fail("linked-path-denied");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (win32.dirname(current) === current) break;
  }
}
async function protectedBytes(path: string, limit: number, restricted = true) {
  await plainPath(path);
  const stat = await lstat(path);
  if (!stat.isFile() || stat.nlink !== 1 || stat.size > limit) fail("file-invalid");
  if (restricted) privateAcl(path);
  return readFile(path);
}
async function absent(path: string) {
  await plainPath(path);
  try {
    await lstat(path);
    return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
    throw error;
  }
}
async function privateWrite(path: string, value: Buffer | string) {
  await plainPath(path);
  const parent = win32.dirname(path);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  privateAcl(parent);
  const file = await open(path, "wx", 0o600);
  try {
    await file.writeFile(value);
    await file.sync();
  } finally {
    await file.close();
  }
  privateAcl(path);
}
const mapHash = (runtime: Record<string, unknown>) =>
  reviewMigrationHash(
    typeof runtime["DEVSETU_REVIEWS_ADMINISTRATORS"] === "string"
      ? json(Buffer.from(runtime["DEVSETU_REVIEWS_ADMINISTRATORS"]))
      : {},
  );

/** Deterministic in-memory document planning only; never opens a database or runs a collector. */
export async function prepareCentralMonitoring(
  planInput: unknown,
  enrollmentInput: unknown,
  reviewInput: unknown,
  authority: (ws: string, actor: string) => Promise<{ active: boolean; administrator: boolean }>,
) {
  const plan = ServerMonitoringCentralPlanSchema.parse(planInput),
    config = ServerMonitoringRuntimeSchema.parse(enrollmentInput),
    reviews = ReviewWorkspaceStateSchema.parse(reviewInput);
  if (
    config.workspaceId !== plan.workspaceId ||
    reviews.workspaceId !== plan.workspaceId ||
    !config.targets.length ||
    !config.sourcePolicies.length
  )
    fail("enrollment-workspace-mismatch");
  const member = await authority(plan.workspaceId, plan.requestedBy);
  if (!member.active || !member.administrator) fail("requester-not-administrator");
  if (new Set(config.targets.map((target) => target.address)).size !== config.targets.length)
    fail("duplicate-physical-target");
  for (const target of config.targets)
    if (
      target.id !==
      serverMonitorTargetId(plan.workspaceId, target.address, target.port, target.transport)
    )
      fail("target-identity-mismatch");
  let document: unknown | null = null;
  const store: ServerMonitoringStore = {
    read: async () => structuredClone(document),
    write: async (_ws, value) => {
      document = structuredClone(value);
    },
    workspaces: async () => [plan.workspaceId],
    now: () => plan.createdAt,
    transaction: async <T>(_ws: string, operation: () => Promise<T>) => operation(),
  };
  const service = new ServerMonitoringService({
    store,
    authority,
    collector: async () => fail("collector-forbidden-during-bootstrap"),
    targetAllowed: (target) => serverMonitoringTargetAllowed(config, target),
    sourcePolicies: config.sourcePolicies.map((policy) => ({
      ...policy,
      workspaceId: plan.workspaceId,
    })),
    readRegister: async (_ws, _actor, id) => {
      const source = reviews.registers.find((entry) => entry.register.id === id);
      if (!source) fail("source-register-missing");
      return { id: source.register.id, records: source.records };
    },
  });
  for (const target of config.targets)
    await service.saveTarget(plan.workspaceId, plan.requestedBy, {
      expectedRevision: null,
      name: target.address,
      address: target.address,
      port: target.port,
      transport: target.transport,
      credentialProfile: target.credentialProfile,
      grants: [],
      enabled: true,
    });
  let excluded = 0;
  for (const source of config.sourcePolicies) {
    const first = config.targets[0];
    if (!first) fail("target-required");
    const result = await service.importTargets(plan.workspaceId, plan.requestedBy, {
      ...source,
      credentialProfile: first.credentialProfile,
      transport: "winrm-http",
      port: first.port,
      enabled: true,
    });
    excluded += result.excluded.length;
  }
  await service.savePolicy(plan.workspaceId, plan.requestedBy, {
    expectedRevision: 0,
    policy: plan.policy,
  });
  const proposed = ServerMonitoringDocumentSchema.parse(document);
  if (
    proposed.targets.length !== config.targets.length ||
    proposed.targets.some((target) => !target.sourceRefs.length)
  )
    fail("enrollment-source-coverage-mismatch");
  return {
    document: proposed,
    documentSha256: reviewMigrationHash(proposed),
    reviewSha256: reviewMigrationHash(reviews),
    counts: {
      targets: proposed.targets.length,
      sourceReferences: proposed.targets.reduce(
        (total, target) => total + target.sourceRefs.length,
        0,
      ),
      excludedRecords: excluded,
      localTargets: proposed.targets.filter((target) => target.transport === "local").length,
    },
  };
}
export function assertCentralMonitoringApproval(
  approvalInput: unknown,
  plan: ServerMonitoringCentralPlan,
  planSha256: string,
  planResultSha256: string,
  now = Date.now(),
) {
  const value = ServerMonitoringCentralApprovalSchema.parse(approvalInput),
    start = Date.parse(value.approvedAt),
    end = Date.parse(value.expiresAt);
  if (
    value.id !== plan.id ||
    value.planSha256 !== planSha256 ||
    value.planResultSha256 !== planResultSha256 ||
    value.requestedBy !== plan.requestedBy ||
    start > now ||
    end <= now ||
    end <= start ||
    end - start > 86400000
  )
    fail("approval-mismatch-or-stale");
  return value;
}
type Context = Awaited<ReturnType<typeof context>>;
async function context(planFile: string) {
  if (process.platform !== "win32") fail("native-server-required");
  const planBytes = await protectedBytes(planFile, 32768),
    plan = ServerMonitoringCentralPlanSchema.parse(json(planBytes));
  assertCentralMachine(reviewBinding(plan), hostname());
  const paths = monitoringCentralPaths(plan, planFile);
  privateAcl(paths.base);
  const runtimeBytes = await protectedBytes(paths.runtime, 131072),
    connections = validateCentralConnections(
      reviewBinding(plan),
      json(runtimeBytes),
      json(await protectedBytes(paths.admin, 32768)),
    );
  const enrollmentBytes = await protectedBytes(paths.enrollment, 1048576),
    config = ServerMonitoringRuntimeSchema.parse(json(enrollmentBytes));
  const sql = await protectedBytes(paths.sql, 65536);
  if (hash(enrollmentBytes) !== plan.enrollmentSha256 || hash(sql) !== plan.sqlSha256)
    fail("artifact-digest-mismatch");
  const active = z
    .object({ manifestSha256: digest })
    .passthrough()
    .parse(json(await protectedBytes(paths.active, 32768, false)));
  const release = win32.join(plan.installationRoot, "releases", active.manifestSha256),
    manifestBytes = await protectedBytes(
      win32.join(release, "release-manifest.json"),
      4000000,
      false,
    );
  if (hash(manifestBytes) !== active.manifestSha256) fail("active-manifest-mismatch");
  const manifest = z
    .object({
      files: z.array(z.object({ path: z.string(), sha256: digest }).passthrough()).max(10000),
    })
    .passthrough()
    .parse(json(manifestBytes));
  const policyBytes = await protectedBytes(
      win32.join(release, ...policyEntry.split("/")),
      32768,
      false,
    ),
    policy = DiscoveryAccessPolicySchema.parse(json(policyBytes));
  const entry = manifest.files.filter((file) => file.path === policyEntry);
  if (
    entry.length !== 1 ||
    entry[0]?.sha256 !== hash(policyBytes) ||
    policy.workspaceId !== plan.workspaceId
  )
    fail("administrator-policy-mismatch");
  const runtimePool = createDatabasePool(connections.runtimeUrl);
  const adminUrl = new URL(connections.runtimeUrl);
  adminUrl.username = connections.admin.username;
  adminUrl.password = connections.admin.password;
  const adminPool = createDatabasePool(adminUrl.toString());
  const administrators = z
    .record(WorkspaceIdSchema, z.array(UserIdSchema).max(100))
    .parse(
      typeof connections.runtime["DEVSETU_REVIEWS_ADMINISTRATORS"] === "string"
        ? json(Buffer.from(connections.runtime["DEVSETU_REVIEWS_ADMINISTRATORS"]))
        : {},
    );
  const authority = reviewAuthority(
    new WorkspaceRepository(runtimePool),
    administrators,
    (ws, actor, evidence) =>
      ws === policy.workspaceId && isDiscoveryAdministrator(policy, actor, evidence),
  );
  return {
    plan,
    paths,
    planSha256: hash(planBytes),
    runtimeBytes,
    runtime: connections.runtime,
    admin: connections.admin,
    runtimePool,
    adminPool,
    config,
    enrollmentBytes,
    sql,
    activeSha256: active.manifestSha256,
    policySha256: hash(policyBytes),
    mapSha256: mapHash(connections.runtime),
    authority,
  };
}
async function assertFrozen(ctx: Context) {
  assertCentralMachine(reviewBinding(ctx.plan), hostname());
  if (
    hash(await protectedBytes(ctx.paths.runtime, 131072)) !== hash(ctx.runtimeBytes) ||
    hash(await protectedBytes(ctx.paths.enrollment, 1048576)) !== ctx.plan.enrollmentSha256 ||
    hash(await protectedBytes(ctx.paths.sql, 65536)) !== ctx.plan.sqlSha256
  )
    fail("configuration-changed");
  const active = z
    .object({ manifestSha256: digest })
    .passthrough()
    .parse(json(await protectedBytes(ctx.paths.active, 32768, false)));
  if (active.manifestSha256 !== ctx.activeSha256) fail("active-release-changed");
  const release = win32.join(ctx.plan.installationRoot, "releases", ctx.activeSha256);
  if (
    hash(await protectedBytes(win32.join(release, "release-manifest.json"), 4000000, false)) !==
      ctx.activeSha256 ||
    hash(await protectedBytes(win32.join(release, ...policyEntry.split("/")), 32768, false)) !==
      ctx.policySha256
  )
    fail("administrator-policy-changed");
  const member = await ctx.authority(ctx.plan.workspaceId, ctx.plan.requestedBy);
  if (!member.active || !member.administrator) fail("requester-not-administrator");
}
async function current(ctx: Context) {
  await assertFrozen(ctx);
  await verifyApplicationRole(ctx.runtimePool);
  const inspection = await inspectCentralDatabase(ctx.adminPool, ctx.plan.expectedDatabase);
  const reviews = await withApplicationTransaction(
    ctx.runtimePool,
    ctx.plan.workspaceId,
    async (client) =>
      (
        await client.query(
          "SELECT document FROM frevos.review_workspace_state WHERE workspace_id=$1",
          [ctx.plan.workspaceId],
        )
      ).rows[0]?.document ?? null,
  );
  const review = ReviewWorkspaceStateSchema.parse(reviews);
  const table = await ctx.adminPool.query(
    "SELECT to_regclass('frevos.server_monitoring_state')::text AS monitoring",
  );
  const monitoring = table.rows[0]?.monitoring
    ? await withApplicationTransaction(
        ctx.runtimePool,
        ctx.plan.workspaceId,
        async (client) =>
          (
            await client.query(
              "SELECT document FROM frevos.server_monitoring_state WHERE workspace_id=$1",
              [ctx.plan.workspaceId],
            )
          ).rows[0]?.document ?? null,
      )
    : null;
  const proposed = await prepareCentralMonitoring(ctx.plan, ctx.config, review, ctx.authority);
  if (ctx.plan.expectedReviewSha256 && ctx.plan.expectedReviewSha256 !== proposed.reviewSha256)
    fail("review-state-changed");
  return {
    inspection,
    reviews: review,
    monitoring,
    proposed,
    configurationAbsent: await absent(ctx.paths.configuration),
  };
}
export async function applyCentralMonitoringSchema(
  client: Pick<PoolClient, "query">,
  sql: Buffer,
  expectedSha256: string,
) {
  if (hash(sql) !== expectedSha256) fail("migration-checksum-mismatch");
  await client.query("SET LOCAL lock_timeout='5s'");
  await client.query("SET LOCAL statement_timeout='30s'");
  await client.query("SELECT pg_advisory_xact_lock(667342846)");
  const roles = await client.query<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>(
    "SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=ANY($1::text[])",
    [["frevos_owner", "frevos_app"]],
  );
  if (roles.rows.length !== 2 || roles.rows.some((role) => role.rolsuper || role.rolbypassrls))
    fail("required-roles-invalid");
  const history = await client.query<{ sha256: string }>(
    "SELECT sha256 FROM public.frevos_schema_migrations WHERE version=$1 FOR UPDATE",
    [sqlName],
  );
  if (history.rows.length > 1) fail("migration-history-invalid");
  if (history.rows[0]) {
    if (history.rows[0].sha256 !== expectedSha256) fail("migration-checksum-mismatch");
  } else {
    const existing = await client.query(
      "SELECT to_regclass('frevos.server_monitoring_state')::text AS monitoring",
    );
    if (existing.rows[0]?.monitoring) fail("untracked-monitoring-schema");
    await client.query(sql.toString("utf8"));
    await client.query(
      "INSERT INTO public.frevos_schema_migrations(version,sha256) VALUES($1,$2)",
      [sqlName, expectedSha256],
    );
  }
  const verified = await client.query<{
    relrowsecurity: boolean;
    relforcerowsecurity: boolean;
    owner: string;
  }>(
    "SELECT relation.relrowsecurity,relation.relforcerowsecurity,pg_get_userbyid(relation.relowner) AS owner FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace WHERE namespace.nspname='frevos' AND relation.relname='server_monitoring_state'",
  );
  const row = verified.rows[0];
  if (
    verified.rows.length !== 1 ||
    !row?.relrowsecurity ||
    !row.relforcerowsecurity ||
    row.owner !== "frevos_owner"
  )
    fail("monitoring-schema-verification-failed");
  return history.rows.length ? "already-applied" : "applied";
}
export async function commitCentralMonitoring(
  client: Pick<PoolClient, "query">,
  plan: ServerMonitoringCentralPlan,
  documentInput: unknown,
  expectedReviewSha256: string,
  assertAuthority: () => Promise<void>,
) {
  const document = ServerMonitoringDocumentSchema.parse(documentInput);
  if (
    document.workspaceId !== plan.workspaceId ||
    document.audit.some((entry) => entry.actor !== plan.requestedBy)
  )
    fail("seed-workspace-or-owner-mismatch");
  await client.query("SET LOCAL lock_timeout='5s'");
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    `frevos/server-monitoring/${plan.workspaceId}`,
  ]);
  const workspace = await client.query(
    "SELECT workspace_id FROM frevos.workspaces WHERE workspace_id=$1 AND status='active' FOR SHARE",
    [plan.workspaceId],
  );
  const member = await client.query<{ granted_scopes: string[] }>(
    "SELECT granted_scopes FROM frevos.workspace_memberships WHERE workspace_id=$1 AND user_id=$2 AND status='active' FOR SHARE",
    [plan.workspaceId, plan.requestedBy],
  );
  if (
    workspace.rows.length !== 1 ||
    member.rows.length !== 1 ||
    !member.rows[0]?.granted_scopes.includes("project:read")
  )
    fail("requester-membership-invalid");
  const source = await client.query(
    "SELECT document FROM frevos.review_workspace_state WHERE workspace_id=$1 FOR SHARE",
    [plan.workspaceId],
  );
  if (
    source.rows.length !== 1 ||
    reviewMigrationHash(ReviewWorkspaceStateSchema.parse(source.rows[0]?.document)) !==
      expectedReviewSha256
  )
    fail("review-state-changed");
  const existing = await client.query(
    "SELECT document FROM frevos.server_monitoring_state WHERE workspace_id=$1 FOR UPDATE",
    [plan.workspaceId],
  );
  if (existing.rows.length) fail("monitoring-state-already-exists");
  await assertAuthority();
  const inserted = await client.query(
    "INSERT INTO frevos.server_monitoring_state(workspace_id,revision,document,updated_at) VALUES($1,1,$2::jsonb,clock_timestamp()) ON CONFLICT(workspace_id) DO NOTHING RETURNING revision",
    [plan.workspaceId, JSON.stringify(document)],
  );
  if (inserted.rows.length !== 1) fail("monitoring-state-conflict");
  await assertAuthority();
  return { documentSha256: reviewMigrationHash(document), targets: document.targets.length };
}
async function backup(ctx: Context) {
  if (!(await absent(ctx.paths.backup))) fail("backup-already-exists");
  await plainPath(ctx.paths.pgDump);
  if (!(await lstat(ctx.paths.pgDump)).isFile()) fail("backup-tool-missing");
  await mkdir(win32.dirname(ctx.paths.backup), { recursive: true, mode: 0o700 });
  privateAcl(win32.dirname(ctx.paths.backup));
  const result = spawnSync(
    ctx.paths.pgDump,
    [
      "--host",
      ctx.admin.host,
      "--port",
      String(ctx.admin.port),
      "--username",
      ctx.admin.username,
      "--dbname",
      ctx.plan.expectedDatabase.database,
      "--format=plain",
      "--no-password",
      "--lock-wait-timeout=30s",
      "--file",
      ctx.paths.backup,
    ],
    {
      windowsHide: true,
      cwd: win32.dirname(ctx.paths.pgDump),
      timeout: 600000,
      maxBuffer: 65536,
      stdio: ["ignore", "ignore", "pipe"],
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(
            ([key]) => !/^(?:PG|(?:DATABASE|MIGRATION_DATABASE|DB)(?:_|$))/i.test(key),
          ),
        ),
        PGPASSWORD: ctx.admin.password,
        PGCONNECT_TIMEOUT: "5",
        PGSSLMODE: "disable",
      },
    },
  );
  if (result.error || result.status !== 0) fail("database-backup-failed");
  const stat = await lstat(ctx.paths.backup);
  if (!stat.isFile() || stat.nlink !== 1 || stat.size > 1073741824) fail("database-backup-invalid");
  privateAcl(ctx.paths.backup);
  const receipt = await verifyPlainSqlBackup(
    createReadStream(ctx.paths.backup, { highWaterMark: 65536 }),
    result.status,
  );
  if (receipt.bytes !== stat.size) fail("database-backup-changed");
  await privateWrite(
    win32.join(win32.dirname(ctx.paths.backup), "receipt.json"),
    JSON.stringify({
      version: 1,
      id: ctx.plan.id,
      database: ctx.plan.expectedDatabase,
      ...receipt,
      createdAt: new Date().toISOString(),
    }) + "\n",
  );
  return receipt;
}
const resultSchema = z
  .object({
    version: z.literal(1),
    kind: z.literal("devsetu.server-monitoring.central-bootstrap-plan-result.v1"),
    id: z.string(),
    planSha256: digest,
    activeManifestSha256: digest,
    administratorPolicySha256: digest,
    administratorMapSha256: digest,
    runtimeSha256: digest,
    enrollmentSha256: digest,
    sqlSha256: digest,
    reviewSha256: digest,
    documentSha256: digest,
    historySha256: digest,
    workspaceId: WorkspaceIdSchema,
    requestedBy: UserIdSchema,
    counts: z.record(z.string(), z.number()),
    createdAt: z.iso.datetime(),
  })
  .strict();
function result(ctx: Context, state: Awaited<ReturnType<typeof current>>) {
  return resultSchema.parse({
    version: 1,
    kind: "devsetu.server-monitoring.central-bootstrap-plan-result.v1",
    id: ctx.plan.id,
    planSha256: ctx.planSha256,
    activeManifestSha256: ctx.activeSha256,
    administratorPolicySha256: ctx.policySha256,
    administratorMapSha256: ctx.mapSha256,
    runtimeSha256: hash(ctx.runtimeBytes),
    enrollmentSha256: ctx.plan.enrollmentSha256,
    sqlSha256: ctx.plan.sqlSha256,
    reviewSha256: state.proposed.reviewSha256,
    documentSha256: state.proposed.documentSha256,
    historySha256: reviewMigrationHash(
      state.inspection.history.filter((entry) => entry.version !== sqlName),
    ),
    workspaceId: ctx.plan.workspaceId,
    requestedBy: ctx.plan.requestedBy,
    counts: state.proposed.counts,
    createdAt: ctx.plan.createdAt,
  });
}
export async function runServerMonitoringCentral(args: string[]) {
  if (args.length !== 2 || !["inspect", "plan", "apply"].includes(args[0] ?? ""))
    fail("usage-inspect-plan-apply-planfile");
  const mode = args[0],
    ctx = await context(args[1] ?? "");
  try {
    const state = await current(ctx);
    if (mode === "inspect") {
      const report = {
        status: "inspected",
        computerName: ctx.plan.expectedComputerName,
        database: state.inspection.identity,
        workspaceId: ctx.plan.workspaceId,
        reviewSha256: state.proposed.reviewSha256,
        existingMonitoring: state.monitoring !== null,
        configurationAbsent: state.configurationAbsent,
        counts: state.proposed.counts,
        history: state.inspection.history,
      };
      await privateWrite(ctx.paths.inspected, JSON.stringify(report, null, 2) + "\n");
      return report;
    }
    if (!ctx.plan.expectedReviewSha256) fail("expected-review-digest-required");
    if (state.monitoring !== null || !state.configurationAbsent)
      fail("bootstrap-requires-new-state-and-configuration");
    const planned = result(ctx, state);
    if (mode === "plan") {
      const bytes = Buffer.from(JSON.stringify(planned, null, 2) + "\n");
      await privateWrite(ctx.paths.planned, bytes);
      return {
        status: "planned",
        planSha256: ctx.planSha256,
        planResultSha256: hash(bytes),
        counts: planned.counts,
        documentSha256: planned.documentSha256,
      };
    }
    const savedBytes = await protectedBytes(ctx.paths.planned, 1000000),
      saved = resultSchema.parse(json(savedBytes));
    if (reviewMigrationHash(saved) !== reviewMigrationHash(planned)) fail("saved-plan-changed");
    const approvalBytes = await protectedBytes(ctx.paths.approval, 32768),
      approval = json(approvalBytes);
    assertCentralMonitoringApproval(approval, ctx.plan, ctx.planSha256, hash(savedBytes));
    const exported = await backup(ctx);
    await assertFrozen(ctx);
    assertCentralMonitoringApproval(approval, ctx.plan, ctx.planSha256, hash(savedBytes));
    const fresh = await current(ctx);
    if (
      fresh.monitoring !== null ||
      !fresh.configurationAbsent ||
      reviewMigrationHash(result(ctx, fresh)) !== reviewMigrationHash(planned)
    )
      fail("fresh-plan-changed");
    await privateWrite(
      ctx.paths.claim,
      JSON.stringify({
        version: 1,
        approvalSha256: hash(approvalBytes),
        planSha256: ctx.planSha256,
        claimedAt: new Date().toISOString(),
      }) + "\n",
    );
    const client = await ctx.adminPool.connect();
    let schema: string;
    try {
      await client.query("BEGIN");
      schema = await applyCentralMonitoringSchema(client, ctx.sql, ctx.plan.sqlSha256);
      await assertFrozen(ctx);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    await verifyApplicationRole(ctx.runtimePool);
    const committed = await withApplicationTransaction(
      ctx.runtimePool,
      ctx.plan.workspaceId,
      (client) =>
        commitCentralMonitoring(
          client,
          ctx.plan,
          fresh.proposed.document,
          planned.reviewSha256,
          async () => {
            await assertFrozen(ctx);
            assertCentralMonitoringApproval(approval, ctx.plan, ctx.planSha256, hash(savedBytes));
          },
        ),
    );
    await assertFrozen(ctx);
    await privateWrite(ctx.paths.configuration, ctx.enrollmentBytes);
    const receipt = {
      status: "succeeded",
      id: ctx.plan.id,
      planSha256: ctx.planSha256,
      planResultSha256: hash(savedBytes),
      ...committed,
      schema,
      backup: exported,
      reviewSha256: planned.reviewSha256,
      configurationSha256: hash(ctx.enrollmentBytes),
      completedAt: new Date().toISOString(),
    };
    await privateWrite(ctx.paths.applied, JSON.stringify(receipt, null, 2) + "\n");
    return receipt;
  } finally {
    await Promise.allSettled([ctx.runtimePool.end(), ctx.adminPool.end()]);
  }
}
export function centralMonitoringFailure(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return {
    status: "failed",
    code: /^(?:server-monitoring-central|review-central-migrate):[a-z0-9-]+$/.test(message)
      ? message
      : "server-monitoring-central:operation-failed",
  };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  void runServerMonitoringCentral(process.argv.slice(2))
    .then((value) => process.stdout.write(JSON.stringify(value) + "\n"))
    .catch((error: unknown) => {
      process.stdout.write(JSON.stringify(centralMonitoringFailure(error)) + "\n");
      process.exitCode = 1;
    });
}
