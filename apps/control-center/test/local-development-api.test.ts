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
it("opens and closes VPN preview using workspace CSRF without putting the bootstrap ticket in a URL", async () => {
  const calls: { url: string; init?: RequestInit | undefined }[] = [],
    ticket = "a".repeat(64);
  const api = createControlCenterApi(
    async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify(
          String(url).endsWith("/open")
            ? { action: "http://preview.internal/.__devsetu/open", ticket }
            : { closed: true },
        ),
      );
    },
    "/frevos",
    () => "csrf-fixture",
  );
  const target = { deviceId: "fc_" + "b".repeat(32), serviceId: "web" };
  expect(await api.previewOpen!("ws_team", target)).toEqual({
    action: "http://preview.internal/.__devsetu/open",
    ticket,
  });
  expect(await api.previewClose!("ws_team", target)).toEqual({ closed: true });
  expect(calls.map((c) => c.url)).toEqual([
    "/frevos/v1/workspaces/ws_team/local-development/preview/open",
    "/frevos/v1/workspaces/ws_team/local-development/preview/close",
  ]);
  for (const call of calls) {
    expect(call.init?.headers).toMatchObject({ "x-csrf-token": "csrf-fixture" });
    expect(JSON.parse(String(call.init?.body))).toEqual(target);
    expect(call.url).not.toContain(ticket);
  }
});
