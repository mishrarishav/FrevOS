import {
  type AccountProfile,
  AccountProfileSchema,
  type ActivitySettingsInput,
  ActivitySettingsRecordSchema,
  type Agent,
  type AgentInput,
  type AgentNotification,
  type AgentRun,
  type AgentRunInput,
  AgentRunSchema,
  AgentSchema,
  type AgentWorkspaceState,
  AgentWorkspaceStateSchema,
  authCookiePolicy,
  type BuildResolutionInput,
  type Client,
  ClientSchema,
  type ConnectGithubRepositoryRequest,
  ConnectorListSchema,
  ConnectorRevocationSchema,
  type ContentPreviewInput,
  type ContentPreviewJob,
  ContentPreviewJobSchema,
  type DeliveryPlanInput,
  DeliveryPlanSchema,
  type DeploymentChange,
  type DeploymentConnectionTest,
  DeploymentConnectionTestSchema,
  type DeploymentSettings,
  type DeploymentSettingsInput,
  DeploymentSettingsListSchema,
  DeploymentSettingsSchema,
  type DeveloperConnector,
  DeveloperInviteResultSchema,
  type DiscoveryPolicyInput,
  DiscoveryPolicyRecordSchema,
  type DiscoveryState,
  DiscoveryStateSchema,
  FolderBrowseJobSchema,
  type FolderSelection,
  FolderSelectionSchema,
  type GithubConnection,
  GithubConnectionSchema,
  type GithubDiscoveryOperation,
  GithubDiscoveryOperationSchema,
  type LocalAccount,
  LocalAccountsSchema,
  type LocalDevAction,
  type LocalDevJob,
  LocalDevJobSchema,
  type LocalDevState,
  LocalDevStateSchema,
  type ModelCommitInput,
  type ModelConnection,
  type ModelConnectionInput,
  ModelConnectionSchema,
  type ModelProposal,
  ModelProposalSchema,
  type ModelTestResult,
  ModelTestResultSchema,
  type NotificationApprovalInput,
  type NotificationDraftInput,
  NotificationSchema,
  type NotificationState,
  NotificationStateSchema,
  PasswordChangedSchema,
  type Pipeline,
  type PipelineInput,
  type PipelineRequest,
  type PipelineRun,
  PipelineRunSchema,
  PipelineSchema,
  type PipelineState,
  PipelineStateSchema,
  type Project,
  type ProjectAutomationOperation,
  ProjectAutomationOperationSchema,
  type ProjectAutomationProfile,
  ProjectAutomationProfileSchema,
  type ProjectAutomationRequest,
  type ProjectRepositoryConnection,
  ProjectRepositoryConnectionSchema,
  ProjectSchema,
  type PromotionJob,
  PromotionJobSchema,
  type PromotionState,
  PromotionStateSchema,
  type ServixDeployment,
  ServixDeploymentSchema,
  type ServixDeploymentState,
  ServixDeploymentStateSchema,
  type SessionSummary,
  SessionSummarySchema,
  type SystemEnrollmentPreview,
  SystemEnrollmentPreviewSchema,
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

  constructor(
    kind: ApiFailureKind,
    readonly responseStatus?: number,
  ) {
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
  promotionState?(workspaceId: string, signal?: AbortSignal): Promise<PromotionState>;
  preparePromotion?(workspaceId: string, input: unknown): Promise<PromotionJob>;
  approvePromotion?(workspaceId: string, input: unknown): Promise<PromotionJob>;
  agentState?(workspaceId: string, signal?: AbortSignal): Promise<AgentWorkspaceState>;
  agentNotifications?(workspaceId: string, signal?: AbortSignal): Promise<NotificationState>;
  draftNotification?(
    workspaceId: string,
    input: NotificationDraftInput,
  ): Promise<AgentNotification>;
  approveNotification?(
    workspaceId: string,
    input: NotificationApprovalInput,
  ): Promise<AgentNotification>;
  prepareModel?(workspaceId: string, input: ModelConnectionInput): Promise<ModelProposal>;
  commitModel?(workspaceId: string, input: ModelCommitInput): Promise<ModelConnection>;
  testModel?(workspaceId: string, id: string): Promise<ModelTestResult>;
  saveAgent?(workspaceId: string, input: AgentInput): Promise<Agent>;
  runAgent?(workspaceId: string, input: AgentRunInput): Promise<AgentRun>;
  lookupSystemPairing?(workspaceId: string, code: string): Promise<SystemEnrollmentPreview>;
  decideSystemPairing?(
    workspaceId: string,
    id: string,
    input: { version: 1; digest: string; decision: "approve" | "reject" },
  ): Promise<SystemEnrollmentPreview>;
  discoveryState?(
    workspaceId: string,
    signal?: AbortSignal,
    historyDeviceId?: string,
  ): Promise<DiscoveryState>;
  discoveryPolicy?(workspaceId: string, input: DiscoveryPolicyInput): Promise<unknown>;
  discoveryActivity?(workspaceId: string, input: ActivitySettingsInput): Promise<unknown>;
  requestContent?(workspaceId: string, input: ContentPreviewInput): Promise<ContentPreviewJob>;
  contentPreview?(
    workspaceId: string,
    requestId: string,
    signal?: AbortSignal,
  ): Promise<ContentPreviewJob>;
  browseFolders?(
    workspaceId: string,
    input: import("@frevos/contracts").FolderBrowseInput,
  ): Promise<import("@frevos/contracts").FolderBrowseJob>;
  folderBrowseResult?(
    workspaceId: string,
    requestId: string,
    signal?: AbortSignal,
  ): Promise<import("@frevos/contracts").FolderBrowseJob>;
  deliveryPlan?(workspaceId: string, input: DeliveryPlanInput): Promise<unknown>;
  componentState?(workspaceId: string, signal?: AbortSignal): Promise<PipelineState>;
  testPipeline?(
    workspaceId: string,
    profileId: string,
    deviceId: string,
  ): Promise<DeploymentConnectionTest>;
  revokeExecutor?(workspaceId: string, executorId: string): Promise<{ revoked: true }>;
  savePipeline?(workspaceId: string, input: PipelineInput): Promise<Pipeline>;
  runPipeline?(workspaceId: string, input: PipelineRequest): Promise<PipelineRun>;
  closeInterruptedBuild?(workspaceId: string, input: BuildResolutionInput): Promise<PipelineRun>;
  accountProfile?(signal?: AbortSignal): Promise<AccountProfile>;
  listUsers?(workspaceId: string, signal?: AbortSignal): Promise<LocalAccount[]>;
  changePassword?(
    currentPassword: string,
    newPassword: string,
    target?: { workspaceId: string; userId: string },
  ): Promise<{ changed: true }>;
  logout?(): Promise<void>;
  listDeploymentSettings?(workspaceId: string, signal?: AbortSignal): Promise<DeploymentSettings[]>;
  saveDeploymentSettings?(
    workspaceId: string,
    input: DeploymentSettingsInput,
  ): Promise<DeploymentSettings>;
  testDeploymentSettings?(
    workspaceId: string,
    profileId: string,
    deviceId?: string,
  ): Promise<DeploymentConnectionTest>;
  restoreServix?(
    workspaceId: string,
    requestId: string,
    expectedCurrentRequestId: string,
    restoreRequestId: string,
    operation: "rollback" | "restore",
    changeDetails: DeploymentChange,
  ): Promise<ServixDeployment>;
  getServixDeploymentState?(
    workspaceId: string,
    signal?: AbortSignal,
  ): Promise<ServixDeploymentState>;
  deployServix?(
    workspaceId: string,
    requestId: string,
    changeDetails: DeploymentChange,
    connectorId?: string,
  ): Promise<ServixDeployment>;
  listDeveloperConnectors?(
    workspaceId: string,
    signal?: AbortSignal,
  ): Promise<DeveloperConnector[]>;
  localDevelopmentState?(workspaceId: string, signal?: AbortSignal): Promise<LocalDevState>;
  localDevelopmentAction?(workspaceId: string, input: LocalDevAction): Promise<LocalDevJob>;
  revokeDeveloperConnector?(workspaceId: string, deviceId: string): Promise<{ revoked: true }>;
  chooseConnectorFolder?(
    workspaceId: string,
    deviceId: string,
    selection?: { browseRequestId: string; path: string },
  ): Promise<FolderSelection>;
  inviteDeveloper?(
    workspaceId: string,
    username: string,
    displayName: string,
  ): Promise<{ version: 1; code: string; username: string; expiresAt: string }>;
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
  listGithubConnections(workspaceId: string, signal?: AbortSignal): Promise<GithubConnection[]>;
  createGithubDiscovery(
    workspaceId: string,
    signal?: AbortSignal,
  ): Promise<GithubDiscoveryOperation>;
  getGithubDiscovery(
    workspaceId: string,
    operationId: string,
    signal?: AbortSignal,
  ): Promise<GithubDiscoveryOperation>;
  listProjectRepositoryConnections(
    workspaceId: string,
    signal?: AbortSignal,
  ): Promise<ProjectRepositoryConnection[]>;
  connectGithubRepository(
    workspaceId: string,
    request: ConnectGithubRepositoryRequest,
    signal?: AbortSignal,
  ): Promise<ProjectRepositoryConnection>;
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
  const authCookies = authCookiePolicy(globalThis.location?.protocol ?? "https:");
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
        throw new ApiFailure("unauthenticated", response.status);
      }
      if (response.status === 403 || response.status === 404) {
        throw new ApiFailure("denied", response.status);
      }
      throw new ApiFailure("unavailable", response.status);
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
    const csrfToken = cookieReader(authCookies.csrf);
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
        throw new ApiFailure("unauthenticated", response.status);
      }
      if (response.status === 403 || response.status === 404) {
        throw new ApiFailure("denied", response.status);
      }
      throw new ApiFailure("unavailable", response.status);
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
    promotionState: (ws, signal) =>
      get(`${workspacePath(ws)}/artifact-promotions`, PromotionStateSchema, signal),
    preparePromotion: (ws, input) =>
      post(`${workspacePath(ws)}/artifact-promotions/prepare`, input, PromotionJobSchema),
    approvePromotion: (ws, input) =>
      post(`${workspacePath(ws)}/artifact-promotions/approve`, input, PromotionJobSchema),
    agentNotifications: (ws, signal) =>
      get(`${workspacePath(ws)}/agents/notifications`, NotificationStateSchema, signal),
    draftNotification: (ws, input) =>
      post(`${workspacePath(ws)}/agents/notifications/draft`, input, NotificationSchema),
    approveNotification: (ws, input) =>
      post(`${workspacePath(ws)}/agents/notifications/approve`, input, NotificationSchema),
    agentState: (ws, signal) =>
      get(`${workspacePath(ws)}/agents`, AgentWorkspaceStateSchema, signal),
    prepareModel: (ws, input) =>
      post(`${workspacePath(ws)}/agents/models/prepare`, input, ModelProposalSchema),
    commitModel: (ws, input) =>
      post(`${workspacePath(ws)}/agents/models/commit`, input, ModelConnectionSchema),
    testModel: (ws, id) =>
      post(
        `${workspacePath(ws)}/agents/models/${encodeURIComponent(id)}/test`,
        {},
        ModelTestResultSchema,
      ),
    saveAgent: (ws, input) => post(`${workspacePath(ws)}/agents/configuration`, input, AgentSchema),
    runAgent: (ws, input) => post(`${workspacePath(ws)}/agents/runs`, input, AgentRunSchema),
    localDevelopmentState: (workspaceId, signal) =>
      get(`${workspacePath(workspaceId)}/local-development`, LocalDevStateSchema, signal),
    discoveryState: (workspaceId, signal, historyDeviceId) =>
      get(
        `${workspacePath(workspaceId)}/discovery${historyDeviceId ? `?historyDeviceId=${encodeURIComponent(historyDeviceId)}` : ""}`,
        DiscoveryStateSchema,
        signal,
      ),
    discoveryPolicy: (workspaceId, input) =>
      post(`${workspacePath(workspaceId)}/discovery/policy`, input, DiscoveryPolicyRecordSchema),
    discoveryActivity: (workspaceId, input) =>
      post(
        `${workspacePath(workspaceId)}/discovery/activity-settings`,
        input,
        ActivitySettingsRecordSchema,
      ),
    requestContent: (workspaceId, input) =>
      post(`${workspacePath(workspaceId)}/discovery/content`, input, ContentPreviewJobSchema),
    contentPreview: (workspaceId, id, signal) =>
      get(
        `${workspacePath(workspaceId)}/discovery/content/${encodeURIComponent(id)}`,
        ContentPreviewJobSchema,
        signal,
      ),
    lookupSystemPairing: (workspaceId, code) =>
      post(
        `${workspacePath(workspaceId)}/connectors/enrollments/lookup`,
        { code },
        SystemEnrollmentPreviewSchema,
      ),
    decideSystemPairing: (workspaceId, id, input) =>
      post(
        `${workspacePath(workspaceId)}/connectors/enrollments/${encodeURIComponent(id)}/decision`,
        input,
        SystemEnrollmentPreviewSchema,
      ),
    browseFolders: (workspaceId, input) =>
      post(`${workspacePath(workspaceId)}/discovery/folders`, input, FolderBrowseJobSchema),
    folderBrowseResult: (workspaceId, requestId, signal) =>
      get(
        `${workspacePath(workspaceId)}/discovery/folders/${encodeURIComponent(requestId)}`,
        FolderBrowseJobSchema,
        signal,
      ),
    deliveryPlan: (workspaceId, input) =>
      post(`${workspacePath(workspaceId)}/discovery/plans`, input, DeliveryPlanSchema),
    localDevelopmentAction: (workspaceId, input) =>
      post(`${workspacePath(workspaceId)}/local-development/actions`, input, LocalDevJobSchema),
    revokeExecutor: (workspaceId, executorId) =>
      post(
        `${workspacePath(workspaceId)}/component-deployments/executors/${encodeURIComponent(executorId)}/revoke`,
        {},
        ConnectorRevocationSchema,
      ),
    testPipeline: (workspaceId, profileId, deviceId) =>
      post(
        `${workspacePath(workspaceId)}/component-deployments/${encodeURIComponent(profileId)}/test`,
        { deviceId },
        DeploymentConnectionTestSchema,
      ),
    componentState: (workspaceId, signal) =>
      get(`${workspacePath(workspaceId)}/component-deployments`, PipelineStateSchema, signal),
    savePipeline: (workspaceId, input) =>
      post(
        `${workspacePath(workspaceId)}/component-deployments/configuration`,
        input,
        PipelineSchema,
      ),
    runPipeline: (workspaceId, input) =>
      post(`${workspacePath(workspaceId)}/component-deployments/runs`, input, PipelineRunSchema),
    closeInterruptedBuild: (workspaceId, input) =>
      post(
        `${workspacePath(workspaceId)}/component-deployments/close-interrupted-build`,
        input,
        PipelineRunSchema,
      ),
    accountProfile: (signal) => get("/v1/account", AccountProfileSchema, signal),
    listUsers: (workspaceId, signal) =>
      get(`${workspacePath(workspaceId)}/users`, LocalAccountsSchema, signal),
    changePassword: (currentPassword, newPassword, target) =>
      post(
        target
          ? `${workspacePath(target.workspaceId)}/users/${encodeURIComponent(target.userId)}/password`
          : "/v1/account/password",
        { currentPassword, newPassword },
        PasswordChangedSchema,
      ),
    logout: async () => {
      const csrfToken = cookieReader(authCookies.csrf);
      if (!csrfToken) throw new ApiFailure("denied");
      let response: Response;
      try {
        response = await fetcher(addBasePath("/auth/logout", basePath), {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "x-csrf-token": csrfToken },
        });
      } catch {
        throw new ApiFailure("unavailable");
      }
      if (response.status !== 204)
        throw new ApiFailure(
          response.status === 401 ? "unauthenticated" : "unavailable",
          response.status,
        );
    },
    listDeploymentSettings: (workspaceId, signal) =>
      get(
        `${workspacePath(workspaceId)}/deployment-settings`,
        DeploymentSettingsListSchema,
        signal,
      ),
    saveDeploymentSettings: (workspaceId, input) =>
      post(`${workspacePath(workspaceId)}/deployment-settings`, input, DeploymentSettingsSchema),
    testDeploymentSettings: (workspaceId, profileId, deviceId) =>
      post(
        `${workspacePath(workspaceId)}/deployment-settings/${encodeURIComponent(profileId)}/test`,
        deviceId ? { deviceId } : {},
        DeploymentConnectionTestSchema,
      ),
    getServixDeploymentState: (workspaceId, signal) =>
      get(`${workspacePath(workspaceId)}/servix/deployments`, ServixDeploymentStateSchema, signal),
    listDeveloperConnectors: (workspaceId, signal) =>
      get(`${workspacePath(workspaceId)}/connectors`, ConnectorListSchema, signal),
    chooseConnectorFolder: (workspaceId, deviceId, selection) =>
      post(
        `${workspacePath(workspaceId)}/connectors/${encodeURIComponent(deviceId)}/choose-folder`,
        selection ?? {},
        FolderSelectionSchema,
      ),
    revokeDeveloperConnector: (workspaceId, deviceId) =>
      post(
        `${workspacePath(workspaceId)}/connectors/${encodeURIComponent(deviceId)}/revoke`,
        {},
        ConnectorRevocationSchema,
      ),
    inviteDeveloper: (workspaceId, username, displayName) =>
      post(
        `${workspacePath(workspaceId)}/developers/invite`,
        { version: 1, username, displayName },
        DeveloperInviteResultSchema,
      ),
    deployServix: (workspaceId, requestId, changeDetails, connectorId) =>
      post(
        `${workspacePath(workspaceId)}/servix/deployments`,
        {
          version: 1,
          requestId,
          confirmation: "deploy-servix-development",
          changeDetails,
          ...(connectorId ? { connectorId } : {}),
        },
        ServixDeploymentSchema,
      ),
    restoreServix: (
      workspaceId,
      requestId,
      expectedCurrentRequestId,
      restoreRequestId,
      operation,
      changeDetails,
    ) =>
      post(
        `${workspacePath(workspaceId)}/servix/restores`,
        {
          version: 1,
          requestId,
          expectedCurrentRequestId,
          restoreRequestId,
          operation,
          confirmation: "restore-servix-development",
          changeDetails,
        },
        ServixDeploymentSchema,
      ),
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
    listGithubConnections(workspaceId, signal) {
      return get(
        `${workspacePath(workspaceId)}/github/connections`,
        GithubConnectionSchema.array(),
        signal,
      );
    },
    createGithubDiscovery(workspaceId, signal) {
      return post(
        `${workspacePath(workspaceId)}/github/discovery`,
        {},
        GithubDiscoveryOperationSchema,
        signal,
      );
    },
    getGithubDiscovery(workspaceId, operationId, signal) {
      return get(
        `${workspacePath(workspaceId)}/github/discovery/${encodeURIComponent(operationId)}`,
        GithubDiscoveryOperationSchema,
        signal,
      );
    },
    listProjectRepositoryConnections(workspaceId, signal) {
      return get(
        `${workspacePath(workspaceId)}/repository-connections`,
        ProjectRepositoryConnectionSchema.array(),
        signal,
      );
    },
    connectGithubRepository(workspaceId, request, signal) {
      return post(
        `${workspacePath(workspaceId)}/repository-connections`,
        request,
        ProjectRepositoryConnectionSchema,
        signal,
      );
    },
  };
}

function workspacePath(workspaceId: string): string {
  return `/v1/workspaces/${encodeURIComponent(workspaceId)}`;
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
