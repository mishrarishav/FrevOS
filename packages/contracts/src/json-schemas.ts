import { z } from "zod";
import { ApprovalGrantSchema } from "./approvals.js";
import { ExternalIdentitySchema, SessionContextSchema } from "./identity.js";
import { ProjectScopeSchema, WorkspaceScopeSchema } from "./permissions.js";
import { WorkspaceAuthorizationDecisionSchema } from "./workspace-authorization.js";
import {
  ClientSchema,
  ProjectSchema,
  WorkspaceAuthorizationContextSchema,
  WorkspaceMembershipSchema,
  WorkspaceSchema,
} from "./workspaces.js";

export const contractJsonSchemas = Object.freeze({
  approvalGrant: z.toJSONSchema(ApprovalGrantSchema, { target: "draft-2020-12" }),
  client: z.toJSONSchema(ClientSchema, { target: "draft-2020-12" }),
  externalIdentity: z.toJSONSchema(ExternalIdentitySchema, { target: "draft-2020-12" }),
  project: z.toJSONSchema(ProjectSchema, { target: "draft-2020-12" }),
  projectScope: z.toJSONSchema(ProjectScopeSchema, { target: "draft-2020-12" }),
  sessionContext: z.toJSONSchema(SessionContextSchema, { target: "draft-2020-12" }),
  workspace: z.toJSONSchema(WorkspaceSchema, { target: "draft-2020-12" }),
  workspaceAuthorizationContext: z.toJSONSchema(WorkspaceAuthorizationContextSchema, {
    target: "draft-2020-12",
  }),
  workspaceAuthorizationDecision: z.toJSONSchema(WorkspaceAuthorizationDecisionSchema, {
    target: "draft-2020-12",
  }),
  workspaceMembership: z.toJSONSchema(WorkspaceMembershipSchema, {
    target: "draft-2020-12",
  }),
  workspaceScope: z.toJSONSchema(WorkspaceScopeSchema, { target: "draft-2020-12" }),
});
