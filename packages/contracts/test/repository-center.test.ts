import { expect, it } from "vitest";
import {
  RepositoryHostingConfigSchema,
  RepositoryActionSchema,
  GitDesktopActionSchema,
  GitDesktopJobSchema,
  GitDesktopSnapshotSchema,
  GitRelativeFileSchema,
  SafeGitBranchSchema,
  HostedRepositoryCreateSchema,
  RepositoryRecoveryConfigSchema,
  RepositoryRecoveryActionSchema,
  GitFolderPickInputSchema,
  GitFolderPickResultSchema,
  GitFolderPickerSchema,
} from "../src/index.js";
it("keeps native folder requests versioned, owner-bound and free of caller commands", () => {
  const requestId = "gpick_" + "a".repeat(32),
    deviceId = "fc_" + "b".repeat(32);
  const input = { version: 1, requestId, deviceId };
  expect(GitFolderPickInputSchema.safeParse(input).success).toBe(true);
  for (const extra of [{ command: "anything" }, { executable: "anything" }, { root: "C:\\" }])
    expect(GitFolderPickInputSchema.safeParse({ ...input, ...extra }).success).toBe(false);
  expect(GitFolderPickResultSchema.safeParse({ status: "cancelled" }).success).toBe(true);
  expect(
    GitFolderPickResultSchema.safeParse({ status: "selected", root: "D:\\", path: "team/project" })
      .success,
  ).toBe(true);
  expect(
    GitFolderPickResultSchema.safeParse({
      status: "failed",
      errorCode: "raw operating system details",
    }).success,
  ).toBe(false);
  const job = {
    ...input,
    actor: "usr_alice",
    workspaceId: "ws_team",
    createdAt: new Date().toISOString(),
    expiresAt: new Date().toISOString(),
    status: "claimed",
  };
  expect(GitFolderPickerSchema.safeParse(job).success).toBe(true);
  expect(GitFolderPickerSchema.safeParse({ ...job, actor: "" }).success).toBe(false);
  expect(GitFolderPickerSchema.safeParse({ ...job, command: "anything" }).success).toBe(false);
});
it("validates Git refs and relative file paths without allowing control characters, ref tricks or traversal", () => {
  for (const name of ["work/alice", "feature/ABC-12", "release_1.2"])
    expect(SafeGitBranchSchema.safeParse(name).success).toBe(true);
  for (const name of [
    "-option",
    "a..b",
    "a//b",
    "a/",
    "a.",
    "a/.hidden",
    "a/b.lock",
    "refs@{evil}",
    "a\nname",
    "",
  ])
    expect(SafeGitBranchSchema.safeParse(name).success).toBe(false);
  for (const name of ["src/file.ts", "space folder/a.txt", ".gitignore"])
    expect(GitRelativeFileSchema.safeParse(name).success).toBe(true);
  for (const name of [
    "/a",
    "\\a",
    "C:/a",
    "a\\b",
    "a\nb",
    "a\u007fb",
    "a/../b",
    "a/./b",
    "a//b",
    "",
  ])
    expect(GitRelativeFileSchema.safeParse(name).success).toBe(false);
});
it("requires immutable per-user/provider identities and rejects duplicate bindings and untyped actions", () => {
  const account = {
    userId: "usr_alice",
    providerUserId: 1,
    login: "alice",
    credentialId: "mc_" + "a".repeat(32),
    credentialReference: "opaque-reference",
  };
  const repo = {
    id: "repo_" + "b".repeat(32),
    providerRepositoryId: 12,
    owner: "team",
    name: "project",
    defaultBranch: "main",
  };
  const config = {
    version: 1,
    installationId: "forge_" + "c".repeat(32),
    workspaceId: "ws_team",
    provider: "gitea",
    apiUrl: "http://127.0.0.1/",
    webUrl: "http://127.0.0.1/",
    accounts: [account],
    repositories: [repo],
  };
  expect(RepositoryHostingConfigSchema.parse(config).defaultBranch).toBe("main");
  expect(RepositoryHostingConfigSchema.parse(config).repositories[0]?.requiredApprovals).toBe(1);
  for (const accounts of [
    [account, account],
    [account, { ...account, userId: "usr_bob" }],
  ])
    expect(RepositoryHostingConfigSchema.safeParse({ ...config, accounts }).success).toBe(false);
  for (const repositories of [
    [repo, repo],
    [repo, { ...repo, id: "repo_" + "d".repeat(32) }],
  ])
    expect(RepositoryHostingConfigSchema.safeParse({ ...config, repositories }).success).toBe(
      false,
    );
  const common = { version: 1, requestId: "git_" + "e".repeat(32), repositoryId: repo.id };
  const sha = "a".repeat(40);
  for (const action of [
    { action: "branch.create", name: "work/alice", from: "main", expectedSha: sha },
    { action: "pull.create", head: "work/alice", base: "main", expectedHead: sha, title: "Change" },
    { action: "pull.review", number: 1, expectedHead: sha, verdict: "APPROVED" },
    { action: "pull.merge", number: 1, expectedHead: sha, expectedBase: sha },
  ])
    expect(RepositoryActionSchema.safeParse({ ...common, ...action }).success).toBe(true);
  expect(
    RepositoryActionSchema.safeParse({ ...common, action: "shell", command: "git push --force" })
      .success,
  ).toBe(false);
  expect(
    HostedRepositoryCreateSchema.safeParse({
      version: 1,
      requestId: common.requestId,
      name: "my-project",
    }).success,
  ).toBe(true);
  expect(
    HostedRepositoryCreateSchema.safeParse({
      version: 1,
      requestId: common.requestId,
      name: "my-project",
      private: false,
    }).success,
  ).toBe(false);
});
it("keeps desktop jobs versioned, scoped and bounded and recovery separate from live replacement", () => {
  const folderId = "gfolder_" + "a".repeat(32),
    deviceId = "fc_" + "b".repeat(32),
    now = new Date().toISOString();
  const binding = {
    version: 1,
    id: folderId,
    workspaceId: "ws_team",
    userId: "usr_alice",
    deviceId,
    root: "D:\\project",
    repositoryId: null,
    branch: "work/alice",
    createdAt: now,
  };
  const snapshot = {
    folderId,
    root: binding.root,
    gitReady: true,
    initialized: false,
    branch: null,
    head: null,
    fingerprint: "c".repeat(64),
    files: [{ path: "src/app.ts", status: "??", protected: false }],
    truncated: false,
  };
  expect(GitDesktopSnapshotSchema.safeParse(snapshot).success).toBe(true);
  expect(
    GitDesktopActionSchema.safeParse({
      version: 1,
      folderId,
      action: "commit-push",
      files: ["../escape"],
    }).success,
  ).toBe(false);
  expect(
    GitDesktopJobSchema.safeParse({
      version: 1,
      id: "gjob_" + "d".repeat(32),
      workspaceId: "ws_team",
      actor: "usr_alice",
      deviceId,
      binding,
      action: "status",
      branch: "work/alice",
      defaultBranch: "main",
      createdAt: now,
      expiresAt: now,
      status: "queued",
    }).success,
  ).toBe(true);
  const recovery = {
    workRoot: "D:\\engine",
    backupRoot: "D:\\backup",
    restoreRoot: "D:\\restore",
    binary: "D:\\tools\\gitea.exe",
    binarySha256: "a".repeat(64),
    serviceName: "PrivateGit",
    expectedCommandLine: '"D:\\tools\\gitea.exe" web',
    keyOwner: "usr_owner",
    keyId: "mc_" + "e".repeat(32),
    keyReference: "opaque-reference",
  };
  expect(RepositoryRecoveryConfigSchema.parse(recovery).maxFiles).toBe(50000);
  const common = { version: 1, requestId: "git_" + "f".repeat(32) };
  expect(RepositoryRecoveryActionSchema.safeParse({ ...common, action: "backup" }).success).toBe(
    true,
  );
  expect(
    RepositoryRecoveryActionSchema.safeParse({
      ...common,
      action: "restore-isolated",
      backupId: "gbackup_" + "1".repeat(32),
      sha256: "2".repeat(64),
    }).success,
  ).toBe(true);
  expect(
    RepositoryRecoveryActionSchema.safeParse({
      ...common,
      action: "restore-live",
      path: "D:\\engine",
    }).success,
  ).toBe(false);
});
