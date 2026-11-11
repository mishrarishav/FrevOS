import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type ReviewCheckResult,
  type ReviewEndpoint,
  type ReviewLinkPolicy,
  ReviewMonitoringSummarySchema,
  ReviewRegisterConfigSchema,
  type ReviewScheduleConfig,
  ReviewScheduleConfigSchema,
  ReviewStateSchema,
} from "@frevos/contracts";
import { afterEach, expect, it, vi } from "vitest";
import { latestReviewOccurrence, nextReviewOccurrence } from "../src/review-monitor-schedule.js";
import { ReviewRegisters } from "../src/review-registers.js";

const cleanup: string[] = [];
afterEach(async () => {
  for (const path of cleanup.splice(0)) await rm(path, { recursive: true, force: true });
});
const schedule = (overrides: Partial<ReviewScheduleConfig> = {}) =>
  ReviewScheduleConfigSchema.parse({
    enabled: false,
    weekdays: [3],
    time: "09:00",
    timeZone: "Asia/Kolkata",
    accessibleValues: ["Accessible"],
    sslWarningDays: [10, 15],
    ...overrides,
  });
const config = () =>
  ReviewRegisterConfigSchema.parse({
    name: "Application monitoring",
    description: "",
    fields: [],
    managementOptions: ["Internal"],
    lifecycleOptions: ["Active"],
    requirementOptions: ["Required"],
    decisionOptions: ["Review"],
    linkPolicy: {
      allowedOrigins: ["https://example.invalid"],
      allowPrivate: false,
      timeoutMs: 1000,
      maxBytes: 4096,
      maxRedirects: 1,
    },
  });
const measured = (checkedAt: string): ReviewCheckResult => ({
  status: "healthy",
  httpStatus: 200,
  finalUrl: "https://example.invalid/app",
  message: "Expected page matched",
  title: "Application",
  elapsedMs: 5,
  checkedAt,
});
async function fixture(
  checker?: (endpoint: ReviewEndpoint, policy: ReviewLinkPolicy) => Promise<ReviewCheckResult>,
) {
  const root = await mkdtemp(join(tmpdir(), "devsetu-monitor-"));
  cleanup.push(root);
  let clock = "2026-11-11T02:00:00.000Z",
    authorized = true;
  const member = async (ws: string, user: string) => ({
    active:
      ws === "ws_monitor" &&
      ["usr_admin", "usr_backup", "usr_viewer", "usr_other"].includes(user) &&
      (user !== "usr_admin" || authorized),
    administrator: ["usr_admin", "usr_backup"].includes(user),
  });
  const check = vi.fn<
    (endpoint: ReviewEndpoint, policy: ReviewLinkPolicy) => Promise<ReviewCheckResult>
  >(checker ?? (async () => measured(clock)));
  const service = new ReviewRegisters(root, member, async () => [], {
    checkLink: check,
    now: () => clock,
  });
  let state = ReviewStateSchema.parse(
    await service.execute("usr_admin", "ws_monitor", "save-register", {
      version: 1,
      expectedRevision: 0,
      config: config(),
    }),
  );
  const registerId = state.register.id;
  const read = () => service.state("usr_backup", "ws_monitor", registerId);
  const add = async (title: string, access = "Accessible", endpoints = 1) => {
    state = ReviewStateSchema.parse(
      await service.execute("usr_backup", "ws_monitor", "save-record", {
        version: 1,
        registerId,
        expectedRevision: 0,
        record: {
          title,
          description: "",
          department: "",
          management: "Internal",
          businessOwner: "",
          spoc: "",
          technicalAssignee: "",
          lifecycle: "Active",
          requirement: "Required",
          recordedAccess: access,
          fields: {},
          endpoints: Array.from({ length: endpoints }, (_, index) => ({
            id: "ep_" + randomUUID().replaceAll("-", ""),
            label: title + index,
            url: `https://example.invalid/${title}${index}`,
            expectedText: "Application",
            expectedStatuses: [200],
          })),
        },
      }),
    );
    return state.records.at(-1)!;
  };
  const saveSchedule = async (value = schedule()) => {
    state = await read();
    return ReviewStateSchema.parse(
      await service.execute("usr_admin", "ws_monitor", "save-schedule", {
        version: 1,
        registerId,
        expectedRevision: state.register.revision,
        schedule: value,
      }),
    );
  };
  const run = async () => {
    state = await read();
    return ReviewStateSchema.parse(
      await service.execute("usr_admin", "ws_monitor", "run-monitor", {
        version: 1,
        registerId,
        expectedRevision: state.register.revision,
      }),
    );
  };
  return {
    root,
    member,
    service,
    registerId,
    check,
    add,
    read,
    saveSchedule,
    run,
    clock: (value: string) => {
      clock = value;
    },
    now: () => clock,
    revoke: () => {
      authorized = false;
    },
  };
}

