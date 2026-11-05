import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, request as httpRequest } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { expect, it, vi } from "vitest";
import type { DeveloperConnectorStore } from "../src/developer-connectors.js";
import type { LocalDevelopment } from "../src/local-development.js";
import { PreviewConfigSchema, PreviewRelay } from "../src/preview-relay.js";
import { SoftwareManagement } from "../src/software-management.js";

const require = createRequire(import.meta.url),
  client = require("../../../deployment/servix/SoftwareClient.cjs"),
  protocol = require("../../../deployment/servix/SoftwareProtocol.cjs"),
  operatingSystem = require("node:os");
const sha = (s: Buffer) => createHash("sha256").update(s).digest("hex");
async function port() {
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const p = (server.address() as import("node:net").AddressInfo).port;
  await new Promise<void>((r) => server.close(() => r()));
  return p;
}
async function cleanFixture(root: string) {
  if (dirname(resolve(root)) !== resolve(tmpdir()) || !root.includes("frevos-software-client-"))
    throw Error("cleanup scope");
  await rm(root, { recursive: true, force: true });
}
async function until(fn: () => Promise<boolean>, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("native client observation deadline");
}

it("collects the first consented inventory through the real client/job protocol and retains it after restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "frevos-software-client-")),
    deviceId = "fc_" + "c".repeat(32),
    workspaceId = "ws_fixture",
    actor = "usr_owner";
  const device = {
    deviceId,
    userId: actor,
    workspaceId,
    name: "Inventory fixture",
    online: true,
    status: "active",
    workspaceAuthorized: true,
  };
  const store = new SoftwareManagement(
    join(root, "server"),
    workspaceId,
    {
      discoveryDevices: async (user) => (user === actor ? [device] : []),
      checkCredential: async () => device,
    },
    async () => false,
  );
  const stateRoot = join(root, "client"),
    consent = {
      version: 1,
      deviceId,
      inventory: true,
      install: false,
      approvedAt: new Date().toISOString(),
    };
  await mkdir(join(stateRoot, "software"), { recursive: true });
  await writeFile(join(stateRoot, "software", "consent.json"), JSON.stringify(consent));
  let scans = 0,
    initialRequests = 0;
  const api = async (route: string, input: unknown) => {
    const op = route.split("/").at(-1);
    if (op === "identity") return store.identity("fixture");
    if (op === "observe") return store.observe("fixture", input);
    if (op === "initial-inventory") {
      initialRequests++;
      return store.initialInventory("fixture");
    }
    if (op === "claim") return store.claim("fixture");
    if (op === "complete") return store.complete("fixture", input);
    throw Error("unregistered fixture operation");
  };
  const options = {
    inventory: async () => {
      scans++;
      return {
        version: 1,
        observedAt: new Date().toISOString(),
        platform: "win32",
        scope: "windows-machine-and-connector-user",
        status: "ready",
        truncated: false,
        items: [
          {
            id: "d".repeat(64),
            name: "Fixture registered software",
            version: "1",
            source: "registry",
          },
        ],
      };
    },
  };
  let companion: { stop: () => Promise<void> } | undefined;
  try {
    companion = await client.start({ deviceId, stateRoot }, api, options);
    await until(async () => !!(await store.state(actor, workspaceId, deviceId)).device.inventory);
    expect(scans).toBe(1);
    expect(
      (await store.state(actor, workspaceId, deviceId)).device.capability?.installConsent,
    ).toBe(false);
    await until(async () => {
      const job = (await store.state(actor, workspaceId, deviceId)).jobs[0]!;
      return (
        JSON.parse(
          await readFile(join(stateRoot, "software", job.request.requestId + ".json"), "utf8"),
        ).reconciled === true
      );
    });
    await companion!.stop();
    companion = await client.start({ deviceId, stateRoot }, api, options);
    await until(async () => initialRequests >= 2);
    expect(scans).toBe(1);
    expect((await store.state(actor, workspaceId, deviceId)).device.inventory?.items[0]?.name).toBe(
      "Fixture registered software",
    );
    expect(JSON.parse(await readFile(join(stateRoot, "software", "consent.json"), "utf8"))).toEqual(
      consent,
    );
  } finally {
    await companion?.stop();
    await cleanFixture(root);
  }
});

