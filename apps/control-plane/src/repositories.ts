import {
  ClientIdSchema,
  ClientSchema,
  ExternalIdentitySchema,
  IdentityIssuerSchema,
  IdentitySubjectSchema,
  ProjectSchema,
  SessionContextSchema,
  UserIdSchema,
  WorkspaceMembershipSchema,
  WorkspaceIdSchema,
  WorkspaceSchema,
  type Client,
  type ExternalIdentity,
  type Project,
  type SessionContext,
  type UserId,
  type Workspace,
  type WorkspaceMembership,
} from "@frevos/contracts";
import type { QueryResultRow } from "pg";
import { z } from "zod";
import { randomIdentifier, randomOpaqueToken, sha256 } from "./crypto.js";
import { type DatabasePool, withApplicationTransaction } from "./database.js";

const DisplayNameSchema = z
  .string()
  .min(1)
  .max(120)
  .refine((value) => value === value.trim(), "Display name must not have outer whitespace");
const GrantedScopesSchema = z
  .array(z.string().regex(/^[a-z][a-z0-9-]{0,62}:[a-z][a-z0-9-]{0,62}$/))
  .min(1)
  .max(128)
  .refine((scopes) => new Set(scopes).size === scopes.length, "Scopes must be unique");

interface IdentityRow extends QueryResultRow {
  identity_id: string;
  user_id: string;
  issuer: string;
  subject: string;
  linked_at: Date;
  last_authenticated_at: Date;
}

interface SessionRow extends QueryResultRow {
  session_id: string;
  user_id: string;
  identity_id: string;
  status: string;
  authenticated_at: Date;
  expires_at: Date;
  csrf_hash: Buffer;
}

interface WorkspaceRow extends QueryResultRow {
  workspace_id: string;
  display_name: string;
  status: string;
  created_at: Date;
}

interface MembershipRow extends QueryResultRow {
  membership_id: string;
  workspace_id: string;
  user_id: string;
  status: string;
  granted_scopes: string[];
  created_at: Date;
}

interface ClientRow extends QueryResultRow {
  client_id: string;
  workspace_id: string;
  display_name: string;
  status: string;
  created_at: Date;
}

interface ProjectRow extends QueryResultRow {
  project_id: string;
  workspace_id: string;
  client_id: string | null;
  display_name: string;
  status: string;
  created_at: Date;
}

interface WorkspaceEvidenceRow extends QueryResultRow {
  workspace_id: string;
  workspace_display_name: string;
  workspace_status: string;
  workspace_created_at: Date;
  membership_id: string;
  membership_user_id: string;
  membership_status: string;
  membership_granted_scopes: string[];
  membership_created_at: Date;
}

export interface IdentityPrincipal {
  readonly identity: ExternalIdentity;
  readonly userId: UserId;
}

export interface CreatedSession {
  readonly context: SessionContext;
  readonly rawToken: string;
  readonly rawCsrfToken: string;
}

export interface AuthenticatedSession {
  readonly context: SessionContext;
  readonly csrfHash: Buffer;
}

export interface WorkspaceEvidence {
  readonly workspace: Workspace;
  readonly membership: WorkspaceMembership | null;
}

function identityFromRow(row: IdentityRow): ExternalIdentity {
  return ExternalIdentitySchema.parse({
    identityId: row.identity_id,
    userId: row.user_id,
    issuer: row.issuer,
    subject: row.subject,
    linkedAt: row.linked_at.toISOString(),
    lastAuthenticatedAt: row.last_authenticated_at.toISOString(),
  });
}

function sessionFromRow(row: SessionRow): SessionContext {
  return SessionContextSchema.parse({
    sessionId: row.session_id,
    userId: row.user_id,
    identityId: row.identity_id,
    status: row.status,
    authenticatedAt: row.authenticated_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
  });
}

function workspaceFromRow(row: WorkspaceRow): Workspace {
  return WorkspaceSchema.parse({
    workspaceId: row.workspace_id,
    displayName: row.display_name,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  });
}

function membershipFromRow(row: MembershipRow): WorkspaceMembership {
  return WorkspaceMembershipSchema.parse({
    membershipId: row.membership_id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    status: row.status,
    grantedScopes: row.granted_scopes,
    createdAt: row.created_at.toISOString(),
  });
}

