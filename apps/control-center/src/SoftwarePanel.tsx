import {
  type SoftwareJob,
  type SoftwarePackage,
  SoftwarePackageSchema,
  type SoftwareRequest,
  type SoftwareState,
} from "@frevos/contracts";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ControlCenterApi } from "./api.js";
import { deploymentRequestId } from "./deployment-request-id.js";
import { RecordBadge, type RecordColumn, RecordWorkspace } from "./RecordWorkspace.js";
import { ServiceListenControls, serviceListenInput } from "./ServiceListenControls.js";
import { softwareInventoryStatus } from "./software-inventory-status.js";
import { VpnPreviewButton } from "./VpnPreviewButton.js";
import { WorkspaceDialog } from "./WorkspaceDialog.js";

type Row = {
  id: string;
  name: string;
  version: string;
  publisher: string;
  status: string;
  date: string;
  package?: SoftwarePackage;
  job?: SoftwareJob;
};
const columns: RecordColumn<Row>[] = [
  { id: "name", label: "Software", value: (r) => r.name },
  { id: "version", label: "Version", value: (r) => r.version },
  { id: "publisher", label: "Publisher / requester", value: (r) => r.publisher },
  { id: "status", label: "Source / status", value: (r) => r.status },
  { id: "date", label: "Date", value: (r) => r.date },
];
export function SoftwarePanel({
  api,
  workspaceId,
  userId,
  deviceId,
  name,
  onClose,
}: {
  api: ControlCenterApi;
  workspaceId: string;
  userId: string;
  deviceId: string;
  name: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<SoftwareState | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [generation, setGeneration] = useState(0);
  const [tab, setTab] = useState<"inventory" | "catalog" | "history">("inventory"),
    [editing, setEditing] = useState(false),
    [editingId, setEditingId] = useState<string | null>(null),
    [draft, setDraft] = useState({
      id: "",
      name: "",
      version: "",
      publisher: "",
      recipe: "windows-msi",
      platform: "win32",
      url: "",
      sha256: "",
      bytes: "",
      signer: "",
      enabled: true,
    });
  const [port, setPort] = useState("5080"),
    [lifetime, setLifetime] = useState("900"),
    [listenAddress, setListenAddress] = useState("127.0.0.1"),
    [allowedClients, setAllowedClients] = useState("");
  // biome-ignore lint/correctness/useExhaustiveDependencies: generation explicitly restarts polling after an action or Retry.
  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>, since: string | undefined;
    const poll = async () => {
      try {
        if (!api.softwareState) throw Error();
        const next = await api.softwareState(workspaceId, deviceId, abort.signal, since);
        since = next.device.inventoryObservedAt ?? undefined;
        if (!abort.signal.aborted) {
          setState((previous) => ({
            ...next,
            device: {
              ...next.device,
              inventory:
                next.device.inventory ??
                (previous?.device.inventoryObservedAt === next.device.inventoryObservedAt
                  ? previous.device.inventory
                  : null),
            },
          }));
          setError("");
        }
      } catch {
        if (!abort.signal.aborted)
          setError(
            "Software information could not be loaded. Check your account and connector connection.",
          );
      } finally {
        if (!abort.signal.aborted) timer = setTimeout(poll, 5000);
      }
    };
    void poll();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [api, workspaceId, deviceId, generation]);
  const act = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setNotice("");
    try {
      await fn();
      setNotice(success);
      setGeneration((g) => g + 1);
    } catch {
      setNotice(
        "Action did not complete. Refresh the catalogue and check device permissions, package revision and connection.",
      );
    } finally {
      setBusy(false);
    }
  };
  const request = (
    input:
      | Omit<Extract<SoftwareRequest, { operation: "inventory" }>, "requestId">
      | Omit<Extract<SoftwareRequest, { operation: "install" }>, "requestId">
      | Omit<Extract<SoftwareRequest, { operation: "stop-demo" }>, "requestId">,
  ) => {
    const value = { ...input, requestId: deploymentRequestId("sw") };
    return act(
      async () => {
        if (!api.softwareRequest) throw Error();
        await api.softwareRequest(workspaceId, value);
      },
      input.operation === "inventory"
        ? "Inventory refresh requested."
        : input.operation === "stop-demo"
          ? "Temporary service stop requested."
          : state?.catalog.packages.some((p) => p.id === input.packageId && p.recipe === "demo-api")
            ? state.administrator
              ? "API start queued. Its address will appear when the computer reports it running."
              : "API start sent for administrator approval."
            : state?.administrator
              ? "Approved installation queued."
              : "Installation request sent for administrator approval.",
    );
  };
  const capability = state?.device.capability,
    inventory = state?.device.inventory,
    listenInput = serviceListenInput(listenAddress, allowedClients, capability?.network);
  const records: Row[] =
    tab === "inventory"
      ? (inventory?.items.map((p) => ({
          id: p.id,
          name: p.name,
          version: p.version ?? "Not reported",
          publisher: p.publisher ?? "Not reported",
          status: p.source,
          date: p.installedOn ?? "Not reported",
        })) ?? [])
      : tab === "catalog"
        ? (state?.catalog.packages.map((p) => ({
            id: p.id,
            name: p.name,
            version: p.version,
            publisher: p.publisher,
            status: p.enabled ? p.recipe : "disabled",
            date: "",
            package: p,
          })) ?? [])
        : (state?.jobs.map((j) => ({
            id: j.request.requestId,
            name: j.package?.name ?? j.request.operation,
            version: j.package?.version ?? "",
            publisher: j.actor,
            status: j.status,
            date: new Date(j.createdAt).toLocaleString(),
            job: j,
          })) ?? []);
  const edit = (p?: SoftwarePackage) => {
    setEditingId(p?.id ?? null);
    setDraft(
      p
        ? {
            id: p.id,
            name: p.name,
            version: p.version,
            publisher: p.publisher,
            recipe: p.recipe,
            platform: p.platform,
            url: p.recipe === "demo-api" ? "" : p.asset.url,
            sha256: p.recipe === "demo-api" ? p.programSha256 : p.asset.sha256,
            bytes: p.recipe === "demo-api" ? "" : String(p.asset.bytes),
            signer: p.recipe === "demo-api" ? "" : (p.asset.signerThumbprint ?? ""),
            enabled: p.enabled,
          }
        : {
            id: "",
            name: "",
            version: "",
            publisher: "",
            recipe: capability?.platform === "linux" ? "linux-deb" : "windows-msi",
            platform: capability?.platform ?? "win32",
            url: "",
            sha256: "",
            bytes: "",
            signer: "",
            enabled: true,
          },
    );
    setEditing(true);
  };
  const save = async () => {
    if (!state || !api.softwareCatalog) return;
    const parsed = SoftwarePackageSchema.safeParse({
      id: draft.id,
      name: draft.name,
      version: draft.version,
      publisher: draft.publisher,
      enabled: draft.enabled,
      platform:
        draft.recipe === "windows-msi"
          ? "win32"
          : draft.recipe === "demo-api"
            ? draft.platform
            : "linux",
      recipe: draft.recipe,
      ...(draft.recipe === "demo-api"
        ? { programSha256: state.demoProgramSha256 }
        : {
            asset: {
              url: draft.url,
              sha256: draft.sha256,
              bytes: Number(draft.bytes),
              ...(draft.signer ? { signerThumbprint: draft.signer } : {}),
            },
          }),
    });
    if (!parsed.success) {
      setNotice(
        "Check the package name/id, version, platform, HTTPS source, exact size and SHA-256. Commands and installer arguments are not accepted.",
      );
      return;
    }
    await act(async () => {
      await api.softwareCatalog!(workspaceId, {
        version: 1,
        expectedRevision: state.catalog.revision,
        packages: [...state.catalog.packages.filter((p) => p.id !== parsed.data.id), parsed.data],
      });
      setEditing(false);
    }, "Catalogue saved with a new revision.");
  };
  const actions = (row: Row) => {
    if (row.package) {
      const pkg = row.package,
        runningService = capability?.services.find((service) => service.id === pkg.id);
      return (
        <>
          <button
            type="button"
            className="button secondary"
            disabled={
              busy ||
              !pkg.enabled ||
              !state?.device.online ||
              !capability?.installConsent ||
              pkg.platform !== capability.platform ||
              (pkg.recipe === "demo-api" &&
                (capability.services.length > 0 ||
                  pkg.programSha256 !== capability.programSha256 ||
                  !listenInput.ready ||
                  !Number.isInteger(Number(port)) ||
                  Number(port) < 1024 ||
                  Number(port) > 65535 ||
                  !Number.isInteger(Number(lifetime)) ||
                  Number(lifetime) < 60 ||
                  Number(lifetime) > 1800))
            }
            onClick={() =>
              void request({
                version: 1,
                deviceId,
                operation: "install",
                packageId: pkg.id,
                packageDigest: state!.packageDigests[pkg.id]!,
                ...(pkg.recipe === "demo-api"
                  ? {
                      port: Number(port),
                      lifetimeSeconds: Number(lifetime),
                      ...(listenInput.ready && listenInput.listen
                        ? { listen: listenInput.listen }
                        : {}),
                    }
                  : {}),
              })
            }
          >
            {pkg.recipe === "demo-api"
              ? state?.administrator
                ? "Start API"
                : "Request API start"
              : state?.administrator
                ? "Install"
                : "Request install"}
          </button>
          {pkg.recipe === "demo-api" && pkg.programSha256 !== capability?.programSha256 ? (
            <p>
              Connector and approved API versions differ. Update the connector, then approve the
              current bundled API version.
            </p>
          ) : null}
          {pkg.recipe === "demo-api" &&
          state?.administrator &&
          state.demoProgramSha256 &&
          pkg.programSha256 !== state.demoProgramSha256 ? (
            <button
              type="button"
              className="button secondary"
              disabled={busy || capability?.programSha256 !== state.demoProgramSha256}
              onClick={() =>
                void act(async () => {
                  const programSha256 = state.demoProgramSha256;
                  if (!api.softwareCatalog || !programSha256) throw Error();
                  await api.softwareCatalog(workspaceId, {
                    version: 1,
                    expectedRevision: state.catalog.revision,
                    packages: state.catalog.packages.map((p) =>
                      p.id === pkg.id ? { ...pkg, programSha256 } : p,
                    ),
                  });
                }, "Bundled API version approved with a new catalogue revision.")
              }
            >
              Approve API update
            </button>
          ) : null}
          {state?.administrator ? (
            <button
              type="button"
              className="button ghost"
              disabled={busy}
              onClick={() => edit(pkg)}
            >
              Edit
            </button>
          ) : null}
          {pkg.recipe === "demo-api" && runningService ? (
            <>
              <VpnPreviewButton
                api={api}
                workspaceId={workspaceId}
                deviceId={deviceId}
                serviceId={pkg.id}
              />
              {runningService.listen ? (
                <div>
                  <p>
                    Hosted on {name} · localhost:{runningService.port}
                  </p>
                  <a
                    href={`http://${runningService.listen.address}:${runningService.port}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open direct API · {runningService.listen.address}:{runningService.port}
                  </a>
                  <p>
                    Allowed clients: {runningService.listen.allowedClients.join(", ")}. VPN/firewall
                    reachability is not inferred from the listener.
                  </p>
                </div>
              ) : (
                <p>
                  Hosted on {name} · localhost:
                  {runningService.port}
                </p>
              )}
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() =>
                  void request({ version: 1, deviceId, operation: "stop-demo", serviceId: pkg.id })
                }
              >
                Stop temporary API
              </button>
            </>
          ) : null}
        </>
      );
    }
    const job = row.job;
    if (!job) return null;
    return (
      <>
        {job.status === "pending-approval" && state?.administrator ? (
          <>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  if (!api.softwareDecision) throw Error();
                  await api.softwareDecision(workspaceId, {
                    requestId: job.request.requestId,
                    digest: job.digest,
                    decision: "approve",
                  });
                }, "Exact package/device request approved.")
              }
            >
              Approve install
            </button>
            <button
              type="button"
              className="button ghost"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  if (!api.softwareDecision) throw Error();
                  await api.softwareDecision(workspaceId, {
                    requestId: job.request.requestId,
                    digest: job.digest,
                    decision: "reject",
                  });
                }, "Request rejected.")
              }
            >
              Reject
            </button>
          </>
        ) : null}
        <details>
          <summary>Approval and artifact details</summary>
          <p>Request: {job.request.requestId}</p>
          <p>Request digest: {job.digest}</p>
          {job.request.operation === "install" && job.request.listen ? (
            <p>
              Listen: {job.request.listen.address}:{job.request.port} · allowed clients:{" "}
              {job.request.listen.allowedClients.join(", ")}
            </p>
          ) : null}
          {job.package ? (
            <p>
              Artifact SHA-256:{" "}
              {job.package.recipe === "demo-api"
                ? job.package.programSha256
                : job.package.asset.sha256}
            </p>
          ) : null}
          <p>
            Result: {job.result ?? "Waiting"}
            {job.restartRequired ? " · OS restart required" : ""}
          </p>
          {job.approval ? (
            <p>
              Approved by {job.approval.actor} · expires{" "}
              {new Date(job.approval.expiresAt).toLocaleString()}
            </p>
          ) : null}
        </details>
      </>
    );
  };
  const inventoryStatus = softwareInventoryStatus(state);
  const statusNotice = !state
    ? "Loading software capability…"
    : !capability
      ? inventoryStatus.description
      : !capability.inventoryConsent && !capability.installConsent
        ? "Enable software permissions once using the DevSetu desktop connection-status icon on this computer."
        : `Inventory: ${inventory ? `${inventory.items.length} programs · ${inventory.status} · ${new Date(inventory.observedAt).toLocaleString()}${inventory.truncated ? " · truncated" : ""}` : inventoryStatus.title}. ${capability.installConsent ? "Trusted software management enabled." : "Installation disabled."}`;
  return (
    <WorkspaceDialog label={`Software on ${name}`} onClose={onClose}>
      <div className="software-workspace">
        {editing ? (
          <section className="software-editor">
            <header>
              <h2>Approved software package</h2>
              <button type="button" className="button ghost" onClick={() => setEditing(false)}>
                Back to catalogue
              </button>
            </header>
            <p>
              Configure a fixed installer or the bundled temporary demo API. Each install uses the
              exact reviewed package digest.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              {(
                [
                  ["id", "Package ID"],
                  ["name", "Name"],
                  ["version", "Version"],
                  ["publisher", "Publisher"],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    required
                    disabled={key === "id" && editingId !== null}
                    value={draft[key]}
                    maxLength={key === "id" ? 60 : 180}
                    onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                  />
                </label>
              ))}
              <label>
                Installer recipe
                <select
                  value={draft.recipe}
                  onChange={(e) => setDraft((d) => ({ ...d, recipe: e.target.value }))}
                >
                  <option value="windows-msi">Windows MSI</option>
                  <option value="linux-deb">Linux DEB</option>
                  <option value="linux-rpm">Linux RPM</option>
                  <option value="demo-api">Temporary demo API</option>
                </select>
              </label>
              {draft.recipe === "demo-api" ? (
                <>
                  <label>
                    Computer platform
                    <select
                      value={draft.platform}
                      onChange={(e) => setDraft((d) => ({ ...d, platform: e.target.value }))}
                    >
                      <option value="win32">Windows</option>
                      <option value="linux">Linux</option>
                    </select>
                  </label>
                  <p>Bundled program SHA-256: {state?.demoProgramSha256 ?? "Unavailable"}</p>
                </>
              ) : (
                <>
                  <label>
                    Installer HTTPS URL
                    <input
                      type="url"
                      required
                      value={draft.url}
                      onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
                    />
                  </label>
                  <label>
                    Artifact SHA-256
                    <input
                      required
                      value={draft.sha256}
                      onChange={(e) => setDraft((d) => ({ ...d, sha256: e.target.value }))}
                    />
                  </label>
                  <label>
                    Exact file size in bytes
                    <input
                      type="number"
                      min="1"
                      max="262144000"
                      required
                      value={draft.bytes}
                      onChange={(e) => setDraft((d) => ({ ...d, bytes: e.target.value }))}
                    />
                  </label>
                  {draft.recipe === "windows-msi" ? (
                    <label>
                      Expected signing certificate thumbprint (optional)
                      <input
                        value={draft.signer}
                        onChange={(e) => setDraft((d) => ({ ...d, signer: e.target.value }))}
                      />
                    </label>
                  ) : null}
                </>
              )}
              <label>
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked }))}
                />{" "}
                Enabled in approved catalogue
              </label>
              <button type="submit" className="button primary" disabled={busy}>
                Save catalogue
              </button>
              <p role="status">{notice}</p>
            </form>
          </section>
        ) : (
          <RecordWorkspace<Row>
            key={tab}
            title={`Software · ${name}`}
            breadcrumb="Systems / Discovery / Software"
            scopeName={name}
            userId={userId}
            workspaceId={workspaceId}
            page={`software-${deviceId}-${tab}`}
            records={records}
            columns={columns}
            identify={(r) => r.id}
            statusOf={(r) => r.status}
            statuses={[]}
            renderActions={actions}
            renderCard={(r) => (
              <article className="record-card">
                <header>
                  <h2>{r.name}</h2>
                  <RecordBadge>{r.status}</RecordBadge>
                </header>
                <p>Version: {r.version || "Not reported"}</p>
                <p>{r.publisher}</p>
                {r.date ? <p>{r.date}</p> : null}
                {r.package ? (
                  <details>
                    <summary>Installer details</summary>
                    <p>
                      {r.package.recipe === "demo-api"
                        ? "Bundled temporary API; no existing project is used."
                        : r.package.asset.url}
                    </p>
                    <p>
                      SHA-256:{" "}
                      {r.package.recipe === "demo-api"
                        ? r.package.programSha256
                        : r.package.asset.sha256}
                    </p>
                  </details>
                ) : null}
                <div className="record-actions">{actions(r)}</div>
              </article>
            )}
            defaultView="table"
            noun="software"
            pageSize={50}
            loading={!state && !error}
            error={error}
            onRetry={() => setGeneration((g) => g + 1)}
            notice={[
              state?.device.scan?.status === "unavailable"
                ? "Latest scan unavailable. Any displayed programs are from the last successful snapshot."
                : "",
              statusNotice,
              capability?.operation
                ? `Current operation: ${capability.operation.stage.replaceAll("-", " ")} since ${new Date(capability.operation.startedAt).toLocaleTimeString()}.`
                : "",
              notice,
            ]
              .filter(Boolean)
              .join(" ")}
            emptyTitle={
              tab === "inventory"
                ? inventoryStatus.title
                : tab === "catalog"
                  ? "No approved packages"
                  : "No installation requests"
            }
            emptyDescription={
              tab === "inventory"
                ? inventoryStatus.description
                : tab === "catalog"
                  ? "An administrator can add approved packages. Sources, versions and artifact hashes are configurable."
                  : "No software requests are recorded for your authorized view."
            }
            actions={
              <>
                <div role="tablist" aria-label="Software view">
                  {(
                    [
                      ["inventory", "Installed software"],
                      ["catalog", "Approved catalogue"],
                      ["history", "Install history"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={tab === id}
                      className="button secondary"
                      onClick={() => setTab(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {tab === "inventory" ? (
                  <button
                    type="button"
                    className="button secondary"
                    disabled={
                      busy ||
                      inventoryStatus.pending ||
                      !state?.device.online ||
                      !capability?.inventoryConsent
                    }
                    onClick={() => void request({ version: 1, deviceId, operation: "inventory" })}
                  >
                    {inventoryStatus.pending
                      ? "Inventory / software request in progress…"
                      : "Refresh inventory"}
                  </button>
                ) : null}
                {tab === "catalog" ? (
                  <>
                    {state?.administrator ? (
                      <button
                        type="button"
                        className="button secondary"
                        disabled={busy}
                        onClick={() => edit()}
                      >
                        Add approved package
                      </button>
                    ) : null}
                    <label>
                      Demo API port
                      <input
                        aria-label="Demo API port"
                        type="number"
                        min="1024"
                        max="65535"
                        value={port}
                        onChange={(e) => setPort(e.target.value)}
                      />
                    </label>
                    <label>
                      Demo lifetime (seconds)
                      <input
                        aria-label="Demo lifetime (seconds)"
                        type="number"
                        min="60"
                        max="1800"
                        value={lifetime}
                        onChange={(e) => setLifetime(e.target.value)}
                      />
                    </label>
                    {capability ? (
                      <ServiceListenControls
                        network={capability.network}
                        platform={capability.platform}
                        address={listenAddress}
                        clients={allowedClients}
                        onAddress={setListenAddress}
                        onClients={setAllowedClients}
                      />
                    ) : null}
                  </>
                ) : null}
                <button
                  type="button"
                  className="button ghost"
                  aria-label="Close software"
                  onClick={onClose}
                >
                  <X size={16} />
                </button>
              </>
            }
          />
        )}
      </div>
    </WorkspaceDialog>
  );
}
