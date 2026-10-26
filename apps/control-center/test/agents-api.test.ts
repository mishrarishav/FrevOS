import { expect, it } from "vitest";
import { createControlCenterApi } from "../src/api.js";
import { defaultAgentGuardrails } from "@frevos/contracts";
it("uses verified workspace routes, CSRF and strict contracts for models, agents, analysis and notification approval", async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = [],
    at = "2026-10-26T00:00:00Z",
    mc = "mc_" + "a".repeat(32),
    ag = "ag_" + "b".repeat(32),
    ar = "ar_" + "c".repeat(32),
    nt = "nt_" + "d".repeat(32);
  const model = {
    version: 1 as const,
    expectedRevision: 0,
    name: "Fixture",
    endpoint: "https://model.example/chat",
    model: "",
    protocol: "chat-completions" as const,
    authentication: "bearer" as const,
    allowWorkspaceSummary: false,
    credential: "replace" as const,
  };
  const connection = {
    version: 1,
    id: mc,
    name: model.name,
    endpoint: model.endpoint,
    model: "",
    protocol: model.protocol,
    authentication: model.authentication,
    allowWorkspaceSummary: false,
    workspaceId: "ws_fixture",
    actor: "usr_fixture",
    revision: 1,
    secretReference: "model-key/" + "e".repeat(32),
    updatedAt: at,
    status: "active",
  };
  const proposal = {
    version: 1,
    id: "mp_" + "f".repeat(32),
    actor: "usr_fixture",
    workspaceId: "ws_fixture",
    target: mc,
    digest: "a".repeat(64),
    expiresAt: at,
    keyId: "b".repeat(64),
    publicKey: "c".repeat(64),
    input: model,
  };
  const input = {
    version: 1 as const,
    expectedRevision: 0,
    name: "Reviewer",
    role: "Analyst",
    parentId: null,
    connectionId: mc,
    skills: "Read facts",
    memory: "",
    guardrails: defaultAgentGuardrails,
    enabled: true,
  };
  const agent = {
    ...input,
    id: ag,
    workspaceId: "ws_fixture",
    actor: "usr_fixture",
    revision: 1,
    updatedAt: at,
  };
  delete (agent as Partial<typeof input>).expectedRevision;
  const run = {
    version: 1,
    id: ar,
    workspaceId: "ws_fixture",
    actor: "usr_fixture",
    agentId: ag,
    agentRevision: 1,
    connectionId: mc,
    createdAt: at,
    status: "running",
    prompt: "Status",
    output: "",
    evidence: [],
    facts: [],
  };
  const draft = {
    version: 1 as const,
    runId: ar,
    deviceId: "fc_" + "1".repeat(32),
    title: "Update",
    message: "Review milestones",
  };
  const notice = {
    ...draft,
    id: nt,
    workspaceId: "ws_fixture",
    actor: "usr_fixture",
    revision: 1,
    createdAt: at,
    expiresAt: at,
    digest: "d".repeat(64),
    status: "draft",
  };
  const api = createControlCenterApi(
    async (url, init) => {
      calls.push({ url: String(url), init });
      const path = String(url);
      let body: unknown = path.endsWith("/notifications")
        ? { version: 1, recipients: [], records: [] }
        : path.endsWith("/draft") || path.endsWith("/approve")
          ? notice
          : path.endsWith("/prepare")
            ? proposal
            : path.endsWith("/commit")
              ? connection
              : path.endsWith("/test")
                ? {
                    connectionId: mc,
                    connectionRevision: 1,
                    at,
                    status: "ready",
                    latencyMs: 1,
                    model: "fixture",
                  }
                : path.endsWith("/configuration")
                  ? agent
                  : path.endsWith("/runs")
                    ? run
                    : {
                        version: 1,
                        workspaceId: "ws_fixture",
                        connections: [connection],
                        agents: [agent],
                        runs: [run],
                        tests: [],
                      };
      return new Response(JSON.stringify(body), {
        headers: { "content-type": "application/json" },
      });
    },
    "/frevos",
    () => "fixture-csrf",
  );
  expect((await api.agentState!("ws_fixture")).agents).toHaveLength(1);
  expect(await api.agentNotifications!("ws_fixture")).toMatchObject({ records: [] });
  expect(await api.prepareModel!("ws_fixture", model)).toMatchObject({ target: mc });
  await api.commitModel!("ws_fixture", {
    version: 1,
    proposalId: proposal.id,
    digest: proposal.digest,
    approve: true,
  });
  await api.testModel!("ws_fixture", mc);
  await api.saveAgent!("ws_fixture", input);
  await api.runAgent!("ws_fixture", { version: 1, agentId: ag, prompt: "Status" });
  await api.draftNotification!("ws_fixture", draft);
  await api.approveNotification!("ws_fixture", {
    version: 1,
    id: nt,
    expectedRevision: 1,
    digest: notice.digest,
    approve: true,
  });
  expect(calls).toHaveLength(9);
  expect(calls.every((c) => c.url.startsWith("/frevos/v1/workspaces/ws_fixture/agents"))).toBe(
    true,
  );
  for (const c of calls.slice(2)) {
    expect(c.init).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      headers: { "x-csrf-token": "fixture-csrf" },
    });
    expect(() => JSON.parse(String(c.init?.body))).not.toThrow();
  }
  expect(JSON.parse(String(calls.at(-1)!.init!.body))).toMatchObject({
    digest: notice.digest,
    expectedRevision: 1,
    approve: true,
  });
});
