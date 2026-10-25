import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
  mkdir,
  symlink,
  realpath,
} from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { DeveloperConnectorStore, SystemPairings } from "../src/developer-connectors.js";
import { SystemDiscovery } from "../src/system-discovery.js";
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
function proposal(code = "ABCDEFGH") {
  const deviceId = "fc_" + randomBytes(16).toString("hex"),
    credential = deviceId + "." + randomBytes(32).toString("base64url"),
    proof = deviceId + "." + randomBytes(32).toString("base64url");
  return {
    code,
    credential,
    proof,
    input: {
      version: 1,
      deviceId,
      name: "Synthetic new laptop",
      platform: "win32",
      architecture: "x64",
      fileActivity: true,
      credentialHash: hash(credential),
      pollHash: hash(proof),
      codeHash: hash(code),
    },
  };
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "devsetu-passwordless-"));
  let now = Date.parse("2026-10-25T12:00:00Z");
  const allowed = new Set(["usr_owner", "usr_other"]),
    clock = () => new Date(now),
    connectors = new DeveloperConnectorStore(
      join(root, "connectors"),
      async (a) => allowed.has(a),
      {
        head: async () => {
          throw Error("Git prohibited");
        },
        importBundle: async () => {
          throw Error("Git prohibited");
        },
      },
      async () => {},
      clock,
    );
  const discovery = new SystemDiscovery(
      join(root, "discovery"),
      connectors,
      async () => ({ projects: [], clients: [] }),
      clock,
    ),
    pairings = new SystemPairings(join(root, "enrollments"), connectors, discovery, clock);
  return {
    root,
    connectors,
    discovery,
    pairings,
    allowed,
    clock,
    tick: (ms: number) => {
      now += ms;
    },
    close: async () => {
      connectors.close();
      const target = await realpath(root);
      expect(dirname(target)).toBe(await realpath(tmpdir()));
      expect(basename(target)).toMatch(/^devsetu-passwordless-/);
      await rm(target, { recursive: true, force: true });
    },
  };
}
it("approves an exact computer from an authorized actor without transferring any administrator or device secret", async () => {
  const f = await fixture();
  try {
    const p = proposal(),
      preview = await f.pairings.start(p.input, "fixture-network");
    expect(await f.connectors.list("usr_owner")).toEqual([]);
    expect((await f.pairings.start(p.input, "fixture-network")).enrollmentId).toBe(
      preview.enrollmentId,
    );
    expect(JSON.stringify(preview)).not.toMatch(/credentialHash|pollHash|codeHash/);
    await expect(f.pairings.poll(p.credential)).rejects.toMatchObject({
      code: "pairing-proof-required",
    });
    await expect(f.pairings.poll(p.code)).rejects.toMatchObject({ code: "pairing-proof-required" });
    await expect(
      f.pairings.poll("fc_" + "a".repeat(32) + "." + "b".repeat(43)),
    ).rejects.toMatchObject({ code: "pairing-proof-required" });
    await expect(f.pairings.lookup("usr_unknown", { code: p.code })).rejects.toMatchObject({
      code: "connector-access-denied",
    });
    expect((await f.pairings.lookup("usr_owner", { code: "abcd-efgh" })).digest).toBe(
      preview.digest,
    );
    await expect(
      f.pairings.decide("usr_owner", preview.enrollmentId, {
        version: 1,
        digest: "0".repeat(64),
        decision: "approve",
      }),
    ).rejects.toMatchObject({ code: "pairing-expired-or-changed" });
    const decision = { version: 1, digest: preview.digest, decision: "approve" };
    expect((await f.pairings.decide("usr_owner", preview.enrollmentId, decision)).status).toBe(
      "approved",
    );
    expect((await f.pairings.poll(p.proof)).status).toBe("approved");
    expect(await f.connectors.list("usr_owner")).toHaveLength(1);
    await f.pairings.decide("usr_owner", preview.enrollmentId, decision);
    await expect(
      f.pairings.decide("usr_other", preview.enrollmentId, decision),
    ).rejects.toMatchObject({ code: "pairing-actor-mismatch" });
    await expect(
      f.pairings.decide("usr_owner", preview.enrollmentId, { ...decision, decision: "reject" }),
    ).rejects.toMatchObject({ code: "pairing-already-decided" });
    expect(await f.pairings.status(p.credential)).toMatchObject({
      ready: true,
      online: false,
      actor: "usr_owner",
    });
    expect((await f.discovery.policyForConnector(p.credential)).policy).toMatchObject({
      enabled: true,
      contentFolders: [],
    });
    await f.connectors.heartbeat(p.credential, {});
    await f.discovery.observe(p.credential, {
      version: 1,
      deviceId: p.input.deviceId,
      profileId: null,
      bootId: randomUUID(),
      at: f.clock().toISOString(),
      policyRevision: 1,
      system: {
        systemName: "Fixture",
        platform: "win32",
        os: "Windows fixture",
        architecture: "x64",
        cpuPercent: 10,
        cpuCount: 4,
        memoryTotal: 8000,
        memoryAvailable: 5000,
        uptimeSeconds: 20,
        tools: [],
        disks: [],
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
    });
    expect((await f.pairings.status(p.credential)).online).toBe(true);
    f.tick(31000);
    expect((await f.pairings.status(p.credential)).online).toBe(false);
    await expect(f.connectors.baseline(p.credential, { heads: [] })).rejects.toMatchObject({
      code: "connector-project-binding-required",
    });
    await expect(f.connectors.heartbeat(p.proof)).rejects.toMatchObject({
      code: "connector-authentication-required",
    });
    const receipts = await readdir(join(f.root, "enrollments"));
    for (const name of receipts) {
      const text = await readFile(join(f.root, "enrollments", name), "utf8");
      expect(text).not.toContain(p.credential);
      expect(text).not.toContain(p.proof);
      expect(text).not.toContain(p.code);
    }
    const audit = join(f.root, "enrollments", "consumed-" + preview.enrollmentId + ".json"),
      original = await readFile(audit, "utf8");
    await writeFile(audit, original.replace("usr_owner", "usr_other"));
    await expect(f.pairings.status(p.credential)).rejects.toMatchObject({
      code: "pairing-audit-mismatch",
    });
    await rm(audit);
    await expect(f.pairings.status(p.credential)).rejects.toMatchObject({
      code: "pairing-audit-unavailable",
    });
  } finally {
    await f.close();
  }
});
it("rejects changed targets, expired/rejected codes and collisions without issuing another credential", async () => {
  const f = await fixture();
  try {
    const p = proposal(),
      r = await f.pairings.start(p.input, "fixture");
    const recordFile = join(f.root, "enrollments", "record-" + p.input.deviceId + ".json"),
      original = await readFile(recordFile, "utf8");
    await writeFile(recordFile, JSON.stringify({ ...JSON.parse(original), fileActivity: false }));
    await expect(f.pairings.lookup("usr_owner", { code: p.code })).rejects.toMatchObject({
      code: "pairing-target-integrity-failed",
    });
    await writeFile(recordFile, original);
    await expect(
      f.pairings.start({ ...p.input, name: "Changed" }, "fixture"),
    ).rejects.toMatchObject({ code: "pairing-target-changed" });
    await expect(f.pairings.start(proposal().input, "fixture")).rejects.toMatchObject({
      code: "pairing-code-collision",
    });
    await expect(f.pairings.lookup("usr_owner", { code: "bad" })).rejects.toMatchObject({
      code: "pairing-code-invalid",
    });
    await expect(f.pairings.lookup("usr_owner", { code: "ZZZZZZZZ" })).rejects.toMatchObject({
      code: "pairing-code-expired-or-invalid",
    });
    await expect(f.pairings.decide("usr_owner", "invalid", {})).rejects.toMatchObject({
      code: "pairing-not-found",
    });
    await expect(
      f.pairings.decide("usr_owner", "ep_" + "a".repeat(32), {
        version: 1,
        digest: r.digest,
        decision: "approve",
      }),
    ).rejects.toMatchObject({ code: "pairing-not-found" });
    await f.pairings.decide("usr_owner", r.enrollmentId, {
      version: 1,
      digest: r.digest,
      decision: "reject",
    });
    await expect(
      f.pairings.decide("usr_owner", r.enrollmentId, {
        version: 1,
        digest: r.digest,
        decision: "approve",
      }),
    ).rejects.toMatchObject({ code: "pairing-already-decided" });
    expect((await f.pairings.poll(p.proof)).status).toBe("rejected");
    const q = proposal("JKLMNPQR"),
      next = await f.pairings.start(q.input, "fixture");
    f.tick(600001);
    expect((await f.pairings.poll(q.proof)).status).toBe("expired");
    await expect(f.pairings.lookup("usr_owner", { code: q.code })).rejects.toMatchObject({
      code: "pairing-code-expired-or-invalid",
    });
    await expect(
      f.pairings.decide("usr_owner", next.enrollmentId, {
        version: 1,
        digest: next.digest,
        decision: "approve",
      }),
    ).rejects.toMatchObject({ code: "pairing-expired-or-changed" });
    expect(await f.connectors.list("usr_owner")).toEqual([]);
    const legacy = await f.connectors.pair("usr_owner", { version: 1, name: "Legacy" });
    await expect(f.pairings.status(legacy.credential)).rejects.toMatchObject({
      code: "connector-project-binding-required",
    });
  } finally {
    await f.close();
  }
});
it("fails before credential creation when audit cannot persist, resumes durable approval and refuses device ownership collisions", async () => {
  const f = await fixture();
  try {
    const p = proposal(),
      r = await f.pairings.start(p.input, "fixture"),
      decision = { version: 1, digest: r.digest, decision: "approve" };
    const blocked = join(f.root, "enrollments", "intent-" + r.enrollmentId + ".json");
    await mkdir(blocked);
    await expect(f.pairings.decide("usr_owner", r.enrollmentId, decision)).rejects.toBeDefined();
    expect(await f.connectors.list("usr_owner")).toEqual([]);
    await rm(blocked, { recursive: true });
    const consumed = join(f.root, "enrollments", "consumed-" + r.enrollmentId + ".json");
    await mkdir(consumed);
    await expect(f.pairings.decide("usr_owner", r.enrollmentId, decision)).rejects.toBeDefined();
    expect(await f.connectors.list("usr_owner")).toEqual([]);
    await rm(consumed, { recursive: true });
    await f.pairings.decide("usr_owner", r.enrollmentId, decision);
    expect(await f.connectors.list("usr_owner")).toHaveLength(1);
    await f.connectors.acceptSystemEnrollment("usr_owner", p.input);
    expect(await f.connectors.list("usr_owner")).toHaveLength(1);
    await expect(f.connectors.acceptSystemEnrollment("usr_other", p.input)).rejects.toMatchObject({
      code: "pairing-device-collision",
    });
    const sys = await f.connectors.pair("usr_owner", {
      version: 1,
      mode: "system",
      name: "Compatibility",
    });
    expect((await f.pairings.status(sys.credential)).ready).toBe(true);
    await f.connectors.revoke("usr_owner", p.input.deviceId);
    await expect(f.connectors.acceptSystemEnrollment("usr_owner", p.input)).rejects.toMatchObject({
      code: "pairing-device-collision",
    });
  } finally {
    await f.close();
  }
});
it("bounds unauthenticated proposals and polling, and refuses linked storage", async () => {
  const f = await fixture();
  try {
    const p = proposal();
    for (let i = 0; i < 10; i++) await f.pairings.start(p.input, "one-network");
    await expect(f.pairings.start(p.input, "one-network")).rejects.toMatchObject({
      code: "pairing-rate-limited",
    });
    for (let i = 0; i < 40; i++) await f.pairings.poll(p.proof);
    await expect(f.pairings.poll(p.proof)).rejects.toMatchObject({ code: "pairing-rate-limited" });
    f.tick(60001);
    await f.pairings.poll(p.proof);
    const outside = join(f.root, "outside"),
      linked = join(f.root, "linked");
    await mkdir(outside);
    await symlink(outside, linked, process.platform === "win32" ? "junction" : "dir");
    const bad = new SystemPairings(linked, f.connectors, f.discovery, f.clock);
    await expect(bad.start(proposal().input, "fixture")).rejects.toMatchObject({
      code: "pairing-storage-unavailable",
    });
    await expect(
      new SystemPairings(join(linked, "new-child"), f.connectors, f.discovery, f.clock).start(
        proposal().input,
        "fixture",
      ),
    ).rejects.toMatchObject({ code: "pairing-storage-unavailable" });
    await expect(readFile(join(outside, "new-child"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      new SystemPairings("relative", f.connectors, f.discovery, f.clock).start(
        proposal().input,
        "fixture",
      ),
    ).rejects.toMatchObject({ code: "pairing-storage-unavailable" });
  } finally {
    await f.close();
  }
});
