import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  LocalDevActionSchema,
  type LocalDevJob,
  LocalDevJobSchema,
  LocalDevRequestIdSchema,
  type LocalDevSnapshot,
  LocalDevSnapshotSchema,
  LocalDevStateSchema,
  LocalEnvDocumentSchema,
} from "@frevos/contracts";
import { z } from "zod";
import { replaceDurableRecord } from "./atomic-record.js";
import type { DeveloperConnectorStore } from "./developer-connectors.js";
import { ServixDeploymentError } from "./servix-deployment.js";

const busy = (job: LocalDevJob) => ["queued", "working"].includes(job.status);
export class LocalDevelopment {
  private chain: Promise<unknown> = Promise.resolve();
  private observations = new Map<string, { at: string; snapshot: LocalDevSnapshot }>();
  constructor(
    readonly root: string,
    private readonly connectors: DeveloperConnectorStore,
    private readonly now = () => new Date(),
  ) {}
  private serial<T>(operation: () => Promise<T>) {
    const result = this.chain.then(operation);
    this.chain = result.catch(() => undefined);
    return result;
  }
  private async directory() {
    await mkdir(this.root, { recursive: true });
    if ((await lstat(this.root)).isSymbolicLink())
      throw new ServixDeploymentError("local-development-storage-unavailable", 503);
  }
  private async read(id: string) {
    const file = join(this.root, id + ".json");
    try {
      if ((await lstat(file)).isSymbolicLink()) throw Error("linked-record");
      return LocalDevJobSchema.parse(JSON.parse(await readFile(file, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw new ServixDeploymentError("local-development-storage-unavailable", 503);
    }
  }
  private async save(job: LocalDevJob, fresh = false) {
    const file = join(this.root, job.request.requestId + ".json");
    const temporary = fresh ? file : file + "." + randomUUID() + ".tmp";
    const stream = await open(temporary, "wx", 0o600);
    try {
      await stream.writeFile(JSON.stringify(LocalDevJobSchema.parse(job)));
      await stream.sync();
    } finally {
      await stream.close();
    }
    if (!fresh) await replaceDurableRecord(temporary, file);
  }
  private async jobs() {
    await this.directory();
    const names = (await readdir(this.root)).filter((n) => /^ld_[a-f0-9]{32}\.json$/.test(n));
    if (names.length > 2000) throw new ServixDeploymentError("local-development-capacity", 503);
    return (await Promise.all(names.map((n) => this.read(n.slice(0, -5)))))
      .filter((job): job is LocalDevJob => !!job)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async state(actor: string) {
    const devices = await this.connectors.list(actor);
    const connections = devices.flatMap((device) => {
      const observed = this.observations.get(device.deviceId);
      if (!observed) return [];
      return [
        {
          deviceId: device.deviceId,
          name: device.name,
          online: device.online && this.now().getTime() - Date.parse(observed.at) < 20000,
          observedAt: observed.at,
          snapshot: observed.snapshot,
        },
      ];
    });
    return LocalDevStateSchema.parse({
      connections,
      jobs: (await this.jobs()).filter((j) => j.actor === actor).slice(0, 100),
    });
  }
  async observe(credential: string, input: unknown) {
    const device = await this.connectors.checkCredential(credential);
    if (device.mode === "system")
      throw new ServixDeploymentError("connector-project-binding-required", 403);
    const snapshot = LocalDevSnapshotSchema.parse(input);
    if (
      snapshot.deviceId !== device.deviceId ||
      snapshot.profileId !== (device.profileId ?? "servix-development")
    )
      throw new ServixDeploymentError("local-development-scope-mismatch", 403);
    if (this.observations.size >= 1000 && !this.observations.has(device.deviceId))
      throw new ServixDeploymentError("local-development-capacity", 503);
    this.observations.set(device.deviceId, { at: this.now().toISOString(), snapshot });
    return { observed: true };
  }
  async previewTarget(actor: string, workspaceId: string, deviceId: string, serviceId: string) {
    const device = (await this.connectors.discoveryDevices(actor)).find(
      (d) => d.deviceId === deviceId,
    );
    const observed = this.observations.get(deviceId);
    if (
      !device ||
      device.workspaceId !== workspaceId ||
      !device.workspaceAuthorized ||
      device.mode === "system"
    )
      throw new ServixDeploymentError("preview-target-denied", 403);
    const snapshot = observed?.snapshot;
    const active = snapshot?.services.find((s) => s.id === serviceId);
    const service = snapshot?.plan?.services.find((s) => s.id === serviceId);
    if (
      device.status !== "active" ||
      !device.online ||
      !observed ||
      this.now().getTime() - Date.parse(observed.at) >= 20000 ||
      !snapshot?.sourceReady ||
      active?.status !== "running" ||
      !service?.preview ||
      snapshot.previewRelay !== 1
    )
      throw new ServixDeploymentError("preview-target-unavailable", 503);
    if (
      service.apiServiceId &&
      snapshot.services.find((s) => s.id === service.apiServiceId)?.status !== "running"
    )
      throw new ServixDeploymentError("preview-api-unavailable", 503);
    return { device, snapshot, service };
  }
  async connectorIdentity(credential: string) {
    const device = await this.connectors.checkCredential(credential),
      observed = this.observations.get(device.deviceId);
    if (
      device.mode === "system" ||
      !observed ||
      this.now().getTime() - Date.parse(observed.at) >= 20000
    )
      throw new ServixDeploymentError("preview-source-identity-unavailable", 503);
    return {
      workspaceId: device.workspaceId,
      deviceId: device.deviceId,
      profileId: observed.snapshot.profileId,
    };
  }
  async request(actor: string, input: unknown) {
    return this.serial(async () => {
      const request = LocalDevActionSchema.parse(input);
      const state = await this.state(actor);
      const connection = state.connections.find((c) => c.deviceId === request.deviceId);
      const existing = await this.read(request.requestId);
      if (existing) {
        if (
          existing.actor !== actor ||
          JSON.stringify(existing.request) !== JSON.stringify(request)
        )
          throw new ServixDeploymentError("local-development-idempotency-conflict");
        return existing;
      }
      if (!connection?.online) throw new ServixDeploymentError("local-development-offline");
      const snapshot = connection.snapshot;
      if (
        request.profileId !== snapshot.profileId ||
        request.fingerprint !== snapshot.fingerprint ||
        request.expectedRevision !== snapshot.revision
      )
        throw new ServixDeploymentError("local-development-observation-changed");
      if ((await this.jobs()).some((j) => j.request.deviceId === request.deviceId && busy(j)))
        throw new ServixDeploymentError("local-development-action-in-progress");
      if (request.operation === "environment-read" || request.operation === "environment-save") {
        if (!snapshot.sourceReady || !snapshot.environmentEditor)
          throw new ServixDeploymentError("local-development-environment-editor-unavailable");
        const candidate = snapshot.candidates.find((c) => c.id === request.serviceId);
        if (!candidate?.environments.some((e) => e.reference === request.reference))
          throw new ServixDeploymentError("local-development-environment-unavailable");
        if (request.operation === "environment-save") {
          if (
            snapshot.services.some((s) =>
              ["starting", "running", "port-conflict"].includes(s.status),
            )
          )
            throw new ServixDeploymentError("local-development-stop-before-environment-save");
          if (request.sealed.keyId !== snapshot.environmentEditor.keyId)
            throw new ServixDeploymentError("local-development-environment-key-changed");
        }
      } else if (request.operation === "configure") {
        if (!snapshot.sourceReady)
          throw new ServixDeploymentError("local-development-source-unavailable");
        if (snapshot.services.some((s) => ["starting", "running"].includes(s.status)))
          throw new ServixDeploymentError("local-development-stop-before-configuration");
        for (const service of request.plan.services) {
          if (service.preview && snapshot.previewRelay !== 1)
            throw new ServixDeploymentError("preview-connector-update-required", 409);
          const candidate = snapshot.candidates.find((c) => c.id === service.id);
          if (
            !candidate ||
            (candidate.recipe === "npm-script" &&
              (!service.script || !candidate.scripts.includes(service.script)))
          )
            throw new ServixDeploymentError("local-development-service-unavailable");
          for (const reference of [service.developmentEnvironment, service.productionEnvironment])
            if (reference && !candidate.environments.some((e) => e.reference === reference))
              throw new ServixDeploymentError("local-development-environment-unavailable");
        }
      } else if (request.operation !== "stop") {
        if (!snapshot.sourceReady)
          throw new ServixDeploymentError("local-development-source-unavailable");
        if (
          !snapshot.plan ||
          (request.serviceId && !snapshot.plan.services.some((s) => s.id === request.serviceId))
        )
          throw new ServixDeploymentError("local-development-configuration-required");
        if (request.operation === "kill-existing") {
          const service = snapshot.services.find((s) => s.id === request.serviceId);
          if (!service?.existing?.projectOwned || service.existing.identity !== request.identity)
            throw new ServixDeploymentError("local-development-process-changed");
        }
      }
      const job = LocalDevJobSchema.parse({
        version: 1,
        workspaceId: "ws_server20",
        actor,
        request,
        createdAt: this.now().toISOString(),
        expiresAt: new Date(this.now().getTime() + 120000).toISOString(),
        status: "queued",
      });
      await this.save(job, true);
      return job;
    });
  }
  async claim(credential: string) {
    return this.serial(async () => {
      const device = await this.connectors.checkCredential(credential);
      if (device.mode === "system")
        throw new ServixDeploymentError("connector-project-binding-required", 403);
      const jobs = (await this.jobs()).filter(
        (j) => j.request.deviceId === device.deviceId && busy(j),
      );
      for (const job of jobs) {
        if (job.status === "queued" && Date.parse(job.expiresAt) <= this.now().getTime()) {
          await this.save({
            ...job,
            status: "failed",
            errorCode: "local-development-request-expired",
          });
          continue;
        }
        const claimed = { ...job, status: "working" as const };
        if (job.status !== "working") await this.save(claimed);
        return claimed;
      }
      return null;
    });
  }
  async complete(credential: string, input: unknown) {
    return this.serial(async () => {
      const device = await this.connectors.checkCredential(credential);
      if (device.mode === "system")
        throw new ServixDeploymentError("connector-project-binding-required", 403);
      const result = z
        .object({
          requestId: LocalDevRequestIdSchema,
          status: z.enum(["succeeded", "failed", "recovery-required"]),
          errorCode: z
            .string()
            .regex(/^[a-z][a-z0-9-]{0,79}$/)
            .optional(),
          environment: LocalEnvDocumentSchema.optional(),
        })
        .strict()
        .parse(input);
      const job = /^ld_[a-f0-9]{32}$/.test(result.requestId)
        ? await this.read(result.requestId)
        : undefined;
      if (!job || job.request.deviceId !== device.deviceId || job.actor !== device.userId)
        throw new ServixDeploymentError("local-development-job-not-found", 404);
      if (job.request.operation === "environment-read" && result.status === "succeeded") {
        if (
          !result.environment ||
          result.environment.serviceId !== job.request.serviceId ||
          result.environment.reference !== job.request.reference
        )
          throw new ServixDeploymentError("local-development-environment-result-mismatch");
      } else if (result.environment) {
        throw new ServixDeploymentError("local-development-environment-result-mismatch");
      }
      if (job.status !== "working") {
        if (
          job.status === result.status &&
          job.errorCode === result.errorCode &&
          JSON.stringify(job.environment) === JSON.stringify(result.environment)
        )
          return job;
        throw new ServixDeploymentError("local-development-job-not-working");
      }
      const completed = {
        ...job,
        status: result.status,
        ...(result.errorCode ? { errorCode: result.errorCode } : {}),
        ...(result.environment ? { environment: result.environment } : {}),
      };
      await this.save(completed);
      return completed;
    });
  }
}
