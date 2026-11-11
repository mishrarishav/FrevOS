import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { serverMonitorTargetId } from "../src/server-monitoring.js";
import {
  loadServerMonitoringRuntime,
  ServerMonitoringRuntimeSchema,
  serverMonitoringTargetAllowed,
} from "../src/server-monitoring-runtime.js";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
function fixture() {
  const workspaceId = "ws_monitor_fixture",
    address = "10.2.3.4",
    port = 5985,
    transport = "winrm-http" as const;
  return {
    version: 1 as const,
    workspaceId,
    enabled: true,
    queueRoot: join(tmpdir(), "monitor-fixture-queue"),
    sourcePolicies: [
      {
        registerId: "rr_" + "a".repeat(32),
        managementValues: ["Internal"],
        hostingField: "hosting",
      },
    ],
    targets: [
      {
        id: serverMonitorTargetId(workspaceId, address, port, transport),
        address,
        port,
        transport,
        credentialProfile: "fixture_profile",
      },
    ],
  };
}
it("loads only explicit bounded enrollment and treats missing config as unconfigured", async () => {
  const root = await mkdtemp(join(tmpdir(), "monitor-config-"));
  roots.push(root);
  expect(await loadServerMonitoringRuntime(join(root, "absent.json"))).toBeUndefined();
  const file = join(root, "runtime.json");
  await writeFile(file, JSON.stringify(fixture()));
  const result = await loadServerMonitoringRuntime(file);
  expect(result?.concurrency).toBe(3);
  expect(result?.timeoutMs).toBe(60000);
});
it("never lets ordinary revision/grant changes expand protected endpoint enrollment", () => {
  const config = ServerMonitoringRuntimeSchema.parse(fixture());
  const target = { ...config.targets[0]!, workspaceId: config.workspaceId, revision: 1 };
  expect(serverMonitoringTargetAllowed(config, target)).toBe(true);
  expect(serverMonitoringTargetAllowed(config, { ...target, revision: 99 })).toBe(true);
  for (const delta of [
    { workspaceId: "ws_other" },
    { address: "10.2.3.5" },
    { port: 5986 },
    { credentialProfile: "other_profile" },
    { id: "srv_" + "b".repeat(32) },
    { transport: "local" as const },
  ])
    expect(serverMonitoringTargetAllowed(config, { ...target, ...delta })).toBe(false);
});
it("rejects credentials, public addresses, duplicate enrollments and malformed config without echoing input", async () => {
  const input = fixture();
  for (const value of [
    { ...input, password: "SECRET_SENTINEL" },
    { ...input, queueRoot: "relative/path" },
    { ...input, targets: [{ ...input.targets[0], address: "8.8.8.8" }] },
    { ...input, targets: [input.targets[0], input.targets[0]] },
  ])
    expect(ServerMonitoringRuntimeSchema.safeParse(value).success).toBe(false);
  const root = await mkdtemp(join(tmpdir(), "monitor-config-"));
  roots.push(root);
  const file = join(root, "runtime.json");
  await writeFile(file, '{"password":"SECRET_SENTINEL",');
  await expect(loadServerMonitoringRuntime(file)).rejects.toThrow(
    /^server-monitoring-configuration-invalid$/,
  );
});
