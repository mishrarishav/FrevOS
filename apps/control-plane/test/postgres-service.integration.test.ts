import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { OutgoingHttpHeaders } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
  await withApplicationTransaction(pool, TRACKGRN_WORKSPACE_ID, async (client) =>
    client.query(
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
            'repository.commit-push', 'project.build', 'uat.deploy'
          ], $4
        )
      `,
      [TRACKGRN_WORKSPACE_ID, TRACKGRN_PROJECT_ID, TRACKGRN_AGENT_ID, NOW],
    ),
  );
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
      });

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
