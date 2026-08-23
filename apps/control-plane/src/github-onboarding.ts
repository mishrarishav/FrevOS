import {
  type ConnectGithubRepositoryRequest,
  ConnectGithubRepositoryRequestSchema,
  type GithubConnection,
  GithubConnectionSchema,
  type GithubDiscoveryCompletion,
  GithubDiscoveryCompletionSchema,
  type GithubDiscoveryOperation,
  GithubDiscoveryOperationSchema,
  GithubDiscoveryResultSchema,
  OperationIdSchema,
  type ProjectRepositoryConnection,
  ProjectRepositoryConnectionSchema,
  ServiceIdentityIdSchema,
  UserIdSchema,
  WorkspaceIdSchema,
} from "@frevos/contracts";
import type { QueryResultRow } from "pg";
import { randomIdentifier } from "./crypto.js";
import { type DatabasePool, withApplicationTransaction } from "./database.js";

export const WINDOWS_GITHUB_AGENT_ID = "svc_trackgrn_windows_agent";
export const PERSONAL_AGENT_WORKSPACE_ID = "ws_uat_demo";

interface GithubConnectionRow extends QueryResultRow {
  connection_id: string;
  workspace_id: string;
  provider: string;
  provider_account_id: string;
  account_login: string;
  agent_id: string;
  status: string;
  repositories: unknown;
  verified_at: Date;
  created_at: Date;
}

interface GithubDiscoveryOperationRow extends QueryResultRow {
  operation_id: string;
  workspace_id: string;
  agent_id: string;
  requested_by: string;
  action: string;
  status: string;
  result: Record<string, unknown> | null;
  error_code: string | null;
  created_at: Date;
  claimed_at: Date | null;
  completed_at: Date | null;
}

interface ProjectRepositoryConnectionRow extends QueryResultRow {
  workspace_id: string;
  project_id: string;
  connection_id: string;
  repository: unknown;
  status: string;
  created_at: Date;
}

export interface GithubOnboardingStore {
  createDiscoveryOperation(input: {
    workspaceId: string;
    requestedBy: string;
    now: Date;
  }): Promise<GithubDiscoveryOperation>;
  getDiscoveryOperation(
    workspaceId: string,
    operationId: string,
  ): Promise<GithubDiscoveryOperation | null>;
  claimNextDiscovery(
    workspaceId: string,
    agentId: string,
    now: Date,
  ): Promise<GithubDiscoveryOperation | null>;
  completeDiscovery(input: {
    workspaceId: string;
    agentId: string;
    operationId: string;
    completion: GithubDiscoveryCompletion;
    now: Date;
  }): Promise<GithubDiscoveryOperation | null>;
  listConnections(workspaceId: string): Promise<GithubConnection[]>;
  connectRepository(input: {
    workspaceId: string;
    request: ConnectGithubRepositoryRequest;
    now: Date;
  }): Promise<ProjectRepositoryConnection | null>;
  listProjectConnections(workspaceId: string): Promise<ProjectRepositoryConnection[]>;
}

export class GithubOnboardingRepository implements GithubOnboardingStore {
  readonly #pool: DatabasePool;

  constructor(pool: DatabasePool) {
    this.#pool = pool;
  }

