const changeDetails = { message: "Update development code", approvedBy: "Fixture owner / CHG-123" };
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ServixDeploymentStore } from "../src/servix-deployment.js";
let root: string;
const head = "a".repeat(40),
  digest = "b".repeat(64),
  requestId = `sd_${"c".repeat(32)}`;
const input = { version: 1, requestId, confirmation: "deploy-servix-development", changeDetails };
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "frevos-servix-"));
  for (const name of ["requests", "results"]) await mkdir(join(root, name));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
function deferred() {
  let done!: (value: { manifestSha256: string; archiveSha256: string }) => void;
  const promise = new Promise<{ manifestSha256: string; archiveSha256: string }>((resolve) => {
    done = resolve;
  });
  return { promise, done };
}
it("pins the pushed commit, de-duplicates retries and binds activation to its artifact and actor", async () => {
  const task = deferred(),
    build = vi.fn(() => task.promise),
    store = new ServixDeploymentStore(root, { head: async () => head, build }, async () => true);
  const run = await store.request("usr_admin", input);
  expect(run.sourceHead).toBe(head);
  expect(run.status).toBe("building");
  expect(run.changeDetails).toEqual(changeDetails);
  await expect(
    store.request("usr_admin", { ...input, changeDetails: undefined }),
  ).rejects.toThrow();
  await expect(
    store.request("usr_admin", {
      ...input,
      changeDetails: { ...changeDetails, approvedBy: "Changed person" },
    }),
  ).rejects.toThrow("deployment-request-conflict");
  expect((await store.request("usr_admin", input)).requestId).toBe(requestId);
  expect(build).toHaveBeenCalledOnce();
  await expect(store.request("usr_other", input)).rejects.toThrow("deployment-request-conflict");
  await expect(
    store.request("usr_admin", { ...input, requestId: `sd_${"d".repeat(32)}` }),
  ).rejects.toThrow("deployment-target-busy");
  task.done({ manifestSha256: digest, archiveSha256: "e".repeat(64) });
  await expect.poll(async () => (await store.state()).runs[0]?.status).toBe("activating");
  const approval = JSON.parse(await readFile(join(root, "requests", requestId + ".json"), "utf8"));
  expect(approval).toMatchObject({
    changeDetails,
    requestedBy: "usr_admin",
    workspaceId: "ws_server20",
    sourceHead: head,
    artifactDigest: digest,
    archiveSha256: "e".repeat(64),
    target: "server21-servix-development",
  });
  await writeFile(
    join(root, "results", requestId + ".json"),
    JSON.stringify({
      requestId,
      sourceHead: head,
      artifactDigest: digest,
      status: "succeeded",
      preservedFiles: 145,
    }),
  );
  expect((await store.state()).runs[0]).toMatchObject({
    status: "succeeded",
    preservedFiles: 145,
    url: "http://10.9.69.21:82/",
  });
});
it("rejects paths in browser input and denies a revoked actor", async () => {
  const build = vi.fn(),
    store = new ServixDeploymentStore(root, { head: async () => head, build }, async () => false);
  await expect(store.request("usr_admin", { ...input, target: "D:\\Servix" })).rejects.toThrow();
  await expect(store.request("usr_admin", input)).rejects.toThrow("deployment-access-denied");
  expect(build).not.toHaveBeenCalled();
});
it("rechecks permission after the build before activation", async () => {
  const task = deferred();
  let allowed = true;
  const store = new ServixDeploymentStore(
    root,
    { head: async () => head, build: () => task.promise },
    async () => allowed,
  );
  await store.request("usr_admin", input);
  allowed = false;
  task.done({ manifestSha256: digest, archiveSha256: digest });
  await expect.poll(async () => (await store.state()).runs[0]?.status).toBe("failed");
  await expect(readFile(join(root, "requests", requestId + ".json"))).rejects.toThrow();
});
it("records build failure without starting target activation", async () => {
  const store = new ServixDeploymentStore(
    root,
    {
      head: async () => head,
      build: async () => {
        throw new Error("private build log");
      },
    },
    async () => true,
  );
  await store.request("usr_admin", input);
  await expect
    .poll(async () => (await store.state()).runs[0]?.errorCode)
    .toBe("build-or-authorization-failed");
  expect(JSON.stringify(await store.state())).not.toContain("private build log");
});
it("never resumes interrupted builds or replays an uncertain activation", async () => {
  let now = new Date("2026-10-21T00:00:00.000Z");
  const task = deferred();
  const first = new ServixDeploymentStore(
    root,
    { head: async () => head, build: () => task.promise },
    async () => true,
    () => now,
  );
  await first.request("usr_admin", input);
  const restarted = new ServixDeploymentStore(
    root,
    { head: async () => head, build: vi.fn() },
    async () => true,
    () => now,
  );
  expect((await restarted.state()).runs[0]?.status).toBe("failed");
  first.close();
  task.done({ manifestSha256: digest, archiveSha256: digest });
  await expect.poll(async () => (await restarted.state()).runs[0]?.status).toBe("failed");
  const raw = JSON.parse(await readFile(join(root, "jobs", requestId + ".json"), "utf8"));
  raw.status = "activating";
  raw.artifactDigest = digest;
  await writeFile(join(root, "jobs", requestId + ".json"), JSON.stringify(raw));
  now = new Date("2026-10-21T01:00:00.000Z");
  expect((await restarted.state()).runs[0]?.status).toBe("recovery-required");
  await expect(
    restarted.request("usr_admin", { ...input, requestId: `sd_${"d".repeat(32)}` }),
  ).rejects.toThrow("deployment-target-busy");
});
it("checks heartbeat freshness and rejects mismatched deployment receipts", async () => {
  const task = deferred(),
    store = new ServixDeploymentStore(
      root,
      { head: async () => head, build: () => task.promise },
      async () => true,
    );
  await writeFile(
    join(root, "results", "heartbeat.json"),
    JSON.stringify({ host: "DCAPP7", at: new Date().toISOString() }),
  );
  expect((await store.state()).runnerOnline).toBe(true);
  await writeFile(
    join(root, "results", "heartbeat.json"),
    JSON.stringify({ host: "DCAPP7", at: "2020-01-01T00:00:00.000Z" }),
  );
  expect((await store.state()).runnerOnline).toBe(false);
  await store.request("usr_admin", input);
  task.done({ manifestSha256: digest, archiveSha256: digest });
  await expect.poll(async () => (await store.state()).runs[0]?.status).toBe("activating");
  await writeFile(
    join(root, "results", requestId + ".json"),
    JSON.stringify({
      requestId,
      sourceHead: head,
      artifactDigest: "f".repeat(64),
      status: "succeeded",
      preservedFiles: 145,
    }),
  );
  await expect(store.state()).rejects.toThrow("Artifact mismatch");
});
