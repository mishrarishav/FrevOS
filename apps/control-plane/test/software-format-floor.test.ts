import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { ManagedService } from "@frevos/contracts";
import { afterEach, expect, it } from "vitest";
import { SoftwareManagement } from "../src/software-management.js";

const roots: string[] = [],
  workspace = "ws_format_fixture",
  owner = "usr_format_owner",
  admin = "usr_format_admin",
  credential = "synthetic-format-credential",
  deviceId = `fc_${"a".repeat(32)}`,
  now = "2026-11-06T00:00:00.000Z";
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const service: ManagedService = {
  id: sha("format-fixture-service"),
  name: "FormatFixtureService",
  displayName: "Format fixture service",
  manager: "windows-scm",
  definitionSha256: sha("format-fixture-definition"),
  status: "stopped",
  startupType: "Manual",
  protected: false,
  canStart: true,
  canStop: true,
};
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !root.includes("frevos-format-floor-"))
      throw Error("Fixture cleanup scope differs");
    await rm(root, { recursive: true, force: true });
  }
});
async function fixture(platform: "win32" | "android" = "win32") {
  const root = await mkdtemp(join(tmpdir(), "frevos-format-floor-"));
  roots.push(root);
  const device = {
    deviceId,
    userId: owner,
    workspaceId: workspace,
    name: "Format fixture computer",
    platform,
    online: true,
    status: "active",
    workspaceAuthorized: true,
  };
  const store = new SoftwareManagement(
    root,
    workspace,
    {
      discoveryDevices: async (actor) => ([owner, admin].includes(actor) ? [device] : []),
      checkCredential: async (value) => {
        if (value !== credential) throw Error("Fixture credential denied");
        return device;
      },
    },
    async (actor) => actor === admin,
    () => new Date(now),
  );
  const observation = {
    version: 1,
    platform,
    inventoryConsent: true,
    installConsent: false,
    programSha256: sha("fixture-program"),
    services: [],
  };
  const observe = (extra = {}) => store.observe(credential, { ...observation, ...extra });
  const snapshot = {
    version: 1,
    observedAt: now,
    platform: "win32",
    status: "ready",
    truncated: false,
    items: [service],
  };
  const read = (name: string) => readFile(join(root, name), "utf8");
  const marker = (value: unknown) =>
    writeFile(join(root, "data-format.json"), JSON.stringify(value));
  const floor = async () => JSON.parse(await read("data-format.json"));
  const policy = () =>
    store.saveServicePolicy(admin, workspace, {
      version: 1,
      deviceId,
      expectedRevision: 0,
      rule: { id: service.id, definitionSha256: service.definitionSha256, enabled: true },
    });
  return { root, store, observe, snapshot, read, marker, floor, policy };
}
it("leaves legacy observations on the old format and never lowers an already persisted floor", async () => {
  const f = await fixture();
  await f.observe();
  await expect(f.read("data-format.json")).rejects.toMatchObject({ code: "ENOENT" });
  await f.marker({ version: 1, softwareState: 1 });
  await f.observe();
  expect(await f.floor()).toEqual({ version: 1, softwareState: 1 });
  await f.observe({ serviceManagement: { version: 1, controlConsent: false } });
  expect(await f.floor()).toEqual({ version: 1, softwareState: 2 });
  await f.observe();
  expect(await f.floor()).toEqual({ version: 1, softwareState: 2 });
});
it.each(["service-management", "android"] as const)(
  "persists the canonical floor before a new %s device record can be committed",
  async (kind) => {
    const f = await fixture(kind === "android" ? "android" : "win32");
    // A real filesystem fault prevents committing the new-format device record.
    // The marker must already be durable even when that later record cannot replace a directory.
    await mkdir(join(f.root, `device-${deviceId}.json`));
    await expect(
      f.observe(
        kind === "service-management"
          ? { serviceManagement: { version: 1, controlConsent: false } }
          : {},
      ),
    ).rejects.toThrow();
    expect(await f.floor()).toEqual({ version: 1, softwareState: 2 });
  },
);
it.each(["services-inventory", "start-service"] as const)(
  "upgrades the format before persisting a %s job against retained typed service state",
  async (operation) => {
    const f = await fixture();
    await f.observe({
      serviceManagement: { version: 1, controlConsent: true },
      serviceInventory: f.snapshot,
    });
    if (operation === "start-service") await f.policy();
    // Simulate valid retained records created before the format marker was introduced.
    await f.marker({ version: 1, softwareState: 1 });
    const requestId = `sw_${"b".repeat(32)}`;
    const job = await f.store.request(admin, workspace, {
      version: 1,
      deviceId,
      requestId,
      operation,
      ...(operation === "start-service" ? { serviceId: service.id, policyRevision: 1 } : {}),
    });
    expect(await f.floor()).toEqual({ version: 1, softwareState: 2 });
    expect(JSON.parse(await f.read(`${requestId}.json`))).toEqual(job);
    expect(job.request.operation).toBe(operation);
  },
);
it("upgrades the format before adding a service catalogue policy to retained inventory", async () => {
  const f = await fixture();
  await f.observe({
    serviceManagement: { version: 1, controlConsent: true },
    serviceInventory: f.snapshot,
  });
  await f.marker({ version: 1, softwareState: 1 });
  const policy = await f.policy();
  expect(await f.floor()).toEqual({ version: 1, softwareState: 2 });
  expect(JSON.parse(await f.read(`service-policy-${deviceId}.json`))).toEqual(policy);
});
it.each([
  "{broken-json",
  '{"version":1,"softwareState":3}',
  '{"version":1,"softwareState":0}',
  '{"version":1,"softwareState":2,"unexpected":true}',
])(
  "rejects an unsupported floor before writing v2 observation or service inventory: %s",
  async (marker) => {
    const f = await fixture();
    await f.observe();
    const previous = await f.read(`device-${deviceId}.json`);
    await writeFile(join(f.root, "data-format.json"), marker);
    await expect(
      f.observe({
        serviceManagement: { version: 1, controlConsent: true },
        serviceInventory: f.snapshot,
      }),
    ).rejects.toThrow();
    expect(await f.read(`device-${deviceId}.json`)).toBe(previous);
    expect(await f.read("data-format.json")).toBe(marker);
    expect(
      (await readdir(f.root)).filter((name) => /^service-(?:inventory|scan)-/.test(name)),
    ).toEqual([]);
  },
);
it("does not persist a new-format service job when the floor cannot be upgraded", async () => {
  const f = await fixture();
  await f.observe({
    serviceManagement: { version: 1, controlConsent: true },
    serviceInventory: f.snapshot,
  });
  await f.policy();
  await f.marker({ version: 1, softwareState: 3 });
  const requestId = `sw_${"c".repeat(32)}`;
  await expect(
    f.store.request(admin, workspace, {
      version: 1,
      deviceId,
      requestId,
      operation: "start-service",
      serviceId: service.id,
      policyRevision: 1,
    }),
  ).rejects.toThrow("software-data-format-newer-than-reader");
  await expect(f.read(`${requestId}.json`)).rejects.toMatchObject({ code: "ENOENT" });
  expect(await f.floor()).toEqual({ version: 1, softwareState: 3 });
});
