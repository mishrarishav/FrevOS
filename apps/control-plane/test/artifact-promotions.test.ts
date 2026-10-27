import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  type DeploymentSettings,
  PromotionRegistrySchema,
  PromotionReviewSchema,
} from "@frevos/contracts";
import { afterEach, beforeEach, expect, it } from "vitest";
import { ArtifactPromotions, promotionDigest } from "../src/artifact-promotions.js";

let root: string, registryFile: string, clock: Date, profile: DeploymentSettings;
const actor = "usr_windows_admin",
  workspace = "ws_server20";
const id = (n: number) => `pm_${n.toString(16).padStart(32, "0")}`;
const sourceId = `sd_${"a".repeat(32)}`;
const execute = promisify(execFile);
const protocol = fileURLToPath(
  new URL("../../../deployment/servix/PromotionProtocol.mjs", import.meta.url),
);
async function native(action: string, ...args: string[]) {
  const result = await execute(process.execPath, [protocol, action, ...args], {
    windowsHide: true,
    timeout: 15000,
    maxBuffer: 65536,
    env: { ...process.env, NODE_OPTIONS: "" },
  });
  return JSON.parse(result.stdout);
}
let target: ReturnType<typeof PromotionRegistrySchema.parse>["targets"][number];
let allowed: boolean;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "devsetu-promotion-store-"));
  registryFile = join(root, "registry.json");
  target = PromotionRegistrySchema.parse(
    JSON.parse(
      await readFile(
        new URL("../../../deployment/servix/PromotionRegistry.json", import.meta.url),
        "utf8",
      ),
    ),
  ).targets[0]!;
  clock = new Date("2026-10-27T00:00:00.000Z");
  allowed = true;
  profile = {
    version: 1,
    profileId: target.profileId,
    displayName: "Production",
    repositoryOrigin: "//10.9.69.20/e$/FrevOS/git/servix.git",
    sourceFolder: "D:\\servixDev",
    revision: 1,
    updatedAt: clock.toISOString(),
    updatedBy: actor,
    runner: "not-connected",
    destination: {
      host: target.host,
      root: target.root,
      siteUrl: "https://support.eesl.co.in/",
      credentialProfile: "not-connected",
    },
    preservedPaths: target.preservedPaths,
  };
  await writeFile(registryFile, JSON.stringify({ version: 1, targets: [target] }));
  await mkdir(join(root, "results"));
  await beat();
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
function store(ws = workspace) {
  return new ArtifactPromotions(
    root,
    ws,
    registryFile,
    async () => allowed,
    async () => profile,
    () => clock,
  );
}
async function beat(at = clock.toISOString()) {
  await writeFile(
    join(root, "results/heartbeat.json"),
    JSON.stringify({ version: 1, workspaceId: workspace, at }),
  );
}
const preparation = (n = 1) => ({
  version: 1,
  requestId: id(n),
  profileId: "servix-production",
  expectedRevision: 1,
  developmentRequestId: sourceId,
});
const approval = (n = 2) => ({
  version: 1,
  requestId: id(n),
  reviewId: id(1),
  reviewSha256: promotionDigest(review()),
  confirmation: "promote-reviewed-backend-to-production",
  changeDetails: {
    message: "Promote exact saved backend with protected files",
    approvedBy: "Owner / bounded fixture approval",
  },
  acknowledgements: {
    retainedDependencyRisk: true,
    startupDatabaseEffects: true,
    briefInterruption: true,
    sameOwnerCredentialBinding: true,
    codeRecoveryDoesNotRestoreDatabase: true,
    assignBatchLogonIfMissing: false,
  },
});
function review() {
  return PromotionReviewSchema.parse({
    version: 1,
    id: id(1),
    workspaceId: workspace,
    requestedBy: actor,
    profileId: target.profileId,
    profileRevision: 1,
    targetSha256: promotionDigest(target),
    createdAt: "2026-10-27T00:00:00.000Z",
    expiresAt: "2026-10-27T00:15:00.000Z",
    developmentRequestId: sourceId,
    artifact: {
      sourceHead: "a".repeat(40),
      releaseManifestSha256: "b".repeat(64),
      descriptorSha256: "c".repeat(64),
      bundleSha256: "d".repeat(64),
    },
    process: {
      pid: 1234,
      createdAt: "2026-09-28T00:00:00.000Z",
      owner: "fixture-owner",
      nodeVersion: target.nodeVersion,
      batchLogonReady: true,
      taskAlreadyExists: false,
    },
    protection: { files: 12, bytes: 42, sha256: "e".repeat(64) },
    backup: {
      reference: `promotion-backup/${id(1)}`,
      createdAt: "2026-10-27T00:00:00.000Z",
      sha256: "f".repeat(64),
      bytes: 1024,
      databaseVersion: target.databaseVersion,
      encrypted: true,
      integrityVerified: true,
      isolatedRestoreTested: false,
    },
    runtimeSha256: "1".repeat(64),
    privateSnapshotSha256: "2".repeat(64),
  });
}
async function prepared(value = review(), status = "prepared", digest = promotionDigest(value)) {
  await writeFile(
    join(root, `results/${id(1)}.json`),
    JSON.stringify({
      version: 1,
      id: id(1),
      status,
      stage: "fixture-prepared",
      updatedAt: clock.toISOString(),
      review: value,
      reviewSha256: digest,
    }),
  );
}
it("persists an immutable audit before a single exact actor/workspace/target/artifact request", async () => {
  const service = store();
  const job = await service.prepare(actor, preparation());
  expect(job).toMatchObject({
    requestedBy: actor,
    workspaceId: workspace,
    action: "prepare",
    targetSha256: promotionDigest(target),
  });
  expect(JSON.parse(await readFile(join(root, `audit/${id(1)}.json`), "utf8")).event).toBe(
    "promotion-request-authorized",
  );
  expect(await service.prepare(actor, preparation())).toEqual(job);
  await expect(
    service.prepare(actor, { ...preparation(), developmentRequestId: `sd_${"b".repeat(32)}` }),
  ).rejects.toThrow("request-conflict");
  await expect(service.prepare(actor, preparation(3))).rejects.toThrow("busy");
  await prepared();
  const promoted = await service.approve(actor, approval());
  expect(promoted).toMatchObject({
    action: "promote",
    reviewId: id(1),
    reviewSha256: promotionDigest(review()),
    expiresAt: "2026-10-27T00:05:00.000Z",
  });
  expect(await service.approve(actor, approval())).toEqual(promoted);
  await expect(
    service.approve(actor, {
      ...approval(),
      changeDetails: { message: "different", approvedBy: "different" },
    }),
  ).rejects.toThrow("request-conflict");
  await expect(service.approve(actor, approval(3))).rejects.toThrow("already-used");
  const state = await service.state(actor);
  expect(state.jobs).toHaveLength(2);
  expect(state.online).toBe(true);
});
it("denies unknown actors, cross-workspace targets, command injection and configuration drift", async () => {
  const service = store();
  allowed = false;
  await expect(service.state(actor)).rejects.toThrow("access-denied");
  await expect(service.prepare(actor, preparation())).rejects.toThrow("access-denied");
  allowed = true;
  expect((await store("ws_other").state(actor)).targets).toEqual([]);
  await expect(store("ws_other").prepare(actor, preparation())).rejects.toThrow("target-not-found");
  await expect(service.prepare("usr_other", preparation())).rejects.toThrow("target-not-found");
  await expect(
    service.prepare(actor, { ...preparation(), shell: "do anything" }),
  ).rejects.toThrow();
  profile.destination.root = "D:\\unapproved";
  await expect(service.prepare(actor, preparation())).rejects.toThrow("configuration-changed");
  profile.destination.root = target.root;
  profile.revision = 2;
  await expect(service.prepare(actor, preparation())).rejects.toThrow("configuration-changed");
  profile.revision = 1;
  profile.archived = true;
  await expect(service.prepare(actor, preparation())).rejects.toThrow("configuration-changed");
  profile.archived = false;
  profile.preservedPaths = [];
  await expect(service.prepare(actor, preparation())).rejects.toThrow("configuration-changed");
});
it("fails closed on heartbeat future/expiry and required audit persistence", async () => {
  const service = store();
  await beat("2026-10-27T00:00:01.000Z");
  expect((await service.state(actor)).online).toBe(false);
  await expect(service.prepare(actor, preparation())).rejects.toThrow("offline");
  await rm(join(root, "results/heartbeat.json"));
  expect((await service.state(actor)).online).toBe(false);
  await beat();
  await mkdir(join(root, "audit"));
  await writeFile(join(root, `audit/${id(1)}.json`), "collision");
  await expect(service.prepare(actor, preparation())).rejects.toThrow();
  await expect(readFile(join(root, `jobs/${id(1)}.json`))).rejects.toThrow();
});
it("rejects mismatched worker review, stale backup, expired scope and reused preparation IDs", async () => {
  const service = store();
  await service.prepare(actor, preparation());
  await expect(service.approve(actor, approval())).rejects.toThrow("expired-or-unready");
  await expect(service.approve(actor, { ...approval(), reviewId: id(9) })).rejects.toThrow(
    "review-not-found",
  );
  await prepared(review(), "prepared", "0".repeat(64));
  await expect(service.state(actor)).rejects.toThrow("review-integrity");
  const wrong = { ...review(), workspaceId: "ws_other" };
  await prepared(wrong);
  await expect(service.state(actor)).rejects.toThrow("review-integrity");
  await prepared();
  const bad = { ...approval(), reviewSha256: "0".repeat(64) };
  await expect(service.approve(actor, bad)).rejects.toThrow("expired-or-unready");
  clock = new Date("2026-10-27T00:16:00.000Z");
  await beat();
  await expect(service.approve(actor, approval())).rejects.toThrow("expired-or-unready");
  clock = new Date("2026-10-27T00:00:00.000Z");
  const stale = review();
  stale.backup.createdAt = "2026-10-26T23:00:00.000Z";
  await prepared(stale);
  await expect(
    service.approve(actor, { ...approval(), reviewSha256: promotionDigest(stale) }),
  ).rejects.toThrow("expired-or-unready");
  const existingTask = review();
  const missingBatch = review();
  missingBatch.process.batchLogonReady = false;
  await prepared(missingBatch);
  await expect(
    service.approve(actor, { ...approval(), reviewSha256: promotionDigest(missingBatch) }),
  ).rejects.toThrow("expired-or-unready");
  existingTask.process.taskAlreadyExists = true;
  await prepared(existingTask);
  await expect(
    service.approve(actor, { ...approval(), reviewSha256: promotionDigest(existingTask) }),
  ).rejects.toThrow("expired-or-unready");
});
it("rechecks target registry, roles, worker availability and unresolved work at approval", async () => {
  const service = store();
  await service.prepare(actor, preparation());
  await prepared();
  allowed = false;
  await expect(service.approve(actor, approval())).rejects.toThrow("access-denied");
  allowed = true;
  const changed = { ...target, taskName: "Changed-Task" };
  await writeFile(registryFile, JSON.stringify({ version: 1, targets: [changed] }));
  await expect(service.approve(actor, approval())).rejects.toThrow("target-changed");
  await writeFile(registryFile, JSON.stringify({ version: 1, targets: [target] }));
  await beat("2026-10-26T23:59:00.000Z");
  await expect(service.approve(actor, approval())).rejects.toThrow("offline");
  await beat();
  await writeFile(
    join(root, `results/${id(1)}.json`),
    JSON.stringify({
      version: 1,
      id: id(1),
      status: "recovery-required",
      stage: "interrupted",
      updatedAt: clock.toISOString(),
    }),
  );
  await expect(service.prepare(actor, preparation(3))).rejects.toThrow("busy-or-unresolved");
});
it("rejects duplicate registry entries, symlinks, oversized records and mismatched job identities", async () => {
  const service = store();
  await writeFile(registryFile, JSON.stringify({ version: 1, targets: [target, target] }));
  await expect(service.state(actor)).rejects.toThrow("target-conflict");
  await writeFile(registryFile, JSON.stringify({ version: 1, targets: [target] }));
  await service.prepare(actor, preparation());
  const file = join(root, `jobs/${id(1)}.json`),
    job = JSON.parse(await readFile(file, "utf8"));
  await writeFile(file, JSON.stringify({ ...job, workspaceId: "ws_other" }));
  await expect(service.state(actor)).rejects.toThrow("record-scope");
  await writeFile(file, JSON.stringify({ ...job, id: id(3) }));
  await expect(service.state(actor)).rejects.toThrow("record-scope");
  await writeFile(file, "x".repeat(128 * 1024 + 1));
  await expect(service.state(actor)).rejects.toThrow("storage-unavailable");
  await rm(file);
  const elsewhere = join(root, "elsewhere");
  await mkdir(elsewhere);
  await rm(join(root, "jobs"), { recursive: true });
  await symlink(elsewhere, join(root, "jobs"), process.platform === "win32" ? "junction" : "dir");
  await expect(service.state(actor)).rejects.toThrow("storage-unavailable");
});
import { execFile } from "node:child_process";

