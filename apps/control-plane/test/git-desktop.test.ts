import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { GitDesktop, type GitDesktopPublisher } from "../src/git-desktop.js";
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const deviceId = "fc_" + "d".repeat(32),
  repositoryId = "repo_" + "a".repeat(32);
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "git-broker-"));
  roots.push(root);
  let now = new Date(),
    online = true,
    active = true,
    write = true,
    credential = "paired",
    proof = "succeeded",
    browseRoot = "D:\\",
    browsePath = "project";
  let remoteHead: string | null = "b".repeat(40);
  const devices = {
    discoveryDevices: async () => [
      {
        deviceId,
        userId: "usr_alice",
        workspaceId: "ws_team",
        name: "Laptop",
        online,
        status: active ? "active" : "revoked",
        platform: "windows",
        workspaceAuthorized: true,
      },
    ],
    checkCredential: async (value: string) => {
      if (value !== credential) throw Error("credential-denied");
      return { deviceId, userId: "usr_alice", workspaceId: "ws_team" };
    },
  };
  const publisher: GitDesktopPublisher = {
    repository: vi.fn(async () => ({ defaultBranch: "main", write })),
    publish: vi.fn(async (_a, _w, _id, _branch, head) => {
      remoteHead = head;
    }),
    branchHead: vi.fn(async () => remoteHead),
    download: vi.fn(async () => ({ head: remoteHead!, bytes: Buffer.from("fixture") })),
  };
  const broker = new GitDesktop(
    root,
    devices,
    async () => ({
      actor: "usr_alice",
      workspaceId: "ws_team",
      status: proof,
      request: { deviceId, root: browseRoot, path: browsePath },
      result: { root: browseRoot, path: browsePath },
    }),
    publisher,
    () => now,
  );
  const claim = () => broker.claim(credential, { version: 1, capability: 1, gitReady: true });
  const select = (extra = {}) =>
    broker.select("usr_alice", "ws_team", {
      version: 1,
      deviceId,
      browseRequestId: "fb_" + "b".repeat(32),
      root: browseRoot,
      path: browsePath,
      ...extra,
    });
  await claim();
  const job = await select();
  const snapshot = {
    folderId: job.binding.id,
    root: job.binding.root,
    gitReady: true,
    initialized: true,
    branch: "work/alice",
    head: "b".repeat(40),
    fingerprint: "f".repeat(64),
    files: [],
    truncated: false,
  };
  await claim();
  await broker.complete(credential, job.id, { status: "succeeded", snapshot });
  const connect = () =>
    broker.connect("usr_alice", "ws_team", {
      version: 1,
      folderId: job.binding.id,
      repositoryId,
      expectedFingerprint: snapshot.fingerprint,
    });
  const execute = (action: string, extra = {}) =>
    broker.action("usr_alice", "ws_team", {
      version: 1,
      folderId: job.binding.id,
      action,
      expectedFingerprint: snapshot.fingerprint,
      branch: "work/alice",
      ...extra,
    });
  return {
    root,
    broker,
    job,
    snapshot,
    claim,
    select,
    connect,
    execute,
    publisher,
    advance: (seconds: number) => {
      now = new Date(now.getTime() + seconds * 1000);
    },
    offline: () => {
      online = false;
    },
    revoke: () => {
      active = false;
    },
    readOnly: () => {
      write = false;
    },
    invalidCredential: () => {
      credential = "other";
    },
    badProof: () => {
      proof = "expired";
    },
    remote: (h: string | null) => {
      remoteHead = h;
    },
    location: (root: string, relative: string) => {
      browseRoot = root;
      browsePath = relative;
    },
  };
}
it("scopes folders to their paired owner and workspace and requires an expiring folder selection result", async () => {
  const f = await fixture();
  expect((await f.broker.state("usr_bob", "ws_team")).folders).toEqual([]);
  expect((await f.broker.state("usr_alice", "ws_other")).devices).toEqual([]);
  await expect(
    f.broker.action("usr_bob", "ws_team", {
      version: 1,
      folderId: f.job.binding.id,
      action: "status",
    }),
  ).rejects.toThrow("folder-not-found");
  await expect(f.execute("commit-push", { message: "Change", files: ["app.js"] })).rejects.toThrow(
    "choose-central-repository",
  );
  f.badProof();
  await expect(f.select()).rejects.toThrow("folder-proof-denied");
  f.offline();
  await expect(f.select()).rejects.toThrow("device-denied");
  await expect(f.claim()).rejects.toThrow("device-denied");
});
it("deduplicates selected paths, binds only an explicitly chosen repository and refuses later rebindings", async () => {
  const f = await fixture();
  const duplicate = await f.select();
  expect(duplicate.binding.id).toBe(f.job.binding.id);
  expect(duplicate.binding.repositoryId).toBeNull();
  await f.claim();
  await f.broker.complete("paired", duplicate.id, { status: "succeeded", snapshot: f.snapshot });
  const bound = await f.select({ repositoryId });
  expect(bound.binding.repositoryId).toBe(repositoryId);
  expect(f.publisher.publish).not.toHaveBeenCalled();
  await expect(f.select({ repositoryId: "repo_" + "e".repeat(32) })).rejects.toThrow(
    "repository-binding-exists",
  );
  await expect(
    f.broker.connect("usr_alice", "ws_team", {
      version: 1,
      folderId: f.job.binding.id,
      repositoryId: "repo_" + "e".repeat(32),
      expectedFingerprint: f.snapshot.fingerprint,
    }),
  ).rejects.toThrow("repository-binding-exists");
  f.location("/", "project");
  expect((await f.select()).binding.root).toBe("/project");
  f.location("D:\\", "");
  await expect(f.select()).rejects.toThrow("choose-project-folder");
});
it("checks job identity/download scope, recovery preconditions and bounded retained storage", async () => {
  const f = await fixture();
  expect(await f.broker.identity("paired")).toMatchObject({
    deviceId,
    workspaceId: "ws_team",
    profileId: null,
  });
  await expect(f.broker.identity("wrong")).rejects.toThrow("credential-denied");
  await expect(f.execute("reconcile")).rejects.toThrow("no-recovery-required");
  await expect(f.execute("reconcile", { expectedFingerprint: "a".repeat(64) })).rejects.toThrow(
    "files-changed-refresh",
  );
  const status = await f.execute("status");
  await f.claim();
  await expect(f.broker.download("paired", status.id)).rejects.toThrow("pull-denied");
  await expect(f.broker.authorizeJob("paired", "gjob_" + "c".repeat(32))).rejects.toThrow(
    "job-not-found",
  );
  await expect(
    f.broker.action("usr_alice", "ws_team", {
      version: 1,
      folderId: "gfolder_" + "c".repeat(32),
      action: "status",
    }),
  ).rejects.toThrow("folder-not-found");
  await expect(
    f.broker.complete("paired", status.id, {
      status: "succeeded",
      snapshot: { ...f.snapshot, root: "D:\\other" },
    }),
  ).rejects.toThrow("snapshot-scope-denied");
  await writeFile(join(f.root, status.id + ".json"), " ".repeat(16777217));
  await expect(f.broker.state("usr_alice", "ws_team")).rejects.toThrow("job-store-capacity");
});
it("connects a repository, serializes work and confirms publication before accepting successful completion", async () => {
  const f = await fixture();
  const connected = await f.connect();
  await f.claim();
  await f.broker.complete("paired", connected.id, { status: "succeeded", snapshot: f.snapshot });
  const job = await f.execute("commit-push", { message: "Change", files: ["app.js"] });
  await expect(f.execute("status")).rejects.toThrow("folder-busy");
  expect((await f.claim()).jobs.map((j) => j.id)).toEqual([job.id]);
  await expect(
    f.broker.complete("paired", job.id, { status: "succeeded", snapshot: f.snapshot }),
  ).rejects.toThrow("publication-proof-required");
  await expect(
    f.broker.publish("wrong", job.id, "b".repeat(40), Buffer.from("bundle")),
  ).rejects.toThrow();
  await expect(f.broker.publish("paired", job.id, "bad", Buffer.from("bundle"))).rejects.toThrow(
    "publish-denied",
  );
  await f.broker.publish("paired", job.id, "b".repeat(40), Buffer.from("bundle"));
  await f.broker.complete("paired", job.id, { status: "succeeded", snapshot: f.snapshot });
  expect(
    (await f.broker.state("usr_alice", "ws_team")).jobs.find((j) => j.id === job.id)?.status,
  ).toBe("succeeded");
  await expect(f.broker.authorizeJob("paired", job.id)).rejects.toThrow("job-denied");
  expect(JSON.stringify(await f.broker.state("usr_alice", "ws_team"))).not.toContain("fixture");
});
it("requires fresh connector capability, current file fingerprints and live repository write permission", async () => {
  const f = await fixture();
  const connected = await f.connect();
  await f.claim();
  await f.broker.complete("paired", connected.id, { status: "succeeded", snapshot: f.snapshot });
  await expect(f.execute("push", { expectedFingerprint: "a".repeat(64) })).rejects.toThrow(
    "files-changed-refresh",
  );
  f.readOnly();
  await expect(f.execute("push")).rejects.toThrow("write-denied");
  const pull = await f.execute("pull");
  await f.claim();
  expect(await f.broker.download("paired", pull.id)).toEqual({
    head: "b".repeat(40),
    bundle: Buffer.from("fixture").toString("base64"),
  });
  await f.broker.complete("paired", pull.id, {
    status: "failed",
    errorCode: "git-desktop-dirty-folder",
  });
  f.advance(31);
  await expect(f.execute("status")).rejects.toThrow("connector-update-required");
  expect((await f.broker.state("usr_alice", "ws_team")).devices[0]?.capable).toBe(false);
  await f.claim();
  f.revoke();
  await expect(f.execute("status")).rejects.toThrow("device-denied");
});
it("retains unknown side effects and explicitly reconciles remote and freshly observed local state", async () => {
  const f = await fixture();
  const c = await f.connect();
  await f.claim();
  await f.broker.complete("paired", c.id, { status: "succeeded", snapshot: f.snapshot });
  const job = await f.execute("push");
  await f.claim();
  vi.mocked(f.publisher.publish).mockImplementationOnce(async () => {
    throw Error("lost-response");
  });
  await expect(
    f.broker.publish("paired", job.id, f.snapshot.head, Buffer.from("bundle")),
  ).rejects.toThrow();
  await expect(f.execute("push")).rejects.toThrow("folder-busy");
  await expect(f.execute("reconcile")).rejects.toThrow("refresh-before-recovery");
  f.advance(1);
  await f.claim();
  const status = await f.execute("status");
  await f.claim();
  await f.broker.complete("paired", status.id, { status: "succeeded", snapshot: f.snapshot });
  const recovery = await f.execute("reconcile");
  expect(recovery.action).toBe("status");
  expect(
    (await f.broker.state("usr_alice", "ws_team")).jobs.find((j) => j.id === job.id)?.status,
  ).toBe("succeeded");
  const record = JSON.parse(await readFile(join(f.root, job.id + ".json"), "utf8"));
  expect(record.sourceHead).toBe(f.snapshot.head);
});
it("pins remote branch checkout and rejects mismatched completion while compacting successful history", async () => {
  const f = await fixture();
  const connected = await f.connect();
  await f.claim();
  await f.broker.complete("paired", connected.id, { status: "succeeded", snapshot: f.snapshot });
  const switched = await f.execute("switch-branch", { branch: "feature/remote" });
  expect(switched.remoteHead).toBe(f.snapshot.head);
  await f.claim();
  expect((await f.broker.download("paired", switched.id)).head).toBe(f.snapshot.head);
  await expect(
    f.broker.complete("paired", switched.id, {
      status: "succeeded",
      snapshot: f.snapshot,
    }),
  ).rejects.toThrow("snapshot-scope-denied");
  const snapshot = { ...f.snapshot, branch: "feature/remote" };
  await f.broker.complete("paired", switched.id, { status: "succeeded", snapshot });
  const record = JSON.parse(await readFile(join(f.root, switched.id + ".json"), "utf8"));
  expect(record.observedFingerprint).toBe(snapshot.fingerprint);
  expect(record.snapshot).toBeUndefined();
  expect(record.files).toBeUndefined();
  expect(record.message).toBeUndefined();
  expect((await f.broker.state("usr_alice", "ws_team")).folders[0]?.branch).toBe("feature/remote");
  await f.broker.claim("paired", { version: 1, capability: 1, gitReady: false });
  await expect(f.execute("switch-branch")).rejects.toThrow("git-required");
});
it("carries only engine-certified new-repository bootstrap proof and fails closed on oversized records", async () => {
  const f = await fixture();
  const intent = "git_" + "a".repeat(32);
  vi.mocked(f.publisher.repository).mockResolvedValueOnce({
    defaultBranch: "main",
    write: true,
    bootstrapSeed: "c".repeat(40),
  });
  const connected = await f.broker.connect("usr_alice", "ws_team", {
    version: 1,
    folderId: f.job.binding.id,
    repositoryId,
    expectedFingerprint: f.snapshot.fingerprint,
    creationRequestId: intent,
  });
  expect(f.publisher.repository).toHaveBeenLastCalledWith(
    "usr_alice",
    "ws_team",
    repositoryId,
    intent,
  );
  expect(connected.binding.bootstrapSeed).toBe("c".repeat(40));
  await writeFile(join(f.root, f.job.binding.id + ".snapshot.json"), " ".repeat(524289));
  await expect(f.broker.state("usr_alice", "ws_team")).rejects.toThrow("record-capacity");
});
it("expires queued work without executing it and handles stopped clients without replaying mutations", async () => {
  const f = await fixture();
  const job = await f.execute("status");
  f.advance(301);
  await f.claim();
  expect((await f.claim()).jobs).toEqual([]);
  const fresh = await f.execute("status");
  expect(fresh.id).not.toBe(job.id);
  await f.claim();
  f.advance(301);
  await f.claim();
  const inspect = await f.execute("status");
  expect(inspect.action).toBe("status");
  const persisted = JSON.parse(await readFile(join(f.root, fresh.id + ".json"), "utf8"));
  expect(persisted.status).toBe("needs-reconciliation");
  await expect(
    f.broker.complete("paired", fresh.id, { status: "succeeded", snapshot: f.snapshot }),
  ).rejects.toThrow("job-denied");
  await writeFile(join(f.root, inspect.id + ".json"), "{}");
  await expect(f.claim()).rejects.toThrow();
});
it("opens only one native request, claims it once and accepts an expiring owner-bound selection without publishing", async () => {
  const f = await fixture(),
    id = "gpick_" + "a".repeat(32);
  const claim = () =>
    f.broker.claim("paired", { version: 1, capability: 1, gitReady: true, picker: 1 });
  const input = { version: 1, requestId: id, deviceId };
  await expect(f.broker.pick("usr_alice", "ws_team", input)).rejects.toThrow(
    "native-picker-update-required",
  );
  await claim();
  const queued = await f.broker.pick("usr_alice", "ws_team", input);
  expect(await f.broker.pick("usr_alice", "ws_team", input)).toEqual(queued);
  expect(
    (
      await f.broker.pick("usr_alice", "ws_team", {
        ...input,
        requestId: "gpick_" + "b".repeat(32),
      })
    ).requestId,
  ).toBe(id);
  await expect(f.broker.picker("usr_bob", "ws_team", id)).rejects.toThrow("picker-not-found");
  await expect(f.broker.completePicker("paired", id, { status: "cancelled" })).rejects.toThrow(
    "picker-scope-denied",
  );
  expect((await claim()).pickers?.map((p) => p.requestId)).toEqual([id]);
  expect((await claim()).pickers).toEqual([]);
  await expect(
    f.broker.completePicker("paired", id, {
      status: "selected",
      root: "\\\\server\\share\\",
      path: "project",
    }),
  ).rejects.toThrow("picker-path-denied");
  f.advance(40);
  await f.broker.completePicker("paired", id, {
    status: "selected",
    root: "D:\\",
    path: "project",
  });
  await expect(f.broker.completePicker("paired", id, { status: "cancelled" })).rejects.toThrow(
    "picker-scope-denied",
  );
  const selected = await f.broker.select("usr_alice", "ws_team", {
    version: 1,
    deviceId,
    browseRequestId: id,
    root: "D:\\",
    path: "project",
  });
  expect(selected.binding.repositoryId).toBeNull();
  expect((await f.broker.state("usr_alice", "ws_team")).devices[0]?.gitReady).toBe(false);
  expect(f.publisher.publish).not.toHaveBeenCalled();
  await f.claim();
  await f.broker.complete("paired", selected.id, { status: "succeeded", snapshot: f.snapshot });
  f.advance(91);
  await claim();
  await expect(
    f.broker.select("usr_alice", "ws_team", {
      version: 1,
      deviceId,
      browseRequestId: id,
      root: "D:\\",
      path: "project",
    }),
  ).rejects.toThrow("folder-proof-denied");
});
it("retains cancel/expiry outcomes, never replays a stale native prompt and rejects cross-scope requests", async () => {
  const f = await fixture(),
    id = "gpick_" + "c".repeat(32);
  const claim = () =>
    f.broker.claim("paired", { version: 1, capability: 1, gitReady: false, picker: 1 });
  const input = { version: 1, deviceId, requestId: id };
  await claim();
  await expect(f.broker.pick("usr_bob", "ws_team", input)).rejects.toThrow("device-denied");
  await f.broker.pick("usr_alice", "ws_team", input);
  await claim();
  await f.broker.completePicker("paired", id, { status: "cancelled" });
  expect((await f.broker.pick("usr_alice", "ws_team", input)).status).toBe("cancelled");
  expect((await claim()).pickers).toEqual([]);
  const next = { ...input, requestId: "gpick_" + "d".repeat(32) };
  await f.broker.pick("usr_alice", "ws_team", next);
  await claim();
  f.advance(91);
  await claim();
  expect((await f.broker.picker("usr_alice", "ws_team", next.requestId)).result).toEqual({
    status: "failed",
    errorCode: "git-desktop-picker-expired",
  });
  expect((await f.broker.pick("usr_alice", "ws_team", next)).status).toBe("failed");
  await expect(
    f.broker.completePicker("paired", next.requestId, {
      status: "selected",
      root: "/",
      path: "project",
    }),
  ).rejects.toThrow("picker-scope-denied");
  await expect(f.broker.picker("usr_alice", "ws_other", id)).rejects.toThrow("picker-not-found");
  await expect(f.broker.picker("usr_alice", "ws_team", "gpick_" + "e".repeat(32))).rejects.toThrow(
    "picker-not-found",
  );
});
