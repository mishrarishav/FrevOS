import { expect, it } from "vitest";
import {
  ConnectorProbeSchema,
  DeliveryPlanInputSchema,
  DeliveryPlanSchema,
  DeploymentSettingsInputSchema,
  DiscoveryPolicyInputSchema,
  defaultDiscoveryPolicy,
  deliveryReport,
} from "../src/index.js";

const plan = {
  version: 1,
  workspaceId: "ws_server20",
  projectId: "prj_client_app",
  expectedRevision: 0,
  revision: 1,
  actor: "usr_owner",
  updatedAt: "2026-10-24T10:00:00.000Z",
  poReference: "PO-42",
  poDate: "2026-10-14",
  timeZone: "Asia/Kolkata",
  responsible: "Fixture developer",
  deviceIds: [],
  milestones: [
    {
      id: "api",
      title: "Accepted API",
      weight: 30,
      dueDate: "2026-10-20",
      acceptance: "accepted",
      evidence: "QA-42",
    },
    {
      id: "ui",
      title: "Pending UI",
      weight: 70,
      dueDate: "2026-10-23",
      acceptance: "pending",
      evidence: "",
    },
  ],
};
it("calculates delivery only from accepted weights, explicit evidence and local deadline dates", () => {
  const parsed = DeliveryPlanSchema.parse(plan);
  expect(deliveryReport(parsed, "2026-10-24T10:00:00.000Z")).toEqual({
    completedPercent: 30,
    plannedPercent: 100,
    status: "behind-plan",
    overdue: ["Pending UI"],
  });
  expect(deliveryReport(parsed, "2026-10-15T10:00:00.000Z")).toMatchObject({
    status: "ahead-of-plan",
    plannedPercent: 0,
  });
  expect(deliveryReport(null, "2026-10-24T10:00:00.000Z")).toMatchObject({
    completedPercent: null,
    status: "plan-missing",
  });
  expect(
    deliveryReport(
      DeliveryPlanSchema.parse({
        ...plan,
        milestones: plan.milestones.map((m) => ({
          ...m,
          acceptance: "accepted",
          evidence: "QA-accepted",
        })),
      }),
      "2026-10-24T10:00:00.000Z",
    ).status,
  ).toBe("complete");
  const pending = DeliveryPlanSchema.parse({
    ...plan,
    milestones: [{ ...plan.milestones[1], dueDate: "2026-10-24" }],
  });
  expect(deliveryReport(pending, "2026-10-24T17:00:00.000Z").status).toBe("on-plan");
  expect(deliveryReport(pending, "2026-10-24T20:00:00.000Z").status).toBe("behind-plan");
});
it("rejects ambiguous plans, unsupported timezones, traversal and unrestricted installation policy", () => {
  const { workspaceId: _, revision: __, actor: ___, updatedAt: ____, ...input } = plan;
  expect(DeliveryPlanInputSchema.safeParse({ ...input, timeZone: "bad-zone" }).success).toBe(false);
  expect(
    DeliveryPlanInputSchema.safeParse({
      ...input,
      milestones: [{ ...plan.milestones[0], evidence: "" }],
    }).success,
  ).toBe(false);
  expect(
    DeliveryPlanInputSchema.safeParse({
      ...input,
      milestones: [plan.milestones[0], plan.milestones[0]],
    }).success,
  ).toBe(false);
  expect(DeliveryPlanInputSchema.safeParse({ ...input, poDate: "2026-10-25" }).success).toBe(false);
  const policy = {
    version: 1,
    deviceId: "fc_" + "a".repeat(32),
    expectedRevision: 0,
    policy: defaultDiscoveryPolicy,
  };
  expect(DiscoveryPolicyInputSchema.parse(policy).policy.useExistingAudit).toBe(true);
  for (const folder of ["../other", "/etc", "C:\\Users", ".ssh", "src/../../etc"])
    expect(
      DiscoveryPolicyInputSchema.safeParse({
        ...policy,
        policy: { ...defaultDiscoveryPolicy, contentFolders: [folder] },
      }).success,
    ).toBe(false);
  expect(
    DiscoveryPolicyInputSchema.safeParse({
      ...policy,
      policy: { ...defaultDiscoveryPolicy, command: "install anything" },
    }).success,
  ).toBe(false);
});
it("accepts POSIX source paths without widening Windows destination bindings", () => {
  const probe = {
    version: 1,
    profileId: "fixture-source",
    repository: "/home/dev/project",
    origin: "https://example.com/code/repo.git",
    head: "a".repeat(40),
    branch: "feature/check",
    checkedAt: "2026-10-24T10:00:00.000Z",
  };
  expect(ConnectorProbeSchema.parse(probe).repository).toBe("/home/dev/project");
  expect(
    ConnectorProbeSchema.safeParse({ ...probe, repository: "/home/dev/../other" }).success,
  ).toBe(false);
  expect(
    DeploymentSettingsInputSchema.safeParse({
      version: 1,
      profileId: "fixture-source",
      expectedRevision: 0,
      displayName: "Fixture",
      repositoryOrigin: probe.origin,
      sourceFolder: probe.repository,
      destination: {
        host: "host",
        root: "/home/dev/target",
        siteUrl: "http://host/",
        credentialProfile: "not-connected",
      },
      preservedPaths: [],
      runner: "unconfigured",
    }).success,
  ).toBe(false);
});
