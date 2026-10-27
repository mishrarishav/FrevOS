import type {
  DeploymentSettings,
  PromotionState,
  PromotionTarget,
  ServixDeploymentState,
} from "@frevos/contracts";
import { useEffect, useRef, useState } from "react";
import { ApiFailure, type ControlCenterApi } from "./api.js";
import { deploymentRequestId } from "./deployment-request-id.js";
import { addBasePath } from "./routing.js";
import { WorkspaceDialog } from "./WorkspaceDialog.js";

const freshId = () => deploymentRequestId().replace(/^sd_/, "pm_");
export function ArtifactPromotionsPage({
  api,
  workspaceId,
}: {
  api: ControlCenterApi;
  workspaceId: string;
}) {
  const [state, setState] = useState<PromotionState | null>(null);
  const [profiles, setProfiles] = useState<DeploymentSettings[]>([]);
  const [development, setDevelopment] = useState<ServixDeploymentState | null>(null);
  const [selected, setSelected] = useState(
    typeof location === "undefined" ? "" : new URLSearchParams(location.search).get("target") || "",
  );
  const [release, setRelease] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [reviewId, setReviewId] = useState("");
  const [message, setMessage] = useState("");
  const [approvalReference, setApprovalReference] = useState("");
  const [checks, setChecks] = useState<string[]>([]);
  const [grantBatch, setGrantBatch] = useState(false);
  const pending = useRef<unknown>(null);
  const [_generation, reload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const [s, p, d] = await Promise.all([
          api.promotionState?.(workspaceId, controller.signal),
          api.listDeploymentSettings?.(workspaceId, controller.signal),
          api.getServixDeploymentState?.(workspaceId, controller.signal),
        ]);
        if (!controller.signal.aborted) {
          setState(s ?? null);
          setProfiles(p ?? []);
          setDevelopment(d ?? null);
        }
      } catch {
        if (!controller.signal.aborted)
          setNotice("Promotion service unavailable. Retry retains the same submitted request.");
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 2000);
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [api, workspaceId]);
  const target = state?.targets.find((t) => t.profileId === selected) ?? state?.targets[0];
  const profile = profiles.find((p) => p.profileId === target?.profileId);
  const runs =
    development?.runs.filter(
      (r) =>
        r.status === "succeeded" &&
        r.artifactDigest &&
        (target?.releaseMode !== "application" ||
          development.applicationReleaseIds?.includes(r.requestId)),
    ) ?? [];
  const sourceId =
    (runs.some((r) => r.requestId === release) ? release : "") ||
    runs.find((r) => r.requestId === development?.currentRequestId)?.requestId ||
    runs[0]?.requestId ||
    "";
  const proposal = state?.jobs.find((j) => j.job.id === reviewId);
  const review = proposal?.result?.review;
  const application = target?.releaseMode === "application";
  const lastVerified = state?.jobs.find(
    (j) =>
      j.job.target.profileId === target?.profileId &&
      j.job.action === "promote" &&
      j.result?.status === "succeeded",
  );
  const required = [
    ...(proposal?.job.target.releaseMode === "application"
      ? ["I have completed the required Development acceptance for this exact saved release"]
      : []),
    "Retain the recorded dependency risks",
    "Allow normal Production startup/bootstrap database effects and existing background workers",
    "Allow a brief API interruption",
    "Bind the managed task to the same existing runtime owner's credential",
    "Code recovery does not restore or reverse the database",
  ];
  const active = state?.jobs.some(
    (j) =>
      j.job.target.profileId === target?.profileId &&
      (!j.result || ["working", "recovery-required"].includes(j.result.status)),
  );
  const prepare = async () => {
    if (!target || !profile || !api.preparePromotion || busy) return;
    setBusy(true);
    setNotice("");
    const input = {
      version: 1,
      requestId: freshId(),
      profileId: target.profileId,
      expectedRevision: profile.revision,
      developmentRequestId: sourceId,
    };
    try {
      const job = await api.preparePromotion(workspaceId, input);
      setNotice(`Preparation queued: ${job.id}. Production remains running.`);
      reload((n) => n + 1);
    } catch {
      setNotice("Preparation was not confirmed. Check history before retrying.");
    } finally {
      setBusy(false);
    }
  };
  const approve = async () => {
    if (!proposal || !review || !api.approvePromotion || busy) return;
    pending.current ??= {
      version: 1,
      requestId: freshId(),
      reviewId: proposal.job.id,
      reviewSha256: proposal.result?.reviewSha256,
      confirmation:
        proposal.job.target.releaseMode === "application"
          ? "promote-reviewed-application-to-production"
          : "promote-reviewed-backend-to-production",
      changeDetails: { message: message.trim(), approvedBy: approvalReference.trim() },
      acknowledgements: {
        retainedDependencyRisk: true,
        startupDatabaseEffects: true,
        briefInterruption: true,
        sameOwnerCredentialBinding: true,
        codeRecoveryDoesNotRestoreDatabase: true,
        assignBatchLogonIfMissing: grantBatch,
        ...(proposal.job.target.releaseMode === "application" ? { developmentAccepted: true } : {}),
      },
    };
    setBusy(true);
    setNotice("");
    try {
      await api.approvePromotion(workspaceId, pending.current);
      pending.current = null;
      setReviewId("");
      setNotice("Exact Production request accepted. Follow its verified outcome below.");
      reload((n) => n + 1);
    } catch (error) {
      if (
        error instanceof ApiFailure &&
        [400, 401, 403, 404, 409].includes(error.responseStatus ?? 0)
      ) {
        pending.current = null;
        setNotice(
          "Request rejected. Review the current target and prepare again if the review expired.",
        );
      } else {
        setNotice("Request not confirmed. Retry retains the same request; no automatic replay.");
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="promotion-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Projects / saved artifact promotion</p>
          <h1>Production promotion</h1>
        </div>
        <a className="button secondary" href={addBasePath("/projects/configuration")}>
          Projects
        </a>
      </header>
      <p>
        Publish source and test the complete release on Development first. Promote its saved
        frontend and backend together, or restore an earlier tested release. Existing source,
        dependencies, environments, uploads, attachments and IIS routing are retained.
      </p>
      {notice ? <p role="status">{notice}</p> : null}
      <div className="record-card">
        <label>
          Production target
          <select
            aria-label="Production target"
            value={target?.profileId ?? ""}
            onChange={(e) => setSelected(e.target.value)}
          >
            {state?.targets.map((t) => (
              <option key={t.profileId} value={t.profileId}>
                {t.displayName}
              </option>
            ))}
          </select>
        </label>
        {application && !runs.length ? (
          <p>
            Build and deploy a complete frontend + backend release on Development first. Historical
            backend-only releases are retained in history.
          </p>
        ) : null}
        {target ? (
          <TargetSummary target={target} />
        ) : (
          <p>No approved Production targets configured.</p>
        )}
        <p>Worker: {state?.online ? "Online" : "Offline / not enrolled"}</p>
        <p>
          {application
            ? "Required components: Frontend + Backend. A backend-only saved release is rejected."
            : "Configured scope: Backend only."}
          {target?.managedUpdates
            ? " Updates reuse the verified existing runtime task."
            : " Initial runtime adoption only."}
        </p>
        {lastVerified ? (
          <p>
            Last verified Production release: {lastVerified.job.id}
            <br />
            Backend: {lastVerified.result?.artifactDigest?.slice(0, 12)}
            <br />
            Frontend:{" "}
            {lastVerified.result?.frontendVerified
              ? lastVerified.result.frontendDigest?.slice(0, 12)
              : "Historical deployment did not manage the frontend"}
          </p>
        ) : null}
        <label>
          Saved successful Development release
          <select
            aria-label="Saved successful Development release"
            value={sourceId}
            onChange={(e) => setRelease(e.target.value)}
          >
            {runs.map((r) => (
              <option key={r.requestId} value={r.requestId}>
                {r.requestId} · source {r.sourceHead?.slice(0, 10)} ·{" "}
                {r.artifactDigest?.slice(0, 12)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="button primary"
          disabled={!state?.online || !profile || !sourceId || !!active || busy}
          onClick={() => void prepare()}
        >
          Prepare and verify Production
        </button>
        <p>
          Preparation reads the target, verifies the saved artifact and captures an encrypted
          consistent database backup. It does not stop the current application.
        </p>
      </div>
      <div className="record-card">
        <h2>Promotion history</h2>
        {state?.jobs.map(({ job, result }) => (
          <article key={job.id} className="record-card">
            <strong>
              {job.action} · {result?.status ?? "queued"}
            </strong>
            <p>
              {job.target.releaseMode === "application"
                ? "Frontend + Backend"
                : "Historical backend-only scope"}
            </p>
            <p>
              {job.id}
              <br />
              {result?.stage ?? "waiting-for-worker"} {result?.errorCode ?? ""}
            </p>
            {job.approval ? (
              <p>
                Changes: {job.approval.changeDetails.message}
                <br />
                Declared approval: {job.approval.changeDetails.approvedBy}
                <br />
                Authenticated actor: {job.requestedBy}
              </p>
            ) : null}
            {result?.status === "prepared" ? (
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  setReviewId(job.id);
                  setChecks([]);
                  setGrantBatch(false);
                  setMessage("");
                  setApprovalReference("");
                  pending.current = null;
                }}
              >
                Review exact Production promotion
              </button>
            ) : null}
            {result?.healthVerified ? (
              <p>Health verified · {result.protectedFilesVerified} existing files verified</p>
            ) : null}
            {result?.sourceHead ? (
              <p>
                {result.status === "recovered"
                  ? "Requested source; previous release recovered"
                  : "Source"}
                : <code>{result.sourceHead}</code>
              </p>
            ) : null}
            {result?.frontendVerified ? (
              <p>
                Frontend public files verified · <code>{result.frontendDigest}</code>
              </p>
            ) : null}
            {result?.batchLogonAssigned ? (
              <p>Approved batch-logon right assigned to the reviewed owner.</p>
            ) : null}
            {result?.runtimeTaskRegistered ? (
              <p>Reviewed same-owner runtime task remains registered.</p>
            ) : null}
          </article>
        ))}
      </div>
      {review && proposal ? (
        <WorkspaceDialog
          label="Review Production promotion"
          onClose={() => {
            if (!busy && !pending.current) setReviewId("");
          }}
        >
          <header className="settings-header">
            <div>
              <p className="eyebrow">Exact artifact / target approval</p>
              <h2>Review Production promotion</h2>
            </div>
            <button
              type="button"
              className="button secondary"
              disabled={busy || !!pending.current}
              onClick={() => setReviewId("")}
            >
              Cancel
            </button>
          </header>
          <div className="promotion-review-body">
            <TargetSummary target={proposal.job.target} />
            <p>
              Review expires: {new Date(review.expiresAt).toLocaleString()}
              <br />
              Actor: {review.requestedBy}
              <br />
              Development receipt: {review.developmentRequestId}
            </p>
            <p>
              Source commit: <code>{review.artifact.sourceHead}</code>
              <br />
              Bundle SHA256: <code>{review.artifact.bundleSha256}</code>
              <br />
              Descriptor SHA256: <code>{review.artifact.descriptorSha256}</code>
            </p>
            {review.artifact.frontend ? (
              <p>
                Frontend SHA256: <code>{review.artifact.frontend.sha256}</code>
                <br />
                {review.artifact.frontend.files} static files · same-origin API routing ·
                destination web.config retained
              </p>
            ) : null}
            <p>
              Current PID {review.process.pid} · {review.process.owner} ·{" "}
              {review.process.nodeVersion}
              <br />
              Managed task: {proposal.job.target.taskName}, same owner, least privilege, boot start.
              {review.process.managedRuntimeVerified
                ? ` Verified update of ${review.process.previousPromotionId}.`
                : " First runtime adoption."}
            </p>
            <p>
              {review.protection.files} files inventoried. Fresh encrypted backup:{" "}
              {review.backup.reference}
              <br />
              Backup captured: {new Date(review.backup.createdAt).toLocaleString()} · full-stream
              integrity verified. This fresh backup has{" "}
              {review.backup.isolatedRestoreTested ? "passed" : "not yet had"} a separate isolated
              restore.
            </p>
            <p>{proposal.job.target.dependencyRisk}</p>
            {required.map((label) => (
              <label key={label}>
                <input
                  type="checkbox"
                  checked={checks.includes(label)}
                  disabled={busy || !!pending.current}
                  onChange={(e) =>
                    setChecks((old) =>
                      e.target.checked ? [...old, label] : old.filter((s) => s !== label),
                    )
                  }
                />
                {label}
              </label>
            ))}
            {!review.process.batchLogonReady ? (
              <label>
                <input
                  type="checkbox"
                  checked={grantBatch}
                  disabled={busy || !!pending.current}
                  onChange={(e) => setGrantBatch(e.target.checked)}
                />
                Allow assigning Log on as a batch job to this exact existing owner if needed. Deny
                rights or Group Policy are never overridden.
              </label>
            ) : null}
            <label>
              Changes
              <textarea
                aria-label="Changes"
                value={message}
                disabled={busy || !!pending.current}
                maxLength={2000}
                onChange={(e) => setMessage(e.target.value)}
              />
            </label>
            <label>
              Approval reference
              <input
                aria-label="Approval reference"
                value={approvalReference}
                disabled={busy || !!pending.current}
                maxLength={160}
                onChange={(e) => setApprovalReference(e.target.value)}
              />
            </label>
            <p>
              Only this target, artifact and review are approved for one use. Automatic code
              recovery restores the reviewed previous runtime and frontend; database restoration
              requires a separate approval.
            </p>
          </div>
          <footer className="promotion-review-footer">
            <button
              type="button"
              className="button primary"
              disabled={
                busy ||
                checks.length !== required.length ||
                message.trim().length < 3 ||
                approvalReference.trim().length < 2 ||
                Date.parse(review.expiresAt) <= Date.now() ||
                !state?.online ||
                (!review.process.batchLogonReady && !grantBatch)
              }
              onClick={() => void approve()}
            >
              {proposal.job.target.releaseMode === "application"
                ? "Approve and deploy exact application"
                : "Approve and deploy exact backend"}
            </button>
          </footer>
        </WorkspaceDialog>
      ) : null}
    </section>
  );
}
function TargetSummary({ target }: { target: PromotionTarget }) {
  return (
    <p>
      {target.host} · {target.computer}
      <br />
      <code>{target.root}</code> · API {target.port}
      <br />
      {target.publicHealthUrl}
      {target.frontend ? (
        <>
          <br />
          Frontend: {target.frontend.root} · {target.frontend.applicationUrl} · preserved routing:{" "}
          {target.frontend.preservedFiles.join(", ")}
        </>
      ) : null}
      <br />
      Preserved: {target.preservedPaths.join(", ")}
      <br />
      External protected storage: {target.additionalProtectedRoots.join(", ")}
    </p>
  );
}
