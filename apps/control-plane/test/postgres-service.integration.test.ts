const changeDetails = { message: "Update development code", approvedBy: "Fixture owner / CHG-123" };

import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { OutgoingHttpHeaders } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultDiscoveryPolicy } from "@frevos/contracts";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ComponentDeployments } from "../src/component-deployments.js";
import { registerControlCenter } from "../src/control-center.js";
import { type OidcTransaction, OidcTransactionCodec, sha256 } from "../src/crypto.js";
import {
  createDatabasePool,
  prepareApplicationLoginRole,
  runMigrations,
  verifyApplicationRole,
  verifyDatabaseReadiness,
  withApplicationPrincipalTransaction,
  withApplicationTransaction,
} from "../src/database.js";
import { DeploymentSettingsStore, defaultDeploymentSettings } from "../src/deployment-settings.js";
import { DeveloperConnectorStore } from "../src/developer-connectors.js";
import {
  GithubOnboardingRepository,
  PERSONAL_AGENT_WORKSPACE_ID,
  WINDOWS_GITHUB_AGENT_ID,
} from "../src/github-onboarding.js";
import { LocalDevelopment } from "../src/local-development.js";
import type { AuthenticatedIdentity, OidcProvider } from "../src/oidc.js";
import {
  ProjectAutomationRepository,
  TRACKGRN_AGENT_ID,
  TRACKGRN_PROJECT_ID,
  TRACKGRN_WORKSPACE_ID,
} from "../src/project-automation.js";
import {
  type IdentityPrincipal,
  IdentitySessionRepository,
  WorkspaceRepository,
} from "../src/repositories.js";
import {
  buildServer,
  CSRF_COOKIE,
  OIDC_TRANSACTION_COOKIE,
  SESSION_COOKIE,
} from "../src/server.js";
import { ServixDeploymentStore } from "../src/servix-deployment.js";
import { SystemDiscovery } from "../src/system-discovery.js";

const POSTGRES_IMAGE =
  "postgres:18.4-alpine3.23@sha256:996d0920e4ff9df1fc19dacb904492f3c1ec0ec1cc338f0ad7123be7731c5f5e";
const NOW = new Date("2026-08-10T10:00:00.000Z");
const PUBLIC_ORIGIN = "https://control.frevos.example";

class FakeOidcProvider implements OidcProvider {
  lastTransaction: OidcTransaction | undefined;
  identity: AuthenticatedIdentity = {
    issuer: "https://identity.example",
    subject: "principal-a",
    displayName: "Principal A",
  };

  async createAuthorizationUrl(transaction: OidcTransaction): Promise<URL> {
    this.lastTransaction = transaction;
    return new URL(`https://identity.example/authorize?state=${transaction.state}`);
  }

  async completeAuthorization(
    callbackUrl: URL,
    transaction: OidcTransaction,
  ): Promise<AuthenticatedIdentity> {
    if (callbackUrl.searchParams.get("state") !== transaction.state) {
      throw new Error("synthetic state mismatch");
    }
    return this.identity;
  }
}

let container: StartedPostgreSqlContainer;
let adminPool: Pool;
let pool: Pool;
let identities: IdentitySessionRepository;
let workspaces: WorkspaceRepository;
let automation: ProjectAutomationRepository;
let githubOnboarding: GithubOnboardingRepository;
let principalA: IdentityPrincipal;
let principalB: IdentityPrincipal;
let localPrincipal: IdentityPrincipal;
let alphaClientId: string;

beforeAll(async () => {
  container = await new PostgreSqlContainer(POSTGRES_IMAGE)
    .withDatabase("frevos")
    .withUsername("postgres")
    .withPassword("synthetic-integration-password")
    .start();
  adminPool = new Pool({ connectionString: container.getConnectionUri(), max: 2 });
  await runMigrations(adminPool);
  await runMigrations(adminPool);
  await adminPool.query(`
    CREATE ROLE frevos_test_runtime
      LOGIN PASSWORD 'synthetic-runtime-password'
      NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS;
  `);
  await prepareApplicationLoginRole(adminPool, "frevos_test_runtime");
  await prepareApplicationLoginRole(adminPool, "frevos_test_runtime");
  const runtimeUrl = new URL(container.getConnectionUri());
  runtimeUrl.username = "frevos_test_runtime";
  runtimeUrl.password = "synthetic-runtime-password";
  pool = new Pool({ connectionString: runtimeUrl.toString(), max: 8 });
  await verifyApplicationRole(pool);
  identities = new IdentitySessionRepository(pool);
  workspaces = new WorkspaceRepository(pool);
  automation = new ProjectAutomationRepository(pool);
  githubOnboarding = new GithubOnboardingRepository(pool);
  principalA = await identities.upsertIdentity({
    issuer: "https://identity.example",
    subject: "principal-a",
    displayName: "Principal A",
    now: NOW,
  });
  principalB = await identities.upsertIdentity({
    issuer: "https://identity.example",
    subject: "principal-b",
    displayName: "Principal B",
    now: NOW,
  });
  localPrincipal = await identities.provisionLocalCredential({
    username: "personal.admin",
    password: "personal-password",
    displayName: "Personal Admin",
    now: NOW,
  });
  await workspaces.createWorkspace({
    workspaceId: "ws_alpha",
    displayName: "Alpha Workspace",
    now: NOW,
  });
  await workspaces.createWorkspace({
    workspaceId: "ws_beta",
    displayName: "Beta Workspace",
    now: NOW,
  });
  await workspaces.createMembership({
    workspaceId: "ws_alpha",
    userId: principalA.userId,
    grantedScopes: [
      "workspace:read",
      "client:read",
      "client:write",
      "project:read",
      "project:write",
    ],
    now: NOW,
  });
  await workspaces.createMembership({
    workspaceId: "ws_alpha",
    userId: localPrincipal.userId,
    grantedScopes: ["workspace:read", "client:read", "project:read"],
    now: NOW,
  });
  await workspaces.createMembership({
    workspaceId: "ws_beta",
    userId: principalB.userId,
    grantedScopes: ["workspace:read", "client:read", "project:read"],
    now: NOW,
  });
  await workspaces.createWorkspace({
    workspaceId: "ws_limited",
    displayName: "Limited Workspace",
    now: NOW,
  });
  await workspaces.createMembership({
    workspaceId: "ws_limited",
    userId: principalA.userId,
    grantedScopes: ["client:read"],
    now: NOW,
  });
  const alphaClient = await workspaces.createClient({
    workspaceId: "ws_alpha",
    displayName: "Alpha Client",
    now: NOW,
  });
  alphaClientId = alphaClient.clientId;
  const betaClient = await workspaces.createClient({
    workspaceId: "ws_beta",
    displayName: "Beta Client",
    now: NOW,
  });
  await workspaces.createProject({
    workspaceId: "ws_alpha",
    clientId: alphaClient.clientId,
    displayName: "Alpha Project",
    now: NOW,
  });
  await workspaces.createProject({
    workspaceId: "ws_beta",
    clientId: betaClient.clientId,
    displayName: "Beta Project",
    now: NOW,
  });
  await workspaces.createWorkspace({
    workspaceId: TRACKGRN_WORKSPACE_ID,
    displayName: "TrackGRN UAT Workspace",
    now: NOW,
  });
  await workspaces.createMembership({
    workspaceId: TRACKGRN_WORKSPACE_ID,
    userId: localPrincipal.userId,
    grantedScopes: ["workspace:read", "project:read", "project:write"],
    now: NOW,
  });
  const trackGrnClient = await workspaces.createClient({
    workspaceId: TRACKGRN_WORKSPACE_ID,
    displayName: "TrackGRN Pilot",
    now: NOW,
  });
  await workspaces.createProject({
    workspaceId: TRACKGRN_WORKSPACE_ID,
    clientId: trackGrnClient.clientId,
    projectId: TRACKGRN_PROJECT_ID,
    displayName: "TrackGRN",
    now: NOW,
  });
  const automationSeedClient = await adminPool.connect();
  try {
    await automationSeedClient.query("BEGIN");
    await automationSeedClient.query("SET LOCAL ROLE frevos_owner");
    await automationSeedClient.query("SELECT set_config('frevos.workspace_id', $1, true)", [
      TRACKGRN_WORKSPACE_ID,
    ]);
    await automationSeedClient.query(
      `
        INSERT INTO frevos.project_automation_profiles (
          workspace_id, project_id, provider, provider_repository_id,
          repository_owner, repository_name, repository_url, default_branch,
          agent_id, environment, public_origin, api_base_path, health_path,
          swagger_path, allowed_actions, created_at
        ) VALUES (
          $1, $2, 'github', '1334902237', 'mishrarishav', 'TraceGRN',
          'https://github.com/mishrarishav/TraceGRN', 'main', $3, 'uat',
          'https://tserver2.eeslindia.org', '/apiTrackGrn',
          '/apiTrackGrn/health/live', '/apiTrackGrn/swagger',
          ARRAY[
            'repository.inspect', 'repository.propose-commit',
            'repository.commit-push', 'repository.open-pull-request',
            'repository.squash-merge', 'project.build', 'uat.deploy'
          ], $4
        )
      `,
      [TRACKGRN_WORKSPACE_ID, TRACKGRN_PROJECT_ID, TRACKGRN_AGENT_ID, NOW],
    );
    await automationSeedClient.query("COMMIT");
  } catch (error) {
    await automationSeedClient.query("ROLLBACK");
    throw error;
  } finally {
    automationSeedClient.release();
  }
}, 120_000);

afterAll(async () => {
  await pool?.end();
  await adminPool?.end();
  await container?.stop();
});

