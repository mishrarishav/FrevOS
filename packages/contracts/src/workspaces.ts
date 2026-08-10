import { z } from "zod";
import { IsoTimestampSchema, SessionContextSchema } from "./identity.js";
import {
  ClientIdSchema,
  ProjectIdSchema,
  UserIdSchema,
  WorkspaceIdSchema,
  WorkspaceMembershipIdSchema,
} from "./identifiers.js";
import { PermissionScopeSchema } from "./permissions.js";

const DisplayNameSchema = z
  .string()
  .min(1)
  .max(120)
  .refine((value) => value === value.trim(), "Display name must not have outer whitespace");

export const WorkspaceStatusSchema = z.enum(["active", "suspended"]);
export type WorkspaceStatus = z.infer<typeof WorkspaceStatusSchema>;

export const WorkspaceSchema = z
  .object({
    workspaceId: WorkspaceIdSchema,
    displayName: DisplayNameSchema,
    status: WorkspaceStatusSchema,
    createdAt: IsoTimestampSchema,
  })
  .strict();
export type Workspace = z.infer<typeof WorkspaceSchema>;

export const WorkspaceMembershipStatusSchema = z.enum(["active", "suspended", "revoked"]);
export type WorkspaceMembershipStatus = z.infer<typeof WorkspaceMembershipStatusSchema>;

export const GrantedPermissionScopesSchema = z
  .array(PermissionScopeSchema)
  .min(1)
  .max(128)
  .superRefine((scopes, context) => {
    if (new Set<string>(scopes).size !== scopes.length) {
      context.addIssue({
        code: "custom",
        message: "Granted permission scopes must be unique",
      });
    }
  });
export type GrantedPermissionScopes = z.infer<typeof GrantedPermissionScopesSchema>;

export const WorkspaceMembershipSchema = z
  .object({
    membershipId: WorkspaceMembershipIdSchema,
    workspaceId: WorkspaceIdSchema,
    userId: UserIdSchema,
    status: WorkspaceMembershipStatusSchema,
    grantedScopes: GrantedPermissionScopesSchema,
    createdAt: IsoTimestampSchema,
  })
  .strict();
export type WorkspaceMembership = z.infer<typeof WorkspaceMembershipSchema>;

export const ClientStatusSchema = z.enum(["active", "archived"]);
export type ClientStatus = z.infer<typeof ClientStatusSchema>;

export const ClientSchema = z
  .object({
    clientId: ClientIdSchema,
    workspaceId: WorkspaceIdSchema,
    displayName: DisplayNameSchema,
    status: ClientStatusSchema,
    createdAt: IsoTimestampSchema,
  })
  .strict();
export type Client = z.infer<typeof ClientSchema>;

export const ProjectStatusSchema = z.enum(["active", "archived"]);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export const ProjectSchema = z
  .object({
    projectId: ProjectIdSchema,
    workspaceId: WorkspaceIdSchema,
    clientId: ClientIdSchema.optional(),
    displayName: DisplayNameSchema,
    status: ProjectStatusSchema,
    createdAt: IsoTimestampSchema,
  })
  .strict();
export type Project = z.infer<typeof ProjectSchema>;

export const WorkspaceAuthorizationContextSchema = z
  .object({
    session: SessionContextSchema,
    workspace: WorkspaceSchema,
    membership: WorkspaceMembershipSchema.nullable(),
    requiredScope: PermissionScopeSchema,
    evaluatedAt: IsoTimestampSchema,
  })
  .strict();
export type WorkspaceAuthorizationContext = z.infer<typeof WorkspaceAuthorizationContextSchema>;
