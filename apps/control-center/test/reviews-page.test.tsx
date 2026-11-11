import {
  type ReviewImportPreview,
  type ReviewRecord,
  type ReviewRegisterConfig,
  UserIdSchema,
} from "@frevos/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { RecordWorkspace } from "../src/RecordWorkspace.js";
import {
  CheckEvidence,
  ImportComparison,
  importResolutions,
  RecordDetail,
  RegisterEditor,
  recordLinkStatus,
  reviewLink,
  reviewRecordColumns,
  reviewStatus,
  reviewStatuses,
  reviewTone,
  unresolvedImportRows,
} from "../src/ReviewsPage.js";

const config: ReviewRegisterConfig = {
  name: "Infrastructure reviews",
  description: "Configured by the workspace",
  fields: [
    {
      key: "reviewNote",
      label: "Department note",
      type: "multiline",
      options: [],
      required: false,
    },
  ],
  managementOptions: ["In-house", "External partner"],
  lifecycleOptions: ["Maintained", "Retired"],
  requirementOptions: ["Needed", "Under review"],
  decisionOptions: ["Continue", "Clarify ownership"],
  linkPolicy: {
    allowedOrigins: ["https://app.example.invalid"],
    allowedPathPrefixes: ["/dashboard"],
    allowPrivate: false,
    timeoutMs: 5000,
    maxBytes: 4096,
    maxRedirects: 1,
  },
};
const input = {
  title: "Dashboard fixture",
  description: "A reviewable application",
  department: "Operations",
  management: "In-house",
  businessOwner: "New owner",
  spoc: "New SPOC",
  technicalAssignee: "New maintainer",
  lifecycle: "Maintained",
  requirement: "Needed",
  recordedAccess: "Previously reachable",
  fields: { reviewNote: "Imported note" },
  endpoints: [],
};
const record: ReviewRecord = {
  ...input,
  id: `rec_${"a".repeat(32)}`,
  revision: 1,
  updatedAt: "2026-11-10T00:00:00.000Z",
  updatedBy: UserIdSchema.parse("usr_fixture"),
  businessOwner: "Existing owner",
  spoc: "Existing SPOC",
  technicalAssignee: "Existing maintainer",
  provenance: [],
  assignmentHistory: [],
  checks: [],
  reviews: [],
};
afterEach(() => vi.unstubAllGlobals());

it("keeps untrusted link evidence inert and separates HTTP success from the measured page verdict", () => {
  expect(reviewLink("javascript:alert(1)")).toBeNull();
  expect(reviewLink("https://user:secret@app.example.invalid")).toBeNull();
  expect(reviewLink("https://app.example.invalid/dashboard")).toBe(
    "https://app.example.invalid/dashboard",
  );
  expect(reviewLink("not a URL")).toBeNull();
  const html = renderToStaticMarkup(
    <CheckEvidence
      check={{
        status: "soft-404",
        httpStatus: 200,
        finalUrl: "https://app.example.invalid/dashboard",
        message: "Page says 404 <script>alert(1)</script>",
        title: "<img src=x onerror=alert(1)>",
        elapsedMs: 42,
        checkedAt: "2026-11-10T00:00:00.000Z",
      }}
    />,
  );
  expect(html).toContain("Error page detected");
  expect(html).toContain("200");
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script>");
  expect(html).not.toContain("<img");
  expect(reviewStatus()).toBe("Not checked");
  expect(reviewTone("auth-required")).toBe("warning");
  expect(reviewTone("healthy")).toBe("positive");
  expect(reviewTone()).toBe("neutral");
});

