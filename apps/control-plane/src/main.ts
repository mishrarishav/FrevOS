import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ComponentDeployments } from "./component-deployments.js";
import { loadConfig } from "./config.js";
import { registerControlCenter } from "./control-center.js";
import { OidcTransactionCodec } from "./crypto.js";
import { createDatabasePool, verifyApplicationRole, verifyDatabaseReadiness } from "./database.js";
import { DeploymentSettingsStore } from "./deployment-settings.js";
import { DeveloperConnectorStore } from "./developer-connectors.js";
import { GithubOnboardingRepository } from "./github-onboarding.js";
import { LocalAccounts } from "./local-accounts.js";
import { LocalDevelopment } from "./local-development.js";
import { OpenIdClientProvider } from "./oidc.js";
import { ProjectAutomationRepository } from "./project-automation.js";
import { IdentitySessionRepository, WorkspaceRepository } from "./repositories.js";
import { SelfUpdates } from "./self-updates.js";
import { buildServer } from "./server.js";
import {
  ServixDeploymentError,
  ServixDeploymentStore,
  servixExecution,
} from "./servix-deployment.js";
import { SystemDiscovery } from "./system-discovery.js";
import { AgentWorkspace } from "./agent-workspace.js";
import { ProtectedModelSecrets } from "./model-secrets.js";
import { AgentNotifications } from "./agent-notifications.js";
import type { ProjectFolderSearchJob } from "@frevos/contracts";

const config = loadConfig(process.env);
const pool = createDatabasePool(config.databaseUrl);

