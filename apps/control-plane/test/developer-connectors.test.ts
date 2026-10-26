const changeDetails = { message: "Update development code", approvedBy: "Fixture owner / CHG-123" };
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DeveloperConnectorStore } from "../src/developer-connectors.js";
import { ServixDeploymentStore } from "../src/servix-deployment.js";
const { validateJob } = createRequire(import.meta.url)(
  "../../../deployment/servix/Connector.cjs",
) as { validateJob(config: { deviceId: string }, job: unknown): void };

let root: string;
const base = "a".repeat(40),
  head = "b".repeat(40),
  id = "sd_" + "c".repeat(32);
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "frevos-connectors-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
it("waits for the selected device's immutable commit before building and binding activation", async () => {
  await mkdir(join(root, "requests"));
  await mkdir(join(root, "results"));
  let done!: (value: string) => void;
  const published = new Promise<string>((resolve) => {
      done = resolve;
    }),
    build = vi.fn(async () => ({ manifestSha256: "e".repeat(64), archiveSha256: "f".repeat(64) })),
    deviceId = "fc_" + "d".repeat(32);
  const store = new ServixDeploymentStore(
    root,
    { head: async () => base, build },
    async () => true,
    () => new Date(),
    { list: async () => [{ deviceId, online: true }], prepare: async () => published },
  );
  const input = {
    version: 1,
    requestId: id,
    confirmation: "deploy-servix-development",
    changeDetails,
    connectorId: deviceId,
  };
  expect((await store.request("usr_alice", input)).status).toBe("publishing");
  expect(await store.sourceRequestActive(id, "usr_alice", deviceId)).toBe(true);
  expect(await store.sourceRequestActive(id, "usr_bob", deviceId)).toBe(false);
  expect(build).not.toHaveBeenCalled();
  expect((await store.request("usr_alice", input)).requestId).toBe(id);
  done(head);
  await expect.poll(async () => (await store.state()).runs[0]?.status).toBe("activating");
  expect(build).toHaveBeenCalledExactlyOnceWith(id, head);
  const activation = JSON.parse(await readFile(join(root, "requests", id + ".json"), "utf8"));
  expect(activation).toMatchObject({
    changeDetails,
    sourceHead: head,
    connectorId: deviceId,
    requestedBy: "usr_alice",
  });
  expect(await store.sourceRequestActive(id, "usr_alice", deviceId)).toBe(false);
  store.close();
});
it("pairs per user, hides credentials, claims once, imports the exact commit and revokes access", async () => {
  const imported = vi.fn(),
    created = vi.fn(),
    store = new DeveloperConnectorStore(
      root,
      async () => true,
      { head: async () => base, importBundle: imported },
      created,
      () => new Date(),
      async () => true,
    );
  const device = await store.pair("usr_alice", { version: 1, name: "Alice laptop" });
  expect(JSON.stringify(await store.list("usr_alice"))).not.toContain(device.credential);
  expect(await store.list("usr_bob")).toEqual([]);
  expect(await readFile(join(root, device.deviceId + ".json"), "utf8")).not.toContain(
    device.credential,
  );
  await expect(store.prepare("usr_alice", device.deviceId, id)).rejects.toThrow(
    "connector-offline",
  );
  expect(await store.claim(device.credential)).toBeNull();
  await expect(
    store.prepare("usr_alice", device.deviceId, id, undefined, changeDetails),
  ).rejects.toThrow("connector-update-required");
  await store.heartbeat(device.credential, { changeNotes: true });
  const publishing = store.prepare("usr_alice", device.deviceId, id, undefined, changeDetails);
  await expect.poll(async () => (await readdir(root)).includes(id + ".source.json")).toBe(true);
  await store.heartbeat(device.credential);
  await expect(store.claim(device.credential)).rejects.toThrow("connector-update-required");
  await store.heartbeat(device.credential, { changeNotes: true });
  const claimedJob = await store.claim(device.credential);
  expect(() => validateJob({ deviceId: device.deviceId }, claimedJob)).not.toThrow();
  expect(() =>
    validateJob({ deviceId: device.deviceId }, { ...claimedJob, changeDetails: null }),
  ).toThrow("invalid-change-details");
  expect(claimedJob).toMatchObject({
    requestId: id,
    baseHead: base,
    changeDetails,
  });
  expect(await store.claim(device.credential)).toBeNull();
  await expect(store.complete(device.credential, id, head, Buffer.alloc(10))).rejects.toThrow(
    "connector-bundle-capacity",
  );
  const bob = await store.pair("usr_bob", { version: 1, name: "Bob laptop" });
  await expect(store.complete(bob.credential, id, head, Buffer.alloc(64))).rejects.toThrow(
    "connector-job-denied",
  );
  await store.complete(device.credential, id, head, Buffer.alloc(64));
  expect(await publishing).toBe(head);
  expect(imported).toHaveBeenCalledExactlyOnceWith(join(root, id + ".bundle"), base, head);
  await store.complete(device.credential, id, head, Buffer.alloc(64));
  expect(imported).toHaveBeenCalledOnce();
  await expect(store.revoke("usr_bob", device.deviceId)).rejects.toThrow("connector-access-denied");
  await store.revoke("usr_alice", device.deviceId);
  await expect(store.claim(device.credential)).rejects.toThrow("connector-authentication-required");
  expect(created).not.toHaveBeenCalled();
});
it("keeps authenticated presence fresh during an import without claiming another job", async () => {
  let now = new Date();
  let finish!: () => void;
  let started!: () => void;
  const importing = new Promise<void>((resolve) => {
    started = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const store = new DeveloperConnectorStore(
    root,
    async () => true,
    {
      head: async () => base,
      importBundle: async () => {
        started();
        await gate;
      },
    },
    vi.fn(),
    () => now,
    async () => true,
  );
  const device = await store.pair("usr_alice", { version: 1, name: "Laptop" });
  await store.heartbeat(device.credential);
  const publishing = store.prepare("usr_alice", device.deviceId, id);
  await expect.poll(async () => (await readdir(root)).includes(id + ".source.json")).toBe(true);
  now = new Date(now.getTime() + 1000);
  await store.claim(device.credential);
  expect((await store.list("usr_alice"))[0]?.lastSeenAt).toBe(now.toISOString());
  const completion = store.complete(device.credential, id, head, Buffer.alloc(64));
  await importing;
  try {
    now = new Date(now.getTime() + 30000);
    await store.heartbeat(device.credential);
    expect((await store.list("usr_alice"))[0]?.online).toBe(true);
  } finally {
    finish();
  }
  await completion;
  await publishing;
  now = new Date(now.getTime() + 21000);
  expect((await store.list("usr_alice"))[0]?.online).toBe(false);
  await store.revoke("usr_alice", device.deviceId);
  await expect(store.heartbeat(device.credential)).rejects.toThrow(
    "connector-authentication-required",
  );
});
it("does not revive an expired device or a connector whose store has stopped", async () => {
  let now = new Date();
  const store = new DeveloperConnectorStore(
    root,
    async () => true,
    { head: async () => base, importBundle: vi.fn() },
    vi.fn(),
    () => now,
  );
  const expired = await store.pair("usr_alice", { version: 1, name: "Expired laptop" });
  now = new Date(now.getTime() + 91 * 86400000);
  await expect(store.heartbeat(expired.credential)).rejects.toThrow(
    "connector-authentication-required",
  );
  const current = await store.pair("usr_alice", { version: 1, name: "Current laptop" });
  store.close();
  await expect(store.heartbeat(current.credential)).rejects.toThrow("connector-unavailable");
});
it("bounds presence records while allowing an already tracked device to renew", async () => {
  const store = new DeveloperConnectorStore(
    root,
    async () => true,
    { head: async () => base, importBundle: vi.fn() },
    vi.fn(),
  );
  const original = await store.pair("usr_alice", { version: 1, name: "Laptop" });
  const record = JSON.parse(await readFile(join(root, original.deviceId + ".json"), "utf8"));
  let credential = "";
  // Real authenticated file records exercise the public capacity boundary.
  for (let index = 1; index <= 1000; index++) {
    const deviceId = "fc_" + index.toString(16).padStart(32, "0");
    credential = deviceId + "." + "x".repeat(43);
    await writeFile(
      join(root, deviceId + ".json"),
      JSON.stringify({
        ...record,
        deviceId,
        credentialHash: createHash("sha256").update(credential).digest("hex"),
      }),
    );
    await store.heartbeat(credential);
  }
  await expect(store.heartbeat(credential)).resolves.toEqual({ online: true });
  await expect(store.heartbeat(original.credential)).rejects.toThrow("connector-capacity");
}, 60000);
it("creates a single-use owner invitation without persisting the code or chosen password", async () => {
  const create = vi.fn(),
    store = new DeveloperConnectorStore(
      root,
      async () => true,
      { head: async () => base, importBundle: vi.fn() },
      create,
    );
  await expect(
    store.invite("usr_dev", { version: 1, username: "alice", displayName: "Alice" }),
  ).rejects.toThrow("connector-access-denied");
  const invite = await store.invite("usr_windows_admin", {
    version: 1,
    username: "alice",
    displayName: "Alice",
  });
  expect(await readFile(join(root, invite.code.slice(0, 35) + ".json"), "utf8")).not.toContain(
    invite.code,
  );
  await expect(
    store.redeem({ version: 1, code: invite.code.slice(0, -1) + "!", password: "password-one" }),
  ).rejects.toThrow();
  await store.redeem({ version: 1, code: invite.code, password: "password-one" });
  expect(create).toHaveBeenCalledExactlyOnceWith("alice", "password-one", "Alice");
  await expect(
    store.redeem({ version: 1, code: invite.code, password: "password-two" }),
  ).rejects.toThrow("invitation-invalid");
  expect(
    (await Promise.all((await readdir(root)).map((n) => readFile(join(root, n), "utf8")))).join(""),
  ).not.toContain("password-one");
});
it("cleans up only a baseline it owns and refuses downloads when the source adapter is unavailable", async () => {
  const store = new DeveloperConnectorStore(
    root,
    async () => true,
    {
      head: async () => base,
      importBundle: vi.fn(),
      exportBundle: async (file) => {
        await import("node:fs/promises").then((fs) => fs.writeFile(file, Buffer.alloc(64)));
      },
    },
    vi.fn(),
  );
  const device = await store.pair("usr_alice", { version: 1, name: "Laptop" });
  const file = await store.baseline(device.credential, { heads: [base] });
  expect(await readFile(file)).toHaveLength(64);
  await expect(store.releaseBaseline(join(root, "foreign.bundle"))).rejects.toThrow(
    "connector-file-not-owned",
  );
  await store.releaseBaseline(file);
  await expect(readFile(file)).rejects.toMatchObject({ code: "ENOENT" });
  await expect(store.releaseBaseline(file)).rejects.toThrow("connector-file-not-owned");
  const unavailable = new DeveloperConnectorStore(
    root,
    async () => true,
    { head: async () => base, importBundle: vi.fn() },
    vi.fn(),
  );
  await expect(unavailable.baseline(device.credential, { heads: [base] })).rejects.toThrow(
    "connector-source-unavailable",
  );
});
it("fails closed when a deployment owner has not supplied an active-job authority", async () => {
  const store = new DeveloperConnectorStore(
    root,
    async () => true,
    { head: async () => base, importBundle: vi.fn() },
    vi.fn(),
  );
  const device = await store.pair("usr_alice", { version: 1, name: "Laptop" });
  await store.claim(device.credential);
  const waiting = store.prepare("usr_alice", device.deviceId, id),
    rejected = expect(waiting).rejects.toThrow("source-publication-expired");
  await expect.poll(async () => (await readdir(root)).includes(id + ".source.json")).toBe(true);
  expect(await store.claim(device.credential)).toBeNull();
  await rejected;
});
it("does not deliver cancelled or expired jobs, and rechecks membership on every poll", async () => {
  let allowed = true,
    active = true,
    now = new Date();
  const store = new DeveloperConnectorStore(
    root,
    async () => allowed,
    { head: async () => base, importBundle: vi.fn() },
    vi.fn(),
    () => now,
    async () => active,
  );
  const device = await store.pair("usr_alice", { version: 1, name: "Laptop" });
  await store.claim(device.credential);
  const publishing = store.prepare("usr_alice", device.deviceId, id);
  const rejected = expect(publishing).rejects.toThrow("source-publication-expired");
  await expect.poll(async () => (await readdir(root)).includes(id + ".source.json")).toBe(true);
  active = false;
  expect(await store.claim(device.credential)).toBeNull();
  await rejected;
  allowed = false;
  await expect(store.claim(device.credential)).rejects.toThrow("connector-access-denied");
  allowed = true;
  now = new Date(now.getTime() + 91 * 86400000);
  await expect(store.claim(device.credential)).rejects.toThrow("connector-authentication-required");
  await expect(store.claim("invalid-token")).rejects.toThrow("connector-authentication-required");
  await expect(store.claim("fc_" + "d".repeat(32) + "." + "a".repeat(43))).rejects.toThrow(
    "connector-authentication-required",
  );
});
it("reports local publication failure and refuses a stale activation instead of using old source", async () => {
  const connectors = new DeveloperConnectorStore(
    join(root, "devices"),
    async () => true,
    { head: async () => base, importBundle: vi.fn() },
    vi.fn(),
    () => new Date(),
    async () => true,
  );
  const device = await connectors.pair("usr_alice", { version: 1, name: "Laptop" });
  await connectors.claim(device.credential);
  await connectors.heartbeat(device.credential, { changeNotes: true });
  await mkdir(join(root, "requests"));
  await mkdir(join(root, "results"));
  const build = vi.fn(),
    deploy = new ServixDeploymentStore(
      root,
      { head: async () => base, build },
      async () => true,
      () => new Date(),
      connectors,
    );
  const input = {
    version: 1,
    requestId: id,
    confirmation: "deploy-servix-development",
    changeDetails,
    connectorId: device.deviceId,
  };
  expect(await deploy.request("usr_alice", input)).toMatchObject({
    status: "publishing",
    sourceHead: null,
  });
  await expect
    .poll(async () => (await readdir(join(root, "devices"))).includes(id + ".source.json"))
    .toBe(true);
  await connectors.claim(device.credential);
  await connectors.fail(device.credential, id, { errorCode: "source-behind-or-conflicting" });
  await expect.poll(async () => (await deploy.state()).runs[0]?.status).toBe("failed");
  expect((await deploy.state()).runs[0]?.errorCode).toBe("source-behind-or-conflicting");
  expect(build).not.toHaveBeenCalled();
  await expect(
    deploy.request("usr_alice", {
      ...input,
      requestId: "sd_" + "e".repeat(32),
      connectorId: undefined,
    }),
  ).rejects.toThrow("connector-offline");
  deploy.close();
  connectors.close();
  await expect(connectors.list("usr_alice")).rejects.toThrow("connector-unavailable");
});
