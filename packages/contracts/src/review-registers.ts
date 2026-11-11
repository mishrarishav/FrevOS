import { z } from "zod";
import { UserIdSchema, WorkspaceIdSchema } from "./identifiers.js";

const short = z.string().max(240);
const note = z.string().max(6000);
const revision = z.number().int().nonnegative();
export const ReviewCalendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  });
const fieldKey = z
  .string()
  .regex(/^[a-z][a-zA-Z0-9_]{0,39}$/)
  .refine((key) => !["constructor", "prototype", "__proto__"].includes(key));
export const ReviewRegisterIdSchema = z.string().regex(/^rr_[a-f0-9]{32}$/);
export const ReviewRecordIdSchema = z.string().regex(/^rec_[a-f0-9]{32}$/);
export const ReviewFieldSchema = z
  .object({
    key: fieldKey,
    label: z.string().trim().min(1).max(120),
    type: z.enum(["text", "multiline", "date", "select"]),
    options: z.array(short).max(100),
    required: z.boolean(),
  })
  .strict();
export const ReviewLinkPolicySchema = z
  .object({
    allowedOrigins: z.array(z.string().max(2048)).max(128),
    allowedPathPrefixes: z
      .array(
        z
          .string()
          .startsWith("/")
          .max(1024)
          .refine((path) => !/[?%#\\]|\.\./.test(path)),
      )
      .min(1)
      .max(32)
      .default(["/"]),
    allowPrivate: z.boolean(),
    allowSessionCookies: z.boolean().optional(),
    timeoutMs: z.number().int().min(1000).max(15000),
    maxBytes: z.number().int().min(1024).max(262144),
    maxRedirects: z.number().int().min(0).max(5),
  })
  .strict();
export const ReviewEndpointSchema = z
  .object({
    id: z.string().regex(/^ep_[a-f0-9]{32}$/),
    label: short,
    url: z.string().max(2048),
    expectedText: z.string().max(500),
    expectedStatuses: z.array(z.number().int().min(200).max(599)).min(1).max(20),
  })
  .strict();
export const ReviewTlsObservationSchema = z
  .object({
    url: z.string().max(2048),
    hostname: z.string().max(253),
    port: z.number().int().min(1).max(65535),
    verification: z.enum(["verified", "failed", "unavailable"]),
    validFrom: z.iso.datetime().nullable(),
    validTo: z.iso.datetime().nullable(),
    subject: z.string().max(500).nullable(),
    issuer: z.string().max(500).nullable(),
    fingerprint256: z.string().max(200).nullable(),
    errorCode: z.string().max(240).nullable(),
    observedAt: z.iso.datetime(),
  })
  .strict();
export const ReviewCheckResultSchema = z
  .object({
    status: z.enum([
      "healthy",
      "http-error",
      "soft-404",
      "wrong-page",
      "auth-required",
      "redirect",
      "unreachable",
      "tls-error",
      "blocked",
      "unknown",
    ]),
    httpStatus: z.number().int().min(100).max(599).nullable(),
    finalUrl: z.string().max(2048).nullable(),
    message: z.string().max(1000),
    title: z.string().max(300).nullable(),
    elapsedMs: z.number().int().nonnegative(),
    checkedAt: z.iso.datetime(),
    tls: z.array(ReviewTlsObservationSchema).max(6).optional(),
  })
  .strict();
export const ReviewScheduleConfigSchema = z
  .object({
    enabled: z.boolean(),
    weekdays: z.array(z.number().int().min(1).max(7)).max(7),
    time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    timeZone: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: value }).format(0);
          return true;
        } catch {
          return false;
        }
      }, "Use a supported IANA time zone"),
    accessibleValues: z.array(z.string().trim().min(1).max(240)).max(50),
    sslWarningDays: z.array(z.number().int().min(1).max(365)).min(1).max(10),
  })
  .strict()
  .refine((value) => new Set(value.weekdays).size === value.weekdays.length, "Duplicate weekdays")
  .refine(
    (value) => new Set(value.accessibleValues).size === value.accessibleValues.length,
    "Duplicate accessibility values",
  )
  .refine(
    (value) => new Set(value.sslWarningDays).size === value.sslWarningDays.length,
    "Duplicate SSL thresholds",
  )
  .refine(
    (value) => !value.enabled || (value.weekdays.length > 0 && value.accessibleValues.length > 0),
    "Enabled schedules require days and accessible values",
  );
export const ReviewMonitorItemSchema = z
  .object({
    recordId: ReviewRecordIdSchema,
    recordTitle: short,
    endpointId: z.string().max(60),
    endpointLabel: short,
    url: z.string().max(2048),
    status: z.enum(["pending", "running", "completed", "skipped", "interrupted"]),
    result: ReviewCheckResultSchema.nullable(),
    message: z.string().max(1000),
  })
  .strict();
