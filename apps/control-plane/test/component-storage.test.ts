import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { ComponentDeployments } from "../src/component-deployments.js";

it("fails closed on corrupt, oversized and linked configuration storage, and preserves revision history", async () => {
  const root = await mkdtemp(join(tmpdir(), "devsetu-storage-"));
  const store = new ComponentDeployments(
    join(root, "state"),
    "ws_server20",
    async (actor) => actor === "usr_owner",
    "git",
  );
  const input = {
    version: 1,
    profileId: "storage-project",
    expectedRevision: 0,
    displayName: "Storage project",
    sourceFolder: "D:\\source",
    archived: false,
    components: [
      {
        id: "api",
        name: "API",
        context: ".",
        output: ".",
        recipe: "node-source",
        builderId: "unassigned",
        destinationId: "unassigned",
        destinationBinding: "api",
        dependsOn: [],
        preservedPaths: [".env"],
      },
    ],
  };
  try {
    await expect(store.save("usr_other", input)).rejects.toThrow("denied");
    await store.save("usr_owner", input);
    const file = join(root, "state/profile-storage-project.json"),
      original = await readFile(file);
    await writeFile(file, Buffer.alloc(1048577));
    await expect(store.profile(input.profileId)).rejects.toThrow("invalid-component-record");
    await writeFile(file, "{invalid");
    await expect(store.state("usr_owner")).rejects.toThrow();
    await writeFile(file, original);
    const {
      revision,
      repository: _repo,
      updatedAt: _at,
      updatedBy: _by,
      ...fields
    } = (await store.profile(input.profileId))!;
    const archived = await store.save("usr_owner", {
      ...fields,
      expectedRevision: revision,
      archived: true,
    });
    expect(archived.revision).toBe(2);
    await expect(store.git(input.profileId)).rejects.toThrow("unavailable");
    expect((await store.connectorProfile(input.profileId))?.archived).toBe(true);
    expect(await store.connectorProfile("absent-profile")).toBeUndefined();
    const other = join(root, "linked-state");
    await symlink(join(root, "state"), other, process.platform === "win32" ? "junction" : "dir");
    const linked = new ComponentDeployments(other, "ws_server20", async () => true, "git");
    await expect(linked.state("usr_owner")).rejects.toThrow("linked-component-storage");
    const occupied = join(root, "occupied");
    await mkdir(occupied);
    await mkdir(join(occupied, "profile-directory.json"));
    await expect(
      new ComponentDeployments(occupied, "ws_server20", async () => true, "git").profile(
        "directory",
      ),
    ).rejects.toThrow("invalid-component-record");
  } finally {
    const target = resolve(root);
    expect(target.startsWith(resolve(tmpdir())) && target.includes("devsetu-storage-")).toBe(true);
    await rm(target, { recursive: true, force: true });
  }
});

it("bounds profile, executor and record counts before accepting more work", async () => {
  const root = await mkdtemp(join(tmpdir(), "devsetu-capacity-"));
  const store = new ComponentDeployments(root, "ws_server20", async () => true, "git");
  const input = {
    version: 1,
    profileId: "capacity-app",
    expectedRevision: 0,
    displayName: "Capacity fixture",
    sourceFolder: "D:\\source",
    archived: false,
    components: [
      {
        id: "api",
        name: "API",
        context: ".",
        output: ".",
        recipe: "node-source",
        builderId: "unassigned",
        destinationId: "unassigned",
        destinationBinding: "api",
        dependsOn: [],
        preservedPaths: [],
      },
    ],
  };
  try {
    const saved = await store.save("usr_owner", input);
    for (let n = 1; n < 100; n++) {
      const profileId = "capacity-" + n;
      await writeFile(
        join(root, "profile-" + profileId + ".json"),
        JSON.stringify({ ...saved, profileId }),
      );
    }
    await expect(
      store.save("usr_owner", { ...input, profileId: "overflow-profile" }),
    ).rejects.toThrow("profile-capacity");
    for (let n = 0; n < 100; n++) {
      const id = "ex_" + n.toString(16).padStart(32, "0");
      await writeFile(
        join(root, "executor-" + id + ".json"),
        JSON.stringify({
          id,
          name: "Fixture executor",
          profileId: saved.profileId,
          role: "builder",
          userId: "usr_owner",
          status: "active",
          createdAt: saved.updatedAt,
          expiresAt: new Date(Date.now() + 60000).toISOString(),
          bindings: [],
          systemName: null,
          credentialHash: "0".repeat(64),
        }),
      );
    }
    await expect(
      store.enroll("usr_owner", {
        profileId: saved.profileId,
        role: "builder",
        name: "Overflow executor",
      }),
    ).rejects.toThrow("executor-capacity");
    for (let n = 100; n < 1001; n++)
      await writeFile(join(root, "profile-capacity-" + n + ".json"), "{}");
    await expect(store.state("usr_owner")).rejects.toThrow("record-capacity");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30000);
