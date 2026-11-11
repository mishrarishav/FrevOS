import {
  type ReviewMonitoringState,
  type ReviewMonitoringSummary,
  type ReviewMonitorRun,
  type ReviewState,
  UserIdSchema,
  WorkspaceIdSchema,
} from "@frevos/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { JoinNotifications } from "../src/App.js";
import { createControlCenterApi } from "../src/api.js";
import {
  CertificateEvidence,
  certificateCurrentState,
  certificateDaysRemaining,
  MonitoringAlertList,
  MonitoringScheduleEditor,
  MonitorRunReport,
  monitoringAlerts,
  monitoringScheduleFromForm,
  monitorReportTotals,
  ReviewMonitoringOverview,
  ReviewReportsDialog,
  scheduledStamp,
} from "../src/ReviewReports.js";

const registerId = `rr_${"a".repeat(32)}`;
const monitoring: ReviewMonitoringState = {
  schedule: null,
  scheduleRevision: 0,
  configuredBy: null,
  configuredAt: null,
  nextRunAt: null,
  runs: [],
  alerts: [],
};
const state: ReviewState = {
  role: "administrator",
  register: {
    id: registerId,
    workspaceId: WorkspaceIdSchema.parse("ws_fixture"),
    revision: 7,
    name: "Operations review",
    description: "",
    fields: [],
    managementOptions: ["Local"],
    lifecycleOptions: ["Maintained"],
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
    createdAt: "2026-11-11T00:00:00.000Z",
    createdBy: UserIdSchema.parse("usr_fixture"),
  },
  records: ["✓ Working", "✗ Unreachable"].map((recordedAccess, index) => ({
    id: `rec_${String(index + 1).repeat(32)}`,
    revision: 1,
    title: `Application ${index + 1}`,
    description: "",
    department: "",
    management: "Local",
    businessOwner: "",
    spoc: "",
    technicalAssignee: "",
    lifecycle: "Maintained",
    requirement: "Needed",
    recordedAccess,
    fields: {},
    endpoints: [],
    provenance: [],
    assignmentHistory: [],
    reviews: [],
    checks: [],
    updatedAt: "2026-11-11T00:00:00.000Z",
    updatedBy: UserIdSchema.parse("usr_fixture"),
  })),
  monitoring,
};
const alert = {
  id: `ral_${"b".repeat(32)}`,
  kind: "ssl-expiring" as const,
  recordId: state.records[0]?.id ?? null,
  endpointId: `ep_${"c".repeat(32)}`,
  title: "Certificate expires soon",
  message: "Certificate reaches its expiry window.",
  createdAt: "2026-11-11T01:00:00.000Z",
  observedAt: "2026-11-11T00:00:00.000Z",
  expiresAt: "2026-11-21T00:00:00.000Z",
  thresholdDays: 10,
  resolvedAt: null,
  readAt: null,
};
const summary: ReviewMonitoringSummary = {
  workspaceId: state.register.workspaceId,
  registers: [
    {
      registerId,
      registerName: state.register.name,
      monitoring: { ...monitoring, alerts: [alert] },
    },
  ],
};

