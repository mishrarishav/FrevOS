import { describe, expect, it } from "vitest";
import {
  ClientIdSchema,
  ClientSchema,
  ExternalIdentitySchema,
  IdentityIdSchema,
  IdentityIssuerSchema,
  IdentitySubjectSchema,
  ProjectSchema,
  SessionContextSchema,
  SessionSummarySchema,
  SessionIdSchema,
  WorkspaceAuthorizationContextSchema,
  WorkspaceMembershipIdSchema,
  WorkspaceMembershipSchema,
  WorkspaceSchema,
  contractJsonSchemas,
} from "../src/index.js";

const linkedAt = "2026-08-10T08:00:00Z";
const authenticatedAt = "2026-08-10T09:00:00Z";
const expiresAt = "2026-08-10T21:00:00Z";

const session = {
  sessionId: "ses_primary",
  userId: "usr_owner",
  identityId: "idn_primary",
  status: "active",
  authenticatedAt,
  expiresAt,
};

const workspace = {
  workspaceId: "ws_primary",
  displayName: "Frev Labs",
  status: "active",
  createdAt: linkedAt,
};

const membership = {
  membershipId: "wsm_owner",
  workspaceId: "ws_primary",
  userId: "usr_owner",
  status: "active",
  grantedScopes: ["workspace:read", "project:read"],
  createdAt: linkedAt,
};

describe("Phase 4 identifiers", () => {
  it("accepts identity, session, membership, and client identifiers", () => {
    expect(IdentityIdSchema.parse("idn_primary")).toBe("idn_primary");
    expect(SessionIdSchema.parse("ses_primary")).toBe("ses_primary");
    expect(WorkspaceMembershipIdSchema.parse("wsm_owner")).toBe("wsm_owner");
    expect(ClientIdSchema.parse("cli_acme")).toBe("cli_acme");
  });

  it.each(["idn_../other", "session_primary", "wsm_", " cli_acme"])(
    "rejects malformed Phase 4 identifier %s",
    (identifier) => {
      const schemas = [
        IdentityIdSchema,
        SessionIdSchema,
        WorkspaceMembershipIdSchema,
        ClientIdSchema,
      ];
      expect(schemas.some((schema) => schema.safeParse(identifier).success)).toBe(false);
    },
  );
});

describe("identity boundary contracts", () => {
  it("accepts an HTTPS issuer and opaque subject", () => {
    expect(IdentityIssuerSchema.parse("https://identity.example.com/oidc")).toBe(
      "https://identity.example.com/oidc",
    );
    expect(IdentitySubjectSchema.parse("00u-user:opaque-value")).toBe("00u-user:opaque-value");
  });

  it.each([
    "http://identity.example.com",
    "https://user:password@identity.example.com",
    "https://identity.example.com?tenant=primary",
    "https://identity.example.com#issuer",
  ])("rejects unsafe identity issuer %s", (issuer) => {
    expect(IdentityIssuerSchema.safeParse(issuer).success).toBe(false);
  });

  it("rejects control characters in an identity subject", () => {
    expect(IdentitySubjectSchema.safeParse("subject\nvalue").success).toBe(false);
  });

  it("accepts a provider-neutral identity without profile or token fields", () => {
    const identity = {
      identityId: "idn_primary",
      userId: "usr_owner",
      issuer: "https://identity.example.com",
      subject: "opaque-subject-01",
      linkedAt,
      lastAuthenticatedAt: authenticatedAt,
    };

    expect(ExternalIdentitySchema.parse(identity)).toEqual(identity);
    expect(
      ExternalIdentitySchema.safeParse({ ...identity, accessToken: "must-not-cross" }).success,
    ).toBe(false);
  });

  it("rejects an identity authentication before linkage", () => {
    expect(
      ExternalIdentitySchema.safeParse({
        identityId: "idn_primary",
        userId: "usr_owner",
        issuer: "https://identity.example.com",
        subject: "opaque-subject-01",
        linkedAt: authenticatedAt,
        lastAuthenticatedAt: linkedAt,
      }).success,
    ).toBe(false);
  });

  it("requires a session to expire after authentication", () => {
    expect(SessionContextSchema.parse(session)).toEqual(session);
    expect(SessionContextSchema.safeParse({ ...session, expiresAt: authenticatedAt }).success).toBe(
      false,
    );
  });

  it("exposes a strict browser-safe session summary", () => {
    const summary = {
      sessionId: session.sessionId,
      userId: session.userId,
      authenticatedAt: session.authenticatedAt,
      expiresAt: session.expiresAt,
    };
    expect(SessionSummarySchema.parse(summary)).toEqual(summary);
    expect(
      SessionSummarySchema.safeParse({ ...summary, accessToken: "must-not-cross" }).success,
    ).toBe(false);
    expect(
      SessionSummarySchema.safeParse({ ...summary, expiresAt: summary.authenticatedAt }).success,
    ).toBe(false);
  });
});

