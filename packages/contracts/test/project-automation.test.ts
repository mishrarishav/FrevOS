import { describe, expect, it } from "vitest";
import {
  AgentOperationCompletionSchema,
  ProjectAutomationOperationSchema,
  ProjectAutomationProfileSchema,
  ProjectAutomationRequestSchema,
} from "../src/index.js";

const profile = {
  workspaceId: "ws_uat_demo",
  projectId: "prj_uat_trackgrn",
  repository: {
    provider: "github",
    providerRepositoryId: "1334902237",
    owner: "mishrarishav",
    name: "TraceGRN",
    url: "https://github.com/mishrarishav/TraceGRN",
    defaultBranch: "main",
  },
  agentId: "svc_trackgrn_windows_agent",
  environment: "uat",
  application: {
    publicOrigin: "https://tserver2.eeslindia.org",
    apiBasePath: "/apiTrackGrn",
    healthPath: "/apiTrackGrn/health/live",
    swaggerPath: "/apiTrackGrn/swagger",
  },
  allowedActions: [
    "repository.inspect",
    "repository.propose-commit",
    "repository.commit-push",
    "repository.open-pull-request",
    "repository.squash-merge",
    "project.build",
    "uat.deploy",
  ],
};

describe("project automation contracts", () => {
  it("validates a bound GitHub repository, agent, application path, and UAT environment", () => {
    expect(ProjectAutomationProfileSchema.parse(profile)).toEqual(profile);
    expect(() =>
      ProjectAutomationProfileSchema.parse({
        ...profile,
        repository: { ...profile.repository, url: "https://github.com/another/repository" },
      }),
    ).toThrow();
    expect(() =>
      ProjectAutomationProfileSchema.parse({ ...profile, environment: "production" }),
    ).toThrow();
  });

  it("accepts the bounded FrevOS self-maintenance profile", () => {
    expect(
      ProjectAutomationProfileSchema.parse({
        ...profile,
        projectId: "prj_uat_frevos",
        repository: {
          provider: "github",
          providerRepositoryId: "1329122983",
          owner: "mishrarishav",
          name: "FrevOS",
          url: "https://github.com/mishrarishav/FrevOS",
          defaultBranch: "main",
        },
        agentId: "svc_frevos_windows_agent",
        application: {
          publicOrigin: "https://tserver2.eeslindia.org",
          apiBasePath: "/frevos",
          healthPath: "/frevos/health",
          swaggerPath: "/frevos/",
        },
        allowedActions: [
          "repository.inspect",
          "repository.enable-auto-merge",
          "project.build",
          "uat.release",
        ],
      }),
    ).toMatchObject({ projectId: "prj_uat_frevos", agentId: "svc_frevos_windows_agent" });
  });

  it("allows only versioned business actions and binds commit to reviewed changes", () => {
    expect(
      ProjectAutomationRequestSchema.parse({ action: "repository.inspect", input: {} }),
    ).toEqual({ action: "repository.inspect", input: {} });
    expect(
      ProjectAutomationRequestSchema.parse({
        action: "repository.commit-push",
        input: {
          expectedHeadSha: "a".repeat(40),
          expectedChangeDigest: "b".repeat(64),
          commitMessage: "Update TrackGRN API",
        },
      }),
    ).toMatchObject({ action: "repository.commit-push" });
    expect(
      ProjectAutomationRequestSchema.parse({
        action: "repository.open-pull-request",
        input: {
          expectedHeadSha: "c".repeat(40),
          branch: "frevos/trackgrn-automation01",
          title: "Update TrackGRN API",
        },
      }),
    ).toMatchObject({ action: "repository.open-pull-request" });
    expect(
      ProjectAutomationRequestSchema.parse({
        action: "repository.squash-merge",
        input: {
          pullRequestNumber: 42,
          expectedHeadSha: "c".repeat(40),
          confirmation: "squash-merge",
        },
      }),
    ).toMatchObject({ action: "repository.squash-merge" });
    expect(() =>
      ProjectAutomationRequestSchema.parse({
        action: "repository.squash-merge",
        input: {
          pullRequestNumber: 42,
          expectedHeadSha: "c".repeat(40),
          confirmation: "merge-without-review",
        },
      }),
    ).toThrow();
    expect(
      ProjectAutomationRequestSchema.parse({
        action: "repository.enable-auto-merge",
        input: {
          pullRequestNumber: 43,
          expectedHeadSha: "d".repeat(40),
          confirmation: "enable-auto-merge",
          approvalExpiresAt: "2026-08-23T10:10:00.000Z",
        },
      }),
    ).toMatchObject({ action: "repository.enable-auto-merge" });
    expect(ProjectAutomationRequestSchema.parse({ action: "uat.release", input: {} })).toEqual({
      action: "uat.release",
      input: {},
    });
    expect(() =>
      ProjectAutomationRequestSchema.parse({ action: "shell.run", input: { command: "whoami" } }),
    ).toThrow();
    expect(() =>
      ProjectAutomationRequestSchema.parse({
        action: "repository.commit-push",
        input: {
          expectedHeadSha: "a".repeat(40),
          expectedChangeDigest: "b".repeat(64),
          commitMessage: "first line\nsecond line",
        },
      }),
    ).toThrow();
  });

  it("keeps completion state internally consistent", () => {
    expect(
      AgentOperationCompletionSchema.parse({ status: "succeeded", result: { healthStatus: 200 } }),
    ).toEqual({ status: "succeeded", result: { healthStatus: 200 } });
    expect(() => AgentOperationCompletionSchema.parse({ status: "failed", result: {} })).toThrow();
    expect(() =>
      AgentOperationCompletionSchema.parse({
        status: "succeeded",
        result: {},
        errorCode: "operation-failed",
      }),
    ).toThrow();
  });

  it("requires correlated immutable operation evidence", () => {
    expect(
      ProjectAutomationOperationSchema.parse({
        operationId: "op_automation_01",
        workspaceId: "ws_uat_demo",
        projectId: "prj_uat_trackgrn",
        agentId: "svc_trackgrn_windows_agent",
        requestedBy: "usr_windows_admin",
        action: "repository.inspect",
        status: "queued",
        input: {},
        result: null,
        errorCode: null,
        createdAt: "2026-08-23T10:00:00.000Z",
        claimedAt: null,
        completedAt: null,
      }),
    ).toMatchObject({ operationId: "op_automation_01", status: "queued" });
  });
});
