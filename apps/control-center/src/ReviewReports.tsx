import {
  type ReviewMonitoringSummary,
  type ReviewMonitorRun,
  type ReviewScheduleConfig,
  ReviewScheduleConfigSchema,
  type ReviewState,
  type ReviewTlsObservation,
} from "@frevos/contracts";
import { CalendarClock, CheckCheck, ClipboardList, RefreshCw, ShieldAlert, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { ApiFailure, type ControlCenterApi } from "./api.js";
import { RecordBadge } from "./RecordWorkspace.js";
import { CheckEvidence, reviewStatus, reviewTone } from "./ReviewsPage.js";
import { WorkspaceDialog } from "./WorkspaceDialog.js";
import "./ReviewReports.css";

export type MonitoringStatus = "loading" | "ready" | "denied" | "unavailable";
export type ReviewAlertEntry = {
  registerId: string;
  registerName: string;
  alert: ReviewMonitoringSummary["registers"][number]["monitoring"]["alerts"][number];
};
const stamp = (value: string | null) => (value ? new Date(value).toLocaleString() : "Not recorded");
export const scheduledStamp = (value: string | null, timeZone: string) =>
  value ? new Date(value).toLocaleString(undefined, { timeZone }) : "Not recorded";
const weekdays = [
  { id: 1, label: "Monday" },
  { id: 2, label: "Tuesday" },
  { id: 3, label: "Wednesday" },
  { id: 4, label: "Thursday" },
  { id: 5, label: "Friday" },
  { id: 6, label: "Saturday" },
  { id: 7, label: "Sunday" },
];
export function latestReviewReport(runs: ReviewMonitorRun[]) {
  return runs.toSorted((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0];
}
export function monitorReportTotals(run: ReviewMonitorRun) {
  return (
    run.summary ?? {
      endpoints: run.items.length,
      completed: run.items.filter((item) => item.status === "completed").length,
      issues: run.items.filter(
        (item) =>
          item.status === "completed" &&
          item.result &&
          reviewTone(item.result.status) !== "positive",
      ).length,
    }
  );
}
export function monitoringAlerts(
  summary: ReviewMonitoringSummary | null,
  unreadOnly = true,
): ReviewAlertEntry[] {
  return (
    summary?.registers.flatMap((register) =>
      register.monitoring.alerts
        .filter((alert) => !alert.resolvedAt && (!unreadOnly || !alert.readAt))
        .map((alert) => ({
          registerId: register.registerId,
          registerName: register.registerName,
          alert,
        })),
    ) ?? []
  ).toSorted((a, b) => Date.parse(b.alert.createdAt) - Date.parse(a.alert.createdAt));
}
export function certificateDaysRemaining(observation: ReviewTlsObservation) {
  if (!observation.validTo) return null;
  const difference = Date.parse(observation.validTo) - Date.parse(observation.observedAt);
  return Number.isFinite(difference) ? Math.ceil(difference / 86400000) : null;
}
export function certificateCurrentState(
  observation: ReviewTlsObservation,
  warningDays: number[] = [],
  now = Date.now(),
) {
  const expires = observation.validTo ? Date.parse(observation.validTo) : Number.NaN;
  const daysRemaining = Number.isFinite(expires) ? Math.ceil((expires - now) / 86400000) : null;
  const expired = Number.isFinite(expires) && expires <= now;
  return {
    daysRemaining,
    expired,
    warning:
      !expired &&
      daysRemaining !== null &&
      warningDays.some((threshold) => daysRemaining <= threshold),
  };
}
export function CertificateEvidence({
  observation,
  warningDays = [],
  now,
}: {
  observation: ReviewTlsObservation;
  warningDays?: number[];
  now?: number;
}) {
  const days = certificateDaysRemaining(observation);
  const current = certificateCurrentState(observation, warningDays, now);
  const verification =
    observation.verification === "verified"
      ? "Verified at observation"
      : observation.verification === "failed"
        ? "Certificate verification failed"
        : "Certificate unavailable";
  return (
    <article className="review-certificate">
      <div className="reviews-section-heading">
        <strong>
          {observation.hostname}:{observation.port}
        </strong>
        <RecordBadge
          tone={
            observation.verification !== "verified" || current.expired
              ? "negative"
              : current.warning
                ? "warning"
                : "positive"
          }
        >
          {verification}
        </RecordBadge>
        <RecordBadge tone={current.expired ? "negative" : current.warning ? "warning" : "neutral"}>
          {current.daysRemaining === null
            ? "Recorded expiry unknown"
            : current.expired
              ? "Recorded certificate expired"
              : `${current.daysRemaining} days remaining now`}
        </RecordBadge>
      </div>
      <dl className="reviews-facts">
        <div>
          <dt>Expires</dt>
          <dd>{stamp(observation.validTo)}</dd>
        </div>
        <div>
          <dt>Days remaining at observation</dt>
          <dd>
            {days === null
              ? "Unknown"
              : days < 0
                ? `Expired ${Math.abs(days)} days before check`
                : `${days} days`}
          </dd>
        </div>
        <div>
          <dt>Observed</dt>
          <dd>{stamp(observation.observedAt)}</dd>
        </div>
        <div>
          <dt>Valid from</dt>
          <dd>{stamp(observation.validFrom)}</dd>
        </div>
        <div>
          <dt>Issuer</dt>
          <dd>{observation.issuer ?? "Unavailable"}</dd>
        </div>
        <div>
          <dt>Subject</dt>
          <dd>{observation.subject ?? "Unavailable"}</dd>
        </div>
      </dl>
      {observation.errorCode ? (
        <p className="reviews-muted">Verification: {observation.errorCode}</p>
      ) : null}
      <p className="reviews-muted">
        Recorded certificate expiry; a fresh check may observe a renewed certificate. Expiry
        metadata alone does not establish a trusted certificate or a working application.
      </p>
    </article>
  );
}
export function MonitoringAlertList({
  entries,
  openRegister,
  onRead,
  busyId,
  emptyText = "No active alerts.",
}: {
  entries: ReviewAlertEntry[];
  openRegister: (id: string) => void;
  onRead?: (registerId: string, alertId: string) => void;
  busyId?: string;
  emptyText?: string;
}) {
  return (
    <div className="review-monitor-alerts">
      {entries.length ? (
        entries.map(({ registerId, registerName, alert }) => (
          <article key={`${registerId}:${alert.id}`}>
            <div className="reviews-section-heading">
              <h3>{alert.title}</h3>
              <RecordBadge tone={alert.kind === "ssl-expiring" ? "warning" : "negative"}>
                {alert.kind === "ssl-expiring"
                  ? "SSL expiry warning"
                  : alert.kind === "ssl-expired"
                    ? "SSL expired"
                    : alert.kind === "tls-error"
                      ? "TLS issue"
                      : "Report issue"}
              </RecordBadge>
            </div>
            <p className="reviews-preserve-text">{alert.message}</p>
            <p className="reviews-muted">
              {registerName} · {stamp(alert.createdAt)}
              {alert.thresholdDays !== null ? ` · ${alert.thresholdDays}-day threshold` : ""}
            </p>
            {alert.expiresAt ? (
              <p className="reviews-muted">
                Expires {stamp(alert.expiresAt)} · Observed {stamp(alert.observedAt)}
              </p>
            ) : null}
            <div className="reviews-row-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => openRegister(registerId)}
              >
                View report
              </button>
              {onRead && !alert.readAt ? (
                <button
                  type="button"
                  className="button secondary"
                  disabled={busyId === alert.id}
                  onClick={() => onRead(registerId, alert.id)}
                >
                  {busyId === alert.id ? "Saving…" : "Mark as read"}
                </button>
              ) : null}
            </div>
          </article>
        ))
      ) : (
        <p className="reviews-muted">{emptyText}</p>
      )}
    </div>
  );
}
export function ReviewMonitoringOverview({
  status,
  summary,
  openRegister,
}: {
  status: MonitoringStatus;
  summary: ReviewMonitoringSummary | null;
  openRegister: (id: string) => void;
}) {
  if (status === "denied" || (status === "ready" && !summary?.registers.length)) return null;
  const alerts = monitoringAlerts(summary);
  return (
    <section className="panel review-monitor-overview" aria-label="Application review monitoring">
      <div className="panel-header">
        <div>
          <h2>
            <ClipboardList size={17} />
            Application review reports
          </h2>
          <p>
            Scheduled link checks and SSL certificate observations for your authorized registers.
          </p>
        </div>
      </div>
      {status !== "ready" ? (
        <p role="status" className="reviews-muted">
          {status === "loading"
            ? "Checking review reports…"
            : "Review reports are unavailable. Retrying automatically; no zero-alert result is assumed."}
        </p>
      ) : (
        <>
          <div className="review-monitor-summary">
            <div>
              <strong>
                {summary?.registers.filter((register) => register.monitoring.schedule?.enabled)
                  .length ?? 0}
              </strong>
              <span>Active schedules</span>
            </div>
            <div>
              <strong>
                {summary?.registers.filter((register) =>
                  latestReviewReport(register.monitoring.runs),
                ).length ?? 0}
              </strong>
              <span>Registers with reports</span>
            </div>
            <div>
              <strong>{alerts.length}</strong>
              <span>Unread alerts</span>
            </div>
          </div>
          <div className="review-monitor-registers">
            {summary?.registers.map((register) => {
              const report = latestReviewReport(register.monitoring.runs);
              const totals = report ? monitorReportTotals(report) : null;
              return (
                <article key={register.registerId}>
                  <div>
                    <h3>{register.registerName}</h3>
                    <p className="reviews-muted">
                      {report
                        ? `${report.status} · ${stamp(report.startedAt)} · ${report.eligibleRecords} selected, ${report.skippedRecords} skipped`
                        : "No monitoring report has run."}
                    </p>
                    {totals ? (
                      <p className="reviews-muted">
                        {totals.completed}/{totals.endpoints} endpoint checks completed ·{" "}
                        {totals.issues} results need review
                      </p>
                    ) : null}
                    <p className="reviews-muted">
                      {register.monitoring.schedule?.enabled
                        ? `Next: ${scheduledStamp(register.monitoring.nextRunAt, register.monitoring.schedule.timeZone)} (${register.monitoring.schedule.timeZone})`
                        : register.monitoring.schedule?.accessibleValues.length
                          ? "Weekly HTTP checks disabled; certificate reminders use the last observation."
                          : "Weekly HTTP checks disabled; no access values selected for new reminders."}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => openRegister(register.registerId)}
                  >
                    Reports & schedule
                  </button>
                </article>
              );
            })}
          </div>
          <MonitoringAlertList
            entries={alerts.slice(0, 5)}
            openRegister={openRegister}
            emptyText="No unread SSL or report alerts."
          />
        </>
      )}
    </section>
  );
}
function monitoringFailure(reason: unknown) {
  if (reason instanceof ApiFailure && reason.responseStatus === 409)
    return "This register changed. Refresh it before saving the schedule or starting another report.";
  if (reason instanceof ApiFailure && reason.kind === "denied")
    return "You do not have permission for this monitoring action.";
  return "The monitoring action could not be confirmed. Refresh and try again.";
}
export function ReviewReportsDialog({
  api,
  workspaceId,
  state,
  close,
  updated,
  onFailure,
}: {
  api: ControlCenterApi;
  workspaceId: string;
  state: ReviewState;
  close: () => void;
  updated: (value: ReviewState) => void;
  onFailure: (reason: unknown) => void;
}) {
  const [tab, setTab] = useState<"reports" | "schedule">("reports");
  const [selected, setSelected] = useState(
    () => latestReviewReport(state.monitoring?.runs ?? [])?.id ?? "",
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const administrator = state.role === "administrator";
  const monitoring = state.monitoring;
  const running = monitoring?.runs.some((run) => run.status === "running") === true;
  useEffect(() => {
    if (!running || !api.reviewsState) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const request = api.reviewsState;
    const poll = async () => {
      try {
        const result = await request(workspaceId, state.register.id, abort.signal);
        if (!abort.signal.aborted) {
          updated(result);
          if (!result.monitoring?.runs.some((run) => run.status === "running"))
            window.dispatchEvent(new Event("devsetu-review-monitoring-changed"));
        }
      } catch (reason) {
        if (!abort.signal.aborted) {
          setError(monitoringFailure(reason));
          if (reason instanceof ApiFailure && ["unauthenticated", "denied"].includes(reason.kind))
            onFailure(reason);
        }
      } finally {
        if (!abort.signal.aborted) timer = setTimeout(() => void poll(), 3000);
      }
    };
    timer = setTimeout(() => void poll(), 3000);
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [running, api, workspaceId, state.register.id, updated, onFailure]);
  const runAction = async (action: () => Promise<ReviewState>) => {
    setBusy(true);
    setError("");
    try {
      const result = await action();
      updated(result);
      window.dispatchEvent(new Event("devsetu-review-monitoring-changed"));
      return result;
    } catch (reason) {
      setError(monitoringFailure(reason));
      if (reason instanceof ApiFailure && ["unauthenticated", "denied"].includes(reason.kind))
        onFailure(reason);
      return null;
    } finally {
      setBusy(false);
    }
  };
  const report =
    monitoring?.runs.find((run) => run.id === selected) ??
    latestReviewReport(monitoring?.runs ?? []);
  return (
    <WorkspaceDialog label={`Reports and schedule: ${state.register.name}`} onClose={close}>
      <section className="reviews-editor review-reports-editor">
        <header className="reviews-dialog-header">
          <div>
            <h2>Reports & schedule</h2>
            <p>{state.register.name}</p>
          </div>
          <button type="button" className="button ghost" aria-label="Close reports" onClick={close}>
            <X size={18} />
          </button>
        </header>
        <nav className="reviews-tabs" aria-label="Monitoring sections">
          <button
            type="button"
            className="button secondary"
            aria-pressed={tab === "reports"}
            onClick={() => setTab("reports")}
          >
            <ClipboardList size={15} />
            Reports
          </button>
          {administrator ? (
            <button
              type="button"
              className="button secondary"
              aria-pressed={tab === "schedule"}
              onClick={() => setTab("schedule")}
            >
              <CalendarClock size={15} />
              Weekly schedule
            </button>
          ) : null}
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => {
              const request = api.reviewsState;
              if (request) void runAction(() => request(workspaceId, state.register.id));
            }}
          >
            <RefreshCw size={15} />
            Refresh
          </button>
          {administrator ? (
            <button
              type="button"
              className="button primary"
              disabled={busy || running || !monitoring?.schedule?.accessibleValues.length}
              onClick={() => {
                const request = api.runReviewMonitor;
                if (request)
                  void runAction(() =>
                    request(workspaceId, {
                      version: 1,
                      registerId: state.register.id,
                      expectedRevision: state.register.revision,
                    }),
                  ).then((value) => {
                    if (value) {
                      setSelected(latestReviewReport(value.monitoring?.runs ?? [])?.id ?? "");
                      setTab("reports");
                    }
                  });
              }}
            >
              <CheckCheck size={15} />
              {running ? "Report running…" : "Run check now"}
            </button>
          ) : null}
        </nav>
        <div className="reviews-form-scroll">
          {tab === "schedule" && administrator ? (
            <MonitoringScheduleEditor
              key={`${state.register.id}:${monitoring?.scheduleRevision ?? 0}`}
              state={state}
              busy={busy}
              save={async (schedule) => {
                const request = api.saveReviewSchedule;
                if (request)
                  await runAction(() =>
                    request(workspaceId, {
                      version: 1,
                      registerId: state.register.id,
                      expectedRevision: state.register.revision,
                      schedule,
                    }),
                  );
              }}
            />
          ) : (
            <>
              {!administrator ? (
                <p className="reviews-muted">
                  View-only monitoring. Only an administrator can change schedules or start a
                  report.
                </p>
              ) : null}
              {!monitoring?.schedule?.accessibleValues.length ? (
                <p className="record-notice">
                  Select the exact recorded-access values in Weekly schedule before running a
                  report. Unselected values, including inaccessible entries, are skipped.
                </p>
              ) : null}
              {monitoring?.schedule ? (
                <p className="reviews-muted">
                  {monitoring.schedule.enabled
                    ? `Next scheduled check: ${scheduledStamp(monitoring.nextRunAt, monitoring.schedule.timeZone)} · ${monitoring.schedule.timeZone}`
                    : "Weekly HTTP checks disabled. Certificate reminders use the last observation; no fresh HTTP check is implied."}{" "}
                  SSL warning thresholds: {monitoring.schedule.sslWarningDays.join(", ")} days.
                </p>
              ) : null}
              <label>
                Saved reports
                <select
                  value={report?.id ?? ""}
                  onChange={(event) => setSelected(event.target.value)}
                >
                  <option value="">Choose a report</option>
                  {monitoring?.runs
                    .toSorted((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
                    .map((run) => (
                      <option key={run.id} value={run.id}>
                        {stamp(run.startedAt)} · {run.trigger} · {run.status}
                      </option>
                    ))}
                </select>
              </label>
              {report ? (
                <MonitorRunReport
                  run={report}
                  warningDays={monitoring?.schedule?.sslWarningDays ?? []}
                />
              ) : (
                <p className="reviews-muted">
                  No monitoring reports yet. Nothing runs automatically until an administrator
                  enables and saves a schedule.
                </p>
              )}
              <h3>
                <ShieldAlert size={16} />
                SSL and monitoring alerts
              </h3>
              <MonitoringAlertList
                entries={(monitoring?.alerts ?? [])
                  .filter((alert) => !alert.resolvedAt)
                  .map((alert) => ({
                    registerId: state.register.id,
                    registerName: state.register.name,
                    alert,
                  }))}
                openRegister={() => setTab("reports")}
                onRead={(registerId, alertId) => {
                  const request = api.readReviewMonitorAlert;
                  if (request)
                    void runAction(() => request(workspaceId, { version: 1, registerId, alertId }));
                }}
              />
            </>
          )}
        </div>
        {error ? (
          <p className="reviews-error" role="alert">
            {error}
          </p>
        ) : null}
        <footer className="reviews-dialog-footer">
          <button type="button" className="button secondary" onClick={close}>
            Close
          </button>
        </footer>
      </section>
    </WorkspaceDialog>
  );
}
export function monitoringScheduleFromForm(
  schedule: ReviewScheduleConfig,
  data: FormData,
  thresholdText: string,
) {
  const visibleTime = data.get("time");
  return ReviewScheduleConfigSchema.safeParse({
    ...schedule,
    time: typeof visibleTime === "string" ? visibleTime : schedule.time,
    sslWarningDays: thresholdText.split(",").map((value) => Number(value.trim())),
  });
}
export function MonitoringScheduleEditor({
  state,
  busy,
  save,
}: {
  state: ReviewState;
  busy: boolean;
  save: (schedule: ReviewScheduleConfig) => Promise<void>;
}) {
  const [schedule, setSchedule] = useState<ReviewScheduleConfig>(() =>
    state.monitoring?.schedule
      ? structuredClone(state.monitoring.schedule)
      : {
          enabled: false,
          weekdays: [],
          time: "09:00",
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          accessibleValues: [],
          sslWarningDays: [15, 10],
        },
  );
  const [thresholdText, setThresholdText] = useState(schedule.sslWarningDays.join(", ")),
    [error, setError] = useState("");
  const values = [
    ...new Set([
      ...state.records.map((record) => record.recordedAccess.trim()).filter(Boolean),
      ...schedule.accessibleValues,
    ]),
  ].sort();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = monitoringScheduleFromForm(
      schedule,
      new FormData(event.currentTarget),
      thresholdText,
    );
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the schedule values.");
      return;
    }
    setError("");
    void save(parsed.data);
  };
  return (
    <form className="review-schedule-form" onSubmit={submit}>
      <h3>Weekly link and SSL check</h3>
      <p className="reviews-muted">
        Checks run on the DevSetu server using the register’s allowed origins. Closing this browser
        does not stop a saved server schedule.
      </p>
      <label className="reviews-checkbox">
        <input
          type="checkbox"
          checked={schedule.enabled}
          onChange={(event) => setSchedule({ ...schedule, enabled: event.target.checked })}
        />
        Enable weekly schedule
      </label>
      <fieldset className="reviews-field-definition">
        <legend>Days</legend>
        <div className="review-weekdays">
          {weekdays.map((day) => (
            <label key={day.id} className="reviews-checkbox">
              <input
                type="checkbox"
                checked={schedule.weekdays.includes(day.id)}
                onChange={(event) =>
                  setSchedule({
                    ...schedule,
                    weekdays: event.target.checked
                      ? [...schedule.weekdays, day.id].sort((a, b) => a - b)
                      : schedule.weekdays.filter((value) => value !== day.id),
                  })
                }
              />
              {day.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="reviews-form-grid">
        <label>
          Time
          <input
            type="time"
            name="time"
            required
            value={schedule.time}
            onInput={(event) => {
              const time = event.currentTarget.value;
              setSchedule((current) => ({ ...current, time }));
            }}
            onChange={(event) => setSchedule({ ...schedule, time: event.target.value })}
          />
        </label>
        <label>
          Time zone
          <input
            required
            maxLength={80}
            placeholder="Region/City"
            value={schedule.timeZone}
            onChange={(event) => setSchedule({ ...schedule, timeZone: event.target.value })}
          />
        </label>
        <label>
          SSL expiry warning days
          <input
            required
            value={thresholdText}
            onChange={(event) => setThresholdText(event.target.value)}
          />
          <span className="reviews-muted">
            Comma-separated days before expiry, for example 15, 10.
          </span>
        </label>
      </div>
      <fieldset className="reviews-field-definition">
        <legend>Recorded-access values to check</legend>
        <p className="reviews-muted">
          Select only values that mean accessible in this register. No value is selected
          automatically. Every other value is skipped; a skipped entry does not become healthy.
        </p>
        {values.length ? (
          <div className="review-access-values">
            {values.map((value) => (
              <label key={value} className="reviews-checkbox">
                <input
                  type="checkbox"
                  checked={schedule.accessibleValues.includes(value)}
                  onChange={(event) =>
                    setSchedule({
                      ...schedule,
                      accessibleValues: event.target.checked
                        ? [...schedule.accessibleValues, value]
                        : schedule.accessibleValues.filter((item) => item !== value),
                    })
                  }
                />
                {value}
              </label>
            ))}
          </div>
        ) : (
          <p>No recorded-access values are available. Add or import application records first.</p>
        )}
      </fieldset>
      <p className="reviews-muted">
        Pausing weekly checks stops new HTTP requests. Certificate reminders continue from retained
        observations for selected access values. Clear all access values to stop new reminders.
      </p>
      <p className="reviews-muted">
        HTTP responses and page checks are automated evidence. Any browser verification already
        saved by a reviewer remains separate evidence.
      </p>
      {error ? (
        <p className="reviews-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="button primary" disabled={busy}>
        {busy ? "Saving…" : "Save schedule"}
      </button>
    </form>
  );
}
export function MonitorRunReport({
  run,
  warningDays = [],
}: {
  run: ReviewMonitorRun;
  warningDays?: number[];
}) {
  const totals = monitorReportTotals(run);
  return (
    <section className="review-run-report" aria-label="Monitoring report">
      <div className="reviews-section-heading">
        <h3>{run.trigger === "scheduled" ? "Scheduled report" : "Manual report"}</h3>
        <RecordBadge
          tone={
            run.status === "completed"
              ? "positive"
              : run.status === "running"
                ? "neutral"
                : "warning"
          }
        >
          {run.status}
        </RecordBadge>
      </div>
      <p className="reviews-muted">
        Started {stamp(run.startedAt)}
        {run.scheduledFor ? ` · Scheduled for ${stamp(run.scheduledFor)}` : ""}
        {run.finishedAt ? ` · Finished ${stamp(run.finishedAt)}` : ""}
      </p>
      <div className="review-monitor-summary">
        <div>
          <strong>{run.eligibleRecords}</strong>
          <span>Selected applications</span>
        </div>
        <div>
          <strong>{run.skippedRecords}</strong>
          <span>Skipped applications</span>
        </div>
        <div>
          <strong>
            {totals.completed}/{totals.endpoints}
          </strong>
          <span>Endpoints completed</span>
        </div>
        <div>
          <strong>{totals.issues}</strong>
          <span>Results need review</span>
        </div>
      </div>
      <p>{run.message}</p>
      {run.items.map((item) => (
        <details key={`${item.recordId}:${item.endpointId}`} className="review-run-item">
          <summary>
            <strong>{item.recordTitle}</strong> · {item.endpointLabel || item.url} ·{" "}
            {item.result
              ? `HTTP ${item.result.httpStatus ?? "—"} · ${reviewStatus(item.result.status)}`
              : item.status}
          </summary>
          <p className="reviews-wrap">{item.url}</p>
          <p>{item.message}</p>
          {item.result ? (
            <>
              <CheckEvidence check={item.result} />
              {item.result.tls?.length ? (
                <section aria-label="SSL certificate observations">
                  <h4>SSL certificate observations</h4>
                  {item.result.tls.map((observation) => (
                    <CertificateEvidence
                      key={`${observation.url}:${observation.observedAt}`}
                      observation={observation}
                      warningDays={warningDays}
                    />
                  ))}
                </section>
              ) : (
                <p className="reviews-muted">
                  No certificate observation for this result. HTTP-only endpoints do not provide an
                  SSL certificate.
                </p>
              )}
            </>
          ) : null}
        </details>
      ))}
    </section>
  );
}
