import type { Client, Project, SessionSummary, Workspace } from "@frevos/contracts";
import { ApiFailure, type ControlCenterApi } from "./api.js";

export type ExperienceState =
  | { readonly kind: "loading" }
  | { readonly kind: "unauthenticated" }
  | { readonly kind: "session-expired" }
  | { readonly kind: "empty"; readonly session: SessionSummary }
  | { readonly kind: "denied" }
  | { readonly kind: "retry"; readonly reason: "unavailable" | "invalid-response" }
  | {
      readonly kind: "ready";
      readonly session: SessionSummary;
      readonly workspaces: Workspace[];
      readonly workspace: Workspace;
      readonly clients: Client[];
      readonly projects: Project[];
    };

export async function loadInitialExperience(
  api: ControlCenterApi,
  signal?: AbortSignal,
): Promise<ExperienceState> {
  let session: SessionSummary;
  try {
    session = await api.getSession(signal);
  } catch (error) {
    return failureState(error, false, signal);
  }

  let workspaces: Workspace[];
  try {
    workspaces = await api.listWorkspaces(signal);
  } catch (error) {
    return failureState(error, true, signal);
  }
  const workspace = workspaces[0];
  if (workspace === undefined) {
    return { kind: "empty", session };
  }
  return loadWorkspaceExperience(api, session, workspaces, workspace.workspaceId, signal);
}

export async function loadWorkspaceExperience(
  api: ControlCenterApi,
  session: SessionSummary,
  workspaces: Workspace[],
  workspaceId: string,
  signal?: AbortSignal,
): Promise<ExperienceState> {
  const selectedWorkspace = workspaces.find((candidate) => candidate.workspaceId === workspaceId);
  if (selectedWorkspace === undefined) {
    return { kind: "denied" };
  }
  try {
    const snapshot = await api.getWorkspaceSnapshot(selectedWorkspace.workspaceId, signal);
    const containsCrossWorkspaceResource = [...snapshot.clients, ...snapshot.projects].some(
      (resource) => resource.workspaceId !== selectedWorkspace.workspaceId,
    );
    if (
      snapshot.workspace.workspaceId !== selectedWorkspace.workspaceId ||
      containsCrossWorkspaceResource
    ) {
      return { kind: "retry", reason: "invalid-response" };
    }
    return {
      kind: "ready",
      session,
      workspaces,
      workspace: snapshot.workspace,
      clients: snapshot.clients,
      projects: snapshot.projects,
    };
  } catch (error) {
    return failureState(error, true, signal);
  }
}

function failureState(
  error: unknown,
  authenticated: boolean,
  signal?: AbortSignal,
): ExperienceState {
  if (signal?.aborted === true) {
    throw error;
  }
  if (!(error instanceof ApiFailure)) {
    return { kind: "retry", reason: "invalid-response" };
  }
  if (error.kind === "unauthenticated") {
    return { kind: authenticated ? "session-expired" : "unauthenticated" };
  }
  if (error.kind === "denied") {
    return { kind: "denied" };
  }
  return { kind: "retry", reason: error.kind };
}
