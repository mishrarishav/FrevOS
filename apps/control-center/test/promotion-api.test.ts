import { readFile } from "node:fs/promises";
import { PromotionJobSchema, PromotionRegistrySchema } from "@frevos/contracts";
import { expect, it } from "vitest";
import { createControlCenterApi } from "../src/api.js";

it("uses validated workspace-scoped Production prepare/approve APIs with CSRF and stable request identity", async () => {
  const target = PromotionRegistrySchema.parse(
    JSON.parse(
      await readFile(
        new URL("../../../deployment/servix/PromotionRegistry.json", import.meta.url),
        "utf8",
      ),
    ),
  ).targets[0];
  const job = PromotionJobSchema.parse({
    version: 1,
    id: `pm_${"a".repeat(32)}`,
    workspaceId: "ws_server20",
    requestedBy: "usr_windows_admin",
    action: "prepare",
    target,
    targetSha256: "b".repeat(64),
    profileRevision: 1,
    createdAt: "2026-10-27T00:00:00.000Z",
    expiresAt: "2026-10-27T00:30:00.000Z",
    developmentRequestId: `sd_${"c".repeat(32)}`,
  });
  const state = { online: true, targets: [target], jobs: [{ job, result: null }] };
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const api = createControlCenterApi(
    async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify(init?.method === "POST" ? job : state));
    },
    "/frevos",
    () => "csrf-fixture",
  );
  expect(await api.promotionState?.("ws_server20")).toEqual(state);
  const preparation = {
    version: 1,
    requestId: job.id,
    profileId: target?.profileId,
    expectedRevision: 1,
    developmentRequestId: job.developmentRequestId,
  };
  expect(await api.preparePromotion?.("ws_server20", preparation)).toEqual(job);
  const approval = {
    version: 1,
    requestId: `pm_${"d".repeat(32)}`,
    reviewId: job.id,
    reviewSha256: "e".repeat(64),
  };
  expect(await api.approvePromotion?.("ws_server20", approval)).toEqual(job);
  expect(calls.map((c) => c.url)).toEqual([
    "/frevos/v1/workspaces/ws_server20/artifact-promotions",
    "/frevos/v1/workspaces/ws_server20/artifact-promotions/prepare",
    "/frevos/v1/workspaces/ws_server20/artifact-promotions/approve",
  ]);
  for (const call of calls.slice(1))
    expect(call.init?.headers).toMatchObject({ "x-csrf-token": "csrf-fixture" });
  expect(JSON.parse(String(calls[2]?.init?.body))).toEqual(approval);
});