function clientFromRow(row: ClientRow): Client {
  return ClientSchema.parse({
    clientId: row.client_id,
    workspaceId: row.workspace_id,
    displayName: row.display_name,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  });
}

function projectFromRow(row: ProjectRow): Project {
  return ProjectSchema.parse({
    projectId: row.project_id,
    workspaceId: row.workspace_id,
    ...(row.client_id === null ? {} : { clientId: row.client_id }),
    displayName: row.display_name,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  });
}

export class IdentitySessionRepository {
  readonly #pool: DatabasePool;

  constructor(pool: DatabasePool) {
    this.#pool = pool;
  }

  async upsertIdentity(input: {
    issuer: string;
    subject: string;
    displayName?: string;
    now?: Date;
  }): Promise<IdentityPrincipal> {
    const issuer = IdentityIssuerSchema.parse(input.issuer);
    const subject = IdentitySubjectSchema.parse(input.subject);
    const displayName =
      input.displayName === undefined ? null : DisplayNameSchema.parse(input.displayName);
    const now = input.now ?? new Date();

    return withApplicationTransaction(this.#pool, undefined, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        JSON.stringify([issuer, subject]),
      ]);
      const existing = await client.query<IdentityRow>(
        `
          UPDATE frevos.external_identities
          SET last_authenticated_at = $3
          WHERE issuer = $1 AND subject = $2
          RETURNING identity_id, user_id, issuer, subject, linked_at, last_authenticated_at
        `,
        [issuer, subject, now],
      );
      if (existing.rows[0] !== undefined) {
        if (displayName !== null) {
          await client.query("UPDATE frevos.users SET display_name = $2 WHERE user_id = $1", [
            existing.rows[0].user_id,
            displayName,
          ]);
        }
        const identity = identityFromRow(existing.rows[0]);
        return { identity, userId: UserIdSchema.parse(identity.userId) };
      }

      const userId = UserIdSchema.parse(randomIdentifier("usr"));
      const identityId = randomIdentifier("idn");
      await client.query(
        "INSERT INTO frevos.users (user_id, display_name, created_at) VALUES ($1, $2, $3)",
        [userId, displayName, now],
      );
      const inserted = await client.query<IdentityRow>(
        `
          INSERT INTO frevos.external_identities (
            identity_id, user_id, issuer, subject, linked_at, last_authenticated_at
          ) VALUES ($1, $2, $3, $4, $5, $5)
          RETURNING identity_id, user_id, issuer, subject, linked_at, last_authenticated_at
        `,
        [identityId, userId, issuer, subject, now],
      );
      const row = inserted.rows[0];
      if (row === undefined) {
        throw new Error("Identity insert did not return a row");
      }
      return { identity: identityFromRow(row), userId };
    });
  }

  async createSession(input: {
    principal: IdentityPrincipal;
    previousRawToken?: string;
    now?: Date;
  }): Promise<CreatedSession> {
    const now = input.now ?? new Date();
    const rawToken = randomOpaqueToken("fst");
    const rawCsrfToken = randomOpaqueToken("fct");
    const sessionId = randomIdentifier("ses");
    const absoluteExpiry = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    const idleExpiry = new Date(now.getTime() + 30 * 60 * 1000);

    return withApplicationTransaction(this.#pool, undefined, async (client) => {
      if (input.previousRawToken !== undefined) {
        await client.query(
          `
            UPDATE frevos.sessions
            SET status = 'revoked', revoked_at = $2
            WHERE token_hash = $1 AND status = 'active'
          `,
          [sha256(input.previousRawToken), now],
        );
      }
      const inserted = await client.query<SessionRow>(
        `
          INSERT INTO frevos.sessions (
            session_id, user_id, identity_id, token_hash, csrf_hash, status,
            authenticated_at, last_seen_at, idle_expires_at, expires_at
          ) VALUES ($1, $2, $3, $4, $5, 'active', $6, $6, $7, $8)
          RETURNING session_id, user_id, identity_id, status, authenticated_at, expires_at, csrf_hash
        `,
        [
          sessionId,
          input.principal.userId,
          input.principal.identity.identityId,
          sha256(rawToken),
          sha256(rawCsrfToken),
          now,
          idleExpiry,
          absoluteExpiry,
        ],
      );
      const row = inserted.rows[0];
      if (row === undefined) {
        throw new Error("Session insert did not return a row");
      }
      return { context: sessionFromRow(row), rawToken, rawCsrfToken };
    });
  }

  async authenticate(rawToken: string, now = new Date()): Promise<AuthenticatedSession | null> {
    return withApplicationTransaction(this.#pool, undefined, async (client) => {
      const result = await client.query<SessionRow>(
        `
          UPDATE frevos.sessions
          SET last_seen_at = $2,
              idle_expires_at = LEAST($2 + interval '30 minutes', expires_at)
          WHERE token_hash = $1
            AND status = 'active'
            AND idle_expires_at > $2
            AND expires_at > $2
          RETURNING session_id, user_id, identity_id, status, authenticated_at, expires_at, csrf_hash
        `,
        [sha256(rawToken), now],
      );
      const row = result.rows[0];
      return row === undefined ? null : { context: sessionFromRow(row), csrfHash: row.csrf_hash };
    });
  }

  async revoke(rawToken: string, now = new Date()): Promise<boolean> {
    return withApplicationTransaction(this.#pool, undefined, async (client) => {
      const result = await client.query(
        `
          UPDATE frevos.sessions
          SET status = 'revoked', revoked_at = $2
          WHERE token_hash = $1 AND status = 'active'
        `,
        [sha256(rawToken), now],
      );
      return result.rowCount === 1;
    });
  }
}

