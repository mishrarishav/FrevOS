import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { expect, it } from "vitest";
import { SoftwareManagement } from "../src/software-management.js";

const client = createRequire(import.meta.url)("../../../deployment/servix/SoftwareClient.cjs");
async function until(fn: () => Promise<boolean>) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 80));
  }
  throw Error("service client deadline");
}
async function cleanup(root: string) {
  if (dirname(resolve(root)) !== resolve(tmpdir()) || !root.includes("frevos-service-client-"))
    throw Error("cleanup scope");
  await rm(root, { recursive: true, force: true });
}
it("collects services, enables control once locally, executes audited Start/Stop and reconciles receipts without replay", async () => {
  const root = await mkdtemp(join(tmpdir(), "frevos-service-client-")),
    stateRoot = join(root, "client");
  const workspaceId = "ws_services",
    deviceId = `fc_${"e".repeat(32)}`,
    actor = "usr_admin";
  const device = {
    deviceId,
    userId: actor,
    workspaceId,
    name: "Disposable protocol fixture",
    online: true,
    status: "active",
    workspaceAuthorized: true,
  };
  const store = new SoftwareManagement(
    join(root, "server"),
    workspaceId,
    {
      discoveryDevices: async (a) => (a === actor ? [device] : []),
      checkCredential: async () => device,
    },
    async (a) => a === actor,
  );
  let running = false,
    mutations = 0,
    scans = 0;
  const service = () => ({
    id: "a".repeat(64),
    definitionSha256: "b".repeat(64),
    name: "FixtureService",
    displayName: "Fixture service",
    manager: "windows-scm",
    status: running ? "running" : "stopped",
    startupType: "Manual",
    canStart: true,
    canStop: true,
    protected: false,
  });
  const snapshot = async () => {
    scans++;
    return {
      version: 1,
      observedAt: new Date().toISOString(),
      platform: "win32",
      status: "ready",
      truncated: false,
      items: [service()],
    };
  };
  const api = async (route: string, input: unknown) => {
    const op = route.split("/").at(-1);
    if (op === "identity") return store.identity("fixture");
    if (op === "observe") return store.observe("fixture", input);
    if (op === "initial-inventory") return { scheduled: false };
    if (op === "claim") return store.claim("fixture");
    if (op === "authorize") return store.authorize("fixture", input);
    if (op === "complete") return store.complete("fixture", input);
    throw Error("fixture route denied");
  };
  await mkdir(join(stateRoot, "software"), { recursive: true });
  const consentFile = join(stateRoot, "software/consent.json");
  await client.atomic(consentFile, {
    version: 1,
    deviceId,
    inventory: true,
    install: false,
    approvedAt: new Date().toISOString(),
  });
  const options = {
    serviceInventory: snapshot,
    serviceAction: async (
      _s: unknown,
      op: string,
      opts: { beforeExecute: () => Promise<void> },
    ) => {
      await opts.beforeExecute();
      mutations++;
      running = op === "start-service";
      return { result: running ? "service-started" : "service-stopped" };
    },
  };
  let companion = await client.start({ deviceId, stateRoot }, api, options);
  try {
    await until(
      async () => !!(await store.state(actor, workspaceId, deviceId)).device.serviceInventory,
    );
    expect(
      (await store.state(actor, workspaceId, deviceId)).device.capability?.serviceManagement
        ?.controlConsent,
    ).toBe(false);
    const html = await (await fetch(companion.url)).text(),
      nonce = html.match(/const nonce="([a-f0-9]+)"/)?.[1];
    expect(nonce).toBeTruthy();
    const permission = { inventory: true, install: false, serviceControl: true };
    const consent = await fetch(companion.url + "consent", {
      method: "POST",
      headers: {
        origin: new URL(companion.url).origin,
        "content-type": "application/json",
        "x-devsetu-local": nonce!,
      },
      body: JSON.stringify(permission),
    });
    expect(consent.status).toBe(200);
    await until(
      async () =>
        !!(await store.state(actor, workspaceId, deviceId)).device.capability?.serviceManagement
          ?.controlConsent,
    );
    await store.saveServicePolicy(actor, workspaceId, {
      version: 1,
      deviceId,
      expectedRevision: 0,
      rule: { id: service().id, definitionSha256: service().definitionSha256, enabled: true },
    });
    for (const [index, operation, result] of [
      ["1", "start-service", "service-started"],
      ["2", "stop-service", "service-stopped"],
    ] as const) {
      const job = await store.request(actor, workspaceId, {
        version: 1,
        deviceId,
        requestId: `sw_${index.repeat(32)}`,
        operation,
        serviceId: service().id,
        policyRevision: 1,
      });
      await until(async () => {
        const state = await store.state(actor, workspaceId, deviceId);
        return (
          state.jobs.find((j) => j.request.requestId === job.request.requestId)?.result === result
        );
      });
      const receipt = JSON.parse(
        await readFile(join(stateRoot, "software", job.request.requestId + ".json"), "utf8"),
      );
      expect(receipt.reconciled).toBe(true);
    }
    expect(mutations).toBe(2);
    expect(running).toBe(false);
    await companion.stop();
    companion = await client.start({ deviceId, stateRoot }, api, options);
    await until(async () => scans >= 4);
    expect(mutations).toBe(2);
    expect(
      (await store.state(actor, workspaceId, deviceId)).device.capability?.installConsent,
    ).toBe(false);
    const saved = JSON.parse(await readFile(consentFile, "utf8"));
    expect(saved).toMatchObject({ ...permission, deviceId });
  } finally {
    await companion.stop();
    await cleanup(root);
  }
}, 45000);
