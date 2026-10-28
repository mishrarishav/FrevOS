import { z } from "zod";
import { ConnectorProbeSchema } from "./deployment-settings.js";
import { ConnectorIdSchema } from "./developer-connectors.js";
import { ProjectIdSchema } from "./identifiers.js";

const text = (max: number) =>
  z
    .string()
    .max(max)
    .refine((v) =>
      [...v].every((c) => c.charCodeAt(0) >= 32 || [9, 10, 13].includes(c.charCodeAt(0))),
    );
export const DiscoveryRelativeFolderSchema = text(1024).refine(
  (v) =>
    !v.startsWith("/") &&
    !v.includes("\\") &&
    !v.includes(":") &&
    (!v || v.split("/").every((p) => p && p !== "." && p !== "..")),
);
const relativeFolder = text(180)
  .min(1)
  .refine(
    (v) =>
      v === "." ||
      (!v.startsWith("/") &&
        !v.includes("\\") &&
        !v.includes(":") &&
        v.split("/").every((p) => p && p !== "." && p !== ".." && !p.startsWith("."))),
  );
export const DiscoveryPolicySchema = z
  .object({
    version: z.literal(1),
    enabled: z.boolean(),
    allLocalDrives: z.boolean(),
    useExistingAudit: z.boolean(),
    contentFolders: z.array(relativeFolder).max(12),
    excludedFolders: z.array(relativeFolder).max(40),
    retentionDays: z.number().int().min(1).max(30),
    maxEvents: z.number().int().min(100).max(10000),
    maxDirectories: z.number().int().min(100).max(20000),
    priorityFolders: z
      .array(z.object({ root: text(240).min(1), path: DiscoveryRelativeFolderSchema }).strict())
      .max(12)
      .default([]),
  })
  .strict();
export type DiscoveryPolicy = z.infer<typeof DiscoveryPolicySchema>;
export const ActivitySettingsSchema = z
  .object({
    version: z.literal(1),
    noiseFolders: z.array(DiscoveryRelativeFolderSchema.refine((s) => !!s)).max(40),
    summarySeconds: z.number().int().min(5).max(300),
    noiseRetentionDays: z.number().int().min(1).max(30),
    noisePercent: z.number().int().min(5).max(50),
  })
  .strict();
export type ActivitySettings = z.infer<typeof ActivitySettingsSchema>;
export const defaultActivitySettings: ActivitySettings = {
  version: 1,
  noiseFolders: [
    "Temp",
    "tmp",
    "cache",
    "caches",
    ".codex/vendor_imports",
    ".codex/tmp",
    ".vscode/extensions",
  ],
  summarySeconds: 30,
  noiseRetentionDays: 2,
  noisePercent: 20,
};
export const ActivitySettingsInputSchema = z
  .object({
    version: z.literal(1),
    deviceId: ConnectorIdSchema,
    expectedRevision: z.number().int().nonnegative(),
    settings: ActivitySettingsSchema,
  })
  .strict();
