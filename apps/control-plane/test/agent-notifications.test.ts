import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { AgentRunSchema } from "@frevos/contracts";
import { AgentNotifications } from "../src/agent-notifications.js";
const clean: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const f of clean.splice(0).reverse()) await f();
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "devsetu-notices-"));
  clean.push(() => rm(root, { recursive: true, force: true }));
  let now = Date.parse("2026-10-26T00:00:00Z"),
    sourceAllowed = true;
  const devices = [
    {
      deviceId: "fc_" + "a".repeat(32),
      userId: "usr_alice",
      name: "Fixture laptop",
      online: true,
      status: "active",
      workspaceAuthorized: true,
    },
    {
      deviceId: "fc_" + "b".repeat(32),
      userId: "usr_bob",
      name: "Other laptop",
      online: true,
      status: "active",
      workspaceAuthorized: true,
    },
  ];
  const run = AgentRunSchema.parse({
    version: 1,
    id: "ar_" + "c".repeat(32),
    workspaceId: "ws_fixture",
    actor: "usr_alice",
    agentId: "ag_" + "d".repeat(32),
    agentRevision: 1,
    connectionId: "mc_" + "e".repeat(32),
    createdAt: new Date(now).toISOString(),
    status: "succeeded",
    prompt: "Status",
    output: "Review accepted deliverables.",
    facts: [],
    evidence: [],
  });
  const access = new Set(["usr_alice", "usr_bob"]),
    registry = {
      discoveryDevices: async () => devices,
      checkCredential: async (credential: string) => {
        const d = devices.find(
          (d) => d.userId === credential && d.workspaceAuthorized && d.status === "active",
        );
        if (!d) throw Error("authentication required");
        return d;
      },
    };
  const store = new AgentNotifications(
    root,
    "ws_fixture",
    registry,
    async (a) => access.has(a),
    async () => ({ run, allowed: sourceAllowed }),
    () => new Date(now),
  );
  const input = {
    version: 1,
    runId: run.id,
    deviceId: devices[0]!.deviceId,
    title: "Project suggestion",
    message: "Review the milestone evidence.",
  };
  const optin = () =>
    store.claim("usr_alice", { version: 1, enabled: true, capability: "windows-balloon" });
  return {
    root,
    store,
    input,
    devices,
    access,
    run,
    optin,
    advance: (ms: number) => (now += ms),
    setSource: (v: boolean) => (sourceAllowed = v),
  };
}
it("keeps drafts inert until scoped human approval plus fresh local opt-in, then delivers once to the exact owned device", async () => {
  const f = await fixture();
  await expect(f.store.draft("usr_bob", f.input)).rejects.toThrow("notification-access-denied");
  const draft = await f.store.draft("usr_alice", f.input),
    approval = {
      version: 1,
      id: draft.id,
      expectedRevision: 1,
      digest: draft.digest,
      approve: true,
    };
  expect(draft.status).toBe("draft");
  expect(await f.optin()).toBeNull();
  await expect(f.store.approve("usr_bob", approval)).rejects.toThrow("notification-access-denied");
  await expect(
    f.store.approve("usr_alice", { ...approval, digest: "f".repeat(64) }),
  ).rejects.toThrow("notification-revision-changed");
  const queued = await f.store.approve("usr_alice", approval);
  expect(queued.status).toBe("queued");
  expect(
    await f.store.claim("usr_alice", { version: 1, enabled: false, capability: "windows-balloon" }),
  ).toBeNull();
  const claimed = (await f.optin())!;
  expect(claimed.status).toBe("delivering");
  expect(claimed.approval?.consumedAt).toBeTruthy();
  expect(await f.optin()).toBeNull();
  await expect(
    f.store.complete("usr_bob", {
      version: 1,
      id: draft.id,
      digest: draft.digest,
      status: "display-requested",
    }),
  ).rejects.toThrow("notification-scope-denied");
  await f.store.complete("usr_alice", {
    version: 1,
    id: draft.id,
    digest: draft.digest,
    status: "display-requested",
  });
  await expect(
    f.store.complete("usr_alice", {
      version: 1,
      id: draft.id,
      digest: draft.digest,
      status: "display-requested",
    }),
  ).rejects.toThrow("notification-scope-denied");
  expect((await f.store.state("usr_alice")).records[0]?.status).toBe("display-requested");
  expect((await f.store.state("usr_bob")).records).toEqual([]);
  const second = await f.store.draft("usr_alice", f.input);
  await expect(
    f.store.approve("usr_alice", { ...approval, id: second.id, digest: second.digest }),
  ).rejects.toThrow("notification-rate-limited");
});
it("denies absent/stale consent, changed source policy and tampered approval or message; exposes expiry without replay", async () => {
  const f = await fixture();
  const d = await f.store.draft("usr_alice", {
    ...f.input,
    message: 'password = "SYNTHETIC_PRIVATE"',
  });
  expect(d.message).not.toContain("SYNTHETIC_PRIVATE");
  const approve = { version: 1, id: d.id, expectedRevision: 1, digest: d.digest, approve: true };
  await expect(f.store.approve("usr_alice", approve)).rejects.toThrow(
    "notification-local-consent-required",
  );
  await f.optin();
  f.advance(31000);
  await expect(f.store.approve("usr_alice", approve)).rejects.toThrow(
    "notification-local-consent-required",
  );
  await f.optin();
  f.setSource(false);
  await expect(f.store.approve("usr_alice", approve)).rejects.toThrow("notification-source-denied");
  f.setSource(true);
  await f.store.approve("usr_alice", approve);
  const file = join(f.root, d.id + ".json"),
    bytes = await readFile(file, "utf8"),
    tampered = JSON.parse(bytes);
  tampered.message = "Redirected message";
  await writeFile(file, JSON.stringify(tampered));
  await expect(f.optin()).rejects.toThrow("notification-integrity-denied");
  await writeFile(file, bytes);
  const altered = JSON.parse(bytes);
  altered.approval.target = f.devices[1]!.deviceId;
  await writeFile(file, JSON.stringify(altered));
  await expect(f.optin()).rejects.toThrow("notification-approval-denied");
  await writeFile(file, bytes);
  f.advance(600001);
  expect(await f.optin()).toBeNull();
  expect((await f.store.state("usr_alice")).records[0]?.status).toBe("expired");
  f.access.delete("usr_alice");
  await expect(f.store.state("usr_alice")).rejects.toThrow();
});
it("does not claim messages after source revocation and reports uncertain delivery rather than sending again", async () => {
  const f = await fixture(),
    d = await f.store.draft("usr_alice", f.input);
  await f.optin();
  await f.store.approve("usr_alice", {
    version: 1,
    id: d.id,
    expectedRevision: 1,
    digest: d.digest,
    approve: true,
  });
  f.setSource(false);
  expect(await f.optin()).toBeNull();
  f.setSource(true);
  expect((await f.optin())?.id).toBe(d.id);
  f.advance(600001);
  expect((await f.store.state("usr_alice")).records[0]?.status).toBe("delivery-uncertain");
  await expect(
    f.store.complete("usr_alice", {
      version: 1,
      id: d.id,
      digest: d.digest,
      status: "display-requested",
    }),
  ).rejects.toThrow();
});
it("prunes old messages and their approvals, refuses swapped IDs/oversized records and bounds storage", async () => {
  const f = await fixture(),
    d = await f.store.draft("usr_alice", f.input);
  await f.optin();
  await f.store.approve("usr_alice", {
    version: 1,
    id: d.id,
    expectedRevision: 1,
    digest: d.digest,
    approve: true,
  });
  f.advance(8 * 86400000);
  expect((await f.store.state("usr_alice")).records).toEqual([]);
  await expect(readFile(join(f.root, d.id + ".approval.json"))).rejects.toThrow();
  f.run.createdAt = new Date(Date.parse(f.run.createdAt) + 8 * 86400000).toISOString();
  const current = await f.store.draft("usr_alice", f.input);
  const file = join(f.root, current.id + ".json");
  const altered = { ...current, id: "nt_" + "9".repeat(32) };
  const { notificationDigest } = await import("../src/agent-notifications.js");
  altered.digest = notificationDigest(altered);
  await writeFile(file, JSON.stringify(altered));
  await expect(f.store.state("usr_alice")).rejects.toThrow("notification-integrity-denied");
  await writeFile(file, "x".repeat(16385));
  await expect(f.store.state("usr_alice")).rejects.toThrow("notification-storage-unavailable");
  await rm(file);
  await Promise.all(
    Array.from({ length: 101 }, (_, i) =>
      writeFile(join(f.root, "nt_" + i.toString(16).padStart(32, "0") + ".json"), "{}"),
    ),
  );
  await expect(f.store.state("usr_alice")).rejects.toThrow("notification-capacity");
});
