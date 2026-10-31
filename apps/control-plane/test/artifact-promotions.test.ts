import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, win32 } from "node:path";
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
  // Historical backend-only receipts remain readable and retain their denials.
  delete target.releaseMode;
  delete target.frontend;
  delete target.managedUpdates;
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

it("requires both component identities and explicit application approval for a verified managed update", async () => {
  const application = PromotionRegistrySchema.parse(
    JSON.parse(
      await readFile(
        new URL("../../../deployment/servix/PromotionRegistry.json", import.meta.url),
        "utf8",
      ),
    ),
  ).targets[0]!;
  target = application;
  await writeFile(registryFile, JSON.stringify({ version: 1, targets: [target] }));
  const service = store();
  await service.prepare(actor, preparation());
  const value = review();
  value.process.taskAlreadyExists = true;
  value.process.managedRuntimeVerified = true;
  value.process.previousPromotionId = id(99);
  await prepared(value);
  await expect(
    service.approve(actor, { ...approval(), reviewSha256: promotionDigest(value) }),
  ).rejects.toThrow("expired-or-unready");
  value.artifact.frontend = {
    descriptor: `frontend/.releases/${"9".repeat(64)}/artifact.json`,
    sha256: "9".repeat(64),
    indexSha256: "8".repeat(64),
    files: 3,
    bytes: 128,
  };
  await prepared(value);
  await expect(
    service.approve(actor, { ...approval(), reviewSha256: promotionDigest(value) }),
  ).rejects.toThrow("expired-or-unready");
  const wrong = { ...value, process: { ...value.process, managedRuntimeVerified: false } };
  await prepared(wrong);
  await expect(
    service.approve(actor, {
      ...approval(),
      confirmation: "promote-reviewed-application-to-production",
      reviewSha256: promotionDigest(wrong),
    }),
  ).rejects.toThrow("expired-or-unready");
  await prepared(value);
  const job = await service.approve(actor, {
    ...approval(),
    confirmation: "promote-reviewed-application-to-production",
    acknowledgements: { ...approval().acknowledgements, developmentAccepted: true },
    reviewSha256: promotionDigest(value),
  });
  expect(job.target.frontend?.root).toBe("frontend");
  expect(job.approval?.confirmation).toBe("promote-reviewed-application-to-production");
  const result = {
    version: 1,
    id: job.id,
    status: "succeeded",
    updatedAt: clock.toISOString(),
    stage: "production-succeeded",
    healthVerified: true,
    runtimeTaskRegistered: true,
    artifactDigest: value.artifact.bundleSha256,
    sourceHead: value.artifact.sourceHead,
  };
  const resultFile = join(root, `results/${job.id}.json`);
  await writeFile(resultFile, JSON.stringify(result));
  await expect(service.state(actor)).rejects.toThrow("incomplete-application-result");
  await writeFile(
    resultFile,
    JSON.stringify({ ...result, frontendVerified: true, frontendDigest: "0".repeat(64) }),
  );
  await expect(service.state(actor)).rejects.toThrow("incomplete-application-result");
  await writeFile(
    resultFile,
    JSON.stringify({
      ...result,
      frontendVerified: true,
      frontendDigest: value.artifact.frontend.sha256,
    }),
  );
  expect((await service.state(actor)).jobs.find((x) => x.job.id === job.id)?.result?.status).toBe(
    "succeeded",
  );
});

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

