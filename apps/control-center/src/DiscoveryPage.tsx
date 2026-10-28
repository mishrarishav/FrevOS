import {
  type ActivitySettings,
  ActivitySettingsInputSchema,
  defaultActivitySettings,
  type ContentPreviewJob,
  type DeliveryPlanInput,
  DeliveryPlanInputSchema,
  type DeliveryReport,
  type DiscoveryPolicy,
  DiscoveryPolicyInputSchema,
  type DiscoveryState,
  defaultDiscoveryPolicy,
} from "@frevos/contracts";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ControlCenterApi } from "./api.js";
import { type DiscoverySystem, discoverySystems, lastSeenLabel } from "./discovery-systems.js";
import { FolderBrowser } from "./FolderBrowser.js";
import { SystemPairingDialog } from "./SystemPairingDialog.js";
import { RecordBadge, type RecordColumn, RecordWorkspace } from "./RecordWorkspace.js";
import { addBasePath } from "./routing.js";
import { WorkspaceDialog } from "./WorkspaceDialog.js";
import { HealthGraphs } from "./HealthGraphs.js";
import { JoinRequestsInbox } from "./JoinRequestsInbox.js";

type System = DiscoveryState["systems"][number];
const bytes = (n: number) => `${(n / 1073741824).toFixed(1)} GB`;
function newPlan(report: DeliveryReport): DeliveryPlanInput {
  const p = report.plan;
  return p
    ? {
        version: 1,
        projectId: p.projectId,
        expectedRevision: p.revision,
        poReference: p.poReference,
        poDate: p.poDate,
        timeZone: p.timeZone,
        responsible: p.responsible,
        deviceIds: [...p.deviceIds],
        milestones: structuredClone(p.milestones),
      }
    : {
        version: 1,
        projectId: report.projectId,
        expectedRevision: 0,
        poReference: "",
        poDate: new Date().toLocaleDateString("en-CA"),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        responsible: "",
        deviceIds: [],
        milestones: [],
      };
}
export function DiscoveryPage({
  api,
  workspaceId,
  scopeName,
}: {
  api: ControlCenterApi;
  workspaceId: string;
  scopeName: string;
}) {
  const [state, setState] = useState<DiscoveryState>({ systems: [], reports: [] });
  const [pairing, setPairing] = useState(false);
  const [userId, setUserId] = useState(""),
    [tab, setTab] = useState<"systems" | "reports" | "requests">("systems");
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0),
    [busy, setBusy] = useState(false);
  const [details, setDetails] = useState<string | null>(null);
  const [activityDay, setActivityDay] = useState("");
  const [activityPath, setActivityPath] = useState("");
  const [activityLimit, setActivityLimit] = useState(100);
  const [activitySegment, setActivitySegment] = useState<"work" | "noise" | "all">("work");
  const [preview, setPreview] = useState<ContentPreviewJob | null>(null);
  const [settings, setSettings] = useState<{
    system: System;
    policy: DiscoveryPolicy;
    activity: ActivitySettings;
  } | null>(null);
  const [editor, setEditor] = useState<{ report: DeliveryReport; plan: DeliveryPlanInput } | null>(
    null,
  );
  const [historical, setHistorical] = useState(false);
  const [folderPicker, setFolderPicker] = useState<{
    system: System;
    mode: "inspect" | "content" | "priority";
  } | null>(null);
  const systems = discoverySystems(state.systems).filter(
    (s) => historical || s.status === "active",
  );
  const access = state.access;
  const canManageSystem = (system: System) =>
    !!access?.canManageOwnSystems && system.userId === access.actorId && system.status === "active";
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload is the explicit retry generation.
  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        if (!api.discoveryState) throw Error();
        const [next, session] = await Promise.all([
          api.discoveryState(workspaceId, abort.signal, details ?? undefined),
          api.getSession(abort.signal),
        ]);
        if (!abort.signal.aborted) {
          if (!next.access || next.access.actorId !== session.userId) throw Error();
          setState(next);
          setUserId(session.userId);
          if (!next.access.canPair) setPairing(false);
          if (next.access.role !== "admin")
            setTab((prior) => (prior === "requests" ? "systems" : prior));
          const owned = (id: string) =>
            next.access!.canManageOwnSystems &&
            next.systems.some(
              (system) =>
                system.deviceId === id &&
                system.userId === session.userId &&
                system.status === "active",
            );
          if (details && !next.systems.some((system) => system.deviceId === details))
            setDetails(null);
          setSettings((prior) => (prior && owned(prior.system.deviceId) ? prior : null));
          setFolderPicker((prior) => (prior && owned(prior.system.deviceId) ? prior : null));
          setEditor((prior) => (next.access!.canManagePlans ? prior : null));
          setPreview((prior) => (prior && owned(prior.request.deviceId) ? prior : null));
          setLoading(false);
          setError("");
        }
      } catch {
        if (!abort.signal.aborted) {
          setError(
            "Discovery access unavailable. Reconnect or sign in again to view your systems.",
          );
          setLoading(false);
          setState({ systems: [], reports: [] });
          setUserId("");
          setPairing(false);
          setDetails(null);
          setSettings(null);
          setFolderPicker(null);
          setEditor(null);
          setPreview(null);
        }
      }
      if (!abort.signal.aborted) timer = setTimeout(() => void poll(), 5000);
    };
    void poll();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [api, workspaceId, reload, details]);
  function openActivity(deviceId: string) {
    setDetails(deviceId);
    setActivityDay("");
    setActivityPath("");
    setActivityLimit(100);
    setActivitySegment("work");
    setPreview(null);
  }
  useEffect(() => {
    if (!preview || !["queued", "working"].includes(preview.status) || !api.contentPreview) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await api.contentPreview!(workspaceId, preview.requestId, abort.signal);
        if (!abort.signal.aborted) setPreview(next);
      } catch {
        if (!abort.signal.aborted)
          setNotice("Content request status unavailable. No additional file access is granted.");
      }
      if (!abort.signal.aborted) timer = setTimeout(() => void poll(), 2000);
    };
    timer = setTimeout(() => void poll(), 1000);
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [api, workspaceId, preview]);
  async function requestContent(system: System, root: string, path: string) {
    if (busy || !api.requestContent) return;
    setBusy(true);
    try {
      setPreview(
        await api.requestContent(workspaceId, {
          version: 1,
          deviceId: system.deviceId,
          root,
          path,
        }),
      );
      setNotice("");
    } catch {
      setNotice(
        "File request unavailable. Update the connector once, use an allowed file on an online system and finish any pending request first.",
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!userId) return;
    try {
      setTab(
        sessionStorage.getItem(`frevos:${userId}:${workspaceId}:discovery:tab`) === "reports"
          ? "reports"
          : "systems",
      );
    } catch {
      /* Optional preference. */
    }
  }, [userId, workspaceId]);
  function selectTab(value: "systems" | "reports" | "requests") {
    setTab(value);
    try {
      sessionStorage.setItem(`frevos:${userId}:${workspaceId}:discovery:tab`, value);
    } catch {
      /* Optional preference. */
    }
  }
  async function save(kind: "policy" | "plan" | "activity") {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      if (kind === "policy" && settings && api.discoveryPolicy) {
        const input = DiscoveryPolicyInputSchema.parse({
          version: 1,
          deviceId: settings.system.deviceId,
          expectedRevision: settings.system.policy?.revision ?? 0,
          policy: settings.policy,
        });
        await api.discoveryPolicy(workspaceId, input);
        setSettings(null);
      } else if (kind === "activity" && settings && api.discoveryActivity) {
        await api.discoveryActivity(
          workspaceId,
          ActivitySettingsInputSchema.parse({
            version: 1,
            deviceId: settings.system.deviceId,
            expectedRevision: settings.system.activity?.configuration?.revision ?? 0,
            settings: settings.activity,
          }),
        );
        setSettings(null);
      } else if (kind === "plan" && editor && api.deliveryPlan) {
        await api.deliveryPlan(workspaceId, DeliveryPlanInputSchema.parse(editor.plan));
        setEditor(null);
      } else throw Error();
      setNotice(
        "Saved. Reports update from the accepted plan; system observations refresh shortly.",
      );
      setReload((n) => n + 1);
    } catch {
      setNotice(
        "Could not save. Check required fields, acceptance evidence and dates. If the saved revision changed, close and reopen this form.",
      );
    } finally {
      setBusy(false);
    }
  }
  const health = (s: System) => {
    const sample = s.observation?.system;
    if (!sample)
      return <p>Awaiting a system observation. Install or update the connector on this device.</p>;
    return (
      <div className="discovery-facts">
        <span>
          CPU{" "}
          <strong>
            {sample.cpuPercent === null ? "Sampling" : `${sample.cpuPercent.toFixed(1)}%`}
          </strong>
        </span>
        <span>
          RAM{" "}
          <strong>
            {bytes(sample.memoryTotal - sample.memoryAvailable)} / {bytes(sample.memoryTotal)}
          </strong>
        </span>
        <span>
          {sample.os} · {sample.architecture}
        </span>
        <span>
          {sample.disks.length} local drive{sample.disks.length === 1 ? "" : "s"}
        </span>
      </div>
    );
  };
  const systemActions = (s: DiscoverySystem) => (
    <div className="record-row-actions">
      <button type="button" className="button secondary" onClick={() => openActivity(s.deviceId)}>
        Activity &amp; health
      </button>
      {canManageSystem(s) ? (
        <>
          <button
            type="button"
            className="button secondary"
            disabled={!s.online}
            onClick={() => setFolderPicker({ system: s, mode: "inspect" })}
          >
            Browse folders
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => {
              setNotice("");
              setSettings({
                system: s,
                policy: structuredClone(s.policy?.policy ?? defaultDiscoveryPolicy),
                activity: structuredClone(s.activity?.settings ?? defaultActivitySettings),
              });
            }}
          >
            Tracking settings
          </button>
        </>
      ) : null}
    </div>
  );
  const systemColumns: RecordColumn<DiscoverySystem>[] = [
    {
      id: "name",
      label: "System / project source",
      value: (s) =>
        `${s.observation?.system.systemName ?? s.name} ${s.bindings.map((b) => b.profileId).join(" ")}`,
    },
    {
      id: "projects",
      label: "Project bindings",
      value: (s) =>
        s.bindings
          .map((b) => b.profileId)
          .filter(Boolean)
          .join(", ") || "System monitoring · no project",
    },
    { id: "owner", label: "Connector account", value: (s) => s.userId },
    {
      id: "health",
      label: "System health",
      value: (s) => s.observation?.system.os ?? "Awaiting observation",
      render: health,
    },
    {
      id: "coverage",
      label: "Tracking",
      value: (s) => s.observation?.coverage.status ?? "not-installed",
    },
    {
      id: "status",
      label: "Presence",
      value: (s) => (s.online ? "online" : "offline"),
      render: (s) => (
        <RecordBadge tone={s.online ? "positive" : "warning"}>
          {s.online ? "Online" : "Offline / stale"}
        </RecordBadge>
      ),
    },
    {
      id: "lastSeen",
      label: "Last seen",
      value: (s) => s.lastSeenAt ?? "",
      render: (s) => lastSeenLabel(s.lastSeenAt),
    },
  ];
  const reportActions = (r: DeliveryReport) =>
    access?.canManagePlans ? (
      <div className="record-row-actions">
        <button
          type="button"
          className="button secondary"
          onClick={() => {
            setNotice("");
            setEditor({ report: r, plan: newPlan(r) });
          }}
        >
          {r.plan ? "Edit plan / acceptance" : "Set up project plan"}
        </button>
      </div>
    ) : null;
  const percent = (n: number | null) => (n === null ? "Unknown" : `${n}%`);
  const reportColumns: RecordColumn<DeliveryReport>[] = [
    { id: "name", label: "Project", value: (r) => r.projectName },
    { id: "client", label: "Client", value: (r) => r.clientName ?? "Not assigned" },
    {
      id: "progress",
      label: "Accepted / planned",
      value: (r) => `${percent(r.completedPercent)} / ${percent(r.plannedPercent)}`,
    },
    {
      id: "responsible",
      label: "Responsible",
      value: (r) => r.plan?.responsible ?? "Not assigned",
    },
    { id: "status", label: "Status", value: (r) => r.status },
  ];
  const controls = (
    <div className="record-row-actions">
      {access?.role === "admin" ? (
        <button
          type="button"
          className={`button ${tab === "requests" ? "primary" : "secondary"}`}
          aria-pressed={tab === "requests"}
          onClick={() => selectTab("requests")}
        >
          Join requests
        </button>
      ) : null}
      <RecordBadge tone={access?.role === "admin" ? "positive" : "neutral"}>
        {access
          ? access.role === "admin"
            ? "Admin · All workspace systems"
            : "User · Your systems only"
          : "Checking access"}
      </RecordBadge>
      {access?.canPair ? (
        <button type="button" className="button secondary" onClick={() => setPairing(true)}>
          Approve connection
        </button>
      ) : null}
      {tab === "systems" ? (
        <label className="record-inline-choice">
          <input
            type="checkbox"
            checked={historical}
            onChange={(e) => setHistorical(e.target.checked)}
          />
          Show historical sources
        </label>
      ) : null}
      {access?.canManageOwnSystems ? (
        <a className="button secondary" href={addBasePath("/projects/local-development")}>
          Local development
        </a>
      ) : null}
      {tab === "reports" && access?.role === "admin" ? (
        <a className="button secondary" href={addBasePath("/projects/frevos/operations")}>
          Clients &amp; project records
        </a>
      ) : null}
      <button
        type="button"
        className={`button ${tab === "systems" ? "primary" : "secondary"}`}
        aria-pressed={tab === "systems"}
        onClick={() => selectTab("systems")}
      >
        Systems
      </button>
      <button
        type="button"
        className={`button ${tab === "reports" ? "primary" : "secondary"}`}
        aria-pressed={tab === "reports"}
        onClick={() => selectTab("reports")}
      >
        Project reports
      </button>
      <a className="button secondary" href={addBasePath("/downloads/frevos-connector.zip")}>
        Windows installer
      </a>
      <a
        className="button secondary"
        href={addBasePath("/downloads/devsetu-connector-linux-x64.tar.gz")}
      >
        Linux installer
      </a>
    </div>
  );
  const selected = state.systems.find((s) => s.deviceId === details);
  useEffect(() => {
    if (!selected) return;
    const retained = selected.contentRequests ?? [];
    if (!preview && retained.length) setPreview(retained[0]!);
    else if (preview) {
      const latest = retained.find((j) => j.requestId === preview.requestId);
      if (latest && latest.status !== preview.status) setPreview(latest);
    }
  }, [selected, preview]);
  const activity = (
    selected?.activity?.rows ??
    (selected?.history ?? []).map((e) => ({ ...e, category: "work", count: 1, firstAt: e.at }))
  )
    .filter((event) => {
      const date = new Date(event.at);
      const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      return (
        (activitySegment === "all" || event.category === activitySegment) &&
        (!activityDay || day === activityDay) &&
        (!activityPath ||
          `${event.root}/${event.path}`.toLowerCase().includes(activityPath.toLowerCase()))
      );
    })
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const close = () => {
    if (!busy) {
      setSettings(null);
      setEditor(null);
    }
  };
  return (
    <div className="deployments-workspace discovery-workspace">
      {pairing ? (
        <SystemPairingDialog
          api={api}
          workspaceId={workspaceId}
          onClose={() => {
            setPairing(false);
            setReload((v) => v + 1);
          }}
        />
      ) : null}
      {tab === "requests" && access?.role === "admin" ? (
        <JoinRequestsInbox
          api={api}
          workspaceId={workspaceId}
          userId={userId}
          scopeName={scopeName}
          actions={controls}
        />
      ) : tab === "systems" ? (
        <RecordWorkspace
          key={`systems:${userId}`}
          title="Discovery"
          breadcrumb="Systems / Discovery"
          scopeName={scopeName}
          userId={userId}
          workspaceId={workspaceId}
          page="discovery-systems"
          noun="systems"
          records={systems}
          columns={systemColumns}
          identify={(s) => s.systemKey}
          statusOf={(s) => (s.online ? "online" : "offline")}
          statuses={[
            { id: "online", label: "Online" },
            { id: "offline", label: "Offline" },
          ]}
          loading={loading}
          error={error}
          notice={notice}
          onRetry={() => setReload((n) => n + 1)}
          actions={controls}
          renderActions={systemActions}
          renderCard={(s) => (
            <article className="record-card">
              <div className="record-card-heading">
                <div className="record-identity">
                  <h2>{s.observation?.system.systemName ?? s.name}</h2>
                  <small>
                    {s.bindings.length} {s.bindings.length === 1 ? "connection" : "connections"} ·{" "}
                    {s.observation?.system.installationId
                      ? "System identity reported"
                      : "Identity unavailable; source shown separately"}
                  </small>
                </div>
                <RecordBadge tone={s.online ? "positive" : "warning"}>
                  {s.online ? "Online" : "Offline / stale"}
                </RecordBadge>
              </div>
              {health(s)}
              <p className="record-muted">
                Tracking: {s.observation?.coverage.status ?? "Not installed"} ·{" "}
                {s.observation?.coverage.watchedDirectories ?? 0} watched folders
              </p>
              <small>{lastSeenLabel(s.lastSeenAt)}</small>
              <small>
                {s.profileId
                  ? s.sourceFresh
                    ? "Project folder"
                    : "Last verified folder"
                  : "Connection"}
                :{" "}
                {s.source?.repository ??
                  (s.profileId
                    ? "Source verification unavailable"
                    : "System monitoring · add projects later")}
              </small>
              {systemActions(s)}
              <div className="discovery-bindings">
                {s.bindings.map((binding) => (
                  <div key={binding.deviceId}>
                    <strong>{binding.profileId ?? "System monitoring"}</strong>
                    <small>
                      {binding.source?.repository ??
                        (binding.profileId ? "Source not verified" : "No project required")}
                    </small>
                    <small>
                      {binding.online ? "Online" : "Offline / stale"} ·{" "}
                      {lastSeenLabel(binding.lastSeenAt ?? binding.observedAt)}
                    </small>
                    {s.unverifiedBindings.includes(binding.deviceId) && s.bindings.length > 1 ? (
                      <small>Grouped by matching name and account; system identity pending.</small>
                    ) : null}
                    <div className="record-row-actions">
                      {canManageSystem(binding) ? (
                        <a
                          className="button secondary"
                          href={addBasePath(
                            binding.profileId
                              ? `/projects/local-development?project=${encodeURIComponent(binding.profileId)}`
                              : "/projects/components",
                          )}
                        >
                          {binding.profileId ? "Local preview & services" : "Add a project"}
                        </a>
                      ) : null}
                      <button
                        type="button"
                        className="button secondary"
                        aria-label={(binding.profileId ?? "System monitoring") + " activity"}
                        onClick={() => openActivity(binding.deviceId)}
                      >
                        Activity
                      </button>
                      {canManageSystem(binding) ? (
                        <button
                          type="button"
                          className="button secondary"
                          aria-label={
                            (binding.profileId ?? "System monitoring") + " tracking settings"
                          }
                          onClick={() =>
                            setSettings({
                              system: binding,
                              activity: structuredClone(
                                binding.activity?.settings ?? defaultActivitySettings,
                              ),
                              policy: structuredClone(
                                binding.policy?.policy ?? defaultDiscoveryPolicy,
                              ),
                            })
                          }
                        >
                          Tracking
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          )}
        />
      ) : (
        <RecordWorkspace
          key={`reports:${userId}`}
          title="Discovery"
          breadcrumb="Projects / Delivery reports"
          scopeName={scopeName}
          userId={userId}
          workspaceId={workspaceId}
          page="discovery-reports"
          records={state.reports}
          columns={reportColumns}
          identify={(r) => r.projectId}
          statusOf={(r) => r.status}
          statuses={[
            { id: "plan-missing", label: "Plan missing" },
            { id: "behind-plan", label: "Behind plan" },
            { id: "on-plan", label: "On plan" },
            { id: "ahead-of-plan", label: "Ahead of plan" },
            { id: "complete", label: "Complete" },
          ]}
          loading={loading}
          error={error}
          notice={notice}
          onRetry={() => setReload((n) => n + 1)}
          actions={controls}
          renderActions={reportActions}
          renderCard={(r) => (
            <article className="record-card">
              <div className="record-card-heading">
                <div className="record-identity">
                  <h2>{r.projectName}</h2>
                  <small>{r.clientName ?? "Client not assigned"}</small>
                </div>
                <RecordBadge
                  tone={
                    r.status === "behind-plan"
                      ? "negative"
                      : r.status === "plan-missing"
                        ? "warning"
                        : "positive"
                  }
                >
                  {r.status.replaceAll("-", " ")}
                </RecordBadge>
              </div>
              <p>
                Accepted: <strong>{percent(r.completedPercent)}</strong> · Planned:{" "}
                {percent(r.plannedPercent)}
              </p>
              {r.plan ? (
                <>
                  <p>
                    {r.plan.poReference} · PO {r.plan.poDate} · {r.plan.responsible}
                  </p>
                  <small>
                    Plan revision {r.plan.revision} · updated{" "}
                    {new Date(r.plan.updatedAt).toLocaleString()}
                  </small>
                  <p className="record-muted">
                    {r.overdue.length
                      ? `Overdue: ${r.overdue.join(", ")}`
                      : "No overdue deliverables"}
                  </p>
                  <details>
                    <summary>Evidence and assigned systems</summary>
                    <p>
                      Accepted deliverable weights determine progress. Due dates use{" "}
                      {r.plan.timeZone}; a deliverable becomes overdue after its due date.
                    </p>
                    {r.plan.deviceIds.map((id) => {
                      const s = state.systems.find((d) => d.deviceId === id);
                      return (
                        <p key={id}>
                          {s
                            ? `${s.observation?.system.systemName ?? s.name} · ${s.profileId} · ${s.online ? "Online" : "Offline / stale"}`
                            : "Assigned system unavailable"}
                        </p>
                      );
                    })}
                    <p>
                      File activity supports investigation; it does not establish completion or who
                      edited a file.
                    </p>
                  </details>
                </>
              ) : (
                <p>
                  Add the PO, responsible person, weighted deliverables and deadlines to calculate
                  delivery status.
                </p>
              )}
              {reportActions(r)}
            </article>
          )}
        />
      )}
      {selected ? (
        <WorkspaceDialog label="Activity and health" onClose={() => setDetails(null)}>
          <section className="project-editor discovery-editor">
            <header className="settings-header">
              <div>
                <h2>{selected.observation?.system.systemName ?? selected.name}</h2>
                <small>
                  {selected.online
                    ? "Fresh system observation"
                    : "Last observed — offline or stale"}
                </small>
              </div>
              <button
                type="button"
                className="button ghost"
                aria-label="Close activity and health"
                onClick={() => setDetails(null)}
              >
                <X size={16} />
              </button>
            </header>
            <div className="discovery-scroll">
              <label>
                Connection
                <select value={selected.deviceId} onChange={(e) => openActivity(e.target.value)}>
                  {discoverySystems(state.systems)
                    .find((s) => s.bindings.some((b) => b.deviceId === selected.deviceId))
                    ?.bindings.map((b) => (
                      <option key={b.deviceId} value={b.deviceId}>
                        {b.profileId ?? "System monitoring"}
                      </option>
                    ))}
                </select>
              </label>
              {health(selected)}
              <p>CPU and RAM above describe the whole computer.</p>
              <HealthGraphs points={selected.healthHistory ?? []} online={selected.online} />
              <p>
                {selected.collector
                  ? `Connector: ${(selected.collector.rss / 1048576).toFixed(1)} MB RAM (RSS), ${(selected.collector.heapUsed / 1048576).toFixed(1)} MB JavaScript heap · pending jobs ${selected.collector.pendingJobs} / ${selected.collector.maxPendingJobs}`
                  : "Connector resource metrics unavailable from this installed version. Update the connector once for bounded processing and its own RAM measurement."}
              </p>
              <p>
                {selected.profileId
                  ? selected.sourceFresh
                    ? "Project folder"
                    : "Last verified folder"
                  : "Connection"}
                :{" "}
                <strong>
                  {selected.source?.repository ??
                    (selected.profileId
                      ? "Source verification unavailable"
                      : "System monitoring · no project binding")}
                </strong>
              </p>
              {selected.observation?.system.disks.map((d) => (
                <p key={d.root}>
                  <strong>{d.root}</strong> · {bytes(d.available)} available / {bytes(d.total)}
                </p>
              ))}
              <h3>Tools</h3>
              {selected.observation?.system.tools.map((t) => (
                <p key={`${t.id}:${t.required}`}>
                  {t.id}: {t.detected ?? "Missing"} · required {t.required} · {t.status}
                </p>
              ))}
              <p>
                Use the local installer’s system check to review and install selected prerequisites.
              </p>
              <h3>Coverage</h3>
              <p>{selected.observation?.coverage.roots.join(", ") || "Tracking is not active"}</p>
              <p>
                Acting user / process comes only from matching OS audit records when available.
                Filesystem notifications, connector account and assigned developer do not prove who
                edited a file.
              </p>
              {selected.observation?.coverage.gaps.map((g) => (
                <p key={g} className="record-muted">
                  {g.replaceAll("-", " ")}
                </p>
              ))}
              <p>
                {selected.history.length} of {selected.historyCount} retained events loaded.
                Retention: {selected.policy?.policy.retentionDays ?? 7} days, up to{" "}
                {selected.policy?.policy.maxEvents ?? 2000} events within the storage limit.
                Notifications may coalesce edits; gaps are not reconstructed.
              </p>
              <h3>File activity</h3>
              {selected.contentRequests?.length ? (
                <label>
                  Recent file requests
                  <select
                    value={preview?.requestId ?? ""}
                    onChange={(e) =>
                      setPreview(
                        selected.contentRequests!.find((j) => j.requestId === e.target.value) ??
                          null,
                      )
                    }
                  >
                    {selected.contentRequests.map((j) => (
                      <option key={j.requestId} value={j.requestId}>
                        {j.status} · {j.request.path} · {new Date(j.createdAt).toLocaleString()}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <p>
                Request a file snapshot below. The computer's user must approve that exact request
                in a local browser page. Earlier changes are available only when an earlier approved
                snapshot exists; file notifications cannot reconstruct old content.
              </p>
              {preview ? (
                <section className="discovery-event" aria-label="Requested file content">
                  <h3>Requested file content · {preview.status}</h3>
                  <p>
                    {preview.request.root} / {preview.request.path}
                  </p>
                  {["queued", "working"].includes(preview.status) ? (
                    <p>
                      Waiting for one-time approval on that computer. Expires{" "}
                      {new Date(preview.expiresAt).toLocaleString()}.
                    </p>
                  ) : null}
                  {preview.errorCode ? <p>{preview.errorCode.replaceAll("-", " ")}</p> : null}
                  {preview.result ? (
                    <>
                      <p>
                        Masked UTF-8 text, at most 8 KiB. Comparing approved snapshots; intervening
                        edits may be missing.
                      </p>
                      <div className="discovery-diff">
                        <section>
                          <h4>
                            Before ·{" "}
                            {preview.result.beforeAt
                              ? new Date(preview.result.beforeAt).toLocaleString()
                              : "Baseline unavailable"}
                          </h4>
                          <pre>
                            {preview.result.before ?? "No earlier approved snapshot was retained."}
                          </pre>
                        </section>
                        <section>
                          <h4>Current · {new Date(preview.result.observedAt).toLocaleString()}</h4>
                          <pre>{preview.result.after}</pre>
                        </section>
                      </div>
                    </>
                  ) : null}
                </section>
              ) : null}
              <label>
                Activity segment
                <select
                  value={activitySegment}
                  onChange={(e) => {
                    setActivitySegment(e.target.value as "work" | "noise" | "all");
                    setActivityLimit(100);
                  }}
                >
                  <option value="work">
                    Work / other activity ({selected.activity?.workCount ?? selected.historyCount})
                  </option>
                  <option value="noise">
                    Temp / Cache / Tooling ({selected.activity?.noiseCount ?? 0})
                  </option>
                  <option value="all">All activity ({selected.historyCount})</option>
                </select>
              </label>
              <p>
                Path categories help review activity; they do not prove productive work. Summaries
                count retained notifications, not edits. Separate event and byte quotas discard the
                oldest activity in each segment. Excluded sensitive paths stay excluded.
              </p>
              <p>
                Temp / Cache / Tooling: up to {selected.activity?.settings.noisePercent ?? 20}% of
                the event and storage budget, retained for up to{" "}
                {Math.min(
                  selected.policy?.policy.retentionDays ?? 7,
                  selected.activity?.settings.noiseRetentionDays ?? 2,
                )}{" "}
                days. Matching metadata notifications are summarized over{" "}
                {selected.activity?.settings.summarySeconds ?? 30} seconds.
              </p>
              <div className="discovery-form-grid">
                <label>
                  Day (your local time)
                  <input
                    type="date"
                    value={activityDay}
                    onChange={(event) => {
                      setActivityDay(event.target.value);
                      setActivityLimit(100);
                    }}
                  />
                </label>
                <label>
                  Folder or file path
                  <input
                    value={activityPath}
                    onChange={(event) => {
                      setActivityPath(event.target.value);
                      setActivityLimit(100);
                    }}
                  />
                </label>
              </div>
              {activity.length ? (
                activity.slice(0, activityLimit).map((e) => (
                  <article className="discovery-event" key={`${e.bootId}:${e.sequence}`}>
                    <strong>
                      {e.kind} · {e.path}
                    </strong>
                    <small>
                      {new Date(e.at).toLocaleString()} · {e.root}
                    </small>
                    {e.count > 1 ? (
                      <small>
                        {e.count} retained notifications ·{" "}
                        {new Date(e.firstAt).toLocaleTimeString()}–
                        {new Date(e.at).toLocaleTimeString()}
                      </small>
                    ) : null}
                    {e.kind !== "gap" && canManageSystem(selected) ? (
                      <button
                        type="button"
                        className="button secondary"
                        disabled={
                          busy ||
                          !selected.online ||
                          !selected.collector ||
                          selected.userId !== userId ||
                          (!!preview && ["queued", "working"].includes(preview.status))
                        }
                        onClick={() => void requestContent(selected, e.root, e.path)}
                      >
                        Request file content
                      </button>
                    ) : null}
                    <small>
                      {typeof e.attribution === "object"
                        ? `OS audit: ${e.attribution.user} · ${e.attribution.process} · PID ${e.attribution.pid} · record ${e.attribution.recordId}`
                        : "Acting user / process unavailable"}
                    </small>
                    {e.content ? (
                      <details>
                        <summary>
                          Text before / after · {e.content.status.replaceAll("-", " ")}
                        </summary>
                        <div className="discovery-diff">
                          <section>
                            <h4>Before</h4>
                            <pre>{e.content.before || "No baseline"}</pre>
                          </section>
                          <section>
                            <h4>After</h4>
                            <pre>{e.content.after || "Removed / empty"}</pre>
                          </section>
                        </div>
                      </details>
                    ) : null}
                  </article>
                ))
              ) : (
                <p>
                  No matching retained events. Gaps and expired history cannot establish that no
                  files changed.
                </p>
              )}
              {activity.length > activityLimit ? (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setActivityLimit((value) => value + 100)}
                >
                  Load more ({activity.length - activityLimit} remaining)
                </button>
              ) : null}
            </div>
          </section>
        </WorkspaceDialog>
      ) : null}
      {settings && !folderPicker ? (
        <WorkspaceDialog label="Tracking settings" onClose={close}>
          <section className="project-editor discovery-editor">
            <header className="settings-header">
              <h2>Tracking settings · {settings.system.name}</h2>
              <div className="record-row-actions">
                <button
                  type="button"
                  className="button primary"
                  disabled={busy}
                  onClick={() => void save("policy")}
                >
                  Save tracking settings
                </button>
                <button
                  type="button"
                  className="button ghost"
                  disabled={busy}
                  aria-label="Close tracking settings"
                  onClick={close}
                >
                  <X size={16} />
                </button>
              </div>
            </header>
            <div className="discovery-scroll discovery-form">
              <section>
                <h3>Activity segments and summaries</h3>
                <p>
                  These settings apply on the server immediately. Updated collectors also reserve
                  their local buffers. They do not enable collection of excluded files or file
                  contents.
                </p>
                <label>
                  Temp / cache / tooling folders (one relative path per line, matched at a folder
                  boundary)
                  <textarea
                    value={settings.activity.noiseFolders.join("\n")}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        activity: {
                          ...settings.activity,
                          noiseFolders: e.target.value.split("\n").filter(Boolean),
                        },
                      })
                    }
                  />
                </label>
                <label>
                  Summary interval (5–300 seconds)
                  <input
                    type="number"
                    min={5}
                    max={300}
                    value={settings.activity.summarySeconds}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        activity: { ...settings.activity, summarySeconds: Number(e.target.value) },
                      })
                    }
                  />
                </label>
                <label>
                  Temp / cache retention (1–30 days, within overall retention)
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={settings.activity.noiseRetentionDays}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        activity: {
                          ...settings.activity,
                          noiseRetentionDays: Number(e.target.value),
                        },
                      })
                    }
                  />
                </label>
                <label>
                  Temp / cache quota (5–50% of events and bytes)
                  <input
                    type="number"
                    min={5}
                    max={50}
                    value={settings.activity.noisePercent}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        activity: { ...settings.activity, noisePercent: Number(e.target.value) },
                      })
                    }
                  />
                </label>
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void save("activity")}
                >
                  Save activity segments
                </button>
              </section>
              <label>
                <input
                  type="checkbox"
                  checked={settings.policy.useExistingAudit}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      policy: { ...settings.policy, useExistingAudit: e.target.checked },
                    })
                  }
                />
                Read existing OS file audit events when permitted (no audit policy changes)
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={settings.policy.enabled}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      policy: { ...settings.policy, enabled: e.target.checked },
                    })
                  }
                />
                Enable file activity on this enrolled system
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={settings.policy.allLocalDrives}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      policy: { ...settings.policy, allLocalDrives: e.target.checked },
                    })
                  }
                />
                {settings.system.profileId
                  ? "All local drives (otherwise this project folder)"
                  : "All local drives (otherwise your home folder)"}
              </label>
              <label>
                Content history folders (one project-relative folder per line; “.” for project root)
                <textarea
                  disabled={!settings.system.profileId}
                  value={settings.policy.contentFolders.join("\n")}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      policy: {
                        ...settings.policy,
                        contentFolders: e.target.value.split("\n").filter(Boolean),
                      },
                    })
                  }
                />
              </label>
              <p>
                Text history stays within this verified project. Use Choose content folder for text
                history, or Choose priority folder to track a drive folder first.
              </p>
              <button
                type="button"
                className="button secondary"
                disabled={!settings.system.online || !settings.system.profileId}
                onClick={() => setFolderPicker({ system: settings.system, mode: "content" })}
              >
                Choose content folder
              </button>
              <section>
                <h3>Folders to track first</h3>
                <p>
                  These folders use the watch budget before broad-drive scanning. Folder browsing is
                  independent of the watch limit.
                </p>
                <button
                  type="button"
                  className="button secondary"
                  disabled={!settings.system.online || settings.policy.priorityFolders.length >= 12}
                  onClick={() => setFolderPicker({ system: settings.system, mode: "priority" })}
                >
                  Choose priority folder
                </button>
                {settings.policy.priorityFolders.map((f, i) => (
                  <div className="record-row-actions" key={`${f.root}:${f.path}`}>
                    <code>
                      {f.root}
                      {f.path}
                    </code>
                    <button
                      type="button"
                      className="button ghost"
                      onClick={() =>
                        setSettings({
                          ...settings,
                          policy: {
                            ...settings.policy,
                            priorityFolders: settings.policy.priorityFolders.filter(
                              (_, n) => n !== i,
                            ),
                          },
                        })
                      }
                    >
                      Remove folder
                    </button>
                  </div>
                ))}
              </section>
              <label>
                Excluded project folders (one per line)
                <textarea
                  value={settings.policy.excludedFolders.join("\n")}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      policy: {
                        ...settings.policy,
                        excludedFolders: e.target.value.split("\n").filter(Boolean),
                      },
                    })
                  }
                />
              </label>
              <label>
                Retention days (1–30)
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={settings.policy.retentionDays}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      policy: { ...settings.policy, retentionDays: Number(e.target.value) },
                    })
                  }
                />
              </label>
              <label>
                Event buffer (100–10000)
                <input
                  type="number"
                  min={100}
                  max={10000}
                  value={settings.policy.maxEvents}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      policy: { ...settings.policy, maxEvents: Number(e.target.value) },
                    })
                  }
                />
              </label>
              <label>
                Watch folder limit (100–20000)
                <input
                  type="number"
                  min={100}
                  max={20000}
                  value={settings.policy.maxDirectories}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      policy: { ...settings.policy, maxDirectories: Number(e.target.value) },
                    })
                  }
                />
              </label>
              <p>
                Install-time local consent is also required. Metadata excludes sensitive paths and
                system/cache folders. Text history applies only to selected project folders, with
                bounded files and redaction. Access errors and watch limits reduce coverage.
              </p>
              {notice ? <p role="status">{notice}</p> : null}
            </div>
          </section>
        </WorkspaceDialog>
      ) : null}
      {folderPicker ? (
        <FolderBrowser
          api={api}
          workspaceId={workspaceId}
          deviceId={folderPicker.system.deviceId}
          onClose={() => setFolderPicker(null)}
          projectOnly={
            folderPicker.mode === "content" ||
            (folderPicker.mode === "priority" && !settings?.policy.allLocalDrives)
          }
          label={folderPicker.mode === "content" ? "Add content folder" : "Track this folder first"}
          onChoose={
            folderPicker.mode === "inspect"
              ? undefined
              : (choice) => {
                  if (settings) {
                    const policy = structuredClone(settings.policy);
                    if (folderPicker.mode === "content")
                      policy.contentFolders = [
                        ...new Set([...policy.contentFolders, choice.path || "."]),
                      ];
                    else if (
                      !policy.priorityFolders.some(
                        (f) => f.root === choice.root && f.path === choice.path,
                      )
                    )
                      policy.priorityFolders.push({ root: choice.root, path: choice.path });
                    setSettings({ ...settings, policy });
                  }
                  setFolderPicker(null);
                }
          }
        />
      ) : null}
      {editor ? (
        <WorkspaceDialog label="Project delivery plan" onClose={close}>
          <section className="project-editor discovery-editor">
            <header className="settings-header">
              <h2>{editor.report.projectName} · Delivery plan</h2>
              <div className="record-row-actions">
                <button
                  type="button"
                  className="button primary"
                  disabled={busy}
                  onClick={() => void save("plan")}
                >
                  Save project plan
                </button>
                <button
                  type="button"
                  className="button ghost"
                  aria-label="Close project delivery plan"
                  disabled={busy}
                  onClick={close}
                >
                  <X size={16} />
                </button>
              </div>
            </header>
            <div className="discovery-scroll discovery-form">
              <label>
                PO reference
                <input
                  value={editor.plan.poReference}
                  onChange={(e) =>
                    setEditor({ ...editor, plan: { ...editor.plan, poReference: e.target.value } })
                  }
                />
              </label>
              <label>
                PO date
                <input
                  type="date"
                  value={editor.plan.poDate}
                  onChange={(e) =>
                    setEditor({ ...editor, plan: { ...editor.plan, poDate: e.target.value } })
                  }
                />
              </label>
              <label>
                Responsible person
                <input
                  value={editor.plan.responsible}
                  onChange={(e) =>
                    setEditor({ ...editor, plan: { ...editor.plan, responsible: e.target.value } })
                  }
                />
              </label>
              <label>
                Deadline timezone
                <input
                  value={editor.plan.timeZone}
                  onChange={(e) =>
                    setEditor({ ...editor, plan: { ...editor.plan, timeZone: e.target.value } })
                  }
                />
              </label>
              <fieldset>
                <legend>Assigned project source systems</legend>
                {state.systems
                  .filter((s) => !!s.profileId)
                  .map((s) => (
                    <label key={s.deviceId}>
                      <input
                        type="checkbox"
                        checked={editor.plan.deviceIds.includes(s.deviceId)}
                        onChange={(e) =>
                          setEditor({
                            ...editor,
                            plan: {
                              ...editor.plan,
                              deviceIds: e.target.checked
                                ? [...editor.plan.deviceIds, s.deviceId]
                                : editor.plan.deviceIds.filter((id) => id !== s.deviceId),
                            },
                          })
                        }
                      />
                      {s.observation?.system.systemName ?? s.name} · {s.profileId}
                    </label>
                  ))}
              </fieldset>
              <h3>Weighted deliverables</h3>
              {editor.plan.milestones.map((m, i) => {
                const patch = (v: Partial<typeof m>) =>
                  setEditor({
                    ...editor,
                    plan: {
                      ...editor.plan,
                      milestones: editor.plan.milestones.map((old, index) =>
                        index === i ? { ...old, ...v } : old,
                      ),
                    },
                  });
                return (
                  <fieldset key={m.id}>
                    <legend>Deliverable {i + 1}</legend>
                    <label>
                      Title
                      <input value={m.title} onChange={(e) => patch({ title: e.target.value })} />
                    </label>
                    <label>
                      Weight
                      <input
                        type="number"
                        min={1}
                        max={1000}
                        value={m.weight}
                        onChange={(e) => patch({ weight: Number(e.target.value) })}
                      />
                    </label>
                    <label>
                      Due date
                      <input
                        type="date"
                        value={m.dueDate}
                        onChange={(e) => patch({ dueDate: e.target.value })}
                      />
                    </label>
                    <label>
                      Acceptance
                      <select
                        value={m.acceptance}
                        onChange={(e) =>
                          patch({ acceptance: e.target.value as "pending" | "accepted" })
                        }
                      >
                        <option value="pending">Pending</option>
                        <option value="accepted">Accepted</option>
                      </select>
                    </label>
                    <label>
                      Acceptance evidence / reference
                      <input
                        value={m.evidence}
                        onChange={(e) => patch({ evidence: e.target.value })}
                      />
                    </label>
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() =>
                        setEditor({
                          ...editor,
                          plan: {
                            ...editor.plan,
                            milestones: editor.plan.milestones.filter((item) => item.id !== m.id),
                          },
                        })
                      }
                    >
                      Remove deliverable
                    </button>
                  </fieldset>
                );
              })}
              <button
                type="button"
                className="button secondary"
                disabled={editor.plan.milestones.length >= 100}
                onClick={() =>
                  setEditor({
                    ...editor,
                    plan: {
                      ...editor.plan,
                      milestones: [
                        ...editor.plan.milestones,
                        {
                          id: `m_${Date.now()}_${editor.plan.milestones.length}`,
                          title: "",
                          weight: 1,
                          dueDate: editor.plan.poDate,
                          acceptance: "pending",
                          evidence: "",
                        },
                      ],
                    },
                  })
                }
              >
                Add deliverable
              </button>
              <p>
                Only accepted work with evidence counts as completed. Reports show delays; no notice
                or message is sent.
              </p>
              {notice ? <p role="status">{notice}</p> : null}
            </div>
          </section>
        </WorkspaceDialog>
      ) : null}
    </div>
  );
}
