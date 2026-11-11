import {
  authCookiePolicy,
  ServerMonitorPolicySchema,
  SessionContextSchema,
  WorkspaceMembershipSchema,
  WorkspaceSchema,
} from "@frevos/contracts";
import { afterEach, expect, it, vi } from "vitest";
import { sha256 } from "../src/crypto.js";
import type { IdentitySessionRepository, WorkspaceRepository } from "../src/repositories.js";
import { buildServer } from "../src/server.js";
import { ServerMonitoringService, type ServerMonitoringStore } from "../src/server-monitoring.js";

// Fastify inject only: no local listener, PostgreSQL, Docker or native process.
const open: Awaited<ReturnType<typeof buildServer>>[] = [];
afterEach(async () => {
  for (const server of open.splice(0)) await server.close();
  vi.useRealTimers();
});
const origin = "https://portal.example.invalid",
  workspaceId = "ws_monitor",
  registerId = `rr_${"a".repeat(32)}`;
const root = `/devsetu/v1/workspaces/${workspaceId}/server-monitoring`;
const cookies = authCookiePolicy("https:");
const headers = (actor = "usr_admin") => ({
  origin,
  cookie: `${cookies.session}=${actor}; ${cookies.csrf}=fixture-csrf`,
  "x-csrf-token": "fixture-csrf",
});
const targetInput = {
  expectedRevision: null,
  name: "Server",
  address: "10.43.1.9",
  port: 5985,
  transport: "winrm-http",
  credentialProfile: "monitor-profile",
  grants: ["usr_viewer"],
  enabled: true,
};
const imports = {
  registerId,
  managementValues: ["Managed"],
  hostingField: "hosting",
  credentialProfile: "monitor-profile",
  transport: "winrm-http",
  port: 5985,
  enabled: true,
};
async function fixture(
  options: { missing?: boolean; worker?: boolean; workerInterval?: number } = {},
) {
  let active = true;
  const at = new Date().toISOString();
  const workspace = WorkspaceSchema.parse({
    workspaceId,
    displayName: "Monitoring",
    status: "active",
    createdAt: at,
  });
  const member = (actor: string) =>
    WorkspaceMembershipSchema.parse({
      membershipId: `wsm_${actor}`,
      workspaceId,
      userId: actor,
      status: "active",
      grantedScopes: ["project:read"],
      createdAt: at,
    });
  const sessions = {
    authenticate: async (token: string) =>
      ["usr_admin", "usr_viewer", "usr_other"].includes(token)
        ? {
            context: SessionContextSchema.parse({
              sessionId: `ses_${token}`,
              userId: token,
              identityId: `idn_${token}`,
              status: "active",
              authenticatedAt: at,
              expiresAt: new Date(Date.now() + 3600000).toISOString(),
            }),
            csrfHash: sha256("fixture-csrf"),
          }
        : null,
  } as unknown as IdentitySessionRepository;
  const workspaces = {
    getEvidence: async (id: string, actor: string) =>
      id === workspaceId ? { workspace, membership: active ? member(actor) : null } : null,
  } as unknown as WorkspaceRepository;
  const documents = new Map<string, unknown>();
  let queue: Promise<unknown> = Promise.resolve();
  const store: ServerMonitoringStore = {
    read: async (ws) => structuredClone(documents.get(ws) ?? null),
    write: async (ws, data) => {
      documents.set(ws, structuredClone(data));
    },
    workspaces: async () => [workspaceId],
    now: () => new Date().toISOString(),
    transaction: <T>(_ws: string, action: () => Promise<T>) => {
      const pending = queue.then(action);
      queue = pending.catch(() => {});
      return pending;
    },
  };
  const collector = vi.fn(async () => ({
    status: "connected" as const,
    computerName: "Server",
    snapshot: {
      observedAt: new Date().toISOString(),
      computerName: "Server",
      osName: "Windows Server",
      uptimeSeconds: 1000,
      logicalProcessors: 4,
      cpuPercent: 20,
      memoryTotalBytes: 100,
      memoryAvailableBytes: 50,
      disks: [],
      network: { receivedBytesPerSecond: null, sentBytesPerSecond: null },
      processes: [],
      services: [],
    },
  }));
  const service = new ServerMonitoringService({
    store,
    authority: async (ws, actor) => ({
      active:
        active && ws === workspaceId && ["usr_admin", "usr_viewer", "usr_other"].includes(actor),
      administrator: actor === "usr_admin",
    }),
    readRegister: async () => ({ id: registerId, records: [] }),
    targetAllowed: async () => true,
    sourcePolicies: [
      { workspaceId, registerId, managementValues: ["Managed"], hostingField: "hosting" },
    ],
    collector,
  });
  const target = (await service.saveTarget(workspaceId, "usr_admin", targetInput)).targets[0];
  if (!target) throw new Error("Missing fixture target");
  const server = await buildServer({
    publicOrigin: origin,
    basePath: "/devsetu",
    authMode: "local",
    identitySessions: sessions,
    workspaces,
    ...(options.missing ? {} : { serverMonitoring: service }),
    serverMonitoringEnabled: options.worker ?? false,
    ...(options.workerInterval ? { serverMonitoringWorkerIntervalMs: options.workerInterval } : {}),
  });
  open.push(server);
  return {
    server,
    service,
    collector,
    target,
    revoke: () => {
      active = false;
    },
  };
}

