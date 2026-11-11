import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertNoLocalStackStartup,
  codebaseArguments,
  codebaseEnvironment,
  codebaseLaunchPlan,
  forwardRuntimeLog,
  loadCodebaseProfile,
  logRedactor,
  validateCodebaseProfile,
} from "./codebase-runtime.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const now = Date.parse("2026-11-11T10:00:00.000Z");
const fixture = () => ({
  version: 1,
  verifiedAt: "2026-11-11T09:00:00.000Z",
  expiresAt: "2026-11-12T09:00:00.000Z",
  expectedTarget: {
    host: "db.internal.example.invalid",
    port: 5433,
    database: "shared_fixture",
    runtimeRole: "runtime_fixture",
  },
  DATABASE_URL:
    "postgresql://runtime_fixture:synthetic-runtime-secret@db.internal.example.invalid:5433/shared_fixture?sslmode=verify-full",
  runtime: {
    FREVOS_PUBLIC_ORIGIN: "https://app.example.invalid",
    FREVOS_AUTH_MODE: "local",
    FREVOS_ALLOW_INTERNAL_HTTP: "false",
    HOST: "127.0.0.1",
    PORT: 3101,
  },
});

test("normal local up is blocked before local secret generation or Docker can be called", () => {
  assert.throws(() => assertNoLocalStackStartup("up"), /disabled.*central Server20/);
  for (const action of ["down", "status", "logs", "backup", "restore"])
    assert.doesNotThrow(() => assertNoLocalStackStartup(action));
  const source = readFileSync(join(root, "scripts", "local-preview.mjs"), "utf8");
  assert.ok(
    source.indexOf("assertNoLocalStackStartup(command);") <
      source.indexOf("function ensureEnvironment"),
  );
  assert.ok(source.indexOf("assertNoLocalStackStartup(command);") < source.indexOf('docker(["up"'));
});
test("code-only startup needs an explicit fresh runtime profile and exact central target binding", () => {
  assert.throws(() => codebaseArguments([]), /explicit-profile-required/);
  assert.throws(
    () => codebaseArguments(["--profile", "x", "--reset"]),
    /explicit-profile-required/,
  );
  assert.equal(
    codebaseArguments(["--profile", "runtime.fixture.json"]),
    resolve("runtime.fixture.json"),
  );
  assert.equal(
    codebaseArguments(["--", "--profile", "runtime.fixture.json"]),
    resolve("runtime.fixture.json"),
  );
  const profile = validateCodebaseProfile(fixture(), now);
  assert.equal(profile.target.host, "db.internal.example.invalid");
  assert.equal(profile.runtime.DEVSETU_REVIEWS_MONITORING_ENABLED, "false");
  for (const change of [
    { expiresAt: "2026-11-11T09:59:00.000Z" },
    { verifiedAt: "2026-11-11T10:01:00.000Z" },
    { verifiedAt: "unknown" },
  ])
    assert.throws(
      () => validateCodebaseProfile({ ...fixture(), ...change }, now),
      /stale-verification/,
    );
  for (const target of [
    { host: "other.internal.example.invalid" },
    { port: 5434 },
    { database: "other_fixture" },
    { runtimeRole: "other_fixture" },
  ])
    assert.throws(
      () =>
        validateCodebaseProfile(
          { ...fixture(), expectedTarget: { ...fixture().expectedTarget, ...target } },
          now,
        ),
      /target-mismatch/,
    );
});
test("stale placeholders, loopback copies, migration credentials and certificate bypasses do not create a fallback", () => {
  for (const host of [
    "localhost",
    "localhost.",
    "service.localhost",
    "127.0.0.1",
    "127.6.5.4",
    "0.0.0.0",
    "::1",
    "[::1]",
  ])
    assert.throws(
      () =>
        validateCodebaseProfile(
          { ...fixture(), expectedTarget: { ...fixture().expectedTarget, host } },
          now,
        ),
      /invalid-central-target/,
    );
  assert.throws(
    () =>
      validateCodebaseProfile(
        {
          ...fixture(),
          DATABASE_URL: "postgresql://REPLACE_LOGIN:fixture@db.invalid/REPLACE_DATABASE",
        },
        now,
      ),
    /database-reference/,
  );
  assert.throws(
    () =>
      validateCodebaseProfile(
        { ...fixture(), MIGRATION_DATABASE_URL: "synthetic-migrator-reference" },
        now,
      ),
    /invalid-profile/,
  );
  assert.throws(
    () =>
      validateCodebaseProfile(
        {
          ...fixture(),
          runtime: { ...fixture().runtime, MIGRATION_DATABASE_URL: "synthetic-migrator-reference" },
        },
        now,
      ),
    /invalid-runtime-settings/,
  );
  for (const query of [
    "sslmode=disable",
    "sslmode=no-verify",
    "sslmode=require",
    "sslmode=verify-full&options=unsafe",
  ])
    assert.throws(
      () =>
        validateCodebaseProfile(
          {
            ...fixture(),
            DATABASE_URL: fixture().DATABASE_URL.replace("sslmode=verify-full", query),
          },
          now,
        ),
      /verified-database-tls-required/,
    );
  const bad = { ...fixture(), DATABASE_URL: "invalid synthetic-runtime-secret URI" };
  assert.throws(
    () => validateCodebaseProfile(bad, now),
    (error) =>
      !String(error).includes("synthetic-runtime-secret") &&
      String(error).includes("database-reference"),
  );
});
test("runtime injection scrubs migration/local overrides and keeps credentials only in the child environment", () => {
  const profile = validateCodebaseProfile(fixture(), now);
  const environment = codebaseEnvironment(profile, {
    PATH: "fixture-path",
    DATABASE_URL: "inherited-local-db",
    MIGRATION_DATABASE_URL: "inherited-migrator",
    PGHOST: "localhost",
    PGPASSWORD: "inherited-secret",
    FREVOS_PUBLIC_ORIGIN: "http://wrong",
    DEVSETU_REVIEWS_ROOT: "local-json",
    NODE_OPTIONS: "--inspect",
    NODE_TLS_REJECT_UNAUTHORIZED: "0",
    NODE_EXTRA_CA_CERTS: "unverified",
    SystemRoot: "fixture-system",
  });
  assert.equal(environment.PATH, "fixture-path");
  assert.equal(environment.DATABASE_URL, fixture().DATABASE_URL);
  assert.equal(environment.FREVOS_PUBLIC_ORIGIN, fixture().runtime.FREVOS_PUBLIC_ORIGIN);
  for (const key of [
    "MIGRATION_DATABASE_URL",
    "PGHOST",
    "PGPASSWORD",
    "DEVSETU_REVIEWS_ROOT",
    "NODE_OPTIONS",
    "NODE_TLS_REJECT_UNAUTHORIZED",
    "NODE_EXTRA_CA_CERTS",
  ])
    assert.ok(!Object.hasOwn(environment, key));
  assert.equal(environment.DEVSETU_REVIEWS_MONITORING_ENABLED, "false");
});
test("profile and build failures are bounded pure checks, without creating app, DB, Docker or preview processes", () => {
  const temporary = mkdtempSync(join(tmpdir(), "devsetu-code-profile-"));
  try {
    const file = join(temporary, "runtime.json");
    writeFileSync(file, JSON.stringify(fixture()), { mode: 0o600 });
    let permissionChecks = 0;
    const profile = loadCodebaseProfile(file, { now, checkPermissions: () => permissionChecks++ });
    assert.equal(permissionChecks, 1);
    assert.equal(profile.target.database, "shared_fixture");
    assert.throws(
      () =>
        loadCodebaseProfile(join(temporary, "missing.json"), { now, checkPermissions: () => {} }),
      /profile-unavailable/,
    );
    assert.throws(
      () =>
        loadCodebaseProfile(file, {
          now,
          checkPermissions: () => {
            throw new Error("denied");
          },
        }),
      /unprotected/,
    );
    writeFileSync(file, "{malformed");
    assert.throws(
      () => loadCodebaseProfile(file, { now, checkPermissions: () => {} }),
      /invalid-profile-json/,
    );
    assert.throws(() => codebaseLaunchPlan(profile, temporary), /build-required/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("a stale build or missing explicit platform-state reference cannot reuse an old compiled runtime", () => {
  const temporary = mkdtempSync(join(tmpdir(), "devsetu-code-build-"));
  try {
    const sources = [
      "apps/control-plane/src/main.ts",
      "apps/control-plane/migrations/fixture.sql",
      "packages/contracts/src/index.ts",
      "apps/control-center/src/main.tsx",
      "apps/control-center/index.html",
      "apps/control-center/vite.config.ts",
    ];
    const artifacts = [
      "apps/control-plane/dist/main.js",
      "packages/contracts/dist/index.js",
      "apps/control-center/dist/index.html",
    ];
    for (const path of [...sources, ...artifacts]) {
      const file = join(temporary, path);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, "inert fixture");
      const time = new Date(now - (sources.includes(path) ? 2000 : 1000));
      utimesSync(file, time, time);
    }
    const profile = validateCodebaseProfile(fixture(), now);
    assert.equal(codebaseLaunchPlan(profile, temporary).entry, join(temporary, artifacts[0]));
    assert.throws(
      () =>
        codebaseLaunchPlan(
          {
            ...profile,
            runtime: {
              ...profile.runtime,
              FREVOS_SERVIX_DEPLOYMENT_ROOT: join(temporary, "missing-state"),
            },
          },
          temporary,
        ),
      /platform-state-reference-unavailable/,
    );
    const newer = new Date(now);
    utimesSync(join(temporary, sources[0]), newer, newer);
    assert.throws(() => codebaseLaunchPlan(profile, temporary), /build-required/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("runtime logs redact split credential lines and discard a whole oversized line without leaking its suffix", async () => {
  const profile = validateCodebaseProfile(fixture(), now);
  const stream = new PassThrough();
  let output = "";
  forwardRuntimeLog(
    stream,
    {
      write: (value) => {
        output += value;
      },
    },
    logRedactor(profile),
  );
  stream.write("connection postgresql://runtime_fixture:synthetic-");
  stream.write(
    "runtime-secret@db.internal.example.invalid:5433/shared_fixture?sslmode=verify-full\n",
  );
  stream.write(`${"x".repeat(131073)}synthetic-`);
  stream.write("runtime-secret\nnormal line\n");
  stream.end("synthetic-runtime-secret");
  await once(stream, "end");
  assert.ok(!output.includes("synthetic-runtime-secret"));
  assert.ok(!output.includes("runtime-secret"));
  assert.ok(!output.includes(profile.databaseUrl));
  assert.ok(output.includes("[redacted]"));
  assert.ok(output.includes("[oversized runtime log omitted]"));
  assert.ok(output.includes("normal line"));
});
