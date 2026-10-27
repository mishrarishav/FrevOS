import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, open, readdir, readFile, rename } from "node:fs/promises";
import { basename, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import {
  type DeploymentChange,
  type ServixDeployment,
  ServixDeploymentSchema,
  type ServixDeploymentState,
  ServixDeployRequestSchema,
  ServixDigestSchema,
  ServixHeadSchema,
  ServixRequestIdSchema,
  ServixRestoreRequestSchema,
} from "@frevos/contracts";
import { z } from "zod";
import type { DeploymentSettingsStore } from "./deployment-settings.js";

const execute = promisify(execFile);
const active = (run: ServixDeployment) =>
  ["publishing", "building", "activating", "recovery-required"].includes(run.status);
const successful = (runs: ServixDeployment[]) =>
  runs
    .filter((run) => run.status === "succeeded")
    .sort(
      (a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.createdAt.localeCompare(a.createdAt),
    );
const ArtifactSchema = z
  .object({ manifestSha256: ServixDigestSchema, archiveSha256: ServixDigestSchema })
  .strict();
export class ServixDeploymentError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode = 409,
  ) {
    super(code);
  }
}
export interface ServixExecution {
  head(): Promise<string>;
  build(
    requestId: string,
    sourceHead: string,
    preservedPaths?: string[],
  ): Promise<{ manifestSha256: string; archiveSha256: string }>;
}
export interface ServixPublisher {
  list(actor: string): Promise<{ deviceId: string; online: boolean }[]>;
  prepare(
    actor: string,
    deviceId: string,
    requestId: string,
    preservedPaths?: string[],
    changeDetails?: DeploymentChange,
  ): Promise<string>;
}
export async function loadServixExecutionProfile(operator: string) {
  const profile = z
    .object({
      version: z.literal(1),
      git: z
        .object({
          executable: z.string().min(1).max(500).refine(isAbsolute),
          repository: z.string().min(1).max(500).refine(isAbsolute),
          repositoryId: z.string().regex(/^gitrepo_[a-f0-9]{32}$/),
        })
        .strict(),
    })
    .parse(JSON.parse(await readFile(join(operator, "ReleaseBuildProfile.json"), "utf8")));
  return {
    git: profile.git.executable,
    repository: profile.git.repository,
    repositoryId: profile.git.repositoryId,
  };
}
// All paths, commands and targets belong to this fixed server-owned profile.
export function servixExecution(
  root: string,
  operator: string,
  profile: { git: string; repository: string; repositoryId?: string } = {
    git: "C:\\Program Files\\Git\\cmd\\git.exe",
    repository: "E:\\FrevOS\\git\\servix.git",
  },
): ServixExecution & {
  importBundle(file: string, base: string, head: string): Promise<void>;
  exportBundle(file: string, heads: string[]): Promise<void>;
} {
  const { git, repository: repo } = profile;
  const repositoryId = profile.repositoryId ?? "gitrepo_6cb7e163f807493fa37963196c49fbac";
  const env: NodeJS.ProcessEnv = {};
  for (const name of [
    "SystemRoot",
    "WINDIR",
    "COMSPEC",
    "COMPUTERNAME",
    "PATHEXT",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "LOCALAPPDATA",
    "APPDATA",
    "ProgramFiles",
    "ProgramFiles(x86)",
  ])
    if (process.env[name] !== undefined) env[name] = process.env[name];
  env["PATH"] =
    process.platform === "win32"
      ? "E:\\FrevOS\\node\\node-v24.19.0-win-x64;C:\\Program Files\\Git\\cmd;C:\\Windows\\System32;C:\\Windows\\System32\\WindowsPowerShell\\v1.0"
      : "/usr/bin:/bin";
  const verifyIdentity = async () => {
    const identity = await execute(
      git,
      [
        "-c",
        `safe.directory=${repo}`,
        `--git-dir=${repo}`,
        "config",
        "--get",
        "frevos.repositoryId",
      ],
      { env, windowsHide: true, timeout: 5000, maxBuffer: 4096 },
    );
    if (identity.stdout.trim() !== repositoryId)
      throw new ServixDeploymentError("deployment-repository-identity-mismatch", 503);
  };
  return {
    async exportBundle(file, heads) {
      await verifyIdentity();
      const run = (args: string[]) =>
        execute(git, ["-c", `safe.directory=${repo}`, `--git-dir=${repo}`, ...args], {
          env,
          windowsHide: true,
          timeout: 120000,
          maxBuffer: 65536,
        });
      const known = new Set(
        (await run(["rev-list", "--max-count=1000", "refs/heads/frevos-dev"])).stdout
          .trim()
          .split(/\r?\n/)
          .map((h) => ServixHeadSchema.parse(h)),
      );
      const common = heads.map((h) => ServixHeadSchema.parse(h)).find((h) => known.has(h));
      await run([
        "bundle",
        "create",
        file,
        "refs/heads/frevos-dev",
        ...(common ? ["^" + common] : []),
      ]);
    },
    async importBundle(file, base, head) {
      await verifyIdentity();
      ServixHeadSchema.parse(base);
      ServixHeadSchema.parse(head);
      const run = (args: string[]) =>
        execute(
          git,
          [
            "-c",
            `safe.directory=${repo}`,
            "-c",
            "transfer.fsckObjects=true",
            "-c",
            "gc.auto=0",
            "-c",
            "maintenance.auto=false",
            `--git-dir=${repo}`,
            ...args,
          ],
          { env, windowsHide: true, timeout: 60000, maxBuffer: 4096 },
        );
      const current = await run(["rev-parse", "refs/heads/frevos-dev"]);
      if (current.stdout.trim() !== base)
        throw new ServixDeploymentError("source-behind-or-conflicting");
      await run(["bundle", "verify", file]);
      const incoming =
        "refs/frevos/incoming/" + ServixRequestIdSchema.parse(basename(file, ".bundle"));
      await run(["fetch", "--no-write-fetch-head", "--no-tags", file, `${head}:${incoming}`]);
      try {
        await run(["merge-base", "--is-ancestor", base, head]);
        await run(["update-ref", "refs/heads/frevos-dev", head, base]);
      } finally {
        await run(["update-ref", "-d", incoming, head]);
      }
    },
    async head() {
      await verifyIdentity();
      const { stdout } = await execute(
        git,
        [
          "-c",
          `safe.directory=${repo}`,
          `--git-dir=${repo}`,
          "rev-parse",
          "--verify",
          "refs/heads/frevos-dev^{commit}",
        ],
        { env, windowsHide: true, timeout: 5000, maxBuffer: 4096 },
      );
      return ServixHeadSchema.parse(stdout.trim());
    },
    async build(requestId, sourceHead, preservedPaths = []) {
      await mkdir(join(root, "jobs"), { recursive: true });
      const preservationFile = join(root, "jobs", "preserve-" + requestId + ".json");
      const snapshot = await open(preservationFile, "wx", 0o600);
      try {
        await snapshot.writeFile(JSON.stringify(preservedPaths));
        await snapshot.sync();
      } finally {
        await snapshot.close();
      }
      await execute(
        "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-WindowStyle",
          "Hidden",
          "-File",
          join(operator, "Build-Servix.ps1"),
          "-RequestId",
          requestId,
          "-SourceHead",
          sourceHead,
          "-PreservationFile",
          preservationFile,
        ],
        { env, windowsHide: true, timeout: 25 * 60000, maxBuffer: 16384 },
      );
      return z
        .object({ manifestSha256: ServixDigestSchema, archiveSha256: ServixDigestSchema })
        .strict()
        .parse(
          JSON.parse(await readFile(join(root, "builds", requestId, "artifact.json"), "utf8")),
        );
    },
  };
}
export class ServixDeploymentStore {
  private chain: Promise<unknown> = Promise.resolve();
  private readonly running = new Set<string>();
  private stopped = false;
  constructor(
    readonly root: string,
    private readonly execution: ServixExecution,
    private readonly authorize: (actor: string) => Promise<boolean>,
    private readonly now = () => new Date(),
    private readonly publisher?: ServixPublisher,
    private readonly settings?: DeploymentSettingsStore,
  ) {}
  close() {
    this.stopped = true;
  }
  async sourceRequestActive(id: string, actor: string, deviceId: string) {
    return this.serialized(
      async () =>
        !this.stopped &&
        (await this.records()).some(
          (run) =>
            run.requestId === id &&
            run.requestedBy === actor &&
            run.connectorId === deviceId &&
            run.status === "publishing" &&
            Date.parse(run.expiresAt) > this.now().getTime(),
        ),
    );
  }
  private serialized<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(fn);
    this.chain = next.catch(() => undefined);
    return next;
  }
  private async directory() {
    const path = resolve(this.root);
    if ((await lstat(path)).isSymbolicLink())
      throw new ServixDeploymentError("deployment-storage-unavailable", 503);
    await mkdir(join(path, "jobs"), { recursive: true });
    return path;
  }
  private async atomic(path: string, value: unknown, fresh = false) {
    const temporary = fresh ? path : `${path}.${randomUUID()}.tmp`;
    const file = await open(temporary, "wx", 0o600);
    try {
      await file.writeFile(JSON.stringify(value));
      await file.sync();
    } finally {
      await file.close();
    }
    if (!fresh) await rename(temporary, path);
  }
  private async save(run: ServixDeployment, fresh = false) {
    await this.directory();
    await this.atomic(
      join(this.root, "jobs", `${run.requestId}.json`),
      ServixDeploymentSchema.parse(run),
      fresh,
    );
  }
  private async records() {
    await this.directory();
    const names = (await readdir(join(this.root, "jobs"))).filter((name) =>
      /^sd_[a-f0-9]{32}\.json$/.test(name),
    );
    if (names.length >= 1000) throw new ServixDeploymentError("deployment-history-capacity", 503);
    const runs: ServixDeployment[] = [];
    for (const name of names) {
      const path = join(this.root, "jobs", name),
        stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16384)
        throw new ServixDeploymentError("deployment-storage-unavailable", 503);
      let run = ServixDeploymentSchema.parse(JSON.parse(await readFile(path, "utf8")));
      if (run.workspaceId !== "ws_server20" || name !== `${run.requestId}.json`)
        throw new ServixDeploymentError("deployment-storage-unavailable", 503);
      if (["publishing", "building", "activating"].includes(run.status)) {
        try {
          const receipt = z
            .object({
              requestId: z.literal(run.requestId),
              sourceHead: z.literal(run.sourceHead),
              artifactDigest: ServixDigestSchema,
              status: z.enum(["succeeded", "failed", "recovery-required"]),
              preservedFiles: z.number().int().nonnegative().optional(),
              errorCode: z.string().optional(),
            })
            .strict()
            .parse(
              JSON.parse(
                await readFile(join(this.root, "results", `${run.requestId}.json`), "utf8"),
              ),
            );
          if (run.artifactDigest !== receipt.artifactDigest) throw new Error("Artifact mismatch");
          run = ServixDeploymentSchema.parse({
            ...run,
            ...receipt,
            updatedAt: this.now().toISOString(),
            ...(receipt.status === "succeeded" ? { url: "http://10.9.69.21:82/" } : {}),
          });
          await this.save(run);
        } catch (error) {
          if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
          if (
            Date.parse(run.expiresAt) < this.now().getTime() ||
            (["publishing", "building"].includes(run.status) && !this.running.has(run.requestId))
          ) {
            run = ServixDeploymentSchema.parse({
              ...run,
              status: run.status === "activating" ? "recovery-required" : "failed",
              errorCode: "deployment-interrupted",
              updatedAt: this.now().toISOString(),
            });
            await this.save(run);
          }
        }
      }
      runs.push(run);
    }
    return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  private async savedRelease(run: ServixDeployment, records: ServixDeployment[], verify = false) {
    try {
      const origin = records.find(
        (item) => item.requestId === (run.releaseRequestId ?? run.requestId),
      );
      if (
        !origin ||
        origin.status !== "succeeded" ||
        origin.releaseRequestId ||
        !origin.sourceHead ||
        !origin.artifactDigest ||
        origin.sourceHead !== run.sourceHead ||
        origin.artifactDigest !== run.artifactDigest
      )
        throw new Error("Invalid release origin");
      const directory = join(this.root, "builds", origin.requestId);
      for (const path of [directory, join(directory, "release")]) {
        const info = await lstat(path);
        if (!info.isDirectory() || info.isSymbolicLink())
          throw new Error("Invalid release directory");
      }
      for (const [name, limit] of [
        ["artifact.json", 16384],
        ["release/manifest.json", 4000000],
        ["release.zip", 512 * 1024 * 1024],
      ] as const) {
        const info = await lstat(join(directory, name));
        if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > limit)
          throw new Error("Invalid release artifact");
      }
      const artifact = ArtifactSchema.parse(
        JSON.parse(await readFile(join(directory, "artifact.json"), "utf8")),
      );
      if (artifact.manifestSha256 !== origin.artifactDigest)
        throw new Error("Release identity mismatch");
      if (verify)
        for (const [name, digest] of [
          ["release/manifest.json", artifact.manifestSha256],
          ["release.zip", artifact.archiveSha256],
        ]) {
          const hash = createHash("sha256");
          for await (const chunk of createReadStream(join(directory, name!))) hash.update(chunk);
          if (hash.digest("hex") !== digest) throw new Error("Release bytes changed");
        }
      return { origin, artifact };
    } catch {
      throw new ServixDeploymentError("saved-release-unavailable");
    }
  }
  async state(): Promise<ServixDeploymentState> {
    return this.serialized(async () => {
      const runs = await this.records();
      const completed = successful(runs),
        current = completed[0];
      const restorableRequestIds: string[] = [];
      const applicationReleaseIds: string[] = [];
      for (const run of completed.slice(0, 30)) {
        try {
          const saved = await this.savedRelease(run, runs);
          restorableRequestIds.push(run.requestId);
          const bytes = await readFile(
            join(this.root, "builds", saved.origin.requestId, "release/manifest.json"),
          );
          if (createHash("sha256").update(bytes).digest("hex") === saved.origin.artifactDigest) {
            const manifest = JSON.parse(bytes.toString("utf8"));
            if (
              manifest.mode === "bundled-existing-dependencies" &&
              ServixDigestSchema.safeParse(manifest.backendArtifact?.manifestSha256).success &&
              ServixDigestSchema.safeParse(manifest.frontendArtifact?.sha256).success &&
              manifest.validation?.status === "passed" &&
              manifest.validation?.sourceHead === saved.origin.sourceHead
            )
              applicationReleaseIds.push(run.requestId);
          }
        } catch {}
      }
      const rollback = completed.find(
        (run) =>
          run.artifactDigest !== current?.artifactDigest &&
          restorableRequestIds.includes(run.requestId),
      );
      let sourceHead: string | null = null,
        runnerOnline = false;
      try {
        sourceHead = await this.execution.head();
      } catch {}
      try {
        const beat = z
          .object({ at: z.iso.datetime(), host: z.literal("DCAPP7") })
          .strict()
          .parse(JSON.parse(await readFile(join(this.root, "results", "heartbeat.json"), "utf8")));
        const age = this.now().getTime() - Date.parse(beat.at);
        runnerOnline = age >= -5000 && age < 15000;
      } catch {}
      return {
        available: !this.stopped,
        runnerOnline,
        source: "server20 / servix.git / frevos-dev",
        sourceHead,
        target: "10.9.69.21 / D:\\servixDev",
        runs: runs.slice(0, 30),
        ...(current ? { currentRequestId: current.requestId } : {}),
        ...(rollback ? { rollbackRequestId: rollback.requestId } : {}),
        restorableRequestIds,
        ...(applicationReleaseIds.length ? { applicationReleaseIds } : {}),
      };
    });
  }
  async request(actor: string, input: unknown) {
    const request = ServixDeployRequestSchema.parse(input);
    return this.serialized(async () => {
      if (this.stopped || !(await this.authorize(actor)))
        throw new ServixDeploymentError("deployment-access-denied", 403);
      const records = await this.records(),
        previous = records.find((run) => run.requestId === request.requestId);
      if (previous) {
        if (
          previous.requestedBy !== actor ||
          previous.connectorId !== request.connectorId ||
          JSON.stringify(previous.changeDetails) !== JSON.stringify(request.changeDetails)
        )
          throw new ServixDeploymentError("deployment-request-conflict");
        return previous;
      }
      if (records.some(active)) throw new ServixDeploymentError("deployment-target-busy");
      if (
        this.publisher &&
        (!request.connectorId ||
          !(await this.publisher.list(actor)).some(
            (d) => d.deviceId === request.connectorId && d.online,
          ))
      )
        throw new ServixDeploymentError("connector-offline");
      const settings = await this.settings?.profile("servix-development");
      if (settings?.archived) throw new ServixDeploymentError("settings-project-archived");
      const at = this.now(),
        run = ServixDeploymentSchema.parse({
          version: 1,
          requestId: request.requestId,
          workspaceId: "ws_server20",
          requestedBy: actor,
          changeDetails: request.changeDetails,
          target: "server21-servix-development",
          operation: "deploy",
          ...(settings
            ? { settingsRevision: settings.revision, preservedPaths: settings.preservedPaths }
            : {}),
          ...(successful(records)[0]
            ? { previousRequestId: successful(records)[0]!.requestId }
            : {}),
          status: this.publisher ? "publishing" : "building",
          sourceHead: this.publisher ? null : await this.execution.head(),
          ...(request.connectorId ? { connectorId: request.connectorId } : {}),
          createdAt: at.toISOString(),
          updatedAt: at.toISOString(),
          expiresAt: new Date(at.getTime() + 40 * 60000).toISOString(),
        });
      this.running.add(run.requestId);
      try {
        await this.save(run, true);
      } catch (error) {
        this.running.delete(run.requestId);
        throw error;
      }
      void this.build(run).catch(() => {
        this.stopped = true;
      });
      return run;
    });
  }
  async restore(actor: string, input: unknown) {
    const request = ServixRestoreRequestSchema.parse(input);
    return this.serialized(async () => {
      if (this.stopped || !(await this.authorize(actor)))
        throw new ServixDeploymentError("deployment-access-denied", 403);
      const records = await this.records(),
        duplicate = records.find((run) => run.requestId === request.requestId);
      if (duplicate) {
        const requested = records.find((run) => run.requestId === request.restoreRequestId);
        if (
          duplicate.requestedBy !== actor ||
          JSON.stringify(duplicate.changeDetails) !== JSON.stringify(request.changeDetails) ||
          duplicate.operation !== request.operation ||
          duplicate.previousRequestId !== request.expectedCurrentRequestId ||
          duplicate.releaseRequestId !== (requested?.releaseRequestId ?? requested?.requestId)
        )
          throw new ServixDeploymentError("deployment-request-conflict");
        return duplicate;
      }
      if (records.some(active)) throw new ServixDeploymentError("deployment-target-busy");
      const completed = successful(records),
        current = completed[0],
        chosen = completed.find((run) => run.requestId === request.restoreRequestId);
      if (!current || current.requestId !== request.expectedCurrentRequestId)
        throw new ServixDeploymentError("deployment-current-release-changed");
      if (!chosen || chosen.artifactDigest === current.artifactDigest)
        throw new ServixDeploymentError("saved-release-not-selectable");
      if (request.operation === "rollback") {
        let previous: ServixDeployment | undefined;
        for (const candidate of completed) {
          if (candidate.artifactDigest === current.artifactDigest) continue;
          try {
            await this.savedRelease(candidate, records);
            previous = candidate;
            break;
          } catch {}
        }
        if (previous?.requestId !== chosen.requestId)
          throw new ServixDeploymentError("deployment-rollback-target-changed");
      }
      const { origin, artifact } = await this.savedRelease(chosen, records, true);
      // Resolve and validate the currently installed manifest too; it owns the
      // exact set of obsolete code files the target may remove.
      await this.savedRelease(current, records, true);
      const settings = await this.settings?.profile("servix-development");
      if (settings?.archived) throw new ServixDeploymentError("settings-project-archived");
      const at = this.now();
      const run = ServixDeploymentSchema.parse({
        version: 1,
        requestId: request.requestId,
        workspaceId: "ws_server20",
        requestedBy: actor,
        changeDetails: request.changeDetails,
        target: "server21-servix-development",
        operation: request.operation,
        ...(settings
          ? { settingsRevision: settings.revision, preservedPaths: settings.preservedPaths }
          : {}),
        releaseRequestId: origin.requestId,
        previousRequestId: current.requestId,
        sourceHead: origin.sourceHead,
        status: "activating",
        artifactDigest: artifact.manifestSha256,
        createdAt: at.toISOString(),
        updatedAt: at.toISOString(),
        expiresAt: new Date(at.getTime() + 40 * 60000).toISOString(),
      });
      return this.enqueueActivation(run, artifact, true);
    });
  }
  private async enqueueActivation(
    run: ServixDeployment,
    artifact: z.infer<typeof ArtifactSchema>,
    fresh = false,
  ) {
    if (
      this.stopped ||
      Date.parse(run.expiresAt) < this.now().getTime() ||
      !(await this.authorize(run.requestedBy))
    )
      throw new ServixDeploymentError("deployment-access-denied", 403);
    const activating = ServixDeploymentSchema.parse({
      ...run,
      status: "activating",
      artifactDigest: artifact.manifestSha256,
      updatedAt: this.now().toISOString(),
    });
    await this.save(activating, fresh);
    try {
      await this.atomic(
        join(this.root, "requests", `${run.requestId}.json`),
        { ...activating, archiveSha256: artifact.archiveSha256 },
        true,
      );
    } catch {
      const uncertain = ServixDeploymentSchema.parse({
        ...activating,
        status: "recovery-required",
        errorCode: "activation-request-not-confirmed",
      });
      await this.save(uncertain);
      return uncertain;
    }
    return activating;
  }
  private async build(run: ServixDeployment) {
    try {
      if (this.publisher) {
        if (!run.connectorId) throw new ServixDeploymentError("connector-offline");
        const head = await this.publisher.prepare(
          run.requestedBy,
          run.connectorId,
          run.requestId,
          run.preservedPaths,
          run.changeDetails,
        );
        await this.serialized(async () => {
          if (this.stopped || !(await this.authorize(run.requestedBy)))
            throw new ServixDeploymentError("deployment-access-denied");
          run = ServixDeploymentSchema.parse({
            ...run,
            sourceHead: head,
            status: "building",
            updatedAt: this.now().toISOString(),
          });
          await this.save(run);
        });
      }
      if (!run.sourceHead) throw new ServixDeploymentError("source-publication-failed");
      const artifact = run.preservedPaths
        ? await this.execution.build(run.requestId, run.sourceHead, run.preservedPaths)
        : await this.execution.build(run.requestId, run.sourceHead);
      await this.serialized(async () => {
        if (
          this.stopped ||
          Date.parse(run.expiresAt) < this.now().getTime() ||
          !(await this.authorize(run.requestedBy))
        )
          throw new Error("Authorization expired");
        await this.enqueueActivation(run, artifact);
      });
    } catch (error) {
      await this.serialized(async () => {
        // A closed controller no longer owns durable state transitions. A new
        // controller reconciles interrupted work; late build failures must not
        // overwrite its recovery-required state or unblock another deployment.
        if (this.stopped) return;
        await this.save(
          ServixDeploymentSchema.parse({
            ...run,
            status: "failed",
            errorCode:
              error instanceof ServixDeploymentError ? error.code : "build-or-authorization-failed",
            updatedAt: this.now().toISOString(),
          }),
        );
      });
    } finally {
      this.running.delete(run.requestId);
    }
  }
}
