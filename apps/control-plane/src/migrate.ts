import { createDatabasePool, runMigrations } from "./database.js";

const migrationDatabaseUrl: unknown = Reflect.get(process.env, "MIGRATION_DATABASE_URL");
if (typeof migrationDatabaseUrl !== "string" || migrationDatabaseUrl.length === 0) {
  throw new Error("MIGRATION_DATABASE_URL is required");
}

const pool = createDatabasePool(migrationDatabaseUrl);
try {
  await runMigrations(pool);
} finally {
  await pool.end();
}
