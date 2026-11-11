import { describe, expect, it } from "vitest";
import {
  ReviewCheckResultSchema,
  ReviewMonitorRunSchema,
  ReviewReadMonitorAlertSchema,
  ReviewSaveScheduleSchema,
  ReviewScheduleConfigSchema,
  ReviewTlsObservationSchema,
} from "../src/index.js";

const schedule = {
  enabled: true,
  weekdays: [1, 3, 5],
  time: "09:15",
  timeZone: "Asia/Kolkata",
  accessibleValues: ["Available", "Available via private route"],
  sslWarningDays: [15, 10],
};
const certificate = {
  url: "https://application.example.invalid/",
  hostname: "application.example.invalid",
  port: 443,
  verification: "verified",
  validFrom: "2026-10-01T00:00:00.000Z",
  validTo: "2026-12-01T00:00:00.000Z",
  subject: "Application certificate",
  issuer: "Fixture certificate authority",
  fingerprint256: "AA:BB",
  errorCode: null,
  observedAt: "2026-11-11T01:00:00.000Z",
};

describe("review schedule and certificate boundaries", () => {
  it("round trips selected weekdays, an explicit timezone and exact accessibility values", () => {
    const parsed = ReviewSaveScheduleSchema.parse({
      version: 1,
      registerId: `rr_${"a".repeat(32)}`,
      expectedRevision: 7,
      schedule,
    });
    expect(parsed.schedule).toEqual(schedule);
    expect(ReviewScheduleConfigSchema.parse(JSON.parse(JSON.stringify(schedule)))).toEqual(
      schedule,
    );
  });

  it.each([
    { weekdays: [] },
    { weekdays: [0] },
    { weekdays: [8] },
    { weekdays: [1, 1] },
    { time: "24:00" },
    { time: "9:15" },
    { time: "09:60" },
    { timeZone: "not/a-timezone" },
    { accessibleValues: [] },
    { accessibleValues: ["Available", "Available"] },
    { sslWarningDays: [0] },
    { sslWarningDays: [366] },
    { sslWarningDays: [10, 10] },
    { sslWarningDays: [] },
    { command: "run arbitrary code" },
  ])("rejects unsafe or ambiguous enabled schedule input %#", (override) => {
    expect(ReviewScheduleConfigSchema.safeParse({ ...schedule, ...override }).success).toBe(false);
  });

  it("allows an explicitly disabled unconfigured selection without selecting every record", () => {
    expect(
      ReviewScheduleConfigSchema.parse({
        ...schedule,
        enabled: false,
        weekdays: [],
        accessibleValues: [],
      }).accessibleValues,
    ).toEqual([]);
  });

  it("reads old check results without inventing SSL verification or expiry", () => {
    const old = {
      status: "unknown",
      httpStatus: 200,
      finalUrl: certificate.url,
      message: "Page identity needs review",
      title: "Application",
      elapsedMs: 200,
      checkedAt: certificate.observedAt,
    };
    expect(ReviewCheckResultSchema.parse(old)).not.toHaveProperty("tls");
    expect(ReviewCheckResultSchema.parse({ ...old, tls: [certificate] }).tls).toEqual([
      certificate,
    ]);
  });

  it("represents a rejected TLS connection with unavailable certificate metadata", () => {
    const failed = {
      ...certificate,
      verification: "failed",
      validFrom: null,
      validTo: null,
      subject: null,
      issuer: null,
      fingerprint256: null,
      errorCode: "CERT_HAS_EXPIRED",
    };
    expect(ReviewTlsObservationSchema.parse(failed).verification).toBe("failed");
    expect(
      ReviewTlsObservationSchema.safeParse({ ...failed, privateKey: "unsupported" }).success,
    ).toBe(false);
  });

  it("binds alert acknowledgement to one register and refuses client-authored read receipts", () => {
    const input = {
      version: 1,
      registerId: `rr_${"a".repeat(32)}`,
      alertId: `ral_${"b".repeat(32)}`,
    };
    expect(ReviewReadMonitorAlertSchema.parse(input)).toEqual(input);
    expect(ReviewReadMonitorAlertSchema.safeParse({ ...input, userId: "usr_other" }).success).toBe(
      false,
    );
  });

  it("bounds retained endpoint evidence while preserving interrupted outcomes", () => {
    const item = {
      recordId: `rec_${"c".repeat(32)}`,
      recordTitle: "Application",
      endpointId: `ep_${"d".repeat(32)}`,
      endpointLabel: "Application page",
      url: certificate.url,
      status: "interrupted",
      result: null,
      message: "Request outcome was unknown at restart",
    };
    const run = {
      id: `rrun_${"e".repeat(32)}`,
      trigger: "scheduled",
      occurrenceKey: "fixture-occurrence",
      scheduledFor: certificate.observedAt,
      startedAt: certificate.observedAt,
      finishedAt: certificate.observedAt,
      status: "interrupted",
      requestedBy: "usr_scheduler",
      scheduleRevision: 1,
      eligibleRecords: 1,
      skippedRecords: 2,
      skippedEndpoints: 0,
      message: "Interrupted measurement, not a historical success",
      items: [item],
    };
    expect(ReviewMonitorRunSchema.parse(run).items[0]?.result).toBeNull();
    expect(
      ReviewMonitorRunSchema.safeParse({ ...run, items: Array(1001).fill(item) }).success,
    ).toBe(false);
  });
});
