import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { type ManagedService, ServiceInventorySchema, softwareJobBinding } from "@frevos/contracts";
import { afterEach, expect, it } from "vitest";
import { SoftwareManagement } from "../src/software-management.js";

const protocol = createRequire(import.meta.url)("../../../deployment/servix/SoftwareProtocol.cjs");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const workspace = "ws_services",
  admin = "usr_admin",
  owner = "usr_owner",
  outsider = "usr_other",
  deviceId = `fc_${"a".repeat(32)}`;
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !root.includes("frevos-services-"))
      throw Error("cleanup scope");
    await rm(root, { recursive: true, force: true });
  }
});
const service: ManagedService = {
  id: sha("fixture-service"),
  name: "FixtureService",
  displayName: "Fixture service",
  manager: "windows-scm",
  definitionSha256: sha("fixture-definition"),
  status: "stopped",
  startupType: "Manual",
  canStart: true,
  canStop: true,
  protected: false,
};
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "frevos-services-"));
  roots.push(root);
  let instant = Date.parse("2026-11-06T00:00:00.000Z");
  const admins = new Set([admin]);
  const device = {
    deviceId,
    userId: owner,
    workspaceId: workspace,
    name: "Fixture computer",
    online: true,
    status: "active",
    workspaceAuthorized: true,
  };
  const store = new SoftwareManagement(
    root,
    workspace,
    {
      discoveryDevices: async (actor) => ([owner, admin].includes(actor) ? [device] : []),
      checkCredential: async (c) => {
        if (c !== "fixture-credential") throw Error("credential-denied");
        return device;
      },
    },
    async (actor) => admins.has(actor),
    () => new Date(instant),
  );
  const snapshot = (items = [service], status: "ready" | "partial" | "unavailable" = "ready") =>
    ServiceInventorySchema.parse({
      version: 1,
      platform: "win32",
      observedAt: new Date(instant).toISOString(),
      status,
      truncated: false,
      items,
    });
  const observe = (extra = {}) =>
    store.observe("fixture-credential", {
      version: 1,
      platform: "win32",
      inventoryConsent: true,
      installConsent: false,
      programSha256: "a".repeat(64),
      services: [],
      serviceManagement: { version: 1, controlConsent: true },
      ...extra,
    });
  await observe({ serviceInventory: snapshot() });
  const rule = (enabled = true, definitionSha256 = service.definitionSha256, actor = admin) =>
    store.saveServicePolicy(actor, workspace, {
      version: 1,
      deviceId,
      expectedRevision: 0,
      rule: { id: service.id, definitionSha256, enabled },
    });
  const request = (
    id = "1",
    actor = admin,
    operation: "start-service" | "stop-service" = "start-service",
    policyRevision = 1,
  ) =>
    store.request(actor, workspace, {
      version: 1,
      deviceId,
      requestId: `sw_${id.repeat(32)}`,
      operation,
      serviceId: service.id,
      policyRevision,
    });
  return {
    store,
    root,
    device,
    admins,
    observe,
    snapshot,
    rule,
    request,
    advance: (ms: number) => {
      instant += ms;
    },
    now: () => instant,
  };
}
it("retains a bounded services snapshot, independent cursors and failures without copying command lines", async () => {
  const f = await fixture();
  const first = await f.store.state(owner, workspace, deviceId);
  expect(first.device.serviceInventory?.items).toEqual([service]);
  const cached = await f.store.state(
    owner,
    workspace,
    deviceId,
    undefined,
    first.device.serviceInventoryObservedAt!,
  );
  expect(cached.device.serviceInventory).toBeNull();
  f.advance(1000);
  await f.observe({ serviceInventory: f.snapshot([], "unavailable") });
  const unavailable = await f.store.state(owner, workspace, deviceId);
  expect(unavailable.device.serviceInventory).toEqual(first.device.serviceInventory);
  expect(unavailable.device.serviceScan?.status).toBe("unavailable");
  expect(JSON.stringify(unavailable)).not.toContain("ExecStart");
  expect(
    ServiceInventorySchema.safeParse({ ...f.snapshot(), items: [service, service] }).success,
  ).toBe(false);
  await expect(f.store.state(outsider, workspace, deviceId)).rejects.toThrow("device-denied");
  await expect(f.store.state(admin, "ws_other", deviceId)).rejects.toThrow("workspace-denied");
  await expect(f.store.state(admin, workspace, deviceId, undefined, "bad")).rejects.toThrow();
  await expect(
    f.observe({ inventoryConsent: false, serviceInventory: f.snapshot() }),
  ).rejects.toThrow("service-inventory-denied");
  await expect(
    f.observe({ serviceInventory: { ...f.snapshot(), platform: "linux" } }),
  ).rejects.toThrow("service-inventory-denied");
});
it("requires admin, one-time local service consent and exact per-device catalogue authority", async () => {
  const f = await fixture();
  await expect(f.request()).rejects.toThrow("service-unavailable");
  await expect(f.rule(true, service.definitionSha256, owner)).rejects.toThrow(
    "administrator-required",
  );
  await expect(f.rule(true, "b".repeat(64))).rejects.toThrow("service-unavailable");
  await f.rule();
  await expect(f.request("1", owner)).rejects.toThrow("administrator-required");
  await f.observe({ serviceManagement: { version: 1, controlConsent: false } });
  await expect(f.request()).rejects.toThrow("local-consent-required");
  await f.observe({ serviceInventory: f.snapshot([{ ...service, protected: true }]) });
  await expect(f.request()).rejects.toThrow("service-unavailable");
  await f.observe({ serviceInventory: f.snapshot([{ ...service, canStart: false }]) });
  await expect(f.request()).rejects.toThrow("os-permission-required");
  await f.observe({ serviceInventory: f.snapshot() });
  await expect(f.request("1", admin, "start-service", 2)).rejects.toThrow("service-unavailable");
  f.advance(90001);
  await f.observe();
  await expect(f.request()).rejects.toThrow("service-unavailable");
});
it("issues and consumes a single exact service approval, rechecks execution and accepts its typed result", async () => {
  const f = await fixture();
  await f.rule();
  const requested = await f.request();
  expect(await f.request()).toEqual(requested);
  expect(requested.package).toBeUndefined();
  expect(requested.approval?.action).toBe("software.service.v1");
  const job = (await f.store.claim("fixture-credential")).job!;
  expect(job.status).toBe("working");
  expect(job.approval?.consumedAt).toBeTruthy();
  expect(protocol.binding(job)).toBe(softwareJobBinding(job));
  expect(() =>
    protocol.validateJob(job, { workspaceId: workspace, deviceId }, f.now()),
  ).not.toThrow();
  expect(() =>
    protocol.validateJob(
      { ...job, request: { ...job.request, serviceId: sha("other") } },
      { workspaceId: workspace, deviceId },
      f.now(),
    ),
  ).toThrow();
  expect(() =>
    protocol.validateJob(
      job,
      { workspaceId: workspace, deviceId: `fc_${"b".repeat(32)}` },
      f.now(),
    ),
  ).toThrow();
  expect((await f.store.claim("fixture-credential")).job).toBeNull();
  const auth = { requestId: job.request.requestId, digest: job.digest };
  expect(await f.store.authorize("fixture-credential", auth)).toEqual({ authorized: true });
  await f.store.complete("fixture-credential", {
    ...auth,
    result: "service-started",
    serviceInventory: f.snapshot([{ ...service, status: "running" }]),
  });
  expect(
    await f.store.complete("fixture-credential", { ...auth, result: "service-started" }),
  ).toEqual({ completed: true });
  const state = await f.store.state(admin, workspace, deviceId);
  expect(state.jobs[0]?.status).toBe("succeeded");
  expect(state.device.serviceInventory?.items[0]?.status).toBe("running");
  expect(state.device.capability?.installConsent).toBe(false);
  await expect(f.store.authorize("fixture-credential", auth)).rejects.toThrow(
    "service-execution-denied",
  );
});
it.each(["role", "consent", "catalogue", "definition", "expiry"] as const)(
  "denies service execution when %s authority changes after claim",
  async (mode) => {
    const f = await fixture();
    await f.rule();
    const queued = await f.request();
    const job = (await f.store.claim("fixture-credential")).job!;
    if (mode === "role") f.admins.delete(admin);
    if (mode === "consent")
      await f.observe({ serviceManagement: { version: 1, controlConsent: false } });
    if (mode === "catalogue")
      await f.store.saveServicePolicy(admin, workspace, {
        version: 1,
        deviceId,
        expectedRevision: 1,
        rule: { id: service.id, definitionSha256: service.definitionSha256, enabled: false },
      });
    if (mode === "definition")
      await f.observe({
        serviceInventory: f.snapshot([{ ...service, definitionSha256: sha("changed") }]),
      });
    if (mode === "expiry") {
      f.advance(300001);
      await f.observe({ serviceInventory: f.snapshot() });
    }
    await expect(
      f.store.authorize("fixture-credential", {
        requestId: job.request.requestId,
        digest: job.digest,
      }),
    ).rejects.toThrow();
    expect(queued.approval?.consumedAt).toBeUndefined();
  },
);
it("declines a revoked policy before claim and fails closed on stored policy scope corruption", async () => {
  const f = await fixture();
  await f.rule();
  await f.request();
  await f.store.saveServicePolicy(admin, workspace, {
    version: 1,
    deviceId,
    expectedRevision: 1,
    rule: { id: service.id, definitionSha256: service.definitionSha256, enabled: false },
  });
  expect((await f.store.claim("fixture-credential")).job).toBeNull();
  expect((await f.store.state(admin, workspace, deviceId)).jobs[0]?.result).toBe("declined");
  const file = join(f.root, `service-policy-${deviceId}.json`),
    current = JSON.parse(await readFile(file, "utf8"));
  await writeFile(file, JSON.stringify({ ...current, workspaceId: "ws_other" }));
  await expect(f.store.state(admin, workspace, deviceId)).rejects.toThrow(
    "service-policy-scope-denied",
  );
});