it("requires explicit conflict choices and presents both existing and incoming responsibility before replacement", () => {
  const preview: ReviewImportPreview = {
    id: `rip_${"b".repeat(32)}`,
    registerId: `rr_${"c".repeat(32)}`,
    revision: 1,
    sourceHash: "d".repeat(64),
    fileName: "fixture.xlsx",
    sheet: "Applications",
    expiresAt: "2026-11-10T00:15:00.000Z",
    rows: [
      {
        row: 2,
        record: input,
        candidateRecordId: record.id,
        defaultAction: "conflict",
        issues: ["Ownership differs"],
      },
      { row: 3, record: input, candidateRecordId: null, defaultAction: "create", issues: [] },
    ],
  };
  expect(unresolvedImportRows(preview, {})).toBe(1);
  expect(unresolvedImportRows(preview, { "2": "update" })).toBe(0);
  expect(importResolutions(preview, { "2": "skip" })).toEqual([
    { row: 2, action: "skip" },
    { row: 3, action: "create" },
  ]);
  const html = renderToStaticMarkup(<ImportComparison incoming={input} existing={record} />);
  for (const name of [
    "Existing owner",
    "New owner",
    "Existing SPOC",
    "New SPOC",
    "Existing maintainer",
    "New maintainer",
  ])
    expect(html).toContain(name);
});

it("renders configurable register settings and withholds edit controls from a viewer", () => {
  const settings = renderToStaticMarkup(
    <RegisterEditor
      initial={config}
      busy={false}
      error=""
      close={() => {}}
      save={async () => {}}
    />,
  );
  expect(settings).toContain("Infrastructure reviews");
  expect(settings).toContain("External partner");
  expect(settings).toContain("Allowed URL path prefixes");
  expect(settings).toContain("Follow isolated application session cookies during redirects");
  expect(settings).toContain("Your DevSetu and browser sign-in cookies are never used");
  expect(settings).not.toContain("EESL");
  const detail = renderToStaticMarkup(
    <RecordDetail
      record={record}
      config={config}
      writable={false}
      busy={false}
      error=""
      close={() => {}}
      check={() => {
        throw new Error("Should not test");
      }}
      edit={() => {
        throw new Error("Should not edit");
      }}
      review={async () => false}
    />,
  );
  expect(detail).toContain("Existing owner");
  expect(detail).toContain("Previously reachable");
  expect(detail).not.toContain("Edit application");
  expect(detail).not.toContain("Save review");
  expect(detail).not.toContain("Test link");
});

it("keeps isolated application session cookies an explicit setting and never implies reuse of the browser session", () => {
  const label = "Follow isolated application session cookies during redirects";
  const cookieControl = (enabled?: boolean) => {
    const markup = renderToStaticMarkup(
      <RegisterEditor
        initial={{
          ...config,
          linkPolicy: {
            ...config.linkPolicy,
            ...(enabled === undefined ? {} : { allowSessionCookies: enabled }),
          },
        }}
        busy={false}
        error=""
        close={() => {}}
        save={async () => {}}
      />,
    );
    const preceding = markup.slice(0, markup.indexOf(label));
    return { markup, control: preceding.slice(preceding.lastIndexOf("<label")) };
  };
  for (const enabled of [undefined, false]) {
    const { markup, control } = cookieControl(enabled);
    expect(control).toContain('type="checkbox"');
    expect(control).not.toContain("checked=");
    expect(markup).toContain("during one check, then discards them");
    expect(markup).toContain("DevSetu and browser sign-in cookies are never used");
  }
  expect(cookieControl(true).control).toContain('checked=""');
});

it.each([
  ["tls-error", "TLS error", "negative"],
  ["blocked", "Check blocked by policy", "warning"],
  ["unknown", "Needs verification", "warning"],
] as const)("keeps %s evidence distinguishable from application success", (status, label, tone) => {
  const markup = renderToStaticMarkup(
    <CheckEvidence
      check={{
        status,
        httpStatus: null,
        finalUrl: null,
        message: "No verified application response",
        title: null,
        elapsedMs: 100,
        checkedAt: "2026-11-10T00:00:00.000Z",
      }}
    />,
  );
  expect(markup).toContain(label);
  expect(markup).toContain(`record-badge ${tone}`);
  expect(markup).toContain("No response");
  expect(markup).not.toContain("Expected page found");
});

