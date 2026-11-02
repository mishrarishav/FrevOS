import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkspaceSchema, WorkspaceMembershipSchema } from "@frevos/contracts";
import { expect, it } from "vitest";
import {
  DiscoveryAccessPolicySchema,
  isDiscoveryAdministrator,
  loadDiscoveryAccessPolicy,
  requireDeviceLoginOrigin,
} from "../src/discovery-access.js";

it("requires HTTPS before the configured paired-login policy can activate on a remote server", () => {
  expect(() => requireDeviceLoginOrigin("http://10.9.69.20", "connector-page")).not.toThrow();
  expect(() => requireDeviceLoginOrigin("file:///tmp/login", "connector-page")).toThrow();
  for (const origin of [
    "https://devsetu.fixture",
    "https://10.9.69.20:8443",
    "http://127.0.0.1:43177",
    "http://localhost:43177",
    "http://[::1]:43177",
  ])
    expect(() => requireDeviceLoginOrigin(origin)).not.toThrow();
  for (const origin of [
    "http://10.9.69.20",
    "http://localhost.foreign.invalid",
    "file:///tmp/login",
  ])
    expect(() => requireDeviceLoginOrigin(origin)).toThrow("paired-login-requires-trusted-https");
});

it("uses explicit server configuration or stored membership grants, never a fixed account name or claimed client role", async () => {
  const policy = DiscoveryAccessPolicySchema.parse({
    version: 1,
    workspaceId: "ws_fixture",
    administrators: ["usr_ops"],
  });
  const workspace = WorkspaceSchema.parse({
    workspaceId: "ws_fixture",
    displayName: "Fixture",
    status: "active",
    createdAt: "2026-10-28T00:00:00Z",
  });
  const membership = WorkspaceMembershipSchema.parse({
    membershipId: "wsm_fixture",
    workspaceId: "ws_fixture",
    userId: "usr_ops",
    status: "active",
    grantedScopes: ["project:read", "project:write"],
    createdAt: workspace.createdAt,
  });
  const evidence = { workspace, membership };
  expect(isDiscoveryAdministrator(policy, "usr_ops", evidence)).toBe(true);
  expect(isDiscoveryAdministrator(policy, "usr_ops", null)).toBe(false);
  expect(isDiscoveryAdministrator(policy, "usr_ops", { workspace, membership: null })).toBe(false);
  expect(
    isDiscoveryAdministrator(policy, "usr_ops", {
      ...evidence,
      workspace: { ...workspace, status: "suspended" },
    }),
  ).toBe(false);
  expect(
    isDiscoveryAdministrator(policy, "usr_ops", {
      ...evidence,
      membership: { ...membership, status: "revoked" },
    }),
  ).toBe(false);
  expect(isDiscoveryAdministrator(policy, "usr_other", evidence)).toBe(false);
  expect(
    isDiscoveryAdministrator(policy, "usr_ops", {
      ...evidence,
      membership: WorkspaceMembershipSchema.parse({ ...membership, workspaceId: "ws_other" }),
    }),
  ).toBe(false);
  expect(
    isDiscoveryAdministrator(policy, "usr_ops", {
      ...evidence,
      workspace: WorkspaceSchema.parse({ ...workspace, workspaceId: "ws_other" }),
    }),
  ).toBe(false);
  expect(
    isDiscoveryAdministrator(policy, "usr_ops", {
      ...evidence,
      membership: WorkspaceMembershipSchema.parse({
        ...membership,
        grantedScopes: ["project:write"],
      }),
    }),
  ).toBe(false);
  const owner = WorkspaceMembershipSchema.parse({ ...membership, userId: "usr_windows_admin" });
  expect(isDiscoveryAdministrator(policy, owner.userId, { workspace, membership: owner })).toBe(
    false,
  );
  expect(
    isDiscoveryAdministrator(policy, owner.userId, {
      workspace,
      membership: WorkspaceMembershipSchema.parse({
        ...owner,
        grantedScopes: ["project:read", "discovery:admin"],
      }),
    }),
  ).toBe(true);
  expect(DiscoveryAccessPolicySchema.safeParse({ ...policy, role: "admin" }).success).toBe(false);
});

it("requires a bounded, plain operator-owned policy file and rejects malformed or linked configuration", async () => {
  const root = await mkdtemp(join(tmpdir(), "discovery-access-"));
  try {
    const file = join(root, "policy.json"),
      policy = { version: 1, workspaceId: "ws_fixture", administrators: ["usr_ops"] };
    await writeFile(file, JSON.stringify(policy));
    expect(await loadDiscoveryAccessPolicy(file)).toEqual({
      ...policy,
      deviceLoginMethod: "loopback-fetch",
    });
    await expect(loadDiscoveryAccessPolicy(root)).rejects.toThrow(
      "discovery-access-policy-unavailable",
    );
    await expect(loadDiscoveryAccessPolicy(join(root, "missing.json"))).rejects.toThrow();
    await writeFile(file, " ".repeat(32769));
    await expect(loadDiscoveryAccessPolicy(file)).rejects.toThrow(
      "discovery-access-policy-unavailable",
    );
    await writeFile(file, '{"version":2}');
    await expect(loadDiscoveryAccessPolicy(file)).rejects.toThrow();
    const linked = join(root, "linked");
    await symlink(root, linked, process.platform === "win32" ? "junction" : "dir");
    await expect(loadDiscoveryAccessPolicy(linked)).rejects.toThrow(
      "discovery-access-policy-unavailable",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
