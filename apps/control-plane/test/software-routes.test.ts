import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  authCookiePolicy,
  SessionContextSchema,
  WorkspaceMembershipSchema,
  WorkspaceSchema,
} from "@frevos/contracts";
import { expect, it } from "vitest";
import { sha256 } from "../src/crypto.js";
import type { IdentitySessionRepository, WorkspaceRepository } from "../src/repositories.js";
import { buildServer } from "../src/server.js";
import { ServixDeploymentError } from "../src/servix-deployment.js";
import { SoftwareManagement } from "../src/software-management.js";

async function cleanup(root: string) {
  if (dirname(resolve(root)) !== resolve(tmpdir()) || !root.includes("frevos-software-routes-"))
    throw Error("cleanup scope");
  await rm(root, { recursive: true, force: true });
}
it("enforces actual session, workspace, CSRF and administrator boundaries on software routes", async () => {
  const root = await mkdtemp(join(tmpdir(), "frevos-software-routes-")),
    deviceId = "fc_" + "a".repeat(32),
    workspaceId = "ws_server20",
    user = "usr_fixture";
  const context = SessionContextSchema.parse({
    sessionId: "ses_fixture",
    userId: user,
    identityId: "idn_fixture",
    status: "active",
    authenticatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 600000).toISOString(),
  });
  const workspace = WorkspaceSchema.parse({
    workspaceId,
    displayName: "Software fixture",
    status: "active",
    createdAt: context.authenticatedAt,
  });
  let membership = WorkspaceMembershipSchema.parse({
      membershipId: "wsm_fixture",
      workspaceId,
      userId: user,
      status: "active",
      grantedScopes: ["project:read", "project:write"],
      createdAt: context.authenticatedAt,
    }),
    signedIn = true,
    administrator = true;
  const sessions = {
    authenticate: async (token: string) =>
      signedIn && token === "synthetic-session"
        ? { context, csrfHash: sha256("synthetic-csrf") }
        : null,
  } as unknown as IdentitySessionRepository;
  const workspaces = {
    getEvidence: async (id: string) => (id === workspaceId ? { workspace, membership } : null),
  } as unknown as WorkspaceRepository;
  const device = {
    deviceId,
    userId: user,
    workspaceId,
    name: "Fixture desktop",
    online: true,
    status: "active",
    workspaceAuthorized: true,
  };
  const devices = {
    discoveryDevices: async (actor: string) => (actor === user ? [device] : []),
    checkCredential: async (value: string) => {
      if (value !== "fixture-device")
        throw new ServixDeploymentError("software-credential-denied", 401);
      return device;
    },
  };
  const store = new SoftwareManagement(root, workspaceId, devices, async () => administrator);
  const server = await buildServer({
    authMode: "local",
    publicOrigin: "http://portal.internal",
    identitySessions: sessions,
    workspaces,
    software: store,
  });
  const cookies = authCookiePolicy("http:"),
    headers = {
      origin: "http://portal.internal",
      cookie: `${cookies.session}=synthetic-session; ${cookies.csrf}=synthetic-csrf`,
      "x-csrf-token": "synthetic-csrf",
    },
    native = { authorization: "Bearer fixture-device" };
  const path = `/v1/workspaces/${workspaceId}/software/`;
  try {
    expect((await server.inject({ method: "GET", url: path + deviceId })).statusCode).toBe(401);
    expect((await server.inject({ method: "GET", url: path + deviceId, headers })).statusCode).toBe(
      200,
    );
    expect(
      (await server.inject({ method: "GET", url: path + "fc_" + "b".repeat(32), headers }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await server.inject({
          method: "GET",
          url: path + deviceId + "?inventorySince=bad",
          headers,
        })
      ).statusCode,
    ).toBe(400);
    const catalog = { version: 1, expectedRevision: 0, packages: [] };
    expect(
      (
        await server.inject({
          method: "POST",
          url: path + "catalog",
          headers: { cookie: headers.cookie, origin: headers.origin },
          payload: catalog,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await server.inject({ method: "POST", url: path + "catalog", headers, payload: catalog }))
        .statusCode,
    ).toBe(200);
    administrator = false;
    expect(
      (
        await server.inject({
          method: "POST",
          url: path + "catalog",
          headers,
          payload: { ...catalog, expectedRevision: 1 },
        })
      ).statusCode,
    ).toBe(403);
    administrator = true;
    expect(
      (
        await server.inject({
          method: "POST",
          url: "/v1/connector/software/identity",
          headers: native,
          payload: {},
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await server.inject({ method: "POST", url: "/v1/connector/software/identity", payload: {} }))
        .statusCode,
    ).toBe(401);
    expect(
      (
        await server.inject({
          method: "POST",
          url: "/v1/connector/software/observe",
          headers: native,
          payload: {
            version: 1,
            platform: "win32",
            inventoryConsent: true,
            installConsent: true,
            programSha256: "c".repeat(64),
            services: [],
          },
        })
      ).statusCode,
    ).toBe(200);
    const payload = {
      version: 1,
      requestId: "sw_" + "c".repeat(32),
      deviceId,
      operation: "inventory",
    };
    const initialRoute = "/v1/connector/software/initial-inventory";
    expect(
      (await server.inject({ method: "POST", url: initialRoute, payload: {} })).statusCode,
    ).toBe(401);
    expect(
      (
        await server.inject({
          method: "POST",
          url: initialRoute,
          headers: native,
          payload: { deviceId: "fc_" + "b".repeat(32) },
        })
      ).statusCode,
    ).toBe(400);
    const requested = await server.inject({
      method: "POST",
      url: path + "requests",
      headers,
      payload,
    });
    expect(requested.statusCode).toBe(200);
    const claimed = await server.inject({
      method: "POST",
      url: "/v1/connector/software/claim",
      headers: native,
      payload: {},
    });
    expect(claimed.statusCode).toBe(200);
    const job = claimed.json().job;
    expect(
      (
        await server.inject({
          method: "POST",
          url: "/v1/connector/software/authorize",
          headers: native,
          payload: { requestId: payload.requestId, digest: job.digest },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await server.inject({
          method: "POST",
          url: "/v1/connector/software/complete",
          headers: native,
          payload: { requestId: payload.requestId, digest: job.digest, result: "failed" },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await server.inject({
          method: "POST",
          url: path + "decisions",
          headers,
          payload: { requestId: payload.requestId, digest: job.digest, decision: "approve" },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await server.inject({
          method: "POST",
          url: path + "requests",
          headers,
          payload: { ...payload, operation: "exec", command: "whoami" },
        })
      ).statusCode,
    ).toBe(400);
    membership = WorkspaceMembershipSchema.parse({
      ...membership,
      grantedScopes: ["project:read"],
    });
    expect(
      (await server.inject({ method: "POST", url: path + "requests", headers, payload }))
        .statusCode,
    ).toBe(403);
    signedIn = false;
    expect((await server.inject({ method: "GET", url: path + deviceId, headers })).statusCode).toBe(
      401,
    );
  } finally {
    await server.close();
    await cleanup(root);
  }
});
