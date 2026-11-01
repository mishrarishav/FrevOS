import { z } from "zod";
import { UserIdSchema, WorkspaceIdSchema } from "./identifiers.js";
import { ConnectorIdSchema } from "./developer-connectors.js";
import {
  HostedRepositoryIdSchema,
  SafeGitBranchSchema,
  GitObjectIdSchema,
} from "./repository-center.js";
export const GitFolderIdSchema = z.string().regex(/^gfolder_[a-f0-9]{32}$/);
export const GitFolderPickerIdSchema = z.string().regex(/^gpick_[a-f0-9]{32}$/);
export const GitFolderPickInputSchema = z
  .object({
    version: z.literal(1),
    requestId: GitFolderPickerIdSchema,
    deviceId: ConnectorIdSchema,
  })
  .strict();
export const GitFolderPickResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("selected"),
      root: z.string().min(1).max(500),
      path: z.string().min(1).max(500),
    })
    .strict(),
  z.object({ status: z.literal("cancelled") }).strict(),
  z
    .object({
      status: z.literal("failed"),
      errorCode: z.string().regex(/^git-desktop-[a-z-]{1,70}$/),
    })
    .strict(),
]);
export const GitFolderPickerSchema = z
  .object({
    version: z.literal(1),
    requestId: GitFolderPickerIdSchema,
    deviceId: ConnectorIdSchema,
    actor: UserIdSchema,
    workspaceId: WorkspaceIdSchema,
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    status: z.enum(["queued", "claimed", "selected", "cancelled", "failed"]),
    result: GitFolderPickResultSchema.optional(),
  })
  .strict();
export type GitFolderPicker = z.infer<typeof GitFolderPickerSchema>;
export const GitDesktopJobIdSchema = z.string().regex(/^gjob_[a-f0-9]{32}$/);
export const GitRelativeFileSchema = z
  .string()
  .min(1)
  .max(500)
  .refine(
    (s) =>
      !s.startsWith("/") &&
      !s.startsWith("\\") &&
      !s.includes("\\") &&
      !s.includes(":") &&
      ![...s].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) &&
      s.split("/").every((p) => p !== ".." && p !== "." && p !== ""),
  );
export const GitDesktopSnapshotSchema = z
  .object({
    folderId: GitFolderIdSchema,
    root: z.string().min(1).max(500),
    gitReady: z.boolean(),
    initialized: z.boolean(),
    branch: SafeGitBranchSchema.nullable(),
    head: GitObjectIdSchema.nullable(),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    files: z
      .array(
        z
          .object({
            path: GitRelativeFileSchema,
            status: z.string().min(1).max(2),
            protected: z.boolean(),
            previousPath: GitRelativeFileSchema.optional(),
          })
          .strict(),
      )
      .max(2000),
    truncated: z.boolean(),
  })
  .strict();
export type GitDesktopSnapshot = z.infer<typeof GitDesktopSnapshotSchema>;
export const GitFolderBindingSchema = z
  .object({
    version: z.literal(1),
    id: GitFolderIdSchema,
    workspaceId: WorkspaceIdSchema,
    userId: UserIdSchema,
    deviceId: ConnectorIdSchema,
    root: z.string().min(1).max(500),
    repositoryId: HostedRepositoryIdSchema.nullable(),
    bootstrapSeed: GitObjectIdSchema.optional(),
    branch: SafeGitBranchSchema,
    createdAt: z.iso.datetime(),
  })
  .strict();
export type GitFolderBinding = z.infer<typeof GitFolderBindingSchema>;
export const GitFolderSelectSchema = z
  .object({
    version: z.literal(1),
    deviceId: ConnectorIdSchema,
    browseRequestId: z.string().regex(/^(?:fb|gpick)_[a-f0-9]{32}$/),
    root: z.string().min(1).max(500),
    path: z.string().max(500),
    branch: SafeGitBranchSchema.optional(),
    repositoryId: HostedRepositoryIdSchema.optional(),
  })
  .strict();
export const GitDesktopActionSchema = z
  .object({
    version: z.literal(1),
    folderId: GitFolderIdSchema,
    action: z.enum([
      "status",
      "commit-push",
      "push",
      "pull",
      "clone",
      "switch-branch",
      "reconcile",
    ]),
    expectedFingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    branch: SafeGitBranchSchema.optional(),
    message: z.string().trim().min(1).max(500).optional(),
    files: z.array(GitRelativeFileSchema).min(1).max(2000).optional(),
  })
  .strict();
export const GitFolderConnectSchema = z
  .object({
    version: z.literal(1),
    folderId: GitFolderIdSchema,
    repositoryId: HostedRepositoryIdSchema,
    creationRequestId: z
      .string()
      .regex(/^git_[a-f0-9]{32}$/)
      .optional(),
    expectedFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const GitDesktopJobSchema = z
  .object({
    version: z.literal(1),
    id: GitDesktopJobIdSchema,
    workspaceId: WorkspaceIdSchema,
    actor: UserIdSchema,
    deviceId: ConnectorIdSchema,
    binding: GitFolderBindingSchema,
    action: z.enum(["select", "status", "commit-push", "push", "pull", "clone", "switch-branch"]),
    expectedFingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    branch: SafeGitBranchSchema,
    message: z.string().max(500).optional(),
    files: z.array(GitRelativeFileSchema).max(2000).optional(),
    defaultBranch: SafeGitBranchSchema,
    sourceHead: GitObjectIdSchema.optional(),
    remoteHead: GitObjectIdSchema.optional(),
    observedFingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    status: z.enum(["queued", "claimed", "succeeded", "failed", "needs-reconciliation"]),
    snapshot: GitDesktopSnapshotSchema.optional(),
    errorCode: z
      .string()
      .regex(/^[a-z][a-z0-9-]{1,80}$/)
      .optional(),
  })
  .strict();
export type GitDesktopJob = z.infer<typeof GitDesktopJobSchema>;
export const GitDesktopStateSchema = z
  .object({
    devices: z
      .array(
        z
          .object({
            deviceId: ConnectorIdSchema,
            name: z.string().max(100),
            online: z.boolean(),
            gitReady: z.boolean(),
            capable: z.boolean(),
            nativePicker: z.boolean().optional(),
          })
          .strict(),
      )
      .max(1000),
    folders: z
      .array(GitFolderBindingSchema.extend({ snapshot: GitDesktopSnapshotSchema.optional() }))
      .max(1000),
    jobs: z.array(GitDesktopJobSchema).max(100),
  })
  .strict();
export type GitDesktopState = z.infer<typeof GitDesktopStateSchema>;
