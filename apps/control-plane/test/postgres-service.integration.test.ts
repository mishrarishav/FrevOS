import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { OutgoingHttpHeaders } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OidcTransactionCodec, type OidcTransaction } from "../src/crypto.js";
import {
  createDatabasePool,
  runMigrations,
  verifyApplicationRole,
  withApplicationTransaction,
} from "../src/database.js";
import type { AuthenticatedIdentity, OidcProvider } from "../src/oidc.js";
import {
  IdentitySessionRepository,
  WorkspaceRepository,
  type IdentityPrincipal,
} from "../src/repositories.js";
import {
  CSRF_COOKIE,
  OIDC_TRANSACTION_COOKIE,
  SESSION_COOKIE,
  buildServer,
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
let principalA: IdentityPrincipal;
let principalB: IdentityPrincipal;
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
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
    GRANT frevos_app TO frevos_test_runtime;
  `);
  const runtimeUrl = new URL(container.getConnectionUri());
  runtimeUrl.username = "frevos_test_runtime";
  runtimeUrl.password = "synthetic-runtime-password";
  pool = new Pool({ connectionString: runtimeUrl.toString(), max: 8 });
  await verifyApplicationRole(pool);
  identities = new IdentitySessionRepository(pool);
  workspaces = new WorkspaceRepository(pool);
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
    workspaceId: "ws_beta",
    userId: principalB.userId,
    grantedScopes: ["workspace:read", "client:read", "project:read"],
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
}, 120_000);

afterAll(async () => {
  await pool?.end();
  await adminPool?.end();
  await container?.stop();
});

describe("PostgreSQL application boundary", () => {
  it("uses an unprivileged non-owner role and forces RLS on every tenant table", async () => {
    await expect(verifyApplicationRole(pool)).resolves.toBeUndefined();
    await expect(verifyApplicationRole(adminPool)).rejects.toThrow("required unprivileged role");

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
  it("executes OIDC, hardened cookies, authorization, CSRF, rotation, and logout", async () => {
    const oidcProvider = new FakeOidcProvider();
    const codec = new OidcTransactionCodec(randomBytes(32));
    const server = await buildServer({
      publicOrigin: PUBLIC_ORIGIN,
      oidcProvider,
      transactionCodec: codec,
      identitySessions: identities,
      workspaces,
      now: () => NOW,
    });

    try {
      expect((await server.inject({ method: "GET", url: "/health" })).json()).toEqual({
        status: "ok",
      });
      expect((await server.inject({ method: "GET", url: "/v1/session" })).statusCode).toBe(401);
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
