import { z } from "zod";
import { DeploymentChangeSchema } from "./deployment-change.js";
import { PreservedPathSchema } from "./deployment-settings.js";
import { ConnectorIdSchema } from "./developer-connectors.js";
import { UserIdSchema, WorkspaceIdSchema } from "./identifiers.js";
import { IsoTimestampSchema } from "./identity.js";
export const ServixRequestIdSchema = z.string().regex(/^sd_[a-f0-9]{32}$/);
export const ServixDigestSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const ServixHeadSchema = z.string().regex(/^[a-f0-9]{40}$/);
export const ServixDeployRequestSchema = z
  .object({
    version: z.literal(1),
    requestId: ServixRequestIdSchema,
    confirmation: z.literal("deploy-servix-development"),
    changeDetails: DeploymentChangeSchema,
    connectorId: ConnectorIdSchema.optional(),
  })
  .strict();
export const ServixRestoreRequestSchema = z
  .object({
    version: z.literal(1),
    requestId: ServixRequestIdSchema,
    expectedCurrentRequestId: ServixRequestIdSchema,
    restoreRequestId: ServixRequestIdSchema,
    operation: z.enum(["rollback", "restore"]),
    confirmation: z.literal("restore-servix-development"),
    changeDetails: DeploymentChangeSchema,
  })
  .strict();
export const ServixDeploymentSchema = z
  .object({
    version: z.literal(1),
    requestId: ServixRequestIdSchema,
    workspaceId: WorkspaceIdSchema,
    requestedBy: UserIdSchema,
    changeDetails: DeploymentChangeSchema.optional(),
    target: z.literal("server21-servix-development"),
    createdAt: IsoTimestampSchema,
    expiresAt: IsoTimestampSchema,
    updatedAt: IsoTimestampSchema,
    status: z.enum([
      "publishing",
      "building",
      "activating",
      "succeeded",
      "failed",
      "recovery-required",
    ]),
    sourceHead: ServixHeadSchema.nullable(),
    connectorId: ConnectorIdSchema.optional(),
    operation: z.enum(["deploy", "rollback", "restore"]).optional(),
    releaseRequestId: ServixRequestIdSchema.optional(),
    previousRequestId: ServixRequestIdSchema.optional(),
    settingsRevision: z.number().int().positive().optional(),
    preservedPaths: z.array(PreservedPathSchema).max(64).optional(),
    artifactDigest: ServixDigestSchema.optional(),
    errorCode: z
      .string()
      .regex(/^[a-z][a-z0-9-]{0,62}$/)
      .optional(),
    preservedFiles: z.number().int().min(0).max(100000).optional(),
    url: z.literal("http://10.9.69.21:82/").optional(),
  })
  .strict();
export type ServixDeployment = z.infer<typeof ServixDeploymentSchema>;
export const ServixDeploymentStateSchema = z
  .object({
    available: z.boolean(),
    runnerOnline: z.boolean(),
    source: z.literal("server20 / servix.git / frevos-dev"),
    sourceHead: ServixHeadSchema.nullable(),
    target: z.literal("10.9.69.21 / D:\\servixDev"),
    runs: z.array(ServixDeploymentSchema).max(30),
    currentRequestId: ServixRequestIdSchema.optional(),
    rollbackRequestId: ServixRequestIdSchema.optional(),
    restorableRequestIds: z.array(ServixRequestIdSchema).max(30).optional(),
  })
  .strict();
export type ServixDeploymentState = z.infer<typeof ServixDeploymentStateSchema>;
