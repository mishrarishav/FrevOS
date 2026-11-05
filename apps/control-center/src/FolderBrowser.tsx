import type {
  ContentPreviewJob,
  DiscoveryState,
  FolderBrowseInput,
  FolderBrowseJob,
} from "@frevos/contracts";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  File,
  FileArchive,
  FilePlus,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Monitor,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ControlCenterApi } from "./api.js";
import { WorkspaceDialog } from "./WorkspaceDialog.js";
import "./FolderBrowser.css";

export interface FolderChoice {
  deviceId: string;
  root: string;
  path: string;
  absolutePath: string;
  requestId: string;
}
type Entry = NonNullable<FolderBrowseJob["result"]>["entries"][number];
type Location = { root: string; path: string };
export function explorerError(error: unknown, creating = false): string {
  const code = error instanceof Error ? error.message : "";
  if (code.includes("folder-permission-denied"))
    return creating
      ? "Windows/Linux denied writing in this folder for the connector's signed-in user. Choose a writable personal or project folder, such as your own Documents. A system folder like C:\\Users is not writable for ordinary users. No file was created."
      : "The connector's signed-in user cannot read this folder. Choose a folder that this user can access on the connected computer.";
  if (code.includes("folder-already-exists"))
    return "An item with this name already exists. Choose another name; existing files are never overwritten.";
  if (code.includes("folder-scope-denied"))
    return "This path is protected, linked, or outside the selected drive. Choose an ordinary accessible folder and a valid new name.";
  return code
    ? code.replaceAll("-", " ")
    : "Could not read this folder. Check the connection and refresh.";
}
export function explorerLocation(value: string, roots: string[]): Location | null {
  if (!value || /^[\\/]{2}/.test(value) || [...value].some((c) => c.charCodeAt(0) < 32))
    return null;
  const windows = /^[A-Za-z]:[\\/]/.test(value);
  if (!windows && !value.startsWith("/")) return null;
  const input = (windows ? value.replaceAll("\\", "/") : value).replace(/\/$/, "");
  for (const root of [...roots].sort((a, b) => b.length - a.length)) {
    const winRoot = /^[A-Za-z]:[\\/]/.test(root);
    if (windows !== winRoot) continue;
    const prefix = (windows ? root.replaceAll("\\", "/") : root).replace(/\/$/, "");
    const left = windows ? input.toLowerCase() : input,
      right = windows ? prefix.toLowerCase() : prefix;
    if (left !== right && !left.startsWith(right + "/")) continue;
    const relative = input.slice(prefix.length).replace(/^\//, "");
    if (
      relative &&
      relative
        .split("/")
        .some((part) => !part || part === "." || part === ".." || /[\\:]/.test(part))
    )
      return null;
    return { root, path: relative };
  }
  return null;
}
export const folderEntryType = (entry: Entry) => {
  if (!entry.kind || entry.kind === "directory") return "Folder";
  if (entry.kind === "link") return "Link · protected";
  const extension = entry.name.includes(".") ? entry.name.split(".").at(-1)?.toUpperCase() : "";
  return extension === "ZIP" ? "ZIP archive" : extension ? `${extension} file` : "File";
};
export function FileExplorerEntries({
  entries,
  selected,
  busy,
  onOpen,
  onSelect,
}: {
  entries: Entry[];
  selected: string;
  busy: boolean;
  onOpen: (path: string) => void;
  onSelect: (path: string) => void;
}) {
  return (
    <table className="explorer-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Date modified</th>
          <th>Type</th>
          <th>Size</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={entry.path} className={selected === entry.path ? "is-selected" : ""}>
            <td>
              <button
                type="button"
                disabled={busy || entry.excluded}
                title={entry.excluded ? "Protected entry" : entry.name}
                onClick={() => onSelect(entry.path)}
                onDoubleClick={() => {
                  if (!entry.kind || entry.kind === "directory") onOpen(entry.path);
                }}
              >
                {!entry.kind || entry.kind === "directory" ? (
                  <FolderOpen size={18} className="explorer-folder-icon" />
                ) : /\.(?:zip|gz|7z|rar|tar)$/i.test(entry.name) ? (
                  <FileArchive size={18} />
                ) : (
                  <File size={18} />
                )}
                <span>{entry.name}</span>
                {entry.excluded ? <small>Protected</small> : null}
              </button>
            </td>
            <td>{entry.modifiedAt ? new Date(entry.modifiedAt).toLocaleString() : "—"}</td>
            <td>{folderEntryType(entry)}</td>
            <td>
              {entry.size === undefined
                ? "—"
                : entry.size === 0
                  ? "0 B"
                  : entry.size < 1024
                    ? `${entry.size} B`
                    : `${(entry.size / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KB`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
export function FolderBrowser({
  api,
  workspaceId,
  deviceId,
  onClose,
  onChoose,
  label = "Choose folder",
  projectOnly = false,
  allowDriveRoot = true,
}: {
  api: ControlCenterApi;
  workspaceId: string;
  deviceId: string;
  onClose: () => void;
  onChoose?: ((choice: FolderChoice) => void) | undefined;
  label?: string;
  projectOnly?: boolean;
  allowDriveRoot?: boolean;
}) {
  const [system, setSystem] = useState<DiscoveryState["systems"][number] | null>(null),
    [location, setLocation] = useState<Location>({ root: "", path: "" }),
    [history, setHistory] = useState<Location[]>([]),
    [cursor, setCursor] = useState(-1),
    [job, setJob] = useState<FolderBrowseJob | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0),
    [selected, setSelected] = useState(""),
    [query, setQuery] = useState(""),
    [creation, setCreation] = useState<"file" | "directory" | null>(null),
    [newName, setNewName] = useState(""),
    [notice, setNotice] = useState(""),
    [address, setAddress] = useState(""),
    [content, setContent] = useState<ContentPreviewJob | null>(null),
    [contentBusy, setContentBusy] = useState(false);
  const mounted = useRef(true),
    requests = useRef(new Set<AbortController>());
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const request of requests.current) request.abort();
    };
  }, []);
  const { root, path: folder } = location;
  const explorer = system?.observation?.fileExplorer?.version === 1;
  const absolute = root
    ? root.replace(/[\\/]$/, "") +
      (root.includes("\\") ? "\\" : "/") +
      folder.split("/").join(root.includes("\\") ? "\\" : "/")
    : "";
  useEffect(() => setAddress(absolute), [absolute]);
  function navigate(next: Location) {
    const trail = [...history.slice(0, cursor + 1), next];
    setHistory(trail);
    setCursor(trail.length - 1);
    setLocation(next);
    setJob(null);
    setSelected("");
    setQuery("");
    setNotice("");
  }
  useEffect(() => {
    const abort = new AbortController();
    void api
      .discoveryState?.(workspaceId, abort.signal)
      .then((state) => {
        if (abort.signal.aborted) return;
        const s = state.systems.find((s) => s.deviceId === deviceId);
        if (!s?.online || (projectOnly && (!s.sourceFresh || !s.source))) throw Error();
        const initialRoot = projectOnly
          ? s.source?.repository
          : (s.observation?.system.disks[0]?.root ?? s.source?.repository);
        if (!initialRoot) throw Error();
        const start = { root: initialRoot, path: "" };
        setSystem(s);
        setLocation(start);
        setHistory([start]);
        setCursor(0);
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setError(
            "This system is offline or has no verified readable drives. Reconnect it before browsing.",
          );
      });
    return () => abort.abort();
  }, [api, workspaceId, deviceId, projectOnly]);
  async function execute(input: FolderBrowseInput, signal?: AbortSignal) {
    const abort = new AbortController();
    requests.current.add(abort);
    const activeSignal = signal ?? abort.signal;
    try {
      if (activeSignal.aborted) throw Error("Request cancelled");
      if (!api.browseFolders || !api.folderBrowseResult) throw Error("Folder browser unavailable");
      let current = await api.browseFolders(workspaceId, input);
      for (let i = 0; i < 100 && ["queued", "working"].includes(current.status); i++) {
        await new Promise((r) => setTimeout(r, 1000));
        if (activeSignal.aborted) throw Error("Request cancelled");
        current = await api.folderBrowseResult(workspaceId, current.requestId, activeSignal);
      }
      if (current.status !== "succeeded" || !current.result)
        throw Error(current.errorCode ?? "folder-request-expired");
      if (activeSignal.aborted) throw Error("Request cancelled");
      return current;
    } finally {
      requests.current.delete(abort);
    }
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload requests a fresh directory listing; execute uses these exact props.
  useEffect(() => {
    if (!root) return;
    const abort = new AbortController();
    setBusy(true);
    setError("");
    setJob(null);
    setSelected("");
    void execute(
      {
        version: 1,
        deviceId,
        root,
        path: folder,
        page: 0,
        ...(explorer ? { includeFiles: true } : {}),
      },
      abort.signal,
    )
      .then((result) => {
        if (!abort.signal.aborted) setJob(result);
      })
      .catch((e: unknown) => {
        if (!abort.signal.aborted) setError(explorerError(e));
      })
      .finally(() => {
        if (!abort.signal.aborted) setBusy(false);
      });
    return () => abort.abort();
  }, [api, workspaceId, deviceId, root, folder, explorer, reload]);
  async function more() {
    if (!job?.result?.nextPage || busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await execute({
        version: 1,
        deviceId,
        root,
        path: folder,
        page: job.result.nextPage,
        fingerprint: job.result.fingerprint,
        ...(explorer ? { includeFiles: true } : {}),
      });
      if (!next.result) throw Error("Folder listing unavailable");
      if (!mounted.current) return;
      setJob({
        ...next,
        result: { ...next.result, entries: [...job.result.entries, ...next.result.entries] },
      });
    } catch {
      if (mounted.current)
        setError("Folder changed or the next page is unavailable. Refresh this folder.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function create() {
    if (!creation || busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await execute({
        version: 1,
        deviceId,
        root,
        path: folder,
        page: 0,
        includeFiles: true,
        create: { kind: creation, name: newName },
      });
      if (!mounted.current) return;
      setJob(next);
      setSelected(next.result?.created?.path ?? "");
      setCreation(null);
      setNewName("");
      if (creation === "directory" && next.result?.created)
        navigate({ root, path: next.result.created.path });
      setNotice(
        `${creation === "directory" ? "Folder" : "Empty file"} created on ${system?.observation?.system.systemName ?? "the connected system"}.`,
      );
    } catch (e) {
      if (mounted.current) setError(explorerError(e, true));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  const roots = system
    ? [
        ...new Set([
          ...(projectOnly ? [] : (system.observation?.system.disks.map((d) => d.root) ?? [])),
          ...(system.source ? [system.source.repository] : []),
        ]),
      ]
    : [];
  const picked = job?.result?.entries.find((entry) => entry.path === selected);
  async function requestContent() {
    if (!picked || !api.requestContent || !api.contentPreview || contentBusy) return;
    const abort = new AbortController();
    requests.current.add(abort);
    setContentBusy(true);
    setError("");
    try {
      let current = await api.requestContent(workspaceId, {
        version: 1,
        deviceId,
        root,
        path: picked.path,
      });
      if (mounted.current) setContent(current);
      for (let i = 0; i < 600 && ["queued", "working"].includes(current.status); i++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        if (abort.signal.aborted) return;
        current = await api.contentPreview(workspaceId, current.requestId, abort.signal);
        if (mounted.current) setContent(current);
      }
    } catch (error) {
      if (mounted.current)
        setError(
          error instanceof Error
            ? error.message.replaceAll("-", " ")
            : "File content request unavailable.",
        );
    } finally {
      requests.current.delete(abort);
      if (mounted.current) setContentBusy(false);
    }
  }
  const chosenPath =
    picked && (!picked.kind || picked.kind === "directory") && !picked.excluded
      ? picked.path
      : folder;
  const chosenAbsolute = root
    ? root.replace(/[\\/]$/, "") +
      (root.includes("\\") ? "\\" : "/") +
      chosenPath.split("/").join(root.includes("\\") ? "\\" : "/")
    : "";
  return (
    <WorkspaceDialog label="Files and folders" onClose={onClose}>
      <section className="project-editor discovery-editor folder-browser file-explorer">
        <header className="explorer-heading">
          <div>
            <Monitor size={22} />
            <div>
              <h2>
                {system?.observation?.system.systemName ?? system?.name ?? "Connected system"}
              </h2>
              <small>Files and folders · live from this computer</small>
            </div>
          </div>
          <button
            className="button ghost"
            type="button"
            aria-label="Close folder browser"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        <div className="explorer-commandbar">
          <button
            type="button"
            className="button secondary"
            disabled={busy || !explorer || !job?.result}
            onClick={() => {
              setCreation("directory");
              setNewName("");
            }}
          >
            <FolderPlus size={16} />
            New folder
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={busy || !explorer || !job?.result}
            onClick={() => {
              setCreation("file");
              setNewName("");
            }}
          >
            <FilePlus size={16} />
            New file
          </button>
          {picked && (!picked.kind || picked.kind === "directory") ? (
            <button
              type="button"
              className="button secondary"
              disabled={busy || picked.excluded}
              onClick={() => navigate({ root, path: picked.path })}
            >
              <FolderOpen size={16} />
              Open folder
            </button>
          ) : null}
          {onChoose ? (
            <button
              type="button"
              className="button primary explorer-choose"
              disabled={
                busy ||
                !job?.result ||
                (!allowDriveRoot && !chosenPath && (root === "/" || /^[A-Za-z]:[\\/]?$/.test(root)))
              }
              onClick={() => {
                if (job?.result)
                  onChoose({
                    deviceId,
                    root,
                    path: chosenPath,
                    absolutePath: chosenAbsolute,
                    requestId: job.requestId,
                  });
              }}
            >
              {label}
            </button>
          ) : null}
          {picked?.kind === "file" ? (
            <button
              type="button"
              className="button secondary"
              disabled={
                busy ||
                contentBusy ||
                picked.excluded ||
                (picked.size ?? 0) > 8192 ||
                /\.(?:zip|7z|rar|gz|tar|exe|dll|pdf|png|jpe?g|gif)$/i.test(picked.name) ||
                !api.requestContent
              }
              onClick={() => void requestContent()}
            >
              Request file content
            </button>
          ) : null}
        </div>
        <div className="explorer-addressbar">
          <div className="explorer-navigation">
            <button
              type="button"
              aria-label="Back"
              disabled={busy || cursor <= 0}
              onClick={() => {
                const previous = history[cursor - 1];
                if (previous) {
                  setCursor(cursor - 1);
                  setLocation(previous);
                  setJob(null);
                  setSelected("");
                }
              }}
            >
              <ArrowLeft size={17} />
            </button>
            <button
              type="button"
              aria-label="Forward"
              disabled={busy || cursor >= history.length - 1}
              onClick={() => {
                const next = history[cursor + 1];
                if (next) {
                  setCursor(cursor + 1);
                  setLocation(next);
                  setJob(null);
                  setSelected("");
                }
              }}
            >
              <ArrowRight size={17} />
            </button>
            <button
              type="button"
              aria-label="Up one folder"
              disabled={busy || !folder}
              onClick={() => navigate({ root, path: folder.split("/").slice(0, -1).join("/") })}
            >
              <ArrowUp size={17} />
            </button>
            <button
              type="button"
              aria-label="Refresh folder"
              disabled={busy || !root}
              onClick={() => setReload((n) => n + 1)}
            >
              <RefreshCw size={17} />
            </button>
          </div>
          <form
            className="explorer-location"
            onSubmit={(event) => {
              event.preventDefault();
              const next = explorerLocation(address, roots);
              if (next) navigate(next);
              else
                setError(
                  "Enter a path inside a listed drive or project folder, without traversal or network shares.",
                );
            }}
          >
            <input
              className="explorer-address"
              aria-label="Location"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              disabled={busy || !root}
              placeholder="Choose a drive or enter a local path"
            />
            <button type="submit" className="button secondary" disabled={busy || !root}>
              Go
            </button>
          </form>
          <label className="explorer-search">
            <Search size={16} />
            <input
              aria-label="Search loaded items"
              placeholder="Search loaded items"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        {content ? (
          <section className="explorer-content" aria-label="Requested file content">
            <header>
              <strong>
                {content.request.root} · {content.request.path}
              </strong>
              <button
                type="button"
                className="button ghost"
                disabled={contentBusy}
                onClick={() => setContent(null)}
                aria-label="Close file content"
              >
                <X size={16} />
              </button>
            </header>
            {content.status === "queued" || content.status === "working" ? (
              <p role="status">
                Waiting for approval on the connected computer. Only this selected file can be read
                once.
              </p>
            ) : null}
            {content.status === "succeeded" && content.result ? (
              <>
                <small>
                  Masked UTF-8 snapshot · up to 8 KiB ·{" "}
                  {new Date(content.result.observedAt).toLocaleString()}
                </small>
                {content.result.before !== undefined ? (
                  <details>
                    <summary>Earlier approved snapshot</summary>
                    <pre>{content.result.before}</pre>
                  </details>
                ) : null}
                <pre>{content.result.after}</pre>
              </>
            ) : null}
            {["declined", "failed", "expired"].includes(content.status) ? (
              <p role="status">
                {content.errorCode?.replaceAll("-", " ") ?? "Content request expired"}. No file was
                changed.
              </p>
            ) : null}
          </section>
        ) : null}
        {creation ? (
          <form
            className="explorer-create"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <label>
              {creation === "file" ? "New empty file name" : "New folder name"}
              <input
                required
                maxLength={255}
                value={newName}
                disabled={busy}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={creation === "file" ? "notes.txt" : "New folder"}
              />
            </label>
            <button type="submit" className="button primary" disabled={busy || !newName.trim()}>
              Create
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => setCreation(null)}
            >
              Cancel
            </button>
            <small>
              Creates a new item here. Existing files and folders are never overwritten.
            </small>
          </form>
        ) : null}
        {!explorer && system ? (
          <p className="explorer-message">
            This connector supports folders only. Update this computer’s connector to see files, ZIP
            archives and create new items. Existing pairing stays unchanged.
          </p>
        ) : null}
        {error ? (
          <p className="explorer-message" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="explorer-message" role="status">
            {notice}
          </p>
        ) : null}
        <div className="explorer-body">
          <nav className="explorer-drives" aria-label="Computer drives">
            <strong>
              <Monitor size={16} />
              This computer
            </strong>
            {roots.map((r) => (
              <button
                key={r}
                type="button"
                disabled={busy}
                className={r === root ? "is-active" : ""}
                onClick={() => navigate({ root: r, path: "" })}
              >
                <HardDrive size={17} />
                <span>{r}</span>
              </button>
            ))}
          </nav>
          <div className="explorer-files">
            {busy ? (
              <p className="explorer-message" role="status">
                Reading this computer…
              </p>
            ) : null}
            <FileExplorerEntries
              entries={(job?.result?.entries ?? []).filter((entry) =>
                entry.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
              )}
              busy={busy}
              selected={selected}
              onSelect={setSelected}
              onOpen={(path) => navigate({ root, path })}
            />
            {job?.result && !job.result.entries.length ? (
              <p className="explorer-message">This folder is empty.</p>
            ) : null}
            {job?.result?.nextPage ? (
              <button
                type="button"
                className="button secondary explorer-more"
                disabled={busy}
                onClick={() => void more()}
              >
                Load more items
              </button>
            ) : null}
            {job?.result?.truncated ? (
              <p className="explorer-message">
                Some entries were inaccessible or exceeded the directory read limit. This is a
                partial listing.
              </p>
            ) : null}
          </div>
        </div>
        <footer className="explorer-footer">
          <span>
            {job?.result?.entries.length ?? 0} items loaded{picked ? ` · ${picked.name}` : ""}
          </span>
          <small>
            Double-click a folder to open. Files are listed as metadata; file contents need a
            separate approved request.
          </small>
        </footer>
      </section>
    </WorkspaceDialog>
  );
}
