// Portable pull worker. Commands and destination roots come from local enrollment,
// never from a browser job. Source builds run as an unprivileged user.
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const os = require("node:os");
const { promisify } = require("node:util");
const { execFile } = require("node:child_process");
const { gzip, gunzip } = require("node:zlib");
const { parsePreservedPaths, isPreserved } = require("./Preservation.cjs");
const execute = promisify(execFile),
  compress = promisify(gzip),
  expand = promisify(gunzip);
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const recipes = ["npm-static", "node-source", "dotnet-publish", "devsetu-native"];
const identifier = /^[a-z][a-z0-9-]{2,63}$/;
const fail = (code) => {
  throw Error(code);
};
function relative(value, dot = false) {
  if (dot && value === ".") return value;
  parsePreservedPaths([value]);
  return value;
}
async function plain(file, allowMissing = false) {
  let cursor = path.resolve(file);
  for (;;) {
    try {
      if ((await fs.lstat(cursor)).isSymbolicLink()) fail("linked-executor-path");
    } catch (error) {
      if (error.code !== "ENOENT" || !allowMissing) throw error;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
}
function beneath(root, name) {
  relative(name);
  const absolute = path.resolve(root, name),
    prefix = path.resolve(root) + path.sep;
  if (!absolute.startsWith(prefix)) fail("component-path-escaped");
  return absolute;
}
async function readBounded(file, limit = 512 * 1024 * 1024) {
  await plain(file);
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size < 1 || stat.size > limit) fail("component-file-capacity");
  return fs.readFile(file);
}
function cleanEnvironment() {
  return Object.fromEntries(
    [
      "SystemRoot",
      "WINDIR",
      "PATH",
      "PATHEXT",
      "TEMP",
      "TMP",
      "USERPROFILE",
      "HOME",
      "LOCALAPPDATA",
      "APPDATA",
    ].flatMap((name) => (process.env[name] === undefined ? [] : [[name, process.env[name]]])),
  );
}
async function command(file, args, cwd, timeout = 20 * 60000) {
  // Captured output belongs to the private job directory; return only public codes.
  try {
    return await execute(file, args, {
      cwd,
      env: cleanEnvironment(),
      windowsHide: true,
      timeout,
      maxBuffer: 1024 * 1024,
    });
  } catch {
    fail("component-build-command-failed");
  }
}
function validateConfig(config) {
  if (
    !config ||
    !/^ex_[a-f0-9]{32}$/.test(config.id) ||
    !config.credential?.startsWith(config.id + ".") ||
    !identifier.test(config.profileId) ||
    !["builder", "destination"].includes(config.role)
  )
    fail("invalid-executor-config");
  const server = new URL(config.server);
  if (
    server.username ||
    server.password ||
    server.search ||
    server.hash ||
    server.pathname !== "/" ||
    !["http:", "https:"].includes(server.protocol) ||
    (server.protocol === "http:" && config.allowInternalHttp !== true)
  )
    fail("invalid-executor-server");
  if (
    !path.isAbsolute(config.stateRoot) ||
    !Array.isArray(config.bindings) ||
    config.bindings.length > 32
  )
    fail("invalid-executor-config");
  const ids = new Set();
  for (const binding of config.bindings) {
    if (
      !identifier.test(binding.id) ||
      ids.has(binding.id) ||
      !path.isAbsolute(binding.root) ||
      path.parse(binding.root).root === path.resolve(binding.root) ||
      !Array.isArray(binding.recipes) ||
      !binding.recipes.length ||
      binding.recipes.some((r) => !recipes.includes(r))
    )
      fail("invalid-executor-binding");
    ids.add(binding.id);
    if (
      os.hostname().toUpperCase() === "DCAPP9" &&
      /^d:\\servix(?:\\|$)/i.test(path.resolve(binding.root))
    )
      fail("production-destination-excluded");
    const health = new URL(binding.healthUrl);
    if (
      health.username ||
      health.password ||
      health.hash ||
      health.search ||
      !["http:", "https:"].includes(health.protocol)
    )
      fail("invalid-health-url");
  }
  for (const a of config.bindings)
    for (const b of config.bindings)
      if (
        a !== b &&
        (path.resolve(a.root) + path.sep)
          .toLowerCase()
          .startsWith((path.resolve(b.root) + path.sep).toLowerCase())
      )
        fail("overlapping-executor-bindings");
  return config;
}
function validateJob(config, job) {
  if (
    !job ||
    !/^cj_[a-f0-9]{32}$/.test(job.id) ||
    !/^pr_[a-f0-9]{32}$/.test(job.runId) ||
    job.executorId !== config.id ||
    job.profileId !== config.profileId ||
    job.status !== "queued" ||
    job.kind !== (config.role === "builder" ? "build" : "deploy") ||
    !/^[a-f0-9]{40}$/.test(job.sourceHead) ||
    !Number.isFinite(Date.parse(job.expiresAt)) ||
    Date.parse(job.expiresAt) <= Date.now() ||
    Date.parse(job.expiresAt) > Date.now() + 61 * 60000
  )
    fail("invalid-component-job");
  if (
    !job.component ||
    !identifier.test(job.component.id) ||
    job.component.id !== job.componentId ||
    !recipes.includes(job.component.recipe)
  )
    fail("invalid-component-job");
  relative(job.component.context, true);
  relative(job.component.output, true);
  parsePreservedPaths(job.component.preservedPaths);
  for (const a of [job.input, ...(job.previousArtifact ? [job.previousArtifact] : [])])
    if (
      !a ||
      !/^[a-f0-9]{64}$/.test(a.digest) ||
      !Number.isSafeInteger(a.bytes) ||
      a.bytes < 1 ||
      a.bytes > 512 * 1024 * 1024
    )
      fail("invalid-component-artifact");
  const binding = config.bindings.find(
    (b) =>
      (job.kind === "build" || b.id === job.component.destinationBinding) &&
      b.recipes.includes(job.component.recipe),
  );
  if (!binding) fail("component-binding-not-enrolled");
  if (
    job.systemName !== os.hostname().toLowerCase() ||
    !job.binding ||
    binding.root !== job.binding.root ||
    binding.id !== job.binding.id ||
    binding.healthUrl !== job.binding.healthUrl ||
    JSON.stringify(binding.recipes) !== JSON.stringify(job.binding.recipes)
  )
    fail("component-enrollment-snapshot-changed");
  return binding;
}
async function collect(root, preservedPaths = []) {
  const files = [],
    stack = [{ root, prefix: "" }];
  let size = 0;
  while (stack.length) {
    const item = stack.pop();
    await plain(item.root);
    for (const entry of await fs.readdir(item.root, { withFileTypes: true })) {
      const name = item.prefix + entry.name;
      relative(name);
      if (entry.isSymbolicLink()) fail("linked-component-content");
      if (name === ".git" || name.startsWith(".git/") || isPreserved(name, preservedPaths))
        continue;
      const file = path.join(item.root, entry.name);
      if (entry.isDirectory()) stack.push({ root: file, prefix: name + "/" });
      else if (entry.isFile()) {
        const bytes = await readBounded(file, 64 * 1024 * 1024);
        size += bytes.length;
        if (size > 256 * 1024 * 1024 || files.length >= 15000) fail("component-expanded-capacity");
        files.push({ path: name, sha256: sha(bytes), data: bytes.toString("base64") });
      } else fail("unsupported-component-file");
    }
  }
  if (!files.length) fail("empty-component-artifact");
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
async function unpack(bytes, preservedPaths) {
  const artifact = JSON.parse(await expand(bytes, { maxOutputLength: 380 * 1024 * 1024 }));
  if (
    artifact.version !== 1 ||
    Object.keys(artifact).sort().join(",") !== "files,version" ||
    !Array.isArray(artifact.files) ||
    artifact.files.length < 1 ||
    artifact.files.length > 15000
  )
    fail("invalid-component-archive");
  const names = new Set();
  let size = 0;
  for (const file of artifact.files) {
    relative(file.path);
    if (
      Object.keys(file).sort().join(",") !== "data,path,sha256" ||
      names.has(file.path.toLowerCase()) ||
      isPreserved(file.path, preservedPaths) ||
      file.path.toLowerCase() === ".runtime" ||
      file.path.toLowerCase().startsWith(".runtime/") ||
      file.path === ".git" ||
      file.path.startsWith(".git/")
    )
      fail("unsafe-component-archive");
    names.add(file.path.toLowerCase());
    if (
      typeof file.data !== "string" ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.data)
    )
      fail("invalid-component-file");
    const content = Buffer.from(file.data, "base64");
    size += content.length;
    if (sha(content) !== file.sha256 || size > 256 * 1024 * 1024)
      fail("component-archive-integrity");
    file.bytes = content;
  }
  for (const file of artifact.files) {
    const segments = file.path.toLowerCase().split("/");
    segments.pop();
    while (segments.length) {
      if (names.has(segments.join("/"))) fail("component-file-directory-collision");
      segments.pop();
    }
  }
  return artifact.files;
}
async function plugin(config, binding) {
  const adapter = binding.nativeAdapter;
  if (
    !adapter ||
    !path.isAbsolute(adapter.file) ||
    !/^[a-f0-9]{64}$/.test(adapter.sha256) ||
    sha(await readBounded(adapter.file, 1024 * 1024)) !== adapter.sha256
  )
    fail("native-adapter-not-enrolled");
  // This file is installed and pinned by the local operator, outside customer Git.
  return require(adapter.file);
}
async function build(config, job, binding, input, directory) {
  await plain(binding.root);
  directory = path.join(binding.root, job.id);
  await fs.mkdir(directory);
  if (job.component.recipe === "devsetu-native")
    return (await plugin(config, binding)).build({ config, job, binding, input, directory });
  const bundle = path.join(directory, "source.bundle");
  await fs.writeFile(bundle, input, { flag: "wx" });
  const source = path.join(directory, "source");
  await command(config.git, ["clone", "--no-checkout", "--", bundle, source], directory);
  await command(
    config.git,
    ["-C", source, "-c", "core.hooksPath=/dev/null", "checkout", "--detach", job.sourceHead],
    directory,
  );
  const context = job.component.context === "." ? source : beneath(source, job.component.context);
  await plain(context);
  let output;
  if (job.component.recipe === "npm-static") {
    if (!path.isAbsolute(config.npmCli)) fail("npm-toolchain-not-enrolled");
    await command(
      process.execPath,
      [config.npmCli, "ci", "--ignore-scripts", "--no-audit", "--no-fund"],
      context,
    );
    await command(process.execPath, [config.npmCli, "run", "build"], context);
    output = job.component.output === "." ? context : beneath(context, job.component.output);
  } else if (job.component.recipe === "dotnet-publish") {
    if (!config.dotnet) fail("dotnet-toolchain-not-enrolled");
    output = path.join(directory, "publish");
    await command(
      config.dotnet,
      ["publish", "--configuration", "Release", "--output", output],
      context,
    );
  } else output = job.component.output === "." ? context : beneath(context, job.component.output);
  const files = await collect(output, job.component.preservedPaths);
  const artifact = path.join(directory, "component.gz");
  await fs.writeFile(artifact, await compress(JSON.stringify({ version: 1, files })), {
    flag: "wx",
  });
  return artifact;
}
async function task(config, binding, operation) {
  if (!binding.runtime || binding.runtime.kind === "none") return;
  if (binding.runtime.kind !== "windows-task" || process.platform !== "win32")
    fail("unsupported-runtime-binding");
  const input = {
    taskName: binding.runtime.taskName,
    actionSha256: binding.runtime.actionSha256,
    root: binding.root,
    operation,
  };
  await new Promise((resolve, reject) => {
    const child = execFile(
      path.join(process.env.WINDIR, "System32/WindowsPowerShell/v1.0/powershell.exe"),
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "RemoteSigned",
        "-File",
        path.join(__dirname, "ComponentRuntime.ps1"),
      ],
      { windowsHide: true, timeout: 30000, maxBuffer: 4096 },
      (error) => (error ? reject(Error("component-runtime-failed")) : resolve()),
    );
    child.stdin.on("error", () => reject(Error("component-runtime-failed")));
    child.stdin.end(JSON.stringify(input));
  });
}
async function health(binding) {
  for (let i = 0; i < 30; i++) {
    try {
      const response = await fetch(binding.healthUrl, {
        redirect: "error",
        signal: AbortSignal.timeout(3000),
      });
      await response.body?.cancel();
      if (response.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  fail("component-health-failed");
}
async function activateUnlocked(config, job, binding, bytes, previousBytes, directory) {
  if (job.component.recipe === "devsetu-native")
    return (await plugin(config, binding)).activate({ config, job, binding, bytes, directory });
  const preserved = parsePreservedPaths(job.component.preservedPaths);
  const files = await unpack(bytes, preserved),
    oldFiles = previousBytes ? await unpack(previousBytes, preserved) : [];
  const root = path.resolve(binding.root);
  await plain(root);
  await fs.mkdir(root, { recursive: true });
  const state = path.join(config.stateRoot, "destinations", binding.id);
  await fs.mkdir(state, { recursive: true });
  await plain(state);
  const currentFile = path.join(state, "current.json");
  let current;
  try {
    current = JSON.parse(await fs.readFile(currentFile, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  if ((current?.digest ?? null) !== (job.previousArtifact?.digest ?? null))
    fail("component-current-release-conflict");
  if (current && JSON.stringify(current.paths) !== JSON.stringify(oldFiles.map((f) => f.path)))
    fail("component-owned-manifest-conflict");
  const replacements = new Map(files.map((f) => [f.path.toLowerCase(), f]));
  const affected = [...new Set([...files.map((f) => f.path), ...oldFiles.map((f) => f.path)])];
  const backups = [];
  for (const name of affected) {
    const target = beneath(root, name);
    await plain(target, true);
    let content;
    try {
      content = await readBounded(target, 64 * 1024 * 1024);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    const old = oldFiles.find((f) => f.path.toLowerCase() === name.toLowerCase());
    if (old && (!content || sha(content) !== old.sha256)) fail("component-code-drift");
    backups.push({ path: name, data: content?.toString("base64") ?? null });
  }
  await fs.writeFile(path.join(directory, "before.json"), JSON.stringify(backups), {
    flag: "wx",
    mode: 0o600,
  });
  await task(config, binding, "stop");
  try {
    for (const item of backups) {
      const target = beneath(root, item.path),
        replacement = replacements.get(item.path.toLowerCase());
      await plain(target, true);
      if (replacement) {
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, replacement.bytes);
      } else if (item.data !== null) await fs.unlink(target);
    }
    await task(config, binding, "start");
    await health(binding);
    const temporary = currentFile + "." + job.id + ".tmp";
    await fs.writeFile(
      temporary,
      JSON.stringify({ digest: job.input.digest, paths: files.map((f) => f.path), jobId: job.id }),
      { flag: "wx", mode: 0o600 },
    );
    await fs.rename(temporary, currentFile);
  } catch {
    try {
      await task(config, binding, "stop");
      for (const item of backups) {
        const target = beneath(root, item.path);
        await plain(target, true);
        if (item.data === null) {
          try {
            await fs.unlink(target);
          } catch (e) {
            if (e.code !== "ENOENT") throw e;
          }
        } else await fs.writeFile(target, Buffer.from(item.data, "base64"));
      }
      await task(config, binding, "start");
      if (current) await health(binding);
    } catch {
      fail("component-recovery-required");
    }
    fail("component-activation-failed-recovered");
  }
}
async function activate(config, job, binding, bytes, previousBytes, directory) {
  await plain(binding.root);
  const locks = path.join(binding.root, ".runtime");
  await fs.mkdir(locks, { recursive: true });
  await plain(locks);
  const file = path.join(locks, "devsetu-component.lock"),
    token = JSON.stringify({ jobId: job.id, digest: job.input.digest });
  let lock;
  try {
    lock = await fs.open(file, "wx", 0o600);
  } catch {
    fail("component-target-locked-recovery-required");
  }
  let retainLock = false;
  try {
    await lock.writeFile(token);
    await lock.sync();
    await activateUnlocked(config, job, binding, bytes, previousBytes, directory);
  } catch (error) {
    retainLock = error.message.includes("recovery-required");
    throw error;
  } finally {
    await lock.close();
    if ((await fs.readFile(file, "utf8")) === token) {
      if (!retainLock) await fs.unlink(file);
    } else fail("component-lock-ownership-lost");
  }
}
async function worker(config) {
  validateConfig(config);
  await fs.mkdir(config.stateRoot, { recursive: true });
  await plain(config.stateRoot);
  const server = new URL(config.server);
  const api = async (route, body, method = "POST") => {
    const response = await fetch(new URL(route, server), {
      method,
      headers: {
        authorization: "Bearer " + config.credential,
        ...(body === undefined
          ? {}
          : {
              "content-type": Buffer.isBuffer(body)
                ? "application/octet-stream"
                : "application/json",
            }),
      },
      ...(body === undefined ? {} : { body: Buffer.isBuffer(body) ? body : JSON.stringify(body) }),
      redirect: "error",
      signal: AbortSignal.timeout(180000),
    });
    if (!response.ok) fail("executor-http-" + response.status);
    return response;
  };
  const heartbeat = async () => {
    await api("/v1/executor/heartbeat", {
      systemName: os.hostname(),
      bindings: config.bindings.map(({ id, root, healthUrl, recipes }) => ({
        id,
        root,
        healthUrl,
        recipes,
      })),
    });
  };
  let beatPending = false;
  const beat = async () => {
    if (beatPending) return;
    beatPending = true;
    try {
      await heartbeat();
    } catch {
    } finally {
      beatPending = false;
    }
  };
  const heartbeatTimer = setInterval(() => void beat(), 5000);
  heartbeatTimer.unref();
  await beat();
  const complete = (job, result) => api(`/v1/executor/jobs/${job.id}/complete`, result);
  // Finish acknowledgements from retained receipts. A claimed mutation without a
  // receipt is explicitly uncertain, never re-executed after a worker restart.
  for (const name of (await fs.readdir(config.stateRoot)).filter((n) =>
    /^cj_[a-f0-9]{32}$/.test(n),
  )) {
    const directory = path.join(config.stateRoot, name);
    await plain(directory);
    const job = JSON.parse(await fs.readFile(path.join(directory, "claim.json"), "utf8"));
    let receipt;
    try {
      receipt = JSON.parse(await fs.readFile(path.join(directory, "receipt.json"), "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      receipt = {
        status: "recovery-required",
        artifactDigest: job.input.digest,
        errorCode: "component-worker-interrupted",
      };
    }
    try {
      await complete(job, receipt);
    } catch {}
  }
  for (;;) {
    try {
      const { job } = await (await api("/v1/executor/claim", {})).json();
      if (job) {
        const binding = validateJob(config, job),
          directory = path.join(config.stateRoot, job.id);
        await fs.mkdir(directory);
        await fs.writeFile(path.join(directory, "claim.json"), JSON.stringify(job), {
          flag: "wx",
          mode: 0o600,
        });
        let receipt = {
          status: "failed",
          artifactDigest: job.input.digest,
          errorCode: "component-execution-failed",
        };
        try {
          const readArtifact = async (previous = false) => {
            const expected = previous ? job.previousArtifact : job.input;
            const response = await api(
              `/v1/executor/jobs/${job.id}/${previous ? "previous-artifact" : "artifact"}`,
              undefined,
              "GET",
            );
            const chunks = [];
            let length = 0;
            for await (const chunk of response.body) {
              length += chunk.length;
              if (length > expected.bytes) fail("component-download-capacity");
              chunks.push(chunk);
            }
            const bytes = Buffer.concat(chunks);
            if (bytes.length !== expected.bytes || sha(bytes) !== expected.digest)
              fail("component-download-integrity");
            return bytes;
          };
          const input = await readArtifact();
          if (job.kind === "build") {
            const artifact = await build(config, job, binding, input, directory),
              bytes = await readBounded(artifact);
            const saved = await (await api(`/v1/executor/jobs/${job.id}/artifact`, bytes)).json();
            if (saved.digest !== sha(bytes)) fail("component-upload-integrity");
            receipt = { status: "succeeded", artifactDigest: saved.digest };
          } else {
            await activate(
              config,
              job,
              binding,
              input,
              job.previousArtifact ? await readArtifact(true) : undefined,
              directory,
            );
            receipt = { status: "succeeded", artifactDigest: job.input.digest };
          }
        } catch (error) {
          receipt.errorCode = /^[a-z][a-z0-9-]{0,79}$/.test(error.message)
            ? error.message
            : "component-execution-failed";
          if (receipt.errorCode.includes("recovery-required")) receipt.status = "recovery-required";
        }
        await fs.writeFile(path.join(directory, "receipt.json"), JSON.stringify(receipt), {
          flag: "wx",
          mode: 0o600,
        });
        await complete(job, receipt);
      }
    } catch {}
    // Retained receipt delivery is retried without ever rerunning a mutation.
    for (const name of (await fs.readdir(config.stateRoot)).filter((n) =>
      /^cj_[a-f0-9]{32}$/.test(n),
    )) {
      try {
        const directory = path.join(config.stateRoot, name);
        await plain(directory);
        const receipt = JSON.parse(await fs.readFile(path.join(directory, "receipt.json"), "utf8"));
        await complete({ id: name }, receipt);
      } catch {}
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}
module.exports = { validateConfig, validateJob, collect, unpack, build, activate, worker, sha };
if (require.main === module)
  (async () => {
    let input = "";
    for await (const chunk of process.stdin) {
      input += chunk;
      if (input.length > 65536) fail("executor-config-capacity");
    }
    if (process.argv[2] === "--validate") {
      validateConfig(JSON.parse(input));
      return;
    }
    await worker(JSON.parse(input));
  })().catch(() => {
    process.stderr.write("DevSetu System executor could not start. Check its local enrollment.\n");
    process.exitCode = 1;
  });
