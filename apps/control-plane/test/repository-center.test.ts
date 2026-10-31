import { createServer } from "node:http";
import { mkdtemp, readFile, readdir, rm, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import {
  RepositoryHostingConfigSchema,
  RepositoryActionSchema,
  SafeGitBranchSchema,
  UserIdSchema,
} from "@frevos/contracts";
import {
  RepositoryCenter,
  giteaRequest,
  validateRepositoryHosting,
  loadRepositoryHosting,
  privateGitAddress,
} from "../src/repository-center.js";

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const f of cleanup.splice(0).reverse()) await f();
});
const sha = "a".repeat(40),
  baseSha = "b".repeat(40),
  repoId = "repo_" + "c".repeat(32);
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "devsetu-forge-"));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const users = [
    { id: 1, login: "alice" },
    { id: 2, login: "bob" },
    { id: 3, login: "reader" },
  ];
  let changedId = false,
    changedUser = false,
    denied = false,
    checksReady = true,
    protectedBranch = true;
  let reviews = [{ user: users[1], state: "APPROVED", commit_id: sha, stale: false }];
  let rule = {
    rule_name: "main",
    enable_push: false,
    enable_force_push: false,
    required_approvals: 1,
    dismiss_stale_approvals: true,
    block_on_rejected_reviews: true,
    block_on_outdated_branch: true,
    block_admin_merge_override: true,
    enable_status_check: true,
    status_check_contexts: ["validate"],
  };
  const calls: { method: string; path: string; body: unknown }[] = [];
  const pull = {
    number: 1,
    title: "Change",
    state: "open",
    user: users[0],
    head: { ref: "feature/work", sha, repo: { id: 12 } },
    base: { ref: "main", sha: baseSha, repo: { id: 12 } },
    merged: false,
    mergeable: true,
  };
  const server = createServer(async (request, response) => {
    const user = users[Number(request.headers.authorization?.replace("token fixture-", "")) - 1];
    response.setHeader("content-type", "application/json");
    if (!user) {
      response.writeHead(401);
      response.end("{}");
      return;
    }
    const data: Buffer[] = [];
    for await (const part of request) data.push(Buffer.from(part));
    const body = data.length ? JSON.parse(Buffer.concat(data).toString()) : null;
    const path = new URL(request.url!, "http://localhost").pathname;
    calls.push({ method: request.method!, path, body });
    const send = (v: unknown, status = 200) => {
      response.statusCode = status;
      response.end(JSON.stringify(v));
    };
    if (path === "/api/v1/user") {
      send({ ...user, id: changedUser ? 99 : user.id });
      return;
    }
    if (denied) {
      send({}, 403);
      return;
    }
    const prefix = "/api/v1/repos/team/project";
    if (path === prefix) {
      send({
        id: changedId ? 99 : 12,
        name: "project",
        owner: { id: 5, login: "team" },
        default_branch: "main",
        permissions: { pull: true, push: user.id !== 3, admin: user.id === 2 },
      });
      return;
    }
    if (path === prefix + "/branch_protections") {
      send([rule]);
      return;
    }
    if (path === prefix + "/commits/" + sha + "/status") {
      send({ statuses: [{ context: "validate", status: checksReady ? "success" : "pending" }] });
      return;
    }
    if (path === prefix + "/branches" && request.method === "GET") {
      send([
        { name: "main", commit: { id: baseSha }, protected: protectedBranch },
        { name: "feature/work", commit: { id: sha }, protected: false },
      ]);
      return;
    }
    if (path.startsWith(prefix + "/branches/") && request.method === "GET") {
      const name = decodeURIComponent(path.slice((prefix + "/branches/").length));
      send({
        name,
        commit: { id: name === "main" ? baseSha : sha },
        protected: name === "main" && protectedBranch,
      });
      return;
    }
    if (path === prefix + "/pulls" && request.method === "GET") {
      send([pull]);
      return;
    }
    if (path === prefix + "/pulls/1") {
      send(pull);
      return;
    }
    if (path === prefix + "/pulls/1/reviews" && request.method === "GET") {
      send(reviews.map((r, i) => ({ ...r, id: i + 1 })));
      return;
    }
    if (path === prefix + "/pulls" && request.method === "POST") {
      send(pull, 201);
      return;
    }
    send(null, request.method === "POST" ? 201 : 404);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanup.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  if (!address || typeof address === "string") throw Error();
  const url = `http://127.0.0.1:${address.port}/`;
  const config = RepositoryHostingConfigSchema.parse({
    version: 1,
    installationId: "forge_" + "d".repeat(32),
    workspaceId: "ws_team",
    provider: "gitea",
    apiUrl: url,
    webUrl: url,
    allowPrivateHttp: true,
    accounts: users.map((u) => ({
      userId: "usr_" + u.login,
      providerUserId: u.id,
      login: u.login,
      credentialId: "mc_" + String(u.id).repeat(32),
      credentialReference: "fixture-reference-" + u.id,
    })),
    repositories: [
      {
        id: repoId,
        providerRepositoryId: 12,
        owner: "team",
        name: "project",
        defaultBranch: "main",
        requiredApprovals: 1,
        requiredChecks: ["validate"],
      },
    ],
  });
  const center = new RepositoryCenter(
    config,
    {
      read: async (reference, scope) => {
        const account = config.accounts.find(
          (a) => a.credentialReference === reference && a.userId === scope.actor,
        );
        if (!account) throw Error("wrong-vault-scope");
        return "fixture-" + account.providerUserId;
      },
    },
    root,
  );
  const action = (kind: string, extra: Record<string, unknown> = {}) => ({
    version: 1,
    requestId: "git_" + crypto.randomUUID().replaceAll("-", ""),
    repositoryId: repoId,
    action: kind,
    ...extra,
  });
  return {
    center,
    config,
    root,
    calls,
    action,
    pull,
    server,
    identity: () => {
      changedId = true;
    },
    userIdentity: () => {
      changedUser = true;
    },
    deny: () => {
      denied = true;
    },
    checks: (ready: boolean) => {
      checksReady = ready;
    },
    rule: (patch: Partial<typeof rule>) => {
      rule = { ...rule, ...patch };
    },
    reviews: (value: typeof reviews) => {
      reviews = value;
    },
    unprotect: () => {
      protectedBranch = false;
    },
  };
}
it("requires a live engine administrator for full recovery, binds its key and records idempotent single-use receipts", async () => {
  const f = await fixture();
  let keyBoundary: (() => Promise<Buffer>) | undefined,
    admin = true,
    keyValid = true;
  const backup = {
    version: 1,
    id: "gbackup_" + "d".repeat(32),
    sha256: "e".repeat(64),
    installationId: f.config.installationId,
    workspaceId: f.config.workspaceId,
    createdAt: new Date().toISOString(),
    bytes: 200,
    files: 4,
    uncompressedBytes: 500,
  };
  const boundary = {
    list: vi.fn(async () => [backup]),
    backup: vi.fn(async () => {
      await keyBoundary?.();
      return backup;
    }),
    restoreIsolated: vi.fn(async () => ({ fixture: true })),
    verify: vi.fn(async () => ({ status: "verified-isolated" })),
  };
  const module = createRequire(import.meta.url)("../../../deployment/servix/GitRecovery.cjs");
  vi.spyOn(module, "createNativeRecovery").mockImplementation((...args: unknown[]) => {
    keyBoundary = args[1] as () => Promise<Buffer>;
    return boundary;
  });
  const cfg = RepositoryHostingConfigSchema.parse({
    ...f.config,
    recovery: {
      workRoot: join(f.root, "engine"),
      backupRoot: join(f.root, "backup"),
      restoreRoot: join(f.root, "restore"),
      binary: join(f.root, "engine.exe"),
      binarySha256: "1".repeat(64),
      serviceName: "FixtureGit",
      expectedCommandLine: "fixture",
      keyOwner: "usr_bob",
      keyId: "mc_" + "2".repeat(32),
      keyReference: "fixture-key",
    },
  });
  const c = new RepositoryCenter(
    cfg,
    {
      read: async (reference, scope) => {
        if (reference === "fixture-key") {
          expect(scope).toEqual({
            workspaceId: "ws_team",
            actor: "usr_bob",
            connectionId: "mc_" + "2".repeat(32),
          });
          return keyValid ? "3".repeat(64) : "invalid-fixture-key";
        }
        return "fixture-token";
      },
    },
    join(f.root, "recovery-ledger"),
    async () => ({ id: 2, login: "bob", is_admin: admin }),
  );
  expect(await c.recoveryState("usr_bob", "ws_team")).toEqual({
    configured: true,
    backups: [backup],
  });
  const a = { version: 1, requestId: "git_" + "f".repeat(32), action: "backup" };
  const result = await c.recover("usr_bob", "ws_team", a);
  expect(result.status).toBe("backed-up");
  expect(await c.recover("usr_bob", "ws_team", a)).toEqual(result);
  expect(boundary.backup).toHaveBeenCalledOnce();
  await expect(
    c.recover("usr_bob", "ws_team", {
      ...a,
      action: "restore-isolated",
      backupId: backup.id,
      sha256: backup.sha256,
    }),
  ).rejects.toThrow("request-conflict");
  expect(
    (
      await c.recover("usr_bob", "ws_team", {
        ...a,
        requestId: "git_" + "4".repeat(32),
        action: "restore-isolated",
        backupId: backup.id,
        sha256: backup.sha256,
      })
    ).status,
  ).toBe("verified-isolated");
  expect(boundary.verify).toHaveBeenCalledOnce();
  keyValid = false;
  const bad = { ...a, requestId: "git_" + "5".repeat(32) };
  await expect(c.recover("usr_bob", "ws_team", bad)).rejects.toThrow("recovery-key-unavailable");
  await expect(c.recover("usr_bob", "ws_team", bad)).rejects.toThrow(
    "request-needs-reconciliation",
  );
  admin = false;
  await expect(
    c.recover("usr_bob", "ws_team", { ...a, requestId: "git_" + "6".repeat(32) }),
  ).rejects.toThrow("admin-required");
  await expect(c.recoveryState("usr_bob", "ws_other")).rejects.toThrow("workspace-denied");
  await expect(c.recoveryState("usr_unknown", "ws_team")).rejects.toThrow("admin-required");
  expect(await f.center.recoveryState("usr_bob", "ws_team")).toEqual({
    configured: false,
    backups: [],
  });
});
it("rejects corrupted registry metadata, provider duplicates and linked storage before returning source access", async () => {
  const f = await fixture(),
    dir = join(f.root, "bindings");
  await f.center.state("usr_bob", "ws_team");
  await writeFile(join(dir, "unexpected.json"), "{}");
  await expect(f.center.state("usr_bob", "ws_team")).rejects.toThrow("registry-invalid");
  await rm(join(dir, "unexpected.json"));
  await writeFile(
    join(dir, f.config.repositories[0]!.id + ".json"),
    JSON.stringify(f.config.repositories[0]),
  );
  await expect(f.center.state("usr_bob", "ws_team")).rejects.toThrow("registry-identity-conflict");
});
it("uses actual private HTTP, verifies immutable identities and returns only each actor's live repository permissions", async () => {
  const f = await fixture();
  expect((await f.center.state("usr_reader", "ws_team")).repositories[0]?.role).toBe("reader");
  const detail = await f.center.details("usr_bob", "ws_team", repoId);
  expect(detail).toMatchObject({
    role: "maintainer",
    protectedDefault: true,
    branches: [{ name: "main" }, { name: "feature/work" }],
  });
  expect(detail.pullRequests[0]?.headSha).toBe(sha);
  expect(JSON.stringify(detail)).not.toContain("fixture-");
  await expect(f.center.details("usr_bob", "ws_other", repoId)).rejects.toThrow("workspace-denied");
  await expect(f.center.details("usr_outside", "ws_team", repoId)).rejects.toThrow("not-found");
  f.identity();
  await expect(f.center.details("usr_bob", "ws_team", repoId)).rejects.toThrow(
    "provider-identity-changed",
  );
});
it("denies substituted accounts, hidden repositories and write actions by readers", async () => {
  const f = await fixture();
  await expect(
    f.center.action(
      "usr_reader",
      "ws_team",
      f.action("branch.create", { name: "feature/new", from: "main", expectedSha: baseSha }),
    ),
  ).rejects.toThrow("write-denied");
  f.deny();
  expect((await f.center.state("usr_alice", "ws_team")).repositories).toEqual([]);
  const g = await fixture();
  g.userIdentity();
  await expect(g.center.details("usr_alice", "ws_team", repoId)).rejects.toThrow(
    "account-identity-changed",
  );
});
it("creates a branch and pull request with exact head proof and records no review text in its audit receipts", async () => {
  const f = await fixture();
  const branch = f.action("branch.create", {
    name: "feature/new",
    from: "main",
    expectedSha: baseSha,
  });
  const result = await f.center.action("usr_alice", "ws_team", branch);
  expect(result.status).toBe("succeeded");
  expect(await f.center.action("usr_alice", "ws_team", branch)).toEqual(result);
  expect(f.calls.filter((c) => c.method === "POST" && c.path.endsWith("/branches"))).toHaveLength(
    1,
  );
  await expect(
    f.center.action("usr_alice", "ws_team", { ...branch, name: "feature/different" }),
  ).rejects.toThrow("request-conflict");
  const p = f.action("pull.create", {
    head: "feature/work",
    base: "main",
    expectedHead: sha,
    title: "Add feature",
    body: "private-description-fixture",
  });
  expect((await f.center.action("usr_alice", "ws_team", p)).url).toContain("/pulls/1");
  const receipts = (
    await Promise.all(
      (
        await readdir(f.root)
      )
        .filter((n) => n.endsWith(".json"))
        .map((n) => readFile(join(f.root, n), "utf8")),
    )
  ).join();
  expect(receipts).not.toMatch(/fixture-[123]|private-description-fixture/);
});
it("requires non-author, current-commit reviews, strict protection, checks and an exact base for merge", async () => {
  const f = await fixture(),
    merge = () => f.action("pull.merge", { number: 1, expectedHead: sha, expectedBase: baseSha });
  await expect(f.center.action("usr_alice", "ws_team", merge())).rejects.toThrow("write-denied");
  f.checks(false);
  await expect(f.center.action("usr_bob", "ws_team", merge())).rejects.toThrow("checks-required");
  f.checks(true);
  f.reviews([]);
  await expect(f.center.action("usr_bob", "ws_team", merge())).rejects.toThrow("review-required");
  f.reviews([{ user: { id: 2, login: "bob" }, state: "APPROVED", commit_id: sha, stale: false }]);
  f.rule({ enable_push: true });
  await expect(f.center.action("usr_bob", "ws_team", merge())).rejects.toThrow(
    "protection-not-ready",
  );
  f.rule({ enable_push: false });
  f.pull.base.sha = sha;
  await expect(f.center.action("usr_bob", "ws_team", merge())).rejects.toThrow("merge-not-ready");
  f.pull.base.sha = baseSha;
  expect((await f.center.action("usr_bob", "ws_team", merge())).status).toBe("succeeded");
  const sent = f.calls.find((c) => c.path.endsWith("/merge"));
  expect(sent?.body).toMatchObject({ Do: "squash", head_commit_id: sha, force_merge: false });
});
it("denies author review, stale actions, default-branch creation and repeated uncertain requests", async () => {
  const f = await fixture();
  await expect(
    f.center.action(
      "usr_alice",
      "ws_team",
      f.action("pull.review", { number: 1, expectedHead: sha, verdict: "APPROVED" }),
    ),
  ).rejects.toThrow("self-review-denied");
  expect(
    (
      await f.center.action(
        "usr_alice",
        "ws_team",
        f.action("pull.review", {
          number: 1,
          expectedHead: sha,
          verdict: "COMMENT",
          body: "Review fixture",
        }),
      )
    ).status,
  ).toBe("succeeded");
  const stale = f.action("branch.create", { name: "feature/new", from: "main", expectedSha: sha });
  await expect(f.center.action("usr_alice", "ws_team", stale)).rejects.toThrow("source-changed");
  await expect(f.center.action("usr_alice", "ws_team", stale)).rejects.toThrow(
    "request-needs-reconciliation",
  );
  await expect(
    f.center.action(
      "usr_alice",
      "ws_team",
      f.action("branch.create", { name: "main", from: "main", expectedSha: baseSha }),
    ),
  ).rejects.toThrow("default-branch-protected");
});
it("validates configuration and ref names, refuses public/credential URLs and linked configuration storage", async () => {
  const f = await fixture();
  expect(await validateRepositoryHosting(f.config)).toEqual(f.config);
  for (const value of [
    "main.lock",
    "../main",
    "a//b",
    "a..b",
    "a/../b",
    "-option",
    "a@{x}",
    "/root",
    "main/",
  ]) {
    expect(SafeGitBranchSchema.safeParse(value).success).toBe(false);
  }
  for (const value of [
    "https://user:password@127.0.0.1/",
    "http://127.0.0.1/?token=x",
    "ftp://127.0.0.1/",
    "http://127.0.0.1/bad/path",
  ]) {
    await expect(validateRepositoryHosting({ ...f.config, apiUrl: value })).rejects.toThrow();
  }
  await expect(
    validateRepositoryHosting({ ...f.config, allowPrivateHttp: false }),
  ).rejects.toThrow();
  expect(privateGitAddress("::1")).toBe(true);
  expect(privateGitAddress("10.2.3.4")).toBe(true);
  expect(privateGitAddress("8.8.8.8")).toBe(false);
  expect(privateGitAddress("172.32.0.1")).toBe(false);
  expect(await loadRepositoryHosting(join(f.root, "absent.json"))).toBeUndefined();
  const file = join(f.root, "config.json");
  await writeFile(file, JSON.stringify(f.config));
  expect(await loadRepositoryHosting(file)).toEqual(f.config);
  const link = join(f.root, "linked.json");
  await symlink(f.root, link, "junction");
  await expect(loadRepositoryHosting(join(link, "config.json"))).rejects.toThrow("linked");
  await expect(giteaRequest(f.config, "bad\r\ntoken", "GET", "/api/v1/user")).rejects.toThrow(
    "invalid-provider-request",
  );
  expect(
    RepositoryActionSchema.safeParse(
      f.action("branch.create", {
        name: "valid",
        from: "main",
        expectedSha: baseSha,
        command: "forbidden",
      }),
    ).success,
  ).toBe(false);
});
it("certifies initial history linking only for the creator's exact unchanged repository seed", async () => {
  const f = await fixture(),
    intent = "git_" + "e".repeat(32);
  const bootstrap = {
    createdBy: UserIdSchema.parse("usr_alice"),
    requestId: intent,
    seedHead: baseSha,
  };
  f.config.repositories[0]!.bootstrap = bootstrap;
  expect(await f.center.repository("usr_alice", "ws_team", repoId, intent)).toMatchObject({
    bootstrapSeed: baseSha,
  });
  expect(await f.center.repository("usr_alice", "ws_team", repoId)).not.toHaveProperty(
    "bootstrapSeed",
  );
  await expect(f.center.repository("usr_bob", "ws_team", repoId, intent)).rejects.toThrow(
    "initial-publication-denied",
  );
  await expect(
    f.center.repository("usr_alice", "ws_team", repoId, "git_" + "f".repeat(32)),
  ).rejects.toThrow("initial-publication-denied");
  bootstrap.seedHead = sha;
  await expect(f.center.repository("usr_alice", "ws_team", repoId, intent)).rejects.toThrow(
    "initial-repository-changed",
  );
});
it("bounds private provider responses and refuses redirects, expired identities and malformed bodies", async () => {
  const f = await fixture();
  for (const [status, body, code] of [
    [401, "{}", "account-expired"],
    [403, "{}", "access-denied"],
    [404, "{}", "not-found"],
    [302, "{}", "provider-rejected"],
    [200, "not-json", "invalid-response"],
    [200, "x".repeat(2097153), "provider-capacity"],
  ] as const) {
    f.server.removeAllListeners("request");
    f.server.on("request", (_request, response) => {
      response.statusCode = status;
      response.setHeader("location", "https://example.invalid/never-follow");
      response.end(body);
    });
    await expect(giteaRequest(f.config, "fixture", "GET", "/api/v1/user")).rejects.toThrow(code);
  }
  f.server.removeAllListeners("request");
  f.server.on("request", (_request, response) => {
    response.statusCode = 204;
    response.end();
  });
  expect(await giteaRequest(f.config, "fixture", "GET", "/api/v1/user")).toBeNull();
});
it("rejects revoked base protection and a reviewer's later request for changes", async () => {
  const f = await fixture();
  const merge = () =>
    f.action("pull.merge", { number: 1, expectedHead: sha, expectedBase: baseSha });
  f.reviews([
    { user: { id: 2, login: "bob" }, state: "APPROVED", commit_id: sha, stale: false },
    { user: { id: 2, login: "bob" }, state: "REQUEST_CHANGES", commit_id: sha, stale: false },
  ]);
  await expect(f.center.action("usr_bob", "ws_team", merge())).rejects.toThrow("review-required");
  f.unprotect();
  await expect(f.center.action("usr_bob", "ws_team", merge())).rejects.toThrow("base-changed");
});
it("reports unlinked/denied accounts without repository metadata and rejects corrupt provider-ID registries", async () => {
  const f = await fixture();
  expect(await f.center.state("usr_unknown", "ws_team")).toEqual({
    configured: true,
    accountLinked: false,
    repositories: [],
  });
  expect(await f.center.recoveryState("usr_alice", "ws_team")).toEqual({
    configured: false,
    backups: [],
  });
  f.deny();
  expect((await f.center.state("usr_alice", "ws_team")).repositories).toEqual([]);
  await writeFile(join(f.root, "bindings", "unexpected.json"), "{}");
  await expect(f.center.state("usr_alice", "ws_team")).rejects.toThrow("registry-invalid");
});
it("retains uncertain repository creation receipts rather than replaying a potentially completed side effect", async () => {
  const f = await fixture(),
    requestId = "git_" + "9".repeat(32);
  const input = { version: 1, requestId, name: "new-project" };
  await expect(f.center.create("usr_alice", "ws_other", input)).rejects.toThrow("workspace-denied");
  await expect(f.center.create("usr_unknown", "ws_team", input)).rejects.toThrow(
    "account-not-linked",
  );
  // This private protocol fixture returns a malformed 201. Its outcome is unknown.
  await expect(f.center.create("usr_alice", "ws_team", input)).rejects.toThrow();
  await expect(f.center.create("usr_alice", "ws_team", input)).rejects.toThrow(
    "request-needs-reconciliation",
  );
  await expect(
    f.center.create("usr_alice", "ws_team", { ...input, name: "other-project" }),
  ).rejects.toThrow("request-conflict");
  expect(
    f.calls.filter((c) => c.method === "POST" && c.path === "/api/v1/user/repos"),
  ).toHaveLength(1);
});