it("renders measured HTTP, timestamp and final URL columns without replacing them with historical or recorded access", () => {
  const endpoint = {
    id: `ep_${"3".repeat(32)}`,
    label: "Application",
    url: "https://app.example.invalid/dashboard",
    expectedText: "Dashboard",
    expectedStatuses: [200],
  };
  const currentCheck = {
    status: "soft-404" as const,
    httpStatus: 200,
    finalUrl: "https://app.example.invalid/dashboard/not-found",
    message: "Application returned an error page with HTTP 200",
    title: "Not found",
    elapsedMs: 21,
    checkedAt: "2026-11-10T10:20:30.000Z",
    endpointId: endpoint.id,
    by: UserIdSchema.parse("usr_fixture"),
    current: true,
  };
  const measured: ReviewRecord = {
    ...record,
    endpoints: [endpoint],
    checks: [
      currentCheck,
      {
        ...currentCheck,
        status: "healthy",
        httpStatus: 204,
        finalUrl: "https://obsolete.example.invalid/previous-configuration",
        checkedAt: "2026-11-10T11:00:00.000Z",
        current: false,
      },
    ],
  };
  const columns = reviewRecordColumns(config.fields);
  expect(columns.find((column) => column.id === "http")?.value(measured)).toBe("200");
  expect(columns.find((column) => column.id === "checked")?.value(measured)).toBe(
    new Date(currentCheck.checkedAt).toLocaleString(),
  );
  expect(columns.find((column) => column.id === "finalUrl")?.value(measured)).toBe(
    currentCheck.finalUrl,
  );
  vi.stubGlobal("sessionStorage", {
    getItem: () =>
      JSON.stringify({ view: "table", status: "all", filters: {}, search: "", sort: "name" }),
  });
  const markup = renderToStaticMarkup(
    <RecordWorkspace
      title="Measured applications"
      breadcrumb="Reviews"
      scopeName="Fixture"
      userId="usr_fixture"
      workspaceId="ws_fixture"
      page="review-measurements"
      noun="applications"
      records={[measured]}
      columns={columns}
      identify={(row) => row.id}
      statusOf={(row) => recordLinkStatus(row) ?? "unchecked"}
      statuses={reviewStatuses}
      renderCard={(row) => <p>{row.title}</p>}
      renderActions={() => null}
    />,
  );
  for (const label of ["HTTP results", "Last tested", "Final URL", "Recorded access"])
    expect(markup).toContain(label);
  expect(markup).toContain('<td data-column="http">200</td>');
  expect(markup).toContain("Error page detected");
  expect(markup).toContain("Previously reachable");
  expect(markup).toContain(currentCheck.finalUrl);
  expect(markup).not.toContain("obsolete.example.invalid");
  const historicalOnly = {
    ...measured,
    checks: measured.checks.map((check) => ({ ...check, current: false })),
  };
  for (const id of ["http", "checked", "finalUrl"])
    expect(columns.find((column) => column.id === id)?.value(historicalOnly)).toBe("");
});

