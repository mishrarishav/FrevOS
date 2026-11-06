import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  ManagedServiceSchema,
  ServiceInventorySchema,
  SoftwareInventorySchema,
} from "@frevos/contracts";
import { afterEach, expect, it } from "vitest";
import { SoftwareManagement } from "../src/software-management.js";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !root.includes("android-software-"))
      throw Error("fixture cleanup");
    await rm(root, { recursive: true, force: true });
  }
});
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const workspace = "ws_android",
  admin = "usr_admin",
  owner = "usr_phone",
  deviceId = "fc_" + "a".repeat(32);
const service = ManagedServiceSchema.parse({
  id: sha("android-connector:org.devsetu.connector.HealthSamplingService"),
  name: "org.devsetu.connector.HealthSamplingService",
  displayName: "DevSetu health sampling",
  manager: "android-connector",
  definitionSha256: sha("signed-package-v3"),
  status: "running",
  startupType: "While connector runs",
  canStart: true,
  canStop: true,
  protected: false,
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "android-software-"));
  roots.push(root);
  const now = new Date();
  const device = {
    deviceId,
    userId: owner,
    workspaceId: workspace,
    name: "Fixture Android",
    online: true,
    status: "active",
    workspaceAuthorized: true,
    platform: "android" as const,
  };
  const store = new SoftwareManagement(
    root,
    workspace,
    {
      discoveryDevices: async (actor) => ([admin, owner].includes(actor) ? [device] : []),
      checkCredential: async (credential) => {
        if (credential !== "fixture-phone") throw Error("credential-denied");
        return device;
      },
    },
    async (actor) => actor === admin,
    () => now,
  );
  const services = ServiceInventorySchema.parse({
    version: 1,
    platform: "android",
    observedAt: now.toISOString(),
    status: "ready",
    truncated: false,
    items: [service],
  });
  const observation = {
    version: 1,
    platform: "android",
    inventoryConsent: true,
    installConsent: false,
    programSha256: sha("signed-apk"),
    services: [],
    serviceManagement: { version: 1, controlConsent: true },
    serviceInventory: services,
  };
  await store.observe("fixture-phone", observation);
  return { store, device, now, services, observation };
}
it("runs Android package inventory through the credential-bound queue without enabling desktop installs", async () => {
  const f = await fixture();
  expect(await f.store.initialInventory("fixture-phone")).toEqual({ scheduled: true });
  const job = (await f.store.claim("fixture-phone")).job!;
  expect(job.request.operation).toBe("inventory");
  const inventory = SoftwareInventorySchema.parse({
    version: 1,
    platform: "android",
    scope: "android-current-user",
    observedAt: f.now.toISOString(),
    status: "ready",
    truncated: false,
    items: [
      {
        id: sha("fixture.app"),
        name: "Fixture app",
        version: "1",
        publisher: "fixture.app",
        source: "android-user",
      },
    ],
  });
  await f.store.complete("fixture-phone", {
    requestId: job.request.requestId,
    digest: job.digest,
    result: "inventory-updated",
    inventory,
  });
  const state = await f.store.state(owner, workspace, deviceId);
  expect(state.device.inventory?.items).toHaveLength(1);
  expect(state.device.capability?.installConsent).toBe(false);
  expect(await f.store.initialInventory("fixture-phone")).toEqual({ scheduled: false });
  await expect(f.store.state("usr_other", workspace, deviceId)).rejects.toThrow("device-denied");
  await expect(
    f.store.observe("fixture-phone", { ...f.observation, installConsent: true }),
  ).rejects.toThrow("android-scope-denied");
  await expect(
    f.store.observe("fixture-phone", {
      ...f.observation,
      platform: "win32",
      serviceInventory: undefined,
    }),
  ).rejects.toThrow("platform-denied");
  await expect(
    f.store.observe("fixture-phone", {
      ...f.observation,
      serviceInventory: { ...f.services, items: [{ ...service, name: "third.party.Service" }] },
    }),
  ).rejects.toThrow();
});
it("requires Android local consent/admin/exact signed definition and completes only typed own-service operations", async () => {
  const f = await fixture();
  const rule = {
    version: 1,
    deviceId,
    expectedRevision: 0,
    rule: { id: service.id, definitionSha256: service.definitionSha256, enabled: true },
  };
  await expect(f.store.saveServicePolicy(owner, workspace, rule)).rejects.toThrow(
    "administrator-required",
  );
  await f.store.saveServicePolicy(admin, workspace, rule);
  const input = {
    version: 1,
    requestId: "sw_" + "b".repeat(32),
    deviceId,
    operation: "stop-service",
    serviceId: service.id,
    policyRevision: 1,
  };
  await expect(f.store.request(owner, workspace, input)).rejects.toThrow("administrator-required");
  await f.store.request(admin, workspace, input);
  const job = (await f.store.claim("fixture-phone")).job!,
    auth = { requestId: job.request.requestId, digest: job.digest };
  expect(await f.store.authorize("fixture-phone", auth)).toEqual({ authorized: true });
  await f.store.observe("fixture-phone", {
    ...f.observation,
    serviceManagement: { version: 1, controlConsent: false },
  });
  await expect(f.store.authorize("fixture-phone", auth)).rejects.toThrow(
    "service-execution-denied",
  );
  await f.store.observe("fixture-phone", {
    ...f.observation,
    serviceInventory: {
      ...f.services,
      items: [{ ...service, definitionSha256: sha("updated-signed-app") }],
    },
  });
  await expect(f.store.authorize("fixture-phone", auth)).rejects.toThrow(
    "service-execution-denied",
  );
  await f.store.observe("fixture-phone", f.observation);
  await f.store.complete("fixture-phone", {
    ...auth,
    result: "service-stopped",
    serviceInventory: { ...f.services, items: [{ ...service, status: "stopped" }] },
  });
  const state = await f.store.state(admin, workspace, deviceId);
  expect(state.jobs[0]?.status).toBe("succeeded");
  expect(state.device.serviceInventory?.items[0]?.status).toBe("stopped");
  expect((await f.store.claim("fixture-phone")).job).toBeNull();
});
