import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  type AgentRun,
  type NotificationState,
  NotificationDraftInputSchema,
} from "@frevos/contracts";
import type { ControlCenterApi } from "./api.js";
import { WorkspaceDialog } from "./WorkspaceDialog.js";
import { RecordBadge } from "./RecordWorkspace.js";
export function AgentNotificationsPanel({
  api,
  workspaceId,
  source,
  onClose,
}: {
  api: ControlCenterApi;
  workspaceId: string;
  source: AgentRun | null;
  onClose: () => void;
}) {
  const [state, setState] = useState<NotificationState | null>(null),
    [reload, setReload] = useState(0),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [deviceId, setDeviceId] = useState(""),
    [title, setTitle] = useState("Project update"),
    [message, setMessage] = useState(source?.output.slice(0, 800) ?? "");
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload is explicit refresh.
  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await api.agentNotifications!(workspaceId, abort.signal);
        if (!abort.signal.aborted) setState(next);
      } catch {
        if (!abort.signal.aborted)
          setNotice("Notifications unavailable for this workspace or connection.");
      }
      if (!abort.signal.aborted) timer = setTimeout(() => void poll(), 5000);
    };
    void poll();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [api, workspaceId, reload]);
  return (
    <WorkspaceDialog
      label="Laptop notifications"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <section className="project-editor discovery-editor">
        <header className="settings-header">
          <h2>Laptop notifications</h2>
          <button
            type="button"
            className="button ghost"
            aria-label="Close laptop notifications"
            disabled={busy}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </header>
        <div className="discovery-scroll discovery-form">
          <p>
            Messages remain drafts until you approve the exact text and device. The paired
            computer's user must separately opt in using its local setup. Delivery requested does
            not mean the person read it. One approval per device per hour; records are retained for
            seven days.
          </p>
          {source ? (
            <form
              className="discovery-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (busy) return;
                setBusy(true);
                void Promise.resolve()
                  .then(() =>
                    api.draftNotification!(
                      workspaceId,
                      NotificationDraftInputSchema.parse({
                        version: 1,
                        runId: source.id,
                        deviceId,
                        title,
                        message,
                      }),
                    ),
                  )
                  .then(() => {
                    setNotice("Draft saved. Review its text and recipient below before approving.");
                    setReload((n) => n + 1);
                  })
                  .catch(() =>
                    setNotice(
                      "Draft not saved. Check the source run's notification guardrail and selected device.",
                    ),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              <p>Source analysis: {new Date(source.createdAt).toLocaleString()}</p>
              <label>
                Recipient computer
                <select required value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
                  <option value="">Choose this account's paired computer</option>
                  {state?.recipients.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.name} · {d.online ? "Online" : "Offline"} ·{" "}
                      {d.enabled ? "Local opt-in enabled" : "Local opt-in required"}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Title
                <input
                  required
                  maxLength={80}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label>
                Suggestion
                <textarea
                  required
                  maxLength={800}
                  rows={6}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </label>
              <p>
                Review the underlying plan and evidence. Do not treat file activity as proof of
                employee performance.
              </p>
              <button type="submit" className="button secondary" disabled={busy}>
                Save draft
              </button>
            </form>
          ) : (
            <p>
              Create a notification suggestion from a successful analysis whose agent permits
              notification drafts.
            </p>
          )}
          {notice ? <p role="status">{notice}</p> : null}
          {state?.records.map((n) => {
            const target = state.recipients.find((d) => d.deviceId === n.deviceId),
              ready = target?.online && target.enabled && target.capability !== "unavailable";
            return (
              <article className="discovery-event" key={n.id}>
                <header className="record-row-actions">
                  <strong>{n.title}</strong>
                  <RecordBadge>{n.status.replaceAll("-", " ")}</RecordBadge>
                </header>
                <p>
                  Recipient: <strong>{target?.name ?? "Unavailable"}</strong>
                </p>
                <pre className="agent-output">{n.message}</pre>
                <small>
                  {new Date(n.createdAt).toLocaleString()} · Approval/delivery expiry:{" "}
                  {new Date(n.expiresAt).toLocaleString()}
                </small>
                {n.status === "draft" ? (
                  <>
                    <p>
                      {ready
                        ? "Approval queues this exact message for this computer for ten minutes."
                        : "Approval requires a fresh online connection and local notification opt-in. Run the updated Setup.cmd on that computer to review its consent."}
                    </p>
                    <button
                      type="button"
                      className="button primary"
                      disabled={busy || !ready}
                      onClick={() => {
                        setBusy(true);
                        void api.approveNotification!(workspaceId, {
                          version: 1,
                          id: n.id,
                          expectedRevision: n.revision,
                          digest: n.digest,
                          approve: true,
                        })
                          .then(() => {
                            setNotice(
                              "Approved for this message and computer. Check the observed delivery status.",
                            );
                            setReload((v) => v + 1);
                          })
                          .catch(() =>
                            setNotice(
                              "Approval did not complete. Recheck local consent, freshness, source policy and the hourly limit.",
                            ),
                          )
                          .finally(() => setBusy(false));
                      }}
                    >
                      Approve and push this message
                    </button>
                  </>
                ) : null}
              </article>
            );
          })}
          {!state?.records.length ? <p>No retained notification drafts or deliveries.</p> : null}
        </div>
      </section>
    </WorkspaceDialog>
  );
}
