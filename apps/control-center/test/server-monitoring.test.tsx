import { type ServerMonitorPoint, UserIdSchema } from "@frevos/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { createControlCenterApi } from "../src/api.js";
import { addBasePath, removeBasePath, resolveRoute } from "../src/routing.js";
import {
  ServerMetricGraph,
  ServerMonitorCard,
  ServerMonitorDetail,
  ServerMonitoringPage,
  ServerPerformance,
  ServerPolicyEditor,
  ServerTargetEditor,
  serverBytes,
  serverFresh,
  serverGraphSegments,
  serverMemoryPercent,
  serverMonitorColumns,
  serverPercent,
  serverStatus,
  serverStatusLabel,
  serverTransportLabel,
} from "../src/ServerMonitoringPage.js";
import { fixtureTarget, serverMonitorFixture } from "./server-monitoring-fixture.js";

const end = Date.parse("2026-11-11T04:05:00.000Z");
const noop = () => {};
it("uses the Reviews server route under a configured public prefix", () => {
  const route = resolveRoute(
    removeBasePath(addBasePath("/reviews/servers", "/configured-prefix"), "/configured-prefix"),
  );
  expect(route?.id).toBe("server-monitoring");
  expect(route?.label).toBe("Server monitoring");
  expect(resolveRoute("/reviews")?.id).toBe("reviews");
});
it("draws only actual CPU/memory observations and preserves missing counters, collection gaps and future exclusions", () => {
  const point = (
    offset: number,
    cpuPercent: number | null,
    memoryUsedBytes = 75,
    memoryTotalBytes = 100,
  ): ServerMonitorPoint => ({
    at: new Date(end + offset * 1000).toISOString(),
    cpuPercent,
    memoryUsedBytes,
    memoryTotalBytes,
  });
  const samples = [
    point(-1000, 99),
    point(-240, 10),
    point(-210, 30),
    point(-180, null),
    point(-150, 50),
    point(-30, 70),
    point(0, 80),
    point(30, 90),
  ];
  expect(
    serverGraphSegments(samples, "cpu", end, 30).map((segment) =>
      segment.map((sample) => sample.value),
    ),
  ).toEqual([[10, 30], [50], [70, 80]]);
  expect(serverGraphSegments([point(0, 0, 25)], "memory", end, 30)[0]?.[0]?.value).toBe(25);
  expect(
    serverGraphSegments([point(0, 0, 110), point(-30, null, 0, 0)], "memory", end, 30),
  ).toEqual([]);
  expect(serverGraphSegments([point(-20, null), point(0, null)], "cpu", end, 30)).toEqual([]);
  const empty = renderToStaticMarkup(
    <ServerMetricGraph points={[]} metric="cpu" end={end} intervalSeconds={30} value={null} />,
  );
  expect(empty).toContain("Waiting for measured samples");
  expect(empty).not.toContain("<polyline");
  expect(empty).not.toContain(">0.0%</strong>");
});
it("keeps old measurements historical and separates access failures, pending checks and local collection", () => {
  const catalog = serverMonitorFixture(),
    target = fixtureTarget(catalog);
  expect(serverFresh(target, catalog.policy, end)).toBe(true);
  expect(serverStatus(target, catalog.policy, end)).toBe("live");
  expect(serverFresh(target, catalog.policy, end - 1)).toBe(false);
  expect(serverStatus(target, catalog.policy, end + 91000)).toBe("stale");
  expect(serverStatus({ ...target, polling: true }, catalog.policy, end)).toBe("checking");
  expect(serverStatus({ ...target, enabled: false }, catalog.policy, end)).toBe("paused");
  expect(
    serverStatus(
      { ...target, access: { ...target.access, status: "auth-failed" } },
      catalog.policy,
      end,
    ),
  ).toBe("auth-failed");
  expect(
    serverStatus(
      { ...target, enabled: false, access: { ...target.access, status: "auth-failed" } },
      catalog.policy,
      end,
    ),
  ).toBe("auth-failed");
  expect(serverStatusLabel("winrm-unavailable")).toBe("WinRM unavailable");
  expect(serverTransportLabel({ ...target, transport: "local" })).toBe("Central collector host");
  expect(serverMemoryPercent(target)).toBe(75);
  expect(serverBytes(0)).toBe("0 B");
  expect(serverBytes(null)).toBe("—");
  expect(serverPercent(null)).toBe("—");
  const html = renderToStaticMarkup(
    <ServerPerformance target={target} policy={catalog.policy} now={end + 91000} />,
  );
  expect(html).toContain("No current measurement");
  expect(html).toContain("46.5%");
  expect(html).toContain("Not measured");
  expect(html).toContain("1d 2h 3m");
  expect(html).toContain("20.0 GB free of 100.0 GB");
  expect(html).not.toContain("100% complete");
});
it("shows monitoring controls and scoped process/service navigation without exposing credential or administrator actions to a viewer", () => {
  const catalog = serverMonitorFixture(),
    target = fixtureTarget(catalog);
  const card = renderToStaticMarkup(
    <ServerMonitorCard
      target={{ ...target, name: "<script>host</script>" }}
      policy={catalog.policy}
      now={end}
      administrator={false}
      busy={false}
      open={noop}
      refresh={noop}
      edit={noop}
    />,
  );
  expect(card).toContain("&lt;script&gt;host&lt;/script&gt;");
  expect(card).toContain("Open monitor");
  expect(card).not.toContain("Configure");
  expect(card).not.toContain("monitor-fixture");
  expect(card).not.toContain("usr_fixture");
  const detail = renderToStaticMarkup(
    <ServerMonitorDetail
      target={target}
      catalog={{ ...catalog, administrator: false }}
      userId="usr_fixture"
      busy={false}
      error=""
      select={noop}
      close={noop}
      refresh={noop}
      acknowledge={noop}
    />,
  );
  for (const label of [
    "Performance",
    "Processes",
    "Services",
    "Alerts",
    "Last observation:",
    "Last access check:",
  ])
    expect(detail).toContain(label);
  expect(detail).not.toContain("Acknowledge");
  expect(detail).not.toContain("monitor-fixture");
  expect(detail).not.toContain("Stop service");
  const columns = serverMonitorColumns(catalog.policy, noop);
  expect(columns.find((column) => column.id === "applications")?.value(target)).toBe(
    "Fixture application",
  );
});
it("configures sampling thresholds, opaque credentials and explicit account grants without a password field", () => {
  const catalog = serverMonitorFixture();
  const policy = renderToStaticMarkup(
    <ServerPolicyEditor
      initial={catalog.policy}
      busy={false}
      error=""
      close={noop}
      save={async () => {}}
    />,
  );
  expect(policy).toContain("Maximum retained samples per server");
  expect(policy).toContain("Consecutive high samples for an alert");
  expect(policy).toContain("Enable scheduled server monitoring");
  const target = renderToStaticMarkup(
    <ServerTargetEditor
      initial={fixtureTarget(catalog)}
      users={[{ userId: UserIdSchema.parse("usr_fixture"), name: "Workspace viewer" }]}
      busy={false}
      error=""
      close={noop}
      save={async () => {}}
    />,
  );
  expect(target).toContain("Credential profile reference");
  expect(target).toContain("Workspace viewer");
  expect(target).toContain("checked=");
  expect(target).not.toContain('type="password"');
  expect(target).not.toContain("Deployment_server_pass");
});
it("does not perform remote checks while rendering the monitoring page", () => {
  let calls = 0;
  const api = createControlCenterApi(async () => {
    calls++;
    return new Response("{}");
  });
  const html = renderToStaticMarkup(
    <ServerMonitoringPage
      api={api}
      workspaceId="ws_fixture"
      userId="usr_fixture"
      scopeName="Fixture workspace"
    />,
  );
  expect(calls).toBe(0);
  expect(html).toContain("Server monitoring");
  expect(html).not.toContain("Add server");
});
