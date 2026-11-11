import { ServerMonitorPolicySchema } from "@frevos/contracts";
import { expect, it } from "vitest";
import type { DatabasePool } from "../src/database.js";
import { ServerMonitoringPostgresStore } from "../src/server-monitoring-store.js";
import { type ServerMonitoringDocument } from "../src/server-monitoring.js";

// Recording PostgreSQL double: no connection strings or real database are used.
function database(
  options: { unsafeRls?: boolean; unsafeOwner?: boolean; unavailable?: boolean } = {},
) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const documents = new Map<string, { revision: string; document: unknown }>();
  let conflict = false;
  const pool = {
    connect: async () => {
      if (options.unavailable) throw new Error("sensitive-database-detail");
      let workspace = "",
        pending: { revision: string; document: unknown } | undefined;
      return {
        release: () => {
          calls.push({ sql: "RELEASE", params: [] });
        },
        query: async (sql: string, params: unknown[] = []) => {
          calls.push({ sql, params });
          const rows = (result: unknown[] = []) => ({ rows: result, rowCount: result.length });
          if (
            sql === "BEGIN" ||
            sql.startsWith("SET LOCAL") ||
            sql.includes("pg_advisory_xact_lock")
          )
            return rows();
          if (sql.includes("set_config('frevos.workspace_id'")) {
            workspace = String(params[0]);
            return rows();
          }
          if (sql.includes("clock_timestamp() AS database_now"))
            return rows([{ database_now: new Date("2030-01-01T00:00:00.000Z") }]);
          if (sql.includes("FROM frevos.server_monitoring_state LIMIT 0")) return rows();
          if (sql.includes("FROM pg_class relation"))
            return rows([
              {
                relrowsecurity: true,
                relforcerowsecurity: !options.unsafeRls,
                owner: options.unsafeOwner ? "other" : "frevos_owner",
              },
            ]);
          if (sql.startsWith("SELECT revision::text")) {
            expect(workspace).toBe(params[0]);
            const value = pending ?? documents.get(workspace);
            return rows(value ? [structuredClone(value)] : []);
          }
          if (sql.startsWith("INSERT INTO frevos.server_monitoring_state")) {
            expect(workspace).toBe(params[0]);
            if (conflict || documents.has(workspace)) return rows();
            pending = { revision: "1", document: JSON.parse(String(params[1])) };
            return rows([{ revision: "1" }]);
          }
          if (sql.startsWith("UPDATE frevos.server_monitoring_state")) {
            expect(workspace).toBe(params[0]);
            const value = pending ?? documents.get(workspace);
            if (conflict || !value || value.revision !== params[2]) return rows();
            pending = {
              revision: String(BigInt(value.revision) + 1n),
              document: JSON.parse(String(params[1])),
            };
            return rows([{ revision: pending.revision }]);
          }
          if (sql === "COMMIT") {
            if (pending) documents.set(workspace, pending);
            return rows();
          }
          if (sql === "ROLLBACK") {
            pending = undefined;
            return rows();
          }
          throw new Error("Unexpected test SQL");
        },
      };
    },
  } as unknown as DatabasePool;
  return {
    pool,
    calls,
    documents,
    conflict: () => {
      conflict = true;
    },
  };
}
const document = (): ServerMonitoringDocument => ({
  version: 1,
  workspaceId: "ws_monitor" as ServerMonitoringDocument["workspaceId"],
  revision: 0,
  policy: ServerMonitorPolicySchema.parse({}),
  targets: [],
  audit: [],
});
function fixture(options = {}) {
  const db = database(options);
  return {
    db,
    store: new ServerMonitoringPostgresStore(db.pool, { enrolledWorkspaceIds: ["ws_monitor"] }),
  };
}

