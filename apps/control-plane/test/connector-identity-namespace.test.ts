import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { expect, it, vi } from "vitest";
const require = createRequire(import.meta.url),
  discovery = require("../../../deployment/servix/SystemDiscovery.cjs"),
  client = require("../../../deployment/servix/Connector.cjs");
const deviceId = "fc_" + "a".repeat(32),
  privateOrigin = "http://private.fixture",
  publicBase = "https://public.fixture/workspace";
it("resolves and serializes a fresh public enrollment's canonical namespace without sending OS identity", async () => {
  const fetcher = vi.fn(async (url: string, options: RequestInit) => {
    expect(url).toBe(publicBase + "/v1/connector/connection-status");
    expect(options.body).toBe("{}");
    expect(options.redirect).toBe("error");
    return Response.json({
      deviceId,
      mode: "system",
      ready: true,
      actor: "usr_fixture",
      workspaceId: "ws_server20",
      profileId: null,
      discoveryIdentityOrigin: privateOrigin,
    });
  });
  const config = {
    server: publicBase,
    mode: "system",
    deviceId,
    credential: deviceId + "." + "b".repeat(43),
  };
  const origin = await client.connectionIdentityOrigin(config, fetcher),
    saved = JSON.parse(JSON.stringify({ ...config, discoveryIdentityOrigin: origin }));
  expect(saved.discoveryIdentityOrigin).toBe(privateOrigin);
  expect(fetcher).toHaveBeenCalledOnce();
  expect(
    await client.connectionIdentityOrigin(saved, () => {
      throw Error("Already protected");
    }),
  ).toBe(privateOrigin);
  await expect(
    client.connectionIdentityOrigin(config, async () =>
      Response.json({
        deviceId: "fc_" + "c".repeat(32),
        mode: "system",
        ready: true,
        discoveryIdentityOrigin: privateOrigin,
      }),
    ),
  ).rejects.toThrow("identity-proof-unavailable");
  await expect(
    client.connectionIdentityOrigin(config, async () =>
      Response.json({
        deviceId,
        mode: "system",
        ready: true,
        discoveryIdentityOrigin: "https://public.fixture/not-an-origin",
      }),
    ),
  ).rejects.toThrow("identity-origin-invalid");
});
it("rejects malformed explicit namespaces instead of falling back to a weaker or different identity", async () => {
  for (const discoveryIdentityOrigin of [
    null,
    "",
    "file:///local",
    "https://user:password@private.fixture",
    "https://private.fixture/path",
    privateOrigin + "/",
    privateOrigin + "#fragment",
  ]) {
    await expect(
      discovery.installationIdentity({ server: publicBase, discoveryIdentityOrigin }),
    ).rejects.toThrow("identity-origin-invalid");
  }
});
it("retains the exact legacy origin's notification consent across migration without accepting another account, device, or prefixed endpoint", async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), "devsetu-identity-consent-"));
  const file = join(stateRoot, "notifications-consent.json"),
    consent = {
      version: 1,
      deviceId,
      server: privateOrigin,
      accountName: "pair:fixture",
      enabled: true,
    },
    config = {
      deviceId,
      stateRoot,
      server: publicBase,
      discoveryIdentityOrigin: privateOrigin,
      accountName: "pair:fixture",
    };
  const collector = new discovery.SystemDiscovery(config, async () => ({}));
  try {
    await writeFile(file, JSON.stringify(consent));
    const before = await readFile(file);
    expect(await collector.notificationConsent()).toBe(true);
    expect(await readFile(file)).toEqual(before);
    for (const changed of [
      { accountName: "pair:someone-else" },
      { deviceId: "fc_" + "b".repeat(32) },
      { server: privateOrigin + "/another-prefix" },
      { server: "https://unrelated.fixture" },
      { enabled: false },
    ]) {
      await writeFile(file, JSON.stringify({ ...consent, ...changed }));
      expect(await collector.notificationConsent()).toBe(false);
    }
    await writeFile(file, JSON.stringify(consent));
    Reflect.deleteProperty(config, "discoveryIdentityOrigin");
    expect(await collector.notificationConsent()).toBe(false);
  } finally {
    await rm(stateRoot, { recursive: true, force: true });
  }
});
it.skipIf(process.platform !== "win32")(
  "keeps the actual Windows machine/user identity stable across endpoint migration and a fresh canonical public enrollment",
  async () => {
    const before = await discovery.installationIdentity({ server: privateOrigin });
    expect(before).toMatch(/^[a-f0-9]{64}$/);
    expect(
      await discovery.installationIdentity({
        server: publicBase,
        discoveryIdentityOrigin: privateOrigin,
      }),
    ).toBe(before);
    expect(await discovery.installationIdentity({ server: publicBase })).not.toBe(before);
  },
);
it("requires a persisted public namespace before discovery and never adopts a transient server proof", async () => {
  const root = await mkdtemp(join(tmpdir(), "devsetu-identity-protected-"));
  if (dirname(resolve(root)) !== resolve(tmpdir()) || !root.includes("devsetu-identity-protected-"))
    throw Error("Fixture cleanup scope differs");
  await mkdir(join(root, "state"));
  const api = vi.fn(async () => ({
    deviceId,
    mode: "system",
    ready: true,
    discoveryIdentityOrigin: privateOrigin,
  }));
  const config = {
    server: publicBase,
    mode: "system",
    deviceId,
    monitoringRoot: root,
    stateRoot: join(root, "state"),
  };
  const collector = new discovery.SystemDiscovery(config, api);
  try {
    await expect(collector.initialize()).rejects.toThrow("protected-namespace-required");
    expect(collector.installationId).toBeUndefined();
    expect(api).not.toHaveBeenCalled();
    expect(config).not.toHaveProperty("discoveryIdentityOrigin");
  } finally {
    await collector.stop();
    await rm(root, { recursive: true, force: true });
  }
});
