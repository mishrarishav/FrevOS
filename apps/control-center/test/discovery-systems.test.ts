import { type DiscoveryState, defaultDiscoveryPolicy } from "@frevos/contracts";
import { expect, it } from "vitest";
import { discoverySystems } from "../src/discovery-systems.js";

type Source = DiscoveryState["systems"][number];
function source(
  device: string,
  user = "usr_alice",
  identity: string | null = "a".repeat(64),
): Source {
  return {
    deviceId: device,
    name: "Same hostname",
    userId: user,
    profileId: "fixture",
    status: "active",
    source: null,
    sourceFresh: false,
    online: true,
    observedAt: null,
    policy: null,
    observation: {
      version: 1,
      deviceId: device,
      profileId: "fixture",
      bootId: "00000000-0000-4000-8000-000000000000",
      at: "2026-10-24T00:00:00Z",
      policyRevision: 0,
      system: {
        systemName: "Same hostname",
        installationId: identity,
        platform: "win32",
        os: "Windows",
        architecture: "x64",
        cpuPercent: null,
        cpuCount: 2,
        memoryTotal: 100,
        memoryAvailable: 50,
        uptimeSeconds: 1,
        disks: [],
        tools: [],
      },
      coverage: {
        status: "disabled",
        roots: [],
        watchedDirectories: 0,
        gaps: [],
        attribution: "unavailable",
        droppedEvents: 0,
      },
      events: [],
    },
    history: [],
    historyCount: 0,
  };
}
it("groups project bindings only by reported installation and account, preserving identities and historical rows", () => {
  const a = source("fc_" + "a".repeat(32)),
    b = source("fc_" + "b".repeat(32));
  b.policy = {
    version: 1,
    deviceId: b.deviceId,
    policy: { ...defaultDiscoveryPolicy, enabled: true },
    revision: 1,
    actor: b.userId,
    updatedAt: "2026-10-24T00:00:00Z",
  };
  const grouped = discoverySystems([a, b]);
  expect(grouped).toHaveLength(1);
  expect(grouped[0]?.deviceId).toBe(b.deviceId);
  expect(grouped[0]?.bindings).toHaveLength(2);
  expect(discoverySystems([a, source(b.deviceId, "usr_bob")])).toHaveLength(2);
  expect(discoverySystems([a, { ...b, status: "revoked" }])).toHaveLength(2);
  expect(
    discoverySystems([
      source(a.deviceId, "usr_alice", null),
      source(b.deviceId, "usr_alice", null),
    ]),
  ).toHaveLength(2);
  expect(discoverySystems([a, { ...b, online: false }])[0]?.online).toBe(true);
});
