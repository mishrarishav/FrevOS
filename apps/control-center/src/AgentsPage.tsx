import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  type Agent,
  type AgentInput,
  AgentInputSchema,
  AgentRunInputSchema,
  type AgentRun,
  type AgentWorkspaceState,
  type ModelConnection,
  type ModelConnectionInput,
  ModelConnectionInputSchema,
  type ModelProposal,
  type Project,
  defaultAgentGuardrails,
} from "@frevos/contracts";
import type { ControlCenterApi } from "./api.js";
import { WorkspaceDialog } from "./WorkspaceDialog.js";
import { RecordBadge, RecordWorkspace, type RecordColumn } from "./RecordWorkspace.js";
import { AgentNetwork } from "./AgentNetwork.js";
import { sealModelCredential } from "./model-seal.js";
import { AgentNotificationsPanel } from "./AgentNotificationsPanel.js";
const blankModel = (): ModelConnectionInput => ({
  version: 1,
  expectedRevision: 0,
  name: "",
  endpoint: "",
  model: "",
  protocol: "chat-completions",
  authentication: "bearer",
  allowWorkspaceSummary: false,
  credential: "replace",
});
const blankAgent = (): AgentInput => ({
  version: 1,
  expectedRevision: 0,
  name: "",
  role: "",
  parentId: null,
  connectionId: "",
  skills: "",
  memory: "",
  guardrails: structuredClone(defaultAgentGuardrails),
  enabled: true,
});
export function AgentsPage({
  api,
  workspaceId,
  scopeName,
  projects,
}: {
  api: ControlCenterApi;
  workspaceId: string;
  scopeName: string;
  projects: Project[];
}) {
  const [state, setState] = useState<AgentWorkspaceState | null>(null),
    [userId, setUserId] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [reload, setReload] = useState(0),
    [busy, setBusy] = useState(false);
  const [models, setModels] = useState(false),
    [modelEditor, setModelEditor] = useState<ModelConnectionInput | null>(null),
    [apiKey, setApiKey] = useState(""),
    [proposal, setProposal] = useState<ModelProposal | null>(null);
  const [editor, setEditor] = useState<AgentInput | null>(null),
    [editorTab, setEditorTab] = useState<"identity" | "skills" | "memory" | "guardrails">(
      "identity",
    ),
    [network, setNetwork] = useState(true);
  const [ask, setAsk] = useState<Agent | null>(null),
    [prompt, setPrompt] = useState(""),
    [projectId, setProjectId] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false),
    [notificationSource, setNotificationSource] = useState<AgentRun | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload is the explicit retry generation.
  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        if (!api.agentState) throw Error();
        const [next, session] = await Promise.all([
          api.agentState(workspaceId, abort.signal),
          api.getSession(abort.signal),
        ]);
        if (!abort.signal.aborted) {
          setState(next);
          setUserId(session.userId);
          setError("");
        }
      } catch {
        if (!abort.signal.aborted)
          setError("Agent workspace unavailable. Showing last observed state.");
      }
      if (!abort.signal.aborted) timer = setTimeout(() => void poll(), 5000);
    };
    void poll();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [api, workspaceId, reload]);
  const agents = state?.agents ?? [],
    connections = state?.connections ?? [],
    runs = state?.runs ?? [];
  const status = (a: Agent) =>
    !a.enabled
      ? "disabled"
      : runs.some((r) => r.agentId === a.id && r.status === "running")
        ? "running"
        : state?.tests.some(
              (t) =>
                t.connectionId === a.connectionId &&
                t.status === "ready" &&
                Date.parse(t.at) > Date.now() - 600000 &&
                t.connectionRevision === connections.find((c) => c.id === a.connectionId)?.revision,
            )
          ? "ready"
          : "needs-connection";
  const editAgent = (agent?: Agent) => {
    setEditor(
      agent
        ? {
            version: 1,
            id: agent.id,
            expectedRevision: agent.revision,
            name: agent.name,
            role: agent.role,
            parentId: agent.parentId,
            connectionId: agent.connectionId,
            skills: agent.skills,
            memory: agent.memory,
            guardrails: structuredClone(agent.guardrails),
            enabled: agent.enabled,
          }
        : blankAgent(),
    );
    setEditorTab("identity");
  };
  const editModel = (model?: ModelConnection) => {
    setApiKey("");
    setModelEditor(
      model
        ? {
            version: 1,
            id: model.id,
            expectedRevision: model.revision,
            name: model.name,
            endpoint: model.endpoint,
            model: model.model,
            protocol: model.protocol,
            authentication: model.authentication,
            allowWorkspaceSummary: model.allowWorkspaceSummary,
            credential: "keep",
          }
        : blankModel(),
    );
    setProposal(null);
  };
  async function action(work: () => Promise<unknown>, message: string) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      await work();
      setNotice(message);
      setReload((n) => n + 1);
    } catch {
      setNotice(
        "Action did not complete. Check the selected connection, approval/revision, permissions and limits; retry with current state.",
      );
    } finally {
      setBusy(false);
    }
  }
  const columns: RecordColumn<Agent>[] = [
    { id: "name", label: "Agent", value: (a) => a.name },
    { id: "role", label: "Role", value: (a) => a.role },
    {
      id: "model",
      label: "Model connection",
      value: (a) => connections.find((c) => c.id === a.connectionId)?.name ?? "Unavailable",
    },
    { id: "status", label: "Status", value: status },
  ];
  const controls = (a: Agent) => (
    <div className="record-row-actions">
      <button type="button" className="button secondary" onClick={() => editAgent(a)}>
        Configure
      </button>
      <button
        type="button"
        className="button primary"
        disabled={!a.enabled || busy}
        onClick={() => {
          setAsk(a);
          setPrompt("");
          setProjectId("");
        }}
      >
        Ask agent
      </button>
    </div>
  );
  return (
    <div className="agents-page">
      <RecordWorkspace
        title="Agents"
        breadcrumb="WORKSPACE / AGENTS"
        scopeName={scopeName}
        userId={userId}
        workspaceId={workspaceId}
        page="agents"
        noun="agents"
        renderSurface={
          network
            ? (records) => <AgentNetwork agents={records} runs={runs} onSelect={editAgent} />
            : undefined
        }
        records={agents}
        columns={columns}
        identify={(a) => a.id}
        statusOf={status}
        statuses={[
          { id: "ready", label: "Ready" },
          { id: "running", label: "Running" },
          { id: "needs-connection", label: "Needs connection" },
          { id: "disabled", label: "Disabled" },
        ]}
        loading={!state && !error}
        error={error}
        notice={notice}
        onRetry={() => setReload((n) => n + 1)}
        actions={
          <>
            <button type="button" className="button secondary" onClick={() => setModels(true)}>
              Model connections
            </button>
            <button type="button" className="button secondary" onClick={() => setHistoryOpen(true)}>
              Run history ({runs.length})
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setNotificationSource(null);
                setNotificationsOpen(true);
              }}
            >
              Laptop notifications
            </button>
            <button
              type="button"
              className="button primary"
              disabled={!agents.some((a) => a.enabled) || busy}
              onClick={() => {
                setAsk(agents.find((a) => a.enabled)!);
                setPrompt("");
                setProjectId("");
              }}
            >
              Ask agent
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => setNetwork((v) => !v)}
            >
              {network ? "Hide network" : "Show network"}
            </button>
            <button
              type="button"
              className="button primary"
              disabled={!connections.length || busy}
              onClick={() => editAgent()}
            >
              Add agent
            </button>
          </>
        }
        renderActions={controls}
        renderCard={(a) => (
          <article className="record-card">
            <header className="record-card-title">
              <h3>{a.name}</h3>
              <RecordBadge
                tone={
                  status(a) === "running"
                    ? "positive"
                    : status(a) === "needs-connection"
                      ? "warning"
                      : "neutral"
                }
              >
                {status(a).replaceAll("-", " ")}
              </RecordBadge>
            </header>
            <p>{a.role}</p>
            <p>
              {connections.find((c) => c.id === a.connectionId)?.name ?? "Connection unavailable"}
            </p>
            <p>Skills and memory · revision {a.revision}</p>
            <small>
              Sources: {a.guardrails.sources.join(", ")} · {a.guardrails.maxOutputTokens} output
              tokens
            </small>
            {controls(a)}
          </article>
        )}
      />
      {!connections.length ? (
        <p className="record-muted">
          Add a model connection, test it, then configure agents. No endpoint, model or team is
          preselected.
        </p>
      ) : null}
      {historyOpen ? (
        <WorkspaceDialog label="Agent run history" onClose={() => setHistoryOpen(false)}>
          <section className="project-editor discovery-editor">
            <header className="settings-header">
              <h2>Recent requested analysis</h2>
              <button
                type="button"
                className="button ghost"
                aria-label="Close agent history"
                onClick={() => setHistoryOpen(false)}
              >
                <X size={16} />
              </button>
            </header>
            <div className="discovery-scroll">
              <p>
                Facts below are computed from accepted project plans. AI output is advisory; it
                cannot execute commands or send messages.
              </p>
              {runs.map((run) => (
                <article className="discovery-event" key={run.id}>
                  <header className="record-row-actions">
                    <strong>{agents.find((a) => a.id === run.agentId)?.name ?? "Agent"}</strong>
                    <RecordBadge
                      tone={
                        run.status === "failed"
                          ? "negative"
                          : run.status === "succeeded"
                            ? "positive"
                            : "neutral"
                      }
                    >
                      {run.status}
                    </RecordBadge>
                    <small>{new Date(run.createdAt).toLocaleString()}</small>
                  </header>
                  <p>{run.prompt}</p>
                  {run.facts.map((f) => (
                    <p key={f.projectId}>
                      <strong>{f.projectName}</strong> · Assigned: {f.responsible || "Unknown"} ·
                      Accepted completion:{" "}
                      {f.completedPercent === null ? "Unknown" : f.completedPercent + "%"} ·
                      Planned: {f.plannedPercent === null ? "Unknown" : f.plannedPercent + "%"} ·{" "}
                      {f.status}
                    </p>
                  ))}
                  {run.output ? <pre className="agent-output">{run.output}</pre> : null}
                  {run.status === "succeeded" &&
                  agents.some(
                    (a) =>
                      a.id === run.agentId &&
                      a.revision === run.agentRevision &&
                      a.guardrails.allowNotificationDrafts,
                  ) ? (
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => {
                        setNotificationSource(run);
                        setHistoryOpen(false);
                        setNotificationsOpen(true);
                      }}
                    >
                      Draft laptop suggestion
                    </button>
                  ) : null}
                  {run.errorCode ? <p>{run.errorCode.replaceAll("-", " ")}</p> : null}
                  <details>
                    <summary>Evidence and freshness ({run.evidence.length})</summary>
                    {run.evidence.map((e) => (
                      <p key={e.kind + e.reference}>
                        <strong>{e.kind}</strong> ·{" "}
                        {e.observedAt
                          ? new Date(e.observedAt).toLocaleString()
                          : "Timestamp unavailable"}
                        <br />
                        {e.summary}
                      </p>
                    ))}
                  </details>
                </article>
              ))}
              {!runs.length ? <p>No requested analysis yet.</p> : null}
            </div>
          </section>
        </WorkspaceDialog>
      ) : null}
      {notificationsOpen ? (
        <AgentNotificationsPanel
          api={api}
          workspaceId={workspaceId}
          source={notificationSource}
          onClose={() => setNotificationsOpen(false)}
        />
      ) : null}
      {models && !modelEditor ? (
        <WorkspaceDialog label="Model connections" onClose={() => setModels(false)}>
          <section className="project-editor discovery-editor">
            <header className="settings-header">
              <h2>Model connections</h2>
              <div className="record-row-actions">
                <button type="button" className="button primary" onClick={() => editModel()}>
                  Add connection
                </button>
                <button
                  type="button"
                  className="button ghost"
                  aria-label="Close model connections"
                  onClick={() => setModels(false)}
                >
                  <X size={16} />
                </button>
              </div>
            </header>
            <div className="discovery-scroll">
              <p>
                Credentials stay protected. Connection tests send a small synthetic prompt.
                Workspace summaries need an explicit data-policy choice.
              </p>
              {connections.map((c) => (
                <article className="discovery-event" key={c.id}>
                  <h3>{c.name}</h3>
                  <p>{c.endpoint}</p>
                  <p>
                    Model: {c.model || "Server default"} · Credential stored · revision {c.revision}
                  </p>
                  <p>
                    Last test:{" "}
                    {state?.tests.find((t) => t.connectionId === c.id)?.status ?? "Not tested"}
                  </p>
                  <div className="record-row-actions">
                    <button type="button" className="button secondary" onClick={() => editModel(c)}>
                      Edit connection
                    </button>
                    <button
                      type="button"
                      className="button primary"
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          const result = await api.testModel!(workspaceId, c.id);
                          setState((s) =>
                            s
                              ? {
                                  ...s,
                                  tests: [
                                    ...s.tests.filter((t) => t.connectionId !== c.id),
                                    result,
                                  ],
                                }
                              : s,
                          );
                        }, "Connection test completed. Check its observed status.")
                      }
                    >
                      Test connection
                    </button>
                  </div>
                </article>
              ))}
              {notice ? <p role="status">{notice}</p> : null}
            </div>
          </section>
        </WorkspaceDialog>
      ) : null}
      {modelEditor ? (
        <WorkspaceDialog
          label="Configure model connection"
          onClose={() => {
            if (!busy) {
              setModelEditor(null);
              setProposal(null);
              setApiKey("");
            }
          }}
        >
          <section className="project-editor discovery-editor">
            <header className="settings-header">
              <h2>{proposal ? "Approve model connection" : "Configure model connection"}</h2>
              <button
                type="button"
                className="button ghost"
                aria-label="Close model editor"
                disabled={busy}
                onClick={() => {
                  setModelEditor(null);
                  setProposal(null);
                  setApiKey("");
                }}
              >
                <X size={16} />
              </button>
            </header>
            <form
              className="discovery-scroll discovery-form"
              onSubmit={(e) => {
                e.preventDefault();
                void action(
                  async () => {
                    if (!proposal) {
                      setProposal(
                        await api.prepareModel!(
                          workspaceId,
                          ModelConnectionInputSchema.parse({
                            ...modelEditor,
                            credential: apiKey ? "replace" : modelEditor.id ? "keep" : "replace",
                          }),
                        ),
                      );
                    } else {
                      await api.commitModel!(workspaceId, sealModelCredential(proposal, apiKey));
                      setApiKey("");
                      setModelEditor(null);
                      setProposal(null);
                    }
                  },
                  proposal
                    ? "Model connection saved. Test its actual availability."
                    : "Review the destination and access, then approve this connection.",
                );
              }}
            >
              {proposal ? (
                <>
                  <p>
                    Destination: <strong>{proposal.input.endpoint}</strong>
                  </p>
                  <p>Model: {proposal.input.model || "Server default"}</p>
                  <p>
                    Credential:{" "}
                    {proposal.input.credential === "keep"
                      ? "Retain this connection's protected credential"
                      : "Store the provided credential for this destination"}
                  </p>
                  <p>
                    Workspace summaries:{" "}
                    {proposal.input.allowWorkspaceSummary
                      ? "Permitted for configured agent sources"
                      : "Blocked; manual input only"}
                  </p>
                  <p>Approval expires {new Date(proposal.expiresAt).toLocaleTimeString()}.</p>
                </>
              ) : (
                <>
                  <label>
                    Name
                    <input
                      required
                      value={modelEditor.name}
                      onChange={(e) => setModelEditor({ ...modelEditor, name: e.target.value })}
                    />
                  </label>
                  <label>
                    Inference endpoint URL
                    <input
                      type="url"
                      required
                      value={modelEditor.endpoint}
                      placeholder="https://your-provider.example/api"
                      onChange={(e) => setModelEditor({ ...modelEditor, endpoint: e.target.value })}
                    />
                  </label>
                  <label>
                    Model (leave blank for the server default)
                    <input
                      value={modelEditor.model}
                      onChange={(e) => setModelEditor({ ...modelEditor, model: e.target.value })}
                    />
                  </label>
                  <label>
                    Authentication
                    <select
                      value={modelEditor.authentication}
                      onChange={(e) =>
                        setModelEditor({
                          ...modelEditor,
                          authentication: e.target.value as "bearer" | "x-api-key",
                        })
                      }
                    >
                      <option value="bearer">Bearer API key</option>
                      <option value="x-api-key">X-API-Key</option>
                    </select>
                  </label>
                  <label>
                    API key {modelEditor.id ? "(leave empty to keep the existing key)" : ""}
                    <input
                      type="password"
                      autoComplete="new-password"
                      required={!modelEditor.id}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                  </label>
                  <p>
                    Chat-completions compatible endpoint. HTTPS is required; redirects and
                    private/internal network targets are denied.
                  </p>
                  <label>
                    <input
                      type="checkbox"
                      checked={modelEditor.allowWorkspaceSummary}
                      onChange={(e) =>
                        setModelEditor({ ...modelEditor, allowWorkspaceSummary: e.target.checked })
                      }
                    />{" "}
                    Allow this endpoint to receive the workspace summaries explicitly enabled on
                    each agent
                  </label>
                </>
              )}
              <button type="submit" className="button primary" disabled={busy}>
                {proposal ? "Approve and save connection" : "Review connection"}
              </button>
              {proposal ? (
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setProposal(null)}
                >
                  Back to settings
                </button>
              ) : null}
              {notice ? <p role="status">{notice}</p> : null}
            </form>
          </section>
        </WorkspaceDialog>
      ) : null}
      {editor ? (
        <WorkspaceDialog
          label="Configure agent"
          onClose={() => {
            if (!busy) setEditor(null);
          }}
        >
          <section className="project-editor discovery-editor">
            <header className="settings-header">
              <h2>{editor.id ? "Configure agent" : "Add agent"}</h2>
              <div className="record-row-actions">
                <button
                  type="button"
                  className="button primary"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      await api.saveAgent!(workspaceId, AgentInputSchema.parse(editor));
                      setEditor(null);
                    }, "Agent configuration saved with versioned skills and memory.")
                  }
                >
                  Save agent
                </button>
                <button
                  type="button"
                  className="button ghost"
                  aria-label="Close agent editor"
                  disabled={busy}
                  onClick={() => setEditor(null)}
                >
                  <X size={16} />
                </button>
              </div>
            </header>
            <div className="record-row-actions">
              {(["identity", "skills", "memory", "guardrails"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={editorTab === tab ? "button primary" : "button ghost"}
                  onClick={() => setEditorTab(tab)}
                >
                  {tab === "memory" ? "memory.md" : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
            <div className="discovery-scroll discovery-form">
              {editorTab === "identity" ? (
                <>
                  <label>
                    Agent name
                    <input
                      value={editor.name}
                      onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                    />
                  </label>
                  <label>
                    Role
                    <input
                      value={editor.role}
                      onChange={(e) => setEditor({ ...editor, role: e.target.value })}
                    />
                  </label>
                  <label>
                    Model connection
                    <select
                      aria-label="Model connection"
                      value={editor.connectionId}
                      onChange={(e) => setEditor({ ...editor, connectionId: e.target.value })}
                    >
                      <option value="">Choose a connection</option>
                      {connections.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Reports to
                    <select
                      aria-label="Reports to"
                      value={editor.parentId ?? ""}
                      onChange={(e) => setEditor({ ...editor, parentId: e.target.value || null })}
                    >
                      <option value="">No parent agent</option>
                      {agents
                        .filter((a) => a.id !== editor.id)
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={editor.enabled}
                      onChange={(e) => setEditor({ ...editor, enabled: e.target.checked })}
                    />{" "}
                    Enabled for explicitly requested analysis
                  </label>
                </>
              ) : null}
              {editorTab === "skills" ? (
                <>
                  <label>
                    Agent skills (Markdown)
                    <textarea
                      aria-label="Agent skills (Markdown)"
                      rows={14}
                      value={editor.skills}
                      onChange={(e) => setEditor({ ...editor, skills: e.target.value })}
                    />
                  </label>
                  <p>
                    Describe this agent's specialist work. Skills do not grant tool or approval
                    permissions.
                  </p>
                </>
              ) : null}
              {editorTab === "memory" ? (
                <>
                  <label>
                    memory.md
                    <textarea
                      aria-label="memory.md"
                      rows={14}
                      value={editor.memory}
                      onChange={(e) => setEditor({ ...editor, memory: e.target.value })}
                    />
                  </label>
                  <p>
                    Record source-linked facts and dates. Changes retain the editor and revision.
                    Memory cannot override guardrails; secret-like lines are masked.
                  </p>
                </>
              ) : null}
              {editorTab === "guardrails" ? (
                <>
                  <h3>Allowed evidence sources</h3>
                  {(["manual", "discovery", "delivery-plans"] as const).map((source) => (
                    <label key={source}>
                      <input
                        type="checkbox"
                        checked={editor.guardrails.sources.includes(source)}
                        onChange={(e) =>
                          setEditor({
                            ...editor,
                            guardrails: {
                              ...editor.guardrails,
                              sources: e.target.checked
                                ? [...editor.guardrails.sources, source]
                                : editor.guardrails.sources.filter((s) => s !== source),
                            },
                          })
                        }
                      />
                      {source.replaceAll("-", " ")}
                    </label>
                  ))}
                  <label>
                    Maximum output tokens
                    <input
                      type="number"
                      min={32}
                      max={2048}
                      value={editor.guardrails.maxOutputTokens}
                      onChange={(e) =>
                        setEditor({
                          ...editor,
                          guardrails: {
                            ...editor.guardrails,
                            maxOutputTokens: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    Model timeout (seconds)
                    <input
                      type="number"
                      min={5}
                      max={60}
                      value={editor.guardrails.timeoutSeconds}
                      onChange={(e) =>
                        setEditor({
                          ...editor,
                          guardrails: {
                            ...editor.guardrails,
                            timeoutSeconds: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={editor.guardrails.allowNotificationDrafts}
                      onChange={(e) =>
                        setEditor({
                          ...editor,
                          guardrails: {
                            ...editor.guardrails,
                            allowNotificationDrafts: e.target.checked,
                          },
                        })
                      }
                    />{" "}
                    Permit notification suggestions (delivery still requires separate human approval
                    and local consent)
                  </label>
                  <p>
                    No shell, deployment, database writes, outgoing email or automatic employee
                    messages are enabled.
                  </p>
                </>
              ) : null}
              {notice ? <p role="status">{notice}</p> : null}
            </div>
          </section>
        </WorkspaceDialog>
      ) : null}
      {ask ? (
        <WorkspaceDialog
          label="Ask agent"
          onClose={() => {
            if (!busy) setAsk(null);
          }}
        >
          <section className="project-editor discovery-editor">
            <header className="settings-header">
              <h2>Ask {ask.name}</h2>
              <button
                type="button"
                className="button ghost"
                aria-label="Close agent question"
                onClick={() => setAsk(null)}
              >
                <X size={16} />
              </button>
            </header>
            <form
              className="discovery-scroll discovery-form"
              onSubmit={(e) => {
                e.preventDefault();
                void action(async () => {
                  await api.runAgent!(
                    workspaceId,
                    AgentRunInputSchema.parse({
                      version: 1,
                      agentId: ask.id,
                      prompt,
                      ...(projectId ? { projectId } : {}),
                    }),
                  );
                  setAsk(null);
                }, "Analysis requested. Its observed result will appear in recent analysis.");
              }}
            >
              <label>
                Agent
                <select
                  value={ask.id}
                  onChange={(e) => setAsk(agents.find((a) => a.id === e.target.value) ?? null)}
                >
                  {agents
                    .filter((a) => a.enabled)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} · {a.role}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Project
                <select
                  aria-label="Project"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                >
                  <option value="">Workspace overview / manual question</option>
                  {projects.map((p) => (
                    <option key={p.projectId} value={p.projectId}>
                      {p.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Your question
                <textarea
                  rows={6}
                  required
                  maxLength={4000}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
              </label>
              <p>
                Sources: {ask.guardrails.sources.join(", ")}. Current project plans determine
                reported percentages; missing bindings and stale observations remain explicit.
              </p>
              <button type="submit" className="button primary" disabled={busy}>
                Run read-only analysis
              </button>
              {notice ? <p role="status">{notice}</p> : null}
            </form>
          </section>
        </WorkspaceDialog>
      ) : null}
    </div>
  );
}
