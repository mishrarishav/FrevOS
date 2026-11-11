import { createHash, randomUUID } from "node:crypto";
import {
  ServerMonitorAccessSchema,
  ServerMonitorAcknowledgeSchema,
  ServerMonitorAlertSchema,
  ServerMonitorCatalogSchema,
  ServerMonitorImportSchema,
  ServerMonitorPolicySchema,
  ServerMonitorRefreshSchema,
  ServerMonitorSavePolicySchema,
  ServerMonitorSaveTargetSchema,
  ServerMonitorSnapshotSchema,
  ServerMonitorTargetViewSchema,
  UserIdSchema,
  WorkspaceIdSchema,
  privateServerAddress,
  type ServerMonitorAccess,
  type ServerMonitorCatalog,
  type ServerMonitorImportResult,
  type ServerMonitorSnapshot,
} from "@frevos/contracts";
import { z } from "zod";

export class ServerMonitoringError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
  ) {
    super("server-monitoring-" + message);
  }
}
export interface ServerMonitoringStore {
  read(workspaceId: string): Promise<unknown | null>;
  write(workspaceId: string, document: unknown): Promise<void>;
  transaction<T>(workspaceId: string, operation: () => Promise<T>): Promise<T>;
  workspaces(): Promise<string[]>;
  now(): string;
}
export type ServerMonitorCollectorTarget = {
  id: string;
  workspaceId: string;
  address: string;
  port: number;
  transport: "winrm-http" | "winrm-https" | "local";
  credentialProfile: string;
  revision: number;
};
export type ServerMonitorCollectionContext = {
  requestId: string;
  action: "check" | "sample";
  issuedAt: string;
  expiresAt: string;
  signal: AbortSignal;
};
export type ServerMonitorCollectionResult = {
  status: Exclude<ServerMonitorAccess["status"], "unverified">;
  computerName: string | null;
  snapshot?: ServerMonitorSnapshot | undefined;
};
export type ServerMonitoringRegister = {
  id: string;
  records: {
    id: string;
    title: string;
    management: string;
    fields: Record<string, unknown>;
    endpoints?: { url?: string }[];
  }[];
};
export type ServerMonitoringSourcePolicy = {
  workspaceId: string;
  registerId: string;
  managementValues: string[];
  hostingField: string;
};
type Member = { active: boolean; administrator: boolean };
type Options = {
  store: ServerMonitoringStore;
  authority: (workspaceId: string, actor: string) => Promise<Member>;
  readRegister: (
    workspaceId: string,
    actor: string,
    registerId: string,
  ) => Promise<ServerMonitoringRegister>;
  collector: (
    target: ServerMonitorCollectorTarget,
    context: ServerMonitorCollectionContext,
  ) => Promise<ServerMonitorCollectionResult>;
  targetAllowed: (target: ServerMonitorCollectorTarget) => boolean | Promise<boolean>;
  sourcePolicies: ServerMonitoringSourcePolicy[];
  concurrency?: number;
  timeoutMs?: number;
};
const Action = z.enum(["check", "sample"]);
const Job = z
  .object({
    id: z.string().regex(/^smr_[a-f0-9]{32}$/),
    action: Action,
    actor: UserIdSchema,
    queuedAt: z.iso.datetime(),
  })
  .strict();
const Lease = Job.extend({
  fence: z.number().int().positive(),
  owner: z.string(),
  expiresAt: z.iso.datetime(),
  revision: z.number().int().nonnegative(),
  policyRevision: z.number().int().nonnegative(),
  manual: z.boolean(),
}).strict();
const StoredAlert = ServerMonitorAlertSchema.omit({ acknowledged: true })
  .extend({ acknowledgedBy: z.array(UserIdSchema).max(1000) })
  .strict();
const StoredTarget = ServerMonitorTargetViewSchema.omit({ polling: true, alerts: true })
  .extend({
    credentialProfile: z.string().regex(/^[a-z][a-z0-9_-]{2,79}$/),
    grants: z.array(UserIdSchema).max(1000),
    configuredBy: UserIdSchema,
    nextDueAt: z.iso.datetime(),
    pending: Job.nullable(),
    lease: Lease.nullable(),
    fence: z.number().int().nonnegative(),
    counters: z
      .object({
        cpu: z.number().int().nonnegative(),
        memory: z.number().int().nonnegative(),
        connection: z.number().int().nonnegative(),
      })
      .strict(),
    alerts: z.array(StoredAlert).max(100),
  })
  .strict();
