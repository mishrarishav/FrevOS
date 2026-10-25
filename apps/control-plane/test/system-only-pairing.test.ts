import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { defaultDiscoveryPolicy, type DiscoveryObservation } from "@frevos/contracts";
import { expect, it } from "vitest";
import { DeveloperConnectorStore } from "../src/developer-connectors.js";
import { SystemDiscovery } from "../src/system-discovery.js";
import { LocalDevelopment } from "../src/local-development.js";

it("pairs an unassigned system without repository access, accepts consented metadata and denies project capabilities", async () => {
  const root = await mkdtemp(join(tmpdir(), "devsetu-system-only-"));
  let gitCalls = 0;
  const connectors = new DeveloperConnectorStore(
    join(root, "connectors"),
    async (a) => a === "usr_alice" || a === "usr_bob",
    {
      head: async () => {
        gitCalls++;
        return "a".repeat(40);
      },
      importBundle: async () => {
        gitCalls++;
      },
    },
    async () => {},
  );
  try {
    const paired = await connectors.pair("usr_alice", {
      version: 1,
      mode: "system",
      name: "New laptop",
    });
    expect(paired.mode).toBe("system");
    expect(paired.repositoryId).toBeUndefined();
    expect(paired.profileId).toBeUndefined();
    expect(gitCalls).toBe(0);
    await expect(
      connectors.pair("usr_alice", {
        version: 1,
        mode: "system",
        name: "Bad",
        profileId: "servix-development",
      }),
    ).rejects.toMatchObject({ code: "connector-pairing-scope-invalid" });
    await expect(
      connectors.pair("usr_unknown", { version: 1, mode: "system", name: "Bad" }),
    ).rejects.toMatchObject({ code: "connector-access-denied" });
    await connectors.heartbeat(paired.credential, {});
    await expect(
      connectors.heartbeat(paired.credential, { folderBrowser: true }),
    ).rejects.toMatchObject({ code: "connector-project-binding-required" });
    expect((await connectors.list("usr_alice"))[0]).toMatchObject({ mode: "system", online: true });
    expect(await connectors.list("usr_bob")).toEqual([]);
    const deny = { code: "connector-project-binding-required" };
    await expect(connectors.baseline(paired.credential, { heads: [] })).rejects.toMatchObject(deny);
    await expect(
      connectors.seed(paired.credential, "a".repeat(40), Buffer.alloc(32)),
    ).rejects.toMatchObject(deny);
    await expect(connectors.chooseFolder("usr_alice", paired.deviceId)).rejects.toMatchObject(deny);
    await expect(connectors.claimFolder(paired.credential)).rejects.toMatchObject(deny);
    await expect(connectors.finishFolder(paired.credential, {})).rejects.toMatchObject(deny);
    await expect(connectors.claim(paired.credential)).rejects.toMatchObject(deny);
    await expect(
      connectors.complete(
        paired.credential,
        "sd_" + "a".repeat(32),
        "b".repeat(40),
        Buffer.alloc(32),
      ),
    ).rejects.toMatchObject(deny);
    await expect(
      connectors.queueSource("usr_alice", paired.deviceId, "sd_" + "c".repeat(32)),
    ).rejects.toMatchObject({ code: "connector-offline" });
    const local = new LocalDevelopment(join(root, "local"), connectors);
    await expect(local.observe(paired.credential, {})).rejects.toMatchObject(deny);
    await expect(local.claim(paired.credential)).rejects.toMatchObject(deny);
    await expect(local.complete(paired.credential, {})).rejects.toMatchObject(deny);
    await expect(
      connectors.fail(paired.credential, "sd_" + "c".repeat(32), {}),
    ).rejects.toMatchObject(deny);
    const discovery = new SystemDiscovery(join(root, "discovery"), connectors, async () => ({
      projects: [],
      clients: [],
    }));
    await expect(
      discovery.configure("usr_alice", {
        version: 1,
        deviceId: paired.deviceId,
        expectedRevision: 0,
        policy: { ...defaultDiscoveryPolicy, enabled: true, contentFolders: ["."] },
      }),
    ).rejects.toMatchObject(deny);
    await discovery.configure("usr_alice", {
      version: 1,
      deviceId: paired.deviceId,
      expectedRevision: 0,
      policy: { ...defaultDiscoveryPolicy, enabled: true },
    });
    const observation: DiscoveryObservation = {
      version: 1,
      deviceId: paired.deviceId,
      profileId: null,
      bootId: randomUUID(),
      at: new Date().toISOString(),
      policyRevision: 1,
      system: {
        systemName: "New laptop",
        tools: [],
        platform: "win32",
        os: "Windows fixture",
        architecture: "x64",
        cpuPercent: 12,
        cpuCount: 4,
        memoryTotal: 8000,
        memoryAvailable: 5000,
        uptimeSeconds: 60,
        disks: [{ root: "D:\\", total: 100000, available: 80000 }],
      },
      coverage: {
        status: "collecting",
        roots: ["D:\\"],
        watchedDirectories: 1,
        gaps: [],
        attribution: "unavailable",
        droppedEvents: 0,
      },
      events: [
        {
          sequence: 1,
          root: "D:\\",
          path: "work/test.txt",
          at: new Date().toISOString(),
          kind: "modified",
          source: "filesystem-notification",
          attribution: "unavailable",
          content: { status: "redacted-text", before: "old", after: "new" },
        },
      ],
    };
    await expect(
      discovery.observe(paired.credential, { ...observation, profileId: "servix-development" }),
    ).rejects.toMatchObject({ code: "discovery-scope-mismatch" });
    await discovery.observe(paired.credential, observation);
    const state = await discovery.state("usr_alice", paired.deviceId);
    expect(state.systems[0]).toMatchObject({
      profileId: null,
      source: null,
      sourceFresh: false,
      online: true,
    });
    expect(state.systems[0]?.history[0]?.content).toBeUndefined();
    const browse = await discovery.requestFolders("usr_alice", {
      version: 1,
      deviceId: paired.deviceId,
      root: "D:\\",
      path: "",
      page: 0,
    });
    expect(browse.status).toBe("queued");
    await expect(
      discovery.requestFolders("usr_bob", {
        version: 1,
        deviceId: paired.deviceId,
        root: "D:\\",
        path: "",
        page: 0,
      }),
    ).rejects.toMatchObject({ code: "discovery-device-access-denied" });
    expect(gitCalls).toBe(0);
    const record = join(root, "connectors", paired.deviceId + ".json"),
      original = await readFile(record, "utf8");
    await writeFile(
      record,
      JSON.stringify({ ...JSON.parse(original), repositoryId: "gitrepo_" + "a".repeat(32) }),
    );
    await expect(connectors.checkCredential(paired.credential)).rejects.toMatchObject({
      code: "connector-authentication-required",
    });
    await writeFile(record, original);
    await connectors.revoke("usr_alice", paired.deviceId);
    await expect(connectors.heartbeat(paired.credential)).rejects.toMatchObject({
      code: "connector-authentication-required",
    });
  } finally {
    connectors.close();
    expect(dirname(resolve(root))).toBe(resolve(tmpdir()));
    expect(root).toContain("devsetu-system-only-");
    await rm(root, { recursive: true, force: true });
  }
});
