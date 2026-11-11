import {
  type ReviewCatalog,
  type ReviewCheckResult,
  type ReviewEndpoint,
  type ReviewImportPreview,
  type ReviewRecord,
  type ReviewRecordInput,
  type ReviewRegisterConfig,
  ReviewRegisterConfigSchema,
  type ReviewState,
  type ReviewWorkbook,
} from "@frevos/contracts";
import {
  ArrowLeft,
  CalendarClock,
  CheckCheck,
  ExternalLink,
  FileSpreadsheet,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from "react";
import { ApiFailure, type ControlCenterApi } from "./api.js";
import { RecordBadge, type RecordColumn, RecordWorkspace } from "./RecordWorkspace.js";
import { ReviewReportsDialog } from "./ReviewReports.js";
import { WorkspaceDialog } from "./WorkspaceDialog.js";
import "./ReviewsPage.css";

type Props = {
  api: ControlCenterApi;
  workspaceId: string;
  userId: string;
  scopeName: string;
  onSessionExpired?: () => void;
};
type WorkbookUpload = { fileName: string; contentBase64: string };
const semanticFields = [
  ["title", "Application name"],
  ["url", "Application URL"],
  ["description", "Description"],
  ["department", "Department"],
  ["management", "Managed by"],
  ["businessOwner", "Business owner"],
  ["spoc", "SPOC"],
  ["technicalAssignee", "Technical maintainer"],
  ["lifecycle", "Lifecycle"],
  ["requirement", "Requirement"],
  ["recordedAccess", "Recorded access status"],
] as const;

export function reviewLink(value: string): string | null {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function reviewStatus(status?: ReviewCheckResult["status"]): string {
  const labels: Record<ReviewCheckResult["status"], string> = {
    healthy: "Expected page found",
    "http-error": "HTTP error",
    "soft-404": "Error page detected",
    "wrong-page": "Unexpected page",
    "auth-required": "Sign-in or access check required",
    redirect: "Redirected",
    unreachable: "Unreachable",
    "tls-error": "TLS error",
    blocked: "Check blocked by policy",
    unknown: "Needs verification",
  };
  return status ? labels[status] : "Not checked";
}
export function reviewTone(
  status?: ReviewCheckResult["status"],
): "neutral" | "positive" | "warning" | "negative" {
  return status === "healthy"
    ? "positive"
    : status &&
        ["http-error", "soft-404", "wrong-page", "unreachable", "tls-error"].includes(status)
      ? "negative"
      : status
        ? "warning"
        : "neutral";
}
export function importResolutions(preview: ReviewImportPreview, choices: Record<string, string>) {
  return preview.rows.map((row) => ({
    row: row.row,
    action: (choices[String(row.row)] ??
      (row.defaultAction === "conflict" ? "" : row.defaultAction)) as "create" | "skip" | "update",
  }));
}
export function unresolvedImportRows(
  preview: ReviewImportPreview,
  choices: Record<string, string>,
) {
  return preview.rows.filter(
    (row) =>
      row.defaultAction === "conflict" &&
      !["create", "skip", "update"].includes(choices[String(row.row)] ?? ""),
  ).length;
}
const stamp = (value?: string) => (value ? new Date(value).toLocaleString() : "Not recorded");
const lastCheck = (record: ReviewRecord) => record.checks.findLast((check) => check.current);
function endpointResultText(record: ReviewRecord, field: "http" | "finalUrl") {
  if (record.endpoints.length <= 1) {
    const check = lastCheck(record);
    return field === "http" ? (check?.httpStatus?.toString() ?? "") : (check?.finalUrl ?? "");
  }
  return record.endpoints
    .map((endpoint) => {
      const check = record.checks.findLast(
        (item) => item.current && item.endpointId === endpoint.id,
      );
      const name = endpoint.label.trim() || endpoint.url;
      const repeated = record.endpoints.some(
        (other) => other.id !== endpoint.id && (other.label.trim() || other.url) === name,
      );
      const label = repeated ? `${name} (${endpoint.url})` : name;
      const result =
        field === "http"
          ? `${check?.httpStatus ?? "—"} (${reviewStatus(check?.status)})`
          : (check?.finalUrl ?? "—");
      return `[${label}]: ${result}`;
    })
    .join("; ");
}
export function recordLinkStatus(record: ReviewRecord): ReviewCheckResult["status"] | undefined {
  const results = record.endpoints.map((endpoint) =>
    record.checks.findLast((check) => check.current && check.endpointId === endpoint.id),
  );
  const failed = results.find((check) => check && reviewTone(check.status) === "negative");
  if (failed) return failed.status;
  const attention = results.find((check) => check && check.status !== "healthy");
  if (attention) return attention.status;
  return results.length && results.every(Boolean) ? "healthy" : undefined;
}
const blankConfig = (): ReviewRegisterConfig => ({
  name: "",
  description: "",
  fields: [],
  managementOptions: ["Internal", "Vendor"],
  lifecycleOptions: ["Active", "Retired", "Unknown"],
  requirementOptions: ["Required", "Not required", "Pending"],
  decisionOptions: ["Keep operational", "Retire", "Needs clarification"],
  linkPolicy: {
    allowedOrigins: [],
    allowedPathPrefixes: ["/"],
    allowPrivate: false,
    allowSessionCookies: false,
    timeoutMs: 10000,
    maxBytes: 262144,
    maxRedirects: 3,
  },
});
function blankRecord(config: ReviewRegisterConfig): ReviewRecordInput {
  return {
    title: "",
    description: "",
    department: "",
    management: config.managementOptions[0] ?? "",
    businessOwner: "",
    spoc: "",
    technicalAssignee: "",
    lifecycle: config.lifecycleOptions[0] ?? "",
    requirement: config.requirementOptions[0] ?? "",
    recordedAccess: "",
    fields: {},
    endpoints: [],
  };
}
function endpointId() {
  return `ep_${Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) => n.toString(16).padStart(2, "0")).join("")}`;
}
function failureText(error: unknown) {
  if (error instanceof ApiFailure) {
    if (error.kind === "unauthenticated") return "Your session expired. Sign in again.";
    if (error.kind === "denied")
      return "You no longer have permission for this register. Refresh your access.";
    if (error.responseStatus === 409)
      return "This register changed since it was opened. Refresh it and review the changes before saving.";
    if (error.responseStatus === 400 || error.responseStatus === 413)
      return "The submitted values or workbook could not be accepted. Check the fields, file size and mapping.";
  }
  return "The operation could not be confirmed. Check your connection, refresh this register and try again.";
}
function DialogHeader({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children?: ReactNode;
}) {
  return (
    <header className="reviews-dialog-header">
      <div>
        <h2>{title}</h2>
        {children}
      </div>
      <button type="button" className="button ghost" aria-label="Close" onClick={close}>
        <X size={18} />
      </button>
    </header>
  );
}

export const reviewStatuses = [
  { id: "unchecked", label: "Not checked" },
  { id: "healthy", label: "Expected page found" },
  { id: "http-error", label: "HTTP error" },
  { id: "soft-404", label: "Error page" },
  { id: "wrong-page", label: "Unexpected page" },
  { id: "auth-required", label: "Sign-in required" },
  { id: "unreachable", label: "Unreachable" },
  { id: "tls-error", label: "Certificate/TLS error" },
  { id: "redirect", label: "Redirect issue" },
  { id: "blocked", label: "Policy blocked" },
  { id: "unknown", label: "Needs verification" },
];

export function reviewRecordColumns(
  fields: ReviewRegisterConfig["fields"],
): RecordColumn<ReviewRecord>[] {
  return [
    { id: "name", label: "Application", value: (r) => r.title },
    { id: "management", label: "Managed by", value: (r) => r.management },
    { id: "department", label: "Department", value: (r) => r.department },
    { id: "owner", label: "Business owner", value: (r) => r.businessOwner },
    { id: "maintainer", label: "Technical maintainer", value: (r) => r.technicalAssignee },
    { id: "requirement", label: "Requirement", value: (r) => r.requirement },
    { id: "lifecycle", label: "Lifecycle", value: (r) => r.lifecycle },
    { id: "recorded", label: "Recorded access", value: (r) => r.recordedAccess },
    {
      id: "health",
      label: "Link status",
      value: (r) => reviewStatus(recordLinkStatus(r)),
      render: (r) => (
        <RecordBadge tone={reviewTone(recordLinkStatus(r))}>
          {reviewStatus(recordLinkStatus(r))}
        </RecordBadge>
      ),
    },
    { id: "http", label: "HTTP results", value: (r) => endpointResultText(r, "http") },
    {
      id: "checked",
      label: "Last tested",
      value: (r) => {
        const check = lastCheck(r);
        return check ? stamp(check.checkedAt) : "";
      },
    },
    { id: "finalUrl", label: "Final URL", value: (r) => endpointResultText(r, "finalUrl") },
    { id: "next", label: "Next action", value: (r) => r.reviews.at(-1)?.nextAction ?? "" },
    ...fields.map((field) => ({
      id: `field:${field.key}`,
      label: field.label,
      value: (r: ReviewRecord) => r.fields[field.key] ?? "",
    })),
  ];
}

export function ReviewsPage(props: Props) {
  return <ReviewsWorkspace key={`${props.workspaceId}:${props.userId}`} {...props} />;
}

function ReviewsWorkspace({ api, workspaceId, userId, scopeName, onSessionExpired }: Props) {
  const preferenceKey = `frevos:${userId}:${workspaceId}:reviews:selected`;
  const [selected, setSelected] = useState(() => {
    try {
      return sessionStorage.getItem(preferenceKey) ?? "";
    } catch {
      return "";
    }
  });
  const [catalog, setCatalog] = useState<ReviewCatalog | null>(null);
  const [state, setState] = useState<ReviewState | null>(null);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0),
    [reportsOpen, setReportsOpen] = useState(() => {
      try {
        return sessionStorage.getItem(`frevos:${userId}:${workspaceId}:reviews:reports`) === "open";
      } catch {
        return false;
      }
    }),
    [settings, setSettings] = useState(false),
    [access, setAccess] = useState(false),
    [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<ReviewRecord | "new" | null>(null),
    [detailId, setDetailId] = useState("");
  const fail = useCallback(
    (reason: unknown) => {
      setError(failureText(reason));
      if (reason instanceof ApiFailure && ["unauthenticated", "denied"].includes(reason.kind)) {
        setState(null);
        setCatalog(null);
        setDetailId("");
        setSettings(false);
        setEditing(null);
        setAccess(false);
        setImporting(false);
        setReportsOpen(false);
        if (reason.kind === "unauthenticated") onSessionExpired?.();
      }
    },
    [onSessionExpired],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload is the explicit refresh action.
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setError("");
    setState(null);
    const load = async () => {
      try {
        if (!api.reviewsCatalog || !api.reviewsState) throw new Error("Reviews unavailable");
        const result = await api.reviewsCatalog(workspaceId, abort.signal);
        if (abort.signal.aborted) return;
        setCatalog(result);
        if (selected && result.registers.some((r) => r.id === selected)) {
          const loaded = await api.reviewsState(workspaceId, selected, abort.signal);
          if (!abort.signal.aborted) setState(loaded);
        } else if (selected) setSelected("");
      } catch (reason) {
        if (!abort.signal.aborted) fail(reason);
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => abort.abort();
  }, [api, workspaceId, selected, reload, fail]);
  const move = (id: string) => {
    setSelected(id);
    setDetailId("");
    setNotice("");
    setError("");
    try {
      sessionStorage.setItem(preferenceKey, id);
    } catch {
      /* Session preferences are optional. */
    }
  };
  const accept = (result: ReviewState) => {
    setState(result);
    setSelected(result.register.id);
    setError("");
    setCatalog((current) =>
      current
        ? {
            ...current,
            registers: [
              ...current.registers.filter((r) => r.id !== result.register.id),
              {
                id: result.register.id,
                name: result.register.name,
                description: result.register.description,
                revision: result.register.revision,
                role: result.role,
                recordCount: result.records.length,
              },
            ],
          }
        : current,
    );
    try {
      sessionStorage.setItem(preferenceKey, result.register.id);
    } catch {
      /* Optional preferences. */
    }
  };
  const run = async (action: () => Promise<ReviewState>, message: string) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      accept(await action());
      setNotice(message);
      return true;
    } catch (reason) {
      fail(reason);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const administrator = state?.role === "administrator";
  const writable = !!state && state.role !== "viewer";
  const detail = state?.records.find((r) => r.id === detailId);
  const check = (record: ReviewRecord, endpoint: ReviewEndpoint) => {
    const request = api.checkReviewLink;
    if (!request || !state) return;
    void run(
      () =>
        request(workspaceId, {
          version: 1,
          registerId: state.register.id,
          recordId: record.id,
          endpointId: endpoint.id,
          expectedRevision: record.revision,
        }),
      "Link check completed. The measured result is saved in test history.",
    );
  };
  const recordColumns = reviewRecordColumns(state?.register.fields ?? []);
  const recordActions = (record: ReviewRecord) => (
    <div className="reviews-row-actions">
      <button type="button" className="button secondary" onClick={() => setDetailId(record.id)}>
        Review
      </button>
      {writable ? (
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={() => setEditing(record)}
        >
          Edit
        </button>
      ) : null}
      {writable && record.endpoints.length === 1 ? (
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={() => {
            const endpoint = record.endpoints[0];
            if (endpoint) check(record, endpoint);
          }}
        >
          <CheckCheck size={14} />
          Test link
        </button>
      ) : null}
    </div>
  );
  return (
    <div className="reviews-workspace">
      {state ? (
        <RecordWorkspace
          key={`${workspaceId}:${userId}:${state.register.id}`}
          title={state.register.name}
          breadcrumb="Reviews / Review registers"
          scopeName={scopeName}
          userId={userId}
          workspaceId={workspaceId}
          page={`reviews:${state.register.id}`}
          noun="applications"
          records={state.records}
          columns={recordColumns}
          cardFilterColumns={["management", "department", "maintainer", "requirement", "lifecycle"]}
          identify={(r) => r.id}
          statusOf={(r) => recordLinkStatus(r) ?? "unchecked"}
          statuses={reviewStatuses}
          loading={loading}
          error={error}
          onRetry={() => setReload((n) => n + 1)}
          pageSize={50}
          notice={
            notice ||
            (state.role === "viewer"
              ? "View-only access. A reviewer or administrator can update records and test links."
              : "Recorded access is imported or entered evidence. Link checks have their own timestamp and result.")
          }
          emptyTitle="No applications in this register"
          emptyDescription={
            writable
              ? "Add an application or import an Excel workbook. Mapping and conflicts are reviewed before anything is saved."
              : "An authorized reviewer can add applications to this register."
          }
          actions={
            <>
              <button type="button" className="button secondary" onClick={() => move("")}>
                <ArrowLeft size={15} />
                Registers
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={busy || loading}
                onClick={() => setReload((n) => n + 1)}
                aria-label="Refresh register"
              >
                <RefreshCw size={15} />
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={() => setReportsOpen(true)}
              >
                <CalendarClock size={15} />
                Reports & schedule
              </button>
              {writable ? (
                <>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() => setImporting(true)}
                  >
                    <FileSpreadsheet size={15} />
                    Import Excel
                  </button>
                  <button
                    type="button"
                    className="button primary"
                    disabled={busy}
                    onClick={() => setEditing("new")}
                  >
                    <Plus size={15} />
                    Add application
                  </button>
                </>
              ) : null}
              {administrator ? (
                <>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setAccess(true)}
                  >
                    <Users size={15} />
                    Access
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setSettings(true)}
                  >
                    <Settings2 size={15} />
                    Settings
                  </button>
                </>
              ) : null}
            </>
          }
          renderActions={recordActions}
          renderCard={(record) => (
            <article className="record-card reviews-record-card">
              <div className="reviews-card-heading">
                <h2>{record.title}</h2>
                <RecordBadge tone={reviewTone(recordLinkStatus(record))}>
                  {reviewStatus(recordLinkStatus(record))}
                </RecordBadge>
              </div>
              <dl>
                <div>
                  <dt>Managed by</dt>
                  <dd>{record.management || "Unassigned"}</dd>
                </div>
                <div>
                  <dt>Department</dt>
                  <dd>{record.department || "Not recorded"}</dd>
                </div>
                <div>
                  <dt>Business owner</dt>
                  <dd>{record.businessOwner || "Unassigned"}</dd>
                </div>
                <div>
                  <dt>Technical maintainer</dt>
                  <dd>{record.technicalAssignee || "Unassigned"}</dd>
                </div>
              </dl>
              <div className="reviews-meta">
                <span>{record.requirement}</span>
                <span>{record.lifecycle}</span>
                <span>{record.endpoints.length} links</span>
              </div>
              {recordActions(record)}
              <details>
                <summary>More details</summary>
                <p>{record.description || "No description recorded."}</p>
                <p>SPOC: {record.spoc || "Unassigned"}</p>
                <p>Recorded access: {record.recordedAccess || "Not recorded"}</p>
                {lastCheck(record) ? (
                  <p>Last checked: {stamp(lastCheck(record)?.checkedAt)}</p>
                ) : null}
                {record.reviews.at(-1)?.nextAction ? (
                  <p>Next action: {record.reviews.at(-1)?.nextAction}</p>
                ) : null}
              </details>
            </article>
          )}
        />
      ) : (
        <RecordWorkspace
          title="Review registers"
          breadcrumb="Reviews"
          scopeName={scopeName}
          userId={userId}
          workspaceId={workspaceId}
          page="review-registers"
          noun="registers"
          records={catalog?.registers ?? []}
          columns={[
            { id: "name", label: "Register", value: (r) => r.name },
            { id: "description", label: "Description", value: (r) => r.description },
            { id: "role", label: "Your access", value: (r) => r.role },
            { id: "count", label: "Applications", value: (r) => String(r.recordCount) },
          ]}
          identify={(r) => r.id}
          statusOf={(r) => r.role}
          statuses={[
            { id: "administrator", label: "Administrator" },
            { id: "reviewer", label: "Reviewer" },
            { id: "viewer", label: "View only" },
          ]}
          loading={loading}
          error={error}
          onRetry={() => setReload((n) => n + 1)}
          notice={
            catalog?.administrator
              ? "Administrator · All workspace review registers"
              : "Only registers shared with your account are shown."
          }
          emptyDescription={
            catalog?.administrator
              ? "Create a register, configure its fields and import your workbook."
              : "Ask an administrator to grant you access to a review register."
          }
          actions={
            <>
              <button
                type="button"
                className="button secondary"
                disabled={loading}
                onClick={() => setReload((n) => n + 1)}
              >
                <RefreshCw size={15} />
                Refresh
              </button>
              {catalog?.administrator ? (
                <button type="button" className="button primary" onClick={() => setSettings(true)}>
                  <Plus size={15} />
                  New register
                </button>
              ) : null}
            </>
          }
          renderActions={(register) => (
            <button type="button" className="button primary" onClick={() => move(register.id)}>
              Open register
            </button>
          )}
          renderCard={(register) => (
            <article className="record-card reviews-record-card">
              <div className="reviews-card-heading">
                <h2>{register.name}</h2>
                <RecordBadge>{register.role}</RecordBadge>
              </div>
              <p>
                {register.description || "Application ownership, link checks and review decisions."}
              </p>
              <p>{register.recordCount} applications</p>
              <button type="button" className="button primary" onClick={() => move(register.id)}>
                Open register
              </button>
            </article>
          )}
        />
      )}
      {settings && (administrator || catalog?.administrator) ? (
        <RegisterEditor
          initial={state?.register ?? null}
          busy={busy}
          error={error}
          close={() => setSettings(false)}
          save={async (config) => {
            const request = api.saveReviewRegister;
            if (!request) return;
            const saved = await run(
              () =>
                request(workspaceId, {
                  version: 1,
                  ...(state ? { id: state.register.id } : {}),
                  expectedRevision: state?.register.revision ?? 0,
                  config,
                }),
              "Register settings saved.",
            );
            if (saved) setSettings(false);
          }}
        />
      ) : null}
      {reportsOpen && state ? (
        <ReviewReportsDialog
          api={api}
          workspaceId={workspaceId}
          state={state}
          close={() => {
            setReportsOpen(false);
            try {
              sessionStorage.removeItem(`frevos:${userId}:${workspaceId}:reviews:reports`);
            } catch {
              /* Optional navigation preference. */
            }
          }}
          updated={accept}
          onFailure={fail}
        />
      ) : null}
      {access && state && administrator ? (
        <AccessEditor
          state={state}
          users={catalog?.users ?? []}
          busy={busy}
          error={error}
          close={() => setAccess(false)}
          change={async (target, role) => {
            const request = api.grantReviewAccess;
            if (!request) return;
            await run(
              () =>
                request(workspaceId, {
                  version: 1,
                  registerId: state.register.id,
                  expectedRevision: state.register.revision,
                  userId: target as never,
                  role,
                }),
              "Register access updated.",
            );
          }}
        />
      ) : null}
      {editing && state && writable ? (
        <RecordEditor
          config={state.register}
          initial={editing === "new" ? null : editing}
          busy={busy}
          error={error}
          close={() => setEditing(null)}
          save={async (record) => {
            const request = api.saveReviewRecord;
            if (!request) return;
            const existing = editing === "new" ? null : editing;
            const saved = await run(
              () =>
                request(workspaceId, {
                  version: 1,
                  registerId: state.register.id,
                  ...(existing ? { id: existing.id } : {}),
                  expectedRevision: existing?.revision ?? 0,
                  record,
                }),
              "Application saved. Previous assignments remain in history.",
            );
            if (saved) setEditing(null);
          }}
        />
      ) : null}
      {detail && state ? (
        <RecordDetail
          record={detail}
          config={state.register}
          writable={writable}
          busy={busy}
          error={error}
          close={() => setDetailId("")}
          check={(endpoint) => check(detail, endpoint)}
          edit={() => {
            setDetailId("");
            setEditing(detail);
          }}
          review={async (input) => {
            const request = api.addApplicationReview;
            if (!request) return false;
            return run(
              () =>
                request(workspaceId, {
                  version: 1,
                  registerId: state.register.id,
                  recordId: detail.id,
                  expectedRevision: detail.revision,
                  ...input,
                }),
              "Review saved.",
            );
          }}
        />
      ) : null}
      {importing && state && writable ? (
        <ImportEditor
          api={api}
          workspaceId={workspaceId}
          state={state}
          close={() => setImporting(false)}
          accepted={(result) => {
            accept(result);
            setImporting(false);
            setNotice(
              "Excel import saved. Original sheet and row references are retained with each record.",
            );
          }}
          onFailure={fail}
        />
      ) : null}
    </div>
  );
}

