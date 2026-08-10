import { describe, expect, it } from "vitest";
import { WorkspaceAuthorizationDecisionSchema, authorizeWorkspaceAction } from "../src/index.js";

const baseContext = {
  session: {
    sessionId: "ses_primary",
    userId: "usr_owner",
    identityId: "idn_primary",
    status: "active",
    authenticatedAt: "2026-08-10T09:00:00Z",
    expiresAt: "2026-08-10T21:00:00Z",
  },
  workspace: {
    workspaceId: "ws_primary",
    displayName: "Frev Labs",
    status: "active",
    createdAt: "2026-08-10T08:00:00Z",
  },
  membership: {
    membershipId: "wsm_owner",
    workspaceId: "ws_primary",
    userId: "usr_owner",
    status: "active",
    grantedScopes: ["workspace:read", "project:read"],
    createdAt: "2026-08-10T08:00:00Z",
  },
  requiredScope: "project:read",
  evaluatedAt: "2026-08-10T10:00:00Z",
};

describe("workspace authorization", () => {
  it("allows an exact active session, workspace, membership, and scope", () => {
    const decision = authorizeWorkspaceAction(baseContext);

    expect(decision).toEqual({
      allowed: true,
      actorId: "usr_owner",
      workspaceId: "ws_primary",
      scope: "project:read",
    });
    expect(WorkspaceAuthorizationDecisionSchema.parse(decision)).toEqual(decision);
  });

  it("fails closed for malformed context without echoing input", () => {
    const decision = authorizeWorkspaceAction({
      ...baseContext,
      requiredScope: "secret/value",
    });

    expect(decision).toEqual({ allowed: false, reason: "invalid-context" });
    expect(JSON.stringify(decision)).not.toContain("secret/value");
  });

  it("denies a revoked session", () => {
    expect(
      authorizeWorkspaceAction({
        ...baseContext,
        session: { ...baseContext.session, status: "revoked" },
      }),
    ).toEqual({ allowed: false, reason: "session-inactive" });
  });

  it("denies evaluation before the session authentication instant", () => {
    expect(
      authorizeWorkspaceAction({
        ...baseContext,
        evaluatedAt: "2026-08-10T08:59:59Z",
      }),
    ).toEqual({ allowed: false, reason: "session-not-yet-valid" });
  });

  it("denies evaluation at or after the session expiration instant", () => {
    expect(
      authorizeWorkspaceAction({
        ...baseContext,
        evaluatedAt: baseContext.session.expiresAt,
      }),
    ).toEqual({ allowed: false, reason: "session-expired" });
  });

  it("denies a suspended workspace", () => {
    expect(
      authorizeWorkspaceAction({
        ...baseContext,
        workspace: { ...baseContext.workspace, status: "suspended" },
      }),
    ).toEqual({ allowed: false, reason: "workspace-inactive" });
  });

  it("denies a missing membership", () => {
    expect(authorizeWorkspaceAction({ ...baseContext, membership: null })).toEqual({
      allowed: false,
      reason: "membership-not-found",
    });
  });

  it("denies membership belonging to a different user", () => {
    expect(
      authorizeWorkspaceAction({
        ...baseContext,
        membership: { ...baseContext.membership, userId: "usr_other" },
      }),
    ).toEqual({ allowed: false, reason: "principal-mismatch" });
  });

  it("denies membership belonging to a different workspace", () => {
    expect(
      authorizeWorkspaceAction({
        ...baseContext,
        membership: { ...baseContext.membership, workspaceId: "ws_other" },
      }),
    ).toEqual({ allowed: false, reason: "workspace-mismatch" });
  });

  it.each(["suspended", "revoked"])("denies %s membership", (status) => {
    expect(
      authorizeWorkspaceAction({
        ...baseContext,
        membership: { ...baseContext.membership, status },
      }),
    ).toEqual({ allowed: false, reason: "membership-inactive" });
  });

  it("denies a valid but ungranted exact scope", () => {
    expect(authorizeWorkspaceAction({ ...baseContext, requiredScope: "project:write" })).toEqual({
      allowed: false,
      reason: "scope-missing",
    });
  });

  it("keeps authorization decisions closed to unknown fields", () => {
    expect(
      WorkspaceAuthorizationDecisionSchema.safeParse({
        allowed: false,
        reason: "scope-missing",
        debug: baseContext,
      }).success,
    ).toBe(false);
  });
});
