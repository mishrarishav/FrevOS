import { expect, it } from "vitest";
import {
  ModelConnectionInputSchema,
  AgentInputSchema,
  defaultAgentGuardrails,
  NotificationDraftInputSchema,
  ProjectFolderSearchJobSchema,
} from "../src/index.js";
it("rejects control characters, duplicate capabilities, secret-shaped paths and invalid metadata requests", () => {
  const m = {
    version: 1,
    expectedRevision: 0,
    name: "Provider",
    endpoint: "https://example.com/chat",
    model: "",
    protocol: "chat-completions",
    authentication: "bearer",
    allowWorkspaceSummary: false,
    credential: "replace",
  };
  expect(ModelConnectionInputSchema.safeParse(m).success).toBe(true);
  expect(ModelConnectionInputSchema.safeParse({ ...m, name: "bad\nname" }).success).toBe(false);
  expect(ModelConnectionInputSchema.safeParse({ ...m, model: "bad\x7fmodel" }).success).toBe(false);
  const agent = {
    version: 1,
    expectedRevision: 0,
    name: "Analyst",
    role: "Reviewer",
    parentId: null,
    connectionId: "mc_" + "a".repeat(32),
    skills: "Read facts",
    memory: "Remember verified facts",
    guardrails: defaultAgentGuardrails,
    enabled: true,
  };
  expect(AgentInputSchema.safeParse(agent).success).toBe(true);
  expect(AgentInputSchema.safeParse({ ...agent, memory: "nul\0" }).success).toBe(false);
  expect(
    AgentInputSchema.safeParse({
      ...agent,
      guardrails: { ...defaultAgentGuardrails, sources: ["manual", "manual"] },
    }).success,
  ).toBe(false);
  const n = {
    version: 1,
    runId: "ar_" + "b".repeat(32),
    deviceId: "fc_" + "c".repeat(32),
    title: "Review",
    message: "Please review the plan",
  };
  expect(NotificationDraftInputSchema.safeParse(n).success).toBe(true);
  expect(NotificationDraftInputSchema.safeParse({ ...n, message: "\x01" }).success).toBe(false);
  const j = {
    version: 1,
    id: "fd_" + "d".repeat(32),
    actor: "usr_fixture",
    workspaceId: "ws_server20",
    request: { version: 1, projectId: "prj_fixture", deviceId: n.deviceId },
    query: "Fixture",
    roots: ["D:\\"],
    createdAt: "2026-10-26T00:00:00Z",
    expiresAt: "2026-10-26T00:02:00Z",
    status: "succeeded",
    result: {
      matches: [{ root: "D:\\", path: "Fixture/src" }],
      scannedDirectories: 10,
      partial: false,
      gaps: [],
    },
  };
  expect(ProjectFolderSearchJobSchema.safeParse(j).success).toBe(true);
  expect(
    ProjectFolderSearchJobSchema.safeParse({
      ...j,
      result: { ...j.result, matches: [{ root: "D:\\", path: "../secret" }] },
    }).success,
  ).toBe(false);
});
