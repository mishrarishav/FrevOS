import { loadConfig } from "./config.js";
import { OidcTransactionCodec } from "./crypto.js";
import { createDatabasePool, verifyApplicationRole } from "./database.js";
import { OpenIdClientProvider } from "./oidc.js";
import { IdentitySessionRepository, WorkspaceRepository } from "./repositories.js";
import { buildServer } from "./server.js";

const config = loadConfig(process.env);
const pool = createDatabasePool(config.databaseUrl);

try {
  await verifyApplicationRole(pool);
  const oidcProvider = await OpenIdClientProvider.discover({
    issuer: config.oidcIssuer,
    clientId: config.oidcClientId,
    clientSecret: config.oidcClientSecret,
    redirectUri: `${config.publicOrigin}/auth/callback`,
  });
  const server = await buildServer({
    publicOrigin: config.publicOrigin,
    oidcProvider,
    transactionCodec: new OidcTransactionCodec(config.oidcTransactionKey),
    identitySessions: new IdentitySessionRepository(pool),
    workspaces: new WorkspaceRepository(pool),
  });

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
