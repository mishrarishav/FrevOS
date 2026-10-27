import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";

const contracts = await import(
  new URL("../../apps/control-plane/node_modules/@frevos/contracts/dist/index.js", import.meta.url)
    .href
);
const digest = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const json = async (p) => JSON.parse((await readFile(p, "utf8")).replace(/^\uFEFF/, ""));
try {
  const [action, ...args] = process.argv.slice(2);
  if (action === "validate") {
    const [jobFile, registryFile, profileFile] = args;
    const job = contracts.PromotionJobSchema.parse(await json(jobFile));
    const registry = contracts.PromotionRegistrySchema.parse(await json(registryFile));
    const profile = contracts.DeploymentSettingsSchema.parse(await json(profileFile));
    const target = registry.targets.find((t) => t.profileId === job.target.profileId);
    const now = Date.now(),
      issued = Date.parse(job.createdAt),
      expires = Date.parse(job.expiresAt);
    if (
      !target ||
      basename(jobFile) !== `${job.id}.json` ||
      job.workspaceId !== target.workspaceId ||
      job.requestedBy !== target.ownerId ||
      digest(target) !== job.targetSha256 ||
      digest(job.target) !== job.targetSha256 ||
      profile.profileId !== target.profileId ||
      profile.revision !== job.profileRevision ||
      profile.archived ||
      profile.destination.host !== target.host ||
      profile.destination.root !== target.root ||
      new URL(profile.destination.siteUrl).origin !== new URL(target.publicHealthUrl).origin ||
      JSON.stringify(profile.preservedPaths) !== JSON.stringify(target.preservedPaths) ||
      issued > now ||
      expires <= now ||
      expires <= issued ||
      expires - issued > (job.action === "prepare" ? 30 : 5) * 60000
    )
      throw Error();
    if (
      job.action === "promote" &&
      (!job.approval ||
        job.approval.requestId !== job.id ||
        job.approval.reviewId !== job.reviewId ||
        job.approval.reviewSha256 !== job.reviewSha256)
    )
      throw Error();
    process.stdout.write(JSON.stringify(job));
  } else if (action === "authorize") {
    const job = contracts.PromotionJobSchema.parse(await json(args[0]));
    const runtime = await json(args[1]);
    const { createDatabasePool } = await import(
      new URL("../../apps/control-plane/dist/database.js", import.meta.url).href
    );
    const { WorkspaceRepository } = await import(
      new URL("../../apps/control-plane/dist/repositories.js", import.meta.url).href
    );
    const pool = createDatabasePool(runtime.DATABASE_URL);
    try {
      const evidence = await new WorkspaceRepository(pool).getEvidence(
        job.workspaceId,
        job.requestedBy,
      );
      if (
        evidence?.workspace.status !== "active" ||
        evidence.membership?.status !== "active" ||
        job.requestedBy !== job.target.ownerId ||
        !evidence.membership.grantedScopes.includes("project:write")
      )
        throw Error();
      process.stdout.write('{"authorized":true}');
    } finally {
      await pool.end();
    }
  } else if (action === "seal-review") {
    const review = contracts.PromotionReviewSchema.parse(await json(args[0]));
    const envelope = { review, sha256: digest(review) };
    await writeFile(args[1], JSON.stringify(envelope), { flag: "wx", mode: 0o600 });
    process.stdout.write(JSON.stringify(envelope));
  } else if (action === "verify-review") {
    const job = contracts.PromotionJobSchema.parse(await json(args[0])),
      envelope = await json(args[1]);
    const review = contracts.PromotionReviewSchema.parse(envelope.review);
    if (
      digest(review) !== envelope.sha256 ||
      envelope.sha256 !== job.reviewSha256 ||
      review.id !== job.reviewId ||
      review.requestedBy !== job.requestedBy ||
      review.workspaceId !== job.workspaceId ||
      review.targetSha256 !== job.targetSha256 ||
      review.developmentRequestId !== job.developmentRequestId ||
      review.profileRevision !== job.profileRevision ||
      review.profileId !== job.target.profileId ||
      Date.parse(review.expiresAt) <= Date.now() ||
      Date.parse(review.backup.createdAt) < Date.now() - 30 * 60000 ||
      (review.process.taskAlreadyExists &&
        !(job.target.managedUpdates && review.process.managedRuntimeVerified)) ||
      (job.target.releaseMode === "application" &&
        (!job.target.frontend ||
          !review.artifact.frontend ||
          !job.approval.acknowledgements.developmentAccepted ||
          job.approval.confirmation !== "promote-reviewed-application-to-production"))
    )
      throw Error();
    process.stdout.write(JSON.stringify(review));
  } else throw Error();
} catch {
  process.stderr.write("Promotion protocol validation failed\n");
  process.exitCode = 1;
}
