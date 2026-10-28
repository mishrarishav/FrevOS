import { z } from "zod";
import {
  ConnectorProbeSchema,
  DeploymentProfileIdSchema,
  SourceCheckoutPathSchema,
} from "./deployment-settings.js";
import { UserIdSchema } from "./identifiers.js";
import { IsoTimestampSchema } from "./identity.js";
export const ConnectorIdSchema = z.string().regex(/^fc_[a-f0-9]{32}$/);
export const FolderSelectionSchema = z
  .object({
    version: z.literal(1),
    requestId: z.string().regex(/^fp_[a-f0-9]{32}$/),
    deviceId: ConnectorIdSchema,
    profileId: DeploymentProfileIdSchema,
    expiresAt: IsoTimestampSchema,
    status: z.enum(["queued", "choosing", "selected", "cancelled", "failed", "expired"]),
    source: ConnectorProbeSchema.optional(),
    requestedRepository: SourceCheckoutPathSchema.optional(),
    errorCode: z
      .enum([
        "folder-source-running",
        "folder-not-git",
        "folder-wrong-repository",
        "folder-inaccessible",
        "folder-selection-unavailable",
      ])
      .optional(),
  })
  .strict();
export type FolderSelection = z.infer<typeof FolderSelectionSchema>;
export const ConnectorRecordBaseSchema = z
  .object({
    version: z.literal(1),
    deviceId: ConnectorIdSchema,
    userId: UserIdSchema,
    workspaceId: z.literal("ws_server20"),
    repositoryId: z
      .string()
      .regex(/^gitrepo_[a-f0-9]{32}$/)
      .optional(),
    mode: z.literal("system").optional(),
    profileId: DeploymentProfileIdSchema.optional(),
    name: z.string().trim().min(1).max(80),
    status: z.enum(["active", "revoked"]),
    createdAt: IsoTimestampSchema,
    expiresAt: IsoTimestampSchema,
    lastSeenAt: IsoTimestampSchema.nullable(),
    online: z.boolean(),
    source: ConnectorProbeSchema.optional(),
    folderSelection: FolderSelectionSchema.optional(),
    folderPicker: z.boolean().optional(),
    folderBrowser: z.boolean().optional(),
    loginProofPort: z.number().int().min(1024).max(65535).optional(),
    changeNotes: z.boolean().optional(),
  })
  .strict();
export const ConnectorSchema = ConnectorRecordBaseSchema.superRefine((device, ctx) => {
  if (
    device.mode === "system"
      ? !!device.repositoryId ||
        !!device.profileId ||
        !!device.source ||
        !!device.folderSelection ||
        !!device.folderPicker ||
        !!device.folderBrowser ||
        !!device.changeNotes
      : !device.repositoryId
  )
    ctx.addIssue({ code: "custom", message: "Connector purpose does not match its scope" });
});
export type DeveloperConnector = z.infer<typeof ConnectorSchema>;
export const SystemEnrollmentStartSchema = z
  .object({
    version: z.literal(1),
    deviceId: ConnectorIdSchema,
    name: z.string().trim().min(1).max(80),
    platform: z.enum(["win32", "linux"]),
    architecture: z.enum(["x64", "arm64"]),
    fileActivity: z.boolean(),
    credentialHash: z.string().regex(/^[a-f0-9]{64}$/),
    pollHash: z.string().regex(/^[a-f0-9]{64}$/),
    codeHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const SystemEnrollmentPreviewSchema = z
  .object({
    version: z.literal(1),
    enrollmentId: z.string().regex(/^ep_[a-f0-9]{32}$/),
    ownerUserId: UserIdSchema.optional(),
    deviceId: ConnectorIdSchema,
    name: z.string().max(80),
    platform: z.enum(["win32", "linux"]),
    architecture: z.enum(["x64", "arm64"]),
    fileActivity: z.boolean(),
    expiresAt: IsoTimestampSchema,
    status: z.enum(["pending", "approving", "approved", "rejected", "expired"]),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type SystemEnrollmentPreview = z.infer<typeof SystemEnrollmentPreviewSchema>;
export const DeveloperInviteResultSchema = z
  .object({
    version: z.literal(1),
    code: z.string(),
    username: z.string(),
    expiresAt: IsoTimestampSchema,
  })
  .strict();
export const ConnectorRevocationSchema = z.object({ revoked: z.literal(true) }).strict();
export const ConnectorListSchema = z.array(ConnectorSchema).max(100);
export const PairConnectorSchema = z
  .object({
    version: z.literal(1),
    name: z.string().trim().min(1).max(80),
    profileId: DeploymentProfileIdSchema.optional(),
    mode: z.literal("system").optional(),
  })
  .strict();
export const InviteDeveloperSchema = z
  .object({
    version: z.literal(1),
    username: z.string().regex(/^[a-z0-9][a-z0-9._-]{2,63}$/),
    displayName: z.string().trim().min(1).max(120),
  })
  .strict();
export const RedeemDeveloperSchema = z
  .object({
    version: z.literal(1),
    code: z.string().regex(/^fi_[a-f0-9]{32}\.[A-Za-z0-9_-]{43}$/),
    password: z.string().min(8).max(128),
  })
  .strict();
