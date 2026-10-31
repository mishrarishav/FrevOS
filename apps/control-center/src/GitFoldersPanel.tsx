import { useEffect, useState, useRef } from "react";
import type { GitDesktopState, RepositoryCenterState } from "@frevos/contracts";
import type { ControlCenterApi } from "./api.js";
import { RecordBadge, RecordWorkspace } from "./RecordWorkspace.js";
import { WorkspaceDialog } from "./WorkspaceDialog.js";
import { FolderBrowser, type FolderChoice } from "./FolderBrowser.js";
import { deploymentRequestId } from "./deployment-request-id.js";

type Folder = GitDesktopState["folders"][number];
export function GitFoldersPanel({
  api,
  workspaceId,
  userId,
  scopeName,
  repositories,
  navigate,
  showRepositories,
  repositoryCreated,
  hostingReady,
  hostingMessage,
}: {
  api: ControlCenterApi;
  workspaceId: string;
  userId: string;
  scopeName: string;
  repositories: RepositoryCenterState["repositories"];
  navigate: (url: string) => void;
  showRepositories: () => void;
  repositoryCreated: (repo: RepositoryCenterState["repositories"][number]) => void;
  hostingReady: boolean;
  hostingMessage: string;
}) {
  const [state, setState] = useState<GitDesktopState>({ devices: [], folders: [], jobs: [] });
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [notice, setNotice] = useState(""),
    [selectedId, setSelectedId] = useState(""),
    [choose, setChoose] = useState(false);
  const [deviceId, setDeviceId] = useState(""),
    [repositoryId, setRepositoryId] = useState(""),
    [browse, setBrowse] = useState(false);
  const [files, setFiles] = useState<string[]>([]),
    [message, setMessage] = useState(""),
    [branch, setBranch] = useState("");
  const [newName, setNewName] = useState("");
  const [working, setWorking] = useState("");
  const [pickerNotice, setPickerNotice] = useState("");
  const creationIntent = useRef<{
    folderId: string;
    name: string;
    requestId: string;
    repositoryId?: string;
  } | null>(null);
  const selected = state.folders.find((f) => f.id === selectedId);
  const snapshot = selected?.snapshot;
  const pending = (id: string) =>
    state.jobs.some((j) => j.binding.id === id && ["queued", "claimed"].includes(j.status));
  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        if (!api.gitDesktopState) throw Error();
        const fresh = await api.gitDesktopState(workspaceId, abort.signal);
        if (!abort.signal.aborted) {
          setState(fresh);
        }
      } catch {
        if (!abort.signal.aborted)
          setError("Your folders could not be loaded. Check your connection and retry.");
      } finally {
        if (!abort.signal.aborted) {
          setLoading(false);
          timer = setTimeout(() => void load(), 3000);
        }
      }
    };
    void load();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [api, workspaceId]);
  const fingerprint = snapshot?.fingerprint;
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset selection only when actual files or selected folder change.
  useEffect(() => {
    setFiles(snapshot?.files.filter((f) => !f.protected).map((f) => f.path) ?? []);
    setBranch(
      selected?.repositoryId &&
        !selected.bootstrapSeed &&
        snapshot?.branch &&
        snapshot.branch !== repositories.find((r) => r.id === selected?.repositoryId)?.defaultBranch
        ? snapshot.branch
        : (selected?.branch ?? ""),
    );
  }, [selectedId, fingerprint]);
  async function refresh() {
    if (api.gitDesktopState) setState(await api.gitDesktopState(workspaceId));
  }
  async function openFolder(folder: Folder) {
    setPickerNotice("");
    setSelectedId(folder.id);
    setRepositoryId(folder.repositoryId ?? "new");
    setNewName(
      (folder.root.split(/[\\/]/).at(-1) ?? "")
        .replace(/[^A-Za-z0-9._-]+/g, "-")
        .replace(/^[^A-Za-z0-9]+/, "")
        .slice(0, 100) || "project",
    );
    const device = state.devices.find((d) => d.deviceId === folder.deviceId);
    if (!device?.online || !device.capable || pending(folder.id) || !api.gitDesktopAction) return;
    try {
      await api.gitDesktopAction(workspaceId, {
        version: 1,
        folderId: folder.id,
        action: "status",
      });
      await refresh();
    } catch {
      setError("Could not refresh Changes. Reconnect this system and retry.");
    }
  }
  async function select(choice: FolderChoice) {
    setBrowse(false);
    setChoose(false);
    setBusy(true);
    setError("");
    try {
      if (!api.selectGitFolder) throw Error();
      const job = await api.selectGitFolder(workspaceId, {
        version: 1,
        deviceId: choice.deviceId,
        browseRequestId: choice.requestId,
        root: choice.root,
        path: choice.path,
      });
      await refresh();
      setSelectedId(job.binding.id);
      setRepositoryId(job.binding.repositoryId ?? "new");
      setNewName(
        (job.binding.root.split(/[\\/]/).at(-1) ?? "")
          .replace(/[^A-Za-z0-9._-]+/g, "-")
          .replace(/^[^A-Za-z0-9]+/, "")
          .slice(0, 100) || "project",
      );
      setNotice("Folder selected. Reading Changes on your connected system…");
    } catch {
      setError(
        "Folder selection was not confirmed. Reconnect your system, update its connector if required, and choose the folder again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function openNative(device: GitDesktopState["devices"][number]) {
    if (!api.pickGitFolder || !api.gitFolderPicker || !device.nativePicker) {
      setError(
        "Update this system's connector to enable its native folder chooser. You can also browse in DevSetu.",
      );
      return;
    }
    setChoose(false);
    setBusy(true);
    setError("");
    setPickerNotice(
      `Choose a folder in the window opened on ${device.name}. You can cancel in that window.`,
    );
    try {
      let job = await api.pickGitFolder(workspaceId, {
        version: 1,
        deviceId: device.deviceId,
        requestId: `gpick_${deploymentRequestId("pr").slice(3)}`,
      });
      for (let i = 0; i < 47 && ["queued", "claimed"].includes(job.status); i++) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        job = await api.gitFolderPicker(workspaceId, job.requestId);
      }
      if (job.result?.status === "selected" && job.status === "selected") {
        const { root, path } = job.result;
        await select({
          deviceId: device.deviceId,
          requestId: job.requestId,
          root,
          path,
          absolutePath: root + path.split("/").join(root.includes("\\") ? "\\" : "/"),
        });
        setPickerNotice("");
      } else if (job.status === "cancelled")
        setPickerNotice("Folder selection cancelled. No files changed.");
      else {
        setPickerNotice("");
        setError(
          "The folder chooser was unavailable or expired. Unlock the selected laptop, reconnect its connector and retry. You can also browse in DevSetu.",
        );
      }
    } catch {
      setPickerNotice("");
      setError(
        "Could not confirm folder selection. Check that the selected laptop is online and unlocked before retrying. An existing chooser will not be opened twice.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function action(
    action: "status" | "commit-push" | "push" | "pull" | "clone" | "switch-branch" | "reconcile",
  ) {
    if (!selected || !api.gitDesktopAction) return;
    setBusy(true);
    setError("");
    try {
      let cloneBranch = destination?.defaultBranch;
      if (["commit-push", "push", "clone"].includes(action) && !selected.repositoryId) {
        if (!api.connectGitFolder || !api.gitDesktopState || !snapshot) throw Error();
        let central = repositoryId,
          creationRequestId: string | undefined;
        if (central === "new") {
          if (!api.createHostedRepository || !hostingReady) throw Error();
          setWorking("Creating your private repository…");
          const name = newName.trim();
          if (
            !creationIntent.current ||
            creationIntent.current.folderId !== selected.id ||
            creationIntent.current.name !== name
          )
            creationIntent.current = {
              folderId: selected.id,
              name,
              requestId: `git_${deploymentRequestId("pr").slice(3)}`,
            };
          const created = await api.createHostedRepository(workspaceId, {
            version: 1,
            requestId: creationIntent.current.requestId,
            name,
          });
          cloneBranch = created.defaultBranch;
          creationIntent.current.repositoryId = created.id;
          creationRequestId = creationIntent.current.requestId;
          repositoryCreated(created);
          central = created.id;
          setRepositoryId(central);
        }
        if (!creationRequestId && creationIntent.current?.repositoryId === central)
          creationRequestId = creationIntent.current.requestId;
        setWorking("Connecting this folder and checking Changes…");
        const connection = await api.connectGitFolder(workspaceId, {
          version: 1,
          folderId: selected.id,
          repositoryId: central,
          expectedFingerprint: snapshot.fingerprint,
          ...(creationRequestId ? { creationRequestId } : {}),
        });
        let ready = false;
        for (let i = 0; i < 40; i++) {
          const fresh = await api.gitDesktopState(workspaceId);
          setState(fresh);
          const job = fresh.jobs.find((j) => j.id === connection.id);
          if (job?.status === "succeeded") {
            if (
              fresh.folders.find((f) => f.id === selected.id)?.snapshot?.fingerprint !==
              snapshot.fingerprint
            )
              throw Error();
            ready = true;
            break;
          }
          if (job && ["failed", "needs-reconciliation"].includes(job.status)) throw Error();
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
        if (!ready) throw Error();
      }
      setWorking(
        action === "commit-push" ? "Requesting Commit & Push…" : "Sending request to your system…",
      );
      await api.gitDesktopAction(workspaceId, {
        version: 1,
        folderId: selected.id,
        action,
        ...(action === "status"
          ? {}
          : {
              expectedFingerprint: snapshot?.fingerprint,
              branch: action === "clone" ? cloneBranch : branch,
            }),
        ...(action === "commit-push" ? { files, message } : {}),
      });
      setNotice(
        action === "status"
          ? "Refreshing Changes…"
          : "Request sent to your system. The result will appear here.",
      );
      await refresh();
    } catch {
      setError(
        "Request was not accepted. Refresh Changes, check repository access and reconnect the system before retrying.",
      );
    } finally {
      setBusy(false);
      setWorking("");
    }
  }
  async function connect() {
    if (!selected || !api.connectGitFolder || !snapshot) return;
    setBusy(true);
    setError("");
    try {
      await api.connectGitFolder(workspaceId, {
        version: 1,
        folderId: selected.id,
        repositoryId,
        expectedFingerprint: snapshot.fingerprint,
      });
      await refresh();
    } catch {
      setError(
        "Repository connection was not confirmed. Refresh Changes and check your repository access.",
      );
    } finally {
      setBusy(false);
    }
  }
  const activeDevice = state.devices.find((d) => d.deviceId === deviceId);
  const device = state.devices.find((d) => d.deviceId === selected?.deviceId);
  const job = state.jobs.find((j) => j.binding.id === selectedId);
  const latest = state.jobs[0];
  const completedNotice =
    latest?.status === "succeeded"
      ? ["commit-push", "push"].includes(latest.action)
        ? "Published. Your local commit is available in the central repository."
        : latest.action === "status" || latest.action === "select"
          ? "Changes are up to date."
          : "Completed. Changes are up to date."
      : "";
  const completedCommit =
    job?.action === "commit-push" && job.status === "succeeded" ? job.id : undefined;
  useEffect(() => {
    if (completedCommit) setMessage("");
  }, [completedCommit]);
  const repo = repositories.find((r) => r.id === selected?.repositoryId);
  const destination = repo ?? repositories.find((r) => r.id === repositoryId);
  const canPublish =
    destination?.permissions.write ||
    (!selected?.repositoryId &&
      repositoryId === "new" &&
      hostingReady &&
      /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(newName.trim()));
  const blocked =
    busy || (!!selected && pending(selected.id)) || !device?.online || !device.capable;
  return (
    <>
      <RecordWorkspace<Folder>
        title="Code"
        breadcrumb="Workspace / Code"
        scopeName={scopeName}
        userId={userId}
        workspaceId={workspaceId}
        page="git-folders"
        records={state.folders}
        identify={(f) => f.id}
        statusOf={(f) =>
          state.devices.find((d) => d.deviceId === f.deviceId)?.online ? "online" : "offline"
        }
        statuses={[
          { id: "online", label: "Online" },
          { id: "offline", label: "Offline" },
        ]}
        noun="folders"
        loading={loading}
        error={error}
        notice={
          pickerNotice ||
          completedNotice ||
          notice ||
          hostingMessage ||
          "Connect your system once, choose a folder, then review Changes and Commit & Push."
        }
        onRetry={() => void refresh()}
        columns={[
          { id: "root", label: "Folder", value: (f) => f.root },
          { id: "branch", label: "Branch", value: (f) => f.snapshot?.branch ?? f.branch },
          {
            id: "system",
            label: "System",
            value: (f) => state.devices.find((d) => d.deviceId === f.deviceId)?.name ?? "Offline",
          },
        ]}
        actions={
          <div className="record-row-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => navigate("/systems/discovery")}
            >
              Connect system
            </button>
            <button
              type="button"
              className="button primary"
              disabled={busy}
              onClick={() => {
                setPickerNotice("");
                const ready = state.devices.filter((d) => d.online && d.capable);
                if (ready.length === 1 && ready[0]?.nativePicker) {
                  void openNative(ready[0]);
                  return;
                }
                setChoose(true);
                setDeviceId(state.devices.find((d) => d.online && d.capable)?.deviceId ?? "");
                setRepositoryId("new");
              }}
            >
              Choose folder
            </button>
            <button type="button" className="button secondary" onClick={showRepositories}>
              Repositories & reviews
            </button>
          </div>
        }
        renderCard={(f) => (
          <>
            <h2>{f.root.split(/[\\/]/).at(-1)}</h2>
            <p className="record-muted">{f.root}</p>
            <p className="record-muted">
              {state.devices.find((d) => d.deviceId === f.deviceId)?.name ?? "Disconnected system"}
              {" · "}
              {state.devices.find((d) => d.deviceId === f.deviceId)?.online ? "Online" : "Offline"}
            </p>
            <RecordBadge>{f.snapshot?.branch ?? "Reading folder"}</RecordBadge>
            <p>{f.snapshot?.files.filter((p) => !p.protected).length ?? 0} changes</p>
            <button type="button" className="button primary" onClick={() => void openFolder(f)}>
              Open Changes
            </button>
          </>
        )}
        renderActions={(f) => (
          <button type="button" className="button primary" onClick={() => void openFolder(f)}>
            Open Changes
          </button>
        )}
      />
      {choose && !browse ? (
        <WorkspaceDialog label="Choose a folder" onClose={() => setChoose(false)}>
          <section className="project-editor discovery-editor git-folder-chooser">
            <header className="settings-header">
              <h2>Choose a folder</h2>
              <button type="button" className="button ghost" onClick={() => setChoose(false)}>
                Close
              </button>
            </header>
            <div className="discovery-scroll discovery-form">
              <label>
                Your connected system
                <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
                  <option value="">Choose system</option>
                  {state.devices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.name}
                      {!d.online ? " · Offline" : !d.capable ? " · Connector update required" : ""}
                    </option>
                  ))}
                </select>
              </label>
              {!state.devices.length ? (
                <p>
                  Connect your system first. You do not need to share an administrator password.
                </p>
              ) : null}
              {activeDevice && !activeDevice.capable ? (
                <p>
                  Update this system’s connector to enable Git actions. Its existing monitoring
                  connection is preserved.
                </p>
              ) : null}
              {activeDevice?.capable && !activeDevice.gitReady ? (
                <p>
                  Git is missing. Install Git from the connector’s System Check, then return here.
                </p>
              ) : null}
              <p>
                Existing folders are supported. Choosing a folder reads Changes; it does not upload
                or remove files.
              </p>
              <button
                type="button"
                className="button primary"
                disabled={
                  !activeDevice?.online ||
                  !activeDevice.capable ||
                  !activeDevice.nativePicker ||
                  busy
                }
                onClick={() => activeDevice && void openNative(activeDevice)}
              >
                Open folder chooser
              </button>
              {activeDevice && !activeDevice.nativePicker ? (
                <p>Native selection needs an updated connector and an unlocked desktop session.</p>
              ) : null}
              <button
                type="button"
                className="button secondary"
                disabled={!activeDevice?.online || !activeDevice.capable || busy}
                onClick={() => setBrowse(true)}
              >
                Browse in DevSetu
              </button>
            </div>
          </section>
        </WorkspaceDialog>
      ) : null}
      {browse ? (
        <FolderBrowser
          allowDriveRoot={false}
          api={api}
          workspaceId={workspaceId}
          deviceId={deviceId}
          onClose={() => setBrowse(false)}
          onChoose={(c) => void select(c)}
        />
      ) : null}
      {selected ? (
        <WorkspaceDialog label="Changes" onClose={() => !busy && setSelectedId("")}>
          <section className="project-editor discovery-editor">
            <header className="settings-header">
              <div>
                <h2>Changes</h2>
                <p className="record-muted">{selected.root}</p>
              </div>
              <button
                type="button"
                className="button ghost"
                disabled={busy}
                onClick={() => setSelectedId("")}
              >
                Close
              </button>
            </header>
            <div className="discovery-scroll discovery-form">
              <p>
                {device?.name} · {device?.online ? "Online" : "Offline"} ·{" "}
                {repo?.name ?? "Choose a central repository to publish"}
              </p>
              {error ? <p role="alert">{error}</p> : null}
              {hostingMessage ? <p>{hostingMessage}</p> : null}
              {working ? (
                <p role="status">{working}</p>
              ) : job ? (
                <p role="status">
                  {job.status === "succeeded"
                    ? ["select", "status"].includes(job.action)
                      ? "Changes are up to date"
                      : ["push", "commit-push"].includes(job.action)
                        ? "Published"
                        : job.action === "pull"
                          ? "Pulled"
                          : job.action === "clone"
                            ? "Cloned"
                            : "Branch changed"
                    : job.status === "failed" || job.status === "needs-reconciliation"
                      ? (job.errorCode?.replaceAll("-", " ") ?? "Operation needs review")
                      : "Working on your system…"}
                </p>
              ) : null}
              {!snapshot ? (
                <p>Reading folder…</p>
              ) : (
                <>
                  {!repo ? (
                    <>
                      <label>
                        Central repository
                        <select
                          value={repositoryId}
                          disabled={busy}
                          onChange={(e) => setRepositoryId(e.target.value)}
                        >
                          <option value="">Choose repository</option>
                          {hostingReady ? (
                            <option value="new">New private repository</option>
                          ) : null}
                          {repositories.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      {repositoryId === "new" ? (
                        <label>
                          Repository name
                          <input
                            disabled={busy}
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            maxLength={100}
                          />
                          <small>Created only when you choose a publishing action below.</small>
                        </label>
                      ) : null}
                      {repositoryId !== "new" ? (
                        <button
                          type="button"
                          className="button secondary"
                          disabled={blocked || !repositories.some((r) => r.id === repositoryId)}
                          onClick={() => void connect()}
                        >
                          Connect repository
                        </button>
                      ) : null}
                    </>
                  ) : null}
                  {state.jobs.some(
                    (j) => j.binding.id === selected.id && j.status === "needs-reconciliation",
                  ) ? (
                    <>
                      <p>
                        Previous work needs recovery. Refresh Changes first, then acknowledge the
                        local state. Local commits remain on your system.
                      </p>
                      <button
                        type="button"
                        className="button secondary"
                        disabled={blocked}
                        onClick={() => void action("reconcile")}
                      >
                        Acknowledge refreshed local state
                      </button>
                    </>
                  ) : null}
                  {!snapshot.gitReady ? (
                    <p>Git is missing. Run the connector’s System Check and install Git.</p>
                  ) : null}
                  {snapshot.truncated ? (
                    <p>
                      Too many changed files. Narrow the folder or add a .gitignore before
                      committing.
                    </p>
                  ) : null}
                  <label>
                    Working branch
                    <input
                      disabled={blocked}
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                    />
                  </label>
                  <div className="record-row-actions">
                    <button
                      type="button"
                      className="button secondary"
                      disabled={blocked}
                      onClick={() => void action("status")}
                    >
                      Refresh Changes
                    </button>
                    {!snapshot.initialized && !snapshot.files.length ? (
                      <button
                        type="button"
                        className="button secondary"
                        disabled={
                          blocked ||
                          (!destination &&
                            !(repositoryId === "new" && hostingReady && newName.trim())) ||
                          !snapshot.gitReady
                        }
                        onClick={() => void action("clone")}
                      >
                        {!selected.repositoryId && repositoryId === "new"
                          ? "Create repository"
                          : "Clone into this empty folder"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="button secondary"
                      disabled={blocked || !snapshot.gitReady || !snapshot.initialized || !branch}
                      onClick={() => void action("switch-branch")}
                    >
                      Switch / create branch
                    </button>
                    <button
                      type="button"
                      className="button secondary"
                      disabled={blocked || !repo || !snapshot.initialized}
                      onClick={() => void action("pull")}
                    >
                      Pull
                    </button>
                    <button
                      type="button"
                      className="button secondary"
                      disabled={
                        blocked ||
                        !canPublish ||
                        !snapshot.head ||
                        (!selected.repositoryId && snapshot.files.some((f) => !f.protected))
                      }
                      onClick={() => void action("push")}
                    >
                      {selected.repositoryId ? "Push committed changes" : "Publish repository"}
                    </button>
                  </div>
                  <fieldset className="git-changes-list">
                    <legend>
                      {snapshot.files.filter((f) => !f.protected).length} changed files
                    </legend>
                    {snapshot.files.map((f) => (
                      <label className="git-file-choice" key={f.path}>
                        <input
                          type="checkbox"
                          disabled={f.protected || blocked}
                          checked={!f.protected && files.includes(f.path)}
                          onChange={(e) =>
                            setFiles((old) =>
                              e.target.checked ? [...old, f.path] : old.filter((p) => p !== f.path),
                            )
                          }
                        />
                        <span>
                          {f.path} <small>{f.protected ? "Protected · excluded" : f.status}</small>
                        </span>
                      </label>
                    ))}
                    {!snapshot.files.length ? <p>No local changes.</p> : null}
                  </fieldset>
                  <label>
                    Commit message
                    <input
                      placeholder="Describe your changes"
                      disabled={blocked}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      maxLength={500}
                    />
                  </label>
                  <button
                    type="button"
                    className="button primary"
                    disabled={
                      blocked ||
                      !snapshot.gitReady ||
                      snapshot.truncated ||
                      !canPublish ||
                      !files.length ||
                      !message.trim() ||
                      !branch ||
                      branch === destination?.defaultBranch
                    }
                    onClick={() => void action("commit-push")}
                  >
                    Commit & Push
                  </button>
                  <button type="button" className="button secondary" onClick={showRepositories}>
                    Create pull request / review
                  </button>
                </>
              )}
            </div>
          </section>
        </WorkspaceDialog>
      ) : null}
    </>
  );
}