export const ServerMonitoringDocumentSchema = z
  .object({
    version: z.literal(1),
    workspaceId: WorkspaceIdSchema,
    revision: z.number().int().nonnegative(),
    policy: ServerMonitorPolicySchema,
    targets: z.array(StoredTarget).max(100),
    audit: z
      .array(
        z
          .object({
            at: z.iso.datetime(),
            actor: UserIdSchema,
            action: z.string().max(40),
            targetId: z.string().max(40).optional(),
          })
          .strict(),
      )
      .max(1000),
  })
  .strict();
export type ServerMonitoringDocument = z.infer<typeof ServerMonitoringDocumentSchema>;
type StoredTarget = z.infer<typeof StoredTarget>;
type StoredAlert = z.infer<typeof StoredAlert>;
type Lease = z.infer<typeof Lease>;
const requestId = () => "smr_" + randomUUID().replaceAll("-", "");
const statuses: Record<ServerMonitorAccess["status"], string> = {
  unverified: "Access has not been checked.",
  connected: "The registered collector responded.",
  "auth-failed": "The enrolled credential could not authenticate.",
  "access-denied": "The enrolled account was denied monitoring access.",
  unreachable: "The registered monitoring transport could not be reached.",
  "winrm-unavailable": "The WinRM monitoring endpoint is unavailable.",
  unsupported: "This collector does not support the requested monitoring action.",
  error: "The collector did not return a valid result.",
};
export function serverMonitorTargetId(
  workspaceId: string,
  address: string,
  port: number,
  transport: string,
): string {
  return (
    "srv_" +
    createHash("sha256")
      .update([workspaceId, address, port, transport].join("\0"))
      .digest("hex")
      .slice(0, 32)
  );
}
function fail(message: string, code = 400): never {
  throw new ServerMonitoringError(message, code);
}
function initial(workspaceId: string): ServerMonitoringDocument {
  return {
    version: 1,
    workspaceId: WorkspaceIdSchema.parse(workspaceId),
    revision: 0,
    policy: ServerMonitorPolicySchema.parse({}),
    targets: [],
    audit: [],
  };
}
function identity(workspaceId: string, target: StoredTarget): ServerMonitorCollectorTarget {
  return {
    workspaceId,
    id: target.id,
    address: target.address,
    port: target.port,
    transport: target.transport,
    credentialProfile: target.credentialProfile,
    revision: target.revision,
  };
}
function placeholder(record: ServerMonitoringRegister["records"][number]): boolean {
  return (record.endpoints ?? []).some(({ url }) => {
    if (!url) return false;
    try {
      const host = new URL(url.includes("://") ? url : "https://" + url).hostname
        .toLowerCase()
        .replace(/\.$/, "");
      return ["example.com", "example.org", "example.net", "test", "invalid", "localhost"].some(
        (reserved) => host === reserved || host.endsWith("." + reserved),
      );
    } catch {
      return false;
    }
  });
}
function sourceAddresses(value: unknown): string[] {
  if (typeof value !== "string") return [];
  const values = value.match(/(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w.])/g) ?? [];
  return [...new Set(values.filter(privateServerAddress))];
}

