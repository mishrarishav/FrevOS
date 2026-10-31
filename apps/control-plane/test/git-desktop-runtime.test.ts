import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it } from "vitest";
import {
  GitDesktopSnapshotSchema,
  GitDesktopJobSchema,
  GitFolderBindingSchema,
} from "@frevos/contracts";
const { GitDesktopRuntime, protectedFile, relative, branch, chooseFolder } = createRequire(
  import.meta.url,
)("../../../deployment/servix/GitDesktop.cjs");
const run = promisify(execFile),
  roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "devsetu-gitdesk-"));
  roots.push(root);
  const project = join(root, "project"),
    state = join(root, "state");
  await mkdir(project);
  await mkdir(state);
  const binding = GitFolderBindingSchema.parse({
    version: 1,
    id: "gfolder_" + "a".repeat(32),
    workspaceId: "ws_team",
    userId: "usr_alice",
    deviceId: "fc_" + "b".repeat(32),
    root: project,
    repositoryId: null,
    branch: "work/alice",
    createdAt: new Date().toISOString(),
  });
  const runtime = new GitDesktopRuntime({
    deviceId: binding.deviceId,
    stateRoot: state,
    git: "git",
  });
  const job = (action: string, extra: Record<string, unknown> = {}) =>
    GitDesktopJobSchema.parse({
      version: 1,
      id: "gjob_" + crypto.randomUUID().replaceAll("-", ""),
      workspaceId: binding.workspaceId,
      actor: binding.userId,
      deviceId: binding.deviceId,
      binding,
      action,
      branch: binding.branch,
      defaultBranch: "main",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 120000).toISOString(),
      status: "claimed",
      ...extra,
    });
  return { root, project, state, binding, runtime, job };
}
it("inspects an ordinary non-empty folder without initializing Git, then commits selected files and publishes a real verifiable bundle while preserving protected files", async () => {
  const f = await fixture();
  await writeFile(join(f.project, "app.js"), "export const value=1;\n");
  await writeFile(join(f.project, ".env"), "fixture-only-data\n");
  const before = GitDesktopSnapshotSchema.parse(await f.runtime.snapshot(f.binding));
  expect(before.initialized).toBe(false);
  expect(before.files.find((x) => x.path === ".env")?.protected).toBe(true);
  const job = f.job("commit-push", {
    expectedFingerprint: before.fingerprint,
    message: "Add application",
    files: ["app.js"],
  });
  let published: Buffer | undefined,
    head = "";
  const result = await f.runtime.execute(job, {
    publish: async (_j: unknown, bytes: Buffer, h: string) => {
      published = bytes;
      head = h;
    },
  });
  expect(result.snapshot.initialized).toBe(true);
  expect(result.snapshot.head).toBe(head);
  expect(result.snapshot.files).toEqual([]);
  expect(await readFile(join(f.project, ".env"), "utf8")).toBe("fixture-only-data\n");
  const bundle = join(f.root, "published.bundle");
  await writeFile(bundle, published!);
  const cloned = join(f.root, "clone");
  await run("git", ["clone", "--branch", "work/alice", bundle, cloned], { windowsHide: true });
  expect(await readFile(join(cloned, "app.js"), "utf8")).toContain("value=1");
  await expect(readFile(join(cloned, ".env"))).rejects.toThrow();
  await expect(f.runtime.execute(job)).rejects.toThrow();
}, 60000);
it("rejects stale previews, protected selection, default-branch publication and cross-device jobs before committing", async () => {
  const f = await fixture();
  await writeFile(join(f.project, "a.txt"), "first");
  await writeFile(join(f.project, ".env"), "synthetic");
  const initial = await f.runtime.snapshot(f.binding);
  await writeFile(join(f.project, "a.txt"), "changed");
  await expect(
    f.runtime.execute(
      f.job("commit-push", {
        expectedFingerprint: initial.fingerprint,
        message: "Change",
        files: ["a.txt"],
      }),
    ),
  ).rejects.toThrow("files-changed-refresh");
  const current = await f.runtime.snapshot(f.binding);
  await expect(
    f.runtime.execute(
      f.job("commit-push", {
        expectedFingerprint: current.fingerprint,
        message: "Change",
        files: [".env"],
      }),
    ),
  ).rejects.toThrow("protected-or-unselected-file");
  await expect(
    f.runtime.execute(
      f.job("commit-push", {
        branch: "main",
        expectedFingerprint: current.fingerprint,
        message: "Change",
        files: ["a.txt"],
      }),
    ),
  ).rejects.toThrow("default-branch-protected");
  await expect(
    f.runtime.execute({ ...f.job("status"), deviceId: "fc_" + "f".repeat(32) }),
  ).rejects.toThrow("job-scope-denied");
  await expect(readFile(join(f.project, ".git", "HEAD"))).rejects.toThrow();
}, 60000);
it("keeps a committed change after a lost publication and allows a fresh push without creating another commit", async () => {
  const f = await fixture();
  await writeFile(join(f.project, "a.txt"), "one");
  const initial = await f.runtime.snapshot(f.binding);
  await expect(
    f.runtime.execute(
      f.job("commit-push", {
        expectedFingerprint: initial.fingerprint,
        message: "Change",
        files: ["a.txt"],
      }),
      {
        publish: async () => {
          throw Error("fixture-offline");
        },
      },
    ),
  ).rejects.toThrow("fixture-offline");
  const before = await f.runtime.snapshot(f.binding);
  expect(before.head).toMatch(/^[a-f0-9]{40}$/);
  let delivered = "";
  const result = await f.runtime.execute(
    f.job("push", { expectedFingerprint: before.fingerprint }),
    {
      publish: async (_j: unknown, _bytes: Buffer, head: string) => {
        delivered = head;
      },
    },
  );
  expect(result.snapshot.head).toBe(before.head);
  expect(delivered).toBe(before.head);
  expect(
    (
      await run("git", ["-C", f.project, "rev-list", "--count", "HEAD"], { windowsHide: true })
    ).stdout.trim(),
  ).toBe("1");
}, 60000);
it("blocks a pull or branch switch over working changes and never writes into an ancestor repository", async () => {
  const f = await fixture();
  await writeFile(join(f.project, "a.txt"), "one");
  let state = await f.runtime.snapshot(f.binding);
  await f.runtime.execute(
    f.job("commit-push", {
      expectedFingerprint: state.fingerprint,
      message: "Initial",
      files: ["a.txt"],
    }),
    { publish: async () => {} },
  );
  await writeFile(join(f.project, "a.txt"), "uncommitted");
  state = await f.runtime.snapshot(f.binding);
  await expect(
    f.runtime.execute(f.job("pull", { expectedFingerprint: state.fingerprint })),
  ).rejects.toThrow("commit-changes-before-pull");
  await expect(
    f.runtime.execute(
      f.job("switch-branch", { expectedFingerprint: state.fingerprint, branch: "feature/new" }),
    ),
  ).rejects.toThrow("commit-changes-before-switch");
  const child = join(f.project, "nested");
  await mkdir(child);
  await expect(
    f.runtime.snapshot({ ...f.binding, id: "gfolder_" + "c".repeat(32), root: child }),
  ).rejects.toThrow("choose-checkout-root");
  expect(await readFile(join(f.project, "a.txt"), "utf8")).toBe("uncommitted");
  for (const p of [
    ".env",
    "folder/.env.local",
    "uploads/file.png",
    "credentials.key",
    ".git/config",
  ]) {
    expect(protectedFile(p)).toBe(true);
  }
  expect(protectedFile("src/tokenService.ts")).toBe(false);
  expect(relative("../secret")).toBe(false);
  expect(branch("feature/a")).toBe(true);
  expect(branch("main.lock")).toBe(false);
}, 60000);
it("refuses LFS/custom attribute filters and external attribute files before publishing or initializing a new folder", async () => {
  const f = await fixture();
  await writeFile(join(f.project, ".gitattributes"), "*.bin filter=lfs diff=lfs -text\n");
  await expect(f.runtime.snapshot(f.binding)).rejects.toThrow("repository-filter-needs-review");
  await expect(readFile(join(f.project, ".git/config"))).rejects.toThrow();
  await f.runtime.git(f.project, ["init", "-b", "work/alice"]);
  await f.runtime.git(f.project, ["add", ".gitattributes"]);
  await expect(f.runtime.snapshot(f.binding)).rejects.toThrow("repository-filter-needs-review");
  await writeFile(join(f.project, ".gitattributes"), "*.txt text\n");
  await f.runtime.git(f.project, [
    "config",
    "--local",
    "core.attributesFile",
    join(f.root, "outside-attributes"),
  ]);
  await expect(f.runtime.snapshot(f.binding)).rejects.toThrow("repository-filter-needs-review");
});
it("honors a non-Git folder's .gitignore during read-only Changes without creating its .git directory", async () => {
  const f = await fixture();
  await writeFile(join(f.project, ".gitignore"), "generated.log\ncache/\n");
  await writeFile(join(f.project, "generated.log"), "ignored build output");
  await writeFile(join(f.project, "app.js"), "export const kept=true;");
  await mkdir(join(f.project, "cache"));
  await writeFile(join(f.project, "cache/output.txt"), "ignored output");
  const result = await f.runtime.snapshot(f.binding);
  expect(result.files.map((f: { path: string }) => f.path)).toEqual([".gitignore", "app.js"]);
  await expect(readFile(join(f.project, ".git/config"))).rejects.toThrow();
  expect(await readFile(join(f.project, "generated.log"), "utf8")).toBe("ignored build output");
});
it("validates native selection, records one-time intent before the OS boundary and never initializes the selected folder", async () => {
  const f = await fixture();
  const config = { deviceId: f.binding.deviceId, stateRoot: f.state };
  const job = {
    version: 1,
    requestId: "gpick_" + "a".repeat(32),
    deviceId: config.deviceId,
    actor: "usr_alice",
    workspaceId: "ws_team",
    status: "claimed",
    expiresAt: new Date(Date.now() + 85000).toISOString(),
  };
  let calls = 0;
  const result = await chooseFolder(config, job, async () => {
    calls++;
    return { status: "selected", repository: f.project };
  });
  expect(result.status).toBe("selected");
  expect(result.path.endsWith("/project")).toBe(true);
  expect(result.path).not.toContain("\\");
  await expect(readFile(join(f.project, ".git/config"))).rejects.toThrow();
  await expect(
    chooseFolder(config, job, async () => {
      calls++;
      return { status: "cancelled" };
    }),
  ).rejects.toThrow();
  expect(calls).toBe(1);
  await expect(
    chooseFolder(config, { ...job, deviceId: "fc_" + "c".repeat(32) }, async () => {
      throw Error("must not open");
    }),
  ).rejects.toThrow("picker-scope-denied");
  const next = { ...job, requestId: "gpick_" + "b".repeat(32) };
  expect(await chooseFolder(config, next, async () => ({ status: "cancelled" }))).toEqual({
    status: "cancelled",
  });
  expect(
    await chooseFolder(config, { ...job, requestId: "gpick_" + "c".repeat(32) }, async () => ({
      status: "failed",
      errorCode: "git-desktop-picker-desktop-unavailable",
    })),
  ).toEqual({ status: "failed", errorCode: "git-desktop-picker-desktop-unavailable" });
  await expect(
    chooseFolder(config, { ...job, requestId: "gpick_" + "d".repeat(32) }, async () => ({
      status: "selected",
      repository: "relative/path",
    })),
  ).rejects.toThrow("picker-path-denied");
});
