import {
  type LocalDevAction,
  type LocalDevJob,
  type LocalDevState,
  type LocalEnvDocument,
  type LocalEnvChange,
  LocalEnvChangesSchema,
} from "@frevos/contracts";
import { Plus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ApiFailure, type ControlCenterApi } from "./api.js";
import { deploymentRequestId } from "./deployment-request-id.js";
import { sealEnvironment } from "./environment-seal.js";
import { WorkspaceDialog } from "./WorkspaceDialog.js";

type Connection = LocalDevState["connections"][number];
type Draft = {
  id: number;
  key: string;
  value: string;
  saved?: LocalEnvDocument["rows"][number];
  changed: boolean;
  deleted: boolean;
};
export function EnvironmentVariables({
  api,
  workspaceId,
  connection,
  jobs,
  projectName,
  initialMode,
  onClose,
}: {
  api: ControlCenterApi;
  workspaceId: string;
  connection: Connection;
  jobs: LocalDevJob[];
  projectName: string;
  initialMode: "development" | "production";
  onClose: () => void;
}) {
  const candidates = connection.snapshot.candidates.filter((c) =>
    c.environments.some((e) => /^\.env(?:\.|$)/.test(e.reference)),
  );
  const [serviceId, setServiceId] = useState(candidates[0]?.id ?? "");
  const candidate = candidates.find((c) => c.id === serviceId);
  const preferred = (id: string) => {
    const service = connection.snapshot.plan?.services.find((s) => s.id === id);
    const selected =
      initialMode === "production"
        ? service?.productionEnvironment
        : service?.developmentEnvironment;
    return (
      (selected && /^\.env(?:\.|$)/.test(selected) ? selected : undefined) ??
      candidates
        .find((c) => c.id === id)
        ?.environments.find((e) => /^\.env(?:\.|$)/.test(e.reference))?.reference ??
      ""
    );
  };
  const [reference, setReference] = useState(() => preferred(serviceId));
  const [document, setDocument] = useState<LocalEnvDocument | null>(null);
  const [rows, setRows] = useState<Draft[]>([]);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<LocalDevAction | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [sending, setSending] = useState(false);
  const current = useRef(connection);
  current.current = connection;
  const frozen = useRef<LocalDevAction | null>(null),
    sendingRef = useRef(false),
    nextId = useRef(0);
  const handled = useRef(new Set<string>());
  const savedNotice = useRef(false);
  const dirty = rows.some((r) => r.changed || r.deleted || !r.saved);
  const busy = !!pending || sending;
  const stopped = !connection.snapshot.services.some((s) =>
    ["running", "starting", "port-conflict"].includes(s.status),
  );
  const update = (id: number, values: Partial<Draft>) =>
    setRows((all) => all.map((r) => (r.id === id ? { ...r, ...values } : r)));
  async function send(request: LocalDevAction) {
    if (sendingRef.current || !api.localDevelopmentAction) return;
    sendingRef.current = true;
    setSending(true);
    setPending(request);
    frozen.current = request;
    setUncertain(false);
    try {
      await api.localDevelopmentAction(workspaceId, request);
    } catch (error) {
      if (
        error instanceof ApiFailure &&
        [400, 401, 403, 404, 409].includes(error.responseStatus ?? 0)
      ) {
        frozen.current = null;
        setPending(null);
        setMessage("Request was not saved. Refresh the file and connection before trying again.");
      } else {
        setUncertain(true);
        setMessage(
          "Request not confirmed. Retry keeps this exact request; saved actions reconcile automatically.",
        );
      }
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }
  function read() {
    const source = current.current;
    if (!source.online || !source.snapshot.sourceReady || !reference) return;
    setMessage("Loading variables…");
    void send({
      version: 1,
      requestId: deploymentRequestId("ld"),
      operation: "environment-read",
      deviceId: source.deviceId,
      profileId: source.snapshot.profileId,
      expectedRevision: source.snapshot.revision,
      fingerprint: source.snapshot.fingerprint,
      serviceId,
      reference,
    });
  }
  // Selection changes are explicit; polling must never replace a user's draft.
  // biome-ignore lint/correctness/useExhaustiveDependencies: read binds the selected file, not every observation.
  useEffect(() => {
    setDocument(null);
    setRows([]);
    read();
  }, [serviceId, reference]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: handle a terminal receipt once using the current selected file.
  useEffect(() => {
    if (!pending) return;
    const job = jobs.find((j) => j.request.requestId === pending.requestId);
    if (
      !job ||
      !["succeeded", "failed", "recovery-required"].includes(job.status) ||
      handled.current.has(job.request.requestId)
    )
      return;
    handled.current.add(job.request.requestId);
    frozen.current = null;
    setPending(null);
    setUncertain(false);
    if (job.status !== "succeeded") {
      setMessage(
        job.status === "recovery-required"
          ? "Save outcome needs review. Reload the file before making another change."
          : `Could not ${pending.operation === "environment-read" ? "load" : "save"} variables (${job.errorCode ?? "action-failed"}). Reload the file to review.`,
      );
      return;
    }
    if (pending.operation === "environment-read" && job.environment) {
      setDocument(job.environment);
      setRows(
        job.environment.rows.map((saved) => ({
          id: nextId.current++,
          key: saved.key,
          value: saved.masked ? "" : saved.value,
          saved,
          changed: false,
          deleted: false,
        })),
      );
      setMessage(
        savedNotice.current
          ? "Saved. Restart the service to apply changes."
          : "Values loaded. Masked fields keep their saved values until changed.",
      );
      savedNotice.current = false;
    } else if (pending.operation === "environment-save") {
      setDocument(null);
      setRows([]);
      savedNotice.current = true;
      setMessage("Saved on your source computer. Restart the service to apply changes.");
      read();
    }
  }, [jobs, pending]);
  function save() {
    if (!document || !connection.snapshot.environmentEditor || busy) return;
    const changes: LocalEnvChange[] = rows.flatMap((r): LocalEnvChange[] =>
      r.deleted
        ? r.saved
          ? [{ operation: "delete", key: r.key }]
          : []
        : !r.saved || r.changed
          ? [{ operation: "set", key: r.key, value: r.value }]
          : [],
    );
    if (
      !LocalEnvChangesSchema.safeParse(changes).success ||
      new Set(rows.filter((r) => !r.deleted).map((r) => r.key)).size !==
        rows.filter((r) => !r.deleted).length
    ) {
      setMessage(
        "Use unique variable names (letters, numbers and underscores), and single-line values up to 8192 characters.",
      );
      return;
    }
    try {
      const request = sealEnvironment(
        {
          version: 1,
          requestId: deploymentRequestId("ld"),
          operation: "environment-save",
          approved: true,
          deviceId: connection.deviceId,
          profileId: connection.snapshot.profileId,
          expectedRevision: connection.snapshot.revision,
          fingerprint: connection.snapshot.fingerprint,
          serviceId,
          reference,
          documentRevision: document.revision,
        },
        connection.snapshot.environmentEditor,
        changes,
      );
      setMessage("Saving changes…");
      void send(request);
    } catch {
      setMessage(
        "Could not prepare a secure save. Check variable names and single-line values, then try again.",
      );
    }
  }
  const count = rows.filter((r) => r.changed || r.deleted || !r.saved).length;
  return (
    <WorkspaceDialog
      label="Environment variables"
      onClose={() => {
        if (!sending) onClose();
      }}
    >
      <section className="project-editor local-env-editor">
        <header className="settings-header">
          <div>
            <p className="eyebrow">{projectName}</p>
            <h2>Environment variables</h2>
          </div>
          <div className="record-row-actions">
            <button
              type="button"
              className="button primary"
              disabled={busy || !dirty || !document || !connection.online || !stopped}
              onClick={save}
            >
              Save {count ? `${count} change${count === 1 ? "" : "s"}` : "changes"}
            </button>
            <button
              type="button"
              className="button ghost"
              disabled={sending}
              onClick={onClose}
              aria-label="Close environment variables"
            >
              <X size={16} />
            </button>
          </div>
        </header>
        <div className="local-env-selection">
          <label>
            Service
            <select
              aria-label="Environment service"
              value={serviceId}
              disabled={busy || dirty}
              onChange={(e) => {
                setServiceId(e.target.value);
                setReference(preferred(e.target.value));
              }}
            >
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Environment file
            <select
              aria-label="Environment file"
              value={reference}
              disabled={busy || dirty}
              onChange={(e) => setReference(e.target.value)}
            >
              {candidate?.environments
                .filter((e) => /^\.env(?:\.|$)/.test(e.reference))
                .map((e) => (
                  <option key={e.reference} value={e.reference}>
                    {e.reference}
                    {e.production ? " · Production profile" : ""}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <p className="field-help">
          Save to {connection.name}, then restart the service to apply changes.
        </p>
        {!stopped ? (
          <p role="status">
            Stop local services and resolve existing listeners before saving variables.
          </p>
        ) : null}
        <p role="status" className="field-help">
          {message}
        </p>
        {uncertain ? (
          <button
            type="button"
            className="button secondary"
            disabled={sending}
            onClick={() => {
              if (frozen.current) void send(frozen.current);
            }}
          >
            Retry exact request
          </button>
        ) : null}
        <section className="local-env-rows" aria-label="Environment variable rows">
          {rows.map((r, index) => (
            <div className={`local-env-row${r.deleted ? " local-env-deleted" : ""}`} key={r.id}>
              <label>
                Variable
                <input
                  aria-label={`Variable name ${index + 1}`}
                  autoComplete="off"
                  spellCheck={false}
                  value={r.key}
                  readOnly={!!r.saved}
                  disabled={busy || r.deleted}
                  onChange={(e) => update(r.id, { key: e.target.value })}
                />
              </label>
              <label>
                Value
                <input
                  aria-label={`Value for ${r.key || `variable ${index + 1}`}`}
                  type={
                    r.saved?.masked ||
                    /PASS|SECRET|TOKEN|KEY|CREDENTIAL|CONNECTION|URL/i.test(r.key)
                      ? "password"
                      : "text"
                  }
                  autoComplete="off"
                  spellCheck={false}
                  value={r.value}
                  placeholder={
                    r.saved?.masked && !r.changed ? "•••••••• · saved, unchanged" : "Empty value"
                  }
                  disabled={busy || r.deleted}
                  onChange={(e) => update(r.id, { value: e.target.value, changed: true })}
                />
              </label>
              <div className="record-row-actions">
                {r.saved?.masked && !r.changed && !r.deleted ? (
                  <button
                    type="button"
                    className="button ghost"
                    disabled={busy}
                    onClick={() => update(r.id, { value: "", changed: true })}
                    aria-label={`Clear ${r.key}`}
                  >
                    Set empty
                  </button>
                ) : null}
                {r.deleted || r.changed ? (
                  <button
                    type="button"
                    className="button ghost"
                    disabled={busy}
                    onClick={() =>
                      update(r.id, {
                        deleted: false,
                        changed: false,
                        value: r.saved && !r.saved.masked ? r.saved.value : "",
                      })
                    }
                    aria-label={`Undo ${r.key}`}
                  >
                    Undo
                  </button>
                ) : null}
                {!r.deleted ? (
                  <button
                    type="button"
                    className="button ghost"
                    disabled={busy}
                    aria-label={`Delete ${r.key || `variable ${index + 1}`}`}
                    onClick={() =>
                      r.saved
                        ? update(r.id, { deleted: true })
                        : setRows((all) => all.filter((row) => row.id !== r.id))
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </section>
        <footer className="record-row-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy || !document || rows.filter((r) => !r.deleted).length >= 512}
            onClick={() =>
              setRows((all) => [
                ...all,
                { id: nextId.current++, key: "", value: "", changed: true, deleted: false },
              ])
            }
          >
            <Plus size={14} />
            Add variable
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={busy || !connection.online}
            onClick={() => {
              setDocument(null);
              setRows([]);
              read();
            }}
          >
            Reload file
          </button>
          <button type="button" className="button ghost" disabled={sending} onClick={onClose}>
            {pending ? "Close" : "Cancel"}
          </button>
        </footer>
      </section>
    </WorkspaceDialog>
  );
}