export function RegisterEditor({
  initial,
  busy,
  error,
  close,
  save,
}: {
  initial: ReviewRegisterConfig | null;
  busy: boolean;
  error: string;
  close: () => void;
  save: (config: ReviewRegisterConfig) => Promise<void>;
}) {
  const [config, setConfig] = useState<ReviewRegisterConfig>(() =>
    initial ? structuredClone(initial) : blankConfig(),
  );
  const [localError, setLocalError] = useState("");
  const [fieldIds, setFieldIds] = useState(() => config.fields.map((field) => field.key));
  const update = <K extends keyof ReviewRegisterConfig>(key: K, value: ReviewRegisterConfig[K]) =>
    setConfig((current) => ({ ...current, [key]: value }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = ReviewRegisterConfigSchema.safeParse(config);
    if (!parsed.success) {
      setLocalError(parsed.error.issues[0]?.message ?? "Check register settings.");
      return;
    }
    setLocalError("");
    void save(parsed.data);
  };
  return (
    <WorkspaceDialog label={initial ? "Register settings" : "New review register"} onClose={close}>
      <form className="reviews-editor" onSubmit={submit}>
        <DialogHeader title={initial ? "Register settings" : "New review register"} close={close} />
        <div className="reviews-form-scroll">
          <div className="reviews-form-grid">
            <label>
              Register name
              <input
                required
                maxLength={120}
                value={config.name}
                onChange={(e) => update("name", e.target.value)}
              />
            </label>
            <label>
              Description
              <textarea
                maxLength={2000}
                value={config.description}
                onChange={(e) => update("description", e.target.value)}
              />
            </label>
          </div>
          <h3>Configurable choices</h3>
          <p className="reviews-muted">
            One choice per line. Existing record values must remain valid when changing these lists.
          </p>
          <div className="reviews-form-grid">
            {(
              [
                ["managementOptions", "Managed by choices"],
                ["lifecycleOptions", "Lifecycle choices"],
                ["requirementOptions", "Requirement choices"],
                ["decisionOptions", "Review decision choices"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                {label}
                <textarea
                  required
                  value={config[key].join("\n")}
                  onChange={(e) => update(key, e.target.value.split("\n"))}
                />
              </label>
            ))}
          </div>
          <section aria-label="Custom fields">
            <div className="reviews-section-heading">
              <h3>Additional fields</h3>
              <button
                type="button"
                className="button secondary"
                disabled={config.fields.length >= 40}
                onClick={() => {
                  let fieldNumber = 1;
                  while (config.fields.some((field) => field.key === `field${fieldNumber}`))
                    fieldNumber++;
                  setFieldIds([...fieldIds, endpointId()]);
                  update("fields", [
                    ...config.fields,
                    {
                      key: `field${fieldNumber}`,
                      label: "",
                      type: "text",
                      required: false,
                      options: [],
                    },
                  ]);
                }}
              >
                <Plus size={14} />
                Add field
              </button>
            </div>
            {config.fields
              .map((field, index) => ({ field, index, rowId: fieldIds[index] }))
              .map(({ field, index, rowId }) => (
                <fieldset key={rowId} className="reviews-field-definition">
                  <legend>Field {index + 1}</legend>
                  <div className="reviews-form-grid">
                    <label>
                      Field key
                      <input
                        required
                        pattern="[a-z][a-zA-Z0-9_]{0,39}"
                        value={field.key}
                        onChange={(e) =>
                          update(
                            "fields",
                            config.fields.map((f, i) =>
                              i === index ? { ...f, key: e.target.value } : f,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Label
                      <input
                        required
                        maxLength={120}
                        value={field.label}
                        onChange={(e) =>
                          update(
                            "fields",
                            config.fields.map((f, i) =>
                              i === index ? { ...f, label: e.target.value } : f,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Type
                      <select
                        value={field.type}
                        onChange={(e) =>
                          update(
                            "fields",
                            config.fields.map((f, i) =>
                              i === index ? { ...f, type: e.target.value as typeof field.type } : f,
                            ),
                          )
                        }
                      >
                        <option value="text">Text</option>
                        <option value="multiline">Long text</option>
                        <option value="date">Date</option>
                        <option value="select">Choice</option>
                      </select>
                    </label>
                    {field.type === "select" ? (
                      <label>
                        Choices, one per line
                        <textarea
                          value={field.options.join("\n")}
                          onChange={(e) =>
                            update(
                              "fields",
                              config.fields.map((f, i) =>
                                i === index ? { ...f, options: e.target.value.split("\n") } : f,
                              ),
                            )
                          }
                        />
                      </label>
                    ) : null}
                  </div>
                  <div className="reviews-row-actions">
                    <label className="reviews-checkbox">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(e) =>
                          update(
                            "fields",
                            config.fields.map((f, i) =>
                              i === index ? { ...f, required: e.target.checked } : f,
                            ),
                          )
                        }
                      />
                      Required
                    </label>
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => {
                        setFieldIds(fieldIds.filter((_, i) => i !== index));
                        update(
                          "fields",
                          config.fields.filter((_, i) => i !== index),
                        );
                      }}
                    >
                      Remove field
                    </button>
                  </div>
                </fieldset>
              ))}
          </section>
          <h3>Link testing policy</h3>
          <p className="reviews-muted">
            Checks run from the DevSetu server. Only the origins listed here can be checked,
            including redirect destinations. Private applications also need a server that can reach
            their network.
          </p>
          <label>
            Allowed origins, one per line
            <textarea
              placeholder="https://application.example.org"
              value={config.linkPolicy.allowedOrigins.join("\n")}
              onChange={(e) =>
                update("linkPolicy", {
                  ...config.linkPolicy,
                  allowedOrigins: e.target.value
                    .split("\n")
                    .map((v) => v.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
          <label>
            Allowed URL path prefixes, one per line
            <textarea
              value={config.linkPolicy.allowedPathPrefixes.join("\n")}
              onChange={(event) =>
                update("linkPolicy", {
                  ...config.linkPolicy,
                  allowedPathPrefixes: event.target.value
                    .split("\n")
                    .map((value) => value.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
          <label className="reviews-checkbox">
            <input
              type="checkbox"
              checked={config.linkPolicy.allowPrivate}
              onChange={(e) =>
                update("linkPolicy", { ...config.linkPolicy, allowPrivate: e.target.checked })
              }
            />
            Allow listed internal/private network destinations
          </label>
          <label className="reviews-checkbox">
            <input
              type="checkbox"
              checked={config.linkPolicy.allowSessionCookies === true}
              onChange={(e) =>
                update("linkPolicy", {
                  ...config.linkPolicy,
                  allowSessionCookies: e.target.checked,
                })
              }
            />
            Follow isolated application session cookies during redirects
          </label>
          <p className="reviews-muted">
            Uses only cookies issued by this application during one check, then discards them. Your
            DevSetu and browser sign-in cookies are never used.
          </p>
          <div className="reviews-form-grid">
            <label>
              Timeout (seconds)
              <input
                type="number"
                min={1}
                max={15}
                value={config.linkPolicy.timeoutMs / 1000}
                onChange={(e) =>
                  update("linkPolicy", {
                    ...config.linkPolicy,
                    timeoutMs: Number(e.target.value) * 1000,
                  })
                }
              />
            </label>
            <label>
              Maximum response (KB)
              <input
                type="number"
                min={1}
                max={256}
                value={config.linkPolicy.maxBytes / 1024}
                onChange={(e) =>
                  update("linkPolicy", {
                    ...config.linkPolicy,
                    maxBytes: Number(e.target.value) * 1024,
                  })
                }
              />
            </label>
            <label>
              Maximum redirects
              <input
                type="number"
                min={0}
                max={5}
                value={config.linkPolicy.maxRedirects}
                onChange={(e) =>
                  update("linkPolicy", {
                    ...config.linkPolicy,
                    maxRedirects: Number(e.target.value),
                  })
                }
              />
            </label>
          </div>
        </div>
        {error || localError ? (
          <p className="reviews-error" role="alert">
            {localError || error}
          </p>
        ) : null}
        <footer className="reviews-dialog-footer">
          <button type="button" className="button secondary" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? "Saving…" : "Save register"}
          </button>
        </footer>
      </form>
    </WorkspaceDialog>
  );
}

function AccessEditor({
  state,
  users,
  busy,
  error,
  close,
  change,
}: {
  state: ReviewState;
  users: ReviewCatalog["users"];
  busy: boolean;
  error: string;
  close: () => void;
  change: (userId: string, role: "viewer" | "reviewer" | null) => Promise<void>;
}) {
  const [user, setUser] = useState(""),
    [role, setRole] = useState<"viewer" | "reviewer">("viewer");
  return (
    <WorkspaceDialog label="Register access" onClose={close}>
      <section className="reviews-editor">
        <DialogHeader title="Register access" close={close}>
          <p>Administrators can see all registers. Other users need an explicit grant.</p>
        </DialogHeader>
        <div className="reviews-form-scroll">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (user) void change(user, role);
            }}
          >
            <div className="reviews-form-grid">
              <label>
                Workspace user
                <select required value={user} onChange={(e) => setUser(e.target.value)}>
                  <option value="">Choose a user</option>
                  {users.map((u) => (
                    <option key={u.userId} value={u.userId}>
                      {u.name} · {u.userId}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Access
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as "viewer" | "reviewer")}
                >
                  <option value="viewer">Viewer · read only</option>
                  <option value="reviewer">Reviewer · edit, import and test</option>
                </select>
              </label>
            </div>
            <button type="submit" className="button primary" disabled={busy || !user}>
              <ShieldCheck size={14} />
              Grant access
            </button>
          </form>
          <div className="reviews-history">
            {state.register.grants.length ? (
              state.register.grants.map((grant) => (
                <article key={grant.userId}>
                  <div>
                    <strong>
                      {users.find((u) => u.userId === grant.userId)?.name ?? grant.userId}
                    </strong>
                    <p>{grant.role}</p>
                  </div>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() => void change(grant.userId, null)}
                  >
                    Remove access
                  </button>
                </article>
              ))
            ) : (
              <p>No individual grants. This register is visible to administrators only.</p>
            )}
          </div>
        </div>
        {error ? (
          <p className="reviews-error" role="alert">
            {error}
          </p>
        ) : null}
        <footer className="reviews-dialog-footer">
          <button type="button" className="button secondary" onClick={close}>
            Done
          </button>
        </footer>
      </section>
    </WorkspaceDialog>
  );
}

function RecordEditor({
  config,
  initial,
  busy,
  error,
  close,
  save,
}: {
  config: ReviewRegisterConfig;
  initial: ReviewRecord | null;
  busy: boolean;
  error: string;
  close: () => void;
  save: (record: ReviewRecordInput) => Promise<void>;
}) {
  const [record, setRecord] = useState<ReviewRecordInput>(() =>
    initial
      ? {
          title: initial.title,
          description: initial.description,
          department: initial.department,
          management: initial.management,
          businessOwner: initial.businessOwner,
          spoc: initial.spoc,
          technicalAssignee: initial.technicalAssignee,
          lifecycle: initial.lifecycle,
          requirement: initial.requirement,
          recordedAccess: initial.recordedAccess,
          fields: { ...initial.fields },
          endpoints: structuredClone(initial.endpoints),
        }
      : blankRecord(config),
  );
  const update = <K extends keyof ReviewRecordInput>(key: K, value: ReviewRecordInput[K]) =>
    setRecord((current) => ({ ...current, [key]: value }));
  const setEndpoint = (id: string, patch: Partial<ReviewEndpoint>) =>
    update(
      "endpoints",
      record.endpoints.map((endpoint) =>
        endpoint.id === id ? { ...endpoint, ...patch } : endpoint,
      ),
    );
  return (
    <WorkspaceDialog label={initial ? "Edit application" : "Add application"} onClose={close}>
      <form
        className="reviews-editor"
        onSubmit={(e) => {
          e.preventDefault();
          void save(record);
        }}
      >
        <DialogHeader title={initial ? "Edit application" : "Add application"} close={close} />
        <div className="reviews-form-scroll">
          <div className="reviews-form-grid">
            <label>
              Application name
              <input
                required
                maxLength={240}
                value={record.title}
                onChange={(e) => update("title", e.target.value)}
              />
            </label>
            <label>
              Department
              <input
                maxLength={240}
                value={record.department}
                onChange={(e) => update("department", e.target.value)}
              />
            </label>
            <label>
              Managed by
              <select
                value={record.management}
                onChange={(e) => update("management", e.target.value)}
              >
                {config.managementOptions.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Business owner
              <input
                maxLength={240}
                value={record.businessOwner}
                onChange={(e) => update("businessOwner", e.target.value)}
              />
            </label>
            <label>
              SPOC
              <input
                maxLength={240}
                value={record.spoc}
                onChange={(e) => update("spoc", e.target.value)}
              />
            </label>
            <label>
              Technical maintainer
              <input
                maxLength={240}
                value={record.technicalAssignee}
                onChange={(e) => update("technicalAssignee", e.target.value)}
              />
            </label>
            <label>
              Lifecycle
              <select
                value={record.lifecycle}
                onChange={(e) => update("lifecycle", e.target.value)}
              >
                {config.lifecycleOptions.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Requirement
              <select
                value={record.requirement}
                onChange={(e) => update("requirement", e.target.value)}
              >
                {config.requirementOptions.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Recorded access status
              <input
                maxLength={240}
                value={record.recordedAccess}
                onChange={(e) => update("recordedAccess", e.target.value)}
              />
            </label>
            <label>
              Description
              <textarea
                maxLength={6000}
                value={record.description}
                onChange={(e) => update("description", e.target.value)}
              />
            </label>
            {config.fields.map((field) => (
              <label key={field.key} htmlFor={`review-field-${field.key}`}>
                {field.label}
                {field.type === "multiline" ? (
                  <textarea
                    id={`review-field-${field.key}`}
                    required={field.required}
                    maxLength={6000}
                    value={record.fields[field.key] ?? ""}
                    onChange={(e) =>
                      update("fields", { ...record.fields, [field.key]: e.target.value })
                    }
                  />
                ) : field.type === "select" ? (
                  <select
                    id={`review-field-${field.key}`}
                    required={field.required}
                    value={record.fields[field.key] ?? ""}
                    onChange={(e) =>
                      update("fields", { ...record.fields, [field.key]: e.target.value })
                    }
                  >
                    <option value="">Choose…</option>
                    {field.options.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={`review-field-${field.key}`}
                    type={field.type === "date" ? "date" : "text"}
                    required={field.required}
                    maxLength={6000}
                    value={record.fields[field.key] ?? ""}
                    onChange={(e) =>
                      update("fields", { ...record.fields, [field.key]: e.target.value })
                    }
                  />
                )}
              </label>
            ))}
          </div>
          <section aria-label="Application links">
            <div className="reviews-section-heading">
              <h3>Application links</h3>
              <button
                type="button"
                className="button secondary"
                disabled={record.endpoints.length >= 20}
                onClick={() =>
                  update("endpoints", [
                    ...record.endpoints,
                    {
                      id: endpointId(),
                      label: "",
                      url: "",
                      expectedText: "",
                      expectedStatuses: [200],
                    },
                  ])
                }
              >
                <Plus size={14} />
                Add link
              </button>
            </div>
            {record.endpoints.map((endpoint, index) => (
              <fieldset key={endpoint.id} className="reviews-field-definition">
                <legend>Link {index + 1}</legend>
                <div className="reviews-form-grid">
                  <label>
                    Label
                    <input
                      maxLength={240}
                      value={endpoint.label}
                      onChange={(e) => setEndpoint(endpoint.id, { label: e.target.value })}
                    />
                  </label>
                  <label>
                    URL
                    <input
                      required
                      type="url"
                      maxLength={2048}
                      value={endpoint.url}
                      onChange={(e) => setEndpoint(endpoint.id, { url: e.target.value })}
                    />
                  </label>
                  <label>
                    Expected page text
                    <input
                      maxLength={500}
                      placeholder="Text that identifies the correct application"
                      value={endpoint.expectedText}
                      onChange={(e) => setEndpoint(endpoint.id, { expectedText: e.target.value })}
                    />
                  </label>
                  <label>
                    Expected HTTP statuses
                    <input
                      required
                      pattern="[0-9, ]+"
                      value={endpoint.expectedStatuses.join(", ")}
                      onChange={(e) =>
                        setEndpoint(endpoint.id, {
                          expectedStatuses: e.target.value
                            .split(",")
                            .map((value) => Number(value.trim())),
                        })
                      }
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() =>
                    update(
                      "endpoints",
                      record.endpoints.filter((link) => link.id !== endpoint.id),
                    )
                  }
                >
                  Remove link
                </button>
              </fieldset>
            ))}
            {!record.endpoints.length ? (
              <p className="reviews-muted">
                No URL yet. You can save ownership details and add links later.
              </p>
            ) : null}
          </section>
        </div>
        {error ? (
          <p className="reviews-error" role="alert">
            {error}
          </p>
        ) : null}
        <footer className="reviews-dialog-footer">
          <button type="button" className="button secondary" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? "Saving…" : "Save application"}
          </button>
        </footer>
      </form>
    </WorkspaceDialog>
  );
}

export function CheckEvidence({ check }: { check: ReviewCheckResult }) {
  return (
    <div className="reviews-check-evidence">
      <RecordBadge tone={reviewTone(check.status)}>{reviewStatus(check.status)}</RecordBadge>
      <p>{check.message}</p>
      <dl>
        <div>
          <dt>HTTP</dt>
          <dd>{check.httpStatus ?? "No response"}</dd>
        </div>
        <div>
          <dt>Checked</dt>
          <dd>{stamp(check.checkedAt)}</dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd>{check.elapsedMs} ms</dd>
        </div>
        {check.title ? (
          <div>
            <dt>Page title</dt>
            <dd>{check.title}</dd>
          </div>
        ) : null}
        {check.finalUrl ? (
          <div>
            <dt>Final URL</dt>
            <dd>{check.finalUrl}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
export function RecordDetail({
  record,
  config,
  writable,
  busy,
  error,
  close,
  check,
  edit,
  review,
}: {
  record: ReviewRecord;
  config: ReviewRegisterConfig;
  writable: boolean;
  busy: boolean;
  error: string;
  close: () => void;
  check: (endpoint: ReviewEndpoint) => void;
  edit: () => void;
  review: (input: {
    decision: string;
    note: string;
    nextAction: string;
    dueDate: string;
  }) => Promise<boolean>;
}) {
  const [tab, setTab] = useState<"details" | "links" | "reviews" | "history">("details");
  const [decision, setDecision] = useState(config.decisionOptions[0] ?? ""),
    [note, setNote] = useState(""),
    [nextAction, setNextAction] = useState(""),
    [dueDate, setDueDate] = useState("");
  return (
    <WorkspaceDialog label={`Application review: ${record.title}`} onClose={close}>
      <section className="reviews-editor">
        <DialogHeader title={record.title} close={close}>
          <p>
            {record.management} · {record.department || "Department not recorded"}
          </p>
        </DialogHeader>
        <nav className="reviews-tabs" aria-label="Application review sections">
          {(
            [
              ["details", "Details"],
              ["links", "Links & tests"],
              ["reviews", "Reviews"],
              ["history", "Assignment & source history"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className="button secondary"
              aria-pressed={tab === id}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="reviews-form-scroll">
          {tab === "details" ? (
            <>
              <dl className="reviews-facts">
                <div>
                  <dt>Business owner</dt>
                  <dd>{record.businessOwner || "Unassigned"}</dd>
                </div>
                <div>
                  <dt>SPOC</dt>
                  <dd>{record.spoc || "Unassigned"}</dd>
                </div>
                <div>
                  <dt>Technical maintainer</dt>
                  <dd>{record.technicalAssignee || "Unassigned"}</dd>
                </div>
                <div>
                  <dt>Lifecycle</dt>
                  <dd>{record.lifecycle || "Not recorded"}</dd>
                </div>
                <div>
                  <dt>Requirement</dt>
                  <dd>{record.requirement || "Not recorded"}</dd>
                </div>
                <div>
                  <dt>Recorded access</dt>
                  <dd>{record.recordedAccess || "Not recorded"}</dd>
                </div>
                {config.fields.map((field) => (
                  <div key={field.key}>
                    <dt>{field.label}</dt>
                    <dd>{record.fields[field.key] || "Not recorded"}</dd>
                  </div>
                ))}
              </dl>
              <p className="reviews-preserve-text">
                {record.description || "No description recorded."}
              </p>
              <p className="reviews-muted">
                Recorded access comes from a saved entry or workbook. See Links & tests for measured
                results. Assignment changes do not establish a person’s employment status.
              </p>
            </>
          ) : null}
          {tab === "links" ? (
            <>
              <p className="reviews-muted">
                Read-only checks run from the DevSetu server using this register’s allowed origins.
                HTTP status and page identity are checked separately; sign-in pages do not prove the
                application is down.
              </p>
              {record.endpoints.length ? (
                record.endpoints.map((endpoint) => {
                  const result = record.checks.findLast(
                    (item) => item.current && item.endpointId === endpoint.id,
                  );
                  const url = reviewLink(endpoint.url);
                  return (
                    <article key={endpoint.id} className="reviews-link-card">
                      <h3>{endpoint.label || endpoint.url}</h3>
                      <p className="reviews-wrap">{endpoint.url}</p>
                      <p>
                        Expected: HTTP {endpoint.expectedStatuses.join(", ")}
                        {endpoint.expectedText
                          ? ` · “${endpoint.expectedText}”`
                          : " · Page identity not configured"}
                      </p>
                      <div className="reviews-row-actions">
                        {url ? (
                          <a
                            className="button secondary"
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink size={14} />
                            Open application
                          </a>
                        ) : null}
                        {writable ? (
                          <button
                            type="button"
                            className="button primary"
                            disabled={busy}
                            onClick={() => check(endpoint)}
                          >
                            <CheckCheck size={14} />
                            {busy ? "Checking…" : "Test link"}
                          </button>
                        ) : null}
                      </div>
                      {result ? <CheckEvidence check={result} /> : <p>Not checked yet.</p>}
                    </article>
                  );
                })
              ) : (
                <p>No application links have been configured.</p>
              )}
              <details>
                <summary>All test history ({record.checks.length})</summary>
                <div className="reviews-history">
                  {[...record.checks].reverse().map((item) => (
                    <article key={JSON.stringify(item)}>
                      <div>
                        <h4>
                          {record.endpoints.find((endpoint) => endpoint.id === item.endpointId)
                            ?.label || item.endpointId}
                        </h4>
                        <CheckEvidence check={item} />
                        {!item.current ? (
                          <RecordBadge>Previous configuration · history only</RecordBadge>
                        ) : null}
                        <p className="reviews-muted">Requested by {item.by}</p>
                      </div>
                    </article>
                  ))}
                </div>
              </details>
            </>
          ) : null}
          {tab === "reviews" ? (
            <>
              {writable ? (
                <form
                  className="reviews-review-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void review({ decision, note, nextAction, dueDate }).then((saved) => {
                      if (saved) {
                        setNote("");
                        setNextAction("");
                        setDueDate("");
                      }
                    });
                  }}
                >
                  <h3>Add review</h3>
                  <div className="reviews-form-grid">
                    <label>
                      Decision
                      <select value={decision} onChange={(e) => setDecision(e.target.value)}>
                        {config.decisionOptions.map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Due date
                      <input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                      />
                    </label>
                    <label>
                      Review note
                      <textarea
                        required
                        maxLength={6000}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                      />
                    </label>
                    <label>
                      Next action
                      <textarea
                        maxLength={6000}
                        value={nextAction}
                        onChange={(e) => setNextAction(e.target.value)}
                      />
                    </label>
                  </div>
                  <button type="submit" className="button primary" disabled={busy}>
                    {busy ? "Saving…" : "Save review"}
                  </button>
                </form>
              ) : null}
              <div className="reviews-history">
                {record.reviews.length ? (
                  [...record.reviews].reverse().map((item) => (
                    <article key={item.id}>
                      <div>
                        <h3>{item.decision}</h3>
                        <p className="reviews-preserve-text">{item.note}</p>
                        {item.nextAction ? <p>Next action: {item.nextAction}</p> : null}
                        {item.dueDate ? <p>Due: {item.dueDate}</p> : null}
                        <p className="reviews-muted">
                          {stamp(item.at)} · {item.by}
                        </p>
                      </div>
                    </article>
                  ))
                ) : (
                  <p>No reviews recorded yet.</p>
                )}
              </div>
            </>
          ) : null}
          {tab === "history" ? (
            <>
              <h3>Assignment history</h3>
              <div className="reviews-history">
                {record.assignmentHistory.map((item) => (
                  <article key={JSON.stringify(item)}>
                    <dl>
                      <div>
                        <dt>Business owner</dt>
                        <dd>{item.businessOwner || "Unassigned"}</dd>
                      </div>
                      <div>
                        <dt>SPOC</dt>
                        <dd>{item.spoc || "Unassigned"}</dd>
                      </div>
                      <div>
                        <dt>Technical maintainer</dt>
                        <dd>{item.technicalAssignee || "Unassigned"}</dd>
                      </div>
                      <div>
                        <dt>Recorded</dt>
                        <dd>
                          {stamp(item.at)} · {item.by}
                        </dd>
                      </div>
                    </dl>
                  </article>
                ))}
                {!record.assignmentHistory.length ? <p>No earlier assignments recorded.</p> : null}
              </div>
              <h3>Import sources</h3>
              <div className="reviews-history">
                {record.provenance.map((source) => (
                  <article
                    key={`${source.sourceHash}:${source.sheet}:${source.row}:${source.importedAt}`}
                  >
                    <div>
                      <strong>{source.fileName}</strong>
                      <p>
                        {source.sheet} · Row {source.row}
                      </p>
                      <p>
                        Imported {stamp(source.importedAt)} · {source.importedBy}
                      </p>
                      <details>
                        <summary>Mapped source cells</summary>
                        <dl>
                          {Object.entries(source.cells).map(([key, cell]) => (
                            <div key={key}>
                              <dt>
                                {config.fields.find((field) => field.key === key)?.label ??
                                  semanticFields.find(([field]) => field === key)?.[1] ??
                                  key}
                              </dt>
                              <dd>{cell}</dd>
                            </div>
                          ))}
                        </dl>
                        <p className="reviews-wrap">Source digest: {source.sourceHash}</p>
                      </details>
                    </div>
                  </article>
                ))}
                {!record.provenance.length ? <p>This record was entered directly.</p> : null}
              </div>
            </>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="reviews-error">
            {error}
          </p>
        ) : null}
        <footer className="reviews-dialog-footer">
          <span className="reviews-muted">Updated {stamp(record.updatedAt)}</span>
          {writable ? (
            <button type="button" className="button secondary" disabled={busy} onClick={edit}>
              Edit application
            </button>
          ) : null}
          <button type="button" className="button secondary" onClick={close}>
            Close
          </button>
        </footer>
      </section>
    </WorkspaceDialog>
  );
}

export function ImportComparison({
  incoming,
  existing,
}: {
  incoming: ReviewRecordInput;
  existing: ReviewRecord;
}) {
  const fields = [
    ["businessOwner", "Business owner"],
    ["spoc", "SPOC"],
    ["technicalAssignee", "Technical maintainer"],
    ["department", "Department"],
    ["management", "Managed by"],
    ["requirement", "Requirement"],
    ["lifecycle", "Lifecycle"],
  ] as const;
  return (
    <div className="reviews-table-scroll">
      <table className="reviews-source-table">
        <caption>Existing and incoming assignments</caption>
        <thead>
          <tr>
            <th>Field</th>
            <th>Existing record</th>
            <th>Incoming row</th>
          </tr>
        </thead>
        <tbody>
          {fields.map(([key, label]) => (
            <tr key={key}>
              <th scope="row">{label}</th>
              <td>{existing[key] || "Not recorded"}</td>
              <td>{incoming[key] || "Not supplied"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ImportEditor({
  api,
  workspaceId,
  state,
  close,
  accepted,
  onFailure,
}: {
  api: ControlCenterApi;
  workspaceId: string;
  state: ReviewState;
  close: () => void;
  accepted: (value: ReviewState) => void;
  onFailure: (error: unknown) => void;
}) {
  const [upload, setUpload] = useState<WorkbookUpload | null>(null),
    [workbook, setWorkbook] = useState<ReviewWorkbook | null>(null),
    [sheetName, setSheetName] = useState(""),
    [headerRow, setHeaderRow] = useState(1);
  const [mapping, setMapping] = useState<Record<string, string>>({}),
    [scheme, setScheme] = useState<"https" | "http">("https"),
    [preview, setPreview] = useState<ReviewImportPreview | null>(null),
    [choices, setChoices] = useState<Record<string, string>>({});
  const [valueMappings, setValueMappings] = useState<Record<string, Record<string, string>>>({});
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const sheet = workbook?.sheets.find((item) => item.name === sheetName);
  const header = sheet?.rows.find((row) => row.row === headerRow);
  const columns = [
    ...new Set(sheet?.rows.flatMap((row) => row.cells.map((cell) => cell.column)) ?? []),
  ].sort((a, b) => a.length - b.length || a.localeCompare(b));
  const targets = [
    ...semanticFields.map(([key, label]) => ({ key, label })),
    ...state.register.fields.map((field) => ({ key: field.key, label: field.label })),
  ];
  const choiceMappings = [
    { key: "management", label: "Managed by", options: state.register.managementOptions },
    { key: "requirement", label: "Requirement", options: state.register.requirementOptions },
    { key: "lifecycle", label: "Lifecycle", options: state.register.lifecycleOptions },
    ...state.register.fields
      .filter((field) => field.type === "select")
      .map((field) => ({ key: field.key, label: field.label, options: field.options })),
  ]
    .filter((field) => !!mapping[field.key])
    .map((field) => ({
      ...field,
      values: [
        ...new Set(
          sheet?.rows
            .filter((row) => row.row > headerRow)
            .map(
              (row) =>
                row.cells.find((cell) => cell.column === mapping[field.key])?.text.trim() ?? "",
            )
            .filter(Boolean),
        ),
      ],
    }));
  const unresolvedChoices = choiceMappings.some((field) =>
    field.values.some(
      (value) =>
        !(valueMappings[field.key]?.[value] || (field.options.includes(value) ? value : "")),
    ),
  );
  const read = async (file: File) => {
    setError("");
    setWorkbook(null);
    setUpload(null);
    setPreview(null);
    setMapping({});
    setValueMappings({});
    if (!file.name.toLowerCase().endsWith(".xlsx") || file.size > 4 * 1024 * 1024) {
      setError("Choose an .xlsx workbook of up to 4 MB.");
      return;
    }
    if (!api.reviewWorkbook) return;
    setBusy(true);
    try {
      const contentBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("File could not be read"));
        reader.onload = () =>
          typeof reader.result === "string"
            ? resolve(reader.result.slice(reader.result.indexOf(",") + 1))
            : reject(new Error("File could not be read"));
        reader.readAsDataURL(file);
      });
      const input = { fileName: file.name, contentBase64 };
      const result = await api.reviewWorkbook(workspaceId, {
        version: 1,
        registerId: state.register.id,
        ...input,
      });
      setUpload(input);
      setWorkbook(result);
      setSheetName(
        result.sheets.find((item) => !item.hidden)?.name ?? result.sheets[0]?.name ?? "",
      );
      setHeaderRow(1);
    } catch (reason) {
      setError(failureText(reason));
      if (reason instanceof ApiFailure && ["unauthenticated", "denied"].includes(reason.kind))
        onFailure(reason);
    } finally {
      setBusy(false);
    }
  };
  const prepare = async () => {
    if (!upload || !api.previewReviewImport) return;
    setBusy(true);
    setError("");
    try {
      setPreview(
        await api.previewReviewImport(workspaceId, {
          version: 1,
          registerId: state.register.id,
          expectedRevision: state.register.revision,
          ...upload,
          sheet: sheetName,
          headerRow,
          mapping: Object.fromEntries(Object.entries(mapping).filter(([, value]) => value)),
          defaultScheme: scheme,
          valueMappings,
        }),
      );
      setChoices({});
    } catch (reason) {
      setError(failureText(reason));
      if (reason instanceof ApiFailure && ["unauthenticated", "denied"].includes(reason.kind))
        onFailure(reason);
    } finally {
      setBusy(false);
    }
  };
  const commit = async () => {
    if (!preview || !api.commitReviewImport || unresolvedImportRows(preview, choices)) return;
    setBusy(true);
    setError("");
    try {
      accepted(
        await api.commitReviewImport(workspaceId, {
          version: 1,
          registerId: state.register.id,
          previewId: preview.id,
          expectedRevision: preview.revision,
          resolutions: importResolutions(preview, choices),
        }),
      );
    } catch (reason) {
      setError(failureText(reason));
      if (reason instanceof ApiFailure && ["unauthenticated", "denied"].includes(reason.kind))
        onFailure(reason);
    } finally {
      setBusy(false);
    }
  };
  return (
    <WorkspaceDialog label="Import Excel" onClose={close}>
      <section className="reviews-editor reviews-import-editor">
        <DialogHeader title="Import Excel" close={close}>
          <p>Choose workbook → map columns → resolve conflicts → save.</p>
        </DialogHeader>
        <div className="reviews-form-scroll">
          {!preview ? (
            <>
              <label className="reviews-upload">
                Excel workbook (.xlsx)
                <input
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void read(file);
                  }}
                />
              </label>
              {busy ? <p role="status">Reading workbook…</p> : null}
              {workbook ? (
                <>
                  <div className="reviews-form-grid">
                    <label>
                      Worksheet
                      <select
                        value={sheetName}
                        onChange={(e) => {
                          setSheetName(e.target.value);
                          setMapping({});
                          setValueMappings({});
                        }}
                      >
                        {workbook.sheets.map((item) => (
                          <option key={item.name} value={item.name}>
                            {item.name}
                            {item.hidden ? " (hidden)" : ""} · {item.maxRow} rows
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Header row
                      <input
                        type="number"
                        min={1}
                        max={Math.min(100, sheet?.maxRow ?? 100)}
                        value={headerRow}
                        onChange={(e) => {
                          setHeaderRow(Number(e.target.value));
                          setMapping({});
                          setValueMappings({});
                        }}
                      />
                    </label>
                    <label>
                      Default protocol for addresses without one
                      <select
                        value={scheme}
                        onChange={(e) => setScheme(e.target.value as "https" | "http")}
                      >
                        <option value="https">HTTPS</option>
                        <option value="http">HTTP</option>
                      </select>
                    </label>
                  </div>
                  <p className="reviews-muted">
                    Hidden columns and rows remain available for explicit mapping. Formulas are
                    treated as workbook evidence, never executed. Hidden rows:{" "}
                    {sheet?.hiddenRows.length ?? 0}; hidden columns:{" "}
                    {sheet?.hiddenColumns.join(", ") || "none"}.
                  </p>
                  <div className="reviews-form-grid reviews-mapping">
                    {targets.map((target) => (
                      <label key={target.key}>
                        {target.label}
                        {target.key === "title" ? " *" : ""}
                        <select
                          required={target.key === "title"}
                          value={mapping[target.key] ?? ""}
                          onChange={(e) =>
                            setMapping((current) => ({ ...current, [target.key]: e.target.value }))
                          }
                        >
                          <option value="">Do not import</option>
                          {columns.map((column) => (
                            <option key={column} value={column}>
                              {column} ·{" "}
                              {header?.cells.find((cell) => cell.column === column)?.text ||
                                "No header"}
                              {sheet?.hiddenColumns.includes(column) ? " (hidden)" : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                  {choiceMappings.length ? (
                    <section aria-label="Match imported choices">
                      <h3>Match imported choices</h3>
                      <p className="reviews-muted">
                        Match each workbook value to a configured choice. Original values remain
                        available in the source workbook.
                      </p>
                      <div className="reviews-form-grid">
                        {choiceMappings.flatMap((field) =>
                          field.values.map((value) => (
                            <label key={`${field.key}:${value}`}>
                              {field.label}: {value}
                              <select
                                value={
                                  valueMappings[field.key]?.[value] ||
                                  (field.options.includes(value) ? value : "")
                                }
                                onChange={(event) =>
                                  setValueMappings((current) => ({
                                    ...current,
                                    [field.key]: {
                                      ...current[field.key],
                                      [value]: event.target.value,
                                    },
                                  }))
                                }
                              >
                                <option value="">Choose matching value</option>
                                {field.options.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )),
                        )}
                      </div>
                    </section>
                  ) : null}
                  <details>
                    <summary>Source preview (first five rows after header)</summary>
                    <div className="reviews-table-scroll">
                      <table className="reviews-source-table">
                        <thead>
                          <tr>
                            <th>Row</th>
                            {columns.map((column) => (
                              <th key={column}>{column}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sheet?.rows
                            .filter((row) => row.row > headerRow)
                            .slice(0, 5)
                            .map((row) => (
                              <tr key={row.row}>
                                <th>{row.row}</th>
                                {columns.map((column) => (
                                  <td key={column}>
                                    {row.cells.find((cell) => cell.column === column)?.text}
                                  </td>
                                ))}
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </>
              ) : null}
            </>
          ) : (
            <>
              <div className="reviews-import-summary">
                <RecordBadge>{preview.rows.length} source rows</RecordBadge>
                <RecordBadge tone="warning">
                  {preview.rows.filter((row) => row.defaultAction === "conflict").length} conflicts
                </RecordBadge>
                <span>Preview expires {stamp(preview.expiresAt)}</span>
              </div>
              <p className="reviews-muted">
                Duplicate links and conflicting values need a decision. Skip keeps existing records
                unchanged. Update replaces the matched record’s mapped values while retaining review
                and assignment history.
              </p>
              <div className="reviews-import-decisions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() =>
                    setChoices(
                      Object.fromEntries(
                        preview.rows
                          .filter((row) => row.defaultAction === "conflict")
                          .map((row) => [String(row.row), "skip"]),
                      ),
                    )
                  }
                >
                  Skip all conflicts
                </button>
              </div>
              {preview.rows.map((row) => (
                <article key={row.row} className="reviews-import-row">
                  <div>
                    <h3>
                      Row {row.row} · {row.record.title || "Application name missing"}
                    </h3>
                    <p>
                      {row.record.endpoints.map((endpoint) => endpoint.url).join(" · ") ||
                        "No valid URL mapped"}
                    </p>
                    <p>
                      {row.record.management} · Owner: {row.record.businessOwner || "Unassigned"} ·
                      SPOC: {row.record.spoc || "Unassigned"}
                    </p>
                    {row.candidateRecordId &&
                    state.records.some((existing) => existing.id === row.candidateRecordId) ? (
                      <ImportComparison
                        incoming={row.record}
                        existing={
                          state.records.find(
                            (existing) => existing.id === row.candidateRecordId,
                          ) as ReviewRecord
                        }
                      />
                    ) : null}
                    {row.issues.length ? (
                      <ul>
                        {row.issues.map((issue) => (
                          <li key={issue}>{issue}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <label>
                    Import action
                    <select
                      aria-label={`Import action for row ${row.row}`}
                      value={
                        choices[String(row.row)] ??
                        (row.defaultAction === "conflict" ? "" : row.defaultAction)
                      }
                      onChange={(e) =>
                        setChoices((current) => ({ ...current, [String(row.row)]: e.target.value }))
                      }
                    >
                      <option value="">Choose a decision</option>
                      <option value="skip">Skip row</option>
                      {!row.candidateRecordId ? (
                        <option value="create">Create application</option>
                      ) : (
                        <option value="update">Update matched application</option>
                      )}
                    </select>
                  </label>
                </article>
              ))}
              {unresolvedImportRows(preview, choices) ? (
                <p role="status">
                  {unresolvedImportRows(preview, choices)} conflicts still need your decision.
                </p>
              ) : null}
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
            Cancel
          </button>
          {preview ? (
            <>
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setPreview(null)}
              >
                Back to mapping
              </button>
              <button
                type="button"
                className="button primary"
                disabled={busy || !!unresolvedImportRows(preview, choices)}
                onClick={() => void commit()}
              >
                {busy ? "Saving…" : "Confirm import"}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="button primary"
              disabled={
                busy ||
                !upload ||
                !Object.hasOwn(mapping, "title") ||
                !Reflect.get(mapping, "title") ||
                unresolvedChoices
              }
              onClick={() => void prepare()}
            >
              Preview import
            </button>
          )}
          {!preview && workbook && (!mapping["title"] || unresolvedChoices) ? (
            <p className="reviews-import-help" role="status">
              {!mapping["title"]
                ? "Choose the Application name column to enable preview."
                : "Match all imported choices above to enable preview."}
            </p>
          ) : null}
        </footer>
      </section>
    </WorkspaceDialog>
  );
}
