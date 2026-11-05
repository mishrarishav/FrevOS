import {
  authCookiePolicy,
  SessionContextSchema,
  WorkspaceMembershipSchema,
  WorkspaceSchema,
} from "@frevos/contracts";
import { expect, it, vi } from "vitest";
import type { CodeRepositories } from "../src/code-repositories.js";
import { sha256 } from "../src/crypto.js";
import type { IdentitySessionRepository, WorkspaceRepository } from "../src/repositories.js";
import { buildServer } from "../src/server.js";

it("protects every code/download route with live workspace authentication and access changes with CSRF", async () => {
  const ws = "ws_fixture",
    id = "gitrepo_" + "a".repeat(32),
    at = new Date().toISOString();
  const context = SessionContextSchema.parse({
    sessionId: "ses_fixture",
    userId: "usr_fixture",
    identityId: "idn_fixture",
    status: "active",
    authenticatedAt: at,
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  });
  const workspace = WorkspaceSchema.parse({
    workspaceId: ws,
    displayName: "Fixture",
    status: "active",
    createdAt: at,
  });
  const membership = WorkspaceMembershipSchema.parse({
    membershipId: "wsm_fixture",
    workspaceId: ws,
    userId: context.userId,
    status: "active",
    grantedScopes: ["project:read"],
    createdAt: at,
  });
  let active = true;
  const sessions = {
    authenticate: async (token: string) =>
      token === "fixture-session" ? { context, csrfHash: sha256("fixture-csrf") } : null,
  } as unknown as IdentitySessionRepository;
  const workspaces = {
    getEvidence: async (target: string) =>
      target === ws ? { workspace, membership: active ? membership : null } : null,
  } as unknown as WorkspaceRepository;
  const archive = vi.fn(async () => ({
      bytes: Buffer.from("PK-fixture"),
      filename: "fixture.zip",
      head: "a".repeat(40),
      excludedPaths: 2,
    })),
    share = vi.fn(async () => ({ repositoryId: id, revision: 1, ownerId: null, users: [] }));
  const service = {
    catalog: vi.fn(async () => ({ workspaceId: ws, administrator: false, repositories: [] })),
    tree: vi.fn(async () => ({ fixture: true })),
    blob: vi.fn(async () => ({ fixture: true })),
    history: vi.fn(async () => ({ fixture: true })),
    access: vi.fn(async () => ({ fixture: true })),
    archive,
    share,
  } as unknown as CodeRepositories;
  const server = await buildServer({
    publicOrigin: "https://portal.example.invalid",
    basePath: "/devsetu",
    authMode: "local",
    identitySessions: sessions,
    workspaces,
    codeRepositories: service,
  });
  const cookies = authCookiePolicy("https:"),
    headers = {
      origin: "https://portal.example.invalid",
      cookie: `${cookies.session}=fixture-session; ${cookies.csrf}=fixture-csrf`,
      "x-csrf-token": "fixture-csrf",
    };
  const root = `/devsetu/v1/workspaces/${ws}/code-repositories`;
  try {
    for (const op of ["tree", "blob", "history", "access", "archive"])
      expect((await server.inject({ method: "GET", url: `${root}/${id}/${op}` })).statusCode).toBe(
        401,
      );
    expect((await server.inject({ method: "GET", url: root, headers })).statusCode).toBe(200);
    const zip = await server.inject({
      method: "GET",
      url: `${root}/${id}/archive?branch=main`,
      headers,
    });
    expect(zip.statusCode).toBe(200);
    expect(zip.headers["content-type"]).toBe("application/zip");
    expect(zip.headers["content-disposition"]).toContain("attachment;");
    expect(zip.headers["cache-control"]).toBe("no-store");
    expect(zip.headers["x-content-type-options"]).toBe("nosniff");
    expect(zip.body).toBe("PK-fixture");
    for (const op of ["tree", "blob", "history", "access"])
      expect(
        (await server.inject({ method: "GET", url: `${root}/${id}/${op}`, headers })).statusCode,
      ).toBe(200);
    const payload = { version: 1, expectedRevision: 0, userId: "usr_reader", allow: true };
    expect(
      (
        await server.inject({
          method: "POST",
          url: `${root}/${id}/access`,
          headers: { cookie: headers.cookie },
          payload,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await server.inject({
          method: "POST",
          url: `${root}/${id}/access`,
          headers: { ...headers, origin: "https://other.example.invalid" },
          payload,
        })
      ).statusCode,
    ).toBe(403);
    expect(share).not.toHaveBeenCalled();
    expect(
      (await server.inject({ method: "POST", url: `${root}/${id}/access`, headers, payload }))
        .statusCode,
    ).toBe(200);
    expect(share).toHaveBeenCalledOnce();
    active = false;
    expect(
      (await server.inject({ method: "GET", url: `${root}/${id}/archive`, headers })).statusCode,
    ).toBe(403);
    expect(archive).toHaveBeenCalledOnce();

    // Exercise actual TCP sockets: injection cannot reproduce the ten-second
    // connection timeout which interrupted cold catalogue/tree/ZIP reads in IIS.
    active = true;
    const originalCatalog = vi.mocked(service.catalog).getMockImplementation()!,
      originalTree = vi.mocked(service.tree).getMockImplementation()!,
      originalArchive = vi.mocked(service.archive).getMockImplementation()!;
    const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 11_000));
    vi.spyOn(service, "catalog").mockImplementation(async (...args) => {
      await pause();
      return originalCatalog(...args);
    });
    vi.spyOn(service, "tree").mockImplementation(async (...args) => {
      await pause();
      return originalTree(...args);
    });
    vi.spyOn(service, "archive").mockImplementation(async (...args) => {
      await pause();
      return originalArchive(...args);
    });
    await server.listen({ host: "127.0.0.1", port: 0 });
    const address = server.server.address();
    if (!address || typeof address === "string") throw Error("No Code fixture TCP listener");
    const base = `http://127.0.0.1:${address.port}`;
    const responses = await Promise.all(
      [root, `${root}/${id}/tree`, `${root}/${id}/archive`].map((url) =>
        fetch(base + url, { headers, signal: AbortSignal.timeout(20_000) }),
      ),
    );
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
    expect(await responses[0]!.json()).toMatchObject({ workspaceId: ws });
    expect(await responses[1]!.json()).toEqual({ fixture: true });
    expect(await responses[2]!.text()).toBe("PK-fixture");
    active = false;
    expect((await fetch(base + `${root}/${id}/archive`, { headers })).status).toBe(403);
    expect(archive).toHaveBeenCalledTimes(2);
  } finally {
    await server.close();
  }
});
