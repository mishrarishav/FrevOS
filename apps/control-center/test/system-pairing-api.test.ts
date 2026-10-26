import { expect, it } from "vitest";
import { createControlCenterApi } from "../src/api.js";
it("keeps the lookup code out of URLs, scopes browser decisions and rejects credential-bearing previews", async () => {
  const preview = {
    version: 1,
    enrollmentId: "ep_" + "a".repeat(32),
    deviceId: "fc_" + "b".repeat(32),
    name: "Computer",
    platform: "win32",
    architecture: "x64",
    fileActivity: false,
    expiresAt: "2026-10-25T12:00:00.000Z",
    status: "pending",
    digest: "c".repeat(64),
  };
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  let leak = false;
  const api = createControlCenterApi(
    async (url, init) => {
      calls.push({ url: String(url), init });
      return Response.json(leak ? { ...preview, credential: "synthetic-forbidden" } : preview);
    },
    "/frevos",
    () => "synthetic-csrf",
  );
  expect(await api.lookupSystemPairing?.("ws_server20", "ABCD-EFGH")).toEqual(preview);
  expect(
    await api.decideSystemPairing?.("ws_server20", preview.enrollmentId, {
      version: 1,
      digest: preview.digest,
      decision: "approve",
    }),
  ).toEqual(preview);
  expect(calls.map((c) => c.url)).toEqual([
    "/frevos/v1/workspaces/ws_server20/connectors/enrollments/lookup",
    `/frevos/v1/workspaces/ws_server20/connectors/enrollments/${preview.enrollmentId}/decision`,
  ]);
  for (const call of calls) {
    expect(call.url).not.toContain("ABCD");
    expect(new Headers(call.init?.headers).get("x-csrf-token")).toBe("synthetic-csrf");
    expect(call.init?.method).toBe("POST");
  }
  expect(JSON.parse(calls[1]!.init?.body as string)).toEqual({
    version: 1,
    digest: preview.digest,
    decision: "approve",
  });
  leak = true;
  await expect(api.lookupSystemPairing?.("ws_server20", "ABCD-EFGH")).rejects.toBeDefined();
});
