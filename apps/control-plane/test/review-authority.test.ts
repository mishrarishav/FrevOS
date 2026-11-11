import { WorkspaceMembershipSchema, WorkspaceSchema } from "@frevos/contracts";
import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { DiscoveryAccessPolicySchema, isDiscoveryAdministrator } from "../src/discovery-access.js";
import type { WorkspaceEvidence } from "../src/repositories.js";
import { reviewAuthority } from "../src/review-authority.js";

const workspace = "ws_reviews";
const actor = "usr_reviewer";
function evidence(
  options: {
    workspaceId?: string;
    workspaceStatus?: "active" | "suspended";
    membershipWorkspaceId?: string;
    userId?: string;
    membershipStatus?: "active" | "suspended" | "revoked";
    scopes?: string[];
    noMembership?: boolean;
  } = {},
): WorkspaceEvidence {
  const at = "2026-11-10T12:00:00.000Z";
  return {
    workspace: WorkspaceSchema.parse({
      workspaceId: options.workspaceId ?? workspace,
      displayName: "Review workspace",
      status: options.workspaceStatus ?? "active",
      createdAt: at,
    }),
    membership: options.noMembership
      ? null
      : WorkspaceMembershipSchema.parse({
          membershipId: "wsm_reviews",
          workspaceId: options.membershipWorkspaceId ?? workspace,
          userId: options.userId ?? actor,
          status: options.membershipStatus ?? "active",
          grantedScopes: options.scopes ?? ["project:read"],
          createdAt: at,
        }),
  };
}

describe("Reviews authority", () => {
  it("requires explicit Reviews authority rather than general project write access", async () => {
    let value = evidence({ scopes: ["project:read", "project:write"] });
    const getEvidence = vi.fn(async () => value);
    const authority = reviewAuthority({ getEvidence }, {});
    expect(await authority(workspace, actor)).toEqual({ active: true, administrator: false });
    expect(getEvidence).toHaveBeenCalledWith(workspace, actor);

    value = evidence({ scopes: ["project:read", "reviews:admin"] });
    expect(await authority(workspace, actor)).toEqual({ active: true, administrator: true });
    value = evidence({ scopes: ["reviews:admin"] });
    expect(await authority(workspace, actor)).toEqual({ active: false, administrator: false });
  });

  it("binds an operator administrator map to the exact workspace and active user", async () => {
    const getEvidence = vi.fn(async () => evidence());
    const configured = reviewAuthority({ getEvidence }, { [workspace]: [actor] });
    expect(await configured(workspace, actor)).toEqual({ active: true, administrator: true });
    expect(
      await reviewAuthority({ getEvidence }, { ws_elsewhere: [actor] })(workspace, actor),
    ).toEqual({ active: true, administrator: false });
    expect(
      await reviewAuthority({ getEvidence }, { [workspace]: ["usr_someone_else"] })(
        workspace,
        actor,
      ),
    ).toEqual({ active: true, administrator: false });
  });

  it("accepts scoped, verified Discovery compatibility without treating its role labels as authority", async () => {
    const policy = DiscoveryAccessPolicySchema.parse({
      version: 1,
      workspaceId: workspace,
      administrators: [actor],
    });
    let value = evidence();
    const getEvidence = vi.fn(async () => value);
    const legacy = vi.fn(
      (ws: string, user: string, current: WorkspaceEvidence | null) =>
        ws === policy.workspaceId && isDiscoveryAdministrator(policy, user, current),
    );
    const authority = reviewAuthority({ getEvidence }, {}, legacy);
    expect(await authority(workspace, actor)).toEqual({ active: true, administrator: true });
    expect(legacy).toHaveBeenCalledWith(workspace, actor, value);
    value = evidence({ workspaceId: "ws_elsewhere", membershipWorkspaceId: "ws_elsewhere" });
    expect(await authority("ws_elsewhere", actor)).toEqual({ active: true, administrator: false });

    const explicitPolicy = DiscoveryAccessPolicySchema.parse({
      version: 1,
      workspaceId: workspace,
      administrators: [],
    });
    value = evidence({ scopes: ["project:read", "discovery:admin"] });
    const verified = reviewAuthority(
      { getEvidence },
      {},
      (ws, user, current) =>
        ws === explicitPolicy.workspaceId &&
        isDiscoveryAdministrator(explicitPolicy, user, current),
    );
    expect(await verified(workspace, actor)).toEqual({ active: true, administrator: true });
  });

  it.each([
    ["missing evidence", null],
    ["suspended workspace", evidence({ workspaceStatus: "suspended" })],
    ["missing membership", evidence({ noMembership: true })],
    ["suspended membership", evidence({ membershipStatus: "suspended" })],
    ["revoked membership", evidence({ membershipStatus: "revoked" })],
    ["foreign workspace evidence", evidence({ workspaceId: "ws_foreign" })],
    ["foreign membership", evidence({ membershipWorkspaceId: "ws_foreign" })],
    ["different membership user", evidence({ userId: "usr_foreign" })],
    ["missing required read scope", evidence({ scopes: ["project:write", "reviews:admin"] })],
  ] as const)(
    "denies %s even with a configured or permissive legacy administrator",
    async (_name, current) => {
      const legacy = vi.fn(() => true),
        getEvidence = vi.fn(async () => current);
      const authority = reviewAuthority({ getEvidence }, { [workspace]: [actor] }, legacy);
      expect(await authority(workspace, actor)).toEqual({ active: false, administrator: false });
      expect(legacy).not.toHaveBeenCalled();
    },
  );

  it("rechecks current membership and rejects malformed identifiers before repository access", async () => {
    let value: WorkspaceEvidence | null = evidence({ scopes: ["project:read", "reviews:admin"] });
    const getEvidence = vi.fn(async () => value),
      authority = reviewAuthority({ getEvidence }, {});
    expect((await authority(workspace, actor)).administrator).toBe(true);
    value = null;
    expect(await authority(workspace, actor)).toEqual({ active: false, administrator: false });
    getEvidence.mockClear();
    await expect(authority("../../other", actor)).rejects.toThrow();
    await expect(authority(workspace, "not-a-user")).rejects.toThrow();
    expect(getEvidence).not.toHaveBeenCalled();
  });
});

