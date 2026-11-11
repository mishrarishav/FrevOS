import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import {
  ReviewAddReviewSchema,
  ReviewCalendarDateSchema,
  type ReviewCatalog,
  ReviewCatalogSchema,
  ReviewCheckLinkSchema,
  type ReviewCheckResult,
  ReviewCheckResultSchema,
  ReviewCommitImportSchema,
  ReviewDeleteRecordSchema,
  type ReviewEndpoint,
  ReviewGrantInputSchema,
  type ReviewImportPreview,
  ReviewImportPreviewSchema,
  type ReviewLinkPolicy,
  type ReviewMonitorAlert,
  type ReviewMonitoringState,
  ReviewMonitoringStateSchema,
  type ReviewMonitoringSummary,
  ReviewMonitoringSummarySchema,
  type ReviewMonitorRun,
  ReviewPreviewImportSchema,
  ReviewReadMonitorAlertSchema,
  type ReviewRecord,
  type ReviewRecordInput,
  ReviewRecordInputSchema,
  ReviewRecordSchema,
  type ReviewRegister,
  ReviewRegisterIdSchema,
  ReviewRegisterSchema,
  ReviewRunMonitorSchema,
  ReviewSaveRecordSchema,
  ReviewSaveRegisterSchema,
  ReviewSaveScheduleSchema,
  type ReviewState,
  ReviewStateSchema,
  type ReviewWorkbook,
  ReviewWorkbookInputSchema,
  ReviewWorkbookSchema,
  UserIdSchema,
  WorkspaceIdSchema,
} from "@frevos/contracts";
import { z } from "zod";
import { replaceDurableRecord } from "./atomic-record.js";
import { assertPlainPath } from "./model-secrets.js";
import { latestReviewOccurrence, nextReviewOccurrence } from "./review-monitor-schedule.js";
import { ReviewWorkbookError } from "./review-workbook.js";

export class ReviewRegisterError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
  ) {
    super("reviews-" + message);
  }
}
export interface ReviewStateStore {
  read(workspaceId: string): Promise<unknown | null>;
  write(workspaceId: string, document: unknown): Promise<void>;
  transaction<T>(workspaceId: string, operation: () => Promise<T>): Promise<T>;
  workspaces(): Promise<string[]>;
  now(): string;
}
function fail(message: string, status = 400): never {
  throw new ReviewRegisterError(message, status);
}
const id = (prefix: string) => prefix + randomUUID().replaceAll("-", "");
const nowIso = () => new Date().toISOString();
const digest = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(value) ?? "null")
    .digest("hex");
const maxBytes = 32 * 1024 * 1024;
const Audit = z
  .object({
    at: z.iso.datetime(),
    by: UserIdSchema,
    action: z.string().max(60),
    registerId: ReviewRegisterIdSchema,
    recordId: z.string().max(60).optional(),
    revision: z.number().int().nonnegative(),
  })
  .strict();
const Monitoring = ReviewMonitoringStateSchema.extend({
  lease: z
    .object({
      owner: z
        .string()
        .regex(/^rworker_[a-f0-9]{32}$/)
        .nullable(),
      fence: z.number().int().nonnegative(),
      expiresAt: z.iso.datetime(),
    })
    .strict()
    .nullable()
    .default(null),
  lastOccurrenceKey: z.string().max(400).nullable().default(null),
  reads: z
    .array(
      z
        .object({ alertId: z.string().max(60), userId: UserIdSchema, at: z.iso.datetime() })
        .strict(),
    )
    .max(6000)
    .default([]),
  alertKeys: z
    .array(z.object({ id: z.string().max(60), key: z.string().max(64) }).strict())
    .max(300)
    .default([]),
  bindings: z
    .array(
      z
        .object({
          runId: z.string().max(60),
          policyHash: z.string().length(64),
          truncated: z.boolean(),
          missingUrls: z.number().int().nonnegative().default(0),
          items: z.array(z.string().length(64)).max(1000),
        })
        .strict(),
    )
    .max(12)
    .default([]),
}).strict();
type Monitoring = z.infer<typeof Monitoring>;
const PendingImport = z
  .object({
    actor: UserIdSchema,
    workspaceId: WorkspaceIdSchema,
    preview: ReviewImportPreviewSchema,
    mapping: z.record(z.string().max(40), z.string().regex(/^[A-Z]{1,3}$/)),
    blockedRows: z.array(z.number().int().positive()).max(2000),
  })
  .strict();
const Stored = z
  .object({
    version: z.literal(1),
    workspaceId: WorkspaceIdSchema,
    registers: z
      .array(
        z
          .object({
            register: ReviewRegisterSchema,
            records: z.array(ReviewRecordSchema).max(2000),
            monitoring: Monitoring.optional(),
          })
          .strict(),
      )
      .max(100),
    audit: z.array(Audit).max(1000),
    previews: z.array(PendingImport).max(10).default([]),
  })
  .strict();
type Store = z.infer<typeof Stored>;
export const ReviewWorkspaceStateSchema = Stored;
export type ReviewWorkspaceDocument = Store;
type Data = Store["registers"][number];
type Member = { active: boolean; administrator: boolean };
type Options = {
  parseWorkbook?: (input: {
    fileName: string;
    contentBase64: string;
  }) => ReviewWorkbook | Promise<ReviewWorkbook>;
  checkLink?: (endpoint: ReviewEndpoint, policy: ReviewLinkPolicy) => Promise<ReviewCheckResult>;
  now?: () => string;
};
const choices = (value: string) =>
  value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .toLowerCase();
const core = [
  "title",
  "description",
  "department",
  "management",
  "businessOwner",
  "spoc",
  "technicalAssignee",
  "lifecycle",
  "requirement",
  "recordedAccess",
] as const;
const sameAssignments = (a: ReviewRecordInput, b: ReviewRecordInput) =>
  a.businessOwner === b.businessOwner &&
  a.spoc === b.spoc &&
  a.technicalAssignee === b.technicalAssignee;
