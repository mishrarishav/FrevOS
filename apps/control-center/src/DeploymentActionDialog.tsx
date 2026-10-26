import { DeploymentChangeSchema, type DeploymentChange } from "@frevos/contracts";
import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { WorkspaceDialog } from "./WorkspaceDialog.js";

export function DeploymentActionDialog({
  operation,
  initial,
  locked,
  busy,
  notice,
  onClose,
  onConfirm,
  projectName = "Servix development",
}: {
  operation: "deploy" | "rollback" | "restore" | "close-build";
  initial: DeploymentChange | undefined;
  locked: boolean;
  busy: boolean;
  notice: string;
  onClose: () => void;
  onConfirm: (details: DeploymentChange) => void;
  projectName?: string;
}) {
  const [message, setMessage] = useState(initial?.message ?? "");
  const [approvedBy, setApprovedBy] = useState(initial?.approvedBy ?? "");
  const [validation, setValidation] = useState("");
  const title =
    operation === "close-build"
      ? "Close interrupted build"
      : operation === "deploy"
        ? "Deploy"
        : operation === "rollback"
          ? "Rollback"
          : "Restore build";
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const parsed = DeploymentChangeSchema.safeParse({ message, approvedBy });
    if (!parsed.success) {
      setValidation(
        "Enter the changes (3–2000 characters) and approval name/reference (2–160 characters).",
      );
      return;
    }
    onConfirm(parsed.data);
  };
  return (
    <WorkspaceDialog
      label={`${title} details`}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="deployment-settings account-panel" onSubmit={submit}>
        <header className="settings-header">
          <div>
            <p className="eyebrow">{projectName} / Change record</p>
            <h2>{title} details</h2>
          </div>
          <button
            type="button"
            className="button ghost"
            aria-label="Close deployment details"
            disabled={busy}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        <div className="account-panel-scroll">
          <div className="change-note-field">
            <label htmlFor="deployment-change-message">What is changing?</label>
            <textarea
              id="deployment-change-message"
              required
              minLength={3}
              maxLength={2000}
              rows={4}
              value={message}
              readOnly={locked}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          <div className="change-note-field">
            <label htmlFor="deployment-change-approval">Approved by / approval reference</label>
            <input
              id="deployment-change-approval"
              required
              minLength={2}
              maxLength={160}
              value={approvedBy}
              readOnly={locked}
              onChange={(e) => setApprovedBy(e.target.value)}
            />
          </div>
          <p className="record-muted">
            Your signed-in account is recorded automatically. The approval name/reference is
            recorded as provided; this does not request approval from that person.
          </p>
          <p className="record-muted">
            {operation === "close-build"
              ? "Only an interrupted build with no published artifact or destination job can be marked failed. Existing work is retained; this action does not retry or deploy it."
              : operation === "deploy"
                ? "These details are saved in deployment history and the Git commit message."
                : "These details are saved in deployment history. Restoring a saved build creates no new Git commit."}
          </p>
          {locked ? <p>Retry retains the original details and request.</p> : null}
          {validation || notice ? (
            <p role="status" className="record-notice">
              {validation || notice}
            </p>
          ) : null}
          <div className="record-row-actions">
            <button className="button secondary" type="button" disabled={busy} onClick={onClose}>
              Cancel
            </button>
            <button className="button primary" type="submit" disabled={busy}>
              {busy ? "Submitting…" : locked ? "Retry request" : `Confirm ${title.toLowerCase()}`}
            </button>
          </div>
        </div>
      </form>
    </WorkspaceDialog>
  );
}