describe("workspace resource contracts", () => {
  it("accepts workspace, membership, client, and project resources", () => {
    const client = {
      clientId: "cli_acme",
      workspaceId: "ws_primary",
      displayName: "Acme",
      status: "active",
      createdAt: linkedAt,
    };
    const project = {
      projectId: "prj_frevos",
      workspaceId: "ws_primary",
      clientId: "cli_acme",
      displayName: "FrevOS",
      status: "active",
      createdAt: linkedAt,
    };

    expect(WorkspaceSchema.parse(workspace)).toEqual(workspace);
    expect(WorkspaceMembershipSchema.parse(membership)).toEqual(membership);
    expect(ClientSchema.parse(client)).toEqual(client);
    expect(ProjectSchema.parse(project)).toEqual(project);
    expect(
      ProjectSchema.parse({
        projectId: project.projectId,
        workspaceId: project.workspaceId,
        displayName: "Internal project",
        status: project.status,
        createdAt: project.createdAt,
      }),
    ).not.toHaveProperty("clientId");
  });

  it("rejects empty, duplicate, wildcard, and oversized grants", () => {
    expect(WorkspaceMembershipSchema.safeParse({ ...membership, grantedScopes: [] }).success).toBe(
      false,
    );
    expect(
      WorkspaceMembershipSchema.safeParse({
        ...membership,
        grantedScopes: ["project:read", "project:read"],
      }).success,
    ).toBe(false);
    expect(
      WorkspaceMembershipSchema.safeParse({ ...membership, grantedScopes: ["project:*"] }).success,
    ).toBe(false);
    expect(
      WorkspaceMembershipSchema.safeParse({
        ...membership,
        grantedScopes: Array.from({ length: 129 }, (_, index) => `resource:read-${index}`),
      }).success,
    ).toBe(false);
  });

  it("rejects whitespace-normalized names and unknown tenant fields", () => {
    expect(WorkspaceSchema.safeParse({ ...workspace, displayName: " Frev Labs" }).success).toBe(
      false,
    );
    expect(WorkspaceSchema.safeParse({ ...workspace, owner: "usr_owner" }).success).toBe(false);
  });

  it("requires authorization evidence to carry every server-owned dimension", () => {
    const context = {
      session,
      workspace,
      membership,
      requiredScope: "project:read",
      evaluatedAt: "2026-08-10T10:00:00Z",
    };

    expect(WorkspaceAuthorizationContextSchema.parse(context)).toEqual(context);
    expect(
      WorkspaceAuthorizationContextSchema.safeParse({ ...context, workspace: undefined }).success,
    ).toBe(false);
  });
});

describe("Phase 4 JSON Schema exports", () => {
  it.each([
    "client",
    "externalIdentity",
    "project",
    "sessionContext",
    "workspace",
    "workspaceAuthorizationContext",
    "workspaceMembership",
  ] as const)("exports strict %s schema", (name) => {
    expect(contractJsonSchemas[name].additionalProperties).toBe(false);
  });

  it("exports the closed authorization decision union", () => {
    expect(contractJsonSchemas.workspaceAuthorizationDecision.oneOf).toHaveLength(2);
  });
});
