import { z } from "zod";
import { UserIdSchema, WorkspaceIdSchema } from "./identifiers.js";
import { GitObjectIdSchema, SafeGitBranchSchema } from "./repository-center.js";

export const CodeRepositoryIdSchema = z.string().regex(/^(?:gitrepo|repo)_[a-f0-9]{32}$/);
export const CodePathSchema = z
  .string()
  .max(1024)
  .refine(
    (s) =>
      s === "" ||
      (!s.includes("\\") &&
        !s.includes(":") &&
        !Array.from(s).some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) &&
        !s.startsWith("/") &&
        s
          .split("/")
          .every((p) => p !== "" && p !== "." && p !== ".." && p.toLowerCase() !== ".git")),
  );
export const CodeQuerySchema = z
  .object({
    branch: SafeGitBranchSchema.optional(),
    head: GitObjectIdSchema.optional(),
    path: CodePathSchema.default(""),
    page: z.coerce.number().int().min(0).max(1000).default(0),
  })
  .strict();
export const CodeCommitSchema = z
  .object({
    sha: GitObjectIdSchema,
    author: z.string().max(300),
    at: z.iso.datetime(),
    subject: z.string().max(1000),
  })
  .strict();
export const CodeBranchSchema = z
  .object({ name: SafeGitBranchSchema, sha: GitObjectIdSchema })
  .strict();
export const CodeRepositorySchema = z
  .object({
    id: CodeRepositoryIdSchema,
    name: z.string().min(1).max(210),
    provider: z.enum(["central", "hosted"]),
    defaultBranch: SafeGitBranchSchema,
    ownerId: UserIdSchema.nullable(),
    role: z.enum(["administrator", "owner", "maintainer", "developer", "reader"]),
    canManageAccess: z.boolean(),
    status: z.enum(["ready", "empty", "unavailable"]),
    head: CodeCommitSchema.nullable(),
    cloneUrl: z.string().max(2048).nullable(),
  })
  .strict();
export const CodeCatalogSchema = z
  .object({
    workspaceId: WorkspaceIdSchema,
    administrator: z.boolean(),
    repositories: z.array(CodeRepositorySchema).max(1000),
  })
  .strict();
export const CodeEntrySchema = z
  .object({
    name: z.string().max(300),
    path: CodePathSchema,
    sha: GitObjectIdSchema,
    kind: z.enum(["directory", "file", "symlink", "submodule"]),
    bytes: z.number().int().nonnegative().nullable(),
    protected: z.boolean(),
  })
  .strict();
export const CodeTreeSchema = z
  .object({
    repositoryId: CodeRepositoryIdSchema,
    branch: SafeGitBranchSchema,
    head: GitObjectIdSchema,
    path: CodePathSchema,
    branches: z.array(CodeBranchSchema).max(200),
    entries: z.array(CodeEntrySchema).max(100),
    total: z.number().int().nonnegative(),
    page: z.number().int().nonnegative(),
    pageSize: z.literal(100),
    latest: CodeCommitSchema.nullable(),
    readme: z
      .object({ path: CodePathSchema, text: z.string().max(131072) })
      .strict()
      .nullable(),
  })
  .strict();
export const CodeBlobSchema = z
  .object({
    repositoryId: CodeRepositoryIdSchema,
    path: CodePathSchema,
    head: GitObjectIdSchema,
    sha: GitObjectIdSchema,
    bytes: z.number().int().nonnegative(),
    text: z.string().max(524288).nullable(),
    binary: z.boolean(),
    tooLarge: z.boolean(),
  })
  .strict();
export const CodeHistorySchema = z
  .object({
    commits: z.array(CodeCommitSchema).max(30),
    hasMore: z.boolean(),
    page: z.number().int().nonnegative(),
  })
  .strict();
export const CodeAccessSchema = z
  .object({
    repositoryId: CodeRepositoryIdSchema,
    revision: z.number().int().nonnegative(),
    ownerId: UserIdSchema.nullable(),
    users: z
      .array(
        z
          .object({
            userId: UserIdSchema,
            name: z.string().max(200),
            access: z.boolean(),
            inherited: z.boolean(),
            requiresAccountLink: z.boolean().default(false),
          })
          .strict(),
      )
      .max(1000),
  })
  .strict();
export const CodeAccessInputSchema = z
  .object({
    version: z.literal(1),
    expectedRevision: z.number().int().nonnegative(),
    userId: UserIdSchema,
    allow: z.boolean(),
  })
  .strict();
export type CodeRepository = z.infer<typeof CodeRepositorySchema>;
export type CodeCatalog = z.infer<typeof CodeCatalogSchema>;
export type CodeTree = z.infer<typeof CodeTreeSchema>;
export type CodeBlob = z.infer<typeof CodeBlobSchema>;
export type CodeHistory = z.infer<typeof CodeHistorySchema>;
export type CodeAccess = z.infer<typeof CodeAccessSchema>;
export type CodeAccessInput = z.infer<typeof CodeAccessInputSchema>;
export type CodeQuery = z.infer<typeof CodeQuerySchema>;
