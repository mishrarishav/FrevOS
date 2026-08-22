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
const automationProfile = {
  workspaceId: "ws_uat_demo",
  projectId: "prj_uat_trackgrn",
  repository: {
    provider: "github",
    providerRepositoryId: "1334902237",
    owner: "mishrarishav",
    name: "TraceGRN",
    url: "https://github.com/mishrarishav/TraceGRN",
    defaultBranch: "main",
  },
  agentId: "svc_trackgrn_windows_agent",
  environment: "uat",
  application: {
    publicOrigin: "https://tserver2.eeslindia.org",
    apiBasePath: "/apiTrackGrn",
    healthPath: "/apiTrackGrn/health/live",
    swaggerPath: "/apiTrackGrn/swagger",
  },
  allowedActions: ["repository.inspect"],
};
const automationOperation = {
  operationId: "op_trackgrn_01",
  workspaceId: "ws_uat_demo",
  projectId: "prj_uat_trackgrn",
  agentId: "svc_trackgrn_windows_agent",
  requestedBy: "usr_windows_admin",
  action: "repository.inspect",
  status: "queued",
  input: {},
  result: null,
  errorCode: null,
  createdAt: "2026-08-23T08:00:00.000Z",
  claimedAt: null,
  completedAt: null,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("authenticated Control Center API", () => {
  it("submits local credentials only to the same-origin login route", async () => {
    const requests: Array<{ path: string; init: RequestInit | undefined }> = [];
    const api = createControlCenterApi(async (input, init) => {
      requests.push({ path: String(input), init });
      return new Response(null, { status: 204 });
    }, "/frevos");
    await expect(api.login("personal.admin", "personal-password")).resolves.toBeUndefined();
    expect(requests).toEqual([
      {
        path: "/frevos/auth/login",
        init: expect.objectContaining({
          method: "POST",
          credentials: "same-origin",
          body: JSON.stringify({ username: "personal.admin", password: "personal-password" }),
        }),
      },
    ]);

    const rejected = createControlCenterApi(async () => new Response(null, { status: 401 }));
    await expect(rejected.login("personal.admin", "wrong-password")).rejects.toMatchObject({
      kind: "invalid-credentials",
    });
  });

  it.each([
    [403, "denied"],
    [500, "unavailable"],
  ] as const)("maps local login HTTP %s to %s", async (status, kind) => {
    const api = createControlCenterApi(async () => new Response(null, { status }));
    await expect(api.login("personal.admin", "personal-password")).rejects.toMatchObject({ kind });
  });

  it("fails closed for local-login network errors and preserves cancellation", async () => {
    const unavailable = createControlCenterApi(async () => {
      throw new Error("network details");
    });
    await expect(unavailable.login("personal.admin", "personal-password")).rejects.toMatchObject({
      kind: "unavailable",
    });

    const controller = new AbortController();
    const cancellation = new Error("cancelled");
    controller.abort();
    const aborted = createControlCenterApi(async (_input, init) => {
      expect(init?.signal).toBe(controller.signal);
      throw cancellation;
    });
    await expect(
      aborted.login("personal.admin", "personal-password", controller.signal),
    ).rejects.toBe(cancellation);
  });

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

  it("loads and requests TrackGRN automation through CSRF-protected same-origin routes", async () => {
    const requests: Array<{ path: string; init: RequestInit | undefined }> = [];
    const api = createControlCenterApi(
      async (input, init) => {
        const path = String(input);
        requests.push({ path, init });
        if (init?.method === "POST") {
          return jsonResponse(automationOperation, 202);
        }
        return jsonResponse(path.endsWith("/operations") ? [] : automationProfile);
      },
      "/frevos",
      (name) => (name === "__Host-frevos-csrf" ? "csrf-value" : undefined),
    );

    await expect(api.getProjectAutomation("ws_uat_demo", "prj_uat_trackgrn")).resolves.toEqual(
      automationProfile,
    );
    await expect(
      api.listProjectAutomationOperations("ws_uat_demo", "prj_uat_trackgrn"),
    ).resolves.toEqual([]);
    await expect(
      api.createProjectAutomationOperation("ws_uat_demo", "prj_uat_trackgrn", {
        action: "repository.inspect",
        input: {},
      }),
    ).resolves.toEqual(automationOperation);
    expect(requests[2]).toEqual({
      path: "/frevos/v1/workspaces/ws_uat_demo/projects/prj_uat_trackgrn/automation/operations",
      init: expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: expect.objectContaining({ "x-csrf-token": "csrf-value" }),
        body: JSON.stringify({ action: "repository.inspect", input: {} }),
      }),
    });

    const denied = createControlCenterApi(
      async () => jsonResponse(automationOperation, 202),
      undefined,
      () => undefined,
    );
    await expect(
      denied.createProjectAutomationOperation("ws_uat_demo", "prj_uat_trackgrn", {
        action: "repository.inspect",
        input: {},
      }),
    ).rejects.toMatchObject({ kind: "denied" });
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