  async createDiscoveryOperation(input: {
    workspaceId: string;
    requestedBy: string;
    now: Date;
  }): Promise<GithubDiscoveryOperation> {
    const workspaceId = WorkspaceIdSchema.parse(input.workspaceId);
    const requestedBy = UserIdSchema.parse(input.requestedBy);
    return withApplicationTransaction(this.#pool, workspaceId, async (client) => {
      const pending = await client.query<GithubDiscoveryOperationRow>(
        `
          SELECT *
          FROM frevos.github_discovery_operations
          WHERE workspace_id = $1 AND agent_id = $2 AND status IN ('queued', 'claimed')
          ORDER BY created_at, operation_id
          LIMIT 1
        `,
        [workspaceId, WINDOWS_GITHUB_AGENT_ID],
      );
      if (pending.rows[0] !== undefined) {
        return discoveryOperationFromRow(pending.rows[0]);
      }
      const result = await client.query<GithubDiscoveryOperationRow>(
        `
          INSERT INTO frevos.github_discovery_operations (
            operation_id, workspace_id, agent_id, requested_by, action, status, created_at
          ) VALUES ($1, $2, $3, $4, 'github.account.discover', 'queued', $5)
          RETURNING *
        `,
        [randomIdentifier("op"), workspaceId, WINDOWS_GITHUB_AGENT_ID, requestedBy, input.now],
      );
      return discoveryOperationFromRow(requiredRow(result.rows[0], "GitHub discovery insert"));
    });
  }

  async getDiscoveryOperation(
    workspaceId: string,
    operationId: string,
  ): Promise<GithubDiscoveryOperation | null> {
    const parsedWorkspaceId = WorkspaceIdSchema.parse(workspaceId);
    const parsedOperationId = OperationIdSchema.parse(operationId);
    return withApplicationTransaction(this.#pool, parsedWorkspaceId, async (client) => {
      const result = await client.query<GithubDiscoveryOperationRow>(
        `SELECT * FROM frevos.github_discovery_operations WHERE workspace_id = $1 AND operation_id = $2`,
        [parsedWorkspaceId, parsedOperationId],
      );
      return result.rows[0] === undefined ? null : discoveryOperationFromRow(result.rows[0]);
    });
  }

  async claimNextDiscovery(
    workspaceId: string,
    agentId: string,
    now: Date,
  ): Promise<GithubDiscoveryOperation | null> {
    const parsedWorkspaceId = WorkspaceIdSchema.parse(workspaceId);
    const parsedAgentId = ServiceIdentityIdSchema.parse(agentId);
    return withApplicationTransaction(this.#pool, parsedWorkspaceId, async (client) => {
      const result = await client.query<GithubDiscoveryOperationRow>(
        `
          WITH candidate AS (
            SELECT operation_id
            FROM frevos.github_discovery_operations
            WHERE workspace_id = $1 AND agent_id = $2 AND status = 'queued'
            ORDER BY created_at, operation_id
            FOR UPDATE SKIP LOCKED
            LIMIT 1
          )
          UPDATE frevos.github_discovery_operations AS operation
          SET status = 'claimed', claimed_at = $3
          FROM candidate
          WHERE operation.operation_id = candidate.operation_id
          RETURNING operation.*
        `,
        [parsedWorkspaceId, parsedAgentId, now],
      );
      return result.rows[0] === undefined ? null : discoveryOperationFromRow(result.rows[0]);
    });
  }

  async completeDiscovery(input: {
    workspaceId: string;
    agentId: string;
    operationId: string;
    completion: GithubDiscoveryCompletion;
    now: Date;
  }): Promise<GithubDiscoveryOperation | null> {
    const workspaceId = WorkspaceIdSchema.parse(input.workspaceId);
    const agentId = ServiceIdentityIdSchema.parse(input.agentId);
    const operationId = OperationIdSchema.parse(input.operationId);
    const completion = GithubDiscoveryCompletionSchema.parse(input.completion);
    return withApplicationTransaction(this.#pool, workspaceId, async (client) => {
      const update = await client.query<GithubDiscoveryOperationRow>(
        `
          UPDATE frevos.github_discovery_operations
          SET status = $4, result = $5, error_code = $6, completed_at = $7
          WHERE workspace_id = $1 AND operation_id = $2 AND agent_id = $3 AND status = 'claimed'
          RETURNING *
        `,
        [
          workspaceId,
          operationId,
          agentId,
          completion.status,
          completion.result,
          completion.status === "failed" ? completion.errorCode : null,
          input.now,
        ],
      );
      const row = update.rows[0];
      if (row === undefined) return null;
      if (completion.status === "succeeded") {
        const result = GithubDiscoveryResultSchema.parse(completion.result);
        await client.query(
          `
            INSERT INTO frevos.github_connections (
              connection_id, workspace_id, provider, provider_account_id, account_login,
              agent_id, status, repositories, verified_at, created_at
            ) VALUES ($1, $2, 'github', $3, $4, $5, 'active', $6, $7, $7)
            ON CONFLICT (workspace_id, provider, provider_account_id) DO UPDATE
            SET account_login = EXCLUDED.account_login,
                agent_id = EXCLUDED.agent_id,
                status = 'active',
                repositories = EXCLUDED.repositories,
                verified_at = EXCLUDED.verified_at
          `,
          [
            randomIdentifier("ghc"),
            workspaceId,
            result.account.providerAccountId,
            result.account.login,
            agentId,
            JSON.stringify(result.repositories),
            input.now,
          ],
        );
      }
      return discoveryOperationFromRow(row);
    });
  }

  async listConnections(workspaceId: string): Promise<GithubConnection[]> {
    const parsedWorkspaceId = WorkspaceIdSchema.parse(workspaceId);
    return withApplicationTransaction(this.#pool, parsedWorkspaceId, async (client) => {
      const result = await client.query<GithubConnectionRow>(
        `SELECT * FROM frevos.github_connections WHERE workspace_id = $1 ORDER BY verified_at DESC`,
        [parsedWorkspaceId],
      );
      return result.rows.map(connectionFromRow);
    });
  }

  async connectRepository(input: {
    workspaceId: string;
    request: ConnectGithubRepositoryRequest;
    now: Date;
  }): Promise<ProjectRepositoryConnection | null> {
    const workspaceId = WorkspaceIdSchema.parse(input.workspaceId);
    const request = ConnectGithubRepositoryRequestSchema.parse(input.request);
    return withApplicationTransaction(this.#pool, workspaceId, async (client) => {
      const connectionResult = await client.query<GithubConnectionRow>(
        `SELECT * FROM frevos.github_connections WHERE workspace_id = $1 AND connection_id = $2 AND status = 'active'`,
        [workspaceId, request.connectionId],
      );
      const connectionRow = connectionResult.rows[0];
      if (connectionRow === undefined) return null;
      const connection = connectionFromRow(connectionRow);
      const repository = connection.repositories.find(
        (candidate) => candidate.providerRepositoryId === request.providerRepositoryId,
      );
      if (repository === undefined || repository.archived) return null;
      const existing = await client.query(
        `SELECT 1 FROM frevos.project_repository_connections WHERE workspace_id = $1 AND provider = 'github' AND provider_repository_id = $2`,
        [workspaceId, request.providerRepositoryId],
      );
      if (existing.rows[0] !== undefined) return null;
      const projectId = randomIdentifier("prj");
      await client.query(
        `
          INSERT INTO frevos.projects (
            project_id, workspace_id, client_id, display_name, status, created_at
          ) VALUES ($1, $2, $3, $4, 'active', $5)
        `,
        [projectId, workspaceId, request.clientId ?? null, request.displayName, input.now],
      );
      const result = await client.query<ProjectRepositoryConnectionRow>(
        `
          INSERT INTO frevos.project_repository_connections (
            workspace_id, project_id, connection_id, provider, provider_repository_id,
            repository, status, created_at
          ) VALUES ($1, $2, $3, 'github', $4, $5, 'connected', $6)
          RETURNING workspace_id, project_id, connection_id, repository, status, created_at
        `,
        [
          workspaceId,
          projectId,
          request.connectionId,
          request.providerRepositoryId,
          JSON.stringify(repository),
          input.now,
        ],
      );
      return projectConnectionFromRow(requiredRow(result.rows[0], "Repository connection insert"));
    });
  }

  async listProjectConnections(workspaceId: string): Promise<ProjectRepositoryConnection[]> {
    const parsedWorkspaceId = WorkspaceIdSchema.parse(workspaceId);
    return withApplicationTransaction(this.#pool, parsedWorkspaceId, async (client) => {
      const result = await client.query<ProjectRepositoryConnectionRow>(
        `
          SELECT workspace_id, project_id, connection_id, repository, status, created_at
          FROM frevos.project_repository_connections
          WHERE workspace_id = $1
          ORDER BY created_at, project_id
        `,
        [parsedWorkspaceId],
      );
      return result.rows.map(projectConnectionFromRow);
    });
  }
}

