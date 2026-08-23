import { z } from "zod";
import {
  ClientIdSchema,
  GithubConnectionIdSchema,
  OperationIdSchema,
  ProjectIdSchema,
  ServiceIdentityIdSchema,
  UserIdSchema,
  WorkspaceIdSchema,
} from "./identifiers.js";
import { IsoTimestampSchema } from "./identity.js";

const ProviderNumericIdSchema = z.string().regex(/^\d{1,20}$/);
const GithubLoginSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/);
const GithubRepositoryNameSchema = z.string().regex(/^[A-Za-z0-9._-]{1,100}$/);
const GitBranchSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,119}$/);
const DisplayNameSchema = z
  .string()
  .min(1)
  .max(120)
  .refine((value) => value === value.trim());

export const GithubRepositorySchema = z
  .object({
    providerRepositoryId: ProviderNumericIdSchema,
    owner: GithubLoginSchema,
    name: GithubRepositoryNameSchema,
    url: z.string().url().max(300),
    defaultBranch: GitBranchSchema,
    visibility: z.enum(["public", "private", "internal"]),
    archived: z.boolean(),
  })
  .strict()
  .superRefine((repository, context) => {
    if (repository.url !== `https://github.com/${repository.owner}/${repository.name}`) {
      context.addIssue({ code: "custom", path: ["url"], message: "GitHub URL is not canonical" });
    }
  });
export type GithubRepository = z.infer<typeof GithubRepositorySchema>;

export const GithubDiscoveryResultSchema = z
  .object({
    provider: z.literal("github"),
    account: z
      .object({ providerAccountId: ProviderNumericIdSchema, login: GithubLoginSchema })
      .strict(),
    repositories: z.array(GithubRepositorySchema).max(50),
  })
  .strict();
export type GithubDiscoveryResult = z.infer<typeof GithubDiscoveryResultSchema>;

const GithubDiscoveryFailureResultSchema = z
  .object({ message: z.string().min(1).max(200), failureStage: z.string().max(63).optional() })
  .strict();

export const GithubConnectionSchema = z
  .object({
    connectionId: GithubConnectionIdSchema,
    workspaceId: WorkspaceIdSchema,
    provider: z.literal("github"),
    providerAccountId: ProviderNumericIdSchema,
    login: GithubLoginSchema,
    agentId: ServiceIdentityIdSchema,
    status: z.literal("active"),
    repositories: z.array(GithubRepositorySchema).max(50),
    verifiedAt: IsoTimestampSchema,
    createdAt: IsoTimestampSchema,
  })
  .strict();
export type GithubConnection = z.infer<typeof GithubConnectionSchema>;

export const GithubDiscoveryOperationSchema = z
  .object({
    operationId: OperationIdSchema,
    workspaceId: WorkspaceIdSchema,
    agentId: ServiceIdentityIdSchema,
    requestedBy: UserIdSchema,
    action: z.literal("github.account.discover"),
    status: z.enum(["queued", "claimed", "succeeded", "failed"]),
    result: z.union([GithubDiscoveryResultSchema, GithubDiscoveryFailureResultSchema]).nullable(),
    errorCode: z
      .string()
      .regex(/^[a-z][a-z0-9-]{0,62}$/)
      .nullable(),
    createdAt: IsoTimestampSchema,
    claimedAt: IsoTimestampSchema.nullable(),
    completedAt: IsoTimestampSchema.nullable(),
  })
  .strict();
export type GithubDiscoveryOperation = z.infer<typeof GithubDiscoveryOperationSchema>;

export const GithubDiscoveryCompletionSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("succeeded"), result: GithubDiscoveryResultSchema }).strict(),
  z
    .object({
      status: z.literal("failed"),
      result: GithubDiscoveryFailureResultSchema,
      errorCode: z.string().regex(/^[a-z][a-z0-9-]{0,62}$/),
    })
    .strict(),
]);
export type GithubDiscoveryCompletion = z.infer<typeof GithubDiscoveryCompletionSchema>;

export const ConnectGithubRepositoryRequestSchema = z
  .object({
    connectionId: GithubConnectionIdSchema,
    providerRepositoryId: ProviderNumericIdSchema,
    displayName: DisplayNameSchema,
    clientId: ClientIdSchema.optional(),
  })
  .strict();
export type ConnectGithubRepositoryRequest = z.infer<typeof ConnectGithubRepositoryRequestSchema>;

export const ProjectRepositoryConnectionSchema = z
  .object({
    workspaceId: WorkspaceIdSchema,
    projectId: ProjectIdSchema,
    connectionId: GithubConnectionIdSchema,
    repository: GithubRepositorySchema,
    status: z.literal("connected"),
    createdAt: IsoTimestampSchema,
  })
  .strict();
export type ProjectRepositoryConnection = z.infer<typeof ProjectRepositoryConnectionSchema>;
