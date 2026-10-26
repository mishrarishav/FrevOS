const changeDetails = { message: "Update development code", approvedBy: "Fixture owner / CHG-123" };
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  DeploymentSettingsStore,
  defaultDeploymentSettings,
  platformDeploymentSettings,
} from "../src/deployment-settings.js";
import { DeveloperConnectorStore } from "../src/developer-connectors.js";
import { ServixDeploymentStore } from "../src/servix-deployment.js";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "frevos-settings-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 5 });
});
const actor = "usr_windows_admin";
it("lists the managed platform without writing settings and denies editing, pairing and customer-runner tests", async () => {
  const { settings, connectors } = stores();
  expect(await settings.list(actor)).toEqual([
    platformDeploymentSettings,
    defaultDeploymentSettings,
  ]);
  expect(await readdir(settings.root)).toEqual([]);
  expect(await settings.profile("devsetu-platform")).toEqual(platformDeploymentSettings);
  await expect(
    settings.save(actor, { ...input(), profileId: "devsetu-platform", archived: true }),
  ).rejects.toThrow("managed-platform-profile-is-read-only");
  await expect(
    connectors.pair(actor, { version: 1, name: "Wrong connector", profileId: "devsetu-platform" }),
  ).rejects.toThrow("platform-update-use-maintenance");
  const destination = vi.fn(async () => true);
  await expect(
    settings.test(actor, "devsetu-platform", undefined, connectors, destination),
  ).rejects.toThrow("platform-update-use-maintenance");
  expect(destination).not.toHaveBeenCalled();
  expect(await readdir(settings.root)).toEqual([]);
  await writeFile(
    join(settings.root, "devsetu-platform.json"),
    JSON.stringify(platformDeploymentSettings),
  );
  await expect(settings.list(actor)).rejects.toThrow("managed-profile-storage-conflict");
});
function input() {
  const {
    runner: _,
    revision,
    updatedAt: _at,
    updatedBy: _by,
    ...profile
  } = defaultDeploymentSettings;
  return { ...profile, expectedRevision: revision };
}
function stores(now = () => new Date()) {
  const settings = new DeploymentSettingsStore(
    join(root, "settings"),
    async (id) => id !== "usr_denied",
    now,
  );
  const git = {
    head: vi.fn(async () => "a".repeat(40)),
    importBundle: vi.fn(),
    exportBundle: vi.fn(),
  };
  const connectors = new DeveloperConnectorStore(
    join(root, "devices"),
    async (id) => id !== "usr_denied",
    git,
    vi.fn(),
    now,
    async () => true,
    settings,
  );
  return { settings, connectors, git };
}
it("opens an expiring device-owner folder request once, validates its repository result and refreshes source proof", async () => {
  const { connectors, git } = stores();
  const d = await connectors.pair(actor, { version: 1, name: "Owner laptop" });
  await expect(connectors.chooseFolder(actor, d.deviceId)).rejects.toThrow("connector-offline");
  await connectors.heartbeat(d.credential);
  await expect(connectors.chooseFolder(actor, d.deviceId)).rejects.toThrow(
    "connector-update-required",
  );
  const probe = {
    version: 1,
    profileId: "servix-development",
    repository: "D:\\servixDev",
    origin: defaultDeploymentSettings.repositoryOrigin,
    repositoryId: "gitrepo_6cb7e163f807493fa37963196c49fbac",
    remoteName: "frevos",
    head: "a".repeat(40),
    branch: "feature/dev",
    checkedAt: new Date().toISOString(),
  };
  await connectors.heartbeat(d.credential, { probe, folderPicker: true });
  await expect(connectors.chooseFolder("usr_other", d.deviceId)).rejects.toThrow(
    "connector-offline",
  );
  const selection = await connectors.chooseFolder(actor, d.deviceId);
  expect(await connectors.chooseFolder(actor, d.deviceId)).toEqual(selection);
  await expect(connectors.prepare(actor, d.deviceId, "sd_" + "a".repeat(32))).rejects.toThrow(
    "connector-folder-selection-pending",
  );
  const claimed = await connectors.claimFolder(d.credential);
  expect(claimed?.status).toBe("choosing");
  expect(await connectors.claimFolder(d.credential)).toBeNull();
  const other = await connectors.pair(actor, { version: 1, name: "Other laptop" });
  await expect(
    connectors.finishFolder(other.credential, { ...claimed, status: "cancelled" }),
  ).rejects.toThrow("folder-selection-expired");
  for (const changed of [
    { requestId: "fp_" + "f".repeat(32) },
    { deviceId: other.deviceId },
    { profileId: "wrong-project" },
    { expiresAt: new Date().toISOString() },
    { status: "queued" },
  ])
    await expect(
      connectors.finishFolder(d.credential, {
        ...claimed,
        status: "selected",
        source: probe,
        ...changed,
      }),
    ).rejects.toThrow("folder-selection-expired");
  for (const source of [
    undefined,
    { ...probe, origin: "https://wrong.invalid/project.git" },
    { ...probe, profileId: "other-project" },
  ])
    await expect(
      connectors.finishFolder(d.credential, {
        ...claimed,
        status: "selected",
        ...(source ? { source } : {}),
      }),
    ).rejects.toThrow("connector-source-test-required");
  await expect(
    connectors.finishFolder(d.credential, { ...claimed, status: "cancelled", source: probe }),
  ).rejects.toThrow("folder-selection-invalid");
  expect(
    await connectors.finishFolder(d.credential, {
      ...claimed,
      status: "selected",
      source: { ...probe, repository: "E:\\new-checkout" },
    }),
  ).toEqual({ accepted: true });
  expect(await connectors.diagnostics(actor, d.deviceId)).toBeUndefined();
  await connectors.heartbeat(d.credential, {
    probe: { ...probe, repository: "E:\\new-checkout" },
    folderPicker: true,
  });
  expect((await connectors.list(actor)).find((v) => v.deviceId === d.deviceId)).toMatchObject({
    source: { repository: "E:\\new-checkout" },
    folderSelection: { status: "selected" },
  });
  expect(git.importBundle).not.toHaveBeenCalled();
});
it("reports cancellation, failures and expiry, denies revocation and concurrent source publication", async () => {
  let at = Date.now();
  const { connectors } = stores(() => new Date(at));
  const d = await connectors.pair(actor, { version: 1, name: "Laptop" });
  const online = () => connectors.heartbeat(d.credential, { folderPicker: true });
  for (const status of ["cancelled", "failed"]) {
    await online();
    await connectors.chooseFolder(actor, d.deviceId);
    const selection = await connectors.claimFolder(d.credential);
    await connectors.finishFolder(d.credential, { ...selection, status });
    expect((await connectors.list(actor))[0]?.folderSelection?.status).toBe(status);
  }
  for (const claim of [false, true]) {
    await online();
    await connectors.chooseFolder(actor, d.deviceId);
    if (claim) await connectors.claimFolder(d.credential);
    at += 91000;
    expect((await connectors.list(actor))[0]?.folderSelection?.status).toBe("expired");
    expect(await connectors.claimFolder(d.credential)).toBeNull();
  }
  await online();
  const name = "sd_" + "c".repeat(32) + ".source.json";
  const job = {
    version: 1,
    requestId: "sd_" + "c".repeat(32),
    deviceId: d.deviceId,
    userId: actor,
    baseHead: "a".repeat(40),
    createdAt: new Date(at).toISOString(),
    expiresAt: new Date(at + 60000).toISOString(),
    status: "queued",
  };
  await writeFile(join(connectors.root, name), JSON.stringify(job));
  await expect(connectors.chooseFolder(actor, d.deviceId)).rejects.toThrow("connector-source-busy");
  await writeFile(join(connectors.root, name), JSON.stringify({ ...job, status: "failed" }));
  await connectors.chooseFolder(actor, d.deviceId);
  await connectors.revoke(actor, d.deviceId);
  expect((await connectors.list(actor))[0]).not.toHaveProperty("folderSelection");
  await expect(connectors.claimFolder(d.credential)).rejects.toThrow(
    "connector-authentication-required",
  );
  connectors.close();
});
it("archives and restores configuration with history while denying new pairing, source publication and destination readiness", async () => {
  const { settings, connectors } = stores();
  const d = await connectors.pair(actor, { version: 1, name: "Laptop" });
  await connectors.heartbeat(d.credential, { folderPicker: true });
  const archived = await settings.save(actor, { ...input(), archived: true });
  expect(archived).toMatchObject({ archived: true, revision: 2 });
  expect(
    (await settings.list(actor)).find((p) => p.profileId === "servix-development")?.archived,
  ).toBe(true);
  await expect(connectors.pair(actor, { version: 1, name: "New laptop" })).rejects.toThrow(
    "settings-project-archived",
  );
  await expect(connectors.prepare(actor, d.deviceId, "sd_" + "a".repeat(32))).rejects.toThrow(
    "settings-project-archived",
  );
  await expect(connectors.chooseFolder(actor, d.deviceId)).rejects.toThrow(
    "settings-project-archived",
  );
  const target = vi.fn(async () => true);
  expect(
    (await settings.test(actor, "servix-development", d.deviceId, connectors, target)).ready,
  ).toBe(false);
  expect(target).not.toHaveBeenCalled();
  expect(
    await settings.save(actor, { ...input(), expectedRevision: 2, archived: false }),
  ).toMatchObject({ archived: false, revision: 3 });
  expect((await readdir(join(settings.root, "history"))).length).toBeGreaterThanOrEqual(4);
  expect((await connectors.pair(actor, { version: 1, name: "Restored laptop" })).profileId).toBe(
    "servix-development",
  );
});
it("persists owner-only revisioned settings, preserves history, rejects stale concurrent edits and prevents retargeting", async () => {
  const { settings } = stores();
  expect((await settings.list(actor)).find((p) => p.profileId === "servix-development")).toEqual(
    defaultDeploymentSettings,
  );
  await expect(settings.list("usr_denied")).rejects.toThrow("settings-access-denied");
  await expect(settings.save("usr_developer", input())).rejects.toThrow("settings-access-denied");
  const saved = await settings.save(actor, { ...input(), preservedPaths: ["backend/attachment"] });
  expect(saved.revision).toBe(2);
  expect(
    (await new DeploymentSettingsStore(settings.root, async () => true).profile(saved.profileId))
      .preservedPaths,
  ).toEqual(["backend/attachment"]);
  expect((await readdir(join(settings.root, "history"))).length).toBeGreaterThan(0);
  const attempts = await Promise.allSettled([
    settings.save(actor, { ...input(), expectedRevision: 2 }),
    settings.save(actor, { ...input(), expectedRevision: 2 }),
  ]);
  expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
  await expect(settings.save(actor, input())).rejects.toThrow("settings-revision-conflict");
  await expect(
    settings.save(actor, {
      ...input(),
      expectedRevision: 3,
      destination: { ...input().destination, root: "D:\\Servix" },
    }),
  ).rejects.toThrow("approved-servix-destination-is-fixed");
  await expect(
    settings.save(actor, { ...input(), expectedRevision: 3, preservedPaths: ["frontend"] }),
  ).rejects.toThrow("preservation-overlaps-required-code");
  await expect(
    settings.save(actor, { ...input(), expectedRevision: 3, env: { PASSWORD: "forbidden" } }),
  ).rejects.toThrow();
});
it("binds other-project connectors to their own origin, reports honest pending destination state, and isolates Servix publication", async () => {
  const { settings, connectors, git } = stores();
  const custom = {
    ...input(),
    profileId: "hrms-dev",
    displayName: "HRMS",
    expectedRevision: 0,
    repositoryOrigin: "https://example.invalid/team/hrms.git",
    sourceFolder: "D:\\HRMS",
    destination: {
      ...input().destination,
      root: "D:\\hrmsDev",
      credentialProfile: "not-connected" as const,
    },
  };
  await expect(
    settings.save(actor, {
      ...custom,
      destination: { ...custom.destination, credentialProfile: "server21-development" },
    }),
  ).rejects.toThrow("destination-profile-not-approved");
  await settings.save(actor, custom);
  const d = await connectors.pair(actor, {
    version: 1,
    name: "Laptop",
    profileId: custom.profileId,
  });
  expect(d.repositoryOrigin).toBe(custom.repositoryOrigin);
  expect(d.repositoryId).not.toBe("gitrepo_6cb7e163f807493fa37963196c49fbac");
  await connectors.heartbeat(d.credential, {
    probe: {
      version: 1,
      profileId: "hrms-dev",
      repository: "D:\\HRMS",
      origin: custom.repositoryOrigin,
      head: "a".repeat(40),
      branch: "feature/dev",
      checkedAt: new Date().toISOString(),
    },
  });
  expect(await connectors.list("usr_other")).toEqual([]);
  const target = vi.fn(async () => true);
  const result = await settings.test(actor, "hrms-dev", d.deviceId, connectors, target);
  expect(result.ready).toBe(false);
  expect(result.checks[1]?.status).toBe("passed");
  expect(result.checks[2]?.status).toBe("pending");
  expect(target).not.toHaveBeenCalled();
  await expect(connectors.baseline(d.credential, { heads: ["a".repeat(40)] })).rejects.toThrow(
    "connector-source-unavailable",
  );
  await expect(connectors.prepare(actor, d.deviceId, "sd_" + "a".repeat(32))).rejects.toThrow(
    "connector-offline",
  );
  expect(git.head).not.toHaveBeenCalled();
  expect(git.importBundle).not.toHaveBeenCalled();
  expect(git.exportBundle).not.toHaveBeenCalled();
});
it("tests fresh actual folder/origin/branch evidence without Git writes and expires or clears diagnostics", async () => {
  let at = Date.now();
  const now = () => new Date(at);
  const { settings, connectors, git } = stores(now);
  const d = await connectors.pair(actor, { version: 1, name: "L-1770" });
  const probe = {
    version: 1,
    profileId: "servix-development",
    repository: "D:\\servixDev",
    origin: defaultDeploymentSettings.repositoryOrigin,
    repositoryId: "gitrepo_6cb7e163f807493fa37963196c49fbac",
    remoteName: "frevos",
    head: "a".repeat(40),
    branch: "feature/dev",
    checkedAt: now().toISOString(),
  };
  await connectors.heartbeat(d.credential);
  expect(
    (await settings.test(actor, "servix-development", d.deviceId, connectors, async () => true))
      .ready,
  ).toBe(false);
  await connectors.heartbeat(d.credential, { probe });
  expect(
    (await settings.test(actor, "servix-development", d.deviceId, connectors, async () => true))
      .ready,
  ).toBe(true);
  expect((await connectors.list(actor))[0]?.source?.repository).toBe(probe.repository);
  expect(
    (
      await settings.test(actor, "servix-development", d.deviceId, connectors, async () => {
        throw Error("offline");
      })
    ).ready,
  ).toBe(false);
  for (const changed of [
    { origin: "https://example.invalid/other.git" },
    { branch: "main" },
    { profileId: "other-project" },
  ]) {
    await connectors.heartbeat(d.credential, { probe: { ...probe, ...changed } });
    expect(
      (await settings.test(actor, "servix-development", d.deviceId, connectors, async () => true))
        .ready,
    ).toBe(false);
  }
  await connectors.heartbeat(d.credential, {
    probe: { ...probe, repository: "E:\\new-laptop-checkout" },
  });
  expect(
    (await settings.test(actor, "servix-development", d.deviceId, connectors, async () => true))
      .ready,
  ).toBe(true);
  await connectors.heartbeat(d.credential, { probe });
  at += 21000;
  expect(await connectors.diagnostics(actor, d.deviceId)).toBeUndefined();
  await connectors.heartbeat(d.credential, { probe });
  await connectors.heartbeat(d.credential, {});
  expect(await connectors.diagnostics(actor, d.deviceId)).toBeUndefined();
  await connectors.revoke(actor, d.deviceId);
  await expect(connectors.heartbeat(d.credential, { probe })).rejects.toThrow(
    "connector-authentication-required",
  );
  expect(git.head).not.toHaveBeenCalled();
  expect(git.importBundle).not.toHaveBeenCalled();
});
it("rejects malformed, mismatched and linked settings storage", async () => {
  const { settings } = stores();
  await settings.list(actor);
  await expect(settings.profile("../escape")).rejects.toThrow();
  await expect(settings.profile("unknown-project")).rejects.toThrow("settings-profile-not-found");
  await writeFile(
    join(settings.root, "servix-development.json"),
    JSON.stringify({ ...defaultDeploymentSettings, profileId: "other-project" }),
  );
  await expect(settings.profile("servix-development")).rejects.toThrow(
    "settings-profile-identity-mismatch",
  );
  await writeFile(join(settings.root, "servix-development.json"), "x".repeat(32769));
  await expect(settings.profile("servix-development")).rejects.toThrow(
    "settings-storage-unavailable",
  );
  const linked = join(root, "link");
  await symlink(settings.root, linked, "junction");
  await expect(new DeploymentSettingsStore(linked, async () => true).list(actor)).rejects.toThrow(
    "settings-storage-unavailable",
  );
});
it("snapshots preserve policy into the immutable deployment request and build boundary", async () => {
  await mkdir(join(root, "requests"));
  await mkdir(join(root, "results"));
  const { settings } = stores();
  await settings.save(actor, { ...input(), preservedPaths: ["backend/attachment"] });
  const build = vi.fn(async () => ({
    manifestSha256: "b".repeat(64),
    archiveSha256: "c".repeat(64),
  }));
  const store = new ServixDeploymentStore(
    root,
    { head: async () => "a".repeat(40), build },
    async () => true,
    () => new Date(),
    undefined,
    settings,
  );
  const id = "sd_" + "d".repeat(32);
  const request = await store.request(actor, {
    version: 1,
    requestId: id,
    confirmation: "deploy-servix-development",
    changeDetails,
  });
  expect(request.settingsRevision).toBe(2);
  await expect.poll(async () => (await store.state()).runs[0]?.status).toBe("activating");
  expect(build).toHaveBeenCalledWith(id, "a".repeat(40), ["backend/attachment"]);
  expect(
    JSON.parse(await readFile(join(root, "requests", id + ".json"), "utf8")).preservedPaths,
  ).toEqual(["backend/attachment"]);
  store.close();
});
it("bounds profile capacity including both managed defaults, and refuses linked revision history", async () => {
  const { settings } = stores();
  await settings.list(actor);
  await Promise.all(
    Array.from({ length: 98 }, async (_, i) => {
      const profileId = `project-${String(i).padStart(3, "0")}`;
      await writeFile(
        join(settings.root, profileId + ".json"),
        JSON.stringify({ ...defaultDeploymentSettings, profileId, runner: "not-connected" }),
      );
    }),
  );
  expect(await settings.list(actor)).toHaveLength(100);
  await expect(
    settings.save(actor, { ...input(), profileId: "one-too-many", expectedRevision: 0 }),
  ).rejects.toThrow("settings-capacity");
  await writeFile(
    join(settings.root, "overflow-project.json"),
    JSON.stringify({ ...defaultDeploymentSettings, profileId: "overflow-project" }),
  );
  await expect(settings.list(actor)).rejects.toThrow("settings-capacity");
  const other = new DeploymentSettingsStore(join(root, "other"), async () => true);
  await other.list(actor);
  const historyTarget = join(root, "history-target");
  await mkdir(historyTarget);
  await symlink(historyTarget, join(other.root, "history"), "junction");
  await expect(other.save(actor, input())).rejects.toThrow("settings-storage-unavailable");
  expect(await readdir(historyTarget)).toEqual([]);
});
it("denies unknown pairing and source publication without a fresh matching repository check", async () => {
  const { settings, connectors, git } = stores();
  await expect(
    connectors.pair(actor, { version: 1, name: "test", profileId: "missing-project" }),
  ).rejects.toThrow("settings-profile-not-found");
  const d = await connectors.pair(actor, { version: 1, name: "test" });
  await connectors.heartbeat(d.credential);
  await expect(connectors.prepare(actor, d.deviceId, "sd_" + "a".repeat(32))).rejects.toThrow(
    "connector-source-test-required",
  );
  expect(git.head).not.toHaveBeenCalled();
  await writeFile(join(settings.root, "servix-development.json"), "malformed");
  await expect(settings.save(actor, input())).rejects.toThrow();
  expect(await readFile(join(settings.root, "servix-development.json"), "utf8")).toBe("malformed");
});
