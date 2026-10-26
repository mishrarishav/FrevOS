import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  lstat,
  writeFile,
  unlink,
  mkdir,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { ProtectedModelSecrets } from "../src/model-secrets.js";
it("stores only protected bytes and binds retrieval to the workspace, actor and connection", async () => {
  const root = await mkdtemp(join(tmpdir(), "devsetu-model-secret-")),
    folder = join(root, "ws_fixture", "secrets"),
    scope = {
      workspaceId: "ws_fixture",
      actor: "usr_fixture",
      connectionId: "mc_" + "a".repeat(32),
    },
    value = "SYNTHETIC_NATIVE_MODEL_SECRET";
  try {
    const vault = new ProtectedModelSecrets(folder),
      ref = await vault.create(scope, value);
    expect(await vault.read(ref, scope)).toBe(value);
    for (const file of await readdir(folder))
      expect((await readFile(join(folder, file))).includes(Buffer.from(value))).toBe(false);
    await expect(vault.read(ref, { ...scope, actor: "usr_other" })).rejects.toThrow(
      "agent-secret-scope-denied",
    );
    await expect(
      vault.read(ref, { ...scope, connectionId: "mc_" + "b".repeat(32) }),
    ).rejects.toThrow("agent-secret-scope-denied");
    await expect(vault.read(ref, { ...scope, workspaceId: "ws_other" })).rejects.toThrow(
      "agent-secret-scope-denied",
    );
    await expect(vault.create({ ...scope, workspaceId: "ws_other" }, value)).rejects.toThrow(
      "agent-secret-scope-denied",
    );
    await expect(vault.read("model-key/../escape", scope)).rejects.toThrow(
      "agent-secret-reference-denied",
    );
    await expect(vault.read("model-key/" + "f".repeat(32), scope)).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("authenticates Linux encrypted envelopes and fails closed for missing keys, permissions, corruption and links", async () => {
  const root = await mkdtemp(join(tmpdir(), "devsetu-portable-vault-")),
    folder = join(root, "ws_fixture", "secrets"),
    scope = {
      workspaceId: "ws_fixture",
      actor: "usr_fixture",
      connectionId: "mc_" + "a".repeat(32),
    };
  let modeFailure = false,
    uidFailure = false,
    badPath = "";
  // Exercise the portable crypto and policy branches on Windows; real Unix ACL acceptance is separate.
  const vault = new ProtectedModelSecrets(folder, {
    platform: "linux",
    uid: () => 2001,
    metadata: async (file: string) => {
      const s = await lstat(file);
      return Object.assign(s, {
        mode:
          (s.mode & ~0o777) |
          (modeFailure && (!badPath || file.endsWith(badPath))
            ? 0o777
            : s.isDirectory()
              ? 0o700
              : 0o600),
        uid: uidFailure ? 2002 : 2001,
      });
    },
  });
  try {
    await expect(vault.read("model-key/" + "a".repeat(32), scope)).rejects.toThrow();
    expect(await readdir(folder)).toEqual([]);
    const ref = await vault.create(scope, "SYNTHETIC_PORTABLE_VALUE"),
      file = join(folder, ref.slice(10) + ".sealed");
    expect(await vault.read(ref, scope)).toBe("SYNTHETIC_PORTABLE_VALUE");
    await expect(vault.read(ref, { ...scope, actor: "usr_other" })).rejects.toThrow(
      "agent-secret-scope-denied",
    );
    modeFailure = true;
    await expect(vault.read(ref, scope)).rejects.toThrow("agent-secret-storage-permissions");
    modeFailure = false;
    for (const leaf of ["master.key", ref.slice(10) + ".sealed"]) {
      badPath = leaf;
      modeFailure = true;
      await expect(vault.read(ref, scope)).rejects.toThrow("agent-secret-storage-permissions");
      modeFailure = false;
    }
    badPath = "";
    uidFailure = true;
    await expect(vault.create(scope, "SYNTHETIC_PORTABLE_VALUE")).rejects.toThrow();
    uidFailure = false;
    const bytes = await readFile(file);
    bytes[15] = bytes[15]! ^ 1;
    await writeFile(file, bytes);
    await expect(vault.read(ref, scope)).rejects.toThrow();
    await writeFile(join(folder, "master.key"), Buffer.alloc(3));
    await expect(vault.read(ref, scope)).rejects.toThrow("agent-secret-storage-permissions");
    await unlink(join(folder, "master.key"));
    await mkdir(join(root, "outside"));
    await symlink(
      join(root, "outside"),
      join(root, "linked"),
      process.platform === "win32" ? "junction" : "dir",
    );
    const linked = new ProtectedModelSecrets(join(root, "linked", "ws_fixture", "secrets"));
    await expect(linked.create(scope, "SYNTHETIC_PORTABLE_VALUE")).rejects.toThrow(
      "agent-linked-storage",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
