import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { UserIdSchema } from "@frevos/contracts";
import { Pool, type PoolClient } from "pg";

const MIGRATIONS_DIRECTORY = fileURLToPath(new URL("../migrations", import.meta.url));
const APP_ROLE = "frevos_app";

export type DatabasePool = Pool;

export function createDatabasePool(connectionString: string): DatabasePool {
  return new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });
}

export async function runMigrations(
  pool: DatabasePool,
  migrationsDirectory = MIGRATIONS_DIRECTORY,
): Promise<void> {
  const filenames = (await readdir(migrationsDirectory))
    .filter((filename) => /^\d{4}_[a-z0-9_]+\.sql$/.test(filename))
    .sort();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(667_342_846)");
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.frevos_schema_migrations (
        version text PRIMARY KEY,
        sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
        applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    for (const filename of filenames) {
      const source = await readFile(join(migrationsDirectory, filename), "utf8");
      const digest = createHash("sha256").update(source).digest("hex");
      const existing = await client.query<{ sha256: string }>(
        "SELECT sha256 FROM public.frevos_schema_migrations WHERE version = $1",
        [filename],
      );
      if (existing.rows[0] !== undefined) {
        if (existing.rows[0].sha256 !== digest) {
          throw new Error(`Applied migration ${filename} has a different checksum`);
        }
        continue;
      }

      await client.query(source);
      await client.query(
        "INSERT INTO public.frevos_schema_migrations (version, sha256) VALUES ($1, $2)",
        [filename, digest],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function verifyApplicationRole(pool: DatabasePool): Promise<void> {
  await withApplicationTransaction(pool, undefined, async (client) => {
    const result = await client.query<{
      rolname: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
      session_super: boolean;
      session_bypassrls: boolean;
      session_createdb: boolean;
      session_createrole: boolean;
      session_can_assume_owner: boolean;
    }>(`
      SELECT
        effective.rolname,
        effective.rolsuper,
        effective.rolbypassrls,
        login.rolsuper AS session_super,
        login.rolbypassrls AS session_bypassrls,
        login.rolcreatedb AS session_createdb,
        login.rolcreaterole AS session_createrole,
        pg_has_role(session_user, 'frevos_owner', 'MEMBER') AS session_can_assume_owner
      FROM pg_roles effective
      CROSS JOIN pg_roles login
      WHERE effective.rolname = current_user
        AND login.rolname = session_user
    `);
    const role = result.rows[0];
    if (
      role === undefined ||
      role.rolname !== APP_ROLE ||
      role.rolsuper ||
      role.rolbypassrls ||
      role.session_super ||
      role.session_bypassrls ||
      role.session_createdb ||
      role.session_createrole ||
      role.session_can_assume_owner
    ) {
      throw new Error("Database application role is not the required unprivileged role");
    }
  });
}

export async function withApplicationTransaction<T>(
  pool: DatabasePool,
  workspaceId: string | undefined,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL ROLE ${APP_ROLE}`);
    if (workspaceId !== undefined) {
      await client.query("SELECT set_config('frevos.workspace_id', $1, true)", [workspaceId]);
    }
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function withApplicationPrincipalTransaction<T>(
  pool: DatabasePool,
  userId: string,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const verifiedUserId = UserIdSchema.parse(userId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL ROLE ${APP_ROLE}`);
    await client.query("SELECT set_config('frevos.user_id', $1, true)", [verifiedUserId]);
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
