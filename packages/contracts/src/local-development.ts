import { z } from "zod";
import { DeploymentProfileIdSchema, PreservedPathSchema } from "./deployment-settings.js";
import { ConnectorIdSchema } from "./developer-connectors.js";

const Id = DeploymentProfileIdSchema;
const Digest = z.string().regex(/^[a-f0-9]{64}$/);
const EnvReference = z.string().regex(/^\.env(?:\.[a-zA-Z0-9_-]+)?$/);
export const LocalEnvKeySchema = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,127}$/);
export const LocalEnvChangeSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("set"),
      key: LocalEnvKeySchema,
      value: z
        .string()
        .max(8192)
        .refine((v) => !/[\0\r\n]/.test(v)),
    })
    .strict(),
  z.object({ operation: z.literal("delete"), key: LocalEnvKeySchema }).strict(),
]);
export const LocalEnvChangesSchema = z
  .array(LocalEnvChangeSchema)
  .min(1)
  .max(512)
  .refine((rows) => new Set(rows.map((r) => r.key)).size === rows.length);
// Only these ordinary, syntax-constrained values may leave the source computer.
export function localEnvVisibleValue(key: string, value: string): boolean {
  if (["DB_HOST", "PGHOST", "HOST"].includes(key))
    return /^[A-Za-z0-9_.:\[\]-]{1,253}$/.test(value);
  if (["DB_NAME", "PGDATABASE"].includes(key)) return /^[A-Za-z0-9_.-]{1,128}$/.test(value);
  if (["PORT", "DB_PORT", "PGPORT"].includes(key))
    return /^\d{1,5}$/.test(value) && Number(value) > 0 && Number(value) < 65536;
  if (key === "NODE_ENV") return ["development", "production", "test"].includes(value);
  return (
    /^(?:MAIL_ENABLED|ENABLE_EMAIL_LISTENER|LOCAL_MAIL_DISABLED|LOCAL_OUTGOING_MAIL_DISABLED|LOCAL_MAIL_LISTENER_DISABLED|AUTO_CLOSE_RESOLVED_ENABLED|AUTO_RESOLVE_PENDING_USER_ENABLED)$/.test(
      key,
    ) && /^(?:true|false|0|1)$/.test(value)
  );
}
export const LocalEnvDocumentSchema = z
  .object({
    serviceId: Id,
    reference: EnvReference,
    revision: Digest,
    rows: z
      .array(
        z.discriminatedUnion("masked", [
          z.object({ key: LocalEnvKeySchema, masked: z.literal(true) }).strict(),
          z
            .object({
              key: LocalEnvKeySchema,
              masked: z.literal(false),
              value: z.string().max(253),
            })
            .strict()
            .refine((r) => localEnvVisibleValue(r.key, r.value)),
        ]),
      )
      .max(512)
      .refine((rows) => new Set(rows.map((r) => r.key)).size === rows.length),
  })
  .strict();
export const LocalEnvEditorSchema = z.object({ keyId: Digest, publicKey: Digest }).strict();
export const LocalEnvSealedSchema = z
  .object({
    keyId: Digest,
    publicKey: Digest,
    iv: z.string().regex(/^[a-f0-9]{24}$/),
    ciphertext: z
      .string()
      .min(34)
      .max(131104)
      .regex(/^(?:[a-f0-9]{2})+$/),
  })
  .strict();
// Stable authenticated context, shared by the browser and execution boundary.
export function localEnvContext(
  request: {
    requestId: string;
    deviceId: string;
    profileId: string;
    expectedRevision: number;
    fingerprint: string;
    serviceId: string;
    reference: string;
    documentRevision: string;
  },
  keyId: string,
): string {
  return JSON.stringify([
    "local-environment-v1",
    "ws_server20",
    request.requestId,
    request.deviceId,
    request.profileId,
    request.expectedRevision,
    request.fingerprint,
    request.serviceId,
    request.reference,
    request.documentRevision,
    keyId,
  ]);
}
export const LocalDevRequestIdSchema = z.string().regex(/^ld_[a-f0-9]{32}$/);
export const LocalDevModeSchema = z.enum(["development", "production"]);
export const LocalDevRecipeSchema = z.enum(["npm-script", "dotnet-run"]);
export const LocalDevScriptSchema = z.enum(["start", "dev", "start:dev", "start:cra"]);
export const LocalDevEnvironmentSchema = z
  .object({
    reference: z
      .string()
      .regex(/^(?:\.env(?:\.[a-zA-Z0-9_-]+)?|appsettings(?:\.[a-zA-Z0-9_-]+)?\.json)$/),
    production: z.boolean(),
    databaseTarget: z.string().max(160).optional(),
  })
  .strict();
export const LocalDevCandidateSchema = z
  .object({
    id: Id,
    name: z.string().min(1).max(80),
    context: PreservedPathSchema.or(z.literal(".")),
    recipe: LocalDevRecipeSchema,
    framework: z.enum(["vite", "cra", "node", "dotnet"]),
    databaseHint: z.enum(["none", "mysql", "postgres", "application"]).optional(),
    scripts: z.array(LocalDevScriptSchema).max(4),
    manifestDigest: Digest,
    environments: z.array(LocalDevEnvironmentSchema).max(16),
  })
  .strict();
