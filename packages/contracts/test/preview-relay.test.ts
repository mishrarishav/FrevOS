import { expect, it } from "vitest";
import {
  LocalDevPlanSchema,
  PreviewBootstrapSchema,
  PreviewJobSchema,
  PreviewResultSchema,
} from "../src/index.js";
it("accepts opted-in service plans without changing older plans and constrains configurable API prefixes", () => {
  const service = { id: "web", port: 3000, database: "none", script: "dev" };
  expect(LocalDevPlanSchema.parse({ services: [service] })).toEqual({ services: [service] });
  expect(
    LocalDevPlanSchema.parse({ services: [{ ...service, preview: {} }] }).services[0]!.preview,
  ).toEqual({ apiPath: "/api" });
  for (const apiPath of ["//elsewhere", "/../private", "http://localhost/", "/api?secret=one"])
    expect(
      LocalDevPlanSchema.safeParse({ services: [{ ...service, preview: { apiPath } }] }).success,
    ).toBe(false);
});
it("constrains request paths, methods, binary encodings and header injection", () => {
  const job = {
    version: 1,
    id: "prv_" + "a".repeat(32),
    workspaceId: "ws_team",
    deviceId: "fc_" + "b".repeat(32),
    profileId: "project",
    serviceId: "web",
    revision: 1,
    fingerprint: "c".repeat(64),
    origin: "http://preview.internal",
    method: "POST",
    path: "/save?a=1",
    headers: [["content-type", "application/octet-stream"]],
    body: "AP8=",
    timeoutMs: 1000,
    maxResponseBytes: 1024,
  };
  expect(PreviewJobSchema.parse(job)).toEqual(job);
  for (const patch of [
    { path: "//host/" },
    { path: "/one\r\nHost: x" },
    { path: "/a\\b" },
    { method: "CONNECT" },
    { body: "malformed!" },
    { headers: [["bad\nname", "value"]] },
    { headers: [["valid", "one\r\ntwo"]] },
  ])
    expect(PreviewJobSchema.safeParse({ ...job, ...patch }).success).toBe(false);
  expect(
    PreviewResultSchema.parse({ id: job.id, ok: false, error: "target-unavailable" }),
  ).toMatchObject({ ok: false });
  expect(
    PreviewResultSchema.safeParse({ id: job.id, ok: false, error: "raw-application-secret" })
      .success,
  ).toBe(false);
  expect(
    PreviewBootstrapSchema.safeParse({ action: "http://preview.internal/", ticket: "short" })
      .success,
  ).toBe(false);
});
