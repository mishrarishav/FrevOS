import { AsyncLocalStorage } from "node:async_hooks";
import {
  ServerMonitorPolicySchema,
  ServerMonitorSnapshotSchema,
  ServerMonitorSaveTargetSchema,
  privateServerAddress,
} from "@frevos/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  ServerMonitoringDocumentSchema,
  ServerMonitoringService,
  serverMonitorTargetId,
  type ServerMonitorCollectionResult,
  type ServerMonitorCollectorTarget,
  type ServerMonitoringRegister,
  type ServerMonitoringStore,
} from "../src/server-monitoring.js";

// This suite never opens a socket, database, container, native shell or listener.
class MemoryStore implements ServerMonitoringStore {
  documents = new Map<string, unknown>();
  at = "2026-11-11T01:00:00.000Z";
  queue: Promise<unknown> = Promise.resolve();
  readonly inside = new AsyncLocalStorage<boolean>();
  now() {
    return this.at;
  }
  advance(seconds = 30) {
    this.at = new Date(Date.parse(this.at) + seconds * 1000).toISOString();
  }
  async workspaces() {
    return ["ws_monitor"];
  }
  async read(workspace: string) {
    return structuredClone(this.documents.get(workspace) ?? null);
  }
  async write(workspace: string, value: unknown) {
    if (!this.inside.getStore()) throw new Error("write outside transaction");
    this.documents.set(workspace, structuredClone(value));
  }
  async transaction<T>(_workspace: string, operation: () => Promise<T>): Promise<T> {
    const run = this.queue.then(() => this.inside.run(true, operation));
    this.queue = run.catch(() => {});
    return run;
  }
}
const registerId = "rr_" + "a".repeat(32);
const recordId = (n: number) => "rec_" + n.toString(16).padStart(32, "0");
function snapshot(
  at: string,
  cpu: number | null = 25,
  available = 60,
): ServerMonitorCollectionResult {
  return {
    status: "connected",
    computerName: "Server",
    snapshot: {
      observedAt: at,
      computerName: "Server",
      osName: "Windows Server",
      uptimeSeconds: 1234,
      logicalProcessors: 4,
      cpuPercent: cpu,
      memoryTotalBytes: 100,
      memoryAvailableBytes: available,
      disks: [{ name: "C:", totalBytes: 1000, freeBytes: 250 }],
      network: { receivedBytesPerSecond: 120, sentBytesPerSecond: null },
      processes: [{ pid: 100, name: "worker", cpuPercent: 10, workingSetBytes: 20 }],
      services: [
        { name: "service", displayName: "Service", state: "Running", startMode: "Auto", pid: 100 },
      ],
    },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture() {
  const store = new MemoryStore();
  const inactive = new Set<string>();
  const authority = vi.fn(async (workspace: string, actor: string) => ({
    active:
      workspace === "ws_monitor" &&
      ["usr_admin", "usr_backup", "usr_viewer", "usr_other"].includes(actor) &&
      !inactive.has(actor),
    administrator: ["usr_admin", "usr_backup"].includes(actor),
  }));
  const register: ServerMonitoringRegister = { id: registerId, records: [] };
  const collector = vi.fn(async () => snapshot(store.now()));
  let enrolled = true;
  const options = {
    store,
    authority,
    readRegister: vi.fn(async () => register),
    collector,
    targetAllowed: vi.fn(async (_target: ServerMonitorCollectorTarget) => enrolled),
    sourcePolicies: [
      {
        workspaceId: "ws_monitor",
        registerId,
        managementValues: ["Managed"],
        hostingField: "hosting",
      },
    ],
    concurrency: 2,
    timeoutMs: 1000,
  };
  const service = new ServerMonitoringService(options);
  const save = (overrides = {}) =>
    service.saveTarget("ws_monitor", "usr_admin", {
      expectedRevision: null,
      name: "Server",
      address: "10.44.1.8",
      port: 5985,
      transport: "winrm-http",
      enabled: true,
      credentialProfile: "server-account",
      grants: ["usr_viewer"],
      ...overrides,
    });
  const read = () => service.catalog("ws_monitor", "usr_admin");
  const sample = async () => {
    await service.refresh("ws_monitor", "usr_admin", {});
    await service.runDue();
  };
  const policy = async (overrides = {}) => {
    const current = await read();
    return service.savePolicy("ws_monitor", "usr_admin", {
      expectedRevision: current.revision,
      policy: { ...current.policy, ...overrides },
    });
  };
  return {
    store,
    inactive,
    authority,
    register,
    collector,
    options,
    service,
    save,
    read,
    sample,
    policy,
    unenroll: () => {
      enrolled = false;
    },
  };
}

describe("server monitoring contracts and access boundaries", () => {
  it.each([
    "127.0.0.1",
    "169.254.1.4",
    "8.8.8.8",
    "0.0.0.0",
    "10.01.1.4",
    "10.0.0.999",
    "server.example",
    "10.1.1.1/path",
    "10.1.1.1:5985",
    "192.169.0.1",
  ])("rejects a non-literal/private target %s", (value) =>
    expect(privateServerAddress(value)).toBe(false),
  );
  it.each(["10.44.1.8", "172.16.0.1", "172.31.255.254", "192.168.22.8"])(
    "accepts private IPv4 %s",
    (value) => expect(privateServerAddress(value)).toBe(true),
  );
  it("does not accept passwords, shell commands, command lines or impossible telemetry", () => {
    expect(
      ServerMonitorSaveTargetSchema.safeParse({ password: "secret", command: "run" }).success,
    ).toBe(false);
    const value = snapshot("2026-11-11T01:00:00.000Z").snapshot!;
    expect(ServerMonitorSnapshotSchema.safeParse({ ...value, commandLine: "secret" }).success).toBe(
      false,
    );
    expect(
      ServerMonitorSnapshotSchema.safeParse({ ...value, memoryAvailableBytes: 101 }).success,
    ).toBe(false);
    expect(ServerMonitorSnapshotSchema.safeParse({ ...value, cpuPercent: 101 }).success).toBe(
      false,
    );
    expect(
      ServerMonitorPolicySchema.safeParse({ intervalSeconds: 60, staleAfterSeconds: 30 }).success,
    ).toBe(false);
  });
  it("scopes each catalog to active membership and explicit target grants", async () => {
    const f = fixture();
    const catalog = await f.save();
    const viewer = await f.service.catalog("ws_monitor", "usr_viewer");
    expect(viewer.targets).toHaveLength(1);
    expect(viewer.targets[0]).not.toHaveProperty("credentialProfile");
    expect(viewer.targets[0]).not.toHaveProperty("grants");
    expect((await f.service.catalog("ws_monitor", "usr_other")).targets).toHaveLength(0);
    await expect(f.service.catalog("ws_foreign", "usr_admin")).rejects.toThrow("forbidden");
    await expect(
      f.service.refresh("ws_monitor", "usr_other", { targetId: catalog.targets[0]!.id }),
    ).rejects.toThrow("target-not-found");
    await expect(
      f.service.savePolicy("ws_monitor", "usr_viewer", {
        expectedRevision: 0,
        policy: catalog.policy,
      }),
    ).rejects.toThrow("forbidden");
    f.inactive.add("usr_viewer");
    await expect(f.service.catalog("ws_monitor", "usr_viewer")).rejects.toThrow("forbidden");
  });
  it("rejects inactive grants, unenrolled targets, stale revisions and duplicate machines", async () => {
    const f = fixture();
    f.inactive.add("usr_viewer");
    await expect(f.save()).rejects.toThrow("forbidden");
    f.inactive.clear();
    const target = (await f.save()).targets[0]!;
    await expect(f.save()).rejects.toThrow("target-already-exists");
    await expect(f.save({ id: target.id, expectedRevision: 9 })).rejects.toThrow(
      "revision-conflict",
    );
    await expect(
      f.save({ id: target.id, expectedRevision: 0, address: "10.44.1.9" }),
    ).rejects.toThrow("target-identity-immutable");
    f.unenroll();
    await expect(f.save({ address: "10.44.1.9" })).rejects.toThrow("target-not-enrolled");
  });
  it("deduplicates enrolled source IPs and excludes vendor and reserved example fixtures", async () => {
    const f = fixture();
    const record = (n: number, management: string, hosting: string, url?: string) => ({
      id: recordId(n),
      title: "App " + n,
      management,
      fields: { hosting },
      endpoints: url ? [{ url }] : [],
    });
    f.register.records = [
      record(1, "Managed", "10.44.1.8; 10.44.1.9"),
      record(2, "Managed", "10.44.1.8"),
      record(3, "Vendor", "10.44.1.20"),
      record(4, "Managed", "192.168.1.1", "https://www.example.com/"),
      record(5, "Managed", ""),
      record(6, "Managed", "10.10.900"),
      record(7, "Managed", "8.8.8.8"),
    ];
    const input = {
      registerId,
      managementValues: ["Managed"],
      hostingField: "hosting",
      credentialProfile: "server-account",
      transport: "winrm-http",
      port: 5985,
      enabled: true,
    };
    const result = await f.service.importTargets("ws_monitor", "usr_admin", input);
    expect(result.added).toBe(2);
    expect(result.updated).toBe(0);
    expect(result.excluded.map((entry) => entry.reason)).toEqual([
      "management-not-selected",
      "placeholder",
      "missing-address",
      "invalid-address",
      "invalid-address",
    ]);
    expect(result.catalog.targets[0]!.sourceRefs).toHaveLength(2);
    expect(result.catalog.targets[0]!.id).toBe(
      serverMonitorTargetId("ws_monitor", "10.44.1.8", 5985, "winrm-http"),
    );
    expect((await f.service.importTargets("ws_monitor", "usr_admin", input)).added).toBe(0);
    await expect(
      f.service.importTargets("ws_monitor", "usr_admin", {
        ...input,
        managementValues: ["Vendor"],
      }),
    ).rejects.toThrow("source-not-enrolled");
    expect(f.collector).not.toHaveBeenCalled();
  });
});

describe("durable bounded server samples", () => {
  it("preserves the enrolled local identity when a source import defaults to WinRM", async () => {
    const f = fixture();
    f.options.targetAllowed.mockImplementation(async (target) => target.transport === "local");
    const current = await f.save({ transport: "local" });
    f.register.records = [
      {
        id: recordId(1),
        title: "Central application",
        management: "Managed",
        fields: { hosting: "10.44.1.8" },
      },
    ];
    const result = await f.service.importTargets("ws_monitor", "usr_admin", {
      registerId,
      managementValues: ["Managed"],
      hostingField: "hosting",
      credentialProfile: "server-account",
      transport: "winrm-http",
      port: 5985,
      enabled: true,
    });
    expect(result.added).toBe(0);
    expect(result.updated).toBe(1);
    expect(result.catalog.targets).toHaveLength(1);
    expect(result.catalog.targets[0]?.id).toBe(current.targets[0]?.id);
    expect(result.catalog.targets[0]?.transport).toBe("local");
    expect(result.catalog.targets[0]?.sourceRefs).toHaveLength(1);
  });
  it("pauses automatic authentication failures and requires an administrator for an explicit retry", async () => {
    const f = fixture();
    await f.save();
    await f.policy({ enabled: true });
    f.collector.mockResolvedValue({ status: "auth-failed", computerName: null });
    await f.service.runDue();
    const failed = (await f.read()).targets[0];
    expect(failed?.enabled).toBe(false);
    expect(failed?.access.status).toBe("auth-failed");
    f.store.advance(300);
    expect(await f.service.runDue()).toBe(0);
    expect(f.collector).toHaveBeenCalledOnce();
    await expect(
      f.service.refresh("ws_monitor", "usr_viewer", { targetId: failed?.id }),
    ).rejects.toThrow("credential-retry-requires-administrator");
    f.collector.mockImplementation(async () => snapshot(f.store.now()));
    await f.service.check("ws_monitor", "usr_admin", { targetId: failed?.id });
    await f.service.runDue();
    expect(f.collector).toHaveBeenCalledTimes(2);
    expect((await f.read()).targets[0]?.access.status).toBe("connected");
    expect((await f.read()).targets[0]?.enabled).toBe(false);
    const paused = (await f.read()).targets[0];
    await f.save({ id: paused?.id, expectedRevision: paused?.revision, enabled: true });
    f.store.advance();
    expect(await f.service.runDue()).toBe(1);
  });
  it("gives older due servers a turn even when a slow collection takes longer than its interval", async () => {
    const f = fixture();
    for (let i = 1; i <= 4; i++) await f.save({ address: `10.44.2.${i}` });
    await f.policy({ enabled: true, intervalSeconds: 10 });
    const seen: string[] = [];
    const service = new ServerMonitoringService({
      ...f.options,
      concurrency: 1,
      collector: async (target) => {
        seen.push(target.id);
        f.store.advance(20);
        return snapshot(f.store.now());
      },
    });
    for (let i = 0; i < 4; i++) await service.runDue();
    expect(new Set(seen.slice(0, 4)).size).toBe(4);
    expect((await f.read()).targets.every((target) => target.history.length >= 1)).toBe(true);
  });
  it("queues quickly, runs outside the transaction, and keeps configuration revisions stable", async () => {
    const f = fixture();
    const target = (await f.save()).targets[0]!;
    f.collector.mockImplementation(async () => {
      expect(f.store.inside.getStore()).toBeUndefined();
      return snapshot(f.store.now());
    });
    const queued = await f.service.refresh("ws_monitor", "usr_viewer", { targetId: target.id });
    expect(queued.targets[0]!.polling).toBe(true);
    expect(f.collector).not.toHaveBeenCalled();
    expect(await f.service.runDue()).toBe(1);
    const current = await f.read();
    expect(current.targets[0]!.history).toHaveLength(1);
    expect(current.targets[0]!.polling).toBe(false);
    expect(current.targets[0]!.latest?.processes[0]!.workingSetBytes).toBe(20);
    expect(current.revision).toBe(0);
    expect(current.targets[0]!.revision).toBe(0);
    expect(await f.service.runDue()).toBe(0);
  });
  it("does not manufacture utilization when access-only checks or failures have no measurements", async () => {
    const f = fixture();
    await f.save();
    f.collector.mockResolvedValue({ status: "connected", computerName: "Server" });
    await f.service.check("ws_monitor", "usr_admin", {});
    await f.service.runDue();
    expect((await f.read()).targets[0]!.access.status).toBe("connected");
    expect((await f.read()).targets[0]!.history).toEqual([]);
    await f.sample();
    expect((await f.read()).targets[0]!.access.status).toBe("error");
    f.collector.mockRejectedValue(new Error("password=NEVER_DISPLAY_RAW_STDERR"));
    await f.sample();
    expect(JSON.stringify(await f.read())).not.toContain("NEVER_DISPLAY");
  });
  it("distinguishes authentication, access, transport and unsupported errors", async () => {
    const f = fixture();
    const target = (await f.save()).targets[0];
    for (const status of [
      "auth-failed",
      "access-denied",
      "unreachable",
      "winrm-unavailable",
      "unsupported",
    ] as const) {
      f.collector.mockResolvedValue({ status, computerName: null });
      await f.service.refresh("ws_monitor", "usr_admin", { targetId: target?.id });
      await f.service.runDue();
      expect((await f.read()).targets[0]!.access.status).toBe(status);
    }
    expect((await f.read()).targets[0]!.history).toHaveLength(0);
  });
  it("supports enabled periodic sampling, pauses automatically, and permits an explicit refresh while paused", async () => {
    const f = fixture();
    await f.save();
    await f.policy({ enabled: true });
    expect(await f.service.runDue()).toBe(1);
    expect(await f.service.runDue()).toBe(0);
    f.store.advance();
    expect(await f.service.runDue()).toBe(1);
    await f.policy({ enabled: false });
    f.store.advance();
    expect(await f.service.runDue()).toBe(0);
    await f.sample();
    expect((await f.read()).targets[0]!.history).toHaveLength(3);
  });
  it("creates sustained threshold alerts and maintains per-user acknowledgements", async () => {
    const f = fixture();
    await f.save();
    await f.policy({ consecutiveSamples: 2 });
    f.collector.mockImplementation(async () => snapshot(f.store.now(), 95, 5));
    await f.sample();
    expect((await f.read()).targets[0]!.alerts).toHaveLength(0);
    f.store.advance();
    await f.sample();
    const alerts = (await f.read()).targets[0]!.alerts;
    expect(alerts.map((entry) => entry.kind)).toEqual(["cpu", "memory"]);
    await f.service.acknowledge("ws_monitor", "usr_viewer", { alertId: alerts[0]!.id });
    expect(
      (await f.service.catalog("ws_monitor", "usr_viewer")).targets[0]!.alerts[0]!.acknowledged,
    ).toBe(true);
    expect((await f.read()).targets[0]!.alerts[0]!.acknowledged).toBe(false);
    await expect(
      f.service.acknowledge("ws_monitor", "usr_other", { alertId: alerts[0]!.id }),
    ).rejects.toThrow("alert-not-found");
    f.store.advance();
    f.collector.mockImplementation(async () => snapshot(f.store.now(), null, 5));
    await f.sample();
    expect((await f.read()).targets[0]!.alerts[0]!.resolvedAt).toBeNull();
    f.store.advance();
    f.collector.mockImplementation(async () => snapshot(f.store.now()));
    await f.sample();
    expect((await f.read()).targets[0]!.alerts.every((entry) => entry.resolvedAt !== null)).toBe(
      true,
    );
  });
  it("retains only actual received, bounded history and rejects stale/future samples", async () => {
    const f = fixture();
    await f.save();
    await f.policy({ maxPointsPerTarget: 30, retentionHours: 1 });
    for (let i = 0; i < 33; i++) {
      await f.sample();
      f.store.advance();
    }
    expect((await f.read()).targets[0]!.history).toHaveLength(30);
    const latest = (await f.read()).targets[0]!.latest!.observedAt;
    f.collector.mockResolvedValue(snapshot(latest));
    await f.sample();
    expect((await f.read()).targets[0]!.history).toHaveLength(30);
    f.collector.mockResolvedValue(snapshot("2099-01-01T00:00:00.000Z"));
    await f.sample();
    expect((await f.read()).targets[0]!.access.status).toBe("error");
    f.store.advance(3601);
    f.collector.mockImplementation(async () => snapshot(f.store.now()));
    await f.sample();
    expect((await f.read()).targets[0]!.history).toHaveLength(1);
  });
  it("prevents duplicate collections across worker instances", async () => {
    const f = fixture();
    await f.save();
    const hold = deferred<ServerMonitorCollectionResult>();
    f.collector.mockImplementation(() => hold.promise);
    await f.service.refresh("ws_monitor", "usr_admin", {});
    const running = f.service.runDue();
    await vi.waitFor(() => expect(f.collector).toHaveBeenCalledTimes(1));
    const second = new ServerMonitoringService(f.options);
    expect(await second.runDue()).toBe(0);
    hold.resolve(snapshot(f.store.now()));
    await running;
    expect((await f.read()).targets[0]!.history).toHaveLength(1);
  });
  it("drops late results when policy, target grants or workspace membership changes", async () => {
    const f = fixture();
    const target = (await f.save()).targets[0]!;
    const hold = deferred<ServerMonitorCollectionResult>();
    f.collector.mockImplementation(() => hold.promise);
    await f.service.refresh("ws_monitor", "usr_viewer", { targetId: target.id });
    const running = f.service.runDue();
    await vi.waitFor(() => expect(f.collector).toHaveBeenCalled());
    f.inactive.add("usr_viewer");
    hold.resolve(snapshot(f.store.now()));
    await running;
    expect((await f.read()).targets[0]!.history).toHaveLength(0);
    f.inactive.clear();
    const hold2 = deferred<ServerMonitorCollectionResult>();
    f.collector.mockImplementation(() => hold2.promise);
    await f.service.refresh("ws_monitor", "usr_admin", {});
    const running2 = f.service.runDue();
    await vi.waitFor(() => expect(f.collector).toHaveBeenCalledTimes(2));
    await f.policy();
    hold2.resolve(snapshot(f.store.now()));
    await running2;
    expect((await f.read()).targets[0]!.history).toHaveLength(0);
  });
  it("reclaims an expired durable manual lease and fences the old response", async () => {
    const f = fixture();
    await f.save();
    const hold = deferred<ServerMonitorCollectionResult>();
    f.collector.mockImplementation(() => hold.promise);
    await f.service.refresh("ws_monitor", "usr_admin", {});
    const running = f.service.runDue();
    await vi.waitFor(() => expect(f.collector).toHaveBeenCalled());
    f.store.advance(61);
    const secondCollector = vi.fn(async () => snapshot(f.store.now(), 70));
    const second = new ServerMonitoringService({ ...f.options, collector: secondCollector });
    expect(await second.runDue()).toBe(1);
    hold.resolve(snapshot(f.store.now(), 5));
    await running;
    expect((await f.read()).targets[0]!.latest!.cpuPercent).toBe(70);
    expect((await f.read()).targets[0]!.history).toHaveLength(1);
  });
  it("rechecks operator enrollment before dispatch and rejects malformed snapshots", async () => {
    const f = fixture();
    await f.save();
    f.unenroll();
    await f.sample();
    expect(f.collector).not.toHaveBeenCalled();
    expect((await f.read()).targets[0]!.access.status).toBe("access-denied");
    const g = fixture();
    await g.save();
    g.collector.mockResolvedValue({
      ...snapshot(g.store.now()),
      rawOutput: "secret",
    } as ServerMonitorCollectionResult);
    await g.sample();
    expect((await g.read()).targets[0]!.history).toHaveLength(0);
    expect((await g.read()).targets[0]!.lastError).not.toContain("secret");
    expect(
      ServerMonitoringDocumentSchema.safeParse(g.store.documents.get("ws_monitor")).success,
    ).toBe(true);
  });
});
