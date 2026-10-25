import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  randomBytes,
  generateKeyPairSync,
  createPublicKey,
  diffieHellman,
  hkdfSync,
  createCipheriv,
} from "node:crypto";
import { afterEach, expect, it } from "vitest";
import {
  defaultAgentGuardrails,
  AgentRunSchema,
  type ModelConnection,
  type ModelProposal,
  type AgentInput,
  type ModelCommitInput,
  modelSecretContext,
  DiscoveryStateSchema,
  type DiscoveryState,
  type ProjectFolderSearchJob,
  ProjectFolderSearchJobSchema,
  DeliveryPlanSchema,
} from "@frevos/contracts";
import { AgentWorkspace } from "../src/agent-workspace.js";
import { ModelGatewayError, type ModelGateway, type ModelPrompt } from "../src/model-gateway.js";
import type { ModelSecretBoundary, ModelSecretScope } from "../src/model-secrets.js";
function sealModelCredential(p: ModelProposal, value: string): ModelCommitInput {
  const base: ModelCommitInput = { version: 1, proposalId: p.id, digest: p.digest, approve: true };
  if (p.input.credential === "keep") return base;
  const pair = generateKeyPairSync("x25519"),
    publicKey = createPublicKey({
      key: Buffer.concat([
        Buffer.from("302a300506032b656e032100", "hex"),
        Buffer.from(p.publicKey, "hex"),
      ]),
      format: "der",
      type: "spki",
    });
  const shared = diffieHellman({ privateKey: pair.privateKey, publicKey }),
    aad = Buffer.from(modelSecretContext(p)),
    key = Buffer.from(hkdfSync("sha256", shared, Buffer.from(p.keyId, "hex"), aad, 32)),
    iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify({ apiKey: value })),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return {
    ...base,
    sealed: {
      keyId: p.keyId,
      publicKey: (pair.publicKey.export({ format: "der", type: "spki" }) as Buffer)
        .subarray(-32)
        .toString("hex"),
      iv: iv.toString("hex"),
      ciphertext: ciphertext.toString("hex"),
    },
  };
}
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const f of cleanup.splice(0).reverse()) await f();
});
async function fixture(workspaceId = "ws_fixture") {
  const root = await mkdtemp(join(tmpdir(), "devsetu-agents-"));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  let now = Date.parse("2026-10-26T00:00:00.000Z"),
    failure: ModelGatewayError | undefined,
    pause: Promise<void> | undefined;
  const allowed = new Set(["usr_alice", "usr_bob"]),
    keys = new Map<string, { scope: ModelSecretScope; value: string }>(),
    calls: ModelPrompt[] = [];
  const secrets: ModelSecretBoundary = {
    create: async (scope, value) => {
      const ref = "model-key/" + randomBytes(16).toString("hex");
      keys.set(ref, { scope, value });
      return ref;
    },
    read: async (ref, scope) => {
      const k = keys.get(ref);
      if (!k || JSON.stringify(k.scope) !== JSON.stringify(scope)) throw Error("scope denied");
      return k.value;
    },
  };
  const gateway: ModelGateway = {
    validateEndpoint: async (endpoint) => {
      if (!endpoint.startsWith("https://models.example/"))
        throw new ModelGatewayError("endpoint-denied");
    },
    complete: async (_c, _key, p) => {
      calls.push(p);
      await pause;
      if (failure) throw failure;
      return { text: "Read-only suggestion: review the accepted plan.", model: "fixture-model" };
    },
  };
  let state: DiscoveryState & { folderEvidence?: ProjectFolderSearchJob[] } = {
    systems: [],
    reports: [
      {
        projectId: "prj_fixture" as never,
        projectName: "Fixture delivery",
        clientName: null,
        plan: null,
        completedPercent: 30,
        plannedPercent: 60,
        status: "behind-plan",
        overdue: [],
        asOf: new Date(now).toISOString(),
      },
    ],
  };
  const store = new AgentWorkspace(
    join(root, workspaceId),
    workspaceId,
    async (ws, a) => ws === workspaceId && allowed.has(a),
    secrets,
    async () => state,
    gateway,
    () => new Date(now),
  );
  const input = {
    version: 1 as const,
    expectedRevision: 0,
    name: "Fixture model",
    endpoint: "https://models.example/chat",
    model: "",
    protocol: "chat-completions" as const,
    authentication: "bearer" as const,
    allowWorkspaceSummary: true,
    credential: "replace" as const,
  };
  const connect = async () => {
    const p = await store.prepareModel("usr_alice", input);
    return store.commitModel("usr_alice", sealModelCredential(p, "SYNTHETIC_MODEL_CREDENTIAL"));
  };
  const agent = (connection: ModelConnection): AgentInput => ({
    version: 1,
    expectedRevision: 0,
    name: "Discovery analyst",
    role: "Project evidence reviewer",
    parentId: null,
    connectionId: connection.id,
    skills: "Use only verified facts.",
    memory: "Source: approved plan.",
    guardrails: { ...defaultAgentGuardrails, sources: ["manual", "delivery-plans"] },
    enabled: true,
  });
  return {
    root,
    store,
    input,
    allowed,
    keys,
    calls,
    connect,
    agent,
    advance: (ms: number) => (now += ms),
    setFailure: (e?: ModelGatewayError) => (failure = e),
    setDiscovery: (next: typeof state) => (state = next),
    discovery: () => state,
    pause: (p?: Promise<void>) => (pause = p),
  };
}
it("requires scoped single-use approval and interoperable browser sealing without persisting the credential", async () => {
  const f = await fixture();
  await expect(f.store.prepareModel("usr_outside", f.input)).rejects.toThrow("agent-access-denied");
  await expect(
    f.store.prepareModel("usr_alice", { ...f.input, endpoint: "https://127.0.0.1/private" }),
  ).rejects.toThrow("agent-model-endpoint-denied");
  const p = await f.store.prepareModel("usr_alice", f.input),
    sealed = sealModelCredential(p, "SYNTHETIC_MODEL_CREDENTIAL");
  expect(JSON.stringify(sealed)).not.toContain("SYNTHETIC_MODEL_CREDENTIAL");
  await expect(f.store.commitModel("usr_bob", sealed)).rejects.toThrow("agent-proposal-expired");
  await expect(
    f.store.commitModel("usr_alice", { ...sealed, digest: "a".repeat(64) }),
  ).rejects.toThrow();
  const forged = { ...p, workspaceId: "ws_other" } as ModelProposal;
  await expect(
    f.store.commitModel("usr_alice", sealModelCredential(forged, "SYNTHETIC_MODEL_CREDENTIAL")),
  ).rejects.toThrow("agent-secret-envelope-denied");
  const c = await f.store.commitModel("usr_alice", sealed);
  expect(c.secretReference).toMatch(/^model-key\/[a-f0-9]{32}$/);
  await expect(f.store.commitModel("usr_alice", sealed)).rejects.toThrow();
  expect((await f.store.state("usr_bob")).connections).toEqual([]);
  for (const file of await readdir(join(f.root, "ws_fixture")))
    if (file.endsWith(".json"))
      expect(await readFile(join(f.root, "ws_fixture", file), "utf8")).not.toContain(
        "SYNTHETIC_MODEL_CREDENTIAL",
      );
  const expired = await f.store.prepareModel("usr_alice", { ...f.input, name: "Expiring" });
  f.advance(300001);
  await expect(
    f.store.commitModel("usr_alice", sealModelCredential(expired, "SYNTHETIC_MODEL_CREDENTIAL")),
  ).rejects.toThrow();
});
it("preserves connection revisions, requires a new credential for a new destination and retests updated configuration", async () => {
  const f = await fixture(),
    c = await f.connect();
  await expect(
    f.store.prepareModel("usr_bob", { ...f.input, id: c.id, expectedRevision: c.revision }),
  ).rejects.toThrow("agent-model-not-found");
  await expect(
    f.store.prepareModel("usr_alice", { ...f.input, id: c.id, expectedRevision: 0 }),
  ).rejects.toThrow("agent-revision-changed");
  await expect(
    f.store.prepareModel("usr_alice", {
      ...f.input,
      id: c.id,
      expectedRevision: 1,
      endpoint: "https://models.example/other",
      credential: "keep",
    }),
  ).rejects.toThrow("agent-credential-reapproval-required");
  await f.store.testModel("usr_alice", c.id);
  const p = await f.store.prepareModel("usr_alice", {
    ...f.input,
    id: c.id,
    expectedRevision: 1,
    name: "Renamed",
    credential: "keep",
  });
  await expect(
    f.store.commitModel("usr_alice", {
      ...sealModelCredential(p, "unused"),
      sealed: {
        keyId: p.keyId,
        publicKey: p.publicKey,
        iv: "a".repeat(24),
        ciphertext: "a".repeat(34),
      },
    }),
  ).rejects.toThrow("agent-secret-envelope-denied");
  const next = await f.store.commitModel("usr_alice", sealModelCredential(p, ""));
  expect(next.revision).toBe(2);
  expect(next.secretReference).toBe(c.secretReference);
  const agent = await f.store.saveAgent("usr_alice", f.agent(next));
  await expect(
    f.store.requestRun("usr_alice", { version: 1, agentId: agent.id, prompt: "Status" }),
  ).rejects.toThrow("agent-model-not-ready");
  await f.store.testModel("usr_alice", c.id);
  f.advance(600001);
  const later = await f.store.requestRun("usr_alice", {
    version: 1,
    agentId: agent.id,
    prompt: "Status",
  });
  await f.store.waitForRuns();
  expect((await f.store.state("usr_alice")).runs.find((r) => r.id === later.id)?.status).toBe(
    "succeeded",
  );
});
it("uses per-agent versioned skills/memory and deterministic plan facts while enforcing ownership, parent cycles and data policy", async () => {
  const f = await fixture(),
    c = await f.connect();
  await f.store.testModel("usr_alice", c.id);
  const input = f.agent(c),
    root = await f.store.saveAgent("usr_alice", {
      ...input,
      memory: 'Verified fact.\npassword = "SYNTHETIC_SECRET";',
    });
  expect(root.memory).not.toContain("SYNTHETIC_SECRET");
  expect(await readFile(join(f.root, "ws_fixture", root.id, "memory.md"), "utf8")).toBe(
    root.memory,
  );
  const child = await f.store.saveAgent("usr_alice", {
    ...input,
    name: "Delivery reviewer",
    parentId: root.id,
  });
  await expect(
    f.store.saveAgent("usr_alice", {
      ...input,
      id: root.id,
      expectedRevision: 1,
      parentId: child.id,
    }),
  ).rejects.toThrow("agent-parent-cycle");
  await expect(
    f.store.saveAgent("usr_alice", { ...input, parentId: "ag_" + "f".repeat(32) }),
  ).rejects.toThrow("agent-parent-not-found");
  await expect(
    f.store.saveAgent("usr_bob", { ...input, id: root.id, expectedRevision: 1 }),
  ).rejects.toThrow("agent-not-found");
  await expect(
    f.store.saveAgent("usr_alice", { ...input, id: root.id, expectedRevision: 0 }),
  ).rejects.toThrow("agent-revision-changed");
  const requested = await f.store.requestRun("usr_alice", {
    version: 1,
    agentId: root.id,
    projectId: "prj_fixture",
    prompt: "How far along is this project?",
  });
  await f.store.waitForRuns();
  const run = (await f.store.state("usr_alice")).runs.find((r) => r.id === requested.id)!;
  expect(run.status).toBe("succeeded");
  expect(run.facts[0]).toMatchObject({
    completedPercent: 30,
    plannedPercent: 60,
    status: "behind-plan",
  });
  expect(run.output).toContain("Read-only suggestion");
  expect(JSON.stringify(f.calls)).not.toContain("SYNTHETIC_MODEL_CREDENTIAL");
  expect(f.calls.at(-1)!.instruction).toContain("No shell");
  expect((await f.store.state("usr_bob")).runs).toEqual([]);
  expect((await f.store.notificationSource("usr_alice", run.id)).allowed).toBe(false);
  await expect(f.store.notificationSource("usr_bob", run.id)).rejects.toThrow();
  await expect(f.store.notificationSource("usr_alice", "bad")).rejects.toThrow();
});
it("reports unavailable providers without invented output and denies disabled or unauthorized analysis", async () => {
  const f = await fixture(),
    c = await f.connect();
  f.setFailure(new ModelGatewayError("model-authentication-failed"));
  expect((await f.store.testModel("usr_alice", c.id)).status).toBe("authentication-failed");
  f.setFailure(new ModelGatewayError("model-timeout"));
  expect((await f.store.testModel("usr_alice", c.id)).status).toBe("timeout");
  f.setFailure(new ModelGatewayError("model-invalid-response"));
  expect((await f.store.testModel("usr_alice", c.id)).status).toBe("invalid-response");
  f.setFailure(new ModelGatewayError("endpoint-denied"));
  expect((await f.store.testModel("usr_alice", c.id)).status).toBe("endpoint-denied");
  f.setFailure();
  await f.store.testModel("usr_alice", c.id);
  const a = await f.store.saveAgent("usr_alice", f.agent(c));
  f.setFailure(new ModelGatewayError("model-unavailable"));
  const run = await f.store.requestRun("usr_alice", {
    version: 1,
    agentId: a.id,
    prompt: "Status",
  });
  await f.store.waitForRuns();
  expect((await f.store.state("usr_alice")).runs.find((r) => r.id === run.id)).toMatchObject({
    status: "failed",
    output: "",
    errorCode: "model-unavailable",
  });
  const disabled = await f.store.saveAgent("usr_alice", {
    ...f.agent(c),
    id: a.id,
    expectedRevision: 1,
    enabled: false,
  });
  await expect(
    f.store.requestRun("usr_alice", { version: 1, agentId: disabled.id, prompt: "Status" }),
  ).rejects.toThrow("agent-run-not-ready");
  f.allowed.delete("usr_alice");
  await expect(f.store.state("usr_alice")).rejects.toThrow();
});
it("finds unique named project candidates, filters unrelated activity, discloses partial searches and handles ambiguity/missing plans", async () => {
  const f = await fixture("ws_server20"),
    connection = await f.connect();
  await f.store.testModel("usr_alice", connection.id);
  const at = "2026-10-26T00:00:00.000Z",
    deviceId = "fc_" + "1".repeat(32),
    otherId = "fc_" + "2".repeat(32);
  const system = {
    deviceId,
    name: "Fixture laptop",
    userId: "usr_alice",
    profileId: null,
    status: "active",
    source: null,
    sourceFresh: false,
    online: true,
    observedAt: at,
    policy: null,
    observation: null,
    history: [
      {
        sequence: 1,
        at,
        root: "D:\\",
        path: "Fixture/app.ts",
        kind: "modified",
        source: "filesystem-notification",
        attribution: "unavailable",
        bootId: "11111111-1111-4111-8111-111111111111",
      },
      {
        sequence: 2,
        at,
        root: "D:\\",
        path: "Unrelated/private.ts",
        kind: "modified",
        source: "filesystem-notification",
        attribution: "unavailable",
        bootId: "11111111-1111-4111-8111-111111111111",
      },
    ],
    historyCount: 2,
  };
  const state = DiscoveryStateSchema.parse({
    systems: [system, { ...system, deviceId: otherId, name: "Unrelated laptop" }],
    reports: f.discovery().reports,
  });
  const job = ProjectFolderSearchJobSchema.parse({
    version: 1,
    id: "fd_" + "3".repeat(32),
    actor: "usr_alice",
    workspaceId: "ws_server20",
    request: { version: 1, projectId: "prj_fixture", deviceId },
    query: "Fixture delivery",
    roots: ["D:\\"],
    createdAt: at,
    expiresAt: "2026-10-26T00:02:00.000Z",
    completedAt: at,
    status: "succeeded",
    result: {
      matches: [{ root: "D:\\", path: "Fixture" }],
      scannedDirectories: 1000,
      partial: true,
      gaps: ["search-limit"],
    },
  });
  f.setDiscovery({ ...state, folderEvidence: [job] });
  const a = await f.store.saveAgent("usr_alice", {
    ...f.agent(connection),
    guardrails: {
      ...defaultAgentGuardrails,
      sources: ["manual", "discovery", "delivery-plans"],
      allowNotificationDrafts: true,
    },
  });
  const requested = await f.store.requestRun("usr_alice", {
    version: 1,
    agentId: a.id,
    prompt: "Who works on Fixture delivery?",
  });
  await f.store.waitForRuns();
  let run = (await f.store.state("usr_alice")).runs.find((r) => r.id === requested.id)!;
  expect(run.status).toBe("succeeded");
  const evidence = JSON.stringify(run.evidence);
  expect(evidence).toContain("Fixture/app.ts");
  expect(evidence).not.toContain("Unrelated/private.ts");
  expect(evidence).not.toContain("Unrelated laptop");
  expect(evidence).toContain("unverified");
  expect(evidence).toContain("search-limit");
  const repositoryId = "gitrepo_" + "8".repeat(32),
    source = {
      version: 1,
      profileId: "fixture-profile",
      repository: "D:\\Fixture",
      origin: "https://git.example/project.git",
      repositoryId,
      head: "a".repeat(40),
      branch: "feature/fixture",
      checkedAt: at,
    };
  const boundPlan = DeliveryPlanSchema.parse({
    version: 1,
    projectId: "prj_fixture",
    expectedRevision: 0,
    poReference: "Fixture PO",
    poDate: "2026-10-01",
    timeZone: "Asia/Kolkata",
    responsible: "Assigned reviewer",
    deviceIds: [deviceId],
    milestones: [
      {
        id: "accept",
        title: "Accepted",
        weight: 30,
        dueDate: "2026-10-10",
        acceptance: "accepted",
        evidence: "Fixture receipt",
      },
      {
        id: "pending",
        title: "Pending",
        weight: 70,
        dueDate: "2026-10-30",
        acceptance: "pending",
        evidence: "",
      },
    ],
    bindings: [{ deviceId, userId: "usr_alice", repositoryId, profileId: "fixture-profile" }],
    revision: 1,
    actor: "usr_alice",
    updatedAt: at,
    workspaceId: "ws_server20",
  });
  const boundState = DiscoveryStateSchema.parse({
    ...state,
    systems: [{ ...system, source }],
    reports: [{ ...state.reports[0]!, plan: boundPlan }],
  });
  f.setDiscovery(boundState);
  const boundRun = await f.store.requestRun("usr_alice", {
    version: 1,
    agentId: a.id,
    projectId: "prj_fixture",
    prompt: "Bound source status",
  });
  await f.store.waitForRuns();
  const boundEvidence = JSON.stringify(
    (await f.store.state("usr_alice")).runs.find((r) => r.id === boundRun.id)!.evidence,
  );
  expect(boundEvidence).toContain("Fixture/app.ts");
  expect(boundEvidence).not.toContain("Unrelated/private.ts");
  expect((await f.store.notificationSource("usr_alice", run.id)).allowed).toBe(true);
  f.setDiscovery({
    ...state,
    reports: [...state.reports, { ...state.reports[0]!, projectId: "prj_other" as never }],
  });
  const ambiguous = await f.store.requestRun("usr_alice", {
    version: 1,
    agentId: a.id,
    prompt: "Fixture delivery",
  });
  await f.store.waitForRuns();
  run = (await f.store.state("usr_alice")).runs.find((r) => r.id === ambiguous.id)!;
  expect(JSON.stringify(run.evidence)).toContain("ambiguous");
  f.setDiscovery({ systems: [], reports: [] });
  const missing = await f.store.requestRun("usr_alice", {
    version: 1,
    agentId: a.id,
    projectId: "prj_fixture",
    prompt: "Status",
  });
  await f.store.waitForRuns();
  expect((await f.store.state("usr_alice")).runs.find((r) => r.id === missing.id)!.status).toBe(
    "failed",
  );
});
it("enforces independent model data policy and invalidates work on revoked access or changed stored identity", async () => {
  const f = await fixture(),
    c = await f.connect();
  await f.store.testModel("usr_alice", c.id);
  const p = await f.store.prepareModel("usr_alice", {
    ...f.input,
    id: c.id,
    expectedRevision: 1,
    credential: "keep",
    allowWorkspaceSummary: false,
  });
  const manual = await f.store.commitModel("usr_alice", sealModelCredential(p, ""));
  await f.store.testModel("usr_alice", manual.id);
  const a = await f.store.saveAgent("usr_alice", f.agent(manual));
  await expect(
    f.store.requestRun("usr_alice", { version: 1, agentId: a.id, prompt: "Status" }),
  ).rejects.toThrow("agent-model-data-policy-denied");
  const metadata = await f.store.prepareModel("usr_alice", {
    ...f.input,
    name: "SYNTHETIC_MODEL_CREDENTIAL",
  });
  await expect(
    f.store.commitModel("usr_alice", sealModelCredential(metadata, "SYNTHETIC_MODEL_CREDENTIAL")),
  ).rejects.toThrow("agent-secret-metadata-denied");
  const file = join(f.root, "ws_fixture", a.id + ".json");
  await writeFile(file, JSON.stringify({ ...a, id: "ag_" + "d".repeat(32) }));
  await expect(f.store.state("usr_alice")).rejects.toThrow("agent-storage-integrity-denied");
});
it("bounds proposal/memory capacity, rejects damaged storage and reports orphaned running work without replay", async () => {
  const f = await fixture(),
    c = await f.connect();
  await f.store.testModel("usr_alice", c.id);
  const a = await f.store.saveAgent("usr_alice", f.agent(c));
  const req = await f.store.requestRun("usr_alice", {
    version: 1,
    agentId: a.id,
    prompt: "Status",
  });
  await f.store.waitForRuns();
  const run = (await f.store.state("usr_alice")).runs[0]!;
  await writeFile(
    join(f.root, "ws_fixture", req.id + ".json"),
    JSON.stringify({ ...run, status: "running" }),
  );
  f.advance(91000);
  expect((await f.store.state("usr_alice")).runs[0]).toMatchObject({
    status: "failed",
    errorCode: "model-unavailable",
  });
  await Promise.all(
    Array.from({ length: 99 }, (_, i) =>
      writeFile(join(f.root, "ws_fixture", a.id, `memory.r${i + 2}.md`), "Fixture history"),
    ),
  );
  await expect(
    f.store.saveAgent("usr_alice", { ...f.agent(c), id: a.id, expectedRevision: 1 }),
  ).rejects.toThrow("agent-memory-capacity");
  for (let i = 0; i < 32; i++)
    await f.store.prepareModel("usr_alice", { ...f.input, name: "Pending " + i });
  await expect(f.store.prepareModel("usr_alice", f.input)).rejects.toThrow(
    "agent-proposal-capacity",
  );
  await writeFile(join(f.root, "ws_fixture", c.id + ".json"), "x".repeat(200001));
  await expect(f.store.state("usr_alice")).rejects.toThrow("agent-storage-unavailable");
});
it("discards in-flight output after a guardrail change, bounds concurrent tests/runs and checks pending revisions", async () => {
  const f = await fixture(),
    c = await f.connect();
  await f.store.testModel("usr_alice", c.id);
  const a = await f.store.saveAgent("usr_alice", f.agent(c));
  let release!: () => void;
  f.pause(new Promise<void>((r) => (release = r)));
  const first = await f.store.requestRun("usr_alice", {
    version: 1,
    agentId: a.id,
    prompt: "Status",
  });
  const second = await f.store.requestRun("usr_alice", {
    version: 1,
    agentId: a.id,
    prompt: "Status again",
  });
  await expect(
    f.store.requestRun("usr_alice", { version: 1, agentId: a.id, prompt: "Too many" }),
  ).rejects.toThrow("agent-run-not-ready");
  await f.store.saveAgent("usr_alice", {
    ...f.agent(c),
    id: a.id,
    expectedRevision: 1,
    memory: "Revised facts",
  });
  release();
  f.pause();
  await f.store.waitForRuns();
  for (const id of [first.id, second.id])
    expect((await f.store.state("usr_alice")).runs.find((r) => r.id === id)).toMatchObject({
      status: "failed",
      output: "",
      errorCode: "guardrail-denied",
    });
  const p = await f.store.prepareModel("usr_alice", {
    ...f.input,
    id: c.id,
    expectedRevision: 1,
    credential: "keep",
  });
  const q = await f.store.prepareModel("usr_alice", {
    ...f.input,
    id: c.id,
    expectedRevision: 1,
    credential: "keep",
  });
  await f.store.commitModel("usr_alice", sealModelCredential(p, ""));
  await expect(f.store.commitModel("usr_alice", sealModelCredential(q, ""))).rejects.toThrow(
    "agent-revision-changed",
  );
  let tested!: () => void;
  f.pause(new Promise<void>((r) => (tested = r)));
  const testing = f.store.testModel("usr_alice", c.id);
  for (let i = 0; i < 100; i++) {
    if (f.calls.length >= 2) break;
    await new Promise((r) => setTimeout(r, 5));
  }
  await new Promise((r) => setTimeout(r, 30));
  await expect(f.store.testModel("usr_alice", c.id)).rejects.toThrow("agent-model-test-busy");
  tested();
  await testing;
  f.pause();
  f.advance(300001);
  await f.store.prepareModel("usr_alice", f.input);
});
it("bounds configured agents and model connections without expanding ownership", async () => {
  const f = await fixture(),
    c = await f.connect(),
    a = await f.store.saveAgent("usr_alice", f.agent(c)),
    dir = join(f.root, "ws_fixture");
  await Promise.all(
    Array.from({ length: 99 }, (_, i) => {
      const id = "ag_" + i.toString(16).padStart(32, "0");
      return writeFile(join(dir, id + ".json"), JSON.stringify({ ...a, id }));
    }),
  );
  await expect(f.store.saveAgent("usr_alice", f.agent(c))).rejects.toThrow("agent-capacity");
  await Promise.all(
    Array.from({ length: 39 }, (_, i) => {
      const id = "mc_" + i.toString(16).padStart(32, "0");
      return writeFile(join(dir, id + ".json"), JSON.stringify({ ...c, id }));
    }),
  );
  await expect(f.store.prepareModel("usr_alice", f.input)).rejects.toThrow("agent-model-capacity");
  const p = await f.store.prepareModel("usr_alice", { ...f.input, id: c.id, expectedRevision: 1 });
  const bad = sealModelCredential(p, "SYNTHETIC_MODEL_CREDENTIAL");
  bad.sealed!.keyId = "f".repeat(64);
  await expect(f.store.commitModel("usr_alice", bad)).rejects.toThrow(
    "agent-secret-envelope-denied",
  );
});
it("bounds UTF-8 model context independently of long skills, memory and a large authorized project overview", async () => {
  const f = await fixture(),
    c = await f.connect();
  await f.store.testModel("usr_alice", c.id);
  const state = f.discovery();
  f.setDiscovery({
    systems: [],
    reports: Array.from({ length: 20 }, (_, i) => ({
      ...state.reports[0]!,
      projectId: ("prj_" + i) as never,
      projectName: "項".repeat(120),
    })),
  });
  const a = await f.store.saveAgent("usr_alice", {
    ...f.agent(c),
    skills: "文".repeat(16000),
    memory: "記".repeat(16000),
  });
  await f.store.requestRun("usr_alice", { version: 1, agentId: a.id, prompt: "問".repeat(4000) });
  await f.store.waitForRuns();
  const call = f.calls.at(-1)!;
  expect(Buffer.byteLength(call.input)).toBeLessThanOrEqual(32768);
  expect(JSON.parse(call.input).partial).toBe(true);
  expect((await f.store.state("usr_alice")).runs[0]!.status).toBe("succeeded");
});
