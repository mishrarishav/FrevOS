import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, open, readFile, rename } from "node:fs/promises";
import { hostname } from "node:os";
import { resolve, win32 } from "node:path";
import { pathToFileURL } from "node:url";
import { UserIdSchema, WorkspaceIdSchema } from "@frevos/contracts";
import type { PoolClient } from "pg";
import { z } from "zod";
import {
  createDatabasePool,
  type DatabasePool,
  verifyApplicationRole,
  withApplicationTransaction,
} from "./database.js";
import { DiscoveryAccessPolicySchema, isDiscoveryAdministrator } from "./discovery-access.js";
import { WorkspaceRepository } from "./repositories.js";
import { reviewAuthority } from "./review-authority.js";
import {
  prepareReviewMigration,
  ReviewMigrationMappingSchema,
  reviewMigrationHash,
} from "./review-migration.js";
import { ReviewWorkspaceStateSchema } from "./review-registers.js";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const migrationId = z.string().regex(/^rmi_[a-f0-9]{32}$/);
const targetSchema = z
  .object({
    host: z.string().min(1).max(253),
    port: z.number().int().min(1).max(65535),
    database: z.string().regex(/^[a-z][a-z0-9_]{0,62}$/),
    runtimeRole: z.string().regex(/^[a-z][a-z0-9_]{2,62}$/),
  })
  .strict();
export const ReviewCentralPlanSchema = z
  .object({
    version: z.literal(1),
    kind: z.literal("devsetu.reviews.central-migration.v1"),
    id: migrationId,
    artifactId: migrationId.optional(),
    installationRoot: z.string().min(3).max(200),
    expectedComputerName: z.string().regex(/^[A-Za-z0-9-]{1,63}$/),
    expectedDatabase: targetSchema,
    sourceSha256: digest.optional(),
    mappingSha256: digest.optional(),
    sqlSha256: digest.optional(),
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
  })
  .strict();
export type ReviewCentralPlan = z.infer<typeof ReviewCentralPlanSchema>;
export const ReviewCentralApprovalSchema = z
  .object({
    version: z.literal(1),
    kind: z.literal("devsetu.reviews.central-migration-approval.v1"),
    migrationId,
    planSha256: digest,
    planResultSha256: digest,
    sourceSha256: digest,
    mappingSha256: digest,
    sqlSha256: digest,
    expectedComputerName: z.string().max(63),
    expectedDatabase: targetSchema,
    requestedBy: UserIdSchema,
    decision: z.literal("approve"),
    approvalReference: z.string().trim().min(1).max(1000),
    approvedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
  })
  .strict();
const adminSchema = z
  .object({
    version: z.literal(1),
    host: z.string().max(253),
    port: z.number().int().min(1).max(65535),
    database: z.string().max(63),
    username: z.string().regex(/^[a-z][a-z0-9_]{2,62}$/),
    password: z.string().min(1).max(4096),
    purpose: z.string().trim().min(1).max(1000),
  })
  .strict();
