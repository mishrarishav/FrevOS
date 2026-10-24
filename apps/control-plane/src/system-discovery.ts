import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import {
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
  type Project,
} from "@frevos/contracts";
import { z } from "zod";
import { replaceDurableRecord } from "./atomic-record.js";
import type { DeveloperConnectorStore } from "./developer-connectors.js";
import { ServixDeploymentError } from "./servix-deployment.js";

const safety = createRequire(import.meta.url)("../../../deployment/servix/DiscoverySafety.cjs") as {
  safeEvent(event: DiscoveryEvent): DiscoveryEvent | null;
};
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
export class SystemDiscovery {
  private chain: Promise<unknown> = Promise.resolve();
  constructor(
    readonly root: string,
    private readonly connectors: DeveloperConnectorStore,
    private readonly catalog: (actor: string) => Promise<Catalog>,
    private readonly now = () => new Date(),
  ) {}
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
  async policyForConnector(credential: string) {
    const device = await this.connectors.checkCredential(credential);
    const record = await this.policy(device.deviceId);
    return { revision: record?.revision ?? 0, policy: record?.policy ?? defaultDiscoveryPolicy };
  }
  async configure(actor: string, input: unknown) {
    return this.serial(async () => {
      const body = DiscoveryPolicyInputSchema.parse(input);
      const devices = await this.connectors.discoveryDevices(actor);
      const device = devices.find((d) => d.deviceId === body.deviceId && d.status === "active");
      if (!device || !device.workspaceAuthorized || device.userId !== actor)
        throw new ServixDeploymentError("discovery-device-access-denied", 403);
      const prior = await this.policy(body.deviceId);
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
        (device.profileId ?? "servix-development") !== observation.profileId
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
      history = history.slice(-policy.maxEvents);
      // Durable, bounded history. The agent's coverage explicitly records its own loss.
      while (Buffer.byteLength(JSON.stringify(history)) > 1_000_000) history.shift();
      observation.events = [];
      const cursors = retainedCursors.filter((c) => c.bootId !== observation.bootId);
      if (cursors.length >= 32) throw new ServixDeploymentError("discovery-epoch-capacity", 503);
      cursors.push({
        bootId: observation.bootId,
        sequence: Math.max(high, acknowledged),
        at: this.now().toISOString(),
      });
      const stored = StoredObservation.parse({
        actor: device.userId,
        receivedAt: this.now().toISOString(),
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
              (d) => d.deviceId === id && d.status === "active" && d.workspaceAuthorized,
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
    const systems = await Promise.all(
      devices.map(async (d) => {
        const policy = await this.policy(d.deviceId),
          value = await this.read(d.deviceId + ".observation.json");
        const record = value ? StoredObservation.parse(value) : undefined;
        const cutoff = this.now().getTime() - (policy?.policy.retentionDays ?? 7) * 86400000;
        const history = (record?.history ?? [])
          .filter((e) => Date.parse(e.at) >= cutoff)
          .flatMap((e) => {
            const safe = safety.safeEvent(e);
            return safe ? [{ ...safe, bootId: e.bootId }] : [];
          });
        return {
          deviceId: d.deviceId,
          name: d.name,
          userId: d.userId,
          profileId: d.profileId ?? "servix-development",
          status: d.workspaceAuthorized ? d.status : "workspace-access-revoked",
          source: d.source ?? record?.source ?? null,
          sourceFresh: !!d.source && d.online,
          online:
            !!record && d.online && this.now().getTime() - Date.parse(record.receivedAt) < 30000,
          observedAt: record?.receivedAt ?? null,
          policy,
          observation: record?.observation ?? null,
          history: historyDeviceId === d.deviceId ? history : history.slice(-20),
          historyCount: history.length,
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
      const files = (await readdir(this.root)).filter((n) =>
        /^fc_[a-f0-9]{32}\.observation\.json$/.test(n),
      );
      if (files.length > 1000) throw new ServixDeploymentError("discovery-capacity", 503);
      for (const file of files) {
        const record = StoredObservation.parse(await this.read(file));
        const policy = await this.policy(file.slice(0, 35));
        const cutoff = this.now().getTime() - (policy?.policy.retentionDays ?? 7) * 86400000;
        const retained = record.history.filter((e) => Date.parse(e.at) >= cutoff);
        if (retained.length !== record.history.length)
          await this.save(file, { ...record, history: retained });
      }
    });
  }
}
