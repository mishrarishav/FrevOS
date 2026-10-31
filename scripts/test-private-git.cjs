const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os"),
  crypto = require("node:crypto"),
  net = require("node:net"),
  { execFile, spawn } = require("node:child_process"),
  { promisify } = require("node:util");
const run = promisify(execFile);
async function runNativeAcceptance(implementations = {}) {
  let stage = "initialize",
    child,
    root,
    storage;
  return (async () => {
    const { testEnginePins } = await import("./prepare-private-git-test.mjs");
    const pin = testEnginePins[process.platform];
    if (!pin || process.arch !== "x64") throw Error("test-engine-platform-unsupported");
    const binary = path.resolve(
      implementations.binary ||
        process.env.DEVSETU_TEST_GITEA ||
        path.join(__dirname, "../.local/gitea", pin.file),
    );
    if (
      crypto
        .createHash("sha256")
        .update(await fs.readFile(binary))
        .digest("hex") !== pin.hash
    )
      throw Error("binary-identity");
    root = await fs.mkdtemp(path.join(os.tmpdir(), "devsetu-forge-test-"));
    const env = {
      ...require("../deployment/servix/NativePlatform.cjs").buildEnvironment(),
      GIT_TERMINAL_PROMPT: "0",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: path.join(root, "fixture.gitconfig"),
    };
    await fs.mkdir(path.join(root, "data"));
    const socket = net.createServer();
    await new Promise((r) => socket.listen(0, "127.0.0.1", r));
    const port = socket.address().port;
    await new Promise((r) => socket.close(r));
    const origin = "http://127.0.0.1:" + port,
      config = path.join(root, "app.ini"),
      slash = (p) => p.replaceAll("\\", "/");
    await fs.writeFile(
      config,
      `APP_NAME = DevSetu isolated Git verification\nRUN_USER = ${os.userInfo().username}\nRUN_MODE = prod\n[database]\nDB_TYPE = sqlite3\nPATH = ${slash(path.join(root, "data/gitea.db"))}\n[repository]\nROOT = ${slash(path.join(root, "repositories"))}\n[server]\nPROTOCOL = http\nDOMAIN = 127.0.0.1\nHTTP_ADDR = 127.0.0.1\nHTTP_PORT = ${port}\nROOT_URL = ${origin}/\nAPP_DATA_PATH = ${slash(path.join(root, "data"))}\nDISABLE_SSH = true\nLFS_START_SERVER = true\n[service]\nDISABLE_REGISTRATION = true\nREQUIRE_SIGNIN_VIEW = true\n[mailer]\nENABLED = false\n[security]\nINSTALL_LOCK = true\nSECRET_KEY = ${crypto.randomBytes(32).toString("hex")}\nINTERNAL_TOKEN = ${crypto.randomBytes(32).toString("hex")}\n[log]\nMODE = console\nLEVEL = Error\n`,
      { mode: 0o600 },
    );
    const cli = async (args) =>
      run(binary, ["--work-path", root, "--config", config, ...args], {
        env,
        windowsHide: true,
        timeout: 60000,
        maxBuffer: 131072,
      });
    stage = "migrate";
    await cli(["migrate"]);
    const tokens = {};
    stage = "fixture-identities";
    for (const name of ["owner", "alice", "bob", "reader"]) {
      await cli([
        "admin",
        "user",
        "create",
        "--username",
        name,
        "--email",
        name + "@devsetu.invalid",
        "--random-password",
        "--must-change-password=false",
        ...(name === "owner" ? ["--admin"] : []),
      ]);
      const result = await cli([
        "admin",
        "user",
        "generate-access-token",
        "--username",
        name,
        "--token-name",
        "isolated-verification",
        "--scopes",
        "all",
        "--raw",
      ]);
      const token = result.stdout.trim();
      if (!/^[a-f0-9]{40,128}$/.test(token)) throw Error("fixture-token-output");
      tokens[name] = token;
    }
    stage = "web-start";
    child = spawn(binary, ["--work-path", root, "--config", config, "web"], {
      env,
      windowsHide: true,
      stdio: ["ignore", "ignore", "ignore"],
    });
    child.on("error", () => {});
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        const response = await fetch(origin + "/api/healthz", {
          signal: AbortSignal.timeout(1000),
        });
        if (response.ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 200));
    }
    if (!ready) throw Error("web-health");
    const api = async (name, method, endpoint, body) => {
      const r = await fetch(origin + "/api/v1" + endpoint, {
        method,
        headers: {
          authorization: "token " + tokens[name],
          ...(body ? { "content-type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(15000),
        redirect: "error",
      });
      const text = await r.text();
      if (!r.ok) {
        const error = Error("native-api-" + r.status);
        error.status = r.status;
        throw error;
      }
      return text ? JSON.parse(text) : null;
    };
    stage = "create-repository";
    const repo = await api("owner", "POST", "/user/repos", {
      name: "desktop-project",
      private: true,
      auto_init: true,
      default_branch: "main",
    });
    stage = "collaborator-roles";
    for (const [name, permission] of [
      ["alice", "write"],
      ["bob", "admin"],
      ["reader", "read"],
    ])
      await api("owner", "PUT", "/repos/owner/desktop-project/collaborators/" + name, {
        permission,
      });
    stage = "read-identities";
    const users = {};
    for (const name of Object.keys(tokens)) users[name] = await api(name, "GET", "/user");
    const roles = {};
    for (const name of ["alice", "bob", "reader"]) {
      const value = await api(name, "GET", "/repos/owner/desktop-project");
      roles[name] = { id: value.id, permissions: value.permissions };
    }
    stage = "branch-protection";
    await api("owner", "POST", "/repos/owner/desktop-project/branch_protections", {
      rule_name: "main",
      enable_push: false,
      enable_force_push: false,
      required_approvals: 1,
      dismiss_stale_approvals: true,
      block_on_rejected_reviews: true,
      block_on_outdated_branch: true,
      block_admin_merge_override: true,
    });
    const rules = await api("bob", "GET", "/repos/owner/desktop-project/branch_protections");
    const branch = await api("alice", "GET", "/repos/owner/desktop-project/branches/main");

    stage = "adapter";
    const { RepositoryCenter } = implementations.RepositoryCenter
      ? implementations
      : await import("../apps/control-plane/dist/repository-center.js");
    const { RepositoryHostingConfigSchema, GitFolderBindingSchema, GitDesktopJobSchema } =
      await import("../packages/contracts/dist/index.js");
    const { GitDesktopRuntime } = require("../deployment/servix/GitDesktop.cjs");
    const ids = { owner: "usr_owner", alice: "usr_alice", bob: "usr_bob", reader: "usr_reader" };
    const cfg = RepositoryHostingConfigSchema.parse({
      version: 1,
      installationId: "forge_" + "a".repeat(32),
      workspaceId: "ws_team",
      provider: "gitea",
      apiUrl: origin + "/",
      webUrl: origin + "/",
      allowPrivateHttp: true,
      accounts: Object.entries(users).map(([login, u], i) => ({
        userId: ids[login],
        providerUserId: u.id,
        login,
        credentialId: "mc_" + String(i + 1).repeat(32),
        credentialReference: login,
      })),
      repositories: [
        {
          id: "repo_" + "b".repeat(32),
          providerRepositoryId: repo.id,
          owner: "owner",
          name: repo.name,
          defaultBranch: "main",
        },
      ],
    });
    const center = new RepositoryCenter(
      cfg,
      { read: async (r) => tokens[r] },
      path.join(root, "control"),
    );
    const repoId = cfg.repositories[0].id;
    const requestId = () => "git_" + crypto.randomBytes(16).toString("hex");
    const alice = await center.details(ids.alice, "ws_team", repoId);
    if (alice.role !== "developer") throw Error("role");
    stage = "native-create";
    const createIntent = requestId();
    const created = await center.create(ids.alice, "ws_team", {
      version: 1,
      requestId: createIntent,
      name: "new-private",
    });
    if (!created.protectedDefault) throw Error("created-protection");
    const same = await center.create(ids.alice, "ws_team", {
      version: 1,
      requestId: createIntent,
      name: "new-private",
    });
    if (same.id !== created.id) throw Error("duplicate-repository-creation");
    stage = "runtime-initial-commit";
    const project = path.join(root, "project");
    await fs.mkdir(project);
    await fs.writeFile(path.join(project, "app.js"), "export const answer=42;\n");
    await fs.writeFile(path.join(project, ".env"), "synthetic-fixture-value");
    const binding = GitFolderBindingSchema.parse({
      version: 1,
      id: "gfolder_" + "c".repeat(32),
      deviceId: "fc_" + "d".repeat(32),
      workspaceId: "ws_team",
      userId: ids.alice,
      root: project,
      repositoryId: repoId,
      branch: "work/alice",
      createdAt: new Date().toISOString(),
    });
    const runtime = new GitDesktopRuntime({
      stateRoot: path.join(root, "connector-state"),
      deviceId: binding.deviceId,
    });
    const snapshot = await runtime.snapshot(binding);
    const job = GitDesktopJobSchema.parse({
      version: 1,
      id: "gjob_" + crypto.randomBytes(16).toString("hex"),
      workspaceId: "ws_team",
      actor: ids.alice,
      deviceId: binding.deviceId,
      binding,
      action: "commit-push",
      branch: binding.branch,
      defaultBranch: "main",
      expectedFingerprint: snapshot.fingerprint,
      files: ["app.js"],
      message: "Application change",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 300000).toISOString(),
      status: "claimed",
    });
    let publishedHead = "";
    const result = await runtime.execute(job, {
      download: () => center.download(ids.alice, "ws_team", repoId, "main"),
      publish: async (j, bytes, head) => {
        await center.publish(ids.alice, "ws_team", repoId, j.branch, head, bytes);
        publishedHead = head;
      },
    });
    if (result.snapshot.head !== publishedHead) throw Error("publication-head");
    stage = "read-only-denied";
    let denied = false;
    try {
      await center.publish(
        ids.reader,
        "ws_team",
        repoId,
        binding.branch,
        publishedHead,
        Buffer.from("invalid"),
      );
    } catch {
      denied = true;
    }
    if (!denied) throw Error("reader-write");
    stage = "native-pr";
    await center.action(ids.alice, "ws_team", {
      version: 1,
      requestId: requestId(),
      repositoryId: repoId,
      action: "pull.create",
      head: binding.branch,
      base: "main",
      expectedHead: publishedHead,
      title: "Application change",
      body: "",
    });
    let details;
    for (let i = 0; i < 30; i++) {
      details = await center.details(ids.bob, "ws_team", repoId);
      if (details.pullRequests[0]?.mergeable) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    const pull = details.pullRequests[0];
    if (!pull?.mergeable) throw Error("pull-not-mergeable");
    stage = "review";
    await center.action(ids.bob, "ws_team", {
      version: 1,
      requestId: requestId(),
      repositoryId: repoId,
      action: "pull.review",
      number: pull.number,
      expectedHead: publishedHead,
      verdict: "APPROVED",
      body: "Verified fixture",
    });
    stage = "merge";
    await center.action(ids.bob, "ws_team", {
      version: 1,
      requestId: requestId(),
      repositoryId: repoId,
      action: "pull.merge",
      number: pull.number,
      expectedHead: publishedHead,
      expectedBase: pull.baseSha,
    });
    stage = "native-clone";
    const cloneRoot = path.join(root, "clone");
    await fs.mkdir(cloneRoot);
    const cloneBinding = { ...binding, id: "gfolder_" + "e".repeat(32), root: cloneRoot };
    const initial = await runtime.snapshot(cloneBinding);
    await runtime.execute(
      {
        ...job,
        id: "gjob_" + crypto.randomBytes(16).toString("hex"),
        binding: cloneBinding,
        action: "clone",
        branch: "main",
        expectedFingerprint: initial.fingerprint,
      },
      { download: () => center.download(ids.alice, "ws_team", repoId, "main") },
    );
    if (!(await fs.readFile(path.join(cloneRoot, "app.js"), "utf8")).includes("answer=42"))
      throw Error("clone-content");
    stage = "native-remote-branch";
    const remoteBranch = "work/remote-switch";
    const remoteSource = await center.branchHead(ids.alice, "ws_team", repoId, "main");
    await center.action(ids.alice, "ws_team", {
      version: 1,
      requestId: requestId(),
      repositoryId: repoId,
      action: "branch.create",
      from: "main",
      name: remoteBranch,
      expectedSha: remoteSource,
    });
    const beforeSwitch = await runtime.snapshot(cloneBinding);
    const switched = await runtime.execute(
      {
        ...job,
        id: "gjob_" + crypto.randomBytes(16).toString("hex"),
        binding: cloneBinding,
        action: "switch-branch",
        branch: remoteBranch,
        remoteHead: remoteSource,
        expectedFingerprint: beforeSwitch.fingerprint,
      },
      { download: () => center.download(ids.alice, "ws_team", repoId, remoteBranch) },
    );
    if (switched.snapshot.branch !== remoteBranch || switched.snapshot.head !== remoteSource)
      throw Error("remote-switch-head");
    if ((await fs.readFile(path.join(project, ".env"), "utf8")) !== "synthetic-fixture-value")
      throw Error("environment-preservation");

    stage = "publish-existing-history";
    const existingRoot = path.join(root, "existing-history");
    await fs.mkdir(existingRoot);
    await fs.writeFile(path.join(existingRoot, "service.js"), "export const original=true;\n");
    await runtime.git(existingRoot, ["init", "-b", "source-main"]);
    await runtime.git(existingRoot, ["add", "service.js"]);
    await runtime.git(existingRoot, [
      "-c",
      "user.name=Original Developer",
      "-c",
      "user.email=original@devsetu.invalid",
      "commit",
      "-m",
      "Original history",
    ]);
    await runtime.git(existingRoot, [
      "remote",
      "add",
      "origin",
      "https://example.invalid/original.git",
    ]);
    const originalHead = (await runtime.git(existingRoot, ["rev-parse", "HEAD"])).trim();
    const bootstrap = await center.repository(ids.alice, "ws_team", created.id, createIntent);
    const existingBinding = {
      ...binding,
      id: "gfolder_" + "6".repeat(32),
      root: existingRoot,
      repositoryId: created.id,
      branch: "work/import",
      bootstrapSeed: bootstrap.bootstrapSeed,
    };
    const observed = await runtime.snapshot(existingBinding);
    const imported = await runtime.execute(
      {
        ...job,
        id: "gjob_" + crypto.randomBytes(16).toString("hex"),
        binding: existingBinding,
        action: "push",
        branch: existingBinding.branch,
        expectedFingerprint: observed.fingerprint,
      },
      {
        download: () => center.download(ids.alice, "ws_team", created.id, "main"),
        publish: (j, bytes, head) =>
          center.publish(ids.alice, "ws_team", created.id, j.branch, head, bytes),
      },
    );
    await runtime.git(existingRoot, [
      "merge-base",
      "--is-ancestor",
      originalHead,
      imported.snapshot.head,
    ]);
    if (
      (await runtime.git(existingRoot, ["rev-parse", "source-main"])).trim() !== originalHead ||
      (await runtime.git(existingRoot, ["remote", "get-url", "origin"])).trim() !==
        "https://example.invalid/original.git"
    )
      throw Error("original-history-or-remote-changed");
    await center.action(ids.alice, "ws_team", {
      version: 1,
      requestId: requestId(),
      repositoryId: created.id,
      action: "pull.create",
      head: existingBinding.branch,
      base: "main",
      expectedHead: imported.snapshot.head,
      title: "Import existing project",
      body: "",
    });
    if (
      (await center.branchHead(ids.alice, "ws_team", created.id, "main")) !==
      bootstrap.bootstrapSeed
    )
      throw Error("default-branch-written");
    stage = "new-folder-clean-publish";
    const freshIntent = requestId(),
      freshRepo = await center.create(ids.alice, "ws_team", {
        version: 1,
        requestId: freshIntent,
        name: "fresh-folder",
      });
    const freshBootstrap = await center.repository(ids.alice, "ws_team", freshRepo.id, freshIntent),
      freshRoot = path.join(root, "fresh-folder");
    await fs.mkdir(freshRoot);
    await fs.writeFile(path.join(freshRoot, "fresh.js"), "export const fresh=true;\n");
    await fs.writeFile(path.join(freshRoot, ".env"), "synthetic-preserved");
    const freshBinding = {
      ...binding,
      id: "gfolder_" + "7".repeat(32),
      root: freshRoot,
      repositoryId: freshRepo.id,
      branch: "work/fresh",
      bootstrapSeed: freshBootstrap.bootstrapSeed,
    };
    const freshObserved = await runtime.snapshot(freshBinding);
    const freshResult = await runtime.execute(
      {
        ...job,
        id: "gjob_" + crypto.randomBytes(16).toString("hex"),
        binding: freshBinding,
        action: "commit-push",
        branch: freshBinding.branch,
        expectedFingerprint: freshObserved.fingerprint,
        files: ["fresh.js"],
      },
      {
        download: () => center.download(ids.alice, "ws_team", freshRepo.id, "main"),
        publish: (j, bytes, head) =>
          center.publish(ids.alice, "ws_team", freshRepo.id, j.branch, head, bytes),
      },
    );
    if (
      freshResult.snapshot.files.length ||
      (await fs.readFile(path.join(freshRoot, ".env"), "utf8")) !== "synthetic-preserved"
    )
      throw Error("new-folder-not-clean-or-preserved");

    stage = "negative-transfer-boundaries";
    const { GitEngine } = implementations.GitEngine
      ? implementations
      : await import("../apps/control-plane/dist/git-engine.js");
    const transfer = new GitEngine(path.join(root, "negative-transfers"));
    const access = {
      url: origin + "/owner/desktop-project.git",
      login: "alice",
      token: tokens.alice,
      defaultBranch: "main",
      write: true,
    };
    const outgoing = path.join(root, "checked.bundle");
    await runtime.git(project, ["bundle", "create", outgoing, binding.branch]);
    const checked = await fs.readFile(outgoing);
    const rejected = async (work, code) => {
      try {
        await work();
      } catch (e) {
        if (e.code === code || e.message === code) return;
        throw Error("unexpected-boundary-code");
      }
      throw Error("missing-boundary-rejection");
    };
    await rejected(
      () => transfer.publish(async () => access, binding.branch, publishedHead, Buffer.alloc(0)),
      "repository-bundle-capacity",
    );
    await rejected(
      () =>
        transfer.publish(
          async () => ({ ...access, write: false }),
          binding.branch,
          publishedHead,
          checked,
        ),
      "repository-default-or-write-denied",
    );
    await rejected(
      () => transfer.publish(async () => access, "main", publishedHead, checked),
      "repository-default-or-write-denied",
    );
    await rejected(
      () => transfer.publish(async () => access, binding.branch, "a".repeat(40), checked),
      "repository-bundle-ref-mismatch",
    );
    await rejected(
      () =>
        transfer.publish(
          async () => access,
          binding.branch,
          publishedHead,
          Buffer.from("malformed"),
        ),
      "repository-git-transfer-rejected",
    );
    await rejected(
      () =>
        transfer.publish(
          async () => ({ ...access, url: "https://8.8.8.8/project.git" }),
          binding.branch,
          publishedHead,
          checked,
        ),
      "repository-private-origin-required",
    );
    await transfer.publish(async () => access, binding.branch, publishedHead, checked);
    await runtime.git(cloneRoot, ["checkout", "-b", "work/rejected"]);
    await fs.writeFile(path.join(cloneRoot, ".env"), "synthetic-rejected-file");
    await runtime.git(cloneRoot, ["add", "-f", ".env"]);
    await runtime.git(cloneRoot, [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@devsetu.invalid",
      "commit",
      "-m",
      "Rejected fixture",
    ]);
    let rejectedHead = (await runtime.git(cloneRoot, ["rev-parse", "HEAD"])).trim(),
      rejectedBundle = path.join(root, "rejected.bundle");
    await runtime.git(cloneRoot, ["bundle", "create", rejectedBundle, "work/rejected"]);
    const protectedBytes = await fs.readFile(rejectedBundle);
    await rejected(
      () =>
        center.publish(ids.alice, "ws_team", repoId, "work/rejected", rejectedHead, protectedBytes),
      "repository-protected-history-needs-review",
    );
    await runtime.git(cloneRoot, ["checkout", "-b", "work/unsafe", "main"]);
    const object = (await runtime.git(cloneRoot, ["hash-object", "-w", "app.js"])).trim();
    await runtime.git(cloneRoot, [
      "update-index",
      "--add",
      "--cacheinfo",
      "120000," + object + ",link",
    ]);
    await runtime.git(cloneRoot, [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@devsetu.invalid",
      "commit",
      "-m",
      "Unsafe tree fixture",
    ]);
    rejectedHead = (await runtime.git(cloneRoot, ["rev-parse", "HEAD"])).trim();
    rejectedBundle = path.join(root, "unsafe.bundle");
    await runtime.git(cloneRoot, ["bundle", "create", rejectedBundle, "work/unsafe"]);
    const unsafeBytes = await fs.readFile(rejectedBundle);
    await rejected(
      () => center.publish(ids.alice, "ws_team", repoId, "work/unsafe", rejectedHead, unsafeBytes),
      "repository-unsafe-tree",
    );
    stage = "full-quiesced-backup";
    const { GitRecovery, verifyIsolatedEngine } = require("../deployment/servix/GitRecovery.cjs");
    storage = await fs.mkdtemp(path.join(os.tmpdir(), "git-recovery-"));
    const key = crypto.randomBytes(32);
    const healthy = async () => {
      try {
        return (await fetch(origin + "/api/healthz", { signal: AbortSignal.timeout(1000) })).ok;
      } catch {
        return false;
      }
    };
    const restart = async () => {
      child = spawn(binary, ["--work-path", root, "--config", config, "web"], {
        env,
        windowsHide: true,
        stdio: "ignore",
      });
      for (let i = 0; i < 100; i++) {
        if (await healthy()) return;
        await new Promise((r) => setTimeout(r, 200));
      }
      throw Error("fixture-restart");
    };
    const recoveryConfig = {
      workRoot: root,
      backupRoot: path.join(storage, "backups"),
      restoreRoot: path.join(storage, "restores"),
      maxBytes: 268435456,
      maxFiles: 50000,
      workspaceId: "ws_team",
      installationId: cfg.installationId,
      binary,
      binarySha256: pin.hash,
    };
    const recovery = new GitRecovery(
      recoveryConfig,
      {
        running: healthy,
        stop: async () => {
          child.kill();
          for (let i = 0; i < 50; i++) {
            if (!(await healthy())) return;
            await new Promise((r) => setTimeout(r, 200));
          }
          throw Error("fixture-stop");
        },
        start: restart,
      },
      async () => Buffer.from(key),
    );
    const backup = await recovery.backup();
    if (!(await healthy())) throw Error("backup-restart");
    stage = "isolated-full-restore";
    const offline = await recovery.restoreIsolated(backup.id, backup.sha256);
    const offlineResult = await verifyIsolatedEngine(recoveryConfig, offline);
    if (offlineResult.databaseHealth !== "consistent") throw Error("offline-consistency-check");
    const restored = await recovery.restoreIsolated(backup.id, backup.sha256);
    await verifyIsolatedEngine(recoveryConfig, restored, async (endpoint) => {
      const request = async (name, p) => {
        const r = await fetch(endpoint + "/api/v1" + p, {
          headers: { authorization: "token " + tokens[name] },
          redirect: "error",
        });
        if (!r.ok) throw Error("restore-api-" + r.status);
        return r.json();
      };
      const reader = await request("reader", "/repos/owner/desktop-project");
      if (reader.permissions.push || !reader.permissions.pull) throw Error("restored-role");
      const merged = await request("alice", "/repos/owner/desktop-project/pulls/1");
      if (!merged.merged) throw Error("restored-pr");
      const reviews = await request("bob", "/repos/owner/desktop-project/pulls/1/reviews");
      if (!reviews.some((r) => r.state === "APPROVED")) throw Error("restored-review");
      const branch = await request("alice", "/repos/owner/desktop-project/branches/main");
      if (branch.commit.id !== merged.merge_commit_sha) throw Error("restored-head");
    });
    const sealed = await fs.readFile(path.join(recoveryConfig.backupRoot, backup.id + ".sealed"));
    sealed[20] ^= 1;
    await fs.writeFile(path.join(recoveryConfig.backupRoot, backup.id + ".sealed"), sealed);
    let tamper = false;
    try {
      await recovery.restoreIsolated(backup.id, backup.sha256);
    } catch {
      tamper = true;
    }
    if (!tamper) throw Error("tamper-not-rejected");
    key.fill(0);
    const report = {
      status: "PASS",
      engine: "28.2.0",
      root,
      repositoryId: repo.id,
      checks: [
        "native-roles",
        "create-private-protected-repository",
        "nonempty-folder-initial-base",
        "real-git-bundle-push",
        "read-only-write-denied",
        "native-pr-review-merge",
        "real-clone",
        "remote-branch-checkout",
        "existing-history-and-remotes-preserved",
        "new-folder-clean-publish",
        "negative-bundle-boundaries",
        "environment-preserved",
        "full-quiesced-encrypted-backup",
        "isolated-native-restore",
        "offline-database-consistency",
        "restored-refs-roles-pr-reviews",
        "tamper-rejected",
        "engine-restarted",
      ],
    };
    await fs.mkdir(".local", { recursive: true });
    await fs.writeFile(".local/native-forge-acceptance.json", JSON.stringify(report, null, 2));
    Object.keys(tokens).forEach((k) => {
      tokens[k] = "";
    });
    return report;
  })()
    .catch((e) => {
      const code =
        e.name === "ZodError"
          ? "invalid-provider-fields-" + e.issues.map((i) => i.path.join(".")).join("-")
          : /^[a-z0-9-]{1,90}$/.test(e.message)
            ? e.message
            : "native-boundary-error";
      throw Error(stage + ":" + code);
    })
    .finally(async () => {
      if (child && !child.killed) child.kill();
      // Remove only the two exact disposable roots created by this invocation.
      // Their synthetic account/key/database files must not accumulate locally.
      for (const [directory, prefix] of [
        [root, "devsetu-forge-test-"],
        [storage, "git-recovery-"],
      ]) {
        if (!directory) continue;
        const target = path.resolve(directory);
        if (
          path.dirname(target) !== path.resolve(os.tmpdir()) ||
          !path.basename(target).startsWith(prefix)
        )
          throw Error("fixture-cleanup-scope");
        await fs.rm(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
      }
    });
}
module.exports = { runNativeAcceptance };
if (require.main === module)
  runNativeAcceptance()
    .then((report) => console.log(JSON.stringify(report)))
    .catch((e) => {
      console.log(JSON.stringify({ status: "FAIL", code: e.message }));
      process.exitCode = 1;
    });
