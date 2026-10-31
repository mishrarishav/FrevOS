import { createReadStream } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import cookie from "@fastify/cookie";
import {
  AgentOperationCompletionSchema,
  type AuthCookiePolicy,
  authCookiePolicy,
  authorizeWorkspaceAction,
  ChangePasswordSchema,
  ClientSchema,
  ConnectGithubRepositoryRequestSchema,
  DeploymentSettingsInputSchema,
  GithubConnectionSchema,
  GithubDiscoveryCompletionSchema,
  GithubDiscoveryOperationSchema,
  OperationIdSchema,
  type PermissionScope,
  ProjectAutomationOperationSchema,
  ProjectAutomationProfileSchema,
  ProjectAutomationRequestSchema,
  ProjectIdSchema,
  ProjectRepositoryConnectionSchema,
  ProjectSchema,
  type SessionContext,
  SessionContextSchema,
  SessionSummarySchema,
  UserIdSchema,
  WorkspaceIdSchema,
  WorkspaceSchema,
} from "@frevos/contracts";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { z } from "zod";
import type { AgentNotifications } from "./agent-notifications.js";
import type { AgentWorkspace } from "./agent-workspace.js";
import type { ArtifactPromotions } from "./artifact-promotions.js";
import type { ComponentDeployments } from "./component-deployments.js";
import { hashesMatch, type OidcTransaction, type OidcTransactionCodec } from "./crypto.js";
import type { DeploymentSettingsStore } from "./deployment-settings.js";
import { type DeveloperConnectorStore, SystemPairings } from "./developer-connectors.js";
import {
  type GithubOnboardingStore,
  PERSONAL_AGENT_WORKSPACE_ID,
  WINDOWS_GITHUB_AGENT_ID,
} from "./github-onboarding.js";
import { AccountActionError, type LocalAccounts } from "./local-accounts.js";
import type { LocalDevelopment } from "./local-development.js";
import { type AuthenticatedIdentity, createOidcTransaction, type OidcProvider } from "./oidc.js";
import { type ProjectAutomationStore, TRACKGRN_AGENT_ID } from "./project-automation.js";
import type {
  AuthenticatedSession,
  IdentitySessionRepository,
  WorkspaceEvidence,
  WorkspaceRepository,
} from "./repositories.js";
import {
  type SelfUpdates,
  selfUpdateHtml,
  selfUpdateScript,
  selfUpdateStyle,
} from "./self-updates.js";
import { ServixDeploymentError, type ServixDeploymentStore } from "./servix-deployment.js";
import type { SystemDiscovery } from "./system-discovery.js";
import type { DeviceLogins } from "./device-logins.js";
import type { JoinRequests } from "./join-requests.js";
import type { PreviewRelay } from "./preview-relay.js";
import type { RepositoryCenter } from "./repository-center.js";
import type { GitDesktop } from "./git-desktop.js";

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
const EmptyBodySchema = z.object({}).strict();

