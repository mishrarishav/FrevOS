import { z } from "zod";
import { ProjectIdSchema, WorkspaceIdSchema } from "./identifiers.js";

export const RiskLevelSchema = z.enum(["low", "medium", "high", "critical"]);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const PermissionScopeSchema = z
  .string()
  .min(3)
  .max(127)
  .regex(
    /^[a-z][a-z0-9-]{0,62}:[a-z][a-z0-9-]{0,62}$/,
    "Permission scope must use resource:action syntax",
  )
  .brand<"PermissionScope">();
export type PermissionScope = z.infer<typeof PermissionScopeSchema>;

export const WorkspaceScopeSchema = z
  .object({
    workspaceId: WorkspaceIdSchema,
  })
  .strict();
export type WorkspaceScope = z.infer<typeof WorkspaceScopeSchema>;

export const ProjectScopeSchema = z
  .object({
    workspaceId: WorkspaceIdSchema,
    projectId: ProjectIdSchema,
  })
  .strict();
export type ProjectScope = z.infer<typeof ProjectScopeSchema>;
