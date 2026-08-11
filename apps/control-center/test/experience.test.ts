import {
  ClientSchema,
  ProjectSchema,
  SessionSummarySchema,
  WorkspaceSchema,
} from "@frevos/contracts";
import { describe, expect, it } from "vitest";
import { ApiFailure, type ControlCenterApi } from "../src/api.js";
import { loadInitialExperience, loadWorkspaceExperience } from "../src/experience.js";

const session = SessionSummarySchema.parse({
  sessionId: "ses_primary",
  userId: "usr_primary",
  authenticatedAt: "2026-08-11T08:00:00.000Z",
  expiresAt: "2026-08-11T20:00:00.000Z",
});
const workspace = WorkspaceSchema.parse({
  workspaceId: "ws_alpha",
  displayName: "Alpha Workspace",
  status: "active",
  createdAt: "2026-08-11T08:00:00.000Z",
});
const otherWorkspace = WorkspaceSchema.parse({
  workspaceId: "ws_beta",
  displayName: "Beta Workspace",
  status: "active",
  createdAt: "2026-08-11T09:00:00.000Z",
});
const client = ClientSchema.parse({
  clientId: "cli_alpha",
  workspaceId: "ws_alpha",
  displayName: "Alpha Client",
  status: "active",
  createdAt: "2026-08-11T08:00:00.000Z",
});
const project = ProjectSchema.parse({
  projectId: "prj_alpha",
  workspaceId: "ws_alpha",
  clientId: "cli_alpha",
  displayName: "Alpha Project",
  status: "active",
  createdAt: "2026-08-11T08:00:00.000Z",
});

function api(overrides: Partial<ControlCenterApi> = {}): ControlCenterApi {
  return {
    getSession: async () => session,
    listWorkspaces: async () => [workspace, otherWorkspace],
    getWorkspaceSnapshot: async (workspaceId) =>
      workspaceId === otherWorkspace.workspaceId
        ? { workspace: otherWorkspace, clients: [], projects: [] }
        : { workspace, clients: [client], projects: [project] },
    ...overrides,
  };
}

describe("Control Center experience lifecycle", () => {
  it("boots into the first server-authorized workspace", async () => {
    await expect(loadInitialExperience(api())).resolves.toEqual({
      kind: "ready",
      session,
      workspaces: [workspace, otherWorkspace],
      workspace,
      clients: [client],
      projects: [project],
    });
  });

  it("represents a valid session with no authorized workspaces honestly", async () => {
    await expect(loadInitialExperience(api({ listWorkspaces: async () => [] }))).resolves.toEqual({
      kind: "empty",
      session,
    });
  });

  it.each([
    [false, new ApiFailure("unauthenticated"), "unauthenticated"],
    [false, new ApiFailure("denied"), "denied"],
    [false, new ApiFailure("unavailable"), "retry"],
    [false, new Error("unexpected"), "retry"],
    [true, new ApiFailure("unauthenticated"), "session-expired"],
    [true, new ApiFailure("denied"), "denied"],
    [true, new ApiFailure("unavailable"), "retry"],
    [true, new ApiFailure("invalid-response"), "retry"],
  ] as const)(
    "maps authenticated=%s failures to %s",
    async (authenticated, error, expectedKind) => {
      const candidate = authenticated
        ? api({ listWorkspaces: async () => Promise.reject(error) })
        : api({ getSession: async () => Promise.reject(error) });
      await expect(loadInitialExperience(candidate)).resolves.toMatchObject({
        kind: expectedKind,
      });
    },
  );

  it("loads an explicitly selected authorized workspace", async () => {
    await expect(
      loadWorkspaceExperience(api(), session, [workspace, otherWorkspace], "ws_beta"),
    ).resolves.toMatchObject({ kind: "ready", workspace: otherWorkspace });
  });

  it("denies a selection that was not returned by workspace discovery", async () => {
    await expect(
      loadWorkspaceExperience(api(), session, [workspace], "ws_unknown"),
    ).resolves.toEqual({ kind: "denied" });
  });

  it("rejects a snapshot whose workspace does not match the selected authority", async () => {
    await expect(
      loadWorkspaceExperience(
        api({
          getWorkspaceSnapshot: async () => ({
            workspace: otherWorkspace,
            clients: [],
            projects: [],
          }),
        }),
        session,
        [workspace],
        workspace.workspaceId,
      ),
    ).resolves.toEqual({ kind: "retry", reason: "invalid-response" });
    await expect(
      loadWorkspaceExperience(
        api({
          getWorkspaceSnapshot: async () => ({
            workspace,
            clients: [{ ...client, workspaceId: otherWorkspace.workspaceId }],
            projects: [],
          }),
        }),
        session,
        [workspace],
        workspace.workspaceId,
      ),
    ).resolves.toEqual({ kind: "retry", reason: "invalid-response" });
  });

  it.each([
    [new ApiFailure("unauthenticated"), "session-expired"],
    [new ApiFailure("denied"), "denied"],
    [new ApiFailure("unavailable"), "retry"],
    [new Error("unexpected"), "retry"],
  ] as const)("fails closed when selected workspace loading fails", async (error, expectedKind) => {
    await expect(
      loadWorkspaceExperience(
        api({ getWorkspaceSnapshot: async () => Promise.reject(error) }),
        session,
        [workspace],
        workspace.workspaceId,
      ),
    ).resolves.toMatchObject({ kind: expectedKind });
  });

  it("preserves cancellation instead of rendering it as an application failure", async () => {
    const controller = new AbortController();
    const cancellation = new Error("cancelled");
    controller.abort();
    await expect(
      loadInitialExperience(
        api({ getSession: async () => Promise.reject(cancellation) }),
        controller.signal,
      ),
    ).rejects.toBe(cancellation);
    await expect(
      loadWorkspaceExperience(
        api({ getWorkspaceSnapshot: async () => Promise.reject(cancellation) }),
        session,
        [workspace],
        workspace.workspaceId,
        controller.signal,
      ),
    ).rejects.toBe(cancellation);
  });
});
