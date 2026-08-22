import cookie from "@fastify/cookie";
import {
  AgentOperationCompletionSchema,
  authorizeWorkspaceAction,
  ClientSchema,
  OperationIdSchema,
  type PermissionScope,
  ProjectAutomationOperationSchema,
  ProjectAutomationProfileSchema,
  ProjectAutomationRequestSchema,
  ProjectIdSchema,
  ProjectSchema,
  type SessionContext,
  SessionContextSchema,
  SessionSummarySchema,
  WorkspaceIdSchema,
  WorkspaceSchema,
} from "@frevos/contracts";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { z } from "zod";
import { hashesMatch, type OidcTransaction, type OidcTransactionCodec } from "./crypto.js";
import { type AuthenticatedIdentity, createOidcTransaction, type OidcProvider } from "./oidc.js";
import { type ProjectAutomationStore, TRACKGRN_AGENT_ID } from "./project-automation.js";
import type {
  AuthenticatedSession,
  IdentitySessionRepository,
  WorkspaceEvidence,
  WorkspaceRepository,
} from "./repositories.js";

export const SESSION_COOKIE = "__Host-frevos-session";
export const CSRF_COOKIE = "__Host-frevos-csrf";
export const OIDC_TRANSACTION_COOKIE = "__Host-frevos-oidc";

const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
const OIDC_MAX_AGE_SECONDS = 10 * 60;

const ErrorResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["error"],
  properties: { error: { type: "string" } },
} as const;
const SessionResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["sessionId", "userId", "authenticatedAt", "expiresAt"],
  properties: {
    sessionId: { type: "string" },
    userId: { type: "string" },
    authenticatedAt: { type: "string", format: "date-time" },
    expiresAt: { type: "string", format: "date-time" },
  },
} as const;
const WorkspaceJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["workspaceId", "displayName", "status", "createdAt"],
  properties: {
    workspaceId: { type: "string" },
    displayName: { type: "string" },
    status: { type: "string", enum: ["active", "suspended"] },
    createdAt: { type: "string", format: "date-time" },
  },
} as const;
const ClientJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["clientId", "workspaceId", "displayName", "status", "createdAt"],
  properties: {
    clientId: { type: "string" },
    workspaceId: { type: "string" },
    displayName: { type: "string" },
    status: { type: "string", enum: ["active", "archived"] },
    createdAt: { type: "string", format: "date-time" },
  },
} as const;
const ProjectJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["projectId", "workspaceId", "displayName", "status", "createdAt"],
  properties: {
    projectId: { type: "string" },
    workspaceId: { type: "string" },
    clientId: { type: "string" },
    displayName: { type: "string" },
    status: { type: "string", enum: ["active", "archived"] },
    createdAt: { type: "string", format: "date-time" },
  },
} as const;

const DisplayNameBodySchema = z
  .object({
    displayName: z
      .string()
      .min(1)
      .max(120)
      .refine((value) => value === value.trim()),
  })
  .strict();
const ProjectBodySchema = DisplayNameBodySchema.extend({
  clientId: z.string().min(5).max(128).optional(),
}).strict();
const LocalLoginBodySchema = z
  .object({
    username: z.string().min(1).max(64),
    password: z.string().min(1).max(128),
  })
  .strict();

interface BuildServerOptions {
  readonly publicOrigin: string;
  readonly basePath?: string;
  readonly authMode?: "local" | "oidc";
  readonly oidcProvider?: OidcProvider;
  readonly transactionCodec?: OidcTransactionCodec;
  readonly identitySessions: IdentitySessionRepository;
  readonly workspaces: WorkspaceRepository;
  readonly automation?: ProjectAutomationStore;
  readonly trackGrnAgentTokenHash?: Buffer;
  readonly readiness?: () => Promise<void>;
  readonly now?: () => Date;
}

interface WorkspaceParams {
  workspaceId: string;
}

interface ProjectAutomationParams extends WorkspaceParams {
  projectId: string;
}

interface ProjectAutomationOperationParams extends ProjectAutomationParams {
  operationId: string;
}

interface AgentOperationParams {
  operationId: string;
}

interface SessionEvidence {
  session: AuthenticatedSession;
  rawToken: string;
}

