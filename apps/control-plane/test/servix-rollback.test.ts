const changeDetails = { message: "Update development code", approvedBy: "Fixture owner / CHG-123" };
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ServixDeploymentSchema } from "@frevos/contracts";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DeploymentSettingsStore, defaultDeploymentSettings } from "../src/deployment-settings.js";
import { ServixDeploymentStore } from "../src/servix-deployment.js";

let root: string;
let now: Date;
const id = (digit: string) => "sd_" + digit.repeat(32);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "frevos-rollback-"));
  now = new Date("2026-10-21T12:00:00.000Z");
  for (const name of ["jobs", "requests", "results"]) await mkdir(join(root, name));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
async function saved(digit: string, minute: number) {
  const requestId = id(digit),
    manifest = JSON.stringify({ release: digit }),
    zip = "immutable-zip-" + digit;
  const run = ServixDeploymentSchema.parse({
    version: 1,
    requestId,
    workspaceId: "ws_server20",
    requestedBy: "usr_owner",
    target: "server21-servix-development",
    status: "succeeded",
    sourceHead: digit.repeat(40),
    artifactDigest: hash(manifest),
    createdAt: `2026-10-21T10:0${minute}:00.000Z`,
    updatedAt: `2026-10-21T10:0${minute}:30.000Z`,
    expiresAt: "2026-10-21T11:00:00.000Z",
  });
  const directory = join(root, "builds", requestId);
  await mkdir(join(directory, "release"), { recursive: true });
  await writeFile(join(directory, "release", "manifest.json"), manifest);
  await writeFile(join(directory, "release.zip"), zip);
  await writeFile(
    join(directory, "artifact.json"),
    JSON.stringify({ manifestSha256: hash(manifest), archiveSha256: hash(zip) }),
  );
  await writeFile(join(root, "jobs", requestId + ".json"), JSON.stringify(run));
  return run;
}
function request(
  current: string,
  target: string,
  job: string,
  operation: "rollback" | "restore" = "rollback",
) {
  return {
    version: 1,
    requestId: id(job),
    expectedCurrentRequestId: id(current),
    restoreRequestId: id(target),
    operation,
    confirmation: "restore-servix-development",
    changeDetails,
  };
}
it("archiving a project prevents new deploy and saved-build restore without deleting its retained releases", async () => {
  const a = await saved("a", 1),
    b = await saved("b", 2);
  const settings = new DeploymentSettingsStore(join(root, "configuration"), async () => true);
  const {
    revision,
    runner: _runner,
    updatedAt: _at,
    updatedBy: _by,
    ...fields
  } = defaultDeploymentSettings;
  await settings.save("usr_windows_admin", {
    ...fields,
    expectedRevision: revision,
    archived: true,
  });
  const build = vi.fn();
  const store = new ServixDeploymentStore(
    root,
    { head: async () => b.sourceHead!, build },
    async () => true,
    () => now,
    undefined,
    settings,
  );
  await expect(
    store.request("usr_owner", {
      version: 1,
      requestId: id("c"),
      confirmation: "deploy-servix-development",
      changeDetails,
    }),
  ).rejects.toThrow("settings-project-archived");
  await expect(store.restore("usr_owner", request("b", "a", "d"))).rejects.toThrow(
    "settings-project-archived",
  );
  expect((await store.state()).currentRequestId).toBe(b.requestId);
  expect(await readFile(join(root, "builds", a.requestId, "release.zip"), "utf8")).toBe(
    "immutable-zip-a",
  );
  expect(build).not.toHaveBeenCalled();
  store.close();
});
it("cycles saved builds repeatedly without publishing, rebuilding, or consuming the original artifact", async () => {
  const a = await saved("a", 1),
    b = await saved("b", 2),
    build = vi.fn(),
    publish = vi.fn();
  const store = new ServixDeploymentStore(
    root,
    { head: async () => b.sourceHead!, build },
    async () => true,
    () => now,
    { list: publish, prepare: publish },
    new DeploymentSettingsStore(join(root, "configuration"), async () => true),
  );
  expect(await store.state()).toMatchObject({
    currentRequestId: b.requestId,
    rollbackRequestId: a.requestId,
  });
  const rollback = await store.restore("usr_owner", request("b", "a", "c"));
  expect(rollback).toMatchObject({
    changeDetails,
    settingsRevision: 1,
    preservedPaths: defaultDeploymentSettings.preservedPaths,
    status: "activating",
    operation: "rollback",
    releaseRequestId: a.requestId,
    previousRequestId: b.requestId,
    sourceHead: a.sourceHead,
  });
  expect(await store.restore("usr_owner", request("b", "a", "c"))).toEqual(rollback);
  await expect(
    store.restore("usr_owner", {
      ...request("b", "a", "c"),
      changeDetails: { ...changeDetails, message: "Different rollback" },
    }),
  ).rejects.toThrow("deployment-request-conflict");
  await expect(store.restore("usr_other", request("b", "a", "c"))).rejects.toThrow(
    "deployment-request-conflict",
  );
  await expect(
    store.request("usr_owner", {
      version: 1,
      requestId: id("f"),
      confirmation: "deploy-servix-development",
      changeDetails,
    }),
  ).rejects.toThrow("deployment-target-busy");
  async function complete(job: string, source: typeof a) {
    now = new Date(now.getTime() + 1000);
    await writeFile(
      join(root, "results", id(job) + ".json"),
      JSON.stringify({
        requestId: id(job),
        sourceHead: source.sourceHead,
        artifactDigest: source.artifactDigest,
        status: "succeeded",
        preservedFiles: 145,
      }),
    );
    return store.state();
  }
  expect(await complete("c", a)).toMatchObject({
    currentRequestId: id("c"),
    rollbackRequestId: b.requestId,
  });
  const restore = await store.restore("usr_owner", request("c", "b", "d", "restore"));
  expect(restore.releaseRequestId).toBe(b.requestId);
  await complete("d", b);
  const again = await store.restore("usr_owner", request("d", "c", "e"));
  expect(again.releaseRequestId).toBe(a.requestId);
  await complete("e", a);
  expect(build).not.toHaveBeenCalled();
  expect(publish).not.toHaveBeenCalled();
  expect(await readFile(join(root, "builds", a.requestId, "release.zip"), "utf8")).toBe(
    "immutable-zip-a",
  );
  const freshBuild = vi.fn(async () => ({
    manifestSha256: "f".repeat(64),
    archiveSha256: "e".repeat(64),
  }));
  const fresh = new ServixDeploymentStore(
    root,
    { head: async () => "f".repeat(40), build: freshBuild },
    async () => true,
    () => now,
  );
  const next = await fresh.request("usr_owner", {
    version: 1,
    requestId: id("8"),
    confirmation: "deploy-servix-development",
    changeDetails,
  });
  expect(next).toMatchObject({
    operation: "deploy",
    sourceHead: "f".repeat(40),
    previousRequestId: id("e"),
  });
  expect(next.releaseRequestId).toBeUndefined();
  await expect
    .poll(async () => (await fresh.state()).runs.find((run) => run.requestId === id("8"))?.status)
    .toBe("activating");
  expect(freshBuild).toHaveBeenCalledExactlyOnceWith(id("8"), "f".repeat(40));
});
it("rejects stale selection, unavailable or modified artifacts and unauthorized restore requests", async () => {
  await saved("a", 1);
  await saved("b", 2);
  let allowed = false;
  const store = new ServixDeploymentStore(
    root,
    { head: async () => "b".repeat(40), build: vi.fn() },
    async () => allowed,
    () => now,
  );
  await expect(store.restore("usr_owner", request("b", "a", "c"))).rejects.toThrow(
    "deployment-access-denied",
  );
  allowed = true;
  await expect(store.restore("usr_owner", request("a", "b", "c"))).rejects.toThrow(
    "deployment-current-release-changed",
  );
  await expect(store.restore("usr_owner", request("b", "b", "c"))).rejects.toThrow(
    "saved-release-not-selectable",
  );
  await expect(
    store.restore("usr_owner", { ...request("b", "a", "c"), path: "D:\\Servix" }),
  ).rejects.toThrow();
  await writeFile(join(root, "builds", id("a"), "release.zip"), "tampered");
  await expect(store.restore("usr_owner", request("b", "a", "c"))).rejects.toThrow(
    "saved-release-unavailable",
  );
  await rm(join(root, "builds", id("a"), "artifact.json"));
  expect((await store.state()).rollbackRequestId).toBeUndefined();
  await expect(store.restore("usr_owner", request("b", "a", "c"))).rejects.toThrow(
    "deployment-rollback-target-changed",
  );
});
it("rejects a non-previous rollback and keeps uncertain activation publication blocking", async () => {
  await saved("a", 1);
  await saved("b", 2);
  await saved("c", 3);
  const store = new ServixDeploymentStore(
    root,
    { head: async () => "c".repeat(40), build: vi.fn() },
    async () => true,
    () => now,
  );
  await expect(store.restore("usr_owner", request("c", "a", "d"))).rejects.toThrow(
    "deployment-rollback-target-changed",
  );
  await writeFile(join(root, "requests", id("d") + ".json"), "existing-unknown-queue-entry");
  const uncertain = await store.restore("usr_owner", request("c", "a", "d", "restore"));
  expect(uncertain.status).toBe("recovery-required");
  await expect(store.restore("usr_owner", request("c", "b", "e"))).rejects.toThrow(
    "deployment-target-busy",
  );
  expect(await readFile(join(root, "requests", id("d") + ".json"), "utf8")).toBe(
    "existing-unknown-queue-entry",
  );
});
