import { AsyncLocalStorage } from "node:async_hooks";
import { WorkspaceIdSchema } from "@frevos/contracts";
import type { PoolClient } from "pg";
import { ZodError } from "zod";
import { type DatabasePool, withApplicationTransaction } from "./database.js";
import { ReviewRegisterError, type ReviewStateStore } from "./review-registers.js";

type Transaction = {
  active: boolean;
  workspaceId: string;
  client: PoolClient;
  revision: string | null;
  read: boolean;
  databaseNow: string;
};

/** Central Reviews state. HTTP calls must never run inside transaction(). */
export class ReviewPostgresStore implements ReviewStateStore {
  private readonly context = new AsyncLocalStorage<Transaction>();
  private readonly enrolled: string[];
  constructor(
    private readonly pool: DatabasePool,
    options: { enrolledWorkspaceIds: string[] },
  ) {
    this.enrolled = options.enrolledWorkspaceIds.map((value) => WorkspaceIdSchema.parse(value));
    if (this.enrolled.length > 1000 || new Set(this.enrolled).size !== this.enrolled.length)
      throw new ReviewRegisterError("workspace-enrollment-invalid");
  }
  now(): string {
    const context = this.context.getStore();
    return context?.active ? context.databaseNow : new Date().toISOString();
  }
  async workspaces(): Promise<string[]> {
    return [...this.enrolled].sort();
  }
  private async scoped<T>(
    workspaceId: string | undefined,
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await withApplicationTransaction(this.pool, workspaceId, operation);
    } catch (error) {
      if (error instanceof ReviewRegisterError || error instanceof ZodError) throw error;
      throw new ReviewRegisterError("database-unavailable", 503);
    }
  }
  async assertReady(): Promise<void> {
    await this.scoped(this.enrolled[0], async (client) => {
      await client.query(
        "SELECT workspace_id, revision, document, updated_at FROM frevos.review_workspace_state LIMIT 0",
      );
      const result = await client.query<{
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
        owner: string;
      }>(
        "SELECT relation.relrowsecurity, relation.relforcerowsecurity, pg_get_userbyid(relation.relowner) AS owner FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace WHERE namespace.nspname='frevos' AND relation.relname='review_workspace_state'",
      );
      const row = result.rows[0];
      if (!row || !row.relrowsecurity || !row.relforcerowsecurity || row.owner !== "frevos_owner")
        throw new ReviewRegisterError("database-schema-not-ready", 503);
    });
  }
  async transaction<T>(workspaceId: string, operation: () => Promise<T>): Promise<T> {
    WorkspaceIdSchema.parse(workspaceId);
    const existing = this.context.getStore();
    if (existing?.active) {
      if (existing.workspaceId !== workspaceId)
        throw new ReviewRegisterError("storage-workspace-mismatch", 403);
      return operation();
    }
    return this.scoped(workspaceId, async (client) => {
      await client.query("SET LOCAL lock_timeout = '5s'");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        "frevos/reviews/" + workspaceId,
      ]);
      const clock = await client.query<{ database_now: Date | string }>(
        "SELECT clock_timestamp() AS database_now",
      );
      const value = clock.rows[0]?.database_now;
      const databaseNow =
        value instanceof Date
          ? value.toISOString()
          : typeof value === "string"
            ? new Date(value).toISOString()
            : null;
      if (!databaseNow) throw new ReviewRegisterError("database-clock-unavailable", 503);
      const context: Transaction = {
        active: true,
        workspaceId,
        client,
        revision: null,
        read: false,
        databaseNow,
      };
      try {
        return await this.context.run(context, operation);
      } finally {
        context.active = false;
      }
    });
  }
  private async load(client: PoolClient, workspaceId: string, locked: boolean) {
    const result = await client.query<{ revision: string; document: unknown }>(
      `SELECT revision::text AS revision, document FROM frevos.review_workspace_state WHERE workspace_id=$1${locked ? " FOR UPDATE" : ""}`,
      [workspaceId],
    );
    if (result.rows.length > 1) throw new ReviewRegisterError("database-state-invalid", 503);
    const row = result.rows[0];
    if (row && !/^[0-9]+$/.test(row.revision))
      throw new ReviewRegisterError("database-revision-invalid", 503);
    return row ?? null;
  }
  async read(workspaceId: string): Promise<unknown | null> {
    WorkspaceIdSchema.parse(workspaceId);
    const context = this.context.getStore();
    if (context?.active) {
      if (context.workspaceId !== workspaceId)
        throw new ReviewRegisterError("storage-workspace-mismatch", 403);
      const row = await this.load(context.client, workspaceId, true);
      context.revision = row?.revision ?? null;
      context.read = true;
      return row?.document ?? null;
    }
    return this.scoped(
      workspaceId,
      async (client) => (await this.load(client, workspaceId, false))?.document ?? null,
    );
  }
  async write(workspaceId: string, document: unknown): Promise<void> {
    WorkspaceIdSchema.parse(workspaceId);
    const context = this.context.getStore();
    if (!context?.active || context.workspaceId !== workspaceId || !context.read)
      throw new ReviewRegisterError("database-transaction-required", 503);
    if (
      !document ||
      typeof document !== "object" ||
      Reflect.get(document, "workspaceId") !== workspaceId
    )
      throw new ReviewRegisterError("storage-workspace-mismatch", 403);
    const serialized = JSON.stringify(document);
    if (Buffer.byteLength(serialized) > 33554432)
      throw new ReviewRegisterError("storage-limit", 409);
    const result =
      context.revision === null
        ? await context.client.query<{ revision: string }>(
            "INSERT INTO frevos.review_workspace_state (workspace_id, revision, document, updated_at) VALUES ($1, 1, $2::jsonb, clock_timestamp()) ON CONFLICT (workspace_id) DO NOTHING RETURNING revision::text AS revision",
            [workspaceId, serialized],
          )
        : await context.client.query<{ revision: string }>(
            "UPDATE frevos.review_workspace_state SET document=$2::jsonb, revision=revision+1, updated_at=clock_timestamp() WHERE workspace_id=$1 AND revision=$3::bigint RETURNING revision::text AS revision",
            [workspaceId, serialized, context.revision],
          );
    const row = result.rows[0];
    if (!row || !/^[0-9]+$/.test(row.revision))
      throw new ReviewRegisterError("database-revision-conflict", 409);
    context.revision = row.revision;
  }
}