it("requires a session and CSRF on every server-monitoring command under the deployment base path", async () => {
  const f = await fixture();
  expect((await f.server.inject({ method: "GET", url: root })).statusCode).toBe(401);
  const mutations = [
    { method: "POST" as const, path: "/targets", payload: targetInput },
    { method: "POST" as const, path: "/imports", payload: imports },
    { method: "POST" as const, path: "/checks", payload: {} },
    { method: "POST" as const, path: "/refresh", payload: {} },
    {
      method: "PUT" as const,
      path: "/policy",
      payload: { expectedRevision: 0, policy: ServerMonitorPolicySchema.parse({}) },
    },
    { method: "POST" as const, path: `/alerts/sma_${"a".repeat(32)}/acknowledge`, payload: {} },
  ];
  for (const mutation of mutations) {
    const request = {
      method: mutation.method,
      url: root + mutation.path,
      payload: mutation.payload,
    };
    expect((await f.server.inject(request)).statusCode).toBe(401);
    expect(
      (await f.server.inject({ ...request, headers: { cookie: headers().cookie } })).statusCode,
    ).toBe(403);
    expect(
      (
        await f.server.inject({
          ...request,
          headers: { ...headers(), origin: "https://other.example.invalid" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await f.server.inject({
          ...request,
          headers: { ...headers(), "x-csrf-token": "wrong-token" },
        })
      ).statusCode,
    ).toBe(403);
  }
  expect(f.collector).not.toHaveBeenCalled();
  expect(
    (
      await f.server.inject({
        method: "GET",
        url: root.slice("/devsetu".length),
        headers: headers(),
      })
    ).statusCode,
  ).toBe(404);
});

it("returns only explicitly shared targets and keeps polling read-only and uncached", async () => {
  const f = await fixture();
  const response = await f.server.inject({
    method: "GET",
    url: root,
    headers: headers("usr_viewer"),
  });
  expect(response.statusCode).toBe(200);
  expect(response.headers["cache-control"]).toBe("no-store");
  const catalog = response.json();
  expect(catalog.administrator).toBe(false);
  expect(catalog.targets).toHaveLength(1);
  expect(catalog.targets[0]).not.toHaveProperty("credentialProfile");
  expect(catalog.targets[0]).not.toHaveProperty("grants");
  expect(
    (await f.server.inject({ method: "GET", url: root, headers: headers("usr_other") })).json()
      .targets,
  ).toEqual([]);
  expect(f.collector).not.toHaveBeenCalled();
  f.revoke();
  expect((await f.server.inject({ method: "GET", url: root, headers: headers() })).statusCode).toBe(
    403,
  );
  expect(
    (
      await f.server.inject({
        method: "GET",
        url: root.replace(workspaceId, "ws_foreign"),
        headers: headers(),
      })
    ).statusCode,
  ).toBe(404);
});

it("queues authorized refresh/check without collecting in the HTTP request", async () => {
  const f = await fixture();
  for (const action of ["checks", "refresh"]) {
    const response = await f.server.inject({
      method: "POST",
      url: `${root}/${action}`,
      headers: headers("usr_viewer"),
      payload: { targetId: f.target.id },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().targets[0].polling).toBe(true);
    expect(response.headers["cache-control"]).toBe("no-store");
  }
  expect(f.collector).not.toHaveBeenCalled();
  await f.service.runDue();
  expect(f.collector).toHaveBeenCalledOnce();
  const forbidden = await f.server.inject({
    method: "POST",
    url: `${root}/refresh`,
    headers: headers("usr_other"),
    payload: { targetId: f.target.id },
  });
  expect(forbidden.statusCode).toBe(404);
  expect(forbidden.json()).toEqual({ error: "server-monitoring-target-not-found" });
});

it("validates all mutations and enforces domain administration/revision boundaries", async () => {
  const f = await fixture();
  const request = (
    path: string,
    payload: unknown,
    actor = "usr_admin",
    method: "POST" | "PUT" = "POST",
  ) => f.server.inject({ method, url: root + path, headers: { ...headers(actor), "content-type": "application/json" }, payload: JSON.stringify(payload) });
  expect(
    (
      await request("/targets", {
        ...targetInput,
        id: f.target.id,
        expectedRevision: 0,
        name: "Updated",
      })
    ).statusCode,
  ).toBe(200);
  expect(
    (await request("/targets", { ...targetInput, id: f.target.id, expectedRevision: 0 }))
      .statusCode,
  ).toBe(409);
  expect((await request("/targets", targetInput, "usr_viewer")).statusCode).toBe(403);
  expect((await request("/imports", imports, "usr_viewer")).statusCode).toBe(403);
  expect((await request("/imports", imports)).json().added).toBe(0);
  expect((await request("/imports", { ...imports, managementValues: ["Vendor"] })).statusCode).toBe(
    403,
  );
  expect((await request("/targets", { ...targetInput, address: "8.8.8.8" })).statusCode).toBe(400);
  expect(
    (await request("/targets", { ...targetInput, password: "must-not-be-accepted" })).json(),
  ).toEqual({ error: "invalid-request" });
  expect((await request("/refresh", { command: "raw shell" })).statusCode).toBe(400);
  expect(
    (
      await request(
        "/policy",
        { expectedRevision: 0, policy: ServerMonitorPolicySchema.parse({}) },
        "usr_admin",
        "PUT",
      )
    ).statusCode,
  ).toBe(200);
  expect(
    (
      await request(
        "/policy",
        { expectedRevision: 1, policy: ServerMonitorPolicySchema.parse({}) },
        "usr_viewer",
        "PUT",
      )
    ).statusCode,
  ).toBe(403);
  expect((await request("/alerts/invalid/acknowledge", {})).statusCode).toBe(400);
  expect(
    (await request(`/alerts/sma_${"a".repeat(32)}/acknowledge`, { userId: "usr_other" }))
      .statusCode,
  ).toBe(400);
  const acknowledge = vi
    .spyOn(f.service, "acknowledge")
    .mockResolvedValue(await f.service.catalog(workspaceId, "usr_viewer"));
  expect(
    (await request(`/alerts/sma_${"a".repeat(32)}/acknowledge`, {}, "usr_viewer")).statusCode,
  ).toBe(200);
  expect(acknowledge).toHaveBeenCalledWith(workspaceId, "usr_viewer", {
    alertId: `sma_${"a".repeat(32)}`,
  });
});

it("reports an unavailable module without bypassing authentication or leaking internal details", async () => {
  const f = await fixture({ missing: true });
  expect((await f.server.inject({ method: "GET", url: root })).statusCode).toBe(401);
  const response = await f.server.inject({ method: "GET", url: root, headers: headers() });
  expect(response.statusCode).toBe(503);
  expect(response.json()).toEqual({ error: "server-monitoring-not-configured" });
  const configured = await fixture();
  vi.spyOn(configured.service, "catalog").mockRejectedValue(
    new Error("private-registry-and-credential-detail"),
  );
  expect(
    (await configured.server.inject({ method: "GET", url: root, headers: headers() })).json(),
  ).toEqual({ error: "internal-error" });
  expect(
    (
      await configured.server.inject({
        method: "POST",
        url: `${root}/refresh`,
        headers: { ...headers(), "content-type": "application/json" },
        payload: "{",
      })
    ).statusCode,
  ).toBe(400);
});

it("runs a single-flight worker on readiness and waits for its bounded work before closing", async () => {
  vi.useFakeTimers();
  const f = await fixture({ worker: true, workerInterval: 1000 });
  let finish!: () => void;
  const hold = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const run = vi.spyOn(f.service, "runDue").mockImplementation(async () => {
    await hold;
    return 0;
  });
  await f.server.ready();
  await Promise.resolve();
  expect(run).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(5000);
  expect(run).toHaveBeenCalledOnce();
  let closed = false;
  const closing = f.server.close().then(() => {
    closed = true;
  });
  await Promise.resolve();
  expect(closed).toBe(false);
  finish();
  await closing;
  expect(closed).toBe(true);
  await vi.advanceTimersByTimeAsync(5000);
  expect(run).toHaveBeenCalledOnce();
});

it("recovers a failed worker tick and can explicitly disable the background timer", async () => {
  vi.useFakeTimers();
  const f = await fixture({ worker: true, workerInterval: 1000 });
  const run = vi
    .spyOn(f.service, "runDue")
    .mockRejectedValueOnce(new Error("private-error"))
    .mockResolvedValue(0);
  await f.server.ready();
  await vi.advanceTimersByTimeAsync(2000);
  expect(run.mock.calls.length).toBeGreaterThan(1);
  const disabled = await fixture();
  const idle = vi.spyOn(disabled.service, "runDue");
  await disabled.server.ready();
  await vi.advanceTimersByTimeAsync(5000);
  expect(idle).not.toHaveBeenCalled();
});