function semantic(record: ReviewRecordInput) {
  return digest({
    ...Object.fromEntries(core.map((field) => [field, record[field]])),
    fields: Object.fromEntries(
      Object.entries(record.fields).sort(([a], [b]) => a.localeCompare(b)),
    ),
    endpoints: record.endpoints.map(({ id: _, ...endpoint }) => endpoint),
  });
}
function key(record: ReviewRecordInput) {
  if (record.endpoints[0]) {
    try {
      const u = new URL(record.endpoints[0].url);
      return (
        "url:" +
        u.hostname.toLowerCase() +
        ":" +
        (u.port || (u.protocol === "https:" ? "443" : "80")) +
        u.pathname.replace(/\/$/, "") +
        u.search
      );
    } catch {
      return "invalid:" + record.endpoints[0].url;
    }
  }
  return "title:" + record.title.trim().toLowerCase();
}
function validUrl(value: string) {
  try {
    const u = new URL(value);
    return (
      ["http:", "https:"].includes(u.protocol) &&
      !u.username &&
      !u.password &&
      !u.hash &&
      ![...u.searchParams.keys()].some((key) =>
        /(?:token|password|passwd|secret|api.?key|session|authorization)/i.test(key),
      ) &&
      !Array.from(value).some(
        (character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
      )
    );
  } catch {
    return false;
  }
}
export class ReviewRegisters {
  private chain: Promise<unknown> = Promise.resolve();
  private readonly workerId = id("rworker_");
  private readonly checking = new Set<string>();
  private monitoringWork: Promise<void> | null = null;
  private monitoringWakeup = false;
  private monitoringClosing = false;
  private readonly now: () => string;
  constructor(
    readonly root: string | ReviewStateStore,
    private readonly member: (workspaceId: string, userId: string) => Promise<Member>,
    private readonly users: (
      workspaceId: string,
    ) => Promise<{ userId: string; name: string }[]> = async () => [],
    private readonly options: Options = {},
  ) {
    this.now = options.now ?? (typeof root === "string" ? nowIso : () => root.now());
  }
  private async actor(actor: string, ws: string) {
    UserIdSchema.parse(actor);
    WorkspaceIdSchema.parse(ws);
    const member = await this.member(ws, actor);
    if (!member.active) fail("access-denied", 403);
    return member;
  }
  private file(ws: string) {
    WorkspaceIdSchema.parse(ws);
    if (typeof this.root !== "string") fail("file-storage-disabled", 503);
    return join(this.root, ws + ".json");
  }
  private async read(ws: string): Promise<Store> {
    if (typeof this.root !== "string") {
      const raw = await this.root.read(ws);
      const stored =
        raw === null
          ? Stored.parse({ version: 1, workspaceId: ws, registers: [], audit: [] })
          : Stored.parse(raw);
      if (
        stored.workspaceId !== ws ||
        stored.registers.some((data) => data.register.workspaceId !== ws) ||
        new Set(stored.registers.map((data) => data.register.id)).size !==
          stored.registers.length ||
        stored.registers.some(
          (data) => new Set(data.records.map((record) => record.id)).size !== data.records.length,
        )
      )
        fail("storage-invalid", 503);
      return stored;
    }
    const file = this.file(ws);
    await assertPlainPath(file);
    try {
      const stat = await lstat(file);
      if (!stat.isFile() || stat.size > maxBytes) fail("storage-unavailable", 503);
      const stored = Stored.parse(JSON.parse(await readFile(file, "utf8")));
      if (
        stored.workspaceId !== ws ||
        new Set(stored.registers.map((r) => r.register.id)).size !== stored.registers.length ||
        stored.registers.some(
          (d) =>
            d.register.workspaceId !== ws ||
            new Set(d.records.map((r) => r.id)).size !== d.records.length,
        )
      )
        fail("storage-invalid", 503);
      return stored;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        if (error instanceof ReviewRegisterError) throw error;
        fail("storage-invalid", 503);
      }
    }
    return {
      version: 1,
      workspaceId: WorkspaceIdSchema.parse(ws),
      registers: [],
      audit: [],
      previews: [],
    };
  }
  private async write(store: Store) {
    for (const data of store.registers)
      if (data.monitoring) await this.refreshAlerts(data, store.workspaceId);
    const content = JSON.stringify(Stored.parse(store));
    if (Buffer.byteLength(content) > maxBytes) fail("storage-limit", 409);
    if (typeof this.root !== "string") {
      await this.root.write(store.workspaceId, JSON.parse(content));
      return;
    }
    const file = this.file(store.workspaceId);
    await assertPlainPath(file);
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const tmp = file + "." + randomUUID() + ".tmp";
    const handle = await open(tmp, "wx", 0o600);
    try {
      await handle.writeFile(content, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await replaceDurableRecord(tmp, file);
    } finally {
      await unlink(tmp).catch((e) => {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      });
    }
  }
  private async serial<T>(work: () => Promise<T>, workspaceId: string): Promise<T> {
    const operation = () =>
      typeof this.root === "string" ? work() : this.root.transaction(workspaceId, work);
    const result = this.chain.then(operation, operation);
    this.chain = result.catch(() => {});
    return result;
  }
  private data(store: Store, registerId: string, actor: string, member: Member, write = false) {
    ReviewRegisterIdSchema.parse(registerId);
    const data = store.registers.find((r) => r.register.id === registerId);
    const grant = data?.register.grants.find((g) => g.userId === actor);
    if (!data || (!member.administrator && !grant)) fail("not-found", 404);
    if (write && !member.administrator && grant?.role !== "reviewer") fail("read-only", 403);
    return data;
  }
  private view(data: Data, actor: string, member: Member): ReviewState {
    return ReviewStateSchema.parse({
      register: { ...data.register, grants: member.administrator ? data.register.grants : [] },
      records: data.records,
      ...(data.monitoring ? { monitoring: this.monitorView(data, actor) } : {}),
      role: member.administrator
        ? "administrator"
        : data.register.grants.find((g) => g.userId === actor)!.role,
    });
  }
  private audit(store: Store, actor: string, action: string, data: Data, recordId?: string) {
    store.audit.push({
      at: this.now(),
      by: UserIdSchema.parse(actor),
      action,
      registerId: data.register.id,
      ...(recordId ? { recordId } : {}),
      revision: data.register.revision,
    });
    store.audit = store.audit.slice(-1000);
  }
  private bump(data: Data) {
    data.register.revision++;
  }
  private monitorData(data: Data): Monitoring {
    if (!data.monitoring)
      data.monitoring = Monitoring.parse({
        schedule: null,
        scheduleRevision: 0,
        configuredBy: null,
        configuredAt: null,
        nextRunAt: null,
        runs: [],
        alerts: [],
      });
    return data.monitoring;
  }
  private monitorView(data: Data, actor: string): ReviewMonitoringState {
    const monitor = this.monitorData(data);
    const {
      reads,
      alertKeys: _,
      bindings: __,
      lastOccurrenceKey: ___,
      lease: ____,
      ...publicState
    } = monitor;
    return ReviewMonitoringStateSchema.parse({
      ...publicState,
      alerts: monitor.alerts.map((alert) => ({
        ...alert,
        readAt:
          reads.find((read) => read.alertId === alert.id && read.userId === actor)?.at ?? null,
      })),
    });
  }
  async monitoring(actor: string, ws: string): Promise<ReviewMonitoringSummary> {
    const member = await this.actor(actor, ws),
      store = await this.read(ws);
    return ReviewMonitoringSummarySchema.parse({
      workspaceId: ws,
      registers: store.registers
        .filter(
          (data) =>
            data.monitoring &&
            (member.administrator || data.register.grants.some((grant) => grant.userId === actor)),
        )
        .map((data) => {
          const monitoring = this.monitorView(data, actor),
            latest = monitoring.runs.at(-1);
          return {
            registerId: data.register.id,
            registerName: data.register.name,
            monitoring: {
              ...monitoring,
              runs: latest
                ? [
                    {
                      ...latest,
                      items: [],
                      summary: {
                        endpoints: latest.items.length,
                        completed: latest.items.filter((item) => item.status === "completed")
                          .length,
                        issues:
                          latest.items.filter(
                            (item) =>
                              ["skipped", "interrupted"].includes(item.status) ||
                              (item.result && item.result.status !== "healthy"),
                          ).length +
                          (data.monitoring?.bindings.find((binding) => binding.runId === latest.id)
                            ?.missingUrls ?? 0),
                      },
                    },
                  ]
                : [],
            },
          };
        }),
    });
  }
  private validateRecord(data: Data, record: ReviewRecordInput) {
    const config = data.register;
    for (const [field, options] of [
      ["management", config.managementOptions],
      ["lifecycle", config.lifecycleOptions],
      ["requirement", config.requirementOptions],
    ] as const)
      if (record[field] && !options.includes(record[field])) fail("invalid-" + field);
    for (const field of config.fields) {
      const value = record.fields[field.key] ?? "";
      if (field.required && !value.trim()) fail("required-field-" + field.key);
      if (value && field.type === "select" && !field.options.includes(value))
        fail("invalid-field-" + field.key);
      if (value && field.type === "date" && !ReviewCalendarDateSchema.safeParse(value).success)
        fail("invalid-field-" + field.key);
    }
    if (Object.keys(record.fields).some((k) => !config.fields.some((f) => f.key === k)))
      fail("unknown-field");
    if (
      new Set(record.endpoints.map((e) => e.id)).size !== record.endpoints.length ||
      record.endpoints.some((e) => !validUrl(e.url))
    )
      fail("invalid-endpoint");
  }
  private updated(
    data: Data,
    actor: string,
    input: ReviewRecordInput,
    old?: ReviewRecord,
  ): ReviewRecord {
    this.validateRecord(data, input);
    const at = this.now();
    const checks =
      old?.checks.map((check) => ({
        ...check,
        current:
          check.current &&
          digest(old.endpoints.find((e) => e.id === check.endpointId)) ===
            digest(input.endpoints.find((e) => e.id === check.endpointId)),
      })) ?? [];
    return ReviewRecordSchema.parse({
      ...input,
      id: old?.id ?? id("rec_"),
      revision: (old?.revision ?? 0) + 1,
      updatedAt: at,
      updatedBy: actor,
      provenance: old?.provenance ?? [],
      assignmentHistory:
        !old || sameAssignments(old, input)
          ? (old?.assignmentHistory ?? [])
          : [
              ...old.assignmentHistory,
              {
                businessOwner: old.businessOwner,
                spoc: old.spoc,
                technicalAssignee: old.technicalAssignee,
                at,
                by: actor,
              },
            ].slice(-100),
      reviews: old?.reviews ?? [],
      checks,
    });
  }
  async catalog(actor: string, ws: string): Promise<ReviewCatalog> {
    const member = await this.actor(actor, ws),
      store = await this.read(ws);
    return ReviewCatalogSchema.parse({
      workspaceId: ws,
      administrator: member.administrator,
      registers: store.registers.flatMap((d) => {
        const grant = d.register.grants.find((g) => g.userId === actor);
        return member.administrator || grant
          ? [
              {
                id: d.register.id,
                name: d.register.name,
                description: d.register.description,
                revision: d.register.revision,
                role: member.administrator ? "administrator" : grant!.role,
                recordCount: d.records.length,
              },
            ]
          : [];
      }),
      users: member.administrator ? await this.users(ws) : [],
    });
  }
  async state(actor: string, ws: string, registerId: string): Promise<ReviewState> {
    const member = await this.actor(actor, ws),
      store = await this.read(ws);
    return this.view(this.data(store, registerId, actor, member), actor, member);
  }
  async execute(
    actor: string,
    ws: string,
    action: string,
    raw: unknown,
  ): Promise<ReviewState | ReviewWorkbook | ReviewImportPreview> {
    if (action === "check-link") return this.check(actor, ws, raw);
    return this.serial(async () => {
      const member = await this.actor(actor, ws),
        store = await this.read(ws);
      if (action === "save-schedule") {
        if (!member.administrator) fail("administrator-required", 403);
        const input = ReviewSaveScheduleSchema.parse(raw),
          data = this.data(store, input.registerId, actor, member, true);
        if (
          input.schedule.enabled &&
          typeof this.root !== "string" &&
          !(await this.root.workspaces()).includes(ws)
        )
          fail("monitor-workspace-not-enrolled", 409);
        if (data.register.revision !== input.expectedRevision) fail("revision-conflict", 409);
        const monitor = this.monitorData(data);
        monitor.lease = {
          owner: null,
          fence: (monitor.lease?.fence ?? 0) + 1,
          expiresAt: this.now(),
        };
        for (const run of monitor.runs)
          if (run.status === "running") this.stopRun(run, "Monitoring configuration changed.");
        monitor.schedule = input.schedule;
        monitor.scheduleRevision++;
        monitor.configuredBy = UserIdSchema.parse(actor);
        monitor.configuredAt = this.now();
        monitor.lastOccurrenceKey = null;
        monitor.nextRunAt = nextReviewOccurrence(input.schedule, this.now())?.at ?? null;
        this.bump(data);
        this.audit(store, actor, action, data);
        await this.write(store);
        return this.view(data, actor, member);
      }
      if (action === "run-monitor") {
        if (this.monitoringClosing) fail("monitor-stopping", 503);
        if (!member.administrator) fail("administrator-required", 403);
        if (typeof this.root !== "string" && !(await this.root.workspaces()).includes(ws))
          fail("monitor-workspace-not-enrolled", 409);
        const input = ReviewRunMonitorSchema.parse(raw),
          data = this.data(store, input.registerId, actor, member, true);
        if (data.register.revision !== input.expectedRevision) fail("revision-conflict", 409);
        const monitor = this.monitorData(data);
        if (!monitor.schedule || !monitor.schedule.accessibleValues.length)
          fail("schedule-required", 409);
        if (monitor.runs.some((run) => run.status === "running")) fail("monitor-in-progress", 409);
        this.claimRun(data, actor, "manual", null, null);
        this.bump(data);
        this.audit(store, actor, action, data);
        await this.write(store);
        this.monitoringWakeup = true;
        queueMicrotask(() => void this.tickMonitoring().catch(() => undefined));
        return this.view(data, actor, member);
      }
      if (action === "read-monitor-alert") {
        const input = ReviewReadMonitorAlertSchema.parse(raw),
          data = this.data(store, input.registerId, actor, member),
          monitor = this.monitorData(data);
        if (!monitor.alerts.some((alert) => alert.id === input.alertId))
          fail("alert-not-found", 404);
        monitor.reads = monitor.reads.filter(
          (read) => !(read.alertId === input.alertId && read.userId === actor),
        );
        monitor.reads.push({
          alertId: input.alertId,
          userId: UserIdSchema.parse(actor),
          at: this.now(),
        });
        monitor.reads = monitor.reads.slice(-6000);
        await this.write(store);
        return this.view(data, actor, member);
      }
      if (action === "save-register") {
        if (!member.administrator) fail("administrator-required", 403);
        const input = ReviewSaveRegisterSchema.parse(raw);
        if (
          new Set(input.config.fields.map((f) => f.key)).size !== input.config.fields.length ||
          input.config.fields.some((f) => [...core, "url"].includes(f.key as (typeof core)[number]))
        )
          fail("duplicate-field");
        for (const values of [
          input.config.managementOptions,
          input.config.lifecycleOptions,
          input.config.requirementOptions,
          input.config.decisionOptions,
          ...input.config.fields.map((f) => f.options),
        ])
          if (new Set(values).size !== values.length) fail("duplicate-option");
        if (
          input.config.linkPolicy.allowedOrigins.some((origin) => {
            try {
              const u = new URL(origin);
              return !validUrl(origin) || u.origin !== origin;
            } catch {
              return true;
            }
          })
        )
          fail("invalid-origin");
        let data: Data;
        if (input.id) {
          data = this.data(store, input.id, actor, member, true);
          if (data.register.revision !== input.expectedRevision) fail("revision-conflict", 409);
          const policyChanged =
            digest(data.register.linkPolicy) !== digest(input.config.linkPolicy);
          data.register = {
            ...data.register,
            ...input.config,
            revision: data.register.revision + 1,
          };
          for (const record of data.records) {
            this.validateRecord(data, record);
            if (policyChanged)
              record.checks = record.checks.map((check) => ({ ...check, current: false }));
          }
        } else {
          if (input.expectedRevision !== 0) fail("revision-conflict", 409);
          if (store.registers.length >= 100) fail("register-limit", 409);
          data = {
            register: {
              ...input.config,
              id: id("rr_"),
              workspaceId: WorkspaceIdSchema.parse(ws),
              revision: 1,
              grants: [],
              createdAt: this.now(),
              createdBy: UserIdSchema.parse(actor),
            },
            records: [],
          };
          store.registers.push(data);
        }
        this.audit(store, actor, action, data);
        await this.write(store);
        return this.view(data, actor, member);
      }
      if (action === "save-record") {
        const input = ReviewSaveRecordSchema.parse(raw),
          data = this.data(store, input.registerId, actor, member, true),
          old = input.id ? data.records.find((r) => r.id === input.id) : undefined;
        if (input.id && !old) fail("record-not-found", 404);
        if ((old?.revision ?? 0) !== input.expectedRevision) fail("revision-conflict", 409);
        if (!old && data.records.length >= 2000) fail("record-limit", 409);
        const record = this.updated(data, actor, input.record, old);
        if (old) data.records[data.records.indexOf(old)] = record;
        else data.records.push(record);
        this.bump(data);
        this.audit(store, actor, action, data, record.id);
        await this.write(store);
        return this.view(data, actor, member);
      }
      if (action === "delete-record") {
        const input = ReviewDeleteRecordSchema.parse(raw),
          data = this.data(store, input.registerId, actor, member, true),
          record = data.records.find((r) => r.id === input.recordId);
        if (!record) fail("record-not-found", 404);
        if (record.revision !== input.expectedRevision) fail("revision-conflict", 409);
        data.records = data.records.filter((r) => r.id !== record.id);
        this.bump(data);
        this.audit(store, actor, action, data, record.id);
        await this.write(store);
        return this.view(data, actor, member);
      }
      if (action === "grant") {
        if (!member.administrator) fail("administrator-required", 403);
        const input = ReviewGrantInputSchema.parse(raw),
          data = this.data(store, input.registerId, actor, member, true);
        if (data.register.revision !== input.expectedRevision) fail("revision-conflict", 409);
        if (input.role && !(await this.member(ws, input.userId)).active)
          fail("member-not-found", 404);
        data.register.grants = data.register.grants.filter((g) => g.userId !== input.userId);
        if (input.role) data.register.grants.push({ userId: input.userId, role: input.role });
        this.bump(data);
        this.audit(store, actor, action, data);
        await this.write(store);
        return this.view(data, actor, member);
      }
      if (action === "workbook" || action === "preview-import") {
        const input =
            action === "workbook"
              ? ReviewWorkbookInputSchema.parse(raw)
              : ReviewPreviewImportSchema.parse(raw),
          data = this.data(store, input.registerId, actor, member, true);
        if (!this.options.parseWorkbook) fail("workbook-unavailable", 503);
        let workbook: ReviewWorkbook;
        try {
          workbook = ReviewWorkbookSchema.parse(
            await this.options.parseWorkbook({
              fileName: input.fileName,
              contentBase64: input.contentBase64,
            }),
          );
        } catch (error) {
          if (error instanceof ReviewWorkbookError) fail("workbook-" + error.code);
          throw error;
        }
        if (action === "workbook") return workbook;
        const previewInput = ReviewPreviewImportSchema.parse(raw);
        if (data.register.revision !== previewInput.expectedRevision)
          fail("revision-conflict", 409);
        const preview = this.preview(actor, ws, data, workbook, previewInput, store);
        await this.write(store);
        return preview;
      }
      if (action === "commit-import") {
        const input = ReviewCommitImportSchema.parse(raw),
          data = this.data(store, input.registerId, actor, member, true),
          pending = store.previews.find((pending) => pending.preview.id === input.previewId);
        if (
          !pending ||
          pending.actor !== actor ||
          pending.workspaceId !== ws ||
          pending.preview.registerId !== input.registerId ||
          Date.parse(pending.preview.expiresAt) <= Date.parse(this.now())
        )
          fail("preview-expired", 409);
        if (
          data.register.revision !== input.expectedRevision ||
          pending.preview.revision !== input.expectedRevision
        )
          fail("revision-conflict", 409);
        if (
          new Set(input.resolutions.map((r) => r.row)).size !== input.resolutions.length ||
          input.resolutions.some((r) => !pending.preview.rows.some((p) => p.row === r.row))
        )
          fail("invalid-resolution");
        const updateTargets = new Set<string>();
        for (const row of pending.preview.rows) {
          const resolution =
            input.resolutions.find((r) => r.row === row.row)?.action ?? row.defaultAction;
          if (resolution !== "update") continue;
          if (!row.candidateRecordId) fail("invalid-update-target", 409);
          if (updateTargets.has(row.candidateRecordId)) fail("duplicate-import-update", 409);
          updateTargets.add(row.candidateRecordId);
        }
        for (const row of pending.preview.rows) {
          const resolution =
            input.resolutions.find((r) => r.row === row.row)?.action ?? row.defaultAction;
          if (resolution === "conflict") fail("unresolved-import-conflict", 409);
          if (resolution === "skip") continue;
          if (pending.blockedRows.includes(row.row)) fail("invalid-import-row-" + row.row, 409);
          const old =
            resolution === "update"
              ? data.records.find((r) => r.id === row.candidateRecordId)
              : undefined;
          if (resolution === "update" && !old) fail("invalid-update-target", 409);
          if (!old && data.records.length >= 2000) fail("record-limit", 409);
          const record = this.updated(data, actor, row.record, old);
          record.provenance = [
            ...record.provenance,
            {
              sourceHash: pending.preview.sourceHash,
              fileName: pending.preview.fileName,
              sheet: pending.preview.sheet,
              row: row.row,
              cells: Object.fromEntries(
                Object.entries(pending.mapping).map(([field, column]) => [field, column + row.row]),
              ),
              importedAt: this.now(),
              importedBy: UserIdSchema.parse(actor),
            },
          ].slice(-20);
          if (old) data.records[data.records.indexOf(old)] = record;
          else data.records.push(record);
        }
        this.bump(data);
        this.audit(store, actor, action, data);
        store.previews = store.previews.filter((pending) => pending.preview.id !== input.previewId);
        await this.write(store);
        return this.view(data, actor, member);
      }
      if (action === "add-review") {
        const input = ReviewAddReviewSchema.parse(raw),
          data = this.data(store, input.registerId, actor, member, true),
          record = data.records.find((r) => r.id === input.recordId);
        if (!record) fail("record-not-found", 404);
        if (record.revision !== input.expectedRevision) fail("revision-conflict", 409);
        if (!data.register.decisionOptions.includes(input.decision)) fail("invalid-decision");
        record.reviews = [
          ...record.reviews,
          {
            id: id("rev_"),
            decision: input.decision,
            note: input.note,
            nextAction: input.nextAction,
            dueDate: input.dueDate,
            at: this.now(),
            by: UserIdSchema.parse(actor),
          },
        ].slice(-100);
        record.revision++;
        record.updatedAt = this.now();
        record.updatedBy = UserIdSchema.parse(actor);
        this.bump(data);
        this.audit(store, actor, action, data, record.id);
        await this.write(store);
        return this.view(data, actor, member);
      }
      return fail("unknown-action", 404);
    }, ws);
  }
  private preview(
    actor: string,
    ws: string,
    data: Data,
    workbook: ReviewWorkbook,
    input: z.infer<typeof ReviewPreviewImportSchema>,
    store: Store,
  ) {
    const sheet = workbook.sheets.find((s) => s.name === input.sheet);
    if (!sheet) fail("sheet-not-found");
    const headers = sheet.rows.find((r) => r.row === input.headerRow);
    if (!headers) fail("header-row-not-found");
    const allowed = new Set<string>([...core, "url", ...data.register.fields.map((f) => f.key)]);
    if (
      !input.mapping["title"] ||
      Object.keys(input.mapping).some((k) => !allowed.has(k)) ||
      Object.values(input.mapping).some((c) => !headers.cells.some((h) => h.column === c))
    )
      fail("invalid-mapping");
    const rows: ReviewImportPreview["rows"] = [],
      seen = new Set<string>(),
      blockedRows: number[] = [];
    for (const source of sheet.rows.filter((r) => r.row > input.headerRow)) {
      if (!source.cells.some((c) => c.text.trim())) continue;
      const value = (field: string) => {
        const c = source.cells.find((c) => c.column === input.mapping[field]);
        const raw = c?.text.trim() ?? "";
        return input.valueMappings?.[field]?.[raw] ?? raw;
      };
      const record: ReviewRecordInput = {
        title: value("title") || "[Missing title]",
        description: value("description"),
        department: value("department"),
        management: value("management"),
        businessOwner: value("businessOwner"),
        spoc: value("spoc"),
        technicalAssignee: value("technicalAssignee"),
        lifecycle: value("lifecycle"),
        requirement: value("requirement"),
        recordedAccess: value("recordedAccess"),
        fields: Object.fromEntries(data.register.fields.map((f) => [f.key, value(f.key)])),
        endpoints: [],
      };
      const issues: string[] = [];
      if (!value("title")) {
        issues.push("Title is missing; map a populated title column or skip this row.");
        blockedRows.push(source.row);
      }
      for (const [field, options] of [
        ["management", data.register.managementOptions],
        ["lifecycle", data.register.lifecycleOptions],
        ["requirement", data.register.requirementOptions],
      ] as const) {
        const match = options.find((o) => choices(o) === choices(record[field]));
        if (match) record[field] = match;
      }
      const urlCell = source.cells.find((c) => c.column === input.mapping["url"]),
        rawUrl = urlCell?.hyperlink ?? value("url");
      if (rawUrl) {
        const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : input.defaultScheme + "://" + rawUrl;
        if (validUrl(url))
          record.endpoints.push({
            id: id("ep_"),
            label: "",
            url,
            expectedText: "",
            expectedStatuses: [200],
          });
        else
          issues.push(
            "Mapped URL is not a single HTTP(S) endpoint; configure its endpoint after import.",
          );
      }
      if (source.cells.some((c) => c.formula && Object.values(input.mapping).includes(c.column)))
        issues.push("Mapped formula uses the saved workbook value; formulas are never executed.");
      const recordKey = key(record),
        matches = data.records.filter(
          (r) =>
            key(r) === recordKey ||
            (!record.endpoints.length &&
              r.title.trim().toLowerCase() === record.title.trim().toLowerCase()),
        ),
        candidate = matches.length === 1 ? matches[0] : undefined,
        duplicate = seen.has(recordKey);
      seen.add(recordKey);
      if (candidate) {
        for (const field of core)
          if (!Object.hasOwn(input.mapping, field)) record[field] = candidate[field];
        for (const field of data.register.fields)
          if (!Object.hasOwn(input.mapping, field.key))
            record.fields[field.key] = candidate.fields[field.key] ?? "";
        if (!input.mapping["url"]) record.endpoints = [...candidate.endpoints];
        else if (record.endpoints[0]) {
          const imported = record.endpoints[0],
            existing = candidate.endpoints.find(
              (e) =>
                key({ ...record, endpoints: [e] }) === key({ ...record, endpoints: [imported] }),
            );
          if (existing) record.endpoints = [...candidate.endpoints];
        }
      }
      try {
        ReviewRecordInputSchema.parse(record);
        this.validateRecord(data, record);
      } catch (error) {
        blockedRows.push(source.row);
        issues.push(
          error instanceof ReviewRegisterError
            ? error.message
            : "A mapped value exceeds the configured field limits.",
        );
      }
      if (matches.length > 1)
        issues.push("Several existing records match; resolve these duplicates before updating.");
      if (duplicate) issues.push("Another row in this workbook has the same endpoint or title.");
      const unchanged = candidate && semantic(candidate) === semantic(record);
      if (candidate && !unchanged)
        issues.push(
          "Existing record matches; update only after reviewing ownership and other values.",
        );
      rows.push({
        row: source.row,
        record,
        candidateRecordId: candidate?.id ?? null,
        defaultAction: issues.length ? "conflict" : unchanged ? "skip" : "create",
        issues,
      });
    }
    const preview = ReviewImportPreviewSchema.parse({
      id: id("rip_"),
      registerId: data.register.id,
      revision: data.register.revision,
      sourceHash: workbook.sourceHash,
      fileName: workbook.fileName,
      sheet: sheet.name,
      expiresAt: new Date(Date.parse(this.now()) + 15 * 60 * 1000).toISOString(),
      rows,
    });
    store.previews = store.previews.filter(
      (pending) => Date.parse(pending.preview.expiresAt) > Date.parse(this.now()),
    );
    if (store.previews.length >= 10) fail("preview-limit", 429);
    store.previews.push(
      PendingImport.parse({
        actor,
        workspaceId: ws,
        preview: structuredClone(preview),
        mapping: structuredClone(input.mapping),
        blockedRows,
      }),
    );
    if (Buffer.byteLength(JSON.stringify(store.previews)) > 8 * 1024 * 1024)
      fail("preview-storage-limit", 409);
    return preview;
  }
  private monitorBinding(data: Data, record: ReviewRecord, endpoint: ReviewEndpoint) {
    return digest({
      recordId: record.id,
      recordedAccess: record.recordedAccess,
      endpoint,
      policy: data.register.linkPolicy,
    });
  }
  private takeMonitorLease(monitor: Monitoring) {
    const lease = monitor.lease,
      now = this.now();
    if (
      lease?.owner &&
      lease.owner !== this.workerId &&
      Date.parse(lease.expiresAt) > Date.parse(now)
    )
      return null;
    const fence =
      lease?.owner === this.workerId && Date.parse(lease.expiresAt) > Date.parse(now)
        ? lease.fence
        : (lease?.fence ?? 0) + 1;
    monitor.lease = {
      owner: this.workerId,
      fence,
      expiresAt: new Date(Date.parse(now) + 60000).toISOString(),
    };
    return fence;
  }
  private stopRun(
    run: ReviewMonitorRun,
    message: string,
    status: "interrupted" | "failed" = "interrupted",
  ) {
    run.status = status;
    run.finishedAt = this.now();
    run.message = message;
    for (const item of run.items)
      if (item.status === "pending" || item.status === "running") {
        item.status = item.status === "running" ? "interrupted" : "skipped";
        item.message = message;
        item.result = null;
      }
  }
  private finishRun(data: Data, run: ReviewMonitorRun) {
    if (
      run.status !== "running" ||
      run.items.some((item) => item.status === "pending" || item.status === "running")
    )
      return;
    const binding = this.monitorData(data).bindings.find((binding) => binding.runId === run.id);
    const checked = run.items.filter((item) => item.status === "completed").length;
    const issues =
      run.items.filter((item) => item.result && item.result.status !== "healthy").length +
      (binding?.missingUrls ?? 0);
    run.status =
      binding?.truncated ||
      (binding?.missingUrls ?? 0) > 0 ||
      run.items.some((item) => item.status !== "completed")
        ? "partial"
        : "completed";
    run.finishedAt = this.now();
    run.message = `${checked} endpoints checked; ${issues} need review. ${run.skippedRecords} records excluded by the configured accessibility filter.${binding?.missingUrls ? ` ${binding.missingUrls} eligible ${binding.missingUrls === 1 ? "record has" : "records have"} no configured URL.` : ""}${binding?.truncated ? " Endpoint limit reached; this report is partial." : ""}`;
    const monitor = this.monitorData(data);
    if (monitor.lease?.owner === this.workerId) {
      monitor.lease.owner = null;
      monitor.lease.expiresAt = this.now();
    }
  }
  private claimRun(
    data: Data,
    actor: string,
    trigger: ReviewMonitorRun["trigger"],
    occurrenceKey: string | null,
    scheduledFor: string | null,
  ) {
    const monitor = this.monitorData(data),
      schedule = monitor.schedule;
    if (!schedule) fail("schedule-required", 409);
    const items: ReviewMonitorRun["items"] = [],
      bindings: string[] = [];
    let eligibleRecords = 0,
      skippedRecords = 0,
      skippedEndpoints = 0,
      truncated = false,
      missingUrls = 0;
    for (const record of data.records) {
      if (!schedule.accessibleValues.includes(record.recordedAccess)) {
        skippedRecords++;
        skippedEndpoints += record.endpoints.length;
        continue;
      }
      eligibleRecords++;
      if (!record.endpoints.length) missingUrls++;
      for (const endpoint of record.endpoints) {
        if (items.length >= 1000) {
          skippedEndpoints++;
          truncated = true;
          continue;
        }
        items.push({
          recordId: record.id,
          recordTitle: record.title,
          endpointId: endpoint.id,
          endpointLabel: endpoint.label,
          url: endpoint.url,
          status: "pending",
          result: null,
          message: "Queued for checking.",
        });
        bindings.push(this.monitorBinding(data, record, endpoint));
      }
    }
    const run: ReviewMonitorRun = {
      id: id("rrun_"),
      trigger,
      occurrenceKey,
      scheduledFor,
      startedAt: this.now(),
      finishedAt: null,
      status: "running",
      requestedBy: UserIdSchema.parse(actor),
      scheduleRevision: monitor.scheduleRevision,
      eligibleRecords,
      skippedRecords,
      skippedEndpoints,
      message: "Queued for checking from this server; no earlier health is inferred.",
      items,
    };
    monitor.runs = [...monitor.runs, run].slice(-12);
    const retained = new Set(monitor.runs.map((run) => run.id));
    monitor.bindings = monitor.bindings.filter((binding) => retained.has(binding.runId));
    monitor.bindings.push({
      runId: run.id,
      policyHash: digest(data.register.linkPolicy),
      truncated,
      missingUrls,
      items: bindings,
    });
    if (occurrenceKey) monitor.lastOccurrenceKey = occurrenceKey;
    this.finishRun(data, run);
    return run;
  }
  private async refreshAlerts(data: Data, workspaceId: string) {
    const monitor = data.monitoring;
    if (!monitor) return;
    type Desired = Omit<ReviewMonitorAlert, "id" | "createdAt" | "resolvedAt" | "readAt">;
    const desired = new Map<string, Desired>(),
      now = this.now(),
      nowMs = Date.parse(now),
      schedule = monitor.schedule;
    const principal = monitor.configuredBy
      ? await this.member(workspaceId, monitor.configuredBy)
      : null;
    const authorized = principal?.active === true && principal.administrator === true;
    if (schedule && authorized)
      for (const record of data.records) {
        if (!schedule?.accessibleValues.includes(record.recordedAccess)) continue;
        type Site = {
          hostname: string;
          port: number;
          verification: "verified" | "failed";
          validTo: string | null;
          observedAt: string;
          endpointId: string;
          order: number;
        };
        const sites = new Map<string, Site>();
        const remember = (site: Site) => {
          site.hostname = site.hostname.toLowerCase().replace(/\.$/, "");
          if (Date.parse(site.observedAt) > nowMs + 300000) return;
          const key = `${site.hostname}:${site.port}`,
            previous = sites.get(key);
          if (
            !previous ||
            Date.parse(site.observedAt) > Date.parse(previous.observedAt) ||
            (site.observedAt === previous.observedAt && site.order >= previous.order)
          )
            sites.set(key, site);
        };
        for (const endpoint of record.endpoints) {
          for (const check of record.checks.filter(
            (check) => check.current && check.endpointId === endpoint.id,
          )) {
            const observations =
              check.tls?.filter(
                (tls) => tls.verification === "verified" || tls.verification === "failed",
              ) ?? [];
            for (const tls of observations)
              remember({
                hostname: tls.hostname,
                port: tls.port,
                verification: tls.verification as "verified" | "failed",
                validTo: tls.validTo,
                observedAt: tls.observedAt,
                endpointId: endpoint.id,
                order: record.checks.lastIndexOf(check),
              });
            if (
              check.status === "tls-error" &&
              !observations.some((tls) => tls.verification === "failed")
            ) {
              try {
                const url = new URL(check.finalUrl ?? endpoint.url);
                remember({
                  hostname: url.hostname,
                  port: Number(url.port || 443),
                  verification: "failed",
                  validTo: null,
                  observedAt: check.checkedAt,
                  endpointId: endpoint.id,
                  order: record.checks.lastIndexOf(check),
                });
              } catch {
                /* Legacy results without a valid destination cannot invent a TLS site. */
              }
            }
          }
        }
        for (const certificate of sites.values()) {
          if (certificate.verification === "failed") {
            const alert: Desired = {
              kind: "tls-error",
              recordId: record.id,
              endpointId: certificate.endpointId,
              title: `TLS verification failed · ${record.title}`.slice(0, 240),
              message: `${certificate.hostname}:${certificate.port}: the latest retained TLS observation could not be validated. Certificate expiry is unknown; no validation was bypassed.`,
              observedAt: certificate.observedAt,
              expiresAt: null,
              thresholdDays: null,
            };
            desired.set(
              digest({
                record: record.id,
                host: certificate.hostname,
                port: certificate.port,
                kind: alert.kind,
              }),
              alert,
            );
            continue;
          }
          if (!certificate?.validTo) continue;
          const remaining = (Date.parse(certificate.validTo) - nowMs) / 86400000;
          const threshold =
            remaining <= 0
              ? null
              : [...schedule.sslWarningDays]
                  .sort((a, b) => a - b)
                  .find((days) => remaining <= days);
          if (remaining > 0 && threshold === undefined) continue;
          const alert: Desired = {
            kind: remaining <= 0 ? "ssl-expired" : "ssl-expiring",
            recordId: record.id,
            endpointId: certificate.endpointId,
            title:
              `${remaining <= 0 ? "Recorded certificate expired" : "Certificate expiry approaching"} · ${record.title}`.slice(
                0,
                240,
              ),
            message:
              `${certificate.hostname}: certificate valid until ${certificate.validTo}. Last verified observation: ${certificate.observedAt}. This reminder uses retained evidence; a fresh check may observe a renewed certificate.`.slice(
                0,
                1000,
              ),
            observedAt: certificate.observedAt,
            expiresAt: certificate.validTo,
            thresholdDays: threshold ?? null,
          };
          desired.set(
            digest({
              record: record.id,
              kind: alert.kind,
              expiry: certificate.validTo,
              host: certificate.hostname,
              port: certificate.port,
              threshold: alert.thresholdDays,
            }),
            alert,
          );
        }
      }
    const latestRun = [...monitor.runs].reverse().find((run) => run.status !== "running");
    if (schedule && monitor.configuredBy && !authorized)
      desired.set(
        digest({
          principal: monitor.configuredBy,
          revision: monitor.scheduleRevision,
          kind: "authority-paused",
        }),
        {
          kind: "run-failed",
          recordId: null,
          endpointId: null,
          title: "Review monitoring paused",
          message:
            "The configured monitoring administrator is no longer authorized. Automatic requests and certificate reminders are paused. Restore that administrator's access or save the schedule under another administrator.",
          observedAt: now,
          expiresAt: null,
          thresholdDays: null,
        },
      );
    else if (latestRun && ["failed", "interrupted"].includes(latestRun.status))
      desired.set(digest({ run: latestRun.id }), {
        kind: "run-failed",
        recordId: null,
        endpointId: null,
        title: "Review monitoring needs attention",
        message: latestRun.message,
        observedAt: latestRun.finishedAt,
        expiresAt: null,
        thresholdDays: null,
      });
    const selected = new Map(
      [...desired]
        .sort(
          ([ak, a], [bk, b]) =>
            (a.expiresAt ?? "9999").localeCompare(b.expiresAt ?? "9999") || ak.localeCompare(bk),
        )
        .slice(0, 300),
    );
    for (const alert of monitor.alerts) {
      const key = monitor.alertKeys.find((entry) => entry.id === alert.id)?.key;
      if (!key || !selected.has(key)) alert.resolvedAt ??= now;
    }
    for (const [key, value] of selected) {
      const existingKey = monitor.alertKeys.find((entry) => entry.key === key),
        existing = existingKey
          ? monitor.alerts.find((alert) => alert.id === existingKey.id)
          : undefined;
      if (existing) {
        Object.assign(existing, value);
        existing.resolvedAt = null;
        continue;
      }
      const alert: ReviewMonitorAlert = {
        ...value,
        id: id("ral_"),
        createdAt: now,
        resolvedAt: null,
        readAt: null,
      };
      monitor.alerts.push(alert);
      monitor.alertKeys.push({ id: alert.id, key });
    }
    monitor.alerts = monitor.alerts
      .sort(
        (a, b) =>
          Number(a.resolvedAt !== null) - Number(b.resolvedAt !== null) ||
          b.createdAt.localeCompare(a.createdAt),
      )
      .slice(0, 300);
    const ids = new Set(monitor.alerts.map((alert) => alert.id));
    monitor.alertKeys = monitor.alertKeys.filter((key) => ids.has(key.id));
    monitor.reads = monitor.reads.filter((read) => ids.has(read.alertId));
  }
  tickMonitoring(): Promise<void> {
    if (this.monitoringClosing) return Promise.resolve();
    if (this.monitoringWork) return this.monitoringWork;
    const work = (async () => {
      do {
        this.monitoringWakeup = false;
        await this.runMonitoringTick();
      } while (this.monitoringWakeup && !this.monitoringClosing);
    })();
    this.monitoringWork = work;
    void work
      .finally(() => {
        if (this.monitoringWork === work) this.monitoringWork = null;
        if (this.monitoringWakeup && !this.monitoringClosing)
          queueMicrotask(() => void this.tickMonitoring().catch(() => undefined));
      })
      .catch(() => undefined);
    return work;
  }
  async closeMonitoring(): Promise<void> {
    this.monitoringClosing = true;
    await this.monitoringWork;
    for (const ws of await this.monitorWorkspaceIds())
      await this.serial(async () => {
        const store = await this.read(ws);
        let changed = false;
        for (const data of store.registers)
          if (data.monitoring?.lease?.owner === this.workerId) {
            data.monitoring.lease.owner = null;
            data.monitoring.lease.expiresAt = this.now();
            changed = true;
          }
        if (changed) await this.write(store);
      }, ws);
  }
  private async monitorWorkspaceIds() {
    if (typeof this.root !== "string") return this.root.workspaces();
    await assertPlainPath(this.root);
    let entries: string[];
    try {
      entries = await readdir(this.root);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const ids = entries
      .filter((name) => /^ws_[A-Za-z0-9_-]+\.json$/.test(name))
      .map((name) => name.slice(0, -5));
    if (ids.length > 1000) fail("monitor-workspace-limit", 503);
    return ids.filter((value) => WorkspaceIdSchema.safeParse(value).success).sort();
  }
  private async runMonitoringTick() {
    for (const ws of await this.monitorWorkspaceIds()) {
      if (this.monitoringClosing) break;
      const registerIds = await this.serial(async () => {
        const store = await this.read(ws),
          before = digest(store);
        for (const data of store.registers) {
          const monitor = data.monitoring;
          if (!monitor) continue;
          if (
            (monitor.schedule?.enabled || monitor.runs.some((run) => run.status === "running")) &&
            this.takeMonitorLease(monitor) === null
          ) {
            await this.refreshAlerts(data, ws);
            continue;
          }
          for (const run of monitor.runs)
            if (run.status === "running") {
              for (const item of run.items)
                if (item.status === "running" && !this.checking.has(ws + ":" + item.recordId)) {
                  item.status = "interrupted";
                  item.result = null;
                  item.message =
                    "The previous process ended during this attempt; it was not replayed.";
                }
              this.finishRun(data, run);
            }
          if (monitor.schedule?.enabled && monitor.configuredAt && monitor.configuredBy) {
            const occurrence = latestReviewOccurrence(
                monitor.schedule,
                this.now(),
                monitor.configuredAt,
              ),
              key = occurrence ? `${monitor.scheduleRevision}:${occurrence.key}` : null;
            if (
              occurrence &&
              key !== monitor.lastOccurrenceKey &&
              !monitor.runs.some((run) => run.status === "running")
            ) {
              const member = await this.member(ws, monitor.configuredBy);
              const run = this.claimRun(
                data,
                monitor.configuredBy,
                "scheduled",
                key,
                occurrence.at,
              );
              if (!member.active || !member.administrator)
                this.stopRun(
                  run,
                  "The saved monitoring administrator is no longer authorized; no requests were sent.",
                  "failed",
                );
            }
            monitor.nextRunAt = nextReviewOccurrence(monitor.schedule, this.now())?.at ?? null;
          }
          await this.refreshAlerts(data, ws);
        }
        if (digest(store) !== before) await this.write(store);
        return store.registers
          .filter(
            (data) =>
              data.monitoring?.lease?.owner === this.workerId &&
              data.monitoring.runs.some((run) => run.status === "running"),
          )
          .map((data) => data.register.id);
      }, ws);
      for (const registerId of registerIds) {
        while (!this.monitoringClosing) {
          const attempt = await this.serial(async () => {
            const store = await this.read(ws),
              data = store.registers.find((data) => data.register.id === registerId),
              monitor = data?.monitoring,
              run = monitor?.runs.find((run) => run.status === "running");
            if (!data || !monitor || !run) return null;
            const fence = this.takeMonitorLease(monitor);
            if (fence === null) return null;
            const member = await this.member(ws, run.requestedBy),
              binding = monitor.bindings.find((binding) => binding.runId === run.id);
            if (!member.active || !member.administrator) {
              this.stopRun(run, "The saved monitoring administrator is no longer authorized.");
              await this.write(store);
              return null;
            }
            if (
              !binding ||
              run.scheduleRevision !== monitor.scheduleRevision ||
              binding.policyHash !== digest(data.register.linkPolicy)
            ) {
              this.stopRun(
                run,
                "Monitoring configuration changed; remaining requests were cancelled.",
              );
              await this.write(store);
              return null;
            }
            const index = run.items.findIndex((item) => item.status === "pending");
            if (index < 0) {
              this.finishRun(data, run);
              await this.write(store);
              return null;
            }
            const item = run.items[index]!,
              record = data.records.find((record) => record.id === item.recordId),
              endpoint = record?.endpoints.find((endpoint) => endpoint.id === item.endpointId);
            if (
              !record ||
              !endpoint ||
              !monitor.schedule?.accessibleValues.includes(record.recordedAccess) ||
              binding.items[index] !== this.monitorBinding(data, record, endpoint)
            ) {
              item.status = "skipped";
              item.message = "The record, URL or accessibility changed before this request.";
              run.skippedEndpoints++;
              this.finishRun(data, run);
              await this.write(store);
              return { skipped: true as const };
            }
            if (!this.options.checkLink) {
              this.stopRun(run, "The configured link checker is unavailable.", "failed");
              await this.write(store);
              return null;
            }
            const checkKey = ws + ":" + record.id;
            if (this.checking.has(checkKey) || this.checking.size >= 5) return null;
            this.checking.add(checkKey);
            item.status = "running";
            item.message = "Check attempt recorded before the HTTP request.";
            try {
              await this.write(store);
            } catch (error) {
              this.checking.delete(checkKey);
              throw error;
            }
            return {
              skipped: false as const,
              runId: run.id,
              fence,
              index,
              checkKey,
              requestedBy: run.requestedBy,
              source: binding.items[index]!,
              policyHash: binding.policyHash,
              scheduleRevision: run.scheduleRevision,
              endpoint: structuredClone(endpoint),
              policy: structuredClone(data.register.linkPolicy),
            };
          }, ws);
          if (!attempt) break;
          if (attempt.skipped) continue;
          let result: ReviewCheckResult | null = null;
          try {
            result = ReviewCheckResultSchema.parse(
              await this.options.checkLink!(attempt.endpoint, attempt.policy),
            );
          } catch {
            /* A failed worker attempt is not a measured remote-app result. */
          }
          try {
            await this.serial(async () => {
              const store = await this.read(ws),
                data = store.registers.find((data) => data.register.id === registerId),
                monitor = data?.monitoring,
                run = monitor?.runs.find((run) => run.id === attempt.runId),
                item = run?.items[attempt.index];
              if (
                !data ||
                !monitor ||
                !run ||
                !item ||
                run.status !== "running" ||
                item.status !== "running"
              )
                return;
              if (
                monitor.lease?.owner !== this.workerId ||
                monitor.lease.fence !== attempt.fence ||
                Date.parse(monitor.lease.expiresAt) <= Date.parse(this.now())
              )
                return;
              const member = await this.member(ws, attempt.requestedBy);
              if (!member.active || !member.administrator) {
                this.stopRun(
                  run,
                  "The monitoring administrator lost access while checking; no response was published.",
                );
                await this.write(store);
                return;
              }
              const record = data.records.find((record) => record.id === item.recordId),
                endpoint = record?.endpoints.find((endpoint) => endpoint.id === item.endpointId);
              if (
                run.scheduleRevision !== monitor.scheduleRevision ||
                attempt.policyHash !== digest(data.register.linkPolicy)
              ) {
                this.stopRun(
                  run,
                  "Monitoring configuration changed while checking; no response was published.",
                );
                await this.write(store);
                return;
              }
              if (
                !record ||
                !endpoint ||
                !monitor.schedule?.accessibleValues.includes(record.recordedAccess) ||
                attempt.source !== this.monitorBinding(data, record, endpoint)
              ) {
                item.status = "skipped";
                item.message = "The record changed during the request; no response was published.";
                run.skippedEndpoints++;
              } else if (!result) {
                item.status = "interrupted";
                item.message = "The worker did not produce a valid measured result.";
              } else {
                item.status = "completed";
                item.result = result;
                item.message = result.message;
                record.checks = [
                  ...record.checks,
                  { ...result, endpointId: endpoint.id, by: attempt.requestedBy, current: true },
                ].slice(-100);
                record.revision++;
                record.updatedAt = this.now();
                record.updatedBy = attempt.requestedBy;
                this.bump(data);
                this.audit(store, attempt.requestedBy, "monitor-check", data, record.id);
              }
              this.finishRun(data, run);
              await this.write(store);
            }, ws);
          } finally {
            this.checking.delete(attempt.checkKey);
          }
        }
      }
    }
  }
  private async check(actor: string, ws: string, raw: unknown): Promise<ReviewState> {
    const input = ReviewCheckLinkSchema.parse(raw),
      member = await this.actor(actor, ws),
      store = await this.read(ws),
      data = this.data(store, input.registerId, actor, member, true),
      record = data.records.find((r) => r.id === input.recordId);
    if (!record) fail("record-not-found", 404);
    if (record.revision !== input.expectedRevision) fail("revision-conflict", 409);
    const endpoint = record.endpoints.find((e) => e.id === input.endpointId);
    if (!endpoint) fail("endpoint-not-found", 404);
    if (!this.options.checkLink) fail("link-checker-unavailable", 503);
    const checkKey = ws + ":" + record.id;
    if (this.checking.has(checkKey) || this.checking.size >= 5) fail("check-in-progress", 429);
    this.checking.add(checkKey);
    try {
      const binding = digest({ record, policy: data.register.linkPolicy });
      const result = ReviewCheckResultSchema.parse(
        await this.options.checkLink(endpoint, data.register.linkPolicy),
      );
      return await this.serial(async () => {
        const freshMember = await this.actor(actor, ws),
          fresh = await this.read(ws),
          freshData = this.data(fresh, input.registerId, actor, freshMember, true),
          freshRecord = freshData.records.find((r) => r.id === input.recordId);
        if (
          !freshRecord ||
          digest({ record: freshRecord, policy: freshData.register.linkPolicy }) !== binding
        )
          fail("check-source-changed", 409);
        freshRecord.checks = [
          ...freshRecord.checks,
          { ...result, endpointId: endpoint.id, by: UserIdSchema.parse(actor), current: true },
        ].slice(-100);
        freshRecord.revision++;
        freshRecord.updatedAt = this.now();
        freshRecord.updatedBy = UserIdSchema.parse(actor);
        this.bump(freshData);
        this.audit(fresh, actor, "check-link", freshData, freshRecord.id);
        await this.write(fresh);
        return this.view(freshData, actor, freshMember);
      }, ws);
    } finally {
      this.checking.delete(checkKey);
    }
  }
}
