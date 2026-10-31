import { z } from "zod";
import { UserIdSchema, WorkspaceIdSchema } from "./identifiers.js";

export const HostedRepositoryIdSchema = z.string().regex(/^repo_[a-f0-9]{32}$/);
export const ForgeInstallationIdSchema = z.string().regex(/^forge_[a-f0-9]{32}$/);
export const GitObjectIdSchema = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/);
export const SafeGitBranchSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/)
  .refine(
    (s) =>
      !s.includes("..") &&
      !s.includes("//") &&
      !s.endsWith("/") &&
      !s.endsWith(".") &&
      s.split("/").every((p) => !p.startsWith(".") && !p.endsWith(".lock")),
  );
const Login = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/);
export const HostedRepositoryBindingSchema = z
  .object({
    id: HostedRepositoryIdSchema,
    providerRepositoryId: z.number().int().positive(),
    owner: Login,
    name: Login,
    defaultBranch: SafeGitBranchSchema,
    requiredApprovals: z.number().int().min(1).max(10).default(1),
    requiredChecks: z.array(z.string().min(1).max(100)).max(20).default([]),
    bootstrap: z
      .object({
        createdBy: UserIdSchema,
        requestId: z.string().regex(/^git_[a-f0-9]{32}$/),
        seedHead: GitObjectIdSchema,
      })
      .strict()
      .optional(),
  })
  .strict();
export const RepositoryRecoveryConfigSchema = z
  .object({
    workRoot: z.string().min(1).max(500),
    backupRoot: z.string().min(1).max(500),
    restoreRoot: z.string().min(1).max(500),
    binary: z.string().min(1).max(500),
    binarySha256: z.string().regex(/^[a-f0-9]{64}$/),
    serviceName: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,79}$/),
    expectedCommandLine: z.string().min(1).max(2000),
    keyOwner: UserIdSchema,
    keyId: z.string().regex(/^mc_[a-f0-9]{32}$/),
    keyReference: z.string().min(1).max(160),
    maxBytes: z.number().int().min(1024).max(1073741824).default(268435456),
    maxFiles: z.number().int().min(1).max(100000).default(50000),
  })
  .strict();
