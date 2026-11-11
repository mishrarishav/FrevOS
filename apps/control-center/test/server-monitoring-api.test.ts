import { expect, it } from "vitest";
import { ApiFailure, createControlCenterApi } from "../src/api.js";
import { fixtureTarget, serverMonitorFixture } from "./server-monitoring-fixture.js";

it("uses authenticated base-path-aware status reads and CSRF-protected queued monitoring operations", async () => {
  const catalog = serverMonitorFixture(),
    target = fixtureTarget(catalog);
  const source = target.sourceRefs[0],
    alert = target.alerts[0];
  if (!source || !alert || !target.credentialProfile || !target.grants)
    throw new Error("Incomplete server fixture");
  const calls: { url: string; init?: RequestInit }[] = [];
  const api = createControlCenterApi(
    async (url, init) => {
      const path = String(url);
      calls.push({ url: path, ...(init ? { init } : {}) });
      return new Response(
        JSON.stringify(
          path.endsWith("/imports") ? { catalog, added: 1, updated: 0, excluded: [] } : catalog,
        ),
      );
    },
    "/configured-prefix",
    () => "fixture-csrf",
  );
  const abort = new AbortController();
  expect(await api.serverMonitoring?.(catalog.workspaceId, abort.signal)).toEqual(catalog);
  await api.serverMonitorRefresh?.(catalog.workspaceId, { targetId: target.id });
  await api.serverMonitorRefresh?.(catalog.workspaceId, {});
  await api.serverMonitorSaveTarget?.(catalog.workspaceId, {
    id: target.id,
    expectedRevision: target.revision,
    name: target.name,
    address: target.address,
    port: target.port,
    transport: target.transport,
    enabled: true,
    credentialProfile: target.credentialProfile,
    grants: target.grants,
  });
  expect(
    await api.serverMonitorImport?.(catalog.workspaceId, {
      registerId: source.registerId,
      managementValues: ["In-house"],
      hostingField: "serverAddress",
      credentialProfile: target.credentialProfile,
      transport: "winrm-http",
      port: 5985,
      enabled: true,
    }),
  ).toEqual({ catalog, added: 1, updated: 0, excluded: [] });
  await api.serverMonitorPolicy?.(catalog.workspaceId, {
    expectedRevision: catalog.revision,
    policy: catalog.policy,
  });
  await api.serverMonitorAcknowledge?.(catalog.workspaceId, { alertId: alert.id });
  expect(calls).toHaveLength(7);
  expect(
    calls.every(
      (call) =>
        call.url.startsWith(
          `/configured-prefix/v1/workspaces/${catalog.workspaceId}/server-monitoring`,
        ) &&
        call.init?.credentials === "same-origin" &&
        call.init.cache === "no-store",
    ),
  ).toBe(true);
  expect(calls[0]?.init?.signal).toBe(abort.signal);
  expect(calls[0]?.init?.method).toBe("GET");
  expect(
    calls
      .slice(1)
      .every((call) => new Headers(call.init?.headers).get("x-csrf-token") === "fixture-csrf"),
  ).toBe(true);
  expect(calls[5]?.init?.method).toBe("PUT");
  expect(calls[6]?.url).toContain(`/alerts/${alert.id}/acknowledge`);
  expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({ targetId: target.id });
  expect(JSON.parse(String(calls[2]?.init?.body))).toEqual({});
});
it("rejects unauthorized catalogs, malformed samples and writes without a CSRF token", async () => {
  for (const [status, kind] of [
    [401, "unauthenticated"],
    [403, "denied"],
  ] as const) {
    const api = createControlCenterApi(async () => new Response("{}", { status }));
    await expect(api.serverMonitoring?.("ws_fixture")).rejects.toMatchObject({ kind });
  }
  const invalid = createControlCenterApi(
    async () =>
      new Response(
        JSON.stringify({
          ...serverMonitorFixture(),
          targets: [{ ...serverMonitorFixture().targets[0], latest: { cpuPercent: 900 } }],
        }),
      ),
  );
  await expect(invalid.serverMonitoring?.("ws_fixture")).rejects.toBeInstanceOf(ApiFailure);
  let called = false;
  const noCsrf = createControlCenterApi(
    async () => {
      called = true;
      return new Response("{}");
    },
    "",
    () => undefined,
  );
  await expect(noCsrf.serverMonitorRefresh?.("ws_fixture", {})).rejects.toMatchObject({
    kind: "denied",
  });
  expect(called).toBe(false);
});
