import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { servixExecution } from "../src/servix-deployment.js";

const execute = promisify(execFile);
async function cleanupFixture(root: string) {
  if ((await realpath(root)).toLowerCase() !== root.toLowerCase())
    throw Error("Fixture cleanup identity changed");
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
const { publishWorkingTree, cloneFromBundle, inspectRepository, bindCentralCheckout, validateJob } =
  createRequire(import.meta.url)("../../../deployment/servix/Connector.cjs") as {
    bindCentralCheckout(
      config: Record<string, string>,
      baseline: string,
    ): Promise<Record<string, unknown>>;
    validateJob(config: Record<string, string>, job: Record<string, unknown>): void;
    inspectRepository(config: Record<string, string>): Promise<{
      repository: string;
      origin: string;
      head: string;
      branch: string;
      profileId: string;
    }>;
    publishWorkingTree(
      config: Record<string, string>,
      job: Record<string, unknown>,
      options: Record<string, string>,
    ): Promise<{ head: string; bundle: string }>;
    cloneFromBundle(
      config: Record<string, string>,
      bundle: string,
      expectedOrigin: string,
    ): Promise<void>;
  };
it("publishes an actual Git bundle from another folder while preserving ignored uploads and excluding the default branch", async () => {
  const root = await mkdtemp(join(tmpdir(), "frevos-portable-git-")),
    repo = join(root, "different-laptop-checkout"),
    stateRoot = join(root, "device-state");
  await mkdir(repo);
  await mkdir(stateRoot);
  const git = process.platform === "win32" ? "C:\\Program Files\\Git\\cmd\\git.exe" : "git";
  const command = async (args: string[]) =>
    (
      await execute(git, ["-C", repo, ...args], { windowsHide: true, timeout: 30000 })
    ).stdout.trim();
  let originalFailure: unknown, cleanupFailure: unknown;
  try {
    await command(["init", "--initial-branch=feature/connector-test"]);
    await command(["config", "core.hooksPath", join(repo, ".git", "hooks")]);
    await command(["config", "commit.gpgsign", "false"]);
    await command(["config", "gc.auto", "0"]);
    await command(["config", "maintenance.auto", "false"]);
    await command(["config", "user.name", "Connector fixture"]);
    await command(["config", "user.email", "fixture@example.invalid"]);
    await command(["remote", "add", "origin", "https://fixture.invalid/servix.git"]);
    await writeFile(join(repo, ".gitignore"), "uploads/\n.env\n.local/\n");
    await writeFile(join(repo, "app.js"), "old\n");
    await mkdir(join(repo, "attachment"));
    await writeFile(join(repo, "attachment", "tracked.txt"), "original attachment");
    await command(["add", "."]);
    await command(["commit", "-m", "fixture baseline"]);
    const base = await command(["rev-parse", "HEAD"]);
    const statusBeforeProbe = await command(["status", "--porcelain=v1"]);
    const probe = await inspectRepository({ git, repository: repo, profileId: "another-project" });
    expect(probe).toMatchObject({
      head: base,
      branch: "feature/connector-test",
      profileId: "another-project",
      origin: "https://fixture.invalid/servix.git",
    });
    expect(await command(["status", "--porcelain=v1"])).toBe(statusBeforeProbe);
    const central = join(root, "central.git");
    await execute(git, ["init", "--bare", central], { windowsHide: true });
    await execute(
      git,
      [
        "--git-dir=" + central,
        "config",
        "frevos.repositoryId",
        "gitrepo_6cb7e163f807493fa37963196c49fbac",
      ],
      { windowsHide: true },
    );
    // Source publication uses local bundles, not Git push/receive-pack. Seed
    // this owned fixture through the same transport boundary as production.
    const initialBundle = join(stateRoot, "fixture-initial.bundle");
    await command(["bundle", "create", initialBundle, "HEAD"]);
    await execute(
      git,
      ["--git-dir=" + central, "fetch", "--no-tags", initialBundle, "HEAD:refs/heads/frevos-dev"],
      { windowsHide: true, timeout: 30000 },
    );
    // Match server20's bare HEAD: updating the development ref also locks HEAD.
    await execute(git, ["--git-dir=" + central, "symbolic-ref", "HEAD", "refs/heads/frevos-dev"], {
      windowsHide: true,
      timeout: 30000,
    });
    await writeFile(
      join(repo, ".git", "hooks", "pre-commit"),
      "#!/bin/sh\nprintf checked > .git/frevos-fixture-hook\n",
      { mode: 0o755 },
    );
    await mkdir(join(repo, "uploads"));
    await writeFile(join(repo, "uploads", "keep.txt"), "protected fixture");
    await writeFile(join(repo, ".env"), "fixture-only");
    await mkdir(join(repo, ".local"));
    await writeFile(join(repo, ".local", "keep.txt"), "private fixture");
    await writeFile(join(repo, "app.js"), "new code\n");
    await writeFile(join(repo, "attachment", "tracked.txt"), "local user data must not publish");
    await writeFile(join(repo, "attachment", "untracked.txt"), "new attachment must not publish");
    const config = { repository: repo, stateRoot, git, deviceId: "fc_" + "a".repeat(32) },
      job = {
        version: 1,
        status: "queued",
        createdAt: new Date().toISOString(),
        requestId: "sd_" + "b".repeat(32),
        deviceId: config.deviceId,
        baseHead: base,
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        preservedPaths: ["ATTACHMENT", ".local"],
        userId: "usr_fixture",
        changeDetails: {
          message: "Update ticket badge\nUse a white label",
          approvedBy: "Fixture owner / CHG-42",
        },
      },
      options = { expectedOrigin: "https://fixture.invalid/servix.git" };
    await expect(
      publishWorkingTree(
        config,
        { ...job, changeDetails: { ...job.changeDetails, approvedBy: "bad\nreference" } },
        options,
      ),
    ).rejects.toThrow("invalid-change-details");
    expect(await command(["rev-parse", "HEAD"])).toBe(base);
    const result = await publishWorkingTree(config, job, options);
    expect(await readFile(join(repo, ".git", "frevos-fixture-hook"), "utf8")).toBe("checked");
    expect(result.head).not.toBe(base);
    expect(await command(["log", "-1", "--format=%B"])).toContain(
      "Changes:\nUpdate ticket badge\nUse a white label\n\nDeclared approval: Fixture owner / CHG-42\nRequested by: usr_fixture\nDeployment: " +
        job.requestId,
    );
    expect(await command(["show", result.head + ":app.js"])).toBe("new code");
    expect(await command(["ls-tree", "--name-only", result.head, ".local"])).toBe("");
    expect(await readFile(join(repo, ".local", "keep.txt"), "utf8")).toBe("private fixture");
    expect(await command(["show", result.head + ":attachment/tracked.txt"])).toBe(
      "original attachment",
    );
    await command(["add", "--", "attachment/tracked.txt"]);
    const stagedBefore = await command(["diff", "--cached", "--name-only"]);
    await expect(
      publishWorkingTree(config, { ...job, requestId: "sd_" + "7".repeat(32) }, options),
    ).rejects.toThrow("protected-source-file");
    expect(await command(["rev-parse", "HEAD"])).toBe(result.head);
    expect(await command(["diff", "--cached", "--name-only"])).toBe(stagedBefore);
    await command(["restore", "--staged", "--", "attachment/tracked.txt"]);
    expect(await command(["ls-tree", "-r", "--name-only", result.head])).not.toContain(
      "attachment/untracked.txt",
    );
    expect(await readFile(join(repo, "attachment", "tracked.txt"), "utf8")).toBe(
      "local user data must not publish",
    );
    expect(await readFile(join(repo, "uploads", "keep.txt"), "utf8")).toBe("protected fixture");
    expect(await command(["ls-tree", "-r", "--name-only", result.head])).not.toMatch(
      /uploads|\.env/,
    );
    await command(["bundle", "verify", result.bundle]);
    const receiver = servixExecution(stateRoot, "unused-fixture", { git, repository: central });
    expect(await receiver.head()).toBe(base);
    await receiver.importBundle(result.bundle, base, result.head);
    expect(await receiver.head()).toBe(result.head);
    expect(
      (
        await execute(git, ["--git-dir=" + central, "for-each-ref", "refs/frevos/incoming"], {
          windowsHide: true,
        })
      ).stdout.trim(),
    ).toBe("");
    await expect(receiver.importBundle(result.bundle, base, result.head)).rejects.toThrow(
      "source-behind-or-conflicting",
    );
    const baseline = join(stateRoot, "baseline.bundle");
    await receiver.exportBundle(baseline, [base]);
    await command(["bundle", "verify", baseline]);
    const full = join(stateRoot, "full.bundle");
    await receiver.exportBundle(full, ["0".repeat(40)]);
    await command(["bundle", "verify", full]);
    const second = join(root, "replacement-laptop-checkout");
    await cloneFromBundle({ ...config, repository: second }, full, options.expectedOrigin);
    expect(
      (
        await execute(git, ["-C", second, "show", "HEAD:app.js"], { windowsHide: true })
      ).stdout.trim(),
    ).toBe("new code");
    expect(
      (
        await execute(git, ["-C", second, "branch", "--show-current"], { windowsHide: true })
      ).stdout.trim(),
    ).toBe("frevos/" + config.deviceId);
    await expect(
      cloneFromBundle({ ...config, repository: second }, full, options.expectedOrigin),
    ).rejects.toThrow("checkout-directory-not-empty");
    const boundConfig = {
      ...config,
      profileId: "servix-development",
      repositoryOrigin: options.expectedOrigin,
    };
    const beforeBind = await command(["status", "--porcelain=v1"]);
    expect(await bindCentralCheckout(boundConfig, full)).toMatchObject({
      origin: "//10.9.69.20/e$/FrevOS/git/servix.git",
      repositoryId: "gitrepo_6cb7e163f807493fa37963196c49fbac",
      remoteName: "frevos",
    });
    expect(await command(["remote", "get-url", "origin"])).toBe(options.expectedOrigin);
    expect(await command(["rev-parse", "HEAD"])).toBe(result.head);
    expect(await command(["status", "--porcelain=v1"])).toBe(beforeBind);
    await command(["remote", "remove", "origin"]);
    expect(await inspectRepository(boundConfig)).toMatchObject({
      origin: "//10.9.69.20/e$/FrevOS/git/servix.git",
    });
    await command(["remote", "set-url", "frevos", "//wrong-server/share/other.git"]);
    await expect(inspectRepository(boundConfig)).rejects.toThrow("repository-identity-mismatch");
    await expect(bindCentralCheckout(boundConfig, full)).rejects.toThrow(
      "repository-identity-mismatch",
    );
    expect(await command(["rev-parse", "HEAD"])).toBe(result.head);
    await command(["remote", "set-url", "frevos", "//10.9.69.20/e$/FrevOS/git/servix.git"]);
    const boundJob = { ...job, requestId: "sd_" + "8".repeat(32), baseHead: result.head };
    expect(() => validateJob(boundConfig, boundJob)).not.toThrow();
    expect(() => validateJob(boundConfig, { ...boundJob, unexpected: true })).toThrow(
      "invalid-source-request",
    );
    await writeFile(join(repo, "app.js"), "central source only\n");
    await command([
      "symbolic-ref",
      "refs/remotes/origin/HEAD",
      "refs/remotes/origin/feature/connector-test",
    ]);
    const centralPublication = await publishWorkingTree(boundConfig, boundJob, {});
    await receiver.importBundle(centralPublication.bundle, result.head, centralPublication.head);
    expect(await receiver.head()).toBe(centralPublication.head);
    await command(["remote", "add", "origin", options.expectedOrigin]);
    const unrelated = join(root, "unrelated-checkout");
    await mkdir(unrelated);
    const otherGit = async (args: string[]) =>
      execute(git, ["-C", unrelated, ...args], { windowsHide: true, timeout: 30000 });
    await otherGit(["init", "--initial-branch=feature/unrelated"]);
    await otherGit(["config", "user.name", "Unrelated fixture"]);
    await otherGit(["config", "user.email", "fixture@example.invalid"]);
    await otherGit(["-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "unrelated"]);
    await expect(
      bindCentralCheckout({ ...boundConfig, repository: unrelated }, full),
    ).rejects.toThrow();
    expect((await otherGit(["remote"])).stdout.trim()).toBe("");
    await command(["switch", "-c", "main"]);
    await expect(
      publishWorkingTree(config, { ...job, requestId: "sd_" + "c".repeat(32) }, options),
    ).rejects.toThrow("default-branch-denied");
  } catch (error) {
    originalFailure = error;
  } finally {
    try {
      await cleanupFixture(root);
    } catch (cleanupError) {
      cleanupFailure = cleanupError;
    }
  }
  if (originalFailure && cleanupFailure)
    throw new AggregateError(
      [originalFailure, cleanupFailure],
      "Git fixture failed and cleanup remains owned",
    );
  if (originalFailure) throw originalFailure;
  if (cleanupFailure) throw cleanupFailure;
}, 120000);