export type ActivitySettingsInput = z.infer<typeof ActivitySettingsInputSchema>;
export const ActivitySettingsRecordSchema = ActivitySettingsInputSchema.omit({
  expectedRevision: true,
})
  .extend({
    revision: z.number().int().positive(),
    actor: text(128).min(1),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const CollectorMetricsSchema = z
  .object({
    version: z.literal(1),
    rss: z.number().int().nonnegative(),
    heapUsed: z.number().int().nonnegative(),
    pendingJobs: z.number().int().nonnegative().max(2000),
    maxPendingJobs: z.literal(1257),
  })
  .strict();
export const defaultDiscoveryPolicy: DiscoveryPolicy = {
  version: 1,
  enabled: false,
  allLocalDrives: true,
  useExistingAudit: true,
  contentFolders: [],
  excludedFolders: [],
  retentionDays: 7,
  maxEvents: 2000,
  maxDirectories: 10000,
  priorityFolders: [],
};
export const DiscoveryPolicyInputSchema = z
  .object({
    version: z.literal(1),
    deviceId: ConnectorIdSchema,
    expectedRevision: z.number().int().nonnegative(),
    policy: DiscoveryPolicySchema,
  })
  .strict();
export type DiscoveryPolicyInput = z.infer<typeof DiscoveryPolicyInputSchema>;
export const DiscoveryPolicyRecordSchema = DiscoveryPolicyInputSchema.omit({
  expectedRevision: true,
})
  .extend({
    revision: z.number().int().positive(),
    actor: text(128).min(1),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const DiscoveryEventSchema = z
  .object({
    sequence: z.number().int().positive(),
    at: z.iso.datetime(),
    root: text(240).min(1),
    path: text(512).min(1),
    kind: z.enum(["created", "modified", "deleted", "renamed-or-replaced", "gap"]),
    source: z.enum(["filesystem-notification", "collector", "os-audit"]),
    attribution: z.union([
      z.literal("unavailable"),
      z
        .object({
          kind: z.literal("os-audit"),
          user: text(160).min(1),
          pid: z.number().int().positive(),
          process: text(160),
          recordId: text(100).min(1),
          auditSource: z.enum(["windows-security-4663", "linux-audit"]),
        })
        .strict(),
    ]),
    content: z
      .object({
        before: text(8192),
        after: text(8192),
        status: z.enum(["redacted-text", "baseline-unavailable", "removed"]),
      })
      .strict()
      .optional(),
  })
  .strict();
export type DiscoveryEvent = z.infer<typeof DiscoveryEventSchema>;
export const SystemHealthPointSchema = z
  .object({
    at: z.iso.datetime(),
    cpuPercent: z.number().min(0).max(100).nullable(),
    memoryTotal: z.number().int().nonnegative(),
    memoryAvailable: z.number().int().nonnegative(),
  })
  .strict();
export type SystemHealthPoint = z.infer<typeof SystemHealthPointSchema>;
export const SystemSampleSchema = z
  .object({
    systemName: text(128).min(1),
    installationId: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable()
      .optional(),
    platform: z.enum(["win32", "linux"]),
    os: text(128).min(1),
    architecture: z.enum(["x64", "arm64"]),
    cpuPercent: z.number().min(0).max(100).nullable(),
    cpuCount: z.number().int().min(1).max(4096),
    memoryTotal: z.number().int().nonnegative(),
    memoryAvailable: z.number().int().nonnegative(),
    uptimeSeconds: z.number().nonnegative(),
    tools: z
      .array(
        z
          .object({
            id: z.enum(["git", "node", "npm", "pnpm", "dotnet", "python", "user-service"]),
            required: text(120),
            detected: text(120).nullable(),
            status: z.enum(["ready", "missing", "version-mismatch", "review-required"]),
          })
          .strict(),
      )
      .max(12)
      .default([]),
    disks: z
      .array(
        z
          .object({
            root: text(240).min(1),
            total: z.number().nonnegative(),
            available: z.number().nonnegative(),
          })
          .strict(),
      )
      .max(64),
  })
  .strict();
export const DiscoveryObservationSchema = z
  .object({
    version: z.literal(1),
    deviceId: ConnectorIdSchema,
    profileId: text(64).min(1).nullable(),
    bootId: z.uuid(),
    at: z.iso.datetime(),
    policyRevision: z.number().int().nonnegative(),
    system: SystemSampleSchema,
    coverage: z
      .object({
        status: z.enum(["disabled", "starting", "collecting", "partial"]),
        roots: z.array(text(240)).max(64),
        watchedDirectories: z.number().int().nonnegative(),
        gaps: z
          .array(
            z.enum([
              "restart-history-unavailable",
              "permission-denied",
              "watch-limit",
              "watch-failed",
              "buffer-overflow",
              "network-unavailable",
              "content-unavailable",
              "local-enrollment-required",
              "source-unverified",
              "audit-unavailable",
              "audit-gap",
            ]),
          )
          .max(12),
        attribution: z.enum(["unavailable", "os-audit"]),
        droppedEvents: z.number().int().nonnegative(),
      })
      .strict(),
    events: z.array(DiscoveryEventSchema).max(20),
    collector: CollectorMetricsSchema.optional(),
  })
  .strict();
export type DiscoveryObservation = z.infer<typeof DiscoveryObservationSchema>;
export const ContentPreviewInputSchema = z
  .object({
    version: z.literal(1),
    deviceId: ConnectorIdSchema,
    root: text(240).min(1),
    path: DiscoveryRelativeFolderSchema.refine((s) => !!s && s.length <= 512),
  })
  .strict();
export type ContentPreviewInput = z.infer<typeof ContentPreviewInputSchema>;
export const ContentPreviewJobSchema = z
  .object({
    version: z.literal(1),
    requestId: z.string().regex(/^cp_[a-f0-9]{32}$/),
    actor: text(128).min(1),
    workspaceId: z.literal("ws_server20"),
    request: ContentPreviewInputSchema,
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    status: z.enum(["queued", "working", "succeeded", "declined", "failed", "expired"]),
    result: z
      .object({
        approvedAt: z.iso.datetime(),
        observedAt: z.iso.datetime(),
        after: text(8192),
        before: text(8192).optional(),
        beforeAt: z.iso.datetime().optional(),
      })
      .strict()
      .optional(),
    errorCode: z
      .enum([
        "content-scope-denied",
        "content-request-expired",
        "content-unavailable",
        "content-approval-declined",
      ])
      .optional(),
  })
  .strict();
export type ContentPreviewJob = z.infer<typeof ContentPreviewJobSchema>;
export const ProjectFolderSearchInputSchema = z
  .object({ version: z.literal(1), projectId: ProjectIdSchema, deviceId: ConnectorIdSchema })
  .strict();
export const ProjectFolderSearchJobSchema = z
  .object({
    version: z.literal(1),
    id: z.string().regex(/^fd_[a-f0-9]{32}$/),
    actor: text(128).min(1),
    workspaceId: z.literal("ws_server20"),
    request: ProjectFolderSearchInputSchema,
    query: text(120).min(1),
    roots: z.array(text(240).min(1)).min(1).max(64),
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    status: z.enum(["queued", "working", "succeeded", "failed", "expired"]),
    completedAt: z.iso.datetime().optional(),
    result: z
      .object({
        matches: z
          .array(
            z
              .object({
                root: text(240).min(1),
                path: DiscoveryRelativeFolderSchema.refine((s) => !!s && s.length <= 512),
              })
              .strict(),
          )
          .max(40),
        scannedDirectories: z.number().int().nonnegative().max(1000),
        partial: z.boolean(),
        gaps: z
          .array(
            z.enum(["search-limit", "permission-denied", "path-unavailable", "query-unavailable"]),
          )
          .max(4),
      })
      .strict()
      .optional(),
  })
  .strict();
export type ProjectFolderSearchJob = z.infer<typeof ProjectFolderSearchJobSchema>;

export const FolderBrowseInputSchema = z
  .object({
    version: z.literal(1),
    deviceId: ConnectorIdSchema,
    root: text(240).min(1),
    path: DiscoveryRelativeFolderSchema,
    page: z.number().int().min(0).max(100).default(0),
    fingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();
export type FolderBrowseInput = z.infer<typeof FolderBrowseInputSchema>;
export const FolderBrowseJobSchema = z
  .object({
    version: z.literal(1),
    requestId: z.string().regex(/^fb_[a-f0-9]{32}$/),
    actor: text(128).min(1),
    workspaceId: z.literal("ws_server20"),
    request: FolderBrowseInputSchema,
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    status: z.enum(["queued", "working", "succeeded", "failed", "expired"]),
    result: z
      .object({
        root: text(240).min(1),
        path: DiscoveryRelativeFolderSchema,
        fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
        entries: z
          .array(
            z
              .object({
                name: text(255).min(1),
                path: DiscoveryRelativeFolderSchema,
                excluded: z.boolean(),
              })
              .strict(),
          )
          .max(100),
        nextPage: z.number().int().min(1).max(100).nullable(),
        truncated: z.boolean(),
        scannedEntries: z.number().int().nonnegative().max(10000),
      })
      .strict()
      .optional(),
    errorCode: z
      .enum([
        "folder-permission-denied",
        "folder-path-unavailable",
        "folder-scope-denied",
        "folder-changed",
        "folder-consent-required",
        "folder-request-expired",
        "folder-browser-unavailable",
      ])
      .optional(),
  })
  .strict();
export type FolderBrowseJob = z.infer<typeof FolderBrowseJobSchema>;

const DateSchema = z.iso.date();
const MilestoneSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
    title: text(160).min(1),
    weight: z.number().int().min(1).max(1000),
    dueDate: DateSchema,
    acceptance: z.enum(["pending", "accepted"]),
    evidence: text(500),
  })
  .strict()
  .refine(
    (v) => v.acceptance !== "accepted" || v.evidence.trim().length > 0,
    "Accepted deliverables require evidence",
  );
export const DeliveryPlanInputSchema = z
  .object({
    version: z.literal(1),
    projectId: ProjectIdSchema,
    expectedRevision: z.number().int().nonnegative(),
    poReference: text(120).min(1),
    poDate: DateSchema,
    timeZone: z
      .string()
      .max(64)
      .refine((v) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: v });
          return true;
        } catch {
          return false;
        }
      }),
    responsible: text(120).min(1),
    deviceIds: z.array(ConnectorIdSchema).max(12),
    milestones: z.array(MilestoneSchema).min(1).max(100),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      new Set(v.milestones.map((m) => m.id)).size !== v.milestones.length ||
      new Set(v.deviceIds).size !== v.deviceIds.length
    )
      ctx.addIssue({ code: "custom", message: "Duplicate milestone/device" });
    if (v.milestones.some((m) => m.dueDate < v.poDate))
      ctx.addIssue({ code: "custom", message: "Milestone cannot precede PO" });
  });