export const LocalDevServiceSchema = z
  .object({
    id: Id,
    port: z.number().int().min(1024).max(65535),
    script: LocalDevScriptSchema.optional(),
    database: z.enum(["none", "mysql", "postgres", "application"]),
    apiServiceId: Id.optional(),
    developmentEnvironment: LocalDevEnvironmentSchema.shape.reference.optional(),
    productionEnvironment: LocalDevEnvironmentSchema.shape.reference.optional(),
    preview: z
      .object({
        apiPath: z
          .string()
          .regex(/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/)
          .max(120)
          .default("/api"),
      })
      .strict()
      .optional(),
  })
  .strict();
export const LocalDevPlanSchema = z
  .object({
    services: z.array(LocalDevServiceSchema).min(1).max(12),
  })
  .strict()
  .superRefine((plan, ctx) => {
    if (
      new Set(plan.services.map((s) => s.id)).size !== plan.services.length ||
      new Set(plan.services.map((s) => s.port)).size !== plan.services.length
    )
      ctx.addIssue({ code: "custom", message: "Services and ports must be unique" });
  });
export const LocalDevServiceStateSchema = z
  .object({
    id: Id,
    status: z.enum([
      "stopped",
      "starting",
      "running",
      "port-conflict",
      "failed",
      "recovery-required",
    ]),
    mode: LocalDevModeSchema.optional(),
    pid: z.number().int().positive().optional(),
    startedAt: z.iso.datetime().optional(),
    previewUrl: z
      .string()
      .regex(/^http:\/\/localhost:[0-9]{4,5}\/$/)
      .optional(),
    errorCode: z
      .string()
      .regex(/^[a-z][a-z0-9-]{0,79}$/)
      .optional(),
    existing: z
      .object({
        pid: z.number().int().min(5),
        name: z.string().regex(/^[A-Za-z0-9_.-]{1,80}$/),
        createdAt: z.iso.datetime(),
        identity: Digest,
        projectOwned: z.boolean(),
      })
      .strict()
      .optional(),
  })
  .strict();
export const LocalDevSnapshotSchema = z
  .object({
    version: z.literal(1),
    deviceId: ConnectorIdSchema,
    profileId: Id,
    fingerprint: Digest,
    revision: z.number().int().nonnegative(),
    sourceReady: z.boolean(),
    candidates: z.array(LocalDevCandidateSchema).max(24),
    plan: LocalDevPlanSchema.nullable(),
    services: z.array(LocalDevServiceStateSchema).max(12),
    environmentEditor: LocalEnvEditorSchema.optional(),
    previewRelay: z.literal(1).optional(),
  })
  .strict();
const ActionBase = {
  version: z.literal(1),
  requestId: LocalDevRequestIdSchema,
  deviceId: ConnectorIdSchema,
  profileId: Id,
  expectedRevision: z.number().int().nonnegative(),
  fingerprint: Digest,
};
export const LocalDevActionSchema = z.discriminatedUnion("operation", [
  z.object({ ...ActionBase, operation: z.literal("configure"), plan: LocalDevPlanSchema }).strict(),
  z
    .object({
      ...ActionBase,
      operation: z.enum(["start", "restart"]),
      mode: LocalDevModeSchema,
      serviceId: Id.optional(),
    })
    .strict(),
  z.object({ ...ActionBase, operation: z.literal("stop"), serviceId: Id.optional() }).strict(),
  z
    .object({
      ...ActionBase,
      operation: z.literal("environment-read"),
      serviceId: Id,
      reference: EnvReference,
    })
    .strict(),
  z
    .object({
      ...ActionBase,
      operation: z.literal("environment-save"),
      serviceId: Id,
      reference: EnvReference,
      documentRevision: Digest,
      approved: z.literal(true),
      sealed: LocalEnvSealedSchema,
    })
    .strict(),
  z
    .object({
      ...ActionBase,
      operation: z.literal("kill-existing"),
      serviceId: Id,
      identity: Digest,
    })
    .strict(),
]);
export const LocalDevJobSchema = z
  .object({
    version: z.literal(1),
    workspaceId: z.literal("ws_server20"),
    actor: z.string().regex(/^usr_[A-Za-z0-9_-]+$/),
    request: LocalDevActionSchema,
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    status: z.enum(["queued", "working", "succeeded", "failed", "recovery-required"]),
    errorCode: z
      .string()
      .regex(/^[a-z][a-z0-9-]{0,79}$/)
      .optional(),
    environment: LocalEnvDocumentSchema.optional(),
  })
  .strict();
export const LocalDevStateSchema = z
  .object({
    connections: z
      .array(
        z
          .object({
            deviceId: ConnectorIdSchema,
            name: z.string().min(1).max(80),
            online: z.boolean(),
            observedAt: z.iso.datetime(),
            snapshot: LocalDevSnapshotSchema,
          })
          .strict(),
      )
      .max(100),
    jobs: z.array(LocalDevJobSchema).max(100),
  })
  .strict();
export type LocalDevAction = z.infer<typeof LocalDevActionSchema>;
export type LocalDevJob = z.infer<typeof LocalDevJobSchema>;
export type LocalDevSnapshot = z.infer<typeof LocalDevSnapshotSchema>;
export type LocalDevState = z.infer<typeof LocalDevStateSchema>;
export type LocalDevPlan = z.infer<typeof LocalDevPlanSchema>;
export type LocalEnvDocument = z.infer<typeof LocalEnvDocumentSchema>;
export type LocalEnvChange = z.infer<typeof LocalEnvChangeSchema>;