describe("Reviews operator configuration", () => {
  const environment: NodeJS.ProcessEnv = {
    DATABASE_URL: "postgresql://runtime.invalid/reviews",
    FREVOS_PUBLIC_ORIGIN: "https://review.example.invalid",
    FREVOS_AUTH_MODE: "local",
  };
  it("defaults to no extra administrators and accepts a configurable storage root and workspace map", () => {
    const defaults = loadConfig(environment);
    expect(defaults.reviewAdministrators).toEqual({});
    expect(defaults.reviewsRoot).toBeUndefined();
    const configured = loadConfig({
      ...environment,
      DEVSETU_REVIEWS_ROOT: "D:/Configured/review-data",
      DEVSETU_REVIEWS_ADMINISTRATORS: JSON.stringify({
        ws_reviews: [actor],
        ws_other: ["usr_other"],
      }),
    });
    expect(configured.reviewsRoot).toBe("D:/Configured/review-data");
    expect(configured.reviewAdministrators).toEqual({
      ws_reviews: [actor],
      ws_other: ["usr_other"],
    });
    expect(
      loadConfig({ ...environment, DEVSETU_REVIEWS_ROOT: "  D:/Configured/review data  " })
        .reviewsRoot,
    ).toBe("D:/Configured/review data");
  });
  it.each([
    "not JSON",
    "null",
    "[]",
    '"ws_reviews"',
    JSON.stringify({ wrong_workspace: [actor] }),
    JSON.stringify({ ws_reviews: ["wrong_user"] }),
    JSON.stringify({ ws_reviews: actor }),
    JSON.stringify({ ws_reviews: Array.from({ length: 101 }, (_, n) => `usr_user${n}`) }),
    "x".repeat(32769),
  ])("rejects a malformed or oversized administrator map", (value) => {
    expect(() => loadConfig({ ...environment, DEVSETU_REVIEWS_ADMINISTRATORS: value })).toThrow();
  });
  it.each([
    "",
    "   ",
    "\t ",
    "x".repeat(501),
    "data/\u0000reviews",
    "data/\nreviews",
    "data/\u007freviews",
  ])("rejects a storage root outside its configured bounds", (value) => {
    expect(() => loadConfig({ ...environment, DEVSETU_REVIEWS_ROOT: value })).toThrow();
  });
});
