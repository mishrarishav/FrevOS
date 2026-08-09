import { z } from "zod";
import {
  ActorIdSchema,
  ApprovalIdSchema,
  ArtifactIdSchema,
  CorrelationIdSchema,
  OpaqueResourceIdSchema,
  ProjectIdSchema,
  UserIdSchema,
  WorkspaceIdSchema,
} from "./identifiers.js";
import { PermissionScopeSchema, RiskLevelSchema } from "./permissions.js";

export const Sha256DigestSchema = z
  .string()
  .regex(/^sha256:[a-f0-9]{64}$/, "Digest must be a lowercase SHA-256 value")
  .brand<"Sha256Digest">();
export type Sha256Digest = z.infer<typeof Sha256DigestSchema>;

export const ResourceTypeSchema = z
  .string()
  .min(1)
  .max(63)
  .regex(/^[a-z][a-z0-9-]*$/, "Resource type must be lowercase kebab-case")
  .brand<"ResourceType">();
export type ResourceType = z.infer<typeof ResourceTypeSchema>;

export const TargetReferenceSchema = z
  .object({
    resourceType: ResourceTypeSchema,
    resourceId: OpaqueResourceIdSchema,
  })
  .strict();
export type TargetReference = z.infer<typeof TargetReferenceSchema>;

export const ArtifactBindingSchema = z
  .object({
    artifactId: ArtifactIdSchema,
    digest: Sha256DigestSchema,
  })
  .strict();
export type ArtifactBinding = z.infer<typeof ArtifactBindingSchema>;

export const ApprovalGrantSchema = z
  .object({
    approvalId: ApprovalIdSchema,
    policyVersion: z.number().int().positive(),
    approvedBy: UserIdSchema,
    actorId: ActorIdSchema,
    workspaceId: WorkspaceIdSchema,
    projectId: ProjectIdSchema.optional(),
    action: PermissionScopeSchema,
    target: TargetReferenceSchema,
    riskLevel: RiskLevelSchema,
    correlationId: CorrelationIdSchema,
    artifact: ArtifactBindingSchema.optional(),
    payloadDigest: Sha256DigestSchema.optional(),
    issuedAt: z.iso.datetime({ offset: true }),
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .refine((approval) => Date.parse(approval.expiresAt) > Date.parse(approval.issuedAt), {
    message: "Approval expiration must be after issuance",
    path: ["expiresAt"],
  });
export type ApprovalGrant = z.infer<typeof ApprovalGrantSchema>;
