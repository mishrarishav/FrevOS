import { createHash, randomUUID } from "node:crypto";
import { link, lstat, mkdir, open, readdir, readFile, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  type DeploymentSettings,
  PromotionApproveInputSchema,
  PromotionIdSchema,
  type PromotionJob,
  PromotionJobSchema,
  PromotionPrepareInputSchema,
  PromotionRegistrySchema,
  PromotionResultSchema,
  type PromotionState,
  type PromotionTarget,
} from "@frevos/contracts";
import { ServixDeploymentError } from "./servix-deployment.js";

export const promotionDigest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
function fail(code: string, status = 409): never {
  throw new ServixDeploymentError(code, status);
}
export class ArtifactPromotions {
  private chain: Promise<unknown> = Promise.resolve();
  constructor(
    readonly root: string,
    readonly workspaceId: string,
    private readonly registryFile: string,
    private readonly authorize: (actor: string, write: boolean) => Promise<boolean>,
    private readonly profile: (id: string) => Promise<DeploymentSettings>,
    private readonly now = () => new Date(),
  ) {}
  private async permission(actor: string, write: boolean) {
    if (!(await this.authorize(actor, write))) fail("promotion-access-denied", 403);
  }
  private async plain(file: string) {
    for (let p = resolve(file); ; p = dirname(p)) {
      try {
        if ((await lstat(p)).isSymbolicLink()) fail("promotion-storage-unavailable", 503);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
      if (dirname(p) === p) return;
    }
  }
  private async read(file: string) {
    await this.plain(file);
    const stat = await lstat(file);
    if (!stat.isFile() || stat.size > 128 * 1024) fail("promotion-storage-unavailable", 503);
    return JSON.parse(await readFile(file, "utf8"));
  }
  private async publish(directory: string, id: string, value: unknown) {
    await this.plain(directory);
    await mkdir(directory, { recursive: true });
    const temporary = join(directory, `${id}.${randomUUID()}.tmp`);
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(JSON.stringify(value));
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await link(temporary, join(directory, `${id}.json`));
    } finally {
      await unlink(temporary);
    }
  }
  private async targets(actor: string) {
    const registry = PromotionRegistrySchema.parse(await this.read(this.registryFile));
    if (new Set(registry.targets.map((t) => t.profileId)).size !== registry.targets.length)
      fail("promotion-target-conflict", 503);
    return registry.targets.filter(
      (t) => t.workspaceId === this.workspaceId && t.ownerId === actor,
    );
  }
  private async boundTarget(actor: string, id: string, revision: number) {
    const target = (await this.targets(actor)).find((t) => t.profileId === id);
    if (!target) fail("promotion-target-not-found", 404);
    const profile = await this.profile(id);
    if (
      profile.revision !== revision ||
      profile.archived ||
      profile.destination.host !== target.host ||
      profile.destination.root !== target.root ||
      new URL(profile.destination.siteUrl).origin !== new URL(target.publicHealthUrl).origin ||
      JSON.stringify(profile.preservedPaths) !== JSON.stringify(target.preservedPaths)
    )
      fail("promotion-configuration-changed");
    return target;
  }
  private async records() {
    const directory = join(this.root, "jobs");
    await this.plain(directory);
    await mkdir(directory, { recursive: true });
    const names = (await readdir(directory)).filter((s) => /^pm_[a-f0-9]{32}\.json$/.test(s));
    if (names.length > 1000) fail("promotion-capacity", 503);
    return Promise.all(
      names.map(async (name) => {
        const job = PromotionJobSchema.parse(await this.read(join(directory, name)));
        if (name !== `${job.id}.json` || job.workspaceId !== this.workspaceId)
          fail("promotion-record-scope", 503);
        return job;
      }),
    );
  }
  private async result(job: PromotionJob) {
    try {
      const result = PromotionResultSchema.parse(
        await this.read(join(this.root, "results", `${job.id}.json`)),
      );
      if (result.id !== job.id) fail("promotion-result-scope", 503);
      if (
        result.review &&
        (result.review.id !== job.id ||
          result.review.workspaceId !== job.workspaceId ||
          result.review.requestedBy !== job.requestedBy ||
          result.review.profileId !== job.target.profileId ||
          result.review.profileRevision !== job.profileRevision ||
          result.review.targetSha256 !== job.targetSha256 ||
          result.review.developmentRequestId !== job.developmentRequestId ||
          promotionDigest(result.review) !== result.reviewSha256)
      )
        fail("promotion-review-integrity", 503);
      return result;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }
  private async online() {
    try {
      const value = await this.read(join(this.root, "results", "heartbeat.json"));
      const age = this.now().getTime() - Date.parse(value.at);
      return (
        value.version === 1 &&
        value.workspaceId === this.workspaceId &&
        Number.isFinite(age) &&
        age >= 0 &&
        age < 20000
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw e;
    }
  }
  async state(actor: string): Promise<PromotionState> {
    await this.permission(actor, false);
    const targets = await this.targets(actor);
    const jobs = (await this.records())
      .filter(
        (j) => j.requestedBy === actor && targets.some((t) => t.profileId === j.target.profileId),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 30);
    return {
      online: await this.online(),
      targets,
      jobs: await Promise.all(jobs.map(async (job) => ({ job, result: await this.result(job) }))),
    };
  }
  private serialize<T>(action: () => Promise<T>): Promise<T> {
    const next = this.chain.then(action);
    this.chain = next.catch(() => undefined);
    return next;
  }
  private async idle(target: PromotionTarget, jobs: PromotionJob[]) {
    for (const job of jobs.filter((j) => j.target.profileId === target.profileId)) {
      const result = await this.result(job);
      if (!result || ["working", "recovery-required"].includes(result.status))
        fail("promotion-target-busy-or-unresolved");
    }
  }
  private async enqueue(job: PromotionJob) {
    // Required audit is immutable and fsynced before publishing executable work.
    await this.publish(join(this.root, "audit"), job.id, {
      event: "promotion-request-authorized",
      ...job,
    });
    await this.publish(join(this.root, "jobs"), job.id, job);
    return job;
  }
  async prepare(actor: string, input: unknown) {
    return this.serialize(async () => {
      await this.permission(actor, true);
      const request = PromotionPrepareInputSchema.parse(input);
      const target = await this.boundTarget(actor, request.profileId, request.expectedRevision);
      const jobs = await this.records();
      const existing = jobs.find((j) => j.id === request.requestId);
      if (existing) {
        if (
          existing.action !== "prepare" ||
          existing.requestedBy !== actor ||
          existing.targetSha256 !== promotionDigest(target) ||
          existing.profileRevision !== request.expectedRevision ||
          existing.developmentRequestId !== request.developmentRequestId
        )
          fail("promotion-request-conflict");
        return existing;
      }
      if (!(await this.online())) fail("promotion-worker-offline");
      await this.idle(target, jobs);
      return this.enqueue(
        PromotionJobSchema.parse({
          version: 1,
          id: request.requestId,
          workspaceId: this.workspaceId,
          requestedBy: actor,
          action: "prepare",
          target,
          targetSha256: promotionDigest(target),
          profileRevision: request.expectedRevision,
          createdAt: this.now().toISOString(),
          expiresAt: new Date(this.now().getTime() + 30 * 60000).toISOString(),
          developmentRequestId: request.developmentRequestId,
        }),
      );
    });
  }
  async approve(actor: string, input: unknown) {
    return this.serialize(async () => {
      await this.permission(actor, true);
      const request = PromotionApproveInputSchema.parse(input);
      const jobs = await this.records();
      const existing = jobs.find((j) => j.id === request.requestId);
      if (existing) {
        if (
          existing.requestedBy !== actor ||
          JSON.stringify(existing.approval) !== JSON.stringify(request)
        )
          fail("promotion-request-conflict");
        return existing;
      }
      const preparation = jobs.find(
        (j) => j.id === request.reviewId && j.requestedBy === actor && j.action === "prepare",
      );
      if (!preparation) fail("promotion-review-not-found", 404);
      const target = await this.boundTarget(
        actor,
        preparation.target.profileId,
        preparation.profileRevision,
      );
      if (promotionDigest(target) !== preparation.targetSha256) fail("promotion-target-changed");
      const result = await this.result(preparation);
      if (
        result?.status !== "prepared" ||
        !result.review ||
        result.reviewSha256 !== request.reviewSha256 ||
        Date.parse(result.review.expiresAt) <= this.now().getTime() ||
        Date.parse(result.review.createdAt) > this.now().getTime() ||
        Date.parse(result.review.backup.createdAt) < this.now().getTime() - 30 * 60000 ||
        (!result.review.process.batchLogonReady &&
          !request.acknowledgements.assignBatchLogonIfMissing) ||
        result.review.process.taskAlreadyExists
      )
        fail("promotion-review-expired-or-unready");
      if (jobs.some((j) => j.action === "promote" && j.reviewId === request.reviewId))
        fail("promotion-approval-already-used");
      if (!(await this.online())) fail("promotion-worker-offline");
      await this.idle(target, jobs);
      const expiresAt = new Date(
        Math.min(this.now().getTime() + 5 * 60000, Date.parse(result.review.expiresAt)),
      ).toISOString();
      return this.enqueue(
        PromotionJobSchema.parse({
          version: 1,
          id: PromotionIdSchema.parse(request.requestId),
          workspaceId: this.workspaceId,
          requestedBy: actor,
          action: "promote",
          target,
          targetSha256: preparation.targetSha256,
          profileRevision: preparation.profileRevision,
          createdAt: this.now().toISOString(),
          expiresAt,
          developmentRequestId: preparation.developmentRequestId,
          reviewId: preparation.id,
          reviewSha256: request.reviewSha256,
          approval: request,
        }),
      );
    });
  }
}
