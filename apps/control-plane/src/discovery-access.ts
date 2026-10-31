import { lstat, readFile } from "node:fs/promises";
import {
  type Workspace,
  type WorkspaceMembership,
  UserIdSchema,
  WorkspaceIdSchema,
} from "@frevos/contracts";
import { z } from "zod";
import { ServixDeploymentError } from "./servix-deployment.js";

export const DiscoveryAccessPolicySchema = z
  .object({
    version: z.literal(1),
    workspaceId: WorkspaceIdSchema,
    administrators: z.array(UserIdSchema).max(100),
    deviceLoginMethod: z.enum(["loopback-fetch", "connector-page"]).default("loopback-fetch"),
  })
  .strict();

export function requireDeviceLoginOrigin(
  origin: string,
  method: "loopback-fetch" | "connector-page" = "loopback-fetch",
) {
  const url = new URL(origin);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    (method !== "connector-page" &&
      url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)))
  )
    throw new ServixDeploymentError("paired-login-requires-trusted-https", 503);
}

export function isDiscoveryAdministrator(
  policy: z.infer<typeof DiscoveryAccessPolicySchema>,
  actor: string,
  evidence: {
    workspace: Workspace;
    membership: WorkspaceMembership | null;
  } | null,
) {
  const member = evidence?.membership;
  return (
    evidence?.workspace.workspaceId === policy.workspaceId &&
    evidence.workspace.status === "active" &&
    member?.workspaceId === policy.workspaceId &&
    member.status === "active" &&
    member.userId === actor &&
    member.grantedScopes.some((scope) => scope === "project:read") &&
    (policy.administrators.some((user) => user === actor) ||
      member.grantedScopes.some((scope) => scope === "discovery:admin"))
  );
}

// This operator-owned policy preserves existing administrator access. A browser
// role label or connector-reported owner never grants workspace-wide visibility.
export async function loadDiscoveryAccessPolicy(file: string) {
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 32_768)
    throw new ServixDeploymentError("discovery-access-policy-unavailable", 503);
  return DiscoveryAccessPolicySchema.parse(JSON.parse(await readFile(file, "utf8")));
}