export type DeliveryPlanInput = z.infer<typeof DeliveryPlanInputSchema>;
export const DeliveryPlanSchema = DeliveryPlanInputSchema.safeExtend({
  bindings: z
    .array(
      z
        .object({
          deviceId: ConnectorIdSchema,
          userId: text(128),
          repositoryId: z.string().regex(/^gitrepo_[a-f0-9]{32}$/),
          profileId: text(64),
        })
        .strict(),
    )
    .max(12)
    .default([]),
  revision: z.number().int().positive(),
  actor: text(128).min(1),
  updatedAt: z.iso.datetime(),
  workspaceId: z.literal("ws_server20"),
});
export type DeliveryPlan = z.infer<typeof DeliveryPlanSchema>;
export const DeliveryReportSchema = z
  .object({
    projectId: ProjectIdSchema,
    projectName: text(120),
    clientName: text(120).nullable(),
    plan: DeliveryPlanSchema.nullable(),
    completedPercent: z.number().min(0).max(100).nullable(),
    plannedPercent: z.number().min(0).max(100).nullable(),
    status: z.enum(["plan-missing", "on-plan", "behind-plan", "ahead-of-plan", "complete"]),
    overdue: z.array(text(160)).max(100),
    asOf: z.iso.datetime(),
  })
  .strict();
