import { z } from "zod";
import {
  OperationIdSchema,
  ProjectIdSchema,
  ServiceIdentityIdSchema,
  UserIdSchema,
  WorkspaceIdSchema,
} from "./identifiers.js";
import { IsoTimestampSchema } from "./identity.js";

export const ProjectAutomationActionSchema = z.enum([
  "repository.inspect",
  "repository.propose-commit",
  "repository.commit-push",
  "repository.open-pull-request",
  "repository.squash-merge",
  "project.build",
  "uat.deploy",
]);
export type ProjectAutomationAction = z.infer<typeof ProjectAutomationActionSchema>;

export const ProjectAutomationStatusSchema = z.enum(["queued", "claimed", "succeeded", "failed"]);
export type ProjectAutomationStatus = z.infer<typeof ProjectAutomationStatusSchema>;

const Sha1Schema = z.string().regex(/^[a-f0-9]{40}$/);
const Sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const ProjectAutomationProfileSchema = z
  .object({
    workspaceId: WorkspaceIdSchema,
    projectId: ProjectIdSchema,
    repository: z
      .object({
        provider: z.literal("github"),
        providerRepositoryId: z.literal("1334902237"),
        owner: z.literal("mishrarishav"),
        name: z.literal("TraceGRN"),
        url: z.literal("https://github.com/mishrarishav/TraceGRN"),
        defaultBranch: z.literal("main"),
      })
      .strict(),
    agentId: ServiceIdentityIdSchema.refine((value) => value === "svc_trackgrn_windows_agent"),
    environment: z.literal("uat"),
    application: z
      .object({
        publicOrigin: z.literal("https://tserver2.eeslindia.org"),
        apiBasePath: z.literal("/apiTrackGrn"),
        healthPath: z.literal("/apiTrackGrn/health/live"),
        swaggerPath: z.literal("/apiTrackGrn/swagger"),
      })
      .strict(),
    allowedActions: z.array(ProjectAutomationActionSchema).min(1),
  })
  .strict();
export type ProjectAutomationProfile = z.infer<typeof ProjectAutomationProfileSchema>;

const NoInputSchema = z.object({}).strict();
const ReviewedChangesInputSchema = z
  .object({
    expectedHeadSha: Sha1Schema,
    expectedChangeDigest: Sha256HexSchema,
    commitMessage: z
      .string()
      .min(3)
      .max(120)
      .refine((value) => value === value.trim() && !/[\r\n]/.test(value)),
  })
  .strict();
const PullRequestTitleSchema = z
  .string()
  .min(3)
  .max(120)
  .refine((value) => value === value.trim() && !/[\r\n]/.test(value));
const ReviewedBranchInputSchema = z
  .object({
    expectedHeadSha: Sha1Schema,
    branch: z.string().regex(/^frevos\/trackgrn-[A-Za-z0-9_-]{12}$/),
    title: PullRequestTitleSchema,
  })
  .strict();
const SquashMergeInputSchema = z
  .object({
    pullRequestNumber: z.number().int().min(1).max(2_147_483_647),
    expectedHeadSha: Sha1Schema,
    confirmation: z.literal("squash-merge"),
  })
  .strict();
const DeployInputSchema = z
  .object({
    expectedHeadSha: Sha1Schema,
    migrate: z.boolean().default(true),
    seed: z.boolean().default(false),
  })
  .strict();

export const ProjectAutomationRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("repository.inspect"), input: NoInputSchema }).strict(),
  z.object({ action: z.literal("repository.propose-commit"), input: NoInputSchema }).strict(),
  z
    .object({ action: z.literal("repository.commit-push"), input: ReviewedChangesInputSchema })
    .strict(),
  z
    .object({ action: z.literal("repository.open-pull-request"), input: ReviewedBranchInputSchema })
    .strict(),
  z
    .object({ action: z.literal("repository.squash-merge"), input: SquashMergeInputSchema })
    .strict(),
  z.object({ action: z.literal("project.build"), input: NoInputSchema }).strict(),
  z.object({ action: z.literal("uat.deploy"), input: DeployInputSchema }).strict(),
]);
export type ProjectAutomationRequest = z.infer<typeof ProjectAutomationRequestSchema>;

export const ProjectAutomationOperationSchema = z
  .object({
    operationId: OperationIdSchema,
    workspaceId: WorkspaceIdSchema,
    projectId: ProjectIdSchema,
    agentId: ServiceIdentityIdSchema,
    requestedBy: UserIdSchema,
    action: ProjectAutomationActionSchema,
    status: ProjectAutomationStatusSchema,
    input: z.record(z.string(), z.unknown()),
    result: z.record(z.string(), z.unknown()).nullable(),
    errorCode: z
      .string()
      .regex(/^[a-z][a-z0-9-]{0,62}$/)
      .nullable(),
    createdAt: IsoTimestampSchema,
    claimedAt: IsoTimestampSchema.nullable(),
    completedAt: IsoTimestampSchema.nullable(),
  })
  .strict();
export type ProjectAutomationOperation = z.infer<typeof ProjectAutomationOperationSchema>;

export const AgentOperationCompletionSchema = z
  .object({
    status: z.enum(["succeeded", "failed"]),
    result: z.record(z.string(), z.unknown()),
    errorCode: z
      .string()
      .regex(/^[a-z][a-z0-9-]{0,62}$/)
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === "failed" && value.errorCode === undefined) {
      context.addIssue({ code: "custom", message: "A failed operation requires an error code" });
    }
    if (value.status === "succeeded" && value.errorCode !== undefined) {
      context.addIssue({
        code: "custom",
        message: "A successful operation cannot have an error code",
      });
    }
  });
export type AgentOperationCompletion = z.infer<typeof AgentOperationCompletionSchema>;
