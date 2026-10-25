import {
  type DeploymentConnectionTest,
  type DeploymentSettings,
  type DeploymentSettingsInput,
  DeploymentSettingsInputSchema,
  type DeveloperConnector,
} from "@frevos/contracts";
import {
  Archive,
  Download,
  Eye,
  FolderOpen,
  LoaderCircle,
  Pencil,
  PlugZap,
  Plus,
  RotateCcw,
  Save,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiFailure, type ControlCenterApi } from "./api.js";
import { DeveloperAccess } from "./DeveloperAccess.js";
import { FolderBrowser, type FolderChoice } from "./FolderBrowser.js";
import { PlatformProjectDetails } from "./PlatformProjectDetails.js";
import { RecordBadge, type RecordColumn, RecordWorkspace } from "./RecordWorkspace.js";
import { addBasePath } from "./routing.js";
import { WorkspaceDialog } from "./WorkspaceDialog.js";

export function settingsForm(profile: DeploymentSettings): DeploymentSettingsInput {
  const { revision, runner: _, updatedAt: _at, updatedBy: _by, ...fields } = profile;
  return { ...fields, expectedRevision: revision };
}
export function blankSettings(): DeploymentSettingsInput {
  return {
    version: 1,
    profileId: "",
    expectedRevision: 0,
    displayName: "",
    repositoryOrigin: "",
    sourceFolder: "D:\\myProject",
    destination: {
      host: "10.9.69.21",
      root: "D:\\myProjectDev",
      siteUrl: "http://10.9.69.21:83/",
      credentialProfile: "not-connected",
    },
    preservedPaths: ["attachment", "uploads", ".env"],
  };
}
export function DeploymentSettingsPage({
  api,
  workspaceId,
  scopeName = "Current workspace",
}: {
  api: ControlCenterApi;
  workspaceId: string;
  scopeName?: string;
}) {
  const [userId, setUserId] = useState("");
  const [mode, setMode] = useState<"view" | "edit" | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<DeploymentSettings | null>(null);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [profiles, setProfiles] = useState<DeploymentSettings[]>([]);
  const [platform, setPlatform] = useState<DeploymentSettings | null>(null);
  const [form, setForm] = useState<DeploymentSettingsInput | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [baseline, setBaseline] = useState("");
  const [closeRequested, setCloseRequested] = useState(false);
  const [pathsText, setPathsText] = useState("");
  const [devices, setDevices] = useState<DeveloperConnector[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [owner, setOwner] = useState(false);
  const [busy, setBusy] = useState<"save" | "test" | "folder" | "archive" | "revoke" | null>(null);
  const [folderBrowser, setFolderBrowser] = useState(false);
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [test, setTest] = useState<DeploymentConnectionTest | null>(null);
  const submitting = useRef(false);
  const current = profiles.find((p) => p.profileId === selectedProfileId);
  const values = form
    ? {
        ...form,
        preservedPaths: pathsText
          .split(/\r?\n/)
          .map((v) => v.trim())
          .filter(Boolean),
      }
    : null;
  const dirty = !!values && JSON.stringify(values) !== baseline;
  const fixed = form?.profileId === "servix-development";
  const select = useCallback((profile: DeploymentSettings) => {
    const fields = settingsForm(profile);
    setForm(fields);
    setSelectedProfileId(profile.profileId);
    setBaseline(JSON.stringify(fields));
    setCloseRequested(false);
    setPathsText(profile.preservedPaths.join("\n"));
    setDeviceId("");
    setTest(null);
    setNotice("");
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload is the explicit Retry generation.
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      api.listDeploymentSettings?.(workspaceId, controller.signal),
      api.getSession(controller.signal),
    ])
      .then(([items, session]) => {
        if (controller.signal.aborted) return;
        setUserId(session.userId);
        setOwner(session.userId === "usr_windows_admin");
        setProfiles(items ?? []);
        const id =
          typeof location === "undefined"
            ? null
            : new URLSearchParams(location.search).get("project");
        const linked = items?.find((item) => item.profileId === id);
        if (linked) {
          if (linked.runner === "devsetu-platform") setPlatform(linked);
          else if (linked.runner === "configured-components") {
            location.assign(
              addBasePath(`/projects/components?project=${encodeURIComponent(linked.profileId)}`),
            );
          } else {
            select(linked);
            setMode("view");
          }
        }
        setLoadError("");
        setLoaded(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setLoaded(true);
          setLoadError("Check the workspace connection, then retry.");
        }
      });
    return () => controller.abort();
  }, [api, workspaceId, reload, select]);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const items = await api.listDeveloperConnectors?.(workspaceId, controller.signal);
        if (items && !controller.signal.aborted) setDevices(items);
      } catch {
        if (!controller.signal.aborted) setDevices([]);
      }
      if (!controller.signal.aborted) timer = setTimeout(() => void poll(), 3000);
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [api, workspaceId]);
  const projectDevices = devices.filter(
    (d) => (d.profileId ?? "servix-development") === form?.profileId && d.status === "active",
  );
  const selectedId =
    deviceId || projectDevices.find((d) => d.online)?.deviceId || projectDevices[0]?.deviceId || "";
  const selected = projectDevices.find((d) => d.deviceId === selectedId);
  async function act(action: "save" | "test") {
    if (!values || submitting.current) return;
    setTest(null);
    setNotice("");
    const parsed = DeploymentSettingsInputSchema.safeParse(values);
    if (!parsed.success) {
      setNotice(
        "Check project ID, Git URL, absolute Windows folders, site URL and relative preserved paths. Use one literal path per line; no wildcards or ../ paths.",
      );
      return;
    }
    submitting.current = true;
    setBusy(action);
    try {
      if (action === "save") {
        if (!api.saveDeploymentSettings) throw Error("unavailable");
        const saved = await api.saveDeploymentSettings(workspaceId, parsed.data);
        setProfiles((items) => [...items.filter((p) => p.profileId !== saved.profileId), saved]);
        select(saved);
        setNotice(
          `Saved revision ${saved.revision}. Run Test connection to check this configuration.`,
        );
      } else {
        if (dirty || !api.testDeploymentSettings) return;
        setTest(
          await api.testDeploymentSettings(workspaceId, values.profileId, selectedId || undefined),
        );
      }
    } catch (error) {
      setNotice(
        error instanceof ApiFailure && error.responseStatus === 409
          ? "Settings changed elsewhere, or the destination is outside the approved profile. Reload to review the latest configuration."
          : "Action could not be confirmed. Reload settings before retrying a save.",
      );
    } finally {
      submitting.current = false;
      setBusy(null);
    }
  }

  async function chooseFolder(choice?: FolderChoice) {
    if (!selected || !api.chooseConnectorFolder || busy) return;
    if (selected.folderBrowser && !choice) {
      setFolderBrowser(true);
      return;
    }
    setBusy("folder");
    setNotice("");
    setTest(null);
    try {
      await api.chooseConnectorFolder(
        workspaceId,
        selected.deviceId,
        choice ? { browseRequestId: choice.requestId, path: choice.path } : undefined,
      );
      setFolderBrowser(false);
      setNotice(
        (choice
          ? "Selected folder submitted for Git identity verification on "
          : "Folder picker requested. Choose this project's Git checkout on ") +
          selected.name +
          ". It expires in 90 seconds.",
      );
    } catch {
      setNotice(
        "Folder picker could not start. Connect the latest connector and finish any source publication, then retry.",
      );
    } finally {
      setBusy(null);
    }
  }
  async function revokeDevice() {
    if (!selected || busy) return;
    setBusy("revoke");
    try {
      await api.revokeDeveloperConnector?.(workspaceId, selected.deviceId);
      setDevices((items) => items.filter((item) => item.deviceId !== selected.deviceId));
      setNotice("Device disconnected. Run the installer to reconnect it.");
    } catch {
      setNotice("Device could not be disconnected.");
    } finally {
      setBusy(null);
    }
  }
  async function archiveProject() {
    if (!archiveTarget || !api.saveDeploymentSettings || busy) return;
    setBusy("archive");
    setNotice("");
    try {
      const saved = await api.saveDeploymentSettings(workspaceId, {
        ...settingsForm(archiveTarget),
        archived: !archiveTarget.archived,
      });
      setProfiles((items) => items.map((p) => (p.profileId === saved.profileId ? saved : p)));
      setArchiveTarget(null);
      setNotice(
        saved.archived
          ? "Project archived. Configuration history and application files are retained."
          : "Project restored to active configuration.",
      );
    } catch {
      setNotice("Project could not be updated. Reload to review its latest revision.");
    } finally {
      setBusy(null);
    }
  }
  const statusOf = (p: DeploymentSettings) =>
    p.runner === "devsetu-platform"
      ? "managed"
      : p.archived
        ? "archived"
        : p.runner === "servix-development" || p.runner === "configured-components"
          ? "configured"
          : "pending";
  const statusBadge = (p: DeploymentSettings) => (
    <RecordBadge
      tone={
        p.archived
          ? "neutral"
          : p.runner === "servix-development" || p.runner === "configured-components"
            ? "positive"
            : "warning"
      }
    >
      {p.runner === "devsetu-platform"
        ? "Managed platform"
        : p.archived
          ? "Archived"
          : p.runner === "servix-development" || p.runner === "configured-components"
            ? "Configured"
            : "Destination pending"}
    </RecordBadge>
  );
  const open = (p: DeploymentSettings, next: "view" | "edit") => {
    if (p.runner === "configured-components") {
      location.assign(
        addBasePath(`/projects/components?project=${encodeURIComponent(p.profileId)}`),
      );
      return;
    }
    if (p.runner === "devsetu-platform") {
      setPlatform(p);
      return;
    }
    select(p);
    setMode(next);
  };
  const rowActions = (p: DeploymentSettings) => (
    <div className="record-row-actions">
      <button type="button" className="button secondary" onClick={() => open(p, "view")}>
        <Eye size={14} /> View
      </button>
      {owner && p.runner !== "devsetu-platform" && p.runner !== "configured-components" ? (
        <>
          <button type="button" className="button secondary" onClick={() => open(p, "edit")}>
            <Pencil size={14} /> Edit
          </button>
          <button type="button" className="button ghost" onClick={() => setArchiveTarget(p)}>
            {p.archived ? <RotateCcw size={14} /> : <Archive size={14} />}{" "}
            {p.archived ? "Restore" : "Archive"}
          </button>
        </>
      ) : null}
    </div>
  );
  const columns: RecordColumn<DeploymentSettings>[] = [
    {
      id: "name",
      label: "Project",
      value: (p) => p.displayName,
      render: (p) => (
        <div className="record-identity">
          <strong>{p.displayName}</strong>
          <small>{p.profileId}</small>
        </div>
      ),
    },
    {
      id: "status",
      label: "Status",
      value: (p) =>
        p.runner === "devsetu-platform"
          ? "Managed platform"
          : p.archived
            ? "Archived"
            : p.runner === "servix-development" || p.runner === "configured-components"
              ? "Configured"
              : "Destination pending",
      render: statusBadge,
    },
    { id: "source", label: "Source folder", value: (p) => p.sourceFolder },
    {
      id: "destination",
      label: "Destination",
      value: (p) => p.destination.host + " · " + p.destination.root,
    },
    {
      id: "preservation",
      label: "Preserved paths",
      value: (p) => String(p.preservedPaths.length),
      render: (p) => (
        <RecordBadge>
          {p.runner === "devsetu-platform"
            ? "Managed protection"
            : `${p.preservedPaths.length} protected paths`}
        </RecordBadge>
      ),
    },
    {
      id: "updated",
      label: "Updated",
      value: (p) => p.updatedAt,
      render: (p) => (
        <span className="record-muted">
          {new Date(p.updatedAt).toLocaleString()}
          <br />
          Revision {p.revision}
        </span>
      ),
    },
  ];
  const dismiss = () => {
    setMode(null);
    setForm(null);
    setSelectedProfileId(null);
    setCloseRequested(false);
    setTest(null);
    setNotice("");
  };
  const close = () => {
    if (busy) return;
    if (dirty) setCloseRequested(true);
    else dismiss();
  };
  return (
    <>
      <RecordWorkspace
        key={userId}
        title="Projects"
        breadcrumb="Projects / Configuration"
        scopeName={scopeName}
        userId={userId}
        workspaceId={workspaceId}
        page="project-master"
        records={profiles}
        columns={columns}
        identify={(p) => p.profileId}
        statusOf={statusOf}
        statuses={[
          { id: "configured", label: "Configured" },
          { id: "managed", label: "Managed platform" },
          { id: "pending", label: "Destination pending" },
          { id: "archived", label: "Archived" },
        ]}
        defaultView="table"
        loading={!loaded}
        error={loadError}
        notice={!mode ? notice : ""}
        onRetry={() => {
          setLoaded(false);
          setReload((n) => n + 1);
        }}
        renderActions={rowActions}
        actions={
          <>
            <a className="button secondary" href={addBasePath("/projects/components")}>
              Components
            </a>
            <a className="button secondary" href={addBasePath("/deployments/deploy-72")}>
              Deployments
            </a>
            {owner ? (
              <button
                type="button"
                className="button primary"
                onClick={() => {
                  const next = blankSettings();
                  setForm(next);
                  setSelectedProfileId(null);
                  setBaseline(JSON.stringify(next));
                  setCloseRequested(false);
                  setPathsText(next.preservedPaths.join("\n"));
                  setMode("edit");
                  setDeviceId("");
                  setTest(null);
                  setNotice("");
                }}
              >
                <Plus size={15} /> Add project
              </button>
            ) : null}
          </>
        }
        renderCard={(p) => (
          <article className="record-card">
            <div className="record-card-heading">
              <div className="record-identity">
                <h2>{p.displayName}</h2>
                <small>{p.profileId}</small>
              </div>
              {statusBadge(p)}
            </div>
            <div className="record-facts">
              <span>
                Source <code>{p.sourceFolder}</code>
              </span>
              <span>
                Server <strong>{p.destination.host}</strong>
              </span>
              <RecordBadge>
                {p.runner === "devsetu-platform"
                  ? "Managed protection"
                  : `${p.preservedPaths.length} protected paths`}
              </RecordBadge>
              <RecordBadge>Revision {p.revision}</RecordBadge>
            </div>
            <details>
              <summary>More details</summary>
              <dl>
                <dt>Repository</dt>
                <dd>{p.repositoryOrigin}</dd>
                <dt>Destination folder</dt>
                <dd>{p.destination.root}</dd>
                <dt>Application</dt>
                <dd>{p.destination.siteUrl}</dd>
              </dl>
            </details>
            {rowActions(p)}
          </article>
        )}
      />
      {platform ? (
        <PlatformProjectDetails
          project={platform}
          owner={owner}
          onClose={() => setPlatform(null)}
        />
      ) : null}
      {mode && form && !folderBrowser ? (
        <WorkspaceDialog
          label={current ? (mode === "edit" ? "Edit project" : "Project details") : "Add project"}
          onClose={close}
        >
          <section className="deployment-settings project-editor">
            <header className="settings-header">
              <div>
                <p className="eyebrow">
                  Projects / {current ? current.displayName : "New project"}
                </p>
                <h2>
                  {current
                    ? mode === "edit"
                      ? "Edit configuration"
                      : "Project details"
                    : "Add project"}
                </h2>
                <div className="record-facts">
                  {current ? statusBadge(current) : <RecordBadge>New configuration</RecordBadge>}
                  {current ? <RecordBadge>Revision {current.revision}</RecordBadge> : null}
                </div>
              </div>
              <div className="settings-actions">
                <button
                  type="button"
                  className="button secondary"
                  disabled={!!busy || dirty || !current || !!current.archived}
                  onClick={() => void act("test")}
                >
                  <PlugZap size={15} /> {busy === "test" ? "Testing…" : "Test connection"}
                </button>
                {owner && mode === "view" ? (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setMode("edit")}
                  >
                    <Pencil size={15} /> Edit
                  </button>
                ) : null}
                {mode === "edit" ? (
                  <button
                    type="button"
                    className="button primary"
                    disabled={!owner || !!busy || !dirty}
                    onClick={() => void act("save")}
                  >
                    {busy === "save" ? (
                      <LoaderCircle className="deployment-spinner" size={15} />
                    ) : (
                      <Save size={15} />
                    )}{" "}
                    Save configuration
                  </button>
                ) : null}
                <button
                  type="button"
                  className="button ghost"
                  aria-label="Close project"
                  disabled={!!busy}
                  onClick={close}
                >
                  <X size={18} />
                </button>
              </div>
            </header>
            {notice ? (
              <p role="status" className="record-notice">
                {notice}
              </p>
            ) : null}
            {closeRequested ? (
              <div className="editor-close-confirmation" role="alert">
                <div>
                  <strong>Discard unsaved changes?</strong>
                  <p>Your saved project configuration will stay unchanged.</p>
                </div>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setCloseRequested(false)}
                >
                  Keep editing
                </button>
                <button type="button" className="button primary" onClick={dismiss}>
                  Discard and close
                </button>
              </div>
            ) : dirty ? (
              <div className="editor-unsaved">
                <span>Unsaved changes</span>
                <button
                  type="button"
                  className="button ghost"
                  disabled={!!busy}
                  onClick={() => {
                    if (current) select(current);
                    else {
                      dismiss();
                    }
                  }}
                >
                  Discard changes
                </button>
              </div>
            ) : null}
            <div className="project-editor-scroll">
              <fieldset disabled={!owner || !!busy || mode === "view"} className="settings-fields">
                <div className="settings-grid">
                  <section className="panel settings-card">
                    <h2>1. Source code</h2>
                    <label>
                      Project name
                      <input
                        value={form.displayName}
                        onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                      />
                    </label>
                    <label>
                      Project ID
                      <input
                        value={form.profileId}
                        readOnly={!!current}
                        placeholder="my-project-dev"
                        onChange={(e) => setForm({ ...form, profileId: e.target.value })}
                      />
                    </label>
                    <label>
                      {fixed ? "Server20 Git repository" : "Git repository URL"}
                      <input
                        value={form.repositoryOrigin}
                        readOnly={fixed}
                        placeholder="https://git.example/team/project.git"
                        onChange={(e) => setForm({ ...form, repositoryOrigin: e.target.value })}
                      />
                    </label>
                    <label>
                      Default local code folder
                      <input
                        value={form.sourceFolder}
                        onChange={(e) => setForm({ ...form, sourceFolder: e.target.value })}
                      />
                    </label>
                    <p>
                      This is the default for future installations. Each system keeps its own
                      connected folder. Use Choose local folder in System connector below to change
                      this device's checkout.
                    </p>
                  </section>
                  <section className="panel settings-card">
                    <h2>2. Destination server</h2>
                    <label>
                      Server / IP
                      <input
                        readOnly={fixed}
                        value={form.destination.host}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            destination: { ...form.destination, host: e.target.value },
                          })
                        }
                      />
                    </label>
                    <label>
                      Server project folder
                      <input
                        readOnly={fixed}
                        value={form.destination.root}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            destination: { ...form.destination, root: e.target.value },
                          })
                        }
                      />
                    </label>
                    <label>
                      Application URL
                      <input
                        readOnly={fixed}
                        value={form.destination.siteUrl}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            destination: { ...form.destination, siteUrl: e.target.value },
                          })
                        }
                      />
                    </label>
                    <p>
                      <strong>
                        {fixed
                          ? "Approved Windows / IIS + Node development runner"
                          : "Destination runner not connected"}
                      </strong>
                    </p>
                    <p>
                      {fixed
                        ? "The existing server credential is stored privately on server20. This approved target cannot be retargeted from this form."
                        : "You can save this project and pair its source connector. Deployment stays unavailable until a matching destination adapter is connected."}
                    </p>
                  </section>
                  <section className="panel settings-card">
                    <h2>3. Preserve files & folders</h2>
                    <label>
                      Never replace these project-relative paths
                      <textarea
                        rows={7}
                        value={pathsText}
                        placeholder={"backend/attachment\nbackend/uploads\nfrontend/user-content"}
                        onChange={(e) => setPathsText(e.target.value)}
                      />
                    </label>
                    <p>
                      One exact path per line, relative to the server project folder. For{" "}
                      <code>{form.destination.root}\\backend\\attachment</code>, enter{" "}
                      <code>backend/attachment</code>. Subfolders are included.
                    </p>
                    <p>
                      These paths are also skipped when DevSetu publishes new local changes.
                      Existing Git history remains unchanged.
                    </p>
                    <p>
                      Applied during deployment and rollback. Mandatory protection for .env files,
                      uploads, database, assets-data, node_modules, runtime, logs and backups always
                      remains enabled. Generated frontend assets are updated unless explicitly
                      preserved.
                    </p>
                  </section>
                  <section className="panel settings-card">
                    <h2>4. Environment & database</h2>
                    <p>
                      Deployment does not copy your laptop's .env files onto the server. Existing
                      server environment files and database/upload data remain in place.
                    </p>
                    {fixed ? (
                      <dl>
                        <dt>Environment file</dt>
                        <dd>
                          <code>D:\servixDev\backend\.env</code>
                        </dd>
                        <dt>Development database</dt>
                        <dd>10.9.69.31:3306 / servix_db_dev</dd>
                        <dt>Runtime overrides</dt>
                        <dd>
                          Port 5001; development mode; local uploads; mail/listener and scheduled
                          automation disabled.
                        </dd>
                      </dl>
                    ) : (
                      <p>
                        Environment bindings will be verified with the destination adapter. No
                        credentials have been configured for this project.
                      </p>
                    )}
                    <p>Secret values are never shown in this page.</p>
                    <p>
                      Rollback restores code; it does not reverse database rows or schema changes
                      made by application startup.
                    </p>
                  </section>
                </div>
              </fieldset>
              <section className="panel settings-card">
                <h2>5. System connector</h2>
                <p>
                  Open <strong>Setup.cmd</strong> to connect this computer for monitoring without a
                  project or Git installation. To add this project's Git folder separately, use
                  <strong> Setup-Project.cmd</strong> from the same extracted package.
                </p>
                <a
                  className="button secondary"
                  href={addBasePath("/downloads/frevos-connector.zip")}
                >
                  <Download size={16} /> Download Windows installer
                </a>
                <button
                  type="button"
                  className="button secondary"
                  disabled={
                    !current ||
                    !!current.archived ||
                    dirty ||
                    !!busy ||
                    !selected?.online ||
                    !(selected.folderPicker || selected.folderBrowser) ||
                    ["queued", "choosing"].includes(selected.folderSelection?.status ?? "")
                  }
                  onClick={() => void chooseFolder()}
                >
                  <FolderOpen size={16} /> Choose local folder
                </button>
                {selected && !selected.folderPicker && !selected.folderBrowser ? (
                  <p>Install the latest connector to enable the local folder picker.</p>
                ) : null}
                {selected?.folderSelection ? (
                  <p role="status" className="folder-selection-status">
                    {selected.folderSelection.errorCode
                      ? selected.folderSelection.errorCode.replaceAll("-", " ")
                      : folderSelectionMessage(selected.folderSelection.status)}
                  </p>
                ) : null}
                <label>
                  Your device
                  <select
                    aria-label="Project connector"
                    value={selectedId}
                    disabled={!!busy}
                    onChange={(e) => {
                      setDeviceId(e.target.value);
                      setTest(null);
                    }}
                  >
                    <option value="">Select connected system</option>
                    {projectDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.name} — {d.online ? "Online" : "Offline"}
                      </option>
                    ))}
                  </select>
                </label>
                {selected ? (
                  <div className="settings-device">
                    <span className={selected.online ? "status-online" : "status-offline"}>
                      {selected.online ? "Online" : "Offline"}
                    </span>
                    <span>{selected.name}</span>
                    <p>
                      Connected folder:{" "}
                      <code>
                        {selected.source?.repository ??
                          "Diagnostics unavailable — install the latest connector"}
                      </code>
                    </p>
                    {selected.source && owner && mode === "edit" ? (
                      <button
                        type="button"
                        className="button secondary"
                        disabled={!!busy}
                        onClick={() => {
                          if (form && selected.source) {
                            setForm({ ...form, sourceFolder: selected.source.repository });
                            setTest(null);
                          }
                        }}
                      >
                        <FolderOpen size={16} /> Use as project default
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <p>No device connected to this project yet.</p>
                )}
                <p>
                  The connector starts at sign-in and retries after disconnection. Your system and
                  VPN must be online when publishing source.
                </p>
                {selected ? (
                  <button
                    type="button"
                    className="button ghost"
                    disabled={!!busy}
                    onClick={() => void revokeDevice()}
                  >
                    Disconnect this device
                  </button>
                ) : null}
                {owner ? <DeveloperAccess api={api} workspaceId={workspaceId} /> : null}
              </section>

              {test && !dirty ? (
                <section
                  className="panel settings-card"
                  aria-label="Connection test results"
                  role="status"
                >
                  <h2>
                    {test.ready ? "Ready for development deployment" : "Connection needs attention"}
                  </h2>
                  <p>
                    Revision {test.revision} · checked {new Date(test.checkedAt).toLocaleString()} ·
                    no code or server files were changed.
                  </p>
                  <ul className="settings-checks">
                    {test.checks.map((c) => (
                      <li key={c.name} data-status={c.status}>
                        <strong>
                          {c.name} — {c.status}
                        </strong>
                        <span>{c.message}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          </section>
        </WorkspaceDialog>
      ) : null}
      {archiveTarget ? (
        <WorkspaceDialog
          label={archiveTarget.archived ? "Restore project" : "Archive project"}
          onClose={() => {
            if (!busy) setArchiveTarget(null);
          }}
        >
          <header className="settings-header">
            <h2>
              {archiveTarget.archived ? "Restore" : "Archive"} {archiveTarget.displayName}?
            </h2>
          </header>
          <div className="confirmation-content">
            <p>
              {archiveTarget.archived
                ? "Return this project to the active configuration list."
                : "New deployment actions will be unavailable. Existing application files, running releases, connectors and configuration history are retained."}
            </p>
            <div className="record-row-actions">
              <button
                type="button"
                className="button secondary"
                disabled={!!busy}
                onClick={() => setArchiveTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button primary"
                disabled={!!busy}
                onClick={() => void archiveProject()}
              >
                {busy ? "Saving…" : archiveTarget.archived ? "Restore project" : "Archive project"}
              </button>
            </div>
            {notice ? <p role="alert">{notice}</p> : null}
          </div>
        </WorkspaceDialog>
      ) : null}
      {folderBrowser && selected ? (
        <FolderBrowser
          api={api}
          workspaceId={workspaceId}
          deviceId={selected.deviceId}
          onClose={() => setFolderBrowser(false)}
          onChoose={(choice) => void chooseFolder(choice)}
          label="Connect this project folder"
        />
      ) : null}
    </>
  );
}

function folderSelectionMessage(status: string) {
  if (status === "queued") return "Waiting for the connector to open the folder picker…";
  if (status === "choosing")
    return "Choose a folder in the Windows dialog on your laptop. The request expires in 90 seconds.";
  if (status === "selected")
    return "Folder selected on your laptop. The connected folder below updates after its next repository check.";
  if (status === "cancelled")
    return "Folder selection cancelled. Your connected folder is unchanged.";
  if (status === "expired")
    return "Folder selection expired. Click Choose local folder to try again.";
  return "Folder could not be connected. Choose this project's Git checkout root and try again.";
}