it("associates each current multi-endpoint HTTP and final URL result with its own link", () => {
  const httpsEndpoint = {
    id: `ep_${"5".repeat(32)}`,
    label: "HTTPS application",
    url: "https://app.example.invalid/dashboard",
    expectedText: "",
    expectedStatuses: [200],
  };
  const httpEndpoint = {
    ...httpsEndpoint,
    id: `ep_${"6".repeat(32)}`,
    label: "HTTP diagnostic",
    url: "http://app.example.invalid/dashboard",
  };
  const baseCheck = {
    httpStatus: null,
    finalUrl: null,
    message: "Certificate failed",
    title: null,
    elapsedMs: 50,
    checkedAt: "2026-11-10T10:00:00.000Z",
    by: UserIdSchema.parse("usr_fixture"),
    current: true,
  };
  const measured: ReviewRecord = {
    ...record,
    endpoints: [httpsEndpoint, httpEndpoint],
    checks: [
      { ...baseCheck, status: "tls-error", endpointId: httpsEndpoint.id },
      {
        ...baseCheck,
        status: "auth-required",
        httpStatus: 200,
        finalUrl: "http://app.example.invalid/login",
        endpointId: httpEndpoint.id,
        checkedAt: "2026-11-10T10:10:00.000Z",
      },
      {
        ...baseCheck,
        status: "healthy",
        httpStatus: 204,
        finalUrl: "https://obsolete.example.invalid/old",
        endpointId: httpsEndpoint.id,
        checkedAt: "2026-11-10T10:20:00.000Z",
        current: false,
      },
    ],
  };
  const columns = reviewRecordColumns(config.fields);
  const http = columns.find((column) => column.id === "http")?.value(measured);
  const finalUrl = columns.find((column) => column.id === "finalUrl")?.value(measured);
  expect(http).toBe(
    "[HTTPS application]: — (TLS error); [HTTP diagnostic]: 200 (Sign-in or access check required)",
  );
  expect(finalUrl).toBe(
    "[HTTPS application]: —; [HTTP diagnostic]: http://app.example.invalid/login",
  );
  expect(columns.find((column) => column.id === "health")?.value(measured)).toBe("TLS error");
  expect(columns.find((column) => column.id === "checked")?.value(measured)).toBe(
    new Date("2026-11-10T10:10:00.000Z").toLocaleString(),
  );
  expect(`${http} ${finalUrl}`).not.toContain("obsolete");
  const notChecked = {
    ...measured,
    checks: measured.checks.map((check) => ({ ...check, current: false })),
  };
  expect(columns.find((column) => column.id === "http")?.value(notChecked)).toBe(
    "[HTTPS application]: — (Not checked); [HTTP diagnostic]: — (Not checked)",
  );
  expect(columns.find((column) => column.id === "finalUrl")?.value(notChecked)).not.toContain(
    "/login",
  );
  const sameLabels = {
    ...measured,
    endpoints: [
      { ...httpsEndpoint, label: "Application" },
      { ...httpEndpoint, label: "Application" },
    ],
  };
  expect(columns.find((column) => column.id === "http")?.value(sameLabels)).toContain(
    "[Application (https://app.example.invalid/dashboard)]: — (TLS error)",
  );
  expect(columns.find((column) => column.id === "http")?.value(sameLabels)).toContain(
    "[Application (http://app.example.invalid/dashboard)]: 200",
  );
});

it.each([
  ["tls-error", "Certificate/TLS error"],
  ["blocked", "Policy blocked"],
  ["unknown", "Needs verification"],
] as const)("offers and applies the %s card filter to actual measured results", (status, label) => {
  const endpoint = {
    id: `ep_${"4".repeat(32)}`,
    label: "Application",
    url: "https://app.example.invalid/dashboard",
    expectedText: "",
    expectedStatuses: [200],
  };
  const affected: ReviewRecord = {
    ...record,
    title: "Affected application",
    endpoints: [endpoint],
    checks: [
      {
        status,
        httpStatus: null,
        finalUrl: null,
        message: "No verified response",
        title: null,
        elapsedMs: 100,
        checkedAt: "2026-11-10T00:00:00.000Z",
        endpointId: endpoint.id,
        by: UserIdSchema.parse("usr_fixture"),
        current: true,
      },
    ],
  };
  const untested: ReviewRecord = {
    ...record,
    id: `rec_${"f".repeat(32)}`,
    title: "Untested application",
    endpoints: [endpoint],
  };
  expect(reviewStatuses).toContainEqual({ id: status, label });
  vi.stubGlobal("sessionStorage", {
    getItem: () =>
      JSON.stringify({
        view: "cards",
        status,
        cardFilters: {},
        filters: {},
        search: "",
        sort: "name",
      }),
  });
  const markup = renderToStaticMarkup(
    <RecordWorkspace
      title="Applications"
      breadcrumb="Reviews"
      scopeName="Fixture"
      userId="usr_fixture"
      workspaceId="ws_fixture"
      page="review-statuses"
      noun="applications"
      records={[affected, untested]}
      columns={reviewRecordColumns(config.fields)}
      identify={(row) => row.id}
      statusOf={(row) => recordLinkStatus(row) ?? "unchecked"}
      statuses={reviewStatuses}
      renderCard={(row) => <p>{row.title}</p>}
      renderActions={() => null}
    />,
  );
  expect(markup).toContain(label);
  expect(markup).toContain(`<option value="${status}" selected="">${label}</option>`);
  expect(markup).toContain("<p>Affected application</p>");
  expect(markup).not.toContain("<p>Untested application</p>");
  expect(markup).toContain("1 of 2");
});

