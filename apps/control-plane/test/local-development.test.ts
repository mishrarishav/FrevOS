import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LocalDevAction, LocalDevSnapshot } from "@frevos/contracts";
import { afterEach, expect, it } from "vitest";
import { DeveloperConnectorStore } from "../src/developer-connectors.js";
import { LocalDevelopment } from "../src/local-development.js";

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const fn of cleanups.splice(0).reverse()) await fn();
});
const id = (n: number) => "ld_" + String(n).padStart(32, "0");
it("requires an updated connector before accepting an opted-in preview service plan", async () => {
  const f = await fixture();
  const request = {
    ...f.request,
    operation: "configure" as const,
    plan: {
      services: [
        {
          id: "backend",
          port: 5000,
          database: "mysql" as const,
          script: "dev" as const,
          preview: { apiPath: "/api" },
        },
      ],
    },
  };
  await expect(f.store.request("usr_alice", request)).rejects.toThrow(
    "preview-connector-update-required",
  );
  await f.store.observe(f.alice.credential, { ...f.snapshot, previewRelay: 1 });
  expect((await f.store.request("usr_alice", request)).status).toBe("queued");
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "devsetu-local-state-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  let now = Date.now();
  const clock = () => new Date(now);
  const connectors = new DeveloperConnectorStore(
    join(root, "connectors"),
    async (actor) => actor === "usr_alice" || actor === "usr_bob",
    { head: async () => "a".repeat(40), importBundle: async () => {} },
    async () => {},
    clock,
  );
  cleanups.push(async () => connectors.close());
  const alice = await connectors.pair("usr_alice", { version: 1, name: "Laptop" });
  const bob = await connectors.pair("usr_bob", { version: 1, name: "Other laptop" });
  await connectors.heartbeat(alice.credential);
  await connectors.heartbeat(bob.credential);
  const snapshot: LocalDevSnapshot = {
    version: 1,
    deviceId: alice.deviceId,
    profileId: "servix-development",
    fingerprint: "b".repeat(64),
    revision: 0,
    sourceReady: true,
    candidates: [
      {
        id: "backend",
        name: "Backend",
        context: "backend",
        recipe: "npm-script",
        framework: "node",
        scripts: ["start", "dev"],
        manifestDigest: "c".repeat(64),
        environments: [{ reference: ".env.dev", production: false }],
      },
    ],
    plan: null,
    services: [],
  };
  const store = new LocalDevelopment(join(root, "jobs"), connectors, clock);
  await store.observe(alice.credential, snapshot);
  const request: LocalDevAction = {
    version: 1,
    requestId: id(1),
    deviceId: alice.deviceId,
    profileId: snapshot.profileId,
    expectedRevision: 0,
    fingerprint: snapshot.fingerprint,
    operation: "configure",
    plan: {
      services: [
        {
          id: "backend",
          port: 5000,
          database: "mysql",
          script: "dev",
          developmentEnvironment: ".env.dev",
        },
      ],
    },
  };
  return {
    root,
    store,
    connectors,
    alice,
    bob,
    snapshot,
    request,
    clock,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
it("persists attributable intent before claims, serializes actions, reconciles retries and never shares another actor's records", async () => {
  const f = await fixture();
  const job = await f.store.request("usr_alice", f.request);
  expect(job).toMatchObject({ actor: "usr_alice", workspaceId: "ws_server20", status: "queued" });
  expect(await readFile(join(f.root, "jobs", id(1) + ".json"), "utf8")).not.toContain(
    f.alice.credential,
  );
  expect(await f.store.request("usr_alice", f.request)).toEqual(job);
  await expect(f.store.request("usr_alice", { ...f.request, expectedRevision: 2 })).rejects.toThrow(
    "idempotency-conflict",
  );
  await expect(f.store.request("usr_bob", f.request)).rejects.toThrow("idempotency-conflict");
  await expect(f.store.request("usr_alice", { ...f.request, requestId: id(2) })).rejects.toThrow(
    "action-in-progress",
  );
  expect((await f.store.state("usr_bob")).jobs).toEqual([]);
  expect((await f.store.state("usr_bob")).connections).toEqual([]);
  expect(await f.store.claim(f.bob.credential)).toBeNull();
  const claimed = await f.store.claim(f.alice.credential);
  expect(claimed?.status).toBe("working");
  expect(await f.store.claim(f.alice.credential)).toEqual(claimed);
  const restarted = new LocalDevelopment(join(f.root, "jobs"), f.connectors, f.clock);
  expect((await restarted.state("usr_alice")).connections).toEqual([]);
  expect(await restarted.claim(f.alice.credential)).toEqual(claimed);
  await expect(
    restarted.complete(f.bob.credential, { requestId: id(1), status: "succeeded" }),
  ).rejects.toThrow("job-not-found");
  const result = await restarted.complete(f.alice.credential, {
    requestId: id(1),
    status: "recovery-required",
    errorCode: "local-development-interrupted-action",
  });
  expect(
    await restarted.complete(f.alice.credential, {
      requestId: id(1),
      status: "recovery-required",
      errorCode: "local-development-interrupted-action",
    }),
  ).toEqual(result);
  await expect(
    restarted.complete(f.alice.credential, { requestId: id(1), status: "succeeded" }),
  ).rejects.toThrow("not-working");
  expect(await restarted.claim(f.alice.credential)).toBeNull();
  expect(JSON.stringify(await restarted.state("usr_alice"))).not.toContain(f.alice.credential);
});
it("requires fresh ownership, exact revision/source observations and valid discovered configuration", async () => {
  const f = await fixture();
  await expect(
    f.store.observe(f.alice.credential, { ...f.snapshot, deviceId: f.bob.deviceId }),
  ).rejects.toThrow("scope-mismatch");
  await expect(
    f.store.observe(f.alice.credential, { ...f.snapshot, profileId: "other-project" }),
  ).rejects.toThrow("scope-mismatch");
  await expect(f.store.observe("not-a-credential", f.snapshot)).rejects.toThrow(
    "authentication-required",
  );
  await expect(f.store.state("usr_denied")).rejects.toThrow("access-denied");
  await expect(f.store.request("usr_bob", { ...f.request, requestId: id(10) })).rejects.toThrow(
    "offline",
  );
  for (const change of [
    { expectedRevision: 3 },
    { fingerprint: "d".repeat(64) },
    { profileId: "other-project" },
  ])
    await expect(f.store.request("usr_alice", { ...f.request, ...change })).rejects.toThrow(
      "observation-changed",
    );
  for (const service of [
    { id: "unknown", port: 5000, database: "none", script: "start" },
    { id: "backend", port: 5000, database: "none", script: "start:cra" },
    {
      id: "backend",
      port: 5000,
      database: "mysql",
      script: "start",
      developmentEnvironment: ".env.missing",
    },
  ])
    await expect(
      f.store.request("usr_alice", { ...f.request, plan: { services: [service] } }),
    ).rejects.toThrow(/service-unavailable|environment-unavailable/);
  await expect(
    f.store.request("usr_alice", { ...f.request, password: "synthetic" }),
  ).rejects.toThrow();
  f.advance(21000);
  expect((await f.store.state("usr_alice")).connections[0]?.online).toBe(false);
  await expect(f.store.request("usr_alice", f.request)).rejects.toThrow("offline");
  await f.connectors.heartbeat(f.alice.credential);
  await f.store.observe(f.alice.credential, { ...f.snapshot, sourceReady: false });
  await expect(f.store.request("usr_alice", f.request)).rejects.toThrow("source-unavailable");
  await expect(
    f.store.request("usr_alice", {
      ...Object.fromEntries(Object.entries(f.request).filter(([key]) => key !== "plan")),
      operation: "start",
      mode: "development",
    }),
  ).rejects.toThrow("source-unavailable");
  const stop = { ...f.request, operation: "stop" };
  delete (stop as { plan?: unknown }).plan;
  expect((await f.store.request("usr_alice", stop)).status).toBe("queued");
  await f.connectors.revoke("usr_alice", f.alice.deviceId);
  await expect(f.store.claim(f.alice.credential)).rejects.toThrow("authentication-required");
  await expect(f.store.observe(f.alice.credential, f.snapshot)).rejects.toThrow(
    "authentication-required",
  );
});
it("checks configured service/process identity, preserves honest terminal failures and expires undelivered actions", async () => {
  const f = await fixture();
  const { plan: _, ...base } = f.request as Extract<LocalDevAction, { operation: "configure" }>;
  const request = { ...base, operation: "start", mode: "development" };
  await expect(f.store.request("usr_alice", request)).rejects.toThrow("configuration-required");
  const plan = {
    services: [{ id: "backend", port: 5000, database: "mysql" as const, script: "start" as const }],
  };
  const running: LocalDevSnapshot = {
    ...f.snapshot,
    revision: 1,
    plan,
    services: [{ id: "backend", status: "running" }],
  };
  await f.store.observe(f.alice.credential, running);
  await expect(f.store.request("usr_alice", { ...f.request, expectedRevision: 1 })).rejects.toThrow(
    "stop-before-configuration",
  );
  await expect(
    f.store.request("usr_alice", { ...request, expectedRevision: 1, serviceId: "unknown" }),
  ).rejects.toThrow("configuration-required");
  const existing = {
    pid: 1234,
    name: "node.exe",
    createdAt: f.clock().toISOString(),
    identity: "e".repeat(64),
    projectOwned: false,
  };
  await f.store.observe(f.alice.credential, {
    ...running,
    services: [{ id: "backend", status: "port-conflict", existing }],
  });
  const kill = {
    ...base,
    expectedRevision: 1,
    operation: "kill-existing",
    serviceId: "backend",
    identity: existing.identity,
  };
  await expect(f.store.request("usr_alice", kill)).rejects.toThrow("process-changed");
  await f.store.observe(f.alice.credential, {
    ...running,
    services: [
      { id: "backend", status: "port-conflict", existing: { ...existing, projectOwned: true } },
    ],
  });
  await expect(f.store.request("usr_alice", { ...kill, identity: "f".repeat(64) })).rejects.toThrow(
    "process-changed",
  );
  const queued = await f.store.request("usr_alice", kill);
  await expect(
    f.store.complete(f.alice.credential, {
      requestId: queued.request.requestId,
      status: "succeeded",
    }),
  ).rejects.toThrow("not-working");
  await expect(
    f.store.complete(f.alice.credential, { requestId: id(99), status: "failed" }),
  ).rejects.toThrow("not-found");
  await f.store.claim(f.alice.credential);
  expect(
    (
      await f.store.complete(f.alice.credential, {
        requestId: queued.request.requestId,
        status: "failed",
        errorCode: "local-development-process-changed",
      })
    ).errorCode,
  ).toBe("local-development-process-changed");
  await f.store.request("usr_alice", {
    ...base,
    requestId: id(3),
    expectedRevision: 1,
    operation: "stop",
  });
  f.advance(121000);
  expect(await f.store.claim(f.alice.credential)).toBeNull();
  expect(
    (await f.store.state("usr_alice")).jobs.find((j) => j.request.requestId === id(3)),
  ).toMatchObject({ status: "failed", errorCode: "local-development-request-expired" });
});
it("fails closed on corrupted durable records instead of issuing a process command", async () => {
  const f = await fixture();
  await f.store.request("usr_alice", f.request);
  await writeFile(join(f.root, "jobs", id(1) + ".json"), "corrupted");
  await expect(f.store.state("usr_alice")).rejects.toThrow("storage-unavailable");
  await expect(f.store.claim(f.alice.credential)).rejects.toThrow("storage-unavailable");
});
it("authorizes generic environment CRUD independently of service configuration and persists only sealed replacements", async () => {
  const f = await fixture();
  const { plan: _, ...base } = f.request as Extract<LocalDevAction, { operation: "configure" }>;
  const read = {
    ...base,
    operation: "environment-read",
    serviceId: "backend",
    reference: ".env.dev",
  };
  await expect(f.store.request("usr_alice", read)).rejects.toThrow("editor-unavailable");
  const observed = {
    ...f.snapshot,
    environmentEditor: { keyId: "d".repeat(64), publicKey: "e".repeat(64) },
  };
  await f.store.observe(f.alice.credential, observed);
  await expect(
    f.store.request("usr_alice", { ...read, reference: ".env.outside" }),
  ).rejects.toThrow("environment-unavailable");
  await expect(f.store.request("usr_alice", { ...read, serviceId: "foreign" })).rejects.toThrow(
    "environment-unavailable",
  );
  await f.store.request("usr_alice", read);
  await f.store.claim(f.alice.credential);
  await expect(
    f.store.complete(f.alice.credential, { requestId: read.requestId, status: "succeeded" }),
  ).rejects.toThrow("result-mismatch");
  const document = {
    serviceId: "backend",
    reference: ".env.dev",
    revision: "f".repeat(64),
    rows: [
      { key: "DB_PASSWORD", masked: true },
      { key: "DB_NAME", masked: false, value: "development" },
    ],
  };
  await expect(
    f.store.complete(f.alice.credential, {
      requestId: read.requestId,
      status: "succeeded",
      environment: { ...document, serviceId: "foreign" },
    }),
  ).rejects.toThrow("result-mismatch");
  await expect(
    f.store.complete(f.alice.credential, {
      requestId: read.requestId,
      status: "succeeded",
      environment: { ...document, reference: ".env.other" },
    }),
  ).rejects.toThrow("result-mismatch");
  await expect(
    f.store.complete(f.alice.credential, {
      requestId: read.requestId,
      status: "succeeded",
      environment: {
        ...document,
        rows: [{ key: "DB_PASSWORD", masked: false, value: "synthetic-never-persist" }],
      },
    }),
  ).rejects.toThrow();
  const completion = { requestId: read.requestId, status: "succeeded", environment: document };
  const done = await f.store.complete(f.alice.credential, completion);
  expect(await f.store.complete(f.alice.credential, completion)).toEqual(done);
  await expect(
    f.store.complete(f.alice.credential, { ...completion, environment: { ...document, rows: [] } }),
  ).rejects.toThrow("not-working");
  const save = {
    ...base,
    requestId: id(2),
    operation: "environment-save",
    approved: true,
    serviceId: "backend",
    reference: ".env.dev",
    documentRevision: document.revision,
    sealed: {
      keyId: observed.environmentEditor.keyId,
      publicKey: "e".repeat(64),
      iv: "a".repeat(24),
      ciphertext: "ab".repeat(32),
    },
  };
  await expect(
    f.store.request("usr_alice", { ...save, sealed: { ...save.sealed, keyId: "f".repeat(64) } }),
  ).rejects.toThrow("key-changed");
  for (const status of ["running", "starting", "port-conflict"] as const) {
    await f.store.observe(f.alice.credential, {
      ...observed,
      services: [{ id: "backend", status }],
    });
    await expect(f.store.request("usr_alice", save)).rejects.toThrow(
      "stop-before-environment-save",
    );
  }
  await f.store.observe(f.alice.credential, observed);
  const queued = await f.store.request("usr_alice", save);
  expect(queued.request).toEqual(save);
  await f.store.claim(f.alice.credential);
  await expect(
    f.store.complete(f.alice.credential, {
      requestId: save.requestId,
      status: "succeeded",
      environment: document,
    }),
  ).rejects.toThrow("result-mismatch");
  await f.store.complete(f.alice.credential, { requestId: save.requestId, status: "succeeded" });
  expect(JSON.stringify(await f.store.state("usr_bob"))).not.toContain(save.requestId);
  expect(await readFile(join(f.root, "jobs", save.requestId + ".json"), "utf8")).not.toContain(
    "synthetic-never-persist",
  );
  await f.store.observe(f.alice.credential, { ...observed, sourceReady: false });
  await expect(f.store.request("usr_alice", { ...read, requestId: id(3) })).rejects.toThrow(
    "editor-unavailable",
  );
});
