import {
  type ServicePrivateListen,
  ServicePrivateListenSchema,
  type SoftwareState,
} from "@frevos/contracts";

type Network = NonNullable<SoftwareState["device"]["capability"]>["network"];
export function serviceListenInput(
  address: string,
  clients: string,
  network: Network,
): { ready: true; listen?: ServicePrivateListen } | { ready: false; error: string } {
  if (address === "127.0.0.1") return { ready: true };
  if (network?.version !== 1)
    return { ready: false, error: "Update this computer's connector for private-IP listening." };
  if (!network.addresses.some((row) => row.address === address))
    return { ready: false, error: "Selected interface is unavailable. Choose a current address." };
  const parsed = ServicePrivateListenSchema.safeParse({
    address,
    allowedClients: clients.split(/[\s,]+/).filter(Boolean),
  });
  if (!parsed.success)
    return { ready: false, error: "Enter 1–16 different private client IPv4 addresses." };
  return { ready: true, listen: parsed.data };
}

export function ServiceListenControls({
  network,
  platform,
  address,
  clients,
  onAddress,
  onClients,
}: {
  network: Network;
  platform: "win32" | "linux";
  address: string;
  clients: string;
  onAddress: (value: string) => void;
  onClients: (value: string) => void;
}) {
  const current = network?.addresses.some((row) => row.address === address);
  const parsed = serviceListenInput(address, clients, network);
  return (
    <div className="service-listen-controls">
      <label>
        Listen on
        <select
          aria-label="Listen on"
          value={address}
          onChange={(event) => onAddress(event.target.value)}
        >
          <option value="127.0.0.1">This computer only (localhost)</option>
          {network?.addresses.map((row) => (
            <option key={row.address} value={row.address}>
              {row.name} · {row.address}
            </option>
          ))}
          {address !== "127.0.0.1" && !current ? (
            <option value={address} disabled>
              {address} · unavailable
            </option>
          ) : null}
        </select>
      </label>
      {address !== "127.0.0.1" ? (
        <>
          <label>
            Allowed client IPs
            <input
              aria-label="Allowed client IPs"
              value={clients}
              maxLength={255}
              placeholder="Private IPv4 addresses, comma separated"
              onChange={(event) => onClients(event.target.value)}
            />
          </label>
          <p>
            Localhost stays available. Direct access is limited to these clients and needs a route
            through your VPN/firewall.
          </p>
          {!parsed.ready ? <p role="status">{parsed.error}</p> : null}
        </>
      ) : null}
      {!network ? (
        <p>
          Private-IP listening needs an updated connector. Existing pairing is retained.{" "}
          <a
            href={
              platform === "win32"
                ? "/downloads/frevos-connector.zip"
                : "/downloads/devsetu-connector-linux-x64.tar.gz"
            }
          >
            Download connector update
          </a>
        </p>
      ) : null}
      {network && network.addresses.length === 0 ? (
        <p>No private IPv4 interface is available. Connect the computer's VPN and refresh.</p>
      ) : null}
    </div>
  );
}
