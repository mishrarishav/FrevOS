import { z } from "zod";
import { loadConfig } from "./config.js";
import { createDatabasePool, verifyApplicationRole } from "./database.js";
import { NewLocalPasswordSchema, LocalUsernameSchema } from "./passwords.js";
import { IdentitySessionRepository } from "./repositories.js";

const BootstrapEnvironmentSchema = z
  .object({
    FREVOS_BOOTSTRAP_USERNAME: LocalUsernameSchema,
    FREVOS_BOOTSTRAP_DISPLAY_NAME: z.string().trim().min(1).max(120),
    FREVOS_BOOTSTRAP_PASSWORD: NewLocalPasswordSchema,
  })
  .passthrough();

const config = loadConfig(process.env);
if (config.authMode !== "local") {
  throw new Error("Local user bootstrap requires FREVOS_AUTH_MODE=local");
}
const bootstrap = BootstrapEnvironmentSchema.parse(process.env);
const pool = createDatabasePool(config.databaseUrl);

try {
  await verifyApplicationRole(pool);
  const principal = await new IdentitySessionRepository(pool).provisionLocalCredential({
    username: bootstrap.FREVOS_BOOTSTRAP_USERNAME,
    password: bootstrap.FREVOS_BOOTSTRAP_PASSWORD,
    displayName: bootstrap.FREVOS_BOOTSTRAP_DISPLAY_NAME,
    userId: "usr_windows_admin",
    identityId: "idn_windows_admin",
  });
  if (principal.userId !== "usr_windows_admin") {
    throw new Error("The initial local administrator identity is inconsistent");
  }
  process.stdout.write("Initial local administrator credential is ready.\n");
} finally {
  await pool.end();
}