export class WorkspaceRepository {
  readonly #pool: DatabasePool;

  constructor(pool: DatabasePool) {
    this.#pool = pool;
  }

  async createWorkspace(input: {
    workspaceId?: string;
    displayName: string;
    now?: Date;
  }): Promise<Workspace> {
    const workspaceId = WorkspaceIdSchema.parse(input.workspaceId ?? randomIdentifier("ws"));
    const displayName = DisplayNameSchema.parse(input.displayName);
    const now = input.now ?? new Date();
    return withApplicationTransaction(this.#pool, workspaceId, async (client) => {
      const result = await client.query<WorkspaceRow>(
        `
          INSERT INTO frevos.workspaces (workspace_id, display_name, status, created_at)
          VALUES ($1, $2, 'active', $3)
          RETURNING workspace_id, display_name, status, created_at
        `,
        [workspaceId, displayName, now],
      );
      return workspaceFromRow(requiredRow(result.rows[0], "Workspace insert"));
    });
  }

  async createMembership(input: {
    workspaceId: string;
    userId: string;
    grantedScopes: string[];
    now?: Date;
  }): Promise<WorkspaceMembership> {
    const workspaceId = WorkspaceIdSchema.parse(input.workspaceId);
    const userId = UserIdSchema.parse(input.userId);
    const scopes = GrantedScopesSchema.parse(input.grantedScopes);
    const now = input.now ?? new Date();
    return withApplicationTransaction(this.#pool, workspaceId, async (client) => {
      const result = await client.query<MembershipRow>(
        `
          INSERT INTO frevos.workspace_memberships (
            membership_id, workspace_id, user_id, status, granted_scopes, created_at
          ) VALUES ($1, $2, $3, 'active', $4, $5)
          RETURNING membership_id, workspace_id, user_id, status, granted_scopes, created_at
        `,
        [randomIdentifier("wsm"), workspaceId, userId, scopes, now],
      );
      return membershipFromRow(requiredRow(result.rows[0], "Membership insert"));
    });
  }

  async getEvidence(workspaceId: string, userId: string): Promise<WorkspaceEvidence | null> {
    const parsedWorkspaceId = WorkspaceIdSchema.parse(workspaceId);
    const parsedUserId = UserIdSchema.parse(userId);
    return withApplicationTransaction(this.#pool, undefined, async (client) => {
      const result = await client.query<WorkspaceEvidenceRow>(
        "SELECT * FROM frevos.resolve_workspace_evidence($1, $2)",
        [parsedUserId, parsedWorkspaceId],
      );
      const row = result.rows[0];
      if (row === undefined) {
        return null;
      }
      return {
        workspace: workspaceFromRow({
          workspace_id: row.workspace_id,
          display_name: row.workspace_display_name,
          status: row.workspace_status,
          created_at: row.workspace_created_at,
        }),
        membership: membershipFromRow({
          membership_id: row.membership_id,
          workspace_id: row.workspace_id,
          user_id: row.membership_user_id,
          status: row.membership_status,
          granted_scopes: row.membership_granted_scopes,
          created_at: row.membership_created_at,
        }),
      };
    });
  }

  async createClient(input: {
    workspaceId: string;
    displayName: string;
    now?: Date;
  }): Promise<Client> {
    const workspaceId = WorkspaceIdSchema.parse(input.workspaceId);
    const displayName = DisplayNameSchema.parse(input.displayName);
    const now = input.now ?? new Date();
    return withApplicationTransaction(this.#pool, workspaceId, async (client) => {
      const result = await client.query<ClientRow>(
        `
          INSERT INTO frevos.clients (client_id, workspace_id, display_name, status, created_at)
          VALUES ($1, $2, $3, 'active', $4)
          RETURNING client_id, workspace_id, display_name, status, created_at
        `,
        [randomIdentifier("cli"), workspaceId, displayName, now],
      );
      return clientFromRow(requiredRow(result.rows[0], "Client insert"));
    });
  }

  async listClients(workspaceId: string): Promise<Client[]> {
    const parsedWorkspaceId = WorkspaceIdSchema.parse(workspaceId);
    return withApplicationTransaction(this.#pool, parsedWorkspaceId, async (client) => {
      const result = await client.query<ClientRow>(
        `
          SELECT client_id, workspace_id, display_name, status, created_at
          FROM frevos.clients
          WHERE workspace_id = $1
          ORDER BY created_at, client_id
        `,
        [parsedWorkspaceId],
      );
      return result.rows.map(clientFromRow);
    });
  }

  async updateClientDisplayName(input: {
    workspaceId: string;
    clientId: string;
    displayName: string;
  }): Promise<Client | null> {
    const workspaceId = WorkspaceIdSchema.parse(input.workspaceId);
    const clientId = ClientIdSchema.parse(input.clientId);
    const displayName = DisplayNameSchema.parse(input.displayName);
    return withApplicationTransaction(this.#pool, workspaceId, async (client) => {
      const result = await client.query<ClientRow>(
        `
          UPDATE frevos.clients
          SET display_name = $3
          WHERE workspace_id = $1 AND client_id = $2
          RETURNING client_id, workspace_id, display_name, status, created_at
        `,
        [workspaceId, clientId, displayName],
      );
      const row = result.rows[0];
      return row === undefined ? null : clientFromRow(row);
    });
  }

  async createProject(input: {
    workspaceId: string;
    clientId?: string;
    displayName: string;
    now?: Date;
  }): Promise<Project> {
    const workspaceId = WorkspaceIdSchema.parse(input.workspaceId);
    const clientId = input.clientId === undefined ? null : ClientIdSchema.parse(input.clientId);
    const displayName = DisplayNameSchema.parse(input.displayName);
    const now = input.now ?? new Date();
    return withApplicationTransaction(this.#pool, workspaceId, async (client) => {
      const result = await client.query<ProjectRow>(
        `
          INSERT INTO frevos.projects (
            project_id, workspace_id, client_id, display_name, status, created_at
          ) VALUES ($1, $2, $3, $4, 'active', $5)
          RETURNING project_id, workspace_id, client_id, display_name, status, created_at
        `,
        [randomIdentifier("prj"), workspaceId, clientId, displayName, now],
      );
      return projectFromRow(requiredRow(result.rows[0], "Project insert"));
    });
  }

  async listProjects(workspaceId: string): Promise<Project[]> {
    const parsedWorkspaceId = WorkspaceIdSchema.parse(workspaceId);
    return withApplicationTransaction(this.#pool, parsedWorkspaceId, async (client) => {
      const result = await client.query<ProjectRow>(
        `
          SELECT project_id, workspace_id, client_id, display_name, status, created_at
          FROM frevos.projects
          WHERE workspace_id = $1
          ORDER BY created_at, project_id
        `,
        [parsedWorkspaceId],
      );
      return result.rows.map(projectFromRow);
    });
  }
}

function requiredRow<Row>(row: Row | undefined, operation: string): Row {
  if (row === undefined) {
    throw new Error(`${operation} did not return a row`);
  }
  return row;
}
