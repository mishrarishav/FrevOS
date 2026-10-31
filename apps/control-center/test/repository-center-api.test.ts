import { expect, it } from "vitest";
import { createControlCenterApi } from "../src/api.js";
it("uses validated workspace-scoped desktop, repository and isolated recovery APIs with CSRF", async () => {
  const requestId = "git_" + "a".repeat(32),
    repositoryId = "repo_" + "b".repeat(32),
    folderId = "gfolder_" + "c".repeat(32),
    deviceId = "fc_" + "d".repeat(32),
    now = new Date().toISOString();
  const repo = {
    id: repositoryId,
    name: "team/project",
    defaultBranch: "main",
    webUrl: "http://git.internal/team/project",
    cloneUrl: "http://git.internal/team/project.git",
    sshUrl: "",
    role: "developer",
    permissions: { read: true, write: true, admin: false },
    branches: [],
    pullRequests: [],
    protectedDefault: true,
    requiredApprovals: 1,
  };
  const binding = {
    version: 1,
    id: folderId,
    workspaceId: "ws_team",
    userId: "usr_alice",
    deviceId,
    root: "D:\\project",
    repositoryId,
    branch: "work/alice",
    createdAt: now,
  };
  const job = {
    version: 1,
    id: "gjob_" + "e".repeat(32),
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
  };
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const api = createControlCenterApi(
    async (url, init) => {
      const p = String(url);
      calls.push({ url: p, init });
      let value: unknown;
      if (p.endsWith("/repository-center")) value = { configured: true, repositories: [repo] };
      else if (p.endsWith("/repository-center/recovery"))
        value =
          init?.method === "POST"
            ? {
                requestId,
                status: "backed-up",
                backupId: "gbackup_" + "f".repeat(32),
                sha256: "1".repeat(64),
              }
            : { configured: true, backups: [] };
      else if (p.includes("/repository-center/actions"))
        value = { requestId, action: "branch.create", status: "succeeded" };
      else if (p.includes("/repository-center/")) value = repo;
      else if (p.includes("/git-desktop/pick"))
        value = {
          version: 1,
          requestId: "gpick_" + "e".repeat(32),
          deviceId,
          actor: "usr_alice",
          workspaceId: "ws_team",
          status: "queued",
          createdAt: now,
          expiresAt: now,
        };
      else value = p.endsWith("/git-desktop") ? { devices: [], folders: [], jobs: [] } : job;
      return new Response(JSON.stringify(value));
    },
    "/frevos",
    () => "csrf-fixture",
  );
  expect((await api.repositoryCenterState?.("ws_team"))?.repositories).toEqual([repo]);
  expect(await api.repositoryDetails?.("ws_team", repositoryId)).toEqual(repo);
  expect(
    await api.createHostedRepository?.("ws_team", { version: 1, requestId, name: "project" }),
  ).toEqual(repo);
  await api.repositoryAction?.("ws_team", {
    version: 1,
    requestId,
    repositoryId,
    action: "branch.create",
    from: "main",
    name: "work/alice",
    expectedSha: "a".repeat(40),
  });
  await api.gitDesktopState?.("ws_team");
  await api.pickGitFolder?.("ws_team", {
    version: 1,
    requestId: "gpick_" + "e".repeat(32),
    deviceId,
  });
  expect((await api.gitFolderPicker?.("ws_team", "gpick_" + "e".repeat(32)))?.status).toBe(
    "queued",
  );
  await api.selectGitFolder?.("ws_team", { version: 1 });
  await api.gitDesktopAction?.("ws_team", { version: 1 });
  await api.connectGitFolder?.("ws_team", { version: 1 });
  await api.repositoryRecoveryState?.("ws_team");
  expect(
    (await api.repositoryRecoveryAction?.("ws_team", { version: 1, requestId, action: "backup" }))
      ?.status,
  ).toBe("backed-up");
  expect(calls).toHaveLength(12);
  for (const call of calls) {
    expect(call.url.startsWith("/frevos/v1/workspaces/ws_team/")).toBe(true);
    if (call.init?.method === "POST")
      expect(call.init.headers).toMatchObject({ "x-csrf-token": "csrf-fixture" });
  }
  expect(JSON.stringify(calls)).not.toMatch(/password|apiKey|shell|force-push/);
});