it.each([false, true])(
  "runs the actual owned demo with negotiated private listening=%s and preserves relay/consent",
  async (privateMode) => {
    const root = await mkdtemp(join(tmpdir(), "frevos-software-client-")),
      deviceId = "fc_" + "a".repeat(32),
      workspaceId = "ws_fixture",
      actor = "usr_owner",
      admin = "usr_admin";
    const device = {
      version: 1,
      deviceId,
      userId: actor,
      workspaceId,
      name: "Synthetic source",
      online: true,
      status: "active",
      workspaceAuthorized: true,
      mode: "system",
    };
    const devices = {
      discoveryDevices: async (user: string) => ([actor, admin].includes(user) ? [device] : []),
      checkCredential: async () => device,
    };
    const programSha = sha(
      await readFile(new URL("../../../deployment/servix/DemoApi.cjs", import.meta.url)),
    );
    const store = new SoftwareManagement(
      join(root, "server"),
      workspaceId,
      devices,
      async (user) => user === admin,
      undefined,
      programSha,
    );
    const plan = {
      version: 1,
      expectedRevision: 0,
      packages: [
        {
          id: "temporary-api",
          name: "Synthetic temporary API",
          version: "1",
          publisher: "Fixture",
          enabled: true,
          recipe: "demo-api",
          platform: process.platform,
          programSha256: programSha,
        },
      ],
    };
    await store.saveCatalog(admin, workspaceId, plan);
    const relayPort = await port(),
      apiPort = await port(),
      origin = "http://preview.internal:" + relayPort,
      portal = "http://portal.internal";
    const address = protocol.privateInterfaces(operatingSystem.networkInterfaces())[0]?.address;
    if (privateMode && !address)
      throw Error("An assigned private interface is required for the native socket fixture");
    const listen = privateMode ? { address, allowedClients: ["10.20.30.41"] } : undefined;
    const relay = new PreviewRelay(
      PreviewConfigSchema.parse({
        version: 1,
        workspaceId,
        listen: { host: "127.0.0.1", port: relayPort },
        targets: [
          {
            deviceId,
            profileId: "software-temporary-api",
            serviceId: "temporary-api",
            kind: "software",
            origin,
          },
        ],
        timeoutMs: 4000,
        sessionSeconds: 120,
      }),
      portal,
      join(root, "preview-audit"),
      {
        previewTarget: async () => {
          throw Error("system project execution remains denied");
        },
      } as unknown as LocalDevelopment,
      devices as unknown as DeveloperConnectorStore,
      undefined,
      store,
    );
    let companion: { url: string; stop: () => Promise<void> } | undefined;
    const api = async (route: string, input: unknown) => {
      if (route === "/v1/connector/software-preview/claim")
        return relay.claim("fixture", "software");
      if (route === "/v1/connector/preview/complete") return relay.complete("fixture", input);
      const operation = route.split("/").at(-1);
      if (operation === "identity") {
        const identity = await store.identity("fixture");
        return privateMode
          ? identity
          : { deviceId: identity.deviceId, workspaceId: identity.workspaceId };
      }
      if (operation === "observe") return store.observe("fixture", input);
      if (operation === "claim") return store.claim("fixture");
      if (operation === "authorize") return store.authorize("fixture", input);
      if (operation === "complete") return store.complete("fixture", input);
      throw Error("unregistered operation");
    };
    const call = (
      pathname: string,
      method = "GET",
      body = "",
      headers: Record<string, string> = {},
      target = { host: "127.0.0.1", port: relayPort, authority: new URL(origin).host },
    ) =>
      new Promise<{
        status: number;
        body: string;
        headers: import("node:http").IncomingHttpHeaders;
      }>((resolve, reject) => {
        const req = httpRequest(
          {
            host: target.host,
            port: target.port,
            path: pathname,
            method,
            headers: { host: target.authority, ...headers },
            agent: false,
          },
          (res) => {
            let value = "";
            res.on("data", (b) => {
              value += b;
            });
            res.on("end", () =>
              resolve({ status: res.statusCode ?? 0, body: value, headers: res.headers }),
            );
          },
        );
        req.on("error", reject);
        req.setTimeout(5000, () => req.destroy(Error("fixture HTTP timeout")));
        req.end(body);
      });
    try {
      await relay.listen();
      await writeFile(join(root, "pairing-sentinel.json"), "opaque fixture pairing unchanged");
      companion = await client.start({ deviceId, stateRoot: root }, api);
      if (!companion) throw Error("companion unavailable");
      await until(
        async () => !!(await store.state(actor, workspaceId, deviceId)).device.capability,
      );
      const local = companion.url,
        html = await (await fetch(local)).text(),
        nonce = html.match(/const nonce="([a-f0-9]+)"/)?.[1];
      expect(nonce).toBeTruthy();
      const forbidden = await fetch(local + "consent", {
        method: "POST",
        headers: { origin: "http://untrusted.invalid", "content-type": "application/json" },
        body: JSON.stringify({ inventory: true, install: true }),
      });
      expect(forbidden.status).toBe(403);
      const enabled = await fetch(local + "consent", {
        method: "POST",
        headers: {
          origin: new URL(local).origin,
          "content-type": "application/json",
          "x-devsetu-local": nonce!,
        },
        body: JSON.stringify({ inventory: true, install: true }),
      });
      expect(enabled.status).toBe(200);
      await until(
        async () =>
          (await store.state(actor, workspaceId, deviceId)).device.capability?.installConsent ===
          true,
      );
      const state = await store.state(admin, workspaceId, deviceId);
      const started = await store.request(admin, workspaceId, {
        version: 1,
        requestId: "sw_" + "1".repeat(32),
        deviceId,
        operation: "install",
        packageId: "temporary-api",
        packageDigest: state.packageDigests["temporary-api"],
        port: apiPort,
        lifetimeSeconds: 120,
        ...(listen ? { listen } : {}),
      });
      expect(started.status).toBe("approved");
      await until(
        async () =>
          (await store.state(admin, workspaceId, deviceId)).device.capability?.services.length ===
          1,
      );
      const running = (await store.state(admin, workspaceId, deviceId)).device.capability;
      expect(running?.network?.version).toBe(privateMode ? 1 : undefined);
      if (listen) {
        expect(running?.services[0]?.listen).toEqual(listen);
        const target = {
          host: listen.address,
          port: apiPort,
          authority: listen.address + ":" + apiPort,
        };
        const direct = await call("/health", "GET", "", {}, target);
        expect(direct.status).toBe(200);
        expect(JSON.parse(direct.body).instance).toBe(started.request.requestId);
        expect(
          (
            await call(
              "/api/echo",
              "POST",
              "denied",
              { origin: "http://untrusted.invalid" },
              target,
            )
          ).status,
        ).toBe(403);
        const echoed = await call(
          "/api/echo",
          "POST",
          "private-direct-marker",
          { origin: "http://" + target.authority },
          target,
        );
        expect(echoed.status).toBe(200);
        expect(JSON.parse(echoed.body).received).toBe("private-direct-marker");
      }
      const issued = await relay.open(
        admin,
        workspaceId,
        { deviceId, serviceId: "temporary-api" },
        async () => {},
      );
      const boot = await call(
        "/.__devsetu/open",
        "POST",
        new URLSearchParams({ ticket: issued.ticket }).toString(),
        { origin: portal, "content-type": "application/x-www-form-urlencoded" },
      );
      expect(boot.status).toBe(200);
      const cookie = String(boot.headers["set-cookie"]?.[0]).split(";")[0] ?? "";
      const get = await call("/health", "GET", "", { cookie });
      expect(get.status).toBe(200);
      expect(JSON.parse(get.body).instance).toBe(started.request.requestId);
      const marker = "real-native-demo-" + Date.now(),
        post = await call("/api/echo", "POST", marker, { cookie, origin });
      expect(post.status).toBe(200);
      expect(JSON.parse(post.body).received).toBe(marker);
      expect(
        (
          await call(
            "/.__devsetu/open",
            "POST",
            new URLSearchParams({ ticket: issued.ticket }).toString(),
            { origin: portal, "content-type": "application/x-www-form-urlencoded" },
          )
        ).status,
      ).toBe(401);
      await relay.end(admin, workspaceId, { deviceId, serviceId: "temporary-api" });
      expect((await call("/health", "GET", "", { cookie })).status).toBe(401);
      if (privateMode) {
        vi.spyOn(operatingSystem, "networkInterfaces").mockReturnValue({});
        await until(
          async () =>
            (await store.state(admin, workspaceId, deviceId)).device.capability?.services.length ===
            0,
        );
        vi.restoreAllMocks();
      }
      await store.request(admin, workspaceId, {
        version: 1,
        requestId: "sw_" + "2".repeat(32),
        deviceId,
        operation: "stop-demo",
        serviceId: "temporary-api",
      });
      await until(
        async () =>
          (await store.state(admin, workspaceId, deviceId)).device.capability?.services.length ===
          0,
      );
      expect(await readFile(join(root, "pairing-sentinel.json"), "utf8")).toBe(
        "opaque fixture pairing unchanged",
      );
      const receipt = JSON.parse(
        await readFile(join(root, "software", started.request.requestId + ".json"), "utf8"),
      );
      expect(receipt.result).toBe("demo-started");
    } finally {
      vi.restoreAllMocks();
      await relay.close();
      await companion?.stop();
      await cleanFixture(root);
    }
  },
  60000,
);
