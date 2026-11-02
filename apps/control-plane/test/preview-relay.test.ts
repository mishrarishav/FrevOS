import { createServer, request as httpRequest, type Server } from "node:http";
import { createRequire } from "node:module";
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  authCookiePolicy,
  SessionContextSchema,
  WorkspaceSchema,
  WorkspaceMembershipSchema,
  type LocalDevSnapshot,
  type PreviewJob,
} from "@frevos/contracts";
import { afterEach, expect, it } from "vitest";
import { DeveloperConnectorStore } from "../src/developer-connectors.js";
import { LocalDevelopment } from "../src/local-development.js";
import {
  PreviewConfigSchema,
  PreviewRelay,
  loadPreviewConfig,
  privateAddress,
  validatePreviewConfig,
} from "../src/preview-relay.js";
import { buildServer } from "../src/server.js";
import { sha256 } from "../src/crypto.js";
import type { IdentitySessionRepository, WorkspaceRepository } from "../src/repositories.js";

const require = createRequire(import.meta.url);
const { forward } = require("../../../deployment/servix/PreviewRelay.cjs");
const {
  LocalDevelopmentRuntime,
  validatePlan,
} = require("../../../deployment/servix/LocalDevelopment.cjs");
const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  if (!address || typeof address === "string") throw Error();
  return address.port;
}
async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}
async function fixture(options: Record<string, unknown> = {}) {
  const root = await mkdtemp(join(tmpdir(), "devsetu-preview-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  let instant = Date.now(),
    authorized = true;
  const clock = () => new Date(instant),
    members = new Set(["usr_alice", "usr_bob"]);
  const connectors = new DeveloperConnectorStore(
    join(root, "connectors"),
    async (actor) => members.has(actor),
    { head: async () => "a".repeat(40), importBundle: async () => {} },
    async () => {},
    clock,
  );
  cleanups.push(async () => connectors.close());
  const alice = await connectors.pair("usr_alice", { version: 1, name: "Source laptop" }),
    bob = await connectors.pair("usr_bob", { version: 1, name: "Other laptop" });
  await connectors.heartbeat(alice.credential);
  await connectors.heartbeat(bob.credential);
  const appRequests: {
    url: string;
    method: string;
    body: Buffer;
    headers: Record<string, unknown>;
  }[] = [];
  let appPort = 0;
  const app = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const part of request) chunks.push(Buffer.from(part));
    const body = Buffer.concat(chunks);
    appRequests.push({
      url: request.url!,
      method: request.method!,
      body,
      headers: request.headers,
    });
    if (request.url === "/redirect") {
      response.writeHead(302, { Location: `http://localhost:${appPort}/finished` });
      response.end();
      return;
    }
    if (request.url === "/external") {
      response.writeHead(302, { Location: "https://example.org/" });
      response.end();
      return;
    }
    if (request.url === "/stream") {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end("data: event\n\n");
      return;
    }
    if (request.url === "/large") {
      response.end(Buffer.alloc(2048));
      return;
    }
    if (request.url === "/slow") return;
    if (request.url === "/bad-location") {
      response.writeHead(302, { Location: "http://[" });
      response.end();
      return;
    }
    response.writeHead(201, {
      "content-type": "application/octet-stream",
      "set-cookie": [
        "appSession=synthetic; Domain=localhost; Path=/; HttpOnly",
        "devsetu-preview=forged; Path=/",
      ],
      connection: "close, x-hidden",
      "x-hidden": "discard",
      "x-app-header": "retained",
    });
    response.end(body.length ? body : Buffer.from([0, 1, 128, 255]));
  });
  appPort = await listen(app);
  const snapshot: LocalDevSnapshot = {
    version: 1,
    deviceId: alice.deviceId,
    profileId: "servix-development",
    fingerprint: "b".repeat(64),
    revision: 1,
    sourceReady: true,
    previewRelay: 1,
    candidates: [],
    plan: {
      services: [
        {
          id: "web",
          port: appPort,
          database: "none",
          script: "start",
          preview: { apiPath: "/api" },
        },
      ],
    },
    services: [{ id: "web", status: "running" }],
  };
  const local = new LocalDevelopment(join(root, "jobs"), connectors, clock);
  await local.observe(alice.credential, snapshot);
  const port = await freePort(),
    origin = `http://localhost:${port}`,
    portal = "http://127.0.0.1:45001";
  const config = PreviewConfigSchema.parse({
    version: 1,
    workspaceId: "ws_server20",
    listen: { host: "127.0.0.1", port },
    targets: [
      { origin, deviceId: alice.deviceId, profileId: snapshot.profileId, serviceId: "web" },
    ],
    ...options,
  });
  const audit = join(root, "audit"),
    relay = new PreviewRelay(config, portal, audit, local, connectors, () => instant);
  await relay.listen();
  cleanups.push(() => relay.close());
  const authorize = async () => {
    if (!authorized) throw Error("revoked-session");
  };
  const open = () =>
    relay.open(
      "usr_alice",
      "ws_server20",
      { deviceId: alice.deviceId, serviceId: "web" },
      authorize,
    );
  async function request(
    path: string,
    init: { method?: string; body?: Buffer | string; headers?: Record<string, string> } = {},
  ) {
    return new Promise<{ status: number; headers: Record<string, unknown>; body: Buffer }>(
      (resolve, reject) => {
        const req = httpRequest(
          {
            host: "127.0.0.1",
            port,
            path,
            method: init.method ?? "GET",
            headers: { host: new URL(origin).host, ...init.headers },
            agent: false,
          },
          (response) => {
            const parts: Buffer[] = [];
            response.on("data", (p) => parts.push(p));
            response.on("end", () =>
              resolve({
                status: response.statusCode!,
                headers: response.headers,
                body: Buffer.concat(parts),
              }),
            );
          },
        );
        req.on("error", reject);
        req.end(init.body);
      },
    );
  }
  async function bootstrap(ticket?: string) {
    const value = ticket ?? (await open()).ticket;
    const result = await request("/.__devsetu/open", {
      method: "POST",
      headers: { origin: portal, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ticket: value }).toString(),
    });
    return {
      result,
      cookie: String((result.headers["set-cookie"] as string[] | undefined)?.[0] ?? "").split(
        ";",
      )[0]!,
    };
  }
  const runtime = {
    previewTarget: async (job: PreviewJob) => {
      const target = await local.previewTarget(
        "usr_alice",
        job.workspaceId,
        job.deviceId,
        job.serviceId,
      );
      if (
        job.revision !== target.snapshot.revision ||
        job.fingerprint !== target.snapshot.fingerprint
      )
        throw Error();
      return { port: target.service.port };
    },
  };
  async function deliver() {
    const { jobs } = await relay.claim(alice.credential);
    await Promise.all(
      jobs.map(async (job) => relay.complete(alice.credential, await forward(job, runtime))),
    );
    return jobs;
  }
  return {
    root,
    connectors,
    alice,
    bob,
    local,
    snapshot,
    relay,
    config,
    origin,
    portal,
    audit,
    open,
    request,
    bootstrap,
    deliver,
    runtime,
    appRequests,
    advance: (ms: number) => {
      instant += ms;
    },
    revoke: () => {
      authorized = false;
    },
    members,
  };
}
it("relays a real binary HTTP response, status, query, app headers, POST body and application cookie without control-plane credentials", async () => {
  const f = await fixture();
  const { cookie, result } = await f.bootstrap();
  expect(result.status).toBe(200);
  const response = f.request("/binary?q=one&q=two", {
    headers: {
      cookie:
        cookie +
        "; appSession=synthetic; frevos-session=never-forward; __Host-frevos-csrf=never-forward",
    },
  });
  expect(await f.deliver()).toHaveLength(1);
  const received = await response;
  expect(received.status).toBe(201);
  expect(received.body).toEqual(Buffer.from([0, 1, 128, 255]));
  expect(received.headers["x-app-header"]).toBe("retained");
  expect(received.headers["x-hidden"]).toBeUndefined();
  expect(received.headers["set-cookie"]).toEqual(["appSession=synthetic; Path=/; HttpOnly"]);
  expect(f.appRequests[0]!.url).toBe("/binary?q=one&q=two");
  expect(f.appRequests[0]!.headers["cookie"]).toContain("appSession=synthetic");
  expect(f.appRequests[0]!.headers["cookie"]).not.toMatch(/frevos|devsetu/);
  const body = Buffer.from([255, 0, 1]),
    posted = f.request("/api/save", {
      method: "POST",
      headers: {
        cookie,
        origin: f.origin,
        "content-type": "application/octet-stream",
        authorization: "Bearer synthetic-app-token",
      },
      body,
    });
  await f.deliver();
  expect((await posted).body).toEqual(body);
  expect(f.appRequests[1]!.method).toBe("POST");
  expect(f.appRequests[1]!.headers["authorization"]).toBe("Bearer synthetic-app-token");
  const records = (await readdir(f.audit)).map((name) => readFile(join(f.audit, name), "utf8"));
  expect((await Promise.all(records)).join()).not.toMatch(
    /synthetic|app-token|binary\?|ticket|cookie/,
  );
});
it("matches concurrent requests to their original browser responses and rejects wrong-device completion and replay", async () => {
  const f = await fixture(),
    { cookie } = await f.bootstrap();
  const first = f.request("/first", { headers: { cookie } }),
    second = f.request("/second", { headers: { cookie } });
  let jobs = (await f.relay.claim(f.alice.credential)).jobs;
  if (jobs.length < 2) jobs.push(...(await f.relay.claim(f.alice.credential)).jobs);
  expect(jobs).toHaveLength(2);
  for (const job of jobs.reverse()) {
    const completion = {
      id: job.id,
      ok: true as const,
      status: 200,
      headers: [],
      body: Buffer.from(job.path).toString("base64"),
    };
    await expect(f.relay.complete(f.bob.credential, completion)).rejects.toThrow(
      "request-not-found",
    );
    await f.relay.complete(f.alice.credential, completion);
    await expect(f.relay.complete(f.alice.credential, completion)).rejects.toThrow(
      "request-not-found",
    );
  }
  expect((await first).body.toString()).toBe("/first");
  expect((await second).body.toString()).toBe("/second");
});
it("preserves local redirects within the preview and rejects external redirect and unsupported streaming", async () => {
  const f = await fixture(),
    { cookie } = await f.bootstrap();
  for (const [path, status] of [
    ["/redirect", 302],
    ["/external", 502],
    ["/stream", 502],
  ] as const) {
    const promise = f.request(path, { headers: { cookie } });
    await f.deliver();
    const response = await promise;
    expect(response.status).toBe(status);
    if (path === "/redirect") expect(response.headers["location"]).toBe(f.origin + "/finished");
  }
});
it("requires owner/workspace access, explicit enablement, new connector capability and fresh running observations", async () => {
  const f = await fixture(),
    input = { deviceId: f.alice.deviceId, serviceId: "web" };
  await expect(f.relay.open("usr_bob", "ws_server20", input, async () => {})).rejects.toThrow(
    "target-denied",
  );
  await expect(f.relay.open("usr_alice", "ws_elsewhere", input, async () => {})).rejects.toThrow(
    "workspace-denied",
  );
  for (const snapshot of [
    { ...f.snapshot, previewRelay: undefined },
    { ...f.snapshot, sourceReady: false },
    {
      ...f.snapshot,
      plan: { services: [{ id: "web", port: 55000, database: "none", script: "start" }] },
    },
    { ...f.snapshot, services: [{ id: "web", status: "stopped" }] },
  ]) {
    await f.local.observe(f.alice.credential, snapshot);
    await expect(f.open()).rejects.toThrow("target-unavailable");
  }
  await f.local.observe(f.alice.credential, f.snapshot);
  f.advance(21000);
  await expect(f.open()).rejects.toThrow("target-unavailable");
});
it("requires exact Host, original bootstrap Origin, a single-use ticket and the private preview cookie", async () => {
  const f = await fixture(),
    issued = await f.open();
  expect((await f.request("/.__devsetu/open?ticket=" + issued.ticket)).status).toBe(401);
  expect((await f.request("/", { headers: { host: "attacker.invalid" } })).status).toBe(403);
  expect(
    (
      await f.request("/.__devsetu/open", {
        method: "POST",
        headers: {
          origin: "http://attacker.invalid",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ ticket: issued.ticket }).toString(),
      })
    ).status,
  ).toBe(403);
  const { cookie, result } = await f.bootstrap(issued.ticket);
  expect(result.status).toBe(200);
  expect((await f.bootstrap(issued.ticket)).result.status).toBe(401);
  expect(
    (await f.request("/mutate", { method: "POST", headers: { cookie, origin: f.portal } })).status,
  ).toBe(403);
  expect(
    (await f.request("/", { headers: { cookie, "sec-fetch-site": "cross-site" } })).status,
  ).toBe(403);
  expect(
    (await f.request("/", { headers: { cookie: "devsetu-preview=" + "f".repeat(64) } })).status,
  ).toBe(401);
  expect(f.appRequests).toHaveLength(0);
});
it("rechecks the original login session, source revision and owner permissions before completing a claimed request", async () => {
  const f = await fixture(),
    { cookie } = await f.bootstrap();
  const response = f.request("/", { headers: { cookie } }),
    { jobs } = await f.relay.claim(f.alice.credential);
  await f.local.observe(f.alice.credential, { ...f.snapshot, revision: 2 });
  await expect(
    f.relay.complete(f.alice.credential, {
      id: jobs[0]!.id,
      ok: true,
      status: 200,
      headers: [],
      body: "",
    }),
  ).rejects.toThrow("configuration-changed");
  await f.relay.end("usr_alice", "ws_server20", { deviceId: f.alice.deviceId, serviceId: "web" });
  expect((await response).status).toBe(504);
  await f.local.observe(f.alice.credential, f.snapshot);
  const second = await f.bootstrap();
  f.revoke();
  expect((await f.request("/", { headers: { cookie: second.cookie } })).status).toBe(502);
  f.members.delete("usr_alice");
  await expect(f.relay.claim(f.alice.credential)).rejects.toThrow();
});
it("expires access, closes pending requests and retains no transport data across a restart", async () => {
  const f = await fixture(),
    { cookie } = await f.bootstrap();
  await expect(f.open()).rejects.toThrow("already-open");
  f.advance(901000);
  expect((await f.request("/", { headers: { cookie } })).status).toBe(401);
  await f.connectors.heartbeat(f.alice.credential);
  await f.local.observe(f.alice.credential, f.snapshot);
  const again = await f.bootstrap();
  const pending = f.request("/", { headers: { cookie: again.cookie } });
  await f.relay.claim(f.alice.credential);
  await f.relay.end("usr_alice", "ws_server20", { deviceId: f.alice.deviceId, serviceId: "web" });
  expect((await pending).status).toBe(504);
  expect((await f.request("/", { headers: { cookie: again.cookie } })).status).toBe(401);
});
it("bounds pending requests and body size and never retries a timed-out claimed POST", async () => {
  const f = await fixture({ timeoutMs: 1000, maxPending: 1, maxRequestBytes: 1024 }),
    { cookie } = await f.bootstrap();
  expect(
    (
      await f.request("/", {
        method: "POST",
        headers: { cookie, origin: f.origin },
        body: Buffer.alloc(1025),
      })
    ).status,
  ).toBe(413);
  const post = f.request("/save", {
    method: "POST",
    headers: { cookie, origin: f.origin },
    body: "mutation",
  });
  const { jobs } = await f.relay.claim(f.alice.credential);
  expect(jobs).toHaveLength(1);
  expect((await f.request("/other", { headers: { cookie } })).status).toBe(429);
  expect((await post).status).toBe(504);
  await expect(
    f.relay.complete(f.alice.credential, {
      id: jobs[0]!.id,
      ok: true,
      status: 200,
      headers: [],
      body: "",
    }),
  ).rejects.toThrow("request-not-found");
  expect((await f.relay.claim(f.alice.credential)).jobs).toEqual([]);
});
it("rejects oversized responses, malformed locations and upstream timeouts without throwing raw application output", async () => {
  const f = await fixture({ maxResponseBytes: 1024, timeoutMs: 1000 }),
    { cookie } = await f.bootstrap();
  for (const path of ["/large", "/bad-location", "/slow"]) {
    const response = f.request(path, { headers: { cookie } }),
      { jobs } = await f.relay.claim(f.alice.credential);
    const result = await forward({ ...jobs[0]!, timeoutMs: 100 }, f.runtime);
    expect(result.ok).toBe(false);
    await f.relay.complete(f.alice.credential, result);
    expect((await response).status).toBe(502);
  }
});
it("validates a private listener, DNS addresses and separate hostnames without changing the network", async () => {
  const f = await fixture();
  expect(await validatePreviewConfig(f.config, f.portal)).toEqual(f.config);
  for (const address of ["0.0.0.0", "8.8.8.8", "169.254.169.254", "192.0.2.1"])
    expect(privateAddress(address)).toBe(false);
  for (const address of ["::1", "::ffff:127.0.0.1", "172.18.0.2", "192.168.1.3"])
    expect(privateAddress(address)).toBe(true);
  await expect(
    validatePreviewConfig({ ...f.config, listen: { host: "0.0.0.0", port: 6000 } }, f.portal),
  ).rejects.toThrow("private-listener");
  for (const origin of [
    f.portal,
    "http://127.0.0.1:62000",
    f.origin + "/extra",
    "http://user:pass@localhost:6000",
  ])
    await expect(
      validatePreviewConfig(
        { ...f.config, targets: [{ ...f.config.targets[0]!, origin }] },
        f.portal,
      ),
    ).rejects.toThrow("isolated-origin");
  await expect(
    validatePreviewConfig(
      { ...f.config, targets: [...f.config.targets, ...f.config.targets] },
      f.portal,
    ),
  ).rejects.toThrow("isolated-origin");
  await expect(
    validatePreviewConfig(
      f.config,
      f.portal,
      async () => [{ address: "8.8.8.8", family: 4 }] as never,
    ),
  ).rejects.toThrow("private-origin");
  expect(await loadPreviewConfig(join(f.root, "absent.json"), f.portal)).toBeUndefined();
  await writeFile(join(f.root, "config.json"), JSON.stringify(f.config));
  expect(await loadPreviewConfig(join(f.root, "config.json"), f.portal)).toEqual(f.config);
});
it("pins each hostname to one target across restarts, and cannot issue access when audit persistence fails", async () => {
  const f = await fixture();
  await f.relay.close();
  const changed = new PreviewRelay(
    { ...f.config, targets: [{ ...f.config.targets[0]!, serviceId: "different" }] },
    f.portal,
    f.audit,
    f.local,
    f.connectors,
  );
  await expect(changed.listen()).rejects.toThrow("origin-target-changed");
  const file = join(f.root, "not-a-directory");
  await writeFile(file, "retained");
  const bad = new PreviewRelay(f.config, f.portal, file, f.local, f.connectors);
  await expect(
    bad.open(
      "usr_alice",
      "ws_server20",
      { deviceId: f.alice.deviceId, serviceId: "web" },
      async () => {},
    ),
  ).rejects.toThrow();
  expect(await readFile(file, "utf8")).toBe("retained");
});
it("the actual runtime selector only forwards to an opted-in, owned running service and its configured API", async () => {
  const f = await fixture(),
    snapshot = {
      ...f.snapshot,
      plan: {
        services: [
          { ...f.snapshot.plan!.services[0]!, apiServiceId: "api" },
          { id: "api", port: 51001, database: "mysql" as const },
        ],
      },
      services: [
        { id: "web", status: "running" },
        { id: "api", status: "running" },
      ],
    };
  const runtime = Object.assign(Object.create(LocalDevelopmentRuntime.prototype), {
    config: { deviceId: f.alice.deviceId },
    snapshot: async () => snapshot,
    controllers: new Map([
      ["web", {}],
      ["api", {}],
    ]),
  });
  const job = {
    deviceId: f.alice.deviceId,
    profileId: snapshot.profileId,
    revision: 1,
    fingerprint: snapshot.fingerprint,
    serviceId: "web",
    path: "/api/data",
  };
  expect(await runtime.previewTarget(job)).toEqual({ port: 51001 });
  expect(await runtime.previewTarget({ ...job, path: "/asset.js" })).toEqual({
    port: f.snapshot.plan!.services[0]!.port,
  });
  for (const patch of [
    { deviceId: f.bob.deviceId },
    { profileId: "other" },
    { revision: 2 },
    { fingerprint: "f".repeat(64) },
    { serviceId: "api" },
  ])
    await expect(runtime.previewTarget({ ...job, ...patch })).rejects.toThrow("preview");
  runtime.controllers.delete("api");
  await expect(runtime.previewTarget(job)).rejects.toThrow("preview-unavailable");
  const candidate = { id: "web", recipe: "npm-script", scripts: ["start"], environments: [] };
  expect(() =>
    validatePlan({ services: [f.snapshot.plan!.services[0]] }, [candidate]),
  ).not.toThrow();
  expect(() =>
    validatePlan(
      { services: [{ ...f.snapshot.plan!.services[0], preview: { apiPath: "//external" } }] },
      [candidate],
    ),
  ).toThrow("invalid-preview");
});
it("enforces browser session, CSRF and workspace authority at the actual API routes and reauthorizes each preview request", async () => {
  const f = await fixture();
  const context = SessionContextSchema.parse({
    sessionId: "ses_fixture",
    userId: "usr_alice",
    identityId: "idn_fixture",
    status: "active",
    authenticatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 600000).toISOString(),
  });
  const workspace = WorkspaceSchema.parse({
    workspaceId: "ws_server20",
    displayName: "Private fixture",
    status: "active",
    createdAt: context.authenticatedAt,
  });
  let membership = WorkspaceMembershipSchema.parse({
      membershipId: "wsm_fixture",
      workspaceId: workspace.workspaceId,
      userId: context.userId,
      status: "active",
      grantedScopes: ["project:read", "project:write"],
      createdAt: context.authenticatedAt,
    }),
    signedIn = true;
  const sessions = {
    authenticate: async (token: string) =>
      signedIn && token === "synthetic-session"
        ? { context, csrfHash: sha256("synthetic-csrf") }
        : null,
  } as unknown as IdentitySessionRepository;
  const workspaces = {
    getEvidence: async (id: string) =>
      id === workspace.workspaceId ? { workspace, membership } : null,
  } as unknown as WorkspaceRepository;
  const server = await buildServer({
    authMode: "local",
    publicOrigin: f.portal,
    identitySessions: sessions,
    workspaces,
    previewRelay: f.relay,
    localDevelopment: f.local,
  });
  cleanups.push(() => server.close());
  const policy = authCookiePolicy("http:"),
    headers = {
      origin: f.portal,
      cookie: `${policy.session}=synthetic-session; ${policy.csrf}=synthetic-csrf`,
      "x-csrf-token": "synthetic-csrf",
    },
    payload = { deviceId: f.alice.deviceId, serviceId: "web" },
    url = "/v1/workspaces/ws_server20/local-development/preview/open";
  expect((await server.inject({ method: "POST", url, payload })).statusCode).toBe(401);
  expect(
    (
      await server.inject({
        method: "POST",
        url,
        payload,
        headers: { ...headers, "x-csrf-token": "wrong" },
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await server.inject({
        method: "POST",
        url,
        payload,
        headers: { ...headers, origin: "http://elsewhere.invalid" },
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await server.inject({
        method: "POST",
        url: url.replace("ws_server20", "ws_other"),
        payload,
        headers,
      })
    ).statusCode,
  ).toBe(404);
  membership = WorkspaceMembershipSchema.parse({ ...membership, grantedScopes: ["project:read"] });
  expect((await server.inject({ method: "POST", url, payload, headers })).statusCode).toBe(403);
  membership = WorkspaceMembershipSchema.parse({
    ...membership,
    grantedScopes: ["project:read", "project:write"],
  });
  const issued = await server.inject({ method: "POST", url, payload, headers });
  expect(issued.statusCode).toBe(200);
  expect(
    (
      await server.inject({
        method: "POST",
        url: "/v1/connector/preview/identity",
        payload: {},
        headers: { authorization: "Bearer " + f.alice.credential },
      })
    ).json(),
  ).toEqual({
    workspaceId: "ws_server20",
    deviceId: f.alice.deviceId,
    profileId: f.snapshot.profileId,
  });
  const { cookie } = await f.bootstrap(issued.json().ticket);
  signedIn = false;
  expect((await f.request("/", { headers: { cookie } })).status).toBe(401);
  signedIn = true;
  membership = { ...membership, status: "revoked" };
  expect((await f.request("/", { headers: { cookie } })).status).toBe(403);
  membership = { ...membership, status: "active" };
  expect(
    (
      await server.inject({
        method: "POST",
        url: "/v1/connector/preview/claim",
        payload: {},
        headers: { authorization: "Bearer invalid" },
      })
    ).statusCode,
  ).toBe(401);
  const pending = f.request("/", { headers: { cookie } }),
    claimed = await server.inject({
      method: "POST",
      url: "/v1/connector/preview/claim",
      payload: {},
      headers: { authorization: "Bearer " + f.alice.credential },
    });
  const job = claimed.json().jobs[0];
  expect(job.deviceId).toBe(f.alice.deviceId);
  const result = await forward(job, f.runtime);
  expect(
    (
      await server.inject({
        method: "POST",
        url: "/v1/connector/preview/complete",
        payload: result,
        headers: { authorization: "Bearer " + f.alice.credential },
      })
    ).statusCode,
  ).toBe(200);
  expect((await pending).status).toBe(201);
  expect(
    (await server.inject({ method: "POST", url: url.replace("/open", "/close"), payload, headers }))
      .statusCode,
  ).toBe(200);
  const disabled = await buildServer({
    authMode: "local",
    publicOrigin: f.portal,
    identitySessions: sessions,
    workspaces,
  });
  cleanups.push(() => disabled.close());
  expect((await disabled.inject({ method: "POST", url, payload, headers })).statusCode).toBe(503);
  for (const suffix of ["claim", "complete", "identity"])
    expect(
      (
        await disabled.inject({
          method: "POST",
          url: "/v1/connector/preview/" + suffix,
          payload: {},
        })
      ).statusCode,
    ).toBe(503);
});
it("rejects application WebSocket upgrades explicitly and closes pending HTTP work from the preview page", async () => {
  const f = await fixture(),
    { cookie } = await f.bootstrap();
  expect(
    (await f.request("/", { headers: { connection: "Upgrade", upgrade: "websocket" } })).status,
  ).toBe(426);
  expect((await f.request("/.__devsetu/not-an-app-route", { headers: { cookie } })).status).toBe(
    404,
  );
  const pending = f.request("/", { headers: { cookie } });
  await f.relay.claim(f.alice.credential);
  expect(
    (
      await f.request("/.__devsetu/close", {
        method: "POST",
        headers: { cookie, origin: f.origin },
      })
    ).status,
  ).toBe(200);
  expect((await pending).status).toBe(504);
  expect((await f.request("/", { headers: { cookie } })).status).toBe(401);
  await expect(
    f.relay.end("usr_alice", "ws_other", { deviceId: f.alice.deviceId, serviceId: "web" }),
  ).rejects.toThrow("workspace-denied");
  expect(
    await f.relay.end("usr_alice", "ws_server20", { deviceId: f.alice.deviceId, serviceId: "web" }),
  ).toEqual({ closed: true });
});
it("cancels a browser-disconnected request and never accepts its later completion", async () => {
  const f = await fixture(),
    { cookie } = await f.bootstrap();
  const req = httpRequest({
    host: "127.0.0.1",
    port: f.config.listen.port,
    path: "/cancelled",
    headers: { host: new URL(f.origin).host, cookie },
    agent: false,
  });
  const disconnected = new Promise((resolve) => req.once("error", resolve));
  req.end();
  const { jobs } = await f.relay.claim(f.alice.credential);
  req.destroy();
  await disconnected;
  await new Promise((resolve) => setTimeout(resolve, 30));
  await expect(
    f.relay.complete(f.alice.credential, {
      id: jobs[0]!.id,
      ok: true,
      status: 200,
      headers: [],
      body: "",
    }),
  ).rejects.toThrow("request-not-found");
});
it("bounds connector polling, denies monitoring-only credentials, and drains work on shutdown", async () => {
  const f = await fixture();
  const system = await f.connectors.pair("usr_alice", {
    version: 1,
    name: "Monitoring",
    mode: "system",
  });
  await expect(f.relay.claim(system.credential)).rejects.toThrow("connector-denied");
  await expect(f.local.connectorIdentity(system.credential)).rejects.toThrow(
    "source-identity-unavailable",
  );
  const other = new PreviewRelay(
    PreviewConfigSchema.parse({ ...f.config, workspaceId: "ws_other" }),
    f.portal,
    f.audit,
    f.local,
    f.connectors,
  );
  await expect(other.claim(f.alice.credential)).rejects.toThrow("connector-denied");
  const polling = f.relay.claim(f.alice.credential);
  await new Promise((resolve) => setTimeout(resolve, 30));
  await expect(f.relay.claim(f.alice.credential)).rejects.toThrow("poll-in-progress");
  await f.relay.close();
  expect((await polling).jobs).toEqual([]);
  const g = await fixture(),
    { cookie } = await g.bootstrap();
  const request = g.request("/", { headers: { cookie } });
  await g.relay.claim(g.alice.credential);
  await g.relay.close();
  expect((await request).status).toBe(504);
});
it("keeps service-origin assignment explicit, rejects oversized completions and defends against streaming and CSP override at both boundaries", async () => {
  const f = await fixture({ maxResponseBytes: 1024 });
  const unconfigured = new PreviewRelay(
    { ...f.config, targets: [{ ...f.config.targets[0]!, serviceId: "different" }] },
    f.portal,
    f.audit,
    f.local,
    f.connectors,
  );
  await expect(
    unconfigured.open(
      "usr_alice",
      "ws_server20",
      { deviceId: f.alice.deviceId, serviceId: "web" },
      async () => {},
    ),
  ).rejects.toThrow("origin-not-configured");
  const { cookie } = await f.bootstrap();
  const response = f.request("/", { headers: { cookie } }),
    { jobs } = await f.relay.claim(f.alice.credential),
    job = jobs[0]!;
  await expect(
    f.relay.complete(f.alice.credential, {
      id: job.id,
      ok: true,
      status: 200,
      headers: [],
      body: Buffer.alloc(1025).toString("base64"),
    }),
  ).rejects.toThrow("response-too-large");
  await f.relay.complete(f.alice.credential, {
    id: job.id,
    ok: true,
    status: 200,
    headers: [["content-type", "text/event-stream"]],
    body: "",
  });
  expect((await response).status).toBe(502);
  const second = f.request("/", { method: "HEAD", headers: { cookie } }),
    batch = await f.relay.claim(f.alice.credential);
  await f.relay.complete(f.alice.credential, {
    id: batch.jobs[0]!.id,
    ok: true,
    status: 204,
    headers: [
      ["content-security-policy", "default-src 'self'"],
      ["access-control-allow-origin", "*"],
      ["clear-site-data", "*"],
    ],
    body: Buffer.from("not returned on HEAD").toString("base64"),
  });
  const head = await second;
  expect(head.body.length).toBe(0);
  expect(String(head.headers["content-security-policy"])).toContain("worker-src 'none'");
  expect(String(head.headers["content-security-policy"])).toContain("default-src 'self'");
  expect(head.headers["access-control-allow-origin"]).toBeUndefined();
  expect(head.headers["clear-site-data"]).toBeUndefined();
});
it("rejects non-files, oversized configuration and linked audit locations before granting a session", async () => {
  const f = await fixture();
  await expect(loadPreviewConfig(f.root, f.portal)).rejects.toThrow("configuration-unavailable");
  const huge = join(f.root, "huge.json");
  await writeFile(huge, Buffer.alloc(32769));
  await expect(loadPreviewConfig(huge, f.portal)).rejects.toThrow("configuration-unavailable");
  const file = join(f.root, "file");
  await writeFile(file, "retained");
  await expect(loadPreviewConfig(join(file, "child"), f.portal)).rejects.toThrow();
  const actual = join(f.root, "audit-target"),
    link = join(f.root, "audit-link");
  await mkdir(actual);
  await symlink(actual, link, process.platform === "win32" ? "junction" : "dir");
  const relay = new PreviewRelay(f.config, f.portal, link, f.local, f.connectors);
  await expect(
    relay.open(
      "usr_alice",
      "ws_server20",
      { deviceId: f.alice.deviceId, serviceId: "web" },
      async () => {},
    ),
  ).rejects.toThrow("audit-unavailable");
  await expect(relay.listen()).rejects.toThrow("audit-unavailable");
  expect(await readdir(actual)).toEqual([]);
});
