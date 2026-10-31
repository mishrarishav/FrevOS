import type { DiscoveryState, FolderBrowseJob } from "@frevos/contracts";
import { FolderOpen, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ControlCenterApi } from "./api.js";
import { WorkspaceDialog } from "./WorkspaceDialog.js";
export interface FolderChoice {
  deviceId: string;
  root: string;
  path: string;
  absolutePath: string;
  requestId: string;
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
    [root, setRoot] = useState(""),
    [folder, setFolder] = useState(""),
    [job, setJob] = useState<FolderBrowseJob | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    void api
      .discoveryState?.(workspaceId, abort.signal)
      .then((state) => {
        if (abort.signal.aborted) return;
        const s = state.systems.find((s) => s.deviceId === deviceId);
        if (!s?.online || (s.profileId && (!s.sourceFresh || !s.source))) throw Error();
        const initialRoot =
          s.source?.repository ?? (!projectOnly && s.observation?.system.disks[0]?.root);
        if (!initialRoot) throw Error();
        setSystem(s);
        setRoot(initialRoot);
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setError(
            "This system is offline or has no verified readable drives. Reconnect it before browsing.",
          );
      });
    return () => abort.abort();
  }, [api, workspaceId, deviceId, projectOnly]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload requests a fresh directory page.
  useEffect(() => {
    if (!root) return;
    let cancelled = false;
    const abort = new AbortController();
    const load = async () => {
      setBusy(true);
      setError("");
      setJob(null);
      try {
        if (!api.browseFolders || !api.folderBrowseResult) throw Error();
        let current = await api.browseFolders(workspaceId, {
          version: 1,
          deviceId,
          root,
          path: folder,
          page: 0,
        });
        for (let i = 0; i < 100 && !cancelled; i++) {
          if (!["queued", "working"].includes(current.status)) break;
          await new Promise((r) => setTimeout(r, 1000));
          if (cancelled) return;
          current = await api.folderBrowseResult(workspaceId, current.requestId, abort.signal);
        }
        if (cancelled) return;
        if (current.status !== "succeeded")
          throw Error(current.errorCode ?? "folder-request-expired");
        setJob(current);
      } catch (e) {
        if (!cancelled)
          setError(
            e instanceof Error && e.message.startsWith("folder-")
              ? e.message.replaceAll("-", " ")
              : "Could not browse this folder. Check source connection and local metadata consent, then retry.",
          );
      } finally {
        if (!cancelled) setBusy(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
      abort.abort();
    };
  }, [api, workspaceId, deviceId, root, folder, reload]);
  async function more() {
    if (!job?.result?.nextPage || !api.browseFolders || !api.folderBrowseResult || busy) return;
    setBusy(true);
    setError("");
    try {
      let next = await api.browseFolders(workspaceId, {
        version: 1,
        deviceId,
        root,
        path: folder,
        page: job.result.nextPage,
        fingerprint: job.result.fingerprint,
      });
      for (let i = 0; i < 100 && ["queued", "working"].includes(next.status); i++) {
        await new Promise((r) => setTimeout(r, 1000));
        next = await api.folderBrowseResult(workspaceId, next.requestId);
      }
      if (next.status !== "succeeded" || !next.result) throw Error(next.errorCode);
      setJob({
        ...next,
        result: { ...next.result, entries: [...job.result.entries, ...next.result.entries] },
      });
    } catch {
      setError("Folder changed or the next page is unavailable. Refresh the folder.");
    } finally {
      setBusy(false);
    }
  }
  const roots = system
    ? [
        ...new Set([
          ...(system.source ? [system.source.repository] : []),
          ...(projectOnly ? [] : (system.observation?.system.disks.map((d) => d.root) ?? [])),
        ]),
      ]
    : [];
  const absolute = root
    ? root.replace(/[\\/]$/, "") +
      (root.includes("\\") ? "\\" : "/") +
      folder.split("/").join(root.includes("\\") ? "\\" : "/")
    : "";
  return (
    <WorkspaceDialog label="Browse folders" onClose={onClose}>
      <section className="project-editor discovery-editor folder-browser">
        <header className="settings-header">
          <div>
            <h2>
              Folders ·{" "}
              {system?.observation?.system.systemName ?? system?.name ?? "Connected system"}
            </h2>
            <small>
              Directory names from this source; watch coverage does not limit this browser.
            </small>
          </div>
          <div className="record-row-actions">
            {onChoose ? (
              <button
                type="button"
                className="button primary"
                disabled={
                  busy ||
                  !job?.result ||
                  (!allowDriveRoot && !folder && (root === "/" || /^[A-Za-z]:[\\/]?$/.test(root)))
                }
                onClick={() =>
                  job?.result &&
                  onChoose({
                    deviceId,
                    root,
                    path: folder,
                    absolutePath: absolute,
                    requestId: job.requestId,
                  })
                }
              >
                {label}
              </button>
            ) : null}
            <button
              type="button"
              className="button ghost"
              aria-label="Close folder browser"
              onClick={onClose}
            >
              <X size={16} />
            </button>
          </div>
        </header>
        <div className="discovery-scroll discovery-form">
          <label>
            Drive or project folder
            <select
              aria-label="Drive or project folder"
              value={root}
              disabled={busy}
              onChange={(e) => {
                setRoot(e.target.value);
                setFolder("");
              }}
            >
              {roots.map((r) => (
                <option key={r} value={r}>
                  {r === system?.source?.repository ? "Project · " : ""}
                  {r}
                </option>
              ))}
            </select>
          </label>
          <div className="record-row-actions">
            <button
              type="button"
              className="button secondary"
              disabled={busy || !folder}
              onClick={() => setFolder(folder.split("/").slice(0, -1).join("/"))}
            >
              Up one folder
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={busy || !root}
              onClick={() => setReload((n) => n + 1)}
            >
              Refresh folder
            </button>
          </div>
          <code className="folder-current">{absolute}</code>
          {busy ? <p role="status">Reading folders from the connected system…</p> : null}
          {error ? <p role="alert">{error}</p> : null}
          <ul className="folder-list">
            {job?.result?.entries.map((entry) => (
              <li key={entry.path}>
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy || entry.excluded}
                  onClick={() => setFolder(entry.path)}
                >
                  <FolderOpen size={16} />
                  <span>{entry.name}</span>
                  {entry.excluded ? <small>Excluded / protected</small> : null}
                </button>
              </li>
            ))}
          </ul>
          {job?.result && !job.result.entries.length ? <p>No accessible child folders.</p> : null}
          {job?.result?.nextPage ? (
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => void more()}
            >
              Load more folders
            </button>
          ) : null}
          {job?.result?.truncated ? (
            <p role="status">
              This directory exceeded the read limit or has inaccessible entries. Select a narrower
              folder; this is not a complete directory snapshot.
            </p>
          ) : null}
          <p>Only folder names are listed. File contents and permissions are not changed.</p>
        </div>
      </section>
    </WorkspaceDialog>
  );
}
