const changeDetails = { message: "Update development code", approvedBy: "Fixture owner / CHG-123" };
import { GithubConnectionSchema } from "@frevos/contracts";
import { describe, expect, it, vi } from "vitest";
import { createControlCenterApi } from "../src/api.js";

const session = {
  sessionId: "ses_primary",
  userId: "usr_primary",
  authenticatedAt: "2026-08-11T08:00:00.000Z",
  expiresAt: "2026-08-11T20:00:00.000Z",
};

it("uses scoped account/reset contracts and signs out with CSRF without a JSON body", async () => {
  const account = {
    userId: "usr_owner",
    username: "owner",
    displayName: "Owner",
    status: "active",
    passwordChangedAt: "2026-10-22T00:00:00.000Z",
    lastAuthenticatedAt: null,
  };
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const api = createControlCenterApi(
    async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith("/auth/logout")) return new Response(null, { status: 204 });
      return new Response(
        JSON.stringify(
          String(url).endsWith("/users")
            ? [account]
            : String(url).endsWith("/password")
              ? { changed: true }
              : { account, canManageUsers: true },
        ),
      );
    },
    "/frevos",
    () => "csrf-fixture",
  );
  expect((await api.accountProfile?.())?.account?.username).toBe("owner");
  expect(await api.listUsers?.("ws_server20")).toHaveLength(1);
  await api.changePassword?.("old-password", "new-password");
  await api.changePassword?.("admin-password", "reset-password", {
    workspaceId: "ws_server20",
    userId: "usr_target",
  });
  await api.logout?.();
  expect(calls[2]?.url).toBe("/frevos/v1/account/password");
  expect(calls[3]?.url).toBe("/frevos/v1/workspaces/ws_server20/users/usr_target/password");
  expect(calls[4]?.init).toMatchObject({
    method: "POST",
    credentials: "same-origin",
    headers: { "x-csrf-token": "csrf-fixture" },
  });
  expect(calls[4]?.init?.body).toBeUndefined();
});
it("retains auth failure and network semantics when logout cannot be confirmed", async () => {
  await expect(
    createControlCenterApi(
      async () => new Response(null, { status: 204 }),
      "",
      () => undefined,
    ).logout?.(),
  ).rejects.toMatchObject({ kind: "denied" });
  await expect(
    createControlCenterApi(
      async () => {
        throw Error("network");
      },
      "",
      () => "csrf",
    ).logout?.(),
  ).rejects.toMatchObject({ kind: "unavailable" });
  for (const status of [401, 500])
    await expect(
      createControlCenterApi(
        async () => new Response(null, { status }),
        "",
        () => "csrf",
      ).logout?.(),
    ).rejects.toMatchObject({
      kind: status === 401 ? "unauthenticated" : "unavailable",
      responseStatus: status,
    });
});
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
const inspectRequest = { action: "repository.inspect", input: {} } as const;
const githubRepository = {
  providerRepositoryId: "1334902237",
  owner: "mishrarishav",
  name: "TraceGRN",
  url: "https://github.com/mishrarishav/TraceGRN",
  defaultBranch: "main",
  visibility: "private",
  archived: false,
} as const;
const githubConnection = GithubConnectionSchema.parse({
  connectionId: "ghc_primary",
  workspaceId: "ws_alpha",
  provider: "github",
  providerAccountId: "1234567",
  login: "mishrarishav",
  agentId: "svc_trackgrn_windows_agent",
  status: "active",
  repositories: [githubRepository],
  verifiedAt: "2026-08-23T08:00:00.000Z",
  createdAt: "2026-08-23T08:00:00.000Z",
});
const githubDiscovery = {
  operationId: "op_github_01",
  workspaceId: "ws_alpha",
  agentId: "svc_trackgrn_windows_agent",
  requestedBy: "usr_primary",
  action: "github.account.discover",
  status: "queued",
  result: null,
  errorCode: null,
  createdAt: "2026-08-23T08:00:00.000Z",
  claimedAt: null,
  completedAt: null,
} as const;
const projectRepositoryConnection = {
  workspaceId: "ws_alpha",
  projectId: "prj_tracegrn",
  connectionId: "ghc_primary",
  repository: githubRepository,
  status: "connected",
  createdAt: "2026-08-23T08:00:00.000Z",
} as const;

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

  it("reads only the internal CSRF cookie on HTTP origins", async () => {
    vi.stubGlobal("location", { protocol: "http:" });
    try {
      const names: string[] = [];
      let request: RequestInit | undefined;
      const api = createControlCenterApi(
        async (_input, init) => {
          request = init;
          return jsonResponse(automationOperation, 202);
        },
        undefined,
        (name) => {
          names.push(name);
          return name === "frevos-internal-csrf" ? "internal-csrf" : undefined;
        },
      );
      await api.createProjectAutomationOperation("ws_uat_demo", "prj_uat_trackgrn", inspectRequest);
      expect(names).toEqual(["frevos-internal-csrf"]);
      expect(request?.headers).toMatchObject({ "x-csrf-token": "internal-csrf" });
    } finally {
      vi.unstubAllGlobals();
    }
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
        ...inspectRequest,
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
        ...inspectRequest,
      }),
    ).rejects.toMatchObject({ kind: "denied" });
  });

  it("discovers GitHub metadata and connects a repository without browser credentials", async () => {
    const requests: Array<{ path: string; init: RequestInit | undefined }> = [];
    const api = createControlCenterApi(
      async (input, init) => {
        const path = String(input);
        requests.push({ path, init });
        if (path.endsWith("/github/connections")) return jsonResponse([githubConnection]);
        if (path.endsWith("/github/discovery") && init?.method === "POST") {
          return jsonResponse(githubDiscovery, 202);
        }
        if (path.includes("/github/discovery/")) return jsonResponse(githubDiscovery);
        if (path.endsWith("/repository-connections") && init?.method === "POST") {
          return jsonResponse(projectRepositoryConnection, 201);
        }
        return jsonResponse([projectRepositoryConnection]);
      },
      "/frevos",
      () => "csrf-value",
    );

    await expect(api.listGithubConnections("ws_alpha")).resolves.toEqual([githubConnection]);
    await expect(api.createGithubDiscovery("ws_alpha")).resolves.toEqual(githubDiscovery);
    await expect(api.getGithubDiscovery("ws_alpha", "op_github_01")).resolves.toEqual(
      githubDiscovery,
    );
    await expect(api.listProjectRepositoryConnections("ws_alpha")).resolves.toEqual([
      projectRepositoryConnection,
    ]);
    await expect(
      api.connectGithubRepository("ws_alpha", {
        connectionId: githubConnection.connectionId,
        providerRepositoryId: githubRepository.providerRepositoryId,
        displayName: "TraceGRN",
      }),
    ).resolves.toEqual(projectRepositoryConnection);

    expect(requests.map((request) => request.path)).toEqual([
      "/frevos/v1/workspaces/ws_alpha/github/connections",
      "/frevos/v1/workspaces/ws_alpha/github/discovery",
      "/frevos/v1/workspaces/ws_alpha/github/discovery/op_github_01",
      "/frevos/v1/workspaces/ws_alpha/repository-connections",
      "/frevos/v1/workspaces/ws_alpha/repository-connections",
    ]);
    const connectRequest = requests[4]?.init;
    expect(connectRequest).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({ "x-csrf-token": "csrf-value" }),
    });
    expect(connectRequest?.body).toBe(
      JSON.stringify({
        connectionId: "ghc_primary",
        providerRepositoryId: "1334902237",
        displayName: "TraceGRN",
      }),
    );
    expect(JSON.stringify(requests)).not.toMatch(/password|github[_-]?token|authorization/i);
  });

  it.each([
    [401, "unauthenticated"],
    [403, "denied"],
    [404, "denied"],
    [500, "unavailable"],
  ] as const)("maps automation POST HTTP %s to %s", async (status, kind) => {
    const api = createControlCenterApi(
      async () => new Response("private-error-details", { status }),
      undefined,
      () => "csrf-value",
    );
    await expect(
      api.createProjectAutomationOperation("ws_uat_demo", "prj_uat_trackgrn", inspectRequest),
    ).rejects.toMatchObject({ kind });
  });

  it("fails closed for automation POST transport and response failures", async () => {
    const unavailable = createControlCenterApi(
      async () => {
        throw new Error("network details");
      },
      undefined,
      () => "csrf-value",
    );
    await expect(
      unavailable.createProjectAutomationOperation(
        "ws_uat_demo",
        "prj_uat_trackgrn",
        inspectRequest,
      ),
    ).rejects.toMatchObject({ kind: "unavailable" });

    const controller = new AbortController();
    const cancellation = new Error("cancelled");
    controller.abort();
    const aborted = createControlCenterApi(
      async (_input, init) => {
        expect(init?.signal).toBe(controller.signal);
        throw cancellation;
      },
      undefined,
      () => "csrf-value",
    );
    await expect(
      aborted.createProjectAutomationOperation(
        "ws_uat_demo",
        "prj_uat_trackgrn",
        inspectRequest,
        controller.signal,
      ),
    ).rejects.toBe(cancellation);

    const malformed = createControlCenterApi(
      async () => new Response("not-json", { status: 202 }),
      undefined,
      () => "csrf-value",
    );
    await expect(
      malformed.createProjectAutomationOperation("ws_uat_demo", "prj_uat_trackgrn", inspectRequest),
    ).rejects.toMatchObject({ kind: "invalid-response" });

    const invalid = createControlCenterApi(
      async () => jsonResponse({ ...automationOperation, unexpected: true }, 202),
      undefined,
      () => "csrf-value",
    );
    await expect(
      invalid.createProjectAutomationOperation("ws_uat_demo", "prj_uat_trackgrn", inspectRequest),
    ).rejects.toMatchObject({ kind: "invalid-response" });
  });

  it("reads the CSRF token from the browser cookie without exposing it elsewhere", async () => {
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
    try {
      const noDocument = createControlCenterApi(async () => jsonResponse(automationOperation, 202));
      await expect(
        noDocument.createProjectAutomationOperation(
          "ws_uat_demo",
          "prj_uat_trackgrn",
          inspectRequest,
        ),
      ).rejects.toMatchObject({ kind: "denied" });

      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: { cookie: "unrelated=value" },
      });
      const missingCookie = createControlCenterApi(async () =>
        jsonResponse(automationOperation, 202),
      );
      await expect(
        missingCookie.createProjectAutomationOperation(
          "ws_uat_demo",
          "prj_uat_trackgrn",
          inspectRequest,
        ),
      ).rejects.toMatchObject({ kind: "denied" });

      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: { cookie: "unrelated=value; __Host-frevos-csrf=encoded%20csrf" },
      });
      const withCookie = createControlCenterApi(async (_input, init) => {
        expect(init?.headers).toMatchObject({ "x-csrf-token": "encoded csrf" });
        return jsonResponse(automationOperation, 202);
      });
      await expect(
        withCookie.createProjectAutomationOperation(
          "ws_uat_demo",
          "prj_uat_trackgrn",
          inspectRequest,
        ),
      ).resolves.toEqual(automationOperation);
    } finally {
      if (originalDocument === undefined) {
        Reflect.deleteProperty(globalThis, "document");
      } else {
        Object.defineProperty(globalThis, "document", originalDocument);
      }
    }
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