it("repairs only missing completed frontend metadata from timely consumed native evidence, with an audited atomic native write", async () => {
  clock = new Date(Date.now() - 60 * 60000);
  await beat();
  target = PromotionRegistrySchema.parse(
    JSON.parse(
      await readFile(
        new URL("../../../deployment/servix/PromotionRegistry.json", import.meta.url),
        "utf8",
      ),
    ),
  ).targets[0]!;
  await writeFile(registryFile, JSON.stringify({ version: 1, targets: [target] }));
  const service = store();
  await service.prepare(actor, preparation());
  const value = review();
  value.createdAt = clock.toISOString();
  value.expiresAt = new Date(clock.getTime() + 15 * 60000).toISOString();
  value.backup.createdAt = clock.toISOString();
  value.process.taskAlreadyExists = true;
  value.process.managedRuntimeVerified = true;
  value.process.previousPromotionId = id(99);
  value.artifact.frontend = {
    descriptor: `frontend/.releases/${"9".repeat(64)}/artifact.json`,
    sha256: "9".repeat(64),
    indexSha256: "8".repeat(64),
    files: 3,
    bytes: 128,
  };
  value.privateSnapshotSha256 = promotionDigest({});
  value.runtimeSha256 = promotionDigest({});
  await prepared(value);
  const job = await service.approve(actor, {
    ...approval(),
    reviewSha256: promotionDigest(value),
    confirmation: "promote-reviewed-application-to-production",
    acknowledgements: { ...approval().acknowledgements, developmentAccepted: true },
  });
  const privateRoot = join(root, "private"),
    claim = join(privateRoot, "claims", job.id),
    prep = join(privateRoot, "claims", value.id);
  await mkdir(claim, { recursive: true });
  await mkdir(prep, { recursive: true });
  await writeFile(join(prep, "prepared-context.json"), "{}");
  await writeFile(join(prep, "operator-hashes.json"), "{}");
  const jobFile = join(claim, `${job.id}.json`),
    reviewFile = join(prep, "review.json"),
    consumedFile = join(claim, "approval-consumed.json"),
    receiptFile = join(claim, "target-receipt.json"),
    resultFile = join(root, "results", `${job.id}.json`);
  const sealed = { review: value, sha256: promotionDigest(value) };
  const consumed = {
    version: 1,
    id: job.id,
    reviewSha256: sealed.sha256,
    targetSha256: job.targetSha256,
    workspaceId: workspace,
    actor,
    artifact: value.artifact,
    consumedAt: new Date(clock.getTime() + 100).toISOString(),
  };
  const receipt = {
    status: "succeeded",
    healthVerified: true,
    runtimeTaskRegistered: true,
    protectedFilesVerified: value.protection.files,
    batchLogonAssigned: false,
    frontendDigest: value.artifact.frontend.sha256,
    frontendVerified: true,
    runtime: win32.join(target.root, ".runtime", "devsetu-promotions", job.id),
    configurationSha256: "3".repeat(64),
  };
  const previous = {
    version: 1,
    id: job.id,
    status: "succeeded",
    stage: "production-succeeded",
    updatedAt: new Date(clock.getTime() + 1000).toISOString(),
    healthVerified: true,
    runtimeTaskRegistered: true,
    protectedFilesVerified: value.protection.files,
    batchLogonAssigned: false,
    artifactDigest: value.artifact.bundleSha256,
    sourceHead: value.artifact.sourceHead,
  };
  const put = async (file: string, body: unknown) => writeFile(file, JSON.stringify(body));
  await put(jobFile, job);
  await put(reviewFile, sealed);
  await put(consumedFile, consumed);
  await put(receiptFile, receipt);
  await put(resultFile, previous);
  const project = () =>
    native("project-completed-result", jobFile, reviewFile, consumedFile, receiptFile, resultFile);
  await expect(service.state(actor)).rejects.toThrow("incomplete-application-result");
  const projected = await project();
  expect(projected.result).toEqual({
    ...previous,
    frontendDigest: receipt.frontendDigest,
    frontendVerified: true,
  });
  expect(projected.audit).toMatchObject({
    action: "promotion.result-projection-repair.v1",
    id: job.id,
    workspaceId: workspace,
    actor: "system-promotion-worker",
    owner: actor,
    beforeFileSha256: promotionDigest(previous),
    applicationChanged: false,
    approvalCreated: false,
    consumedAt: consumed.consumedAt,
  });
  for (const [file, invalid, original] of [
    [consumedFile, { ...consumed, consumedAt: value.expiresAt }, consumed],
    [consumedFile, { ...consumed, actor: "usr_other" }, consumed],
    [receiptFile, { ...receipt, frontendVerified: false }, receipt],
    [receiptFile, { ...receipt, frontendDigest: "0".repeat(64) }, receipt],
    [receiptFile, { ...receipt, runtime: win32.join(target.root, ".runtime", "other") }, receipt],
    [resultFile, { ...previous, status: "failed" }, previous],
    [resultFile, { ...previous, frontendVerified: true }, previous],
    [reviewFile, { ...sealed, review: { ...value, workspaceId: "ws_other" } }, sealed],
  ] as const) {
    await put(file, invalid);
    await expect(project()).rejects.toThrow();
    await put(file, original);
  }
  if (process.platform === "win32") {
    const script = join(root, "repair.ps1"),
      publicAudit = join(root, "audit", `${job.id}.result-projection-v1.json`);
    await mkdir(publicAudit); // Audit persistence collision must prevent the result write.
    await writeFile(
      script,
      `param([string]$Worker,[string]$Node,[string]$Private,[string]$Public,[string]$Claim)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
$module=Import-Module $Worker -Force -PassThru
$id=Split-Path $Claim -Leaf;$file=Join-Path $Public ('results/'+$id+'.json')
$before=(Get-FileHash $file).Hash
try{& $module {param($p,$u,$c,$n,$r) Repair-PromotionResultProjection $p $u $c $n $r} $Private $Public $Claim $Node (Get-Content $file -Raw|ConvertFrom-Json)}catch{
 if((Get-FileHash $file).Hash -cne $before){throw 'Result changed despite audit collision'}
 [Console]::Out.Write('audit-denied');exit 0
}
throw 'Audit collision did not deny repair'
`,
    );
    // biome-ignore lint/complexity/useLiteralKeys: native environment uses index signatures.
    const ps = join(process.env["WINDIR"]!, "System32/WindowsPowerShell/v1.0/powershell.exe");
    const worker = fileURLToPath(
      new URL("../../../deployment/servix/PromotionWorker.psm1", import.meta.url),
    );
    const args = [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "RemoteSigned",
      "-File",
      script,
      "-Worker",
      worker,
      "-Node",
      process.execPath,
      "-Private",
      privateRoot,
      "-Public",
      root,
      "-Claim",
      claim,
    ];
    const nativeOptions = {
      windowsHide: true,
      env: Object.fromEntries(
        Object.entries(process.env).filter(([key]) => key.toLowerCase() !== "psmodulepath"),
      ),
    };
    expect((await execute(ps, args, nativeOptions)).stdout).toBe("audit-denied");
    await rm(publicAudit, { recursive: true });
    await writeFile(
      script,
      `param([string]$Worker,[string]$Node,[string]$Private,[string]$Public,[string]$Claim)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
$module=Import-Module $Worker -Force -PassThru;$id=Split-Path $Claim -Leaf;$file=Join-Path $Public ('results/'+$id+'.json')
1..2|ForEach-Object {& $module {param($p,$u,$c,$n,$r) Repair-PromotionResultProjection $p $u $c $n $r} $Private $Public $Claim $Node (Get-Content $file -Raw|ConvertFrom-Json)}
`,
    );
    await execute(ps, args, nativeOptions);
    expect(JSON.parse(await readFile(resultFile, "utf8"))).toEqual(projected.result);
    expect(
      JSON.parse(await readFile(join(claim, "result-projection-v1.before.json"), "utf8")),
    ).toEqual(previous);
    expect(await readFile(publicAudit, "utf8")).toBe(
      await readFile(join(claim, "result-projection-v1.audit.json"), "utf8"),
    );
    const applied = JSON.parse(
      await readFile(join(claim, "result-projection-v1.applied.json"), "utf8"),
    );
    expect(applied.applicationChanged).toBe(false);
  } else {
    await put(resultFile, projected.result);
  }
  expect((await service.state(actor)).jobs.find((x) => x.job.id === job.id)?.result).toEqual(
    projected.result,
  );
});
