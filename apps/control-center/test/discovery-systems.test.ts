import { type DiscoveryState, defaultDiscoveryPolicy } from "@frevos/contracts";
import { expect, it } from "vitest";
import { discoverySystems, lastSeenLabel } from "../src/discovery-systems.js";

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
  const monitoring = { ...a, deviceId: "fc_" + "c".repeat(32), profileId: null };
  expect(discoverySystems([b, monitoring])[0]?.deviceId).toBe(monitoring.deviceId);
  expect(discoverySystems([b, { ...monitoring, online: false }])[0]?.deviceId).toBe(b.deviceId);
});

it("shows a legacy project connection inside its unambiguous observed system without discarding either binding", () => {
  const monitoring = { ...source("fc_" + "a".repeat(32)), profileId: null, online: false };
  const legacy = {
    ...source("fc_" + "b".repeat(32)),
    name: "  SAME HOSTNAME ",
    observation: null,
    online: false,
    lastSeenAt: "2026-10-25T12:00:00Z",
  };
  const [system] = discoverySystems([legacy, monitoring]);
  expect(discoverySystems([legacy, monitoring])).toHaveLength(1);
  expect(system?.deviceId).toBe(monitoring.deviceId);
  expect(system?.bindings.map((binding) => binding.deviceId).sort()).toEqual(
    [monitoring.deviceId, legacy.deviceId].sort(),
  );
  expect(system?.unverifiedBindings).toEqual([legacy.deviceId]);
  expect(system?.lastSeenAt).toBe("2026-10-25T12:00:00.000Z");
  expect(system?.online).toBe(false);
  expect(discoverySystems([monitoring, legacy])).toEqual(discoverySystems([legacy, monitoring]));
  expect(legacy.observation).toBeNull();
  const pendingMonitoring = { ...legacy, profileId: null };
  const observedProject = { ...monitoring, profileId: "project-fixture" };
  expect(discoverySystems([pendingMonitoring, observedProject])[0]?.deviceId).toBe(
    observedProject.deviceId,
  );
});

it("does not attach a name-only connection across owners, revocation, conflicting identities or platforms", () => {
  const observed = source("fc_" + "a".repeat(32));
  const pending = { ...source("fc_" + "b".repeat(32)), observation: null };
  const collision = source("fc_" + "c".repeat(32), "usr_alice", "c".repeat(64));
  expect(discoverySystems([pending, collision, observed])).toHaveLength(3);
  expect(discoverySystems([observed, { ...pending, userId: "usr_bob" }])).toHaveLength(2);
  expect(discoverySystems([observed, { ...pending, status: "revoked" }])).toHaveLength(2);
  expect(discoverySystems([observed, { ...pending, name: "Another computer" }])).toHaveLength(2);
  const linux = source(pending.deviceId, "usr_alice", null);
  linux.observation!.system.platform = "linux";
  expect(discoverySystems([observed, linux])).toHaveLength(2);
});

it("keeps the newest presence time even when the preferred monitoring connection has older evidence", () => {
  const monitoring = { ...source("fc_" + "a".repeat(32)), profileId: null, online: false };
  const project = { ...source("fc_" + "b".repeat(32)), online: false };
  monitoring.observedAt = "2026-10-24T10:00:00Z";
  project.lastSeenAt = "2026-10-25T12:00:00Z";
  const [system] = discoverySystems([monitoring, project]);
  expect(system?.deviceId).toBe(monitoring.deviceId);
  expect(system?.lastSeenAt).toBe("2026-10-25T12:00:00.000Z");
  expect(discoverySystems([source("fc_" + "c".repeat(32))])[0]?.lastSeenAt).toBeNull();
  const now = Date.parse("2026-10-25T13:00:00Z");
  expect(lastSeenLabel(null, now)).toBe("Last seen: Not recorded");
  expect(lastSeenLabel("bad", now)).toBe("Last seen: Not recorded");
  expect(lastSeenLabel("2026-10-25T12:59:59Z", now)).toContain("less than a minute ago");
  expect(lastSeenLabel("2026-10-25T12:58:00Z", now)).toContain("2 min ago");
  expect(lastSeenLabel("2026-10-25T12:00:00Z", now)).toContain("1 hr ago");
  expect(lastSeenLabel("2026-10-23T12:00:00Z", now)).toContain("2 days ago");
});
