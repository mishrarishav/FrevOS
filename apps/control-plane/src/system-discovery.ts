import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readdir, readFile, unlink } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, posix, win32 } from "node:path";
import {
  type ActivitySettings,
  type DiscoveryPolicy,
  ActivitySettingsInputSchema,
  ActivitySettingsRecordSchema,
  CollectorMetricsSchema,
  defaultActivitySettings,
  ContentPreviewInputSchema,
  ContentPreviewJobSchema,
  type ContentPreviewJob,
  SystemHealthPointSchema,
  type Client,
  ConnectorIdSchema,
  ConnectorProbeSchema,
  type DeliveryPlan,
  DeliveryPlanInputSchema,
  DeliveryPlanSchema,
  type DiscoveryEvent,
  DiscoveryObservationSchema,
  DiscoveryPolicyInputSchema,
  DiscoveryPolicyRecordSchema,
  DiscoveryStateSchema,
  defaultDiscoveryPolicy,
  deliveryReport,
  FolderBrowseInputSchema,
  type FolderBrowseJob,
  FolderBrowseJobSchema,
  type Project,
} from "@frevos/contracts";
import { z } from "zod";
import { replaceDurableRecord } from "./atomic-record.js";
import type { DeveloperConnectorStore } from "./developer-connectors.js";
import { ServixDeploymentError } from "./servix-deployment.js";

const safety = createRequire(import.meta.url)("../../../deployment/servix/DiscoverySafety.cjs") as {
  safeEvent(event: DiscoveryEvent): DiscoveryEvent | null;
  excluded(path: string): boolean;
  redact(text: string): string;
  retainActivity<T extends DiscoveryEvent>(
    events: T[],
    policy: DiscoveryPolicy,
    settings: ActivitySettings,
    now: number,
  ): T[];
  activityCategory(event: DiscoveryEvent, settings: ActivitySettings): "work" | "noise";
  summarizeActivity<T extends DiscoveryEvent>(
    events: T[],
    settings: ActivitySettings,
  ): (T & { category: "work" | "noise"; count: number; firstAt: string })[];
};
const CollectorRecord = z
  .object({ receivedAt: z.iso.datetime(), collector: CollectorMetricsSchema })
  .strict();
const HealthHistory = z.array(SystemHealthPointSchema).max(180);
const StoredObservation = z
  .object({
    actor: z.string(),
    receivedAt: z.iso.datetime(),
    observation: DiscoveryObservationSchema,
    source: ConnectorProbeSchema.nullable().default(null),
    cursors: z
      .array(
        z
          .object({
            bootId: z.uuid(),
            sequence: z.number().int().nonnegative(),
            at: z.iso.datetime(),
          })
          .strict(),
      )
      .max(32)
      .default([]),
    history: z
      .array(DiscoveryObservationSchema.shape.events.element.extend({ bootId: z.uuid() }))
      .max(10000),
  })
  .strict();
