import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  AgentTeamInputSchema,
  type Agent,
  type AgentTeamState,
  type Project,
} from "@frevos/contracts";
import type { ControlCenterApi } from "./api.js";
import { WorkspaceDialog } from "./WorkspaceDialog.js";
import { RecordBadge } from "./RecordWorkspace.js";

export function AgentTeamsPanel({
  api,
  workspaceId,
  agents,
  projects,
  onClose,
}: {
  api: ControlCenterApi;
  workspaceId: string;
  agents: Agent[];
  projects: Project[];
  onClose: () => void;
}) {
  const [state, setState] = useState<AgentTeamState | null>(null);
  const [coordinatorId, setCoordinator] = useState("");
  const [specialists, setSpecialists] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [projectId, setProject] = useState("");
  const [share, setShare] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await api.agentTeams!(workspaceId, abort.signal);
        if (!abort.signal.aborted) setState(next);
      } catch {
        if (!abort.signal.aborted)
          setNotice("Team history unavailable. Last observed results may be stale.");
      }
      if (!abort.signal.aborted) timer = setTimeout(() => void poll(), 3000);
    };
    void poll();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [api, workspaceId]);
  const names = (id: string) => agents.find((a) => a.id === id)?.name ?? id;
  const errors = {
    "agent-step-failed":
      "An agent could not finish its analysis. Review the completed steps before starting a new task.",
    "guardrail-denied":
      "Access, agent settings or a model connection changed. Review the configuration before starting a new task.",
    "paperclip-unavailable":
      "Paperclip did not confirm an action. Check its task records before trying again to avoid duplicates.",
    interrupted:
      "The service restarted before this task finished. Completed steps are retained; no work was replayed.",
  };
  return (
    <WorkspaceDialog label="Agent team tasks" onClose={onClose}>
      <section className="project-editor discovery-editor">
        <header className="settings-header">
          <h2>Agent team tasks</h2>
          <button
            type="button"
            className="button ghost"
            aria-label="Close team tasks"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </header>
        <div className="discovery-scroll discovery-form">
          <p>
            Select specialists, then a coordinator to combine their evidence. Agents use their own
            model, skills, memory and source permissions. Tasks run sequentially; no code changes,
            deployments or messages are executed.
          </p>
          <p>
            Paperclip:{" "}
            {state?.paperclip === "enrolled"
              ? "Enrolled for this account. Connectivity is verified when sharing a task."
              : "Not enrolled for this account. An administrator can enroll a private task service; local team analysis is available."}
          </p>
          {notice ? <p role="alert">{notice}</p> : null}
          <form
            className="discovery-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (busy) return;
              setBusy(true);
              void Promise.resolve()
                .then(() =>
                  api.runAgentTeam!(
                    workspaceId,
                    AgentTeamInputSchema.parse({
                      version: 1,
                      requestId: Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
                        b.toString(16).padStart(2, "0"),
                      ).join(""),
                      coordinatorId,
                      specialistIds: specialists,
                      prompt,
                      ...(projectId ? { projectId } : {}),
                      shareWithPaperclip: share,
                    }),
                  ),
                )
                .then((task) => {
                  setState((prior) =>
                    prior ? { ...prior, tasks: [task, ...prior.tasks].slice(0, 50) } : prior,
                  );
                  setNotice(
                    "Task accepted. Step results appear below; you can close this panel safely.",
                  );
                })
                .catch(() =>
                  setNotice(
                    "Task not accepted. Check distinct enabled agents, tested model connections, source permissions and Paperclip enrollment. No automatic retry was made.",
                  ),
                )
                .finally(() => setBusy(false));
            }}
          >
            <label>
              Coordinator
              <select
                required
                value={coordinatorId}
                onChange={(e) => {
                  setCoordinator(e.target.value);
                  setSpecialists((s) => s.filter((id) => id !== e.target.value));
                }}
              >
                <option value="">Choose coordinator</option>
                {agents
                  .filter((a) => a.enabled)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.role}
                    </option>
                  ))}
              </select>
            </label>
            <fieldset>
              <legend>Specialists (choose 1–4)</legend>
              {agents
                .filter((a) => a.enabled && a.id !== coordinatorId)
                .map((a) => (
                  <label key={a.id}>
                    <input
                      type="checkbox"
                      checked={specialists.includes(a.id)}
                      disabled={!specialists.includes(a.id) && specialists.length >= 4}
                      onChange={(e) =>
                        setSpecialists((s) =>
                          e.target.checked ? [...s, a.id] : s.filter((id) => id !== a.id),
                        )
                      }
                    />
                    {a.name} · {a.role}
                  </label>
                ))}
            </fieldset>
            <label>
              Project
              <select value={projectId} onChange={(e) => setProject(e.target.value)}>
                <option value="">Manual context only</option>
                {projects.map((p) => (
                  <option key={p.projectId} value={p.projectId}>
                    {p.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Question
              <textarea
                required
                maxLength={2000}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Review this project's current status, missing evidence and next steps."
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={share}
                disabled={state?.paperclip !== "enrolled"}
                onChange={(e) => setShare(e.target.checked)}
              />
              Share this question and sanitized results with the enrolled Paperclip company
            </label>
            <p>
              Completion comes from accepted milestones, never file counts. Assigned responsibility
              is separate from verified authorship. Token usage and cost are unavailable from the
              current gateway.
            </p>
            <button
              type="submit"
              className="button primary"
              disabled={
                busy ||
                !state ||
                state.tasks.some((t) => t.status === "running") ||
                !coordinatorId ||
                specialists.length === 0
              }
            >
              {busy ? "Submitting…" : "Run read-only team"}
            </button>
          </form>
          <h3>Task history</h3>
          {state && !state.tasks.length ? <p>No team tasks yet.</p> : null}
          {state?.tasks.map((task) => (
            <article key={task.id} className="discovery-form">
              <header>
                <RecordBadge>{task.status}</RecordBadge> {new Date(task.createdAt).toLocaleString()}
              </header>
              <p>{task.request.prompt}</p>
              {task.errorCode ? <p role="alert">{errors[task.errorCode]}</p> : null}
              {task.steps.map((step) => (
                <details key={step.agentId}>
                  <summary>
                    {names(step.agentId)} · {step.role} · {step.run?.status ?? "not run"}
                  </summary>
                  <pre className="agent-output">
                    {step.run?.output ||
                      (step.run?.errorCode
                        ? "Analysis failed. Review the full run in Run history."
                        : "No persisted result.")}
                  </pre>
                  {step.run ? (
                    <p>
                      Evidence: {step.run.evidenceCount} records · accepted milestone facts:{" "}
                      {step.run.factCount}.
                    </p>
                  ) : null}
                </details>
              ))}
              {task.output ? (
                <>
                  {task.facts.length ? (
                    <section aria-label="Accepted plan facts">
                      <h4>Accepted plan facts</h4>
                      {task.facts.map((fact) => (
                        <p key={fact.projectId}>
                          <strong>{fact.projectName}</strong> · Assigned:{" "}
                          {fact.responsible || "Unassigned"} · Accepted completion:{" "}
                          {fact.completedPercent === null ? "Unknown" : `${fact.completedPercent}%`}{" "}
                          · Planned:{" "}
                          {fact.plannedPercent === null ? "Unknown" : `${fact.plannedPercent}%`} ·{" "}
                          {fact.status}
                        </p>
                      ))}
                    </section>
                  ) : null}
                  <h4>Coordinator result</h4>
                  <pre className="agent-output">{task.output}</pre>
                </>
              ) : null}
              <details>
                <summary>Technical details</summary>
                <p>Task reference: {task.id}</p>
                {task.errorCode ? <p>Diagnostic: {task.errorCode}</p> : null}
                {task.paperclipIssueId ? <p>Paperclip issue: {task.paperclipIssueId}</p> : null}
                {task.steps.map((step) => (
                  <p key={step.agentId}>
                    {names(step.agentId)} · agent revision {step.agentRevision}
                    {step.run ? ` · Full result in Run history: ${step.run.id}` : ""}
                  </p>
                ))}
              </details>
              <p>Token usage / cost: unavailable</p>
            </article>
          ))}
        </div>
      </section>
    </WorkspaceDialog>
  );
}
