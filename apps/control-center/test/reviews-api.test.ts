import { type ReviewState, UserIdSchema, WorkspaceIdSchema } from "@frevos/contracts";
import { expect, it } from "vitest";
import { createControlCenterApi } from "../src/api.js";

it("uses the authenticated, CSRF-protected, base-path-aware Reviews APIs for all typed operations", async () => {
  const registerId = `rr_${"a".repeat(32)}`,
    recordId = `rec_${"b".repeat(32)}`,
    previewId = `rip_${"c".repeat(32)}`;
  const state: ReviewState = {
    role: "administrator",
    records: [],
    register: {
      id: registerId,
      workspaceId: WorkspaceIdSchema.parse("ws_fixture"),
      revision: 0,
      name: "Fixture register",
      description: "",
      fields: [],
      managementOptions: ["Local"],
      lifecycleOptions: ["Current"],
      requirementOptions: ["Needed"],
      decisionOptions: ["Keep"],
      linkPolicy: {
        allowedOrigins: [],
        allowedPathPrefixes: ["/"],
        allowPrivate: false,
        timeoutMs: 5000,
        maxBytes: 4096,
        maxRedirects: 1,
      },
      grants: [],
      createdAt: "2026-11-10T00:00:00.000Z",
      createdBy: UserIdSchema.parse("usr_fixture"),
    },
  };
  const catalog = { workspaceId: "ws_fixture", administrator: true, registers: [], users: [] };
  const workbook = { sourceHash: "d".repeat(64), fileName: "fixture.xlsx", sheets: [] };
  const preview = {
    id: previewId,
    registerId,
    revision: 0,
    sourceHash: "d".repeat(64),
    fileName: "fixture.xlsx",
    sheet: "Apps",
    expiresAt: "2026-11-10T00:15:00.000Z",
    rows: [],
  };
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const api = createControlCenterApi(
    async (url, init) => {
      const path = String(url);
      calls.push({ url: path, init });
      return new Response(
        JSON.stringify(
          path.endsWith("/reviews")
            ? catalog
            : path.endsWith("/workbook")
              ? workbook
              : path.endsWith("/preview-import")
                ? preview
                : state,
        ),
      );
    },
    "/devsetu",
    () => "fixture-csrf",
  );
  const abort = new AbortController();
  expect(await api.reviewsCatalog?.("ws_fixture", abort.signal)).toEqual(catalog);
  expect(await api.reviewsState?.("ws_fixture", registerId, abort.signal)).toEqual(state);
  const config = {
    name: state.register.name,
    description: "",
    fields: [],
    managementOptions: ["Local"],
    lifecycleOptions: ["Current"],
    requirementOptions: ["Needed"],
    decisionOptions: ["Keep"],
    linkPolicy: state.register.linkPolicy,
  };
  await api.saveReviewRegister?.("ws_fixture", { version: 1, expectedRevision: 0, config });
  await api.saveReviewRecord?.("ws_fixture", {
    version: 1,
    registerId,
    expectedRevision: 0,
    record: {
      title: "Fixture",
      description: "",
      department: "",
      management: "Local",
      businessOwner: "",
      spoc: "",
      technicalAssignee: "",
      lifecycle: "Current",
      requirement: "Needed",
      recordedAccess: "",
      fields: {},
      endpoints: [],
    },
  });
  await api.grantReviewAccess?.("ws_fixture", {
    version: 1,
    registerId,
    expectedRevision: 0,
    userId: UserIdSchema.parse("usr_viewer"),
    role: "viewer",
  });
  const upload = {
    version: 1 as const,
    registerId,
    fileName: "fixture.xlsx",
    contentBase64: "Zml4dHVyZQ==",
  };
  expect(await api.reviewWorkbook?.("ws_fixture", upload)).toEqual(workbook);
  expect(
    await api.previewReviewImport?.("ws_fixture", {
      ...upload,
      expectedRevision: 0,
      sheet: "Apps",
      headerRow: 1,
      mapping: { title: "A" },
      defaultScheme: "https",
    }),
  ).toEqual(preview);
  await api.commitReviewImport?.("ws_fixture", {
    version: 1,
    registerId,
    expectedRevision: 0,
    previewId,
    resolutions: [],
  });
  await api.checkReviewLink?.("ws_fixture", {
    version: 1,
    registerId,
    recordId,
    expectedRevision: 0,
    endpointId: `ep_${"e".repeat(32)}`,
  });
  await api.addApplicationReview?.("ws_fixture", {
    version: 1,
    registerId,
    recordId,
    expectedRevision: 0,
    decision: "Keep",
    note: "Fixture note",
    nextAction: "",
    dueDate: "",
  });
  expect(calls).toHaveLength(10);
  expect(
    calls.every(
      (call) =>
        call.url.startsWith("/devsetu/v1/workspaces/ws_fixture/reviews") &&
        call.init?.credentials === "same-origin",
    ),
  ).toBe(true);
  expect(
    calls
      .slice(2)
      .every(
        (call) =>
          call.init?.method === "POST" &&
          Reflect.get(call.init.headers ?? {}, "x-csrf-token") === "fixture-csrf",
      ),
  ).toBe(true);
  expect(calls[0]?.init?.signal).toBe(abort.signal);
  expect(calls.map((call) => call.url.split("/").at(-1))).toEqual([
    "reviews",
    registerId,
    "save-register",
    "save-record",
    "grant",
    "workbook",
    "preview-import",
    "commit-import",
    "check-link",
    "add-review",
  ]);
});
