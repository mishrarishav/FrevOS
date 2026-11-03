import { once } from "node:events";
import { createServer, request } from "node:http";
import { createRequire } from "node:module";
import { expect, it } from "vitest";
const require = createRequire(import.meta.url),
  protocol = require("../../../deployment/servix/SoftwareProtocol.cjs"),
  demo = require("../../../deployment/servix/DemoApi.cjs"),
  os = require("node:os");
async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as import("node:net").AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}
function call(host: string, port: number, headers = {}, method = "GET", body = "") {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = request({ host, port, path: "/api/echo", headers, method, agent: false }, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
    });
    req.on("error", reject);
    req.setTimeout(5000, () => req.destroy(Error("fixture request deadline")));
    req.end(body);
  });
}
it("reports only assigned canonical private interfaces and enforces client, Host and browser Origin boundaries", () => {
  expect(
    protocol.privateInterfaces({
      VPN: [
        { address: "10.20.30.40", internal: false },
        { address: "8.8.8.8", internal: false },
        { address: "127.0.0.1", internal: true },
      ],
      Alias: [{ address: "10.20.30.40", internal: false }],
    }),
  ).toEqual([{ name: "Alias", address: "10.20.30.40" }]);
  const config = {
    port: 5080,
    listen: { address: "10.20.30.40", allowedClients: ["10.20.30.41"] },
  };
  const req = {
    method: "POST",
    headers: { host: "10.20.30.40:5080", origin: "http://10.20.30.40:5080" },
    socket: { localAddress: "10.20.30.40", remoteAddress: "::ffff:10.20.30.41" },
  };
  expect(demo.requestAllowed(req, config)).toBe(true);
  expect(
    demo.requestAllowed(
      { ...req, socket: { ...req.socket, remoteAddress: "10.20.30.42" } },
      config,
    ),
  ).toBe(false);
  expect(
    demo.requestAllowed(
      { ...req, headers: { ...req.headers, host: "untrusted.invalid:5080" } },
      config,
    ),
  ).toBe(false);
  expect(demo.requestAllowed({ ...req, headers: { ...req.headers, origin: "null" } }, config)).toBe(
    false,
  );
  expect(
    demo.requestAllowed(
      { ...req, headers: { ...req.headers, origin: "http://untrusted.invalid" } },
      config,
    ),
  ).toBe(false);
  expect(
    demo.requestAllowed(
      {
        ...req,
        headers: { host: "localhost:5080", origin: "http://localhost:5080" },
        socket: { localAddress: "127.0.0.1", remoteAddress: "127.0.0.1" },
      },
      config,
    ),
  ).toBe(true);
});
it("opens real loopback and private sockets together and closes both without changing network configuration", async () => {
  const address = protocol.privateInterfaces(os.networkInterfaces())[0]?.address;
  if (!address)
    throw Error("Docker/assigned private IPv4 interface required for actual socket qualification");
  const port = await freePort(),
    config = {
      name: "Synthetic dual listener",
      instance: `sw_${"a".repeat(32)}`,
      port,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      listen: { address, allowedClients: ["10.20.30.41"] },
    };
  const server = demo.start(config);
  try {
    await once(server, "listening");
    for (const host of ["127.0.0.1", address]) {
      const result = await call(host, port);
      expect(result.status).toBe(200);
      expect(JSON.parse(result.body).instance).toBe(config.instance);
    }
    expect((await call(address, port, { host: "untrusted.invalid" })).status).toBe(403);
    expect(
      (await call(address, port, { origin: "http://untrusted.invalid" }, "POST", "bad")).status,
    ).toBe(403);
    const post = await call(
      address,
      port,
      { origin: `http://${address}:${port}` },
      "POST",
      "direct-socket-nonce",
    );
    expect(post.status).toBe(200);
    expect(JSON.parse(post.body).received).toBe("direct-socket-nonce");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  await expect(call(address, port)).rejects.toThrow();
  await expect(call("127.0.0.1", port)).rejects.toThrow();
  expect(() => demo.start({ ...config, listen: { ...config.listen, address: "0.0.0.0" } })).toThrow(
    "config-denied",
  );
});
it("fails private-port conflicts without stopping the unrelated listener", async () => {
  const address = protocol.privateInterfaces(os.networkInterfaces())[0]?.address;
  if (!address) throw Error("Assigned private interface required");
  const unrelated = createServer((_req, res) => res.end("unrelated fixture preserved"));
  unrelated.listen(0, address);
  await once(unrelated, "listening");
  const port = (unrelated.address() as import("node:net").AddressInfo).port;
  const own = demo.start({
    name: "Conflicting owned fixture",
    instance: `sw_${"b".repeat(32)}`,
    port,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    listen: { address, allowedClients: ["10.20.30.41"] },
  });
  try {
    await expect(once(own, "listening")).rejects.toThrow();
    expect((await call(address, port)).body).toBe("unrelated fixture preserved");
  } finally {
    await new Promise<void>((resolve) => own.close(() => resolve()));
    await new Promise<void>((resolve) => unrelated.close(() => resolve()));
  }
});
