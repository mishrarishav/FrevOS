import {
  type AgentOperationCompletion,
  AgentOperationCompletionSchema,
  OperationIdSchema,
  ProjectAutomationActionSchema,
  type ProjectAutomationOperation,
  ProjectAutomationOperationSchema,
  type ProjectAutomationProfile,
  ProjectAutomationProfileSchema,
  type ProjectAutomationRequest,
  ProjectAutomationRequestSchema,
  ProjectIdSchema,
  ServiceIdentityIdSchema,
  UserIdSchema,
  WorkspaceIdSchema,
} from "@frevos/contracts";
import type { QueryResultRow } from "pg";
import { randomIdentifier } from "./crypto.js";
import { type DatabasePool, withApplicationTransaction } from "./database.js";

export const TRACKGRN_WORKSPACE_ID = "ws_uat_demo";
export const TRACKGRN_PROJECT_ID = "prj_uat_trackgrn";
export const TRACKGRN_AGENT_ID = "svc_trackgrn_windows_agent";

interface AutomationProfileRow extends QueryResultRow {
  workspace_id: string;
  project_id: string;
  provider: string;
  provider_repository_id: string;
  repository_owner: string;
  repository_name: string;
  repository_url: string;
  default_branch: string;
  agent_id: string;
  environment: string;
  public_origin: string;
  api_base_path: string;
  health_path: string;
  swagger_path: string;
  allowed_actions: string[];
}

interface AutomationOperationRow extends QueryResultRow {
  operation_id: string;
  workspace_id: string;
  project_id: string;
  agent_id: string;
  requested_by: string;
  action: string;
  status: string;
  input: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error_code: string | null;
  created_at: Date;
  claimed_at: Date | null;
  completed_at: Date | null;
}

export interface ProjectAutomationStore {
  getProfile(workspaceId: string, projectId: string): Promise<ProjectAutomationProfile | null>;
  createOperation(input: {
    workspaceId: string;
    projectId: string;
    requestedBy: string;
    request: ProjectAutomationRequest;
    now: Date;
  }): Promise<ProjectAutomationOperation | null>;
  listOperations(workspaceId: string, projectId: string): Promise<ProjectAutomationOperation[]>;
  getOperation(
    workspaceId: string,
    projectId: string,
    operationId: string,
  ): Promise<ProjectAutomationOperation | null>;
  claimNext(agentId: string, now: Date): Promise<ProjectAutomationOperation | null>;
  complete(
    agentId: string,
    operationId: string,
    completion: AgentOperationCompletion,
    now: Date,
  ): Promise<ProjectAutomationOperation | null>;
}

export class ProjectAutomationRepository implements ProjectAutomationStore {
  readonly #pool: DatabasePool;

  constructor(pool: DatabasePool) {
    this.#pool = pool;
  }

