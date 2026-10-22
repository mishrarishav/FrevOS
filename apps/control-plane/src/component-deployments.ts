import { createHash, randomBytes, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  ComponentIdSchema,
  componentOrder,
  type ComponentExecutor,
  ExecutorSchema,
  type Pipeline,
  PipelineInputSchema,
  PipelineSchema,
  PipelineRequestSchema,
  type PipelineRun,
  PipelineRunSchema,
  PipelineRunIdSchema,
  ExecutorIdSchema,
  type DeploymentSettings,
  type DeploymentConnectionTest,
  type SourceBindingSchema,
} from "@frevos/contracts";
import { z } from "zod";
import { componentGit } from "./component-git.js";
import { ServixDeploymentError } from "./servix-deployment.js";
import type { DeveloperConnectorStore } from "./developer-connectors.js";
import { hashesMatch } from "./crypto.js";
import { replaceDurableRecord } from "./atomic-record.js";

const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const pending = (run: PipelineRun) =>
  ["publishing", "running", "recovery-required"].includes(run.status);
const Digest = z.string().regex(/^[a-f0-9]{64}$/);
const Artifact = z
  .object({
    digest: Digest,
    bytes: z
      .number()
      .int()
      .positive()
      .max(512 * 1024 * 1024),
  })
  .strict();
const JobSchema = z
  .object({
    id: z.string().regex(/^cj_[a-f0-9]{32}$/),
    runId: PipelineRunIdSchema,
    profileId: ComponentIdSchema,
    componentId: ComponentIdSchema,
    executorId: ExecutorIdSchema,
    kind: z.enum(["build", "deploy"]),
    status: z.enum(["queued", "working", "succeeded", "failed", "recovery-required"]),
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    component: PipelineSchema.shape.components.element,
    binding: ExecutorSchema.shape.bindings.element,
    systemName: ExecutorSchema.shape.systemName,
    sourceHead: z.string().regex(/^[a-f0-9]{40}$/),
    input: Artifact,
    output: Artifact.optional(),
    previousArtifact: Artifact.optional(),
    errorCode: z
      .string()
      .regex(/^[a-z][a-z0-9-]{0,79}$/)
      .optional(),
  })
  .strict();
type Job = z.infer<typeof JobSchema>;
const ExecutorRecord = ExecutorSchema.omit({ online: true, lastSeenAt: true })
  .extend({ credentialHash: Digest })
  .strict();
type ExecutorRecord = z.infer<typeof ExecutorRecord>;

