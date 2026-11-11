import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ReviewCatalogSchema,
  type ReviewCheckResult,
  type ReviewEndpoint,
  ReviewImportPreviewSchema,
  type ReviewLinkPolicy,
  type ReviewRecordInput,
  ReviewRegisterConfigSchema,
  ReviewStateSchema,
  type ReviewWorkbook,
} from "@frevos/contracts";
import { afterEach, expect, it, vi } from "vitest";
import { ReviewRegisters } from "../src/review-registers.js";

const cleanup: string[] = [];
afterEach(async () => {
  for (const root of cleanup.splice(0)) await rm(root, { recursive: true, force: true });
});
const config = () =>
  ReviewRegisterConfigSchema.parse({
    name: "Application review",
    description: "Configurable register",
    fields: [{ key: "comment", label: "Remarks", type: "multiline", required: false, options: [] }],
    managementOptions: ["Internal", "Partner"],
    lifecycleOptions: ["Active", "Retired"],
    requirementOptions: ["Required", "Not required"],
    decisionOptions: ["Keep", "Clarify"],
    linkPolicy: {
      allowedOrigins: ["https://example.invalid"],
      allowPrivate: false,
      timeoutMs: 1000,
      maxBytes: 4096,
      maxRedirects: 1,
    },
  });
const record = (title = "Application"): ReviewRecordInput => ({
  title,
  description: "",
  department: "Operations",
  management: "Internal",
  businessOwner: "Business owner",
  spoc: "SPOC",
  technicalAssignee: "Engineer",
  lifecycle: "Active",
  requirement: "Required",
  recordedAccess: "Previously available",
  fields: { comment: "Imported notes" },
  endpoints: [
    {
      id: "ep_" + "a".repeat(32),
      label: "Application",
      url: "https://example.invalid/app",
      expectedText: "Expected application",
      expectedStatuses: [200],
    },
  ],
});
function workbook(): ReviewWorkbook {
  return {
    sourceHash: "a".repeat(64),
    fileName: "review.xlsx",
    sheets: [
      {
        name: "Applications",
        hidden: false,
        maxRow: 4,
        maxColumn: 3,
        hiddenRows: [],
        hiddenColumns: [],
        rows: [
          {
            row: 1,
            cells: [
              { column: "A", address: "A1", text: "Title" },
              { column: "B", address: "B1", text: "URL" },
              { column: "C", address: "C1", text: "Owner" },
            ],
          },
          {
            row: 2,
            cells: [
              { column: "A", address: "A2", text: "Application" },
              { column: "B", address: "B2", text: "example.invalid/app" },
              { column: "C", address: "C2", text: "Changed owner" },
            ],
          },
          {
            row: 3,
            cells: [
              { column: "A", address: "A3", text: "Duplicate" },
              { column: "B", address: "B3", text: "example.invalid/app" },
            ],
          },
          {
            row: 4,
            cells: [
              { column: "A", address: "A4", text: "Another application" },
              {
                column: "B",
                address: "B4",
                text: "http://example.invalid/new",
                hyperlink: "https://example.invalid/new",
              },
              { column: "C", address: "C4", text: "New owner" },
            ],
          },
        ],
      },
    ],
  };
}
async function fixture(checkLink?: () => Promise<ReviewCheckResult>) {
  const root = await mkdtemp(join(tmpdir(), "devsetu-reviews-"));
  cleanup.push(root);
  const active = new Set(["usr_admin", "usr_reviewer", "usr_viewer", "usr_other"]);
  const member = async (ws: string, user: string) => ({
    active: ws === "ws_fixture" && active.has(user),
    administrator: user === "usr_admin",
  });
  const parse = vi.fn(async () => workbook()),
    check = vi.fn<
      (endpoint: ReviewEndpoint, policy: ReviewLinkPolicy) => Promise<ReviewCheckResult>
    >(
      checkLink ??
        (async (): Promise<ReviewCheckResult> => ({
          status: "healthy",
          httpStatus: 200,
          finalUrl: "https://example.invalid/app",
          message: "Expected page found",
          title: "Expected application",
          elapsedMs: 12,
          checkedAt: new Date().toISOString(),
        })),
    );
  const service = new ReviewRegisters(
    root,
    member,
    async () => [...active].map((userId) => ({ userId, name: userId })),
    { parseWorkbook: parse, checkLink: check },
  );
  const state = ReviewStateSchema.parse(
    await service.execute("usr_admin", "ws_fixture", "save-register", {
      version: 1,
      expectedRevision: 0,
      config: config(),
    }),
  );
  const grant = async (userId: string, role: "viewer" | "reviewer" | null) => {
    const fresh = await service.state("usr_admin", "ws_fixture", state.register.id);
    return service.execute("usr_admin", "ws_fixture", "grant", {
      version: 1,
      registerId: state.register.id,
      expectedRevision: fresh.register.revision,
      userId,
      role,
    });
  };
  const save = async (
    input = record(),
    actor = "usr_admin",
    old?: { id: string; revision: number },
  ) =>
    ReviewStateSchema.parse(
      await service.execute(actor, "ws_fixture", "save-record", {
        version: 1,
        registerId: state.register.id,
        ...(old ? { id: old.id } : {}),
        expectedRevision: old?.revision ?? 0,
        record: input,
      }),
    );
  const preview = async (actor = "usr_admin") => {
    const fresh = await service.state(actor, "ws_fixture", state.register.id);
    return ReviewImportPreviewSchema.parse(
      await service.execute(actor, "ws_fixture", "preview-import", {
        version: 1,
        registerId: state.register.id,
        expectedRevision: fresh.register.revision,
        fileName: "review.xlsx",
        contentBase64: "eA==",
        sheet: "Applications",
        headerRow: 1,
        mapping: { title: "A", url: "B", businessOwner: "C" },
        defaultScheme: "https",
      }),
    );
  };
  return { root, service, state, grant, save, preview, parse, check, active, member };
}
it("isolates workspace/register access, keeps viewers read-only and revokes immediately", async () => {
  const f = await fixture();
  await f.save();
  expect((await f.service.catalog("usr_other", "ws_fixture")).registers).toEqual([]);
  await expect(f.service.state("usr_other", "ws_fixture", f.state.register.id)).rejects.toThrow(
    "not-found",
  );
  await expect(f.service.catalog("usr_admin", "ws_elsewhere")).rejects.toThrow("access-denied");
  await f.grant("usr_viewer", "viewer");
  const state = await f.service.state("usr_viewer", "ws_fixture", f.state.register.id);
  expect(state.records).toHaveLength(1);
  expect(state.register.grants).toEqual([]);
  expect((await f.service.catalog("usr_viewer", "ws_fixture")).users).toEqual([]);
  await expect(f.preview("usr_viewer")).rejects.toThrow("read-only");
  expect(f.parse).not.toHaveBeenCalled();
  await expect(
    f.service.execute("usr_viewer", "ws_fixture", "check-link", {
      version: 1,
      registerId: f.state.register.id,
      recordId: state.records[0]!.id,
      endpointId: state.records[0]!.endpoints[0]!.id,
      expectedRevision: 1,
    }),
  ).rejects.toThrow("read-only");
  expect(f.check).not.toHaveBeenCalled();
  await f.grant("usr_reviewer", "reviewer");
  await expect(
    f.service.execute("usr_reviewer", "ws_fixture", "save-register", {
      version: 1,
      id: f.state.register.id,
      expectedRevision: 3,
      config: config(),
    }),
  ).rejects.toThrow("administrator-required");
  await f.grant("usr_viewer", null);
  await expect(f.service.state("usr_viewer", "ws_fixture", f.state.register.id)).rejects.toThrow(
    "not-found",
  );
});
it("persists records, preserves assignment history, rejects stale writes and never accepts caller history", async () => {
  const f = await fixture();
  await f.grant("usr_reviewer", "reviewer");
  let state = await f.save(record(), "usr_reviewer");
  const first = state.records[0]!;
  state = await f.save({ ...record(), technicalAssignee: "Replacement" }, "usr_reviewer", first);
  expect(state.records[0]!.assignmentHistory[0]!.technicalAssignee).toBe("Engineer");
  await expect(
    f.save({ ...record(), technicalAssignee: "Stale" }, "usr_reviewer", first),
  ).rejects.toThrow("revision-conflict");
  await expect(f.save({ ...record(), provenance: [] } as ReviewRecordInput)).rejects.toThrow();
  const restarted = new ReviewRegisters(f.root, f.member);
  expect(
    (await restarted.state("usr_admin", "ws_fixture", f.state.register.id)).records[0]!
      .technicalAssignee,
  ).toBe("Replacement");
  const stored = JSON.parse(await readFile(join(f.root, "ws_fixture.json"), "utf8"));
  expect(stored.audit.map((r: { action: string }) => r.action)).toContain("save-record");
});
it("requires explicit import conflict decisions, preserves provenance and consumes the actor-bound preview once", async () => {
  const f = await fixture();
  await f.save();
  const preview = await f.preview();
  expect(preview.rows[0]!.candidateRecordId).toBeTruthy();
  expect(preview.rows[1]!.issues.some((i) => i.includes("Another row"))).toBe(true);
  expect(preview.rows[2]!.record.endpoints[0]!.url).toBe("https://example.invalid/new");
  const command = {
    version: 1,
    registerId: f.state.register.id,
    previewId: preview.id,
    expectedRevision: preview.revision,
    resolutions: [],
  };
  await expect(
    f.service.execute("usr_admin", "ws_fixture", "commit-import", command),
  ).rejects.toThrow("unresolved-import-conflict");
  await expect(
    f.service.execute("usr_admin", "ws_fixture", "commit-import", {
      ...command,
      resolutions: [
        { row: 2, action: "update" },
        { row: 3, action: "update" },
      ],
    }),
  ).rejects.toThrow("duplicate-import-update");
  let state = ReviewStateSchema.parse(
    await f.service.execute("usr_admin", "ws_fixture", "commit-import", {
      ...command,
      resolutions: [
        { row: 2, action: "update" },
        { row: 3, action: "skip" },
      ],
    }),
  );
  expect(state.records).toHaveLength(2);
  expect(state.records[0]!.businessOwner).toBe("Changed owner");
  expect(state.records[0]!.technicalAssignee).toBe("Engineer");
  expect(state.records[0]!.fields["comment"]).toBe("Imported notes");
  expect(state.records[0]!.endpoints[0]!.id).toBe(`ep_${"a".repeat(32)}`);
  expect(state.records[0]!.endpoints[0]!.expectedText).toBe("Expected application");
  expect(state.records[0]!.provenance[0]!.cells["businessOwner"]).toBe("C2");
  await expect(
    f.service.execute("usr_admin", "ws_fixture", "commit-import", command),
  ).rejects.toThrow("preview-expired");
  const old = state.records[0]!;
  state = await f.save({ ...record(), businessOwner: old.businessOwner }, "usr_admin", old);
  expect(state.records[0]!.provenance).toEqual(old.provenance);
});
it("binds imports to source revisions and rejects other actors, inactive targets and unsafe fields", async () => {
  const f = await fixture();
  await f.grant("usr_reviewer", "reviewer");
  const p = await f.preview();
  await expect(
    f.service.execute("usr_reviewer", "ws_fixture", "commit-import", {
      version: 1,
      registerId: f.state.register.id,
      previewId: p.id,
      expectedRevision: p.revision,
      resolutions: [],
    }),
  ).rejects.toThrow("preview-expired");
  await f.save();
  await expect(
    f.service.execute("usr_admin", "ws_fixture", "commit-import", {
      version: 1,
      registerId: f.state.register.id,
      previewId: p.id,
      expectedRevision: p.revision,
      resolutions: [],
    }),
  ).rejects.toThrow("revision-conflict");
  await expect(f.grant("usr_missing", "viewer")).rejects.toThrow("member-not-found");
  await expect(
    f.service.execute("usr_admin", "ws_fixture", "save-register", {
      version: 1,
      expectedRevision: 0,
      config: {
        ...config(),
        fields: [
          { key: "constructor", label: "Unsafe", type: "text", options: [], required: false },
        ],
      },
    }),
  ).rejects.toThrow();
});
it("retains measured results separately from workbook status and prevents stale checks from overwriting edits", async () => {
  const f = await fixture();
  let state = await f.save(),
    r = state.records[0]!;
  state = ReviewStateSchema.parse(
    await f.service.execute("usr_admin", "ws_fixture", "check-link", {
      version: 1,
      registerId: f.state.register.id,
      recordId: r.id,
      endpointId: r.endpoints[0]!.id,
      expectedRevision: r.revision,
    }),
  );
  expect(state.records[0]!.recordedAccess).toBe("Previously available");
  expect(state.records[0]!.checks[0]!.status).toBe("healthy");
  let complete!: (value: ReviewCheckResult) => void;
  const delayed = await fixture(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  state = await delayed.save();
  r = state.records[0]!;
  const running = delayed.service.execute("usr_admin", "ws_fixture", "check-link", {
    version: 1,
    registerId: state.register.id,
    recordId: r.id,
    endpointId: r.endpoints[0]!.id,
    expectedRevision: r.revision,
  });
  await vi.waitFor(() => expect(delayed.check).toHaveBeenCalled());
  await delayed.save({ ...record(), description: "Changed during check" }, "usr_admin", r);
  complete({
    status: "healthy",
    httpStatus: 200,
    finalUrl: "https://example.invalid/app",
    message: "Old source",
    title: null,
    elapsedMs: 1,
    checkedAt: new Date().toISOString(),
  });
  await expect(running).rejects.toThrow("check-source-changed");
});
it("validates configurable decisions and keeps review attribution server-owned", async () => {
  const f = await fixture();
  await f.grant("usr_reviewer", "reviewer");
  const state = await f.save(),
    r = state.records[0]!;
  const command = {
    version: 1,
    registerId: state.register.id,
    recordId: r.id,
    expectedRevision: r.revision,
    decision: "Clarify",
    note: "Confirm current owner",
    nextAction: "Request current assignment",
    dueDate: "2026-12-01",
  };
  const saved = ReviewStateSchema.parse(
    await f.service.execute("usr_reviewer", "ws_fixture", "add-review", command),
  );
  expect(saved.records[0]!.reviews[0]!.by).toBe("usr_reviewer");
  await expect(
    f.service.execute("usr_admin", "ws_fixture", "add-review", {
      ...command,
      expectedRevision: 2,
      decision: "Unconfigured",
    }),
  ).rejects.toThrow("invalid-decision");
  await expect(
    f.service.execute("usr_admin", "ws_fixture", "add-review", {
      ...command,
      expectedRevision: 2,
      dueDate: "2026-02-31",
    }),
  ).rejects.toThrow();
  expect(
    ReviewCatalogSchema.parse(await f.service.catalog("usr_admin", "ws_fixture")).registers,
  ).toHaveLength(1);
});
it("rejects credential-bearing endpoint URLs before they enter durable records", async () => {
  const f = await fixture();
  await expect(
    f.save({
      ...record(),
      endpoints: [
        { ...record().endpoints[0]!, url: "https://example.invalid/app?api_key=do-not-store" },
      ],
    }),
  ).rejects.toThrow("invalid-endpoint");
  expect(
    (await f.service.state("usr_admin", "ws_fixture", f.state.register.id)).records,
  ).toHaveLength(0);
  const contents = await readFile(join(f.root, "ws_fixture.json"), "utf8");
  expect(contents).not.toContain("do-not-store");
});
it("retains historical measurements but invalidates their current status after endpoint or policy edits", async () => {
  const f = await fixture();
  let state = await f.save(),
    r = state.records[0]!;
  state = ReviewStateSchema.parse(
    await f.service.execute("usr_admin", "ws_fixture", "check-link", {
      version: 1,
      registerId: state.register.id,
      recordId: r.id,
      endpointId: r.endpoints[0]!.id,
      expectedRevision: r.revision,
    }),
  );
  expect(state.records[0]!.checks[0]!.current).toBe(true);
  r = state.records[0]!;
  state = await f.save(
    { ...record(), endpoints: [{ ...r.endpoints[0]!, expectedText: "New identity" }] },
    "usr_admin",
    r,
  );
  expect(state.records[0]!.checks[0]!.status).toBe("healthy");
  expect(state.records[0]!.checks[0]!.current).toBe(false);
  r = state.records[0]!;
  state = ReviewStateSchema.parse(
    await f.service.execute("usr_admin", "ws_fixture", "check-link", {
      version: 1,
      registerId: state.register.id,
      recordId: r.id,
      endpointId: r.endpoints[0]!.id,
      expectedRevision: r.revision,
    }),
  );
  state = ReviewStateSchema.parse(
    await f.service.execute("usr_admin", "ws_fixture", "save-register", {
      version: 1,
      id: state.register.id,
      expectedRevision: state.register.revision,
      config: { ...config(), linkPolicy: { ...config().linkPolicy, allowPrivate: true } },
    }),
  );
  expect(state.records[0]!.checks.every((c) => !c.current)).toBe(true);
});
it("expires previews, rejects invalid row creation and leaves the durable register unchanged", async () => {
  const f = await fixture();
  let clock = "2026-11-10T12:00:00.000Z";
  const inputBook = workbook();
  inputBook.sheets[0]!.rows[1]!.cells[0]!.text = "";
  const service = new ReviewRegisters(f.root, f.member, async () => [], {
    parseWorkbook: async () => inputBook,
    now: () => clock,
  });
  const make = async () =>
    ReviewImportPreviewSchema.parse(
      await service.execute("usr_admin", "ws_fixture", "preview-import", {
        version: 1,
        registerId: f.state.register.id,
        expectedRevision: 1,
        fileName: "review.xlsx",
        contentBase64: "eA==",
        sheet: "Applications",
        headerRow: 1,
        mapping: { title: "A", url: "B" },
        defaultScheme: "https",
      }),
    );
  const preview = await make(),
    command = {
      version: 1,
      registerId: f.state.register.id,
      previewId: preview.id,
      expectedRevision: 1,
      resolutions: [
        { row: 2, action: "create" },
        { row: 3, action: "skip" },
      ],
    };
  await expect(
    service.execute("usr_admin", "ws_fixture", "commit-import", command),
  ).rejects.toThrow("invalid-import-row-2");
  expect(
    (await service.state("usr_admin", "ws_fixture", f.state.register.id)).records,
  ).toHaveLength(0);
  clock = "2026-11-10T12:16:00.000Z";
  await expect(
    service.execute("usr_admin", "ws_fixture", "commit-import", command),
  ).rejects.toThrow("preview-expired");
});
it("keeps legacy anonymous policies readable and persists only administrator-selected session-cookie policy", async () => {
  const f = await fixture();
  await f.grant("usr_reviewer", "reviewer");
  let state = await f.save();
  const record = state.records[0]!;
  expect(Object.hasOwn(state.register.linkPolicy, "allowSessionCookies")).toBe(false);
  state = ReviewStateSchema.parse(
    await f.service.execute("usr_admin", "ws_fixture", "check-link", {
      version: 1,
      registerId: state.register.id,
      recordId: record.id,
      endpointId: record.endpoints[0]!.id,
      expectedRevision: record.revision,
    }),
  );
  expect(f.check.mock.calls[0]?.[1]).not.toHaveProperty("allowSessionCookies");
  const withCookies = {
    ...config(),
    linkPolicy: { ...config().linkPolicy, allowSessionCookies: true },
  };
  await expect(
    f.service.execute("usr_reviewer", "ws_fixture", "save-register", {
      version: 1,
      id: state.register.id,
      expectedRevision: state.register.revision,
      config: withCookies,
    }),
  ).rejects.toThrow("administrator-required");
  expect(
    (await f.service.state("usr_admin", "ws_fixture", state.register.id)).register.linkPolicy,
  ).not.toHaveProperty("allowSessionCookies");
  state = ReviewStateSchema.parse(
    await f.service.execute("usr_admin", "ws_fixture", "save-register", {
      version: 1,
      id: state.register.id,
      expectedRevision: state.register.revision,
      config: withCookies,
    }),
  );
  expect(state.register.linkPolicy.allowSessionCookies).toBe(true);
  expect(state.records[0]!.checks[0]!.current).toBe(false);
  const restarted = new ReviewRegisters(f.root, f.member);
  expect(
    (await restarted.state("usr_admin", "ws_fixture", state.register.id)).register.linkPolicy
      .allowSessionCookies,
  ).toBe(true);
  const current = state.records[0]!;
  state = ReviewStateSchema.parse(
    await f.service.execute("usr_admin", "ws_fixture", "check-link", {
      version: 1,
      registerId: state.register.id,
      recordId: current.id,
      endpointId: current.endpoints[0]!.id,
      expectedRevision: current.revision,
    }),
  );
  expect(f.check.mock.calls[1]?.[1]).toMatchObject({ allowSessionCookies: true });
  expect(state.records[0]!.checks.at(-1)?.current).toBe(true);
  state = ReviewStateSchema.parse(
    await f.service.execute("usr_admin", "ws_fixture", "save-register", {
      version: 1,
      id: state.register.id,
      expectedRevision: state.register.revision,
      config: { ...config(), linkPolicy: { ...config().linkPolicy, allowSessionCookies: false } },
    }),
  );
  expect(state.register.linkPolicy.allowSessionCookies).toBe(false);
  expect(state.records[0]!.checks.every((check) => !check.current)).toBe(true);
  expect(
    (await restarted.state("usr_admin", "ws_fixture", state.register.id)).register.linkPolicy
      .allowSessionCookies,
  ).toBe(false);
});
it("saves a bounded 128-origin policy and rejects oversize policy changes without changing durable state", async () => {
  const f = await fixture();
  const allowedOrigins = Array.from(
    { length: 128 },
    (_, index) => `https://app${index}.example.invalid`,
  );
  let state = ReviewStateSchema.parse(
    await f.service.execute("usr_admin", "ws_fixture", "save-register", {
      version: 1,
      id: f.state.register.id,
      expectedRevision: f.state.register.revision,
      config: { ...config(), linkPolicy: { ...config().linkPolicy, allowedOrigins } },
    }),
  );
  expect(state.register.linkPolicy.allowedOrigins).toHaveLength(128);
  const revision = state.register.revision;
  await expect(
    f.service.execute("usr_admin", "ws_fixture", "save-register", {
      version: 1,
      id: state.register.id,
      expectedRevision: revision,
      config: {
        ...config(),
        linkPolicy: {
          ...config().linkPolicy,
          allowedOrigins: [...allowedOrigins, "http://additional.example.invalid"],
        },
      },
    }),
  ).rejects.toThrow();
  state = await new ReviewRegisters(f.root, f.member).state(
    "usr_admin",
    "ws_fixture",
    state.register.id,
  );
  expect(state.register.revision).toBe(revision);
  expect(state.register.linkPolicy.allowedOrigins).toEqual(allowedOrigins);
});