it("requires an operator-enrolled workspace and never falls back when PostgreSQL is unavailable", async () => {
  const { store } = fixture();
  await expect(store.read("ws_other")).rejects.toThrow("workspace-not-enrolled");
  const unavailable = fixture({ unavailable: true });
  await expect(unavailable.store.read("ws_monitor")).rejects.toThrow("database-unavailable");
  await expect(unavailable.store.read("ws_monitor")).rejects.not.toThrow(
    "sensitive-database-detail",
  );
});
it("requires forced RLS and the deployment owner role", async () => {
  await fixture().store.assertReady();
  await expect(fixture({ unsafeRls: true }).store.assertReady()).rejects.toThrow(
    "database-schema-not-ready",
  );
  await expect(fixture({ unsafeOwner: true }).store.assertReady()).rejects.toThrow(
    "database-schema-not-ready",
  );
  const noWorkspace = new ServerMonitoringPostgresStore(database().pool, {
    enrolledWorkspaceIds: [],
  });
  await expect(noWorkspace.assertReady()).rejects.toThrow("workspace-enrollment-required");
});
it("uses workspace RLS context, a transaction advisory lock and PostgreSQL time", async () => {
  const { db, store } = fixture();
  await store.transaction("ws_monitor", async () => {
    expect(store.now()).toBe("2030-01-01T00:00:00.000Z");
    expect(await store.read("ws_monitor")).toBeNull();
    await store.write("ws_monitor", document());
  });
  expect(db.calls[0]?.sql).toBe("BEGIN");
  expect(db.calls[1]?.sql).toBe("SET LOCAL ROLE frevos_app");
  expect(db.calls.find((call) => call.sql.includes("set_config"))?.params).toEqual(["ws_monitor"]);
  expect(db.calls.find((call) => call.sql.includes("pg_advisory_xact_lock"))?.params).toEqual([
    "frevos/server-monitoring/ws_monitor",
  ]);
  expect(db.calls.some((call) => call.sql.includes("FOR UPDATE"))).toBe(true);
  expect(db.calls.slice(-2).map((call) => call.sql)).toEqual(["COMMIT", "RELEASE"]);
  expect(await store.read("ws_monitor")).toEqual(document());
});
it("rejects writes without a locked read and cross-workspace nested transactions", async () => {
  const { store } = fixture();
  await expect(store.write("ws_monitor", document())).rejects.toThrow(
    "database-transaction-required",
  );
  await store.transaction("ws_monitor", async () => {
    await expect(store.write("ws_monitor", document())).rejects.toThrow(
      "database-transaction-required",
    );
    await expect(store.transaction("ws_other", async () => undefined)).rejects.toThrow(
      "storage-workspace-mismatch",
    );
    await expect(store.read("ws_other")).rejects.toThrow("storage-workspace-mismatch");
  });
});
it("rolls back failed operations and optimistic revision conflicts", async () => {
  const { db, store } = fixture();
  await expect(
    store.transaction("ws_monitor", async () => {
      await store.read("ws_monitor");
      await store.write("ws_monitor", document());
      throw new Error("abort");
    }),
  ).rejects.toThrow("database-unavailable");
  expect(db.documents.size).toBe(0);
  expect(db.calls.slice(-2).map((call) => call.sql)).toEqual(["ROLLBACK", "RELEASE"]);
  await store.transaction("ws_monitor", async () => {
    await store.read("ws_monitor");
    await store.write("ws_monitor", document());
  });
  db.conflict();
  await expect(
    store.transaction("ws_monitor", async () => {
      await store.read("ws_monitor");
      await store.write("ws_monitor", document());
    }),
  ).rejects.toThrow("database-revision-conflict");
  expect(db.documents.get("ws_monitor")?.revision).toBe("1");
});
it("validates the complete document before the PostgreSQL write", async () => {
  const { db, store } = fixture();
  await store.transaction("ws_monitor", async () => {
    await store.read("ws_monitor");
    await expect(
      store.write("ws_monitor", { ...document(), workspaceId: "ws_other" }),
    ).rejects.toThrow("storage-workspace-mismatch");
    await expect(
      store.write("ws_monitor", { ...document(), password: "secret" }),
    ).rejects.toThrow();
  });
  expect(db.calls.some((call) => call.sql.startsWith("INSERT"))).toBe(false);
});
