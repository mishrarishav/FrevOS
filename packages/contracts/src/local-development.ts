import { z } from "zod";
import { DeploymentProfileIdSchema, PreservedPathSchema } from "./deployment-settings.js";
import { ConnectorIdSchema } from "./developer-connectors.js";

const Id = DeploymentProfileIdSchema;
const Digest = z.string().regex(/^[a-f0-9]{64}$/);
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