export const RepositoryBackupSchema = z
  .object({
    version: z.literal(1),
    id: z.string().regex(/^gbackup_[a-f0-9]{32}$/),
    installationId: ForgeInstallationIdSchema,
    workspaceId: WorkspaceIdSchema,
    createdAt: z.iso.datetime(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    bytes: z.number().int().positive(),
    files: z.number().int().nonnegative(),
    uncompressedBytes: z.number().int().nonnegative(),
  })
  .strict();
export const RepositoryRecoveryStateSchema = z
  .object({ configured: z.boolean(), backups: z.array(RepositoryBackupSchema).max(100) })
  .strict();
export const RepositoryRecoveryResultSchema = z
  .object({
    requestId: z.string().regex(/^git_[a-f0-9]{32}$/),
    status: z.enum(["backed-up", "verified-isolated"]),
    backupId: z.string().regex(/^gbackup_[a-f0-9]{32}$/),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type RepositoryRecoveryState = z.infer<typeof RepositoryRecoveryStateSchema>;
export type RepositoryRecoveryResult = z.infer<typeof RepositoryRecoveryResultSchema>;
export const RepositoryRecoveryActionSchema = z.discriminatedUnion("action", [
  z
    .object({
      version: z.literal(1),
      requestId: z.string().regex(/^git_[a-f0-9]{32}$/),
      action: z.literal("backup"),
    })
    .strict(),
  z
    .object({
      version: z.literal(1),
      requestId: z.string().regex(/^git_[a-f0-9]{32}$/),
      action: z.literal("restore-isolated"),
      backupId: z.string().regex(/^gbackup_[a-f0-9]{32}$/),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
]);
export const RepositoryHostingConfigSchema = z
  .object({
    version: z.literal(1),
    installationId: ForgeInstallationIdSchema,
    workspaceId: WorkspaceIdSchema,
    provider: z.literal("gitea"),
    apiUrl: z.url(),
    webUrl: z.url(),
    allowPrivateHttp: z.boolean().default(false),
    defaultBranch: SafeGitBranchSchema.default("main"),
    recovery: RepositoryRecoveryConfigSchema.optional(),
    accounts: z
      .array(
        z
          .object({
            userId: UserIdSchema,
            providerUserId: z.number().int().positive(),
            login: Login,
            credentialId: z.string().regex(/^mc_[a-f0-9]{32}$/),
            credentialReference: z.string().min(1).max(160),
          })
          .strict(),
      )
      .max(1000),
    repositories: z.array(HostedRepositoryBindingSchema).max(1000),
  })
  .strict()
  .superRefine((c, ctx) => {
    for (const key of [
      c.accounts.map((a) => a.userId),
      c.accounts.map((a) => String(a.providerUserId)),
      c.repositories.map((r) => r.id),
      c.repositories.map((r) => String(r.providerRepositoryId)),
    ])
      if (new Set(key).size !== key.length)
        ctx.addIssue({ code: "custom", message: "Duplicate hosting identity" });
  });
export type RepositoryHostingConfig = z.infer<typeof RepositoryHostingConfigSchema>;
export const HostedRepositoryCreateSchema = z
  .object({
    version: z.literal(1),
    requestId: z.string().regex(/^git_[a-f0-9]{32}$/),
    name: Login,
  })
  .strict();
export const HostedBranchSchema = z
  .object({ name: SafeGitBranchSchema, sha: GitObjectIdSchema, protected: z.boolean() })
  .strict();
export const HostedPullRequestSchema = z
  .object({
    number: z.number().int().positive(),
    title: z.string().max(500),
    state: z.enum(["open", "closed"]),
    author: z.string().max(100),
    authorId: z.number().int().positive(),
    head: SafeGitBranchSchema,
    base: SafeGitBranchSchema,
    headSha: GitObjectIdSchema,
    baseSha: GitObjectIdSchema,
    url: z.url(),
    merged: z.boolean(),
    mergeable: z.boolean(),
  })
  .strict();
export type HostedPullRequest = z.infer<typeof HostedPullRequestSchema>;
export const HostedRepositorySchema = z
  .object({
    id: HostedRepositoryIdSchema,
    name: z.string().max(210),
    defaultBranch: SafeGitBranchSchema,
    webUrl: z.url(),
    cloneUrl: z.url(),
    sshUrl: z.string().max(2048),
    role: z.enum(["reader", "developer", "maintainer"]),
    permissions: z
      .object({ read: z.literal(true), write: z.boolean(), admin: z.boolean() })
      .strict(),
    branches: z.array(HostedBranchSchema).max(100),
    pullRequests: z.array(HostedPullRequestSchema).max(100),
    protectedDefault: z.boolean(),
    requiredApprovals: z.number().int().nonnegative(),
  })
  .strict();
export const RepositoryCenterStateSchema = z
  .object({
    configured: z.boolean(),
    accountLinked: z.boolean().optional(),
    repositories: z.array(HostedRepositorySchema).max(1000),
  })
  .strict();
export type RepositoryCenterState = z.infer<typeof RepositoryCenterStateSchema>;
const RequestId = z.string().regex(/^git_[a-f0-9]{32}$/);
const ActionBase = {
  version: z.literal(1),
  requestId: RequestId,
  repositoryId: HostedRepositoryIdSchema,
};
export const RepositoryActionSchema = z.discriminatedUnion("action", [
  z
    .object({
      ...ActionBase,
      action: z.literal("branch.create"),
      name: SafeGitBranchSchema,
      from: SafeGitBranchSchema,
      expectedSha: GitObjectIdSchema,
    })
    .strict(),
  z
    .object({
      ...ActionBase,
      action: z.literal("pull.create"),
      head: SafeGitBranchSchema,
      base: SafeGitBranchSchema,
      expectedHead: GitObjectIdSchema,
      title: z.string().trim().min(1).max(200),
      body: z.string().max(10000).default(""),
    })
    .strict(),
  z
    .object({
      ...ActionBase,
      action: z.literal("pull.review"),
      number: z.number().int().positive(),
      expectedHead: GitObjectIdSchema,
      verdict: z.enum(["APPROVED", "REQUEST_CHANGES", "COMMENT"]),
      body: z.string().max(10000).default(""),
    })
    .strict(),
  z
    .object({
      ...ActionBase,
      action: z.literal("pull.merge"),
      number: z.number().int().positive(),
      expectedHead: GitObjectIdSchema,
      expectedBase: GitObjectIdSchema,
    })
    .strict(),
]);
export type RepositoryAction = z.infer<typeof RepositoryActionSchema>;
export const RepositoryActionResultSchema = z
  .object({
    requestId: RequestId,
    action: RepositoryActionSchema.options[0].shape.action.or(
      z.enum(["pull.create", "pull.review", "pull.merge"]),
    ),
    status: z.literal("succeeded"),
    url: z.url().optional(),
  })
  .strict();
