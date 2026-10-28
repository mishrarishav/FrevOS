import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, symlink, writeFile, readdir } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ExternalIdentitySchema, SessionContextSchema, UserIdSchema } from "@frevos/contracts";
import { expect, it } from "vitest";
import { DeveloperConnectorStore } from "../src/developer-connectors.js";
import { DeviceLogins } from "../src/device-logins.js";

const require = createRequire(import.meta.url);
const { startDeviceLoginProof } = require("../../../deployment/servix/Connector.cjs");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
it("requires owner proof, browser binding and a current credential version; persists session binding and rechecks unpairing/admin removal", async () => {
  const root = await mkdtemp(join(tmpdir(), "device-login-"));
  let clock = Date.parse("2026-10-28T10:00:00Z");
  const now = () => new Date(clock),
    admins = new Set(["usr_ops"]),
    allowed = new Set(["usr_alice", "usr_bob", "usr_ops"]),
    versions = new Map([["usr_alice", "a".repeat(64)]]);
  const connectors = new DeveloperConnectorStore(
    join(root, "connectors"),
    async (actor) => allowed.has(actor),
    { head: async () => "a".repeat(40), importBundle: async () => {} },
    async () => {},
    now,
    undefined,
    undefined,
    undefined,
    async (actor) => admins.has(actor),
    true,
  );
  const userId = UserIdSchema.parse("usr_alice"),
    identity = ExternalIdentitySchema.parse({
      identityId: "idn_alice",
      userId,
      issuer: "https://identity.fixture",
      subject: "alice",
      linkedAt: now().toISOString(),
      lastAuthenticatedAt: now().toISOString(),
    });
  const principal = { identity, userId, credentialVersion: versions.get(userId)! };
  const service = new DeviceLogins(
    join(root, "sessions"),
    "ws_server20",
    connectors,
    async (actor) => admins.has(actor),
    now,
    async (principal) => versions.get(principal.userId) ?? null,
  );
  const session = SessionContextSchema.parse({
    sessionId: "ses_alice",
    userId,
    identityId: identity.identityId,
    status: "active",
    authenticatedAt: now().toISOString(),
    expiresAt: new Date(clock + 3600000).toISOString(),
  });
  try {
    expect(
      await service.begin({ ...principal, userId: UserIdSchema.parse("usr_ops") }, "browser"),
    ).toBeNull();
    await service.authorizeSession({ ...session, userId: UserIdSchema.parse("usr_ops") });
    await expect(service.begin(principal, "browser")).rejects.toThrow("paired-system-required");
    const alice = {
        deviceId: "fc_" + "a".repeat(32),
        credential: "fc_" + "a".repeat(32) + "." + "a".repeat(43),
      },
      bob = {
        deviceId: "fc_" + "b".repeat(32),
        credential: "fc_" + "b".repeat(32) + "." + "b".repeat(43),
      };
    for (const [owner, device] of [
      ["usr_alice", alice],
      ["usr_bob", bob],
    ] as const)
      await connectors.acceptSystemEnrollment(owner, {
        version: 1,
        deviceId: device.deviceId,
        name: owner,
        platform: "win32",
        architecture: "x64",
        fileActivity: false,
        credentialHash: hash(device.credential),
        pollHash: hash(device.deviceId + "poll"),
        codeHash: hash(device.deviceId + "code"),
      });
    await expect(service.begin(principal, "browser")).rejects.toThrow(
      "paired-system-connector-required",
    );
    await connectors.heartbeat(alice.credential, { loginProofPort: 55001 });
    const challenge = (await service.begin(principal, "browser-a"))!;
    expect(challenge.ports).toEqual([55001]);
    await expect(
      service.attest(bob.credential, { version: 1, challengeId: challenge.challengeId }),
    ).rejects.toThrow("device-login-proof-denied");
    const proof = await service.attest(alice.credential, {
      version: 1,
      challengeId: challenge.challengeId,
    });
    await expect(
      service.attest(alice.credential, { version: 1, challengeId: challenge.challengeId }),
    ).rejects.toThrow();
    await expect(service.consume(proof, "browser-b")).rejects.toThrow();
    await expect(
      service.consume({ ...proof, proof: "0".repeat(64) }, "browser-a"),
    ).rejects.toThrow();
    const verified = await service.consume(proof, "browser-a");
    expect(verified.deviceId).toBe(alice.deviceId);
    await expect(service.consume(proof, "browser-a")).rejects.toThrow();
    await expect(service.authorizeSession(session)).rejects.toThrow("paired-system-login-required");
    await service.bind(session, verified.deviceId, verified.verifiedAt);
    await service.authorizeSession(session);
    const restarted = new DeviceLogins(
      join(root, "sessions"),
      "ws_server20",
      connectors,
      async (actor) => admins.has(actor),
      now,
    );
    await restarted.authorizeSession(session);
    expect(await restarted.begin(principal, "default-version-callback")).toBeTruthy();
    const persisted = JSON.parse(
      await readFile(join(root, "sessions", session.sessionId + ".json"), "utf8"),
    );
    for (let batch = 0; batch < 10; batch++)
      await Promise.all(
        Array.from({ length: 100 }, (_, i) => {
          const id = "ses_expired_" + (batch * 100 + i);
          return writeFile(
            join(root, "sessions", id + ".json"),
            JSON.stringify({
              ...persisted,
              sessionId: id,
              expiresAt: new Date(clock - 1).toISOString(),
            }),
          );
        }),
      );
    const another = SessionContextSchema.parse({ ...session, sessionId: "ses_after_prune" });
    await restarted.bind(another, alice.deviceId, now().toISOString());
    expect(
      (await readdir(join(root, "sessions"))).filter((name) => name.startsWith("ses_expired_")),
    ).toEqual([]);
    await restarted.authorizeSession(another);
    const navigation = new DeviceLogins(
      join(root, "navigation"),
      "ws_server20",
      connectors,
      async () => false,
      now,
      async () => versions.get(userId) ?? null,
      "connector-page",
    );
    const pageChallenge = (await navigation.begin(principal, "original-browser"))!;
    expect(pageChallenge.method).toBe("connector-page");
    expect(pageChallenge.devices).toEqual([{ port: 55001, name: "usr_alice" }]);
    const pageProof = await navigation.attest(alice.credential, {
      version: 1,
      challengeId: pageChallenge.challengeId,
    });
    await expect(navigation.receive(pageProof, "http://127.0.0.1:55002")).rejects.toThrow();
    await expect(navigation.receive(pageProof, "https://127.0.0.1:55001")).rejects.toThrow();
    await expect(navigation.receive(pageProof, "http://localhost:55001")).rejects.toThrow();
    await expect(navigation.receive(pageProof, "http://127.0.0.1:55001/")).rejects.toThrow();
    await expect(
      navigation.receive({ ...pageProof, proof: "0".repeat(64) }, "http://127.0.0.1:55001"),
    ).rejects.toThrow();
    const receiver = await navigation.receive(pageProof, "http://127.0.0.1:55001");
    await expect(navigation.receive(pageProof, "http://127.0.0.1:55001")).rejects.toThrow();
    await expect(navigation.finish("another-browser", receiver)).rejects.toThrow();
    await expect(navigation.finish("original-browser", "bad-cookie")).rejects.toThrow();
    await expect(
      navigation.finish(
        "original-browser",
        receiver.slice(0, -1) + (receiver.endsWith("a") ? "b" : "a"),
      ),
    ).rejects.toThrow();
    expect(await navigation.finish("original-browser", receiver)).toMatchObject({
      deviceId: alice.deviceId,
    });
    await expect(navigation.finish("original-browser", receiver)).rejects.toThrow();
    const changedPage = (await navigation.begin(principal, "changed-browser"))!;
    const changedProof = await navigation.attest(alice.credential, {
      version: 1,
      challengeId: changedPage.challengeId,
    });
    const changedReceiver = await navigation.receive(changedProof, "http://127.0.0.1:55001");
    versions.set(userId, "b".repeat(64));
    await expect(navigation.finish("changed-browser", changedReceiver)).rejects.toThrow(
      "invalid-credentials",
    );
    versions.set(userId, principal.credentialVersion);
    await expect(
      restarted.authorizeSession({ ...session, userId: UserIdSchema.parse("usr_bob") }),
    ).rejects.toThrow();
    const next = (await service.begin(principal, "browser-c"))!;
    const nextProof = await service.attest(alice.credential, {
      version: 1,
      challengeId: next.challengeId,
    });
    versions.set(userId, "b".repeat(64));
    await expect(service.consume(nextProof, "browser-c")).rejects.toThrow("invalid-credentials");
    await expect(service.begin(principal, "browser-c")).rejects.toThrow("invalid-credentials");
    versions.set(userId, principal.credentialVersion);
    const expiring = (await service.begin(principal, "browser-d"))!;
    const expiringPage = (await navigation.begin(principal, "expiring-page"))!;
    const expiringProof = await navigation.attest(alice.credential, {
      version: 1,
      challengeId: expiringPage.challengeId,
    });
    const expiringReceiver = await navigation.receive(expiringProof, "http://127.0.0.1:55001");
    clock += 120001;
    await expect(navigation.finish("expiring-page", expiringReceiver)).rejects.toThrow();
    await expect(navigation.receive(expiringProof, "http://127.0.0.1:55001")).rejects.toThrow();
    await expect(
      service.attest(alice.credential, { version: 1, challengeId: expiring.challengeId }),
    ).rejects.toThrow();
    await expect(
      service.consume(
        { version: 1, challengeId: expiring.challengeId, proof: "a".repeat(64) },
        "browser-d",
      ),
    ).rejects.toThrow();
    await expect(service.begin(principal, "browser-e")).rejects.toThrow(
      "paired-system-connector-required",
    );
    await connectors.heartbeat(alice.credential, { loginProofPort: 55002 });
    for (let i = 0; i < 4; i++) await service.begin(principal, "browser-" + i);
    await expect(service.begin(principal, "overflow")).rejects.toThrow("device-login-capacity");
    clock += 120001;
    await connectors.heartbeat(alice.credential, { loginProofPort: 55002 });
    expect(await service.begin(principal, "after-prune")).toBeTruthy();
    const bindingFile = join(root, "sessions", session.sessionId + ".json"),
      binding = JSON.parse(await readFile(bindingFile, "utf8"));
    await writeFile(bindingFile, JSON.stringify({ ...binding, workspaceId: "ws_other" }));
    await expect(service.authorizeSession(session)).rejects.toThrow();
    await writeFile(bindingFile, JSON.stringify(binding));
    await connectors.revoke("usr_alice", alice.deviceId);
    await expect(service.authorizeSession(session)).rejects.toThrow();
    admins.delete("usr_ops");
    await expect(
      service.authorizeSession({ ...session, userId: UserIdSchema.parse("usr_ops") }),
    ).rejects.toThrow();
    allowed.delete("usr_alice");
    await expect(service.begin(principal, "revoked")).rejects.toThrow("connector-access-denied");
    const linked = join(root, "linked");
    await symlink(
      join(root, "sessions"),
      linked,
      process.platform === "win32" ? "junction" : "dir",
    );
    const unsafe = new DeviceLogins(linked, "ws_server20", connectors, async () => false, now);
    await expect(unsafe.authorizeSession(session)).rejects.toThrow(
      "device-login-storage-unavailable",
    );
  } finally {
    connectors.close();
    await rm(root, { recursive: true, force: true });
  }
});

