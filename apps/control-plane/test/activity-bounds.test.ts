import { createRequire } from "node:module";
import { defaultActivitySettings, defaultDiscoveryPolicy } from "@frevos/contracts";
import { expect, it } from "vitest";
const safety = createRequire(import.meta.url)("../../../deployment/servix/DiscoverySafety.cjs");
const at = Date.parse("2026-10-26T00:00:00Z");
const event = (i: number, path = "src/work.ts") => ({
  sequence: i + 1,
  bootId: "85969340-7aba-4cfa-8ba1-272b46acdb9d",
  at: new Date(at + i * 100).toISOString(),
  root: "C:\\",
  path,
  kind: "modified",
  source: "filesystem-notification",
  attribution: "unavailable",
});
it("separates tooling paths on folder boundaries without weakening secret exclusions", () => {
  expect(safety.defaultActivitySettings).toEqual(defaultActivitySettings);
  expect(safety.activityCategory(event(0, "Users/me/.codex/vendor_imports/skills/file.md"))).toBe(
    "noise",
  );
  expect(safety.activityCategory(event(0, "TEMP/cache-file.ts"))).toBe("noise");
  expect(safety.activityCategory({ ...event(0, "TEMP/file.ts"), root: "/home/" })).toBe("work");
  expect(safety.activityCategory(event(0, "template/work.ts"))).toBe("work");
  expect(safety.activityCategory(event(0, "my-cache/source.ts"))).toBe("work");
  expect(safety.safeEvent(event(0, "Temp/.env.prod"))).toBeNull();
  expect(safety.safeEvent(event(0, "AppData/Temp/file.txt"))).toBeNull();
});
it("reserves both byte and event quotas so sustained noise cannot evict Work; expires noise earlier", () => {
  const work = Array.from({ length: 80 }, (_, i) => event(i));
  const noise = Array.from({ length: 500 }, (_, i) => event(i + 80, "Temp/item.tmp"));
  const retained = safety.retainActivity(
    [...work, ...noise],
    { ...defaultDiscoveryPolicy, maxEvents: 100 },
    defaultActivitySettings,
    at + 100000,
  );
  expect(retained.filter((e: { path: string }) => e.path === "src/work.ts")).toHaveLength(80);
  expect(retained.filter((e: { path: string }) => e.path === "Temp/item.tmp")).toHaveLength(20);
  const bulky = [
    ...work,
    ...noise.map((e) => ({
      ...e,
      content: { before: "a".repeat(8192), after: "b".repeat(8192), status: "redacted-text" },
    })),
  ];
  expect(
    Buffer.byteLength(
      JSON.stringify(
        safety.retainActivity(bulky, defaultDiscoveryPolicy, defaultActivitySettings, at + 100000),
      ),
    ),
  ).toBeLessThanOrEqual(1000000);
  expect(
    safety.retainActivity(
      [event(0), event(1, "Temp/x")],
      defaultDiscoveryPolicy,
      defaultActivitySettings,
      at + 3 * 86400000,
    ),
  ).toEqual([event(0)]);
});
it("summarizes only retained matching notifications, preserving time bounds, attribution and separate content versions", () => {
  const base = [
    event(0),
    event(1),
    event(310),
    { ...event(3), attribution: { kind: "os-audit", user: "someone" } },
    { ...event(4), content: { before: "old", after: "new", status: "redacted-text" } },
  ];
  const rows = safety.summarizeActivity(base);
  expect(rows).toHaveLength(4);
  expect(rows.find((r: { count: number }) => r.count === 2)).toMatchObject({
    firstAt: event(0).at,
    at: event(1).at,
    category: "work",
  });
});