interface BuildServerOptions {
  readonly repositoryCenter?: RepositoryCenter;
  readonly gitDesktop?: GitDesktop;
  readonly previewRelay?: PreviewRelay;
  readonly selfUpdates?: SelfUpdates;
  readonly localAccounts?: LocalAccounts;
  readonly deploymentSettings?: DeploymentSettingsStore;
  readonly componentDeployments?: ComponentDeployments;
  readonly publicOrigin: string;
  readonly basePath?: string;
  readonly authMode?: "local" | "oidc";
  readonly oidcProvider?: OidcProvider;
  readonly transactionCodec?: OidcTransactionCodec;
  readonly identitySessions: IdentitySessionRepository;
  readonly workspaces: WorkspaceRepository;
  readonly automation?: ProjectAutomationStore;
  readonly githubOnboarding?: GithubOnboardingStore;
  readonly trackGrnAgentTokenHash?: Buffer;
  readonly readiness?: () => Promise<void>;
  readonly now?: () => Date;
  readonly servixDeployment?: ServixDeploymentStore;
  readonly artifactPromotions?: ArtifactPromotions;
  readonly developerConnectors?: DeveloperConnectorStore;
  readonly localDevelopment?: LocalDevelopment;
  readonly systemDiscovery?: SystemDiscovery;
  readonly deviceLogins?: DeviceLogins;
  readonly joinRequests?: JoinRequests;
  readonly agentWorkspace?: (workspaceId: string) => AgentWorkspace;
  readonly agentNotifications?: (workspaceId: string) => AgentNotifications;
  readonly connectorNotifications?: AgentNotifications;
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

interface GithubDiscoveryOperationParams extends WorkspaceParams {
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

type ServerContext = BuildServerOptions & { readonly authCookies: AuthCookiePolicy };

export async function buildServer(input: BuildServerOptions): Promise<FastifyInstance> {
  const authCookies = authCookiePolicy(new URL(input.publicOrigin).protocol);
  if (!authCookies.secure && input.authMode !== "local") {
    throw new Error("HTTP authentication requires local auth mode");
  }
  const options: ServerContext = { ...input, authCookies };
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
  const deviceLoginCookie = "devsetu-device-login";
  const deviceReceiverCookie = "devsetu-device-receiver";
  const joinCookie = "devsetu-join-request";
  const deviceCookieOptions = {
    httpOnly: true,
    secure: options.authCookies.secure,
    sameSite: "strict" as const,
    path: basePath || "/",
    maxAge: 120,
  };
  server.addHook("preHandler", async (request) => {
    if (
      options.deviceLogins &&
      request.cookies[options.authCookies.session] &&
      request.routeOptions.url?.startsWith(route("/v1/"))
    ) {
      const evidence = await requireSession(
        request,
        options.identitySessions,
        now(),
        options.authCookies.session,
      );
      await options.deviceLogins.authorizeSession(evidence.session.context);
    }
  });

  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof AccountActionError) {
      void reply.status(error.statusCode).send({ error: error.code });
      return;
    }
    if (error instanceof ServixDeploymentError) {
      void reply.status(error.statusCode).send({ error: error.code });
      return;
    }
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
    server.post(route("/auth/join/request"), async (request, reply) => {
      if (request.headers.origin !== options.publicOrigin || !options.joinRequests)
        throw new HttpError(403, "join-unavailable");
      options.joinRequests.rate(request.ip + ":request", 5);
      const result = await options.joinRequests.request(request.body);
      return reply
        .header("cache-control", "no-store")
        .setCookie(joinCookie, result.requester, { ...deviceCookieOptions, maxAge: 86400 })
        .send(result.record);
    });
    server.get(route("/auth/join/status"), async (request, reply) => {
      if (!options.joinRequests) throw new HttpError(503, "join-unavailable");
      return reply
        .header("cache-control", "no-store")
        .send(await options.joinRequests.status(request.cookies[joinCookie] ?? ""));
    });
    for (const action of ["prepare", "redeem"] as const)
      server.post(route("/v1/connector/join/" + action), async (request, reply) => {
        if (!options.joinRequests) throw new HttpError(503, "join-unavailable");
        options.joinRequests.rate(request.ip + ":code", 20);
        return reply
          .header("cache-control", "no-store")
          .send(await options.joinRequests[action](request.body));
      });
    server.post(
      route("/auth/login"),
      {
        schema: {
          response: {
            204: { type: "null" },
            202: { type: "object", additionalProperties: true },
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
        if (options.deviceLogins) {
          const browserState = randomBytes(32).toString("hex");
          const challenge = await options.deviceLogins.begin(principal, browserState);
          if (challenge)
            return reply
              .header("cache-control", "no-store")
              .setCookie(deviceLoginCookie, browserState, deviceCookieOptions)
              .status(202)
              .send(challenge);
        }
        const previousRawToken = request.cookies[options.authCookies.session];
        const session = await options.identitySessions.createSession({
          principal,
          ...(previousRawToken === undefined ? {} : { previousRawToken }),
          now: now(),
        });
        setSessionCookies(reply, session.rawToken, session.rawCsrfToken, options.authCookies);
        return reply.status(204).send();
      },
    );
    server.post(route("/auth/device-login/complete"), async (request, reply) => {
      if (request.headers.origin !== options.publicOrigin || !options.deviceLogins)
        throw new HttpError(403, "device-login-proof-denied");
      const verified = await options.deviceLogins.consume(
        request.body,
        request.cookies[deviceLoginCookie] ?? "",
      );
      const previousRawToken = request.cookies[options.authCookies.session];
      const session = await options.identitySessions.createSession({
        principal: verified.principal,
        ...(previousRawToken === undefined ? {} : { previousRawToken }),
        now: now(),
      });
      await options.deviceLogins.bind(session.context, verified.deviceId, verified.verifiedAt);
      setSessionCookies(reply, session.rawToken, session.rawCsrfToken, options.authCookies);
      reply.clearCookie(deviceLoginCookie, { path: basePath || "/" });
      return reply.header("cache-control", "no-store").status(204).send();
    });
    await server.register(async (localProof) => {
      localProof.addContentTypeParser(
        "application/x-www-form-urlencoded",
        { parseAs: "string", bodyLimit: 2048 },
        (_request, body, done) => {
          try {
            const fields = new URLSearchParams(String(body));
            if (
              fields.size !== 3 ||
              [...fields.keys()].sort().join() !== "challengeId,proof,version" ||
              fields.get("version") !== "1"
            )
              throw new HttpError(400, "invalid-request");
            done(null, {
              version: 1,
              challengeId: fields.get("challengeId"),
              proof: fields.get("proof"),
            });
          } catch (error) {
            done(error as Error);
          }
        },
      );
      localProof.post(
        route("/auth/device-login/receive"),
        { bodyLimit: 2048 },
        async (request, reply) => {
          if (
            !options.deviceLogins ||
            typeof request.headers.origin !== "string" ||
            !/^http:\/\/127\.0\.0\.1:[0-9]{4,5}$/.test(request.headers.origin)
          )
            throw new HttpError(403, "device-login-proof-denied");
          const receiver = await options.deviceLogins.receive(request.body, request.headers.origin);
          return reply
            .header("cache-control", "no-store")
            .setCookie(deviceReceiverCookie, receiver, deviceCookieOptions)
            .redirect(route("/auth/device-login/return"), 303);
        },
      );
    });
    server.get(route("/auth/device-login/return"), async (_request, reply) => {
      const nonce = randomBytes(24).toString("base64url");
      return reply
        .header("cache-control", "no-store")
        .header("referrer-policy", "no-referrer")
        .header(
          "content-security-policy",
          `default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'`,
        )
        .type("text/html")
        .send(
          `<!doctype html><meta charset="utf-8"><title>DevSetu · Verify this computer</title><h1>Completing your sign in</h1><p id="state">Checking this browser and paired computer…</p><script nonce="${nonce}">fetch(${JSON.stringify(route("/auth/device-login/finish"))},{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:'{}',redirect:'error'}).then(r=>{if(r.status!==204)throw Error();location.replace(${JSON.stringify(route("/"))})}).catch(()=>{document.getElementById('state').textContent='Verification expired, pairing changed, or this is a different browser. Return to sign in and retry from your paired computer.'})</script>`,
        );
    });
    server.post(route("/auth/device-login/finish"), async (request, reply) => {
      if (request.headers.origin !== options.publicOrigin || !options.deviceLogins)
        throw new HttpError(403, "device-login-proof-denied");
      EmptyBodySchema.parse(request.body);
      const verified = await options.deviceLogins.finish(
        request.cookies[deviceLoginCookie] ?? "",
        request.cookies[deviceReceiverCookie] ?? "",
      );
      const previousRawToken = request.cookies[options.authCookies.session];
      const session = await options.identitySessions.createSession({
        principal: verified.principal,
        ...(previousRawToken === undefined ? {} : { previousRawToken }),
        now: now(),
      });
      await options.deviceLogins.bind(session.context, verified.deviceId, verified.verifiedAt);
      setSessionCookies(reply, session.rawToken, session.rawCsrfToken, options.authCookies);
      reply.clearCookie(deviceLoginCookie, { path: basePath || "/" });
      reply.clearCookie(deviceReceiverCookie, { path: basePath || "/" });
      return reply.header("cache-control", "no-store").status(204).send();
    });
    server.post(route("/v1/connector/login-proof"), async (request, reply) => {
      if (!options.deviceLogins) throw new HttpError(503, "device-login-unavailable");
      return reply
        .header("cache-control", "no-store")
        .send(await options.deviceLogins.attest(connectorCredential(request), request.body));
    });
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
      const previousRawToken = request.cookies[options.authCookies.session];
      const session = await options.identitySessions.createSession({
        principal,
        ...(previousRawToken === undefined ? {} : { previousRawToken }),
        now: now(),
      });

      setSessionCookies(reply, session.rawToken, session.rawCsrfToken, options.authCookies);
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
      const evidence = await requireSession(
        request,
        options.identitySessions,
        now(),
        options.authCookies.session,
      );
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
      const session = await requireSession(
        request,
        options.identitySessions,
        evaluatedAt,
        options.authCookies.session,
      );
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
      const evidence = await requireSession(
        request,
        options.identitySessions,
        now(),
        options.authCookies.session,
      );
      requireCsrf(request, evidence.session, options.publicOrigin, options.authCookies.csrf);
      await options.identitySessions.revoke(evidence.rawToken, now());
      clearCookie(reply, options.authCookies.session, true, options.authCookies.secure);
      clearCookie(reply, options.authCookies.csrf, false, options.authCookies.secure);
      return reply.status(204).send();
    },
  );

