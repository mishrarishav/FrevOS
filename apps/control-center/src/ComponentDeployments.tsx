import { useCallback, useEffect, useRef, useState } from "react";
import {
  type DeploymentChange,
  type DeveloperConnector,
  type Pipeline,
  type PipelineInput,
  PipelineInputSchema,
  type PipelineState,
  type PipelineRequest,
  type PipelineRun,
  componentOrder,
} from "@frevos/contracts";
import { LoaderCircle, Plus, X } from "lucide-react";
import { ApiFailure, type ControlCenterApi } from "./api.js";
import { WorkspaceDialog } from "./WorkspaceDialog.js";
import { RecordBadge, RecordWorkspace } from "./RecordWorkspace.js";
import { DeploymentActionDialog } from "./DeploymentActionDialog.js";
import { addBasePath } from "./routing.js";
import { deploymentRequestId } from "./deployment-request-id.js";

export function useComponents(api: ControlCenterApi, workspaceId: string, withSources = false) {
  const [state, setState] = useState<PipelineState>({ profiles: [], executors: [], runs: [] });
  const [error, setError] = useState("");
  const [devices, setDevices] = useState<DeveloperConnector[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const value = await api.componentState?.(workspaceId, controller.signal);
        const sources = withSources
          ? await api.listDeveloperConnectors?.(workspaceId, controller.signal)
          : undefined;
        if (value && !controller.signal.aborted) {
          setState(value);
          if (sources) setDevices(sources);
          setError("");
        }
      } catch {
        if (!controller.signal.aborted) {
          setError("Component connection unavailable. Requests are retained.");
          setState((current) => ({
            ...current,
            executors: current.executors.map((d) => ({ ...d, online: false })),
          }));
          setDevices((current) => current.map((d) => ({ ...d, online: false })));
        }
      }
      if (!controller.signal.aborted) timer = setTimeout(() => void poll(), 2000);
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [api, workspaceId, withSources]);
  return { state, error, devices };
}
export function currentComponent(runs: PipelineRun[], profileId: string, id: string) {
  return [...runs]
    .filter(
      (r) =>
        r.profileId === profileId &&
        r.components.some((c) => c.id === id && c.status === "succeeded"),
    )
    .sort(
      (a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.createdAt.localeCompare(a.createdAt),
    )[0];
}
export function ConfiguredProject({
  api,
  workspaceId,
  profile,
  state,
  devices,
  userId,
}: {
  api: ControlCenterApi;
  workspaceId: string;
  profile: Pipeline;
  state: PipelineState;
  devices: DeveloperConnector[];
  userId: string;
}) {
  const [connectorId, setConnectorId] = useState("");
  const [closing, setClosing] = useState<PipelineRun | null>(null);
  const closeDetails = useRef<DeploymentChange | undefined>(undefined);
  const [confirmation, setConfirmation] = useState<{
    operation: "deploy" | "rollback";
    componentId?: string;
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const frozen = useRef<PipelineRequest | null>(null),
    submitting = useRef(false);
  const active = state.runs.find(
    (r) =>
      r.profileId === profile.profileId &&
      ["publishing", "running", "recovery-required"].includes(r.status),
  );
  const source = devices.filter(
    (d) => d.profileId === profile.profileId && d.status === "active" && d.userId === userId,
  );
  const selected = source.find(
    (d) => d.deviceId === (connectorId || source.find((d) => d.online)?.deviceId),
  );
  const latest = state.runs.find((r) => r.profileId === profile.profileId);
  const sourceReady =
    !!selected?.online &&
    !!selected.changeNotes &&
    selected.source?.origin === profile.repository.origin &&
    selected.source.repositoryId === profile.repository.id &&
    selected.source.remoteName === profile.repository.remoteName &&
    !["main", "master"].includes(selected.source.branch);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  const ready = (id?: string) =>
    profile.components
      .filter((c) => !id || c.id === id)
      .every(
        (c) =>
          state.executors.some(
            (d) =>
              d.id === c.builderId &&
              d.profileId === profile.profileId &&
              d.role === "builder" &&
              d.online &&
              d.bindings.some((b) => b.recipes.includes(c.recipe)),
          ) &&
          state.executors.some(
            (d) =>
              d.id === c.destinationId &&
              d.profileId === profile.profileId &&
              d.role === "destination" &&
              d.online &&
              d.bindings.some((b) => b.id === c.destinationBinding && b.recipes.includes(c.recipe)),
          ),
      );
  const rollbackReady = (id?: string) =>
    profile.components
      .filter((c) => !id || c.id === id)
      .every(
        (c) =>
          !!currentComponent(state.runs, profile.profileId, c.id)?.components.find(
            (x) => x.id === c.id,
          )?.previousRunId &&
          state.executors.some(
            (d) =>
              d.id === c.destinationId &&
              d.profileId === profile.profileId &&
              d.role === "destination" &&
              d.online &&
              d.bindings.some((b) => b.id === c.destinationBinding && b.recipes.includes(c.recipe)),
          ),
      );
  async function submit(changeDetails: DeploymentChange) {
    if (!confirmation || !api.runPipeline || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setNotice("");
    frozen.current ??= {
      requestId: deploymentRequestId("pr"),
      profileId: profile.profileId,
      expectedRevision: profile.revision,
      operation: confirmation.operation,
      ...(confirmation.componentId ? { componentId: confirmation.componentId } : {}),
      ...(selected ? { connectorId: selected.deviceId } : {}),
      expectedCurrent: Object.fromEntries(
        profile.components
          .filter((c) => !confirmation.componentId || c.id === confirmation.componentId)
          .map((c) => [
            c.id,
            currentComponent(state.runs, profile.profileId, c.id)?.requestId ?? null,
          ]),
      ),
      changeDetails,
    };
    try {
      await api.runPipeline(workspaceId, frozen.current);
      frozen.current = null;
      setConfirmation(null);
    } catch (error) {
      if (
        error instanceof ApiFailure &&
        [400, 401, 403, 404, 409].includes(error.responseStatus ?? 0)
      ) {
        frozen.current = null;
        setNotice(
          "Action was not started. Check saved configuration, source and component connections.",
        );
      } else setNotice("Request not confirmed. Retry retains this exact action and change record.");
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  }
  async function closeBuild(details: DeploymentChange) {
    if (!closing?.sourceHead || !api.closeInterruptedBuild || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setNotice("");
    closeDetails.current ??= details;
    try {
      await api.closeInterruptedBuild(workspaceId, {
        requestId: closing.requestId,
        sourceHead: closing.sourceHead,
        changeDetails: closeDetails.current,
      });
      closeDetails.current = undefined;
      setClosing(null);
    } catch (error) {
      if (
        error instanceof ApiFailure &&
        [400, 401, 403, 404, 409].includes(error.responseStatus ?? 0)
      )
        closeDetails.current = undefined;
      setNotice(
        "Build was not confirmed closed. Only an interrupted build without an artifact or destination job can be closed.",
      );
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  }
  const actions = (id?: string) => (
    <div className="record-row-actions">
      <button
        className="button primary"
        type="button"
        disabled={busy || !!active || !sourceReady || !ready(id) || profile.archived}
        onClick={() => setConfirmation({ operation: "deploy", ...(id ? { componentId: id } : {}) })}
      >
        Deploy{id ? "" : " all"}
      </button>
      <button
        className="button secondary"
        type="button"
        disabled={busy || !!active || !rollbackReady(id) || profile.archived}
        onClick={() =>
          setConfirmation({ operation: "rollback", ...(id ? { componentId: id } : {}) })
        }
      >
        Rollback{id ? "" : " all"}
      </button>
    </div>
  );
  return (
    <>
      <div className="record-facts">
        <RecordBadge
          tone={active ? "warning" : latest?.status === "succeeded" ? "positive" : "neutral"}
        >
          {active?.status ?? latest?.status ?? "Configured"}
        </RecordBadge>
        <RecordBadge tone={selected?.online ? "positive" : "negative"}>
          System {selected?.online ? "online" : "offline"}
        </RecordBadge>
        <RecordBadge>{profile.components.length} components</RecordBadge>
        <RecordBadge>Revision {profile.revision}</RecordBadge>
      </div>
      <div className="record-card-heading">
        <label>
          Source system{" "}
          <select
            aria-label={`${profile.displayName} source system`}
            disabled={busy || !!active}
            value={selected?.deviceId ?? ""}
            onChange={(e) => setConnectorId(e.target.value)}
          >
            <option value="">Choose system</option>
            {source.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.name} — {d.online ? "Online" : "Offline"}
              </option>
            ))}
          </select>
        </label>
        {actions()}
      </div>
      {active ? (
        <p role="status">
          <LoaderCircle size={14} className="deployment-spinner" /> {active.status} ·{" "}
          {Math.max(0, Math.floor((now - Date.parse(active.createdAt)) / 1000))}s
        </p>
      ) : null}
      {active?.status === "recovery-required" &&
      active.requestedBy === userId &&
      active.components.every((c) => !c.artifactDigest && c.status !== "succeeded") ? (
        <button
          className="button secondary"
          type="button"
          disabled={busy}
          onClick={() => {
            setNotice("");
            setClosing(active);
          }}
        >
          Close interrupted build
        </button>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
      <details>
        <summary>Components, connections and history</summary>
        <p className="record-muted">
          Deploy all follows dependencies. A failed component blocks its dependents; successful
          components remain deployed. Rollback restores code and preserves persistent data.
        </p>
        {componentOrder(profile.components).map((id) => {
          const c = profile.components.find((c) => c.id === id)!;
          const target = state.executors.find((d) => d.id === c.destinationId);
          const builder = state.executors.find((d) => d.id === c.builderId),
            binding = target?.bindings.find((b) => b.id === c.destinationBinding);
          const result = latest?.components.find((r) => r.id === id);
          return (
            <section key={id} className="settings-section">
              <h3>{c.name}</h3>
              <div className="record-facts">
                <RecordBadge>{c.recipe}</RecordBadge>
                <RecordBadge tone={builder?.online ? "positive" : "negative"}>
                  Builder {builder?.online ? "online" : "offline"}
                </RecordBadge>
                <RecordBadge tone={target?.online ? "positive" : "negative"}>
                  Destination {target?.online ? "online" : "offline"}
                </RecordBadge>
                <RecordBadge>
                  {target?.name ?? "Unassigned"} / {c.destinationBinding}
                </RecordBadge>
                <RecordBadge>{result?.status ?? "No deployment"}</RecordBadge>
                <RecordBadge>{c.preservedPaths.length} protected paths</RecordBadge>
              </div>
              <p className="record-muted">
                {binding
                  ? `${target?.systemName} · ${binding.root} · ${binding.healthUrl}`
                  : "Destination binding not enrolled"}
              </p>
              <p className="record-muted">
                Current build:{" "}
                {currentComponent(state.runs, profile.profileId, c.id)
                  ?.components.find((r) => r.id === c.id)
                  ?.artifactDigest?.slice(0, 12) ?? "Not deployed"}
              </p>
              {result?.errorCode ? <p role="status">{result.errorCode}</p> : null}
              {c.siteUrl ? (
                <a className="button secondary" href={c.siteUrl} target="_blank" rel="noreferrer">
                  Open component
                </a>
              ) : null}
              {actions(id)}
            </section>
          );
        })}
        {state.runs
          .filter((r) => r.profileId === profile.profileId)
          .slice(0, 10)
          .map((r) => (
            <p key={r.requestId}>
              <strong>{r.status}</strong> · {new Date(r.createdAt).toLocaleString()}
              <br />
              {r.changeDetails.message}
              <br />
              Approval: {r.changeDetails.approvedBy} · Actor: {r.requestedBy}
              <br />
              {r.sourceHead?.slice(0, 12)}
              {r.buildResolution ? (
                <>
                  <br />
                  Build closed by {r.buildResolution.resolvedBy}:{" "}
                  {r.buildResolution.changeDetails.message}
                </>
              ) : null}
            </p>
          ))}
      </details>
      <a
        className="button secondary"
        href={addBasePath(`/projects/components?project=${encodeURIComponent(profile.profileId)}`)}
      >
        Component configuration
      </a>
      {confirmation ? (
        <DeploymentActionDialog
          projectName={
            profile.displayName +
            (confirmation.componentId ? ` / ${confirmation.componentId}` : " / All components")
          }
          operation={confirmation.operation}
          initial={frozen.current?.changeDetails}
          locked={!!frozen.current}
          busy={busy}
          notice={notice}
          onConfirm={(d) => void submit(d)}
          onClose={() => {
            if (!busy && !frozen.current) setConfirmation(null);
          }}
        />
      ) : null}
      {closing ? (
        <DeploymentActionDialog
          projectName={profile.displayName}
          operation="close-build"
          initial={closeDetails.current}
          locked={!!closeDetails.current}
          busy={busy}
          notice={notice}
          onConfirm={(d) => void closeBuild(d)}
          onClose={() => {
            if (!busy && !closeDetails.current) setClosing(null);
          }}
        />
      ) : null}
    </>
  );
}
function blank(): PipelineInput {
  return {
    version: 1,
    profileId: "",
    expectedRevision: 0,
    displayName: "",
    sourceFolder: "D:\\myProject",
    sourcePreservedPaths: [],
    archived: false,
    components: [
      {
        id: "frontend",
        name: "Frontend",
        context: "frontend",
        recipe: "npm-static",
        output: "build",
        builderId: "unassigned",
        destinationId: "unassigned",
        destinationBinding: "frontend",
        dependsOn: [],
        preservedPaths: ["uploads", "attachment", ".env"],
      },
    ],
  };
}
export function ComponentConfiguration({
  api,
  workspaceId,
  scopeName,
}: {
  api: ControlCenterApi;
  workspaceId: string;
  scopeName: string;
}) {
  const { state, error, devices } = useComponents(api, workspaceId, true);
  const [form, setForm] = useState<PipelineInput | null>(null),
    [baseline, setBaseline] = useState("");
  const [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [userId, setUserId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const sourceDevices = devices.filter(
    (d) => d.profileId === form?.profileId && d.userId === userId && d.status === "active",
  );
  const selectedSource = sourceDevices.find(
    (d) => d.deviceId === (sourceId || sourceDevices.find((d) => d.online)?.deviceId),
  );
  const opened = useRef(false);
  const rowKeys = useRef<string[]>([]);
  const rowKey = (index: number) => {
    let key = rowKeys.current[index];
    if (!key) {
      key = deploymentRequestId("pr");
      rowKeys.current[index] = key;
    }
    return key;
  };
  const edit = useCallback((profile: Pipeline) => {
    const { revision, repository: _, updatedAt: _at, updatedBy: _by, ...fields } = profile;
    const value = { ...fields, expectedRevision: revision };
    setForm(value);
    setBaseline(JSON.stringify(value));
    setNotice("");
    rowKeys.current = profile.components.map(() => deploymentRequestId("pr"));
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void api
      .getSession(controller.signal)
      .then((s) => setUserId(s.userId))
      .catch(() => {});
    return () => controller.abort();
  }, [api]);
  useEffect(() => {
    if (opened.current) return;
    const id = new URLSearchParams(location.search).get("project"),
      profile = state.profiles.find((p) => p.profileId === id);
    if (profile) {
      edit(profile);
      opened.current = true;
    }
  }, [state, edit]);
  function close() {
    if (busy) return;
    if (form && JSON.stringify(form) !== baseline) {
      setNotice("Unsaved changes. Save or use Discard and close.");
      return;
    }
    setForm(null);
  }
  async function save() {
    if (!form || busy || !api.savePipeline) return;
    const parsed = PipelineInputSchema.safeParse(form);
    if (!parsed.success) {
      setNotice(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
      return;
    }
    setBusy(true);
    try {
      const profile = await api.savePipeline(workspaceId, parsed.data);
      edit(profile);
      setNotice(
        "Configuration saved. Install or reconnect the System connector, then verify the live source, builder and destination badges before deploying.",
      );
    } catch {
      setNotice("Configuration was not saved. Check revision, permissions and active deployments.");
    } finally {
      setBusy(false);
    }
  }
  const owner = userId === "usr_windows_admin";
  async function connectionAction(action: "test" | "folder") {
    if (!form || !selectedSource || busy) return;
    setBusy(true);
    setNotice("");
    try {
      if (action === "test") {
        if (JSON.stringify(form) !== baseline) {
          setNotice("Save the current configuration before testing.");
          return;
        }
        const result = await api.testPipeline?.(
          workspaceId,
          form.profileId,
          selectedSource.deviceId,
        );
        setNotice(
          result
            ? result.checks.map((c) => `${c.name}: ${c.status} — ${c.message}`).join("\n")
            : "Connection testing unavailable.",
        );
      } else {
        await api.chooseConnectorFolder?.(workspaceId, selectedSource.deviceId);
        setNotice(
          "Choose the Git folder in the native dialog on your source system. The selected path appears below after completion.",
        );
      }
    } catch {
      setNotice(
        "Connection action was not confirmed. Check the selected system and saved project.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <RecordWorkspace
        title="Components"
        breadcrumb="Projects / Component configuration"
        scopeName={scopeName}
        workspaceId={workspaceId}
        userId={userId}
        page="component-master"
        records={state.profiles}
        identify={(p) => p.profileId}
        statusOf={(p) => (p.archived ? "archived" : "configured")}
        statuses={[
          { id: "configured", label: "Configured" },
          { id: "archived", label: "Archived" },
        ]}
        defaultView="table"
        error={error}
        columns={[
          { id: "name", label: "Project", value: (p) => p.displayName },
          { id: "source", label: "Source folder", value: (p) => p.sourceFolder },
          {
            id: "components",
            label: "Components",
            value: (p) => p.components.map((c) => `${c.name} (${c.recipe})`).join(", "),
          },
          { id: "revision", label: "Revision", value: (p) => String(p.revision) },
        ]}
        actions={
          <>
            <a className="button secondary" href={addBasePath("/projects/configuration")}>
              Projects
            </a>
            <a className="button secondary" href={addBasePath("/downloads/frevos-connector.zip")}>
              Download System connector
            </a>
            {owner ? (
              <button
                className="button primary"
                type="button"
                onClick={() => {
                  const value = blank();
                  setForm(value);
                  setBaseline(JSON.stringify(value));
                  setNotice("");
                }}
              >
                <Plus size={14} /> Add component project
              </button>
            ) : null}
          </>
        }
        renderActions={(p) => (
          <button className="button secondary" type="button" onClick={() => edit(p)}>
            {owner ? "Configure" : "View"}
          </button>
        )}
        renderCard={(p) => (
          <article className="record-card">
            <h3>{p.displayName}</h3>
            <p>
              {p.components.length} components · {p.sourceFolder}
            </p>
            <button className="button secondary" type="button" onClick={() => edit(p)}>
              Configure
            </button>
          </article>
        )}
      />
      {form ? (
        <WorkspaceDialog label="Component configuration" onClose={close}>
          <div className="deployment-settings project-editor">
            <header className="settings-header">
              <div>
                <p className="eyebrow">Projects / Configuration</p>
                <h2>{form.displayName || "New project"}</h2>
              </div>
              <div className="record-row-actions">
                {owner ? (
                  <button
                    className="button primary"
                    type="button"
                    disabled={busy}
                    onClick={() => void save()}
                  >
                    Save configuration
                  </button>
                ) : null}
                <button
                  className="button ghost"
                  type="button"
                  aria-label="Close component configuration"
                  disabled={busy}
                  onClick={close}
                >
                  <X size={18} />
                </button>
              </div>
            </header>
            <div className="project-editor-scroll">
              {notice ? <p role="status">{notice}</p> : null}
              <button
                className="button ghost"
                type="button"
                disabled={busy}
                onClick={() => setForm(null)}
              >
                Discard and close
              </button>
              <section className="settings-section">
                <h3>System connector</h3>
                <label>
                  Source system
                  <select
                    value={selectedSource?.deviceId ?? ""}
                    onChange={(e) => setSourceId(e.target.value)}
                    disabled={busy}
                  >
                    <option value="">Choose your system</option>
                    {sourceDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.name} — {d.online ? "Online" : "Offline"}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="record-row-actions">
                  <a
                    className="button secondary"
                    href={addBasePath("/downloads/frevos-connector.zip")}
                  >
                    Download connector
                  </a>
                  <button
                    className="button secondary"
                    type="button"
                    disabled={busy || !selectedSource?.online || !selectedSource.folderPicker}
                    onClick={() => void connectionAction("folder")}
                  >
                    Choose folder
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    disabled={busy || !selectedSource?.online || !form.expectedRevision}
                    onClick={() => void connectionAction("test")}
                  >
                    Test connections
                  </button>
                </div>
                <p className="record-muted">
                  {selectedSource?.folderSelection?.source?.repository ??
                    selectedSource?.source?.repository ??
                    "Run Setup.cmd once on the source system. Use Setup-Executor.cmd on each build or destination system."}
                </p>
                {selectedSource?.folderSelection?.status === "selected" &&
                selectedSource.folderSelection.source &&
                owner ? (
                  <button
                    className="button ghost"
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        sourceFolder: selectedSource.folderSelection!.source!.repository,
                      })
                    }
                  >
                    Use selected folder as default
                  </button>
                ) : null}
              </section>
              <fieldset disabled={!owner || busy}>
                <div className="settings-grid">
                  <label>
                    Project ID
                    <input
                      value={form.profileId}
                      disabled={form.expectedRevision > 0}
                      onChange={(e) => setForm({ ...form, profileId: e.target.value })}
                    />
                  </label>
                  <label>
                    Project name
                    <input
                      value={form.displayName}
                      onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                    />
                  </label>
                  <label>
                    Local Git folder
                    <input
                      value={form.sourceFolder}
                      onChange={(e) => setForm({ ...form, sourceFolder: e.target.value })}
                    />
                  </label>
                  <label>
                    Skip source paths when publishing (relative to Git root, one per line)
                    <textarea
                      rows={3}
                      value={form.sourcePreservedPaths.join("\n")}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          sourcePreservedPaths: e.target.value
                            .split(/\r?\n/)
                            .map((v) => v.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={form.archived}
                      onChange={(e) => setForm({ ...form, archived: e.target.checked })}
                    />{" "}
                    Archived
                  </label>
                </div>
                <p className="record-muted">
                  Save first and download the System connector. Use Setup.cmd on the source system
                  and Setup-Executor.cmd for a build system or destination server. Choose the Git
                  folder on the source system. Enroll each server once, then select its connection
                  below. Credentials and runtime task identity stay on that system.
                </p>
                {form.components.map((component, index) => {
                  const update = (value: Partial<typeof component>) =>
                    setForm({
                      ...form,
                      components: form.components.map((c, i) =>
                        i === index ? { ...c, ...value } : c,
                      ),
                    });
                  return (
                    <section className="settings-section" key={rowKey(index)}>
                      <h3>Component {index + 1}</h3>
                      <div className="settings-grid">
                        <label>
                          ID
                          <input
                            value={component.id}
                            onChange={(e) => update({ id: e.target.value })}
                          />
                        </label>
                        <label>
                          Name
                          <input
                            value={component.name}
                            onChange={(e) => update({ name: e.target.value })}
                          />
                        </label>
                        <label>
                          Source subfolder
                          <input
                            value={component.context}
                            onChange={(e) => update({ context: e.target.value })}
                          />
                        </label>
                        <label>
                          Build recipe
                          <select
                            value={component.recipe}
                            onChange={(e) =>
                              update({ recipe: e.target.value as typeof component.recipe })
                            }
                          >
                            <option value="npm-static">React / Angular / static npm build</option>
                            <option value="node-source">
                              Node source (existing runtime dependencies)
                            </option>
                            <option value="dotnet-publish">.NET publish</option>
                            <option value="devsetu-native">DevSetu native platform</option>
                          </select>
                        </label>
                        <label>
                          Output folder
                          <input
                            value={component.output}
                            onChange={(e) => update({ output: e.target.value })}
                          />
                        </label>
                        <label>
                          Application URL (optional)
                          <input
                            type="url"
                            placeholder="https://app.example/"
                            value={component.siteUrl ?? ""}
                            onChange={(e) => update({ siteUrl: e.target.value || undefined })}
                          />
                        </label>
                        <label>
                          Build system
                          <select
                            value={component.builderId}
                            onChange={(e) => update({ builderId: e.target.value })}
                          >
                            <option value="unassigned">Choose connection</option>
                            {state.executors
                              .filter(
                                (d) =>
                                  d.profileId === form.profileId &&
                                  d.role === "builder" &&
                                  d.status === "active",
                              )
                              .map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.name} — {d.online ? "Online" : "Offline"}
                                </option>
                              ))}
                          </select>
                        </label>
                        <label>
                          Destination server
                          <select
                            value={component.destinationId}
                            onChange={(e) => update({ destinationId: e.target.value })}
                          >
                            <option value="unassigned">Choose connection</option>
                            {state.executors
                              .filter(
                                (d) =>
                                  d.profileId === form.profileId &&
                                  d.role === "destination" &&
                                  d.status === "active",
                              )
                              .map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.name} — {d.online ? "Online" : "Offline"}
                                </option>
                              ))}
                          </select>
                        </label>
                        <label>
                          Destination binding
                          <select
                            value={component.destinationBinding}
                            onChange={(e) => update({ destinationBinding: e.target.value })}
                          >
                            <option value={component.destinationBinding}>
                              {component.destinationBinding}
                            </option>
                            {state.executors
                              .find((d) => d.id === component.destinationId)
                              ?.bindings.filter((b) => b.id !== component.destinationBinding)
                              .map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.id} — {b.root}
                                </option>
                              ))}
                          </select>
                        </label>
                        <label>
                          Deploy after (component IDs, comma separated)
                          <input
                            value={component.dependsOn.join(", ")}
                            onChange={(e) =>
                              update({
                                dependsOn: e.target.value
                                  .split(",")
                                  .map((v) => v.trim())
                                  .filter(Boolean),
                              })
                            }
                          />
                        </label>
                        <label>
                          Protected files / folders (one per line)
                          <textarea
                            rows={4}
                            value={component.preservedPaths.join("\n")}
                            onChange={(e) =>
                              update({
                                preservedPaths: e.target.value
                                  .split(/\r?\n/)
                                  .map((v) => v.trim())
                                  .filter(Boolean),
                              })
                            }
                          />
                        </label>
                      </div>
                      <button
                        className="button ghost"
                        type="button"
                        disabled={form.components.length === 1}
                        onClick={() => {
                          rowKeys.current.splice(index, 1);
                          setForm({
                            ...form,
                            components: form.components.filter((_, i) => i !== index),
                          });
                        }}
                      >
                        Remove component
                      </button>
                    </section>
                  );
                })}
                <button
                  className="button secondary"
                  type="button"
                  disabled={form.components.length >= 32}
                  onClick={() =>
                    setForm({
                      ...form,
                      components: [
                        ...form.components,
                        {
                          ...blank().components[0]!,
                          id: `service-${form.components.length + 1}`,
                          name: `Service ${form.components.length + 1}`,
                          context: ".",
                          output: ".",
                          recipe: "node-source",
                          destinationBinding: `service-${form.components.length + 1}`,
                        },
                      ],
                    })
                  }
                >
                  Add component
                </button>
                <section className="settings-section">
                  <h3>Enrolled systems</h3>
                  {state.executors
                    .filter((d) => d.profileId === form.profileId)
                    .map((d) => (
                      <div className="record-card-heading" key={d.id}>
                        <span>
                          {d.name} · {d.role} ·{" "}
                          {d.status === "revoked" ? "Revoked" : d.online ? "Online" : "Offline"}
                        </span>
                        {owner && d.status === "active" ? (
                          <button
                            className="button ghost"
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setBusy(true);
                              void api
                                .revokeExecutor?.(workspaceId, d.id)
                                .then(() => setNotice("System connection revoked."))
                                .catch(() => setNotice("Revocation was not confirmed."))
                                .finally(() => setBusy(false));
                            }}
                          >
                            Revoke
                          </button>
                        ) : null}
                      </div>
                    ))}
                </section>
              </fieldset>
            </div>
          </div>
        </WorkspaceDialog>
      ) : null}
    </>
  );
}
