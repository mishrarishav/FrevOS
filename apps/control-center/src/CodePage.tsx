import type {
  CodeAccess,
  CodeBlob,
  CodeCatalog,
  CodeHistory,
  CodeRepository,
  CodeTree,
} from "@frevos/contracts";
import {
  ArrowLeft,
  BookMarked,
  Code2,
  Download,
  FileCode2,
  Folder,
  GitBranch,
  GitCommitHorizontal,
  History,
  LockKeyhole,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import type { ControlCenterApi } from "./api.js";
import { RecordBadge, RecordWorkspace } from "./RecordWorkspace.js";
import { RepositoryCenterPage } from "./RepositoryCenterPage.js";
import { WorkspaceDialog } from "./WorkspaceDialog.js";
import "./CodePage.css";

type Location = { repository: string; branch: string; path: string; file: boolean };
const emptyLocation: Location = { repository: "", branch: "", path: "", file: false };
export function codeLocation(search: string): Location {
  const p = new URLSearchParams(search),
    id = p.get("repository") ?? "";
  return /^(?:gitrepo|repo)_[a-f0-9]{32}$/.test(id)
    ? {
        repository: id,
        branch: p.get("branch") ?? "",
        path: p.get("path") ?? "",
        file: p.get("file") === "1",
      }
    : emptyLocation;
}
function SmallIcon({ children }: { children: ReactNode }) {
  return <span className="code-inline-icon">{children}</span>;
}
export function Readme({ text }: { text: string }) {
  // Repository markup is data. Never evaluate HTML, scripts or remote images.
  let offset = 0;
  const lines = text.split(/\r?\n/).map((line) => {
    const value = { line, offset };
    offset += line.length + 1;
    return value;
  });
  return (
    <div className="code-readme-text">
      {lines.map(({ line, offset }) =>
        /^#{1,3} /.test(line) ? (
          <h3 key={offset}>{line.replace(/^#+ /, "")}</h3>
        ) : (
          <p key={offset}>{line || "\u00a0"}</p>
        ),
      )}
    </div>
  );
}
export function SourceFile({ blob }: { blob: CodeBlob }) {
  if (blob.tooLarge || blob.binary)
    return (
      <div className="code-empty">
        <FileCode2 size={30} />
        <h3>{blob.tooLarge ? "File is too large to preview" : "Binary file"}</h3>
        <p>{blob.bytes.toLocaleString()} bytes · Download the source ZIP to use this file.</p>
      </div>
    );
  const lines = (blob.text ?? "").split("\n");
  return (
    <section className="code-source" aria-label="Source file">
      <div className="code-line-numbers" aria-hidden="true">
        <pre>{lines.map((_, i) => String(i + 1)).join("\n")}</pre>
      </div>
      <pre>
        <code>{blob.text}</code>
      </pre>
    </section>
  );
}
export function CodePage(props: {
  api: ControlCenterApi;
  workspaceId: string;
  userId: string;
  scopeName: string;
  navigate: (url: string) => void;
}) {
  const { api, workspaceId, userId, scopeName } = props;
  const [location, setLocation] = useState<Location>(() =>
    typeof window === "undefined" ? emptyLocation : codeLocation(window.location.search),
  );
  const [mode, setMode] = useState<"code" | "folders">("code"),
    [tab, setTab] = useState<"files" | "history">("files");
  const [catalog, setCatalog] = useState<CodeCatalog | null>(null),
    [tree, setTree] = useState<CodeTree | null>(null),
    [blob, setBlob] = useState<CodeBlob | null>(null),
    [branches, setBranches] = useState<CodeTree["branches"]>([]),
    [history, setHistory] = useState<CodeHistory | null>(null);
  const [loading, setLoading] = useState(true),
    [reading, setReading] = useState(Boolean(location.repository)),
    [error, setError] = useState(""),
    [readError, setReadError] = useState(""),
    [reload, setReload] = useState(0),
    [page, setPage] = useState(0),
    [filter, setFilter] = useState("");
  const [access, setAccess] = useState<CodeAccess | null>(null),
    [accessOpen, setAccessOpen] = useState(false),
    [accessError, setAccessError] = useState(""),
    [accessBusy, setAccessBusy] = useState(false),
    [userSearch, setUserSearch] = useState("");
  const selected = catalog?.repositories.find((r) => r.id === location.repository);
  const move = (next: Location) => {
    if (next.repository !== location.repository) {
      setBranches([]);
      setAccessOpen(false);
      setAccess(null);
    }
    const p = new URLSearchParams();
    if (next.repository) p.set("repository", next.repository);
    if (next.branch) p.set("branch", next.branch);
    if (next.path) p.set("path", next.path);
    if (next.file) p.set("file", "1");
    if (typeof window !== "undefined")
      window.history.pushState({}, "", window.location.pathname + (p.size ? "?" + p : ""));
    setLocation(next);
    setPage(0);
    setFilter("");
    setTab("files");
    setReadError("");
    setBlob(null);
    setHistory(null);
    setTree(null);
  };
  useEffect(() => {
    const pop = () => {
      setLocation(codeLocation(window.location.search));
      setPage(0);
      setTab("files");
      setTree(null);
      setBlob(null);
      setHistory(null);
      setAccessOpen(false);
      setAccess(null);
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload explicitly refreshes authorized server state.
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setError("");
    void (api.codeCatalog ? api.codeCatalog(workspaceId, abort.signal) : Promise.reject())
      .then((value) => {
        if (!abort.signal.aborted) setCatalog(value);
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setError(
            "Repositories could not be loaded. Check your session and connection, then Retry.",
          );
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [api, workspaceId, reload]);
  const repo = selected?.id ?? "",
    branch = location.branch || selected?.defaultBranch || "",
    path = location.path,
    file = location.file,
    empty = selected?.status === "empty";
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload explicitly refreshes the current source snapshot.
  useEffect(() => {
    if (!repo || !branch) return;
    if (empty) {
      setReading(false);
      setReadError("");
      return;
    }
    const abort = new AbortController();
    setReading(true);
    setReadError("");
    const query = { branch, path, page: String(page) };
    if (file || tab === "history")
      void api
        .codeTree?.(workspaceId, repo, { branch }, abort.signal)
        .then((value) => {
          if (!abort.signal.aborted) setBranches(value.branches);
        })
        .catch(() => {});
    const work =
      tab === "history"
        ? api.codeHistory?.(workspaceId, repo, query, abort.signal)
        : file
          ? api.codeBlob?.(workspaceId, repo, query, abort.signal)
          : api.codeTree?.(workspaceId, repo, query, abort.signal);
    void Promise.resolve(work ?? Promise.reject())
      .then((value) => {
        if (abort.signal.aborted) return;
        if (tab === "history") setHistory(value as CodeHistory);
        else if (file) setBlob(value as CodeBlob);
        else {
          setTree(value as CodeTree);
          setBranches((value as CodeTree).branches);
        }
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setReadError(
            "Source could not be loaded. The branch may have changed or your access may have been removed. Refresh to check again.",
          );
      })
      .finally(() => {
        if (!abort.signal.aborted) setReading(false);
      });
    return () => abort.abort();
  }, [api, workspaceId, repo, branch, path, file, page, tab, empty, reload]);
  useEffect(() => {
    if (!accessOpen || !repo) return;
    const abort = new AbortController();
    setAccess(null);
    setAccessError("");
    void (api.codeAccess ? api.codeAccess(workspaceId, repo, abort.signal) : Promise.reject())
      .then((value) => {
        if (!abort.signal.aborted) setAccess(value);
      })
      .catch(() => {
        if (!abort.signal.aborted) setAccessError("Access information could not be loaded.");
      });
    return () => abort.abort();
  }, [api, workspaceId, repo, accessOpen]);
  async function share(target: CodeAccess["users"][number]["userId"], allow: boolean) {
    if (!access || !api.shareCode) return;
    setAccessBusy(true);
    setAccessError("");
    try {
      setAccess(
        await api.shareCode(workspaceId, repo, {
          version: 1,
          expectedRevision: access.revision,
          userId: target,
          allow,
        }),
      );
    } catch {
      setAccessError(
        "Access was not confirmed. Close and reopen this panel to check current permissions before retrying.",
      );
    } finally {
      setAccessBusy(false);
    }
  }
  if (mode === "folders")
    return (
      <div className="code-legacy">
        <button type="button" className="button secondary" onClick={() => setMode("code")}>
          <ArrowLeft size={15} /> All repositories
        </button>
        <RepositoryCenterPage {...props} />
      </div>
    );
  const commonActions = (
    <>
      <button type="button" className="button secondary" onClick={() => setMode("folders")}>
        <GitBranch size={15} /> Connect & push
      </button>
      <button
        type="button"
        className="button secondary"
        disabled={loading || reading}
        onClick={() => setReload((n) => n + 1)}
      >
        <RefreshCw size={15} /> Refresh
      </button>
    </>
  );
  if (!location.repository)
    return (
      <RecordWorkspace<CodeRepository>
        title="Code"
        breadcrumb="Workspace / Code"
        scopeName={scopeName}
        userId={userId}
        workspaceId={workspaceId}
        page="code-repositories"
        noun="repositories"
        defaultView="table"
        pageSize={30}
        records={catalog?.repositories ?? []}
        identify={(r) => r.id}
        statusOf={(r) => r.role}
        statuses={[
          { id: "owner", label: "Owned by you" },
          { id: "maintainer", label: "Maintainer" },
          { id: "developer", label: "Developer" },
          { id: "reader", label: "Shared with you" },
          { id: "administrator", label: "Administrator" },
        ]}
        columns={[
          {
            id: "name",
            label: "Repository",
            value: (r) => r.name,
            render: (r) => (
              <button
                className="code-repo-name"
                type="button"
                onClick={() =>
                  move({ repository: r.id, branch: r.defaultBranch, path: "", file: false })
                }
              >
                <BookMarked size={17} />
                {r.name}
                <RecordBadge>Private</RecordBadge>
              </button>
            ),
          },
          { id: "role", label: "Your access", value: (r) => r.role },
          { id: "branch", label: "Default branch", value: (r) => r.defaultBranch },
          {
            id: "updated",
            label: "Latest commit",
            value: (r) =>
              r.head?.subject ??
              (r.status === "empty" ? "No code pushed yet" : "Source unavailable"),
            render: (r) => (
              <>
                <span>
                  {r.head?.subject ??
                    (r.status === "empty" ? "No code pushed yet" : "Source unavailable")}
                </span>
                {r.head ? (
                  <small className="record-muted code-commit-subline">
                    {r.head.sha.slice(0, 7)} · {new Date(r.head.at).toLocaleString()}
                  </small>
                ) : null}
              </>
            ),
          },
        ]}
        renderCard={(r) => (
          <>
            <button
              type="button"
              className="code-repo-name"
              onClick={() =>
                move({ repository: r.id, branch: r.defaultBranch, path: "", file: false })
              }
            >
              <BookMarked size={19} />
              {r.name}
            </button>
            <div className="code-repo-facts">
              <RecordBadge>Private</RecordBadge>
              <RecordBadge>{r.role}</RecordBadge>
              <span>
                <GitBranch size={13} /> {r.defaultBranch}
              </span>
            </div>
            <p>{r.head?.subject ?? "No published commit available"}</p>
            <button
              className="button secondary"
              type="button"
              onClick={() =>
                move({ repository: r.id, branch: r.defaultBranch, path: "", file: false })
              }
            >
              Open repository
            </button>
          </>
        )}
        renderActions={(r) => (
          <button
            type="button"
            className="button secondary"
            onClick={() =>
              move({ repository: r.id, branch: r.defaultBranch, path: "", file: false })
            }
          >
            Open
          </button>
        )}
        actions={commonActions}
        loading={loading}
        error={error}
        onRetry={() => setReload((n) => n + 1)}
        notice={
          catalog?.administrator ? "Administrator · All registered workspace repositories" : ""
        }
        emptyTitle="No repositories yet"
        emptyDescription="Repositories you own or can access appear here. Connect a folder to publish code, or ask an administrator for access."
      />
    );
  const head =
    (file ? blob?.head : tree?.head) ??
    (branch === selected?.defaultBranch ? selected?.head?.sha : undefined);
  const zip =
    selected?.status === "ready" && !reading && !readError && api.codeArchiveUrl
      ? api.codeArchiveUrl(workspaceId, repo, { branch, ...(head ? { head } : {}) })
      : null;
  const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  const crumbs = path.split("/").filter(Boolean);
  return (
    <section className="code-page" aria-label="Repository browser">
      <header className="code-page-header">
        <div className="record-breadcrumb">
          <button type="button" onClick={() => move(emptyLocation)}>
            Code / Repositories
          </button>
          <span className="record-scope">{scopeName}</span>
        </div>
        <div className="code-heading">
          <BookMarked size={23} />
          <h1>{selected?.name ?? "Repository"}</h1>
          <RecordBadge>Private</RecordBadge>
          <div className="code-heading-actions">
            {selected?.canManageAccess ? (
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  setUserSearch("");
                  setAccessOpen(true);
                }}
              >
                <Users size={15} /> Manage access
              </button>
            ) : null}
            {commonActions}
          </div>
        </div>
        <nav className="code-tabs" aria-label="Repository sections">
          <button
            type="button"
            aria-current={tab === "files" ? "page" : undefined}
            onClick={() => {
              setTab("files");
              setPage(0);
            }}
          >
            <Code2 size={16} /> Code
          </button>
          <button
            type="button"
            aria-current={tab === "history" ? "page" : undefined}
            onClick={() => {
              setTab("history");
              setPage(0);
            }}
          >
            <History size={16} /> Commits
          </button>
          {selected?.provider === "hosted" ? (
            <button type="button" onClick={() => setMode("folders")}>
              <GitBranch size={16} /> Branches & pull requests
            </button>
          ) : null}
        </nav>
      </header>
      {error || (!loading && !selected) ? (
        <div className="code-empty" role="alert">
          <LockKeyhole />
          <h2>Repository unavailable</h2>
          <p>{error || "This repository is not available for your account."}</p>
          <button className="button secondary" type="button" onClick={() => move(emptyLocation)}>
            All repositories
          </button>
        </div>
      ) : (
        <>
          <div className="code-toolbar">
            <label className="code-branch">
              <GitBranch size={16} />
              <span className="sr-only">Branch</span>
              <select
                aria-label="Branch"
                value={branch}
                onChange={(e) =>
                  move({ ...location, branch: e.target.value, path: "", file: false })
                }
              >
                {(branches.length ? branches : [{ name: branch, sha: "" }]).map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <span className="record-muted">
              {selected?.provider === "central" ? "Published on DevSetu" : "Hosted repository"}
            </span>
            <div className="code-toolbar-right">
              {zip ? (
                <a className="button primary" href={zip} download>
                  <Download size={15} /> Download ZIP
                </a>
              ) : null}
            </div>
          </div>
          <div className="code-content-grid">
            <aside className="code-file-sidebar" aria-label="Repository navigation">
              <strong>
                <Folder size={15} /> Files
              </strong>
              <button
                type="button"
                className="code-sidebar-root"
                onClick={() => move({ ...location, path: "", file: false })}
              >
                {selected?.name}
              </button>
              {crumbs.map((part, i) => (
                <button
                  type="button"
                  key={crumbs.slice(0, i + 1).join("/")}
                  style={{ paddingInlineStart: 14 + i * 10 }}
                  onClick={() =>
                    move({
                      ...location,
                      path: crumbs.slice(0, i + 1).join("/"),
                      file: file && i === crumbs.length - 1,
                    })
                  }
                >
                  {file && i === crumbs.length - 1 ? <FileCode2 size={14} /> : <Folder size={14} />}{" "}
                  {part}
                </button>
              ))}
              <div className="code-about">
                <h3>About</h3>
                <p>Private source repository</p>
                <p>
                  <LockKeyhole size={13} /> {selected?.role ?? "Checking access"}
                </p>
                <p>
                  <GitBranch size={13} /> {branch}
                </p>
              </div>
            </aside>
            <div className="code-content">
              <div className="code-crumbs">
                <button type="button" onClick={() => move({ ...location, path: "", file: false })}>
                  {selected?.name}
                </button>
                {crumbs.map((part, i) => (
                  <span key={crumbs.slice(0, i + 1).join("/")}>
                    {" "}
                    /{" "}
                    <button
                      type="button"
                      onClick={() =>
                        move({
                          ...location,
                          path: crumbs.slice(0, i + 1).join("/"),
                          file: file && i === crumbs.length - 1,
                        })
                      }
                    >
                      {part}
                    </button>
                  </span>
                ))}
              </div>
              {reading ? (
                <div className="code-empty" role="status">
                  Loading committed source…
                </div>
              ) : readError ? (
                <div className="code-empty" role="alert">
                  <h3>Source unavailable</h3>
                  <p>{readError}</p>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => setReload((n) => n + 1)}
                  >
                    Retry
                  </button>
                </div>
              ) : tab === "history" && history ? (
                <>
                  <div className="code-commits">
                    {history.commits.map((c) => (
                      <article key={c.sha}>
                        <GitCommitHorizontal size={18} />
                        <div>
                          <strong>{c.subject}</strong>
                          <p>
                            {c.author} · {new Date(c.at).toLocaleString()}
                          </p>
                        </div>
                        <code>{c.sha.slice(0, 12)}</code>
                      </article>
                    ))}
                    {!history.commits.length ? <p>No commits for this path.</p> : null}
                  </div>
                  <div className="code-pagination">
                    <button
                      type="button"
                      className="button secondary"
                      disabled={!page}
                      onClick={() => setPage((n) => n - 1)}
                    >
                      Previous
                    </button>
                    <span>Page {page + 1}</span>
                    <button
                      type="button"
                      className="button secondary"
                      disabled={!history.hasMore}
                      onClick={() => setPage((n) => n + 1)}
                    >
                      Next
                    </button>
                  </div>
                </>
              ) : file && blob ? (
                <div className="code-file-panel">
                  <header>
                    <FileCode2 size={15} />
                    <strong>{crumbs.at(-1)}</strong>
                    <span>{blob.bytes.toLocaleString()} bytes</span>
                    <code>{blob.sha.slice(0, 12)}</code>
                  </header>
                  <SourceFile blob={blob} />
                </div>
              ) : tree ? (
                <>
                  <div className="code-commit-banner">
                    <GitCommitHorizontal size={17} />
                    <strong>{tree.latest?.subject ?? "Published source"}</strong>
                    <span>{tree.latest?.author}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setTab("history");
                        setPage(0);
                      }}
                    >
                      {tree.head.slice(0, 7)} · History
                    </button>
                  </div>
                  <label className="code-filter">
                    <Search size={15} />
                    <input
                      aria-label="Filter files on this page"
                      placeholder="Filter files on this page…"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    />
                  </label>
                  <table className="code-file-list" aria-label="Repository files">
                    <thead>
                      <tr className="code-file-row code-file-columns">
                        <th scope="col">Name</th>
                        <th scope="col">Type</th>
                        <th scope="col">Size</th>
                      </tr>
                    </thead>
                    <tbody>
                      {path ? (
                        <tr className="code-file-row">
                          <td>
                            <button
                              type="button"
                              onClick={() => move({ ...location, path: parent, file: false })}
                            >
                              <Folder size={16} /> ..
                            </button>
                          </td>
                          <td />
                          <td />
                        </tr>
                      ) : null}
                      {tree.entries
                        .filter((e) =>
                          e.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase()),
                        )
                        .map((e) => (
                          <tr className="code-file-row" key={e.path}>
                            <td>
                              <button
                                type="button"
                                disabled={e.protected || !["file", "directory"].includes(e.kind)}
                                onClick={() =>
                                  move({ ...location, path: e.path, file: e.kind === "file" })
                                }
                              >
                                {e.kind === "directory" ? (
                                  <Folder size={17} />
                                ) : (
                                  <FileCode2 size={17} />
                                )}{" "}
                                {e.name}
                                {e.protected ? <LockKeyhole size={12} /> : null}
                              </button>
                            </td>
                            <td>{e.protected ? "Protected" : e.kind}</td>
                            <td>
                              {e.bytes === null
                                ? "—"
                                : e.bytes < 1024
                                  ? e.bytes + " B"
                                  : (e.bytes / 1024).toFixed(1) + " KB"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  <div className="code-pagination">
                    <span>{tree.total.toLocaleString()} items</span>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={!page}
                      onClick={() => setPage((n) => n - 1)}
                    >
                      Previous
                    </button>
                    <span>
                      {page + 1} / {Math.max(1, Math.ceil(tree.total / 100))}
                    </span>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={(page + 1) * 100 >= tree.total}
                      onClick={() => setPage((n) => n + 1)}
                    >
                      Next
                    </button>
                  </div>
                  {tree.readme ? (
                    <article className="code-readme">
                      <header>
                        <BookMarked size={16} /> {tree.readme.path}
                      </header>
                      <Readme text={tree.readme.text} />
                    </article>
                  ) : null}
                </>
              ) : !reading ? (
                <div className="code-empty">
                  <Folder size={30} />
                  <h3>{empty ? "No code pushed yet" : "No published source available"}</h3>
                  <p>Push code from your connected folder to populate this repository.</p>
                </div>
              ) : null}
            </div>
          </div>
          <footer className="code-footer">
            <SmallIcon>
              <LockKeyhole size={12} />
            </SmallIcon>{" "}
            Only committed source is shown. Environment, key files and configured protected data are
            excluded from previews and ZIPs.
          </footer>
        </>
      )}
      {accessOpen ? (
        <WorkspaceDialog
          label="Repository access"
          onClose={() => !accessBusy && setAccessOpen(false)}
        >
          <section className="code-access">
            <header>
              <div>
                <h2>Manage access</h2>
                <p>{selected?.name}</p>
              </div>
              <button
                className="button secondary"
                type="button"
                disabled={accessBusy}
                onClick={() => setAccessOpen(false)}
              >
                Done
              </button>
            </header>
            <p>
              Give a workspace member read and download access to this repository. Deployment rights
              stay separate.
            </p>
            <input
              aria-label="Find workspace member"
              placeholder="Find a member…"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
            />
            {accessError ? <p role="alert">{accessError}</p> : null}
            <div className="code-access-list">
              {access ? (
                access.users
                  .filter((u) =>
                    `${u.name} ${u.userId}`.toLowerCase().includes(userSearch.toLowerCase()),
                  )
                  .map((u) => (
                    <div className="code-access-user" key={u.userId}>
                      <div>
                        <strong>{u.name}</strong>
                        <small>
                          {u.inherited
                            ? "Inherited owner, administrator or provider access"
                            : u.requiresAccountLink
                              ? "Link this member's Git account first"
                              : u.access
                                ? "Can read and download"
                                : "No access"}
                        </small>
                      </div>
                      {u.inherited ? (
                        <RecordBadge>Inherited</RecordBadge>
                      ) : (
                        <button
                          className={`button ${u.access ? "secondary" : "primary"}`}
                          type="button"
                          disabled={accessBusy || Boolean(accessError) || u.requiresAccountLink}
                          onClick={() => void share(u.userId, !u.access)}
                        >
                          {u.access ? "Remove access" : "Give access"}
                        </button>
                      )}
                    </div>
                  ))
              ) : (
                <p role="status">Loading members…</p>
              )}
            </div>
          </section>
        </WorkspaceDialog>
      ) : null}
    </section>
  );
}
