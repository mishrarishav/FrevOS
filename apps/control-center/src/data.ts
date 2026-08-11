export type Tone = "signal" | "orchestration" | "verified" | "approval" | "failure" | "neutral";

export type Status = {
  label: string;
  tone: Tone;
};

export const tasks = [
  {
    id: "task-184",
    title: "Fix login timeout and prepare a verified pull request",
    project: "mishrarishav/FrevOS",
    agent: "Codex Coding Agent",
    progress: 68,
    status: { label: "Demonstration", tone: "signal" },
    updated: "2m",
  },
  {
    id: "task-179",
    title: "Map repository boundaries and unresolved risks",
    project: "mishrarishav/FrevOS-Acceptance",
    agent: "Repository Analyst",
    progress: 100,
    status: { label: "Example passed", tone: "verified" },
    updated: "34m",
  },
] satisfies ReadonlyArray<{
  id: string;
  title: string;
  project: string;
  agent: string;
  progress: number;
  status: Status;
  updated: string;
}>;

export const approvals = [
  {
    id: "apr-291",
    title: "Production deployment",
    target: "frevos-web · production",
    expiry: "18 min",
    risk: "Critical",
  },
  {
    id: "apr-287",
    title: "Publish pull request",
    target: "mishrarishav/FrevOS · phase/task-184",
    expiry: "42 min",
    risk: "High",
  },
] as const;

export const activity = [
  {
    agent: "Master Orchestrator",
    glyph: "MO",
    detail: "Demonstration boundary only",
    tool: "policy.evaluate@1",
    status: { label: "Example", tone: "orchestration" },
  },
  {
    agent: "Repository Analyst",
    glyph: "RA",
    detail: "Evidence sealed",
    tool: "repository.inspect@1",
    status: { label: "Completed", tone: "verified" },
  },
  {
    agent: "QA Agent",
    glyph: "QA",
    detail: "Waiting for independent target",
    tool: "acceptance.request@1",
    status: { label: "Queued", tone: "neutral" },
  },
] satisfies ReadonlyArray<{
  agent: string;
  glyph: string;
  detail: string;
  tool: string;
  status: Status;
}>;

export const auditEvents = [
  {
    id: "aud-01HV7R2K",
    action: "phase.contract.recorded",
    actor: "product-owner",
    outcome: "verified",
    time: "08:58:12",
  },
  {
    id: "aud-01HV7QZZ",
    action: "acceptance.main.validated",
    actor: "github-actions",
    outcome: "passed",
    time: "08:57:44",
  },
  {
    id: "aud-01HV7QX8",
    action: "core.main.validated",
    actor: "github-actions",
    outcome: "passed",
    time: "08:57:02",
  },
] as const;

export const stateExamples = [
  {
    id: "loading",
    label: "Loading",
    tone: "signal",
    title: "Resolving workspace context",
    description: "Keep previous safe context visible while new data is verified.",
  },
  {
    id: "empty",
    label: "Empty",
    tone: "neutral",
    title: "No tasks in this workspace",
    description: "Explain what belongs here and offer one relevant next step.",
  },
  {
    id: "offline",
    label: "Offline",
    tone: "approval",
    title: "Connection interrupted",
    description: "Never imply that a protected action finished while disconnected.",
  },
  {
    id: "denied",
    label: "Permission denied",
    tone: "approval",
    title: "Workspace scope required",
    description: "Show the missing capability without leaking resource existence.",
  },
  {
    id: "failed",
    label: "Failed",
    tone: "failure",
    title: "Evidence could not be persisted",
    description: "Fail closed and preserve a safe retry path.",
  },
  {
    id: "expired",
    label: "Approval expired",
    tone: "neutral",
    title: "A new decision is required",
    description: "Never replay or silently extend a sensitive approval.",
  },
] satisfies ReadonlyArray<{
  id: string;
  label: string;
  tone: Tone;
  title: string;
  description: string;
}>;

export const tokenGroups = [
  {
    title: "Semantic color",
    items: [
      { name: "Signal", value: "oklch(0.82 0.14 200)", tone: "signal" },
      { name: "Orchestration", value: "oklch(0.68 0.18 295)", tone: "orchestration" },
      { name: "Verified", value: "oklch(0.75 0.17 152)", tone: "verified" },
      { name: "Approval", value: "oklch(0.82 0.15 82)", tone: "approval" },
      { name: "Failure", value: "oklch(0.64 0.21 22)", tone: "failure" },
    ],
  },
  {
    title: "Geometry and motion",
    items: [
      { name: "Primary rhythm", value: "8px", tone: "neutral" },
      { name: "Control radius", value: "10px", tone: "neutral" },
      { name: "Panel radius", value: "12px", tone: "neutral" },
      { name: "Fast transition", value: "160ms", tone: "neutral" },
      { name: "Panel transition", value: "240ms", tone: "neutral" },
    ],
  },
] satisfies ReadonlyArray<{
  title: string;
  items: ReadonlyArray<{ name: string; value: string; tone: Tone }>;
}>;
