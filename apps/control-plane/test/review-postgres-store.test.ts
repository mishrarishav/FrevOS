import {
  type ReviewCheckResult,
  ReviewImportPreviewSchema,
  ReviewRegisterConfigSchema,
  ReviewStateSchema,
  type ReviewWorkbook,
} from "@frevos/contracts";
import { expect, it, vi } from "vitest";
import type { DatabasePool } from "../src/database.js";
import { ReviewPostgresStore } from "../src/review-postgres-store.js";
import { ReviewRegisters } from "../src/review-registers.js";

type Row = { revision: string; document: Record<string, unknown> };
function fakeDatabase(options: { unsafeSchema?: boolean; missingSchema?: boolean } = {}) {
  const rows = new Map<string, Row>(),
    calls: { sql: string; params: unknown[]; connection: number }[] = [],
    locks = new Map<string, Promise<void>>();
  let clock = "2030-01-01T00:00:00.000Z",
    connections = 0,
    failCas = false;
  const pool = {
    connect: async () => {
      const connection = ++connections;
      let released = false,
        workspace = "",
        pending: Row | undefined,
        unlock: (() => void) | undefined;
      return {
        release: () => {
          released = true;
          calls.push({ sql: "RELEASE", params: [], connection });
        },
        query: async (sql: string, params: unknown[] = []) => {
          if (released) throw Error("A released test connection was reused");
          calls.push({ sql, params, connection });
          const result = (values: unknown[] = []) => ({ rows: values, rowCount: values.length });
          if (sql === "BEGIN" || sql.startsWith("SET LOCAL")) return result();
          if (sql.includes("set_config('frevos.workspace_id'")) {
            workspace = String(params[0]);
            return result();
          }
          if (sql.includes("pg_advisory_xact_lock")) {
            const key = String(params[0]),
              before = locks.get(key) ?? Promise.resolve();
            let release!: () => void;
            const held = new Promise<void>((resolve) => {
              release = resolve;
            });
            locks.set(
              key,
              before.then(() => held),
            );
            await before;
            unlock = release;
            return result();
          }
          if (sql.includes("clock_timestamp() AS database_now"))
            return result([{ database_now: new Date(clock) }]);
          if (sql.includes("FROM frevos.review_workspace_state LIMIT 0")) {
            if (options.missingSchema) throw Error("synthetic-private-database-detail");
            return result();
          }
          if (sql.includes("FROM pg_class relation"))
            return result([
              {
                relrowsecurity: true,
                relforcerowsecurity: !options.unsafeSchema,
                owner: "frevos_owner",
              },
            ]);
          if (sql.startsWith("SELECT revision::text")) {
            if (workspace !== params[0]) return result();
            const row = pending ?? rows.get(workspace);
            return result(row ? [structuredClone(row)] : []);
          }
          if (sql.startsWith("INSERT INTO frevos.review_workspace_state")) {
            if (workspace !== params[0] || pending || rows.has(workspace)) return result();
            pending = { revision: "1", document: JSON.parse(String(params[1])) };
            return result([{ revision: "1" }]);
          }
          if (sql.startsWith("UPDATE frevos.review_workspace_state")) {
            const row = pending ?? rows.get(workspace);
            if (failCas) {
              failCas = false;
              return result();
            }
            if (!row || workspace !== params[0] || row.revision !== params[2]) return result();
            pending = {
              revision: String(BigInt(row.revision) + 1n),
              document: JSON.parse(String(params[1])),
            };
            return result([{ revision: pending.revision }]);
          }
          if (sql === "COMMIT") {
            if (pending) rows.set(workspace, structuredClone(pending));
            unlock?.();
            unlock = undefined;
            return result();
          }
          if (sql === "ROLLBACK") {
            pending = undefined;
            unlock?.();
            unlock = undefined;
            return result();
          }
          throw Error("Unexpected test SQL: " + sql);
        },
      };
    },
  } as unknown as DatabasePool;
  return {
    pool,
    rows,
    calls,
    clock: (value: string) => {
      clock = value;
    },
    now: () => clock,
    failNextCas: () => {
      failCas = true;
    },
  };
}
const document = (workspaceId = "ws_fixture") => ({
  version: 1,
  workspaceId,
  registers: [],
  audit: [],
});