it("requires explicit weekly days and exact source-access choices without silently enabling a schedule", () => {
  const markup = renderToStaticMarkup(
    <MonitoringScheduleEditor state={state} busy={false} save={async () => {}} />,
  );
  for (const day of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"])
    expect(markup).toContain(day);
  expect(markup).toContain("✓ Working");
  expect(markup).toContain("✗ Unreachable");
  expect(markup).toContain("No value is selected automatically");
  expect(markup).not.toContain('checked=""');
  expect(markup).toContain('value="15, 10"');
  const configured = renderToStaticMarkup(
    <MonitoringScheduleEditor
      state={{
        ...state,
        monitoring: {
          ...monitoring,
          schedule: {
            enabled: true,
            weekdays: [1, 5],
            time: "10:30",
            timeZone: "Asia/Kolkata",
            accessibleValues: ["✓ Working"],
            sslWarningDays: [21, 7],
          },
        },
      }}
      busy={false}
      save={async () => {}}
    />,
  );
  expect(configured.match(/checked=""/g)).toHaveLength(4);
  const timeControl = configured.match(/<input(?=[^>]*type="time")[^>]*>/)?.[0] ?? "";
  for (const attribute of ['name="time"', 'required=""', 'value="10:30"'])
    expect(timeControl).toContain(attribute);
  expect(configured).toContain('value="Asia/Kolkata"');
  expect(configured).toContain('value="21, 7"');
});

it("submits the visible native time when browser input tracking has left the controlled state at its default", () => {
  const schedule = {
    enabled: true,
    weekdays: [1],
    time: "09:00",
    timeZone: "UTC",
    accessibleValues: ["✓ Working"],
    sslWarningDays: [15, 10],
  };
  const form = new FormData();
  form.set("time", "01:28");
  const parsed = monitoringScheduleFromForm(schedule, form, "15, 10");
  expect(parsed.success).toBe(true);
  if (parsed.success) expect(parsed.data.time).toBe("01:28");
  expect(schedule.time).toBe("09:00");
  form.set("time", "not-a-time");
  expect(monitoringScheduleFromForm(schedule, form, "15, 10").success).toBe(false);
});

it("shows SSL dates and verification separately, with remaining days anchored to the actual observation", () => {
  const observation = {
    url: "https://app.example.invalid",
    hostname: "app.example.invalid",
    port: 443,
    verification: "failed" as const,
    validFrom: "2026-10-01T00:00:00.000Z",
    validTo: "2026-11-21T00:00:00.000Z",
    subject: "<script>untrusted</script>",
    issuer: "Fixture issuer",
    fingerprint256: null,
    errorCode: "CERT_CHAIN_INVALID",
    observedAt: "2026-11-11T00:00:00.000Z",
  };
  expect(certificateDaysRemaining(observation)).toBe(10);
  expect(certificateDaysRemaining({ ...observation, validTo: null })).toBeNull();
  const markup = renderToStaticMarkup(<CertificateEvidence observation={observation} />);
  expect(markup).toContain("Certificate verification failed");
  expect(markup).toContain("10 days");
  expect(markup).toContain("Days remaining at observation");
  expect(markup).toContain(new Date(observation.validTo).toLocaleString());
  expect(markup).toContain(new Date(observation.observedAt).toLocaleString());
  expect(markup).toContain("&lt;script&gt;");
  expect(markup).not.toContain("<script>");
  expect(markup).not.toContain("record-badge positive");
  const instant = "2026-11-11T03:30:00.000Z";
  expect(scheduledStamp(instant, "Asia/Kolkata")).toBe(
    new Date(instant).toLocaleString(undefined, { timeZone: "Asia/Kolkata" }),
  );
  expect(scheduledStamp(instant, "UTC")).not.toBe(scheduledStamp(instant, "Asia/Kolkata"));
});

it("keeps the ordinary user's SSL bell independent from permission to approve join requests", () => {
  const markup = renderToStaticMarkup(
    <JoinNotifications
      status="denied"
      records={[]}
      onReview={() => {}}
      monitoringStatus="ready"
      monitoring={summary}
      onOpenMonitoring={() => {}}
    />,
  );
  expect(markup).toContain('aria-label="Notifications: 1 review alerts"');
  expect(markup).toContain('class="join-count">1</span>');
  expect(markup).not.toContain("join requests");
  expect(
    renderToStaticMarkup(
      <JoinNotifications
        status="denied"
        records={[]}
        onReview={() => {}}
        monitoringStatus="denied"
        monitoring={null}
      />,
    ),
  ).toBe("");
  const unavailable = renderToStaticMarkup(
    <JoinNotifications
      status="denied"
      records={[]}
      onReview={() => {}}
      monitoringStatus="unavailable"
      monitoring={null}
    />,
  );
  expect(unavailable).toContain("review alerts unavailable");
  expect(unavailable).not.toContain("0 review alerts");
});

it("does not keep an old verified certificate green when its recorded expiry approaches or passes", () => {
  const observation = {
    url: "https://app.example.invalid",
    hostname: "app.example.invalid",
    port: 443,
    verification: "verified" as const,
    validFrom: "2026-10-01T00:00:00.000Z",
    validTo: "2026-11-21T00:00:00.000Z",
    subject: "Application fixture",
    issuer: "Fixture issuer",
    fingerprint256: null,
    errorCode: null,
    observedAt: "2026-11-11T00:00:00.000Z",
  };
  const near = Date.parse("2026-11-11T00:00:00.000Z"),
    expired = Date.parse("2026-11-22T00:00:00.000Z");
  expect(certificateCurrentState(observation, [15, 10], near)).toEqual({
    daysRemaining: 10,
    expired: false,
    warning: true,
  });
  expect(certificateCurrentState(observation, [], near).warning).toBe(false);
  const nearMarkup = renderToStaticMarkup(
    <CertificateEvidence observation={observation} warningDays={[15, 10]} now={near} />,
  );
  expect(nearMarkup).toContain("Verified at observation");
  expect(nearMarkup).toContain("10 days remaining now");
  expect(nearMarkup).toContain("record-badge warning");
  expect(nearMarkup).not.toContain("record-badge positive");
  const expiredMarkup = renderToStaticMarkup(
    <CertificateEvidence observation={observation} warningDays={[15, 10]} now={expired} />,
  );
  expect(expiredMarkup).toContain("Verified at observation");
  expect(expiredMarkup).toContain("Recorded certificate expired");
  expect(expiredMarkup).toContain("record-badge negative");
  expect(expiredMarkup).not.toContain("record-badge positive");
  expect(expiredMarkup).toContain("fresh check may observe a renewed certificate");
  expect(observation.validTo).toBe("2026-11-21T00:00:00.000Z");
});

it("counts only unresolved unread alerts and does not turn an unavailable dashboard into a zero-alert claim", () => {
  const source = {
    ...summary,
    registers: [
      {
        registerId,
        registerName: state.register.name,
        monitoring: {
          ...monitoring,
          alerts: [
            alert,
            { ...alert, id: `ral_${"d".repeat(32)}`, readAt: "2026-11-11T02:00:00.000Z" },
            { ...alert, id: `ral_${"e".repeat(32)}`, resolvedAt: "2026-11-11T02:00:00.000Z" },
          ],
        },
      },
    ],
  };
  expect(monitoringAlerts(source)).toHaveLength(1);
  expect(monitoringAlerts(source, false)).toHaveLength(2);
  expect(source.registers[0]?.monitoring.alerts).toHaveLength(3);
  const ready = renderToStaticMarkup(
    <ReviewMonitoringOverview status="ready" summary={source} openRegister={() => {}} />,
  );
  expect(ready).toContain("Application review reports");
  expect(ready).toContain("Certificate expires soon");
  expect(ready).toContain("10-day threshold");
  const unavailable = renderToStaticMarkup(
    <ReviewMonitoringOverview status="unavailable" summary={null} openRegister={() => {}} />,
  );
  expect(unavailable).toContain("no zero-alert result is assumed");
  expect(unavailable).not.toContain("<strong>0</strong>");
  expect(
    renderToStaticMarkup(
      <ReviewMonitoringOverview status="denied" summary={source} openRegister={() => {}} />,
    ),
  ).toBe("");
  const alerts = renderToStaticMarkup(
    <MonitoringAlertList
      entries={monitoringAlerts(source)}
      openRegister={() => {}}
      onRead={() => {}}
    />,
  );
  expect(alerts).toContain("Mark as read");
  expect(alerts).toContain("View report");
});

it("keeps viewer reports readable while withholding scheduler and run actions", () => {
  const markup = renderToStaticMarkup(
    <ReviewReportsDialog
      api={{} as never}
      workspaceId="ws_fixture"
      state={{ ...state, role: "viewer" }}
      close={() => {}}
      updated={() => {}}
      onFailure={() => {}}
    />,
  );
  expect(markup).toContain("View-only monitoring");
  expect(markup).not.toContain("Run check now");
  expect(markup).not.toContain("Save schedule");
  expect(markup).not.toContain("<form");
});

it("reports selected and skipped records alongside endpoint progress without implying browser verification", () => {
  const run: ReviewMonitorRun = {
    id: `rrun_${"f".repeat(32)}`,
    trigger: "scheduled",
    occurrenceKey: "fixture",
    scheduledFor: "2026-11-11T00:00:00.000Z",
    startedAt: "2026-11-11T00:00:00.000Z",
    finishedAt: null,
    status: "running",
    requestedBy: UserIdSchema.parse("usr_fixture"),
    scheduleRevision: 1,
    eligibleRecords: 1,
    skippedRecords: 2,
    skippedEndpoints: 2,
    message: "One selected application; inaccessible source values skipped.",
    items: [
      {
        recordId: `rec_${"1".repeat(32)}`,
        recordTitle: "Application fixture",
        endpointId: `ep_${"c".repeat(32)}`,
        endpointLabel: "HTTPS",
        url: "https://app.example.invalid",
        status: "completed",
        message: "Checked",
        result: {
          status: "auth-required",
          httpStatus: 200,
          finalUrl: "https://app.example.invalid/login",
          message: "Sign-in page",
          title: "Login",
          elapsedMs: 10,
          checkedAt: "2026-11-11T00:00:01.000Z",
        },
      },
    ],
  };
  const markup = renderToStaticMarkup(<MonitorRunReport run={run} />);
  expect(markup).toContain("Selected applications");
  expect(markup).toContain("Skipped applications");
  expect(markup).toContain("1/1");
  expect(markup).toContain("HTTP 200");
  expect(markup).toContain("Sign-in or access check required");
  expect(markup).not.toContain("Expected page found");
  expect(markup).not.toContain("Browser verified");
});

it("retains compact dashboard report counts and explains paused checks versus retained certificate reminders", () => {
  const run: ReviewMonitorRun = {
    id: `rrun_${"1".repeat(32)}`,
    trigger: "scheduled",
    occurrenceKey: "fixture",
    scheduledFor: "2026-11-11T00:00:00.000Z",
    startedAt: "2026-11-11T00:00:00.000Z",
    finishedAt: "2026-11-11T00:05:00.000Z",
    status: "partial",
    requestedBy: UserIdSchema.parse("usr_fixture"),
    scheduleRevision: 1,
    eligibleRecords: 15,
    skippedRecords: 20,
    skippedEndpoints: 20,
    message: "Completed a bounded report.",
    items: [],
    summary: { endpoints: 20, completed: 18, issues: 4 },
  };
  expect(monitorReportTotals(run)).toEqual({ endpoints: 20, completed: 18, issues: 4 });
  const schedule = {
    enabled: false,
    weekdays: [1],
    time: "09:00",
    timeZone: "UTC",
    accessibleValues: ["✓ Working"],
    sslWarningDays: [15, 10],
  };
  const source: ReviewMonitoringSummary = {
    workspaceId: state.register.workspaceId,
    registers: [
      {
        registerId,
        registerName: state.register.name,
        monitoring: { ...monitoring, schedule, runs: [run] },
      },
    ],
  };
  const markup = renderToStaticMarkup(
    <ReviewMonitoringOverview status="ready" summary={source} openRegister={() => {}} />,
  );
  expect(markup).toContain("18/20 endpoint checks completed");
  expect(markup).toContain("4 results need review");
  expect(markup).not.toContain("0/0");
  expect(markup).toContain(
    "Weekly HTTP checks disabled; certificate reminders use the last observation",
  );
  const settings = renderToStaticMarkup(
    <MonitoringScheduleEditor
      state={{ ...state, monitoring: { ...monitoring, schedule } }}
      busy={false}
      save={async () => {}}
    />,
  );
  expect(settings).toContain("Pausing weekly checks stops new HTTP requests");
  expect(settings).toContain("Clear all access values to stop new reminders");
});

describe("monitoring API", () => {
  it("uses workspace-scoped reads and CSRF-protected schedule/run/own-alert commands with register revisions", async () => {
    const calls: { path: string; init: RequestInit | undefined }[] = [];
    const api = createControlCenterApi(
      async (url, init) => {
        const path = String(url);
        calls.push({ path, init });
        return new Response(JSON.stringify(path.endsWith("/monitoring") ? summary : state));
      },
      "/devsetu",
      () => "fixture-csrf",
    );
    const abort = new AbortController();
    expect(await api.reviewMonitoring?.("ws_fixture", abort.signal)).toEqual(summary);
    await api.saveReviewSchedule?.("ws_fixture", {
      version: 1,
      registerId,
      expectedRevision: 7,
      schedule: {
        enabled: true,
        weekdays: [1],
        time: "09:00",
        timeZone: "UTC",
        accessibleValues: ["✓ Working"],
        sslWarningDays: [15, 10],
      },
    });
    await api.runReviewMonitor?.("ws_fixture", { version: 1, registerId, expectedRevision: 7 });
    await api.readReviewMonitorAlert?.("ws_fixture", { version: 1, registerId, alertId: alert.id });
    expect(calls.map((call) => call.path)).toEqual(
      ["monitoring", "save-schedule", "run-monitor", "read-monitor-alert"].map(
        (action) => `/devsetu/v1/workspaces/ws_fixture/reviews/${action}`,
      ),
    );
    expect(calls.every((call) => call.init?.credentials === "same-origin")).toBe(true);
    expect(calls[0]?.init?.signal).toBe(abort.signal);
    expect(
      calls
        .slice(1)
        .every(
          (call) =>
            call.init?.method === "POST" &&
            Reflect.get(call.init.headers ?? {}, "x-csrf-token") === "fixture-csrf",
        ),
    ).toBe(true);
    expect(JSON.parse(String(calls[2]?.init?.body))).toEqual({
      version: 1,
      registerId,
      expectedRevision: 7,
    });
    expect(JSON.parse(String(calls[3]?.init?.body))).toEqual({
      version: 1,
      registerId,
      alertId: alert.id,
    });
  });
});
