import { z } from "zod";

const identifierSuffix = "[A-Za-z0-9][A-Za-z0-9_-]{0,119}";

function identifierSchema<const Brand extends string>(prefix: string, brand: Brand) {
  return z
    .string()
    .min(prefix.length + 2)
    .max(128)
    .regex(new RegExp(`^${prefix}_${identifierSuffix}$`), `${brand} has an invalid format`)
    .brand<Brand>();
}

export const UserIdSchema = identifierSchema("usr", "UserId");
export type UserId = z.infer<typeof UserIdSchema>;

export const ServiceIdentityIdSchema = identifierSchema("svc", "ServiceIdentityId");
export type ServiceIdentityId = z.infer<typeof ServiceIdentityIdSchema>;

export const IdentityIdSchema = identifierSchema("idn", "IdentityId");
export type IdentityId = z.infer<typeof IdentityIdSchema>;

export const SessionIdSchema = identifierSchema("ses", "SessionId");
export type SessionId = z.infer<typeof SessionIdSchema>;

export const WorkspaceIdSchema = identifierSchema("ws", "WorkspaceId");
export type WorkspaceId = z.infer<typeof WorkspaceIdSchema>;

export const WorkspaceMembershipIdSchema = identifierSchema("wsm", "WorkspaceMembershipId");
export type WorkspaceMembershipId = z.infer<typeof WorkspaceMembershipIdSchema>;

export const ClientIdSchema = identifierSchema("cli", "ClientId");
export type ClientId = z.infer<typeof ClientIdSchema>;

export const ProjectIdSchema = identifierSchema("prj", "ProjectId");
export type ProjectId = z.infer<typeof ProjectIdSchema>;

export const ApprovalIdSchema = identifierSchema("apr", "ApprovalId");
export type ApprovalId = z.infer<typeof ApprovalIdSchema>;

export const ArtifactIdSchema = identifierSchema("art", "ArtifactId");
export type ArtifactId = z.infer<typeof ArtifactIdSchema>;

export const CorrelationIdSchema = identifierSchema("cor", "CorrelationId");
export type CorrelationId = z.infer<typeof CorrelationIdSchema>;

export const ActorIdSchema = z.union([UserIdSchema, ServiceIdentityIdSchema]);
export type ActorId = z.infer<typeof ActorIdSchema>;

export const OpaqueResourceIdSchema = z
  .string()
  .min(3)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, "Resource ID has an invalid format")
  .brand<"OpaqueResourceId">();
export type OpaqueResourceId = z.infer<typeof OpaqueResourceIdSchema>;
