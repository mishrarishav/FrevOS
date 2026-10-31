import { useEffect, useState } from "react";
import type { ControlCenterApi } from "./api.js";
import { WorkspaceDialog } from "./WorkspaceDialog.js";
import { deploymentRequestId } from "./deployment-request-id.js";
export function RepositoryRecoveryDialog({
  api,
  workspaceId,
  onClose,
}: {
  api: ControlCenterApi;
  workspaceId: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<{
    configured: boolean;
    backups: { id: string; createdAt: string; sha256: string; files: number; bytes: number }[];
  }>({ configured: false, backups: [] });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    void api
      .repositoryRecoveryState?.(workspaceId, abort.signal)
      .then((value) => {
        if (!abort.signal.aborted) setState(value);
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setError(
            "Full engine recovery requires administrator access and an enrolled recovery service.",
          );
      });
    return () => abort.abort();
  }, [api, workspaceId]);
  async function run(
    action: "backup" | "restore-isolated",
    backup?: (typeof state.backups)[number],
  ) {
    if (!api.repositoryRecoveryAction) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api.repositoryRecoveryAction(workspaceId, {
        version: 1,
        requestId: `git_${deploymentRequestId("pr").slice(3)}`,
        action,
        ...(backup ? { backupId: backup.id, sha256: backup.sha256 } : {}),
      });
      setNotice(
        result.status === "backed-up"
          ? "Encrypted full backup completed; engine restarted."
          : "Backup restored to an isolated folder and its offline database checks passed.",
      );
      if (api.repositoryRecoveryState) setState(await api.repositoryRecoveryState(workspaceId));
    } catch {
      setError(
        "Recovery was not confirmed. Review the operator receipt before retrying. Live repositories have not been replaced by a restore.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <WorkspaceDialog label="Repository backup & restore" onClose={() => !busy && onClose()}>
      <section className="project-editor discovery-editor">
        <header className="settings-header">
          <h2>Repository backup & restore</h2>
          <button type="button" className="button ghost" disabled={busy} onClick={onClose}>
            Close
          </button>
        </header>
        <div className="discovery-scroll discovery-form">
          <p>
            Full backups include code, branches, reviews, roles, attachments, LFS and the engine
            database. Backing up briefly pauses the enrolled Git service.
          </p>
          {error ? <p role="alert">{error}</p> : null}
          {notice ? <p role="status">{notice}</p> : null}
          {!state.configured ? (
            <p>
              An administrator must enroll protected backup storage and the engine service first.
            </p>
          ) : (
            <>
              <button
                type="button"
                className="button primary"
                disabled={busy}
                onClick={() => void run("backup")}
              >
                {busy ? "Working…" : "Create full backup"}
              </button>
              <p>
                Restore verification uses a new isolated folder. Replacing a live engine requires a
                separate reviewed recovery approval.
              </p>
              {state.backups.map((backup) => (
                <article className="record-detail-card" key={backup.id}>
                  <h3>{new Date(backup.createdAt).toLocaleString()}</h3>
                  <p>
                    {backup.files} files · {(backup.bytes / 1048576).toFixed(1)} MB encrypted
                  </p>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() => void run("restore-isolated", backup)}
                  >
                    Verify isolated restore
                  </button>
                </article>
              ))}
            </>
          )}
        </div>
      </section>
    </WorkspaceDialog>
  );
}
