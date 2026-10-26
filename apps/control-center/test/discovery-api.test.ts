import {
  DeliveryPlanInputSchema,
  DiscoveryPolicyInputSchema,
  defaultDiscoveryPolicy,
  defaultActivitySettings,
} from "@frevos/contracts";
import { expect, it } from "vitest";
import { createControlCenterApi } from "../src/api.js";
it("uses typed workspace and CSRF routes for independently revisioned activity settings and requested content", async () => {
  const deviceId = "fc_" + "a".repeat(32),
    at = "2026-10-26T00:00:00.000Z";
  const input = {
    version: 1 as const,
    deviceId,
    expectedRevision: 0,
    settings: defaultActivitySettings,
  };
  const request = { version: 1 as const, deviceId, root: "D:\\", path: "src/app.ts" };
  const job = {
    version: 1,
    requestId: "cp_" + "b".repeat(32),
    actor: "usr_fixture",
    workspaceId: "ws_server20",
    request,
    status: "queued",
    createdAt: at,
    expiresAt: "2026-10-26T00:10:00.000Z",
  };
  const calls: { url: string; init?: RequestInit | undefined }[] = [];
  const api = createControlCenterApi(
    async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify(
          String(url).endsWith("activity-settings")
            ? {
                version: 1,
                deviceId,
                settings: defaultActivitySettings,
                revision: 1,
                actor: "usr_fixture",
                updatedAt: at,
              }
            : job,
        ),
      );
    },
    "/frevos",
    () => "fixture-csrf",
  );
  await api.discoveryActivity!("ws_server20", input);
  expect((await api.requestContent!("ws_server20", request)).request).toEqual(request);
  expect((await api.contentPreview!("ws_server20", job.requestId)).status).toBe("queued");
  expect(calls.map((c) => c.url)).toEqual([
    "/frevos/v1/workspaces/ws_server20/discovery/activity-settings",
    "/frevos/v1/workspaces/ws_server20/discovery/content",
    "/frevos/v1/workspaces/ws_server20/discovery/content/" + job.requestId,
  ]);
  expect(calls[0]!.init?.headers).toMatchObject({ "x-csrf-token": "fixture-csrf" });
  expect(calls[1]!.init?.headers).toMatchObject({ "x-csrf-token": "fixture-csrf" });
  expect(JSON.parse(String(calls[0]!.init?.body))).toEqual(input);
});

it("routes directory metadata and verified folder choices through workspace-scoped CSRF tools", async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = [],
    id = "fc_" + "a".repeat(32),
    job = {
      version: 1,
      requestId: "fb_" + "b".repeat(32),
      actor: "usr_alice",
      workspaceId: "ws_server20",
      request: { version: 1 as const, deviceId: id, root: "D:\\", path: "", page: 0 },
      createdAt: "2026-10-24T00:00:00Z",
      expiresAt: "2026-10-24T00:02:00Z",
      status: "queued",
    };
  const api = createControlCenterApi(
    async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify(
          String(url).endsWith("choose-folder")
            ? {
                version: 1,
                requestId: "fp_" + "c".repeat(32),
                deviceId: id,
                profileId: "fixture-project",
                expiresAt: job.expiresAt,
                status: "queued",
              }
            : job,
        ),
      );
    },
    "/frevos",
    () => "fixture-csrf",
  );
  await api.browseFolders?.("ws_server20", job.request);
  await api.folderBrowseResult?.("ws_server20", job.requestId);
  await api.chooseConnectorFolder?.("ws_server20", id, {
    browseRequestId: job.requestId,
    path: "project",
  });
  expect(calls.map((c) => c.url)).toEqual([
    "/frevos/v1/workspaces/ws_server20/discovery/folders",
    "/frevos/v1/workspaces/ws_server20/discovery/folders/" + job.requestId,
    `/frevos/v1/workspaces/ws_server20/connectors/${id}/choose-folder`,
  ]);
  expect(calls[0]?.init?.headers).toMatchObject({ "x-csrf-token": "fixture-csrf" });
  expect(JSON.parse(String(calls[2]?.init?.body))).toEqual({
    browseRequestId: job.requestId,
    path: "project",
  });
});

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
