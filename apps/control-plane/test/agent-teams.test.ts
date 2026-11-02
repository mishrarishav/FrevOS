import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import {
  AgentSchema,
  ModelConnectionSchema,
  defaultAgentGuardrails,
  type Agent,
} from "@frevos/contracts";
import { AgentWorkspace } from "../src/agent-workspace.js";
import type { PaperclipTasks } from "../src/paperclip-bridge.js";
import { ModelGatewayError, type ModelPrompt } from "../src/model-gateway.js";
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const f of cleanup.splice(0).reverse()) await f();
});
async function fixture(backend?: PaperclipTasks) {
  const root = await mkdtemp(join(tmpdir(), "devsetu-team-"));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  let allowed = true,
    wait: Promise<void> | undefined,
    fail = false;
  const calls: ModelPrompt[] = [],
    at = new Date().toISOString();
  const connection = ModelConnectionSchema.parse({
    version: 1,
    id: "mc_" + "a".repeat(32),
    workspaceId: "ws_fixture",
    actor: "usr_alice",
    revision: 1,
    updatedAt: at,
    status: "active",
    name: "Synthetic model",
    endpoint: "https://models.example/chat",
    protocol: "chat-completions",
    model: "fixture",
    authentication: "bearer",
    allowWorkspaceSummary: true,
    secretReference: "model-key/" + "c".repeat(32),
  });
  const agents = ["Evidence reviewer", "Coordinator"].map((name) =>
    AgentSchema.parse({
      version: 1,
      id: "ag_" + randomBytes(16).toString("hex"),
      workspaceId: "ws_fixture",
      actor: "usr_alice",
      revision: 1,
      name,
      role: name,
      parentId: null,
      connectionId: connection.id,
      skills: "Disclose missing evidence.",
      memory: "Synthetic memory",
      guardrails: defaultAgentGuardrails,
      enabled: true,
      updatedAt: at,
    }),
  );
  const saveAgent = (agent: Agent) =>
    writeFile(join(root, agent.id + ".json"), JSON.stringify(agent));
  await writeFile(join(root, connection.id + ".json"), JSON.stringify(connection));
  await writeFile(
    join(root, connection.id + ".test.json"),
    JSON.stringify({
      connectionId: connection.id,
      connectionRevision: 1,
      at,
      status: "ready",
      model: "fixture",
      latencyMs: 1,
    }),
  );
  await Promise.all(agents.map(saveAgent));
  const create = () =>
    new AgentWorkspace(
      root,
      "ws_fixture",
      async (_w, a) => allowed && ["usr_alice", "usr_bob"].includes(a),
      {
        create: async () => {
          throw Error("unused");
        },
        read: async () => "SYNTHETIC_MODEL_CREDENTIAL",
      },
      async () => ({ systems: [], reports: [] }),
      {
        validateEndpoint: async () => {},
        complete: async (_c, _k, p) => {
          calls.push(p);
          await wait;
          if (fail) throw new ModelGatewayError("model-timeout");
          return {
            text: `Synthetic step ${calls.length}: evidence missing; no inferred completion.`,
            model: "fixture",
          };
        },
      },
      undefined,
      () => backend,
    );
  const store = create();
  const input = {
    version: 1 as const,
    requestId: randomBytes(16).toString("hex"),
    coordinatorId: agents[1]!.id,
    specialistIds: [agents[0]!.id],
    prompt: "Review the synthetic delivery plan",
    shareWithPaperclip: false,
  };
  return {
    root,
    store,
    input,
    agents,
    connection,
    saveAgent,
    create,
    calls,
    pause: (p?: Promise<void>) => {
      wait = p;
    },
    deny: () => {
      allowed = false;
    },
    fail: () => {
      fail = true;
    },
  };
}
it("runs actual specialists then coordinator, preserves evidence/history and isolates actors", async () => {
  const f = await fixture();
  const task = await f.store.requestTeam("usr_alice", f.input);
  expect(task.status).toBe("running");
  await f.store.waitForTeams();
  const state = await f.store.teamState("usr_alice");
  expect(state.paperclip).toBe("not-enrolled");
  expect(state.tasks[0]).toMatchObject({ status: "succeeded", usage: "unavailable" });
  expect(state.tasks[0]!.steps.map((s) => s.run!.status)).toEqual(["succeeded", "succeeded"]);
  expect(f.calls[1]!.input).toContain("Synthetic step 1");
  expect(f.calls.every((c) => c.instruction.includes("No shell"))).toBe(true);
  expect((await f.store.teamState("usr_bob")).tasks).toEqual([]);
  await expect(f.store.requestTeam("usr_bob", f.input)).rejects.toThrow("agent-not-found");
  for (const file of await readdir(f.root))
    if (file.endsWith(".json"))
      expect(await readFile(join(f.root, file), "utf8")).not.toContain(
        "SYNTHETIC_MODEL_CREDENTIAL",
      );
  f.deny();
  await expect(f.store.teamState("usr_alice")).rejects.toThrow("agent-access-denied");
});
it("rejects unready, disabled, duplicate, out-of-scope and excessive teams before inference", async () => {
  const f = await fixture();
  for (const input of [
    { ...f.input, specialistIds: [f.input.coordinatorId] },
    { ...f.input, specialistIds: Array(5).fill(f.agents[0]!.id) },
    { ...f.input, projectId: "prj_missing" },
    { ...f.input, shareWithPaperclip: true },
    { ...f.input, command: "deploy" },
  ])
    await expect(f.store.requestTeam("usr_alice", input)).rejects.toThrow();
  await f.saveAgent({ ...f.agents[0]!, enabled: false });
  await expect(f.store.requestTeam("usr_alice", f.input)).rejects.toThrow("agent-model-not-ready");
  await f.saveAgent(f.agents[0]!);
  await writeFile(
    join(f.root, f.connection.id + ".test.json"),
    JSON.stringify({
      connectionId: f.connection.id,
      connectionRevision: 1,
      at: new Date().toISOString(),
      status: "timeout",
      model: "",
      latencyMs: 10,
    }),
  );
  await expect(f.store.requestTeam("usr_alice", f.input)).rejects.toThrow("agent-model-not-ready");
  expect(f.calls).toHaveLength(0);
});
it("enforces source-policy intersection and explicit external-data opt-in", async () => {
  const backend: PaperclipTasks = {
    allowWorkspaceSummary: false,
    check: async () => {},
    create: async () => "a",
    finish: async () => {},
  };
  const f = await fixture(backend);
  const analyst = {
    ...f.agents[0]!,
    guardrails: { ...defaultAgentGuardrails, sources: ["discovery" as const] },
  };
  await f.saveAgent(analyst);
  await expect(f.store.requestTeam("usr_alice", f.input)).rejects.toThrow(
    "agent-team-source-policy-denied",
  );
  await f.saveAgent({ ...f.agents[1]!, guardrails: analyst.guardrails });
  await expect(
    f.store.requestTeam("usr_alice", { ...f.input, shareWithPaperclip: true }),
  ).rejects.toThrow("paperclip-data-policy-denied");
  await writeFile(
    join(f.root, f.connection.id + ".json"),
    JSON.stringify({ ...f.connection, allowWorkspaceSummary: false }),
  );
  await expect(f.store.requestTeam("usr_alice", f.input)).rejects.toThrow(
    "agent-model-data-policy-denied",
  );
});
it("bounds concurrency and never replays interrupted inference after restart", async () => {
  const f = await fixture();
  let release!: () => void;
  f.pause(
    new Promise((r) => {
      release = r;
    }),
  );
  const task = await f.store.requestTeam("usr_alice", f.input);
  expect((await f.store.requestTeam("usr_alice", f.input)).id).toBe(task.id);
  await expect(f.store.requestTeam("usr_alice", { ...f.input, prompt: "Changed" })).rejects.toThrow(
    "agent-team-request-conflict",
  );
  await expect(
    f.store.requestTeam("usr_alice", { ...f.input, requestId: "f".repeat(32) }),
  ).rejects.toThrow("agent-team-busy");
  expect((await f.create().teamState("usr_alice")).tasks[0]).toMatchObject({
    id: task.id,
    status: "interrupted",
    output: "",
  });
  expect(await f.create().requestTeam("usr_alice", f.input)).toMatchObject({
    id: task.id,
    status: "interrupted",
  });
  release();
  await f.store.waitForTeams();
  expect((await f.store.teamState("usr_alice")).tasks[0]!.status).toBe("succeeded");
  expect(f.calls).toHaveLength(2);
});
it("stops on model failure without coordinator synthesis", async () => {
  const f = await fixture();
  f.fail();
  await f.store.requestTeam("usr_alice", f.input);
  await f.store.waitForTeams();
  expect((await f.store.teamState("usr_alice")).tasks[0]).toMatchObject({
    status: "failed",
    errorCode: "agent-step-failed",
    output: "",
  });
  expect(f.calls).toHaveLength(1);
});
it("invalidates a team when model or agent guardrails change during inference", async () => {
  for (const change of ["agent", "model"]) {
    const f = await fixture();
    let release!: () => void;
    f.pause(
      new Promise((r) => {
        release = r;
      }),
    );
    await f.store.requestTeam("usr_alice", f.input);
    while (!f.calls.length) await new Promise((r) => setTimeout(r, 2));
    if (change === "agent") await f.saveAgent({ ...f.agents[1]!, revision: 2 });
    else
      await writeFile(
        join(f.root, f.connection.id + ".json"),
        JSON.stringify({ ...f.connection, revision: 2 }),
      );
    release();
    await f.store.waitForTeams();
    expect((await f.store.teamState("usr_alice")).tasks[0]!.status).toBe("failed");
    expect(f.calls).toHaveLength(1);
  }
});
it("mirrors only opted-in tasks with durable external intents and no retry after ambiguous writes", async () => {
  const calls: string[] = [],
    issueIds = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
    ];
  let failed = false;
  const backend: PaperclipTasks = {
    allowWorkspaceSummary: true,
    check: async () => {},
    create: async (_title, description, parent) => {
      calls.push(parent ? "child" : "parent");
      expect(description).not.toContain("Synthetic memory");
      if (failed) throw Error("write outcome unknown");
      return issueIds[calls.filter((c) => ["parent", "child"].includes(c)).length - 1]!;
    },
    finish: async () => {
      calls.push("done");
    },
  };
  const f = await fixture(backend);
  await f.store.requestTeam("usr_alice", { ...f.input, shareWithPaperclip: true });
  await f.store.waitForTeams();
  expect(calls).toEqual(["parent", "child", "done", "child", "done", "done"]);
  expect((await f.store.teamState("usr_alice")).tasks[0]).toMatchObject({
    status: "succeeded",
    paperclipIssueId: issueIds[0],
  });
  const audit = await Promise.all(
    (await readdir(f.root))
      .filter((n) => n.startsWith("audit_"))
      .map(async (n) => JSON.parse(await readFile(join(f.root, n), "utf8"))),
  );
  expect(audit.filter((a) => a.action === "paperclip:intent")).toHaveLength(6);
  failed = true;
  await f.store.requestTeam("usr_alice", {
    ...f.input,
    requestId: "f".repeat(32),
    shareWithPaperclip: true,
  });
  await f.store.waitForTeams();
  expect((await f.store.teamState("usr_alice")).tasks[0]).toMatchObject({
    status: "failed",
    errorCode: "paperclip-unavailable",
  });
  expect(calls).toHaveLength(7);
});
it("fails closed on corrupt or non-file task storage", async () => {
  const f = await fixture();
  await writeFile(join(f.root, "at_" + "f".repeat(32) + ".json"), "{}");
  await expect(f.store.teamState("usr_alice")).rejects.toThrow();
  await rm(join(f.root, "at_" + "f".repeat(32) + ".json"));
  await mkdir(join(f.root, "at_" + "f".repeat(32) + ".json"));
  await expect(f.store.teamState("usr_alice")).rejects.toThrow("agent-storage-unavailable");
});