it("uses the existing application role/workspace transaction and an advisory lock before reading and CAS-writing", async () => {
  const db = fakeDatabase(),
    store = new ReviewPostgresStore(db.pool, { enrolledWorkspaceIds: ["ws_fixture"] });
  await store.transaction("ws_fixture", async () => {
    expect(store.now()).toBe("2030-01-01T00:00:00.000Z");
    expect(await store.read("ws_fixture")).toBeNull();
    await store.write("ws_fixture", document());
  });
  const sql = db.calls.map((call) => call.sql);
  expect(sql[0]).toBe("BEGIN");
  expect(sql).toContain("SET LOCAL ROLE frevos_app");
  expect(db.calls.find((call) => call.sql.includes("pg_advisory_xact_lock"))?.params).toEqual([
    "frevos/reviews/ws_fixture",
  ]);
  expect(sql.findIndex((value) => value.includes("pg_advisory_xact_lock"))).toBeLessThan(
    sql.findIndex((value) => value.includes("FOR UPDATE")),
  );
  expect(sql.at(-2)).toBe("COMMIT");
  expect(sql.at(-1)).toBe("RELEASE");
  expect(db.rows.get("ws_fixture")?.revision).toBe("1");
  await store.transaction("ws_fixture", async () => {
    await store.read("ws_fixture");
    await store.write("ws_fixture", document());
  });
  expect(db.rows.get("ws_fixture")?.revision).toBe("2");
});
it("rejects unscoped writes and foreign workspace reentry without changing central state", async () => {
  const db = fakeDatabase(),
    store = new ReviewPostgresStore(db.pool, { enrolledWorkspaceIds: [] });
  await expect(store.write("ws_fixture", document())).rejects.toThrow("transaction-required");
  await expect(
    store.transaction("ws_fixture", async () => {
      await store.read("ws_fixture");
      await store.write("ws_other", document("ws_other"));
    }),
  ).rejects.toThrow("transaction-required");
  await expect(store.transaction("ws_fixture", () => store.read("ws_other"))).rejects.toThrow(
    "workspace-mismatch",
  );
  await expect(
    store.transaction("ws_fixture", () => store.transaction("ws_other", async () => undefined)),
  ).rejects.toThrow("workspace-mismatch");
  expect(db.rows.size).toBe(0);
  expect(db.calls.some((call) => call.sql === "ROLLBACK")).toBe(true);
});
it("detects a failed compare-and-swap and rolls back instead of overwriting another revision", async () => {
  const db = fakeDatabase(),
    store = new ReviewPostgresStore(db.pool, { enrolledWorkspaceIds: ["ws_fixture"] });
  db.rows.set("ws_fixture", { revision: "7", document: document() });
  db.failNextCas();
  await expect(
    store.transaction("ws_fixture", async () => {
      await store.read("ws_fixture");
      await store.write("ws_fixture", document());
    }),
  ).rejects.toThrow("revision-conflict");
  expect(db.rows.get("ws_fixture")?.revision).toBe("7");
  expect(db.calls.at(-2)?.sql).toBe("ROLLBACK");
  expect(db.calls.at(-1)?.sql).toBe("RELEASE");
});
it("serializes two independent adapters with the same workspace lock and preserves both updates", async () => {
  const db = fakeDatabase(),
    a = new ReviewPostgresStore(db.pool, { enrolledWorkspaceIds: ["ws_fixture"] }),
    b = new ReviewPostgresStore(db.pool, { enrolledWorkspaceIds: ["ws_fixture"] });
  db.rows.set("ws_fixture", { revision: "1", document: document() });
  await Promise.all(
    [a, b].map((store, index) =>
      store.transaction("ws_fixture", async () => {
        const old = (await store.read("ws_fixture")) as ReturnType<typeof document>;
        await Promise.resolve();
        await store.write("ws_fixture", {
          ...old,
          audit: [...old.audit, { action: "update" + index }],
        });
      }),
    ),
  );
  expect(db.rows.get("ws_fixture")?.revision).toBe("3");
  expect(db.rows.get("ws_fixture")?.document["audit"]).toHaveLength(2);
});
it("discovers only explicitly enrolled workspaces without a global database scan", async () => {
  const db = fakeDatabase(),
    store = new ReviewPostgresStore(db.pool, { enrolledWorkspaceIds: ["ws_second", "ws_first"] });
  expect(await store.workspaces()).toEqual(["ws_first", "ws_second"]);
  expect(db.calls).toEqual([]);
  expect(
    () => new ReviewPostgresStore(db.pool, { enrolledWorkspaceIds: ["../../other"] }),
  ).toThrow();
  expect(
    () => new ReviewPostgresStore(db.pool, { enrolledWorkspaceIds: ["ws_first", "ws_first"] }),
  ).toThrow();
});
it("fails startup safely when the central table is missing or forced workspace RLS is absent", async () => {
  const db = fakeDatabase(),
    store = new ReviewPostgresStore(db.pool, { enrolledWorkspaceIds: ["ws_fixture"] });
  await store.assertReady();
  expect(db.calls.some((call) => call.sql.includes("LIMIT 0"))).toBe(true);
  await expect(
    new ReviewPostgresStore(fakeDatabase({ unsafeSchema: true }).pool, {
      enrolledWorkspaceIds: [],
    }).assertReady(),
  ).rejects.toThrow("schema-not-ready");
  const failure = new ReviewPostgresStore(fakeDatabase({ missingSchema: true }).pool, {
    enrolledWorkspaceIds: ["ws_fixture"],
  });
  await expect(failure.assertReady()).rejects.toThrow("database-unavailable");
  await expect(failure.assertReady()).rejects.not.toThrow("synthetic-private-database-detail");
});
it("does not reuse a released transaction inherited by an asynchronous descendant", async () => {
  const db = fakeDatabase(),
    store = new ReviewPostgresStore(db.pool, { enrolledWorkspaceIds: ["ws_fixture"] });
  let release!: () => void, descendant!: Promise<void>;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await store.transaction("ws_fixture", async () => {
    await store.read("ws_fixture");
    await store.write("ws_fixture", document());
    descendant = (async () => {
      await gate;
      await store.transaction("ws_fixture", async () => {
        await store.read("ws_fixture");
        await store.write("ws_fixture", document());
      });
    })();
  });
  release();
  await descendant;
  expect(db.rows.get("ws_fixture")?.revision).toBe("2");
  expect(db.calls.filter((call) => call.sql === "BEGIN")).toHaveLength(2);
});
async function centralFixture(checker?: () => Promise<ReviewCheckResult>) {
  const db = fakeDatabase(),
    storeA = new ReviewPostgresStore(db.pool, { enrolledWorkspaceIds: ["ws_fixture"] }),
    storeB = new ReviewPostgresStore(db.pool, { enrolledWorkspaceIds: ["ws_fixture"] });
  const member = async (ws: string, actor: string) => ({
    active: ws === "ws_fixture" && actor === "usr_admin",
    administrator: actor === "usr_admin",
  });
  const book: ReviewWorkbook = {
    sourceHash: "a".repeat(64),
    fileName: "fixture.xlsx",
    sheets: [
      {
        name: "Apps",
        hidden: false,
        maxRow: 2,
        maxColumn: 2,
        hiddenRows: [],
        hiddenColumns: [],
        rows: [
          {
            row: 1,
            cells: [
              { column: "A", address: "A1", text: "Title" },
              { column: "B", address: "B1", text: "URL" },
            ],
          },
          {
            row: 2,
            cells: [
              { column: "A", address: "A2", text: "Application" },
              { column: "B", address: "B2", text: "https://example.invalid/app" },
            ],
          },
        ],
      },
    ],
  };
  const measure = () => ({
    status: "healthy" as const,
    httpStatus: 200,
    finalUrl: "https://example.invalid/app",
    message: "Expected page matched",
    title: "Application",
    elapsedMs: 1,
    checkedAt: db.now(),
  });
  const checkA = vi.fn(checker ?? (async () => measure())),
    checkB = vi.fn(async () => measure());
  const a = new ReviewRegisters(storeA, member, async () => [], {
      parseWorkbook: async () => book,
      checkLink: checkA,
    }),
    b = new ReviewRegisters(storeB, member, async () => [], {
      parseWorkbook: async () => book,
      checkLink: checkB,
    });
  const config = ReviewRegisterConfigSchema.parse({
    name: "Central register",
    description: "",
    fields: [],
    managementOptions: ["Internal"],
    lifecycleOptions: ["Active"],
    requirementOptions: ["Required"],
    decisionOptions: ["Review"],
    linkPolicy: {
      allowedOrigins: ["https://example.invalid"],
      allowPrivate: false,
      timeoutMs: 1000,
      maxBytes: 4096,
      maxRedirects: 1,
    },
  });
  const state = ReviewStateSchema.parse(
    await a.execute("usr_admin", "ws_fixture", "save-register", {
      version: 1,
      expectedRevision: 0,
      config,
    }),
  );
  const preview = ReviewImportPreviewSchema.parse(
    await a.execute("usr_admin", "ws_fixture", "preview-import", {
      version: 1,
      registerId: state.register.id,
      expectedRevision: state.register.revision,
      fileName: "fixture.xlsx",
      contentBase64: "eA==",
      sheet: "Apps",
      headerRow: 1,
      mapping: { title: "A", url: "B" },
      defaultScheme: "https",
    }),
  );
  return { db, a, b, checkA, checkB, state, preview, measure };
}
it("persists single-use import previews so a different application instance can commit them", async () => {
  const f = await centralFixture(),
    command = {
      version: 1,
      registerId: f.state.register.id,
      previewId: f.preview.id,
      expectedRevision: f.preview.revision,
      resolutions: [],
    };
  const state = ReviewStateSchema.parse(
    await f.b.execute("usr_admin", "ws_fixture", "commit-import", command),
  );
  expect(state.records).toHaveLength(1);
  expect(state.records[0]!.provenance[0]!.sourceHash).toBe("a".repeat(64));
  await expect(f.a.execute("usr_admin", "ws_fixture", "commit-import", command)).rejects.toThrow(
    "preview-expired",
  );
  expect((await f.a.state("usr_admin", "ws_fixture", state.register.id)).records).toHaveLength(1);
});
it("uses the central lease and fence to avoid duplicate GETs across application instances", async () => {
  let complete!: (result: ReviewCheckResult) => void;
  const f = await centralFixture(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  let state = ReviewStateSchema.parse(
    await f.b.execute("usr_admin", "ws_fixture", "commit-import", {
      version: 1,
      registerId: f.state.register.id,
      previewId: f.preview.id,
      expectedRevision: f.preview.revision,
      resolutions: [],
    }),
  );
  state = ReviewStateSchema.parse(
    await f.a.execute("usr_admin", "ws_fixture", "save-schedule", {
      version: 1,
      registerId: state.register.id,
      expectedRevision: state.register.revision,
      schedule: {
        enabled: false,
        weekdays: [],
        time: "09:00",
        timeZone: "UTC",
        accessibleValues: ["Accessible"],
        sslWarningDays: [10, 15],
      },
    }),
  );
  const record = state.records[0]!,
    {
      id,
      revision,
      updatedAt: _,
      updatedBy: __,
      provenance: ___,
      assignmentHistory: ____,
      reviews: _____,
      checks: ______,
      ...input
    } = record;
  state = ReviewStateSchema.parse(
    await f.a.execute("usr_admin", "ws_fixture", "save-record", {
      version: 1,
      registerId: state.register.id,
      id,
      expectedRevision: revision,
      record: { ...input, recordedAccess: "Accessible" },
    }),
  );
  await f.a.execute("usr_admin", "ws_fixture", "run-monitor", {
    version: 1,
    registerId: state.register.id,
    expectedRevision: state.register.revision,
  });
  const work = f.a.tickMonitoring();
  await vi.waitFor(() => expect(f.checkA).toHaveBeenCalledTimes(1));
  await f.b.tickMonitoring();
  expect(f.checkB).not.toHaveBeenCalled();
  expect(
    (await f.b.state("usr_admin", "ws_fixture", state.register.id)).monitoring!.runs[0]!.status,
  ).toBe("running");
  f.db.clock("2030-01-01T00:01:01.000Z");
  await f.b.tickMonitoring();
  expect(f.checkB).not.toHaveBeenCalled();
  expect(
    (await f.b.state("usr_admin", "ws_fixture", state.register.id)).monitoring!.runs[0]!.status,
  ).toBe("partial");
  complete(f.measure());
  await work;
  expect(
    (await f.a.state("usr_admin", "ws_fixture", state.register.id)).records[0]!.checks,
  ).toHaveLength(0);
  await f.a.closeMonitoring();
  await f.b.closeMonitoring();
});
