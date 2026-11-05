import type { SoftwareState } from "@frevos/contracts";

export function softwareInventoryStatus(state: SoftwareState | null) {
  const device = state?.device,
    capability = device?.capability,
    inventory = device?.inventory,
    pending = state?.jobs.some((job) => ["approved", "working"].includes(job.status)) ?? false;
  const scope =
    "Registered software only: Windows machine/user programs and app packages, or Linux package-manager records. Portable executables are not scanned.";
  if (!device)
    return {
      title: "Loading installed software…",
      description: "Checking this computer's connection.",
      pending,
    };
  if (!device.online)
    return {
      title: inventory ? "No registered programs in the saved snapshot" : "Computer offline",
      description:
        "Start this computer's connector to collect or refresh installed software. The last successful snapshot is retained.",
      pending,
    };
  if (!capability)
    return {
      title: "Connector update required",
      description:
        "This connection has not reported software capability. Update its connector using the latest installer; keep the existing connection and pairing.",
      pending,
    };
  if (!capability.inventoryConsent)
    return {
      title: "Inventory sharing is off",
      description:
        "On this computer, open the DevSetu connection-status icon → Software permissions → Share installed-program inventory → Save permissions. The first scan then starts automatically.",
      pending,
    };
  if (pending)
    return {
      title:
        capability.operation?.stage === "scanning"
          ? "Collecting installed software…"
          : "Software request queued",
      description:
        "The connector is processing a request. This view updates automatically; do not start another scan.",
      pending,
    };
  if (device.scan?.status === "unavailable")
    return {
      title: "Inventory scan unavailable",
      description:
        "The operating system did not return an inventory. Check the connector, then use Refresh inventory. Any displayed programs are from the last successful snapshot.",
      pending,
    };
  return {
    title: inventory ? "No registered programs reported" : "Preparing first inventory…",
    description: inventory
      ? scope
      : "Inventory sharing is enabled. The first scan starts automatically with the updated connector; you can also use Refresh inventory. " +
        scope,
    pending,
  };
}
