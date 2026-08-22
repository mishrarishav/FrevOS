import {
  type Client,
  ClientSchema,
  type Project,
  type ProjectAutomationOperation,
  ProjectAutomationOperationSchema,
  type ProjectAutomationProfile,
  ProjectAutomationProfileSchema,
  type ProjectAutomationRequest,
  ProjectSchema,
  type SessionSummary,
  SessionSummarySchema,
  type Workspace,
  WorkspaceSchema,
} from "@frevos/contracts";
import { addBasePath } from "./routing.js";

export type ApiFailureKind =
  | "unauthenticated"
  | "invalid-credentials"
  | "denied"
  | "unavailable"
  | "invalid-response";

export class ApiFailure extends Error {
  readonly kind: ApiFailureKind;

  constructor(kind: ApiFailureKind) {
    super(kind);
    this.name = "ApiFailure";
    this.kind = kind;
  }
}

export interface WorkspaceSnapshot {
  readonly workspace: Workspace;
  readonly clients: Client[];
  readonly projects: Project[];
}

export interface ControlCenterApi {
  login(username: string, password: string, signal?: AbortSignal): Promise<void>;
  getSession(signal?: AbortSignal): Promise<SessionSummary>;
  listWorkspaces(signal?: AbortSignal): Promise<Workspace[]>;
  getWorkspaceSnapshot(workspaceId: string, signal?: AbortSignal): Promise<WorkspaceSnapshot>;
  getProjectAutomation(
    workspaceId: string,
    projectId: string,
    signal?: AbortSignal,
  ): Promise<ProjectAutomationProfile>;
  listProjectAutomationOperations(
    workspaceId: string,
    projectId: string,
    signal?: AbortSignal,
  ): Promise<ProjectAutomationOperation[]>;
  createProjectAutomationOperation(
    workspaceId: string,
    projectId: string,
    request: ProjectAutomationRequest,
    signal?: AbortSignal,
  ): Promise<ProjectAutomationOperation>;
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type RuntimeSchema<Output> = {
  safeParse(input: unknown): { success: true; data: Output } | { success: false };
};

export function createControlCenterApi(
  fetcher: Fetcher = globalThis.fetch,
  basePath?: string,
  cookieReader: (name: string) => string | undefined = readBrowserCookie,
): ControlCenterApi {
  const get = async <Output>(
    path: string,
    schema: RuntimeSchema<Output>,
    signal?: AbortSignal,
  ): Promise<Output> => {
    let response: Response;
    try {
      response = await fetcher(addBasePath(path, basePath), {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { accept: "application/json" },
        ...(signal === undefined ? {} : { signal }),
      });
    } catch (error) {
      if (signal?.aborted === true) {
        throw error;
      }
      throw new ApiFailure("unavailable");
    }

    if (!response.ok) {
      if (response.status === 401) {
        throw new ApiFailure("unauthenticated");
      }
      if (response.status === 403 || response.status === 404) {
        throw new ApiFailure("denied");
      }
      throw new ApiFailure("unavailable");
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ApiFailure("invalid-response");
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new ApiFailure("invalid-response");
    }
    return parsed.data;
  };

  const post = async <Output>(
    path: string,
    body: unknown,
    schema: RuntimeSchema<Output>,
    signal?: AbortSignal,
  ): Promise<Output> => {
    const csrfToken = cookieReader("__Host-frevos-csrf");
    if (csrfToken === undefined) {
      throw new ApiFailure("denied");
    }
    let response: Response;
    try {
      response = await fetcher(addBasePath(path, basePath), {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify(body),
        ...(signal === undefined ? {} : { signal }),
      });
    } catch (error) {
      if (signal?.aborted === true) {
        throw error;
      }
      throw new ApiFailure("unavailable");
    }
    if (!response.ok) {
      if (response.status === 401) {
        throw new ApiFailure("unauthenticated");
      }
      if (response.status === 403 || response.status === 404) {
        throw new ApiFailure("denied");
      }
      throw new ApiFailure("unavailable");
    }
    let responseBody: unknown;
    try {
      responseBody = await response.json();
    } catch {
      throw new ApiFailure("invalid-response");
    }
    const parsed = schema.safeParse(responseBody);
    if (!parsed.success) {
      throw new ApiFailure("invalid-response");
    }
    return parsed.data;
  };

  return {
    async login(username, password, signal) {
      let response: Response;
      try {
        response = await fetcher(addBasePath("/auth/login", basePath), {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ username, password }),
          ...(signal === undefined ? {} : { signal }),
        });
      } catch (error) {
        if (signal?.aborted === true) {
          throw error;
        }
        throw new ApiFailure("unavailable");
      }
      if (response.status === 401) {
        throw new ApiFailure("invalid-credentials");
      }
      if (!response.ok) {
        throw new ApiFailure(response.status === 403 ? "denied" : "unavailable");
      }
    },
    getSession: (signal) => get("/v1/session", SessionSummarySchema, signal),
    listWorkspaces: (signal) => get("/v1/workspaces", WorkspaceSchema.array(), signal),
    async getWorkspaceSnapshot(workspaceId, signal) {
      const workspacePath = `/v1/workspaces/${encodeURIComponent(workspaceId)}`;
      const [workspace, clients, projects] = await Promise.all([
        get(workspacePath, WorkspaceSchema, signal),
        get(`${workspacePath}/clients`, ClientSchema.array(), signal),
        get(`${workspacePath}/projects`, ProjectSchema.array(), signal),
      ]);
      return { workspace, clients, projects };
    },
    getProjectAutomation(workspaceId, projectId, signal) {
      const path = automationPath(workspaceId, projectId);
      return get(path, ProjectAutomationProfileSchema, signal);
    },
    listProjectAutomationOperations(workspaceId, projectId, signal) {
      const path = `${automationPath(workspaceId, projectId)}/operations`;
      return get(path, ProjectAutomationOperationSchema.array(), signal);
    },
    createProjectAutomationOperation(workspaceId, projectId, request, signal) {
      const path = `${automationPath(workspaceId, projectId)}/operations`;
      return post(path, request, ProjectAutomationOperationSchema, signal);
    },
  };
}

function automationPath(workspaceId: string, projectId: string): string {
  return `/v1/workspaces/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(projectId)}/automation`;
}

function readBrowserCookie(name: string): string | undefined {
  if (typeof document === "undefined") {
    return undefined;
  }
  const prefix = `${encodeURIComponent(name)}=`;
  const item = document.cookie.split("; ").find((candidate) => candidate.startsWith(prefix));
  return item === undefined ? undefined : decodeURIComponent(item.slice(prefix.length));
}
