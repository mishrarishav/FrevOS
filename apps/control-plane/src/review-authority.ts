import { UserIdSchema, WorkspaceIdSchema } from "@frevos/contracts";
import type { WorkspaceEvidence, WorkspaceRepository } from "./repositories.js";

// A register grant cannot make an inactive/foreign workspace member active.
// General project-write access does not grant register administration.
export function reviewAuthority(
  workspaces: Pick<WorkspaceRepository, "getEvidence">,
  administrators: Record<string, string[]>,
  legacyAdministrator: (
    workspace: string,
    actor: string,
    evidence: WorkspaceEvidence | null,
  ) => boolean = () => false,
) {
  return async (workspaceId: string, userId: string) => {
    WorkspaceIdSchema.parse(workspaceId);
    UserIdSchema.parse(userId);
    const evidence = await workspaces.getEvidence(workspaceId, userId);
    const member = evidence?.membership;
    const active =
      evidence?.workspace.workspaceId === workspaceId &&
      evidence.workspace.status === "active" &&
      member?.workspaceId === workspaceId &&
      member.userId === userId &&
      member.status === "active" &&
      member.grantedScopes.some((scope) => scope === "project:read");
    return {
      active,
      administrator:
        active &&
        (member.grantedScopes.some((scope) => scope === "reviews:admin") ||
          administrators[workspaceId]?.includes(userId) === true ||
          legacyAdministrator(workspaceId, userId, evidence)),
    };
  };
}