export const ReviewMonitorRunSchema = z
  .object({
    id: z.string().regex(/^rrun_[a-f0-9]{32}$/),
    trigger: z.enum(["scheduled", "manual"]),
    occurrenceKey: z.string().max(300).nullable(),
    scheduledFor: z.iso.datetime().nullable(),
    startedAt: z.iso.datetime(),
    finishedAt: z.iso.datetime().nullable(),
    status: z.enum(["running", "completed", "partial", "interrupted", "failed"]),
    requestedBy: UserIdSchema,
    scheduleRevision: revision,
    eligibleRecords: z.number().int().nonnegative(),
    skippedRecords: z.number().int().nonnegative(),
    skippedEndpoints: z.number().int().nonnegative(),
    message: z.string().max(1000),
    items: z.array(ReviewMonitorItemSchema).max(1000),
    summary: z
      .object({
        endpoints: z.number().int().nonnegative(),
        completed: z.number().int().nonnegative(),
        issues: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
  })
  .strict();
export const ReviewMonitorAlertSchema = z
  .object({
    id: z.string().regex(/^ral_[a-f0-9]{32}$/),
    kind: z.enum(["ssl-expiring", "ssl-expired", "tls-error", "run-failed"]),
    recordId: ReviewRecordIdSchema.nullable(),
    endpointId: z.string().max(60).nullable(),
    title: short,
    message: z.string().max(1000),
    createdAt: z.iso.datetime(),
    observedAt: z.iso.datetime().nullable(),
    expiresAt: z.iso.datetime().nullable(),
    thresholdDays: z.number().int().nonnegative().nullable(),
    resolvedAt: z.iso.datetime().nullable(),
    readAt: z.iso.datetime().nullable(),
  })
  .strict();
export const ReviewMonitoringStateSchema = z
  .object({
    schedule: ReviewScheduleConfigSchema.nullable(),
    scheduleRevision: revision,
    configuredBy: UserIdSchema.nullable(),
    configuredAt: z.iso.datetime().nullable(),
    nextRunAt: z.iso.datetime().nullable(),
    runs: z.array(ReviewMonitorRunSchema).max(12),
    alerts: z.array(ReviewMonitorAlertSchema).max(300),
  })
  .strict();
export const ReviewMonitoringSummarySchema = z
  .object({
    workspaceId: WorkspaceIdSchema,
    registers: z
      .array(
        z
          .object({
            registerId: ReviewRegisterIdSchema,
            registerName: short,
            monitoring: ReviewMonitoringStateSchema,
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
export const ReviewRecordInputSchema = z
  .object({
    title: z.string().trim().min(1).max(240),
    description: note,
    department: short,
    management: short,
    businessOwner: short,
    spoc: short,
    technicalAssignee: short,
    lifecycle: short,
    requirement: short,
    recordedAccess: short,
    fields: z.record(fieldKey, note),
    endpoints: z.array(ReviewEndpointSchema).max(20),
  })
  .strict();
export const ReviewProvenanceSchema = z
  .object({
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    fileName: short,
    sheet: short,
    row: z.number().int().positive(),
    cells: z.record(fieldKey, z.string().max(20)),
    importedAt: z.iso.datetime(),
    importedBy: UserIdSchema,
  })
  .strict();
export const ReviewRecordSchema = ReviewRecordInputSchema.extend({
  id: ReviewRecordIdSchema,
  revision,
  updatedAt: z.iso.datetime(),
  updatedBy: UserIdSchema,
  provenance: z.array(ReviewProvenanceSchema).max(20),
  assignmentHistory: z
    .array(
      z
        .object({
          businessOwner: short,
          spoc: short,
          technicalAssignee: short,
          at: z.iso.datetime(),
          by: UserIdSchema,
        })
        .strict(),
    )
    .max(100),
  reviews: z
    .array(
      z
        .object({
          id: z.string().max(60),
          decision: short,
          note,
          nextAction: note,
          dueDate: z.string().max(10),
          at: z.iso.datetime(),
          by: UserIdSchema,
        })
        .strict(),
    )
    .max(100),
  checks: z
    .array(
      ReviewCheckResultSchema.extend({
        endpointId: z.string().max(60),
        by: UserIdSchema,
        current: z.boolean().default(true),
      }),
    )
    .max(100),
}).strict();
export const ReviewGrantSchema = z
  .object({ userId: UserIdSchema, role: z.enum(["viewer", "reviewer"]) })
  .strict();
export const ReviewRegisterConfigSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().max(2000),
    fields: z.array(ReviewFieldSchema).max(40),
    managementOptions: z.array(z.string().min(1).max(120)).min(1).max(50),
    lifecycleOptions: z.array(z.string().min(1).max(120)).min(1).max(50),
    requirementOptions: z.array(z.string().min(1).max(120)).min(1).max(50),
    decisionOptions: z.array(z.string().min(1).max(120)).min(1).max(50),
    linkPolicy: ReviewLinkPolicySchema,
  })
  .strict();
export const ReviewRegisterSchema = ReviewRegisterConfigSchema.extend({
  id: ReviewRegisterIdSchema,
  revision,
  workspaceId: WorkspaceIdSchema,
  grants: z.array(ReviewGrantSchema).max(1000),
  createdAt: z.iso.datetime(),
  createdBy: UserIdSchema,
}).strict();
export const ReviewCatalogSchema = z
  .object({
    workspaceId: WorkspaceIdSchema,
    administrator: z.boolean(),
    registers: z
      .array(
        z
          .object({
            id: ReviewRegisterIdSchema,
            name: short,
            description: z.string().max(2000),
            revision,
            role: z.enum(["administrator", "reviewer", "viewer"]),
            recordCount: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(100),
    users: z.array(z.object({ userId: UserIdSchema, name: short }).strict()).max(1000),
  })
  .strict();
export const ReviewStateSchema = z
  .object({
    register: ReviewRegisterSchema,
    role: z.enum(["administrator", "reviewer", "viewer"]),
    records: z.array(ReviewRecordSchema).max(2000),
    monitoring: ReviewMonitoringStateSchema.optional(),
  })
  .strict();
export const ReviewWorkbookSchema = z
  .object({
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    fileName: short,
    sheets: z
      .array(
        z
          .object({
            name: short,
            hidden: z.boolean(),
            maxRow: z.number().int().nonnegative(),
            maxColumn: z.number().int().nonnegative(),
            hiddenRows: z.array(z.number().int()),
            hiddenColumns: z.array(z.string()),
            rows: z
              .array(
                z
                  .object({
                    row: z.number().int().positive(),
                    cells: z
                      .array(
                        z
                          .object({
                            column: z.string().max(4),
                            address: z.string().max(20),
                            text: note,
                            hyperlink: z.string().max(2048).optional(),
                            formula: z.boolean().optional(),
                          })
                          .strict(),
                      )
                      .max(80),
                  })
                  .strict(),
              )
              .max(2001),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();
const ImportRow = z
  .object({
    row: z.number().int().positive(),
    record: ReviewRecordInputSchema,
    candidateRecordId: ReviewRecordIdSchema.nullable(),
    defaultAction: z.enum(["create", "skip", "conflict"]),
    issues: z.array(z.string().max(1000)).max(20),
  })
  .strict();
export const ReviewImportPreviewSchema = z
  .object({
    id: z.string().regex(/^rip_[a-f0-9]{32}$/),
    registerId: ReviewRegisterIdSchema,
    revision,
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    fileName: short,
    sheet: short,
    expiresAt: z.iso.datetime(),
    rows: z.array(ImportRow).max(2000),
  })
  .strict();
export const ReviewSaveRegisterSchema = z
  .object({
    version: z.literal(1),
    id: ReviewRegisterIdSchema.optional(),
    expectedRevision: revision,
    config: ReviewRegisterConfigSchema,
  })
  .strict();
export const ReviewSaveRecordSchema = z
  .object({
    version: z.literal(1),
    registerId: ReviewRegisterIdSchema,
    id: ReviewRecordIdSchema.optional(),
    expectedRevision: revision,
    record: ReviewRecordInputSchema,
  })
  .strict();
export const ReviewDeleteRecordSchema = z
  .object({
    version: z.literal(1),
    registerId: ReviewRegisterIdSchema,
    recordId: ReviewRecordIdSchema,
    expectedRevision: revision,
  })
  .strict();
export const ReviewGrantInputSchema = z
  .object({
    version: z.literal(1),
    registerId: ReviewRegisterIdSchema,
    expectedRevision: revision,
    userId: UserIdSchema,
    role: z.enum(["viewer", "reviewer"]).nullable(),
  })
  .strict();
export const ReviewWorkbookInputSchema = z
  .object({
    version: z.literal(1),
    registerId: ReviewRegisterIdSchema,
    fileName: short,
    contentBase64: z.string().min(1).max(5600000),
  })
  .strict();
export const ReviewPreviewImportSchema = ReviewWorkbookInputSchema.extend({
  expectedRevision: revision,
  sheet: short,
  headerRow: z.number().int().positive().max(100),
  mapping: z.record(z.string().max(40), z.string().regex(/^[A-Z]{1,3}$/)),
  valueMappings: z
    .record(z.string().max(40), z.record(z.string().max(6000), z.string().max(6000)))
    .optional(),
  defaultScheme: z.enum(["https", "http"]),
}).strict();
export const ReviewCommitImportSchema = z
  .object({
    version: z.literal(1),
    registerId: ReviewRegisterIdSchema,
    previewId: z.string().regex(/^rip_[a-f0-9]{32}$/),
    expectedRevision: revision,
    resolutions: z
      .array(
        z
          .object({
            row: z.number().int().positive(),
            action: z.enum(["create", "skip", "update"]),
          })
          .strict(),
      )
      .max(2000),
  })
  .strict();
export const ReviewCheckLinkSchema = z
  .object({
    version: z.literal(1),
    registerId: ReviewRegisterIdSchema,
    recordId: ReviewRecordIdSchema,
    endpointId: z.string().max(60),
    expectedRevision: revision,
  })
  .strict();
export const ReviewAddReviewSchema = z
  .object({
    version: z.literal(1),
    registerId: ReviewRegisterIdSchema,
    recordId: ReviewRecordIdSchema,
    expectedRevision: revision,
    decision: short,
    note,
    nextAction: note,
    dueDate: z.union([z.literal(""), ReviewCalendarDateSchema]),
  })
  .strict();
export const ReviewSaveScheduleSchema = z
  .object({
    version: z.literal(1),
    registerId: ReviewRegisterIdSchema,
    expectedRevision: revision,
    schedule: ReviewScheduleConfigSchema,
  })
  .strict();
export const ReviewRunMonitorSchema = z
  .object({
    version: z.literal(1),
    registerId: ReviewRegisterIdSchema,
    expectedRevision: revision,
  })
  .strict();
export const ReviewReadMonitorAlertSchema = z
  .object({
    version: z.literal(1),
    registerId: ReviewRegisterIdSchema,
    alertId: z.string().regex(/^ral_[a-f0-9]{32}$/),
  })
  .strict();
export type ReviewRegister = z.infer<typeof ReviewRegisterSchema>;
export type ReviewRegisterConfig = z.infer<typeof ReviewRegisterConfigSchema>;
export type ReviewRecord = z.infer<typeof ReviewRecordSchema>;
export type ReviewRecordInput = z.infer<typeof ReviewRecordInputSchema>;
export type ReviewCatalog = z.infer<typeof ReviewCatalogSchema>;
export type ReviewState = z.infer<typeof ReviewStateSchema>;
export type ReviewWorkbook = z.infer<typeof ReviewWorkbookSchema>;
export type ReviewImportPreview = z.infer<typeof ReviewImportPreviewSchema>;
export type ReviewEndpoint = z.infer<typeof ReviewEndpointSchema>;
export type ReviewLinkPolicy = z.infer<typeof ReviewLinkPolicySchema>;
export type ReviewCheckResult = z.infer<typeof ReviewCheckResultSchema>;
export type ReviewSaveRegister = z.infer<typeof ReviewSaveRegisterSchema>;
export type ReviewSaveRecord = z.infer<typeof ReviewSaveRecordSchema>;
export type ReviewGrantInput = z.infer<typeof ReviewGrantInputSchema>;
export type ReviewWorkbookInput = z.infer<typeof ReviewWorkbookInputSchema>;
export type ReviewPreviewImport = z.infer<typeof ReviewPreviewImportSchema>;
export type ReviewCommitImport = z.infer<typeof ReviewCommitImportSchema>;
export type ReviewCheckLink = z.infer<typeof ReviewCheckLinkSchema>;
export type ReviewAddReview = z.infer<typeof ReviewAddReviewSchema>;
export type ReviewTlsObservation = z.infer<typeof ReviewTlsObservationSchema>;
export type ReviewScheduleConfig = z.infer<typeof ReviewScheduleConfigSchema>;
export type ReviewMonitorItem = z.infer<typeof ReviewMonitorItemSchema>;
export type ReviewMonitorRun = z.infer<typeof ReviewMonitorRunSchema>;
export type ReviewMonitorAlert = z.infer<typeof ReviewMonitorAlertSchema>;
export type ReviewMonitoringState = z.infer<typeof ReviewMonitoringStateSchema>;
export type ReviewMonitoringSummary = z.infer<typeof ReviewMonitoringSummarySchema>;
export type ReviewSaveSchedule = z.infer<typeof ReviewSaveScheduleSchema>;
export type ReviewRunMonitor = z.infer<typeof ReviewRunMonitorSchema>;
export type ReviewReadMonitorAlert = z.infer<typeof ReviewReadMonitorAlertSchema>;
