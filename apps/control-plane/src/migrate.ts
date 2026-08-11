import {
  createDatabasePool,
  databaseRoleFromConnectionString,
  prepareApplicationLoginRole,
  runMigrations,
} from "./database.js";

const migrationDatabaseUrl: unknown = Reflect.get(process.env, "MIGRATION_DATABASE_URL");
if (typeof migrationDatabaseUrl !== "string" || migrationDatabaseUrl.length === 0) {
  throw new Error("MIGRATION_DATABASE_URL is required");
}
const applicationDatabaseUrl: unknown = Reflect.get(process.env, "DATABASE_URL");
if (typeof applicationDatabaseUrl !== "string" || applicationDatabaseUrl.length === 0) {
  throw new Error("DATABASE_URL is required to prepare the application login role");
}

const pool = createDatabasePool(migrationDatabaseUrl);
try {
  await runMigrations(pool);
  await prepareApplicationLoginRole(pool, databaseRoleFromConnectionString(applicationDatabaseUrl));
} finally {
  await pool.end();
}
