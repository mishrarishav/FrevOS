import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ClientSchema,
  type DeliveryPlanInput,
  type DiscoveryObservation,
  defaultDiscoveryPolicy,
  ProjectSchema,
} from "@frevos/contracts";
import { afterEach, expect, it } from "vitest";
import { DeveloperConnectorStore } from "../src/developer-connectors.js";
import { SystemDiscovery } from "../src/system-discovery.js";

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const fn of cleanups.splice(0).reverse()) await fn();
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "devsetu-discovery-store-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  let now = Date.parse("2026-10-24T10:00:00.000Z");
  const clock = () => new Date(now);
  const allowed = new Set(["usr_alice", "usr_bob", "usr_windows_admin"]);
  const connectors = new DeveloperConnectorStore(
    join(root, "connectors"),
    async (actor) => allowed.has(actor),
    { head: async () => "a".repeat(40), importBundle: async () => {} },
    async () => {},
    clock,
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
  const catalog = async () => ({ projects: [project], clients: [client] });
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
it("scopes observations/policies and project plans to verified workspace actors; owner reporting never grants remote tracking writes", async () => {
  const f = await fixture();
  expect((await f.store.state("usr_alice")).systems).toHaveLength(1);
  expect((await f.store.state("usr_windows_admin")).systems).toHaveLength(2);
  expect((await f.store.state("usr_alice")).reports[0]?.status).toBe("plan-missing");
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
