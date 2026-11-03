import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ServiceListenControls, serviceListenInput } from "../src/ServiceListenControls.js";
const network = {
  version: 1 as const,
  addresses: [{ name: "Private adapter", address: "10.20.30.40" }],
};
it("keeps legacy loopback input compatible and rejects missing, stale or unbounded direct bindings", () => {
  expect(serviceListenInput("127.0.0.1", "", undefined)).toEqual({ ready: true });
  expect(serviceListenInput("10.20.30.40", "10.20.30.41", undefined).ready).toBe(false);
  expect(serviceListenInput("10.20.30.99", "10.20.30.41", network).ready).toBe(false);
  for (const clients of ["", "0.0.0.0", "8.8.8.8", "10.20.30.41,10.20.30.41"])
    expect(serviceListenInput("10.20.30.40", clients, network).ready).toBe(false);
  expect(serviceListenInput("10.20.30.40", "10.20.30.41, 192.168.1.4", network)).toEqual({
    ready: true,
    listen: { address: "10.20.30.40", allowedClients: ["10.20.30.41", "192.168.1.4"] },
  });
});
it("renders only reported interfaces and an explicit connector update path for old agents", () => {
  const props = {
    platform: "linux" as const,
    address: "127.0.0.1",
    clients: "",
    onAddress: () => {},
    onClients: () => {},
  };
  const legacy = renderToStaticMarkup(<ServiceListenControls {...props} network={undefined} />);
  expect(legacy).toContain("This computer only");
  expect(legacy).toContain("devsetu-connector-linux-x64.tar.gz");
  expect(legacy).not.toContain("10.20.30.40");
  const current = renderToStaticMarkup(
    <ServiceListenControls {...props} network={network} address="10.20.30.40" />,
  );
  expect(current).toContain("Private adapter");
  expect(current).toContain("Allowed client IPs");
  expect(current).toContain("VPN/firewall");
  const gone = renderToStaticMarkup(
    <ServiceListenControls {...props} network={network} address="10.20.30.99" />,
  );
  expect(gone).toContain("unavailable");
  expect(gone).toContain("disabled");
});