it("revalidates a real queued job through the standalone native protocol and rejects changed scope or expiry", async () => {
  clock = new Date();
  await beat();
  const job = await store().prepare(actor, preparation());
  const jobFile = join(root, `jobs/${job.id}.json`),
    profileFile = join(root, "profile.json");
  await writeFile(profileFile, JSON.stringify(profile));
  expect(await native("validate", jobFile, registryFile, profileFile)).toEqual(job);
  for (const changed of [
    { ...job, requestedBy: "usr_other" },
    { ...job, workspaceId: "ws_other" },
    { ...job, target: { ...job.target, root: "D:\\unapproved" } },
    { ...job, expiresAt: new Date(clock.getTime() - 1).toISOString() },
    { ...job, createdAt: new Date(clock.getTime() + 60000).toISOString() },
    { ...job, shell: "unrestricted" },
  ]) {
    await writeFile(jobFile, JSON.stringify(changed));
    await expect(native("validate", jobFile, registryFile, profileFile)).rejects.toThrow();
  }
  await writeFile(jobFile, JSON.stringify(job));
  await writeFile(profileFile, JSON.stringify({ ...profile, revision: 2 }));
  await expect(native("validate", jobFile, registryFile, profileFile)).rejects.toThrow();
});

it("seals and verifies the exact native review, rejecting tampered bytes, actor and stale backup", async () => {
  clock = new Date();
  await beat();
  const service = store();
  await service.prepare(actor, preparation());
  const value = review();
  value.createdAt = clock.toISOString();
  value.expiresAt = new Date(clock.getTime() + 15 * 60000).toISOString();
  value.backup.createdAt = clock.toISOString();
  const inputFile = join(root, "review-input.json"),
    reviewFile = join(root, "sealed.json");
  await writeFile(inputFile, JSON.stringify(value));
  const sealed = await native("seal-review", inputFile, reviewFile);
  expect(sealed).toEqual({ review: value, sha256: promotionDigest(value) });
  // The exact private review cannot be overwritten by a repeated sealing step.
  await expect(native("seal-review", inputFile, reviewFile)).rejects.toThrow();
  await prepared(value);
  const job = await service.approve(actor, { ...approval(), reviewSha256: sealed.sha256 });
  const jobFile = join(root, `jobs/${job.id}.json`);
  expect(await native("verify-review", jobFile, reviewFile)).toEqual(value);
  await writeFile(
    reviewFile,
    JSON.stringify({ ...sealed, review: { ...value, requestedBy: "usr_other" } }),
  );
  await expect(native("verify-review", jobFile, reviewFile)).rejects.toThrow();
  const stale = {
    ...value,
    backup: { ...value.backup, createdAt: new Date(clock.getTime() - 31 * 60000).toISOString() },
  };
  await writeFile(reviewFile, JSON.stringify({ review: stale, sha256: promotionDigest(stale) }));
  await writeFile(
    jobFile,
    JSON.stringify({
      ...job,
      reviewSha256: promotionDigest(stale),
      approval: { ...job.approval, reviewSha256: promotionDigest(stale) },
    }),
  );
  await expect(native("verify-review", jobFile, reviewFile)).rejects.toThrow();
});