it("loads Servix Git readiness and submits the same request id through the CSRF boundary", async () => {
  const run = {
    version: 1,
    requestId: `sd_${"a".repeat(32)}`,
    workspaceId: "ws_server20",
    requestedBy: "usr_admin",
    target: "server21-servix-development",
    sourceHead: "b".repeat(40),
    status: "building",
    createdAt: "2026-10-21T00:00:00.000Z",
    updatedAt: "2026-10-21T00:00:00.000Z",
    expiresAt: "2026-10-21T00:40:00.000Z",
  };
  const state = {
    available: true,
    runnerOnline: true,
    source: "server20 / servix.git / frevos-dev",
    sourceHead: run.sourceHead,
    target: "10.9.69.21 / D:\\servixDev",
    runs: [],
  };
  const calls: Array<{ path: string; init: RequestInit | undefined }> = [];
  const api = createControlCenterApi(
    async (input, init) => {
      calls.push({ path: String(input), init });
      return jsonResponse(init?.method === "POST" ? run : state);
    },
    "/frevos",
    () => "csrf-value",
  );
  await expect(api.getServixDeploymentState?.("ws_server20")).resolves.toEqual(state);
  await expect(api.deployServix?.("ws_server20", run.requestId, changeDetails)).resolves.toEqual(
    run,
  );
  expect(calls[1]).toMatchObject({
    path: "/frevos/v1/workspaces/ws_server20/servix/deployments",
    init: {
      method: "POST",
      credentials: "same-origin",
      headers: { "x-csrf-token": "csrf-value" },
      body: JSON.stringify({
        version: 1,
        requestId: run.requestId,
        confirmation: "deploy-servix-development",
        changeDetails,
      }),
    },
  });
  await api.deployServix?.("ws_server20", run.requestId, changeDetails, "fc_" + "c".repeat(32));
  expect(JSON.parse(String(calls[2]?.init?.body))).toMatchObject({
    connectorId: "fc_" + "c".repeat(32),
  });
  await api.restoreServix?.(
    "ws_server20",
    run.requestId,
    "sd_" + "d".repeat(32),
    "sd_" + "e".repeat(32),
    "rollback",
    changeDetails,
  );
  expect(calls[3]).toMatchObject({
    path: "/frevos/v1/workspaces/ws_server20/servix/restores",
    init: { method: "POST", headers: { "x-csrf-token": "csrf-value" } },
  });
  expect(JSON.parse(String(calls[3]?.init?.body))).toMatchObject({
    operation: "rollback",
    confirmation: "restore-servix-development",
    changeDetails,
    restoreRequestId: "sd_" + "e".repeat(32),
  });
});