// One durable owner for revisions, source identity, component state and target locks.
// Workers execute only the recipe and locally enrolled binding in this snapshot.
export class ComponentDeployments {
  private chain: Promise<unknown> = Promise.resolve();
  private readonly beats = new Map<
    string,
    { at: string; bindings: ComponentExecutor["bindings"] }
  >();
  private publisher?: DeveloperConnectorStore;
  constructor(
    readonly root: string,
    private readonly workspaceId: string,
    private readonly allowed: (actor: string, owner: boolean) => Promise<boolean>,
    private readonly gitExecutable: string,
    private readonly now = () => new Date(),
  ) {}
  connect(publisher: DeveloperConnectorStore) {
    this.publisher = publisher;
  }
  async authorizeSource(actor: string, profileId: string) {
    const profile = await this.profile(profileId);
    if (profile)
      await this.permission(
        actor,
        profile.components.some((c) => c.recipe === "devsetu-native"),
      );
  }
  private serial<T>(fn: () => Promise<T>) {
    const next = this.chain.then(fn);
    this.chain = next.catch(() => undefined);
    return next;
  }
  private async permission(actor: string, owner = false) {
    if (!(await this.allowed(actor, owner)))
      throw new ServixDeploymentError("component-access-denied", 403);
  }
  private async directory() {
    await mkdir(this.root, { recursive: true });
    if ((await lstat(this.root)).isSymbolicLink()) throw Error("linked-component-storage");
  }
  private async read(name: string) {
    const path = join(this.root, name),
      info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 1048576)
      throw Error("invalid-component-record");
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  }
  private async write(name: string, value: unknown, fresh = false) {
    await this.directory();
    const path = join(this.root, name),
      temporary = fresh ? path : path + "." + randomUUID() + ".tmp";
    const file = await open(temporary, "wx", 0o600);
    try {
      await file.writeFile(JSON.stringify(value));
      await file.sync();
    } finally {
      await file.close();
    }
    if (!fresh) await replaceDurableRecord(temporary, path);
  }
  private async list<T>(pattern: RegExp, schema: z.ZodType<T>): Promise<T[]> {
    await this.directory();
    const names = (await readdir(this.root)).filter((name) => pattern.test(name));
    if (names.length > 1000) throw new ServixDeploymentError("component-record-capacity", 503);
    return Promise.all(names.map(async (name) => schema.parse(await this.read(name))));
  }
  async profile(id: string) {
    ComponentIdSchema.parse(id);
    try {
      return PipelineSchema.parse(await this.read(`profile-${id}.json`));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }
  async connectorProfile(
    id: string,
  ): Promise<
    (DeploymentSettings & { centralRepository: z.infer<typeof SourceBindingSchema> }) | undefined
  > {
    const profile = await this.profile(id);
    if (!profile) return undefined;
    return {
      version: 1,
      profileId: profile.profileId,
      revision: profile.revision,
      displayName: profile.displayName,
      sourceFolder: profile.sourceFolder,
      repositoryOrigin: profile.repository.origin,
      centralRepository: profile.repository,
      archived: profile.archived,
      runner: "not-connected",
      destination: {
        host: "configured-components",
        root: profile.sourceFolder,
        siteUrl: "http://configured-components/",
        credentialProfile: "not-connected",
      },
      preservedPaths: this.sourceProtection(profile),
      updatedAt: profile.updatedAt,
      updatedBy: profile.updatedBy,
    };
  }
  private sourceProtection(profile: Pipeline) {
    return profile.sourcePreservedPaths;
  }
  async git(id: string) {
    const profile = await this.profile(id);
    if (!profile || profile.archived)
      throw new ServixDeploymentError("component-profile-unavailable", 409);
    return componentGit(join(this.root, "repositories"), this.gitExecutable, profile.repository);
  }
  async save(actor: string, input: unknown) {
    return this.serial(async () => {
      await this.permission(actor, true);
      const body = PipelineInputSchema.parse(input),
        previous = await this.profile(body.profileId);
      if (
        !previous &&
        (await this.list(/^profile-[a-z][a-z0-9-]{2,63}\.json$/, PipelineSchema)).length >= 100
      )
        throw new ServixDeploymentError("component-profile-capacity");
      if (body.profileId === "servix-development")
        throw new ServixDeploymentError("existing-servix-migration-required", 409);
      if ((previous?.revision ?? 0) !== body.expectedRevision)
        throw new ServixDeploymentError("component-revision-conflict");
      if ((await this.runs()).some((r) => r.profileId === body.profileId && pending(r)))
        throw new ServixDeploymentError("component-project-busy");
      const { expectedRevision: _, ...fields } = body;
      const id = "gitrepo_" + digest(this.workspaceId + "\n" + body.profileId).slice(0, 32);
      const profile = PipelineSchema.parse({
        ...fields,
        revision: body.expectedRevision + 1,
        repository: previous?.repository ?? {
          id,
          origin: `devsetu://repositories/${id}`,
          remoteName: "devsetu",
          branch: "devsetu-dev",
        },
        updatedAt: this.now().toISOString(),
        updatedBy: actor,
      });
      if (previous)
        await this.write(
          `history-${body.profileId}-${previous.revision}-${randomUUID()}.json`,
          previous,
          true,
        );
      await this.write(`profile-${body.profileId}.json`, profile);
      return profile;
    });
  }
  private runs() {
    return this.list(/^run-pr_[a-f0-9]{32}\.json$/, PipelineRunSchema);
  }
  private jobs() {
    return this.list(/^job-cj_[a-f0-9]{32}\.json$/, JobSchema);
  }
  private async devices() {
    return (await this.list(/^executor-ex_[a-f0-9]{32}\.json$/, ExecutorRecord)).map(
      ({ credentialHash: _, ...record }) => {
        const beat = this.beats.get(record.id),
          age = beat ? this.now().getTime() - Date.parse(beat.at) : Infinity;
        return ExecutorSchema.parse({
          ...record,
          online:
            record.status === "active" &&
            Date.parse(record.expiresAt) > this.now().getTime() &&
            age >= -5000 &&
            age < 20000,
          lastSeenAt: beat?.at ?? null,
          bindings: record.bindings,
        });
      },
    );
  }
  async enroll(actor: string, input: unknown) {
    return this.serial(async () => {
      await this.permission(actor, true);
      const body = z
        .object({
          profileId: ComponentIdSchema,
          name: ExecutorSchema.shape.name,
          role: ExecutorSchema.shape.role,
        })
        .strict()
        .parse(input);
      if (!(await this.profile(body.profileId)))
        throw new ServixDeploymentError("component-profile-not-found", 404);
      if ((await this.devices()).length >= 100)
        throw new ServixDeploymentError("component-executor-capacity");
      const id = "ex_" + randomBytes(16).toString("hex"),
        credential = id + "." + randomBytes(32).toString("base64url");
      const record = ExecutorRecord.parse({
        ...body,
        id,
        userId: actor,
        status: "active",
        createdAt: this.now().toISOString(),
        expiresAt: new Date(this.now().getTime() + 90 * 86400000).toISOString(),
        bindings: [],
        credentialHash: digest(credential),
      });
      await this.write(`executor-${id}.json`, record, true);
      return { id, credential, expiresAt: record.expiresAt };
    });
  }
  private async authenticate(credential: string) {
    if (!/^ex_[a-f0-9]{32}\.[A-Za-z0-9_-]{43}$/.test(credential))
      throw new ServixDeploymentError("executor-authentication-required", 401);
    let record: ExecutorRecord;
    try {
      record = ExecutorRecord.parse(await this.read(`executor-${credential.slice(0, 35)}.json`));
    } catch {
      throw new ServixDeploymentError("executor-authentication-required", 401);
    }
    if (
      record.status !== "active" ||
      Date.parse(record.expiresAt) <= this.now().getTime() ||
      !hashesMatch(credential, Buffer.from(record.credentialHash, "hex"))
    )
      throw new ServixDeploymentError("executor-authentication-required", 401);
    await this.permission(record.userId, true);
    return record;
  }
  async revoke(actor: string, id: string) {
    return this.serial(async () => {
      await this.permission(actor, true);
      ExecutorIdSchema.parse(id);
      const record = ExecutorRecord.parse(await this.read(`executor-${id}.json`));
      await this.write(`executor-${id}.json`, { ...record, status: "revoked" });
      this.beats.delete(id);
      return { revoked: true };
    });
  }
  async heartbeat(credential: string, input: unknown) {
    return this.serial(async () => {
      const record = await this.authenticate(credential);
      const body = z
        .object({
          systemName: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/),
          bindings: ExecutorSchema.shape.bindings,
        })
        .strict()
        .parse(input);
      const systemName = body.systemName.toLowerCase();
      if (
        record.systemName &&
        (record.systemName !== systemName ||
          JSON.stringify(record.bindings) !== JSON.stringify(body.bindings))
      )
        throw new ServixDeploymentError("executor-enrollment-changed");
      if (!record.systemName) {
        if (record.role === "destination") {
          const others = await this.devices();
          const normalized = (root: string) =>
            root.replaceAll("/", "\\").replace(/\\+$/, "").toLowerCase() + "\\";
          if (
            others.some(
              (d) =>
                d.id !== record.id &&
                d.status === "active" &&
                d.role === "destination" &&
                d.systemName === systemName &&
                d.bindings.some((a) =>
                  body.bindings.some(
                    (b) =>
                      normalized(a.root).startsWith(normalized(b.root)) ||
                      normalized(b.root).startsWith(normalized(a.root)),
                  ),
                ),
            )
          )
            throw new ServixDeploymentError("component-destination-already-owned");
        }
        await this.write(`executor-${record.id}.json`, {
          ...record,
          systemName,
          bindings: body.bindings,
        });
      }
      this.beats.set(record.id, { at: this.now().toISOString(), bindings: body.bindings });
      return { online: true };
    });
  }
  async sourceRequestActive(id: string, actor: string, deviceId: string) {
    return (await this.runs()).some(
      (r) =>
        r.sourceRequestId === id &&
        r.requestedBy === actor &&
        r.connectorId === deviceId &&
        r.status === "publishing" &&
        Date.parse(r.expiresAt) > this.now().getTime(),
    );
  }
  private current(runs: PipelineRun[], profileId: string, componentId: string) {
    return runs
      .filter(
        (r) =>
          r.profileId === profileId &&
          r.components.some((c) => c.id === componentId && c.status === "succeeded"),
      )
      .sort(
        (a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.createdAt.localeCompare(a.createdAt),
      )[0];
  }
  async request(actor: string, input: unknown) {
    return this.serial(async () => {
      await this.permission(actor);
      const body = PipelineRequestSchema.parse(input),
        runs = await this.runs();
      const existing = runs.find((r) => r.requestId === body.requestId);
      if (existing) {
        const prior = PipelineRequestSchema.parse(
          Object.fromEntries(
            Object.keys(body).map((k) => [k, (existing as unknown as Record<string, unknown>)[k]]),
          ),
        );
        if (existing.requestedBy !== actor || JSON.stringify(prior) !== JSON.stringify(body))
          throw new ServixDeploymentError("component-request-conflict");
        return existing;
      }
      const config = await this.profile(body.profileId);
      if (!config || config.archived || config.revision !== body.expectedRevision)
        throw new ServixDeploymentError("component-revision-conflict");
      const components = config.components.filter(
        (c) => !body.componentId || c.id === body.componentId,
      );
      if (!components.length) throw new ServixDeploymentError("component-not-found", 404);
      if (components.some((c) => c.recipe === "devsetu-native")) await this.permission(actor, true);
      if (
        runs.some(
          (r) =>
            pending(r) &&
            (r.profileId === config.profileId ||
              r.config.components.some((a) =>
                components.some(
                  (b) =>
                    a.destinationId === b.destinationId &&
                    a.destinationBinding === b.destinationBinding,
                ),
              )),
        )
      )
        throw new ServixDeploymentError("component-target-busy");
      const devices = await this.devices();
      for (const component of components) {
        const builder = devices.find(
          (d) =>
            d.id === component.builderId &&
            d.profileId === config.profileId &&
            d.role === "builder" &&
            d.online,
        );
        const target = devices.find(
          (d) =>
            d.id === component.destinationId &&
            d.profileId === config.profileId &&
            d.role === "destination" &&
            d.online,
        );
        if (
          (body.operation === "deploy" &&
            !builder?.bindings.some((b) => b.recipes.includes(component.recipe))) ||
          !target?.bindings.some(
            (b) => b.id === component.destinationBinding && b.recipes.includes(component.recipe),
          )
        )
          throw new ServixDeploymentError("component-connection-test-required");
        if (
          (this.current(runs, config.profileId, component.id)?.requestId ?? null) !==
          body.expectedCurrent[component.id]
        )
          throw new ServixDeploymentError("component-current-release-conflict");
        // Component-only actions require their dependencies to have a healthy deployed release.
        if (
          body.componentId &&
          component.dependsOn.some((id) => !this.current(runs, config.profileId, id))
        )
          throw new ServixDeploymentError("component-dependency-not-deployed");
      }
      const at = this.now(),
        run = PipelineRunSchema.parse({
          ...body,
          sourceRequestId: "sd_" + body.requestId.slice(3),
          workspaceId: this.workspaceId,
          requestedBy: actor,
          config,
          sourceHead: null,
          status: body.operation === "deploy" ? "publishing" : "running",
          createdAt: at.toISOString(),
          updatedAt: at.toISOString(),
          expiresAt: new Date(at.getTime() + 60 * 60000).toISOString(),
          components: components.map((c) => {
            const current = this.current(runs, config.profileId, c.id);
            if (body.operation === "rollback") {
              const previousId = current?.components.find((x) => x.id === c.id)?.previousRunId;
              const previous = runs.find((r) => r.requestId === previousId),
                saved = previous?.components.find((x) => x.id === c.id);
              if (!previous || saved?.status !== "succeeded" || !saved.artifactDigest)
                throw new ServixDeploymentError("component-rollback-unavailable");
              return {
                id: c.id,
                status: "pending",
                artifactDigest: saved.artifactDigest,
                releaseRunId: saved.releaseRunId ?? previous.requestId,
                ...(current ? { previousRunId: current.requestId } : {}),
              };
            }
            return {
              id: c.id,
              status: "pending",
              ...(current ? { previousRunId: current.requestId } : {}),
            };
          }),
        });
      if (body.operation === "deploy") {
        const device = (await this.publisher?.list(actor))?.find(
          (d) =>
            d.deviceId === body.connectorId &&
            d.profileId === config.profileId &&
            d.online &&
            d.userId === actor,
        );
        if (!device) throw new ServixDeploymentError("connector-offline");
      }
      await this.write(`run-${run.requestId}.json`, run, true);
      await this.advance(run);
      return PipelineRunSchema.parse(await this.read(`run-${run.requestId}.json`));
    });
  }
  private async blobInfo(file: string) {
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > 512 * 1024 * 1024)
      throw new ServixDeploymentError("component-artifact-unavailable", 503);
    const bytes = await readFile(file);
    return { digest: digest(bytes), bytes: bytes.length };
  }
  private async storeBlob(bytes: Buffer) {
    const artifact = Artifact.parse({ digest: digest(bytes), bytes: bytes.length });
    const name = `blob-${artifact.digest}`;
    try {
      const f = await open(join(this.root, name), "wx", 0o600);
      try {
        await f.writeFile(bytes);
        await f.sync();
      } finally {
        await f.close();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    if ((await this.blobInfo(join(this.root, name))).digest !== artifact.digest)
      throw Error("component-artifact-corrupt");
    return artifact;
  }
  private async advance(run: PipelineRun) {
    if (!pending(run) || run.status === "recovery-required") return;
    if (
      !(await this.allowed(run.requestedBy, false)) ||
      Date.parse(run.expiresAt) <= this.now().getTime()
    ) {
      const jobs = (await this.jobs()).filter(
        (j) => j.runId === run.requestId && j.kind === "deploy",
      );
      for (const component of run.components) {
        if (["succeeded", "failed", "blocked"].includes(component.status)) continue;
        const job = jobs.find((j) => j.componentId === component.id);
        if (job?.status === "succeeded") component.status = "succeeded";
        else if (job && ["working", "recovery-required"].includes(job.status))
          component.status = "recovery-required";
        else {
          component.status = "failed";
          component.errorCode = "component-request-expired";
        }
      }
      run.status = run.components.some((c) => c.status === "recovery-required")
        ? "recovery-required"
        : run.components.every((c) => c.status === "succeeded")
          ? "succeeded"
          : run.components.some((c) => c.status === "succeeded")
            ? "partial"
            : "failed";
    } else {
      if (run.status === "publishing") {
        if (!this.publisher || !run.connectorId) throw Error("source-publisher-unavailable");
        try {
          await this.publisher.queueSource(
            run.requestedBy,
            run.connectorId,
            run.sourceRequestId,
            this.sourceProtection(run.config),
            run.changeDetails,
            run.profileId,
          );
          const source = await this.publisher.sourceResult(run.sourceRequestId);
          if (source.status === "failed") {
            run.status = "failed";
            for (const c of run.components) {
              c.status = "failed";
              c.errorCode = source.errorCode ?? "source-publication-failed";
            }
          } else if (source.status === "published") {
            run.sourceHead = source.sourceHead!;
            run.status = "running";
          }
        } catch (error) {
          if (!(error instanceof ServixDeploymentError)) throw error;
          run.status = "failed";
          for (const c of run.components) {
            c.status = "failed";
            c.errorCode = error.code;
          }
        }
      }
      if (run.status === "running") {
        const jobs = (await this.jobs()).filter((j) => j.runId === run.requestId);
        const allRuns = await this.runs();
        for (const id of componentOrder(run.config.components)) {
          const c = run.components.find((c) => c.id === id),
            component = run.config.components.find((c) => c.id === id)!;
          if (!c || ["succeeded", "failed", "blocked", "recovery-required"].includes(c.status))
            continue;
          const dependencies = run.components.filter((c) => component.dependsOn.includes(c.id));
          if (
            dependencies.some((c) => ["failed", "blocked", "recovery-required"].includes(c.status))
          ) {
            c.status = "blocked";
            c.errorCode = "component-dependency-failed";
            continue;
          }
          if (dependencies.some((c) => c.status !== "succeeded")) continue;
          const job = jobs.find(
            (j) => j.componentId === c.id && j.kind === (c.artifactDigest ? "deploy" : "build"),
          );
          if (job) {
            if (job.status === "succeeded") {
              if (job.kind === "build") {
                c.artifactDigest = job.output!.digest;
                c.releaseRunId = run.requestId;
                c.status = "pending";
              } else c.status = "succeeded";
            } else if (["failed", "recovery-required"].includes(job.status)) {
              c.status = job.status as "failed" | "recovery-required";
              c.errorCode = job.errorCode ?? "component-execution-failed";
            }
            continue;
          }
          let input: z.infer<typeof Artifact>;
          if (c.artifactDigest)
            input = await this.blobInfo(join(this.root, `blob-${c.artifactDigest}`));
          else {
            if (!run.sourceHead) throw Error("component-source-missing");
            const bundle = join(this.root, `source-${run.requestId}.bundle`);
            try {
              await lstat(bundle);
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
              await (await this.git(run.profileId)).exportBundle!(bundle, []);
            }
            input = await this.storeBlob(await readFile(bundle));
          }
          const previous = allRuns
            .find((r) => r.requestId === c.previousRunId)
            ?.components.find((p) => p.id === c.id);
          const executor = (await this.devices()).find(
            (d) => d.id === (c.artifactDigest ? component.destinationId : component.builderId),
          )!;
          const binding = executor.bindings.find(
            (b) =>
              (!c.artifactDigest || b.id === component.destinationBinding) &&
              b.recipes.includes(component.recipe),
          );
          const next = JobSchema.parse({
            id: "cj_" + randomBytes(16).toString("hex"),
            runId: run.requestId,
            profileId: run.profileId,
            componentId: c.id,
            executorId: c.artifactDigest ? component.destinationId : component.builderId,
            kind: c.artifactDigest ? "deploy" : "build",
            status: "queued",
            component,
            binding,
            systemName: executor.systemName,
            sourceHead:
              run.sourceHead ?? allRuns.find((r) => r.requestId === c.releaseRunId)?.sourceHead,
            input,
            ...(previous?.artifactDigest
              ? {
                  previousArtifact: await this.blobInfo(
                    join(this.root, `blob-${previous.artifactDigest}`),
                  ),
                }
              : {}),
            createdAt: this.now().toISOString(),
            expiresAt: run.expiresAt,
          });
          await this.write(`job-${next.id}.json`, next, true);
          c.status = c.artifactDigest ? "deploying" : "building";
        }
        if (run.components.some((c) => c.status === "recovery-required"))
          run.status = "recovery-required";
        else if (run.components.every((c) => ["succeeded", "failed", "blocked"].includes(c.status)))
          run.status = run.components.every((c) => c.status === "succeeded")
            ? "succeeded"
            : run.components.some((c) => c.status === "succeeded")
              ? "partial"
              : "failed";
      }
    }
    run.updatedAt = this.now().toISOString();
    await this.write(`run-${run.requestId}.json`, PipelineRunSchema.parse(run));
  }
  async state(actor: string) {
    return this.serial(async () => {
      await this.permission(actor);
      for (const run of await this.runs()) await this.advance(run);
      return {
        profiles: await this.list(/^profile-[a-z][a-z0-9-]{2,63}\.json$/, PipelineSchema),
        executors: await this.devices(),
        runs: (await this.runs())
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 100),
      };
    });
  }
  async projectSettings(actor: string): Promise<DeploymentSettings[]> {
    await this.permission(actor);
    const profiles = await this.list(/^profile-[a-z][a-z0-9-]{2,63}\.json$/, PipelineSchema),
      devices = await this.devices();
    return profiles.map((profile) => {
      const target = devices.find((d) => d.id === profile.components[0]?.destinationId);
      const binding = target?.bindings.find(
        (b) => b.id === profile.components[0]?.destinationBinding,
      );
      return {
        version: 1,
        profileId: profile.profileId,
        displayName: profile.displayName,
        sourceFolder: profile.sourceFolder,
        repositoryOrigin: profile.repository.origin,
        revision: profile.revision,
        updatedAt: profile.updatedAt,
        updatedBy: profile.updatedBy,
        archived: profile.archived,
        runner: "configured-components",
        preservedPaths: [...new Set(profile.components.flatMap((c) => c.preservedPaths))],
        destination: {
          host: target?.systemName ?? "unassigned",
          root: binding?.root ?? profile.sourceFolder,
          siteUrl:
            profile.components[0]?.siteUrl ??
            (binding ? new URL(binding.healthUrl).origin + "/" : "http://unconfigured/"),
          credentialProfile: "not-connected",
        },
      };
    });
  }
  async test(
    actor: string,
    profileId: string,
    deviceId: string,
  ): Promise<DeploymentConnectionTest> {
    await this.permission(actor);
    const profile = await this.profile(profileId);
    if (!profile || profile.archived)
      throw new ServixDeploymentError("component-profile-not-found", 404);
    const source = (await this.publisher?.list(actor))?.find(
      (d) => d.deviceId === deviceId && d.userId === actor && d.profileId === profileId && d.online,
    );
    const proof = source?.source;
    const sourceReady =
      !!source?.changeNotes &&
      proof?.origin === profile.repository.origin &&
      proof.repositoryId === profile.repository.id &&
      proof.remoteName === profile.repository.remoteName &&
      !["main", "master"].includes(proof.branch);
    const devices = await this.devices();
    const builders = profile.components.every((c) =>
      devices.some(
        (d) =>
          d.id === c.builderId &&
          d.role === "builder" &&
          d.profileId === profileId &&
          d.online &&
          d.bindings.some((b) => b.recipes.includes(c.recipe)),
      ),
    );
    const destinations = profile.components.every((c) =>
      devices.some(
        (d) =>
          d.id === c.destinationId &&
          d.role === "destination" &&
          d.profileId === profileId &&
          d.online &&
          d.bindings.some((b) => b.id === c.destinationBinding && b.recipes.includes(c.recipe)),
      ),
    );
    return {
      profileId,
      revision: profile.revision,
      checkedAt: this.now().toISOString(),
      ready: sourceReady && builders && destinations,
      checks: [
        {
          name: "Source",
          status: sourceReady ? "passed" : "failed",
          message: sourceReady
            ? "Fresh source proof matches this central repository and developer."
            : "Connect this project on your source system and select a development branch.",
        },
        {
          name: "Build systems",
          status: builders ? "passed" : "failed",
          message: builders
            ? "All configured builders are online with the selected recipes."
            : "Assign and start every configured build connection.",
        },
        {
          name: "Destination bindings",
          status: destinations ? "passed" : "failed",
          message: destinations
            ? "All destination bindings are enrolled and online. Application health is verified after activation."
            : "Assign and start each component destination binding.",
        },
      ],
    };
  }
  async claim(credential: string) {
    return this.serial(async () => {
      const device = await this.authenticate(credential);
      for (const run of await this.runs()) await this.advance(run);
      const job = (await this.jobs()).find(
        (j) =>
          j.executorId === device.id &&
          j.status === "queued" &&
          Date.parse(j.expiresAt) > this.now().getTime(),
      );
      if (!job) return null;
      const run = PipelineRunSchema.parse(await this.read(`run-${job.runId}.json`));
      if (run.status !== "running" || !(await this.allowed(run.requestedBy, false)))
        throw new ServixDeploymentError("component-job-expired");
      if (
        device.profileId !== job.profileId ||
        device.role !== (job.kind === "build" ? "builder" : "destination")
      )
        throw new ServixDeploymentError("component-job-denied", 403);
      await this.write(`job-${job.id}.json`, { ...job, status: "working" });
      return {
        ...job,
        requestedBy: run.requestedBy,
        changeDetails: run.changeDetails,
        operation: run.operation,
      };
    });
  }
  private async ownJob(credential: string, id: string) {
    z.string()
      .regex(/^cj_[a-f0-9]{32}$/)
      .parse(id);
    const device = await this.authenticate(credential);
    let job: Job;
    try {
      job = JobSchema.parse(await this.read(`job-${id}.json`));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        throw new ServixDeploymentError("component-job-not-found", 404);
      throw error;
    }
    if (job.executorId !== device.id || job.profileId !== device.profileId)
      throw new ServixDeploymentError("component-job-denied", 403);
    return job;
  }
  async artifact(credential: string, id: string, previous = false) {
    const job = await this.ownJob(credential, id),
      artifact = previous ? job.previousArtifact : job.input;
    if (job.status !== "working" || !artifact || Date.parse(job.expiresAt) <= this.now().getTime())
      throw new ServixDeploymentError("component-job-expired");
    const file = join(this.root, `blob-${artifact.digest}`),
      actual = await this.blobInfo(file);
    if (actual.digest !== artifact.digest || actual.bytes !== artifact.bytes)
      throw Error("component-artifact-corrupt");
    return file;
  }
  async upload(credential: string, id: string, bytes: Buffer) {
    return this.serial(async () => {
      const job = await this.ownJob(credential, id);
      if (
        job.kind !== "build" ||
        job.status !== "working" ||
        Date.parse(job.expiresAt) <= this.now().getTime()
      )
        throw new ServixDeploymentError("component-job-expired");
      const output = await this.storeBlob(bytes);
      if (job.output && job.output.digest !== output.digest)
        throw new ServixDeploymentError("component-artifact-conflict");
      await this.write(`job-${id}.json`, { ...job, output });
      return output;
    });
  }
  async complete(credential: string, id: string, input: unknown) {
    return this.serial(async () => {
      const job = await this.ownJob(credential, id),
        body = z
          .object({
            status: z.enum(["succeeded", "failed", "recovery-required"]),
            artifactDigest: Digest,
            errorCode: JobSchema.shape.errorCode,
          })
          .strict()
          .parse(input);
      if (
        body.artifactDigest !==
        (job.kind === "build" ? (job.output?.digest ?? job.input.digest) : job.input.digest)
      )
        throw new ServixDeploymentError("component-artifact-conflict");
      if (job.status === body.status) return { completed: true };
      if (
        job.status !== "working" ||
        (job.kind === "build" && body.status === "succeeded" && !job.output)
      )
        throw new ServixDeploymentError("component-job-conflict");
      await this.write(`job-${id}.json`, {
        ...job,
        status: body.status,
        ...(body.errorCode ? { errorCode: body.errorCode } : {}),
      });
      await this.advance(PipelineRunSchema.parse(await this.read(`run-${job.runId}.json`)));
      return { completed: true };
    });
  }
}
