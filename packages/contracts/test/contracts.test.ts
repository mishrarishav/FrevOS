import { describe, expect, it } from "vitest";
import {
  ActorIdSchema,
  ApprovalGrantSchema,
  PermissionScopeSchema,
  ProjectScopeSchema,
  RiskLevelSchema,
  WorkspaceIdSchema,
  WorkspaceScopeSchema,
  contractJsonSchemas,
  validateContract,
} from "../src/index.js";

const digest = `sha256:${"a".repeat(64)}`;

const validApproval = {
  approvalId: "apr_01JTESTAPPROVAL",
  policyVersion: 1,
  approvedBy: "usr_owner",
  actorId: "svc_deployer",
  workspaceId: "ws_primary",
  projectId: "prj_frevos",
  action: "deployment:execute",
  target: {
    resourceType: "deployment-target",
    resourceId: "uat_windows_01",
  },
  riskLevel: "critical",
  correlationId: "cor_task_01",
  artifact: {
    artifactId: "art_release_01",
    digest,
  },
  payloadDigest: digest,
  issuedAt: "2026-08-09T20:00:00Z",
  expiresAt: "2026-08-09T20:15:00Z",
};

describe("identifier contracts", () => {
  it("accepts valid typed identifiers", () => {
    expect(WorkspaceIdSchema.parse("ws_primary")).toBe("ws_primary");
    expect(ActorIdSchema.parse("usr_owner")).toBe("usr_owner");
    expect(ActorIdSchema.parse("svc_worker_01")).toBe("svc_worker_01");
  });

  it.each(["ws_../other", " ws_primary", "ws_primary ", "workspace", "ws_"])(
    "rejects unsafe workspace identifier %s",
    (identifier) => {
      expect(WorkspaceIdSchema.safeParse(identifier).success).toBe(false);
    },
  );
});

describe("workspace and permission contracts", () => {
  it("requires explicit workspace and project scope", () => {
    expect(
      ProjectScopeSchema.parse({ workspaceId: "ws_primary", projectId: "prj_frevos" }),
    ).toEqual({ workspaceId: "ws_primary", projectId: "prj_frevos" });
    expect(ProjectScopeSchema.safeParse({ projectId: "prj_frevos" }).success).toBe(false);
  });

  it("rejects unknown scope fields instead of silently discarding them", () => {
    const result = WorkspaceScopeSchema.safeParse({
      workspaceId: "ws_primary",
      projectId: "prj_cross_scope",
    });
    expect(result.success).toBe(false);
  });

  it.each(["repository:read", "deployment:request", "project-memory:write"])(
    "accepts normalized permission scope %s",
    (scope) => {
      expect(PermissionScopeSchema.safeParse(scope).success).toBe(true);
    },
  );

  it.each(["Repository:read", "repository.read", "repository:*", "read"])(
    "rejects invalid permission scope %s",
    (scope) => {
      expect(PermissionScopeSchema.safeParse(scope).success).toBe(false);
    },
  );

  it("uses a closed risk-level vocabulary", () => {
    expect(RiskLevelSchema.options).toEqual(["low", "medium", "high", "critical"]);
    expect(RiskLevelSchema.safeParse("unknown").success).toBe(false);
  });
});

describe("approval contract", () => {
  it("accepts a fully bound approval grant", () => {
    expect(ApprovalGrantSchema.parse(validApproval)).toEqual(validApproval);
  });

  it("rejects expired-at-issuance and unknown fields", () => {
    const invalidTime = {
      ...validApproval,
      expiresAt: validApproval.issuedAt,
    };
    expect(ApprovalGrantSchema.safeParse(invalidTime).success).toBe(false);

    const unknownField = {
      ...validApproval,
      reusable: true,
    };
    expect(ApprovalGrantSchema.safeParse(unknownField).success).toBe(false);
  });

  it("rejects unbound or malformed protected actions", () => {
    expect(
      ApprovalGrantSchema.safeParse({ ...validApproval, correlationId: undefined }).success,
    ).toBe(false);
    expect(
      ApprovalGrantSchema.safeParse({ ...validApproval, payloadDigest: "sha256:not-a-digest" })
        .success,
    ).toBe(false);
  });
});

describe("safe validation results", () => {
  it("returns typed data on success", () => {
    const result = validateContract(WorkspaceScopeSchema, { workspaceId: "ws_primary" });
    expect(result).toEqual({ success: true, data: { workspaceId: "ws_primary" } });
  });

  it("returns normalized issues without echoing the input", () => {
    const secretLikeInput = { workspaceId: "secret/value" };
    const result = validateContract(WorkspaceScopeSchema, secretLikeInput);
    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.issues[0]?.path).toBe("workspaceId");
      expect(JSON.stringify(result)).not.toContain("secret/value");
    }
  });
});

describe("JSON Schema interoperability", () => {
  it("exports strict workspace and project schemas", () => {
    expect(contractJsonSchemas.workspaceScope.additionalProperties).toBe(false);
    expect(contractJsonSchemas.workspaceScope.required).toContain("workspaceId");
    expect(contractJsonSchemas.projectScope.additionalProperties).toBe(false);
    expect(contractJsonSchemas.projectScope.required).toEqual(["workspaceId", "projectId"]);
  });

  it("exports the approval binding as a strict object", () => {
    expect(contractJsonSchemas.approvalGrant.additionalProperties).toBe(false);
    expect(contractJsonSchemas.approvalGrant.required).toContain("correlationId");
    expect(contractJsonSchemas.approvalGrant.required).toContain("expiresAt");
  });
});
