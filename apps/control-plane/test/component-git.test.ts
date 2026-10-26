import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm, symlink, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { componentGit } from "../src/component-git.js";

it("imports only identified fast-forward Git bundles and supports up-to-date and incremental baselines", async () => {
  const root = await mkdtemp(join(tmpdir(), "devsetu-git-boundary-"));
  const exec = promisify(execFile);
  const source = join(root, "source"),
    registry = join(root, "registry");
  await mkdir(source);
  const git = (args: string[]) => exec("git", ["-C", source, ...args], { windowsHide: true });
  const binding = {
    id: "gitrepo_" + "a".repeat(32),
    origin: "devsetu://repositories/gitrepo_" + "a".repeat(32),
    remoteName: "devsetu",
    branch: "devsetu-dev",
  };
  const repository = componentGit(registry, "git", binding);
  try {
    await expect(repository.head()).rejects.toThrow("not-seeded");
    await git(["init", "-b", "feature/fixture"]);
    await git(["config", "user.name", "Fixture"]);
    await git(["config", "user.email", "fixture@example.invalid"]);
    await writeFile(join(source, "index.txt"), "Release A");
    await git(["add", "."]);
    await git(["commit", "-m", "Release A"]);
    const first = (await git(["rev-parse", "HEAD"])).stdout.trim(),
      seed = join(root, "seed.bundle");
    await git(["bundle", "create", seed, "HEAD"]);
    await repository.seed(seed, first);
    expect(await repository.head()).toBe(first);
    await expect(repository.seed(seed, first)).rejects.toThrow("already-seeded");
    const fresh = join(root, "fresh.bundle");
    await repository.exportBundle!(fresh, [first]);
    await git(["bundle", "verify", fresh]);
    await writeFile(join(source, "index.txt"), "Release B");
    await git(["add", "."]);
    await git(["commit", "-m", "Release B"]);
    const second = (await git(["rev-parse", "HEAD"])).stdout.trim(),
      update = join(root, "update.bundle");
    await git(["bundle", "create", update, "HEAD"]);
    await expect(repository.importBundle(update, second, second)).rejects.toThrow("conflicting");
    await repository.importBundle(update, first, second);
    expect(await repository.head()).toBe(second);
    const incremental = join(root, "incremental.bundle");
    await repository.exportBundle!(incremental, ["0".repeat(40), first]);
    await git(["bundle", "verify", incremental]);
    await git(["checkout", "--orphan", "unrelated"]);
    await writeFile(join(source, "unrelated.txt"), "unrelated");
    await git(["add", "."]);
    await git(["commit", "-m", "Unrelated"]);
    const orphan = (await git(["rev-parse", "HEAD"])).stdout.trim(),
      foreign = join(root, "foreign.bundle");
    await git(["bundle", "create", foreign, "HEAD"]);
    await expect(repository.importBundle(foreign, second, orphan)).rejects.toThrow();
    expect(await repository.head()).toBe(second);
    const dir = join(registry, binding.id + ".git");
    await exec(
      "git",
      ["--git-dir=" + dir, "config", "devsetu.repositoryId", "gitrepo_" + "b".repeat(32)],
      { windowsHide: true },
    );
    await expect(repository.head()).rejects.toThrow("not-seeded");
    await expect(repository.seed(seed, first)).rejects.toThrow("identity-mismatch");
    const moved = join(root, "moved.git");
    await rename(dir, moved);
    await symlink(moved, dir, process.platform === "win32" ? "junction" : "dir");
    await expect(repository.head()).rejects.toThrow("not-seeded");
    await expect(
      componentGit(join(root, "missing-tool"), join(root, "absent-git"), binding).seed(seed, first),
    ).rejects.toThrow();
    const linked = join(root, "linked");
    await symlink(registry, linked, process.platform === "win32" ? "junction" : "dir");
    await expect(componentGit(linked, "git", binding).seed(seed, first)).rejects.toThrow(
      "linked-git-registry",
    );
  } finally {
    const target = resolve(root);
    expect(target.startsWith(resolve(tmpdir())) && target.includes("devsetu-git-boundary-")).toBe(
      true,
    );
    await rm(target, { recursive: true, force: true });
  }
}, 30000);