type Catalog = { projects: Project[]; clients: Client[] };
import { ProjectFolderSearch } from "./project-folder-search.js";
export class SystemDiscovery {
  readonly workspaceId = "ws_server20" as const;
  private chain: Promise<unknown> = Promise.resolve();
  constructor(
    readonly root: string,
    private readonly connectors: DeveloperConnectorStore,
    private readonly catalog: (actor: string) => Promise<Catalog>,
    private readonly now = () => new Date(),
  ) {}
  private folderSearchService?: ProjectFolderSearch;
  private folderSearch() {
    if (this.folderSearchService) return this.folderSearchService;
    this.folderSearchService = new ProjectFolderSearch(
      join(this.root, "folder-search"),
      (credential) => this.connectors.checkCredential(credential),
      async (actor, input) => {
        const catalog = await this.catalog(actor);
        const project = catalog.projects.find(
          (p) => p.projectId === input.projectId && p.status === "active",
        );
        if (!project) throw new ServixDeploymentError("folder-search-project-denied", 403);
        const { observation } = await this.browseDevice(actor, input.deviceId);
        const policy = await this.policy(input.deviceId);
        if (!policy?.policy.enabled || !observation.coverage.roots.length)
          throw new ServixDeploymentError("folder-search-consent-required", 403);
        return { query: project.displayName, roots: observation.coverage.roots };
      },
      this.now,
    );
    return this.folderSearchService;
  }
  requestProjectFolders(actor: string, input: unknown) {
    return this.folderSearch().request(actor, input);
  }
  projectFolders(actor: string, id: string) {
    return this.folderSearch().get(actor, id);
  }
  claimProjectFolders(credential: string) {
    return this.folderSearch().claim(credential);
  }
  finishProjectFolders(credential: string, input: unknown) {
    return this.folderSearch().complete(credential, input);
  }
  private serial<T>(fn: () => Promise<T>) {
    const result = this.chain.then(fn);
    this.chain = result.catch(() => undefined);
    return result;
  }
  private async directory() {
    await mkdir(this.root, { recursive: true });
    if ((await lstat(this.root)).isSymbolicLink())
      throw new ServixDeploymentError("discovery-storage-unavailable", 503);
  }
  private async read(name: string): Promise<unknown | undefined> {
    await this.directory();
    try {
      const file = join(this.root, name);
      const info = await lstat(file);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 2_000_000)
        throw Error("unsafe-record");
      return JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw new ServixDeploymentError("discovery-storage-unavailable", 503);
    }
  }
  private async save(name: string, value: unknown, fresh = false) {
    await this.directory();
    const file = join(this.root, name),
      temporary = fresh ? file : file + "." + randomUUID() + ".tmp";
    const stream = await open(temporary, "wx", 0o600);
    try {
      await stream.writeFile(JSON.stringify(value));
      await stream.sync();
    } finally {
      await stream.close();
    }
    if (!fresh) await replaceDurableRecord(temporary, file);
  }
  private async latest(prefix: string) {
    await this.directory();
    const names = (await readdir(this.root)).filter(
      (n) => n.startsWith(prefix + ".r") && /^.+\.r[0-9]{8}\.json$/.test(n),
    );
    if (names.length > 10000) throw new ServixDeploymentError("discovery-capacity", 503);
    const last = names.sort().at(-1);
    return last ? this.read(last) : undefined;
  }
  private async policy(id: string) {
    const value = await this.latest(id + ".policy");
    return value ? DiscoveryPolicyRecordSchema.parse(value) : null;
  }
  private async activitySettings(id: string) {
    const value = await this.latest(id + ".activity");
    return value ? ActivitySettingsRecordSchema.parse(value) : null;
  }
  private async contentJobs() {
    const names = (await readdir(this.root)).filter((n) => /^cp_[a-f0-9]{32}\.json$/.test(n));
    if (names.length > 1000) throw new ServixDeploymentError("discovery-content-capacity", 503);
    const jobs: ContentPreviewJob[] = [];
    for (const name of names) {
      const job = ContentPreviewJobSchema.parse(await this.read(name));
      if (Date.parse(job.createdAt) < this.now().getTime() - 7 * 86400000)
        await unlink(join(this.root, name));
      else jobs.push(job);
    }
    return jobs;
  }
  async requestContent(actor: string, input: unknown) {
    return this.serial(async () => {
      const request = ContentPreviewInputSchema.parse(input);
      const { device, observation } = await this.browseDevice(actor, request.deviceId);
      if (
        ![
          ...(device.source ? [device.source.repository] : []),
          ...observation.system.disks.map((d) => d.root),
        ].includes(request.root) ||
        safety.excluded(request.path)
      )
        throw new ServixDeploymentError("discovery-content-scope-denied", 403);
      const metrics = await this.read(request.deviceId + ".collector.json");
      if (
        !metrics ||
        CollectorRecord.parse(metrics).receivedAt !==
          ((await this.read(request.deviceId + ".observation.json")) as { receivedAt: string })
            .receivedAt
      )
        throw new ServixDeploymentError("discovery-content-update-required");
      const jobs = await this.contentJobs();
      if (
        jobs.some(
          (j) =>
            j.request.deviceId === device.deviceId &&
            ["queued", "working"].includes(j.status) &&
            Date.parse(j.expiresAt) > this.now().getTime(),
        )
      )
        throw new ServixDeploymentError("discovery-content-busy");
      if (
        jobs.length >= 1000 ||
        jobs.filter((j) => j.request.deviceId === device.deviceId).length >= 100
      )
        throw new ServixDeploymentError("discovery-content-capacity", 503);
      const job = ContentPreviewJobSchema.parse({
        version: 1,
        requestId: "cp_" + randomUUID().replaceAll("-", ""),
        actor,
        workspaceId: "ws_server20",
        request,
        status: "queued",
        createdAt: this.now().toISOString(),
        expiresAt: new Date(this.now().getTime() + 600000).toISOString(),
      });
      await this.save(job.requestId + ".json", job, true);
      return job;
    });
  }
  async content(actor: string, id: string) {
    if (!/^cp_[a-f0-9]{32}$/.test(id))
      throw new ServixDeploymentError("discovery-content-not-found", 404);
    const value = await this.read(id + ".json");
    const job = value ? ContentPreviewJobSchema.parse(value) : null;
    const device = (await this.connectors.discoveryDevices(actor)).find(
      (d) =>
        d.deviceId === job?.request.deviceId &&
        d.userId === actor &&
        d.workspaceAuthorized &&
        d.status === "active",
    );
    if (
      !job ||
      job.actor !== actor ||
      !device ||
      Date.parse(job.createdAt) < this.now().getTime() - 7 * 86400000
    )
      throw new ServixDeploymentError("discovery-content-not-found", 404);
    return ["queued", "working"].includes(job.status) &&
      Date.parse(job.expiresAt) <= this.now().getTime()
      ? { ...job, status: "expired" as const }
      : job;
  }
  async claimContent(credential: string) {
    return this.serial(async () => {
      const device = await this.connectors.checkCredential(credential);
      await this.directory();
      for (const job of await this.contentJobs())
        if (
          job.request.deviceId === device.deviceId &&
          job.actor === device.userId &&
          job.status === "queued" &&
          Date.parse(job.expiresAt) > this.now().getTime()
        ) {
          await this.browseDevice(job.actor, device.deviceId);
          const next = { ...job, status: "working" as const };
          await this.save(job.requestId + ".json", next);
          return next;
        }
      return null;
    });
  }
  async finishContent(credential: string, input: unknown) {
    return this.serial(async () => {
      const device = await this.connectors.checkCredential(credential),
        result = ContentPreviewJobSchema.parse(input);
      const job = await this.content(device.userId, result.requestId);
      if (
        job.status !== "working" ||
        !["succeeded", "declined", "failed"].includes(result.status) ||
        job.request.deviceId !== device.deviceId ||
        JSON.stringify({
          ...result,
          status: job.status,
          result: undefined,
          errorCode: undefined,
        }) !== JSON.stringify({ ...job, result: undefined, errorCode: undefined })
      )
        throw new ServixDeploymentError("discovery-content-scope-denied", 403);
      await this.browseDevice(job.actor, device.deviceId);
      if (result.status === "succeeded") {
        const r = result.result;
        if (
          !r ||
          result.errorCode ||
          r.before !== undefined ||
          r.beforeAt !== undefined ||
          Date.parse(r.approvedAt) < Date.parse(job.createdAt) ||
          Date.parse(r.observedAt) < Date.parse(r.approvedAt) ||
          Date.parse(r.observedAt) > this.now().getTime() + 60000
        )
          throw new ServixDeploymentError("discovery-content-scope-denied", 403);
        const previous = (await this.contentJobs())
          .filter(
            (j) =>
              j.status === "succeeded" &&
              j.actor === job.actor &&
              j.request.deviceId === device.deviceId &&
              j.request.root === job.request.root &&
              j.request.path === job.request.path &&
              j.result,
          )
          .sort((a, b) => Date.parse(b.result!.observedAt) - Date.parse(a.result!.observedAt))[0];
        result.result = {
          ...r,
          after: safety.redact(r.after),
          ...(previous?.result
            ? { before: safety.redact(previous.result.after), beforeAt: previous.result.observedAt }
            : {}),
        };
      } else if (result.result)
        throw new ServixDeploymentError("discovery-content-scope-denied", 403);
      await this.save(job.requestId + ".json", result);
      return result;
    });
  }
  async configureActivity(actor: string, input: unknown) {
    return this.serial(async () => {
      const body = ActivitySettingsInputSchema.parse(input);
      const device = (await this.connectors.discoveryDevices(actor)).find(
        (d) => d.deviceId === body.deviceId && d.status === "active",
      );
      if (!device || !device.workspaceAuthorized || device.userId !== actor)
        throw new ServixDeploymentError("discovery-device-access-denied", 403);
      const prior = await this.activitySettings(body.deviceId);
      if ((prior?.revision ?? 0) !== body.expectedRevision)
        throw new ServixDeploymentError("discovery-revision-changed");
      const { expectedRevision: _, ...configuration } = body;
      const record = ActivitySettingsRecordSchema.parse({
        ...configuration,
        revision: body.expectedRevision + 1,
        actor,
        updatedAt: this.now().toISOString(),
      });
      await this.save(
        `${body.deviceId}.activity.r${String(record.revision).padStart(8, "0")}.json`,
        record,
        true,
      );
      return record;
    });
  }
  private async browseDevice(actor: string, id: string) {
    const device = (await this.connectors.discoveryDevices(actor)).find(
      (d) =>
        d.deviceId === id &&
        d.status === "active" &&
        d.workspaceAuthorized &&
        d.userId === actor &&
        d.online &&
        (d.source || d.mode === "system"),
    );
    if (!device) throw new ServixDeploymentError("discovery-device-access-denied", 403);
    const value = await this.read(id + ".observation.json");
    const stored = value ? StoredObservation.parse(value) : null;
    if (!stored || this.now().getTime() - Date.parse(stored.receivedAt) > 30000)
      throw new ServixDeploymentError("discovery-source-stale");
    return { device, observation: stored.observation };
  }
  async requestFolders(actor: string, input: unknown) {
    return this.serial(async () => {
      const request = FolderBrowseInputSchema.parse(input);
      const { device, observation } = await this.browseDevice(actor, request.deviceId);
      if (
        ![
          ...(device.source ? [device.source.repository] : []),
          ...observation.system.disks.map((d) => d.root),
        ].includes(request.root)
      )
        throw new ServixDeploymentError("discovery-folder-scope-denied", 403);
      const names = (await readdir(this.root)).filter((n) => /^fb_[a-f0-9]{32}\.json$/.test(n));
      let active = 0;
      let retained = 0;
      for (const name of names) {
        const job = FolderBrowseJobSchema.parse(await this.read(name));
        if (Date.parse(job.expiresAt) < this.now().getTime() - 86400000) {
          await unlink(join(this.root, name));
          continue;
        }
        retained++;
        if (Date.parse(job.expiresAt) <= this.now().getTime()) continue;
        if (job.request.deviceId === request.deviceId && ["queued", "working"].includes(job.status))
          throw new ServixDeploymentError("discovery-folder-busy");
        active++;
      }
      if (active >= 128 || retained >= 2000)
        throw new ServixDeploymentError("discovery-folder-capacity", 503);
      const job = FolderBrowseJobSchema.parse({
        version: 1,
        requestId: "fb_" + randomUUID().replaceAll("-", ""),
        actor,
        workspaceId: "ws_server20",
        request,
        status: "queued",
        createdAt: this.now().toISOString(),
        expiresAt: new Date(this.now().getTime() + 120000).toISOString(),
      });
      await this.save(job.requestId + ".json", job, true);
      return job;
    });
  }
  async folders(actor: string, requestId: string) {
    if (!/^fb_[a-f0-9]{32}$/.test(requestId))
      throw new ServixDeploymentError("discovery-folder-not-found", 404);
    const value = await this.read(requestId + ".json");
    const job = value ? FolderBrowseJobSchema.parse(value) : null;
    if (!job || job.actor !== actor)
      throw new ServixDeploymentError("discovery-folder-not-found", 404);
    await this.browseDevice(actor, job.request.deviceId);
    return Date.parse(job.expiresAt) <= this.now().getTime()
      ? { ...job, status: "expired" as const, result: undefined }
      : job;
  }
  async claimFolders(credential: string) {
    return this.serial(async () => {
      const device = await this.connectors.checkCredential(credential);
      const names = (await readdir(this.root)).filter((n) => /^fb_[a-f0-9]{32}\.json$/.test(n));
      for (const name of names) {
        const job = FolderBrowseJobSchema.parse(await this.read(name));
        if (
          job.request.deviceId !== device.deviceId ||
          job.status !== "queued" ||
          Date.parse(job.expiresAt) <= this.now().getTime()
        )
          continue;
        await this.browseDevice(job.actor, device.deviceId);
        const next = { ...job, status: "working" as const };
        await this.save(name, next);
        return next;
      }
      return null;
    });
  }
  async finishFolders(credential: string, input: unknown) {
    return this.serial(async () => {
      const device = await this.connectors.checkCredential(credential),
        result = FolderBrowseJobSchema.parse(input);
      const prior = await this.read(result.requestId + ".json");
      if (!prior) throw new ServixDeploymentError("discovery-folder-not-found", 404);
      const job = FolderBrowseJobSchema.parse(prior);
      if (
        job.request.deviceId !== device.deviceId ||
        job.actor !== device.userId ||
        job.status !== "working" ||
        Date.parse(job.expiresAt) <= this.now().getTime() ||
        !["succeeded", "failed"].includes(result.status) ||
        JSON.stringify(job.request) !== JSON.stringify(result.request) ||
        result.actor !== job.actor ||
        result.workspaceId !== job.workspaceId ||
        result.createdAt !== job.createdAt ||
        result.expiresAt !== job.expiresAt
      )
        throw new ServixDeploymentError("discovery-folder-scope-denied", 403);
      await this.browseDevice(job.actor, device.deviceId);
      if (result.status === "succeeded") {
        const page = result.result;
        if (
          !page ||
          page.root !== job.request.root ||
          page.path !== job.request.path ||
          result.errorCode ||
          (page.nextPage !== null && page.nextPage !== job.request.page + 1) ||
          page.entries.some(
            (e) =>
              e.path !== (page.path ? page.path + "/" : "") + e.name ||
              /[/\\]/.test(e.name) ||
              [".", ".."].includes(e.name),
          )
        )
          throw new ServixDeploymentError("discovery-folder-result-invalid", 400);
      } else if (result.result || !result.errorCode)
        throw new ServixDeploymentError("discovery-folder-result-invalid", 400);
      await this.save(result.requestId + ".json", result);
      return { accepted: true };
    });
  }
  async selectedFolder(actor: string, id: string, input: unknown) {
    const body = z
      .object({
        browseRequestId: z.string().regex(/^fb_[a-f0-9]{32}$/),
        path: FolderBrowseInputSchema.shape.path,
      })
      .strict()
      .parse(input);
    const job = await this.folders(actor, body.browseRequestId);
    if (
      job.request.deviceId !== id ||
      job.status !== "succeeded" ||
      !job.result ||
      (body.path !== job.result.path &&
        !job.result.entries.some((e) => e.path === body.path && !e.excluded))
    )
      throw new ServixDeploymentError("discovery-folder-selection-invalid", 403);
    const osPath = /^[A-Za-z]:\\/.test(job.request.root) ? win32 : posix;
    return osPath.join(job.request.root, ...body.path.split("/").filter(Boolean));
  }
  async policyForConnector(credential: string) {
    const device = await this.connectors.checkCredential(credential);
    const record = await this.policy(device.deviceId);
    const activity = await this.activitySettings(device.deviceId);
    return {
      revision: record?.revision ?? 0,
      policy: record?.policy ?? defaultDiscoveryPolicy,
      activity: {
        revision: activity?.revision ?? 0,
        settings: activity?.settings ?? defaultActivitySettings,
      },
      notifications: { version: 1 },
      folderSearch: { version: 1 },
    };
  }
  async configure(actor: string, input: unknown) {
    return this.serial(async () => {
      const body = DiscoveryPolicyInputSchema.parse(input);
      const devices = await this.connectors.discoveryDevices(actor);
      const device = devices.find((d) => d.deviceId === body.deviceId && d.status === "active");
      if (!device || !device.workspaceAuthorized || device.userId !== actor)
        throw new ServixDeploymentError("discovery-device-access-denied", 403);
      if (device.mode === "system" && body.policy.contentFolders.length)
        throw new ServixDeploymentError("connector-project-binding-required", 403);
      const prior = await this.policy(body.deviceId);
      if (body.policy.priorityFolders.length) {
        const { observation } = await this.browseDevice(actor, body.deviceId);
        const roots = [
          ...(device.source ? [device.source.repository] : []),
          ...observation.system.disks.map((d) => d.root),
        ];
        if (
          body.policy.priorityFolders.some(
            (f) =>
              !roots.includes(f.root) ||
              (!body.policy.allLocalDrives && f.root !== device.source?.repository),
          )
        )
          throw new ServixDeploymentError("discovery-folder-scope-denied", 403);
      }
      if ((prior?.revision ?? 0) !== body.expectedRevision)
        throw new ServixDeploymentError("discovery-revision-changed");
      const { expectedRevision: _, ...configuration } = body;
      const record = DiscoveryPolicyRecordSchema.parse({
        ...configuration,
        revision: body.expectedRevision + 1,
        actor,
        updatedAt: this.now().toISOString(),
      });
      await this.save(
        `${body.deviceId}.policy.r${String(record.revision).padStart(8, "0")}.json`,
        record,
        true,
      );
      return record;
    });
  }
  async observe(credential: string, input: unknown) {
    return this.serial(async () => {
      const device = await this.connectors.checkCredential(credential);
      const observation = DiscoveryObservationSchema.parse(input);
      const acknowledged = Math.max(0, ...observation.events.map((e) => e.sequence));
      if (
        device.deviceId !== observation.deviceId ||
        (device.mode === "system" ? null : (device.profileId ?? "servix-development")) !==
          observation.profileId
      )
        throw new ServixDeploymentError("discovery-scope-mismatch", 403);
      const record = await this.policy(device.deviceId),
        policy = record?.policy ?? defaultDiscoveryPolicy;
      if (observation.policyRevision !== (record?.revision ?? 0))
        return { accepted: false, reason: "policy-changed" };
      const cutoff = this.now().getTime() - policy.retentionDays * 86400000;
      if (
        Date.parse(observation.at) > this.now().getTime() + 60000 ||
        Date.parse(observation.at) < cutoff
      )
        throw new ServixDeploymentError("discovery-observation-expired");
      const value = await this.read(device.deviceId + ".observation.json");
      const prior = value ? StoredObservation.parse(value) : undefined;
      let history = (prior?.history ?? []).filter((e) => Date.parse(e.at) >= cutoff);
      const retainedCursors = (prior?.cursors ?? []).filter((c) => Date.parse(c.at) >= cutoff);
      const high = Math.max(
        retainedCursors.find((c) => c.bootId === observation.bootId)?.sequence ?? 0,
        history
          .filter((e) => e.bootId === observation.bootId)
          .reduce((n, e) => Math.max(n, e.sequence), 0),
      );
      const proof = await this.connectors.diagnostics(device.userId, device.deviceId);
      const events = policy.enabled
        ? observation.events
            .filter(
              (e) => Date.parse(e.at) >= cutoff && Date.parse(e.at) <= this.now().getTime() + 60000,
            )
            .map((e) => {
              const safe = safety.safeEvent(e);
              if (!safe?.content) return safe;
              const sameRoot =
                proof &&
                (observation.system.platform === "win32"
                  ? proof.repository.toLowerCase() === e.root.toLowerCase()
                  : proof.repository === e.root);
              if (
                !sameRoot ||
                !policy.contentFolders.some((p) => p === "." || e.path.startsWith(p + "/"))
              ) {
                const { content: _, ...metadata } = safe;
                return metadata;
              }
              return safe;
            })
            .filter((e): e is DiscoveryEvent => !!e)
        : [];
      const seen = new Set(history.map((e) => `${e.bootId}:${e.sequence}`));
      for (const e of events) {
        if (e.sequence <= high) continue;
        const key = `${observation.bootId}:${e.sequence}`;
        if (!seen.has(key)) {
          history.push({ ...e, bootId: observation.bootId });
          seen.add(key);
        }
      }
      const activity = await this.activitySettings(device.deviceId);
      history = safety.retainActivity(
        history,
        policy,
        activity?.settings ?? defaultActivitySettings,
        this.now().getTime(),
      );
      observation.events = [];
      // New telemetry lives outside the old strict record for rollback compatibility.
      const collector = observation.collector;
      delete observation.collector;
      const receivedAt = this.now().toISOString();
      if (collector)
        await this.save(device.deviceId + ".collector.json", { receivedAt, collector });
      const previousHealth = await this.read(device.deviceId + ".health.json");
      const point = {
        at: observation.at,
        cpuPercent: observation.system.cpuPercent,
        memoryTotal: observation.system.memoryTotal,
        memoryAvailable: observation.system.memoryAvailable,
      };
      const health = [
        ...(previousHealth ? HealthHistory.parse(previousHealth) : []).filter(
          (p) => p.at !== point.at,
        ),
        point,
      ]
        .filter((p) => Date.parse(p.at) >= this.now().getTime() - 900000)
        .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
        .slice(-180);
      await this.save(device.deviceId + ".health.json", HealthHistory.parse(health));
      const cursors = retainedCursors.filter((c) => c.bootId !== observation.bootId);
      if (cursors.length >= 32) throw new ServixDeploymentError("discovery-epoch-capacity", 503);
      cursors.push({
        bootId: observation.bootId,
        sequence: Math.max(high, acknowledged),
        at: this.now().toISOString(),
      });
      const stored = StoredObservation.parse({
        actor: device.userId,
        receivedAt,
        observation,
        source: proof ?? prior?.source ?? null,
        cursors,
        history,
      });
      await this.save(device.deviceId + ".observation.json", stored);
      return { accepted: true, bootId: observation.bootId, sequence: Math.max(high, acknowledged) };
    });
  }
  async savePlan(actor: string, input: unknown) {
    return this.serial(async () => {
      const body = DeliveryPlanInputSchema.parse(input);
      if (actor !== "usr_windows_admin")
        throw new ServixDeploymentError("discovery-plan-owner-required", 403);
      const { projects } = await this.catalog(actor);
      if (
        !projects.some(
          (p) =>
            p.projectId === body.projectId &&
            p.workspaceId === "ws_server20" &&
            p.status === "active",
        )
      )
        throw new ServixDeploymentError("discovery-project-not-found", 404);
      const devices = await this.connectors.discoveryDevices(actor);
      if (
        body.deviceIds.some(
          (id) =>
            !devices.some(
              (d) =>
                d.deviceId === id &&
                d.mode !== "system" &&
                d.status === "active" &&
                d.workspaceAuthorized,
            ),
        )
      )
        throw new ServixDeploymentError("discovery-device-access-denied", 403);
      const value = await this.latest(body.projectId + ".plan");
      const prior = value ? DeliveryPlanSchema.parse(value) : null;
      if ((prior?.revision ?? 0) !== body.expectedRevision)
        throw new ServixDeploymentError("discovery-revision-changed");
      const plan = DeliveryPlanSchema.parse({
        ...body,
        bindings: body.deviceIds.map((id) => {
          const d = devices.find((device) => device.deviceId === id)!;
          return {
            deviceId: d.deviceId,
            userId: d.userId,
            repositoryId: d.repositoryId,
            profileId: d.profileId ?? "servix-development",
          };
        }),
        revision: body.expectedRevision + 1,
        workspaceId: "ws_server20",
        actor,
        updatedAt: this.now().toISOString(),
      });
      await this.save(
        `${body.projectId}.plan.r${String(plan.revision).padStart(8, "0")}.json`,
        plan,
        true,
      );
      return plan;
    });
  }
  async state(actor: string, historyDeviceId?: string) {
    const devices = await this.connectors.discoveryDevices(actor),
      catalog = await this.catalog(actor);
    if (
      historyDeviceId &&
      !devices.some((d) => d.deviceId === ConnectorIdSchema.parse(historyDeviceId))
    )
      throw new ServixDeploymentError("discovery-device-access-denied", 403);
    await this.directory();
    const contentRequests = historyDeviceId ? await this.contentJobs() : [];
    const systems = await Promise.all(
      devices.map(async (d) => {
        const policy = await this.policy(d.deviceId),
          value = await this.read(d.deviceId + ".observation.json");
        const record = value ? StoredObservation.parse(value) : undefined;
        const configuration = await this.activitySettings(d.deviceId);
        const settings = configuration?.settings ?? defaultActivitySettings;
        const metrics = await this.read(d.deviceId + ".collector.json");
        const metricRecord = metrics ? CollectorRecord.parse(metrics) : null;
        const health = await this.read(d.deviceId + ".health.json");
        const healthHistory = (health ? HealthHistory.parse(health) : []).filter(
          (p) => Date.parse(p.at) >= this.now().getTime() - 900000,
        );
        const cutoff = this.now().getTime() - (policy?.policy.retentionDays ?? 7) * 86400000;
        const safeHistory = (record?.history ?? [])
          .filter((e) => Date.parse(e.at) >= cutoff)
          .flatMap((e) => {
            const safe = safety.safeEvent(e);
            return safe ? [{ ...safe, bootId: e.bootId }] : [];
          });
        const history = safety.retainActivity(
          safeHistory,
          policy?.policy ?? defaultDiscoveryPolicy,
          settings,
          this.now().getTime(),
        );
        return {
          deviceId: d.deviceId,
          name: d.name,
          userId: d.userId,
          profileId: d.mode === "system" ? null : (d.profileId ?? "servix-development"),
          status: d.workspaceAuthorized ? d.status : "workspace-access-revoked",
          source: d.source ?? record?.source ?? null,
          sourceFresh: !!d.source && d.online,
          online:
            !!record && d.online && this.now().getTime() - Date.parse(record.receivedAt) < 30000,
          observedAt: record?.receivedAt ?? null,
          healthHistory: historyDeviceId === d.deviceId ? healthHistory : healthHistory.slice(-12),
          policy,
          observation: record?.observation ?? null,
          history: historyDeviceId === d.deviceId ? history : history.slice(-20),
          historyCount: history.length,
          contentRequests:
            historyDeviceId === d.deviceId &&
            d.userId === actor &&
            d.workspaceAuthorized &&
            d.status === "active"
              ? contentRequests
                  .filter((j) => j.actor === actor && j.request.deviceId === d.deviceId)
                  .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
                  .slice(0, 20)
                  .map((j) =>
                    ["queued", "working"].includes(j.status) &&
                    Date.parse(j.expiresAt) <= this.now().getTime()
                      ? { ...j, status: "expired" as const }
                      : j,
                  )
              : [],
          collector:
            record && metricRecord?.receivedAt === record.receivedAt
              ? metricRecord.collector
              : null,
          activity: {
            configuration,
            settings,
            workCount: history.filter((e) => safety.activityCategory(e, settings) === "work")
              .length,
            noiseCount: history.filter((e) => safety.activityCategory(e, settings) === "noise")
              .length,
            rows: historyDeviceId === d.deviceId ? safety.summarizeActivity(history, settings) : [],
          },
        };
      }),
    );
    const reports = await Promise.all(
      catalog.projects
        .filter((p) => p.workspaceId === "ws_server20" && p.status === "active")
        .map(async (p) => {
          const value = await this.latest(p.projectId + ".plan");
          const plan: DeliveryPlan | null = value ? DeliveryPlanSchema.parse(value) : null;
          const asOf = this.now().toISOString();
          return {
            projectId: p.projectId,
            projectName: p.displayName,
            clientName:
              catalog.clients.find(
                (c) => c.clientId === p.clientId && c.workspaceId === p.workspaceId,
              )?.displayName ?? null,
            plan,
            ...deliveryReport(plan, asOf),
            asOf,
          };
        }),
    );
    return DiscoveryStateSchema.parse({ systems, reports });
  }
  async prune() {
    return this.serial(async () => {
      await this.directory();
      await this.contentJobs();
      const files = (await readdir(this.root)).filter((n) =>
        /^fc_[a-f0-9]{32}\.observation\.json$/.test(n),
      );
      if (files.length > 1000) throw new ServixDeploymentError("discovery-capacity", 503);
      for (const file of files) {
        const record = StoredObservation.parse(await this.read(file));
        const policy = await this.policy(file.slice(0, 35));
        const cutoff = this.now().getTime() - (policy?.policy.retentionDays ?? 7) * 86400000;
        const settings = await this.activitySettings(file.slice(0, 35));
        const retained = safety.retainActivity(
          record.history.filter((e) => Date.parse(e.at) >= cutoff),
          policy?.policy ?? defaultDiscoveryPolicy,
          settings?.settings ?? defaultActivitySettings,
          this.now().getTime(),
        );
        if (retained.length !== record.history.length)
          await this.save(file, { ...record, history: retained });
      }
    });
  }
}
