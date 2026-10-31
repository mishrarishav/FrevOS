import { useEffect, useState } from "react";
import type { SystemEnrollmentPreview, LocalAccount } from "@frevos/contracts";
import type { ControlCenterApi } from "./api.js";
import { WorkspaceDialog } from "./WorkspaceDialog.js";
export function SystemPairingDialog({
  api,
  workspaceId,
  onClose,
}: {
  api: ControlCenterApi;
  workspaceId: string;
  onClose: () => void;
}) {
  const [code, setCode] = useState(""),
    [preview, setPreview] = useState<SystemEnrollmentPreview | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [owners, setOwners] = useState<LocalAccount[]>([]),
    [ownerUserId, setOwnerUserId] = useState("");
  useEffect(() => {
    let closed = false;
    void api
      .systemPairingOwners?.(workspaceId)
      .then((list) => {
        if (!closed) {
          setOwners(list);
          if (list.length === 1) setOwnerUserId(list[0]!.userId);
        }
      })
      .catch(() => {
        if (!closed)
          setMessage(
            "Administrator access is required to register a computer. Ask your administrator to approve it.",
          );
      });
    return () => {
      closed = true;
    };
  }, [api, workspaceId]);
  async function lookup() {
    if (!api.lookupSystemPairing) return;
    setBusy(true);
    setMessage("");
    try {
      setPreview(await api.lookupSystemPairing(workspaceId, code));
    } catch {
      setMessage(
        "Code is invalid, expired or unavailable to this account. Check the code on the target computer.",
      );
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }
  async function decide(decision: "approve" | "reject") {
    if (!preview || !api.decideSystemPairing) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await api.decideSystemPairing(workspaceId, preview.enrollmentId, {
        version: 1,
        digest: preview.digest,
        decision,
        ...(ownerUserId ? { ownerUserId } : {}),
      });
      setPreview(result);
      setCode("");
      setMessage(
        decision === "approve"
          ? "Approved for this computer. Its installer will finish connecting and report health."
          : "Connection request rejected.",
      );
    } catch {
      setMessage(
        "Approval did not complete. The request may have expired or changed; check again. No password needs to be shared.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <WorkspaceDialog
      label="Approve system connection"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <section className="project-editor discovery-editor">
        <header className="settings-header">
          <h2>Approve system connection</h2>
          <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
            Close approval
          </button>
        </header>
        <div className="discovery-scroll discovery-form">
          <p>
            Enter the code shown by Setup.cmd on the computer you want to add. You approve from your
            own account; the other computer receives no administrator password.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void lookup();
            }}
          >
            <label>
              Pairing code
              <input
                value={code}
                autoComplete="off"
                spellCheck={false}
                maxLength={16}
                required
                disabled={busy}
                onChange={(e) => {
                  setCode(e.target.value);
                  setPreview(null);
                }}
              />
            </label>
            <button type="submit" className="button secondary" disabled={busy || !code.trim()}>
              Check computer
            </button>
          </form>
          {preview ? (
            <section>
              <h3>{preview.name}</h3>
              <p>
                {connectorPlatform[preview.platform].name} · {preview.architecture}
              </p>
              <p>
                Access: system health
                {preview.fileActivity ? " and consented file activity metadata" : " only"}. File
                contents, project execution and deployment access are excluded.
              </p>
              <p>
                Valid until {new Date(preview.expiresAt).toLocaleString()} · {preview.status}
              </p>
              <p>Confirm this is the computer displaying that code.</p>
              {owners.length ? (
                <label>
                  System belongs to
                  <select
                    value={ownerUserId}
                    disabled={busy || preview.status !== "pending"}
                    onChange={(e) => setOwnerUserId(e.target.value)}
                  >
                    <option value="">Choose user</option>
                    {owners.map((owner) => (
                      <option key={owner.userId} value={owner.userId}>
                        {owner.displayName ?? owner.username} · {owner.username}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {["pending", "approving"].includes(preview.status) ? (
                <div className="record-row-actions">
                  <button
                    type="button"
                    className="button primary"
                    disabled={busy || (owners.length > 0 && !ownerUserId)}
                    onClick={() => void decide("approve")}
                  >
                    Approve this computer
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy || preview.status !== "pending"}
                    onClick={() => void decide("reject")}
                  >
                    Reject connection
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}
          {message ? <p role="status">{message}</p> : null}
        </div>
      </section>
    </WorkspaceDialog>
  );
}
import { connectorPlatform } from "./connector-platform.js";
