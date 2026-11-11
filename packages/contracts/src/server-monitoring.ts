import { z } from "zod";
import { UserIdSchema, WorkspaceIdSchema } from "./identifiers.js";
import { ReviewRecordIdSchema, ReviewRegisterIdSchema } from "./review-registers.js";

export function privateServerAddress(value: string): boolean {
  if (!/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(value)) return false;
  const [a, b = -1] = value.split(".").map(Number);
  return (
    value.split(".").every((part) => Number(part) <= 255) &&
    (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168))
  );
}
export const ServerMonitorAddressSchema = z
  .string()
  .refine(privateServerAddress, "A literal private IPv4 server address is required");
export const ServerMonitorTargetIdSchema = z.string().regex(/^srv_[a-f0-9]{32}$/);
export const ServerMonitorRequestIdSchema = z.string().regex(/^smr_[a-f0-9]{32}$/);
export const ServerMonitorTransportSchema = z.enum(["winrm-http", "winrm-https", "local"]);
export const ServerMonitorAccessStatusSchema = z.enum([
  "unverified",
  "connected",
  "auth-failed",
  "access-denied",
  "unreachable",
  "winrm-unavailable",
  "unsupported",
  "error",
]);
const bytes = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const percent = z.number().min(0).max(100);
const label = z
  .string()
  .trim()
  .min(1)
  .max(240)
  .refine((value) =>
    [...value].every((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    }),
  );
export const ServerMonitorCredentialProfileSchema = z.string().regex(/^[a-z][a-z0-9_-]{2,79}$/);
export const ServerMonitorPointSchema = z
  .object({
    at: z.iso.datetime(),
    cpuPercent: percent.nullable(),
    memoryUsedBytes: bytes,
    memoryTotalBytes: bytes.positive(),
  })
  .strict()
  .refine((value) => value.memoryUsedBytes <= value.memoryTotalBytes);
export const ServerMonitorSnapshotSchema = z
  .object({
    observedAt: z.iso.datetime(),
    computerName: label,
    osName: label,
    uptimeSeconds: z.number().nonnegative().max(Number.MAX_SAFE_INTEGER),
    logicalProcessors: z.number().int().min(1).max(4096),
    cpuPercent: percent.nullable(),
    memoryTotalBytes: bytes.positive(),
    memoryAvailableBytes: bytes,
    disks: z
      .array(
        z
          .object({ name: label, totalBytes: bytes, freeBytes: bytes })
          .strict()
          .refine((value) => value.freeBytes <= value.totalBytes),
      )
      .max(64),
    network: z
      .object({
        receivedBytesPerSecond: z.number().nonnegative().nullable(),
        sentBytesPerSecond: z.number().nonnegative().nullable(),
      })
      .strict(),
    processes: z
      .array(
        z
          .object({
            pid: z.number().int().nonnegative(),
            name: label,
            cpuPercent: percent.nullable(),
            workingSetBytes: bytes,
          })
          .strict(),
      )
      .max(100),
    services: z
      .array(
        z
          .object({
            name: label,
            displayName: label,
            state: label,
            startMode: label,
            pid: z.number().int().nonnegative().nullable(),
          })
          .strict(),
      )
      .max(1000),
  })
  .strict()
  .refine((value) => value.memoryAvailableBytes <= value.memoryTotalBytes);
export const ServerMonitorPolicySchema = z
  .object({
    enabled: z.boolean().default(false),
    intervalSeconds: z.number().int().min(10).max(3600).default(30),
    cpuWarningPercent: percent.min(1).default(90),
    memoryWarningPercent: percent.min(1).default(90),
    consecutiveSamples: z.number().int().min(1).max(60).default(3),
    staleAfterSeconds: z.number().int().min(20).max(86400).default(90),
    retentionHours: z.number().int().min(1).max(720).default(168),
    maxPointsPerTarget: z.number().int().min(30).max(1440).default(1440),
  })
  .strict()
  .refine(
    (value) => value.staleAfterSeconds >= value.intervalSeconds * 2,
    "Stale interval must cover two sampling intervals",
  );
export const ServerMonitorSourceRefSchema = z
  .object({ registerId: ReviewRegisterIdSchema, recordId: ReviewRecordIdSchema, title: label })
  .strict();
export const ServerMonitorAccessSchema = z
  .object({
    status: ServerMonitorAccessStatusSchema,
    checkedAt: z.iso.datetime().nullable(),
    computerName: label.nullable(),
    message: z.string().max(300),
  })
  .strict();
export const ServerMonitorAlertSchema = z
  .object({
    id: z.string().regex(/^sma_[a-f0-9]{32}$/),
    targetId: ServerMonitorTargetIdSchema,
    kind: z.enum(["cpu", "memory", "connection"]),
    severity: z.enum(["warning", "critical"]),
    openedAt: z.iso.datetime(),
    resolvedAt: z.iso.datetime().nullable(),
    message: z.string().max(400),
    acknowledged: z.boolean(),
  })
  .strict();
