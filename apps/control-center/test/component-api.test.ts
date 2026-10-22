import { expect, it } from "vitest";
import { PipelineSchema, PipelineRunSchema } from "@frevos/contracts";
import { createControlCenterApi } from "../src/api.js";
it("uses workspace-scoped validated component APIs with CSRF and exact change/revision/current-release bindings", async () => {
  const input = {
    version: 1 as const,
    profileId: "split-project",
    expectedRevision: 0,
    displayName: "Split project",
    sourceFolder: "D:\\source",
    sourcePreservedPaths: [".local"],
    archived: false,
    components: [
      {
        id: "api",
        name: "API",
        context: ".",
        recipe: "node-source" as const,
        output: ".",
        builderId: "unassigned" as const,
        destinationId: "unassigned" as const,
        destinationBinding: "api",
        dependsOn: [],
        preservedPaths: ["uploads", ".env"],
      },
    ],
  };
  const { expectedRevision: _, ...fields } = input;
  const profile = PipelineSchema.parse({
    ...fields,
    revision: 1,
    repository: {
      id: "gitrepo_" + "a".repeat(32),
      origin: "devsetu://repositories/gitrepo_" + "a".repeat(32),
      remoteName: "devsetu",
      branch: "devsetu-dev",
    },
    updatedAt: new Date().toISOString(),
    updatedBy: "usr_owner",
  });
  const request = {
    requestId: "pr_" + "b".repeat(32),
    profileId: input.profileId,
    expectedRevision: 1,
    operation: "deploy" as const,
    connectorId: "fc_" + "c".repeat(32),
    expectedCurrent: { api: null },
    changeDetails: { message: "Deploy API", approvedBy: "Owner / CHG fixture" },
  };
  const run = PipelineRunSchema.parse({
    ...request,
    sourceRequestId: "sd_" + "b".repeat(32),
    workspaceId: "ws_server20",
    requestedBy: "usr_owner",
    config: profile,
    sourceHead: null,
    status: "publishing",
    createdAt: profile.updatedAt,
    updatedAt: profile.updatedAt,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    components: [{ id: "api", status: "pending" }],
  });
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const state = { profiles: [profile], executors: [], runs: [] };
  const connection = {
    profileId: input.profileId,
    revision: 1,
    checkedAt: profile.updatedAt,
    checks: [],
    ready: false,
  };
  const api = createControlCenterApi(
    async (url, init) => {
      calls.push({ url: String(url), init });
      const data = String(url).endsWith("/configuration")
        ? profile
        : String(url).endsWith("/runs")
          ? run
          : String(url).endsWith("/test")
            ? connection
            : String(url).endsWith("/revoke")
              ? { revoked: true }
              : state;
      return new Response(JSON.stringify(data));
    },
    "/frevos",
    () => "csrf-fixture",
  );
  expect(await api.componentState?.("ws_server20")).toEqual(state);
  expect(await api.savePipeline?.("ws_server20", input)).toEqual(profile);
  expect(await api.runPipeline?.("ws_server20", request)).toEqual(run);
  expect(await api.testPipeline?.("ws_server20", input.profileId, request.connectorId)).toEqual(
    connection,
  );
  expect(await api.revokeExecutor?.("ws_server20", "ex_" + "d".repeat(32))).toEqual({
    revoked: true,
  });
  expect(calls.map((c) => c.url)).toEqual([
    "/frevos/v1/workspaces/ws_server20/component-deployments",
    "/frevos/v1/workspaces/ws_server20/component-deployments/configuration",
    "/frevos/v1/workspaces/ws_server20/component-deployments/runs",
    "/frevos/v1/workspaces/ws_server20/component-deployments/split-project/test",
    "/frevos/v1/workspaces/ws_server20/component-deployments/executors/ex_" +
      "d".repeat(32) +
      "/revoke",
  ]);
  for (const call of calls.slice(1))
    expect(call.init?.headers).toMatchObject({ "x-csrf-token": "csrf-fixture" });
  expect(JSON.parse(String(calls[2]?.init?.body))).toEqual(request);
  expect(JSON.parse(String(calls[3]?.init?.body))).toEqual({ deviceId: request.connectorId });
});
