import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { expect, it } from "vitest";
import { runMigrations, prepareApplicationLoginRole } from "../src/database.js";
import { IdentitySessionRepository, WorkspaceRepository } from "../src/repositories.js";
import { LocalAccounts } from "../src/local-accounts.js";
import { SelfUpdates } from "../src/self-updates.js";
import { buildServer, SESSION_COOKIE, CSRF_COOKIE } from "../src/server.js";

it("protects account metadata and password actions, revokes sessions, preserves hashes and scopes, and authorizes only pinned self-updates", async () => {
  const container = await new PostgreSqlContainer(
    "postgres:18.4-alpine3.23@sha256:996d0920e4ff9df1fc19dacb904492f3c1ec0ec1cc338f0ad7123be7731c5f5e",
  ).start();
  const admin = new Pool({ connectionString: container.getConnectionUri() });
  const root = await mkdtemp(join(tmpdir(), "devsetu-accounts-"));
  let pool: Pool | undefined;
  let server: Awaited<ReturnType<typeof buildServer>> | undefined;
  const origin = "https://control.example";
  try {
    await runMigrations(admin);
    await admin.query(
      `CREATE ROLE accounts_runtime LOGIN PASSWORD 'synthetic-runtime' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
    );
    await prepareApplicationLoginRole(admin, "accounts_runtime");
    const url = new URL(container.getConnectionUri());
    url.username = "accounts_runtime";
    url.password = "synthetic-runtime";
    pool = new Pool({ connectionString: url.toString() });
    const identities = new IdentitySessionRepository(pool),
      workspaces = new WorkspaceRepository(pool);
    await workspaces.createWorkspace({
      workspaceId: "ws_server20",
      displayName: "Synthetic workspace",
    });
    await workspaces.createWorkspace({ workspaceId: "ws_other", displayName: "Other workspace" });
    const owner = await identities.provisionLocalCredential({
      username: "owner.admin",
      password: "initial-owner-password",
      displayName: "Owner",
      userId: "usr_windows_admin",
    });
    await workspaces.createMembership({
      workspaceId: "ws_server20",
      userId: owner.userId,
      grantedScopes: ["workspace:read", "project:read", "project:write"],
    });
    const dev = await identities.provisionLocalCredential({
      username: "dev.alice",
      password: "alice-original-password",
      displayName: "Alice",
      developerWorkspaceId: "ws_server20",
    });
    const other = await identities.provisionLocalCredential({
      username: "other.bob",
      password: "bob-original-password",
      displayName: "Bob",
      developerWorkspaceId: "ws_other",
    });
    const service = new LocalAccounts(pool, identities, join(root, "audit"));
    const maintenance = join(root, "maintenance");
    await mkdir(join(maintenance, "requests"), { recursive: true });
    await mkdir(join(maintenance, "results"));
    const candidate = {
      version: 1,
      candidateId: "a".repeat(32),
      manifestSha256: "b".repeat(64),
      previousManifestSha256: "c".repeat(64),
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      label: "Synthetic sealed build",
    };
    await writeFile(join(maintenance, "catalog.json"), JSON.stringify(candidate));
    server = await buildServer({
      publicOrigin: origin,
      authMode: "local",
      identitySessions: identities,
      workspaces,
      localAccounts: service,
      selfUpdates: new SelfUpdates(maintenance),
    });
    const login = async (username: string, password: string) => {
      const response = await server!.inject({
        method: "POST",
        url: "/auth/login",
        headers: { origin },
        payload: { username, password },
      });
      expect(response.statusCode).toBe(204);
      const cookies = response.cookies;
      const token = cookies.find((c) => c.name === SESSION_COOKIE)!,
        csrf = cookies.find((c) => c.name === CSRF_COOKIE)!;
      return {
        origin,
        cookie: `${SESSION_COOKIE}=${token.value}; ${CSRF_COOKIE}=${csrf.value}`,
        "x-csrf-token": csrf.value,
      };
    };
    const ownerAuth = await login("owner.admin", "initial-owner-password"),
      devAuth = await login("dev.alice", "alice-original-password");
    const secondDevAuth = await login("dev.alice", "alice-original-password");
    const get = async (url: string, headers = ownerAuth) =>
      server!.inject({ method: "GET", url, headers });
    const post = async (url: string, payload: Record<string, unknown>, headers = ownerAuth) =>
      server!.inject({ method: "POST", url, headers, payload });
    expect((await server.inject({ method: "GET", url: "/v1/account" })).statusCode).toBe(401);
    expect((await get("/v1/account")).json()).toMatchObject({
      account: { username: "owner.admin" },
      canManageUsers: true,
    });
    expect((await get("/v1/account", devAuth)).json().canManageUsers).toBe(false);
    const users = await get("/v1/workspaces/ws_server20/users");
    expect(users.statusCode).toBe(200);
    expect(users.json()).toHaveLength(2);
    expect(users.body).not.toMatch(/password_hash|password_salt|original-password/);
    expect((await get("/v1/workspaces/ws_server20/users", devAuth)).statusCode).toBe(403);
    expect((await get("/v1/workspaces/ws_other/users")).statusCode).toBe(404);
    const reset = `/v1/workspaces/ws_server20/users/${dev.userId}/password`;
    expect(
      (
        await post(
          reset,
          { currentPassword: "initial-owner-password", newPassword: "alice-new-password" },
          { ...ownerAuth, "x-csrf-token": "bad" },
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (await post(reset, { currentPassword: "wrong-password", newPassword: "alice-new-password" }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await post(reset, {
          currentPassword: "initial-owner-password",
          newPassword: "alice-new-password",
          password_hash: "injected",
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await post(reset.replace(dev.userId, other.userId), {
          currentPassword: "initial-owner-password",
          newPassword: "bob-new-password",
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await post(
          reset,
          { currentPassword: "alice-original-password", newPassword: "alice-new-password" },
          devAuth,
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await post(reset, {
          currentPassword: "initial-owner-password",
          newPassword: "alice-new-password",
        })
      ).statusCode,
    ).toBe(200);
    expect((await get("/v1/session", devAuth)).statusCode).toBe(401);
    expect((await get("/v1/session", secondDevAuth)).statusCode).toBe(401);
    expect(
      await identities.authenticateLocalCredential({
        username: "dev.alice",
        password: "alice-original-password",
      }),
    ).toBeNull();
    const freshDev = await login("dev.alice", "alice-new-password");
    expect(
      (
        await post(
          "/v1/account/password",
          { currentPassword: "wrong-password", newPassword: "alice-self-password" },
          freshDev,
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await post(
          "/v1/account/password",
          { currentPassword: "alice-new-password", newPassword: "alice-self-password" },
          freshDev,
        )
      ).statusCode,
    ).toBe(200);
    expect((await get("/v1/session", freshDev)).statusCode).toBe(401);
    await login("dev.alice", "alice-self-password");
    expect(
      (await workspaces.getEvidence("ws_server20", dev.userId))?.membership?.grantedScopes,
    ).toEqual(["workspace:read", "client:read", "project:read", "project:write"]);
    expect(
      (
        await identities.authenticateLocalCredential({
          username: "other.bob",
          password: "bob-original-password",
        })
      )?.userId,
    ).toBe(other.userId);
    const audit = await readFile(join(root, "audit", "password-actions.jsonl"), "utf8");
    expect(audit).toContain("password-reset");
    expect(audit).toContain("password-change");
    expect(audit).not.toMatch(
      /initial-owner-password|alice-new-password|alice-self-password|password_hash|password_salt/,
    );
    expect((await get("/maintenance")).statusCode).toBe(200);
    expect((await get("/maintenance", devAuth)).statusCode).toBe(401);
    expect((await get("/maintenance.js")).body).toContain("x-csrf-token");
    expect((await get("/maintenance.css")).statusCode).toBe(200);
    const update = "/v1/workspaces/ws_server20/platform-update";
    const changeDetails = { message: "Platform controls", approvedBy: "Fixture administrator" };
    expect((await get(update)).json().candidate.manifestSha256).toBe(candidate.manifestSha256);
    const freshDev2 = await login("dev.alice", "alice-self-password");
    expect((await get(update, freshDev2)).statusCode).toBe(403);
    expect(
      (
        await post(
          update,
          {
            candidateId: candidate.candidateId,
            manifestSha256: candidate.manifestSha256,
            changeDetails,
          },
          { ...ownerAuth, "x-csrf-token": "bad" },
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await post(update, {
          candidateId: candidate.candidateId,
          manifestSha256: "d".repeat(64),
          changeDetails,
        })
      ).statusCode,
    ).toBe(409);
    const requested = await post(update, {
      changeDetails,
      candidateId: candidate.candidateId,
      manifestSha256: candidate.manifestSha256,
    });
    expect(requested.statusCode).toBe(200);
    expect(
      (
        await post(update, {
          changeDetails,
          candidateId: candidate.candidateId,
          manifestSha256: candidate.manifestSha256,
        })
      ).json().requestId,
    ).toBe(requested.json().requestId);
    expect(
      (await server.inject({ method: "POST", url: "/auth/logout", headers: ownerAuth })).statusCode,
    ).toBe(204);
    expect((await get("/v1/session")).statusCode).toBe(401);
  } finally {
    await server?.close();
    await pool?.end();
    await admin.end();
    await container.stop();
    await rm(root, { recursive: true, force: true });
  }
}, 120000);