function connectionFromRow(row: GithubConnectionRow): GithubConnection {
  return GithubConnectionSchema.parse({
    connectionId: row.connection_id,
    workspaceId: row.workspace_id,
    provider: row.provider,
    providerAccountId: row.provider_account_id,
    login: row.account_login,
    agentId: row.agent_id,
    status: row.status,
    repositories: row.repositories,
    verifiedAt: row.verified_at.toISOString(),
    createdAt: row.created_at.toISOString(),
  });
}

function discoveryOperationFromRow(row: GithubDiscoveryOperationRow): GithubDiscoveryOperation {
  return GithubDiscoveryOperationSchema.parse({
    operationId: row.operation_id,
    workspaceId: row.workspace_id,
    agentId: row.agent_id,
    requestedBy: row.requested_by,
    action: row.action,
    status: row.status,
    result: row.result,
    errorCode: row.error_code,
    createdAt: row.created_at.toISOString(),
    claimedAt: row.claimed_at?.toISOString() ?? null,
    completedAt: row.completed_at?.toISOString() ?? null,
  });
}

function projectConnectionFromRow(
  row: ProjectRepositoryConnectionRow,
): ProjectRepositoryConnection {
  return ProjectRepositoryConnectionSchema.parse({
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    connectionId: row.connection_id,
    repository: row.repository,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  });
}

function requiredRow<Row>(row: Row | undefined, operation: string): Row {
  if (row === undefined) throw new Error(`${operation} did not return a row`);
  return row;
}
