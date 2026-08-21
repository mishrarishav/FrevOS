import {
  type Client,
  ClientSchema,
  type Project,
  ProjectSchema,
  type SessionSummary,
  SessionSummarySchema,
  type Workspace,
  WorkspaceSchema,
} from "@frevos/contracts";
import { addBasePath } from "./routing.js";

export type ApiFailureKind = "unauthenticated" | "denied" | "unavailable" | "invalid-response";

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
  getSession(signal?: AbortSignal): Promise<SessionSummary>;
  listWorkspaces(signal?: AbortSignal): Promise<Workspace[]>;
  getWorkspaceSnapshot(workspaceId: string, signal?: AbortSignal): Promise<WorkspaceSnapshot>;
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type RuntimeSchema<Output> = {
  safeParse(input: unknown): { success: true; data: Output } | { success: false };
};

export function createControlCenterApi(
  fetcher: Fetcher = globalThis.fetch,
  basePath?: string,
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

  return {
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
  };
}
