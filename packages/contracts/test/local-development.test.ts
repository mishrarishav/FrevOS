import { expect, it } from "vitest";
import {
  LocalDevActionSchema,
  LocalDevPlanSchema,
  LocalDevSnapshotSchema,
  LocalEnvChangesSchema,
  LocalEnvDocumentSchema,
  localEnvVisibleValue,
  localEnvContext,
} from "../src/local-development.js";
const base = {
  version: 1,
  requestId: "ld_" + "a".repeat(32),
  deviceId: "fc_" + "b".repeat(32),
  profileId: "servix-development",
  expectedRevision: 1,
  fingerprint: "c".repeat(64),
};
it("accepts only bounded local recipes and business actions, never browser commands, credentials or arbitrary PIDs", () => {
  for (const operation of ["start", "restart"])
    expect(
      LocalDevActionSchema.safeParse({ ...base, operation, mode: "development" }).success,
    ).toBe(true);
  expect(
    LocalDevActionSchema.safeParse({ ...base, operation: "start", mode: "production" }).success,
  ).toBe(true);
  expect(LocalDevActionSchema.safeParse({ ...base, operation: "stop" }).success).toBe(true);
  for (const extra of [
    { command: "npm start" },
    { password: "synthetic" },
    { pid: 1234 },
    { workingDirectory: "C:\\outside" },
    { approval: true },
  ])
    expect(
      LocalDevActionSchema.safeParse({ ...base, operation: "start", mode: "production", ...extra })
        .success,
    ).toBe(false);
  expect(
    LocalDevActionSchema.safeParse({
      ...base,
      operation: "kill-existing",
      serviceId: "backend",
      identity: "d".repeat(64),
    }).success,
  ).toBe(true);
  expect(
    LocalDevActionSchema.safeParse({ ...base, operation: "kill-existing", serviceId: "backend" })
      .success,
  ).toBe(false);
  const service = {
    id: "backend",
    port: 5000,
    script: "start",
    database: "mysql",
    developmentEnvironment: ".env.dev",
    productionEnvironment: ".env.readonly",
  };
  expect(
    LocalDevActionSchema.safeParse({
      ...base,
      operation: "configure",
      plan: { services: [service] },
    }).success,
  ).toBe(true);
  for (const change of [
    { port: 80 },
    { port: 65536 },
    { script: "seed" },
    { developmentEnvironment: "../.env" },
    { productionEnvironment: "C:\\passwords.env" },
    { database: "arbitrary" },
  ])
    expect(LocalDevPlanSchema.safeParse({ services: [{ ...service, ...change }] }).success).toBe(
      false,
    );
  expect(LocalDevPlanSchema.safeParse({ services: [] }).success).toBe(false);
  expect(
    LocalDevPlanSchema.safeParse({ services: [service, { ...service, id: "frontend" }] }).success,
  ).toBe(false);
  expect(
    LocalDevPlanSchema.safeParse({ services: [service, { ...service, port: 5001 }] }).success,
  ).toBe(false);
});
it("keeps environment CRUD bounded, sealed, explicitly approved and scoped to an existing dotenv reference", () => {
  const request = {
    ...base,
    operation: "environment-save",
    serviceId: "backend",
    reference: ".env.production",
    documentRevision: "d".repeat(64),
    approved: true,
    sealed: {
      keyId: "e".repeat(64),
      publicKey: "f".repeat(64),
      iv: "a".repeat(24),
      ciphertext: "ab".repeat(20),
    },
  };
  expect(LocalDevActionSchema.safeParse(request).success).toBe(true);
  for (const change of [
    { reference: "../.env" },
    { reference: "appsettings.json" },
    { approved: false },
    { value: "synthetic-private" },
    { sealed: { ...request.sealed, ciphertext: "plaintext" } },
  ])
    expect(LocalDevActionSchema.safeParse({ ...request, ...change }).success).toBe(false);
  expect(
    LocalDevActionSchema.safeParse({
      ...base,
      operation: "environment-read",
      serviceId: "backend",
      reference: ".env",
    }).success,
  ).toBe(true);
  for (const changes of [
    [],
    [{ operation: "set", key: "BAD KEY", value: "v" }],
    [{ operation: "set", key: "OK", value: "a\nb" }],
    [
      { operation: "set", key: "A", value: "" },
      { operation: "delete", key: "A" },
    ],
    [{ operation: "delete", key: "A", value: "v" }],
  ])
    expect(LocalEnvChangesSchema.safeParse(changes).success).toBe(false);
  expect(
    LocalEnvChangesSchema.safeParse([
      { operation: "set", key: "EMPTY", value: "" },
      { operation: "delete", key: "OLD" },
    ]).success,
  ).toBe(true);
  const ctx = { ...request, requestId: base.requestId };
  expect(JSON.parse(localEnvContext(ctx, request.sealed.keyId))).toEqual([
    "local-environment-v1",
    "ws_server20",
    base.requestId,
    base.deviceId,
    base.profileId,
    1,
    base.fingerprint,
    "backend",
    ".env.production",
    request.documentRevision,
    request.sealed.keyId,
  ]);
});
it("returns only strictly validated ordinary environment values and masks credentials and unknown keys", () => {
  for (const [key, value] of [
    ["DB_HOST", "db.internal"],
    ["PGHOST", "::1"],
    ["HOST", "localhost"],
    ["DB_NAME", "app_dev"],
    ["PGDATABASE", "test"],
    ["PORT", "3000"],
    ["DB_PORT", "3306"],
    ["PGPORT", "5432"],
    ["NODE_ENV", "development"],
    ["MAIL_ENABLED", "false"],
  ]) {
    expect(localEnvVisibleValue(key as string, value as string)).toBe(true);
    expect(
      LocalEnvDocumentSchema.safeParse({
        serviceId: "api",
        reference: ".env.dev",
        revision: "a".repeat(64),
        rows: [{ key, masked: false, value }],
      }).success,
    ).toBe(true);
  }
  for (const [key, value] of [
    ["DB_HOST", "host/password"],
    ["DB_NAME", "schema;password"],
    ["PORT", "no"],
    ["PORT", "0"],
    ["PORT", "99999"],
    ["NODE_ENV", "unknown"],
    ["MAIL_ENABLED", "maybe"],
    ["DB_PASSWORD", "synthetic"],
    ["VITE_TOKEN", "synthetic"],
  ]) {
    expect(localEnvVisibleValue(key as string, value as string)).toBe(false);
    expect(
      LocalEnvDocumentSchema.safeParse({
        serviceId: "api",
        reference: ".env",
        revision: "a".repeat(64),
        rows: [{ key, masked: false, value }],
      }).success,
    ).toBe(false);
  }
  const doc = {
    serviceId: "api",
    reference: ".env",
    revision: "a".repeat(64),
    rows: [{ key: "DB_PASSWORD", masked: true }],
  };
  expect(LocalEnvDocumentSchema.safeParse(doc).success).toBe(true);
  expect(
    LocalEnvDocumentSchema.safeParse({
      ...doc,
      rows: [{ key: "DB_PASSWORD", masked: true, value: "synthetic" }],
    }).success,
  ).toBe(false);
  expect(
    LocalEnvDocumentSchema.safeParse({ ...doc, rows: [...doc.rows, ...doc.rows] }).success,
  ).toBe(false);
});
it("validates fresh connector observations and loopback-only preview links without exposing environment contents", () => {
  const snapshot = {
    version: 1,
    deviceId: base.deviceId,
    profileId: base.profileId,
    fingerprint: base.fingerprint,
    revision: 0,
    sourceReady: true,
    candidates: [],
    plan: null,
    services: [{ id: "backend", status: "running", previewUrl: "http://localhost:5000/" }],
  };
  expect(LocalDevSnapshotSchema.safeParse(snapshot).success).toBe(true);
  expect(LocalDevSnapshotSchema.safeParse({ ...snapshot, credential: "synthetic" }).success).toBe(
    false,
  );
  for (const previewUrl of [
    "javascript:alert(1)",
    "http://10.9.69.21:82/",
    "https://outside.example/",
  ])
    expect(
      LocalDevSnapshotSchema.safeParse({
        ...snapshot,
        services: [{ ...snapshot.services[0], previewUrl }],
      }).success,
    ).toBe(false);
});
