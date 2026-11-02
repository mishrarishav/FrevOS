import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { SoftwareJobSchema, softwareJobBinding } from "@frevos/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { SoftwareManagement } from "../src/software-management.js";

const require = createRequire(import.meta.url),
  protocol = require("../../../deployment/servix/SoftwareProtocol.cjs");
const hash = (s: string) => createHash("sha256").update(s).digest("hex"),
  workspace = "ws_test",
  admin = "usr_admin",
  alice = "usr_alice",
  bob = "usr_bob";
const a = "fc_" + "a".repeat(32),
  b = "fc_" + "b".repeat(32),
  program = "f".repeat(64);
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !root.includes("frevos-software-"))
      throw Error("fixture cleanup scope");
    await rm(root, { recursive: true, force: true });
  }
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "frevos-software-"));
  roots.push(root);
  let time = Date.parse("2026-11-03T00:00:00.000Z");
  const administrators = new Set([admin]);
  const devices = [
    {
      deviceId: a,
      userId: alice,
      workspaceId: workspace,
      name: "Device A",
      online: true,
      status: "active",
      workspaceAuthorized: true,
    },
    {
      deviceId: b,
      userId: bob,
      workspaceId: workspace,
      name: "Device B",
      online: true,
      status: "active",
      workspaceAuthorized: true,
    },
  ];
  const registry = {
    discoveryDevices: async (actor: string) =>
      devices.filter((d) => administrators.has(actor) || d.userId === actor),
    checkCredential: async (value: string) => {
      const d = devices.find((d) => d.userId === value);
      if (!d) throw Error("credential denied");
      return d;
    },
  };
  const store = new SoftwareManagement(
    root,
    workspace,
    registry,
    async (actor) => administrators.has(actor),
    () => new Date(time),
    program,
  );
  const observation = {
    version: 1,
    platform: "win32",
    inventoryConsent: true,
    installConsent: true,
    programSha256: program,
    services: [],
  };
  const observe = async (extra = {}) => store.observe(alice, { ...observation, ...extra });
  await store.saveCatalog(admin, workspace, {
    version: 1,
    expectedRevision: 0,
    packages: [
      {
        id: "test-api",
        name: "Test API",
        version: "1",
        publisher: "Fixture",
        enabled: true,
        recipe: "demo-api",
        platform: "win32",
        programSha256: program,
      },
      {
        id: "test-msi",
        name: "Test installer",
        version: "1.2",
        publisher: "Fixture",
        enabled: true,
        recipe: "windows-msi",
        platform: "win32",
        asset: { url: "https://example.com/package.msi", sha256: "d".repeat(64), bytes: 100 },
      },
    ],
  });
  await observe();
  const install = async (actor = alice, id = "1", packageId = "test-api") =>
    store.request(actor, workspace, {
      version: 1,
      requestId: "sw_" + id.repeat(32),
      deviceId: a,
      operation: "install",
      packageId,
      packageDigest: (await store.state(actor, workspace, a)).packageDigests[packageId],
      ...(packageId === "test-api" ? { port: 5180, lifetimeSeconds: 900 } : {}),
    });
  const approve = async (job: Awaited<ReturnType<typeof install>>) =>
    store.decide(admin, workspace, {
      requestId: job.request.requestId,
      digest: job.digest,
      decision: "approve",
    });
  return {
    root,
    store,
    devices,
    administrators,
    observation,
    observe,
    install,
    approve,
    advance: (ms: number) => {
      time += ms;
    },
    now: () => time,
  };
}
describe("workspace and artifact bound approved software", () => {
  it("handles stale request, busy device and semantic idempotency without dispatching new work", async () => {
    const f = await fixture(),
      job = await f.install(admin);
    await expect(f.store.request(admin, workspace, { ...job.request, port: 5181 })).rejects.toThrow(
      "idempotency-conflict",
    );
    await expect(
      f.store.request(alice, workspace, {
        version: 1,
        requestId: "sw_" + "6".repeat(32),
        deviceId: a,
        operation: "inventory",
      }),
    ).rejects.toThrow("device-busy");
    const g = await fixture();
    await g.store.request(alice, workspace, {
      version: 1,
      requestId: "sw_" + "7".repeat(32),
      deviceId: a,
      operation: "inventory",
    });
    g.advance(3600001);
    await g.observe();
    expect((await g.store.claim(alice)).job).toBeNull();
    expect((await g.store.state(alice, workspace, a)).jobs[0]?.status).toBe("expired");
    g.advance(21000);
    expect((await g.store.claim(alice)).job).toBeNull();
  });
  it("rechecks catalogue and completion payload immediately before execution and persistence", async () => {
    const f = await fixture(),
      job = await f.install(admin, "8", "test-msi");
    await f.store.claim(alice);
    const catalog = await f.store.catalog();
    await f.store.saveCatalog(admin, workspace, {
      version: 1,
      expectedRevision: catalog.revision,
      packages: catalog.packages.map((p) => (p.id === "test-msi" ? { ...p, enabled: false } : p)),
    });
    await expect(
      f.store.authorize(alice, { requestId: job.request.requestId, digest: job.digest }),
    ).rejects.toThrow("execution-denied");
    await expect(
      f.store.complete(alice, {
        requestId: job.request.requestId,
        digest: "0".repeat(64),
        result: "installed",
      }),
    ).rejects.toThrow("completion-denied");
    const inv = {
      version: 1,
      observedAt: new Date(f.now()).toISOString(),
      platform: "win32",
      scope: "windows-machine-and-connector-user",
      status: "ready",
      truncated: false,
      items: [],
    };
    await expect(
      f.store.complete(alice, {
        requestId: job.request.requestId,
        digest: job.digest,
        result: "installed",
        inventory: inv,
      }),
    ).rejects.toThrow("inventory-denied");
    await f.store.complete(alice, {
      requestId: job.request.requestId,
      digest: job.digest,
      result: "installed",
    });
    expect((await f.store.state(admin, workspace, a)).jobs[0]?.result).toBe("installed");
    const g = await fixture(),
      pending = await g.install();
    const cat = await g.store.catalog();
    await g.store.saveCatalog(admin, workspace, {
      version: 1,
      expectedRevision: cat.revision,
      packages: cat.packages.filter((p) => p.id !== "test-api"),
    });
    await expect(g.approve(pending)).rejects.toThrow("catalog-changed");
  });
  it("denies wrong-workspace worker, unclaimed and missing inventory results and corrupt storage", async () => {
    const f = await fixture();
    f.devices[0]!.workspaceId = "ws_wrong";
    await expect(f.store.identity(alice)).rejects.toThrow("workspace-denied");
    f.devices[0]!.workspaceId = workspace;
    await expect(
      f.store.decide(admin, workspace, {
        requestId: "sw_" + "9".repeat(32),
        digest: "0".repeat(64),
        decision: "approve",
      }),
    ).rejects.toThrow("request-not-found");
    const request = {
        version: 1,
        requestId: "sw_" + "6".repeat(32),
        deviceId: a,
        operation: "inventory",
      },
      job = await f.store.request(alice, workspace, request);
    await f.store.claim(alice);
    await expect(
      f.store.complete(alice, {
        requestId: request.requestId,
        digest: job.digest,
        result: "inventory-updated",
      }),
    ).rejects.toThrow("inventory-denied");
    await f.store.complete(alice, {
      requestId: request.requestId,
      digest: job.digest,
      result: "failed",
    });
    await writeFile(join(f.root, "device-" + a + ".json"), Buffer.alloc(40000));
    await expect(f.store.state(alice, workspace, a)).rejects.toThrow("storage-unavailable");
  });
  it("keeps ordinary users scoped to their devices and reserves catalogue edits/decisions for administrators", async () => {
    const f = await fixture();
    expect((await f.store.state(alice, workspace, a)).administrator).toBe(false);
    await expect(f.store.state(bob, workspace, a)).rejects.toThrow("software-device-denied");
    await expect(f.store.state(admin, "ws_other", a)).rejects.toThrow("software-workspace-denied");
    await expect(
      f.store.saveCatalog(alice, workspace, { version: 1, expectedRevision: 1, packages: [] }),
    ).rejects.toThrow("administrator-required");
    const job = await f.install();
    expect(job.status).toBe("pending-approval");
    expect((await f.store.claim(alice)).job).toBeNull();
    await expect(
      f.store.decide(alice, workspace, {
        requestId: job.request.requestId,
        digest: job.digest,
        decision: "approve",
      }),
    ).rejects.toThrow("administrator-required");
    await expect(f.store.state(alice, workspace, b)).rejects.toThrow();
    f.devices[0]!.workspaceAuthorized = false;
    await expect(f.store.state(admin, workspace, a)).rejects.toThrow("device-denied");
  });
  it("uses one explicit admin Install action, matching native binding, and a single claim under concurrency", async () => {
    const f = await fixture(),
      job = await f.install(admin);
    expect(job.status).toBe("approved");
    expect(job.approval?.actor).toBe(admin);
    expect(job.digest).toBe(hash(softwareJobBinding(job)));
    expect(job.digest).toBe(protocol.sha(protocol.binding(job)));
    const results = await Promise.all([f.store.claim(alice), f.store.claim(alice)]);
    expect(results.filter((r) => r.job)).toHaveLength(1);
    const claimed = results.find((r) => r.job)!.job!;
    expect(claimed.approval?.consumedAt).toBeDefined();
    expect(protocol.validateJob(claimed, { workspaceId: workspace, deviceId: a }, f.now())).toEqual(
      claimed,
    );
    expect(
      await f.store.authorize(alice, {
        requestId: claimed.request.requestId,
        digest: claimed.digest,
      }),
    ).toEqual({ authorized: true });
    expect((await f.store.state(alice, workspace, a)).jobs).toHaveLength(0);
    expect((await f.store.state(admin, workspace, a)).jobs).toHaveLength(1);
  });
  it("approves ordinary requests exactly and rejects repeat decisions and changed catalogue artifacts", async () => {
    const f = await fixture(),
      job = await f.install();
    await expect(
      f.store.decide(admin, workspace, {
        requestId: job.request.requestId,
        digest: "0".repeat(64),
        decision: "approve",
      }),
    ).rejects.toThrow("approval-stale");
    await f.approve(job);
    await expect(f.approve(job)).rejects.toThrow("approval-stale");
    const current = await f.store.catalog();
    await f.store.saveCatalog(admin, workspace, {
      version: 1,
      expectedRevision: current.revision,
      packages: current.packages.map((p) => (p.id === "test-api" ? { ...p, version: "2" } : p)),
    });
    expect((await f.store.claim(alice)).job).toBeNull();
    expect((await f.store.state(admin, workspace, a)).jobs[0]?.status).toBe("failed");
    await expect(
      f.store.saveCatalog(admin, workspace, { version: 1, expectedRevision: 1, packages: [] }),
    ).rejects.toThrow("catalog-changed");
  });
  it("fails closed for consent changes, stale telemetry, offline and revoked devices", async () => {
    const f = await fixture();
    f.devices[0]!.online = false;
    await expect(f.install()).rejects.toThrow("device-offline");
    f.devices[0]!.online = true;
    f.advance(21000);
    await expect(f.install()).rejects.toThrow("connector-update-required");
    await f.observe({ installConsent: false });
    await expect(f.install()).rejects.toThrow("local-consent-required");
    await f.observe();
    const job = await f.install(admin);
    await f.observe({ installConsent: false });
    expect((await f.store.claim(alice)).job).toBeNull();
    await f.observe();
    await f.store.claim(alice);
    f.administrators.delete(admin);
    await expect(
      f.store.authorize(alice, { requestId: job.request.requestId, digest: job.digest }),
    ).rejects.toThrow();
    f.devices[0]!.status = "revoked";
    await expect(f.store.claim(alice)).rejects.toThrow();
  });
  it("rejects expired approval, mismatched native jobs and unexpected package parameters", async () => {
    const f = await fixture(),
      job = await f.install(admin);
    f.advance(600001);
    await f.observe();
    expect((await f.store.claim(alice)).job).toBeNull();
    expect((await f.store.state(admin, workspace, a)).jobs[0]?.status).toBe("expired");
    expect((await f.install(admin, "a")).status).toBe("approved");
    const claimed = {
      ...job,
      status: "working",
      approval: { ...job.approval, consumedAt: job.createdAt },
    };
    expect(() =>
      protocol.validateJob(claimed, { workspaceId: workspace, deviceId: b }, f.now()),
    ).toThrow();
    const g = await fixture(),
      catalog = await g.store.state(admin, workspace, a);
    await expect(
      g.store.request(admin, workspace, {
        version: 1,
        requestId: "sw_" + "2".repeat(32),
        deviceId: a,
        operation: "install",
        packageId: "test-msi",
        packageDigest: catalog.packageDigests["test-msi"],
        port: 5000,
      }),
    ).rejects.toThrow("parameters-denied");
    await expect(
      g.store.request(admin, workspace, {
        version: 1,
        requestId: "sw_" + "3".repeat(32),
        deviceId: a,
        operation: "install",
        packageId: "test-msi",
        packageDigest: "e".repeat(64),
      }),
    ).rejects.toThrow("package-unavailable");
  });
  it("pins idempotency and audit before issuing actionable jobs", async () => {
    const f = await fixture(),
      job = await f.install();
    expect(await f.install()).toEqual(job);
    await expect(
      f.store.request(alice, workspace, { ...job.request, operation: "inventory" }),
    ).rejects.toThrow();
    const current = await f.store.catalog();
    await expect(
      f.store.saveCatalog(admin, workspace, {
        version: 1,
        expectedRevision: current.revision,
        packages: current.packages.map((p) =>
          p.recipe === "demo-api" ? { ...p, programSha256: "0".repeat(64) } : p,
        ),
      }),
    ).rejects.toThrow("bundled-program-differs");
    await rename(join(f.root, "audit"), join(f.root, "audit-backup"));
    await writeFile(join(f.root, "audit"), "blocked");
    await expect(
      f.store.request(alice, workspace, {
        version: 1,
        requestId: "sw_" + "2".repeat(32),
        deviceId: a,
        operation: "inventory",
      }),
    ).rejects.toThrow();
    expect(
      (await readdir(f.root)).filter((n) => n === "sw_" + "2".repeat(32) + ".json"),
    ).toHaveLength(0);
  });
  it("records inventory snapshots with conditional transfer and never treats unavailable as a complete empty machine", async () => {
    const f = await fixture(),
      request = {
        version: 1,
        requestId: "sw_" + "4".repeat(32),
        deviceId: a,
        operation: "inventory",
      };
    const job = await f.store.request(alice, workspace, request);
    await f.store.claim(alice);
    const inventory = {
      version: 1,
      observedAt: new Date(f.now()).toISOString(),
      platform: "win32",
      scope: "windows-machine-and-connector-user",
      status: "unavailable",
      truncated: false,
      items: [],
    };
    await expect(
      f.store.complete(bob, {
        requestId: request.requestId,
        digest: job.digest,
        result: "inventory-updated",
        inventory,
      }),
    ).rejects.toThrow();
    await f.store.complete(alice, {
      requestId: request.requestId,
      digest: job.digest,
      result: "inventory-updated",
      inventory,
    });
    expect((await f.store.state(alice, workspace, a)).device.inventory).toBeNull();
    expect((await f.store.state(alice, workspace, a)).device.scan?.status).toBe("unavailable");
    const conditional = await f.store.state(alice, workspace, a, inventory.observedAt);
    expect(conditional.device.inventory).toBeNull();
    expect(conditional.device.inventoryObservedAt).toBeNull();
    expect(
      await f.store.complete(alice, {
        requestId: request.requestId,
        digest: job.digest,
        result: "inventory-updated",
      }),
    ).toEqual({ completed: true });
    await expect(
      f.store.complete(alice, {
        requestId: request.requestId,
        digest: job.digest,
        result: "installed",
      }),
    ).rejects.toThrow("completion-conflict");
  });
  it("retains the last successful inventory when a later scan is unavailable", async () => {
    const f = await fixture();
    const scan = async (id: string, status: "ready" | "unavailable") => {
      const job = await f.store.request(alice, workspace, {
        version: 1,
        requestId: "sw_" + id.repeat(32),
        deviceId: a,
        operation: "inventory",
      });
      await f.store.claim(alice);
      await f.store.complete(alice, {
        requestId: job.request.requestId,
        digest: job.digest,
        result: "inventory-updated",
        inventory: {
          version: 1,
          observedAt: new Date(f.now()).toISOString(),
          platform: "win32",
          scope: "windows-machine-and-connector-user",
          status,
          truncated: false,
          items:
            status === "ready"
              ? [{ id: "a".repeat(64), name: "Known registered program", source: "registry" }]
              : [],
        },
      });
    };
    await scan("a", "ready");
    const first = await f.store.state(alice, workspace, a);
    f.advance(1000);
    await scan("b", "unavailable");
    const second = await f.store.state(alice, workspace, a);
    expect(second.device.inventory).toEqual(first.device.inventory);
    expect(second.device.scan?.status).toBe("unavailable");
    expect(
      (await f.store.state(alice, workspace, a, first.device.inventoryObservedAt!)).device
        .inventory,
    ).toBeNull();
  });
  it("exposes only a fresh owned approved demo to the explicit software preview provider", async () => {
    const f = await fixture();
    await expect(f.store.connectorIdentity(alice)).rejects.toThrow();
    const job = await f.install(admin),
      claimed = (await f.store.claim(alice)).job!;
    await f.store.complete(alice, {
      requestId: job.request.requestId,
      digest: job.digest,
      result: "demo-started",
    });
    const service = {
      id: "test-api",
      jobId: job.request.requestId,
      digest: job.digest,
      port: 5180,
      expiresAt: new Date(f.now() + 900000).toISOString(),
    };
    await f.observe({ services: [service] });
    expect(
      (await f.store.previewTarget(admin, workspace, a, "test-api")).snapshot.fingerprint,
    ).toBe(job.digest);
    expect((await f.store.connectorIdentity(alice)).profileId).toBe("software-test-api");
    expect(claimed.approval?.artifactSha256).toBe(program);
    await expect(f.store.previewTarget(bob, workspace, a, "test-api")).rejects.toThrow();
    await expect(f.observe({ services: [{ ...service, port: 5181 }] })).rejects.toThrow(
      "demo-observation-denied",
    );
    await expect(f.observe({ services: [service], installConsent: false })).rejects.toThrow(
      "consent-required",
    );
    f.advance(21000);
    await expect(f.store.previewTarget(admin, workspace, a, "test-api")).rejects.toThrow(
      "preview-unavailable",
    );
    await expect(
      f.observe({
        services: [{ ...service, expiresAt: new Date(f.now() + 9000000).toISOString() }],
      }),
    ).rejects.toThrow();
  });
  it("does not repeat an interrupted installer and validates installer results", async () => {
    const f = await fixture(),
      job = await f.install(admin, "5", "test-msi");
    await f.store.claim(alice);
    await expect(
      f.store.complete(alice, {
        requestId: job.request.requestId,
        digest: job.digest,
        result: "demo-started",
      }),
    ).rejects.toThrow("result-denied");
    await f.store.complete(alice, {
      requestId: job.request.requestId,
      digest: job.digest,
      result: "interrupted",
    });
    expect((await f.store.state(admin, workspace, a)).jobs[0]?.status).toBe("recovery-required");
    expect((await f.store.claim(alice)).job).toBeNull();
    expect((await f.store.request(admin, workspace, job.request)).status).toBe("recovery-required");
    const stored = SoftwareJobSchema.parse(
      JSON.parse(await readFile(join(f.root, job.request.requestId + ".json"), "utf8")),
    );
    stored.digest = "0".repeat(64);
    stored.status = "approved";
    await writeFile(join(f.root, job.request.requestId + ".json"), JSON.stringify(stored));
    await expect(f.store.claim(alice)).rejects.toThrow("integrity-denied");
  });
});
