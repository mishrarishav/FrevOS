import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { ProjectFolderSearch } from "../src/project-folder-search.js";
it("binds folder queries to catalog/device/actor, rejects replay/tampering and expires bounded work", async () => {
  const root = await mkdtemp(join(tmpdir(), "devsetu-folder-jobs-"));
  let now = Date.now(),
    allowed = true;
  const deviceId = "fc_" + "a".repeat(32),
    body = { version: 1, projectId: "prj_fixture", deviceId };
  const store = new ProjectFolderSearch(
    root,
    async (c) => ({
      deviceId: c === "alice" ? deviceId : "fc_" + "b".repeat(32),
      userId: c === "alice" ? "usr_alice" : "usr_bob",
    }),
    async (a, input) => {
      if (
        !allowed ||
        a !== "usr_alice" ||
        input.projectId !== body.projectId ||
        input.deviceId !== deviceId
      )
        throw Error("scope");
      return { query: "Fixture", roots: ["D:\\"] };
    },
    () => new Date(now),
  );
  try {
    await expect(store.request("usr_bob", body)).rejects.toThrow();
    const j = await store.request("usr_alice", body);
    await expect(store.request("usr_alice", body)).rejects.toThrow("folder-search-busy");
    await expect(store.get("usr_bob", j.id)).rejects.toThrow();
    await expect(store.get("usr_alice", "../escape")).rejects.toThrow();
    expect(await store.claim("bob")).toBeNull();
    const work = (await store.claim("alice"))!;
    expect(await store.claim("alice")).toBeNull();
    const result = {
      ...work,
      status: "succeeded",
      result: {
        matches: [{ root: "D:\\", path: "Fixture" }],
        scannedDirectories: 3,
        partial: true,
        gaps: ["search-limit"],
      },
    };
    await expect(store.complete("bob", result)).rejects.toThrow();
    await expect(store.complete("alice", { ...result, query: "unrelated" })).rejects.toThrow();
    await expect(
      store.complete("alice", {
        ...result,
        result: { ...result.result, matches: [{ root: "Z:\\", path: "Fixture" }] },
      }),
    ).rejects.toThrow();
    expect(await store.complete("alice", result)).toEqual({ accepted: true });
    expect((await store.get("usr_alice", j.id)).completedAt).toBe(new Date(now).toISOString());
    await expect(store.complete("alice", result)).rejects.toThrow();
    const expired = await store.request("usr_alice", body);
    now += 120001;
    expect((await store.get("usr_alice", expired.id)).status).toBe("expired");
    expect(await store.claim("alice")).toBeNull();
    allowed = false;
    await expect(store.get("usr_alice", j.id)).rejects.toThrow();
    allowed = true;
    now += 86400000;
    await store.request("usr_alice", body);
    await expect(readFile(join(root, j.id + ".json"))).rejects.toThrow();
    await writeFile(
      join(root, j.id + ".json"),
      JSON.stringify({ ...j, id: "fd_" + "b".repeat(32) }),
    );
    await expect(store.get("usr_alice", j.id)).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
