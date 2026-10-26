import type {
  DeploymentSettings,
  DeveloperConnector,
  LocalDevAction,
  LocalDevPlan,
  LocalDevSnapshot,
  LocalDevState,
} from "@frevos/contracts";
import { LocalDevPlanSchema } from "@frevos/contracts";
import { ExternalLink, Play, RotateCw, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ApiFailure, type ControlCenterApi } from "./api.js";
import { DeploymentSourceSelect } from "./DeploymentSourceSelect.js";
import { deploymentRequestId } from "./deployment-request-id.js";
import { EnvironmentVariables } from "./EnvironmentVariables.js";
import { RecordBadge, type RecordColumn, RecordWorkspace } from "./RecordWorkspace.js";
import { addBasePath } from "./routing.js";
import { WorkspaceDialog } from "./WorkspaceDialog.js";

type Connection = LocalDevState["connections"][number];
type Row = {
  profile: DeploymentSettings;
  devices: DeveloperConnector[];
  selected?: DeveloperConnector | undefined;
  connection?: Connection | undefined;
};
type Mode = "development" | "production";
type Intent =
  | { operation: "start" | "restart" | "stop"; serviceId?: string }
  | { operation: "configure"; plan: LocalDevPlan }
  | { operation: "kill-existing"; serviceId: string; identity: string };