/** Durable monitoring state. The collector only runs outside database transactions. */
export class ServerMonitoringService {
  private readonly owner = "smw_" + randomUUID().replaceAll("-", "");
  private readonly concurrency: number;
  private readonly timeoutMs: number;
  private readonly active = new Set<string>();
  constructor(private readonly options: Options) {
    this.concurrency = Math.max(1, Math.min(8, Math.floor(options.concurrency ?? 3)));
    this.timeoutMs = Math.max(1000, Math.min(120000, options.timeoutMs ?? 30000));
  }
  private async member(workspaceId: string, actor: string, admin = false): Promise<Member> {
    WorkspaceIdSchema.parse(workspaceId);
    UserIdSchema.parse(actor);
    const member = await this.options.authority(workspaceId, actor);
    if (!member.active || (admin && !member.administrator)) fail("forbidden", 403);
    return member;
  }
  private async state(workspaceId: string): Promise<ServerMonitoringDocument> {
    const raw = await this.options.store.read(workspaceId);
    const value = raw === null ? initial(workspaceId) : ServerMonitoringDocumentSchema.parse(raw);
    if (value.workspaceId !== workspaceId) fail("workspace-mismatch", 403);
    return value;
  }
  private async write(document: ServerMonitoringDocument): Promise<void> {
    const value = ServerMonitoringDocumentSchema.parse(document);
    if (Buffer.byteLength(JSON.stringify(value)) > 33554432) fail("storage-limit", 409);
    await this.options.store.write(value.workspaceId, value);
  }
  private audit(
    document: ServerMonitoringDocument,
    actor: string,
    action: string,
    targetId?: string,
  ) {
    document.audit.push({
      at: this.options.store.now(),
      actor: UserIdSchema.parse(actor),
      action,
      ...(targetId ? { targetId } : {}),
    });
    document.audit = document.audit.slice(-1000);
  }
  private canRead(target: StoredTarget, actor: string, member: Member): boolean {
    return member.administrator || target.grants.includes(UserIdSchema.parse(actor));
  }
  private view(
    document: ServerMonitoringDocument,
    actor: string,
    member: Member,
  ): ServerMonitorCatalog {
    return ServerMonitorCatalogSchema.parse({
      workspaceId: document.workspaceId,
      administrator: member.administrator,
      revision: document.revision,
      policy: document.policy,
      observedAt: this.options.store.now(),
      targets: document.targets
        .filter((target) => this.canRead(target, actor, member))
        .map((target) => {
          const {
            configuredBy: _by,
            nextDueAt: _due,
            pending,
            lease,
            fence: _fence,
            counters: _counters,
            alerts,
            credentialProfile,
            grants,
            ...publicTarget
          } = target;
          return {
            ...publicTarget,
            ...(member.administrator ? { credentialProfile, grants } : {}),
            polling:
              pending !== null ||
              (lease !== null &&
                Date.parse(lease.expiresAt) > Date.parse(this.options.store.now())),
            alerts: alerts.map(({ acknowledgedBy, ...alert }) => ({
              ...alert,
              acknowledged: acknowledgedBy.includes(UserIdSchema.parse(actor)),
            })),
          };
        }),
    });
  }
  async catalog(workspaceId: string, actor: string): Promise<ServerMonitorCatalog> {
    const member = await this.member(workspaceId, actor);
    return this.view(await this.state(workspaceId), actor, member);
  }
  private target(document: ServerMonitoringDocument, id: string): StoredTarget {
    return document.targets.find((target) => target.id === id) ?? fail("target-not-found", 404);
  }
  private makeTarget(
    workspaceId: string,
    actor: string,
    value: z.infer<typeof ServerMonitorSaveTargetSchema>,
  ): StoredTarget {
    const at = this.options.store.now();
    return {
      id: serverMonitorTargetId(workspaceId, value.address, value.port, value.transport),
      name: value.name,
      address: value.address,
      port: value.port,
      transport: value.transport,
      enabled: value.enabled,
      credentialProfile: value.credentialProfile,
      grants: value.grants,
      revision: 0,
      sourceRefs: [],
      configuredBy: UserIdSchema.parse(actor),
      access: {
        status: "unverified",
        checkedAt: null,
        computerName: null,
        message: statuses.unverified,
      },
      latest: null,
      history: [],
      alerts: [],
      nextDueAt: at,
      pending: null,
      lease: null,
      fence: 0,
      counters: { cpu: 0, memory: 0, connection: 0 },
      lastAttemptAt: null,
      lastError: null,
    };
  }
  private async allowed(workspaceId: string, target: StoredTarget): Promise<void> {
    if (!(await this.options.targetAllowed(identity(workspaceId, target))))
      fail("target-not-enrolled", 403);
  }
  async saveTarget(
    workspaceId: string,
    actor: string,
    input: unknown,
  ): Promise<ServerMonitorCatalog> {
    await this.member(workspaceId, actor, true);
    const value = ServerMonitorSaveTargetSchema.parse(input);
    for (const user of value.grants) await this.member(workspaceId, user);
    const proposed = this.makeTarget(workspaceId, actor, value);
    await this.allowed(workspaceId, proposed);
    return this.options.store.transaction(workspaceId, async () => {
      const member = await this.member(workspaceId, actor, true),
        document = await this.state(workspaceId);
      const existing = value.id ? this.target(document, value.id) : undefined;
      if (existing) {
        if (existing.revision !== value.expectedRevision) fail("revision-conflict", 409);
        if (existing.id !== proposed.id) fail("target-identity-immutable", 409);
        Object.assign(existing, {
          name: value.name,
          enabled: value.enabled,
          credentialProfile: value.credentialProfile,
          grants: value.grants,
          configuredBy: actor,
          revision: existing.revision + 1,
          pending: null,
          lease: null,
          nextDueAt: this.options.store.now(),
        });
      } else {
        if (value.expectedRevision !== null) fail("revision-conflict", 409);
        if (document.targets.some((target) => target.address === proposed.address))
          fail("target-already-exists", 409);
        if (document.targets.length >= 100) fail("target-limit", 409);
        document.targets.push(proposed);
      }
      this.audit(document, actor, existing ? "target-update" : "target-create", proposed.id);
      await this.write(document);
      return this.view(document, actor, member);
    });
  }
  async importTargets(
    workspaceId: string,
    actor: string,
    input: unknown,
  ): Promise<ServerMonitorImportResult> {
    await this.member(workspaceId, actor, true);
    const value = ServerMonitorImportSchema.parse(input);
    const policy = this.options.sourcePolicies.find(
      (entry) =>
        entry.workspaceId === workspaceId &&
        entry.registerId === value.registerId &&
        entry.hostingField === value.hostingField,
    );
    if (!policy || value.managementValues.some((entry) => !policy.managementValues.includes(entry)))
      fail("source-not-enrolled", 403);
    const register = await this.options.readRegister(workspaceId, actor, value.registerId);
    if (register.id !== value.registerId || register.records.length > 2000)
      fail("source-invalid", 409);
    const existing = await this.state(workspaceId);
    const selected: { target: StoredTarget; ref: StoredTarget["sourceRefs"][number] }[] = [];
    const excluded: ServerMonitorImportResult["excluded"] = [];
    for (const record of register.records) {
      const exclude = (reason: ServerMonitorImportResult["excluded"][number]["reason"]) =>
        excluded.push({ recordId: record.id, reason });
      if (!value.managementValues.includes(record.management)) {
        exclude("management-not-selected");
        continue;
      }
      if (placeholder(record)) {
        exclude("placeholder");
        continue;
      }
      const hosting = record.fields[value.hostingField];
      if (typeof hosting !== "string" || !hosting.trim()) {
        exclude("missing-address");
        continue;
      }
      const addresses = sourceAddresses(hosting);
      if (!addresses.length) {
        exclude("invalid-address");
        continue;
      }
      for (const address of addresses) {
        const target =
          existing.targets.find((entry) => entry.address === address) ??
          this.makeTarget(workspaceId, actor, {
            ...value,
            name: address,
            address,
            grants: [],
            expectedRevision: null,
          });
        await this.allowed(workspaceId, target);
        selected.push({
          target,
          ref: { registerId: register.id, recordId: record.id, title: record.title },
        });
      }
    }
    return this.options.store.transaction(workspaceId, async () => {
      const member = await this.member(workspaceId, actor, true),
        document = await this.state(workspaceId);
      let added = 0,
        updated = 0;
      const changed = new Set<string>();
      const created = new Set<string>();
      for (const { target: proposed, ref } of selected) {
        let target = document.targets.find((entry) => entry.address === proposed.address);
        await this.allowed(workspaceId, target ?? proposed);
        if (!target) {
          if (document.targets.length >= 100) fail("target-limit", 409);
          target = proposed;
          document.targets.push(target);
          added++;
          created.add(target.id);
        }
        if (
          !target.sourceRefs.some(
            (entry) => entry.registerId === ref.registerId && entry.recordId === ref.recordId,
          )
        ) {
          if (target.sourceRefs.length >= 200) fail("source-ref-limit", 409);
          target.sourceRefs.push(ref);
          if (!created.has(target.id) && !changed.has(target.id)) {
            updated++;
            changed.add(target.id);
          }
        }
      }
      this.audit(document, actor, "source-import");
      await this.write(document);
      return { catalog: this.view(document, actor, member), added, updated, excluded };
    });
  }
  async savePolicy(
    workspaceId: string,
    actor: string,
    input: unknown,
  ): Promise<ServerMonitorCatalog> {
    const value = ServerMonitorSavePolicySchema.parse(input);
    return this.options.store.transaction(workspaceId, async () => {
      const member = await this.member(workspaceId, actor, true),
        document = await this.state(workspaceId);
      if (value.expectedRevision !== document.revision) fail("revision-conflict", 409);
      document.policy = value.policy;
      document.revision++;
      for (const target of document.targets) {
        target.lease = null;
        target.nextDueAt = this.options.store.now();
        target.counters = { cpu: 0, memory: 0, connection: 0 };
        this.trim(document, target);
      }
      this.audit(document, actor, "policy-update");
      await this.write(document);
      return this.view(document, actor, member);
    });
  }
  private async queue(
    workspaceId: string,
    actor: string,
    input: unknown,
    action: "check" | "sample",
  ): Promise<ServerMonitorCatalog> {
    const value = ServerMonitorRefreshSchema.parse(input);
    return this.options.store.transaction(workspaceId, async () => {
      const member = await this.member(workspaceId, actor),
        document = await this.state(workspaceId);
      const targets = value.targetId
        ? [this.target(document, value.targetId)]
        : document.targets.filter(
            (target) => target.enabled && this.canRead(target, actor, member),
          );
      for (const target of targets) {
        if (!this.canRead(target, actor, member)) fail("target-not-found", 404);
        if (target.access.status === "auth-failed" && !member.administrator)
          fail("credential-retry-requires-administrator", 403);
        if (!target.pending)
          target.pending = {
            id: requestId(),
            action,
            actor: UserIdSchema.parse(actor),
            queuedAt: this.options.store.now(),
          };
      }
      this.audit(
        document,
        actor,
        action === "check" ? "check-request" : "sample-request",
        value.targetId,
      );
      await this.write(document);
      return this.view(document, actor, member);
    });
  }
  check(workspaceId: string, actor: string, input: unknown = {}) {
    return this.queue(workspaceId, actor, input, "check");
  }
  refresh(workspaceId: string, actor: string, input: unknown = {}) {
    return this.queue(workspaceId, actor, input, "sample");
  }
  async acknowledge(
    workspaceId: string,
    actor: string,
    input: { alertId: string },
  ): Promise<ServerMonitorCatalog> {
    const value = ServerMonitorAcknowledgeSchema.parse(input);
    return this.options.store.transaction(workspaceId, async () => {
      const member = await this.member(workspaceId, actor),
        document = await this.state(workspaceId);
      const target = document.targets.find(
        (entry) =>
          this.canRead(entry, actor, member) &&
          entry.alerts.some((alert) => alert.id === value.alertId),
      );
      if (!target) fail("alert-not-found", 404);
      const alert =
        target.alerts.find((entry) => entry.id === value.alertId) ?? fail("alert-not-found", 404);
      const userId = UserIdSchema.parse(actor);
      if (!alert.acknowledgedBy.includes(userId)) alert.acknowledgedBy.push(userId);
      this.audit(document, actor, "alert-acknowledge", target.id);
      await this.write(document);
      return this.view(document, actor, member);
    });
  }
  private trim(document: ServerMonitoringDocument, target: StoredTarget) {
    const cutoff = Date.parse(this.options.store.now()) - document.policy.retentionHours * 3600000;
    target.history = target.history
      .filter((point) => Date.parse(point.at) >= cutoff)
      .slice(-document.policy.maxPointsPerTarget);
    target.alerts = target.alerts
      .filter((alert) => alert.resolvedAt === null || Date.parse(alert.resolvedAt) >= cutoff)
      .slice(-100);
  }
  private alert(
    target: StoredTarget,
    kind: StoredAlert["kind"],
    high: boolean,
    document: ServerMonitoringDocument,
    at: string,
  ) {
    target.counters[kind] = high ? target.counters[kind] + 1 : 0;
    const existing = target.alerts.find((entry) => entry.kind === kind && !entry.resolvedAt);
    if (high && target.counters[kind] >= document.policy.consecutiveSamples && !existing) {
      const text =
        kind === "cpu"
          ? "CPU utilization exceeded the configured threshold for consecutive samples."
          : kind === "memory"
            ? "Memory utilization exceeded the configured threshold for consecutive samples."
            : "Consecutive monitoring attempts could not reach an authorized collector.";
      target.alerts.push({
        id: "sma_" + randomUUID().replaceAll("-", ""),
        targetId: target.id,
        kind,
        severity: "warning",
        openedAt: at,
        resolvedAt: null,
        message: text,
        acknowledgedBy: [],
      });
    } else if (!high && existing) existing.resolvedAt = at;
    target.alerts = target.alerts.slice(-100);
  }
  private async claim(
    workspaceId: string,
    served: ReadonlySet<string>,
  ): Promise<{ target: ServerMonitorCollectorTarget; lease: Lease } | null> {
    return this.options.store.transaction(workspaceId, async () => {
      const document = await this.state(workspaceId),
        now = this.options.store.now();
      let retentionChanged = false;
      for (const target of document.targets) {
        const points = target.history.length,
          alerts = target.alerts.length;
        this.trim(document, target);
        retentionChanged ||= points !== target.history.length || alerts !== target.alerts.length;
      }
      const manualAt = (target: StoredTarget) =>
        target.pending?.queuedAt ??
        (target.lease?.manual && Date.parse(target.lease.expiresAt) <= Date.parse(now)
          ? target.lease.queuedAt
          : null);
      const candidates = [...document.targets].sort((a, b) => {
        const aManual = manualAt(a),
          bManual = manualAt(b);
        if (aManual !== null && bManual === null) return -1;
        if (aManual === null && bManual !== null) return 1;
        return (
          Date.parse(aManual ?? a.nextDueAt) - Date.parse(bManual ?? b.nextDueAt) ||
          a.id.localeCompare(b.id)
        );
      });
      for (const target of candidates) {
        if (served.has(target.id)) continue;
        if (this.active.has(workspaceId + "/" + target.id)) continue;
        if (target.lease && Date.parse(target.lease.expiresAt) > Date.parse(now)) continue;
        const recovered =
          target.lease &&
          Date.parse(target.lease.expiresAt) <= Date.parse(now) &&
          target.lease.manual
            ? target.lease
            : null;
        const manual = target.pending !== null || recovered !== null;
        if (
          !manual &&
          (!document.policy.enabled ||
            !target.enabled ||
            Date.parse(target.nextDueAt) > Date.parse(now))
        )
          continue;
        const actor = target.pending?.actor ?? recovered?.actor ?? target.configuredBy;
        const member = await this.options.authority(workspaceId, actor);
        if (
          !member.active ||
          (!manual && !member.administrator) ||
          (target.access.status === "auth-failed" && !member.administrator) ||
          !this.canRead(target, actor, member)
        ) {
          target.pending = null;
          target.lease = null;
          target.nextDueAt = new Date(
            Date.parse(now) + document.policy.intervalSeconds * 1000,
          ).toISOString();
          await this.write(document);
          continue;
        }
        const job = target.pending ??
          (recovered
            ? {
                id: recovered.id,
                actor: recovered.actor,
                action: recovered.action,
                queuedAt: recovered.queuedAt,
              }
            : null) ?? { id: requestId(), actor, action: "sample" as const, queuedAt: now };
        const lease: Lease = {
          ...job,
          fence: target.fence + 1,
          owner: this.owner,
          expiresAt: new Date(Date.parse(now) + Math.max(60000, this.timeoutMs * 2)).toISOString(),
          revision: target.revision,
          policyRevision: document.revision,
          manual,
        };
        target.pending = null;
        target.fence = lease.fence;
        target.lease = lease;
        target.lastAttemptAt = now;
        target.nextDueAt = new Date(
          Date.parse(now) + document.policy.intervalSeconds * 1000,
        ).toISOString();
        await this.write(document);
        return { target: identity(workspaceId, target), lease };
      }
      if (retentionChanged) await this.write(document);
      return null;
    });
  }
  private async collect(
    target: ServerMonitorCollectorTarget,
    lease: Lease,
  ): Promise<ServerMonitorCollectionResult> {
    if (!(await this.options.targetAllowed(target)))
      return { status: "access-denied", computerName: null };
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const issuedAt = this.options.store.now();
      const expiresAt = new Date(
        Math.min(Date.parse(lease.expiresAt), Date.parse(issuedAt) + this.timeoutMs),
      ).toISOString();
      const raw = await Promise.race([
        this.options.collector(target, {
          requestId: lease.id,
          action: lease.action,
          issuedAt,
          expiresAt,
          signal: controller.signal,
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error("monitor-timeout"));
          }, this.timeoutMs);
          timer.unref?.();
        }),
      ]);
      const parsed = z
        .object({
          status: ServerMonitorAccessSchema.shape.status.exclude(["unverified"]),
          computerName: ServerMonitorAccessSchema.shape.computerName,
          snapshot: ServerMonitorSnapshotSchema.optional(),
        })
        .strict()
        .safeParse(raw);
      if (
        !parsed.success ||
        (lease.action === "sample" && parsed.data.status === "connected" && !parsed.data.snapshot)
      )
        return { status: "error", computerName: null };
      return parsed.data;
    } catch {
      return { status: "error", computerName: null };
    } finally {
      if (timer) clearTimeout(timer);
      controller.abort();
    }
  }
  private async accept(
    workspaceId: string,
    targetId: string,
    lease: Lease,
    result: ServerMonitorCollectionResult,
  ) {
    return this.options.store.transaction(workspaceId, async () => {
      const document = await this.state(workspaceId),
        target = document.targets.find((entry) => entry.id === targetId);
      if (
        !target ||
        target.lease?.id !== lease.id ||
        target.lease.fence !== lease.fence ||
        target.lease.owner !== this.owner ||
        target.revision !== lease.revision ||
        document.revision !== lease.policyRevision ||
        Date.parse(target.lease.expiresAt) <= Date.parse(this.options.store.now())
      )
        return;
      const member = await this.options.authority(workspaceId, lease.actor);
      target.lease = null;
      if (
        !member.active ||
        (!lease.manual && !member.administrator) ||
        !this.canRead(target, lease.actor, member)
      ) {
        await this.write(document);
        return;
      }
      const at = this.options.store.now();
      if (
        result.snapshot &&
        (Date.parse(result.snapshot.observedAt) > Date.parse(at) + 300000 ||
          Date.parse(result.snapshot.observedAt) <
            Date.parse(at) - Math.max(300000, this.timeoutMs * 2))
      )
        result = { status: "error", computerName: null };
      target.access = {
        status: result.status,
        checkedAt: at,
        computerName: result.computerName,
        message: statuses[result.status],
      };
      target.lastError = result.status === "connected" ? null : statuses[result.status];
      if (result.status === "auth-failed" && target.enabled) {
        target.enabled = false;
        target.revision++;
        this.audit(document, lease.actor, "authentication-failure-pause", target.id);
      }
      this.alert(target, "connection", result.status !== "connected", document, at);
      if (result.status === "connected" && result.snapshot) {
        const snapshot = result.snapshot;
        const timestamp = Date.parse(snapshot.observedAt);
        if (!target.latest || timestamp > Date.parse(target.latest.observedAt)) {
          target.latest = snapshot;
          const used = snapshot.memoryTotalBytes - snapshot.memoryAvailableBytes;
          target.history.push({
            at: snapshot.observedAt,
            cpuPercent: snapshot.cpuPercent,
            memoryUsedBytes: used,
            memoryTotalBytes: snapshot.memoryTotalBytes,
          });
          if (snapshot.cpuPercent !== null)
            this.alert(
              target,
              "cpu",
              snapshot.cpuPercent >= document.policy.cpuWarningPercent,
              document,
              at,
            );
          else target.counters.cpu = 0;
          this.alert(
            target,
            "memory",
            (used / snapshot.memoryTotalBytes) * 100 >= document.policy.memoryWarningPercent,
            document,
            at,
          );
        }
      } else if (lease.action === "sample") {
        target.counters.cpu = 0;
        target.counters.memory = 0;
      }
      this.trim(document, target);
      await this.write(document);
    });
  }
  /** Called by a bounded worker timer. PostgreSQL leases fence concurrent instances. */
  async runDue(): Promise<number> {
    let started = 0;
    const workspaces = await this.options.store.workspaces();
    for (const workspaceId of workspaces) {
      const tasks: Promise<void>[] = [];
      const served = new Set<string>();
      while (this.active.size < this.concurrency) {
        const claimed = await this.claim(workspaceId, served);
        if (!claimed) break;
        served.add(claimed.target.id);
        const key = workspaceId + "/" + claimed.target.id;
        this.active.add(key);
        started++;
        tasks.push(
          (async () => {
            try {
              await this.accept(
                workspaceId,
                claimed.target.id,
                claimed.lease,
                await this.collect(claimed.target, claimed.lease),
              );
            } finally {
              this.active.delete(key);
            }
          })(),
        );
      }
      await Promise.all(tasks);
    }
    return started;
  }
}