class HttpError extends Error {
  readonly statusCode: number;
  readonly publicMessage: string;

  constructor(statusCode: number, publicMessage: string) {
    super(publicMessage);
    this.statusCode = statusCode;
    this.publicMessage = publicMessage;
  }
}

export async function buildServer(options: BuildServerOptions): Promise<FastifyInstance> {
  const basePath = options.basePath ?? "";
  const route = (path: string) => `${basePath}${path}`;
  const server = Fastify({
    logger: false,
    trustProxy: false,
    bodyLimit: 1_048_576,
    connectionTimeout: 10_000,
    keepAliveTimeout: 5_000,
    requestTimeout: 15_000,
    ajv: { customOptions: { removeAdditional: false } },
  });
  await server.register(cookie);
  const now = options.now ?? (() => new Date());
  const authMode = options.authMode ?? "oidc";

  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof HttpError) {
      void reply.status(error.statusCode).send({ error: error.publicMessage });
      return;
    }
    if (error instanceof z.ZodError) {
      void reply.status(400).send({ error: "invalid-request" });
      return;
    }
    void reply.status(500).send({ error: "internal-error" });
  });

  server.get(
    route("/health"),
    {
      schema: {
        response: {
          200: {
            type: "object",
            additionalProperties: false,
            required: ["status"],
            properties: { status: { type: "string", const: "ok" } },
          },
          503: {
            type: "object",
            additionalProperties: false,
            required: ["status"],
            properties: { status: { type: "string", const: "unavailable" } },
          },
        },
      },
    },
    async (_request, reply) => {
      try {
        await options.readiness?.();
        return { status: "ok" };
      } catch {
        return reply.status(503).send({ status: "unavailable" });
      }
    },
  );

  if (authMode === "local") {
    server.post(
      route("/auth/login"),
      {
        schema: {
          response: {
            204: { type: "null" },
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            403: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        if (request.headers.origin !== options.publicOrigin) {
          throw new HttpError(403, "login-origin-rejected");
        }
        const body = LocalLoginBodySchema.parse(request.body);
        const principal = await options.identitySessions.authenticateLocalCredential({
          username: body.username,
          password: body.password,
          now: now(),
        });
        if (principal === null) {
          throw new HttpError(401, "invalid-credentials");
        }
        const session = await options.identitySessions.createSession({
          principal,
          ...(request.cookies[SESSION_COOKIE] === undefined
            ? {}
            : { previousRawToken: request.cookies[SESSION_COOKIE] }),
          now: now(),
        });
        setSessionCookies(reply, session.rawToken, session.rawCsrfToken);
        return reply.status(204).send();
      },
    );
  } else {
    if (options.oidcProvider === undefined || options.transactionCodec === undefined) {
      throw new Error("OIDC provider and transaction codec are required in OIDC mode");
    }
    const oidcProvider = options.oidcProvider;
    const transactionCodec = options.transactionCodec;

    server.get(route("/auth/login"), async (_request, reply) => {
      const transaction = createOidcTransaction(now());
      const authorizationUrl = await oidcProvider.createAuthorizationUrl(transaction);
      if (authorizationUrl.protocol !== "https:") {
        throw new HttpError(500, "identity-provider-unavailable");
      }
      reply.setCookie(OIDC_TRANSACTION_COOKIE, transactionCodec.seal(transaction), {
        ...httpOnlyCookieOptions,
        maxAge: OIDC_MAX_AGE_SECONDS,
      });
      return reply.redirect(authorizationUrl.toString(), 302);
    });

    server.get(route("/auth/callback"), async (request, reply) => {
      const encodedTransaction = request.cookies[OIDC_TRANSACTION_COOKIE];
      if (encodedTransaction === undefined) {
        throw new HttpError(400, "invalid-auth-transaction");
      }

      let transaction: OidcTransaction;
      try {
        transaction = transactionCodec.open(encodedTransaction, now());
      } catch {
        clearCookie(reply, OIDC_TRANSACTION_COOKIE, true);
        throw new HttpError(400, "invalid-auth-transaction");
      }

      const callbackUrl = new URL(request.url, options.publicOrigin);
      let externalIdentity: AuthenticatedIdentity;
      try {
        externalIdentity = await oidcProvider.completeAuthorization(callbackUrl, transaction);
      } catch {
        clearCookie(reply, OIDC_TRANSACTION_COOKIE, true);
        throw new HttpError(400, "invalid-auth-callback");
      }
      const principal = await options.identitySessions.upsertIdentity({
        issuer: externalIdentity.issuer,
        subject: externalIdentity.subject,
        ...(externalIdentity.displayName === undefined
          ? {}
          : { displayName: externalIdentity.displayName }),
        now: now(),
      });
      const session = await options.identitySessions.createSession({
        principal,
        ...(request.cookies[SESSION_COOKIE] === undefined
          ? {}
          : { previousRawToken: request.cookies[SESSION_COOKIE] }),
        now: now(),
      });

      setSessionCookies(reply, session.rawToken, session.rawCsrfToken);
      clearCookie(reply, OIDC_TRANSACTION_COOKIE, true);
      return reply.redirect(`${options.publicOrigin}${basePath}/`, 302);
    });
  }

  server.get(
    route("/v1/session"),
    {
      schema: { response: { 200: SessionResponseJsonSchema, 401: ErrorResponseSchema } },
    },
    async (request) => {
      const evidence = await requireSession(request, options.identitySessions, now());
      return SessionSummarySchema.parse(safeSessionResponse(evidence.session.context));
    },
  );

  server.get(
    route("/v1/workspaces"),
    {
      schema: {
        response: {
          200: { type: "array", items: WorkspaceJsonSchema },
          401: ErrorResponseSchema,
        },
      },
    },
    async (request) => {
      const evaluatedAt = now();
      const session = await requireSession(request, options.identitySessions, evaluatedAt);
      const evidence = await options.workspaces.listEvidenceForPrincipal(
        session.session.context.userId,
      );
      return evidence
        .filter(
          (candidate) =>
            authorizeWorkspaceAction({
              session: session.session.context,
              workspace: candidate.workspace,
              membership: candidate.membership,
              requiredScope: "workspace:read",
              evaluatedAt: evaluatedAt.toISOString(),
            }).allowed,
        )
        .map((candidate) => WorkspaceSchema.parse(candidate.workspace));
    },
  );

  server.post(
    route("/auth/logout"),
    {
      schema: {
        response: { 204: { type: "null" }, 401: ErrorResponseSchema, 403: ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      const evidence = await requireSession(request, options.identitySessions, now());
      requireCsrf(request, evidence.session, options.publicOrigin);
      await options.identitySessions.revoke(evidence.rawToken, now());
      clearCookie(reply, SESSION_COOKIE, true);
      clearCookie(reply, CSRF_COOKIE, false);
      return reply.status(204).send();
    },
  );

  server.get<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId"),
    {
      schema: {
        response: {
          200: WorkspaceJsonSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request) => {
      const { workspace, session } = await requireWorkspace(
        request,
        options,
        "workspace:read",
        now(),
      );
      SessionContextSchema.parse(session.session.context);
      return WorkspaceSchema.parse(workspace.workspace);
    },
  );

  server.get<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/clients"),
    {
      schema: {
        response: {
          200: { type: "array", items: ClientJsonSchema },
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request) => {
      const { workspaceId } = await requireWorkspace(request, options, "client:read", now());
      return (await options.workspaces.listClients(workspaceId)).map((client) =>
        ClientSchema.parse(client),
      );
    },
  );

  server.post<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/clients"),
    {
      schema: {
        response: {
          201: ClientJsonSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, session } = await requireWorkspace(
        request,
        options,
        "client:write",
        now(),
      );
      requireCsrf(request, session.session, options.publicOrigin);
      const body = DisplayNameBodySchema.parse(request.body);
      const client = await options.workspaces.createClient({
        workspaceId,
        displayName: body.displayName,
        now: now(),
      });
      return reply.status(201).send(ClientSchema.parse(client));
    },
  );

  server.get<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/projects"),
    {
      schema: {
        response: {
          200: { type: "array", items: ProjectJsonSchema },
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request) => {
      const { workspaceId } = await requireWorkspace(request, options, "project:read", now());
      return (await options.workspaces.listProjects(workspaceId)).map((project) =>
        ProjectSchema.parse(project),
      );
    },
  );

  server.post<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/projects"),
    {
      schema: {
        response: {
          201: ProjectJsonSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, session } = await requireWorkspace(
        request,
        options,
        "project:write",
        now(),
      );
      requireCsrf(request, session.session, options.publicOrigin);
      const body = ProjectBodySchema.parse(request.body);
      const project = await options.workspaces.createProject({
        workspaceId,
        displayName: body.displayName,
        ...(body.clientId === undefined ? {} : { clientId: body.clientId }),
        now: now(),
      });
      return reply.status(201).send(ProjectSchema.parse(project));
    },
  );

  server.get<{ Params: ProjectAutomationParams }>(
    route("/v1/workspaces/:workspaceId/projects/:projectId/automation"),
    async (request) => {
      const { workspaceId } = await requireWorkspace(request, options, "project:read", now());
      const projectId = ProjectIdSchema.parse(request.params.projectId);
      const automation = requireAutomation(options);
      const profile = await automation.getProfile(workspaceId, projectId);
      if (profile === null) {
        throw new HttpError(404, "project-automation-not-found");
      }
      return ProjectAutomationProfileSchema.parse(profile);
    },
  );

  server.get<{ Params: ProjectAutomationParams }>(
    route("/v1/workspaces/:workspaceId/projects/:projectId/automation/operations"),
    async (request) => {
      const { workspaceId } = await requireWorkspace(request, options, "project:read", now());
      const projectId = ProjectIdSchema.parse(request.params.projectId);
      const automation = requireAutomation(options);
      const profile = await automation.getProfile(workspaceId, projectId);
      if (profile === null) {
        throw new HttpError(404, "project-automation-not-found");
      }
      return (await automation.listOperations(workspaceId, projectId)).map((operation) =>
        ProjectAutomationOperationSchema.parse(operation),
      );
    },
  );

  server.get<{ Params: ProjectAutomationOperationParams }>(
    route("/v1/workspaces/:workspaceId/projects/:projectId/automation/operations/:operationId"),
    async (request) => {
      const { workspaceId } = await requireWorkspace(request, options, "project:read", now());
      const projectId = ProjectIdSchema.parse(request.params.projectId);
      const operationId = OperationIdSchema.parse(request.params.operationId);
      const operation = await requireAutomation(options).getOperation(
        workspaceId,
        projectId,
        operationId,
      );
      if (operation === null) {
        throw new HttpError(404, "automation-operation-not-found");
      }
      return ProjectAutomationOperationSchema.parse(operation);
    },
  );

  server.post<{ Params: ProjectAutomationParams }>(
    route("/v1/workspaces/:workspaceId/projects/:projectId/automation/operations"),
    async (request, reply) => {
      const { workspaceId, session } = await requireWorkspace(
        request,
        options,
        "project:write",
        now(),
      );
      requireCsrf(request, session.session, options.publicOrigin);
      const projectId = ProjectIdSchema.parse(request.params.projectId);
      const operation = await requireAutomation(options).createOperation({
        workspaceId,
        projectId,
        requestedBy: session.session.context.userId,
        request: ProjectAutomationRequestSchema.parse(request.body),
        now: now(),
      });
      if (operation === null) {
        throw new HttpError(404, "project-automation-not-found");
      }
      return reply.status(202).send(ProjectAutomationOperationSchema.parse(operation));
    },
  );

  server.post(route("/v1/agents/trackgrn/claim"), async (request, reply) => {
    requireTrackGrnAgent(request, options.trackGrnAgentTokenHash);
    const operation = await requireAutomation(options).claimNext(TRACKGRN_AGENT_ID, now());
    if (operation === null) {
      return reply.status(204).send();
    }
    return ProjectAutomationOperationSchema.parse(operation);
  });

  server.post<{ Params: AgentOperationParams }>(
    route("/v1/agents/trackgrn/operations/:operationId/complete"),
    async (request) => {
      requireTrackGrnAgent(request, options.trackGrnAgentTokenHash);
      const operationId = OperationIdSchema.parse(request.params.operationId);
      const completion = AgentOperationCompletionSchema.parse(request.body);
      if (Buffer.byteLength(JSON.stringify(completion.result), "utf8") > 60_000) {
        throw new HttpError(400, "agent-result-too-large");
      }
      const operation = await requireAutomation(options).complete(
        TRACKGRN_AGENT_ID,
        operationId,
        completion,
        now(),
      );
      if (operation === null) {
        throw new HttpError(409, "automation-operation-not-claimable");
      }
      return ProjectAutomationOperationSchema.parse(operation);
    },
  );

  return server;
}

function requireAutomation(options: BuildServerOptions): ProjectAutomationStore {
  if (options.automation === undefined) {
    throw new HttpError(503, "project-automation-unavailable");
  }
  return options.automation;
}

function requireTrackGrnAgent(request: FastifyRequest, expectedTokenHash?: Buffer): void {
  if (expectedTokenHash === undefined) {
    throw new HttpError(503, "trackgrn-agent-disabled");
  }
  if (request.headers["x-frevos-agent-id"] !== TRACKGRN_AGENT_ID) {
    throw new HttpError(401, "agent-authentication-required");
  }
  const authorization = request.headers.authorization;
  if (authorization === undefined || !authorization.startsWith("Bearer ")) {
    throw new HttpError(401, "agent-authentication-required");
  }
  const token = authorization.slice("Bearer ".length);
  if (token.length < 32 || !hashesMatch(token, expectedTokenHash)) {
    throw new HttpError(401, "agent-authentication-required");
  }
}

async function requireSession(
  request: FastifyRequest,
  sessions: IdentitySessionRepository,
  now: Date,
): Promise<SessionEvidence> {
  const rawToken = request.cookies[SESSION_COOKIE];
  if (rawToken === undefined) {
    throw new HttpError(401, "authentication-required");
  }
  const session = await sessions.authenticate(rawToken, now);
  if (session === null) {
    throw new HttpError(401, "authentication-required");
  }
  return { session, rawToken };
}

async function requireWorkspace(
  request: FastifyRequest<{ Params: WorkspaceParams }>,
  options: BuildServerOptions,
  scope: string,
  now: Date,
): Promise<{
  workspaceId: string;
  workspace: WorkspaceEvidence;
  session: SessionEvidence;
}> {
  const workspaceId = WorkspaceIdSchema.parse(request.params.workspaceId);
  const session = await requireSession(request, options.identitySessions, now);
  const workspace = await options.workspaces.getEvidence(
    workspaceId,
    session.session.context.userId,
  );
  if (workspace === null) {
    throw new HttpError(404, "workspace-not-found");
  }
  const decision = authorizeWorkspaceAction({
    session: session.session.context,
    workspace: workspace.workspace,
    membership: workspace.membership,
    requiredScope: scope as PermissionScope,
    evaluatedAt: now.toISOString(),
  });
  if (!decision.allowed) {
    throw new HttpError(403, "workspace-access-denied");
  }
  return { workspaceId, workspace, session };
}

function requireCsrf(
  request: FastifyRequest,
  session: AuthenticatedSession,
  publicOrigin: string,
): void {
  if (request.headers.origin !== publicOrigin) {
    throw new HttpError(403, "csrf-check-failed");
  }
  const headerToken = request.headers["x-csrf-token"];
  const cookieToken = request.cookies[CSRF_COOKIE];
  if (
    typeof headerToken !== "string" ||
    cookieToken === undefined ||
    !hashesMatch(headerToken, session.csrfHash) ||
    !hashesMatch(cookieToken, session.csrfHash)
  ) {
    throw new HttpError(403, "csrf-check-failed");
  }
}

function safeSessionResponse(session: SessionContext) {
  return {
    sessionId: session.sessionId,
    userId: session.userId,
    authenticatedAt: session.authenticatedAt,
    expiresAt: session.expiresAt,
  };
}

const httpOnlyCookieOptions = {
  path: "/",
  secure: true,
  httpOnly: true,
  sameSite: "strict" as const,
};

function setSessionCookies(reply: FastifyReply, rawToken: string, rawCsrfToken: string): void {
  reply.setCookie(SESSION_COOKIE, rawToken, {
    ...httpOnlyCookieOptions,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  reply.setCookie(CSRF_COOKIE, rawCsrfToken, {
    ...httpOnlyCookieOptions,
    httpOnly: false,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

function clearCookie(reply: FastifyReply, name: string, httpOnly: boolean): void {
  reply.clearCookie(name, { ...httpOnlyCookieOptions, httpOnly });
}
