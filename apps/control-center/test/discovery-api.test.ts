import {
  DeliveryPlanInputSchema,
  DiscoveryPolicyInputSchema,
  defaultDiscoveryPolicy,
} from "@frevos/contracts";
import { expect, it } from "vitest";
import { createControlCenterApi } from "../src/api.js";

it("uses strict Discovery records and workspace/CSRF boundaries for tracking and authoritative acceptance", async () => {
  const at = "2026-10-24T10:00:00.000Z",
    deviceId = "fc_" + "a".repeat(32);
  const policy = DiscoveryPolicyInputSchema.parse({
    version: 1,
    deviceId,
    expectedRevision: 0,
    policy: defaultDiscoveryPolicy,
  });
  const plan = DeliveryPlanInputSchema.parse({
    version: 1,
    projectId: "prj_fixture",
    expectedRevision: 0,
    poReference: "PO-42",
    poDate: "2026-10-14",
    responsible: "Fixture",
    timeZone: "UTC",
    deviceIds: [],
    milestones: [
      {
        id: "work",
        title: "Accepted work",
        weight: 1,
        dueDate: "2026-10-24",
        acceptance: "accepted",
        evidence: "QA-42",
      },
    ],
  });
  const calls: { url: string; init?: RequestInit | undefined }[] = [];
  const api = createControlCenterApi(
    async (url, init) => {
      calls.push({ url: String(url), init });
      const body = String(url).endsWith("/policy")
        ? {
            version: 1,
            deviceId,
            policy: defaultDiscoveryPolicy,
            revision: 1,
            actor: "usr_fixture",
            updatedAt: at,
          }
        : String(url).endsWith("/plans")
          ? {
              ...plan,
              revision: 1,
              actor: "usr_fixture",
              updatedAt: at,
              workspaceId: "ws_server20",
            }
          : { systems: [], reports: [] };
      return new Response(JSON.stringify(body));
    },
    "/frevos",
    () => "csrf-fixture",
  );
  expect(await api.discoveryState?.("ws_server20")).toEqual({ systems: [], reports: [] });
  await api.discoveryPolicy?.("ws_server20", policy);
  await api.deliveryPlan?.("ws_server20", plan);
  await api.discoveryState?.("ws_server20", undefined, deviceId);
  expect(calls.map((c) => c.url)).toEqual([
    "/frevos/v1/workspaces/ws_server20/discovery",
    "/frevos/v1/workspaces/ws_server20/discovery/policy",
    "/frevos/v1/workspaces/ws_server20/discovery/plans",
    `/frevos/v1/workspaces/ws_server20/discovery?historyDeviceId=${deviceId}`,
  ]);
  expect(calls[1]?.init?.headers).toMatchObject({ "x-csrf-token": "csrf-fixture" });
  expect(JSON.parse(String(calls[2]?.init?.body))).toEqual(plan);
});
