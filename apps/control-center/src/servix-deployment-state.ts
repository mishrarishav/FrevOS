import type { ServixDeploymentState } from "@frevos/contracts";

// A poll can finish after a newer POST or poll response. Preserve the newest
// authoritative record for each request so an active deployment cannot disappear.
export function mergeServixDeploymentState(
  current: ServixDeploymentState | null,
  incoming: ServixDeploymentState,
): ServixDeploymentState {
  const runs = new Map(incoming.runs.map((run) => [run.requestId, run]));
  for (const run of current?.runs ?? []) {
    const next = runs.get(run.requestId);
    if (!next || Date.parse(run.updatedAt) > Date.parse(next.updatedAt))
      runs.set(run.requestId, run);
  }
  const merged = [...runs.values()];
  const latest = merged
    .filter((run) => run.status === "succeeded")
    .sort(
      (a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.createdAt.localeCompare(a.createdAt),
    )[0];
  const result = {
    ...incoming,
    runs: merged.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 30),
  };
  if (latest && latest.requestId !== incoming.currentRequestId) {
    result.currentRequestId = latest.requestId;
    delete result.rollbackRequestId;
  }
  return result;
}