it("uses configured timezones and deduplicates repeated DST slots while advancing spring gaps", () => {
  const india = schedule({ enabled: true });
  expect(nextReviewOccurrence(india, "2026-11-11T02:00:00.000Z")?.at).toBe(
    "2026-11-11T03:30:00.000Z",
  );
  expect(
    latestReviewOccurrence(india, "2026-11-11T04:00:00.000Z", "2026-11-11T03:45:00.000Z"),
  ).toBeNull();
  const autumn = schedule({
    enabled: true,
    timeZone: "America/New_York",
    weekdays: [7],
    time: "01:30",
  });
  const first = latestReviewOccurrence(
      autumn,
      "2026-11-01T05:40:00.000Z",
      "2026-10-31T00:00:00.000Z",
    ),
    second = latestReviewOccurrence(autumn, "2026-11-01T06:40:00.000Z", "2026-10-31T00:00:00.000Z");
  expect(first?.at).toBe("2026-11-01T05:30:00.000Z");
  expect(second?.key).toBe(first?.key);
  const spring = schedule({
    enabled: true,
    timeZone: "America/New_York",
    weekdays: [7],
    time: "02:30",
  });
  expect(nextReviewOccurrence(spring, "2026-03-08T00:00:00.000Z")?.at).toBe(
    "2026-03-08T07:00:00.000Z",
  );
});
it("checks only exact configured accessible records and creates an ACL-filtered durable manual report", async () => {
  const f = await fixture();
  await f.add("included");
  await f.add("excluded", "Inaccessible");
  await f.saveSchedule();
  await f.run();
  await f.service.tickMonitoring();
  const state = await f.read(),
    run = state.monitoring!.runs.at(-1)!;
  expect(f.check).toHaveBeenCalledTimes(1);
  expect(f.check.mock.calls[0]![0].url).toContain("included");
  expect(run).toMatchObject({
    trigger: "manual",
    status: "completed",
    eligibleRecords: 1,
    skippedRecords: 1,
  });
  expect(run.items).toHaveLength(1);
  expect((await f.service.monitoring("usr_other", "ws_monitor")).registers).toEqual([]);
  const fresh = await f.read();
  await f.service.execute("usr_backup", "ws_monitor", "grant", {
    version: 1,
    registerId: f.registerId,
    expectedRevision: fresh.register.revision,
    userId: "usr_viewer",
    role: "viewer",
  });
  expect(
    ReviewMonitoringSummarySchema.parse(await f.service.monitoring("usr_viewer", "ws_monitor"))
      .registers,
  ).toHaveLength(1);
  const compact = (await f.service.monitoring("usr_viewer", "ws_monitor")).registers[0]!.monitoring
    .runs[0]!;
  expect(compact.items).toEqual([]);
  expect(compact.summary).toEqual({ endpoints: 1, completed: 1, issues: 0 });
  expect((await f.read()).monitoring!.runs[0]!.items).toHaveLength(1);
  const restarted = new ReviewRegisters(f.root, f.member);
  expect(
    (await restarted.monitoring("usr_backup", "ws_monitor")).registers[0]!.monitoring.runs[0]!
      .status,
  ).toBe("completed");
  await f.service.closeMonitoring();
});
it("joins overlapping ticks and rejects a second manual run while an attempt is active", async () => {
  let complete!: (value: ReviewCheckResult) => void;
  const f = await fixture(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  await f.add("included");
  await f.saveSchedule();
  await f.run();
  const running = f.service.tickMonitoring();
  await vi.waitFor(() => expect(f.check).toHaveBeenCalledTimes(1));
  expect(f.service.tickMonitoring()).toBe(running);
  await expect(f.run()).rejects.toThrow("monitor-in-progress");
  complete(measured(f.now()));
  await running;
  await f.service.tickMonitoring();
  expect(f.check).toHaveBeenCalledTimes(1);
  expect((await f.read()).monitoring!.runs).toHaveLength(1);
});
it("catches up only the latest eligible occurrence and does not replay it after restart", async () => {
  const f = await fixture();
  await f.add("included");
  await f.saveSchedule(schedule({ enabled: true }));
  await f.service.tickMonitoring();
  expect(f.check).not.toHaveBeenCalled();
  f.clock("2026-11-11T07:00:00.000Z");
  await f.service.tickMonitoring();
  let state = await f.read();
  expect(f.check).toHaveBeenCalledTimes(1);
  expect(state.monitoring!.runs[0]).toMatchObject({
    trigger: "scheduled",
    scheduledFor: "2026-11-11T03:30:00.000Z",
    startedAt: "2026-11-11T07:00:00.000Z",
  });
  await f.service.closeMonitoring();
  const checker = vi.fn(async () => measured(f.now())),
    restarted = new ReviewRegisters(f.root, f.member, async () => [], {
      checkLink: checker,
      now: f.now,
    });
  await restarted.tickMonitoring();
  expect(checker).not.toHaveBeenCalled();
  f.clock("2026-12-16T07:00:00.000Z");
  await restarted.tickMonitoring();
  state = await restarted.state("usr_backup", "ws_monitor", f.registerId);
  expect(checker).toHaveBeenCalledTimes(1);
  expect(state.monitoring!.runs).toHaveLength(2);
  expect(state.monitoring!.runs[1]!.scheduledFor).toBe("2026-12-16T03:30:00.000Z");
  await restarted.closeMonitoring();
});
it("does not backfill an occurrence before a new schedule was configured", async () => {
  const f = await fixture();
  f.clock("2026-11-11T08:00:00.000Z");
  await f.add("included");
  await f.saveSchedule(schedule({ enabled: true }));
  await f.service.tickMonitoring();
  expect(f.check).not.toHaveBeenCalled();
  expect((await f.read()).monitoring!.nextRunAt).toBe("2026-11-18T03:30:00.000Z");
});
it("marks an ambiguous pre-crash attempt interrupted instead of issuing the HTTP request again", async () => {
  let complete!: (value: ReviewCheckResult) => void;
  const f = await fixture(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  await f.add("included");
  await f.saveSchedule();
  await f.run();
  const oldWork = f.service.tickMonitoring();
  await vi.waitFor(() => expect(f.check).toHaveBeenCalledTimes(1));
  const checker = vi.fn(async () => measured(f.now())),
    restarted = new ReviewRegisters(f.root, f.member, async () => [], {
      checkLink: checker,
      now: f.now,
    });
  await restarted.tickMonitoring();
  expect(checker).not.toHaveBeenCalled();
  expect(
    (await restarted.state("usr_backup", "ws_monitor", f.registerId)).monitoring!.runs[0]!.status,
  ).toBe("running");
  f.clock("2026-11-11T02:01:01.000Z");
  await restarted.tickMonitoring();
  const state = await restarted.state("usr_backup", "ws_monitor", f.registerId);
  expect(state.monitoring!.runs[0]!.status).toBe("partial");
  expect(state.monitoring!.runs[0]!.items[0]!.status).toBe("interrupted");
  complete(measured(f.now()));
  await oldWork;
  expect((await f.read()).records[0]!.checks).toHaveLength(0);
});
it("stops after access revocation and does not publish a response obtained after revocation", async () => {
  let complete!: (value: ReviewCheckResult) => void;
  const f = await fixture(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  await f.add("included", "Accessible", 2);
  await f.saveSchedule();
  await f.run();
  const running = f.service.tickMonitoring();
  await vi.waitFor(() => expect(f.check).toHaveBeenCalledTimes(1));
  f.revoke();
  complete(measured(f.now()));
  await running;
  const state = await f.read();
  expect(f.check).toHaveBeenCalledTimes(1);
  expect(state.records[0]!.checks).toHaveLength(0);
  expect(state.monitoring!.runs[0]!.status).toBe("interrupted");
});
it("cancels response publication and later targets when a record becomes inaccessible", async () => {
  let complete!: (value: ReviewCheckResult) => void;
  const f = await fixture(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  await f.add("included", "Accessible", 2);
  await f.saveSchedule();
  await f.run();
  const running = f.service.tickMonitoring();
  await vi.waitFor(() => expect(f.check).toHaveBeenCalledTimes(1));
  const state = await f.read(),
    record = state.records[0]!,
    {
      id,
      revision,
      updatedAt: _,
      updatedBy: __,
      provenance: ___,
      assignmentHistory: ____,
      reviews: _____,
      checks: ______,
      ...input
    } = record;
  await f.service.execute("usr_backup", "ws_monitor", "save-record", {
    version: 1,
    registerId: f.registerId,
    id,
    expectedRevision: revision,
    record: { ...input, recordedAccess: "Inaccessible" },
  });
  complete(measured(f.now()));
  await running;
  const saved = await f.read();
  expect(f.check).toHaveBeenCalledTimes(1);
  expect(saved.records[0]!.checks).toHaveLength(0);
  expect(saved.monitoring!.runs[0]!.items.every((item) => item.status === "skipped")).toBe(true);
});
it("reevaluates retained verified certificate thresholds without extra HTTP and keeps acknowledgements per user", async () => {
  let expiry = "2026-11-27T02:00:00.000Z";
  const f = await fixture(async (endpoint) => ({
    ...measured(f.now()),
    tls: [
      {
        url: endpoint.url,
        hostname: "example.invalid",
        port: 443,
        verification: "verified",
        validFrom: "2026-01-01T00:00:00.000Z",
        validTo: expiry,
        subject: null,
        issuer: null,
        fingerprint256: null,
        errorCode: null,
        observedAt: f.now(),
      },
    ],
  }));
  await f.add("included");
  await f.add("excluded", "Inaccessible");
  await f.saveSchedule();
  await f.run();
  await f.service.tickMonitoring();
  expect((await f.read()).monitoring!.alerts).toHaveLength(0);
  f.clock("2026-11-14T02:00:00.000Z");
  await f.service.tickMonitoring();
  let state = await f.read(),
    active = state.monitoring!.alerts.filter((alert) => !alert.resolvedAt);
  expect(active).toHaveLength(1);
  expect(active[0]).toMatchObject({
    kind: "ssl-expiring",
    thresholdDays: 15,
    observedAt: "2026-11-11T02:00:00.000Z",
  });
  await f.service.execute("usr_backup", "ws_monitor", "grant", {
    version: 1,
    registerId: f.registerId,
    expectedRevision: state.register.revision,
    userId: "usr_viewer",
    role: "viewer",
  });
  await f.service.execute("usr_viewer", "ws_monitor", "read-monitor-alert", {
    version: 1,
    registerId: f.registerId,
    alertId: active[0]!.id,
  });
  expect(
    (await f.service.state("usr_viewer", "ws_monitor", f.registerId)).monitoring!.alerts[0]!.readAt,
  ).not.toBeNull();
  expect((await f.read()).monitoring!.alerts[0]!.readAt).toBeNull();
  await f.service.tickMonitoring();
  expect((await f.read()).monitoring!.alerts).toHaveLength(1);
  f.clock("2026-11-18T02:00:00.000Z");
  await f.service.tickMonitoring();
  state = await f.read();
  active = state.monitoring!.alerts.filter((alert) => !alert.resolvedAt);
  expect(active).toHaveLength(1);
  expect(active[0]!.thresholdDays).toBe(10);
  expect(
    state.monitoring!.alerts.some((alert) => alert.thresholdDays === 15 && alert.resolvedAt),
  ).toBe(true);
  expect(f.check).toHaveBeenCalledTimes(1);
  f.clock("2026-11-28T02:00:00.000Z");
  await f.service.tickMonitoring();
  expect((await f.read()).monitoring!.alerts.find((alert) => !alert.resolvedAt)!.kind).toBe(
    "ssl-expired",
  );
  expiry = "2027-02-01T00:00:00.000Z";
  state = await f.read();
  const record = state.records[0]!;
  await f.service.execute("usr_backup", "ws_monitor", "check-link", {
    version: 1,
    registerId: f.registerId,
    recordId: record.id,
    endpointId: record.endpoints[0]!.id,
    expectedRevision: record.revision,
  });
  expect((await f.read()).monitoring!.alerts.every((alert) => alert.resolvedAt !== null)).toBe(
    true,
  );
});
it("reports a revoked schedule administrator once without sending automatic requests", async () => {
  const f = await fixture();
  await f.add("included");
  await f.saveSchedule(schedule({ enabled: true }));
  f.revoke();
  f.clock("2026-11-11T04:00:00.000Z");
  await f.service.tickMonitoring();
  let state = await f.read();
  expect(f.check).not.toHaveBeenCalled();
  expect(state.monitoring!.runs).toHaveLength(1);
  expect(state.monitoring!.runs[0]!.status).toBe("failed");
  expect(state.monitoring!.alerts.find((alert) => !alert.resolvedAt)!.title).toBe(
    "Review monitoring paused",
  );
  await f.service.tickMonitoring();
  state = await f.read();
  expect(state.monitoring!.runs).toHaveLength(1);
  expect(state.monitoring!.alerts.filter((alert) => !alert.resolvedAt)).toHaveLength(1);
});
it("chooses the most urgent initial certificate threshold and resolves reminders when eligibility is removed", async () => {
  const f = await fixture(async (endpoint) => ({
    ...measured(f.now()),
    tls: [
      {
        url: endpoint.url,
        hostname: "example.invalid",
        port: 443,
        verification: "verified",
        validFrom: "2026-01-01T00:00:00.000Z",
        validTo: "2026-11-16T02:00:00.000Z",
        subject: null,
        issuer: null,
        fingerprint256: null,
        errorCode: null,
        observedAt: f.now(),
      },
    ],
  }));
  await f.add("included");
  await f.saveSchedule();
  await f.run();
  await f.service.tickMonitoring();
  let state = await f.read(),
    active = state.monitoring!.alerts.filter((alert) => !alert.resolvedAt);
  expect(active).toHaveLength(1);
  expect(active[0]!.thresholdDays).toBe(10);
  expect(state.monitoring!.alerts.some((alert) => alert.thresholdDays === 15)).toBe(false);
  await f.saveSchedule(schedule({ accessibleValues: [] }));
  await f.service.tickMonitoring();
  state = await f.read();
  expect(state.monitoring!.alerts.every((alert) => alert.resolvedAt !== null)).toBe(true);
  expect(f.check).toHaveBeenCalledTimes(1);
});
it("stops between bounded attempts on shutdown and resumes only unattempted work after restart", async () => {
  let complete!: (value: ReviewCheckResult) => void;
  const f = await fixture(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  await f.add("included", "Accessible", 2);
  await f.saveSchedule();
  await f.run();
  const work = f.service.tickMonitoring();
  await vi.waitFor(() => expect(f.check).toHaveBeenCalledTimes(1));
  const closing = f.service.closeMonitoring();
  complete(measured(f.now()));
  await closing;
  await work;
  let state = await f.read();
  expect(state.monitoring!.runs[0]!.items.map((item) => item.status)).toEqual([
    "completed",
    "pending",
  ]);
  await expect(f.run()).rejects.toThrow("monitor-stopping");
  const checker = vi.fn(async () => measured(f.now())),
    restarted = new ReviewRegisters(f.root, f.member, async () => [], {
      checkLink: checker,
      now: f.now,
    });
  await restarted.tickMonitoring();
  expect(checker).toHaveBeenCalledTimes(1);
  state = await restarted.state("usr_backup", "ws_monitor", f.registerId);
  expect(state.monitoring!.runs[0]!.status).toBe("completed");
  expect(state.records[0]!.checks).toHaveLength(2);
  await restarted.closeMonitoring();
});
it.each([true, false])(
  "deduplicates the same TLS destination across HTTPS and diagnostic links, with metadata=%s",
  async (withMetadata) => {
    const f = await fixture(async (endpoint) => {
      const hostname = endpoint.label.endsWith("2")
        ? "other.example.invalid"
        : "same.example.invalid";
      return {
        ...measured(f.now()),
        status: "tls-error",
        httpStatus: null,
        finalUrl: `https://${hostname}/application`,
        ...(withMetadata
          ? {
              tls: [
                {
                  url: `https://${hostname}/application`,
                  hostname,
                  port: 443,
                  verification: "failed" as const,
                  validFrom: null,
                  validTo: null,
                  subject: null,
                  issuer: null,
                  fingerprint256: null,
                  errorCode: "CERT_HAS_EXPIRED",
                  observedAt: f.now(),
                },
              ],
            }
          : {}),
      };
    });
    await f.add("included", "Accessible", 3);
    await f.saveSchedule();
    await f.run();
    await f.service.tickMonitoring();
    const state = await f.read(),
      alerts = state.monitoring!.alerts.filter((alert) => !alert.resolvedAt);
    expect(f.check).toHaveBeenCalledTimes(3);
    expect(alerts).toHaveLength(2);
    expect(
      alerts.filter((alert) => alert.message.includes("same.example.invalid:443")),
    ).toHaveLength(1);
    expect(
      alerts.filter((alert) => alert.message.includes("other.example.invalid:443")),
    ).toHaveLength(1);
    expect(
      alerts.every(
        (alert) =>
          alert.kind === "tls-error" &&
          alert.expiresAt === null &&
          state.records[0]!.endpoints.some((endpoint) => endpoint.id === alert.endpointId),
      ),
    ).toBe(true);
  },
);
it("deduplicates certificate warnings by TLS site and resolves old observations after a newer renewal", async () => {
  let expiry = "2026-11-16T02:00:00.000Z";
  const f = await fixture(async (endpoint) => ({
    ...measured(f.now()),
    tls: [
      {
        url: endpoint.url,
        hostname: "same.example.invalid",
        port: 443,
        verification: "verified",
        validFrom: "2026-01-01T00:00:00.000Z",
        validTo: expiry,
        subject: null,
        issuer: null,
        fingerprint256: null,
        errorCode: null,
        observedAt: f.now(),
      },
    ],
  }));
  await f.add("included", "Accessible", 2);
  await f.saveSchedule();
  await f.run();
  await f.service.tickMonitoring();
  let state = await f.read();
  expect(state.monitoring!.alerts.filter((alert) => !alert.resolvedAt)).toHaveLength(1);
  expiry = "2027-02-01T00:00:00.000Z";
  f.clock("2026-11-11T02:01:00.000Z");
  const record = state.records[0]!;
  await f.service.execute("usr_backup", "ws_monitor", "check-link", {
    version: 1,
    registerId: f.registerId,
    recordId: record.id,
    endpointId: record.endpoints[0]!.id,
    expectedRevision: record.revision,
  });
  state = await f.read();
  expect(state.monitoring!.alerts.every((alert) => alert.resolvedAt !== null)).toBe(true);
  expect(state.records[0]!.endpoints).toHaveLength(2);
});
it("reports an eligible record without a URL as partial without inventing an endpoint or sending a request", async () => {
  const f = await fixture();
  await f.add("Missing URL", "Accessible", 0);
  await f.saveSchedule();
  await f.run();
  await f.service.tickMonitoring();
  const state = await f.read(),
    run = state.monitoring!.runs[0]!;
  expect(f.check).not.toHaveBeenCalled();
  expect(run.status).toBe("partial");
  expect(run.eligibleRecords).toBe(1);
  expect(run.items).toEqual([]);
  expect(run.message).toContain("1 eligible record has no configured URL");
  const summary = (await f.service.monitoring("usr_backup", "ws_monitor")).registers[0]!.monitoring
    .runs[0]!.summary;
  expect(summary).toEqual({ endpoints: 0, completed: 0, issues: 1 });
});
it("retains the last verified certificate reminder when a later network failure cannot observe TLS", async () => {
  let offline = false;
  const f = await fixture(async (endpoint) =>
    offline
      ? {
          ...measured(f.now()),
          status: "unreachable",
          httpStatus: null,
          message: "No route to application",
        }
      : {
          ...measured(f.now()),
          tls: [
            {
              url: endpoint.url,
              hostname: "example.invalid",
              port: 443,
              verification: "verified",
              validFrom: "2026-01-01T00:00:00.000Z",
              validTo: "2026-11-16T02:00:00.000Z",
              subject: null,
              issuer: null,
              fingerprint256: null,
              errorCode: null,
              observedAt: f.now(),
            },
          ],
        },
  );
  await f.add("included");
  await f.saveSchedule();
  await f.run();
  await f.service.tickMonitoring();
  let state = await f.read();
  const alertId = state.monitoring!.alerts.find((alert) => !alert.resolvedAt)!.id;
  offline = true;
  f.clock("2026-11-12T02:00:00.000Z");
  const record = state.records[0]!;
  await f.service.execute("usr_backup", "ws_monitor", "check-link", {
    version: 1,
    registerId: f.registerId,
    recordId: record.id,
    endpointId: record.endpoints[0]!.id,
    expectedRevision: record.revision,
  });
  state = await f.read();
  const active = state.monitoring!.alerts.filter((alert) => !alert.resolvedAt);
  expect(active).toHaveLength(1);
  expect(active[0]).toMatchObject({
    id: alertId,
    kind: "ssl-expiring",
    observedAt: "2026-11-11T02:00:00.000Z",
  });
  expect(state.records[0]!.checks.at(-1)!.status).toBe("unreachable");
});
