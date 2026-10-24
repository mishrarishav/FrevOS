import type {
  DeploymentChange,
  DeploymentSettings,
  DeveloperConnector,
  ServixDeployment,
  ServixDeploymentState,
} from "@frevos/contracts";
import { matchesDeploymentRepository } from "@frevos/contracts";
import { ExternalLink, LoaderCircle, Rocket, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ApiFailure, type ControlCenterApi } from "./api.js";
import { ConfiguredProject, currentComponent, useComponents } from "./ComponentDeployments.js";
import { DeploymentActionDialog } from "./DeploymentActionDialog.js";
import { DeploymentSourceSelect } from "./DeploymentSourceSelect.js";
import { deploymentRequestId } from "./deployment-request-id.js";
import { RecordBadge, type RecordColumn, RecordWorkspace } from "./RecordWorkspace.js";
import { addBasePath } from "./routing.js";
import { mergeServixDeploymentState } from "./servix-deployment-state.js";

export function DeploymentsPage({
  api,
  workspaceId,
  scopeName = "Current workspace",
}: {
  api: ControlCenterApi;
  workspaceId: string;
  scopeName?: string;
}) {
  const configured = useComponents(api, workspaceId);
  const [state, setState] = useState<ServixDeploymentState | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [devices, setDevices] = useState<DeveloperConnector[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [profiles, setProfiles] = useState<DeploymentSettings[]>([]);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [submittedAt, setSubmittedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const submitting = useRef(false);
  const [confirmation, setConfirmation] = useState<{
    restoreRequestId: string | undefined;
    operation: "deploy" | "rollback" | "restore";
    currentRequestId: string | undefined;
  } | null>(null);
  const intent = useRef<{
    restoreRequestId: string | undefined;
    operation: "rollback" | "restore";
    currentRequestId: string | undefined;
    changeDetails: DeploymentChange;
    deviceId: string;
  } | null>(null);
  const [submittedOperation, setSubmittedOperation] = useState("deploy");
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload is the explicit Retry generation.
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      api.listDeploymentSettings?.(workspaceId, controller.signal),
      api.getSession(controller.signal),
    ])
      .then(([items, session]) => {
        if (!controller.signal.aborted) {
          setProfiles(items ?? []);
          setUserId(session.userId);
          setLoadError("");
          setLoading(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setLoadError("Check the workspace connection, then retry.");
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [api, workspaceId, reload]);
  const pending = useRef<string | undefined>(undefined);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const [deployment, connection] = await Promise.allSettled([
          api.getServixDeploymentState?.(workspaceId, controller.signal),
          api.listDeveloperConnectors?.(workspaceId, controller.signal),
        ]);
        const next = deployment.status === "fulfilled" ? deployment.value : undefined;
        const connected = connection.status === "fulfilled" ? connection.value : undefined;
        if (connection.status === "rejected" && !controller.signal.aborted)
          setDevices((current) => current.map((d) => ({ ...d, online: false })));
        if (connected && !controller.signal.aborted) {
          setDevices(connected);
          setDeviceId(
            (current) =>
              current ||
              connected.find(
                (d) =>
                  d.status === "active" &&
                  (d.profileId ?? "servix-development") === "servix-development",
              )?.deviceId ||
              "",
          );
        }
        if (next && !controller.signal.aborted) {
          setState((current) => mergeServixDeploymentState(current, next));
          if (pending.current && next.runs.some((run) => run.requestId === pending.current)) {
            pending.current = undefined;
            intent.current = null;
            setConfirmation(null);
            setNotice("");
          }
        }
      } catch {
        if (!controller.signal.aborted)
          setNotice("Connection unavailable. Your deployment request is retained.");
      }
      if (!controller.signal.aborted) timer = setTimeout(() => void poll(), 2000);
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [api, workspaceId]);
  function openConfirmation(
    restoreRequestId?: string,
    operation: "rollback" | "restore" = "restore",
  ) {
    if (pending.current && intent.current?.restoreRequestId !== restoreRequestId) {
      setNotice("An earlier request is unconfirmed. Retry that same action first.");
      return;
    }
    setConfirmation({
      restoreRequestId,
      operation: restoreRequestId ? operation : "deploy",
      currentRequestId: state?.currentRequestId,
    });
  }
  async function deploy(
    changeDetails: DeploymentChange,
    restoreRequestId?: string,
    operation: "rollback" | "restore" = "restore",
  ) {
    if (
      !api.deployServix ||
      submitting.current ||
      (restoreRequestId && (!api.restoreServix || !state?.currentRequestId))
    )
      return;
    if (pending.current && intent.current?.restoreRequestId !== restoreRequestId) {
      setNotice("An earlier request is unconfirmed. Retry that same action first.");
      return;
    }
    intent.current ??= {
      restoreRequestId,
      operation,
      currentRequestId: confirmation?.currentRequestId,
      changeDetails,
      deviceId,
    };
    const action = intent.current;
    submitting.current = true;
    setBusy(true);
    setSubmittedOperation(restoreRequestId ? operation : "deploy");
    setSubmittedAt(Date.now());
    setNotice("");
    try {
      pending.current ??= deploymentRequestId();
      let run: ServixDeployment;
      if (action.restoreRequestId) {
        if (!action.currentRequestId || !api.restoreServix) throw new ApiFailure("unavailable");
        run = await api.restoreServix(
          workspaceId,
          pending.current,
          action.currentRequestId,
          action.restoreRequestId,
          action.operation,
          action.changeDetails,
        );
      } else
        run = await api.deployServix(
          workspaceId,
          pending.current,
          action.changeDetails,
          action.deviceId,
        );
      setState((current) =>
        current ? mergeServixDeploymentState(current, { ...current, runs: [run] }) : current,
      );
      pending.current = undefined;
      intent.current = null;
      setConfirmation(null);
      setNotice("");
    } catch (error) {
      if (
        error instanceof ApiFailure &&
        (error.kind === "denied" || [400, 401, 403, 404, 409].includes(error.responseStatus ?? 0))
      ) {
        pending.current = undefined;
        intent.current = null;
        setNotice(
          "Action was not started. Check the current release and saved build, then try again.",
        );
      } else
        setNotice(
          "Request not confirmed. Retry checks the same request; it does not start a duplicate.",
        );
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  }
  const active = state?.runs.some((run) =>
    ["publishing", "building", "activating", "recovery-required"].includes(run.status),
  );
  const running = state?.runs.find((run) =>
    ["publishing", "building", "activating"].includes(run.status),
  );
  const progressing = busy || !!running;
  useEffect(() => {
    if (!progressing) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [progressing]);
  const elapsed = Math.max(
    0,
    Math.floor((now - (running ? Date.parse(running.createdAt) : (submittedAt ?? now))) / 1000),
  );
  const stage =
    running?.status === "publishing"
      ? "Publishing your code"
      : running?.status === "building"
        ? "Building frontend"
        : running?.status === "activating"
          ? running.operation && running.operation !== "deploy"
            ? "Restoring saved build and checking server21"
            : "Deploying and checking server21"
          : submittedOperation === "deploy"
            ? "Submitting deployment"
            : "Submitting restore";

  const visible = [
    ...profiles.filter((p) => !configured.state.profiles.some((c) => c.profileId === p.profileId)),
    ...configured.state.profiles.map((p): DeploymentSettings => {
      const destination = configured.state.executors.find(
          (e) => e.id === p.components[0]?.destinationId,
        ),
        binding = destination?.bindings.find((b) => b.id === p.components[0]?.destinationBinding);
      return {
        version: 1,
        profileId: p.profileId,
        displayName: p.displayName,
        sourceFolder: p.sourceFolder,
        repositoryOrigin: p.repository.origin,
        revision: p.revision,
        updatedAt: p.updatedAt,
        updatedBy: p.updatedBy,
        archived: p.archived,
        runner: "configured-components",
        preservedPaths: [...new Set(p.components.flatMap((c) => c.preservedPaths))],
        destination: {
          host: destination?.name ?? "Unassigned",
          root: binding?.root ?? p.sourceFolder,
          siteUrl:
            p.components[0]?.siteUrl ??
            (binding ? new URL(binding.healthUrl).origin + "/" : "http://unconfigured/"),
          credentialProfile: "not-connected",
        },
      };
    }),
  ].filter((p) => !p.archived);
  const configuredCard = (p: DeploymentSettings) => {
    const profile = configured.state.profiles.find((c) => c.profileId === p.profileId);
    return profile ? (
      <ConfiguredProject
        api={api}
        workspaceId={workspaceId}
        profile={profile}
        state={configured.state}
        devices={devices}
        userId={userId}
      />
    ) : null;
  };
  const sourceDevice = devices.find((d) => d.deviceId === deviceId && d.status === "active");
  const sourceReady =
    !!sourceDevice?.online &&
    !!sourceDevice.changeNotes &&
    !!sourceDevice.source &&
    (sourceDevice.profileId ?? "servix-development") === "servix-development" &&
    !!profiles.find(
      (p) =>
        p.profileId === "servix-development" && matchesDeploymentRepository(p, sourceDevice.source),
    ) &&
    !["queued", "choosing"].includes(sourceDevice.folderSelection?.status ?? "") &&
    !["main", "master"].includes(sourceDevice.source.branch);
  const isPlatform = (p: DeploymentSettings) => p.runner === "devsetu-platform";
  const componentStatus = (p: DeploymentSettings) => {
    const profile = configured.state.profiles.find((c) => c.profileId === p.profileId);
    if (!profile) return undefined;
    const latest = configured.state.runs.find((r) => r.profileId === p.profileId);
    if (latest && ["publishing", "running"].includes(latest.status)) return "running";
    if (latest && ["failed", "partial", "recovery-required"].includes(latest.status))
      return "attention";
    const source = devices.find(
      (d) =>
        d.profileId === p.profileId &&
        d.userId === userId &&
        d.online &&
        d.changeNotes &&
        d.source?.origin === profile.repository.origin &&
        d.source.repositoryId === profile.repository.id &&
        !["main", "master"].includes(d.source.branch),
    );
    return source &&
      profile.components.every(
        (c) =>
          configured.state.executors.some(
            (e) =>
              e.id === c.builderId &&
              e.profileId === p.profileId &&
              e.role === "builder" &&
              e.online &&
              e.bindings.some((b) => b.recipes.includes(c.recipe)),
          ) &&
          configured.state.executors.some(
            (e) =>
              e.id === c.destinationId &&
              e.profileId === p.profileId &&
              e.role === "destination" &&
              e.online &&
              e.bindings.some((b) => b.id === c.destinationBinding && b.recipes.includes(c.recipe)),
          ),
      )
      ? "ready"
      : "attention";
  };
  const profileStatus = (p: DeploymentSettings) =>
    componentStatus(p) ??
    (isPlatform(p)
      ? "managed"
      : p.runner !== "servix-development"
        ? "pending"
        : active
          ? "running"
          : state?.available &&
              state.runnerOnline &&
              sourceReady &&
              state.runs[0]?.status !== "failed"
            ? "ready"
            : "attention");
  const statusBadge = (p: DeploymentSettings) => (
    <RecordBadge
      tone={
        profileStatus(p) === "ready"
          ? "positive"
          : profileStatus(p) === "attention"
            ? "negative"
            : "warning"
      }
    >
      {isPlatform(p)
        ? "Managed platform"
        : profileStatus(p) === "ready"
          ? "Ready"
          : profileStatus(p) === "running"
            ? (configured.state.runs.find(
                (r) => r.profileId === p.profileId && ["publishing", "running"].includes(r.status),
              )?.status ??
              running?.status.replaceAll("-", " ") ??
              "In progress")
            : profileStatus(p) === "pending"
              ? "Destination pending"
              : configured.state.runs.find((r) => r.profileId === p.profileId)?.status ===
                  "recovery-required"
                ? "Recovery required"
                : "Needs attention"}
    </RecordBadge>
  );
  const isServix = (p: DeploymentSettings) => p.runner === "servix-development";
  const outcomeBadge = (p: DeploymentSettings) => {
    const latest = isServix(p) ? state?.runs[0] : undefined;
    if (!latest || !["succeeded", "failed"].includes(latest.status)) return null;
    return (
      <>
        <RecordBadge tone={latest.status === "failed" ? "negative" : "positive"}>
          Last {latest.operation ?? "deploy"}: {latest.status}
        </RecordBadge>
        {latest.errorCode ? (
          <RecordBadge tone="negative">{latest.errorCode.replaceAll("-", " ")}</RecordBadge>
        ) : null}
      </>
    );
  };
  const deploymentActions = (p: DeploymentSettings) =>
    configured.state.profiles.some((c) => c.profileId === p.profileId) ? (
      <a
        className="button secondary"
        href={addBasePath(`/projects/components?project=${p.profileId}`)}
      >
        Configuration
      </a>
    ) : isPlatform(p) ? (
      <div className="record-row-actions">
        {userId === "usr_windows_admin" ? (
          <a className="button primary" href={addBasePath("/maintenance")}>
            <Rocket size={14} /> Deploy
          </a>
        ) : (
          <span className="record-muted">Owner managed</span>
        )}
        <button
          type="button"
          className="button secondary"
          disabled
          title="Self-service platform rollback is not available. Failed activation uses automatic recovery."
        >
          <RotateCcw size={14} /> Rollback
        </button>
      </div>
    ) : (
      <div className="record-row-actions">
        <button
          className="button primary"
          type="button"
          disabled={
            !isServix(p) ||
            busy ||
            active ||
            !state?.available ||
            !state.runnerOnline ||
            !sourceReady
          }
          onClick={() => openConfirmation()}
        >
          {isServix(p) &&
          (busy || running) &&
          (running?.operation ?? submittedOperation) === "deploy" ? (
            <LoaderCircle className="deployment-spinner" size={14} />
          ) : (
            <Rocket size={14} />
          )}{" "}
          {isServix(p) &&
          (busy || running) &&
          (running?.operation ?? submittedOperation) === "deploy"
            ? "Deploying…"
            : "Deploy"}
        </button>
        <button
          type="button"
          className="button secondary"
          disabled={
            !isServix(p) ||
            busy ||
            active ||
            !state?.available ||
            !state.runnerOnline ||
            !state.rollbackRequestId ||
            !api.restoreServix
          }
          onClick={() => openConfirmation(state?.rollbackRequestId, "rollback")}
        >
          <RotateCcw size={14} />
          {isServix(p) && running?.operation && running.operation !== "deploy"
            ? "Restoring…"
            : "Rollback"}
        </button>
      </div>
    );
  const actions = (p: DeploymentSettings) => (
    <div className="record-row-actions">
      <a
        className="button secondary"
        href={addBasePath(`/projects/local-development?project=${encodeURIComponent(p.profileId)}`)}
      >
        Local preview & services
      </a>
      {deploymentActions(p)}
    </div>
  );
  const badges = (p: DeploymentSettings) =>
    isPlatform(p) ? (
      <div className="record-facts">
        {statusBadge(p)}
        <RecordBadge>{p.destination.host}</RecordBadge>
        <RecordBadge>Prepared builds</RecordBadge>
        <RecordBadge>Managed protection</RecordBadge>
      </div>
    ) : (
      <div className="record-facts">
        {statusBadge(p)}
        {outcomeBadge(p)}
        <RecordBadge>{p.destination.host}</RecordBadge>
        <RecordBadge
          tone={
            devices.some((d) => (d.profileId ?? "servix-development") === p.profileId && d.online)
              ? "positive"
              : "neutral"
          }
        >
          {devices.some((d) => (d.profileId ?? "servix-development") === p.profileId && d.online)
            ? "System online"
            : "System offline"}
        </RecordBadge>
        <RecordBadge>{p.preservedPaths.length} protected paths</RecordBadge>
        {isServix(p) && state?.sourceHead ? (
          <RecordBadge>Source {state.sourceHead.slice(0, 12)}</RecordBadge>
        ) : null}
        {isServix(p) &&
        state?.runs.find((r) => r.requestId === state.currentRequestId)?.preservedFiles !==
          undefined ? (
          <RecordBadge>
            {state.runs.find((r) => r.requestId === state.currentRequestId)?.preservedFiles} files
            preserved
          </RecordBadge>
        ) : null}
      </div>
    );
  const source = (p: DeploymentSettings) =>
    isPlatform(p) ? (
      <span className="record-muted">Prepared builds · server20 updater</span>
    ) : isServix(p) ? (
      <DeploymentSourceSelect
        projectName={p.displayName}
        devices={devices.filter(
          (d) => d.status === "active" && (d.profileId ?? "servix-development") === p.profileId,
        )}
        value={deviceId}
        disabled={busy || !!active}
        onChange={setDeviceId}
      />
    ) : (
      <span className="record-muted">
        {devices.filter((d) => d.status === "active" && d.profileId === p.profileId).length}{" "}
        connected devices
      </span>
    );
  const history = (p: DeploymentSettings) =>
    isPlatform(p) ? (
      <p className="record-muted">
        Deploy opens the prepared release and update status. Local edit publication/build and
        self-service rollback are not connected.
      </p>
    ) : isServix(p) ? (
      <details className="deployment-history">
        <summary>
          Release history <span>{state?.runs.length ?? 0}</span>
        </summary>
        <p className="record-muted">
          Rollback restores saved code. Your local changes and database state stay in place.
        </p>
        <ol>
          {state?.runs.map((run) => (
            <li key={run.requestId} data-status={run.status} data-request-id={run.requestId}>
              <div className="record-facts">
                <RecordBadge
                  tone={
                    run.status === "succeeded"
                      ? "positive"
                      : run.status === "failed"
                        ? "negative"
                        : "warning"
                  }
                >
                  {run.status.replaceAll("-", " ")}
                </RecordBadge>
                {state.currentRequestId === run.requestId ? (
                  <RecordBadge>Currently deployed</RecordBadge>
                ) : null}
                <span>
                  {run.operation === "rollback"
                    ? "Rollback"
                    : run.operation === "restore"
                      ? "Restore"
                      : "Deploy"}
                </span>
                <time>{new Date(run.createdAt).toLocaleString()}</time>
                {run.sourceHead ? <code>{run.sourceHead.slice(0, 12)}</code> : null}
                {run.preservedFiles !== undefined ? (
                  <RecordBadge>{run.preservedFiles} files preserved</RecordBadge>
                ) : null}
              </div>
              {run.errorCode ? <p role="alert">{run.errorCode.replaceAll("-", " ")}</p> : null}
              {run.changeDetails ? (
                <div className="deployment-change-record">
                  <p>
                    <strong>Changes:</strong> {run.changeDetails.message}
                  </p>
                  <p>
                    <strong>Declared approval:</strong> {run.changeDetails.approvedBy}
                  </p>
                  <p className="record-muted">Requested by {run.requestedBy}</p>
                </div>
              ) : (
                <p className="record-muted">
                  Change/approval details were not recorded for this older run.
                </p>
              )}
              {run.status === "succeeded" &&
              run.artifactDigest !==
                state.runs.find((item) => item.requestId === state.currentRequestId)
                  ?.artifactDigest &&
              state.restorableRequestIds?.includes(run.requestId) ? (
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy || active || !state.runnerOnline || !api.restoreServix}
                  onClick={() => openConfirmation(run.requestId, "restore")}
                >
                  Restore this build
                </button>
              ) : null}
            </li>
          ))}
        </ol>
      </details>
    ) : (
      <p className="record-muted">
        Connect a matching destination adapter in project configuration before deploying.
      </p>
    );
  const current = state?.runs.find((run) => run.requestId === state.currentRequestId);
  const columns: RecordColumn<DeploymentSettings>[] = [
    {
      id: "name",
      label: "Project",
      value: (p) => p.displayName,
      render: (p) => (
        <div className="record-identity">
          <strong>{p.displayName}</strong>
          <small>{p.profileId}</small>
        </div>
      ),
    },
    {
      id: "status",
      label: "Status",
      value: (p) => `${profileStatus(p)} ${isServix(p) ? (state?.runs[0]?.status ?? "") : ""}`,
      render: (p) => (
        <div className="record-facts">
          {statusBadge(p)}
          {outcomeBadge(p)}
        </div>
      ),
    },
    {
      id: "destination",
      label: "Destination",
      value: (p) => p.destination.host,
      render: (p) => (
        <div className="record-identity">
          <span>{p.destination.host}</span>
          <small>{p.destination.root}</small>
          <a
            href={p.destination.siteUrl}
            target="_blank"
            rel="noreferrer"
            className="record-app-link"
          >
            Open app <ExternalLink size={12} />
          </a>
        </div>
      ),
    },
    {
      id: "source",
      label: "Source",
      value: (p) =>
        p.runner === "configured-components"
          ? (devices.find((d) => d.profileId === p.profileId && d.userId === userId)?.name ??
            "No source system")
          : isPlatform(p)
            ? "Prepared builds"
            : isServix(p)
              ? (sourceDevice?.name ?? "No laptop")
              : "Not connected",
      render: (p) =>
        configured.state.profiles.some((c) => c.profileId === p.profileId)
          ? configuredCard(p)
          : source(p),
    },
    {
      id: "release",
      label: "Release",
      value: (p) =>
        p.runner === "configured-components"
          ? (configured.state.profiles
              .find((c) => c.profileId === p.profileId)
              ?.components.map(
                (c) =>
                  `${c.name}: ${
                    currentComponent(configured.state.runs, p.profileId, c.id)
                      ?.components.find((r) => r.id === c.id)
                      ?.artifactDigest?.slice(0, 12) ?? "Not deployed"
                  }`,
              )
              .join(", ") ?? "Not deployed")
          : isPlatform(p)
            ? "Platform updater"
            : isServix(p)
              ? (current?.sourceHead ?? "Not deployed")
              : "Not deployed",
      render: (p) =>
        p.runner === "configured-components" ? (
          <div className="record-facts">
            {configured.state.profiles
              .find((c) => c.profileId === p.profileId)
              ?.components.map((c) => (
                <RecordBadge key={c.id}>
                  {c.name}:{" "}
                  {currentComponent(configured.state.runs, p.profileId, c.id)
                    ?.components.find((r) => r.id === c.id)
                    ?.artifactDigest?.slice(0, 12) ?? "Not deployed"}
                </RecordBadge>
              ))}
          </div>
        ) : (
          <>
            <div className="record-facts">
              <RecordBadge>
                {isPlatform(p)
                  ? "Platform updater"
                  : isServix(p) && current?.sourceHead
                    ? current.sourceHead.slice(0, 12)
                    : "Not deployed"}
              </RecordBadge>
              <RecordBadge>
                {isPlatform(p)
                  ? "Managed protection"
                  : `${p.preservedPaths.length} protected paths`}
              </RecordBadge>
            </div>
            {history(p)}
          </>
        ),
    },
  ];
  return (
    <div className="deployments-workspace">
      <RecordWorkspace
        key={userId}
        title="Deployments"
        breadcrumb="Operations / Deployments"
        scopeName={scopeName}
        userId={userId}
        workspaceId={workspaceId}
        page="deployment-projects"
        records={visible}
        columns={columns}
        identify={(p) => p.profileId}
        statusOf={profileStatus}
        statuses={[
          { id: "ready", label: "Ready" },
          { id: "managed", label: "Managed platform" },
          { id: "running", label: "In progress" },
          { id: "attention", label: "Needs attention" },
          { id: "pending", label: "Destination pending" },
        ]}
        loading={loading}
        error={loadError}
        onRetry={() => {
          setLoading(true);
          setReload((n) => n + 1);
        }}
        notice={notice || configured.error}
        actions={
          <>
            <a className="button secondary" href={addBasePath("/projects/local-development")}>
              Local development
            </a>
            <a className="button secondary" href={addBasePath("/projects/components")}>
              Component configuration
            </a>
            <a className="button secondary" href={addBasePath("/projects/configuration")}>
              Manage projects
            </a>
          </>
        }
        renderActions={actions}
        renderCard={(p) => (
          <article className="record-card deployment-project-card">
            <div className="record-card-heading">
              <div className="record-identity">
                <h2>{p.displayName}</h2>
                <small>{p.profileId}</small>
              </div>
              <a
                className="record-app-link"
                href={p.destination.siteUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open app <ExternalLink size={13} />
              </a>
            </div>
            {configured.state.profiles.some((c) => c.profileId === p.profileId) ? (
              configuredCard(p)
            ) : (
              <>
                {badges(p)}
                <div className="deployment-card-footer">
                  {source(p)}
                  {actions(p)}
                </div>
                {history(p)}
              </>
            )}
          </article>
        )}
      />
      {confirmation ? (
        <DeploymentActionDialog
          operation={confirmation.operation}
          initial={intent.current?.changeDetails}
          locked={!!pending.current}
          busy={busy}
          notice={notice}
          onClose={() => setConfirmation(null)}
          onConfirm={(details) =>
            void deploy(
              details,
              confirmation.restoreRequestId,
              confirmation.operation === "deploy" ? "restore" : confirmation.operation,
            )
          }
        />
      ) : null}
      {busy || running ? (
        <div
          className="deployment-progress deployment-workspace-progress"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <LoaderCircle className="deployment-spinner" size={16} />
          <strong>{stage}</strong>
          <span>
            Elapsed {String(Math.floor(elapsed / 60)).padStart(2, "0")}:
            {String(elapsed % 60).padStart(2, "0")}
          </span>
          <small>Your request is saved. You can return to check progress.</small>
        </div>
      ) : null}
    </div>
  );
}