describe("PostgreSQL application boundary", () => {
  it("uses an unprivileged non-owner role and forces RLS on every tenant table", async () => {
    await expect(verifyApplicationRole(pool)).resolves.toBeUndefined();
    await expect(verifyDatabaseReadiness(pool)).resolves.toBeUndefined();
    await expect(verifyApplicationRole(adminPool)).rejects.toThrow("required unprivileged role");
    await expect(prepareApplicationLoginRole(adminPool, "postgres")).rejects.toThrow(
      "missing or privileged",
    );
    await expect(prepareApplicationLoginRole(adminPool, "bad-role")).rejects.toThrow(
      "invalid name",
    );
    await expect(pool.query("SELECT user_id FROM frevos.users")).rejects.toThrow(
      "permission denied",
    );

    const membershipResult = await adminPool.query<{
      admin_option: boolean;
      inherit_option: boolean;
      set_option: boolean;
    }>(`
      SELECT membership.admin_option, membership.inherit_option, membership.set_option
      FROM pg_auth_members AS membership
      INNER JOIN pg_roles AS granted_role ON granted_role.oid = membership.roleid
      INNER JOIN pg_roles AS member_role ON member_role.oid = membership.member
      WHERE granted_role.rolname = 'frevos_app'
        AND member_role.rolname = 'frevos_test_runtime'
    `);
    expect(membershipResult.rows).toEqual([
      { admin_option: false, inherit_option: false, set_option: true },
    ]);

    const roleResult = await adminPool.query<{
      rolname: string;
      rolcanlogin: boolean;
      rolsuper: boolean;
      rolcreaterole: boolean;
      rolcreatedb: boolean;
      rolbypassrls: boolean;
    }>(
      `
        SELECT rolname, rolcanlogin, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls
        FROM pg_roles
        WHERE rolname = 'frevos_app'
      `,
    );
    expect(roleResult.rows).toEqual([
      {
        rolname: "frevos_app",
        rolcanlogin: false,
        rolsuper: false,
        rolcreaterole: false,
        rolcreatedb: false,
        rolbypassrls: false,
      },
    ]);

    const tableResult = await adminPool.query<{
      relname: string;
      relowner: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `
        SELECT c.relname, r.rolname AS relowner, c.relrowsecurity, c.relforcerowsecurity
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_roles r ON r.oid = c.relowner
        WHERE n.nspname = 'frevos'
          AND c.relname IN ('workspaces', 'workspace_memberships', 'clients', 'projects')
        ORDER BY c.relname
      `,
    );
    expect(tableResult.rows).toHaveLength(4);
    expect(tableResult.rows.every((row) => row.relowner === "frevos_owner")).toBe(true);
    expect(tableResult.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(
      true,
    );

    const resolverResult = await adminPool.query<{
      owner: string;
      prosecdef: boolean;
      proconfig: string[];
    }>(`
      SELECT owner.rolname AS owner, procedure.prosecdef, procedure.proconfig
      FROM pg_proc AS procedure
      JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
      JOIN pg_roles AS owner ON owner.oid = procedure.proowner
      WHERE namespace.nspname = 'frevos'
        AND procedure.proname = 'resolve_workspace_evidence'
    `);
    expect(resolverResult.rows).toEqual([
      {
        owner: "frevos_owner",
        prosecdef: true,
        proconfig: ["search_path=pg_catalog, frevos"],
      },
    ]);
  });

  it("rejects a changed applied migration checksum and rolls the transaction back", async () => {
    const migrationsDirectory = await mkdtemp(join(tmpdir(), "frevos-migrations-"));
    try {
      const migrationSource = await readFile(
        new URL("../migrations/0001_identity_workspace.sql", import.meta.url),
        "utf8",
      );
      await writeFile(
        join(migrationsDirectory, "0001_identity_workspace.sql"),
        `${migrationSource}\n-- changed after application\n`,
        { mode: 0o600 },
      );
      await expect(runMigrations(adminPool, migrationsDirectory)).rejects.toThrow(
        "has a different checksum",
      );
    } finally {
      await rm(migrationsDirectory, { recursive: true, force: true });
    }

    const unopenedPool = createDatabasePool("postgresql://invalid.invalid/frevos");
    await unopenedPool.end();
  });

  it("denies missing and mismatched context independently of repository predicates", async () => {
    const missingCount = await withApplicationTransaction(pool, undefined, async (client) => {
      const result = await client.query<{ count: string }>("SELECT count(*) FROM frevos.clients");
      return Number(result.rows[0]?.count);
    });
    expect(missingCount).toBe(0);

    await expect(
      withApplicationTransaction(pool, undefined, async (client) =>
        client.query(
          `
            INSERT INTO frevos.clients (client_id, workspace_id, display_name, status, created_at)
            VALUES ('cli_missing_context', 'ws_alpha', 'Denied', 'active', $1)
          `,
          [NOW],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });

    const crossRead = await withApplicationTransaction(pool, "ws_beta", async (client) =>
      client.query("SELECT client_id FROM frevos.clients WHERE client_id = $1", [alphaClientId]),
    );
    expect(crossRead.rows).toEqual([]);

    await expect(
      withApplicationTransaction(pool, "ws_alpha", async (client) =>
        client.query(
          `
            INSERT INTO frevos.clients (client_id, workspace_id, display_name, status, created_at)
            VALUES ('cli_wrong_context', 'ws_beta', 'Denied', 'active', $1)
          `,
          [NOW],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });

    await expect(
      withApplicationTransaction(pool, "ws_alpha", async (client) =>
        client.query("UPDATE frevos.clients SET workspace_id = 'ws_beta' WHERE client_id = $1", [
          alphaClientId,
        ]),
      ),
    ).rejects.toMatchObject({ code: "42501" });

    await expect(
      workspaces.createProject({
        workspaceId: "ws_beta",
        clientId: alphaClientId,
        displayName: "Cross-reference",
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      workspaces.updateClientDisplayName({
        workspaceId: "ws_beta",
        clientId: alphaClientId,
        displayName: "Cross-update",
      }),
    ).resolves.toBeNull();

    const runtimeUrl = new URL(container.getConnectionUri());
    runtimeUrl.username = "frevos_test_runtime";
    runtimeUrl.password = "synthetic-runtime-password";
    const singleConnectionPool = new Pool({ connectionString: runtimeUrl.toString(), max: 1 });
    try {
      const visible = await withApplicationTransaction(
        singleConnectionPool,
        "ws_alpha",
        async (client) => client.query("SELECT client_id FROM frevos.clients"),
      );
      expect(visible.rowCount).toBeGreaterThan(0);
      const cleared = await withApplicationTransaction(
        singleConnectionPool,
        undefined,
        async (client) => client.query("SELECT client_id FROM frevos.clients"),
      );
      expect(cleared.rows).toEqual([]);
    } finally {
      await singleConnectionPool.end();
    }
  });

  it("discovers only the authenticated principal memberships without opening tenant data", async () => {
    const missingPrincipal = await withApplicationTransaction(pool, undefined, async (client) => {
      const memberships = await client.query(
        "SELECT membership_id FROM frevos.workspace_memberships",
      );
      const workspacesResult = await client.query("SELECT workspace_id FROM frevos.workspaces");
      return { memberships: memberships.rows, workspaces: workspacesResult.rows };
    });
    expect(missingPrincipal).toEqual({ memberships: [], workspaces: [] });

    const principalRows = await withApplicationPrincipalTransaction(
      pool,
      principalA.userId,
      async (client) => {
        const memberships = await client.query<{ workspace_id: string }>(
          "SELECT workspace_id FROM frevos.workspace_memberships ORDER BY workspace_id",
        );
        const workspaceRows = await client.query<{ workspace_id: string }>(
          "SELECT workspace_id FROM frevos.workspaces ORDER BY workspace_id",
        );
        const clients = await client.query("SELECT client_id FROM frevos.clients");
        return {
          memberships: memberships.rows.map((row) => row.workspace_id),
          workspaces: workspaceRows.rows.map((row) => row.workspace_id),
          clients: clients.rows,
        };
      },
    );
    expect(principalRows).toEqual({
      memberships: ["ws_alpha", "ws_limited"],
      workspaces: ["ws_alpha", "ws_limited"],
      clients: [],
    });

    await expect(
      withApplicationPrincipalTransaction(pool, principalA.userId, async (client) =>
        client.query(
          `
            INSERT INTO frevos.workspace_memberships (
              membership_id, workspace_id, user_id, status, granted_scopes, created_at
            ) VALUES ('wsm_principal_write', 'ws_beta', $1, 'active', ARRAY['workspace:read'], $2)
          `,
          [principalA.userId, NOW],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });

    const runtimeUrl = new URL(container.getConnectionUri());
    runtimeUrl.username = "frevos_test_runtime";
    runtimeUrl.password = "synthetic-runtime-password";
    const singleConnectionPool = new Pool({ connectionString: runtimeUrl.toString(), max: 1 });
    try {
      const visible = await withApplicationPrincipalTransaction(
        singleConnectionPool,
        principalA.userId,
        async (client) => client.query("SELECT workspace_id FROM frevos.workspace_memberships"),
      );
      expect(visible.rowCount).toBe(2);
      const cleared = await withApplicationTransaction(
        singleConnectionPool,
        undefined,
        async (client) => client.query("SELECT workspace_id FROM frevos.workspace_memberships"),
      );
      expect(cleared.rows).toEqual([]);
    } finally {
      await singleConnectionPool.end();
    }
  });

  it("returns only scoped records and server-constructed membership evidence", async () => {
    expect((await workspaces.listClients("ws_alpha")).map((client) => client.displayName)).toEqual([
      "Alpha Client",
    ]);
    expect(
      (await workspaces.listProjects("ws_beta")).map((project) => project.displayName),
    ).toEqual(["Beta Project"]);
    expect((await workspaces.getEvidence("ws_alpha", principalA.userId))?.membership?.userId).toBe(
      principalA.userId,
    );
    await expect(workspaces.getEvidence("ws_alpha", principalB.userId)).resolves.toBeNull();
    await expect(workspaces.getEvidence("ws_unknown", principalA.userId)).resolves.toBeNull();
    expect(
      (await workspaces.listEvidenceForPrincipal(principalA.userId)).map(
        (candidate) => candidate.workspace.workspaceId,
      ),
    ).toEqual(["ws_alpha", "ws_limited"]);
    expect(
      (await workspaces.listEvidenceForPrincipal(principalB.userId)).map(
        (candidate) => candidate.workspace.workspaceId,
      ),
    ).toEqual(["ws_beta"]);
  });

  it("supports optional repository fields without weakening workspace scope", async () => {
    const principal = await identities.upsertIdentity({
      issuer: "https://identity.example",
      subject: "principal-without-profile",
    });
    const again = await identities.upsertIdentity({
      issuer: "https://identity.example",
      subject: "principal-without-profile",
    });
    expect(again.userId).toBe(principal.userId);

    const workspace = await workspaces.createWorkspace({ displayName: "Generated Workspace" });
    await workspaces.createMembership({
      workspaceId: workspace.workspaceId,
      userId: principal.userId,
      grantedScopes: ["workspace:read"],
    });
    const client = await workspaces.createClient({
      workspaceId: workspace.workspaceId,
      displayName: "Generated Client",
    });
    await expect(
      workspaces.updateClientDisplayName({
        workspaceId: workspace.workspaceId,
        clientId: client.clientId,
        displayName: "Renamed Client",
      }),
    ).resolves.toMatchObject({ displayName: "Renamed Client" });
    const project = await workspaces.createProject({
      workspaceId: workspace.workspaceId,
      displayName: "Clientless Project",
    });
    expect(project.clientId).toBeUndefined();
    expect(await workspaces.listProjects(workspace.workspaceId)).toContainEqual(project);

    const session = await identities.createSession({ principal });
    await expect(identities.authenticate(session.rawToken)).resolves.toMatchObject({
      context: { sessionId: session.context.sessionId },
    });
  });
});

describe("durable identity and session lifecycle", () => {
  it("authenticates local credentials without storing a plaintext password", async () => {
    await expect(
      identities.authenticateLocalCredential({
        username: "PERSONAL.ADMIN",
        password: "personal-password",
        now: NOW,
      }),
    ).resolves.toMatchObject({ userId: localPrincipal.userId });
    await expect(
      identities.authenticateLocalCredential({
        username: "personal.admin",
        password: "incorrect-password",
        now: NOW,
      }),
    ).resolves.toBeNull();
    const columns = await adminPool.query<{ column_name: string }>(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'frevos' AND table_name = 'local_credentials'
      `,
    );
    expect(columns.rows.map((row) => row.column_name)).not.toContain("password");
  });

  it("temporarily locks a local credential after five failed attempts", async () => {
    const lockedPrincipal = await identities.provisionLocalCredential({
      username: "lock.test",
      password: "correct-password",
      displayName: "Lock Test",
      now: NOW,
    });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        identities.authenticateLocalCredential({
          username: "lock.test",
          password: "wrong-password",
          now: new Date(NOW.getTime() + attempt),
        }),
      ).resolves.toBeNull();
    }
    await expect(
      identities.authenticateLocalCredential({
        username: "lock.test",
        password: "correct-password",
        now: new Date(NOW.getTime() + 60_000),
      }),
    ).resolves.toBeNull();
    await expect(
      identities.authenticateLocalCredential({
        username: "lock.test",
        password: "correct-password",
        now: new Date(NOW.getTime() + 16 * 60_000),
      }),
    ).resolves.toMatchObject({ userId: lockedPrincipal.userId });
  });

  it("maps exact issuer and subject pairs without duplicating users", async () => {
    const again = await identities.upsertIdentity({
      issuer: "https://identity.example",
      subject: "principal-a",
      displayName: "Principal A Updated",
      now: new Date(NOW.getTime() + 1_000),
    });
    expect(again.userId).toBe(principalA.userId);
    expect(again.identity.identityId).toBe(principalA.identity.identityId);
    expect(again.identity.lastAuthenticatedAt).toBe("2026-08-10T10:00:01.000Z");
    await expect(
      identities.upsertIdentity({
        issuer: "http://identity.invalid",
        subject: "principal-a",
      }),
    ).rejects.toThrow();
  });

  it("stores digest-backed short sessions, rotates a presented session, and enforces expiry", async () => {
    const first = await identities.createSession({ principal: principalA, now: NOW });
    expect(
      await identities.authenticate(first.rawToken, new Date(NOW.getTime() + 60_000)),
    ).toMatchObject({ context: { sessionId: first.context.sessionId, status: "active" } });

    const rotated = await identities.createSession({
      principal: principalA,
      previousRawToken: first.rawToken,
      now: new Date(NOW.getTime() + 120_000),
    });
    expect(rotated.rawToken).not.toBe(first.rawToken);
    await expect(
      identities.authenticate(first.rawToken, new Date(NOW.getTime() + 180_000)),
    ).resolves.toBeNull();
    await expect(
      identities.revoke(rotated.rawToken, new Date(NOW.getTime() + 180_000)),
    ).resolves.toBe(true);
    await expect(
      identities.revoke(rotated.rawToken, new Date(NOW.getTime() + 180_001)),
    ).resolves.toBe(false);

    const idle = await identities.createSession({ principal: principalA, now: NOW });
    await expect(
      identities.authenticate(idle.rawToken, new Date(NOW.getTime() + 31 * 60_000)),
    ).resolves.toBeNull();

    await expect(
      withApplicationTransaction(pool, undefined, async (client) =>
        client.query(
          `
            INSERT INTO frevos.sessions (
              session_id, user_id, identity_id, token_hash, csrf_hash, status,
              authenticated_at, last_seen_at, idle_expires_at, expires_at
            ) VALUES (
              'ses_mismatched_principal', $1, $2, $3, $4, 'active',
              $5, $5, $6, $7
            )
          `,
          [
            principalA.userId,
            principalB.identity.identityId,
            randomBytes(32),
            randomBytes(32),
            NOW,
            new Date(NOW.getTime() + 30 * 60_000),
            new Date(NOW.getTime() + 12 * 60 * 60_000),
          ],
        ),
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });
});

describe("Fastify BFF and protected workspace APIs", () => {
  it("supports internal HTTP login, scoped cookies, CSRF and logout without accepting HTTPS cookies", async () => {
    const origin = "http://10.9.69.20";
    await expect(
      buildServer({ publicOrigin: origin, identitySessions: identities, workspaces }),
    ).rejects.toThrow("requires local auth");
    const server = await buildServer({
      publicOrigin: origin,
      authMode: "local",
      identitySessions: identities,
      workspaces,
      now: () => NOW,
    });
    try {
      const login = await server.inject({
        method: "POST",
        url: "/auth/login",
        headers: { origin },
        payload: { username: "personal.admin", password: "personal-password" },
      });
      expect(login.statusCode).toBe(204);
      const sessionCookie = cookiePair(login, "frevos-internal-session");
      const csrfCookie = cookiePair(login, "frevos-internal-csrf");
      expect(setCookieValue(login, "frevos-internal-session")).toContain("HttpOnly");
      expect(setCookieValue(login, "frevos-internal-session")).not.toContain("Secure");
      expect(setCookieValue(login, "frevos-internal-session")).toContain("SameSite=Strict");
      const cookies = `${sessionCookie}; ${csrfCookie}`;
      expect(
        (await server.inject({ url: "/v1/session", headers: { cookie: cookies } })).statusCode,
      ).toBe(200);
      expect(
        (await server.inject({ url: "/v1/workspaces/ws_alpha", headers: { cookie: cookies } }))
          .statusCode,
      ).toBe(200);
      expect(
        (
          await server.inject({
            url: "/v1/session",
            headers: { cookie: sessionCookie.replace("frevos-internal-session", SESSION_COOKIE) },
          })
        ).statusCode,
      ).toBe(401);
      const csrf = csrfCookie.substring(csrfCookie.indexOf("=") + 1);
      for (const headers of [
        { origin: "http://wrong.invalid", "x-csrf-token": csrf },
        { origin, "x-csrf-token": "wrong" },
      ]) {
        expect(
          (
            await server.inject({
              method: "POST",
              url: "/auth/logout",
              headers: { cookie: cookies, ...headers },
              payload: {},
            })
          ).statusCode,
        ).toBe(403);
      }
      const rotated = await server.inject({
        method: "POST",
        url: "/auth/login",
        headers: { origin, cookie: cookies },
        payload: { username: "personal.admin", password: "personal-password" },
      });
      expect(rotated.statusCode).toBe(204);
      expect(
        (await server.inject({ url: "/v1/session", headers: { cookie: cookies } })).statusCode,
      ).toBe(401);
      const freshCookie = `${cookiePair(rotated, "frevos-internal-session")}; ${cookiePair(rotated, "frevos-internal-csrf")}`;
      const freshCsrf = cookiePair(rotated, "frevos-internal-csrf").split("=")[1];
      const logout = await server.inject({
        method: "POST",
        url: "/auth/logout",
        headers: { cookie: freshCookie, origin, "x-csrf-token": freshCsrf },
        payload: {},
      });
      expect(logout.statusCode).toBe(204);
      expect(setCookieValue(logout, "frevos-internal-session")).toContain("Max-Age=0");
      expect(
        (await server.inject({ url: "/v1/session", headers: { cookie: freshCookie } })).statusCode,
      ).toBe(401);
    } finally {
      await server.close();
    }
  });

  it("creates the same hardened server session from a local login", async () => {
    const server = await buildServer({
      publicOrigin: PUBLIC_ORIGIN,
      authMode: "local",
      identitySessions: identities,
      workspaces,
      now: () => NOW,
    });
    try {
      expect(
        (
          await server.inject({
            method: "POST",
            url: "/auth/login",
            payload: { username: "personal.admin", password: "personal-password" },
          })
        ).statusCode,
      ).toBe(403);
      const rejected = await server.inject({
        method: "POST",
        url: "/auth/login",
        headers: { origin: PUBLIC_ORIGIN },
        payload: { username: "personal.admin", password: "wrong-password" },
      });
      expect(rejected.statusCode).toBe(401);
      expect(rejected.json()).toEqual({ error: "invalid-credentials" });

      const login = await server.inject({
        method: "POST",
        url: "/auth/login",
        headers: { origin: PUBLIC_ORIGIN },
        payload: { username: "PERSONAL.ADMIN", password: "personal-password" },
      });
      expect(login.statusCode).toBe(204);
      const sessionCookie = cookiePair(login, SESSION_COOKIE);
      expect(setCookieValue(login, SESSION_COOKIE)).toContain("HttpOnly");
      expect(setCookieValue(login, SESSION_COOKIE)).toContain("Secure");
      expect(setCookieValue(login, SESSION_COOKIE)).toContain("SameSite=Strict");
      expect(setCookieValue(login, SESSION_COOKIE)).not.toContain("Domain=");
      const session = await server.inject({
        method: "GET",
        url: "/v1/session",
        headers: { cookie: sessionCookie },
      });
      expect(session.statusCode).toBe(200);
      expect(session.json()).toMatchObject({ userId: localPrincipal.userId });
      expect((await server.inject({ method: "GET", url: "/auth/callback" })).statusCode).toBe(404);
    } finally {
      await server.close();
    }
  });

  it("executes OIDC, hardened cookies, authorization, CSRF, rotation, and logout", async () => {
    const oidcProvider = new FakeOidcProvider();
    const codec = new OidcTransactionCodec(randomBytes(32));
    let databaseAvailable = true;
    const assetsDirectory = await mkdtemp(join(tmpdir(), "frevos-integrated-control-center-"));
    await writeFile(join(assetsDirectory, "index.html"), "<!doctype html><title>FrevOS</title>");
    const server = await buildServer({
      publicOrigin: PUBLIC_ORIGIN,
      oidcProvider,
      transactionCodec: codec,
      identitySessions: identities,
      workspaces,
      now: () => NOW,
      readiness: async () => {
        if (!databaseAvailable) {
          throw new Error("synthetic database outage");
        }
      },
    });
    await registerControlCenter(server, assetsDirectory);

    try {
      const healthy = await server.inject({ method: "GET", url: "/health" });
      expect(healthy.json()).toEqual({
        status: "ok",
      });
      expect(healthy.headers["content-security-policy"]).toContain("default-src 'self'");
      databaseAvailable = false;
      const unavailableHealth = await server.inject({ method: "GET", url: "/health" });
      expect(unavailableHealth.statusCode).toBe(503);
      expect(unavailableHealth.json()).toEqual({ status: "unavailable" });
      databaseAvailable = true;
      expect((await server.inject({ method: "GET", url: "/v1/session" })).statusCode).toBe(401);
      expect((await server.inject({ method: "GET", url: "/v1/workspaces" })).statusCode).toBe(401);
      expect((await server.inject({ method: "GET", url: "/auth/callback" })).statusCode).toBe(400);

      const firstLogin = await server.inject({ method: "GET", url: "/auth/login" });
      expect(firstLogin.statusCode).toBe(302);
      expect(firstLogin.headers.location).toMatch(/^https:\/\/identity\.example\/authorize/);
      const firstTransactionCookie = cookiePair(firstLogin, OIDC_TRANSACTION_COOKIE);
      expect(setCookieValue(firstLogin, OIDC_TRANSACTION_COOKIE)).toContain("HttpOnly");
      expect(setCookieValue(firstLogin, OIDC_TRANSACTION_COOKIE)).toContain("Secure");
      expect(setCookieValue(firstLogin, OIDC_TRANSACTION_COOKIE)).toContain("SameSite=Strict");
      expect(setCookieValue(firstLogin, OIDC_TRANSACTION_COOKIE)).not.toContain("Domain=");

      const firstCallback = await server.inject({
        method: "GET",
        url: `/auth/callback?code=synthetic&state=${oidcProvider.lastTransaction?.state}`,
        headers: { cookie: firstTransactionCookie },
      });
      expect(firstCallback.statusCode).toBe(302);
      expect(firstCallback.headers.location).toBe(`${PUBLIC_ORIGIN}/`);
      const firstSessionCookie = cookiePair(firstCallback, SESSION_COOKIE);
      const firstCsrfCookie = cookiePair(firstCallback, CSRF_COOKIE);
      const firstCsrfToken = firstCsrfCookie.slice(`${CSRF_COOKIE}=`.length);
      expect(setCookieValue(firstCallback, SESSION_COOKIE)).toContain("HttpOnly");
      expect(setCookieValue(firstCallback, CSRF_COOKIE)).not.toContain("HttpOnly");

      const sessionResponse = await server.inject({
        method: "GET",
        url: "/v1/session",
        headers: { cookie: firstSessionCookie },
      });
      expect(sessionResponse.statusCode).toBe(200);
      expect(sessionResponse.json()).toMatchObject({ userId: principalA.userId });
      expect(JSON.stringify(sessionResponse.json())).not.toContain("token");

      const workspaceList = await server.inject({
        method: "GET",
        url: "/v1/workspaces",
        headers: { cookie: firstSessionCookie },
      });
      expect(workspaceList.statusCode).toBe(200);
      expect(workspaceList.json()).toEqual([
        {
          workspaceId: "ws_alpha",
          displayName: "Alpha Workspace",
          status: "active",
          createdAt: NOW.toISOString(),
        },
      ]);
      expect(JSON.stringify(workspaceList.json())).not.toContain("ws_beta");
      expect(JSON.stringify(workspaceList.json())).not.toContain("ws_limited");

      const deniedWorkspace = await server.inject({
        method: "GET",
        url: "/v1/workspaces/ws_beta",
        headers: { cookie: firstSessionCookie },
      });
      expect(deniedWorkspace.statusCode).toBe(404);
      const allowedWorkspace = await server.inject({
        method: "GET",
        url: "/v1/workspaces/ws_alpha",
        headers: { cookie: firstSessionCookie },
      });
      expect(allowedWorkspace.statusCode).toBe(200);
      expect(allowedWorkspace.json()).toMatchObject({ workspaceId: "ws_alpha" });
      expect(
        (
          await server.inject({
            method: "GET",
            url: "/v1/workspaces/ws_not_found",
            headers: { cookie: firstSessionCookie },
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await server.inject({
            method: "GET",
            url: "/v1/workspaces/not-valid",
            headers: { cookie: firstSessionCookie },
          })
        ).statusCode,
      ).toBe(400);

      const missingCsrf = await server.inject({
        method: "POST",
        url: "/v1/workspaces/ws_alpha/clients",
        headers: { cookie: `${firstSessionCookie}; ${firstCsrfCookie}` },
        payload: { displayName: "API Client" },
      });
      expect(missingCsrf.statusCode).toBe(403);
      const createdClient = await server.inject({
        method: "POST",
        url: "/v1/workspaces/ws_alpha/clients",
        headers: {
          cookie: `${firstSessionCookie}; ${firstCsrfCookie}`,
          origin: PUBLIC_ORIGIN,
          "x-csrf-token": firstCsrfToken,
        },
        payload: { displayName: "API Client" },
      });
      expect(createdClient.statusCode).toBe(201);
      expect(createdClient.json()).toMatchObject({
        workspaceId: "ws_alpha",
        displayName: "API Client",
      });
      expect(
        (
          await server.inject({
            method: "GET",
            url: "/v1/workspaces/ws_alpha/clients",
            headers: { cookie: firstSessionCookie },
          })
        ).json(),
      ).toHaveLength(2);

      const createdProject = await server.inject({
        method: "POST",
        url: "/v1/workspaces/ws_alpha/projects",
        headers: {
          cookie: `${firstSessionCookie}; ${firstCsrfCookie}`,
          origin: PUBLIC_ORIGIN,
          "x-csrf-token": firstCsrfToken,
        },
        payload: { displayName: "API Project", clientId: alphaClientId },
      });
      expect(createdProject.statusCode).toBe(201);
      expect(
        (
          await server.inject({
            method: "GET",
            url: "/v1/workspaces/ws_alpha/projects",
            headers: { cookie: firstSessionCookie },
          })
        ).json(),
      ).toHaveLength(2);

      const invalidBody = await server.inject({
        method: "POST",
        url: "/v1/workspaces/ws_alpha/clients",
        headers: {
          cookie: `${firstSessionCookie}; ${firstCsrfCookie}`,
          origin: PUBLIC_ORIGIN,
          "x-csrf-token": firstCsrfToken,
        },
        payload: { displayName: " padded " },
      });
      expect(invalidBody.statusCode).toBe(400);

      const secondLogin = await server.inject({ method: "GET", url: "/auth/login" });
      const secondCallback = await server.inject({
        method: "GET",
        url: `/auth/callback?code=synthetic&state=${oidcProvider.lastTransaction?.state}`,
        headers: {
          cookie: `${cookiePair(secondLogin, OIDC_TRANSACTION_COOKIE)}; ${firstSessionCookie}`,
        },
      });
      const secondSessionCookie = cookiePair(secondCallback, SESSION_COOKIE);
      const secondCsrfCookie = cookiePair(secondCallback, CSRF_COOKIE);
      const secondCsrfToken = secondCsrfCookie.slice(`${CSRF_COOKIE}=`.length);
      expect(secondSessionCookie).not.toBe(firstSessionCookie);
      expect(
        (
          await server.inject({
            method: "GET",
            url: "/v1/session",
            headers: { cookie: firstSessionCookie },
          })
        ).statusCode,
      ).toBe(401);

      const badLogout = await server.inject({
        method: "POST",
        url: "/auth/logout",
        headers: {
          cookie: `${secondSessionCookie}; ${secondCsrfCookie}`,
          origin: PUBLIC_ORIGIN,
          "x-csrf-token": "wrong",
        },
      });
      expect(badLogout.statusCode).toBe(403);
      const logout = await server.inject({
        method: "POST",
        url: "/auth/logout",
        headers: {
          cookie: `${secondSessionCookie}; ${secondCsrfCookie}`,
          origin: PUBLIC_ORIGIN,
          "x-csrf-token": secondCsrfToken,
        },
      });
      expect(logout.statusCode).toBe(204);
      expect(
        (
          await server.inject({
            method: "GET",
            url: "/v1/session",
            headers: { cookie: secondSessionCookie },
          })
        ).statusCode,
      ).toBe(401);
    } finally {
      await server.close();
      await rm(assetsDirectory, { recursive: true, force: true });
    }
  });

  it("fails closed for tampered transactions and provider callback failures", async () => {
    const oidcProvider = new FakeOidcProvider();
    const server = await buildServer({
      publicOrigin: PUBLIC_ORIGIN,
      oidcProvider,
      transactionCodec: new OidcTransactionCodec(randomBytes(32)),
      identitySessions: identities,
      workspaces,
      now: () => NOW,
    });
    try {
      const tampered = await server.inject({
        method: "GET",
        url: "/auth/callback?code=synthetic&state=wrong",
        headers: { cookie: `${OIDC_TRANSACTION_COOKIE}=tampered` },
      });
      expect(tampered.statusCode).toBe(400);

      const login = await server.inject({ method: "GET", url: "/auth/login" });
      const failed = await server.inject({
        method: "GET",
        url: "/auth/callback?code=synthetic&state=wrong",
        headers: { cookie: cookiePair(login, OIDC_TRANSACTION_COOKIE) },
      });
      expect(failed.statusCode).toBe(400);
      expect(failed.json()).toEqual({ error: "invalid-auth-callback" });
    } finally {
      await server.close();
    }
  });
});

describe("TrackGRN UAT automation pilot", () => {
  const agentToken = "synthetic-trackgrn-agent-token-0001";

  it("authorizes the exact agent, preserves workspace scope, and completes one claimed job", async () => {
    const server = await buildServer({
      publicOrigin: PUBLIC_ORIGIN,
      authMode: "local",
      identitySessions: identities,
      workspaces,
      automation,
      trackGrnAgentTokenHash: sha256(agentToken),
      now: () => NOW,
    });
    try {
      const agentHeaders = {
        authorization: `Bearer ${agentToken}`,
        "x-frevos-agent-id": TRACKGRN_AGENT_ID,
      };
      for (const headers of [
        { authorization: `Bearer ${agentToken}`, "x-frevos-agent-id": "svc_wrong_agent" },
        { "x-frevos-agent-id": TRACKGRN_AGENT_ID },
        { authorization: "Bearer short", "x-frevos-agent-id": TRACKGRN_AGENT_ID },
      ]) {
        expect(
          (
            await server.inject({
              method: "POST",
              url: "/v1/agents/trackgrn/claim",
              headers,
            })
          ).statusCode,
        ).toBe(401);
      }
      expect(
        (
          await server.inject({
            method: "POST",
            url: "/v1/agents/trackgrn/claim",
            headers: {
              ...agentHeaders,
              authorization: "Bearer wrong-token-that-is-long-enough-000",
            },
          })
        ).statusCode,
      ).toBe(401);
      expect(
        (
          await server.inject({
            method: "POST",
            url: "/v1/agents/trackgrn/claim",
            headers: agentHeaders,
          })
        ).statusCode,
      ).toBe(204);

      const login = await server.inject({
        method: "POST",
        url: "/auth/login",
        headers: { origin: PUBLIC_ORIGIN },
        payload: { username: "personal.admin", password: "personal-password" },
      });
      const sessionCookie = cookiePair(login, SESSION_COOKIE);
      const csrfCookie = cookiePair(login, CSRF_COOKIE);
      const csrfToken = csrfCookie.slice(`${CSRF_COOKIE}=`.length);
      const browserHeaders = {
        cookie: `${sessionCookie}; ${csrfCookie}`,
        origin: PUBLIC_ORIGIN,
        "x-csrf-token": csrfToken,
      };
      const profile = await server.inject({
        method: "GET",
        url: `/v1/workspaces/${TRACKGRN_WORKSPACE_ID}/projects/${TRACKGRN_PROJECT_ID}/automation`,
        headers: { cookie: sessionCookie },
      });
      expect(profile.statusCode).toBe(200);
      expect(profile.json()).toMatchObject({
        workspaceId: TRACKGRN_WORKSPACE_ID,
        projectId: TRACKGRN_PROJECT_ID,
        repository: { providerRepositoryId: "1334902237" },
        environment: "uat",
        allowedActions: expect.arrayContaining([
          "repository.open-pull-request",
          "repository.squash-merge",
        ]),
      });

      const missingProfileUrl = `/v1/workspaces/${TRACKGRN_WORKSPACE_ID}/projects/prj_missing_profile/automation`;
      expect(
        (
          await server.inject({
            method: "GET",
            url: missingProfileUrl,
            headers: { cookie: sessionCookie },
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await server.inject({
            method: "GET",
            url: `${missingProfileUrl}/operations`,
            headers: { cookie: sessionCookie },
          })
        ).statusCode,
      ).toBe(404);

      const createUrl = `/v1/workspaces/${TRACKGRN_WORKSPACE_ID}/projects/${TRACKGRN_PROJECT_ID}/automation/operations`;
      expect(
        (
          await server.inject({
            method: "POST",
            url: createUrl,
            headers: { cookie: sessionCookie },
            payload: { action: "repository.inspect", input: {} },
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await server.inject({
            method: "POST",
            url: `${missingProfileUrl}/operations`,
            headers: browserHeaders,
            payload: { action: "repository.inspect", input: {} },
          })
        ).statusCode,
      ).toBe(404);
      const created = await server.inject({
        method: "POST",
        url: createUrl,
        headers: browserHeaders,
        payload: { action: "repository.inspect", input: {} },
      });
      expect(created.statusCode).toBe(202);
      expect(created.json()).toMatchObject({
        action: "repository.inspect",
        status: "queued",
        requestedBy: localPrincipal.userId,
      });
      const operationUrl = `${createUrl}/${created.json().operationId}`;
      expect(
        (
          await server.inject({
            method: "GET",
            url: operationUrl,
            headers: { cookie: sessionCookie },
          })
        ).json(),
      ).toMatchObject({ operationId: created.json().operationId, status: "queued" });
      expect(
        (
          await server.inject({
            method: "GET",
            url: `${createUrl}/op_missing_01`,
            headers: { cookie: sessionCookie },
          })
        ).statusCode,
      ).toBe(404);

      const claimed = await server.inject({
        method: "POST",
        url: "/v1/agents/trackgrn/claim",
        headers: agentHeaders,
      });
      expect(claimed.statusCode).toBe(200);
      expect(claimed.json()).toMatchObject({
        operationId: created.json().operationId,
        status: "claimed",
        agentId: TRACKGRN_AGENT_ID,
      });
      expect(
        (
          await server.inject({
            method: "POST",
            url: "/v1/agents/trackgrn/claim",
            headers: agentHeaders,
          })
        ).statusCode,
      ).toBe(204);

      const completion = await server.inject({
        method: "POST",
        url: `/v1/agents/trackgrn/operations/${created.json().operationId}/complete`,
        headers: agentHeaders,
        payload: {
          status: "succeeded",
          result: {
            repository: "mishrarishav/TraceGRN",
            headSha: "a".repeat(40),
            clean: true,
          },
        },
      });
      expect(completion.statusCode).toBe(200);
      expect(completion.json()).toMatchObject({ status: "succeeded", errorCode: null });
      expect(
        (
          await server.inject({
            method: "POST",
            url: `/v1/agents/trackgrn/operations/${created.json().operationId}/complete`,
            headers: agentHeaders,
            payload: { status: "succeeded", result: { repeated: true } },
          })
        ).statusCode,
      ).toBe(409);

      const operations = await server.inject({
        method: "GET",
        url: createUrl,
        headers: { cookie: sessionCookie },
      });
      expect(operations.statusCode).toBe(200);
      expect(operations.json()).toEqual([
        expect.objectContaining({
          operationId: created.json().operationId,
          status: "succeeded",
        }),
      ]);

      const second = await server.inject({
        method: "POST",
        url: createUrl,
        headers: browserHeaders,
        payload: { action: "project.build", input: {} },
      });
      expect(second.statusCode).toBe(202);
      expect(
        (
          await server.inject({
            method: "POST",
            url: "/v1/agents/trackgrn/claim",
            headers: agentHeaders,
          })
        ).statusCode,
      ).toBe(200);
      const secondCompletionUrl = `/v1/agents/trackgrn/operations/${second.json().operationId}/complete`;
      expect(
        (
          await server.inject({
            method: "POST",
            url: secondCompletionUrl,
            headers: agentHeaders,
            payload: { status: "succeeded", result: { output: "x".repeat(60_001) } },
          })
        ).statusCode,
      ).toBe(400);
      const failedCompletion = await server.inject({
        method: "POST",
        url: secondCompletionUrl,
        headers: agentHeaders,
        payload: {
          status: "failed",
          errorCode: "operation-failed",
          result: { message: "Synthetic allowlisted operation failure" },
        },
      });
      expect(failedCompletion.statusCode).toBe(200);
      expect(failedCompletion.json()).toMatchObject({
        status: "failed",
        errorCode: "operation-failed",
      });

      for (const request of [
        {
          action: "repository.open-pull-request",
          input: {
            expectedHeadSha: "b".repeat(40),
            branch: "frevos/trackgrn-automation01",
            title: "Open reviewed TrackGRN pull request",
          },
        },
        {
          action: "repository.squash-merge",
          input: {
            pullRequestNumber: 42,
            expectedHeadSha: "b".repeat(40),
            confirmation: "squash-merge",
          },
        },
      ] as const) {
        const queued = await server.inject({
          method: "POST",
          url: createUrl,
          headers: browserHeaders,
          payload: request,
        });
        expect(queued.statusCode).toBe(202);
        const nextClaim = await server.inject({
          method: "POST",
          url: "/v1/agents/trackgrn/claim",
          headers: agentHeaders,
        });
        expect(nextClaim.json()).toMatchObject({
          operationId: queued.json().operationId,
          action: request.action,
          status: "claimed",
        });
        const nextCompletion = await server.inject({
          method: "POST",
          url: `/v1/agents/trackgrn/operations/${queued.json().operationId}/complete`,
          headers: agentHeaders,
          payload: { status: "succeeded", result: { verified: true } },
        });
        expect(nextCompletion.statusCode).toBe(200);
      }
    } finally {
      await server.close();
    }
  });

  it("keeps the agent route disabled when no runtime token is configured", async () => {
    const server = await buildServer({
      publicOrigin: PUBLIC_ORIGIN,
      authMode: "local",
      identitySessions: identities,
      workspaces,
      automation,
      now: () => NOW,
    });
    try {
      expect(
        (
          await server.inject({
            method: "POST",
            url: "/v1/agents/trackgrn/claim",
            headers: {
              authorization: `Bearer ${agentToken}`,
              "x-frevos-agent-id": TRACKGRN_AGENT_ID,
            },
          })
        ).json(),
      ).toEqual({ error: "trackgrn-agent-disabled" });
    } finally {
      await server.close();
    }
  });

  it("keeps automation unavailable when the store is not installed", async () => {
    const server = await buildServer({
      publicOrigin: PUBLIC_ORIGIN,
      authMode: "local",
      identitySessions: identities,
      workspaces,
      trackGrnAgentTokenHash: sha256(agentToken),
      now: () => NOW,
    });
    try {
      const response = await server.inject({
        method: "POST",
        url: "/v1/agents/trackgrn/claim",
        headers: {
          authorization: `Bearer ${agentToken}`,
          "x-frevos-agent-id": TRACKGRN_AGENT_ID,
        },
      });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ error: "project-automation-unavailable" });
    } finally {
      await server.close();
    }
  });
});

describe("generic GitHub repository onboarding", () => {
  const agentToken = "synthetic-github-discovery-token-0001";

  it("discovers the laptop account and persists a selected repository as a project", async () => {
    const server = await buildServer({
      publicOrigin: PUBLIC_ORIGIN,
      authMode: "local",
      identitySessions: identities,
      workspaces,
      automation,
      githubOnboarding,
      trackGrnAgentTokenHash: sha256(agentToken),
      now: () => NOW,
    });
    try {
      const login = await server.inject({
        method: "POST",
        url: "/auth/login",
        headers: { origin: PUBLIC_ORIGIN },
        payload: { username: "personal.admin", password: "personal-password" },
      });
      const sessionCookie = cookiePair(login, SESSION_COOKIE);
      const csrfCookie = cookiePair(login, CSRF_COOKIE);
      const browserHeaders = {
        cookie: `${sessionCookie}; ${csrfCookie}`,
        origin: PUBLIC_ORIGIN,
        "x-csrf-token": csrfCookie.slice(`${CSRF_COOKIE}=`.length),
      };
      const workspacePath = `/v1/workspaces/${PERSONAL_AGENT_WORKSPACE_ID}`;
      const queued = await server.inject({
        method: "POST",
        url: `${workspacePath}/github/discovery`,
        headers: browserHeaders,
        payload: {},
      });
      expect(queued.statusCode).toBe(202);
      expect(queued.json()).toMatchObject({
        action: "github.account.discover",
        status: "queued",
      });
      const repeatedQueue = await server.inject({
        method: "POST",
        url: `${workspacePath}/github/discovery`,
        headers: browserHeaders,
        payload: {},
      });
      expect(repeatedQueue.json()).toMatchObject({ operationId: queued.json().operationId });
      expect(
        (
          await server.inject({
            method: "GET",
            url: `${workspacePath}/github/discovery/${queued.json().operationId}`,
            headers: { cookie: sessionCookie },
          })
        ).json(),
      ).toMatchObject({ status: "queued" });
      expect(
        (
          await server.inject({
            method: "GET",
            url: `${workspacePath}/github/discovery/op_missing_github_01`,
            headers: { cookie: sessionCookie },
          })
        ).statusCode,
      ).toBe(404);

      const agentHeaders = {
        authorization: `Bearer ${agentToken}`,
        "x-frevos-agent-id": WINDOWS_GITHUB_AGENT_ID,
        "x-frevos-workspace-id": PERSONAL_AGENT_WORKSPACE_ID,
      };
      const deniedWorkspace = await server.inject({
        method: "POST",
        url: "/v1/agents/github/claim",
        headers: { ...agentHeaders, "x-frevos-workspace-id": "ws_alpha" },
      });
      expect(deniedWorkspace.statusCode).toBe(403);

      const claimed = await server.inject({
        method: "POST",
        url: "/v1/agents/github/claim",
        headers: agentHeaders,
      });
      expect(claimed.statusCode).toBe(200);
      expect(claimed.json()).toMatchObject({ status: "claimed" });
      expect(
        (
          await server.inject({
            method: "POST",
            url: "/v1/agents/github/claim",
            headers: agentHeaders,
          })
        ).statusCode,
      ).toBe(204);

      const repository = {
        providerRepositoryId: "987654321",
        owner: "synthetic-owner",
        name: "sample-repository",
        url: "https://github.com/synthetic-owner/sample-repository",
        defaultBranch: "main",
        visibility: "private",
        archived: false,
      };
      const completed = await server.inject({
        method: "POST",
        url: `/v1/agents/github/discovery/${claimed.json().operationId}/complete`,
        headers: agentHeaders,
        payload: {
          status: "succeeded",
          result: {
            provider: "github",
            account: { providerAccountId: "123456789", login: "synthetic-owner" },
            repositories: [repository],
          },
        },
      });
      expect(completed.statusCode).toBe(200);
      expect(completed.json()).toMatchObject({ status: "succeeded" });
      expect(
        (
          await server.inject({
            method: "POST",
            url: `/v1/agents/github/discovery/${claimed.json().operationId}/complete`,
            headers: agentHeaders,
            payload: {
              status: "succeeded",
              result: {
                provider: "github",
                account: { providerAccountId: "123456789", login: "synthetic-owner" },
                repositories: [repository],
              },
            },
          })
        ).statusCode,
      ).toBe(409);

      const connections = await server.inject({
        method: "GET",
        url: `${workspacePath}/github/connections`,
        headers: { cookie: sessionCookie },
      });
      expect(connections.statusCode).toBe(200);
      expect(connections.json()).toEqual([
        expect.objectContaining({ login: "synthetic-owner", repositories: [repository] }),
      ]);
      const connectionId = connections.json()[0].connectionId;
      expect(
        (
          await server.inject({
            method: "POST",
            url: `${workspacePath}/repository-connections`,
            headers: browserHeaders,
            payload: {
              connectionId,
              providerRepositoryId: "999999999",
              displayName: "Unknown Repository",
            },
          })
        ).statusCode,
      ).toBe(409);
      const connected = await server.inject({
        method: "POST",
        url: `${workspacePath}/repository-connections`,
        headers: browserHeaders,
        payload: {
          connectionId,
          providerRepositoryId: repository.providerRepositoryId,
          displayName: "Sample Repository",
        },
      });
      expect(connected.statusCode).toBe(201);
      expect(connected.json()).toMatchObject({ repository, status: "connected" });
      expect(
        (
          await server.inject({
            method: "POST",
            url: `${workspacePath}/repository-connections`,
            headers: browserHeaders,
            payload: {
              connectionId,
              providerRepositoryId: repository.providerRepositoryId,
              displayName: "Duplicate Repository",
            },
          })
        ).statusCode,
      ).toBe(409);

      const persisted = await server.inject({
        method: "GET",
        url: `${workspacePath}/repository-connections`,
        headers: { cookie: sessionCookie },
      });
      expect(persisted.statusCode).toBe(200);
      expect(persisted.json()).toEqual([
        expect.objectContaining({ projectId: connected.json().projectId, repository }),
      ]);
    } finally {
      await server.close();
    }
  });

  it("fails closed when GitHub onboarding is not installed", async () => {
    const server = await buildServer({
      publicOrigin: PUBLIC_ORIGIN,
      authMode: "local",
      identitySessions: identities,
      workspaces,
      trackGrnAgentTokenHash: sha256(agentToken),
      now: () => NOW,
    });
    try {
      const login = await server.inject({
        method: "POST",
        url: "/auth/login",
        headers: { origin: PUBLIC_ORIGIN },
        payload: { username: "personal.admin", password: "personal-password" },
      });
      const response = await server.inject({
        method: "GET",
        url: `/v1/workspaces/${PERSONAL_AGENT_WORKSPACE_ID}/github/connections`,
        headers: { cookie: cookiePair(login, SESSION_COOKIE) },
      });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ error: "github-onboarding-unavailable" });
    } finally {
      await server.close();
    }
  });
});

function allSetCookies(response: { headers: OutgoingHttpHeaders }): string[] {
  const header = response.headers["set-cookie"];
  return header === undefined ? [] : Array.isArray(header) ? header : [String(header)];
}

function setCookieValue(response: { headers: OutgoingHttpHeaders }, name: string): string {
  const value = allSetCookies(response).find((cookieValue) => cookieValue.startsWith(`${name}=`));
  if (value === undefined) {
    throw new Error(`Response did not set ${name}`);
  }
  return value;
}

function cookiePair(response: { headers: OutgoingHttpHeaders }, name: string): string {
  return setCookieValue(response, name).split(";", 1)[0] ?? "";
}

it("protects the fixed Servix deploy endpoint with workspace permission, CSRF and strict input", async () => {
  await workspaces.createWorkspace({
    workspaceId: "ws_server20",
    displayName: "Servix deployment",
    now: NOW,
  });
  await workspaces.createMembership({
    workspaceId: "ws_server20",
    userId: localPrincipal.userId,
    grantedScopes: ["workspace:read", "project:read", "project:write"],
    now: NOW,
  });
  const root = await mkdtemp(join(tmpdir(), "frevos-servix-http-"));
  for (const directory of ["requests", "results"]) await mkdir(join(root, directory));
  const store = new ServixDeploymentStore(
    root,
    {
      head: async () => "a".repeat(40),
      build: async () => {
        throw new Error("fixture build failure");
      },
    },
    async () => true,
    () => NOW,
  );
  const server = await buildServer({
    publicOrigin: PUBLIC_ORIGIN,
    authMode: "local",
    identitySessions: identities,
    workspaces,
    servixDeployment: store,
    now: () => NOW,
  });
  try {
    const url = "/v1/workspaces/ws_server20/servix/deployments";
    expect((await server.inject({ method: "GET", url })).statusCode).toBe(401);
    const login = await server.inject({
      method: "POST",
      url: "/auth/login",
      headers: { origin: PUBLIC_ORIGIN },
      payload: { username: "personal.admin", password: "personal-password" },
    });
    const session = cookiePair(login, SESSION_COOKIE),
      csrf = cookiePair(login, CSRF_COOKIE);
    const headers = {
      cookie: session + "; " + csrf,
      origin: PUBLIC_ORIGIN,
      "x-csrf-token": csrf.slice(`${CSRF_COOKIE}=`.length),
    };
    expect((await server.inject({ method: "GET", url, headers })).statusCode).toBe(200);
    const payload = {
      version: 1,
      requestId: `sd_${"d".repeat(32)}`,
      confirmation: "deploy-servix-development",
      changeDetails,
    };
    expect(
      (await server.inject({ method: "POST", url, headers: { cookie: session }, payload }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await server.inject({
          method: "POST",
          url,
          headers: { ...headers, origin: "https://untrusted.example" },
          payload,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await server.inject({
          method: "POST",
          url,
          headers,
          payload: { ...payload, path: "D:\\Servix" },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await server.inject({
          method: "POST",
          url: url.replace("ws_server20", "ws_alpha"),
          headers,
          payload,
        })
      ).statusCode,
    ).toBe(403);
    const response = await server.inject({ method: "POST", url, headers, payload });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      sourceHead: "a".repeat(40),
      target: "server21-servix-development",
      requestedBy: localPrincipal.userId,
    });
    await expect.poll(async () => (await store.state()).runs[0]?.status).toBe("failed");
    for (const digit of ["1", "2"]) {
      const savedId = "sd_" + digit.repeat(32),
        manifest = JSON.stringify({ fixture: digit }),
        archive = "saved-archive-" + digit;
      const directory = join(root, "builds", savedId);
      await mkdir(join(directory, "release"), { recursive: true });
      await writeFile(join(directory, "release", "manifest.json"), manifest);
      await writeFile(join(directory, "release.zip"), archive);
      await writeFile(
        join(directory, "artifact.json"),
        JSON.stringify({
          manifestSha256: sha256(manifest).toString("hex"),
          archiveSha256: sha256(archive).toString("hex"),
        }),
      );
      const stamp = new Date(NOW.getTime() - 5000 + Number(digit) * 1000).toISOString();
      await writeFile(
        join(root, "jobs", savedId + ".json"),
        JSON.stringify({
          ...response.json(),
          requestId: savedId,
          status: "succeeded",
          sourceHead: digit.repeat(40),
          artifactDigest: sha256(manifest).toString("hex"),
          createdAt: stamp,
          updatedAt: stamp,
        }),
      );
    }
    const restoreUrl = "/v1/workspaces/ws_server20/servix/restores",
      restorePayload = {
        version: 1,
        requestId: "sd_" + "3".repeat(32),
        expectedCurrentRequestId: "sd_" + "2".repeat(32),
        restoreRequestId: "sd_" + "1".repeat(32),
        operation: "rollback",
        confirmation: "restore-servix-development",
        changeDetails,
      };
    expect(
      (await server.inject({ method: "POST", url: restoreUrl, payload: restorePayload }))
        .statusCode,
    ).toBe(401);
    expect(
      (
        await server.inject({
          method: "POST",
          url: restoreUrl,
          headers: { cookie: session },
          payload: restorePayload,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await server.inject({
          method: "POST",
          url: restoreUrl,
          headers,
          payload: { ...restorePayload, path: "D:\\Servix" },
        })
      ).statusCode,
    ).toBe(400);
    const restored = await server.inject({
      method: "POST",
      url: restoreUrl,
      headers,
      payload: restorePayload,
    });
    expect(restored.statusCode).toBe(202);
    expect(restored.json()).toMatchObject({
      operation: "rollback",
      status: "activating",
      releaseRequestId: restorePayload.restoreRequestId,
      previousRequestId: restorePayload.expectedCurrentRequestId,
      requestedBy: localPrincipal.userId,
    });
    expect((await server.inject({ method: "POST", url, headers, payload })).json().requestId).toBe(
      payload.requestId,
    );
    expect(
      (
        await server.inject({
          method: "POST",
          url: "/v1/servix-agent",
          payload: { op: "activate" },
        })
      ).statusCode,
    ).toBe(404);
  } finally {
    store.close();
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

it("onboards an invited developer through authenticated workspace APIs without resetting existing accounts", async () => {
  const root = await mkdtemp(join(tmpdir(), "frevos-connector-http-"));
  const components = new ComponentDeployments(
    join(root, "components"),
    "ws_server20",
    async (actor, owner) => !owner || actor === "usr_windows_admin",
    "git",
    () => NOW,
  );
  const deploymentSettings = new DeploymentSettingsStore(
    join(root, "configuration"),
    async () => true,
    () => NOW,
  );
  const deploymentRoot = join(root, "deploy");
  await mkdir(join(deploymentRoot, "results"), { recursive: true });
  await writeFile(
    join(deploymentRoot, "results", "heartbeat.json"),
    JSON.stringify({ host: "DCAPP7", at: NOW.toISOString() }),
  );
  const deployment = new ServixDeploymentStore(
    deploymentRoot,
    {
      head: async () => "a".repeat(40),
      build: async () => {
        throw Error("Test must not build");
      },
    },
    async () => true,
    () => NOW,
  );
  const owner = await identities.provisionLocalCredential({
    username: "connector.owner",
    password: "owner-test-password",
    displayName: "Connector Owner",
    userId: "usr_windows_admin",
    now: NOW,
  });
  await workspaces.createMembership({
    workspaceId: "ws_server20",
    userId: owner.userId,
    grantedScopes: ["workspace:read", "project:read", "project:write"],
    now: NOW,
  });
  const connectors = new DeveloperConnectorStore(
    root,
    async (actor) => {
      const evidence = await workspaces.getEvidence("ws_server20", actor);
      return (
        evidence?.membership?.status === "active" &&
        evidence.membership.grantedScopes.some((s) => s === "project:write")
      );
    },
    {
      head: async () => "a".repeat(40),
      importBundle: async () => undefined,
      exportBundle: async (file) => {
        await writeFile(file, Buffer.alloc(64, 7));
      },
    },
    async (username, password, displayName) => {
      await identities.provisionLocalCredential({
        username,
        password,
        displayName,
        requireNew: true,
        developerWorkspaceId: "ws_server20",
        now: NOW,
      });
    },
    () => NOW,
    async () => true,
    deploymentSettings,
    components,
  );
  components.connect(connectors);
  const server = await buildServer({
    publicOrigin: PUBLIC_ORIGIN,
    authMode: "local",
    identitySessions: identities,
    workspaces,
    developerConnectors: connectors,
    deploymentSettings,
    servixDeployment: deployment,
    componentDeployments: components,
    localDevelopment: new LocalDevelopment(join(root, "local-development"), connectors, () => NOW),
    systemDiscovery: new SystemDiscovery(
      join(root, "discovery"),
      connectors,
      async () => ({ projects: await workspaces.listProjects("ws_server20"), clients: [] }),
      () => NOW,
    ),
    now: () => NOW,
  });
  const login = async (username: string, password: string) => {
    const response = await server.inject({
      method: "POST",
      url: "/auth/login",
      headers: { origin: PUBLIC_ORIGIN },
      payload: { username, password },
    });
    expect(response.statusCode).toBe(204);
    const session = cookiePair(response, SESSION_COOKIE),
      csrf = cookiePair(response, CSRF_COOKIE);
    return {
      cookie: session + "; " + csrf,
      origin: PUBLIC_ORIGIN,
      "x-csrf-token": csrf.slice(CSRF_COOKIE.length + 1),
    };
  };
  const url = "/v1/workspaces/ws_server20/connectors";
  try {
    expect((await server.inject({ method: "GET", url })).statusCode).toBe(401);
    const headers = await login("connector.owner", "owner-test-password");
    const componentUrl = "/v1/workspaces/ws_server20/component-deployments";
    expect((await server.inject({ method: "GET", url: componentUrl })).statusCode).toBe(401);
    expect(
      (
        await server.inject({
          method: "GET",
          url: componentUrl.replace("ws_server20", "ws_other"),
          headers,
        })
      ).statusCode,
    ).toBe(404);
    expect((await server.inject({ method: "GET", url: componentUrl, headers })).json()).toEqual({
      profiles: [],
      executors: [],
      runs: [],
    });
    const componentInput = {
      version: 1,
      profileId: "http-project",
      expectedRevision: 0,
      displayName: "HTTP project",
      sourceFolder: "D:\\http-project",
      archived: false,
      components: [
        {
          id: "api",
          name: "API",
          context: ".",
          recipe: "node-source",
          output: ".",
          builderId: "unassigned",
          destinationId: "unassigned",
          destinationBinding: "api",
          dependsOn: [],
          preservedPaths: ["uploads", ".env"],
        },
      ],
    };
    const componentPost = (path: string, payload: Record<string, unknown>, auth = headers) =>
      server.inject({ method: "POST", url: path, headers: auth, payload });
    expect(
      (
        await componentPost(componentUrl + "/configuration", componentInput, {
          cookie: headers.cookie,
        } as typeof headers)
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await componentPost(componentUrl + "/configuration", {
          ...componentInput,
          command: "forbidden",
        })
      ).statusCode,
    ).toBe(400);
    const savedComponent = await componentPost(componentUrl + "/configuration", componentInput);
    expect(savedComponent.statusCode).toBe(200);
    expect(savedComponent.json()).toMatchObject({ revision: 1, updatedBy: "usr_windows_admin" });
    expect((await componentPost(componentUrl + "/configuration", componentInput)).statusCode).toBe(
      409,
    );
    expect(
      (
        await componentPost(componentUrl + "/http-project/test", {
          deviceId: "fc_" + "0".repeat(32),
        })
      ).json(),
    ).toMatchObject({ ready: false });
    const enrolled = await componentPost(componentUrl + "/executors", {
      profileId: "http-project",
      role: "builder",
      name: "HTTP builder",
    });
    expect(enrolled.statusCode).toBe(200);
    expect(enrolled.headers["cache-control"]).toBe("no-store");
    const executor = enrolled.json() as { id: string; credential: string };
    const workerHeaders = { authorization: "Bearer " + executor.credential };
    const workerPost = (path: string, payload: Record<string, unknown>) =>
      server.inject({ method: "POST", url: path, headers: workerHeaders, payload });
    expect(
      (
        await workerPost("/v1/executor/heartbeat", { systemName: "fixture-host", bindings: [] })
      ).json(),
    ).toEqual({
      online: true,
    });
    expect((await workerPost("/v1/executor/claim", {})).json()).toEqual({ job: null });
    for (const suffix of ["artifact", "previous-artifact"]) {
      expect(
        (
          await server.inject({
            method: "GET",
            url: "/v1/executor/jobs/cj_" + "a".repeat(32) + "/" + suffix,
            headers: workerHeaders,
          })
        ).statusCode,
      ).toBe(404);
    }
    expect(
      (await workerPost("/v1/executor/jobs/cj_" + "a".repeat(32) + "/artifact", {})).statusCode,
    ).toBe(400);
    expect(
      (await workerPost("/v1/executor/jobs/cj_" + "a".repeat(32) + "/complete", {})).statusCode,
    ).toBe(404);
    const unavailableRun = {
      requestId: "pr_" + "a".repeat(32),
      profileId: "http-project",
      expectedRevision: 1,
      operation: "deploy",
      expectedCurrent: { api: null },
      changeDetails: { message: "API deployment", approvedBy: "Fixture owner" },
    };
    expect((await componentPost(componentUrl + "/runs", unavailableRun)).statusCode).toBe(409);
    expect(
      (await componentPost(componentUrl + "/executors/" + executor.id + "/revoke", {})).json(),
    ).toEqual({ revoked: true });
    expect((await workerPost("/v1/executor/claim", {})).statusCode).toBe(401);
    const settingsUrl = "/v1/workspaces/ws_server20/deployment-settings";
    expect((await server.inject({ method: "GET", url: settingsUrl })).statusCode).toBe(401);
    const loadedSettings = await server.inject({ method: "GET", url: settingsUrl, headers });
    expect(loadedSettings.statusCode).toBe(200);
    expect(loadedSettings.json().map((p: { profileId: string }) => p.profileId)).toEqual([
      "devsetu-platform",
      "servix-development",
      "http-project",
    ]);
    const {
      revision,
      runner: _runner,
      updatedAt: _at,
      updatedBy: _by,
      ...fields
    } = defaultDeploymentSettings;
    const settingsBody = {
      ...fields,
      expectedRevision: revision,
      preservedPaths: ["backend/attachment"],
    };
    expect(
      (
        await server.inject({
          method: "POST",
          url: settingsUrl,
          headers: { cookie: headers.cookie },
          payload: settingsBody,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await server.inject({
          method: "POST",
          url: settingsUrl,
          headers,
          payload: { ...settingsBody, password: "forbidden" },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await server.inject({ method: "POST", url: settingsUrl, headers, payload: settingsBody })
      ).json(),
    ).toMatchObject({ revision: 2, preservedPaths: ["backend/attachment"] });
    expect(
      (await server.inject({ method: "POST", url: settingsUrl, headers, payload: settingsBody }))
        .statusCode,
    ).toBe(409);
    expect(
      (
        await server.inject({
          method: "POST",
          url: url + "/pair",
          headers: { cookie: headers.cookie },
          payload: { version: 1, name: "Laptop" },
        })
      ).statusCode,
    ).toBe(403);
    const invite = await server.inject({
      method: "POST",
      url: "/v1/workspaces/ws_server20/developers/invite",
      headers,
      payload: { version: 1, username: "connector.alice", displayName: "Alice Developer" },
    });
    expect(invite.statusCode).toBe(200);
    const redemption = { version: 1, code: invite.json().code, password: "alice-test-password" };
    expect(
      (await server.inject({ method: "POST", url: "/v1/developers/redeem", payload: redemption }))
        .statusCode,
    ).toBe(200);
    expect(
      (await server.inject({ method: "POST", url: "/v1/developers/redeem", payload: redemption }))
        .statusCode,
    ).toBe(403);
    const dev = await login("connector.alice", "alice-test-password");
    const nativeInput = {
      ...componentInput,
      profileId: "native-platform",
      components: componentInput.components.map((c) => ({ ...c, recipe: "devsetu-native" })),
    };
    expect((await componentPost(componentUrl + "/configuration", nativeInput)).statusCode).toBe(
      200,
    );
    expect(
      (
        await componentPost(
          url + "/pair",
          { version: 1, name: "Developer platform source", profileId: nativeInput.profileId },
          dev,
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await componentPost(
          componentUrl + "/runs",
          { ...unavailableRun, profileId: nativeInput.profileId },
          dev,
        )
      ).statusCode,
    ).toBe(403);
    const platformSource = await componentPost(url + "/pair", {
      version: 1,
      name: "Owner platform source",
      profileId: nativeInput.profileId,
    });
    expect(platformSource.statusCode).toBe(200);
    expect(
      (
        await server.inject({
          method: "POST",
          url: settingsUrl,
          headers: dev,
          payload: { ...settingsBody, expectedRevision: 2 },
        })
      ).statusCode,
    ).toBe(403);
    for (const path of [
      "/v1/workspaces",
      "/v1/workspaces/ws_server20",
      "/v1/workspaces/ws_server20/clients",
      "/v1/workspaces/ws_server20/projects",
    ]) {
      expect((await server.inject({ method: "GET", url: path, headers: dev })).statusCode).toBe(
        200,
      );
    }
    expect(
      (
        await server.inject({
          method: "POST",
          url: "/v1/workspaces/ws_server20/clients",
          headers: dev,
          payload: { displayName: "Not authorized" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await server.inject({
          method: "POST",
          url: "/v1/workspaces/ws_server20/developers/invite",
          headers: dev,
          payload: { version: 1, username: "someone.else", displayName: "Other" },
        })
      ).statusCode,
    ).toBe(403);
    const paired = await server.inject({
      method: "POST",
      url: url + "/pair",
      headers: dev,
      payload: { version: 1, name: "Portable laptop" },
    });
    expect(paired.statusCode).toBe(200);
    const device = paired.json();
    const auth = { authorization: "Bearer " + device.credential };
    const testUrl = settingsUrl + "/servix-development/test";
    expect(
      (
        await server.inject({
          method: "POST",
          url: testUrl,
          headers: { cookie: dev.cookie },
          payload: { deviceId: device.deviceId },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await server.inject({
          method: "POST",
          url: testUrl,
          headers: dev,
          payload: { command: "no" },
        })
      ).statusCode,
    ).toBe(400);
    await server.inject({
      method: "POST",
      url: "/v1/connector/heartbeat",
      headers: auth,
      payload: {
        probe: {
          version: 1,
          profileId: "servix-development",
          repository: "D:\\servixDev",
          origin: defaultDeploymentSettings.repositoryOrigin,
          repositoryId: "gitrepo_6cb7e163f807493fa37963196c49fbac",
          remoteName: "frevos",
          head: "a".repeat(40),
          branch: "feature/dev",
          checkedAt: NOW.toISOString(),
        },
      },
    });
    const localUrl = "/v1/workspaces/ws_server20/local-development";
    expect((await server.inject({ method: "GET", url: localUrl })).statusCode).toBe(401);
    expect(
      (
        await server.inject({
          method: "GET",
          url: localUrl.replace("ws_server20", "ws_other"),
          headers: dev,
        })
      ).statusCode,
    ).toBe(404);
    const discoveryUrl = "/v1/workspaces/ws_server20/discovery";
    expect((await server.inject({ method: "GET", url: discoveryUrl })).statusCode).toBe(401);
    expect(
      (
        await server.inject({
          method: "GET",
          url: "/v1/workspaces/ws_elsewhere/discovery",
          headers: dev,
        })
      ).statusCode,
    ).not.toBe(200);
    expect(
      (
        await server.inject({
          method: "POST",
          url: discoveryUrl + "/policy",
          headers: { cookie: dev.cookie },
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    const policy = {
      version: 1,
      deviceId: device.deviceId,
      expectedRevision: 0,
      policy: { ...defaultDiscoveryPolicy, enabled: true, allLocalDrives: false },
    };
    expect(
      (
        await server.inject({
          method: "POST",
          url: discoveryUrl + "/policy",
          headers: dev,
          payload: policy,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await server.inject({
          method: "POST",
          url: discoveryUrl + "/policy",
          headers,
          payload: { ...policy, expectedRevision: 1 },
        })
      ).statusCode,
    ).toBe(403);
    const sample = {
      version: 1,
      deviceId: device.deviceId,
      profileId: "servix-development",
      bootId: "6c447c9b-2033-4276-8b80-1f860329ea02",
      at: NOW.toISOString(),
      policyRevision: 1,
      system: {
        systemName: "Fixture system",
        platform: "win32",
        os: "Windows fixture",
        architecture: "x64",
        cpuPercent: 15,
        cpuCount: 4,
        memoryTotal: 1000,
        memoryAvailable: 500,
        uptimeSeconds: 100,
        disks: [],
        tools: [],
      },
      coverage: {
        status: "partial",
        roots: [],
        watchedDirectories: 0,
        gaps: ["restart-history-unavailable"],
        attribution: "unavailable",
        droppedEvents: 0,
      },
      events: [],
    };
    expect(
      (
        await server.inject({
          method: "POST",
          url: "/v1/connector/discovery/observe",
          payload: sample,
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await server.inject({
          method: "POST",
          url: "/v1/connector/discovery/observe",
          headers: auth,
          payload: sample,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await server.inject({
          method: "POST",
          url: "/v1/connector/discovery/policy",
          headers: auth,
          payload: {},
        })
      ).json(),
    ).toMatchObject({ revision: 1 });
    expect(
      (await server.inject({ method: "GET", url: discoveryUrl, headers: dev }))
        .json()
        .systems.find((s: { deviceId: string }) => s.deviceId === device.deviceId).observation
        .system.cpuPercent,
    ).toBe(15);
    expect(
      (await server.inject({ method: "GET", url: discoveryUrl, headers }))
        .json()
        .systems.some((s: { deviceId: string }) => s.deviceId === device.deviceId),
    ).toBe(true);
    expect(
      (
        await server.inject({
          method: "POST",
          url: discoveryUrl + "/plans",
          headers: dev,
          payload: {
            version: 1,
            projectId: "prj_unbound",
            expectedRevision: 0,
            poReference: "PO-42",
            poDate: "2026-10-14",
            responsible: "Fixture",
            timeZone: "Asia/Kolkata",
            deviceIds: [],
            milestones: [
              {
                id: "work",
                title: "Work",
                weight: 1,
                dueDate: "2026-10-24",
                acceptance: "pending",
                evidence: "",
              },
            ],
          },
        })
      ).statusCode,
    ).toBe(403);
    const localSnapshot = {
      version: 1,
      deviceId: device.deviceId,
      profileId: "servix-development",
      fingerprint: "e".repeat(64),
      sourceReady: true,
      revision: 0,
      plan: null,
      services: [],
      candidates: [
        {
          id: "backend",
          name: "Backend",
          context: "backend",
          recipe: "npm-script",
          framework: "node",
          scripts: ["start"],
          manifestDigest: "f".repeat(64),
          environments: [],
        },
      ],
    };
    expect(
      (
        await server.inject({
          method: "POST",
          url: "/v1/connector/local-development/observe",
          payload: localSnapshot,
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await server.inject({
          method: "POST",
          url: "/v1/connector/local-development/observe",
          headers: auth,
          payload: localSnapshot,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await server.inject({ method: "GET", url: localUrl, headers: dev })).json().connections[0]
        .snapshot,
    ).toEqual(localSnapshot);
    expect(
      (await server.inject({ method: "GET", url: localUrl, headers })).json().connections,
    ).toEqual([]);
    const localRequest = {
      version: 1,
      requestId: "ld_" + "7".repeat(32),
      deviceId: device.deviceId,
      profileId: "servix-development",
      expectedRevision: 0,
      fingerprint: localSnapshot.fingerprint,
      operation: "configure",
      plan: { services: [{ id: "backend", script: "start", port: 5000, database: "none" }] },
    };
    expect(
      (
        await server.inject({
          method: "POST",
          url: localUrl + "/actions",
          headers: { cookie: dev.cookie },
          payload: localRequest,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await server.inject({
          method: "POST",
          url: localUrl + "/actions",
          headers: dev,
          payload: { ...localRequest, command: "not-accepted" },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await server.inject({
          method: "POST",
          url: localUrl + "/actions",
          headers: dev,
          payload: localRequest,
        })
      ).statusCode,
    ).toBe(202);
    expect(
      (
        await server.inject({
          method: "POST",
          url: "/v1/connector/local-development/claim",
          headers: auth,
          payload: {},
        })
      ).json().job.request,
    ).toEqual(localRequest);
    expect(
      (
        await server.inject({
          method: "POST",
          url: "/v1/connector/local-development/complete",
          headers: auth,
          payload: { requestId: localRequest.requestId, status: "succeeded" },
        })
      ).statusCode,
    ).toBe(200);
    const healthFetch = vi.spyOn(globalThis, "fetch");
    const chooseUrl = url + "/" + device.deviceId + "/choose-folder";
    await server.inject({
      method: "POST",
      url: "/v1/connector/heartbeat",
      headers: auth,
      payload: { folderPicker: true },
    });
    expect(
      (
        await server.inject({
          method: "POST",
          url: chooseUrl,
          headers: { cookie: dev.cookie },
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await server.inject({
          method: "POST",
          url: chooseUrl,
          headers: dev,
          payload: { path: "D:\\not-accepted" },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await server.inject({ method: "POST", url: chooseUrl, headers, payload: {} })).statusCode,
    ).toBe(409);
    const chosen = await server.inject({
      method: "POST",
      url: chooseUrl,
      headers: dev,
      payload: {},
    });
    expect(chosen.statusCode).toBe(200);
    const claimFolder = await server.inject({
      method: "POST",
      url: "/v1/connector/folder/claim",
      headers: auth,
      payload: {},
    });
    expect(claimFolder.json().selection.status).toBe("choosing");
    expect(
      (
        await server.inject({
          method: "POST",
          url: "/v1/connector/folder/complete",
          headers: auth,
          payload: { ...claimFolder.json().selection, status: "cancelled" },
        })
      ).json(),
    ).toEqual({ accepted: true });
    await server.inject({
      method: "POST",
      url: "/v1/connector/heartbeat",
      headers: auth,
      payload: {
        probe: {
          version: 1,
          profileId: "servix-development",
          repository: "D:\\servixDev",
          origin: defaultDeploymentSettings.repositoryOrigin,
          repositoryId: "gitrepo_6cb7e163f807493fa37963196c49fbac",
          remoteName: "frevos",
          head: "a".repeat(40),
          branch: "feature/dev",
          checkedAt: NOW.toISOString(),
        },
        folderPicker: true,
      },
    });
    try {
      for (const response of [
        new Response(
          JSON.stringify({ status: "OK", authBootstrapReady: true, fullBootstrapReady: true }),
        ),
        new Response("{}", { status: 503 }),
        new Response("{}"),
      ]) {
        healthFetch.mockResolvedValueOnce(response);
        const tested = await server.inject({
          method: "POST",
          url: testUrl,
          headers: dev,
          payload: { deviceId: device.deviceId },
        });
        expect(tested.statusCode).toBe(200);
        expect(tested.json().checks[2].status).toBe(
          response.ok && tested.json().ready ? "passed" : "failed",
        );
      }
      expect(healthFetch).toHaveBeenCalledWith(
        "http://10.9.69.21:82/api/health",
        expect.objectContaining({ redirect: "error" }),
      );
    } finally {
      healthFetch.mockRestore();
    }
    expect(
      (
        await server.inject({
          method: "POST",
          url: "/v1/connector/heartbeat",
          headers: auth,
          payload: {},
        })
      ).json(),
    ).toEqual({ online: true });
    expect(
      (await server.inject({ method: "POST", url: "/v1/connector/heartbeat", payload: {} }))
        .statusCode,
    ).toBe(401);
    expect(
      (
        await server.inject({
          method: "POST",
          url: "/v1/connector/claim",
          headers: auth,
          payload: {},
        })
      ).json(),
    ).toEqual({ job: null });
    expect((await server.inject({ method: "GET", url, headers: dev })).json()).toMatchObject([
      { deviceId: device.deviceId, online: true },
    ]);
    expect(
      (await server.inject({ method: "GET", url, headers }))
        .json()
        .map((d: { deviceId: string }) => d.deviceId),
    ).toEqual([platformSource.json().deviceId]);
    const sourceId = "sd_" + "1".repeat(32),
      newHead = "b".repeat(40);
    const developer = await identities.authenticateLocalCredential({
      username: "connector.alice",
      password: "alice-test-password",
      now: NOW,
    });
    await server.inject({
      method: "POST",
      url: "/v1/connector/heartbeat",
      headers: auth,
      payload: {
        probe: {
          version: 1,
          profileId: "servix-development",
          repository: "D:\\servixDev",
          origin: defaultDeploymentSettings.repositoryOrigin,
          repositoryId: "gitrepo_6cb7e163f807493fa37963196c49fbac",
          remoteName: "frevos",
          head: "a".repeat(40),
          branch: "feature/dev",
          checkedAt: NOW.toISOString(),
        },
      },
    });
    const publication = connectors.prepare(developer!.userId, device.deviceId, sourceId);
    void publication.catch(() => undefined);
    await expect
      .poll(async () => {
        try {
          await readFile(join(root, sourceId + ".source.json"));
          return true;
        } catch {
          return false;
        }
      })
      .toBe(true);
    expect(
      (
        await server.inject({
          method: "POST",
          url: "/v1/connector/claim",
          headers: auth,
          payload: {},
        })
      ).json(),
    ).toMatchObject({ job: { requestId: sourceId } });
    const baseline = await server.inject({
      method: "POST",
      url: "/v1/connector/source-base",
      headers: auth,
      payload: { heads: ["a".repeat(40)] },
    });
    expect(baseline.statusCode).toBe(200);
    expect(baseline.rawPayload.length).toBe(64);
    const upload = "/v1/connector/jobs/" + sourceId + "/bundle";
    expect(
      (
        await server.inject({
          method: "POST",
          url: upload,
          headers: { "content-type": "application/x-git-bundle", "x-frevos-source-head": newHead },
          payload: Buffer.alloc(64),
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await server.inject({
          method: "POST",
          url: upload,
          headers: { ...auth, "content-type": "application/x-git-bundle" },
          payload: Buffer.alloc(64),
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await server.inject({
          method: "POST",
          url: upload,
          headers: { ...auth, "content-type": "application/json", "x-frevos-source-head": newHead },
          payload: {},
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await server.inject({
          method: "POST",
          url: upload,
          headers: {
            ...auth,
            "content-type": "application/x-git-bundle",
            "x-frevos-source-head": newHead,
          },
          payload: Buffer.alloc(64),
        })
      ).statusCode,
    ).toBe(200);
    expect(await publication).toBe(newHead);
    expect(
      (
        await server.inject({
          method: "POST",
          url: url + "/" + device.deviceId + "/revoke",
          headers,
          payload: {},
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await server.inject({
          method: "POST",
          url: "/v1/connector/claim",
          headers: auth,
          payload: {},
        })
      ).statusCode,
    ).toBe(401);
    await expect(
      identities.provisionLocalCredential({
        username: "connector.alice",
        password: "replacement-password",
        displayName: "Intruder",
        requireNew: true,
        developerWorkspaceId: "ws_server20",
        now: NOW,
      }),
    ).rejects.toThrow("Local account already exists");
    expect(
      await identities.authenticateLocalCredential({
        username: "connector.alice",
        password: "alice-test-password",
        now: NOW,
      }),
    ).not.toBeNull();
    const principal = await identities.authenticateLocalCredential({
      username: "connector.alice",
      password: "alice-test-password",
      now: NOW,
    });
    expect(
      (await workspaces.getEvidence("ws_server20", principal!.userId))?.membership?.grantedScopes,
    ).toEqual(["workspace:read", "client:read", "project:read", "project:write"]);
  } finally {
    connectors.close();
    deployment.close();
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});