  server.get(route("/v1/account"), async (request) => {
    const evidence = await requireSession(
      request,
      options.identitySessions,
      now(),
      options.authCookies.session,
    );
    if (authMode !== "local" || !options.localAccounts)
      return { account: null, canManageUsers: false };
    const context = evidence.session.context;
    const workspace = await options.workspaces.getEvidence("ws_server20", context.userId);
    return {
      account: await options.localAccounts.profile(context),
      canManageUsers:
        context.userId === "usr_windows_admin" &&
        !!workspace &&
        authorizeWorkspaceAction({
          session: context,
          workspace: workspace.workspace,
          membership: workspace.membership,
          requiredScope: "project:write",
          evaluatedAt: now().toISOString(),
        }).allowed,
    };
  });
  server.post(route("/v1/account/password"), async (request, reply) => {
    const evidence = await requireSession(
      request,
      options.identitySessions,
      now(),
      options.authCookies.session,
    );
    requireCsrf(request, evidence.session, options.publicOrigin, options.authCookies.csrf);
    if (authMode !== "local" || !options.localAccounts)
      throw new HttpError(409, "local-account-unavailable");
    const body = ChangePasswordSchema.parse(request.body);
    await options.localAccounts.change(
      evidence.session.context,
      body.currentPassword,
      body.newPassword,
      evidence.session.context.userId,
      undefined,
      now(),
    );
    clearCookie(reply, options.authCookies.session, true, options.authCookies.secure);
    clearCookie(reply, options.authCookies.csrf, false, options.authCookies.secure);
    return { changed: true };
  });
  const accountOwner = async (
    request: FastifyRequest<{ Params: WorkspaceParams }>,
    write = false,
  ) => {
    const evidence = await requireWorkspace(request, options, "project:write", now());
    if (
      authMode !== "local" ||
      !options.localAccounts ||
      evidence.workspaceId !== "ws_server20" ||
      evidence.session.session.context.userId !== "usr_windows_admin"
    )
      throw new HttpError(403, "account-management-denied");
    if (write)
      requireCsrf(
        request,
        evidence.session.session,
        options.publicOrigin,
        options.authCookies.csrf,
      );
    return evidence;
  };
  server.get<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/users"),
    async (request) => {
      const evidence = await accountOwner(request);
      return options.localAccounts?.list(evidence.workspaceId);
    },
  );
  const platformOwner = async (
    request: FastifyRequest<{ Params: WorkspaceParams }>,
    write = false,
  ) => {
    const evidence = await requireWorkspace(request, options, "project:write", now());
    if (
      authMode !== "local" ||
      !options.selfUpdates ||
      evidence.workspaceId !== "ws_server20" ||
      evidence.session.session.context.userId !== "usr_windows_admin"
    )
      throw new HttpError(403, "platform-update-denied");
    if (write)
      requireCsrf(
        request,
        evidence.session.session,
        options.publicOrigin,
        options.authCookies.csrf,
      );
  };
  server.get<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/platform-update"),
    async (request) => {
      await platformOwner(request);
      return options.selfUpdates?.state();
    },
  );
  server.post<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/platform-update"),
    async (request) => {
      await platformOwner(request, true);
      const body = z
        .object({
          candidateId: z.string().regex(/^[a-f0-9]{32}$/),
          manifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
          changeDetails: DeploymentChangeSchema,
        })
        .strict()
        .parse(request.body);
      try {
        return await options.selfUpdates?.request(
          body.candidateId,
          body.manifestSha256,
          body.changeDetails,
        );
      } catch {
        throw new HttpError(409, "platform-candidate-changed");
      }
    },
  );
  server.get(route("/maintenance"), async (request, reply) => {
    const session = await requireSession(
      request,
      options.identitySessions,
      now(),
      options.authCookies.session,
    );
    if (session.session.context.userId !== "usr_windows_admin" || !options.selfUpdates)
      throw new HttpError(403, "platform-update-denied");
    const workspace = await options.workspaces.getEvidence(
      "ws_server20",
      session.session.context.userId,
    );
    if (
      !workspace ||
      !authorizeWorkspaceAction({
        session: session.session.context,
        workspace: workspace.workspace,
        membership: workspace.membership,
        requiredScope: "project:write",
        evaluatedAt: now().toISOString(),
      }).allowed
    )
      throw new HttpError(403, "platform-update-denied");
    return reply.header("cache-control", "no-store").type("text/html").send(selfUpdateHtml);
  });
  server.get(route("/maintenance.js"), async (_request, reply) =>
    reply.header("cache-control", "no-store").type("application/javascript").send(selfUpdateScript),
  );
  server.get(route("/maintenance.css"), async (_request, reply) =>
    reply.header("cache-control", "no-store").type("text/css").send(selfUpdateStyle),
  );
  server.post<{ Params: WorkspaceParams & { userId: string } }>(
    route("/v1/workspaces/:workspaceId/users/:userId/password"),
    async (request, reply) => {
      const evidence = await accountOwner(request, true);
      const target = UserIdSchema.parse(request.params.userId);
      const body = ChangePasswordSchema.parse(request.body);
      await options.localAccounts?.change(
        evidence.session.session.context,
        body.currentPassword,
        body.newPassword,
        target,
        evidence.workspaceId,
        now(),
      );
      if (target === evidence.session.session.context.userId) {
        clearCookie(reply, options.authCookies.session, true, options.authCookies.secure);
        clearCookie(reply, options.authCookies.csrf, false, options.authCookies.secure);
      }
      return { changed: true };
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
      requireCsrf(request, session.session, options.publicOrigin, options.authCookies.csrf);
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
    route("/v1/workspaces/:workspaceId/github/connections"),
    async (request) => {
      const { workspaceId } = await requireWorkspace(request, options, "project:read", now());
      return (await requireGithubOnboarding(options).listConnections(workspaceId)).map(
        (connection) => GithubConnectionSchema.parse(connection),
      );
    },
  );

  server.post<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/github/discovery"),
    async (request, reply) => {
      const { workspaceId, session } = await requireWorkspace(
        request,
        options,
        "project:write",
        now(),
      );
      requireCsrf(request, session.session, options.publicOrigin, options.authCookies.csrf);
      EmptyBodySchema.parse(request.body);
      if (workspaceId !== PERSONAL_AGENT_WORKSPACE_ID) {
        throw new HttpError(409, "github-companion-unavailable");
      }
      const operation = await requireGithubOnboarding(options).createDiscoveryOperation({
        workspaceId,
        requestedBy: session.session.context.userId,
        now: now(),
      });
      return reply.status(202).send(GithubDiscoveryOperationSchema.parse(operation));
    },
  );

  server.get<{ Params: GithubDiscoveryOperationParams }>(
    route("/v1/workspaces/:workspaceId/github/discovery/:operationId"),
    async (request) => {
      const { workspaceId } = await requireWorkspace(request, options, "project:read", now());
      const operationId = OperationIdSchema.parse(request.params.operationId);
      const operation = await requireGithubOnboarding(options).getDiscoveryOperation(
        workspaceId,
        operationId,
      );
      if (operation === null) {
        throw new HttpError(404, "github-discovery-not-found");
      }
      return GithubDiscoveryOperationSchema.parse(operation);
    },
  );

  server.get<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/repository-connections"),
    async (request) => {
      const { workspaceId } = await requireWorkspace(request, options, "project:read", now());
      return (await requireGithubOnboarding(options).listProjectConnections(workspaceId)).map(
        (connection) => ProjectRepositoryConnectionSchema.parse(connection),
      );
    },
  );

  server.post<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/repository-connections"),
    async (request, reply) => {
      const { workspaceId, session } = await requireWorkspace(
        request,
        options,
        "project:write",
        now(),
      );
      requireCsrf(request, session.session, options.publicOrigin, options.authCookies.csrf);
      const connection = await requireGithubOnboarding(options).connectRepository({
        workspaceId,
        request: ConnectGithubRepositoryRequestSchema.parse(request.body),
        now: now(),
      });
      if (connection === null) {
        throw new HttpError(409, "repository-connection-unavailable");
      }
      return reply.status(201).send(ProjectRepositoryConnectionSchema.parse(connection));
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
      requireCsrf(request, session.session, options.publicOrigin, options.authCookies.csrf);
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
      requireCsrf(request, session.session, options.publicOrigin, options.authCookies.csrf);
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

  const connectors = () => {
    if (!options.developerConnectors) throw new HttpError(503, "connector-setup-unavailable");
    return options.developerConnectors;
  };
  const connectorCredential = (request: FastifyRequest) => {
    const value = request.headers.authorization;
    if (!value?.startsWith("Bearer "))
      throw new HttpError(401, "connector-authentication-required");
    return value.slice(7);
  };
  const agentContext = async (
    request: FastifyRequest<{ Params: WorkspaceParams }>,
    write = false,
  ) => {
    const evidence = await requireWorkspace(
      request,
      options,
      write ? "project:write" : "project:read",
      now(),
    );
    if (write)
      requireCsrf(
        request,
        evidence.session.session,
        options.publicOrigin,
        options.authCookies.csrf,
      );
    if (!options.agentWorkspace) throw new HttpError(503, "agent-workspace-unavailable");
    return {
      service: options.agentWorkspace(evidence.workspaceId),
      actor: evidence.session.session.context.userId,
    };
  };
  server.get<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/agents"),
    async (request) => {
      const c = await agentContext(request);
      return c.service.state(c.actor);
    },
  );
  server.post<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/agents/models/prepare"),
    async (request) => {
      const c = await agentContext(request, true);
      return c.service.prepareModel(c.actor, request.body);
    },
  );
  server.post<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/agents/models/commit"),
    async (request) => {
      const c = await agentContext(request, true);
      return c.service.commitModel(c.actor, request.body);
    },
  );
  server.post<{ Params: WorkspaceParams & { connectionId: string } }>(
    route("/v1/workspaces/:workspaceId/agents/models/:connectionId/test"),
    async (request, reply) => {
      const c = await agentContext(request, true);
      if (request.body && Object.keys(request.body).length)
        throw new HttpError(400, "invalid-request");
      // Only this authenticated, CSRF-checked and concurrency-bounded probe may
      // outlive the normal idle socket limit (DNS + protected key + inference).
      if (typeof reply.raw.setTimeout === "function")
        reply.raw.setTimeout(40_000, () => reply.raw.destroy());
      return c.service.testModel(c.actor, request.params.connectionId);
    },
  );
  server.post<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/agents/configuration"),
    async (request) => {
      const c = await agentContext(request, true);
      return c.service.saveAgent(c.actor, request.body);
    },
  );
  server.post<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/agents/runs"),
    async (request, reply) => {
      const c = await agentContext(request, true);
      return reply.status(202).send(await c.service.requestRun(c.actor, request.body));
    },
  );
  const notificationContext = async (
    request: FastifyRequest<{ Params: WorkspaceParams }>,
    write = false,
  ) => {
    const c = await agentContext(request, write);
    if (!options.agentNotifications) throw new HttpError(503, "notifications-unavailable");
    return { service: options.agentNotifications(request.params.workspaceId), actor: c.actor };
  };
  server.get<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/agents/notifications"),
    async (request) => {
      const c = await notificationContext(request);
      return c.service.state(c.actor);
    },
  );
  server.post<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/agents/notifications/draft"),
    async (request) => {
      const c = await notificationContext(request, true);
      return c.service.draft(c.actor, request.body);
    },
  );
  server.post<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/agents/notifications/approve"),
    async (request) => {
      const c = await notificationContext(request, true);
      return c.service.approve(c.actor, request.body);
    },
  );
  server.post(route("/v1/connector/notifications/claim"), async (request) => {
    if (!options.connectorNotifications) throw new HttpError(503, "notifications-unavailable");
    return {
      job: await options.connectorNotifications.claim(connectorCredential(request), request.body),
    };
  });
  server.post(route("/v1/connector/notifications/complete"), async (request) => {
    if (!options.connectorNotifications) throw new HttpError(503, "notifications-unavailable");
    return options.connectorNotifications.complete(connectorCredential(request), request.body);
  });
  const connectorActor = async (
    request: FastifyRequest<{ Params: WorkspaceParams }>,
    write = false,
  ) => {
    const evidence = await requireWorkspace(
      request,
      options,
      write ? "project:write" : "project:read",
      now(),
    );
    if (evidence.workspaceId !== "ws_server20")
      throw new HttpError(404, "connector-profile-not-found");
    if (write)
      requireCsrf(
        request,
        evidence.session.session,
        options.publicOrigin,
        options.authCookies.csrf,
      );
    return evidence.session.session.context.userId;
  };
  server.get<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/git-desktop"),
    async (request) => {
      const e = await requireWorkspace(request, options, "project:read", now());
      if (!options.gitDesktop) return { devices: [], folders: [], jobs: [] };
      return options.gitDesktop.state(e.session.session.context.userId, e.workspaceId);
    },
  );
  for (const action of ["select", "actions", "connect", "pick"] as const)
    server.post<{ Params: WorkspaceParams }>(
      route("/v1/workspaces/:workspaceId/git-desktop/" + action),
      async (request) => {
        const e = await requireWorkspace(request, options, "project:write", now());
        requireCsrf(request, e.session.session, options.publicOrigin, options.authCookies.csrf);
        if (!options.gitDesktop) throw new HttpError(503, "git-desktop-not-configured");
        return action === "pick"
          ? options.gitDesktop.pick(e.session.session.context.userId, e.workspaceId, request.body)
          : action === "select"
            ? options.gitDesktop.select(
                e.session.session.context.userId,
                e.workspaceId,
                request.body,
              )
            : action === "connect"
              ? options.gitDesktop.connect(
                  e.session.session.context.userId,
                  e.workspaceId,
                  request.body,
                )
              : options.gitDesktop.action(
                  e.session.session.context.userId,
                  e.workspaceId,
                  request.body,
                );
      },
    );
  server.get<{ Params: WorkspaceParams & { pickerId: string } }>(
    route("/v1/workspaces/:workspaceId/git-desktop/pick/:pickerId"),
    async (request) => {
      const e = await requireWorkspace(request, options, "project:read", now());
      if (!options.gitDesktop) throw new HttpError(503, "git-desktop-not-configured");
      return options.gitDesktop.picker(
        e.session.session.context.userId,
        e.workspaceId,
        request.params.pickerId,
      );
    },
  );
  server.post<{ Params: { pickerId: string } }>(
    route("/v1/connector/git-desktop/pickers/:pickerId/complete"),
    async (request) => {
      if (!options.gitDesktop) throw new HttpError(503, "git-desktop-not-configured");
      return options.gitDesktop.completePicker(
        connectorCredential(request),
        request.params.pickerId,
        request.body,
      );
    },
  );
  server.post(route("/v1/connector/git-desktop/claim"), async (request) => {
    if (!options.gitDesktop) return { jobs: [] };
    return options.gitDesktop.claim(connectorCredential(request), request.body);
  });
  server.post(route("/v1/connector/git-desktop/identity"), async (request) => {
    if (!options.gitDesktop) throw new HttpError(503, "git-desktop-not-configured");
    return options.gitDesktop.identity(connectorCredential(request));
  });
  server.post<{ Params: { jobId: string } }>(
    route("/v1/connector/git-desktop/:jobId/complete"),
    async (request) => {
      if (!options.gitDesktop) throw new HttpError(503, "git-desktop-not-configured");
      return options.gitDesktop.complete(
        connectorCredential(request),
        request.params.jobId,
        request.body,
      );
    },
  );
  server.post<{ Params: { jobId: string } }>(
    route("/v1/connector/git-desktop/:jobId/download"),
    async (request) => {
      if (!options.gitDesktop) throw new HttpError(503, "git-desktop-not-configured");
      return options.gitDesktop.download(connectorCredential(request), request.params.jobId);
    },
  );
  server.post<{ Params: { jobId: string } }>(
    route("/v1/connector/git-desktop/:jobId/publish"),
    {
      bodyLimit: 67108864,
      onRequest: async (request) => {
        if (!options.gitDesktop) throw new HttpError(503, "git-desktop-not-configured");
        await options.gitDesktop.authorizeJob(connectorCredential(request), request.params.jobId);
      },
    },
    async (request) => {
      return options.gitDesktop!.publish(
        connectorCredential(request),
        request.params.jobId,
        String(request.headers["x-devsetu-source-head"] ?? ""),
        request.body as Buffer,
      );
    },
  );
  server.get<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/repository-center"),
    async (request) => {
      const e = await requireWorkspace(request, options, "project:read", now());
      if (!options.repositoryCenter) return { configured: false, repositories: [] };
      return options.repositoryCenter.state(e.session.session.context.userId, e.workspaceId);
    },
  );
  server.get<{ Params: WorkspaceParams & { repositoryId: string } }>(
    route("/v1/workspaces/:workspaceId/repository-center/:repositoryId"),
    async (request) => {
      const e = await requireWorkspace(request, options, "project:read", now());
      if (!options.repositoryCenter) throw new HttpError(503, "repository-hosting-not-configured");
      return options.repositoryCenter.details(
        e.session.session.context.userId,
        e.workspaceId,
        request.params.repositoryId,
      );
    },
  );
  server.get<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/repository-center/recovery"),
    async (request) => {
      const e = await requireWorkspace(request, options, "project:read", now());
      return options.repositoryCenter
        ? options.repositoryCenter.recoveryState(e.session.session.context.userId, e.workspaceId)
        : { configured: false, backups: [] };
    },
  );
  server.post<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/repository-center/recovery"),
    async (request) => {
      const e = await requireWorkspace(request, options, "project:write", now());
      requireCsrf(request, e.session.session, options.publicOrigin, options.authCookies.csrf);
      if (!options.repositoryCenter) throw new HttpError(503, "repository-hosting-not-configured");
      return options.repositoryCenter.recover(
        e.session.session.context.userId,
        e.workspaceId,
        request.body,
      );
    },
  );
  server.post<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/repository-center/create"),
    async (request) => {
      const e = await requireWorkspace(request, options, "project:write", now());
      requireCsrf(request, e.session.session, options.publicOrigin, options.authCookies.csrf);
      if (!options.repositoryCenter) throw new HttpError(503, "repository-hosting-not-configured");
      return options.repositoryCenter.create(
        e.session.session.context.userId,
        e.workspaceId,
        request.body,
      );
    },
  );
  server.post<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/repository-center/actions"),
    async (request) => {
      const e = await requireWorkspace(request, options, "project:write", now());
      requireCsrf(request, e.session.session, options.publicOrigin, options.authCookies.csrf);
      if (!options.repositoryCenter) throw new HttpError(503, "repository-hosting-not-configured");
      return options.repositoryCenter.action(
        e.session.session.context.userId,
        e.workspaceId,
        request.body,
      );
    },
  );
  for (const action of ["open", "close"] as const) {
    server.post<{ Params: WorkspaceParams }>(
      route("/v1/workspaces/:workspaceId/local-development/preview/" + action),
      async (request) => {
        const evidence = await requireWorkspace(request, options, "project:write", now());
        requireCsrf(
          request,
          evidence.session.session,
          options.publicOrigin,
          options.authCookies.csrf,
        );
        const relay = options.previewRelay;
        if (!relay) throw new HttpError(503, "preview-not-configured");
        const actor = evidence.session.session.context.userId;
        if (action === "close") return relay.end(actor, evidence.workspaceId, request.body);
        return relay.open(actor, evidence.workspaceId, request.body, async () => {
          const live = await options.identitySessions.authenticate(
            evidence.session.rawToken,
            now(),
          );
          if (
            !live ||
            live.context.userId !== actor ||
            live.context.sessionId !== evidence.session.session.context.sessionId
          )
            throw new ServixDeploymentError("preview-authentication-required", 401);
          await options.deviceLogins?.authorizeSession(live.context);
          const workspace = await options.workspaces.getEvidence(evidence.workspaceId, actor);
          if (
            !workspace ||
            !authorizeWorkspaceAction({
              session: live.context,
              workspace: workspace.workspace,
              membership: workspace.membership,
              requiredScope: "project:write",
              evaluatedAt: now().toISOString(),
            }).allowed
          )
            throw new ServixDeploymentError("preview-workspace-access-denied", 403);
        });
      },
    );
  }
  server.post(route("/v1/connector/preview/identity"), async (request) => {
    if (!options.localDevelopment) throw new HttpError(503, "preview-source-identity-unavailable");
    return options.localDevelopment.connectorIdentity(connectorCredential(request));
  });
  server.post(route("/v1/connector/preview/claim"), async (request) => {
    if (!options.previewRelay) throw new HttpError(503, "preview-not-configured");
    return options.previewRelay.claim(connectorCredential(request));
  });
  server.post(
    route("/v1/connector/preview/complete"),
    { bodyLimit: 23_000_000 },
    async (request) => {
      if (!options.previewRelay) throw new HttpError(503, "preview-not-configured");
      return options.previewRelay.complete(connectorCredential(request), request.body);
    },
  );
  const components = () => {
    if (!options.componentDeployments)
      throw new HttpError(503, "component-deployments-unavailable");
    return options.componentDeployments;
  };
  server.get<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/connectors/join-requests"),
    async (request) => {
      const actor = await connectorActor(request);
      if (!options.joinRequests) throw new HttpError(503, "join-unavailable");
      return options.joinRequests.list(actor);
    },
  );
  server.post<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/connectors/join-requests/decision"),
    async (request) => {
      const actor = await connectorActor(request, true);
      if (!options.joinRequests) throw new HttpError(503, "join-unavailable");
      return options.joinRequests.decide(actor, request.body);
    },
  );
  const localDevelopment = () => {
    if (!options.localDevelopment) throw new HttpError(503, "local-development-unavailable");
    return options.localDevelopment;
  };
  const discovery = () => {
    if (!options.systemDiscovery) throw new HttpError(503, "discovery-unavailable");
    return options.systemDiscovery;
  };
  let pairingStore: SystemPairings | undefined;
  const pairings = () =>
    (pairingStore ??= new SystemPairings(
      join(connectors().root, "enrollments"),
      connectors(),
      discovery(),
      now,
      async (actor, requestedOwner) => {
        const owner = requestedOwner ?? actor;
        await connectors().authorizeSystemPairing(actor);
        if (owner !== actor && !(await connectors().discoveryAccess(actor)).canManagePlans)
          throw new HttpError(403, "pairing-owner-denied");
        const evidence = await options.workspaces.getEvidence("ws_server20", owner);
        if (
          evidence?.workspace.status !== "active" ||
          evidence.membership?.status !== "active" ||
          evidence.membership.userId !== owner ||
          !evidence.membership.grantedScopes.some((scope) => scope === "project:write")
        )
          throw new HttpError(403, "pairing-owner-denied");
        return owner;
      },
    ));
  server.post(route("/v1/connector/enrollment/start"), async (request, reply) => {
    if (request.headers.origin !== options.publicOrigin)
      throw new HttpError(403, "pairing-origin-denied");
    return reply
      .header("cache-control", "no-store")
      .send(await pairings().start(request.body, request.ip));
  });
  server.get<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/connectors/enrollment-owners"),
    async (request) => {
      const actor = await connectorActor(request);
      await connectors().authorizeSystemPairing(actor);
      if (!(await connectors().discoveryAccess(actor)).canManagePlans || !options.localAccounts)
        throw new HttpError(403, "system-registration-admin-required");
      return (await options.localAccounts.list(request.params.workspaceId)).filter(
        (account) => account.status === "active",
      );
    },
  );
  server.post(route("/v1/connector/enrollment/poll"), async (request, reply) => {
    z.object({}).strict().parse(request.body);
    return reply
      .header("cache-control", "no-store")
      .send(await pairings().poll(connectorCredential(request)));
  });
  server.post(route("/v1/connector/system-status"), async (request, reply) => {
    z.object({}).strict().parse(request.body);
    return reply
      .header("cache-control", "no-store")
      .send(await pairings().status(connectorCredential(request)));
  });
  server.post<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/connectors/enrollments/lookup"),
    async (request, reply) =>
      reply
        .header("cache-control", "no-store")
        .send(await pairings().lookup(await connectorActor(request, true), request.body)),
  );
  server.post<{ Params: WorkspaceParams & { enrollmentId: string } }>(
    route("/v1/workspaces/:workspaceId/connectors/enrollments/:enrollmentId/decision"),
    async (request, reply) =>
      reply
        .header("cache-control", "no-store")
        .send(
          await pairings().decide(
            await connectorActor(request, true),
            request.params.enrollmentId,
            request.body,
          ),
        ),
  );
  server.get<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/discovery"),
    async (request) =>
      discovery().state(
        await connectorActor(request),
        z
          .object({
            historyDeviceId: z
              .string()
              .regex(/^fc_[a-f0-9]{32}$/)
              .optional(),
          })
          .strict()
          .parse(request.query).historyDeviceId,
      ),
  );
  server.post<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/discovery/folders"),
    async (request) =>
      discovery().requestFolders(await connectorActor(request, true), request.body),
  );
  server.get<{ Params: WorkspaceParams & { requestId: string } }>(
    route("/v1/workspaces/:workspaceId/discovery/folders/:requestId"),
    async (request) => discovery().folders(await connectorActor(request), request.params.requestId),
  );
  server.post(route("/v1/connector/discovery/folders/claim"), async (request) => ({
    job: await discovery().claimFolders(connectorCredential(request)),
  }));
  server.post(route("/v1/connector/discovery/folders/complete"), async (request) =>
    discovery().finishFolders(connectorCredential(request), request.body),
  );
  server.post<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/discovery/project-folders"),
    async (request) =>
      discovery().requestProjectFolders(await connectorActor(request, true), request.body),
  );
  server.get<{ Params: WorkspaceParams & { requestId: string } }>(
    route("/v1/workspaces/:workspaceId/discovery/project-folders/:requestId"),
    async (request) =>
      discovery().projectFolders(await connectorActor(request), request.params.requestId),
  );
  server.post(route("/v1/connector/discovery/project-folders/claim"), async (request) => ({
    job: await discovery().claimProjectFolders(connectorCredential(request)),
  }));
  server.post(route("/v1/connector/discovery/project-folders/complete"), async (request) =>
    discovery().finishProjectFolders(connectorCredential(request), request.body),
  );
  server.post<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/discovery/policy"),
    async (request) => discovery().configure(await connectorActor(request, true), request.body),
  );
  server.post<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/discovery/content"),
    async (request) =>
      discovery().requestContent(await connectorActor(request, true), request.body),
  );
  server.get<{ Params: WorkspaceParams & { requestId: string } }>(
    route("/v1/workspaces/:workspaceId/discovery/content/:requestId"),
    async (request) => discovery().content(await connectorActor(request), request.params.requestId),
  );
  server.post(route("/v1/connector/discovery/content/claim"), async (request) => ({
    job: await discovery().claimContent(connectorCredential(request)),
  }));
  server.post(route("/v1/connector/discovery/content/complete"), async (request) =>
    discovery().finishContent(connectorCredential(request), request.body),
  );
  server.post<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/discovery/activity-settings"),
    async (request) =>
      discovery().configureActivity(await connectorActor(request, true), request.body),
  );
  server.post<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/discovery/plans"),
    async (request) => discovery().savePlan(await connectorActor(request, true), request.body),
  );
  server.post(route("/v1/connector/discovery/policy"), async (request) =>
    discovery().policyForConnector(connectorCredential(request)),
  );
  server.post(route("/v1/connector/discovery/observe"), async (request) =>
    discovery().observe(connectorCredential(request), request.body),
  );
  server.get<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/local-development"),
    async (request) => localDevelopment().state(await connectorActor(request)),
  );
  server.post<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/local-development/actions"),
    async (request, reply) =>
      reply
        .status(202)
        .send(await localDevelopment().request(await connectorActor(request, true), request.body)),
  );
  server.post(route("/v1/connector/local-development/observe"), async (request) =>
    localDevelopment().observe(connectorCredential(request), request.body),
  );
  server.post(route("/v1/connector/local-development/claim"), async (request) => ({
    job: await localDevelopment().claim(connectorCredential(request)),
  }));
  server.post(route("/v1/connector/local-development/complete"), async (request) =>
    localDevelopment().complete(connectorCredential(request), request.body),
  );
  server.post<{ Params: WorkspaceParams & { profileId: string } }>(
    route("/v1/workspaces/:workspaceId/component-deployments/:profileId/test"),
    async (request) => {
      const actor = await connectorActor(request, true),
        body = z
          .object({ deviceId: z.string().regex(/^fc_[a-f0-9]{32}$/) })
          .strict()
          .parse(request.body);
      return components().test(actor, request.params.profileId, body.deviceId);
    },
  );
  server.get<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/component-deployments"),
    async (request) => components().state(await connectorActor(request)),
  );
  server.post<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/component-deployments/configuration"),
    async (request) => components().save(await connectorActor(request, true), request.body),
  );
  server.post<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/component-deployments/executors"),
    async (request, reply) =>
      reply
        .header("cache-control", "no-store")
        .send(await components().enroll(await connectorActor(request, true), request.body)),
  );
  server.post<{ Params: WorkspaceParams & { executorId: string } }>(
    route("/v1/workspaces/:workspaceId/component-deployments/executors/:executorId/revoke"),
    async (request) =>
      components().revoke(await connectorActor(request, true), request.params.executorId),
  );
  server.post<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/component-deployments/runs"),
    async (request, reply) =>
      reply
        .status(202)
        .send(await components().request(await connectorActor(request, true), request.body)),
  );
  server.post<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/component-deployments/close-interrupted-build"),
    async (request) =>
      components().closeInterruptedBuild(await connectorActor(request, true), request.body),
  );
  server.post(route("/v1/executor/heartbeat"), async (request) =>
    components().heartbeat(connectorCredential(request), request.body),
  );
  server.post(route("/v1/executor/claim"), async (request) => ({
    job: await components().claim(connectorCredential(request)),
  }));
  server.get<{ Params: { jobId: string } }>(
    route("/v1/executor/jobs/:jobId/artifact"),
    async (request, reply) =>
      reply
        .header("cache-control", "no-store")
        .type("application/octet-stream")
        .send(
          createReadStream(
            await components().artifact(connectorCredential(request), request.params.jobId),
          ),
        ),
  );
  server.get<{ Params: { jobId: string } }>(
    route("/v1/executor/jobs/:jobId/previous-artifact"),
    async (request, reply) =>
      reply
        .header("cache-control", "no-store")
        .type("application/octet-stream")
        .send(
          createReadStream(
            await components().artifact(connectorCredential(request), request.params.jobId, true),
          ),
        ),
  );
  server.addContentTypeParser(
    "application/octet-stream",
    { parseAs: "buffer" },
    (_request, body, done) => done(null, body),
  );
  server.post<{ Params: { jobId: string } }>(
    route("/v1/executor/jobs/:jobId/artifact"),
    { bodyLimit: 512 * 1024 * 1024 },
    async (request) => {
      if (!Buffer.isBuffer(request.body)) throw new HttpError(400, "component-artifact-required");
      return components().upload(connectorCredential(request), request.params.jobId, request.body);
    },
  );
  server.post<{ Params: { jobId: string } }>(
    route("/v1/executor/jobs/:jobId/complete"),
    async (request) =>
      components().complete(connectorCredential(request), request.params.jobId, request.body),
  );
  server.get(route("/downloads/frevos-connector.zip"), async (_request, reply) =>
    reply
      .header("cache-control", "no-store")
      .header("content-disposition", 'attachment; filename="DevSetu-System-Connector-Windows.zip"')
      .type("application/zip")
      .send(
        createReadStream(
          fileURLToPath(new URL("../../../deployment/servix/connector.zip", import.meta.url)),
        ),
      ),
  );
  server.get<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/connectors"),
    async (request) => connectors().list(await connectorActor(request)),
  );
  server.get(route("/downloads/devsetu-connector-linux-x64.tar.gz"), async (_request, reply) =>
    reply
      .header("cache-control", "no-store")
      .header(
        "content-disposition",
        'attachment; filename="DevSetu-System-Connector-Linux-x64.tar.gz"',
      )
      .type("application/gzip")
      .send(
        createReadStream(
          fileURLToPath(
            new URL(
              "../../../deployment/servix/devsetu-connector-linux-x64.tar.gz",
              import.meta.url,
            ),
          ),
        ),
      ),
  );
  server.get(route("/downloads/devsetu-connector-android.apk"), async (_request, reply) =>
    reply
      .header("cache-control", "no-store")
      .header("content-disposition", 'attachment; filename="DevSetu-System-Connector-Android.apk"')
      .header("x-content-type-options", "nosniff")
      .type("application/vnd.android.package-archive")
      .send(
        createReadStream(
          fileURLToPath(
            new URL("../../../deployment/servix/devsetu-connector-android.apk", import.meta.url),
          ),
        ),
      ),
  );
  server.post<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/connectors/pair"),
    async (request, reply) =>
      reply
        .header("cache-control", "no-store")
        .send(await connectors().pair(await connectorActor(request, true), request.body)),
  );
  server.post<{ Params: WorkspaceParams & { deviceId: string } }>(
    route("/v1/workspaces/:workspaceId/connectors/:deviceId/revoke"),
    async (request) =>
      connectors().revoke(await connectorActor(request, true), request.params.deviceId),
  );
  server.post<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/developers/invite"),
    async (request, reply) =>
      reply
        .header("cache-control", "no-store")
        .send(await connectors().invite(await connectorActor(request, true), request.body)),
  );
  server.post(route("/v1/developers/redeem"), async (request, reply) =>
    reply.header("cache-control", "no-store").send(await connectors().redeem(request.body)),
  );
  server.post(route("/v1/connector/claim"), async (request) => ({
    job: await connectors().claim(connectorCredential(request)),
  }));
  server.post(route("/v1/connector/heartbeat"), async (request) =>
    connectors().heartbeat(connectorCredential(request), request.body ?? {}),
  );
  server.post<{ Params: WorkspaceParams & { deviceId: string } }>(
    route("/v1/workspaces/:workspaceId/connectors/:deviceId/choose-folder"),
    async (request) => {
      const actor = await connectorActor(request, true);
      const body = z
        .object({
          browseRequestId: z
            .string()
            .regex(/^fb_[a-f0-9]{32}$/)
            .optional(),
          path: z.string().max(1024).optional(),
        })
        .strict()
        .parse(request.body);
      const repository = body.browseRequestId
        ? await discovery().selectedFolder(actor, request.params.deviceId, body)
        : undefined;
      if (!body.browseRequestId && body.path !== undefined)
        throw new HttpError(400, "folder-selection-invalid");
      return connectors().chooseFolder(actor, request.params.deviceId, repository);
    },
  );
  server.post(route("/v1/connector/folder/claim"), async (request) => ({
    selection: await connectors().claimFolder(connectorCredential(request)),
  }));
  server.post(route("/v1/connector/folder/complete"), async (request) =>
    connectors().finishFolder(connectorCredential(request), request.body),
  );
  const promotions = (workspaceId: string) => {
    if (!options.artifactPromotions) throw new HttpError(503, "promotion-unavailable");
    if (options.artifactPromotions.workspaceId !== workspaceId)
      throw new HttpError(404, "promotion-unavailable");
    return options.artifactPromotions;
  };
  server.get<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/artifact-promotions"),
    async (request) => {
      const actor = await connectorActor(request);
      return promotions(request.params.workspaceId).state(actor);
    },
  );
  server.post<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/artifact-promotions/prepare"),
    async (request, reply) => {
      const actor = await connectorActor(request, true);
      return reply
        .status(202)
        .send(await promotions(request.params.workspaceId).prepare(actor, request.body));
    },
  );
  server.post<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/artifact-promotions/approve"),
    async (request, reply) => {
      const actor = await connectorActor(request, true);
      return reply
        .status(202)
        .send(await promotions(request.params.workspaceId).approve(actor, request.body));
    },
  );
  const settings = () => {
    if (!options.deploymentSettings) throw new HttpError(503, "deployment-settings-unavailable");
    return options.deploymentSettings;
  };
  server.get<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/deployment-settings"),
    async (request) => {
      const actor = await connectorActor(request);
      const configured = (await options.componentDeployments?.projectSettings(actor)) ?? [];
      return [
        ...(await settings().list(actor)).filter(
          (p) => !configured.some((c) => c.profileId === p.profileId),
        ),
        ...configured,
      ];
    },
  );
  server.post<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/deployment-settings"),
    async (request) => {
      const actor = await connectorActor(request, true);
      const candidate = DeploymentSettingsInputSchema.parse(request.body);
      if (await options.componentDeployments?.profile(candidate.profileId))
        throw new HttpError(409, "component-configuration-required");
      return settings().save(actor, request.body);
    },
  );
  server.post<{ Params: WorkspaceParams & { profileId: string } }>(
    route("/v1/workspaces/:workspaceId/deployment-settings/:profileId/test"),
    async (request) => {
      const actor = await connectorActor(request, true);
      const body = z
        .object({
          deviceId: z
            .string()
            .regex(/^fc_[a-f0-9]{32}$/)
            .optional(),
        })
        .strict()
        .parse(request.body);
      return settings().test(
        actor,
        request.params.profileId,
        body.deviceId,
        connectors(),
        async () => {
          if (!(await options.servixDeployment?.state())?.runnerOnline) return false;
          const response = await fetch("http://10.9.69.21:82/api/health", {
            redirect: "error",
            signal: AbortSignal.timeout(4000),
          });
          if (!response.ok) return false;
          const health = z
            .object({
              status: z.literal("OK"),
              authBootstrapReady: z.literal(true),
              fullBootstrapReady: z.literal(true),
            })
            .safeParse(await response.json());
          return health.success;
        },
      );
    },
  );
  server.post(route("/v1/connector/source-base"), async (request, reply) => {
    const store = connectors(),
      file = await store.baseline(connectorCredential(request), request.body);
    const stream = createReadStream(file);
    stream.once("close", () => {
      void store.releaseBaseline(file).catch(() => undefined);
    });
    return reply.header("cache-control", "no-store").type("application/x-git-bundle").send(stream);
  });
  server.post<{ Params: { requestId: string } }>(
    route("/v1/connector/jobs/:requestId/fail"),
    async (request) =>
      connectors().fail(connectorCredential(request), request.params.requestId, request.body),
  );
  server.addContentTypeParser(
    "application/x-git-bundle",
    { parseAs: "buffer" },
    (_request, body, done) => done(null, body),
  );
  server.post(
    route("/v1/connector/source-seed"),
    { bodyLimit: 64 * 1024 * 1024 },
    async (request) => {
      if (!Buffer.isBuffer(request.body)) throw new HttpError(400, "connector-bundle-required");
      const head = request.headers["x-frevos-source-head"];
      if (typeof head !== "string") throw new HttpError(400, "connector-source-head-required");
      return connectors().seed(connectorCredential(request), head, request.body);
    },
  );
  server.post<{ Params: { requestId: string } }>(
    route("/v1/connector/jobs/:requestId/bundle"),
    {
      bodyLimit: 64 * 1024 * 1024,
      onRequest: async (request) => connectors().checkCredential(connectorCredential(request)),
    },
    async (request) => {
      if (!Buffer.isBuffer(request.body)) throw new HttpError(400, "connector-bundle-required");
      const head = request.headers["x-frevos-source-head"];
      if (typeof head !== "string") throw new HttpError(400, "connector-source-head-required");
      return connectors().complete(
        connectorCredential(request),
        request.params.requestId,
        head,
        request.body,
      );
    },
  );
  server.get<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/servix/deployments"),
    async (request) => {
      const { workspaceId } = await requireWorkspace(request, options, "project:read", now());
      if (workspaceId !== "ws_server20") throw new HttpError(404, "deployment-profile-not-found");
      if (!options.servixDeployment)
        return {
          available: false,
          runnerOnline: false,
          source: "server20 / servix.git / frevos-dev",
          sourceHead: null,
          target: "10.9.69.21 / D:\\servixDev",
          runs: [],
        };
      return options.servixDeployment.state();
    },
  );
  server.post<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/servix/deployments"),
    async (request, reply) => {
      const { workspaceId, session } = await requireWorkspace(
        request,
        options,
        "project:write",
        now(),
      );
      requireCsrf(request, session.session, options.publicOrigin, options.authCookies.csrf);
      if (workspaceId !== "ws_server20" || !options.servixDeployment)
        throw new HttpError(404, "deployment-profile-not-found");
      return reply
        .status(202)
        .send(await options.servixDeployment.request(session.session.context.userId, request.body));
    },
  );
  server.post<{ Params: WorkspaceParams }>(
    route("/v1/workspaces/:workspaceId/servix/restores"),
    async (request, reply) => {
      const { workspaceId, session } = await requireWorkspace(
        request,
        options,
        "project:write",
        now(),
      );
      requireCsrf(request, session.session, options.publicOrigin, options.authCookies.csrf);
      if (workspaceId !== "ws_server20" || !options.servixDeployment)
        throw new HttpError(404, "deployment-profile-not-found");
      return reply
        .status(202)
        .send(await options.servixDeployment.restore(session.session.context.userId, request.body));
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

  server.post(route("/v1/agents/github/claim"), async (request, reply) => {
    requireTrackGrnAgent(request, options.trackGrnAgentTokenHash);
    const workspaceId = requireAgentWorkspace(request);
    const operation = await requireGithubOnboarding(options).claimNextDiscovery(
      workspaceId,
      WINDOWS_GITHUB_AGENT_ID,
      now(),
    );
    if (operation === null) {
      return reply.status(204).send();
    }
    return GithubDiscoveryOperationSchema.parse(operation);
  });

  server.post<{ Params: AgentOperationParams }>(
    route("/v1/agents/github/discovery/:operationId/complete"),
    async (request) => {
      requireTrackGrnAgent(request, options.trackGrnAgentTokenHash);
      const workspaceId = requireAgentWorkspace(request);
      const operationId = OperationIdSchema.parse(request.params.operationId);
      const completion = GithubDiscoveryCompletionSchema.parse(request.body);
      if (Buffer.byteLength(JSON.stringify(completion.result), "utf8") > 60_000) {
        throw new HttpError(400, "agent-result-too-large");
      }
      const operation = await requireGithubOnboarding(options).completeDiscovery({
        workspaceId,
        agentId: WINDOWS_GITHUB_AGENT_ID,
        operationId,
        completion,
        now: now(),
      });
      if (operation === null) {
        throw new HttpError(409, "github-discovery-not-claimable");
      }
      return GithubDiscoveryOperationSchema.parse(operation);
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

function requireGithubOnboarding(options: BuildServerOptions): GithubOnboardingStore {
  if (options.githubOnboarding === undefined) {
    throw new HttpError(503, "github-onboarding-unavailable");
  }
  return options.githubOnboarding;
}

function requireAgentWorkspace(request: FastifyRequest): string {
  const workspaceId = WorkspaceIdSchema.parse(request.headers["x-frevos-workspace-id"]);
  if (workspaceId !== PERSONAL_AGENT_WORKSPACE_ID) {
    throw new HttpError(403, "agent-workspace-denied");
  }
  return workspaceId;
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
  cookieName: string,
): Promise<SessionEvidence> {
  const rawToken = request.cookies[cookieName];
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
  options: ServerContext,
  scope: string,
  now: Date,
): Promise<{
  workspaceId: string;
  workspace: WorkspaceEvidence;
  session: SessionEvidence;
}> {
  const workspaceId = WorkspaceIdSchema.parse(request.params.workspaceId);
  const session = await requireSession(
    request,
    options.identitySessions,
    now,
    options.authCookies.session,
  );
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
  cookieName: string,
): void {
  if (request.headers.origin !== publicOrigin) {
    throw new HttpError(403, "csrf-check-failed");
  }
  const headerToken = request.headers["x-csrf-token"];
  const cookieToken = request.cookies[cookieName];
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

function setSessionCookies(
  reply: FastifyReply,
  rawToken: string,
  rawCsrfToken: string,
  policy: AuthCookiePolicy,
): void {
  reply.setCookie(policy.session, rawToken, {
    ...httpOnlyCookieOptions,
    secure: policy.secure,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  reply.setCookie(policy.csrf, rawCsrfToken, {
    ...httpOnlyCookieOptions,
    secure: policy.secure,
    httpOnly: false,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

function clearCookie(reply: FastifyReply, name: string, httpOnly: boolean, secure = true): void {
  reply.clearCookie(name, { ...httpOnlyCookieOptions, httpOnly, secure });
}

import { DeploymentChangeSchema } from "@frevos/contracts";
