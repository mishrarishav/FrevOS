import { describe, expect, it } from "vitest";
import { createControlCenterApi } from "../src/api.js";

const session = {
  sessionId: "ses_primary",
  userId: "usr_primary",
  authenticatedAt: "2026-08-11T08:00:00.000Z",
  expiresAt: "2026-08-11T20:00:00.000Z",
};
const workspace = {
  workspaceId: "ws_alpha",
  displayName: "Alpha Workspace",
  status: "active",
  createdAt: "2026-08-11T08:00:00.000Z",
};
const client = {
  clientId: "cli_alpha",
  workspaceId: "ws_alpha",
  displayName: "Alpha Client",
  status: "active",
  createdAt: "2026-08-11T08:00:00.000Z",
};
const project = {
  projectId: "prj_alpha",
  workspaceId: "ws_alpha",
  clientId: "cli_alpha",
  displayName: "Alpha Project",
  status: "active",
  createdAt: "2026-08-11T08:00:00.000Z",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("authenticated Control Center API", () => {
  it("loads strict same-origin session and workspace resources without browser tokens", async () => {
    const requests: Array<{ path: string; init: RequestInit | undefined }> = [];
    const api = createControlCenterApi(async (input, init) => {
      const path = String(input);
      requests.push({ path, init });
      const bodies: Record<string, unknown> = {
        "/v1/session": session,
        "/v1/workspaces": [workspace],
        "/v1/workspaces/ws_alpha": workspace,
        "/v1/workspaces/ws_alpha/clients": [client],
        "/v1/workspaces/ws_alpha/projects": [project],
      };
      return jsonResponse(bodies[path]);
    });

    await expect(api.getSession()).resolves.toEqual(session);
    await expect(api.listWorkspaces()).resolves.toEqual([workspace]);
    await expect(api.getWorkspaceSnapshot("ws_alpha")).resolves.toEqual({
      workspace,
      clients: [client],
      projects: [project],
    });
    expect(requests).toHaveLength(5);
    for (const request of requests) {
      expect(request.init).toMatchObject({
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      expect(JSON.stringify(request.init)).not.toContain("token");
      expect(request.init?.signal).toBeUndefined();
    }

    expect(createControlCenterApi()).toBeDefined();
  });

  it("passes cancellation through and safely encodes the selected workspace", async () => {
    const controller = new AbortController();
    const paths: string[] = [];
    const api = createControlCenterApi(async (input, init) => {
      paths.push(String(input));
      expect(init?.signal).toBe(controller.signal);
      const path = String(input);
      if (path.endsWith("/clients")) {
        return jsonResponse([]);
      }
      if (path.endsWith("/projects")) {
        return jsonResponse([]);
      }
      return jsonResponse(workspace);
    });

    await expect(api.getWorkspaceSnapshot("ws_alpha/path", controller.signal)).resolves.toEqual({
      workspace,
      clients: [],
      projects: [],
    });
    expect(paths).toEqual([
      "/v1/workspaces/ws_alpha%2Fpath",
      "/v1/workspaces/ws_alpha%2Fpath/clients",
      "/v1/workspaces/ws_alpha%2Fpath/projects",
    ]);
  });

  it("scopes browser API requests under the configured same-origin base path", async () => {
    const paths: string[] = [];
    const api = createControlCenterApi(async (input) => {
      paths.push(String(input));
      return jsonResponse(session);
    }, "/frevos");

    await api.getSession();
    expect(paths).toEqual(["/frevos/v1/session"]);
  });

  it.each([
    [401, "unauthenticated"],
    [403, "denied"],
    [404, "denied"],
    [500, "unavailable"],
  ] as const)("maps HTTP %s to %s without reading an error body", async (status, kind) => {
    const api = createControlCenterApi(async () => new Response("secret-like-error", { status }));
    await expect(api.getSession()).rejects.toMatchObject({ kind });
  });

  it("fails closed for network failures but preserves cancellation", async () => {
    const unavailable = createControlCenterApi(async () => {
      throw new Error("network details");
    });
    await expect(unavailable.getSession()).rejects.toMatchObject({
      kind: "unavailable",
      message: "unavailable",
    });

    const controller = new AbortController();
    const cancellation = new Error("cancelled");
    controller.abort();
    const aborted = createControlCenterApi(async () => {
      throw cancellation;
    });
    await expect(aborted.getSession(controller.signal)).rejects.toBe(cancellation);
  });

  it("fails closed for malformed JSON and schema-invalid success responses", async () => {
    const malformed = createControlCenterApi(async () => new Response("not-json", { status: 200 }));
    await expect(malformed.getSession()).rejects.toMatchObject({
      kind: "invalid-response",
    });

    const invalid = createControlCenterApi(async () =>
      jsonResponse({ ...session, accessToken: "must-not-cross" }),
    );
    await expect(invalid.getSession()).rejects.toMatchObject({
      kind: "invalid-response",
    });
  });
});
