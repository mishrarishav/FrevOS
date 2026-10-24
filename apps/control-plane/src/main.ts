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
