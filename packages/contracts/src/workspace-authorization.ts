import { z } from "zod";
import { UserIdSchema, WorkspaceIdSchema } from "./identifiers.js";
import { PermissionScopeSchema } from "./permissions.js";
import { WorkspaceAuthorizationContextSchema } from "./workspaces.js";

export const WorkspaceAuthorizationDenialReasonSchema = z.enum([
  "invalid-context",
  "session-inactive",
  "session-not-yet-valid",
  "session-expired",
  "workspace-inactive",
  "membership-not-found",
  "principal-mismatch",
  "workspace-mismatch",
  "membership-inactive",
  "scope-missing",
]);
export type WorkspaceAuthorizationDenialReason = z.infer<
  typeof WorkspaceAuthorizationDenialReasonSchema
>;

export const WorkspaceAuthorizationDecisionSchema = z.discriminatedUnion("allowed", [
  z
    .object({
      allowed: z.literal(true),
      actorId: UserIdSchema,
      workspaceId: WorkspaceIdSchema,
      scope: PermissionScopeSchema,
    })
    .strict(),
  z
    .object({
      allowed: z.literal(false),
      reason: WorkspaceAuthorizationDenialReasonSchema,
    })
    .strict(),
]);
export type WorkspaceAuthorizationDecision = z.infer<typeof WorkspaceAuthorizationDecisionSchema>;

export function authorizeWorkspaceAction(input: unknown): WorkspaceAuthorizationDecision {
  const parsed = WorkspaceAuthorizationContextSchema.safeParse(input);

  if (!parsed.success) {
    return { allowed: false, reason: "invalid-context" };
  }

  const { evaluatedAt, membership, requiredScope, session, workspace } = parsed.data;

  if (session.status !== "active") {
    return { allowed: false, reason: "session-inactive" };
  }

  if (Date.parse(evaluatedAt) < Date.parse(session.authenticatedAt)) {
    return { allowed: false, reason: "session-not-yet-valid" };
  }

  if (Date.parse(evaluatedAt) >= Date.parse(session.expiresAt)) {
    return { allowed: false, reason: "session-expired" };
  }

  if (workspace.status !== "active") {
    return { allowed: false, reason: "workspace-inactive" };
  }

  if (membership === null) {
    return { allowed: false, reason: "membership-not-found" };
  }

  if (membership.userId !== session.userId) {
    return { allowed: false, reason: "principal-mismatch" };
  }

  if (membership.workspaceId !== workspace.workspaceId) {
    return { allowed: false, reason: "workspace-mismatch" };
  }

  if (membership.status !== "active") {
    return { allowed: false, reason: "membership-inactive" };
  }

  if (!membership.grantedScopes.includes(requiredScope)) {
    return { allowed: false, reason: "scope-missing" };
  }

  return {
    allowed: true,
    actorId: session.userId,
    workspaceId: workspace.workspaceId,
    scope: requiredScope,
  };
}
