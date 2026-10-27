import { z } from "zod";
import { DeploymentChangeSchema } from "./deployment-change.js";
import {
  DeploymentProfileIdSchema,
  PreservedPathSchema,
  SourceCheckoutPathSchema,
} from "./deployment-settings.js";
import {
  ServixDigestSchema,
  ServixHeadSchema,
  ServixRequestIdSchema,
} from "./servix-deployment.js";

export const PromotionIdSchema = z.string().regex(/^pm_[a-f0-9]{32}$/);
const timestamp = z.iso.datetime();
const name = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/);
const url = z
  .url()
  .max(240)
  .refine((s) => /^https?:\/\//.test(s) && !/[?@#]/.test(s));
export const PromotionTargetSchema = z
  .object({
    profileId: DeploymentProfileIdSchema,
    displayName: z.string().min(1).max(80),
    workspaceId: z.string().regex(/^ws_[A-Za-z0-9_-]+$/),
    ownerId: z.string().regex(/^usr_[A-Za-z0-9_-]+$/),
    repositoryId: z.string().regex(/^gitrepo_[a-f0-9]{32}$/),
    sourceProfileId: DeploymentProfileIdSchema,
    connectionReference: name,
    host: z.string().regex(/^[A-Za-z0-9.-]{1,120}$/),
    computer: name,
    root: SourceCheckoutPathSchema,
    scratchRoot: SourceCheckoutPathSchema,
    node: SourceCheckoutPathSchema,
    nodeVersion: z.string().regex(/^v[0-9]{1,3}\.[0-9]+\.[0-9]+$/),
    port: z.number().int().min(1).max(65535),
    healthUrl: url,
    publicHealthUrl: url,
    taskName: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{2,100}$/),
    preservedPaths: z.array(PreservedPathSchema).min(1).max(64),
    additionalProtectedRoots: z.array(SourceCheckoutPathSchema).max(8),
    protectedConfigurationFiles: z.array(SourceCheckoutPathSchema).max(16),
    databaseVersion: z.string().regex(/^8\.0\.[0-9]{1,3}$/),
    dependencyRisk: z.string().min(1).max(500),
  })
  .strict();
export type PromotionTarget = z.infer<typeof PromotionTargetSchema>;

export const PromotionRegistrySchema = z
  .object({
    version: z.literal(1),
    targets: z.array(PromotionTargetSchema).max(20),
  })
  .strict();

export const PromotionReviewSchema = z
  .object({
    version: z.literal(1),
    id: PromotionIdSchema,
    workspaceId: z.string(),
    requestedBy: z.string(),
    profileId: DeploymentProfileIdSchema,
    profileRevision: z.number().int().positive(),
    targetSha256: ServixDigestSchema,
    createdAt: timestamp,
    expiresAt: timestamp,
    developmentRequestId: ServixRequestIdSchema,
    artifact: z
      .object({
        sourceHead: ServixHeadSchema,
        releaseManifestSha256: ServixDigestSchema,
        descriptorSha256: ServixDigestSchema,
        bundleSha256: ServixDigestSchema,
      })
      .strict(),
    process: z
      .object({
        pid: z.number().int().positive(),
        createdAt: timestamp,
        owner: z.string().min(1).max(180),
        nodeVersion: z.string().regex(/^v[0-9]{1,3}\.[0-9]+\.[0-9]+$/),
        batchLogonReady: z.boolean(),
        taskAlreadyExists: z.boolean(),
      })
      .strict(),
    protection: z
      .object({
        files: z.number().int().nonnegative().max(200000),
        bytes: z.number().int().nonnegative(),
        sha256: ServixDigestSchema,
      })
      .strict(),
    backup: z
      .object({
        reference: z.string().regex(/^promotion-backup\/pm_[a-f0-9]{32}$/),
        createdAt: timestamp,
        sha256: ServixDigestSchema,
        bytes: z.number().int().positive(),
        databaseVersion: z.string(),
        encrypted: z.literal(true),
        integrityVerified: z.literal(true),
        isolatedRestoreTested: z.boolean(),
      })
      .strict(),
    runtimeSha256: ServixDigestSchema,
    privateSnapshotSha256: ServixDigestSchema,
  })
  .strict();
export type PromotionReview = z.infer<typeof PromotionReviewSchema>;
export const PromotionPrepareInputSchema = z
  .object({
    version: z.literal(1),
    requestId: PromotionIdSchema,
    profileId: DeploymentProfileIdSchema,
    expectedRevision: z.number().int().positive(),
    developmentRequestId: ServixRequestIdSchema,
  })
  .strict();
export const PromotionApproveInputSchema = z
  .object({
    version: z.literal(1),
    requestId: PromotionIdSchema,
    reviewId: PromotionIdSchema,
    reviewSha256: ServixDigestSchema,
    confirmation: z.literal("promote-reviewed-backend-to-production"),
    changeDetails: DeploymentChangeSchema,
    acknowledgements: z
      .object({
        retainedDependencyRisk: z.literal(true),
        startupDatabaseEffects: z.literal(true),
        briefInterruption: z.literal(true),
        sameOwnerCredentialBinding: z.literal(true),
        codeRecoveryDoesNotRestoreDatabase: z.literal(true),
        assignBatchLogonIfMissing: z.boolean(),
      })
      .strict(),
  })
  .strict();
export const PromotionJobSchema = z
  .object({
    version: z.literal(1),
    id: PromotionIdSchema,
    workspaceId: z.string(),
    requestedBy: z.string(),
    action: z.enum(["prepare", "promote"]),
    target: PromotionTargetSchema,
    targetSha256: ServixDigestSchema,
    profileRevision: z.number().int().positive(),
    createdAt: timestamp,
    expiresAt: timestamp,
    developmentRequestId: ServixRequestIdSchema,
    reviewId: PromotionIdSchema.optional(),
    reviewSha256: ServixDigestSchema.optional(),
    approval: PromotionApproveInputSchema.optional(),
  })
  .strict();
export type PromotionJob = z.infer<typeof PromotionJobSchema>;
export const PromotionResultSchema = z
  .object({
    version: z.literal(1),
    id: PromotionIdSchema,
    status: z.enum([
      "working",
      "prepared",
      "succeeded",
      "failed",
      "recovered",
      "recovery-required",
    ]),
    updatedAt: timestamp,
    stage: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
    errorCode: z
      .string()
      .regex(/^[a-z][a-z0-9-]{0,63}$/)
      .optional(),
    review: PromotionReviewSchema.optional(),
    reviewSha256: ServixDigestSchema.optional(),
    protectedFilesVerified: z.number().int().nonnegative().optional(),
    healthVerified: z.boolean().optional(),
    artifactDigest: ServixDigestSchema.optional(),
    batchLogonAssigned: z.boolean().optional(),
    runtimeTaskRegistered: z.boolean().optional(),
  })
  .strict();
export type PromotionResult = z.infer<typeof PromotionResultSchema>;
export const PromotionStateSchema = z
  .object({
    online: z.boolean(),
    targets: z.array(PromotionTargetSchema).max(20),
    jobs: z
      .array(
        z.object({ job: PromotionJobSchema, result: PromotionResultSchema.nullable() }).strict(),
      )
      .max(30),
  })
  .strict();
export type PromotionState = z.infer<typeof PromotionStateSchema>;
