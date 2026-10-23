import { expect, it } from "vitest";
import {
  LocalDevActionSchema,
  LocalDevPlanSchema,
  LocalDevSnapshotSchema,
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