it("uses an explicit nonce/cookie protected local page and sends no completion credential in a URL", async () => {
  const local = await startDeviceLoginProof("http://devsetu.fixture", async (body: object) => ({
      ...body,
      proof: "a".repeat(64),
    })),
    origin = "http://127.0.0.1:" + local.port;
  try {
    const page = await fetch(origin + "/device-login/start");
    const html = await page.text(),
      cookie = page.headers.getSetCookie()[0]!.split(";")[0]!,
      nonce = html.match(/script nonce="([A-Za-z0-9_-]+)"/)![1]!;
    expect(page.headers.get("referrer-policy")).toBe("origin");
    expect(html).toContain("Confirm sign-in from this computer");
    expect(html).toContain("form.method='POST'");
    expect(html).not.toContain("?proof=");
    const body = JSON.stringify({ version: 1, challengeId: "dl_" + "a".repeat(64) });
    const headers = { origin, cookie, "x-devsetu-page": nonce, "content-type": "application/json" };
    expect(
      (
        await fetch(origin + "/device-login/confirm", {
          method: "POST",
          headers: { ...headers, origin: "http://foreign.fixture" },
          body,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(origin + "/device-login/confirm", {
          method: "POST",
          headers: { ...headers, cookie: "" },
          body,
        })
      ).status,
    ).toBe(403);
    expect(
      (await fetch(origin + "/device-login/confirm", { method: "POST", headers, body })).status,
    ).toBe(200);
    expect(
      (await fetch(origin + "/device-login/confirm", { method: "POST", headers, body })).status,
    ).toBe(403);
  } finally {
    await local.close();
  }
});

it("attests only an exact local host/origin/path with bounded JSON; never proxies credentials or arbitrary commands", async () => {
  let requests = 0;
  const local = await startDeviceLoginProof("http://devsetu.fixture", async (input: unknown) => {
    requests++;
    return { ...(input as object), proof: "a".repeat(64) };
  });
  const url = "http://127.0.0.1:" + local.port + "/device-login",
    headers = { origin: "http://devsetu.fixture", "content-type": "application/json" },
    body = { version: 1, challengeId: "dl_" + "a".repeat(64) };
  try {
    expect((await fetch(url, { method: "OPTIONS", headers })).status).toBe(204);
    const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(headers.origin);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ proof: "a".repeat(64) });
    expect(
      (
        await fetch(url, {
          method: "POST",
          headers: { ...headers, origin: "http://foreign.fixture" },
          body: JSON.stringify(body),
        })
      ).status,
    ).toBe(403);
    const foreignHost = await new Promise<number | undefined>((resolve, reject) => {
      const request = httpRequest(
        url,
        { method: "POST", headers: { ...headers, host: "foreign.fixture" } },
        (response) => {
          response.resume();
          resolve(response.statusCode);
        },
      );
      request.once("error", reject);
      request.end(JSON.stringify(body));
    });
    expect(foreignHost).toBe(403);
    expect(
      (await fetch(url + "?other=1", { method: "POST", headers, body: JSON.stringify(body) }))
        .status,
    ).toBe(403);
    expect((await fetch(url, { headers })).status).toBe(403);
    expect(
      (
        await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({ ...body, command: "forbidden" }),
        })
      ).status,
    ).toBe(403);
    expect((await fetch(url, { method: "POST", headers, body: " ".repeat(2049) })).status).toBe(
      403,
    );
    expect((await fetch(url, { method: "POST", headers, body: '{"version":1}' })).status).toBe(403);
    expect(requests).toBe(1);
  } finally {
    await local.close();
  }
});
