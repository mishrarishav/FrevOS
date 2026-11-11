import {
  type ReviewCatalog,
  type ReviewState,
  type ServerMonitorCatalog,
  type ServerMonitorImport,
  ServerMonitorImportSchema,
  type ServerMonitorPoint,
  type ServerMonitorPolicy,
  ServerMonitorPolicySchema,
  type ServerMonitorSaveTarget,
  ServerMonitorSaveTargetSchema,
  type ServerMonitorTargetView,
} from "@frevos/contracts";
import {
  Activity,
  Bell,
  Check,
  Cpu,
  HardDrive,
  Import,
  MemoryStick,
  Network,
  Plus,
  RefreshCw,
  Server,
  Settings2,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { ApiFailure, type ControlCenterApi } from "./api.js";
import { RecordBadge, type RecordColumn, RecordWorkspace } from "./RecordWorkspace.js";
import { WorkspaceDialog } from "./WorkspaceDialog.js";
import "./ServerMonitoringPage.css";

type Props = {
  api: ControlCenterApi;
  workspaceId: string;
  userId: string;
  scopeName: string;
  onSessionExpired?: () => void;
};
type Target = ServerMonitorTargetView;
type Tone = "neutral" | "positive" | "warning" | "negative";
const stamp = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString() : "Not recorded";
export const serverTransportLabel = (target: Target) =>
  target.transport === "local"
    ? "Central collector host"
    : target.transport === "winrm-https"
      ? "WinRM HTTPS"
      : "WinRM HTTP";
export const serverPercent = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(1)}%` : "—";
export function serverBytes(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index =
    value === 0 ? 0 : Math.max(0, Math.min(4, Math.floor(Math.log(value) / Math.log(1024))));
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
export function serverMemoryPercent(target: Target) {
  return target.latest && target.latest.memoryTotalBytes > 0
    ? (1 - target.latest.memoryAvailableBytes / target.latest.memoryTotalBytes) * 100
    : null;
}
export function serverFresh(target: Target, policy: ServerMonitorPolicy, now = Date.now()) {
  const at = Date.parse(target.latest?.observedAt ?? "");
  return Number.isFinite(at) && at <= now && now - at <= policy.staleAfterSeconds * 1000;
}
export function serverStatus(target: Target, policy: ServerMonitorPolicy, now = Date.now()) {
  if (target.polling) return "checking";
  if (target.access.status === "auth-failed") return "auth-failed";
  if (!target.enabled) return "paused";
  if (target.access.status === "connected")
    return serverFresh(target, policy, now) ? "live" : "stale";
  return target.access.status;
}
export function serverStatusLabel(status: string): string {
  return (
    (
      {
        live: "Live",
        paused: "Paused",
        checking: "Checking…",
        stale: "Last observation",
        unverified: "Not checked",
        connected: "Connected",
        "auth-failed": "Sign-in failed",
        "access-denied": "Access denied",
        unreachable: "Unreachable",
        "winrm-unavailable": "WinRM unavailable",
        unsupported: "Unsupported",
        error: "Check failed",
      } as Record<string, string>
    )[status] ?? status
  );
}
const statusTone = (status: string): Tone =>
  status === "live"
    ? "positive"
    : ["unreachable", "auth-failed", "access-denied", "error"].includes(status)
      ? "negative"
      : ["stale", "checking", "winrm-unavailable"].includes(status)
        ? "warning"
        : "neutral";

/** Missing counters, failed samples and collection gaps break the line. Nothing is interpolated. */
export function serverGraphSegments(
  points: ServerMonitorPoint[],
  metric: "cpu" | "memory",
  end: number,
  intervalSeconds: number,
) {
  const duration = 15 * 60 * 1000;
  const segments: { x: number; y: number; value: number; at: string }[][] = [];
  let current: (typeof segments)[number] = [];
  let previous = 0;
  for (const point of [...points].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
    const at = Date.parse(point.at);
    if (!Number.isFinite(at) || at < end - duration || at > end) continue;
    const value =
      metric === "cpu"
        ? point.cpuPercent
        : point.memoryTotalBytes > 0
          ? (point.memoryUsedBytes / point.memoryTotalBytes) * 100
          : null;
    if (
      value === null ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 100 ||
      (previous && at - previous > intervalSeconds * 2500)
    ) {
      if (current.length) segments.push(current);
      current = [];
    }
    if (value !== null && Number.isFinite(value) && value >= 0 && value <= 100)
      current.push({
        x: 30 + ((at - (end - duration)) / duration) * 550,
        y: 132 - value * 1.2,
        value,
        at: point.at,
      });
    previous = at;
  }
  if (current.length) segments.push(current);
  return segments;
}

export function ServerMetricGraph({
  points,
  metric,
  end,
  intervalSeconds,
  value,
}: {
  points: ServerMonitorPoint[];
  metric: "cpu" | "memory";
  end: number;
  intervalSeconds: number;
  value: number | null;
}) {
  const segments = serverGraphSegments(points, metric, end, intervalSeconds);
  const label = metric === "cpu" ? "CPU utilization" : "Memory utilization";
  return (
    <section
      className="server-monitor-chart"
      style={{ "--server-graph-color": metric === "cpu" ? "#3295f5" : "#a478e8" } as CSSProperties}
    >
      <header>
        <h3>{label}</h3>
        <strong>{serverPercent(value)}</strong>
      </header>
      <svg
        viewBox="0 0 600 155"
        role="img"
        aria-label={`${label}, measured samples over the last 15 minutes`}
      >
        <title>{label} · actual measured samples</title>
        {[0, 50, 100].map((tick) => (
          <g key={tick}>
            <line
              className="server-graph-grid"
              x1="30"
              x2="580"
              y1={132 - tick * 1.2}
              y2={132 - tick * 1.2}
            />
            <text className="server-graph-label" x="0" y={136 - tick * 1.2}>
              {tick}%
            </text>
          </g>
        ))}
        {segments.map((segment) => (
          <g key={segment[0]?.at}>
            <polyline points={segment.map((point) => `${point.x},${point.y}`).join(" ")} />
            {segment.map((point) => (
              <circle key={`${point.at}:${point.value}`} cx={point.x} cy={point.y} r="2">
                <title>{`${stamp(point.at)} · ${serverPercent(point.value)}`}</title>
              </circle>
            ))}
          </g>
        ))}
        {segments.length === 0 ? (
          <text className="server-graph-empty" x="300" y="80" textAnchor="middle">
            Waiting for measured samples
          </text>
        ) : null}
      </svg>
      <div className="server-monitor-chart-caption">
        <span>{new Date(end - 900000).toLocaleTimeString()}</span>
        <span>{new Date(end).toLocaleTimeString()}</span>
      </div>
    </section>
  );
}

function Meter({
  label,
  value,
  memory = false,
}: {
  label: string;
  value: number | null;
  memory?: boolean;
}) {
  return (
    <div
      className="server-monitor-meter"
      style={memory ? ({ "--server-graph-color": "#a478e8" } as CSSProperties) : undefined}
    >
      <div>
        <span>{label}</span>
        <strong>{serverPercent(value)}</strong>
      </div>
      {value !== null ? (
        <meter aria-label={label} min={0} max={100} value={value} />
      ) : (
        <span className="server-monitor-address">No measurement</span>
      )}
    </div>
  );
}
export function ServerMonitorCard({
  target,
  policy,
  now = Date.now(),
  administrator,
  busy,
  open,
  refresh,
  edit,
}: {
  target: Target;
  policy: ServerMonitorPolicy;
  now?: number;
  administrator: boolean;
  busy: boolean;
  open: () => void;
  refresh: () => void;
  edit: () => void;
}) {
  const status = serverStatus(target, policy, now);
  const activeAlerts = target.alerts.filter((alert) => !alert.resolvedAt);
  return (
    <article className="server-monitor-card">
      <header className="server-monitor-card-heading">
        <div className="server-monitor-identity">
          <span className="server-monitor-icon">
            <Server size={20} aria-hidden="true" />
          </span>
          <div>
            <h2>{target.name}</h2>
            <p className="server-monitor-address">
              {target.address} · {target.access.computerName ?? "Identity not checked"}
            </p>
          </div>
        </div>
        <RecordBadge tone={statusTone(status)}>{serverStatusLabel(status)}</RecordBadge>
      </header>
      <div className="server-monitor-meters">
        <Meter label="CPU" value={target.latest?.cpuPercent ?? null} />
        <Meter label="Memory" value={serverMemoryPercent(target)} memory />
      </div>
      <p className="server-monitor-meta">
        <span>{serverTransportLabel(target)}</span>
        <span>
          {target.latest
            ? `Observed ${stamp(target.latest.observedAt)}`
            : "No system observation yet"}
        </span>
        {activeAlerts.length ? (
          <RecordBadge tone="warning">{activeAlerts.length} active alerts</RecordBadge>
        ) : null}
      </p>
      {target.lastError || (!target.latest && target.access.message) ? (
        <div className="server-monitor-error">{target.lastError || target.access.message}</div>
      ) : null}
      <footer>
        <div className="server-monitor-actions">
          <button className="button secondary" type="button" onClick={open}>
            <Activity size={14} /> Open monitor
          </button>
          {administrator ? (
            <button
              className="button ghost"
              type="button"
              onClick={edit}
              aria-label={`Configure ${target.name}`}
            >
              <Settings2 size={14} />
            </button>
          ) : null}
        </div>
        <button
          className="button ghost"
          type="button"
          disabled={
            busy || target.polling || (target.access.status === "auth-failed" && !administrator)
          }
          onClick={refresh}
        >
          <RefreshCw size={14} />
          {target.polling ? "Checking…" : "Check now"}
        </button>
      </footer>
    </article>
  );
}

export function serverMonitorColumns(
  policy: ServerMonitorPolicy,
  open: (target: Target) => void,
): RecordColumn<Target>[] {
  return [
    {
      id: "name",
      label: "Server",
      value: (target) => target.name,
      render: (target) => (
        <button type="button" className="button ghost" onClick={() => open(target)}>
          {target.name}
        </button>
      ),
    },
    { id: "address", label: "Address", value: (target) => target.address },
    {
      id: "status",
      label: "Connection",
      value: (target) => serverStatusLabel(serverStatus(target, policy)),
      render: (target) => (
        <RecordBadge tone={statusTone(serverStatus(target, policy))}>
          {serverStatusLabel(serverStatus(target, policy))}
        </RecordBadge>
      ),
    },
    { id: "cpu", label: "CPU", value: (target) => serverPercent(target.latest?.cpuPercent) },
    {
      id: "memory",
      label: "Memory",
      value: (target) => serverPercent(serverMemoryPercent(target)),
    },
    {
      id: "lastSeen",
      label: "Last observation",
      value: (target) => stamp(target.latest?.observedAt),
    },
    {
      id: "applications",
      label: "Applications",
      value: (target) => target.sourceRefs.map((source) => source.title).join(", "),
    },
  ];
}

function failureMessage(reason: unknown) {
  return reason instanceof ApiFailure && reason.kind === "denied"
    ? "Your account does not have access to this server monitoring view."
    : "The monitoring service could not be reached. Saved observations remain available; retry the request.";
}
export function ServerMonitoringPage({
  api,
  workspaceId,
  userId,
  scopeName,
  onSessionExpired,
}: Props) {
  const [catalog, setCatalog] = useState<ServerMonitorCatalog | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState("");
  const [selected, setSelected] = useState("");
  const [editor, setEditor] = useState<"policy" | "import" | Target | "new" | null>(null);
  const [reviews, setReviews] = useState<ReviewCatalog | null>(null);
  const expired = useRef(onSessionExpired);
  expired.current = onSessionExpired;
  const lifetime = useRef(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: explicit Retry restarts the polling lifetime even when the API and workspace stay the same.
  useEffect(() => {
    const epoch = ++lifetime.current;
    const controller = new AbortController();
    setCatalog(null);
    setSelected("");
    setEditor(null);
    setReviews(null);
    setBusy("");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      if (typeof document !== "undefined" && document.hidden) {
        timer = setTimeout(() => {
          void poll();
        }, 5000);
        return;
      }
      try {
        if (!api.serverMonitoring) throw new ApiFailure("unavailable");
        const next = await api.serverMonitoring(workspaceId, controller.signal);
        if (controller.signal.aborted || epoch !== lifetime.current) return;
        setCatalog(next);
        setError("");
      } catch (reason) {
        if (controller.signal.aborted || epoch !== lifetime.current) return;
        if (reason instanceof ApiFailure && ["unauthenticated", "denied"].includes(reason.kind)) {
          setCatalog(null);
          setSelected("");
          setEditor(null);
          setReviews(null);
        }
        if (reason instanceof ApiFailure && reason.kind === "unauthenticated") {
          expired.current?.();
          return;
        }
        setError(failureMessage(reason));
      }
      if (!controller.signal.aborted)
        timer = setTimeout(() => {
          void poll();
        }, 5000);
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
      lifetime.current++;
    };
  }, [api, workspaceId, reload]);
  const perform = async (
    name: string,
    request: () => Promise<ServerMonitorCatalog>,
    message: string,
  ) => {
    if (busy) return;
    const epoch = lifetime.current;
    setBusy(name);
    setError("");
    try {
      const next = await request();
      if (epoch !== lifetime.current) return;
      setCatalog(next);
      setNotice(message);
    } catch (reason) {
      if (epoch !== lifetime.current) return;
      if (reason instanceof ApiFailure && reason.kind === "unauthenticated") {
        setCatalog(null);
        setSelected("");
        setEditor(null);
        expired.current?.();
      } else if (reason instanceof ApiFailure && reason.kind === "denied") {
        setCatalog(null);
        setSelected("");
        setEditor(null);
      }
      setError(failureMessage(reason));
      throw reason;
    } finally {
      if (epoch === lifetime.current) setBusy("");
    }
  };
  const refresh = (targetId?: string) => {
    void perform(
      targetId ?? "refresh-all",
      async () => {
        if (!api.serverMonitorRefresh) throw new ApiFailure("unavailable");
        return api.serverMonitorRefresh(workspaceId, targetId ? { targetId } : {});
      },
      "Check queued. Results update automatically when the server collector finishes.",
    ).catch(() => {});
  };
  const openEditor = (next: NonNullable<typeof editor>) => {
    if (!catalog?.administrator) return;
    setEditor(next);
    if (api.reviewsCatalog) {
      const epoch = lifetime.current;
      void api
        .reviewsCatalog(workspaceId)
        .then((value) => {
          if (epoch === lifetime.current) setReviews(value);
        })
        .catch(() => {});
    }
  };
  const policy = catalog?.policy ?? ServerMonitorPolicySchema.parse({});
  const target = catalog?.targets.find((item) => item.id === selected);
  const now = Date.now();
  return (
    <div className="server-monitor-workspace">
      <RecordWorkspace
        title="Server monitoring"
        breadcrumb="Reviews / Server monitoring"
        scopeName={scopeName}
        userId={userId}
        workspaceId={workspaceId}
        page="server-monitoring"
        noun="systems"
        records={catalog?.targets ?? []}
        columns={serverMonitorColumns(policy, (item) => setSelected(item.id))}
        identify={(item) => item.id}
        statusOf={(item) => serverStatus(item, policy, now)}
        statuses={[
          { id: "live", label: "Live" },
          { id: "checking", label: "Checking" },
          { id: "stale", label: "Last observation" },
          { id: "unreachable", label: "Unreachable" },
          { id: "auth-failed", label: "Sign-in failed" },
          { id: "paused", label: "Paused" },
        ]}
        loading={!catalog && !error}
        error={!catalog ? error : ""}
        onRetry={() => setReload((value) => value + 1)}
        emptyTitle="No servers in your monitoring view"
        emptyDescription={
          catalog?.administrator
            ? "Import approved hosting addresses from an application register, or add a server. Only selected ownership values will be imported."
            : "Ask a workspace administrator to grant your account access to a server."
        }
        notice={
          error ||
          notice ||
          "Measured CPU, memory, processes and services from the central server collector. Opening this page does not start another remote collector."
        }
        actions={
          <>
            <RecordBadge tone={policy.enabled ? "positive" : "neutral"}>
              {policy.enabled
                ? `Collecting every ${policy.intervalSeconds}s`
                : "Scheduled collection paused"}
            </RecordBadge>
            <button
              type="button"
              className="button secondary"
              disabled={!catalog?.targets.some((item) => item.enabled) || Boolean(busy)}
              onClick={() => refresh()}
            >
              <RefreshCw size={15} /> Check all
            </button>
            {catalog?.administrator ? (
              <>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => openEditor("import")}
                >
                  <Import size={15} /> Import servers
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => openEditor("new")}
                >
                  <Plus size={15} /> Add server
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => openEditor("policy")}
                >
                  <Settings2 size={15} /> Monitoring settings
                </button>
              </>
            ) : null}
          </>
        }
        renderCard={(item) => (
          <ServerMonitorCard
            target={item}
            policy={policy}
            administrator={catalog?.administrator === true}
            busy={Boolean(busy)}
            open={() => setSelected(item.id)}
            refresh={() => refresh(item.id)}
            edit={() => openEditor(item)}
          />
        )}
        renderActions={(item) => (
          <div className="server-monitor-actions">
            <button type="button" className="button secondary" onClick={() => setSelected(item.id)}>
              Open monitor
            </button>
            <button
              type="button"
              className="button ghost"
              onClick={() => refresh(item.id)}
              disabled={
                Boolean(busy) ||
                item.polling ||
                (item.access.status === "auth-failed" && !catalog?.administrator)
              }
            >
              Check now
            </button>
            {catalog?.administrator ? (
              <button type="button" className="button ghost" onClick={() => openEditor(item)}>
                Configure
              </button>
            ) : null}
          </div>
        )}
      />
      {target && catalog ? (
        <WorkspaceDialog label={`Server monitor: ${target.name}`} onClose={() => setSelected("")}>
          <ServerMonitorDetail
            target={target}
            catalog={catalog}
            userId={userId}
            busy={Boolean(busy)}
            error={error}
            select={setSelected}
            close={() => setSelected("")}
            refresh={() => refresh(target.id)}
            acknowledge={(alertId) => {
              void perform(
                alertId,
                async () => {
                  if (!api.serverMonitorAcknowledge) throw new ApiFailure("unavailable");
                  return api.serverMonitorAcknowledge(workspaceId, { alertId });
                },
                "Alert acknowledged.",
              ).catch(() => {});
            }}
          />
        </WorkspaceDialog>
      ) : null}
      {catalog?.administrator && editor ? (
        <WorkspaceDialog
          label={
            editor === "policy"
              ? "Monitoring settings"
              : editor === "import"
                ? "Import servers"
                : "Server configuration"
          }
          onClose={() => {
            if (!busy) setEditor(null);
          }}
        >
          {editor === "policy" ? (
            <ServerPolicyEditor
              initial={policy}
              busy={Boolean(busy)}
              error={error}
              close={() => setEditor(null)}
              save={async (next) => {
                await perform(
                  "save-policy",
                  async () => {
                    if (!api.serverMonitorPolicy) throw new ApiFailure("unavailable");
                    return api.serverMonitorPolicy(workspaceId, {
                      expectedRevision: catalog.revision,
                      policy: next,
                    });
                  },
                  "Monitoring settings saved.",
                );
                setEditor(null);
              }}
            />
          ) : editor === "import" ? (
            <ServerImportEditor
              api={api}
              workspaceId={workspaceId}
              registers={reviews?.registers ?? []}
              busy={Boolean(busy)}
              error={error}
              close={() => setEditor(null)}
              save={async (input) => {
                let summary = "";
                await perform(
                  "import",
                  async () => {
                    if (!api.serverMonitorImport) throw new ApiFailure("unavailable");
                    const result = await api.serverMonitorImport(workspaceId, input);
                    summary = `${result.added} servers added, ${result.updated} updated; ${result.excluded.length} application rows excluded by the selected ownership or address rules.`;
                    return result.catalog;
                  },
                  "Servers imported.",
                );
                setNotice(summary);
                setEditor(null);
              }}
            />
          ) : (
            <ServerTargetEditor
              initial={typeof editor === "object" ? editor : undefined}
              users={reviews?.users ?? []}
              busy={Boolean(busy)}
              error={error}
              close={() => setEditor(null)}
              save={async (input) => {
                await perform(
                  "save-target",
                  async () => {
                    if (!api.serverMonitorSaveTarget) throw new ApiFailure("unavailable");
                    return api.serverMonitorSaveTarget(workspaceId, input);
                  },
                  "Server configuration and access saved.",
                );
                setEditor(null);
              }}
            />
          )}
        </WorkspaceDialog>
      ) : null}
    </div>
  );
}

export function ServerMonitorDetail({
  target,
  catalog,
  userId,
  busy,
  error,
  select,
  close,
  refresh,
  acknowledge,
}: {
  target: Target;
  catalog: ServerMonitorCatalog;
  userId: string;
  busy: boolean;
  error: string;
  select: (id: string) => void;
  close: () => void;
  refresh: () => void;
  acknowledge: (id: string) => void;
}) {
  const [tab, setTab] = useState<"performance" | "processes" | "services" | "alerts">(
    "performance",
  );
  const status = serverStatus(target, catalog.policy);
  const latest = target.latest;
  return (
    <section className="server-monitor-detail">
      <header className="server-monitor-detail-header">
        <div className="server-monitor-heading">
          <div className="server-monitor-identity">
            <span className="server-monitor-icon">
              <Server size={22} />
            </span>
            <div>
              <h2>{target.name}</h2>
              <p className="server-monitor-address">
                {target.address} ·{" "}
                {latest?.computerName ?? target.access.computerName ?? "Identity not checked"}
              </p>
            </div>
            <RecordBadge tone={statusTone(status)}>{serverStatusLabel(status)}</RecordBadge>
          </div>
          <div className="server-monitor-actions">
            <button
              type="button"
              className="button secondary"
              onClick={refresh}
              disabled={
                busy ||
                target.polling ||
                (target.access.status === "auth-failed" && !catalog.administrator)
              }
            >
              <RefreshCw size={15} />
              {target.polling ? "Checking…" : "Check now"}
            </button>
            <button
              type="button"
              className="button ghost"
              aria-label="Close server monitor"
              onClick={close}
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <p className="server-monitor-meta">
          <span>Last observation: {stamp(latest?.observedAt)}</span>
          <span>Last access check: {stamp(target.access.checkedAt)}</span>
          {!serverFresh(target, catalog.policy) && latest ? (
            <RecordBadge tone="warning">Historical measurement</RecordBadge>
          ) : null}
        </p>
      </header>
      <div className="server-monitor-layout">
        <aside className="server-monitor-sidebar" aria-label="Monitored servers">
          <p>Your server view</p>
          {catalog.targets.map((item) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={item.id === target.id}
              onClick={() => select(item.id)}
            >
              <Server size={17} aria-hidden="true" />
              <span>
                {item.name}
                <small>
                  {serverStatusLabel(serverStatus(item, catalog.policy))} · {item.address}
                </small>
              </span>
            </button>
          ))}
        </aside>
        <div className="server-monitor-detail-main">
          <div
            className="server-monitor-tabs"
            role="tablist"
            aria-label="Server details"
            onKeyDown={(event) => {
              const tabs = ["performance", "processes", "services", "alerts"] as const;
              const current = tabs.indexOf(tab);
              const next =
                event.key === "ArrowRight"
                  ? tabs[(current + 1) % tabs.length]
                  : event.key === "ArrowLeft"
                    ? tabs[(current + tabs.length - 1) % tabs.length]
                    : event.key === "Home"
                      ? tabs[0]
                      : event.key === "End"
                        ? tabs[tabs.length - 1]
                        : undefined;
              if (!next) return;
              event.preventDefault();
              setTab(next);
              event.currentTarget
                .querySelector<HTMLButtonElement>(`#server-monitor-tab-${next}`)
                ?.focus();
            }}
          >
            {(
              [
                { id: "performance", label: "Performance", icon: Activity },
                { id: "processes", label: "Processes", icon: Cpu },
                { id: "services", label: "Services", icon: Settings2 },
                { id: "alerts", label: "Alerts", icon: Bell },
              ] as const
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`server-monitor-tab-${id}`}
                aria-selected={tab === id}
                tabIndex={tab === id ? 0 : -1}
                aria-controls="server-monitor-panel"
                onClick={() => setTab(id)}
              >
                <Icon size={15} />
                {label}
                {id === "alerts" && target.alerts.some((alert) => !alert.resolvedAt) ? (
                  <RecordBadge tone="warning">
                    {target.alerts.filter((alert) => !alert.resolvedAt).length}
                  </RecordBadge>
                ) : null}
              </button>
            ))}
          </div>
          <div
            className="server-monitor-panel"
            role="tabpanel"
            id="server-monitor-panel"
            aria-labelledby={`server-monitor-tab-${tab}`}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard users must be able to scroll the observation panel after entering its tab.
            tabIndex={0}
          >
            {error ? (
              <p className="server-monitor-error" role="alert">
                {error}
              </p>
            ) : null}
            {tab === "performance" ? (
              <ServerPerformance target={target} policy={catalog.policy} />
            ) : null}
            {tab === "processes" ? (
              <RecordWorkspace
                title="Processes"
                breadcrumb="Server / Processes"
                scopeName={target.name}
                workspaceId={catalog.workspaceId}
                userId={userId}
                page={`server-processes:${target.id}`}
                noun="software"
                records={latest?.processes ?? []}
                identify={(item) => String(item.pid)}
                statusOf={() => "observed"}
                statuses={[]}
                defaultView="table"
                pageSize={50}
                hideActions
                columns={[
                  { id: "name", label: "Process", value: (item) => item.name },
                  { id: "pid", label: "PID", value: (item) => String(item.pid) },
                  { id: "cpu", label: "CPU", value: (item) => serverPercent(item.cpuPercent) },
                  {
                    id: "memory",
                    label: "Working set",
                    value: (item) => serverBytes(item.workingSetBytes),
                  },
                ]}
                renderActions={() => null}
                renderCard={(item) => (
                  <article className="server-monitor-card">
                    <h2>{item.name}</h2>
                    <p className="server-monitor-meta">
                      PID {item.pid} · CPU {serverPercent(item.cpuPercent)} ·{" "}
                      {serverBytes(item.workingSetBytes)}
                    </p>
                  </article>
                )}
                emptyTitle="No process observation"
                emptyDescription="Run a server check to collect a bounded process snapshot."
                notice={`Observed ${stamp(latest?.observedAt)}. Process CPU is shown only when measured; the list is a bounded snapshot and may omit processes outside the collector limit.`}
              />
            ) : null}
            {tab === "services" ? (
              <RecordWorkspace
                title="Services"
                breadcrumb="Server / Services"
                scopeName={target.name}
                workspaceId={catalog.workspaceId}
                userId={userId}
                page={`server-services:${target.id}`}
                noun="services"
                records={latest?.services ?? []}
                identify={(item) => item.name}
                statusOf={(item) => item.state}
                statuses={[]}
                defaultView="table"
                pageSize={50}
                hideActions
                columns={[
                  { id: "name", label: "Name", value: (item) => item.name },
                  { id: "displayName", label: "Display name", value: (item) => item.displayName },
                  {
                    id: "state",
                    label: "Status",
                    value: (item) => item.state,
                    render: (item) => (
                      <RecordBadge
                        tone={item.state.toLowerCase() === "running" ? "positive" : "neutral"}
                      >
                        {item.state}
                      </RecordBadge>
                    ),
                  },
                  { id: "startMode", label: "Startup", value: (item) => item.startMode },
                  {
                    id: "pid",
                    label: "PID",
                    value: (item) => (item.pid === null ? "—" : String(item.pid)),
                  },
                ]}
                renderActions={() => null}
                renderCard={(item) => (
                  <article className="server-monitor-card">
                    <h2>{item.displayName}</h2>
                    <p className="server-monitor-meta">
                      {item.name} · {item.state} · {item.startMode}
                    </p>
                  </article>
                )}
                emptyTitle="No service observation"
                emptyDescription="Run a server check to collect the registered service snapshot."
                notice={`Observed ${stamp(latest?.observedAt)}. Service inventory is read-only in this monitoring view.`}
              />
            ) : null}
            {tab === "alerts" ? (
              target.alerts.length ? (
                [...target.alerts].reverse().map((alert) => (
                  <article className="server-monitor-alert" key={alert.id}>
                    <div className="server-monitor-heading">
                      <RecordBadge tone={alert.resolvedAt ? "positive" : "warning"}>
                        {alert.resolvedAt ? "Resolved" : alert.severity}
                      </RecordBadge>
                      {!alert.acknowledged ? (
                        <button
                          className="button secondary"
                          type="button"
                          disabled={busy}
                          onClick={() => acknowledge(alert.id)}
                        >
                          <Check size={14} /> Acknowledge
                        </button>
                      ) : (
                        <span className="server-monitor-meta">
                          {alert.acknowledged ? "Acknowledged" : "Unread"}
                        </span>
                      )}
                    </div>
                    <p>{alert.message}</p>
                    <p className="server-monitor-meta">
                      Opened {stamp(alert.openedAt)}
                      {alert.resolvedAt ? ` · Resolved ${stamp(alert.resolvedAt)}` : ""}
                    </p>
                  </article>
                ))
              ) : (
                <div className="server-monitor-empty">
                  <ShieldCheck size={32} />
                  <h3>No recorded alerts</h3>
                  <p>
                    CPU and memory alerts use the configured thresholds and consecutive measured
                    samples.
                  </p>
                </div>
              )
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

export function ServerPerformance({
  target,
  policy,
  now = Date.now(),
}: {
  target: Target;
  policy: ServerMonitorPolicy;
  now?: number;
}) {
  const latest = target.latest;
  const days = latest ? Math.floor(latest.uptimeSeconds / 86400) : 0;
  const hours = latest ? Math.floor((latest.uptimeSeconds % 86400) / 3600) : 0;
  const minutes = latest ? Math.floor((latest.uptimeSeconds % 3600) / 60) : 0;
  return (
    <>
      <div className="server-monitor-heading">
        <div>
          <h3 style={{ margin: 0 }}>System performance</h3>
          <p className="server-monitor-address">
            {latest?.osName ?? "The first successful check will identify the operating system."}
          </p>
        </div>
        <RecordBadge tone={serverFresh(target, policy, now) ? "positive" : "neutral"}>
          {serverFresh(target, policy, now) ? "Measured live samples" : "No current measurement"}
        </RecordBadge>
      </div>
      {target.lastError || target.access.message ? (
        <p className="server-monitor-error">{target.lastError || target.access.message}</p>
      ) : null}
      {target.access.status === "auth-failed" && !target.enabled ? (
        <p className="server-monitor-error">
          Automatic checks are paused after authentication failed. An administrator must verify the
          credential profile before retrying.
        </p>
      ) : null}
      <div className="server-monitor-chart-grid">
        <ServerMetricGraph
          points={target.history}
          metric="cpu"
          end={now}
          intervalSeconds={policy.intervalSeconds}
          value={latest?.cpuPercent ?? null}
        />
        <ServerMetricGraph
          points={target.history}
          metric="memory"
          end={now}
          intervalSeconds={policy.intervalSeconds}
          value={serverMemoryPercent(target)}
        />
      </div>
      <p className="server-monitor-meta" style={{ marginTop: 12 }}>
        Actual observations only. Collection gaps stay blank. Last values remain historical after{" "}
        {policy.staleAfterSeconds}s without a new observation.
      </p>
      <dl className="server-monitor-facts">
        <div>
          <dt>
            <Cpu size={13} /> Logical processors
          </dt>
          <dd>{latest?.logicalProcessors ?? "—"}</dd>
        </div>
        <div>
          <dt>
            <MemoryStick size={13} /> Memory in use
          </dt>
          <dd>
            {latest ? serverBytes(latest.memoryTotalBytes - latest.memoryAvailableBytes) : "—"}
          </dd>
        </div>
        <div>
          <dt>Memory available / total</dt>
          <dd>
            {latest
              ? `${serverBytes(latest.memoryAvailableBytes)} / ${serverBytes(latest.memoryTotalBytes)}`
              : "—"}
          </dd>
        </div>
        <div>
          <dt>Up time</dt>
          <dd>{latest ? `${days}d ${hours}h ${minutes}m` : "—"}</dd>
        </div>
        <div>
          <dt>
            <Network size={13} /> Network received
          </dt>
          <dd>
            {latest?.network.receivedBytesPerSecond !== null &&
            latest?.network.receivedBytesPerSecond !== undefined
              ? `${serverBytes(latest.network.receivedBytesPerSecond)}/s`
              : "Not measured"}
          </dd>
        </div>
        <div>
          <dt>Network sent</dt>
          <dd>
            {latest?.network.sentBytesPerSecond !== null &&
            latest?.network.sentBytesPerSecond !== undefined
              ? `${serverBytes(latest.network.sentBytesPerSecond)}/s`
              : "Not measured"}
          </dd>
        </div>
        <div>
          <dt>Processes observed</dt>
          <dd>{latest?.processes.length ?? "—"}</dd>
        </div>
        <div>
          <dt>Services observed</dt>
          <dd>{latest?.services.length ?? "—"}</dd>
        </div>
      </dl>
      <h3 className="server-monitor-section-title">
        <HardDrive size={16} /> Storage
      </h3>
      <div className="server-monitor-disks">
        {latest?.disks.map((disk) => (
          <article className="server-monitor-disk" key={disk.name}>
            <h4>{disk.name}</h4>
            {disk.totalBytes > 0 ? (
              <progress
                aria-label={`${disk.name} space used`}
                max={disk.totalBytes}
                value={disk.totalBytes - disk.freeBytes}
              />
            ) : null}
            <p>
              {serverBytes(disk.freeBytes)} free of {serverBytes(disk.totalBytes)}
            </p>
          </article>
        )) ?? <p className="server-monitor-meta">No disk observation yet.</p>}
      </div>
      {target.sourceRefs.length ? (
        <>
          <h3 className="server-monitor-section-title">Linked application reviews</h3>
          <p className="server-monitor-meta">
            {target.sourceRefs.map((source) => source.title).join(" · ")}
          </p>
        </>
      ) : null}
    </>
  );
}

function EditorShell({
  title,
  description,
  busy,
  error,
  close,
  children,
  submit,
  submitLabel = "Save",
}: {
  title: string;
  description: string;
  busy: boolean;
  error: string;
  close: () => void;
  children: ReactNode;
  submit: (event: FormEvent<HTMLFormElement>) => void;
  submitLabel?: string;
}) {
  return (
    <form className="server-monitor-editor" onSubmit={submit}>
      <header className="server-monitor-detail-header">
        <div className="server-monitor-heading">
          <h2>{title}</h2>
          <button
            className="button ghost"
            type="button"
            disabled={busy}
            onClick={close}
            aria-label={`Close ${title}`}
          >
            <X size={18} />
          </button>
        </div>
        <p>{description}</p>
      </header>
      <div className="server-monitor-form">
        {error ? (
          <p className="server-monitor-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="server-monitor-form-grid">{children}</div>
      </div>
      <footer>
        <button className="button secondary" type="button" disabled={busy} onClick={close}>
          Cancel
        </button>
        <button className="button primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </button>
      </footer>
    </form>
  );
}
export function ServerPolicyEditor({
  initial,
  busy,
  error,
  close,
  save,
}: {
  initial: ServerMonitorPolicy;
  busy: boolean;
  error: string;
  close: () => void;
  save: (next: ServerMonitorPolicy) => Promise<void>;
}) {
  const [value, setValue] = useState(initial);
  const [validation, setValidation] = useState("");
  const fields = [
    { key: "intervalSeconds", label: "Sampling interval (seconds)", min: 10, max: 3600 },
    { key: "staleAfterSeconds", label: "Mark stale after (seconds)", min: 20, max: 86400 },
    { key: "cpuWarningPercent", label: "CPU warning (%)", min: 1, max: 100 },
    { key: "memoryWarningPercent", label: "Memory warning (%)", min: 1, max: 100 },
    { key: "consecutiveSamples", label: "Consecutive high samples for an alert", min: 1, max: 60 },
    { key: "retentionHours", label: "History retention (hours)", min: 1, max: 720 },
    { key: "maxPointsPerTarget", label: "Maximum retained samples per server", min: 30, max: 1440 },
  ] as const;
  return (
    <EditorShell
      title="Monitoring settings"
      description="The central collector samples enabled servers independently of open browser tabs. History is bounded by both time and sample count."
      busy={busy}
      error={validation || error}
      close={close}
      submit={(event) => {
        event.preventDefault();
        const parsed = ServerMonitorPolicySchema.safeParse(value);
        if (!parsed.success) {
          setValidation(
            "Use the displayed limits. The stale interval must cover at least two sampling intervals.",
          );
          return;
        }
        setValidation("");
        void save(parsed.data).catch(() => {});
      }}
    >
      <label className="server-monitor-check">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(event) => setValue({ ...value, enabled: event.target.checked })}
        />{" "}
        Enable scheduled server monitoring
      </label>
      {fields.map((field) => (
        <label key={field.key}>
          {field.label}
          <input
            type="number"
            min={field.min}
            max={field.max}
            step={1}
            required
            value={value[field.key]}
            onChange={(event) => setValue({ ...value, [field.key]: Number(event.target.value) })}
          />
        </label>
      ))}
    </EditorShell>
  );
}
export function ServerTargetEditor({
  initial,
  users,
  busy,
  error,
  close,
  save,
}: {
  initial?: Target | undefined;
  users: ReviewCatalog["users"];
  busy: boolean;
  error: string;
  close: () => void;
  save: (input: ServerMonitorSaveTarget) => Promise<void>;
}) {
  const [value, setValue] = useState<ServerMonitorSaveTarget>(() => ({
    ...(initial ? { id: initial.id } : {}),
    expectedRevision: initial?.revision ?? null,
    name: initial?.name ?? "",
    address: initial?.address ?? "",
    port: initial?.port ?? 5985,
    transport: initial?.transport ?? "winrm-http",
    enabled: initial?.enabled ?? true,
    credentialProfile: initial?.credentialProfile ?? "",
    grants: initial?.grants ?? [],
  }));
  const [validation, setValidation] = useState("");
  return (
    <EditorShell
      title={initial ? "Server configuration" : "Add server"}
      description="Choose a registered credential reference. Its password stays in protected server configuration. Access is granted explicitly to the selected accounts."
      busy={busy}
      error={validation || error}
      close={close}
      submit={(event) => {
        event.preventDefault();
        const parsed = ServerMonitorSaveTargetSchema.safeParse(value);
        if (!parsed.success) {
          setValidation(
            "Enter a name, private IPv4 address, valid port and registered credential profile. Grants must be unique user IDs.",
          );
          return;
        }
        void save(parsed.data).catch(() => {});
      }}
    >
      <label>
        Name
        <input
          required
          maxLength={240}
          value={value.name}
          onChange={(event) => setValue({ ...value, name: event.target.value })}
        />
      </label>
      <label>
        Private server address
        <input
          required
          disabled={Boolean(initial)}
          value={value.address}
          inputMode="decimal"
          onChange={(event) => setValue({ ...value, address: event.target.value })}
        />
      </label>
      <label>
        Transport
        <select
          disabled={Boolean(initial)}
          value={value.transport}
          onChange={(event) =>
            setValue({ ...value, transport: event.target.value as typeof value.transport })
          }
        >
          <option value="winrm-http">WinRM HTTP</option>
          <option value="winrm-https">WinRM HTTPS</option>
          <option value="local">Server collector host</option>
        </select>
      </label>
      <label>
        Port
        <input
          required
          disabled={Boolean(initial)}
          type="number"
          min={1}
          max={65535}
          value={value.port}
          onChange={(event) => setValue({ ...value, port: Number(event.target.value) })}
        />
      </label>
      {initial ? (
        <p className="server-monitor-meta server-monitor-full">
          Address, port and transport identify the enrolled server. To change them, add a separately
          enrolled server target.
        </p>
      ) : null}
      <label className="server-monitor-full">
        Credential profile reference
        <input
          required
          autoComplete="off"
          pattern="[a-z][a-z0-9_-]{2,79}"
          value={value.credentialProfile}
          onChange={(event) => setValue({ ...value, credentialProfile: event.target.value })}
        />
        <small>An opaque configured reference, never a password.</small>
      </label>
      <label className="server-monitor-check">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(event) => setValue({ ...value, enabled: event.target.checked })}
        />{" "}
        Include this server in scheduled monitoring
      </label>
      <div className="server-monitor-full">
        <h3 className="server-monitor-section-title">
          <ShieldCheck size={16} /> Account access
        </h3>
        <p className="server-monitor-meta">
          Administrators can view all servers. Other accounts see only explicitly granted servers.
        </p>
        {users.length ? (
          users.map((user) => (
            <label className="server-monitor-check" key={user.userId}>
              <input
                type="checkbox"
                checked={value.grants.includes(user.userId)}
                onChange={(event) =>
                  setValue({
                    ...value,
                    grants: event.target.checked
                      ? [...value.grants, user.userId]
                      : value.grants.filter((id) => id !== user.userId),
                  })
                }
              />{" "}
              {user.name} <small>{user.userId}</small>
            </label>
          ))
        ) : (
          <p className="server-monitor-meta">
            The workspace account directory is unavailable. Existing grants are retained.
          </p>
        )}
      </div>
    </EditorShell>
  );
}
export function ServerImportEditor({
  api,
  workspaceId,
  registers,
  busy,
  error,
  close,
  save,
}: {
  api: ControlCenterApi;
  workspaceId: string;
  registers: ReviewCatalog["registers"];
  busy: boolean;
  error: string;
  close: () => void;
  save: (input: ServerMonitorImport) => Promise<void>;
}) {
  const [registerId, setRegisterId] = useState("");
  const [register, setRegister] = useState<ReviewState | null>(null);
  const [loadError, setLoadError] = useState("");
  const [values, setValues] = useState<string[]>([]);
  const [hostingField, setHostingField] = useState("");
  const [credentialProfile, setProfile] = useState("");
  const [transport, setTransport] = useState<"winrm-http" | "winrm-https">("winrm-http");
  const [port, setPort] = useState(5985);
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    setRegister(null);
    setValues([]);
    setHostingField("");
    setLoadError("");
    if (!registerId || !api.reviewsState) return;
    const controller = new AbortController();
    void api
      .reviewsState(workspaceId, registerId, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setRegister(next);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setLoadError("The application register could not be loaded. Choose it again to retry.");
      });
    return () => controller.abort();
  }, [api, workspaceId, registerId]);
  const [validation, setValidation] = useState("");
  return (
    <EditorShell
      title="Import servers from Reviews"
      description="Select the ownership values that are approved for monitoring. Vendor or other unselected rows stay excluded. Shared server addresses are consolidated and keep their linked applications."
      busy={busy}
      error={validation || loadError || error}
      close={close}
      submitLabel="Import selected servers"
      submit={(event) => {
        event.preventDefault();
        const parsed = ServerMonitorImportSchema.safeParse({
          registerId,
          managementValues: values,
          hostingField,
          credentialProfile,
          transport,
          port,
          enabled,
        });
        if (!parsed.success) {
          setValidation(
            "Choose a register, at least one approved ownership value, a hosting-address field, and a registered credential profile.",
          );
          return;
        }
        void save(parsed.data).catch(() => {});
      }}
    >
      <label className="server-monitor-full">
        Application register
        <select required value={registerId} onChange={(event) => setRegisterId(event.target.value)}>
          <option value="">Choose a register…</option>
          {registers.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <div className="server-monitor-full">
        <h3 className="server-monitor-section-title">Approved ownership values</h3>
        {register?.register.managementOptions.map((option) => (
          <label key={option} className="server-monitor-check">
            <input
              type="checkbox"
              checked={values.includes(option)}
              onChange={(event) =>
                setValues(
                  event.target.checked
                    ? [...values, option]
                    : values.filter((item) => item !== option),
                )
              }
            />
            {option}
          </label>
        ))}
        {!register ? (
          <p className="server-monitor-meta">
            Choose an application register to review its configured ownership values.
          </p>
        ) : null}
      </div>
      <label>
        Hosting address field
        <select
          required
          value={hostingField}
          onChange={(event) => setHostingField(event.target.value)}
        >
          <option value="">Choose a field…</option>
          {register?.register.fields.map((field) => (
            <option key={field.key} value={field.key}>
              {field.label} ({field.key})
            </option>
          ))}
        </select>
      </label>
      <label>
        Credential profile reference
        <input
          required
          value={credentialProfile}
          autoComplete="off"
          pattern="[a-z][a-z0-9_-]{2,79}"
          onChange={(event) => setProfile(event.target.value)}
        />
      </label>
      <label>
        Transport
        <select
          value={transport}
          onChange={(event) => setTransport(event.target.value as typeof transport)}
        >
          <option value="winrm-http">WinRM HTTP</option>
          <option value="winrm-https">WinRM HTTPS</option>
        </select>
      </label>
      <label>
        Port
        <input
          type="number"
          required
          min={1}
          max={65535}
          value={port}
          onChange={(event) => setPort(Number(event.target.value))}
        />
      </label>
      <label className="server-monitor-check">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />{" "}
        Enable imported servers for monitoring
      </label>
    </EditorShell>
  );
}
