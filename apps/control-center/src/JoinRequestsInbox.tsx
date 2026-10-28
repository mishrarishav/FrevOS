import { useEffect, useState } from "react";
import type { JoinRequest } from "@frevos/contracts";
import type { ControlCenterApi } from "./api.js";
import { RecordWorkspace } from "./RecordWorkspace.js";
import { WorkspaceDialog } from "./WorkspaceDialog.js";
export function JoinRequestsInbox({
  api,
  workspaceId,
  userId,
  scopeName,
  actions,
}: {
  api: ControlCenterApi;
  workspaceId: string;
  userId: string;
  scopeName: string;
  actions: React.ReactNode;
}) {
  const [records, setRecords] = useState<JoinRequest[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(true),
    [review, setReview] = useState<JoinRequest | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [generation, reload] = useState(0);
  useEffect(() => {
    if (generation > 0) {
      setLoading(true);
      setError("");
    }
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        if (!api.joinRequests) throw Error();
        const next = await api.joinRequests(workspaceId, abort.signal);
        if (!abort.signal.aborted) {
          setRecords(next);
          setError("");
          setLoading(false);
        }
      } catch {
        if (!abort.signal.aborted) {
          setRecords([]);
          setReview(null);
          setConfirmed(false);
          setError("Join requests unavailable or administrator access changed.");
          setLoading(false);
        }
      }
      if (!abort.signal.aborted) timer = setTimeout(poll, 5000);
    };
    void poll();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [api, workspaceId, generation]);
  async function decide(decision: "approve" | "reject") {
    if (!review || !confirmed || busy || !api.decideJoin) return;
    setBusy(true);
    setNotice("");
    try {
      const next = await api.decideJoin(workspaceId, {
        version: 1,
        requestId: review.id,
        digest: review.digest,
        decision,
        confirmation: "reviewed-user-and-system-request",
      });
      setRecords((prior) => prior.map((record) => (record.id === next.id ? next : record)));
      setNotice(
        decision === "approve"
          ? "Approved. The requester can now see their one-use code and installer."
          : "Request rejected. No account or computer access was granted.",
      );
      setReview(null);
      setConfirmed(false);
    } catch {
      setNotice(
        "Decision was not confirmed. Check this same request's status before retrying; no new request is needed.",
      );
    } finally {
      setBusy(false);
    }
  }
  const open = (record: JoinRequest) => {
    setReview(record);
    setConfirmed(false);
  };
  return (
    <>
      <RecordWorkspace
        title="Join requests"
        breadcrumb="Systems / Discovery / Join requests"
        scopeName={scopeName}
        userId={userId}
        workspaceId={workspaceId}
        page="discovery-join-requests"
        noun="requests"
        records={records}
        columns={[
          {
            id: "user",
            label: "Requested account",
            value: (record) => `${record.displayName} · ${record.username}`,
          },
          {
            id: "mode",
            label: "Request",
            value: (record) =>
              record.mode === "new" ? "New user + computer" : "Existing user · additional computer",
          },
          {
            id: "platform",
            label: "Computer",
            value: (record) => (record.platform === "win32" ? "Windows · x64" : "Linux · x64"),
          },
          { id: "status", label: "Status", value: (record) => record.status },
          {
            id: "date",
            label: "Submitted",
            value: (record) => new Date(record.createdAt).toLocaleString(),
          },
        ]}
        identify={(record) => record.id}
        statusOf={(record) => record.status}
        statuses={[
          { id: "pending", label: "Pending approval" },
          { id: "approving", label: "Decision in progress" },
          { id: "approved", label: "Approved" },
          { id: "paired", label: "Paired" },
          { id: "rejected", label: "Rejected" },
          { id: "expired", label: "Expired" },
        ]}
        loading={loading}
        error={error}
        notice={notice}
        onRetry={() => reload((value) => value + 1)}
        actions={actions}
        renderActions={(record) =>
          ["pending", "approving"].includes(record.status) ? (
            <button type="button" className="button secondary" onClick={() => open(record)}>
              Review request
            </button>
          ) : null
        }
        renderCard={(record) => (
          <article className="record-card">
            <h2>{record.displayName}</h2>
            <p>
              {record.username} · {record.mode === "new" ? "New user" : "Existing user"} ·{" "}
              {record.platform === "win32" ? "Windows" : "Linux"}
            </p>
            <p>
              {record.status} · {new Date(record.createdAt).toLocaleString()}
            </p>
            {["pending", "approving"].includes(record.status) ? (
              <button className="button secondary" type="button" onClick={() => open(record)}>
                Review request
              </button>
            ) : null}
          </article>
        )}
      />
      {review ? (
        <WorkspaceDialog
          label="Review join request"
          onClose={() => {
            if (!busy) setReview(null);
          }}
        >
          <section className="project-editor discovery-editor">
            <h2>Review user and computer</h2>
            <dl>
              <dt>User</dt>
              <dd>
                {review.displayName} · {review.username}
              </dd>
              <dt>Account</dt>
              <dd>
                {review.mode === "new"
                  ? "Create ordinary User account. The requester chose their password."
                  : "Keep the existing account and password."}
              </dd>
              <dt>System</dt>
              <dd>
                {review.deviceId} · {review.platform === "win32" ? "Windows" : "Linux"} · x64
              </dd>
              <dt>Monitoring</dt>
              <dd>
                {review.fileActivity
                  ? "System health and locally consented file activity"
                  : "System health only"}
              </dd>
              <dt>Request expires</dt>
              <dd>{new Date(review.expiresAt).toLocaleString()}</dd>
            </dl>
            <p>
              This grants no administrator role or cross-owner file-content access. Existing
              workspace permissions still apply. Approval allows one computer registration; the code
              expires 15 minutes after approval.
            </p>
            <label>
              <input
                type="checkbox"
                checked={confirmed}
                disabled={busy}
                onChange={(event) => setConfirmed(event.target.checked)}
              />{" "}
              I verified the requester and this exact account/system request.
            </label>
            <div className="record-row-actions">
              <button
                type="button"
                className="button primary"
                disabled={busy || !confirmed}
                onClick={() => void decide("approve")}
              >
                Approve user and system
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={busy || !confirmed || review.status !== "pending"}
                onClick={() => void decide("reject")}
              >
                Reject request
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setReview(null)}
              >
                Close review
              </button>
            </div>
          </section>
        </WorkspaceDialog>
      ) : null}
    </>
  );
}
