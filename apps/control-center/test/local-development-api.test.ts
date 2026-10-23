import { expect, it } from "vitest";
import { createControlCenterApi } from "../src/api.js";
it("uses validated workspace-scoped local development actions with CSRF and no shell or secret payload", async () => {
  const request = {
    version: 1 as const,
    requestId: "ld_" + "a".repeat(32),
    deviceId: "fc_" + "b".repeat(32),
    profileId: "servix-development",
    expectedRevision: 1,
    fingerprint: "c".repeat(64),
    operation: "restart" as const,
    mode: "development" as const,
  };
  const job = {
    version: 1,
    workspaceId: "ws_server20",
    actor: "usr_alice",
    request,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 120000).toISOString(),
    status: "queued",
  };
  const calls: { url: string; init?: RequestInit | undefined }[] = [];
  const api = createControlCenterApi(
    async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify(String(url).endsWith("/actions") ? job : { connections: [], jobs: [] }),
      );
    },
    "/frevos",
    () => "csrf-fixture",
  );
  expect(await api.localDevelopmentState?.("ws_server20")).toEqual({ connections: [], jobs: [] });
  expect(await api.localDevelopmentAction?.("ws_server20", request)).toEqual(job);
  expect(calls.map((call) => call.url)).toEqual([
    "/frevos/v1/workspaces/ws_server20/local-development",
    "/frevos/v1/workspaces/ws_server20/local-development/actions",
  ]);
  expect(calls[1]?.init?.headers).toMatchObject({ "x-csrf-token": "csrf-fixture" });
  expect(JSON.parse(String(calls[1]?.init?.body))).toEqual(request);
});