export const DiscoveryStateSchema = z
  .object({
    access: z
      .object({
        actorId: text(128).min(1),
        role: z.enum(["user", "admin"]),
        canPair: z.boolean(),
        canManageOwnSystems: z.boolean(),
        canManagePlans: z.boolean(),
      })
      .strict()
      .optional(),
    systems: z
      .array(
        z
          .object({
            deviceId: ConnectorIdSchema,
            name: text(120),
            userId: text(128),
            profileId: text(64).nullable(),
            status: z.enum(["active", "revoked", "workspace-access-revoked"]),
            source: ConnectorProbeSchema.nullable(),
            sourceFresh: z.boolean(),
            online: z.boolean(),
            observedAt: z.iso.datetime().nullable(),
            lastSeenAt: z.iso.datetime().nullable().optional(),
            healthHistory: z.array(SystemHealthPointSchema).max(180).optional(),
            policy: DiscoveryPolicyRecordSchema.nullable(),
            observation: DiscoveryObservationSchema.nullable(),
            history: z.array(DiscoveryEventSchema.extend({ bootId: z.uuid() })).max(10000),
            historyCount: z.number().int().nonnegative().max(10000),
            contentRequests: z.array(ContentPreviewJobSchema).max(20).optional(),
            collector: CollectorMetricsSchema.nullable().optional(),
            activity: z
              .object({
                configuration: ActivitySettingsRecordSchema.nullable(),
                settings: ActivitySettingsSchema,
                workCount: z.number().int().nonnegative(),
                noiseCount: z.number().int().nonnegative(),
                rows: z
                  .array(
                    DiscoveryEventSchema.extend({
                      bootId: z.uuid(),
                      category: z.enum(["work", "noise"]),
                      count: z.number().int().positive(),
                      firstAt: z.iso.datetime(),
                    }),
                  )
                  .max(10000),
              })
              .strict()
              .optional(),
          })
          .strict(),
      )
      .max(100),
    reports: z.array(DeliveryReportSchema).max(1000),
  })
  .strict();
export type DiscoveryState = z.infer<typeof DiscoveryStateSchema>;
export type DeliveryReport = z.infer<typeof DeliveryReportSchema>;

// No file activity or machine presence enters this calculation.
export function deliveryReport(plan: DeliveryPlan | null, asOf: string) {
  if (!plan)
    return {
      completedPercent: null,
      plannedPercent: null,
      status: "plan-missing" as const,
      overdue: [],
    };
  const total = plan.milestones.reduce((n, m) => n + m.weight, 0);
  const accepted = plan.milestones
    .filter((m) => m.acceptance === "accepted")
    .reduce((n, m) => n + m.weight, 0);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: plan.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(asOf));
  const due = plan.milestones.filter((m) => m.dueDate < today);
  const planned = due.reduce((n, m) => n + m.weight, 0);
  const completedPercent = Math.round((10000 * accepted) / total) / 100;
  const plannedPercent = Math.round((10000 * planned) / total) / 100;
  const overdue = due.filter((m) => m.acceptance !== "accepted").map((m) => m.title);
  return {
    completedPercent,
    plannedPercent,
    overdue,
    status:
      accepted === total
        ? ("complete" as const)
        : overdue.length
          ? ("behind-plan" as const)
          : accepted > planned
            ? ("ahead-of-plan" as const)
            : ("on-plan" as const),
  };
}