function proposedPlan(snapshot: LocalDevSnapshot): LocalDevPlan {
  if (snapshot.plan) return structuredClone(snapshot.plan);
  const ports = new Set<number>();
  const plan: LocalDevPlan = {
    services: snapshot.candidates.slice(0, 12).map((candidate) => {
      let port =
        candidate.framework === "vite"
          ? 5173
          : candidate.framework === "cra"
            ? 3000
            : candidate.framework === "dotnet"
              ? 5062
              : 5000;
      while (ports.has(port)) port++;
      ports.add(port);
      const developmentEnvironment =
        candidate.environments.find((e) => /development|\.dev$/.test(e.reference) && !e.production)
          ?.reference ?? candidate.environments.find((e) => !e.production)?.reference;
      return {
        id: candidate.id,
        port,
        ...(candidate.recipe === "npm-script"
          ? { script: candidate.scripts.includes("dev") ? ("dev" as const) : candidate.scripts[0] }
          : {}),
        database:
          candidate.databaseHint ??
          (["vite", "cra"].includes(candidate.framework)
            ? ("none" as const)
            : ("application" as const)),
        ...(developmentEnvironment ? { developmentEnvironment } : {}),
      };
    }),
  };
  const backend = plan.services.find((s) => s.database !== "none");
  if (backend)
    for (const service of plan.services)
      if (service.database === "none") service.apiServiceId = backend.id;
  return plan;
}
export function LocalDevelopmentPage({
  api,
  workspaceId,
  scopeName,
}: {
  api: ControlCenterApi;
  workspaceId: string;
  scopeName: string;
}) {
  const [profiles, setProfiles] = useState<DeploymentSettings[]>([]),
    [devices, setDevices] = useState<DeveloperConnector[]>([]);
  const [state, setState] = useState<LocalDevState>({ connections: [], jobs: [] });
  const [userId, setUserId] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0),
    [busy, setBusy] = useState(false);
  const [choices, setChoices] = useState<Record<string, { deviceId?: string; mode?: Mode }>>({});
  const [editor, setEditor] = useState<{ row: Row; plan: LocalDevPlan } | null>(null);
  const [environmentRow, setEnvironmentRow] = useState<Row | null>(null);
  const [kill, setKill] = useState<{
    row: Row;
    service: LocalDevSnapshot["services"][number];
  } | null>(null);
  const submitting = useRef(false),
    frozen = useRef<LocalDevAction | null>(null);
  const [retry, setRetry] = useState<{ row: Row; intent: Intent } | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload is the explicit Retry generation.
  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        if (!api.localDevelopmentState) throw Error("unavailable");
        const [current, source, settings, session] = await Promise.all([
          api.localDevelopmentState(workspaceId, abort.signal),
          api.listDeveloperConnectors?.(workspaceId, abort.signal),
          api.listDeploymentSettings?.(workspaceId, abort.signal),
          api.getSession(abort.signal),
        ]);
        if (!abort.signal.aborted) {
          setState(current);
          setDevices(source ?? []);
          setProfiles(settings ?? []);
          setUserId(session.userId);
          setError("");
          setLoading(false);
        }
      } catch {
        if (!abort.signal.aborted) {
          setError("Local development connection unavailable. Last observed state is retained.");
          setState((s) => ({
            ...s,
            connections: s.connections.map((c) => ({ ...c, online: false })),
          }));
          setLoading(false);
        }
      }
      if (!abort.signal.aborted) timer = setTimeout(() => void poll(), 3000);
    };
    void poll();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [api, workspaceId, reload]);
  useEffect(() => {
    if (!userId) return;
    try {
      const saved = JSON.parse(
        sessionStorage.getItem(`frevos:${userId}:${workspaceId}:local-development:choices`) ?? "{}",
      );
      setChoices(
        saved && typeof saved === "object" && !Array.isArray(saved)
          ? (Object.fromEntries(
              Object.entries(saved).filter(
                ([, value]) =>
                  value &&
                  typeof value === "object" &&
                  [undefined, "development", "production"].includes(
                    (value as { mode?: string }).mode,
                  ),
              ),
            ) as Record<string, { deviceId?: string; mode?: Mode }>)
          : {},
      );
    } catch {
      setChoices({});
    }
  }, [userId, workspaceId]);
  useEffect(() => {
    if (
      !frozen.current ||
      !state.jobs.some((job) => job.request.requestId === frozen.current?.requestId)
    )
      return;
    frozen.current = null;
    setRetry(null);
    setEditor(null);
    setKill(null);
    setNotice("Saved action found. Service status has been reconciled without repeating it.");
  }, [state.jobs]);
  const choose = (id: string, value: { deviceId?: string; mode?: Mode }) => {
    setChoices((current) => {
      const next = { ...current, [id]: { ...current[id], ...value } };
      try {
        sessionStorage.setItem(
          `frevos:${userId}:${workspaceId}:local-development:choices`,
          JSON.stringify(next),
        );
      } catch {
        /* Optional preference storage. */
      }
      return next;
    });
  };
  const requestedProject =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("project");
  const rows: Row[] = profiles
    .filter((p) => !requestedProject || p.profileId === requestedProject)
    .map((profile) => {
      const sources = devices.filter(
        (d) => d.status === "active" && (d.profileId ?? "servix-development") === profile.profileId,
      );
      const selected =
        sources.find((d) => d.deviceId === choices[profile.profileId]?.deviceId) ??
        sources.find((d) => d.online) ??
        sources[0];
      return {
        profile,
        devices: sources,
        selected,
        connection: state.connections.find((c) => c.deviceId === selected?.deviceId),
      };
    });
  const pending = (row: Row) =>
    state.jobs.some(
      (job) =>
        job.request.deviceId === row.selected?.deviceId &&
        ["queued", "working"].includes(job.status),
    );
  const active = (row: Row) =>
    row.connection?.snapshot.services.some((s) => ["starting", "running"].includes(s.status)) ??
    false;
  const profileIssue = (row: Row, serviceId?: string) => {
    const mode = choices[row.profile.profileId]?.mode ?? "development";
    for (const service of row.connection?.snapshot.plan?.services.filter(
      (s) => !serviceId || s.id === serviceId,
    ) ?? []) {
      const candidate = row.connection?.snapshot.candidates.find((c) => c.id === service.id);
      if (service.database === "none") {
        if (mode === "production" && service.productionEnvironment && !service.apiServiceId)
          return "Select a local API for the production preview.";
        continue;
      }
      const reference =
        mode === "development" ? service.developmentEnvironment : service.productionEnvironment;
      const environment = candidate?.environments.find((e) => e.reference === reference);
      if (!reference || !environment?.databaseTarget)
        return `${candidate?.name ?? "Backend"}: choose a ${mode === "development" ? "Development DB" : "Production read-only DB"} environment.`;
      if (mode === "development" && environment.production)
        return "This profile points to the Production database. Select a separate Development DB profile.";
      if (mode === "production" && service.database === "application")
        return "Production read-only verification is unavailable for this database driver.";
    }
    return "";
  };
  const status = (row: Row) =>
    !row.connection?.online
      ? "offline"
      : !row.connection.snapshot.plan
        ? "setup"
        : row.connection.snapshot.services.some((s) =>
              ["failed", "port-conflict", "recovery-required"].includes(s.status),
            )
          ? "attention"
          : active(row)
            ? "running"
            : "stopped";
  async function act(row: Row, intent: Intent) {
    if (submitting.current || !row.connection || !api.localDevelopmentAction) return;
    submitting.current = true;
    setBusy(true);
    setNotice("");
    frozen.current ??= {
      version: 1,
      requestId: deploymentRequestId("ld"),
      deviceId: row.connection.deviceId,
      profileId: row.profile.profileId,
      expectedRevision: row.connection.snapshot.revision,
      fingerprint: row.connection.snapshot.fingerprint,
      ...intent,
      ...(["start", "restart"].includes(intent.operation)
        ? { mode: choices[row.profile.profileId]?.mode ?? "development" }
        : {}),
    } as LocalDevAction;
    try {
      const job = await api.localDevelopmentAction(workspaceId, frozen.current);
      frozen.current = null;
      setRetry(null);
      setEditor(null);
      setKill(null);
      setState((current) => ({
        ...current,
        jobs: [
          job,
          ...current.jobs.filter((j) => j.request.requestId !== job.request.requestId),
        ].slice(0, 100),
      }));
      setNotice("Request saved. Service status updates from your source computer.");
    } catch (failure) {
      if (
        failure instanceof ApiFailure &&
        [400, 401, 403, 404, 409].includes(failure.responseStatus ?? 0)
      ) {
        frozen.current = null;
        setRetry(null);
        setNotice(
          "Action was not started. Refresh connection, configuration or process status and try again.",
        );
      } else {
        setRetry({ row, intent });
        setNotice(
          "Request not confirmed. Retry retains this exact action; service status will reconcile when connected.",
        );
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  const controls = (row: Row, serviceId?: string) => {
    const disabled =
      busy || !!retry || pending(row) || !row.connection?.online || !row.connection.snapshot.plan;
    const services =
      row.connection?.snapshot.services.filter((s) => !serviceId || s.id === serviceId) ?? [];
    return (
      <div className="record-row-actions">
        <button
          className="button primary"
          type="button"
          disabled={
            disabled ||
            !!profileIssue(row, serviceId) ||
            !row.connection?.snapshot.sourceReady ||
            (services.length > 0 &&
              services.every((s) => ["running", "starting"].includes(s.status)))
          }
          onClick={() => void act(row, { operation: "start", ...(serviceId ? { serviceId } : {}) })}
        >
          <Play size={13} />
          Start{serviceId ? "" : " all"}
        </button>
        <button
          className="button secondary"
          type="button"
          disabled={
            disabled || !row.connection?.snapshot.sourceReady || !!profileIssue(row, serviceId)
          }
          onClick={() =>
            void act(row, { operation: "restart", ...(serviceId ? { serviceId } : {}) })
          }
        >
          <RotateCw size={13} />
          Restart{serviceId ? "" : " all"}
        </button>
        <button
          className="button secondary"
          type="button"
          disabled={disabled || !services.some((s) => ["running", "starting"].includes(s.status))}
          onClick={() => void act(row, { operation: "stop", ...(serviceId ? { serviceId } : {}) })}
        >
          <Square size={13} />
          Stop{serviceId ? "" : " all"}
        </button>
      </div>
    );
  };
  const selection = (row: Row) => (
    <div className="local-dev-selection">
      <DeploymentSourceSelect
        projectName={row.profile.displayName}
        devices={row.devices}
        value={row.selected?.deviceId ?? ""}
        disabled={busy || !!retry || pending(row)}
        onChange={(deviceId) => choose(row.profile.profileId, { deviceId })}
      />
      <label>
        Database profile
        <select
          aria-label={`${row.profile.displayName} database profile`}
          value={choices[row.profile.profileId]?.mode ?? "development"}
          disabled={busy || !!retry || pending(row)}
          onChange={(event) => choose(row.profile.profileId, { mode: event.target.value as Mode })}
        >
          <option value="development">Development DB</option>
          <option value="production">Production DB — read-only</option>
        </select>
      </label>
    </div>
  );
  const services = (row: Row) => (
    <div className="local-dev-services">
      {row.connection?.snapshot.plan?.services.map((service) => {
        const candidate = row.connection?.snapshot.candidates.find((c) => c.id === service.id);
        const current = row.connection?.snapshot.services.find((s) => s.id === service.id);
        return (
          <section
            className="local-dev-service"
            key={service.id}
            aria-label={candidate?.name ?? service.id}
          >
            <div className="record-card-heading">
              <div className="record-identity">
                <strong>{candidate?.name ?? service.id}</strong>
                <small>
                  {candidate?.context} · Port {service.port}
                </small>
              </div>
              <RecordBadge
                tone={
                  current?.status === "running"
                    ? "positive"
                    : current?.status === "failed" || current?.status === "port-conflict"
                      ? "negative"
                      : "neutral"
                }
              >
                {row.connection?.online
                  ? (current?.status ?? "stopped").replaceAll("-", " ")
                  : "Last observed: " + (current?.status ?? "stopped")}
              </RecordBadge>
            </div>
            {current?.mode ? (
              <small>
                {current.mode === "production"
                  ? service.database === "none"
                    ? "Production preview profile"
                    : "Production DB (read-only verified)"
                  : "Development DB"}
                {current.pid ? ` · PID ${current.pid}` : ""}
              </small>
            ) : null}
            {current?.errorCode ? (
              <p role="status" className="record-muted">
                {current.errorCode.replace("local-development-", "").replaceAll("-", " ")}
              </p>
            ) : null}
            <div className="deployment-card-footer">
              {controls(row, service.id)}
              {current?.previewUrl && current.status === "running" && row.connection?.online ? (
                <a
                  className="record-app-link"
                  href={current.previewUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open preview <ExternalLink size={13} />
                </a>
              ) : null}
            </div>
            {current?.existing ? (
              <div className="local-dev-conflict">
                <span>
                  {current.existing.name} · PID {current.existing.pid} is using this port.
                </span>
                <button
                  className="button secondary"
                  type="button"
                  disabled={
                    busy ||
                    !!retry ||
                    pending(row) ||
                    !row.connection?.online ||
                    !current.existing.projectOwned
                  }
                  onClick={() => setKill({ row, service: current })}
                >
                  Kill existing process
                </button>
                {!current.existing.projectOwned ? (
                  <small>
                    Project ownership could not be verified. Stop it from its own console.
                  </small>
                ) : null}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
  const actions = (row: Row) => (
    <div className="local-dev-project-actions">
      {controls(row)}
      <button
        className="button secondary"
        type="button"
        disabled={
          busy ||
          !!retry ||
          pending(row) ||
          !row.connection?.online ||
          !row.connection?.snapshot.sourceReady ||
          !row.connection.snapshot.candidates.length ||
          active(row)
        }
        onClick={() => {
          if (row.connection) {
            setNotice("");
            setEditor({ row, plan: proposedPlan(row.connection.snapshot) });
          }
        }}
      >
        Configure services
      </button>
      <button
        className="button secondary"
        type="button"
        disabled={
          busy ||
          !!retry ||
          pending(row) ||
          !row.connection?.online ||
          !row.connection.snapshot.sourceReady ||
          !row.connection.snapshot.environmentEditor ||
          !row.connection.snapshot.candidates.some((c) =>
            c.environments.some((e) => /^\.env(?:\.|$)/.test(e.reference)),
          )
        }
        onClick={() => setEnvironmentRow(row)}
      >
        Environment variables
      </button>
    </div>
  );
  const columns: RecordColumn<Row>[] = [
    { id: "name", label: "Project", value: (row) => row.profile.displayName },
    {
      id: "source",
      label: "Source and database",
      value: (row) => row.selected?.name ?? "Not connected",
      render: selection,
    },
    { id: "status", label: "Status", value: status },
    {
      id: "services",
      label: "Services",
      value: (row) => row.connection?.snapshot.candidates.map((c) => c.name).join(" ") ?? "",
      render: services,
    },
  ];
  if (!userId)
    return (
      <section className="record-workspace" aria-label="Local development">
        <header className="record-header">
          <h1>Local development</h1>
        </header>
        <p role="status">{error || "Loading your projects and source systems…"}</p>
        {error ? (
          <button
            type="button"
            className="button secondary"
            onClick={() => setReload((r) => r + 1)}
          >
            Retry connection
          </button>
        ) : null}
      </section>
    );
  return (
    <div className="deployments-workspace local-development-workspace">
      <RecordWorkspace
        key={`${userId}:${workspaceId}`}
        title="Local development"
        breadcrumb="Projects / Local development"
        scopeName={scopeName}
        userId={userId}
        workspaceId={workspaceId}
        page="local-development"
        records={rows}
        columns={columns}
        identify={(row) => row.profile.profileId}
        statusOf={status}
        statuses={[
          { id: "running", label: "Running" },
          { id: "stopped", label: "Stopped" },
          { id: "setup", label: "Setup required" },
          { id: "attention", label: "Needs attention" },
          { id: "offline", label: "Offline" },
        ]}
        loading={loading}
        error={error}
        notice={notice}
        onRetry={() => setReload((n) => n + 1)}
        actions={
          <>
            {requestedProject ? (
              <a className="button secondary" href={addBasePath("/projects/local-development")}>
                All projects
              </a>
            ) : null}
            {retry ? (
              <button
                className="button primary"
                type="button"
                disabled={busy}
                onClick={() => void act(retry.row, retry.intent)}
              >
                Retry saved action
              </button>
            ) : null}
            <a className="button secondary" href={addBasePath("/deployments/deploy-72")}>
              Deploy projects
            </a>
            <a className="button secondary" href={addBasePath("/downloads/frevos-connector.zip")}>
              System connector
            </a>
          </>
        }
        renderActions={actions}
        renderCard={(row) => (
          <article className="record-card local-dev-card">
            <div className="record-card-heading">
              <div className="record-identity">
                <h2>{row.profile.displayName}</h2>
                <small>{row.profile.profileId}</small>
              </div>
              <RecordBadge
                tone={
                  status(row) === "running"
                    ? "positive"
                    : status(row) === "attention"
                      ? "negative"
                      : "neutral"
                }
              >
                {status(row).replaceAll("-", " ")}
              </RecordBadge>
            </div>
            {selection(row)}
            {row.connection?.snapshot.plan && profileIssue(row) ? (
              <p className="record-muted" role="status">
                {profileIssue(row)}
              </p>
            ) : null}
            {row.connection && !row.connection.snapshot.sourceReady ? (
              <p className="record-muted" role="status">
                Source folder verification is unavailable. Reconnect or select the correct project
                folder. Running sessions can still be stopped.
              </p>
            ) : null}
            {actions(row)}
            {!row.connection ? (
              <p className="record-muted">
                Local controls have not been reported by this System connector yet.
              </p>
            ) : !row.connection.snapshot.candidates.length ? (
              <p className="record-muted">
                No supported development services were found in the selected source. Check the
                project folder and registered npm scripts or ASP.NET web project. Nested folders are
                scanned automatically; advanced scan scope can be set in devsetu.local.json.
              </p>
            ) : !row.connection.snapshot.plan ? (
              <p className="record-muted">
                Configure the discovered services once, then start them here.
              </p>
            ) : (
              <details className="local-dev-details">
                <summary>
                  Services and previews ({row.connection.snapshot.plan.services.length})
                </summary>
                {services(row)}
              </details>
            )}
            <details>
              <summary>More details</summary>
              <p className="record-muted">
                Preview opens on the source computer. Restart applies the selected database profile.
                Production database access must be verified read-only; writable access is blocked.
              </p>
              <ol className="local-dev-history">
                {state.jobs
                  .filter((job) => job.request.deviceId === row.selected?.deviceId)
                  .slice(0, 8)
                  .map((job) => (
                    <li key={job.request.requestId}>
                      {job.request.operation} · {job.status.replaceAll("-", " ")} ·{" "}
                      <time>{new Date(job.createdAt).toLocaleString()}</time>
                      {job.errorCode ? (
                        <span>
                          {" "}
                          · {job.errorCode.replace("local-development-", "").replaceAll("-", " ")}
                        </span>
                      ) : null}
                    </li>
                  ))}
              </ol>
            </details>
          </article>
        )}
      />
      {environmentRow?.connection ? (
        <EnvironmentVariables
          api={api}
          workspaceId={workspaceId}
          connection={
            state.connections.find((c) => c.deviceId === environmentRow.connection?.deviceId) ?? {
              ...environmentRow.connection,
              online: false,
            }
          }
          jobs={state.jobs}
          projectName={environmentRow.profile.displayName}
          initialMode={choices[environmentRow.profile.profileId]?.mode ?? "development"}
          onClose={() => setEnvironmentRow(null)}
        />
      ) : null}
      {editor?.row.connection ? (
        <WorkspaceDialog
          label="Configure local services"
          onClose={() => {
            if (!busy && !frozen.current) setEditor(null);
          }}
        >
          <section className="project-editor local-dev-editor">
            <header className="settings-header">
              <div>
                <p className="eyebrow">{editor.row.profile.displayName}</p>
                <h2>Local services</h2>
              </div>
              <div className="record-row-actions">
                <button
                  className="button primary"
                  type="button"
                  disabled={busy || !editor.plan.services.length}
                  onClick={() => {
                    if (retry) {
                      void act(retry.row, retry.intent);
                      return;
                    }
                    const result = LocalDevPlanSchema.safeParse(editor.plan);
                    if (!result.success) setNotice("Choose unique ports and at least one service.");
                    else void act(editor.row, { operation: "configure", plan: result.data });
                  }}
                >
                  {retry ? "Retry saved configuration" : "Save services"}
                </button>
                <button
                  className="button ghost"
                  type="button"
                  aria-label="Close local services"
                  disabled={busy || !!frozen.current}
                  onClick={() => setEditor(null)}
                >
                  <X size={18} />
                </button>
              </div>
            </header>
            <div className="project-editor-scroll">
              {notice ? <p role="status">{notice}</p> : null}
              <p className="record-muted">
                Select existing environment files on your source computer. Credentials stay local.
                Stop running services before changing this configuration.
              </p>
              {editor.row.connection.snapshot.candidates.map((candidate, index) => {
                const service = editor.plan.services.find((s) => s.id === candidate.id);
                const update = (patch: Partial<LocalDevPlan["services"][number]>) =>
                  setEditor((current) =>
                    current
                      ? {
                          ...current,
                          plan: {
                            services: current.plan.services.map((s) =>
                              s.id === candidate.id ? { ...s, ...patch } : s,
                            ),
                          },
                        }
                      : null,
                  );
                return (
                  <fieldset
                    className="settings-section local-dev-service-config"
                    disabled={busy || !!retry}
                    key={candidate.id}
                  >
                    <legend>{candidate.name}</legend>
                    <label className="local-dev-checkbox">
                      <input
                        type="checkbox"
                        aria-label={`Enable ${candidate.name}`}
                        checked={!!service}
                        disabled={busy}
                        onChange={(event) =>
                          setEditor((current) =>
                            current
                              ? {
                                  ...current,
                                  plan: {
                                    services: event.target.checked
                                      ? [
                                          ...current.plan.services,
                                          {
                                            id: candidate.id,
                                            port: 5200 + index,
                                            database: candidate.databaseHint ?? "application",
                                            ...(candidate.scripts[0]
                                              ? { script: candidate.scripts[0] }
                                              : {}),
                                          },
                                        ]
                                      : current.plan.services.filter((s) => s.id !== candidate.id),
                                  },
                                }
                              : null,
                          )
                        }
                      />
                      Run this service
                    </label>
                    <small>
                      {candidate.context} · {candidate.recipe}
                    </small>
                    {service ? (
                      <div className="local-dev-config-grid">
                        <label>
                          Port
                          <input
                            aria-label={`${candidate.name} port`}
                            type="number"
                            min={1024}
                            max={65535}
                            value={service.port}
                            disabled={busy}
                            onChange={(event) => update({ port: Number(event.target.value) })}
                          />
                        </label>
                        {candidate.recipe === "npm-script" ? (
                          <label>
                            Start script
                            <select
                              aria-label={`${candidate.name} script`}
                              value={service.script}
                              disabled={busy}
                              onChange={(event) =>
                                update({
                                  script: event.target
                                    .value as LocalDevPlan["services"][number]["script"],
                                })
                              }
                            >
                              {candidate.scripts.map((script) => (
                                <option key={script}>{script}</option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                        <label>
                          Database access
                          <select
                            aria-label={`${candidate.name} database access`}
                            value={service.database}
                            disabled={busy}
                            onChange={(event) =>
                              update({
                                database: event.target
                                  .value as LocalDevPlan["services"][number]["database"],
                              })
                            }
                          >
                            <option
                              value="none"
                              disabled={
                                ["mysql", "postgres"].includes(candidate.databaseHint ?? "") ||
                                candidate.environments.some((e) => e.databaseTarget)
                              }
                            >
                              Frontend / no direct database
                            </option>
                            <option value="mysql">MySQL</option>
                            <option value="postgres">PostgreSQL</option>
                            <option value="application">Application-managed (.NET / other)</option>
                          </select>
                        </label>
                        {(["development", "production"] as const).map((mode) => (
                          <label key={mode}>
                            {mode === "development" ? "Development" : "Production read-only"}{" "}
                            environment
                            <select
                              aria-label={`${candidate.name} ${mode} environment`}
                              value={
                                (mode === "development"
                                  ? service.developmentEnvironment
                                  : service.productionEnvironment) ?? ""
                              }
                              disabled={busy}
                              onChange={(event) =>
                                update(
                                  mode === "development"
                                    ? { developmentEnvironment: event.target.value || undefined }
                                    : { productionEnvironment: event.target.value || undefined },
                                )
                              }
                            >
                              <option value="">Not selected</option>
                              {candidate.environments
                                .filter((e) => mode === "production" || !e.production)
                                .map((e) => (
                                  <option key={e.reference} value={e.reference}>
                                    {e.reference}
                                    {e.databaseTarget ? ` · ${e.databaseTarget}` : ""}
                                  </option>
                                ))}
                            </select>
                          </label>
                        ))}
                        {service.database === "none" ? (
                          <label>
                            Local API
                            <select
                              aria-label={`${candidate.name} local API`}
                              value={service.apiServiceId ?? ""}
                              disabled={busy}
                              onChange={(event) =>
                                update({ apiServiceId: event.target.value || undefined })
                              }
                            >
                              <option value="">No API binding</option>
                              {editor.plan.services
                                .filter((s) => s.id !== service.id && s.database !== "none")
                                .map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {
                                      editor.row.connection?.snapshot.candidates.find(
                                        (c) => c.id === s.id,
                                      )?.name
                                    }
                                  </option>
                                ))}
                            </select>
                          </label>
                        ) : null}
                      </div>
                    ) : null}
                  </fieldset>
                );
              })}
            </div>
          </section>
        </WorkspaceDialog>
      ) : null}
      {kill?.service.existing ? (
        <WorkspaceDialog
          label="Stop existing local process"
          onClose={() => {
            if (!busy && !frozen.current) setKill(null);
          }}
        >
          <section className="deployment-change-dialog">
            <h2>Stop existing local process?</h2>
            <p>
              {kill.row.profile.displayName} · {kill.service.existing.name} · PID{" "}
              {kill.service.existing.pid}
            </p>
            <p className="record-muted">
              The verified project process and its children will stop. A changed process will be
              rejected.
            </p>
            <div className="record-row-actions">
              <button
                className="button secondary"
                type="button"
                disabled={busy || !!frozen.current}
                onClick={() => setKill(null)}
              >
                Cancel
              </button>
              <button
                className="button primary"
                type="button"
                disabled={busy}
                onClick={() => {
                  if (kill.service.existing)
                    void act(kill.row, {
                      operation: "kill-existing",
                      serviceId: kill.service.id,
                      identity: kill.service.existing.identity,
                    });
                }}
              >
                Stop this process
              </button>
            </div>
            {notice ? <p role="status">{notice}</p> : null}
          </section>
        </WorkspaceDialog>
      ) : null}
    </div>
  );
}
