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
      (k) =>
        ![
          "version",
          "requestId",
          "deviceId",
          "profileId",
          "expiresAt",
          "status",
          "requestedRepository",
        ].includes(k),
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
  if (selection.requestedRepository && process.platform === "linux") {
    const probe = await inspectRepository({ ...config, repository: selection.requestedRepository });
    if (probe.origin !== (repositoryBinding(config)?.origin ?? config.repositoryOrigin))
      throw Error("folder-wrong-repository");
    const file = config.credentialFile;
    if (!file || path.dirname(file) !== path.dirname(config.stateRoot))
      throw Error("folder-inaccessible");
    for (let cursor = path.dirname(file); ; cursor = path.dirname(cursor)) {
      if ((await fs.lstat(cursor)).isSymbolicLink()) throw Error("folder-inaccessible");
      if (path.dirname(cursor) === cursor) break;
    }
    const info = await fs.lstat(file);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      info.mode & 0o077 ||
      !(info.mode & 0o200) ||
      info.uid !== process.getuid()
    )
      throw Error("folder-inaccessible");
    const bytes = await fs.readFile(file),
      prior = JSON.parse(bytes);
    if (
      prior.deviceId !== config.deviceId ||
      prior.credential !== config.credential ||
      (prior.profileId ?? "servix-development") !== (config.profileId ?? "servix-development")
    )
      throw Error("folder-inaccessible");
    const temporary = file + "." + selection.requestId + ".tmp";
    const stream = await fs.open(temporary, "wx", 0o600);
    try {
      await stream.writeFile(
        JSON.stringify({ ...prior, repository: probe.repository, repositoryOrigin: probe.origin }),
      );
      await stream.sync();
    } finally {
      await stream.close();
    }
    try {
      if (!Buffer.from(await fs.readFile(file)).equals(bytes)) throw Error("folder-inaccessible");
      await fs.rename(temporary, file);
    } finally {
      await fs.unlink(temporary).catch(() => {});
    }
    config.repository = probe.repository;
    config.repositoryOrigin = probe.origin;
    return { ...selection, status: "selected", source: probe };
  }
  const choice = selection.requestedRepository
    ? { status: "selected", repository: selection.requestedRepository }
    : JSON.parse(
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
    Object.keys(selected).some((k) => !["status", "source", "errorCode"].includes(k)) ||
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
  const errorCode = ["folder-not-git", "folder-wrong-repository", "folder-inaccessible"].includes(
    selected.errorCode,
  )
    ? selected.errorCode
    : "folder-selection-unavailable";
  return {
    ...selection,
    status: selected.status,
    ...(selected.status === "failed" ? { errorCode } : {}),
  };
}