export const ServerMonitorTargetViewSchema = z
  .object({
    id: ServerMonitorTargetIdSchema,
    name: label,
    address: ServerMonitorAddressSchema,
    port: z.number().int().min(1).max(65535),
    transport: ServerMonitorTransportSchema,
    enabled: z.boolean(),
    revision: z.number().int().nonnegative(),
    credentialProfile: ServerMonitorCredentialProfileSchema.optional(),
    grants: z.array(UserIdSchema).max(1000).optional(),
    sourceRefs: z.array(ServerMonitorSourceRefSchema).max(200),
    access: ServerMonitorAccessSchema,
    latest: ServerMonitorSnapshotSchema.nullable(),
    history: z.array(ServerMonitorPointSchema).max(1440),
    alerts: z.array(ServerMonitorAlertSchema).max(100),
    polling: z.boolean(),
    lastAttemptAt: z.iso.datetime().nullable(),
    lastError: z.string().max(300).nullable(),
  })
  .strict();
export const ServerMonitorCatalogSchema = z
  .object({
    workspaceId: WorkspaceIdSchema,
    administrator: z.boolean(),
    revision: z.number().int().nonnegative(),
    policy: ServerMonitorPolicySchema,
    targets: z.array(ServerMonitorTargetViewSchema).max(100),
    observedAt: z.iso.datetime(),
  })
  .strict();
export const ServerMonitorSaveTargetSchema = z
  .object({
    id: ServerMonitorTargetIdSchema.optional(),
    expectedRevision: z.number().int().nonnegative().nullable(),
    name: label,
    address: ServerMonitorAddressSchema,
    port: z.number().int().min(1).max(65535),
    transport: ServerMonitorTransportSchema,
    enabled: z.boolean(),
    credentialProfile: ServerMonitorCredentialProfileSchema,
    grants: z
      .array(UserIdSchema)
      .max(1000)
      .refine((values) => new Set(values).size === values.length),
  })
  .strict();
export const ServerMonitorImportSchema = z
  .object({
    registerId: ReviewRegisterIdSchema,
    managementValues: z.array(label).min(1).max(30),
    hostingField: z
      .string()
      .regex(/^[a-z][a-zA-Z0-9_]{0,39}$/)
      .refine((value) => !["constructor", "prototype", "__proto__"].includes(value)),
    credentialProfile: ServerMonitorCredentialProfileSchema,
    transport: z.enum(["winrm-http", "winrm-https"]),
    port: z.number().int().min(1).max(65535),
    enabled: z.boolean(),
  })
  .strict();
export const ServerMonitorSavePolicySchema = z
  .object({ expectedRevision: z.number().int().nonnegative(), policy: ServerMonitorPolicySchema })
  .strict();
export const ServerMonitorRefreshSchema = z
  .object({ targetId: ServerMonitorTargetIdSchema.optional() })
  .strict();
export const ServerMonitorAcknowledgeSchema = z
  .object({ alertId: z.string().regex(/^sma_[a-f0-9]{32}$/) })
  .strict();
export const ServerMonitorImportResultSchema = z
  .object({
    catalog: ServerMonitorCatalogSchema,
    added: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
    excluded: z
      .array(
        z
          .object({
            recordId: ReviewRecordIdSchema,
            reason: z.enum([
              "management-not-selected",
              "placeholder",
              "missing-address",
              "invalid-address",
            ]),
          })
          .strict(),
      )
      .max(2000),
  })
  .strict();
export type ServerMonitorPolicy = z.infer<typeof ServerMonitorPolicySchema>;
export type ServerMonitorSnapshot = z.infer<typeof ServerMonitorSnapshotSchema>;
export type ServerMonitorPoint = z.infer<typeof ServerMonitorPointSchema>;
export type ServerMonitorSourceRef = z.infer<typeof ServerMonitorSourceRefSchema>;
export type ServerMonitorTargetView = z.infer<typeof ServerMonitorTargetViewSchema>;
export type ServerMonitorCatalog = z.infer<typeof ServerMonitorCatalogSchema>;
export type ServerMonitorSaveTarget = z.infer<typeof ServerMonitorSaveTargetSchema>;
export type ServerMonitorImport = z.infer<typeof ServerMonitorImportSchema>;
export type ServerMonitorSavePolicy = z.infer<typeof ServerMonitorSavePolicySchema>;
export type ServerMonitorImportResult = z.infer<typeof ServerMonitorImportResultSchema>;
export type ServerMonitorAccess = z.infer<typeof ServerMonitorAccessSchema>;
export type ServerMonitorAlert = z.infer<typeof ServerMonitorAlertSchema>;