const policyEntry = "deployment/servix/DiscoveryAccessPolicy.json";
const sqlName = "0007_review_workspace_state.sql";
const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
function fail(code: string): never {
  throw new Error(`review-central-migrate:${code}`);
}
function json(bytes: Buffer): unknown {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("invalid-json");
  }
}
export function centralMigrationPaths(plan: ReviewCentralPlan, planFile: string) {
  if (
    !/^[A-Za-z]:\\/.test(plan.installationRoot) ||
    win32.normalize(plan.installationRoot) !== plan.installationRoot ||
    Array.from(plan.installationRoot).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    fail("installation-root-invalid");
  const base = win32.join(plan.installationRoot, "operator", "reviews-migrations", plan.id);
  const paths = {
    base,
    plan: win32.join(base, "plan.json"),
    source: win32.join(base, "source.json"),
    mapping: win32.join(base, "mapping.json"),
    sql: win32.join(base, "package", "migrations", sqlName),
    backup: win32.join(base, "backup"),
    result: win32.join(base, "results", "plan-result.json"),
    inspected: win32.join(base, "results", "inspect-result.json"),
    applied: win32.join(base, "results", "apply-result.json"),
    approval: win32.join(base, "approval.json"),
    claim: win32.join(base, "results", "approval.claimed.json"),
    runtime: win32.join(plan.installationRoot, "config", "runtime.json"),
    admin: win32.join(plan.installationRoot, "operator", "postgres-admin.json"),
    active: win32.join(plan.installationRoot, "state", "active.json"),
    pgDump: win32.join(plan.installationRoot, "postgresql18", "pgsql", "bin", "pg_dump.exe"),
  };
  if (win32.resolve(planFile).toLowerCase() !== paths.plan.toLowerCase())
    fail("plan-path-mismatch");
  return paths;
}
export function assertCentralMachine(
  plan: ReviewCentralPlan,
  computerName: string,
  now = Date.now(),
  allowExpired = false,
) {
  // Native Windows computer names are case-insensitive; no aliases or FQDN suffixes are accepted.
  if (computerName.toLowerCase() !== plan.expectedComputerName.toLowerCase())
    fail("computer-mismatch");
  const start = Date.parse(plan.createdAt),
    end = Date.parse(plan.expiresAt);
  if (start > now || end <= start || end - start > 86400000 || (!allowExpired && end <= now))
    fail("plan-stale");
  if (!["127.0.0.1", "::1"].includes(plan.expectedDatabase.host))
    fail("native-local-database-binding-required");
}
async function plainPath(path: string) {
  let current = path;
  for (;;) {
    try {
      if ((await lstat(current)).isSymbolicLink()) fail("reparse-path-denied");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const parent = win32.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}
export function privateAcl(
  path: string,
  native: typeof spawnSync = spawnSync,
  parentEnvironment: NodeJS.ProcessEnv = process.env,
) {
  const systemRoot = parentEnvironment["SystemRoot"];
  if (!systemRoot || !win32.isAbsolute(systemRoot)) fail("private-acl-unavailable");
  const script =
    "$ErrorActionPreference='Stop';$a=Get-Acl -LiteralPath $env:DEVSETU_MIGRATION_PRIVATE_PATH;$wide=@('S-1-1-0','S-1-5-7','S-1-5-11','S-1-5-32-545','S-1-5-32-546');foreach($r in $a.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){$s=$r.IdentityReference.Value;if($r.AccessControlType -eq 'Allow' -and $s -in $wide){exit 9}}";
  const result = native(
    win32.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
    ["-NoProfile", "-NonInteractive", "-Command", script],
    {
      windowsHide: true,
      timeout: 45000,
      cwd: win32.join(systemRoot, "System32"),
      stdio: "ignore",
      env: {
        ...Object.fromEntries(
          Object.entries(parentEnvironment).filter(
            ([key]) => !/^(?:PG|(?:DATABASE|MIGRATION_DATABASE|DB)(?:_|$))/i.test(key),
          ),
        ),
        SystemRoot: systemRoot,
        PSModulePath: win32.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "Modules"),
        DEVSETU_MIGRATION_PRIVATE_PATH: path,
      },
    },
  );
  if ((result.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT")
    fail("private-acl-timeout");
  if (result.status === 9) fail("private-acl-wide-access");
  if (result.error || result.status !== 0) fail("private-acl-unavailable");
}
async function protectedBytes(path: string, max: number, privateFile = true) {
  await plainPath(path);
  const stat = await lstat(path);
  if (!stat.isFile() || stat.nlink !== 1 || stat.size > max) fail("file-invalid");
  if (privateFile) privateAcl(path);
  return readFile(path);
}
async function privateWrite(path: string, bytes: Buffer | string, replace = false) {
  await plainPath(path);
  const parent = win32.dirname(path);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  privateAcl(parent);
  const destination = replace ? `${path}.${randomUUID()}.tmp` : path;
  if (replace) {
    try {
      await protectedBytes(path, 4000000);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const file = await open(destination, "wx", 0o600);
  try {
    await file.writeFile(bytes);
    await file.sync();
  } finally {
    await file.close();
  }
  if (replace) await rename(destination, path);
  privateAcl(path);
}
type Context = {
  plan: ReviewCentralPlan;
  paths: ReturnType<typeof centralMigrationPaths>;
  planHash: string;
  runtime: Record<string, unknown>;
  runtimeUrl: string;
  admin: z.infer<typeof adminSchema>;
  adminPool: DatabasePool;
  runtimePool: DatabasePool;
  policy: z.infer<typeof DiscoveryAccessPolicySchema>;
  policyHash: string;
  activeHash: string;
  authority: ReturnType<typeof reviewAuthority>;
};
function envelope(ctx: Context, mode: "inspect" | "plan" | "apply") {
  return {
    version: 1,
    kind: `devsetu.reviews.central-migration-${mode}-result.v1`,
    migrationId: ctx.plan.id,
    planSha256: ctx.planHash,
    computerName: ctx.plan.expectedComputerName,
  };
}
function administratorMapHash(value: Record<string, unknown>) {
  return reviewMigrationHash(
    typeof value["DEVSETU_REVIEWS_ADMINISTRATORS"] === "string"
      ? json(Buffer.from(value["DEVSETU_REVIEWS_ADMINISTRATORS"] as string))
      : {},
  );
}
async function assertFrozenAuthority(ctx: Context) {
  const active = z
    .object({ manifestSha256: digest })
    .passthrough()
    .parse(json(await protectedBytes(ctx.paths.active, 32768, false)));
  if (active.manifestSha256 !== ctx.activeHash) fail("active-release-changed");
  const release = win32.join(ctx.plan.installationRoot, "releases", ctx.activeHash);
  if (
    hash(await protectedBytes(win32.join(release, "release-manifest.json"), 4000000, false)) !==
      ctx.activeHash ||
    hash(await protectedBytes(win32.join(release, ...policyEntry.split("/")), 32768, false)) !==
      ctx.policyHash
  )
    fail("administrator-policy-changed");
  const runtime = z
    .record(z.string(), z.unknown())
    .parse(json(await protectedBytes(ctx.paths.runtime, 131072)));
  if (administratorMapHash(runtime) !== administratorMapHash(ctx.runtime))
    fail("administrator-map-changed");
}
export function validateCentralConnections(
  plan: ReviewCentralPlan,
  runtimeInput: unknown,
  adminInput: unknown,
) {
  const runtime = z.record(z.string(), z.unknown()).parse(runtimeInput),
    admin = adminSchema.parse(adminInput);
  if (typeof runtime["DATABASE_URL"] !== "string") fail("runtime-connection-missing");
  let url: URL;
  try {
    url = new URL(runtime["DATABASE_URL"]);
  } catch {
    fail("runtime-connection-invalid");
  }
  const target = plan.expectedDatabase;
  let role: string, name: string;
  try {
    role = decodeURIComponent(url.username);
    name = decodeURIComponent(url.pathname.slice(1));
  } catch {
    fail("runtime-connection-invalid");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.hostname.replace(/^\[|\]$/g, "") !== target.host ||
    Number(url.port || "5432") !== target.port ||
    name !== target.database ||
    role !== target.runtimeRole ||
    !url.password ||
    url.search ||
    url.hash
  )
    fail("runtime-target-mismatch");
  if (
    admin.host !== target.host ||
    admin.port !== target.port ||
    !["postgres", target.database].includes(admin.database) ||
    admin.username === target.runtimeRole
  )
    fail("admin-target-mismatch");
  return { runtime, runtimeUrl: runtime["DATABASE_URL"], admin };
}
async function context(planPath: string, mode: string): Promise<Context> {
  if (process.platform !== "win32") fail("native-server-required");
  const planBytes = await protectedBytes(planPath, 32768);
  const plan = ReviewCentralPlanSchema.parse(json(planBytes));
  assertCentralMachine(plan, hostname(), Date.now(), mode === "apply");
  const paths = centralMigrationPaths(plan, planPath);
  privateAcl(paths.base);
  const connections = validateCentralConnections(
    plan,
    json(await protectedBytes(paths.runtime, 131072)),
    json(await protectedBytes(paths.admin, 32768)),
  );
  const active = z
    .object({ manifestSha256: digest })
    .passthrough()
    .parse(json(await protectedBytes(paths.active, 32768, false)));
  const release = win32.join(plan.installationRoot, "releases", active.manifestSha256);
  const manifestBytes = await protectedBytes(
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
  const entries = manifest.files.filter((entry) => entry.path === policyEntry);
  const policyBytes = await protectedBytes(
    win32.join(release, ...policyEntry.split("/")),
    32768,
    false,
  );
  if (entries.length !== 1 || entries[0]?.sha256 !== hash(policyBytes))
    fail("administrator-policy-mismatch");
  const policy = DiscoveryAccessPolicySchema.parse(json(policyBytes));
  const runtimePool = createDatabasePool(connections.runtimeUrl);
  const adminHost = connections.admin.host.includes(":")
    ? `[${connections.admin.host}]`
    : connections.admin.host;
  const adminUrl = `postgresql://${encodeURIComponent(connections.admin.username)}:${encodeURIComponent(connections.admin.password)}@${adminHost}:${connections.admin.port}/${encodeURIComponent(plan.expectedDatabase.database)}`;
  const adminPool = createDatabasePool(adminUrl);
  const configured = z
    .record(WorkspaceIdSchema, z.array(UserIdSchema).max(100))
    .parse(
      typeof connections.runtime["DEVSETU_REVIEWS_ADMINISTRATORS"] === "string"
        ? json(Buffer.from(connections.runtime["DEVSETU_REVIEWS_ADMINISTRATORS"]))
        : {},
    );
  const authority = reviewAuthority(
    new WorkspaceRepository(runtimePool),
    configured,
    (ws, actor, evidence) =>
      ws === policy.workspaceId && isDiscoveryAdministrator(policy, actor, evidence),
  );
  return {
    plan,
    paths,
    planHash: hash(planBytes),
    ...connections,
    adminPool,
    runtimePool,
    policy,
    policyHash: hash(policyBytes),
    activeHash: active.manifestSha256,
    authority,
  };
}
export async function inspectCentralDatabase(
  pool: Pick<DatabasePool, "connect">,
  expected: ReviewCentralPlan["expectedDatabase"],
) {
  const client = await pool.connect();
  let phase:
    | "begin"
    | "identity"
    | "roles"
    | "schema"
    | "history"
    | "workspaces"
    | "members"
    | "commit" = "begin";
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout='10s'");
    phase = "identity";
    const identity = await client.query<{
      database: string;
      server_address: string | null;
      server_port: number;
      server_version: string;
    }>(
      "SELECT current_database() AS database, host(inet_server_addr()) AS server_address, inet_server_port() AS server_port, current_setting('server_version') AS server_version",
    );
    const db = identity.rows[0];
    if (
      !db ||
      db.database !== expected.database ||
      db.server_port !== expected.port ||
      db.server_address !== expected.host
    )
      fail("database-identity-mismatch");
    phase = "roles";
    const roles = await client.query(
      "SELECT rolname,rolcanlogin,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=ANY($1::text[]) ORDER BY rolname",
      [["frevos_owner", "frevos_app", expected.runtimeRole]],
    );
    phase = "schema";
    const schema = await client.query(
      "SELECT to_regclass('public.frevos_schema_migrations')::text AS history, to_regclass('frevos.review_workspace_state')::text AS state, to_regclass('frevos.review_migration_receipts')::text AS receipts",
    );
    if (!schema.rows[0]?.history) fail("schema-history-missing");
    phase = "history";
    const history = await client.query(
      "SELECT version,sha256 FROM public.frevos_schema_migrations ORDER BY version LIMIT 65",
    );
    if (history.rows.length > 64) fail("schema-history-limit");
    phase = "workspaces";
    const workspaces = await client.query(
      "SELECT workspace_id,display_name,status FROM frevos.workspaces ORDER BY workspace_id LIMIT 101",
    );
    if (workspaces.rows.length > 100) fail("workspace-limit");
    phase = "members";
    const users = await client.query(
      "SELECT workspace_id,user_id,status,granted_scopes FROM frevos.workspace_memberships WHERE status='active' ORDER BY workspace_id,user_id LIMIT 1001",
    );
    if (users.rows.length > 1000) fail("member-limit");
    phase = "commit";
    await client.query("COMMIT");
    return {
      identity: db,
      roles: roles.rows,
      schema: schema.rows[0],
      history: history.rows,
      workspaces: workspaces.rows,
      users: users.rows,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (
      error instanceof Error &&
      /^review-central-migrate:(database-identity-mismatch|schema-history-missing|schema-history-limit|workspace-limit|member-limit)$/.test(
        error.message,
      )
    )
      throw error;
    const sqlState =
      error !== null && typeof error === "object" && "code" in error ? error.code : null;
    fail(
      `database-inspection-${phase}-${typeof sqlState === "string" && /^[A-Z0-9]{5}$/.test(sqlState) ? sqlState.toLowerCase() : "failed"}`,
    );
  } finally {
    client.release();
  }
}
async function artifacts(ctx: Context) {
  const { plan, paths } = ctx;
  if (!plan.sourceSha256 || !plan.mappingSha256 || !plan.sqlSha256)
    fail("artifact-digests-required");
  const sourceBytes = await protectedBytes(paths.source, 33554432),
    mappingBytes = await protectedBytes(paths.mapping, 262144),
    sql = await protectedBytes(paths.sql, 65536);
  if (
    hash(sourceBytes) !== plan.sourceSha256 ||
    hash(mappingBytes) !== plan.mappingSha256 ||
    hash(sql) !== plan.sqlSha256
  )
    fail("artifact-digest-mismatch");
  const mapping = ReviewMigrationMappingSchema.parse(json(mappingBytes));
  if (mapping.id !== plan.id) fail("mapping-id-mismatch");
  return { source: json(sourceBytes), mapping, sourceBytes, mappingBytes, sql };
}
async function assertMembers(
  client: Pick<PoolClient, "query">,
  workspaceId: string,
  userIds: string[],
  locked = false,
) {
  const workspace = await client.query(
    "SELECT workspace_id FROM frevos.workspaces WHERE workspace_id=$1 AND status='active'" +
      (locked ? " FOR SHARE" : ""),
    [workspaceId],
  );
  if (workspace.rows.length !== 1) fail("target-workspace-inactive");
  const members = await client.query<{ user_id: string; granted_scopes: string[] }>(
    "SELECT user_id,granted_scopes FROM frevos.workspace_memberships WHERE workspace_id=$1 AND status='active' AND user_id=ANY($2::text[])" +
      (locked ? " FOR SHARE" : ""),
    [workspaceId, userIds],
  );
  if (
    members.rows.length !== userIds.length ||
    members.rows.some((member) => !member.granted_scopes.includes("project:read"))
  )
    fail("target-actor-membership-invalid");
}
async function targetState(ctx: Context, ws: string, tableExists: boolean) {
  if (!tableExists) return null;
  return withApplicationTransaction(
    ctx.runtimePool,
    ws,
    async (client) =>
      (
        await client.query(
          "SELECT document FROM frevos.review_workspace_state WHERE workspace_id=$1",
          [ws],
        )
      ).rows[0]?.document ?? null,
  );
}
export function centralReviewStateMetadata(document: unknown, workspaceId: string) {
  const state = ReviewWorkspaceStateSchema.parse(document);
  if (state.workspaceId !== workspaceId) fail("review-state-workspace-mismatch");
  return {
    workspaceId,
    documentHash: reviewMigrationHash(document),
    registers: state.registers.length,
    records: state.registers.reduce((total, data) => total + data.records.length, 0),
    endpoints: state.registers.reduce(
      (total, data) =>
        total + data.records.reduce((count, record) => count + record.endpoints.length, 0),
      0,
    ),
    reports: state.registers.reduce(
      (total, data) => total + (data.monitoring?.runs.length ?? 0),
      0,
    ),
  };
}
async function planMigration(ctx: Context) {
  const inputs = await artifacts(ctx),
    inspection = await inspectCentralDatabase(ctx.adminPool, ctx.plan.expectedDatabase);
  await verifyApplicationRole(ctx.runtimePool);
  const destination = await targetState(
    ctx,
    inputs.mapping.targetWorkspaceId,
    !!inspection.schema?.state,
  );
  const prepared = prepareReviewMigration(inputs.source, inputs.mapping, destination);
  await withApplicationTransaction(ctx.runtimePool, inputs.mapping.targetWorkspaceId, (client) =>
    assertMembers(client, inputs.mapping.targetWorkspaceId, prepared.targetUserIds),
  );
  if (
    !(await ctx.authority(inputs.mapping.targetWorkspaceId, inputs.mapping.requestedBy))
      .administrator
  )
    fail("requester-not-administrator");
  const result = {
    version: 1,
    kind: "devsetu.reviews.central-migration-plan-result.v1",
    migrationId: ctx.plan.id,
    planSha256: ctx.planHash,
    computerName: ctx.plan.expectedComputerName,
    expectedDatabase: ctx.plan.expectedDatabase,
    activeManifestSha256: ctx.activeHash,
    administratorPolicySha256: ctx.policyHash,
    administratorMapSha256: administratorMapHash(ctx.runtime),
    sourceSha256: ctx.plan.sourceSha256,
    mappingSha256: ctx.plan.mappingSha256,
    sqlSha256: ctx.plan.sqlSha256,
    targetWorkspaceId: inputs.mapping.targetWorkspaceId,
    requestedBy: inputs.mapping.requestedBy,
    targetUserIds: prepared.targetUserIds,
    destinationHash: inputs.mapping.expectedDestinationHash,
    resultHash: reviewMigrationHash(prepared.document),
    importedHash: prepared.importedHash,
    counts: prepared.counts,
    inspection,
    createdAt: new Date().toISOString(),
  };
  const bytes = Buffer.from(JSON.stringify(result, null, 2) + "\n");
  await privateWrite(ctx.paths.result, bytes, true);
  return {
    status: "planned",
    planSha256: ctx.planHash,
    planResultSha256: hash(bytes),
    counts: prepared.counts,
    administratorPolicySha256: ctx.policyHash,
  };
}

export async function commitCentralReviewData(
  client: Pick<PoolClient, "query">,
  source: unknown,
  mappingInput: unknown,
  sourceSha256: string,
  mappingSha256: string,
  expectedImportedHash: string,
  assertAdministrator: () => Promise<void>,
) {
  const mapping = ReviewMigrationMappingSchema.parse(mappingInput);
  await client.query("SET LOCAL lock_timeout='5s'");
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    "frevos/reviews/" + mapping.targetWorkspaceId,
  ]);
  const receipts = await client.query(
    "SELECT migration_id,imported_sha256,requested_by FROM frevos.review_migration_receipts WHERE workspace_id=$1 AND source_sha256=$2 AND mapping_sha256=$3",
    [mapping.targetWorkspaceId, sourceSha256, mappingSha256],
  );
  await assertAdministrator();
  if (receipts.rows.length > 1) fail("receipt-conflict");
  if (receipts.rows[0]) {
    if (
      receipts.rows[0].migration_id !== mapping.id ||
      receipts.rows[0].requested_by !== mapping.requestedBy ||
      receipts.rows[0].imported_sha256 !== expectedImportedHash
    )
      fail("receipt-identity-mismatch");
    return {
      status: "already-succeeded" as const,
      importedHash: String(receipts.rows[0].imported_sha256),
      migrationId: String(receipts.rows[0].migration_id),
    };
  }
  const selected = await client.query<{ revision: string; document: unknown }>(
    "SELECT revision::text AS revision,document FROM frevos.review_workspace_state WHERE workspace_id=$1 FOR UPDATE",
    [mapping.targetWorkspaceId],
  );
  if (selected.rows.length > 1) fail("destination-state-invalid");
  const existing = selected.rows[0];
  const prepared = prepareReviewMigration(source, mapping, existing?.document ?? null);
  if (prepared.importedHash !== expectedImportedHash) fail("planned-import-changed");
  await assertMembers(client, mapping.targetWorkspaceId, prepared.targetUserIds, true);
  await assertAdministrator();
  const saved = existing
    ? await client.query(
        "UPDATE frevos.review_workspace_state SET document=$2::jsonb,revision=revision+1,updated_at=clock_timestamp() WHERE workspace_id=$1 AND revision=$3::bigint RETURNING revision",
        [mapping.targetWorkspaceId, JSON.stringify(prepared.document), existing.revision],
      )
    : await client.query(
        "INSERT INTO frevos.review_workspace_state(workspace_id,revision,document) VALUES($1,1,$2::jsonb) ON CONFLICT(workspace_id) DO NOTHING RETURNING revision",
        [mapping.targetWorkspaceId, JSON.stringify(prepared.document)],
      );
  if (saved.rows.length !== 1) fail("destination-revision-conflict");
  await assertAdministrator();
  await client.query(
    "INSERT INTO frevos.review_migration_receipts(workspace_id,migration_id,source_sha256,mapping_sha256,imported_sha256,requested_by) VALUES($1,$2,$3,$4,$5,$6)",
    [
      mapping.targetWorkspaceId,
      mapping.id,
      sourceSha256,
      mappingSha256,
      prepared.importedHash,
      mapping.requestedBy,
    ],
  );
  return {
    status: "succeeded" as const,
    importedHash: prepared.importedHash,
    resultHash: reviewMigrationHash(prepared.document),
    counts: prepared.counts,
    migrationId: mapping.id,
  };
}
async function schemaMigration(ctx: Context, sql: Buffer) {
  const client = await ctx.adminPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout='30s'");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SELECT pg_advisory_xact_lock(667342846)");
    const roles = await client.query<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>(
      "SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=ANY($1::text[])",
      [["frevos_owner", "frevos_app"]],
    );
    if (roles.rows.length !== 2 || roles.rows.some((role) => role.rolsuper || role.rolbypassrls))
      fail("required-roles-invalid");
    const applied = await client.query<{ sha256: string }>(
      "SELECT sha256 FROM public.frevos_schema_migrations WHERE version=$1 FOR UPDATE",
      [sqlName],
    );
    let status: "applied" | "already-applied" = "already-applied";
    if (applied.rows[0]) {
      if (applied.rows[0].sha256 !== ctx.plan.sqlSha256) fail("migration-checksum-mismatch");
    } else {
      const objects = await client.query(
        "SELECT to_regclass('frevos.review_workspace_state') AS state,to_regclass('frevos.review_migration_receipts') AS receipts",
      );
      if (objects.rows[0]?.state || objects.rows[0]?.receipts) fail("untracked-review-schema");
      await client.query(sql.toString("utf8"));
      await client.query(
        "INSERT INTO public.frevos_schema_migrations(version,sha256) VALUES($1,$2)",
        [sqlName, ctx.plan.sqlSha256],
      );
      status = "applied";
    }
    const verified = await client.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
      owner: string;
    }>(
      "SELECT relation.relname,relation.relrowsecurity,relation.relforcerowsecurity,pg_get_userbyid(relation.relowner) AS owner FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace WHERE namespace.nspname='frevos' AND relation.relname=ANY($1::text[])",
      [["review_workspace_state", "review_migration_receipts"]],
    );
    if (
      verified.rows.length !== 2 ||
      verified.rows.some(
        (row) => !row.relrowsecurity || !row.relforcerowsecurity || row.owner !== "frevos_owner",
      )
    )
      fail("review-schema-verification-failed");
    await client.query("COMMIT");
    return status;
  } catch {
    await client.query("ROLLBACK").catch(() => undefined);
    fail("bounded-schema-migration-failed");
  } finally {
    client.release();
  }
}
const maximumBackupBytes = 1073741824;
const backupEvidenceWindow = 8192;
export async function verifyPlainSqlBackup(
  chunks: AsyncIterable<Uint8Array>,
  exporterExitCode: number | null,
  maxBytes = maximumBackupBytes,
) {
  if (exporterExitCode !== 0) fail("database-backup-export-failed");
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 64 || maxBytes > maximumBackupBytes)
    fail("database-backup-limit-invalid");
  const digest = createHash("sha256");
  let bytes = 0;
  let parts = 0;
  let header = Buffer.alloc(0);
  let footer = Buffer.alloc(0);
  for await (const chunk of chunks) {
    parts += 1;
    if (parts > 1000000 || chunk.byteLength > 65536) fail("database-backup-chunk-limit");
    bytes += chunk.byteLength;
    if (bytes > maxBytes) fail("database-backup-byte-limit");
    digest.update(chunk);
    if (header.length < backupEvidenceWindow)
      header = Buffer.concat([header, chunk.subarray(0, backupEvidenceWindow - header.length)]);
    footer = Buffer.concat([footer, chunk]).subarray(-backupEvidenceWindow);
  }
  if (bytes < 64) fail("database-backup-invalid");
  if (
    !header
      .toString("utf8")
      .replace(/\r\n/g, "\n")
      .startsWith("--\n-- PostgreSQL database dump\n--\n")
  )
    fail("database-backup-header-invalid");
  if (
    !/\n-- PostgreSQL database dump complete\n--\n\n*(?:\\unrestrict [A-Za-z0-9]+\n\n*)?$/.test(
      footer.toString("utf8").replace(/\r\n/g, "\n"),
    )
  )
    fail("database-backup-footer-incomplete");
  return {
    format: "plain-sql" as const,
    verification: "export-exit/header/footer/sha256" as const,
    restoreTested: false as const,
    sha256: digest.digest("hex"),
    bytes,
  };
}
async function databaseBackup(ctx: Context, destination: unknown) {
  assertCentralMachine(ctx.plan, hostname());
  await plainPath(ctx.paths.pgDump);
  if (!(await lstat(ctx.paths.pgDump)).isFile()) fail("native-backup-tool-missing");
  await mkdir(ctx.paths.backup, { recursive: true, mode: 0o700 });
  privateAcl(ctx.paths.backup);
  const dump = win32.join(ctx.paths.backup, "before-0007.sql");
  try {
    await lstat(dump);
    fail("backup-already-exists");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const environment = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^PG/i.test(key))),
    PGPASSWORD: ctx.admin.password,
    PGCONNECT_TIMEOUT: "5",
    // Native on-server loopback only, matching the verified PostgreSQL helper.
    PGSSLMODE: "disable",
  };
  const dumped = spawnSync(
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
      dump,
    ],
    {
      windowsHide: true,
      cwd: win32.dirname(ctx.paths.pgDump),
      timeout: 600000,
      maxBuffer: 65536,
      stdio: ["ignore", "ignore", "pipe"],
      env: environment,
    },
  );
  if (dumped.error || dumped.status !== 0) fail("database-backup-failed");
  const stat = await lstat(dump);
  if (!stat.isFile() || stat.nlink !== 1 || stat.size < 64 || stat.size > maximumBackupBytes)
    fail("database-backup-invalid");
  privateAcl(dump);
  const evidence = await verifyPlainSqlBackup(
    createReadStream(dump, { highWaterMark: 65536 }),
    dumped.status,
  );
  if (evidence.bytes !== stat.size) fail("database-backup-size-changed");
  await privateWrite(
    win32.join(ctx.paths.backup, "target-before.json"),
    JSON.stringify(destination, null, 2) + "\n",
  );
  await privateWrite(
    win32.join(ctx.paths.backup, "receipt.json"),
    JSON.stringify({
      version: 1,
      migrationId: ctx.plan.id,
      database: ctx.plan.expectedDatabase,
      ...evidence,
      createdAt: new Date().toISOString(),
    }) + "\n",
  );
  return evidence;
}
export function assertFreshApproval(
  approval: z.infer<typeof ReviewCentralApprovalSchema>,
  ctx: Pick<Context, "plan" | "planHash">,
  planResultHash: string,
  requestedBy: string,
  now = Date.now(),
) {
  const from = Date.parse(approval.approvedAt),
    until = Date.parse(approval.expiresAt);
  if (
    approval.migrationId !== ctx.plan.id ||
    approval.planSha256 !== ctx.planHash ||
    approval.planResultSha256 !== planResultHash ||
    approval.sourceSha256 !== ctx.plan.sourceSha256 ||
    approval.mappingSha256 !== ctx.plan.mappingSha256 ||
    approval.sqlSha256 !== ctx.plan.sqlSha256 ||
    approval.expectedComputerName !== ctx.plan.expectedComputerName ||
    reviewMigrationHash(approval.expectedDatabase) !==
      reviewMigrationHash(ctx.plan.expectedDatabase) ||
    approval.requestedBy !== requestedBy ||
    from > now ||
    until <= now ||
    until <= from ||
    until - from > 86400000
  )
    fail("approval-mismatch-or-stale");
}
async function applyMigration(ctx: Context) {
  const inputs = await artifacts(ctx),
    resultBytes = await protectedBytes(ctx.paths.result, 1000000);
  const planned = z
    .object({
      planSha256: digest,
      computerName: z.string(),
      activeManifestSha256: digest,
      administratorPolicySha256: digest,
      administratorMapSha256: digest,
      sourceSha256: digest,
      mappingSha256: digest,
      sqlSha256: digest,
      targetWorkspaceId: WorkspaceIdSchema,
      requestedBy: UserIdSchema,
      destinationHash: digest.nullable(),
      resultHash: digest,
      importedHash: digest,
      counts: z.record(z.string(), z.number()),
      inspection: z
        .object({ history: z.array(z.object({ version: z.string(), sha256: digest }).strict()) })
        .passthrough(),
    })
    .passthrough()
    .parse(json(resultBytes));
  if (
    planned.planSha256 !== ctx.planHash ||
    planned.computerName !== ctx.plan.expectedComputerName ||
    planned.activeManifestSha256 !== ctx.activeHash ||
    planned.administratorPolicySha256 !== ctx.policyHash ||
    planned.administratorMapSha256 !== administratorMapHash(ctx.runtime) ||
    planned.sourceSha256 !== ctx.plan.sourceSha256 ||
    planned.mappingSha256 !== ctx.plan.mappingSha256 ||
    planned.sqlSha256 !== ctx.plan.sqlSha256 ||
    planned.targetWorkspaceId !== inputs.mapping.targetWorkspaceId ||
    planned.requestedBy !== inputs.mapping.requestedBy ||
    planned.destinationHash !== inputs.mapping.expectedDestinationHash
  )
    fail("saved-plan-mismatch");
  await verifyApplicationRole(ctx.runtimePool);
  const assertAdministrator = async () => {
    if (
      !(await ctx.authority(inputs.mapping.targetWorkspaceId, inputs.mapping.requestedBy))
        .administrator
    )
      fail("requester-not-administrator");
  };
  await assertAdministrator();
  const inspection = await inspectCentralDatabase(ctx.adminPool, ctx.plan.expectedDatabase);
  if (inspection.schema?.receipts) {
    const prior = await withApplicationTransaction(
      ctx.runtimePool,
      inputs.mapping.targetWorkspaceId,
      async (client) =>
        (
          await client.query(
            "SELECT migration_id,imported_sha256,requested_by FROM frevos.review_migration_receipts WHERE workspace_id=$1 AND source_sha256=$2 AND mapping_sha256=$3",
            [inputs.mapping.targetWorkspaceId, ctx.plan.sourceSha256, ctx.plan.mappingSha256],
          )
        ).rows[0],
    );
    if (prior) {
      if (
        prior.migration_id !== ctx.plan.id ||
        prior.requested_by !== inputs.mapping.requestedBy ||
        prior.imported_sha256 !== planned.importedHash
      )
        fail("receipt-identity-mismatch");
      const receipt = {
        ...envelope(ctx, "apply"),
        status: "already-succeeded",
        migrationId: prior.migration_id,
        importedHash: prior.imported_sha256,
      };
      await privateWrite(ctx.paths.applied, JSON.stringify(receipt, null, 2) + "\n", true);
      return receipt;
    }
  }
  assertCentralMachine(ctx.plan, hostname());
  if (
    reviewMigrationHash(inspection.history.filter((row) => row.version !== sqlName)) !==
    reviewMigrationHash(planned.inspection.history.filter((row) => row.version !== sqlName))
  )
    fail("schema-history-changed");
  const destination = await targetState(
    ctx,
    inputs.mapping.targetWorkspaceId,
    !!inspection.schema?.state,
  );
  const prepared = prepareReviewMigration(inputs.source, inputs.mapping, destination);
  if (
    reviewMigrationHash(prepared.document) !== planned.resultHash ||
    prepared.importedHash !== planned.importedHash
  )
    fail("planned-result-changed");
  await withApplicationTransaction(ctx.runtimePool, inputs.mapping.targetWorkspaceId, (client) =>
    assertMembers(client, inputs.mapping.targetWorkspaceId, prepared.targetUserIds),
  );
  const approvalBytes = await protectedBytes(ctx.paths.approval, 32768),
    approval = ReviewCentralApprovalSchema.parse(json(approvalBytes));
  assertFreshApproval(approval, ctx, hash(resultBytes), inputs.mapping.requestedBy);
  await assertFrozenAuthority(ctx);
  await privateWrite(
    ctx.paths.claim,
    JSON.stringify({
      version: 1,
      approvalSha256: hash(approvalBytes),
      planSha256: ctx.planHash,
      claimedAt: new Date().toISOString(),
    }) + "\n",
  );
  await privateWrite(win32.join(ctx.paths.backup, "source.json"), inputs.sourceBytes);
  await privateWrite(win32.join(ctx.paths.backup, "mapping.json"), inputs.mappingBytes);
  const backup = await databaseBackup(ctx, destination);
  assertCentralMachine(ctx.plan, hostname());
  assertFreshApproval(approval, ctx, hash(resultBytes), inputs.mapping.requestedBy);
  await assertAdministrator();
  await assertFrozenAuthority(ctx);
  const schema = await schemaMigration(ctx, inputs.sql);
  const commitAuthority = async () => {
    assertCentralMachine(ctx.plan, hostname());
    assertFreshApproval(approval, ctx, hash(resultBytes), inputs.mapping.requestedBy);
    await assertFrozenAuthority(ctx);
    await assertAdministrator();
  };
  await commitAuthority();
  const result = await withApplicationTransaction(
    ctx.runtimePool,
    inputs.mapping.targetWorkspaceId,
    (client) =>
      commitCentralReviewData(
        client,
        inputs.source,
        inputs.mapping,
        ctx.plan.sourceSha256 as string,
        ctx.plan.mappingSha256 as string,
        planned.importedHash,
        commitAuthority,
      ),
  );
  const summary = {
    ...envelope(ctx, "apply"),
    ...result,
    schema,
    backup,
    planSha256: ctx.planHash,
    planResultSha256: hash(resultBytes),
    sourceSha256: ctx.plan.sourceSha256,
    mappingSha256: ctx.plan.mappingSha256,
    sqlSha256: ctx.plan.sqlSha256,
    completedAt: new Date().toISOString(),
  };
  await privateWrite(ctx.paths.applied, JSON.stringify(summary, null, 2) + "\n", true);
  return summary;
}
export async function runReviewCentralMigration(args: string[]) {
  if (args.length !== 2 || !["inspect", "plan", "apply"].includes(args[0] ?? ""))
    fail("usage-inspect-plan-apply-planfile");
  const mode = args[0] as string,
    ctx = await context(args[1] as string, mode);
  try {
    if (mode === "inspect") {
      const inspection = await inspectCentralDatabase(ctx.adminPool, ctx.plan.expectedDatabase);
      const reviewDocument = await targetState(
        ctx,
        ctx.policy.workspaceId,
        !!inspection.schema?.state,
      );
      const result = {
        ...envelope(ctx, "inspect"),
        status: "inspected",
        computerName: ctx.plan.expectedComputerName,
        planSha256: ctx.planHash,
        activeManifestSha256: ctx.activeHash,
        administratorPolicySha256: ctx.policyHash,
        administratorPolicy: {
          workspaceId: ctx.policy.workspaceId,
          administrators: ctx.policy.administrators,
        },
        ...inspection,
        reviewState:
          reviewDocument === null
            ? null
            : centralReviewStateMetadata(reviewDocument, ctx.policy.workspaceId),
      };
      await privateWrite(ctx.paths.inspected, JSON.stringify(result, null, 2) + "\n", true);
      return result;
    }
    return mode === "plan" ? await planMigration(ctx) : await applyMigration(ctx);
  } finally {
    await Promise.allSettled([ctx.adminPool.end(), ctx.runtimePool.end()]);
  }
}
export function centralMigrationFailure(error: unknown, observedComputerName = hostname()) {
  const message = error instanceof Error ? error.message : "";
  const code = /^(review-central-migrate|review-migration):[a-z0-9-]+$/.test(message)
    ? message
    : "review-central-migrate:operation-failed";
  return {
    status: "failed" as const,
    code,
    ...(code === "review-central-migrate:computer-mismatch" &&
    /^[A-Za-z0-9.-]{1,253}$/.test(observedComputerName)
      ? { observedComputerName }
      : {}),
  };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  void runReviewCentralMigration(process.argv.slice(2))
    .then((result) => process.stdout.write(JSON.stringify(result) + "\n"))
    .catch((error: unknown) => {
      process.stdout.write(JSON.stringify(centralMigrationFailure(error)) + "\n");
      process.exitCode = 1;
    });
}