it("preserves a definitive restore rejection separately from an unconfirmed network response", async () => {
  const api = createControlCenterApi(
    async () => new Response("{}", { status: 409 }),
    "",
    () => "csrf",
  );
  await expect(
    api.restoreServix?.(
      "ws_server20",
      "sd_" + "1".repeat(32),
      "sd_" + "2".repeat(32),
      "sd_" + "3".repeat(32),
      "rollback",
      changeDetails,
    ),
  ).rejects.toMatchObject({ responseStatus: 409 });
});
it("lists only server-authorized devices and sends invite/revoke requests through workspace CSRF", async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const api = createControlCenterApi(
    async (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith("/invite"))
        return jsonResponse({
          version: 1,
          code: "fixture-one-time-code",
          username: "alice",
          expiresAt: "2026-10-22T00:00:00.000Z",
        });
      if (url.endsWith("/revoke")) return jsonResponse({ revoked: true });
      return jsonResponse([]);
    },
    "/frevos",
    () => "csrf-fixture",
  );
  expect(await api.listDeveloperConnectors?.("ws_server20")).toEqual([]);
  expect(await api.inviteDeveloper?.("ws_server20", "alice", "Alice")).toMatchObject({
    username: "alice",
  });
  expect(await api.revokeDeveloperConnector?.("ws_server20", "fc_device")).toEqual({
    revoked: true,
  });
  expect(calls[1]).toMatchObject({
    url: "/frevos/v1/workspaces/ws_server20/developers/invite",
    init: {
      headers: { "x-csrf-token": "csrf-fixture" },
      body: JSON.stringify({ version: 1, username: "alice", displayName: "Alice" }),
    },
  });
  expect(calls[2]?.url).toBe("/frevos/v1/workspaces/ws_server20/connectors/fc_device/revoke");
});
