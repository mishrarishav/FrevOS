import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import {
  ManagedServiceSchema,
  ServiceInventorySchema,
  ServicePolicySchema,
  SoftwareInventorySchema,
  SoftwareJobSchema,
  SoftwareObservationSchema,
  SoftwareRequestSchema,
  softwareJobBinding,
} from "../src/software-management.js";

const service = ManagedServiceSchema.parse({
  id: "a".repeat(64),
  definitionSha256: "b".repeat(64),
  name: "FixtureService",
  displayName: "Fixture service",
  manager: "windows-scm",
  status: "stopped",
  startupType: "Manual",
  canStart: true,
  canStop: true,
  protected: false,
});
it("limits Android snapshots to current-user packages and the two known connector-owned services", () => {
  const sampler = {
    ...service,
    name: "org.devsetu.connector.HealthSamplingService",
    manager: "android-connector",
  };
  const snapshot = {
    version: 1,
    platform: "android",
    observedAt: at,
    status: "ready",
    truncated: false,
    items: [sampler],
  };
  expect(ServiceInventorySchema.safeParse(snapshot).success).toBe(true);
  const connection = {
    ...sampler,
    name: "org.devsetu.connector.MonitorService",
    protected: true,
    canStart: false,
    canStop: false,
  };
  expect(ServiceInventorySchema.safeParse({ ...snapshot, items: [connection] }).success).toBe(true);
  for (const row of [
    { ...sampler, name: "another.app.Service" },
    { ...connection, protected: false },
    { ...connection, canStop: true },
    { ...connection, canStart: true },
    service,
  ])
    expect(ServiceInventorySchema.safeParse({ ...snapshot, items: [row] }).success).toBe(false);
  expect(ServiceInventorySchema.safeParse({ ...snapshot, platform: "win32" }).success).toBe(false);
  expect(ServiceInventorySchema.safeParse({ ...snapshot, platform: "linux" }).success).toBe(false);
  expect(
    ServiceInventorySchema.safeParse({
      ...snapshot,
      platform: "linux",
      items: [{ ...service, manager: "systemd-system" }],
    }).success,
  ).toBe(true);
  expect(
    ServiceInventorySchema.safeParse({
      ...snapshot,
      platform: "linux",
      items: [{ ...service, manager: "systemd-user" }],
    }).success,
  ).toBe(true);
  const packages = {
    ...snapshot,
    scope: "android-current-user",
    items: [{ id: "b".repeat(64), name: "Fixture app", source: "android-user" }],
  };
  expect(SoftwareInventorySchema.safeParse(packages).success).toBe(true);
  expect(
    SoftwareInventorySchema.safeParse({
      ...packages,
      items: [{ ...packages.items[0], source: "android-system" }],
    }).success,
  ).toBe(true);
  expect(
    SoftwareInventorySchema.safeParse({ ...packages, scope: "windows-machine-and-connector-user" })
      .success,
  ).toBe(false);
  expect(
    SoftwareInventorySchema.safeParse({
      ...packages,
      items: [{ ...packages.items[0], source: "registry" }],
    }).success,
  ).toBe(false);
  expect(SoftwareInventorySchema.safeParse({ ...packages, platform: "win32" }).success).toBe(false);
});
const at = new Date().toISOString(),
  deviceId = `fc_${"c".repeat(32)}`,
  workspaceId = "ws_fixture";
it("keeps service snapshots bounded and distinct from a failed or duplicated scan", () => {
  const snapshot = {
    version: 1,
    platform: "win32",
    observedAt: at,
    status: "ready",
    truncated: false,
    items: [service],
  };
  expect(ServiceInventorySchema.parse(snapshot).items).toHaveLength(1);
  expect(ServiceInventorySchema.safeParse({ ...snapshot, items: [service, service] }).success).toBe(
    false,
  );
  expect(ServiceInventorySchema.safeParse({ ...snapshot, status: "unavailable" }).success).toBe(
    false,
  );
  expect(
    ServiceInventorySchema.safeParse({ ...snapshot, status: "unavailable", items: [] }).success,
  ).toBe(true);
  expect(ServiceInventorySchema.safeParse({ ...snapshot, items: [] }).success).toBe(true);
  expect(ManagedServiceSchema.safeParse({ ...service, command: "anything" }).success).toBe(false);
  const policy = {
    version: 1,
    workspaceId,
    deviceId,
    revision: 1,
    rules: [{ id: service.id, definitionSha256: service.definitionSha256, enabled: true }],
  };
  expect(ServicePolicySchema.parse(policy).rules).toHaveLength(1);
  expect(
    ServicePolicySchema.safeParse({ ...policy, rules: [...policy.rules, ...policy.rules] }).success,
  ).toBe(false);
  expect(ServicePolicySchema.safeParse({ ...policy, rules: [] }).success).toBe(true);
});
it("binds exact service identity and policy revision without admitting commands or caller-selected names", () => {
  const request = {
    version: 1,
    requestId: `sw_${"d".repeat(32)}`,
    deviceId,
    operation: "start-service",
    serviceId: service.id,
    policyRevision: 1,
  };
  expect(SoftwareRequestSchema.safeParse(request).success).toBe(true);
  expect(SoftwareRequestSchema.safeParse({ ...request, serviceName: "caller-name" }).success).toBe(
    false,
  );
  expect(SoftwareRequestSchema.safeParse({ ...request, policyRevision: 0 }).success).toBe(false);
  const job = SoftwareJobSchema.parse({
    version: 1,
    workspaceId,
    actor: "usr_fixture",
    request,
    service,
    digest: "e".repeat(64),
    createdAt: at,
    expiresAt: new Date(Date.parse(at) + 300000).toISOString(),
    status: "approved",
  });
  const binding = softwareJobBinding(job);
  expect(JSON.parse(binding)[1]).toBe("software.service.job.v1");
  expect(
    softwareJobBinding({ ...job, service: { ...service, definitionSha256: "f".repeat(64) } }),
  ).not.toBe(binding);
  const ordinary = SoftwareJobSchema.parse({
    ...job,
    service: undefined,
    request: { version: 1, requestId: request.requestId, deviceId, operation: "inventory" },
  });
  expect(JSON.parse(softwareJobBinding(ordinary))[1]).toBe("software.job.v1");
  const pkg = {
    id: "fixture",
    name: "Fixture",
    version: "1",
    publisher: "Fixture",
    enabled: true,
    platform: "win32",
    recipe: "demo-api",
    programSha256: "a".repeat(64),
  };
  const install = SoftwareJobSchema.parse({
    ...ordinary,
    package: pkg,
    request: {
      ...ordinary.request,
      operation: "install",
      packageId: pkg.id,
      packageDigest: createHash("sha256").update(JSON.stringify(pkg)).digest("hex"),
    },
  });
  expect(JSON.parse(softwareJobBinding(install))[5]).toEqual(pkg);
  const observation = {
    version: 1,
    platform: "win32",
    inventoryConsent: true,
    installConsent: false,
    services: [],
    serviceManagement: { version: 1, controlConsent: false },
    programSha256: "a".repeat(64),
  };
  expect(SoftwareObservationSchema.parse(observation).serviceManagement?.controlConsent).toBe(
    false,
  );
  expect(
    SoftwareObservationSchema.safeParse({
      ...observation,
      serviceManagement: { version: 1, controlConsent: "yes" },
    }).success,
  ).toBe(false);
});