async function startDeviceLoginProof(origin, attest) {
  const http = require("node:http");
  const crypto = require("node:crypto"),
    pages = new Map();
  let active = 0;
  const server = http.createServer(async (request, response) => {
    const port = server.address().port;
    const reject = (status) => {
      response.writeHead(status, { "cache-control": "no-store" });
      response.end();
    };
    if (
      request.socket.remoteAddress !== "127.0.0.1" ||
      request.headers.host !== "127.0.0.1:" + port
    )
      return reject(403);
    const localOrigin = "http://127.0.0.1:" + port;
    for (const [key, expiry] of pages) if (expiry <= Date.now()) pages.delete(key);
    if (request.method === "GET" && request.url === "/device-login/start") {
      if (pages.size >= 32) return reject(429);
      const nonce = crypto.randomBytes(24).toString("base64url");
      pages.set(nonce, Date.now() + 120000);
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        // Preserve the form's real Origin while sending no path, fragment or proof.
        "referrer-policy": "origin",
        "set-cookie": `devsetu-proof-page=${nonce}; Path=/device-login; HttpOnly; SameSite=Strict; Max-Age=120`,
        "content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; form-action ${origin}/auth/device-login/receive; frame-ancestors 'none'; base-uri 'none'`,
      });
      response.end(
        `<!doctype html><meta charset="utf-8"><title>DevSetu · Confirm this computer</title><h1>Verify this paired computer</h1><p>Continue only if you just signed in to DevSetu at <strong></strong>.</p><button id="confirm">Confirm sign-in from this computer</button><p id="message" role="status"></p><script nonce="${nonce}">const transaction=location.hash.slice(1),target=${JSON.stringify(origin)},button=document.getElementById('confirm');document.querySelector('strong').textContent=target;history.replaceState(null,'','/device-login/start');button.onclick=async()=>{button.disabled=true;try{if(!/^dl_[a-f0-9]{64}$/.test(transaction))throw Error();const r=await fetch('/device-login/confirm',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-devsetu-page':${JSON.stringify(nonce)}},body:JSON.stringify({version:1,challengeId:transaction})});if(!r.ok)throw Error();const proof=await r.json(),form=document.createElement('form');form.method='POST';form.action=target+'/auth/device-login/receive';for(const key of ['version','challengeId','proof']){const field=document.createElement('input');field.type='hidden';field.name=key;field.value=String(proof[key]);form.append(field)}document.body.append(form);form.submit()}catch{document.getElementById('message').textContent='Verification failed or expired. Return to DevSetu and sign in from your own paired computer.';button.disabled=false}}</script>`,
      );
      return;
    }
    const pageProof = request.url === "/device-login/confirm";
    if (pageProof) {
      const nonce = request.headers["x-devsetu-page"];
      if (
        request.headers.origin !== localOrigin ||
        typeof nonce !== "string" ||
        !pages.has(nonce) ||
        !(request.headers.cookie || "")
          .split(";")
          .some((value) => value.trim() === "devsetu-proof-page=" + nonce)
      )
        return reject(403);
      pages.delete(nonce);
    } else if (request.headers.origin !== origin || request.url !== "/device-login")
      return reject(403);
    const headers = {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "access-control-allow-private-network": "true",
      "cache-control": "no-store",
      vary: "Origin",
      "content-type": "application/json",
    };
    if (request.method === "OPTIONS") {
      response.writeHead(204, headers);
      response.end();
      return;
    }
    if (
      request.method !== "POST" ||
      !request.headers["content-type"]?.startsWith("application/json") ||
      active >= 4
    )
      return reject(403);
    active++;
    try {
      let body = "";
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 2048) throw Error();
      }
      const input = JSON.parse(body);
      if (
        input.version !== 1 ||
        !/^dl_[a-f0-9]{64}$/.test(input.challengeId) ||
        Object.keys(input).sort().join(",") !== "challengeId,version"
      )
        throw Error();
      const proof = await attest(input);
      response.writeHead(200, headers);
      response.end(JSON.stringify(proof));
    } catch {
      response.writeHead(403, headers);
      response.end('{"error":"device-login-proof-denied"}');
    } finally {
      active--;
    }
  });
  server.maxConnections = 8;
  server.requestTimeout = 15000;
  server.headersTimeout = 5000;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  server.unref();
  return {
    port: server.address().port,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
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
  if (config.mode === "system") {
    if (
      config.repository ||
      config.profileId ||
      config.repositoryId ||
      config.centralRepository ||
      !path.isAbsolute(config.monitoringRoot || "")
    )
      throw Error("system-enrollment-scope");
    const gitDesktop = require("./GitDesktop.cjs").start(config, api);
    const loginProof = await startDeviceLoginProof(server.origin, (body) =>
      api("/v1/connector/login-proof", body),
    );
    const collector = require("./SystemDiscovery.cjs").start(config, api);
    const beat = async () => {
      try {
        await api("/v1/connector/heartbeat", { loginProofPort: loginProof.port });
      } catch {
        /* Retry after network loss without project actions. */
      }
    };
    await beat();
    setInterval(() => void beat(), 5000);
    return {
      ...collector,
      stop: async () => {
        gitDesktop.stop();
        await collector.stop();
      },
    };
  }
  require("./GitDesktop.cjs").start(config, api);
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
        folderBrowser: true,
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
            ? { ...selection, status: "failed", errorCode: "folder-source-running" }
            : await chooseRepository(config, selection);
        } catch {
          result = { ...selection, status: "failed", errorCode: "folder-selection-unavailable" };
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
async function completeDeviceLogin(server, response, fetcher = fetch) {
  if (response.status !== 202) return response;
  const origin = new URL(server);
  if (!["https:", "http:"].includes(origin.protocol) || origin.origin !== server)
    throw Error("invalid-login-origin");
  const challenge = await response.json();
  if (
    challenge.status !== "device-verification-required" ||
    !/^dl_[a-f0-9]{64}$/.test(challenge.challengeId) ||
    !Array.isArray(challenge.ports) ||
    !challenge.ports.length ||
    challenge.ports.length > 10 ||
    challenge.ports.some((port) => !Number.isInteger(port) || port < 1024 || port > 65535)
  )
    throw Error("invalid-device-login-challenge");
  const cookie = response.headers
    .getSetCookie()
    .map((item) => item.split(";")[0])
    .join("; ");
  for (const port of challenge.ports) {
    try {
      const local = await fetcher(`http://127.0.0.1:${port}/device-login`, {
        method: "POST",
        redirect: "error",
        headers: { origin: server, "content-type": "application/json" },
        body: JSON.stringify({ version: 1, challengeId: challenge.challengeId }),
        signal: AbortSignal.timeout(4000),
      });
      if (!local.ok) continue;
      const proof = await local.json();
      if (
        Object.keys(proof).sort().join() !== "challengeId,proof,version" ||
        proof.version !== 1 ||
        proof.challengeId !== challenge.challengeId ||
        !/^[a-f0-9]{64}$/.test(proof.proof)
      )
        continue;
      const completed = await fetcher(server + "/auth/device-login/complete", {
        method: "POST",
        redirect: "error",
        headers: { origin: server, cookie, "content-type": "application/json" },
        body: JSON.stringify(proof),
        signal: AbortSignal.timeout(15000),
      });
      if (completed.status === 204) return completed;
    } catch {
      /* Try only another validated loopback port belonging to this user. */
    }
  }
  throw Error("paired-system-required");
}
module.exports = {
  completeDeviceLogin,
  startDeviceLoginProof,
  publishWorkingTree,
  cloneFromBundle,
  inspectRepository,
  chooseRepository,
  validateJob,
  bindCentralCheckout,
  connector,
};
if (require.main === module) {
  (async () => {
    let input = "";
    for await (const chunk of process.stdin) {
      input += chunk;
      if (input.length > 16384) throw Error("connector-config-capacity");
    }
    const config = JSON.parse(input);
    if (config.mode !== "system") config.profileId ||= "servix-development";
    if (config.mode === "system" && process.argv[2]) throw Error("system-enrollment-scope");
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
