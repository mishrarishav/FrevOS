import { expect, it } from "vitest";
import { healthSegments } from "../src/HealthGraphs.js";
import { agentPositions } from "../src/AgentNetwork.js";
import type { Agent } from "@frevos/contracts";
it("draws measured CPU/RAM samples and preserves missing/offline gaps", () => {
  const end = Date.now(),
    p = (offset: number, cpuPercent: number | null, memoryTotal = 100, memoryAvailable = 25) => ({
      at: new Date(end + offset).toISOString(),
      cpuPercent,
      memoryTotal,
      memoryAvailable,
    });
  const points = [
    p(-1000000, 10),
    p(-35000, 20),
    p(-30000, 80),
    p(-25000, null),
    p(-20000, 40),
    p(0, 60),
    p(1000, 30),
  ];
  const cpu = healthSegments(points, "cpu", end);
  expect(cpu.map((s) => s.map((p) => p.value))).toEqual([[20, 80], [40], [60]]);
  expect(healthSegments([p(0, 1)], "memory", end)[0]![0]!.value).toBe(75);
  expect(healthSegments([p(0, 1, 0), p(0, 1, 100, 101)], "memory", end)).toEqual([]);
  expect(healthSegments([], "cpu", end)).toEqual([]);
});
it("lays out configured relationships without fixed identities or recursive cycles", () => {
  const agents = [
    { id: "root", parentId: null },
    { id: "child", parentId: "root" },
    { id: "cycle1", parentId: "cycle2" },
    { id: "cycle2", parentId: "cycle1" },
    { id: "orphan", parentId: "missing" },
  ] as Agent[];
  const points = agentPositions(agents);
  expect(points.size).toBe(5);
  expect(points.get("root")).not.toEqual(points.get("child"));
});
