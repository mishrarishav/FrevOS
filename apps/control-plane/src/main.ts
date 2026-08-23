import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { registerControlCenter } from "./control-center.js";
import { OidcTransactionCodec } from "./crypto.js";
import { createDatabasePool, verifyApplicationRole, verifyDatabaseReadiness } from "./database.js";
import { GithubOnboardingRepository } from "./github-onboarding.js";
import { OpenIdClientProvider } from "./oidc.js";
import { ProjectAutomationRepository } from "./project-automation.js";
import { IdentitySessionRepository, WorkspaceRepository } from "./repositories.js";
import { buildServer } from "./server.js";

const config = loadConfig(process.env);
const pool = createDatabasePool(config.databaseUrl);

try {
  await verifyApplicationRole(pool);
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
    basePath: config.basePath,
    ...authentication,
    identitySessions: new IdentitySessionRepository(pool),
    workspaces: new WorkspaceRepository(pool),
    automation: new ProjectAutomationRepository(pool),
    githubOnboarding: new GithubOnboardingRepository(pool),
    ...(config.trackGrnAgentTokenHash === undefined
      ? {}
      : { trackGrnAgentTokenHash: config.trackGrnAgentTokenHash }),
    readiness: () => verifyDatabaseReadiness(pool),
  });
  await registerControlCenter(
    server,
    fileURLToPath(new URL("../../control-center/dist/", import.meta.url)),
    config.basePath,
  );

  const shutdown = async () => {
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
