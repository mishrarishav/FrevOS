import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ClientSchema,
  type DeliveryPlanInput,
  type DiscoveryObservation,
  defaultDiscoveryPolicy,
  defaultActivitySettings,
  ProjectSchema,
} from "@frevos/contracts";
import { afterEach, expect, it } from "vitest";
import { DeveloperConnectorStore } from "../src/developer-connectors.js";
import { SystemDiscovery } from "../src/system-discovery.js";

const cleanups: (() => Promise<unknown>)[] = [];
it("reports server heartbeat presence for legacy and stale connectors without inventing a last-online time", async () => {
  const f = await fixture();
  const neverSeen = await f.connectors.pair("usr_alice", { version: 1, name: "Never connected" });
  let state = await f.store.state("usr_alice");
  const legacy = state.systems.find((system) => system.deviceId === f.alice.deviceId)!;
  expect(legacy.observedAt).toBeNull();
  expect(legacy.lastSeenAt).toBe(f.clock().toISOString());
  expect(
    state.systems.find((system) => system.deviceId === neverSeen.deviceId)?.lastSeenAt,
  ).toBeNull();
  await f.store.observe(f.alice.credential, f.observation);
  const receivedAt = f.clock().toISOString();
  f.advance(60000);
  await f.connectors.heartbeat(f.alice.credential);
  const heartbeatAt = f.clock().toISOString();
  f.advance(31000);
  const restarted = new SystemDiscovery(f.store.root, f.connectors, f.catalog, f.clock);
  state = await restarted.state("usr_alice");
  const stale = state.systems.find((system) => system.deviceId === f.alice.deviceId)!;
  expect(stale.online).toBe(false);
  expect(stale.observedAt).toBe(receivedAt);
  expect(stale.lastSeenAt).toBe(heartbeatAt);
  expect(
    (await restarted.state("usr_bob")).systems.some(
      (system) => system.deviceId === f.alice.deviceId,
    ),
  ).toBe(false);
});
it("keeps deduplicated bounded real health samples and scopes requested project folder searches", async () => {
  const f = await fixture();
  await f.store.configure("usr_alice", f.policy);
  const observation = {
    ...f.observation,
    policyRevision: 1,
    coverage: { ...f.observation.coverage, status: "collecting" as const, roots: ["C:\\fixture"] },
  };
  for (let i = 0; i < 185; i++) {
    f.advance(5000);
    await f.store.observe(f.alice.credential, {
      ...observation,
      at: f.clock().toISOString(),
      system: { ...observation.system, cpuPercent: i % 100 },
    });
  }
  await f.connectors.heartbeat(f.alice.credential, {
    probe: {
      version: 1,
      profileId: "servix-development",
      repository: "C:\\fixture",
      origin: "//10.9.69.20/e$/FrevOS/git/servix.git",
      head: "a".repeat(40),
      branch: "feature/fixture",
      checkedAt: f.clock().toISOString(),
    },
  });
  await f.store.observe(f.alice.credential, { ...observation, at: f.clock().toISOString() });
  const state = await f.store.state("usr_alice", f.alice.deviceId);
  expect(state.systems[0]!.healthHistory).toHaveLength(180);
  expect((await f.store.state("usr_alice")).systems[0]!.healthHistory).toHaveLength(12);
  const body = { version: 1, projectId: "prj_fixture", deviceId: f.alice.deviceId };
  await expect(f.store.requestProjectFolders("usr_bob", body)).rejects.toThrow();
  await expect(
    f.store.requestProjectFolders("usr_alice", { ...body, projectId: "prj_outside" }),
  ).rejects.toThrow();
  const j = await f.store.requestProjectFolders("usr_alice", body),
    job = (await f.store.claimProjectFolders(f.alice.credential))!;
  expect(job.query).toBe("Fixture project");
  await f.store.finishProjectFolders(f.alice.credential, {
    ...job,
    status: "succeeded",
    result: { matches: [], scannedDirectories: 1000, partial: true, gaps: ["search-limit"] },
  });
  expect((await f.store.projectFolders("usr_alice", j.id)).result!.partial).toBe(true);
  f.advance(901000);
  expect((await f.store.state("usr_alice", f.alice.deviceId)).systems[0]!.healthHistory).toEqual(
    [],
  );
});
it("applies revisioned noise settings to legacy events, reserves Work and enforces owner/expiry/one-time file previews", async () => {
  const f = await fixture();
  const input = {
    version: 1,
    deviceId: f.alice.deviceId,
    expectedRevision: 0,
    settings: defaultActivitySettings,
  };
  await expect(f.store.configureActivity("usr_bob", input)).rejects.toThrow(
    "discovery-device-access-denied",
  );
  await f.store.configureActivity("usr_alice", input);
  await expect(f.store.configureActivity("usr_alice", input)).rejects.toThrow(
    "discovery-revision-changed",
  );
  await f.store.configure("usr_alice", f.policy);
  const observation = {
    ...f.observation,
    policyRevision: 1,
    collector: {
      version: 1 as const,
      rss: 10000000,
      heapUsed: 1000000,
      pendingJobs: 0,
      maxPendingJobs: 1257 as const,
    },
  };
  for (let batch = 0; batch < 10; batch++)
    await f.store.observe(f.alice.credential, {
      ...observation,
      events: Array.from({ length: 20 }, (_, i) => ({
        sequence: batch * 20 + i + 1,
        at: f.clock().toISOString(),
        root: "C:\\fixture",
        path: batch < 4 ? "src/work.ts" : "Temp/cache.tmp",
        kind: "modified",
        source: "filesystem-notification",
        attribution: "unavailable",
      })),
    });
  const state = (await f.store.state("usr_alice", f.alice.deviceId)).systems[0]!;
  expect(state.activity).toMatchObject({ workCount: 80, noiseCount: 20 });
  expect(state.activity!.rows).toHaveLength(2);
  expect(state.collector).toMatchObject({ rss: 10000000 });
  const raw = JSON.parse(
    await readFile(join(f.root, "discovery", f.alice.deviceId + ".observation.json"), "utf8"),
  );
  expect(raw.observation.collector).toBeUndefined();
  const request = {
    version: 1,
    deviceId: f.alice.deviceId,
    root: "C:\\fixture",
    path: "src/work.ts",
  };
  await expect(f.store.requestContent("usr_bob", request)).rejects.toThrow();
  await expect(f.store.requestContent("usr_alice", { ...request, path: ".env" })).rejects.toThrow();
  await expect(f.store.requestContent("usr_alice", { ...request, root: "Z:\\" })).rejects.toThrow();
  const first = await f.store.requestContent("usr_alice", request);
  await expect(f.store.content("usr_bob", first.requestId)).rejects.toThrow();
  await expect(f.store.requestContent("usr_alice", request)).rejects.toThrow(
    "discovery-content-busy",
  );
  const working = (await f.store.claimContent(f.alice.credential))!;
  await expect(
    f.store.finishContent(f.bob.credential, { ...working, status: "declined" }),
  ).rejects.toThrow();
  const result = await f.store.finishContent(f.alice.credential, {
    ...working,
    status: "succeeded",
    result: {
      approvedAt: f.clock().toISOString(),
      observedAt: f.clock().toISOString(),
      after: 'const value = 1;\nconst password = "SYNTHETIC_PRIVATE";',
    },
  });
  expect(result.result!.after).not.toContain("SYNTHETIC_PRIVATE");
  expect(result.result!.before).toBeUndefined();
  await expect(f.store.finishContent(f.alice.credential, result)).rejects.toThrow();
  await f.store.requestContent("usr_alice", request);
  const second = (await f.store.claimContent(f.alice.credential))!;
  const compared = await f.store.finishContent(f.alice.credential, {
    ...second,
    status: "succeeded",
    result: {
      approvedAt: f.clock().toISOString(),
      observedAt: f.clock().toISOString(),
      after: "const value = 2;",
    },
  });
  expect(compared.result!.before).toContain("const value = 1;");
  expect(JSON.stringify(compared)).not.toContain("SYNTHETIC_PRIVATE");
  const expiring = await f.store.requestContent("usr_alice", request);
  f.advance(600001);
  expect((await f.store.content("usr_alice", expiring.requestId)).status).toBe("expired");
  f.allowed.delete("usr_alice");
  await expect(f.store.content("usr_alice", first.requestId)).rejects.toThrow();
});
it("denies unsupported collectors and redirected, unapproved or forged content results; expires retained requests", async () => {
  const f = await fixture(),
    request = { version: 1, deviceId: f.alice.deviceId, root: "C:\\fixture", path: "src/code.ts" };
  await f.store.observe(f.alice.credential, f.observation);
  await expect(f.store.requestContent("usr_alice", request)).rejects.toThrow(
    "discovery-content-update-required",
  );
  await expect(f.store.content("usr_alice", "bad")).rejects.toThrow();
  await expect(f.store.content("usr_alice", "cp_" + "f".repeat(32))).rejects.toThrow();
  await f.store.observe(f.alice.credential, {
    ...f.observation,
    collector: { version: 1, rss: 10, heapUsed: 5, pendingJobs: 0, maxPendingJobs: 1257 },
  });
  await f.store.requestContent("usr_alice", request);
  const job = (await f.store.claimContent(f.alice.credential))!;
  const result = {
    ...job,
    status: "succeeded",
    result: {
      approvedAt: f.clock().toISOString(),
      observedAt: f.clock().toISOString(),
      after: "current",
    },
  };
  await expect(
    f.store.finishContent(f.alice.credential, {
      ...result,
      request: { ...request, path: "other.ts" },
    }),
  ).rejects.toThrow();
  await expect(
    f.store.finishContent(f.alice.credential, { ...result, result: undefined }),
  ).rejects.toThrow();
  await expect(
    f.store.finishContent(f.alice.credential, {
      ...result,
      result: { ...result.result, before: "invented" },
    }),
  ).rejects.toThrow();
  await expect(
    f.store.finishContent(f.alice.credential, { ...result, status: "declined" }),
  ).rejects.toThrow();
  expect(
    (
      await f.store.finishContent(f.alice.credential, {
        ...job,
        status: "declined",
        errorCode: "content-approval-declined",
      })
    ).result,
  ).toBeUndefined();
  f.advance(8 * 86400000);
  await f.store.prune();
  await expect(f.store.content("usr_alice", job.requestId)).rejects.toThrow();
});
afterEach(async () => {
  for (const fn of cleanups.splice(0).reverse()) await fn();
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "devsetu-discovery-store-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  let now = Date.parse("2026-10-24T10:00:00.000Z");
  const clock = () => new Date(now);
  const allowed = new Set(["usr_alice", "usr_bob", "usr_windows_admin"]);
  const administrators = new Set(["usr_windows_admin"]);
  const connectors = new DeveloperConnectorStore(
    join(root, "connectors"),
    async (actor) => allowed.has(actor),
    { head: async () => "a".repeat(40), importBundle: async () => {} },
    async () => {},
    clock,
    undefined,
    undefined,
    undefined,
    async (actor) => administrators.has(actor),
  );
  cleanups.push(async () => connectors.close());
  const alice = await connectors.pair("usr_alice", { version: 1, name: "Alice device" }),
    bob = await connectors.pair("usr_bob", { version: 1, name: "Bob device" });
  await connectors.heartbeat(alice.credential, {
    probe: {
      version: 1,
      profileId: "servix-development",
      repository: "C:\\fixture",
      origin: "//10.9.69.20/e$/FrevOS/git/servix.git",
      head: "a".repeat(40),
      branch: "feature/fixture",
      checkedAt: clock().toISOString(),
    },
  });
  await connectors.heartbeat(bob.credential);
  const project = ProjectSchema.parse({
    projectId: "prj_fixture",
    workspaceId: "ws_server20",
    clientId: "cli_fixture",
    displayName: "Fixture project",
    status: "active",
    createdAt: clock().toISOString(),
  });
  const client = ClientSchema.parse({
    clientId: "cli_fixture",
    workspaceId: "ws_server20",
    displayName: "Fixture client",
    status: "active",
    createdAt: clock().toISOString(),
  });
  const catalogData = { projects: [project], clients: [client] };
  const catalog = async () => catalogData;
  const store = new SystemDiscovery(join(root, "discovery"), connectors, catalog, clock);
  const observation: DiscoveryObservation = {
    version: 1,
    deviceId: alice.deviceId,
    profileId: "servix-development",
    bootId: randomUUID(),
    at: clock().toISOString(),
    policyRevision: 0,
    system: {
      systemName: "Fixture",
      platform: "win32",
      os: "Windows fixture",
      architecture: "x64",
      cpuPercent: null,
      cpuCount: 8,
      memoryTotal: 10000,
      memoryAvailable: 5000,
      uptimeSeconds: 100,
      disks: [],
      tools: [],
    },
    coverage: {
      status: "disabled",
      roots: [],
      watchedDirectories: 0,
      gaps: ["restart-history-unavailable"],
      attribution: "unavailable",
      droppedEvents: 0,
    },
    events: [],
  };
  const policy = {
    version: 1 as const,
    deviceId: alice.deviceId,
    expectedRevision: 0,
    policy: { ...defaultDiscoveryPolicy, enabled: true, contentFolders: ["src"], maxEvents: 100 },
  };
  const plan: DeliveryPlanInput = {
    version: 1,
    projectId: project.projectId,
    expectedRevision: 0,
    poReference: "PO-42",
    poDate: "2026-10-14",
    timeZone: "Asia/Kolkata",
    responsible: "Alice",
    deviceIds: [alice.deviceId],
    milestones: [
      {
        id: "api",
        title: "API",
        weight: 30,
        dueDate: "2026-10-20",
        acceptance: "accepted",
        evidence: "QA-42",
      },
      {
        id: "ui",
        title: "UI",
        weight: 70,
        dueDate: "2026-10-23",
        acceptance: "pending",
        evidence: "",
      },
    ],
  };
  return {
    root,
    connectors,
    store,
    alice,
    bob,
    allowed,
    administrators,
    catalogData,
    catalog,
    clock,
    advance: (ms: number) => {
      now += ms;
    },
    observation,
    policy,
    plan,
  };
}
it("limits user dashboards and plan bindings to owned systems, with configurable fresh admin visibility and no cross-owner controls", async () => {
  const f = await fixture();
  f.catalogData.projects.push(
    ProjectSchema.parse({
      ...f.catalogData.projects[0]!,
      projectId: "prj_private_bob",
      displayName: "Bob private project",
    }),
  );
  await f.store.savePlan("usr_windows_admin", {
    ...f.plan,
    deviceIds: [f.alice.deviceId, f.bob.deviceId],
  });
  await f.store.savePlan("usr_windows_admin", {
    ...f.plan,
    projectId: "prj_private_bob",
    deviceIds: [f.bob.deviceId],
    poReference: "BOB-PRIVATE-PO",
  });
  const alice = await f.store.state("usr_alice");
  expect(alice.access).toEqual({
    actorId: "usr_alice",
    role: "user",
    canPair: true,
    canManageOwnSystems: true,
    canManagePlans: false,
  });
  expect(alice.systems.map((system) => system.deviceId)).toEqual([f.alice.deviceId]);
  expect(alice.reports.map((report) => report.projectId)).toEqual([f.plan.projectId]);
  expect(alice.reports[0]!.plan!.bindings.map((binding) => binding.userId)).toEqual(["usr_alice"]);
  expect(alice.reports[0]!.plan!.deviceIds).toEqual([f.alice.deviceId]);
  for (const privateValue of [f.bob.deviceId, "usr_bob", "prj_private_bob", "BOB-PRIVATE-PO"])
    expect(JSON.stringify(alice)).not.toContain(privateValue);
  await expect(f.store.state("usr_alice", f.bob.deviceId)).rejects.toThrow(
    "discovery-device-access-denied",
  );
  await expect(
    f.store.configure("usr_alice", { ...f.policy, deviceId: f.bob.deviceId }),
  ).rejects.toThrow("discovery-device-access-denied");
  await expect(
    f.store.configureActivity("usr_alice", {
      version: 1,
      deviceId: f.bob.deviceId,
      expectedRevision: 0,
      settings: defaultActivitySettings,
    }),
  ).rejects.toThrow("discovery-device-access-denied");
  await expect(
    f.store.requestFolders("usr_alice", {
      version: 1,
      deviceId: f.bob.deviceId,
      root: "C:\\",
      path: "",
      page: 0,
    }),
  ).rejects.toThrow("discovery-device-access-denied");
  await expect(
    f.store.requestContent("usr_alice", {
      version: 1,
      deviceId: f.bob.deviceId,
      root: "C:\\",
      path: "private.txt",
    }),
  ).rejects.toThrow("discovery-device-access-denied");
  await expect(f.store.savePlan("usr_alice", { ...f.plan, expectedRevision: 1 })).rejects.toThrow(
    "discovery-plan-owner-required",
  );
  f.allowed.add("usr_team_lead");
  f.administrators.add("usr_team_lead");
  const admin = await f.store.state("usr_team_lead");
  expect(admin.access?.role).toBe("admin");
  expect(admin.access?.canManagePlans).toBe(true);
  expect(admin.systems).toHaveLength(2);
  expect(admin.reports).toHaveLength(2);
  await expect(f.store.configure("usr_team_lead", f.policy)).rejects.toThrow(
    "discovery-device-access-denied",
  );
  f.administrators.delete("usr_team_lead");
  expect((await f.store.state("usr_team_lead")).systems).toEqual([]);
  expect((await f.store.state("usr_team_lead")).reports).toEqual([]);
  await expect(
    f.store.savePlan("usr_team_lead", { ...f.plan, expectedRevision: 1 }),
  ).rejects.toThrow("discovery-plan-owner-required");
  f.administrators.delete("usr_windows_admin");
  expect((await f.store.state("usr_windows_admin")).systems).toEqual([]);
  expect((await f.store.state("usr_windows_admin")).access?.role).toBe("user");
  f.allowed.delete("usr_team_lead");
  await expect(f.store.state("usr_team_lead")).rejects.toThrow("connector-access-denied");
});
it("scopes observations/policies and project plans to verified workspace actors; owner reporting never grants remote tracking writes", async () => {
  const f = await fixture();
  expect((await f.store.state("usr_alice")).systems).toHaveLength(1);
  expect((await f.store.state("usr_windows_admin")).systems).toHaveLength(2);
  expect((await f.store.state("usr_alice")).reports).toEqual([]);
  expect((await f.store.state("usr_windows_admin")).reports[0]?.status).toBe("plan-missing");
  await expect(f.store.state("usr_outside")).rejects.toThrow("connector-access-denied");
  await expect(f.store.observe("invalid", f.observation)).rejects.toThrow(
    "connector-authentication-required",
  );
  await expect(f.store.observe(f.bob.credential, f.observation)).rejects.toThrow(
    "discovery-scope-mismatch",
  );
  await expect(f.store.configure("usr_bob", f.policy)).rejects.toThrow(
    "discovery-device-access-denied",
  );
  await expect(f.store.configure("usr_windows_admin", f.policy)).rejects.toThrow(
    "discovery-device-access-denied",
  );
  expect(await f.store.policyForConnector(f.alice.credential)).toEqual({
    revision: 0,
    policy: defaultDiscoveryPolicy,
    activity: { revision: 0, settings: defaultActivitySettings },
    notifications: { version: 1 },
    folderSearch: { version: 1 },
  });
  expect(
    await f.store.observe(f.alice.credential, { ...f.observation, policyRevision: 1 }),
  ).toEqual({ accepted: false, reason: "policy-changed" });
  await f.store.observe(f.alice.credential, f.observation);
  expect((await f.store.state("usr_alice")).systems[0]?.online).toBe(true);
  const changes = await Promise.allSettled([
    f.store.configure("usr_alice", f.policy),
    f.store.configure("usr_alice", f.policy),
  ]);
  expect(changes.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
  expect(await f.store.policyForConnector(f.alice.credential)).toMatchObject({
    revision: 1,
    policy: { enabled: true },
  });
  await expect(f.store.savePlan("usr_alice", f.plan)).rejects.toThrow(
    "discovery-plan-owner-required",
  );
  await expect(
    f.store.savePlan("usr_windows_admin", { ...f.plan, projectId: "prj_elsewhere" }),
  ).rejects.toThrow("discovery-project-not-found");
  await expect(
    f.store.savePlan("usr_windows_admin", { ...f.plan, deviceIds: ["fc_" + "f".repeat(32)] }),
  ).rejects.toThrow("discovery-device-access-denied");
  await f.store.savePlan("usr_windows_admin", f.plan);
  await expect(f.store.savePlan("usr_windows_admin", f.plan)).rejects.toThrow(
    "discovery-revision-changed",
  );
  const report = (await f.store.state("usr_windows_admin")).reports[0];
  expect(report).toMatchObject({
    completedPercent: 30,
    plannedPercent: 100,
    status: "behind-plan",
    clientName: "Fixture client",
    overdue: ["UI"],
  });
  await f.store.savePlan("usr_windows_admin", {
    ...f.plan,
    expectedRevision: 1,
    milestones: f.plan.milestones.map((m) => ({
      ...m,
      acceptance: "accepted",
      evidence: "QA-complete",
    })),
  });
  expect((await f.store.state("usr_windows_admin")).reports[0]?.completedPercent).toBe(100);
  expect(
    JSON.parse(await readFile(join(f.store.root, "prj_fixture.plan.r00000001.json"), "utf8"))
      .milestones[1].acceptance,
  ).toBe("pending");
  const restarted = new SystemDiscovery(f.store.root, f.connectors, f.catalog, f.clock);
  expect((await restarted.state("usr_windows_admin")).reports[0]?.status).toBe("complete");
  f.advance(31000);
  expect((await restarted.state("usr_alice")).systems[0]?.online).toBe(false);
  f.allowed.delete("usr_bob");
  expect(
    (await f.store.state("usr_windows_admin")).systems.find((s) => s.deviceId === f.bob.deviceId)
      ?.status,
  ).toBe("workspace-access-revoked");
  await expect(f.store.state("usr_bob")).rejects.toThrow("connector-access-denied");
  await f.connectors.revoke("usr_alice", f.alice.deviceId);
  await expect(f.store.policyForConnector(f.alice.credential)).rejects.toThrow(
    "connector-authentication-required",
  );
  expect((await f.store.state("usr_alice")).systems[0]?.status).toBe("revoked");
});

it("binds durable folder metadata to its owner, fresh enrolled source, approved root, request, expiry and exact result", async () => {
  const f = await fixture(),
    input = { version: 1, deviceId: f.alice.deviceId, root: "C:\\fixture", path: "", page: 0 };
  await expect(f.store.requestFolders("usr_alice", input)).rejects.toThrow(
    "discovery-source-stale",
  );
  await f.store.observe(f.alice.credential, f.observation);
  await expect(f.store.requestFolders("usr_bob", input)).rejects.toThrow(
    "discovery-device-access-denied",
  );
  await expect(f.store.requestFolders("usr_alice", { ...input, root: "D:\\" })).rejects.toThrow(
    "discovery-folder-scope-denied",
  );
  await expect(
    f.store.requestFolders("usr_alice", { ...input, path: "../escape" }),
  ).rejects.toThrow();
  const queued = await f.store.requestFolders("usr_alice", input);
  await expect(f.store.requestFolders("usr_alice", input)).rejects.toThrow("discovery-folder-busy");
  expect(await f.store.claimFolders(f.bob.credential)).toBeNull();
  const working = (await f.store.claimFolders(f.alice.credential))!;
  expect(working.status).toBe("working");
  expect(await f.store.claimFolders(f.alice.credential)).toBeNull();
  await expect(f.store.folders("usr_bob", queued.requestId)).rejects.toThrow(
    "discovery-folder-not-found",
  );
  await expect(f.store.folders("usr_alice", "wrong")).rejects.toThrow("discovery-folder-not-found");
  await expect(f.store.folders("usr_alice", "fb_" + "0".repeat(32))).rejects.toThrow(
    "discovery-folder-not-found",
  );
  const complete = {
    ...working,
    status: "succeeded",
    result: {
      root: input.root,
      path: "",
      fingerprint: "a".repeat(64),
      entries: [
        { name: "apps", path: "apps", excluded: false },
        { name: "protected", path: "protected", excluded: true },
      ],
      nextPage: null,
      truncated: false,
      scannedEntries: 2,
    },
  };
  await expect(f.store.finishFolders(f.bob.credential, complete)).rejects.toThrow(
    "discovery-folder-scope-denied",
  );
  await expect(
    f.store.finishFolders(f.alice.credential, { ...complete, actor: "usr_bob" }),
  ).rejects.toThrow("discovery-folder-scope-denied");
  await expect(
    f.store.finishFolders(f.alice.credential, {
      ...complete,
      request: { ...input, path: "other" },
    }),
  ).rejects.toThrow("discovery-folder-scope-denied");
  await expect(
    f.store.finishFolders(f.alice.credential, {
      ...complete,
      result: { ...complete.result, root: "D:\\" },
    }),
  ).rejects.toThrow("discovery-folder-result-invalid");
  await expect(
    f.store.finishFolders(f.alice.credential, {
      ...complete,
      result: { ...complete.result, nextPage: 4 },
    }),
  ).rejects.toThrow("discovery-folder-result-invalid");
  await expect(
    f.store.finishFolders(f.alice.credential, {
      ...complete,
      result: {
        ...complete.result,
        entries: [{ name: "apps", path: "other/apps", excluded: false }],
      },
    }),
  ).rejects.toThrow("discovery-folder-result-invalid");
  await expect(
    f.store.finishFolders(f.alice.credential, { ...working, status: "succeeded" }),
  ).rejects.toThrow("discovery-folder-result-invalid");
  await expect(
    f.store.finishFolders(f.alice.credential, { ...working, status: "failed" }),
  ).rejects.toThrow("discovery-folder-result-invalid");
  await f.store.finishFolders(f.alice.credential, complete);
  expect((await f.store.folders("usr_alice", queued.requestId)).result?.entries).toHaveLength(2);
  expect(
    await f.store.selectedFolder("usr_alice", f.alice.deviceId, {
      browseRequestId: queued.requestId,
      path: "apps",
    }),
  ).toBe("C:\\fixture\\apps");
  await expect(
    f.store.selectedFolder("usr_alice", f.bob.deviceId, {
      browseRequestId: queued.requestId,
      path: "apps",
    }),
  ).rejects.toThrow("discovery-folder-selection-invalid");
  await expect(
    f.store.selectedFolder("usr_alice", f.alice.deviceId, {
      browseRequestId: queued.requestId,
      path: "protected",
    }),
  ).rejects.toThrow("discovery-folder-selection-invalid");
  expect(
    await f.store.selectedFolder("usr_alice", f.alice.deviceId, {
      browseRequestId: queued.requestId,
      path: "",
    }),
  ).toBe("C:\\fixture");
  const restarted = new SystemDiscovery(f.store.root, f.connectors, f.catalog, f.clock);
  expect((await restarted.folders("usr_alice", queued.requestId)).status).toBe("succeeded");
  const failure = await f.store.requestFolders("usr_alice", input);
  const claimed = (await f.store.claimFolders(f.alice.credential))!;
  await f.store.finishFolders(f.alice.credential, {
    ...claimed,
    status: "failed",
    errorCode: "folder-permission-denied",
  });
  expect((await f.store.folders("usr_alice", failure.requestId)).errorCode).toBe(
    "folder-permission-denied",
  );
  await expect(
    f.store.configure("usr_alice", {
      ...f.policy,
      policy: {
        ...f.policy.policy,
        allLocalDrives: false,
        priorityFolders: [{ root: "D:\\", path: "" }],
      },
    }),
  ).rejects.toThrow("discovery-folder-scope-denied");
  await f.store.configure("usr_alice", {
    ...f.policy,
    policy: { ...f.policy.policy, priorityFolders: [{ root: input.root, path: "apps" }] },
  });
  const expired = await f.store.requestFolders("usr_alice", input);
  const proof = (await f.connectors.list("usr_alice"))[0]!.source!;
  f.advance(121000);
  await f.connectors.heartbeat(f.alice.credential, {
    probe: { ...proof, checkedAt: f.clock().toISOString() },
  });
  await f.store.observe(f.alice.credential, {
    ...f.observation,
    at: f.clock().toISOString(),
    policyRevision: 1,
  });
  expect((await f.store.folders("usr_alice", expired.requestId)).status).toBe("expired");
  expect(await f.store.claimFolders(f.alice.credential)).toBeNull();
});

it("expires and collects old directory metadata requests while preserving current source boundaries", async () => {
  const f = await fixture();
  await f.store.observe(f.alice.credential, f.observation);
  const input = { version: 1, deviceId: f.alice.deviceId, root: "C:\\fixture", path: "", page: 0 };
  const old = await f.store.requestFolders("usr_alice", input),
    proof = (await f.connectors.list("usr_alice"))[0]!.source!;
  f.advance(86521000);
  await f.connectors.heartbeat(f.alice.credential, {
    probe: { ...proof, checkedAt: f.clock().toISOString() },
  });
  await f.store.observe(f.alice.credential, { ...f.observation, at: f.clock().toISOString() });
  const current = await f.store.requestFolders("usr_alice", input);
  expect(current.status).toBe("queued");
  await expect(readFile(join(f.store.root, old.requestId + ".json"))).rejects.toMatchObject({
    code: "ENOENT",
  });
  expect((await f.store.folders("usr_alice", current.requestId)).request.root).toBe(input.root);
  f.allowed.delete("usr_alice");
  await expect(f.store.folders("usr_alice", current.requestId)).rejects.toThrow(
    "connector-access-denied",
  );
});

it("keeps a pending explicit folder choice immutable and rejects contradictory success/error reports", async () => {
  const f = await fixture(),
    proof = (await f.connectors.list("usr_alice"))[0]!.source!;
  await f.connectors.heartbeat(f.alice.credential, { probe: proof, folderBrowser: true });
  const queued = await f.connectors.chooseFolder("usr_alice", f.alice.deviceId, "C:\\fixture");
  expect(
    (await f.connectors.chooseFolder("usr_alice", f.alice.deviceId, "C:\\fixture")).requestId,
  ).toBe(queued.requestId);
  await expect(
    f.connectors.chooseFolder("usr_alice", f.alice.deviceId, "C:\\other"),
  ).rejects.toThrow("connector-source-busy");
  const choosing = (await f.connectors.claimFolder(f.alice.credential))!;
  await expect(
    f.connectors.finishFolder(f.alice.credential, {
      ...choosing,
      status: "selected",
      source: proof,
      errorCode: "folder-not-git",
    }),
  ).rejects.toThrow("folder-selection-invalid");
  await f.connectors.finishFolder(f.alice.credential, {
    ...choosing,
    status: "failed",
    errorCode: "folder-not-git",
  });
  expect((await f.connectors.list("usr_alice"))[0]?.folderSelection?.errorCode).toBe(
    "folder-not-git",
  );
});
it("redacts at persistence/presentation, restricts content to selected verified roots, deduplicates receipts and retains history while paused", async () => {
  const f = await fixture();
  await f.store.configure("usr_alice", f.policy);
  const event = {
    sequence: 1,
    at: f.clock().toISOString(),
    root: "C:\\fixture",
    path: "src/code.ts",
    kind: "modified" as const,
    source: "filesystem-notification" as const,
    attribution: "unavailable" as const,
    content: {
      before: "export const version = 1;",
      after: 'export const version = 2;\n{"password":"SYNTHETIC_PRIVATE_VALUE"}',
      status: "redacted-text" as const,
    },
  };
  const input = {
    ...f.observation,
    policyRevision: 1,
    events: [
      event,
      { ...event, sequence: 2, path: "other/code.ts" },
      { ...event, sequence: 3, path: "src/.env.prod" },
      { ...event, sequence: 4, root: "C:\\other", path: "src/other.ts" },
    ],
  };
  expect(await f.store.observe(f.alice.credential, input)).toMatchObject({
    accepted: true,
    sequence: 4,
  });
  await f.store.observe(f.alice.credential, input);
  const state = await f.store.state("usr_alice");
  expect(state.systems[0]?.history).toHaveLength(3);
  expect(state.systems[0]?.history[0]?.content?.after).toContain("[sensitive line omitted]");
  expect(state.systems[0]?.history[1]?.content).toBeUndefined();
  expect(state.systems[0]?.history[2]?.content).toBeUndefined();
  const file = join(f.store.root, f.alice.deviceId + ".observation.json");
  expect(await readFile(file, "utf8")).not.toContain("SYNTHETIC_PRIVATE_VALUE");
  // A replay with a previously acknowledged filtered sequence cannot re-enter as a new path.
  await f.store.observe(f.alice.credential, {
    ...input,
    events: [{ ...event, sequence: 3, path: "src/replayed.ts" }],
  });
  expect((await f.store.state("usr_alice")).systems[0]?.history).toHaveLength(3);
  await f.store.configure("usr_alice", {
    ...f.policy,
    expectedRevision: 1,
    policy: { ...f.policy.policy, enabled: false },
  });
  await f.store.observe(f.alice.credential, {
    ...input,
    policyRevision: 2,
    events: [{ ...event, sequence: 5 }],
  });
  expect((await f.store.state("usr_alice")).systems[0]?.history).toHaveLength(3);
  f.advance(8 * 86400000);
  await f.store.prune();
  expect((await f.store.state("usr_alice")).systems[0]?.history).toEqual([]);
  expect(await readFile(file, "utf8")).not.toContain("export const version");
  await expect(f.store.observe(f.alice.credential, input)).resolves.toMatchObject({
    accepted: false,
    reason: "policy-changed",
  });
  await expect(
    f.store.observe(f.alice.credential, { ...input, policyRevision: 2 }),
  ).rejects.toThrow("discovery-observation-expired");
  await expect(
    f.store.observe(f.alice.credential, {
      ...input,
      policyRevision: 2,
      at: new Date(f.clock().getTime() + 120000).toISOString(),
    }),
  ).rejects.toThrow("discovery-observation-expired");
});
it("bounds retained content and event counts, refuses corrupt or linked storage, and preserves no content without fresh repository proof", async () => {
  const f = await fixture();
  await f.store.configure("usr_alice", f.policy);
  const content = {
    before: "export const number = 0;\n".repeat(250),
    after: "export const number = 1;\n".repeat(250),
    status: "redacted-text" as const,
  };
  for (let batch = 0; batch < 10; batch++)
    await f.store.observe(f.alice.credential, {
      ...f.observation,
      policyRevision: 1,
      events: Array.from({ length: 20 }, (_, i) => ({
        sequence: batch * 20 + i + 1,
        at: f.clock().toISOString(),
        root: "C:\\fixture",
        path: `src/code-${batch}-${i}.ts`,
        kind: "modified",
        source: "filesystem-notification",
        attribution: "unavailable",
        content,
      })),
    });
  const history = (await f.store.state("usr_alice", f.alice.deviceId)).systems[0]?.history ?? [];
  await expect(f.store.state("usr_alice", f.bob.deviceId)).rejects.toThrow();
  expect((await f.store.state("usr_alice")).systems[0]?.history.length).toBeLessThanOrEqual(20);
  expect(history.length).toBeLessThanOrEqual(100);
  expect(Buffer.byteLength(JSON.stringify(history))).toBeLessThanOrEqual(1000000);
  f.advance(21000);
  await f.store.observe(f.alice.credential, {
    ...f.observation,
    at: f.clock().toISOString(),
    policyRevision: 1,
    events: [
      {
        sequence: 201,
        at: f.clock().toISOString(),
        root: "C:\\fixture",
        path: "src/no-proof.ts",
        kind: "modified",
        source: "filesystem-notification",
        attribution: "unavailable",
        content,
      },
    ],
  });
  expect((await f.store.state("usr_alice")).systems[0]?.history.at(-1)?.content).toBeUndefined();
  const file = join(f.store.root, f.alice.deviceId + ".observation.json");
  await writeFile(file, "not-json");
  await expect(f.store.state("usr_alice")).rejects.toThrow("discovery-storage-unavailable");
  const other = join(f.root, "other");
  await mkdir(other);
  const linked = join(f.root, "linked");
  await symlink(other, linked, process.platform === "win32" ? "junction" : "dir");
  const linkedStore = new SystemDiscovery(linked, f.connectors, f.catalog, f.clock);
  await expect(linkedStore.state("usr_alice")).rejects.toThrow("discovery-storage-unavailable");
  expect(await readdir(other)).toEqual([]);
});
