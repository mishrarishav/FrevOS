import {
  type ManagedService,
  type SoftwareJob,
  type SoftwarePackage,
  SoftwarePackageSchema,
  type SoftwareRequest,
  type SoftwareState,
} from "@frevos/contracts";
import {
  AppWindow,
  Boxes,
  History,
  Monitor,
  Play,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Square,
  X,
} from "lucide-react";
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
  service?: ManagedService;
};

const jobPending = (j: SoftwareJob) =>
  ["pending-approval", "approved", "working"].includes(j.status);
export function serviceControlState(
  state: SoftwareState | null,
  service: ManagedService,
  now = Date.now(),
) {
  const snapshot = state?.device.serviceInventory;
  const rule = state?.servicePolicy?.rules.find((r) => r.id === service.id);
  const enabled = rule?.enabled === true && rule.definitionSha256 === service.definitionSha256;
  const disabledStartup = service.manager === "windows-scm" && service.startupType === "Disabled";
  const pending = state?.jobs.some(jobPending) === true;
  const reason = !state?.administrator
    ? "Only an administrator can control services."
    : !state.device.online
      ? "Computer offline. Reconnect it before controlling a service."
      : !state.device.capability?.serviceManagement
        ? "Update this computer’s connector to enable Services."
        : !state.device.capability.serviceManagement.controlConsent
          ? state.device.capability.platform === "android"
            ? "On this Android device, open DevSetu Connector, enable health-sampling control and Save apps and services permissions."
            : "Enable service control once in this computer’s DevSetu Software permissions."
          : service.protected
            ? "This service is protected. Start and Stop are unavailable."
            : !snapshot ||
                now - Date.parse(snapshot.observedAt) > 90000 ||
                Date.parse(snapshot.observedAt) > now + 5000
              ? "Refresh services before controlling this service."
              : !enabled
                ? "Allow control for this service once to enable Start and Stop."
                : pending
                  ? "Another software or service request is in progress."
                  : disabledStartup && service.status === "stopped"
                    ? "This service has Disabled startup in Windows. Change its startup setting locally before starting it."
                    : "Actions use this computer’s connector account and its operating-system permissions.";
  const ready =
    !!state?.administrator &&
    state.device.online &&
    !!state.device.capability?.serviceManagement?.controlConsent &&
    !service.protected &&
    !!snapshot &&
    now - Date.parse(snapshot.observedAt) <= 90000 &&
    Date.parse(snapshot.observedAt) <= now + 5000 &&
    enabled &&
    !pending;
  return {
    enabled,
    pending,
    reason,
    start:
      ready &&
      !disabledStartup &&
      service.canStart &&
      ["stopped", "failed"].includes(service.status),
    stop: ready && service.canStop && ["running", "paused"].includes(service.status),
  };
}
export function serviceResultLabel(result: SoftwareJob["result"]) {
  switch (result) {
    case "service-started":
      return "Service started.";
    case "service-stopped":
      return "Service stopped.";
    case "os-permission-denied":
      return "The connector account does not have operating-system permission for this action.";
    case "dependents-running":
      return "Other running services depend on this service. They have not been stopped.";
    case "service-changed":
      return "The service definition changed. Refresh services and allow the updated service before retrying.";
    case "interrupted":
      return "The action did not finish. Refresh services to check its current status.";
    case "declined":
      return "The action was declined. Check service permissions and refresh before retrying.";
    case "failed":
      return "The operating system could not complete this action. Refresh services before retrying.";
    default:
      return result?.replaceAll("-", " ") ?? "Waiting for the computer…";
  }
}
const columns: RecordColumn<Row>[] = [
  { id: "name", label: "Software", value: (r) => r.name },
  { id: "version", label: "Version", value: (r) => r.version },
  { id: "publisher", label: "Publisher / requester", value: (r) => r.publisher },
  { id: "status", label: "Source / status", value: (r) => r.status },
  { id: "date", label: "Date", value: (r) => r.date },
];
const appSource: Record<string, string> = {
  registry: "Desktop app",
  appx: "Microsoft Store",
  dpkg: "Debian package",
  rpm: "RPM package",
  "android-user": "Android user app",
  "android-system": "Android system app",
};
const appColumns: RecordColumn<Row>[] = [
  { id: "name", label: "Name", value: (r) => r.name },
  { id: "publisher", label: "Publisher", value: (r) => r.publisher },
  { id: "version", label: "Version", value: (r) => r.version },
  { id: "date", label: "Installed on", value: (r) => r.date },
  { id: "status", label: "App type", value: (r) => appSource[r.status] ?? r.status },
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
  const [tab, setTab] = useState<"inventory" | "services" | "catalog" | "history">("inventory"),
    [appGroup, setAppGroup] = useState<"desktop" | "store" | "all">("desktop"),
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
  const selectionKey = `frevos:${userId}:${workspaceId}:software-${deviceId}:service-selection:v1`;
  const [selectedServiceId, setSelectedServiceId] = useState(() => {
    try {
      return sessionStorage.getItem(selectionKey) ?? "";
    } catch {
      return "";
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(selectionKey, selectedServiceId);
    } catch {
      /* Private browsing. */
    }
  }, [selectionKey, selectedServiceId]);
  const [port, setPort] = useState("5080"),
    [lifetime, setLifetime] = useState("900"),
    [listenAddress, setListenAddress] = useState("127.0.0.1"),
    [allowedClients, setAllowedClients] = useState("");
  // biome-ignore lint/correctness/useExhaustiveDependencies: generation explicitly restarts polling after an action or Retry.
  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>,
      since: string | undefined,
      servicesSince: string | undefined;
    const poll = async () => {
      try {
        if (!api.softwareState) throw Error();
        const next = await api.softwareState(
          workspaceId,
          deviceId,
          abort.signal,
          since,
          servicesSince,
        );
        since = next.device.inventoryObservedAt ?? undefined;
        servicesSince = next.device.serviceInventoryObservedAt ?? undefined;
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
              serviceInventory:
                next.device.serviceInventory ??
                (previous?.device.serviceInventoryObservedAt ===
                next.device.serviceInventoryObservedAt
                  ? previous?.device.serviceInventory
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
      | Omit<Extract<SoftwareRequest, { operation: "services-inventory" }>, "requestId">
      | Omit<Extract<SoftwareRequest, { operation: "start-service" | "stop-service" }>, "requestId">
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
        : input.operation === "services-inventory"
          ? "Services refresh requested."
          : input.operation === "start-service" || input.operation === "stop-service"
            ? `${input.operation === "start-service" ? "Start" : "Stop"} queued for the selected service. Its result will appear here.`
            : input.operation === "stop-demo"
              ? "Temporary service stop requested."
              : input.operation === "install" &&
                  state?.catalog.packages.some(
                    (p) => p.id === input.packageId && p.recipe === "demo-api",
                  )
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
    serviceInventory = state?.device.serviceInventory,
    listenInput = serviceListenInput(listenAddress, allowedClients, capability?.network);
  const android =
    (capability?.platform ?? inventory?.platform ?? serviceInventory?.platform) === "android";
  const records: Row[] =
    tab === "inventory"
      ? (inventory?.items
          .filter(
            (p) =>
              (capability?.platform ?? inventory?.platform) !== "win32" ||
              appGroup === "all" ||
              p.source === (appGroup === "store" ? "appx" : "registry"),
          )
          .map((p) => ({
            id: p.id,
            name: p.name,
            version: p.version ?? "Not reported",
            publisher: p.publisher ?? "Not reported",
            status: p.source,
            date: p.installedOn ?? "Not reported",
          })) ?? [])
      : tab === "services"
        ? (serviceInventory?.items.map((s) => ({
            id: s.id,
            name: s.displayName,
            version: s.name,
            publisher: s.manager,
            status: s.status,
            date: s.startupType,
            service: s,
          })) ?? [])
        : tab === "catalog"
          ? (state?.catalog.packages
              .filter(() => !android)
              .map((p) => ({
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
              name: j.service?.displayName ?? j.package?.name ?? j.request.operation,
              version: j.package?.version ?? "",
              publisher: j.actor,
              status: j.service
                ? `${j.request.operation === "start-service" ? "Start" : "Stop"} · ${j.status}`
                : j.status,
              date: new Date(j.createdAt).toLocaleString(),
              job: j,
            })) ?? []);
  const selectedService = serviceInventory?.items.find((s) => s.id === selectedServiceId);
  const selectedControl = selectedService ? serviceControlState(state, selectedService) : null;
  const selectedJob = state?.jobs.find((j) => j.service?.id === selectedServiceId);
  const serviceColumns: RecordColumn<Row>[] = [
    {
      id: "name",
      label: "Name",
      value: (r) => r.name,
      render: (r) => (
        <button
          type="button"
          className="software-service-name"
          aria-pressed={r.id === selectedServiceId}
          onClick={() => setSelectedServiceId(r.id)}
        >
          {r.name}
        </button>
      ),
    },
    {
      id: "status",
      label: "Status",
      value: (r) => r.status,
      render: (r) => (
        <RecordBadge
          tone={
            r.status === "running" ? "positive" : r.status === "failed" ? "negative" : "neutral"
          }
        >
          {r.status.replaceAll("-", " ")}
        </RecordBadge>
      ),
    },
    { id: "date", label: "Startup type", value: (r) => r.date },
    { id: "version", label: "Service name", value: (r) => r.version },
    { id: "publisher", label: "Manager", value: (r) => r.publisher.replaceAll("-", " ") },
  ];
  const allowService = (service: ManagedService, enabled: boolean) =>
    void act(
      async () => {
        if (!api.softwareServicePolicy || !state?.servicePolicy) throw Error();
        await api.softwareServicePolicy(workspaceId, {
          version: 1,
          deviceId,
          expectedRevision: state.servicePolicy.revision,
          rule: { id: service.id, definitionSha256: service.definitionSha256, enabled },
        });
      },
      enabled
        ? "Control enabled for this service. Start and Stop are now available within its operating-system permissions."
        : "Control disabled for this service.",
    );
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
      : android
        ? capability.inventoryConsent
          ? `Android user: ${inventory ? `${inventory.items.length} apps · ${inventory.status} · ${new Date(inventory.observedAt).toLocaleString()}` : inventoryStatus.title}. Other users/work profiles and other apps' running services are not collected.`
          : inventoryStatus.description
        : !capability.inventoryConsent && !capability.installConsent
          ? "Enable software permissions once using the DevSetu desktop connection-status icon on this computer."
          : `Inventory: ${inventory ? `${inventory.items.length} programs · ${inventory.status} · ${new Date(inventory.observedAt).toLocaleString()}${inventory.truncated ? " · truncated" : ""}` : inventoryStatus.title}. ${capability.installConsent ? "Trusted software management enabled." : "Installation disabled."}`;
  const serviceNotice = !state
    ? "Loading services…"
    : !state.device.online
      ? "Computer offline. Showing its last reported services."
      : !capability?.serviceManagement
        ? "Update this computer’s connector to report its operating-system services."
        : !capability.inventoryConsent
          ? "Enable inventory sharing in this computer’s DevSetu Software permissions to read services."
          : !serviceInventory
            ? "The connector is collecting services. Use Refresh services to request a new scan."
            : `Last updated ${new Date(serviceInventory.observedAt).toLocaleString()} · ${serviceInventory.status}${serviceInventory.truncated ? " · list truncated" : ""}${serviceInventory.platform === "android" ? " · DevSetu-owned services only. Android does not expose other apps' running services or allow their remote control." : ""}`;
  return (
    <WorkspaceDialog label={`Apps and services on ${name}`} onClose={onClose}>
      <div className="software-workspace">
        <aside className="software-sidebar" aria-label="Apps and services navigation">
          <div className="software-computer">
            <Monitor size={22} />
            <div>
              <strong>{name}</strong>
              <span>{state?.device.online ? "Connected" : state ? "Offline" : "Connecting…"}</span>
            </div>
          </div>
          <nav aria-label="Apps and services sections">
            {(
              [
                ["inventory", "Installed apps", AppWindow],
                ["services", "Services", Settings2],
                ["catalog", "Approved catalogue", Boxes],
                ["history", "History", History],
              ] as const
            )
              .filter(([id]) => !android || id !== "catalog")
              .map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  aria-current={tab === id ? "page" : undefined}
                  onClick={() => {
                    setTab(id);
                    setEditing(false);
                    setNotice("");
                  }}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                </button>
              ))}
          </nav>
          <div className="software-access">
            <ShieldCheck size={16} />
            <span>{state?.administrator ? "Administrator" : "Authorized computer view"}</span>
          </div>
        </aside>
        <div
          className={`software-content ${tab === "services" && selectedService ? "with-service-details" : ""}`}
        >
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
              key={`${tab}-${tab === "inventory" ? appGroup : ""}`}
              title={
                tab === "inventory"
                  ? "Installed apps"
                  : tab === "services"
                    ? "Services"
                    : tab === "catalog"
                      ? "Approved catalogue"
                      : "History"
              }
              breadcrumb="Systems / Discovery / Apps & services"
              scopeName={name}
              userId={userId}
              workspaceId={workspaceId}
              page={`software-${deviceId}-${tab}${tab === "inventory" ? `-${appGroup}` : ""}`}
              records={records}
              columns={
                tab === "services"
                  ? serviceColumns
                  : tab === "inventory"
                    ? appColumns.map((column) =>
                        android && column.id === "publisher"
                          ? { ...column, label: "Package ID" }
                          : column,
                      )
                    : columns
              }
              identify={(r) => r.id}
              statusOf={(r) => r.status}
              statuses={
                tab === "services"
                  ? [
                      { id: "running", label: "Running" },
                      { id: "stopped", label: "Stopped" },
                      { id: "failed", label: "Failed" },
                    ]
                  : []
              }
              renderActions={actions}
              hideActions={tab === "inventory" || tab === "services"}
              renderCard={(r) => (
                <article className="record-card">
                  <header>
                    <h2>
                      {r.service ? (
                        <button
                          type="button"
                          className="software-service-name"
                          aria-pressed={r.id === selectedServiceId}
                          onClick={() => setSelectedServiceId(r.id)}
                        >
                          {r.name}
                        </button>
                      ) : (
                        r.name
                      )}
                    </h2>
                    <RecordBadge tone={r.service?.status === "running" ? "positive" : "neutral"}>
                      {tab === "inventory" ? (appSource[r.status] ?? r.status) : r.status}
                    </RecordBadge>
                  </header>
                  <p>
                    {r.service ? "Service name" : "Version"}: {r.version || "Not reported"}
                  </p>
                  <p>{r.publisher}</p>
                  {r.date ? (
                    <p>
                      {r.service ? "Startup type: " : ""}
                      {r.date}
                    </p>
                  ) : null}
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
              noun={tab === "services" ? "services" : "software"}
              pageSize={50}
              loading={!state && !error}
              error={error}
              onRetry={() => setGeneration((g) => g + 1)}
              notice={[
                tab === "inventory" && state?.device.scan?.status === "unavailable"
                  ? "Latest scan unavailable. Any displayed programs are from the last successful snapshot."
                  : "",
                tab === "services" && state?.device.serviceScan?.status === "unavailable"
                  ? "Latest services scan unavailable. Displayed services are from the last successful snapshot."
                  : "",
                tab === "services" ? serviceNotice : tab === "inventory" ? statusNotice : "",
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
                  : tab === "services"
                    ? "No services reported"
                    : tab === "catalog"
                      ? "No approved packages"
                      : "No installation requests"
              }
              emptyDescription={
                tab === "inventory"
                  ? inventoryStatus.description
                  : tab === "services"
                    ? serviceNotice
                    : tab === "catalog"
                      ? "An administrator can add approved packages. Sources, versions and artifact hashes are configurable."
                      : "No software requests are recorded for your authorized view."
              }
              actions={
                <>
                  {tab === "inventory" &&
                  (capability?.platform ?? inventory?.platform) === "win32" ? (
                    <label className="software-app-group">
                      <span className="sr-only">Application source</span>
                      <select
                        aria-label="Application source"
                        value={appGroup}
                        onChange={(e) => setAppGroup(e.target.value as typeof appGroup)}
                      >
                        <option value="desktop">Control Panel apps</option>
                        <option value="store">Microsoft Store apps</option>
                        <option value="all">All registered apps</option>
                      </select>
                    </label>
                  ) : null}
                  {tab === "services" ? (
                    <button
                      type="button"
                      className="button secondary"
                      disabled={
                        busy ||
                        state?.jobs.some(jobPending) ||
                        !state?.device.online ||
                        !capability?.serviceManagement ||
                        !capability.inventoryConsent
                      }
                      onClick={() =>
                        void request({ version: 1, deviceId, operation: "services-inventory" })
                      }
                    >
                      <RefreshCw size={15} /> Refresh services
                    </button>
                  ) : null}
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
                      {inventoryStatus.pending ? "Request in progress…" : "Refresh inventory"}
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
                      {capability && capability.platform !== "android" ? (
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
          {tab === "services" && !editing && selectedService && selectedControl ? (
            <aside className="software-service-details" aria-label="Selected service">
              <header>
                <Settings2 size={20} />
                <h2>{selectedService.displayName}</h2>
                <button
                  type="button"
                  className="button ghost"
                  aria-label="Close service details"
                  onClick={() => setSelectedServiceId("")}
                >
                  <X size={16} />
                </button>
              </header>
              <RecordBadge
                tone={
                  selectedService.status === "running"
                    ? "positive"
                    : selectedService.status === "failed"
                      ? "negative"
                      : "neutral"
                }
              >
                {selectedService.status.replaceAll("-", " ")}
              </RecordBadge>
              <div className="software-service-buttons">
                <button
                  type="button"
                  className="button primary"
                  disabled={busy || !selectedControl.start}
                  onClick={() =>
                    void request({
                      version: 1,
                      deviceId,
                      operation: "start-service",
                      serviceId: selectedService.id,
                      policyRevision: state!.servicePolicy!.revision,
                    })
                  }
                >
                  <Play size={15} /> Start
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy || !selectedControl.stop}
                  onClick={() =>
                    void request({
                      version: 1,
                      deviceId,
                      operation: "stop-service",
                      serviceId: selectedService.id,
                      policyRevision: state!.servicePolicy!.revision,
                    })
                  }
                >
                  <Square size={15} /> Stop
                </button>
              </div>
              <dl>
                <dt>Service name</dt>
                <dd>{selectedService.name}</dd>
                <dt>Startup type</dt>
                <dd>{selectedService.startupType}</dd>
                <dt>Manager</dt>
                <dd>{selectedService.manager.replaceAll("-", " ")}</dd>
              </dl>
              {selectedService.description ? (
                <p className="software-service-description">{selectedService.description}</p>
              ) : null}
              <p className="software-service-help">{selectedControl.reason}</p>
              {state?.administrator ? (
                <label className="software-service-toggle">
                  <input
                    type="checkbox"
                    checked={selectedControl.enabled}
                    disabled={busy || selectedService.protected || !state.servicePolicy}
                    onChange={(e) => allowService(selectedService, e.target.checked)}
                  />
                  <span>Allow control for this service</span>
                </label>
              ) : null}
              {selectedControl.enabled &&
              ((selectedService.status === "stopped" && !selectedService.canStart) ||
                (selectedService.status === "running" && !selectedService.canStop)) ? (
                <p className="software-service-help">
                  The connector account does not have the required OS right, or this service does
                  not accept the action.
                </p>
              ) : null}
              {selectedJob ? (
                <div className="software-service-result" role="status">
                  <strong>
                    {selectedJob.request.operation === "start-service" ? "Start" : "Stop"} ·{" "}
                    {selectedJob.status}
                  </strong>
                  <p>{serviceResultLabel(selectedJob.result)}</p>
                  <small>{new Date(selectedJob.createdAt).toLocaleString()}</small>
                </div>
              ) : null}
            </aside>
          ) : null}
        </div>
      </div>
    </WorkspaceDialog>
  );
}