it("does not present a previous configuration or one successful endpoint as a healthy application", () => {
  const first = {
    id: `ep_${"1".repeat(32)}`,
    label: "Frontend",
    url: "https://app.example.invalid",
    expectedText: "",
    expectedStatuses: [200],
  };
  const second = {
    ...first,
    id: `ep_${"2".repeat(32)}`,
    label: "API",
    url: "https://app.example.invalid/api",
  };
  const check = {
    status: "healthy" as const,
    httpStatus: 200,
    finalUrl: first.url,
    message: "Expected page found",
    title: "Fixture",
    elapsedMs: 10,
    checkedAt: "2026-11-10T00:00:00.000Z",
    endpointId: first.id,
    by: UserIdSchema.parse("usr_fixture"),
    current: false,
  };
  expect(recordLinkStatus({ ...record, endpoints: [first], checks: [check] })).toBeUndefined();
  expect(
    recordLinkStatus({
      ...record,
      endpoints: [first, second],
      checks: [{ ...check, current: true }],
    }),
  ).toBeUndefined();
  expect(
    recordLinkStatus({ ...record, endpoints: [first], checks: [{ ...check, current: true }] }),
  ).toBe("healthy");
  expect(
    recordLinkStatus({
      ...record,
      endpoints: [first, second],
      checks: [
        { ...check, current: true },
        { ...check, endpointId: second.id, current: true, status: "http-error", httpStatus: 503 },
      ],
    }),
  ).toBe("http-error");
});

it("keeps card-only ownership filters independent from table filters and restores scoped preferences", () => {
  const rows = [
    { id: "one", name: "Internal dashboard", management: "In-house", status: "healthy" },
    { id: "two", name: "Vendor dashboard", management: "External partner", status: "unknown" },
  ];
  const component = () => (
    <RecordWorkspace
      title="Applications"
      breadcrumb="Reviews"
      scopeName="Fixture"
      userId="usr_fixture"
      workspaceId="ws_fixture"
      page="review-fixture"
      noun="applications"
      records={rows}
      columns={[
        { id: "name", label: "Application", value: (row) => row.name },
        { id: "management", label: "Managed by", value: (row) => row.management },
      ]}
      cardFilterColumns={["management"]}
      identify={(row) => row.id}
      statusOf={(row) => row.status}
      statuses={[{ id: "healthy", label: "Expected page found" }]}
      renderCard={(row) => <p>{row.name}</p>}
      renderActions={() => null}
    />
  );
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) =>
      key === "frevos:usr_fixture:ws_fixture:review-fixture:records:v1"
        ? JSON.stringify({
            view: "table",
            status: "healthy",
            cardFilters: { management: "In-house" },
            filters: {},
            search: "",
            sort: "name",
          })
        : null,
  });
  const table = renderToStaticMarkup(component());
  expect(table).toContain("Vendor dashboard");
  expect(table).not.toContain('aria-label="Card filters"');
  vi.stubGlobal("sessionStorage", {
    getItem: () =>
      JSON.stringify({
        view: "cards",
        status: "all",
        cardFilters: { management: "In-house" },
        filters: {},
        search: "",
        sort: "name",
      }),
  });
  const cards = renderToStaticMarkup(component());
  expect(cards).toContain("Internal dashboard");
  expect(cards).not.toContain("<p>Vendor dashboard</p>");
  expect(cards).toContain('aria-label="Application list"');
});
