import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { expect, it, vi } from "vitest";
import { type BrowserEntry, buildBrowserEntry, loadBrowserEntry } from "../src/browser-entry.js";
import { prepareApplicationLoginRole, runMigrations } from "../src/database.js";
import { IdentitySessionRepository, WorkspaceRepository } from "../src/repositories.js";
import { buildServer } from "../src/server.js";

const profile: BrowserEntry = {
  version: 1,
  publicOrigin: "https://gateway.example.org",
  basePath: "/workspace",
  proxyHosts: ["browser-entry-upstream"],
  listen: { host: "127.0.0.1", port: 3097 },
};

it("keeps an absent entry disabled and rejects malformed or unsafe profiles", async () => {
  const root = await mkdtemp(join(tmpdir(), "devsetu-browser-config-"));
  const file = join(root, "entry.json");
  try {
    expect(await loadBrowserEntry(file)).toBeUndefined();
    for (const value of [
      { ...profile, publicOrigin: "http://gateway.example.org" },
      { ...profile, publicOrigin: "https://gateway.example.org/other" },
      { ...profile, basePath: "/workspace/other" },
      { ...profile, listen: { host: "0.0.0.0", port: 3097 } },
      { ...profile, arbitrary: true },
    ]) {
      await writeFile(file, JSON.stringify(value));
      await expect(loadBrowserEntry(file)).rejects.toThrow();
    }
    await writeFile(file, JSON.stringify(profile));
    expect(await loadBrowserEntry(file)).toEqual(profile);
    await writeFile(file, "{");
    await expect(loadBrowserEntry(file)).rejects.toThrow();
    await writeFile(file, "x".repeat(4097));
    await expect(loadBrowserEntry(file)).rejects.toThrow("browser-entry-file-rejected");
    await expect(loadBrowserEntry(root)).rejects.toThrow("browser-entry-file-rejected");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("serves both origins with shared persisted identities, scoped APIs and unchanged CSRF", async () => {
  const container = await new PostgreSqlContainer(
    "postgres:18.4-alpine3.23@sha256:996d0920e4ff9df1fc19dacb904492f3c1ec0ec1cc338f0ad7123be7731c5f5e",
  ).start();
  const admin = new Pool({ connectionString: container.getConnectionUri() });
  let pool: Pool | undefined;
  const root = await mkdtemp(join(tmpdir(), "devsetu-browser-runtime-"));
  let internal: Awaited<ReturnType<typeof buildServer>> | undefined;
  let external: Awaited<ReturnType<typeof buildBrowserEntry>> | undefined;
  try {
    await runMigrations(admin);
    await admin.query(
      "CREATE ROLE browser_runtime LOGIN PASSWORD 'synthetic-runtime' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS",
    );
    await prepareApplicationLoginRole(admin, "browser_runtime");
    const connection = new URL(container.getConnectionUri());
    connection.username = "browser_runtime";
    connection.password = "synthetic-runtime";
    pool = new Pool({ connectionString: connection.href });
    const identities = new IdentitySessionRepository(pool);
    const workspaces = new WorkspaceRepository(pool);
    const owner = await identities.provisionLocalCredential({
      username: "entry.owner",
      password: "synthetic-entry-password",
      displayName: "Entry Owner",
    });
    await workspaces.createWorkspace({ workspaceId: "ws_entry", displayName: "Entry workspace" });
    await workspaces.createWorkspace({ workspaceId: "ws_other", displayName: "Other workspace" });
    await workspaces.createMembership({
      workspaceId: "ws_entry",
      userId: owner.userId,
      grantedScopes: ["workspace:read", "project:read", "project:write"],
    });
    const common = {
      authMode: "local" as const,
      publicOrigin: "http://10.0.0.20",
      identitySessions: identities,
      workspaces,
    };
    internal = await buildServer(common);
    await expect(buildBrowserEntry({ ...common, authMode: "oidc" }, profile, root)).rejects.toThrow(
      "browser-entry-local-auth-required",
    );
    await mkdir(join(root, "assets"));
    await writeFile(join(root, "index.html"), '<script src="/workspace/assets/app.js"></script>');
    await writeFile(join(root, "assets", "app.js"), "export {};");
    await writeFile(
      join(root, "browser-entry.json"),
      JSON.stringify({ version: 1, basePath: "/wrong" }),
    );
    await expect(buildBrowserEntry(common, profile, root)).rejects.toThrow();
    await writeFile(
      join(root, "browser-entry.json"),
      JSON.stringify({ version: 1, basePath: profile.basePath }),
    );
    external = await buildBrowserEntry(common, profile, root);
    const headers = { host: "127.0.0.1:3097", origin: profile.publicOrigin };
    const shell = await external.inject({ url: "/workspace/", headers });
    expect(shell.statusCode).toBe(200);
    expect(shell.body).toContain("/workspace/assets/app.js");
    expect((await external.inject({ url: "/workspace/assets/app.js", headers })).statusCode).toBe(
      200,
    );
    expect(
      (
        await external.inject({
          url: "/workspace/v1/missing",
          headers: { ...headers, accept: "text/html" },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await external.inject({
          url: "/workspace/health",
          headers: { ...headers, host: "attacker.invalid" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await external.inject({ url: "/workspace/health", headers, remoteAddress: "10.0.0.9" }))
        .statusCode,
    ).toBe(403);
    for (const path of [
      "/v1/connector/software/claim",
      "/v1/workspaces/ws_entry/local-development/preview/open",
    ]) {
      expect(
        (
          await external.inject({
            method: "POST",
            url: profile.basePath + path,
            headers,
            payload: {},
          })
        ).statusCode,
      ).toBe(503);
    }
    const payload = { username: "entry.owner", password: "synthetic-entry-password" };
    const rejected = await external.inject({
      method: "POST",
      url: "/workspace/auth/login",
      headers: { ...headers, origin: common.publicOrigin },
      payload,
    });
    expect(rejected.statusCode).toBe(403);
    const login = await external.inject({
      method: "POST",
      url: "/workspace/auth/login",
      headers,
      payload,
    });
    expect(login.statusCode).toBe(204);
    expect(login.cookies.some((c) => c.name === "__Host-frevos-session")).toBe(false);
    expect(login.cookies.find((c) => c.name === "__Host-frevos-workspace-session")).toMatchObject({
      secure: true,
      httpOnly: true,
      path: "/",
    });
    const csrf = login.cookies.find((c) => c.name === "__Host-frevos-workspace-csrf");
    if (!csrf) throw Error("Expected secure CSRF cookie");
    const authenticated = {
      ...headers,
      cookie: login.cookies.map((c) => `${c.name}=${c.value}`).join("; "),
      "x-csrf-token": csrf.value,
    };
    expect(
      (await external.inject({ url: "/workspace/v1/session", headers: authenticated })).json()
        .userId,
    ).toBe(owner.userId);
    expect(
      (
        await external.inject({
          url: "/workspace/v1/workspaces/ws_entry/projects",
          headers: authenticated,
        })
      ).statusCode,
    ).toBe(200);
    // Row-level security hides workspaces for which this user has no membership.
    expect(
      (
        await external.inject({
          url: "/workspace/v1/workspaces/ws_other/projects",
          headers: authenticated,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await external.inject({
          method: "POST",
          url: "/workspace/auth/logout",
          headers: { ...authenticated, "x-csrf-token": "wrong" },
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    const privateLogin = await internal.inject({
      method: "POST",
      url: "/auth/login",
      headers: { origin: common.publicOrigin },
      payload,
    });
    expect(privateLogin.statusCode).toBe(204);
    expect(privateLogin.cookies.find((c) => c.name === "frevos-internal-session")).toMatchObject({
      httpOnly: true,
      path: "/",
    });
    expect(privateLogin.cookies.some((c) => c.name.startsWith("__Host-"))).toBe(false);
    expect(
      (
        await external.inject({
          method: "POST",
          url: "/workspace/auth/logout",
          headers: authenticated,
          payload: {},
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (await external.inject({ url: "/workspace/v1/session", headers: authenticated })).statusCode,
    ).toBe(401);
    // No forwarded header can select another origin or remove the aggregate rate limit.
    for (let attempt = 0; attempt < 60; attempt++)
      await external.inject({
        method: "POST",
        url: "/workspace/auth/login",
        headers: { ...headers, "x-forwarded-for": `192.0.2.${attempt}` },
        payload: { ...payload, password: "incorrect" },
      });
    const limited = await external.inject({
      method: "POST",
      url: "/workspace/auth/login",
      headers,
      payload,
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers["retry-after"]).toBe("60");
    expect((await internal.inject({ url: "/health" })).statusCode).toBe(200);
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60001);
    try {
      expect(
        (
          await external.inject({
            method: "POST",
            url: "/workspace/auth/login",
            headers,
            payload: { ...payload, password: "incorrect" },
          })
        ).statusCode,
      ).toBe(401);
    } finally {
      clock.mockRestore();
    }
    await rm(join(root, "index.html"));
    await expect(buildBrowserEntry(common, profile, root)).rejects.toThrow();
  } finally {
    await external?.close();
    await internal?.close();
    await pool?.end();
    await admin.end();
    await container.stop();
    await rm(root, { recursive: true, force: true });
  }
}, 120000);
