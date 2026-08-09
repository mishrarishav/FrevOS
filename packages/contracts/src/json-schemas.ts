import { z } from "zod";
import { ApprovalGrantSchema } from "./approvals.js";
import { ProjectScopeSchema, WorkspaceScopeSchema } from "./permissions.js";

export const contractJsonSchemas = Object.freeze({
  approvalGrant: z.toJSONSchema(ApprovalGrantSchema, { target: "draft-2020-12" }),
  projectScope: z.toJSONSchema(ProjectScopeSchema, { target: "draft-2020-12" }),
  workspaceScope: z.toJSONSchema(WorkspaceScopeSchema, { target: "draft-2020-12" }),
});
