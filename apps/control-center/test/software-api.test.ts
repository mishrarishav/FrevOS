import { SoftwareStateSchema } from "@frevos/contracts";
import { expect, it } from "vitest";
import { createControlCenterApi } from "../src/api.js";

const deviceId = "fc_" + "a".repeat(32),
  workspaceId = "ws_server20";
const state = SoftwareStateSchema.parse({
  workspaceId,
  administrator: true,
  demoProgramSha256: "c".repeat(64),
  packageDigests: {},
  catalog: { version: 1, workspaceId, revision: 0, packages: [] },
  device: {
    id: deviceId,
    name: "Fixture laptop",
    online: true,
    capability: null,
    inventoryObservedAt: null,
    inventory: null,
    scan: null,
  },
  jobs: [],
});
it("loads software state through the workspace API and sends the inventory cursor without exposing credentials in URLs", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const api = createControlCenterApi(async (url, init) => {
    calls.push({ url: String(url), ...(init ? { init } : {}) });
    return Response.json(state);
  });
  const since = "2026-11-03T00:00:00.000Z";
  expect(await api.softwareState?.(workspaceId, deviceId, undefined, since)).toEqual(state);
  expect(calls[0]?.url).toBe(
    `/v1/workspaces/${workspaceId}/software/${deviceId}?inventorySince=${encodeURIComponent(since)}`,
  );
  expect(calls[0]?.init?.credentials).toBe("same-origin");
  await api.softwareState?.(workspaceId, deviceId, undefined, undefined, since);
  expect(calls[1]?.url).toBe(
    `/v1/workspaces/${workspaceId}/software/${deviceId}?servicesSince=${encodeURIComponent(since)}`,
  );
  await api.softwareState?.(workspaceId, deviceId, undefined, since, since);
  expect(calls[2]?.url).toContain(`&servicesSince=${encodeURIComponent(since)}`);
  await api.softwareState?.(workspaceId, deviceId);
  expect(calls[3]?.url).toBe(`/v1/workspaces/${workspaceId}/software/${deviceId}`);
});
it("saves a revisioned per-device service policy through the same CSRF-protected API", async () => {
  const input = {
    version: 1,
    deviceId,
    expectedRevision: 0,
    rule: { id: "a".repeat(64), definitionSha256: "b".repeat(64), enabled: true },
  };
  const api = createControlCenterApi(
    async (url, init) => {
      expect(String(url)).toBe(`/v1/workspaces/${workspaceId}/software/service-policy`);
      expect(JSON.parse(String(init?.body))).toEqual(input);
      expect(new Headers(init?.headers).get("x-csrf-token")).toBe("synthetic-csrf");
      return Response.json({ version: 1, workspaceId, deviceId, revision: 1, rules: [input.rule] });
    },
    undefined,
    () => "synthetic-csrf",
  );
  expect((await api.softwareServicePolicy?.(workspaceId, input))?.revision).toBe(1);
});
it("CSRF-protects catalogue and typed software requests and propagates failures", async () => {
  const calls: { url: string; body: unknown; headers: HeadersInit | undefined }[] = [];
  const request = {
    version: 1 as const,
    requestId: "sw_" + "b".repeat(32),
    deviceId,
    operation: "inventory" as const,
  };
  const job = {
    version: 1,
    workspaceId,
    actor: "usr_fixture",
    request,
    digest: "d".repeat(64),
    status: "approved",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 600000).toISOString(),
  };
  const api = createControlCenterApi(
    async (url, init) => {
      calls.push({
        url: String(url),
        body: JSON.parse(String(init?.body)),
        headers: init?.headers,
      });
      return Response.json(String(url).endsWith("/catalog") ? state.catalog : job);
    },
    undefined,
    () => "synthetic-csrf",
  );
  await api.softwareCatalog?.(workspaceId, { version: 1, expectedRevision: 0, packages: [] });
  await api.softwareRequest?.(workspaceId, request);
  await api.softwareDecision?.(workspaceId, {
    requestId: request.requestId,
    digest: job.digest,
    decision: "reject",
  });
  expect(calls.map((c) => c.url)).toEqual(
    ["catalog", "requests", "decisions"].map(
      (action) => `/v1/workspaces/${workspaceId}/software/${action}`,
    ),
  );
  expect(calls.every((c) => new Headers(c.headers).get("x-csrf-token") === "synthetic-csrf")).toBe(
    true,
  );
  expect(calls[1]?.body).toEqual(request);
  const denied = createControlCenterApi(async () => new Response(null, { status: 403 }));
  await expect(denied.softwareState?.(workspaceId, deviceId)).rejects.toThrow();
  const invalid = createControlCenterApi(async () => Response.json({ device: { inventory: [] } }));
  await expect(invalid.softwareState?.(workspaceId, deviceId)).rejects.toThrow();
});
