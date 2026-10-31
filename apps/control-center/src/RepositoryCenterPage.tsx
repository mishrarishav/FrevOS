import { useEffect, useState } from "react";
import type { HostedPullRequest, RepositoryAction, RepositoryCenterState } from "@frevos/contracts";
import type { ControlCenterApi } from "./api.js";
import { RecordWorkspace, RecordBadge } from "./RecordWorkspace.js";
import { WorkspaceDialog } from "./WorkspaceDialog.js";
import { deploymentRequestId } from "./deployment-request-id.js";
import { GitFoldersPanel } from "./GitFoldersPanel.js";
import { RepositoryRecoveryDialog } from "./RepositoryRecoveryDialog.js";

type Repository = RepositoryCenterState["repositories"][number];
export function RepositoryCenterPage({
  api,
  workspaceId,
  userId,
  scopeName,
  navigate,
}: {
  api: ControlCenterApi;
  workspaceId: string;
  userId: string;
  scopeName: string;
  navigate: (url: string) => void;
}) {
  const [view, setView] = useState<"folders" | "repositories">("folders");
  const [recovery, setRecovery] = useState(false);
  const [state, setState] = useState<RepositoryCenterState>({
    configured: false,
    repositories: [],
  });
  const [selected, setSelected] = useState<Repository | null>(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [reload, setReload] = useState(0);
  const [dialog, setDialog] = useState<"branch" | "pull" | "review" | "merge" | null>(null);
  const [branch, setBranch] = useState(""),
    [from, setFrom] = useState(""),
    [title, setTitle] = useState(""),
    [message, setMessage] = useState("");
  const [pull, setPull] = useState<HostedPullRequest | null>(null),
    [verdict, setVerdict] = useState<"COMMENT" | "APPROVED" | "REQUEST_CHANGES">("COMMENT");
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload explicitly requests fresh server state.
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setError("");
    void api
      .repositoryCenterState?.(workspaceId, abort.signal)
      .then((value) => {
        if (!abort.signal.aborted) setState(value);
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setError(
            "Could not load your repositories. Check your connection and repository access.",
          );
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [api, workspaceId, reload]);
  async function open(repo: Repository) {
    setBusy(true);
    setError("");
    try {
      if (!api.repositoryDetails) throw Error();
      setSelected(await api.repositoryDetails(workspaceId, repo.id));
    } catch {
      setError("Repository access could not be verified. Refresh and try again.");
    } finally {
      setBusy(false);
    }
  }
  async function execute() {
    if (!selected || !dialog || !api.repositoryAction) return;
    setBusy(true);
    setError("");
    try {
      const common = {
        version: 1 as const,
        requestId: `git_${deploymentRequestId("pr").slice(3)}`,
        repositoryId: selected.id,
      };
      let action: RepositoryAction;
      if (dialog === "branch") {
        const source = selected.branches.find((b) => b.name === from);
        if (!source) throw Error();
        action = {
          ...common,
          action: "branch.create",
          name: branch,
          from,
          expectedSha: source.sha,
        };
      } else if (dialog === "pull") {
        const source = selected.branches.find((b) => b.name === branch);
        if (!source) throw Error();
        action = {
          ...common,
          action: "pull.create",
          head: branch,
          base: selected.defaultBranch,
          expectedHead: source.sha,
          title,
          body: message,
        };
      } else {
        if (!pull) throw Error();
        action =
          dialog === "review"
            ? {
                ...common,
                action: "pull.review",
                number: pull.number,
                expectedHead: pull.headSha,
                verdict,
                body: message,
              }
            : {
                ...common,
                action: "pull.merge",
                number: pull.number,
                expectedHead: pull.headSha,
                expectedBase: pull.baseSha,
              };
      }
      await api.repositoryAction(workspaceId, action);
      setDialog(null);
      setNotice("Repository updated. Fresh state loaded.");
      await open(selected);
      setReload((n) => n + 1);
    } catch {
      setError(
        "The operation was not confirmed. Refresh repository state before trying again; permissions, source changes and required reviews are checked on the server.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {view === "folders" ? (
        <GitFoldersPanel
          api={api}
          workspaceId={workspaceId}
          userId={userId}
          scopeName={scopeName}
          repositories={state.repositories}
          navigate={navigate}
          showRepositories={() => setView("repositories")}
          repositoryCreated={(repo) =>
            setState((old) => ({
              ...old,
              repositories: [...old.repositories.filter((r) => r.id !== repo.id), repo],
            }))
          }
          hostingReady={state.configured && state.accountLinked !== false}
          hostingMessage={
            loading
              ? ""
              : error ||
                (!state.configured
                  ? "An administrator configures the private Git service once."
                  : state.accountLinked === false
                    ? "An administrator must link your own Git account before you can publish."
                    : "")
          }
        />
      ) : (
        <RecordWorkspace<Repository>
          title="Code"
          breadcrumb="Workspace / Code"
          scopeName={scopeName}
          userId={userId}
          workspaceId={workspaceId}
          page="repository-center"
          records={state.repositories}
          identify={(r) => r.id}
          statusOf={(r) => r.role}
          statuses={[
            { id: "reader", label: "Read only" },
            { id: "developer", label: "Developer" },
            { id: "maintainer", label: "Maintainer" },
          ]}
          loading={loading}
          error={error}
          notice={
            !state.configured && !loading
              ? "An administrator configures the private Git service once. Then connect your system and choose a folder."
              : notice
          }
          onRetry={() => setReload((n) => n + 1)}
          noun="repositories"
          columns={[
            { id: "name", label: "Repository", value: (r) => r.name },
            { id: "role", label: "Your access", value: (r) => r.role },
            { id: "defaultBranch", label: "Default branch", value: (r) => r.defaultBranch },
          ]}
          actions={
            <div className="record-row-actions">
              <button type="button" className="button secondary" onClick={() => setView("folders")}>
                My folders
              </button>
              {state.repositories.some((r) => r.permissions.admin) ? (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setRecovery(true)}
                >
                  Backup & restore
                </button>
              ) : null}
              <button
                type="button"
                className="button secondary"
                onClick={() => navigate("/systems/discovery")}
              >
                Connect system
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setReload((n) => n + 1)}
              >
                Refresh
              </button>
            </div>
          }
          renderCard={(r) => (
            <>
              <h2>{r.name}</h2>
              <RecordBadge>{r.role}</RecordBadge>
              <p className="record-muted">{r.defaultBranch}</p>
              <button
                type="button"
                className="button primary"
                disabled={busy}
                onClick={() => void open(r)}
              >
                Open repository
              </button>
            </>
          )}
          renderActions={(r) => (
            <button
              type="button"
              className="button primary"
              disabled={busy}
              onClick={() => void open(r)}
            >
              Open repository
            </button>
          )}
        />
      )}
      {recovery ? (
        <RepositoryRecoveryDialog
          api={api}
          workspaceId={workspaceId}
          onClose={() => setRecovery(false)}
        />
      ) : null}
      {selected && !dialog && !recovery ? (
        <WorkspaceDialog label={selected.name} onClose={() => !busy && setSelected(null)}>
          <section className="project-editor discovery-editor">
            <header className="settings-header">
              <div>
                <h2>{selected.name}</h2>
                <RecordBadge>{selected.role}</RecordBadge>
              </div>
              <button
                type="button"
                className="button ghost"
                disabled={busy}
                onClick={() => setSelected(null)}
              >
                Close
              </button>
            </header>
            <div className="discovery-scroll discovery-form">
              <label>
                Clone address
                <input readOnly aria-label="Clone address" value={selected.cloneUrl} />
              </label>
              <div className="record-row-actions">
                <a
                  className="button secondary"
                  href={selected.webUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Browse code
                </a>
                {selected.permissions.admin ? (
                  <a
                    className="button secondary"
                    href={`${selected.webUrl}/settings/collaboration`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Manage access
                  </a>
                ) : null}
                <a
                  className="button secondary"
                  href={`${selected.webUrl}/pulls`}
                  target="_blank"
                  rel="noreferrer"
                >
                  All pull requests
                </a>
              </div>
              <div className="settings-header">
                <h3>Branches</h3>
                {selected.permissions.write ? (
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() => {
                      setFrom(selected.defaultBranch);
                      setBranch("");
                      setDialog("branch");
                    }}
                  >
                    New branch
                  </button>
                ) : null}
              </div>
              <ul>
                {selected.branches.map((b) => (
                  <li key={b.name}>
                    {b.name} <code>{b.sha.slice(0, 12)}</code>{" "}
                    {b.protected ? <RecordBadge>Protected</RecordBadge> : null}
                  </li>
                ))}
              </ul>
              <div className="settings-header">
                <h3>Pull requests</h3>
                {selected.permissions.write ? (
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() => {
                      setBranch(
                        selected.branches.find((b) => b.name !== selected.defaultBranch)?.name ??
                          "",
                      );
                      setTitle("");
                      setMessage("");
                      setDialog("pull");
                    }}
                  >
                    Create pull request
                  </button>
                ) : null}
              </div>
              {selected.pullRequests.map((p) => (
                <article key={p.number}>
                  <h3>
                    <a href={p.url} target="_blank" rel="noreferrer">
                      #{p.number} {p.title}
                    </a>
                  </h3>
                  <p>
                    {p.head} → {p.base} · {p.author} · <code>{p.headSha.slice(0, 12)}</code>
                  </p>
                  <div className="record-row-actions">
                    {selected.permissions.write ? (
                      <button
                        type="button"
                        className="button secondary"
                        disabled={busy}
                        onClick={() => {
                          setPull(p);
                          setMessage("");
                          setVerdict("COMMENT");
                          setDialog("review");
                        }}
                      >
                        Review
                      </button>
                    ) : null}
                    {selected.permissions.admin ? (
                      <button
                        type="button"
                        className="button secondary"
                        disabled={busy || !p.mergeable}
                        onClick={() => {
                          setPull(p);
                          setDialog("merge");
                        }}
                      >
                        Review merge
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
              {!selected.pullRequests.length ? <p>No open pull requests.</p> : null}
              {error ? <p role="alert">{error}</p> : null}
            </div>
          </section>
        </WorkspaceDialog>
      ) : null}
      {selected && dialog ? (
        <WorkspaceDialog label="Repository action" onClose={() => !busy && setDialog(null)}>
          <form
            className="project-editor discovery-editor"
            onSubmit={(e) => {
              e.preventDefault();
              void execute();
            }}
          >
            <header className="settings-header">
              <h2>
                {dialog === "branch"
                  ? "New branch"
                  : dialog === "pull"
                    ? "Create pull request"
                    : dialog === "review"
                      ? "Review pull request"
                      : "Confirm protected merge"}
              </h2>
              <button
                type="button"
                className="button ghost"
                disabled={busy}
                onClick={() => setDialog(null)}
              >
                Cancel
              </button>
            </header>
            <div className="discovery-scroll discovery-form">
              {dialog === "branch" ? (
                <>
                  <label>
                    Branch name
                    <input
                      required
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                      placeholder="feature/my-change"
                    />
                  </label>
                  <label>
                    Start from
                    <select value={from} onChange={(e) => setFrom(e.target.value)}>
                      {selected.branches.map((b) => (
                        <option key={b.name}>{b.name}</option>
                      ))}
                    </select>
                  </label>
                </>
              ) : null}
              {dialog === "pull" ? (
                <>
                  <label>
                    Source branch
                    <select required value={branch} onChange={(e) => setBranch(e.target.value)}>
                      <option value="">Choose branch</option>
                      {selected.branches
                        .filter((b) => b.name !== selected.defaultBranch)
                        .map((b) => (
                          <option key={b.name}>{b.name}</option>
                        ))}
                    </select>
                  </label>
                  <p>Target: {selected.defaultBranch}</p>
                  <label>
                    Title
                    <input
                      required
                      maxLength={200}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </label>
                </>
              ) : null}
              {dialog === "review" ? (
                <label>
                  Review
                  <select
                    value={verdict}
                    onChange={(e) => setVerdict(e.target.value as typeof verdict)}
                  >
                    <option value="COMMENT">Comment</option>
                    <option value="APPROVED">Approve</option>
                    <option value="REQUEST_CHANGES">Request changes</option>
                  </select>
                </label>
              ) : null}
              {dialog === "pull" || dialog === "review" ? (
                <label>
                  Message
                  <textarea
                    maxLength={10000}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                </label>
              ) : null}
              {dialog === "merge" && pull ? (
                <>
                  <p>
                    Squash #{pull.number} into {pull.base}.
                  </p>
                  <p>
                    Head <code>{pull.headSha}</code>
                  </p>
                  <p>
                    Base <code>{pull.baseSha}</code>
                  </p>
                  <p>
                    Current non-author reviews, protected branch policy and required checks must
                    pass. A changed source invalidates this action.
                  </p>
                </>
              ) : null}
              {error ? <p role="alert">{error}</p> : null}
              <button className="button primary" type="submit" disabled={busy}>
                {busy ? "Working…" : dialog === "merge" ? "Confirm squash merge" : "Continue"}
              </button>
            </div>
          </form>
        </WorkspaceDialog>
      ) : null}
    </>
  );
}
