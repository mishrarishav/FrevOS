import { ServixDeploymentSchema, type ServixDeploymentState } from "@frevos/contracts";
import { expect, it } from "vitest";
import { mergeServixDeploymentState } from "../src/servix-deployment-state.js";

const run = ServixDeploymentSchema.parse({
  version: 1,
  requestId: "sd_11111111111111111111111111111111",
  workspaceId: "ws_server20",
  requestedBy: "usr_windows_admin",
  target: "server21-servix-development",
  createdAt: "2026-10-21T08:00:00.000Z",
  expiresAt: "2026-10-21T09:00:00.000Z",
  updatedAt: "2026-10-21T08:00:01.000Z",
  status: "publishing",
  sourceHead: null,
});
const state: ServixDeploymentState = {
  available: true,
  runnerOnline: true,
  source: "server20 / servix.git / frevos-dev",
  sourceHead: null,
  target: "10.9.69.21 / D:\\servixDev",
  runs: [run],
};
it("keeps an accepted active request when an older in-flight poll arrives", () => {
  expect(mergeServixDeploymentState(state, { ...state, runs: [] }).runs).toEqual([run]);
  const building = ServixDeploymentSchema.parse({
    ...run,
    status: "building",
    updatedAt: "2026-10-21T08:00:02.000Z",
  });
  const current = { ...state, runs: [building] };
  expect(mergeServixDeploymentState(current, state).runs).toEqual([building]);
  const succeeded = ServixDeploymentSchema.parse({
    ...building,
    status: "succeeded" as const,
    updatedAt: "2026-10-21T08:00:03.000Z",
  });
  expect(mergeServixDeploymentState(current, { ...state, runs: [succeeded] }).runs).toEqual([
    succeeded,
  ]);
  expect(mergeServixDeploymentState(null, state)).toEqual(state);
});
it("does not restore a stale current-release marker or rollback selection after completion", () => {
  const old = ServixDeploymentSchema.parse({ ...run, status: "succeeded" });
  const latest = ServixDeploymentSchema.parse({
    ...old,
    requestId: "sd_22222222222222222222222222222222",
    updatedAt: "2026-10-21T08:00:05.000Z",
  });
  const merged = mergeServixDeploymentState(
    { ...state, runs: [latest, old], currentRequestId: latest.requestId },
    { ...state, runs: [old], currentRequestId: old.requestId, rollbackRequestId: latest.requestId },
  );
  expect(merged.currentRequestId).toBe(latest.requestId);
  expect(merged.rollbackRequestId).toBeUndefined();
});
