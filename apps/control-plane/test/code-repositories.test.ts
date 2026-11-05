import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { inflateRawSync } from "node:zlib";
import { afterEach, expect, it, vi } from "vitest";
import { CodeGit } from "../src/code-git.js";
import { type CentralCodeSource, CodeRepositories } from "../src/code-repositories.js";

const execute = promisify(execFile),
  cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const f of cleanups.splice(0).reverse()) await f();
});
function zipFiles(zip: Buffer) {
  const files = new Map<string, Buffer>();
  let p = 0;
  while (p < zip.length - 4 && zip.readUInt32LE(p) === 0x04034b50) {
    const method = zip.readUInt16LE(p + 8),
      size = zip.readUInt32LE(p + 18),
      nameLength = zip.readUInt16LE(p + 26),
      extra = zip.readUInt16LE(p + 28),
      name = zip.subarray(p + 30, p + 30 + nameLength).toString();
    // Git writes sizes into local headers. The directory entries have empty content.
    const data = zip.subarray(p + 30 + nameLength + extra, p + 30 + nameLength + extra + size);
    files.set(name, method === 8 ? inflateRawSync(data) : data);
    p += 30 + nameLength + extra + size;
  }
  return files;
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "devsetu-code-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const working = join(root, "working"),
    directory = join(root, "central.git"),
    id = "gitrepo_" + "a".repeat(32);
  const git = (...args: string[]) =>
    execute(
      "git",
      [
        "-C",
        working,
        "-c",
        "user.name=Code fixture",
        "-c",
        "user.email=fixture@example.invalid",
        ...args,
      ],
      { windowsHide: true },
    );
  // Seed the same real two-commit history in one import. Repeated init/config/
  // add/commit processes made the first cold Windows fixture exceed its deadline.
  await execute("git", ["init", "--bare", "--initial-branch=main", directory], {
    windowsHide: true,
  });
  const entry = (name: string, bytes: Buffer) =>
    Buffer.concat([
      Buffer.from("M 100644 inline " + name + "\ndata " + bytes.length + "\n"),
      bytes,
      Buffer.from("\n"),
    ]);
  const commit = (subject: string, time: number) =>
    Buffer.from(
      "commit refs/heads/main\ncommitter Code fixture <fixture@example.invalid> " +
        time +
        " +0000\ndata " +
        Buffer.byteLength(subject) +
        "\n" +
        subject +
        "\n",
    );
  const imported = execute("git", ["--git-dir=" + directory, "fast-import", "--quiet"], {
    windowsHide: true,
  });
  imported.child.stdin!.end(
    Buffer.concat([
      commit("Initial source", 1700000000),
      entry("README.md", Buffer.from("# Example project\n\nRead-only source browser fixture.")),
      entry("src/app.ts", Buffer.from("export const value = 'first';\n")),
      entry(".env", Buffer.from("NOT_A_REAL_SECRET=fixture\n")),
      entry("runtime/retained.txt", Buffer.from("Protected runtime fixture")),
      entry("image.bin", Buffer.from([0, 1, 2])),
      entry("large.txt", Buffer.alloc(524289, 65)),
      Buffer.from("\nreset refs/heads/feature/example\nfrom refs/heads/main\n\n"),
      commit("Update app behavior", 1700000001),
      entry("src/app.ts", Buffer.from("export const value = 'second';\n")),
      Buffer.from("\ndone\n"),
    ]),
  );
  await imported;
  await execute("git", ["clone", directory, working], { windowsHide: true });
  await execute("git", ["--git-dir=" + directory, "config", "devsetu.repositoryId", id], {
    windowsHide: true,
  });
  // This unpublished edit must never be included in the server's browsing/export.
  await writeFile(join(working, "src", "app.ts"), "Unpublished working copy");
  const source: CentralCodeSource = {
    id,
    name: "Example / source",
    ownerId: "usr_alice",
    directory,
    executable: "git",
    defaultBranch: "main",
    identityKey: "devsetu.repositoryId",
    protectedPaths: ["runtime"],
  };
  let active = true,
    registry = [source];
  const users = [
    { userId: "usr_admin", name: "Administrator", administrator: true },
    { userId: "usr_alice", name: "Alice", administrator: false },
    { userId: "usr_bob", name: "Bob", administrator: false },
  ];
  const service = new CodeRepositories(
    join(root, "state"),
    "ws_fixture",
    async () => registry,
    async (actor) => ({
      active: active && users.some((u) => u.userId === actor),
      administrator: actor === "usr_admin",
    }),
    async () => users,
  );
  return {
    root,
    working,
    directory,
    id,
    source,
    service,
    git,
    users,
    setActive: (v: boolean) => {
      active = v;
    },
    setRegistry: (v: CentralCodeSource[]) => {
      registry = v;
    },
  };
}
it("lists only owned/shared repositories; administrator sees legacy records without making them public", async () => {
  const f = await fixture();
  const legacy = { ...f.source, id: "gitrepo_" + "b".repeat(32), name: "Legacy private" };
  delete legacy.ownerId;
  f.setRegistry([f.source, legacy]);
  expect(
    (await f.service.catalog("usr_admin", "ws_fixture")).repositories.map((r) => r.name),
  ).toEqual(["Example / source", "Legacy private"]);
  const alice = await f.service.catalog("usr_alice", "ws_fixture");
  expect(alice.repositories).toHaveLength(1);
  expect(alice.repositories[0]?.role).toBe("owner");
  expect((await f.service.catalog("usr_bob", "ws_fixture")).repositories).toEqual([]);
  expect(JSON.stringify(alice)).not.toContain(f.directory);
  await expect(f.service.tree("usr_bob", "ws_fixture", f.id, {})).rejects.toThrow("not-found");
  await expect(f.service.catalog("usr_alice", "ws_other")).rejects.toThrow("not-found");
  f.setActive(false);
  await expect(f.service.tree("usr_alice", "ws_fixture", f.id, {})).rejects.toThrow(
    "access-denied",
  );
});
it("reads committed trees, README, branches, text and history; never a developer's unpushed edits", async () => {
  const f = await fixture(),
    tree = await f.service.tree("usr_alice", "ws_fixture", f.id, {});
  expect(tree.branches.map((b) => b.name)).toContain("feature/example");
  expect(tree.readme?.text).toContain("# Example");
  expect(tree.entries.find((e) => e.name === "src")?.kind).toBe("directory");
  expect(tree.latest?.subject).toBe("Update app behavior");
  const file = await f.service.blob("usr_alice", "ws_fixture", f.id, {
    path: "src/app.ts",
    head: tree.head,
  });
  expect(file.text).toContain("second");
  expect(file.text).not.toContain("Unpublished");
  const old = await f.service.blob("usr_alice", "ws_fixture", f.id, {
    path: "src/app.ts",
    branch: "feature/example",
  });
  expect(old.text).toContain("first");
  expect(
    (await f.service.history("usr_alice", "ws_fixture", f.id, { path: "src/app.ts" })).commits,
  ).toHaveLength(2);
  expect(
    (await f.service.blob("usr_alice", "ws_fixture", f.id, { path: "image.bin" })).binary,
  ).toBe(true);
  expect(
    (await f.service.blob("usr_alice", "ws_fixture", f.id, { path: "large.txt" })).tooLarge,
  ).toBe(true);
  await expect(f.service.blob("usr_alice", "ws_fixture", f.id, { path: ".env" })).rejects.toThrow(
    "protected-path",
  );
  await expect(
    f.service.blob("usr_alice", "ws_fixture", f.id, { path: "runtime/retained.txt" }),
  ).rejects.toThrow("protected-path");
  for (const path of ["../other", "src/../.env", "/etc/passwd", "C:\\secret", ".git/config"])
    await expect(f.service.tree("usr_alice", "ws_fixture", f.id, { path })).rejects.toThrow();
  await expect(
    f.service.tree("usr_alice", "ws_fixture", f.id, { branch: "missing" }),
  ).rejects.toThrow("branch-not-found");
  await expect(
    f.service.blob("usr_alice", "ws_fixture", f.id, { path: "src/app.ts", head: "0".repeat(40) }),
  ).rejects.toThrow("branch-changed");
  await expect(
    f.service.tree("usr_alice", "ws_fixture", f.id, { path: "README.md" }),
  ).rejects.toThrow("directory-required");
});
it("exports a real commit-bound ZIP, excluding environment and configured protected data without changing refs", async () => {
  const f = await fixture(),
    before = (await execute("git", ["--git-dir=" + f.directory, "show-ref"], { windowsHide: true }))
      .stdout;
  const result = await f.service.archive("usr_alice", "ws_fixture", f.id, {}),
    files = zipFiles(result.bytes);
  expect(result.filename).toMatch(/^Example---source-[a-f0-9]{12}\.zip$/);
  expect(result.excludedPaths).toBe(2);
  expect([...files.keys()].some((p) => p.endsWith(".env"))).toBe(false);
  expect([...files.keys()].some((p) => p.endsWith("runtime/retained.txt"))).toBe(false);
  const app = [...files].find(([p]) => p.endsWith("/src/app.ts"));
  expect(app?.[1].toString()).toContain("second");
  expect(
    (await execute("git", ["--git-dir=" + f.directory, "show-ref"], { windowsHide: true })).stdout,
  ).toBe(before);
  expect(await readFile(join(f.working, ".env"), "utf8")).toContain("fixture");
});
it("grants once with a revision, denies sharing by readers, and revokes tree/blob/history/ZIP immediately", async () => {
  const f = await fixture(),
    access = await f.service.access("usr_alice", "ws_fixture", f.id);
  expect(access.users.find((u) => u.userId === "usr_admin")?.inherited).toBe(true);
  await expect(
    f.service.share("usr_bob", "ws_fixture", f.id, {
      version: 1,
      expectedRevision: 0,
      userId: "usr_bob",
      allow: true,
    }),
  ).rejects.toThrow("not-found");
  const shared = await f.service.share("usr_alice", "ws_fixture", f.id, {
    version: 1,
    expectedRevision: 0,
    userId: "usr_bob",
    allow: true,
  });
  expect(shared.revision).toBe(1);
  await f.service.authorize("usr_alice", "ws_fixture", f.id, true);
  await f.service.authorize("usr_bob", "ws_fixture", f.id);
  await expect(f.service.authorize("usr_bob", "ws_fixture", f.id, true)).rejects.toThrow(
    "publication-denied",
  );
  expect((await f.service.catalog("usr_bob", "ws_fixture")).repositories[0]?.role).toBe("reader");
  expect((await f.service.tree("usr_bob", "ws_fixture", f.id, {})).entries.length).toBeGreaterThan(
    1,
  );
  expect((await f.service.archive("usr_bob", "ws_fixture", f.id, {})).bytes.length).toBeGreaterThan(
    100,
  );
  await expect(f.service.access("usr_bob", "ws_fixture", f.id)).rejects.toThrow(
    "access-management-denied",
  );
  await expect(
    f.service.share("usr_admin", "ws_fixture", f.id, {
      version: 1,
      expectedRevision: 0,
      userId: "usr_bob",
      allow: false,
    }),
  ).rejects.toThrow("revision-conflict");
  await expect(
    f.service.share("usr_admin", "ws_fixture", f.id, {
      version: 1,
      expectedRevision: 1,
      userId: "usr_missing",
      allow: true,
    }),
  ).rejects.toThrow("active-workspace-member-required");
  await expect(
    f.service.share("usr_admin", "ws_fixture", f.id, {
      version: 1,
      expectedRevision: 1,
      userId: "usr_alice",
      allow: false,
    }),
  ).rejects.toThrow("inherited-access");
  await f.service.share("usr_admin", "ws_fixture", f.id, {
    version: 1,
    expectedRevision: 1,
    userId: "usr_bob",
    allow: false,
  });
  for (const action of ["tree", "blob", "history", "archive"] as const)
    await expect(
      f.service[action]("usr_bob", "ws_fixture", f.id, {
        path: action === "blob" ? "README.md" : "",
      }),
    ).rejects.toThrow("not-found");
  f.setRegistry([{ ...f.source, ownerId: "usr_bob" }]);
  await expect(f.service.catalog("usr_admin", "ws_fixture")).rejects.toThrow(
    "access-identity-changed",
  );
});
it("refuses swapped repository markers and paths, empty sources and unknown object requests honestly", async () => {
  const f = await fixture();
  f.setRegistry([f.source, f.source]);
  await expect(f.service.catalog("usr_admin", "ws_fixture")).rejects.toThrow("registry-conflict");
  await expect(f.service.tree("usr_admin", "ws_fixture", f.id, {})).rejects.toThrow(
    "registry-conflict",
  );
  f.setRegistry([f.source]);
  await execute(
    "git",
    ["--git-dir=" + f.directory, "config", "devsetu.repositoryId", "gitrepo_" + "c".repeat(32)],
    { windowsHide: true },
  );
  await expect(f.service.tree("usr_admin", "ws_fixture", f.id, {})).rejects.toThrow(
    "identity-changed",
  );
  expect((await f.service.catalog("usr_admin", "ws_fixture")).repositories[0]?.status).toBe(
    "unavailable",
  );
  await expect(
    f.service.tree("usr_admin", "ws_fixture", "gitrepo_" + "d".repeat(32), {}),
  ).rejects.toThrow("not-found");
  await expect(
    f.service.tree("usr_admin", "ws_fixture", "repo_" + "d".repeat(32), {}),
  ).rejects.toThrow("not-found");
  const empty = join(f.root, "empty.git");
  await execute("git", ["init", "--bare", empty], { windowsHide: true });
  await execute("git", ["--git-dir=" + empty, "config", "devsetu.repositoryId", f.id], {
    windowsHide: true,
  });
  f.setRegistry([{ ...f.source, directory: empty }]);
  expect((await f.service.catalog("usr_admin", "ws_fixture")).repositories[0]?.status).toBe(
    "empty",
  );
  await expect(
    f.service.blob("usr_admin", "ws_fixture", f.id, { path: "README.md" }),
  ).rejects.toThrow("branch-not-found");
});
it("refuses oversized access records and excess branches instead of returning partial or broadened access", async () => {
  const f = await fixture();
  await f.service.share("usr_alice", "ws_fixture", f.id, {
    version: 1,
    expectedRevision: 0,
    userId: "usr_bob",
    allow: true,
  });
  await writeFile(join(f.root, "state/access", f.id + ".json"), Buffer.alloc(131073, 32));
  await expect(f.service.tree("usr_admin", "ws_fixture", f.id, {})).rejects.toThrow(
    "access-unavailable",
  );
  const head = (await f.git("rev-parse", "HEAD")).stdout.trim();
  const refs = execute("git", ["--git-dir=" + f.directory, "update-ref", "--stdin"], {
    windowsHide: true,
  });
  refs.child.stdin!.end(
    Array.from({ length: 201 }, (_, i) => `create refs/heads/branch-${i} ${head}\n`).join(""),
  );
  await refs;
  await expect(new CodeGit(f.directory, "git").branches()).rejects.toThrow("branch-capacity");
});
it("bounds concurrent ZIP work and refuses a completed export after its user's access is withdrawn", async () => {
  const f = await fixture();
  let started!: () => void, release!: () => void;
  const entered = new Promise<void>((resolve) => {
      started = resolve;
    }),
    gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    original = CodeGit.prototype.archive;
  const spy = vi.spyOn(CodeGit.prototype, "archive").mockImplementation(async function (
    this: CodeGit,
    head,
    name,
  ) {
    started();
    await gate;
    return original.call(this, head, name);
  });
  const first = f.service.archive("usr_alice", "ws_fixture", f.id, {});
  const denied = expect(first).rejects.toThrow("access-denied");
  try {
    await entered;
    await expect(f.service.archive("usr_alice", "ws_fixture", f.id, {})).rejects.toThrow(
      "download-busy",
    );
    f.setActive(false);
    release();
    await denied;
  } finally {
    release();
    spy.mockRestore();
  }
  f.setActive(true);
  expect(
    (await f.service.archive("usr_alice", "ws_fixture", f.id, {})).bytes.length,
  ).toBeGreaterThan(100);
});
it("paginates actual folders and commit history without skipping the final entries", async () => {
  const f = await fixture();
  const parent = (await f.git("rev-parse", "HEAD")).stdout.trim();
  // Import real committed objects in one Git process. This avoids creating
  // 135 OS files and another working-tree checkout merely to test Git paging.
  const files = Array.from(
    { length: 135 },
    (_, i) => `M 100644 inline many/${String(i).padStart(3, "0")}.txt\ndata 14\nSource fixture\n`,
  ).join("");
  const initial = `commit refs/heads/main\nmark :1\ncommitter Fixture <fixture@example.invalid> 1699999999 +0000\ndata 17\nMany source files\nfrom ${parent}\n${files}\n`;
  const data =
    initial +
    Array.from({ length: 32 }, (_, i) => {
      const subject = "History change " + i;
      return `commit refs/heads/history\nmark :${i + 2}\ncommitter Fixture <fixture@example.invalid> ${1700000000 + i} +0000\ndata ${Buffer.byteLength(subject)}\n${subject}\nfrom :${i + 1}\n\n`;
    }).join("");
  const imported = execute("git", ["--git-dir=" + f.directory, "fast-import", "--quiet"], {
    windowsHide: true,
  });
  imported.child.stdin!.end(data);
  await imported;
  const first = await f.service.tree("usr_alice", "ws_fixture", f.id, { path: "many" }),
    last = await f.service.tree("usr_alice", "ws_fixture", f.id, {
      path: "many",
      page: 1,
      head: first.head,
    });
  expect(first.entries).toHaveLength(100);
  expect(last.entries).toHaveLength(35);
  expect(last.entries.at(-1)?.name).toBe("134.txt");
  expect(new Set([...first.entries, ...last.entries].map((e) => e.sha + e.path)).size).toBe(135);
  const history = await f.service.history("usr_alice", "ws_fixture", f.id, { branch: "history" });
  const tail = await f.service.history("usr_alice", "ws_fixture", f.id, {
    branch: "history",
    page: 1,
  });
  expect(history.commits).toHaveLength(30);
  expect(history.hasMore).toBe(true);
  expect(tail.commits).toHaveLength(5);
  expect(tail.hasMore).toBe(false);
  expect(new Set([...history.commits, ...tail.commits].map((c) => c.sha)).size).toBe(35);
});

it("does not follow a committed symlink or a submodule as a file", async () => {
  const f = await fixture(),
    target = (await f.git("hash-object", "-w", "README.md")).stdout.trim();
  // No OS symlink privileges are needed to exercise Git's symlink object mode.
  await f.git("update-index", "--add", "--cacheinfo", `120000,${target},link`);
  const commit = (await f.git("rev-parse", "HEAD")).stdout.trim();
  await f.git("update-index", "--add", "--cacheinfo", `160000,${commit},module`);
  await f.git("commit", "-m", "Add link metadata");
  await execute("git", ["--git-dir=" + f.directory, "fetch", f.working, "main:main"], {
    windowsHide: true,
  });
  const reader = new CodeGit(f.directory, "git");
  expect(
    (await reader.entries(await reader.resolve("main"), "")).find((e) => e.name === "link")?.kind,
  ).toBe("symlink");
  await expect(reader.blob(await reader.resolve("main"), "link")).rejects.toThrow(
    "regular-file-required",
  );
  await expect(reader.blob(await reader.resolve("main"), "module")).rejects.toThrow(
    "regular-file-required",
  );
});
