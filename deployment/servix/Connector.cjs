// Requests contain business identifiers and Git commits, never commands or local paths.
const fs = require("node:fs/promises");
const path = require("node:path");
const { parsePreservedPaths, isPreserved } = require("./Preservation.cjs");
const { promisify } = require("node:util");
const { execFile } = require("node:child_process");
const run = promisify(execFile);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const headPattern = /^[a-f0-9]{40}$/;
const repositoryPath = (value) =>
  process.platform === "win32" ? value.replaceAll("\\", "/").toLowerCase() : value;
const centralRepository = {
  id: "gitrepo_6cb7e163f807493fa37963196c49fbac",
  origin: "//10.9.69.20/e$/FrevOS/git/servix.git",
  remoteName: "frevos",
  branch: "frevos-dev",
};
function repositoryBinding(config) {
  if (config.centralRepository) {
    const b = config.centralRepository;
    if (
      !/^gitrepo_[a-f0-9]{32}$/.test(b.id) ||
      b.origin !== `devsetu://repositories/${b.id}` ||
      b.remoteName !== "devsetu" ||
      b.branch !== "devsetu-dev"
    )
      throw Error("invalid-central-binding");
    return b;
  }
  return config.profileId === "servix-development" ? centralRepository : undefined;
}
function controlPlane(config) {
  const server = new URL(config.server);
  if (
    server.username ||
    server.password ||
    server.search ||
    server.hash ||
    (server.protocol !== "https:" &&
      !(server.protocol === "http:" && config.allowInternalHttp === true) &&
      !(server.protocol === "http:" && server.hostname === "10.9.69.20"))
  )
    throw Error("invalid-control-plane");
  return server;
}
async function downloadBaseline(config, heads, file) {
  const response = await fetch(new URL("/v1/connector/source-base", controlPlane(config)), {
    method: "POST",
    headers: { authorization: "Bearer " + config.credential, "content-type": "application/json" },
    body: JSON.stringify({ heads }),
    redirect: "error",
    signal: AbortSignal.timeout(180000),
  });
  if (!response.ok || !response.body) {
    if (response.status === 409) {
      const body = await response.json();
      if (body.error === "repository-not-seeded") throw Error("repository-not-seeded");
    }
    throw Error("source-base-unavailable");
  }
  const f = await fs.open(file, "wx", 0o600);
  try {
    let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > 256 * 1024 * 1024) throw Error("source-base-capacity");
      await f.write(chunk);
    }
    await f.sync();
  } finally {
    await f.close();
  }
  return file;
}
async function cloneFromBundle(config, bundle, expectedOrigin = config.repositoryOrigin) {
  if (typeof expectedOrigin !== "string" || !expectedOrigin)
    throw Error("repository-profile-required");
  let entries = [];
  try {
    entries = await fs.readdir(config.repository);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (entries.length) throw Error("checkout-directory-not-empty");
  await run(
    config.git,
    [
      "clone",
      "--single-branch",
      "--branch",
      repositoryBinding(config)?.branch || "frevos-dev",
      "--",
      bundle,
      config.repository,
    ],
    { windowsHide: true, timeout: 180000, maxBuffer: 4096 },
  );
  await run(config.git, ["-C", config.repository, "remote", "set-url", "origin", expectedOrigin], {
    windowsHide: true,
    timeout: 10000,
  });
  const binding = repositoryBinding(config);
  if (binding)
    await run(
      config.git,
      ["-C", config.repository, "remote", "add", binding.remoteName, binding.origin],
      { windowsHide: true, timeout: 10000 },
    );
  await run(
    config.git,
    ["-C", config.repository, "switch", "--create", "frevos/" + config.deviceId],
    { windowsHide: true, timeout: 10000 },
  );
}
async function bindCentralCheckout(config, baselineFile) {
  const binding = repositoryBinding(config);
  if (!binding) throw Error("wrong-repository-profile");
  const git = async (args) =>
    (
      await run(
        config.git,
        ["-C", config.repository, "-c", "gc.auto=0", "-c", "maintenance.auto=false", ...args],
        { windowsHide: true, timeout: 120000, maxBuffer: 8192 },
      )
    ).stdout.trim();
  const root = await fs.realpath(config.repository);
  if (repositoryPath(await git(["rev-parse", "--show-toplevel"])) !== repositoryPath(root))
    throw Error("wrong-local-repository");
  let previous;
  if ((await git(["remote"])).split(/\r?\n/).includes(binding.remoteName))
    previous = await git(["remote", "get-url", binding.remoteName]);
  if (previous && previous !== binding.origin) throw Error("repository-identity-mismatch");
  await fs.mkdir(config.stateRoot, { recursive: true });
  let bundle;
  try {
    bundle =
      baselineFile ||
      (await downloadBaseline(
        config,
        (await git(["rev-list", "--max-count=100", "HEAD"])).split(/\r?\n/),
        path.join(
          config.stateRoot,
          "bind-" + require("node:crypto").randomBytes(16).toString("hex") + ".bundle",
        ),
      ));
  } catch (error) {
    if (error.message !== "repository-not-seeded" || !config.centralRepository) throw error;
    const head = await git(["rev-parse", "HEAD"]);
    const seed = path.join(
      config.stateRoot,
      "seed-" + require("node:crypto").randomBytes(16).toString("hex") + ".bundle",
    );
    await git(["bundle", "create", seed, "HEAD"]);
    const response = await fetch(new URL("/v1/connector/source-seed", controlPlane(config)), {
      method: "POST",
      headers: {
        authorization: "Bearer " + config.credential,
        "content-type": "application/x-git-bundle",
        "x-frevos-source-head": head,
      },
      body: await fs.readFile(seed),
      redirect: "error",
      signal: AbortSignal.timeout(180000),
    });
    // An interrupted response can follow a successful import. Observe the
    // authenticated central repository before deciding enrollment failed;
    // never replay the seed mutation or touch the local working tree here.
    try {
      bundle = await downloadBaseline(
        config,
        [],
        path.join(
          config.stateRoot,
          "seeded-" + require("node:crypto").randomBytes(16).toString("hex") + ".bundle",
        ),
      );
    } catch (error) {
      if (!response.ok) throw Error("repository-seed-failed");
      throw error;
    }
  }
  await git(["bundle", "verify", bundle]);
  await git([
    "fetch",
    "--no-tags",
    bundle,
    `refs/heads/${binding.branch}:refs/remotes/${binding.remoteName}/${binding.branch}`,
  ]);
  await git(["merge-base", "HEAD", `refs/remotes/${binding.remoteName}/${binding.branch}`]);
  if (!previous) await git(["remote", "add", binding.remoteName, binding.origin]);
  return inspectRepository(config);
}
function validateJob(config, job) {
  if (
    !job ||
    typeof job !== "object" ||
    Object.keys(job).some(
      (k) =>
        ![
          "version",
          "requestId",
          "deviceId",
          "userId",
          "baseHead",
          "createdAt",
          "expiresAt",
          "status",
          "preservedPaths",
          "changeDetails",
        ].includes(k),
    ) ||
    job.version !== 1 ||
    job.status !== "queued" ||
    !/^sd_[a-f0-9]{32}$/.test(job.requestId) ||
    job.deviceId !== config.deviceId ||
    !/^usr_[A-Za-z0-9_-]+$/.test(job.userId) ||
    !headPattern.test(job.baseHead) ||
    !Number.isFinite(Date.parse(job.expiresAt)) ||
    Date.parse(job.expiresAt) <= Date.now() ||
    Date.parse(job.expiresAt) > Date.now() + 11 * 60000
  )
    throw Error("invalid-source-request");
  checkedChangeDetails(job.changeDetails);
  parsePreservedPaths(job.preservedPaths || []);
}
function checkedChangeDetails(details) {
  if (details === undefined) return undefined;
  if (!details || typeof details !== "object" || Array.isArray(details))
    throw Error("invalid-change-details");
  if (
    details &&
    (Object.keys(details).sort().join(",") !== "approvedBy,message" ||
      typeof details.message !== "string" ||
      details.message.length < 3 ||
      details.message.length > 2000 ||
      [...details.message].some((c) => {
        const n = c.charCodeAt(0);
        return (n < 32 && ![9, 10, 13].includes(n)) || n === 127;
      }) ||
      typeof details.approvedBy !== "string" ||
      details.approvedBy.length < 2 ||
      details.approvedBy.length > 160 ||
      [...details.approvedBy].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127))
  )
    throw Error("invalid-change-details");
  return details;
}
async function publishWorkingTree(config, job, options = {}) {
  const binding = repositoryBinding(config);
  const details = checkedChangeDetails(job.changeDetails);
  if (
    !/^sd_[a-f0-9]{32}$/.test(job.requestId) ||
    !headPattern.test(job.baseHead) ||
    job.deviceId !== config.deviceId ||
    Date.parse(job.expiresAt) <= Date.now()
  )
    throw Error("invalid-source-request");
  const git = async (args, extra = {}) =>
    (
      await run(config.git, ["-C", config.repository, ...args], {
        windowsHide: true,
        timeout: 120000,
        maxBuffer: 4 * 1024 * 1024,
        ...extra,
      })
    ).stdout.trim();
  const root = await fs.realpath(config.repository);
  if (repositoryPath(await git(["rev-parse", "--show-toplevel"])) !== repositoryPath(root))
    throw Error("wrong-local-repository");
  if (
    (await git(["remote", "get-url", binding?.remoteName || "origin"])) !==
    (binding ? binding.origin : options.expectedOrigin || config.repositoryOrigin)
  )
    throw Error("repository-identity-mismatch");
  const branch = await git(["symbolic-ref", "--short", "HEAD"]);
  let defaultBranch = "";
  if (!binding)
    try {
      defaultBranch = (await git(["symbolic-ref", "refs/remotes/origin/HEAD"])).replace(
        "refs/remotes/origin/",
        "",
      );
    } catch {}
  if (!branch || ["main", "master", defaultBranch].includes(branch))
    throw Error("default-branch-denied");
  for (const relative of [
    "MERGE_HEAD",
    "CHERRY_PICK_HEAD",
    "REVERT_HEAD",
    "rebase-merge",
    "rebase-apply",
    "index.lock",
  ]) {
    const location = await git(["rev-parse", "--git-path", relative]);
    try {
      await fs.access(path.resolve(config.repository, location));
      throw Error("local-git-busy");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  if (await git(["diff", "--name-only", "--diff-filter=U"])) throw Error("local-git-conflict");
  try {
    await git(["merge-base", "--is-ancestor", job.baseHead, "HEAD"]);
  } catch {
    if (!options.synchronizeBase) throw Error("source-behind-or-conflicting");
    try {
      const have = (await git(["rev-list", "--max-count=100", "HEAD"])).split(/\r?\n/);
      const baseline = await options.synchronizeBase(have);
      await git([
        "fetch",
        "--no-tags",
        baseline,
        `refs/heads/${binding?.branch || "frevos-dev"}:refs/remotes/${binding?.remoteName || "frevos"}/${binding?.branch || "frevos-dev"}`,
      ]);
      try {
        await git(["merge-base", "--is-ancestor", job.baseHead, "HEAD"]);
      } catch {
        await git(["merge", "--ff-only", job.baseHead]);
      }
    } catch {
      throw Error("source-behind-or-conflicting");
    }
  }
  const preservedPaths = parsePreservedPaths(job.preservedPaths || []);
  const protectedSource = (name) =>
    isPreserved(name, preservedPaths) ||
    /(^|\/)(?:[^/]*\.env|\.servix-runtime)(\/|$)/i.test(name) ||
    /\.(?:pem|key|pfx|p12|jks|keystore)$/i.test(name);
  // Preserve the user's existing index: do not silently unstage their data.
  const staged = (await git(["diff", "--cached", "--name-only", "-z"])).split("\0").filter(Boolean);
  if (staged.some(protectedSource)) throw Error("protected-source-file");
  // A literal exclusion of an ignored directory makes Git add return an error
  // even after staging other files. Keep exact path matching with a character
  // class so ignored protected directories are not treated as explicit inputs.
  const excluded = preservedPaths.flatMap((p) => {
    const first = p[0];
    const pattern =
      "[" +
      (/[A-Za-z]/.test(first) ? first.toLowerCase() + first.toUpperCase() : first) +
      "]" +
      p.slice(1);
    return [":(top,exclude,icase,glob)" + pattern, ":(top,exclude,icase,glob)" + pattern + "/**"];
  });
  for (const folder of [
    "uploads",
    "database",
    "assets-data",
    "node_modules",
    ".runtime",
    "logs",
    "backups",
    ".servix-runtime",
  ]) {
    excluded.push(
      ":(top,exclude,icase,glob)**/" + folder,
      ":(top,exclude,icase,glob)**/" + folder + "/**",
    );
  }
  for (const pattern of [
    "**/.env*",
    "**/*.env",
    "**/*.pem",
    "**/*.key",
    "**/*.pfx",
    "**/*.p12",
    "**/*.jks",
    "**/*.keystore",
  ])
    excluded.push(":(top,exclude,icase,glob)" + pattern);
  await git(["add", "--all", "--", ".", ...excluded]);
  const changed = (await git(["diff", "--cached", "--name-only", "-z"]))
    .split("\0")
    .filter(Boolean);
  if (changed.some(protectedSource)) throw Error("protected-source-file");
  await git([
    "commit",
    "--allow-empty",
    "-m",
    details
      ? "deploy: " + details.message.split(/\r?\n/)[0]
      : "chore: publish development source " + job.requestId,
    ...(details
      ? [
          "-m",
          "Changes:\n" +
            details.message +
            "\n\nDeclared approval: " +
            details.approvedBy +
            "\nRequested by: " +
            job.userId +
            "\nDeployment: " +
            job.requestId,
        ]
      : []),
  ]);
  const head = await git(["rev-parse", "HEAD"]);
  if (!headPattern.test(head)) throw Error("invalid-local-commit");
  // The bundle contains only objects missing from the server-owned base commit.
  const bundle = path.join(config.stateRoot, job.requestId + ".bundle");
  await git(["bundle", "create", bundle, "HEAD", "^" + job.baseHead]);
  const stat = await fs.stat(bundle);
  if (stat.size > 64 * 1024 * 1024) throw Error("connector-bundle-capacity");
  return { head, bundle };
}
async function inspectRepository(config) {
  const git = async (args) =>
    (
      await run(config.git, ["-C", config.repository, ...args], {
        windowsHide: true,
        timeout: 5000,
        maxBuffer: 8192,
      })
    ).stdout.trim();
  const repository = await fs.realpath(config.repository);
  const root = await git(["rev-parse", "--show-toplevel"]);
  if (repositoryPath(root) !== repositoryPath(repository)) throw Error("wrong-local-repository");
  const binding = repositoryBinding(config);
  const central = !!binding;
  const origin = await git(["remote", "get-url", binding?.remoteName || "origin"]);
  if (central && origin !== binding.origin) throw Error("repository-identity-mismatch");
  // Never send Git transport credentials as diagnostic metadata.
  if (origin !== binding?.origin && !/^git@[A-Za-z0-9.-]+:[A-Za-z0-9_./-]+\.git$/.test(origin)) {
    const parsed = new URL(origin);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    )
      throw Error("credentialled-origin-not-diagnostic");
  }
  return {
    version: 1,
    profileId: config.profileId || "servix-development",
    repository,
    origin,
    ...(central ? { repositoryId: binding.id, remoteName: binding.remoteName } : {}),
    head: await git(["rev-parse", "HEAD"]),
    branch: await git(["symbolic-ref", "--short", "HEAD"]),
    checkedAt: new Date().toISOString(),
  };
}
async function chooseRepository(config, selection) {
  if (
    !selection ||
    Object.keys(selection).some(
      (k) => !["version", "requestId", "deviceId", "profileId", "expiresAt", "status"].includes(k),
    ) ||
    selection.version !== 1 ||
    selection.status !== "choosing" ||
    !/^fp_[a-f0-9]{32}$/.test(selection.requestId) ||
    selection.deviceId !== config.deviceId ||
    selection.profileId !== (config.profileId || "servix-development")
  )
    throw Error("invalid-folder-request");
  const pickerProcess = (file, args, input, windowsHide) =>
    new Promise((resolve, reject) => {
      const remaining = Date.parse(selection.expiresAt) - Date.now();
      if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 95000) {
        reject(Error("folder-request-expired"));
        return;
      }
      const child = execFile(
        file,
        args,
        { windowsHide, timeout: remaining, maxBuffer: 8192 },
        (error, stdout) => (error ? reject(Error("folder-picker-unavailable")) : resolve(stdout)),
      );
      child.stdin.on("error", () => reject(Error("folder-picker-unavailable")));
      child.stdin.end(JSON.stringify(input));
    });
  const choice = JSON.parse(
    await pickerProcess(
      path.join(__dirname, "FrevOS.FolderPicker.exe"),
      [],
      {
        version: 1,
        profileId: selection.profileId,
        repository: config.repository,
        expiresAt: selection.expiresAt,
      },
      false,
    ),
  );
  if (
    !choice ||
    Object.keys(choice).some((k) => !["status", "repository"].includes(k)) ||
    !["selected", "cancelled", "failed"].includes(choice.status)
  )
    throw Error("folder-picker-unavailable");
  if (choice.status !== "selected") return { ...selection, status: choice.status };
  if (typeof choice.repository !== "string" || choice.repository.length > 240)
    throw Error("folder-picker-unavailable");
  const result = await pickerProcess(
    path.join(
      process.env.WINDIR || "C:\\Windows",
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe",
    ),
    [
      "-NoProfile",
      "-NonInteractive",
      "-STA",
      "-WindowStyle",
      "Hidden",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      path.join(__dirname, "Choose-Repository.ps1"),
    ],
    { selection, repository: choice.repository },
    true,
  );
  const selected = JSON.parse(result);
  if (
    !selected ||
    Object.keys(selected).some((k) => !["status", "source"].includes(k)) ||
    !["selected", "cancelled", "failed"].includes(selected.status)
  )
    throw Error("folder-picker-unavailable");
  if (selected.status === "selected") {
    const probe = await inspectRepository({ ...config, repository: selected.source?.repository });
    if (
      probe.origin !==
      (repositoryBinding(config) ? repositoryBinding(config).origin : config.repositoryOrigin)
    )
      throw Error("wrong-local-repository");
    config.repository = probe.repository;
    config.repositoryOrigin = probe.origin;
    return { ...selection, status: "selected", source: probe };
  }
  return { ...selection, status: selected.status };
}
async function connector(config) {
  const server = controlPlane(config);
  await fs.mkdir(config.stateRoot, { recursive: true });
  const api = async (pathname, body, headers = {}) => {
    const response = await fetch(new URL(pathname, server), {
      method: "POST",
      headers: {
        authorization: "Bearer " + config.credential,
        "content-type": "application/json",
        ...headers,
      },
      body: Buffer.isBuffer(body) ? body : JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw Error("connector-http-" + response.status);
    return response.json();
  };
  const development = require("./LocalDevelopment.cjs").start(config, inspectRepository, api);
  require("./SystemDiscovery.cjs").start(config, api, () => inspectRepository(config));
  let heartbeatPending = false;
  const heartbeat = async () => {
    if (heartbeatPending) return;
    heartbeatPending = true;
    try {
      let probe;
      try {
        probe = await inspectRepository(config);
      } catch {
        /* Clear any older successful diagnostic on a failed local check. */
      }
      await api("/v1/connector/heartbeat", {
        ...(probe ? { probe } : {}),
        folderPicker: process.platform === "win32",
        changeNotes: true,
      });
    } catch {
      // A disconnected VPN is retried without claiming jobs or interrupting Git.
    } finally {
      heartbeatPending = false;
    }
  };
  await heartbeat();
  setInterval(() => void heartbeat(), 5000);
  for (;;) {
    try {
      const { selection } = await api("/v1/connector/folder/claim", {});
      if (selection) {
        let result;
        try {
          result = development.runtime.hasRunning()
            ? { ...selection, status: "failed" }
            : await chooseRepository(config, selection);
        } catch {
          result = { ...selection, status: "failed" };
        }
        await api("/v1/connector/folder/complete", result);
        await heartbeat();
        continue;
      }
      const { job } = await api("/v1/connector/claim", {});
      if (job) {
        validateJob(config, job);
        const claim = path.join(config.stateRoot, job.requestId + ".claim.json");
        let owned = false;
        let committed = false;
        try {
          const f = await fs.open(claim, "wx", 0o600);
          try {
            await f.writeFile(
              JSON.stringify({
                deviceId: config.deviceId,
                requestId: job.requestId,
                createdAt: new Date().toISOString(),
              }),
            );
            await f.sync();
            owned = true;
          } finally {
            await f.close();
          }
          const result = await publishWorkingTree(config, job, {
            synchronizeBase: (heads) =>
              downloadBaseline(
                config,
                heads,
                path.join(config.stateRoot, job.requestId + ".base.bundle"),
              ),
          });
          await fs.writeFile(claim + ".commit.json", JSON.stringify({ head: result.head }), {
            flag: "wx",
            mode: 0o600,
          });
          committed = true;
          const bytes = await fs.readFile(result.bundle);
          await api("/v1/connector/jobs/" + job.requestId + "/bundle", bytes, {
            "content-type": "application/x-git-bundle",
            "x-frevos-source-head": result.head,
          });
          await fs.writeFile(claim + ".published.json", JSON.stringify({ head: result.head }), {
            flag: "wx",
            mode: 0o600,
          });
        } catch (error) {
          const errorCode = !owned
            ? "local-request-interrupted"
            : committed
              ? "bundle-upload-failed"
              : error.message === "protected-source-file"
                ? "protected-source-file-staged"
                : error.message === "source-behind-or-conflicting"
                  ? "source-behind-or-conflicting"
                  : "local-git-failed";
          await api("/v1/connector/jobs/" + job.requestId + "/fail", { errorCode });
        }
      }
    } catch (error) {
      // Deliberately record only public error classes, never response bodies or credentials.
      await fs.writeFile(
        path.join(config.stateRoot, "status.json"),
        JSON.stringify({
          online: false,
          at: new Date().toISOString(),
          errorCode: /^connector-http-\d+$/.test(error.message)
            ? error.message
            : "connector-unavailable",
        }),
        { mode: 0o600 },
      );
    }
    await delay(5000);
  }
}
module.exports = {
  publishWorkingTree,
  cloneFromBundle,
  inspectRepository,
  chooseRepository,
  validateJob,
  bindCentralCheckout,
};
if (require.main === module) {
  (async () => {
    let input = "";
    for await (const chunk of process.stdin) {
      input += chunk;
      if (input.length > 16384) throw Error("connector-config-capacity");
    }
    const config = JSON.parse(input);
    config.profileId ||= "servix-development";
    if (process.argv[2] === "--bind") {
      await bindCentralCheckout(config);
      return;
    }
    if (process.argv[2] === "--initialize") {
      await fs.mkdir(config.stateRoot, { recursive: true });
      const file = await downloadBaseline(
        config,
        ["0".repeat(40)],
        path.join(config.stateRoot, "initial.bundle"),
      );
      await cloneFromBundle(config, file);
      return;
    }
    await connector(config);
  })().catch(() => {
    process.stderr.write("DevSetu connector could not start. Run Setup again.\n");
    process.exitCode = 1;
  });
}