  async getProfile(
    workspaceId: string,
    projectId: string,
  ): Promise<ProjectAutomationProfile | null> {
    const parsedWorkspaceId = WorkspaceIdSchema.parse(workspaceId);
    const parsedProjectId = ProjectIdSchema.parse(projectId);
    return withApplicationTransaction(this.#pool, parsedWorkspaceId, async (client) => {
      const result = await client.query<AutomationProfileRow>(
        `
          SELECT
            workspace_id,
            project_id,
            provider,
            provider_repository_id,
            repository_owner,
            repository_name,
            repository_url,
            default_branch,
            agent_id,
            environment,
            public_origin,
            api_base_path,
            health_path,
            swagger_path,
            allowed_actions
          FROM frevos.project_automation_profiles
          WHERE workspace_id = $1 AND project_id = $2
        `,
        [parsedWorkspaceId, parsedProjectId],
      );
      const row = result.rows[0];
      return row === undefined ? null : profileFromRow(row);
    });
  }

  async createOperation(input: {
    workspaceId: string;
    projectId: string;
    requestedBy: string;
    request: ProjectAutomationRequest;
    now: Date;
  }): Promise<ProjectAutomationOperation | null> {
    const workspaceId = WorkspaceIdSchema.parse(input.workspaceId);
    const projectId = ProjectIdSchema.parse(input.projectId);
    const requestedBy = UserIdSchema.parse(input.requestedBy);
    const request = ProjectAutomationRequestSchema.parse(input.request);
    return withApplicationTransaction(this.#pool, workspaceId, async (client) => {
      const profile = await client.query<AutomationProfileRow>(
        `
          SELECT agent_id, allowed_actions
          FROM frevos.project_automation_profiles
          WHERE workspace_id = $1 AND project_id = $2
        `,
        [workspaceId, projectId],
      );
      const profileRow = profile.rows[0];
      if (profileRow === undefined || !profileRow.allowed_actions.includes(request.action)) {
        return null;
      }
      const result = await client.query<AutomationOperationRow>(
        `
          INSERT INTO frevos.project_automation_operations (
            operation_id,
            workspace_id,
            project_id,
            agent_id,
            requested_by,
            action,
            status,
            input,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, 'queued', $7, $8)
          RETURNING *
        `,
        [
          randomIdentifier("op"),
          workspaceId,
          projectId,
          profileRow.agent_id,
          requestedBy,
          request.action,
          request.input,
          input.now,
        ],
      );
      return operationFromRow(requiredRow(result.rows[0], "Automation operation insert"));
    });
  }

  async listOperations(
    workspaceId: string,
    projectId: string,
  ): Promise<ProjectAutomationOperation[]> {
    const parsedWorkspaceId = WorkspaceIdSchema.parse(workspaceId);
    const parsedProjectId = ProjectIdSchema.parse(projectId);
    return withApplicationTransaction(this.#pool, parsedWorkspaceId, async (client) => {
      const result = await client.query<AutomationOperationRow>(
        `
          SELECT *
          FROM frevos.project_automation_operations
          WHERE workspace_id = $1 AND project_id = $2
          ORDER BY created_at DESC, operation_id DESC
          LIMIT 50
        `,
        [parsedWorkspaceId, parsedProjectId],
      );
      return result.rows.map(operationFromRow);
    });
  }

  async getOperation(
    workspaceId: string,
    projectId: string,
    operationId: string,
  ): Promise<ProjectAutomationOperation | null> {
    const parsedWorkspaceId = WorkspaceIdSchema.parse(workspaceId);
    const parsedProjectId = ProjectIdSchema.parse(projectId);
    const parsedOperationId = OperationIdSchema.parse(operationId);
    return withApplicationTransaction(this.#pool, parsedWorkspaceId, async (client) => {
      const result = await client.query<AutomationOperationRow>(
        `
          SELECT *
          FROM frevos.project_automation_operations
          WHERE workspace_id = $1 AND project_id = $2 AND operation_id = $3
        `,
        [parsedWorkspaceId, parsedProjectId, parsedOperationId],
      );
      const row = result.rows[0];
      return row === undefined ? null : operationFromRow(row);
    });
  }

  async claimNext(agentId: string, now: Date): Promise<ProjectAutomationOperation | null> {
    const parsedAgentId = ServiceIdentityIdSchema.parse(agentId);
    return withApplicationTransaction(this.#pool, TRACKGRN_WORKSPACE_ID, async (client) => {
      const result = await client.query<AutomationOperationRow>(
        `
          WITH candidate AS (
            SELECT operation_id
            FROM frevos.project_automation_operations
            WHERE workspace_id = $1
              AND project_id = $2
              AND agent_id = $3
              AND status = 'queued'
            ORDER BY created_at, operation_id
            FOR UPDATE SKIP LOCKED
            LIMIT 1
          )
          UPDATE frevos.project_automation_operations AS operation
          SET status = 'claimed', claimed_at = $4
          FROM candidate
          WHERE operation.operation_id = candidate.operation_id
          RETURNING operation.*
        `,
        [TRACKGRN_WORKSPACE_ID, TRACKGRN_PROJECT_ID, parsedAgentId, now],
      );
      const row = result.rows[0];
      return row === undefined ? null : operationFromRow(row);
    });
  }

  async complete(
    agentId: string,
    operationId: string,
    completion: AgentOperationCompletion,
    now: Date,
  ): Promise<ProjectAutomationOperation | null> {
    const parsedAgentId = ServiceIdentityIdSchema.parse(agentId);
    const parsedOperationId = OperationIdSchema.parse(operationId);
    const parsedCompletion = AgentOperationCompletionSchema.parse(completion);
    return withApplicationTransaction(this.#pool, TRACKGRN_WORKSPACE_ID, async (client) => {
      const result = await client.query<AutomationOperationRow>(
        `
          UPDATE frevos.project_automation_operations
          SET status = $4, result = $5, error_code = $6, completed_at = $7
          WHERE workspace_id = $1
            AND project_id = $2
            AND operation_id = $3
            AND agent_id = $8
            AND status = 'claimed'
          RETURNING *
        `,
        [
          TRACKGRN_WORKSPACE_ID,
          TRACKGRN_PROJECT_ID,
          parsedOperationId,
          parsedCompletion.status,
          parsedCompletion.result,
          parsedCompletion.errorCode ?? null,
          now,
          parsedAgentId,
        ],
      );
      const row = result.rows[0];
      return row === undefined ? null : operationFromRow(row);
    });
  }
}

function profileFromRow(row: AutomationProfileRow): ProjectAutomationProfile {
  return ProjectAutomationProfileSchema.parse({
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    repository: {
      provider: row.provider,
      providerRepositoryId: row.provider_repository_id,
      owner: row.repository_owner,
      name: row.repository_name,
      url: row.repository_url,
      defaultBranch: row.default_branch,
    },
    agentId: row.agent_id,
    environment: row.environment,
    application: {
      publicOrigin: row.public_origin,
      apiBasePath: row.api_base_path,
      healthPath: row.health_path,
      swaggerPath: row.swagger_path,
    },
    allowedActions: row.allowed_actions.map((action) =>
      ProjectAutomationActionSchema.parse(action),
    ),
  });
}

function operationFromRow(row: AutomationOperationRow): ProjectAutomationOperation {
  return ProjectAutomationOperationSchema.parse({
    operationId: row.operation_id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    agentId: row.agent_id,
    requestedBy: row.requested_by,
    action: row.action,
    status: row.status,
    input: row.input,
    result: row.result,
    errorCode: row.error_code,
    createdAt: row.created_at.toISOString(),
    claimedAt: row.claimed_at?.toISOString() ?? null,
    completedAt: row.completed_at?.toISOString() ?? null,
  });
}

function requiredRow<Row>(row: Row | undefined, operation: string): Row {
  if (row === undefined) {
    throw new Error(`${operation} did not return a row`);
  }
  return row;
}