try {
  await verifyApplicationRole(pool);
  let servixDeployment: ServixDeploymentStore | undefined;
  let developerConnectors: DeveloperConnectorStore | undefined;
  let deploymentSettings: DeploymentSettingsStore | undefined;
  let componentDeployments: ComponentDeployments | undefined;
  let localDevelopment: LocalDevelopment | undefined;
  let systemDiscovery: SystemDiscovery | undefined;
  const agentWorkspaces = new Map<string, AgentWorkspace>();
  const notifications = new Map<string, AgentNotifications>();
  const agentNotifications = (workspaceId: string) => {
    let service = notifications.get(workspaceId);
    if (service) return service;
    if (!config.servixRoot || !developerConnectors || systemDiscovery?.workspaceId !== workspaceId)
      throw new ServixDeploymentError("notifications-unavailable", 503);
    service = new AgentNotifications(
      join(config.servixRoot, "jobs", "agent-workspaces", workspaceId, "notifications"),
      workspaceId,
      developerConnectors,
      async (actor) => {
        const e = await new WorkspaceRepository(pool).getEvidence(workspaceId, actor);
        return (
          e?.workspace.status === "active" &&
          e.membership?.status === "active" &&
          e.membership.grantedScopes.some((s) => s === "project:write")
        );
      },
      (actor, runId) => agentWorkspace(workspaceId).notificationSource(actor, runId),
    );
    notifications.set(workspaceId, service);
    return service;
  };
  const agentWorkspace = (workspaceId: string) => {
    let service = agentWorkspaces.get(workspaceId);
    if (service) return service;
    if (!config.servixRoot || agentWorkspaces.size >= 100)
      throw new ServixDeploymentError("agent-workspace-unavailable", 503);
    const root = join(config.servixRoot, "jobs", "agent-workspaces", workspaceId);
    service = new AgentWorkspace(
      root,
      workspaceId,
      async (ws, actor, write) => {
        const evidence = await new WorkspaceRepository(pool).getEvidence(ws, actor);
        return (
          evidence?.workspace.status === "active" &&
          evidence.membership?.status === "active" &&
          evidence.membership.grantedScopes.some(
            (scope) => scope === (write ? "project:write" : "project:read"),
          )
        );
      },
      new ProtectedModelSecrets(join(root, "secrets")),
      async (actor, projectId) => {
        const repository = new WorkspaceRepository(pool);
        const evidence = await repository.getEvidence(workspaceId, actor);
        if (
          evidence?.workspace.status !== "active" ||
          evidence.membership?.status !== "active" ||
          !evidence.membership.grantedScopes.some((s) => s === "project:read")
        )
          throw new ServixDeploymentError("agent-access-denied", 403);
        const projects = await repository.listProjects(workspaceId);
        if (projectId && !projects.some((p) => p.projectId === projectId))
          throw new ServixDeploymentError("agent-project-not-found", 404);
        if (systemDiscovery?.workspaceId !== workspaceId)
          return {
            systems: [],
            reports: projects
              .filter((p) => !projectId || p.projectId === projectId)
              .map((p) => ({
                projectId: p.projectId,
                projectName: p.displayName,
                clientName: null,
                plan: null,
                completedPercent: null,
                plannedPercent: null,
                status: "plan-missing" as const,
                overdue: [],
                asOf: new Date().toISOString(),
              })),
          };
        const state = await systemDiscovery.state(actor);
        const folderEvidence: ProjectFolderSearchJob[] = [];
        if (projectId) {
          const report = state.reports.find((r) => r.projectId === projectId);
          if (!report?.plan?.bindings.length) {
            const targets = state.systems
              .filter(
                (s) =>
                  s.userId === actor &&
                  s.online &&
                  s.policy?.policy.enabled &&
                  s.observation?.coverage.roots.length,
              )
              .slice(0, 2);
            const results = await Promise.allSettled(
              targets.map(async (s) => {
                const job = await systemDiscovery!.requestProjectFolders(actor, {
                  version: 1,
                  projectId,
                  deviceId: s.deviceId,
                });
                for (let i = 0; i < 8; i++) {
                  await new Promise((r) => setTimeout(r, 1000));
                  const result = await systemDiscovery!.projectFolders(actor, job.id);
                  if (!["queued", "working"].includes(result.status)) return result;
                }
                return systemDiscovery!.projectFolders(actor, job.id);
              }),
            );
            for (const result of results)
              if (result.status === "fulfilled") folderEvidence.push(result.value);
          }
          const related = state.systems
            .filter(
              (s) =>
                report?.plan?.bindings.some(
                  (b) =>
                    b.deviceId === s.deviceId &&
                    b.userId === s.userId &&
                    b.repositoryId === s.source?.repositoryId,
                ) ||
                folderEvidence.some(
                  (j) => j.request.deviceId === s.deviceId && !!j.result?.matches.length,
                ),
            )
            .slice(0, 2);
          for (const s of related) {
            const detailed = await systemDiscovery.state(actor, s.deviceId),
              full = detailed.systems.find((d) => d.deviceId === s.deviceId);
            if (full) s.history = full.history;
          }
        }
        return {
          ...state,
          folderEvidence,
          reports: state.reports.filter(
            (r) =>
              projects.some((p) => p.projectId === r.projectId) &&
              (!projectId || r.projectId === projectId),
          ),
        };
      },
    );
    agentWorkspaces.set(workspaceId, service);
    return service;
  };
  if (config.servixRoot) {
    const execution = servixExecution(
      config.servixRoot,
      fileURLToPath(new URL("../../../deployment/servix/", import.meta.url)),
    );
    const allowed = async (actor: string) => {
      const evidence = await new WorkspaceRepository(pool).getEvidence("ws_server20", actor);
      return (
        evidence?.workspace.status === "active" &&
        evidence.membership?.status === "active" &&
        evidence.membership.grantedScopes.some((scope) => scope === "project:write")
      );
    };
    deploymentSettings = new DeploymentSettingsStore(
      join(config.servixRoot, "jobs", "configuration"),
      allowed,
    );
    componentDeployments = new ComponentDeployments(
      join(config.servixRoot, "jobs", "components"),
      "ws_server20",
      async (actor, owner) => (await allowed(actor)) && (!owner || actor === "usr_windows_admin"),
      config.componentGitExecutable,
    );
    developerConnectors = new DeveloperConnectorStore(
      join(config.servixRoot, "jobs", "connectors"),
      allowed,
      execution,
      async (username, password, displayName) => {
        await new IdentitySessionRepository(pool).provisionLocalCredential({
          username,
          password,
          displayName,
          requireNew: true,
          developerWorkspaceId: "ws_server20",
        });
      },
      () => new Date(),
      async (id, actor, deviceId) =>
        ((await servixDeployment?.sourceRequestActive(id, actor, deviceId)) ?? false) ||
        ((await componentDeployments?.sourceRequestActive(id, actor, deviceId)) ?? false),
      deploymentSettings,
      componentDeployments,
    );
    componentDeployments.connect(developerConnectors);
    localDevelopment = new LocalDevelopment(
      join(config.servixRoot, "jobs", "local-development"),
      developerConnectors,
    );
    systemDiscovery = new SystemDiscovery(
      join(config.servixRoot, "jobs", "discovery"),
      developerConnectors,
      async (actor) => {
        const repository = new WorkspaceRepository(pool);
        const evidence = await repository.getEvidence("ws_server20", actor);
        if (
          evidence?.membership?.status !== "active" ||
          evidence.workspace.status !== "active" ||
          !evidence.membership.grantedScopes.some((scope) => scope === "project:read")
        )
          throw new ServixDeploymentError("discovery-access-denied", 403);
        return {
          projects: await repository.listProjects("ws_server20"),
          clients: evidence.membership.grantedScopes.some((scope) => scope === "client:read")
            ? await repository.listClients("ws_server20")
            : [],
        };
      },
    );
    servixDeployment = new ServixDeploymentStore(
      config.servixRoot,
      execution,
      allowed,
      () => new Date(),
      developerConnectors,
      deploymentSettings,
    );
  }
  const authentication =
    config.authMode === "local"
      ? { authMode: "local" as const }
      : {
          authMode: "oidc" as const,
          oidcProvider: await OpenIdClientProvider.discover({
            issuer: config.oidcIssuer,
            clientId: config.oidcClientId,
            clientSecret: config.oidcClientSecret,
            redirectUri: `${config.publicOrigin}${config.basePath}/auth/callback`,
          }),
          transactionCodec: new OidcTransactionCodec(config.oidcTransactionKey),
        };
  const server = await buildServer({
    publicOrigin: config.publicOrigin,
    ...(config.servixRoot && config.authMode === "local"
      ? { selfUpdates: new SelfUpdates(join(config.servixRoot, "..", "maintenance")) }
      : {}),
    basePath: config.basePath,
    ...authentication,
    identitySessions: new IdentitySessionRepository(pool),
    workspaces: new WorkspaceRepository(pool),
    automation: new ProjectAutomationRepository(pool),
    githubOnboarding: new GithubOnboardingRepository(pool),
    ...(servixDeployment === undefined ? {} : { servixDeployment }),
    ...(developerConnectors === undefined ? {} : { developerConnectors }),
    ...(deploymentSettings === undefined ? {} : { deploymentSettings }),
    ...(componentDeployments === undefined ? {} : { componentDeployments }),
    ...(localDevelopment === undefined ? {} : { localDevelopment }),
    ...(systemDiscovery === undefined ? {} : { systemDiscovery }),
    ...(config.servixRoot ? { agentWorkspace } : {}),
    ...(systemDiscovery
      ? {
          agentNotifications,
          connectorNotifications: agentNotifications(systemDiscovery.workspaceId),
        }
      : {}),
    ...(config.servixRoot && config.authMode === "local"
      ? {
          localAccounts: new LocalAccounts(
            pool,
            new IdentitySessionRepository(pool),
            join(config.servixRoot, "jobs", "account-audit"),
          ),
        }
      : {}),
    ...(config.trackGrnAgentTokenHash === undefined
      ? {}
      : { trackGrnAgentTokenHash: config.trackGrnAgentTokenHash }),
    readiness: () => verifyDatabaseReadiness(pool),
  });
  if (systemDiscovery) {
    await systemDiscovery.prune();
    const discovery = systemDiscovery;
    const retention = setInterval(() => void discovery.prune().catch(() => undefined), 600000);
    retention.unref();
    server.addHook("onClose", async () => clearInterval(retention));
  }
  await registerControlCenter(
    server,
    fileURLToPath(new URL("../../control-center/dist/", import.meta.url)),
    config.basePath,
  );

  const shutdown = async () => {
    developerConnectors?.close();
    servixDeployment?.close();
    await server.close();
    await pool.end();
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());

  await server.listen({ host: config.host, port: config.port });
} catch (error) {
  await pool.end();
  throw error;
}
