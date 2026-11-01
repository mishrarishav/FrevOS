// Operator-enrolled bridge to the existing sealed native release mechanism.
const fs = require("node:fs/promises"),
  path = require("node:path"),
  { execFile } = require("node:child_process"),
  { createHash } = require("node:crypto"),
  { constants } = require("node:fs"),
  { promisify } = require("node:util");
const run = promisify(execFile);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function plain(file) {
  let current = path.resolve(file);
  for (;;) {
    if ((await fs.lstat(current)).isSymbolicLink()) throw Error("native-artifact-path-linked");
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}
function descriptor(bytes, head) {
  if (bytes.length > 4096) throw Error("native-artifact-reference-invalid");
  const value = JSON.parse(bytes);
  if (
    Object.keys(value).sort().join(",") !==
      "archiveBytes,archiveSha256,kind,manifestSha256,sourceHead,version" ||
    value.version !== 1 ||
    value.kind !== "devsetu-native-artifact" ||
    value.sourceHead !== head ||
    !Number.isSafeInteger(value.archiveBytes) ||
    value.archiveBytes < 1 ||
    value.archiveBytes > 160000000 ||
    ![value.archiveSha256, value.manifestSha256].every(
      (v) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v),
    )
  )
    throw Error("native-artifact-reference-invalid");
  return value;
}
function operationFailure(error, phase) {
  const output = [error.stdout, error.stderr]
    .map((value) => (typeof value === "string" ? value.slice(-1024 * 1024) : ""))
    .join("\n");
  return {
    version: 1,
    phase,
    exitCode: Number.isInteger(error.code) ? error.code : null,
    killed: error.killed === true,
    outputBytes: Buffer.byteLength(output),
    classifications: [
      "AssertionError",
      "TypeError",
      "TimeoutError",
      "ENOENT",
      "ENOTEMPTY",
      "ERR_CHILD_PROCESS_STDIO_MAXBUFFER",
      "JavaScript heap out of memory",
    ].filter((name) => output.includes(name) || error.code === name),
    locations: [
      ...new Set(
        output.match(
          /(?:test|src)\/[a-zA-Z0-9_./-]+\.(?:test\.)?[cm]?[jt]sx?(?::\d{1,6}:\d{1,6}|\(\d{1,6},\d{1,6}\))/g,
        ) || [],
      ),
    ].slice(0, 30),
  };
}
function buildEnvironment() {
  const env = Object.fromEntries(
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
    ].flatMap((k) => (process.env[k] === undefined ? [] : [[k, process.env[k]]])),
  );
  // The native operator invokes Windows PowerShell 5.1. A parent PowerShell 7
  // module path is incompatible with its ACL/security modules.
  if (process.platform === "win32")
    env.PSModulePath = path.join(process.env.WINDIR, "System32/WindowsPowerShell/v1.0/Modules");
  return env;
}
async function processFile(file, args, cwd, timeout = 30 * 60000) {
  const env = buildEnvironment();
  try {
    return await run(file, args, { cwd, env, windowsHide: true, timeout, maxBuffer: 1024 * 1024 });
  } catch (error) {
    // Never persist command lines, error messages or raw child output: builds
    // may emit private values. Retain only fixed codes and source locations.
    const phase = args.includes("ci")
      ? "ci"
      : args.includes("install")
        ? "install"
        : args.includes("clone") || args.includes("checkout")
          ? "git"
          : args.some((arg) => arg.endsWith("New-ServixDashboardRelease.ps1"))
            ? "package"
            : "verify";
    try {
      const folder = path.join(cwd, ".local");
      await plain(cwd);
      await fs.mkdir(folder, { recursive: true });
      await plain(folder);
      await fs.writeFile(
        path.join(folder, "native-operation-failure.json"),
        JSON.stringify(operationFailure(error, phase)),
        { flag: "wx", mode: 0o600 },
      );
    } catch {
      /* Diagnostic failure must not replace the original failure. */
    }
    throw Error("native-platform-operation-failed");
  }
}
const powershell = () =>
  path.join(process.env.WINDIR, "System32/WindowsPowerShell/v1.0/powershell.exe");
module.exports = {
  descriptor,
  operationFailure,
  buildEnvironment,
  async build({ config, job, binding, input, directory }) {
    const options = binding.nativeOptions;
    if (
      !options ||
      !path.isAbsolute(options.baselineRoot) ||
      !path.isAbsolute(options.pnpmCli) ||
      !path.isAbsolute(options.artifactStore)
    )
      throw Error("native-build-toolchain-not-enrolled");
    if (options.releaseOutputRoot) {
      if (
        !path.isAbsolute(options.releaseOutputRoot) ||
        path.parse(options.releaseOutputRoot).root === path.resolve(options.releaseOutputRoot)
      )
        throw Error("native-release-output-not-enrolled");
      await plain(options.releaseOutputRoot);
    }
    const state = JSON.parse(
      await fs.readFile(path.join(options.baselineRoot, "state/active.json"), "utf8"),
    );
    if (!/^[a-f0-9]{64}$/.test(state.manifestSha256)) throw Error("native-current-release-invalid");
    const previous = path.join(directory, "baseline");
    let upstream = path.join(options.baselineRoot, "releases", state.manifestSha256);
    if (options.baselineCache) {
      if (!path.isAbsolute(options.baselineCache))
        throw Error("native-baseline-cache-not-enrolled");
      await plain(options.baselineCache);
      const cached = path.join(options.baselineCache, state.manifestSha256);
      try {
        await fs.lstat(cached);
        upstream = cached;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    const verifier = path.join(__dirname, "Verify-HttpManifest.mjs");
    await processFile(process.execPath, [verifier, upstream, state.manifestSha256], directory);
    // Import the pinned baseline as data. Execute operator scripts only from
    // the verified local copy, and retain an interrupted copy for inspection.
    await fs.cp(upstream, previous, { recursive: true, force: false, errorOnExist: true });
    await processFile(process.execPath, [verifier, previous, state.manifestSha256], directory);
    const source = path.join(directory, "source"),
      bundle = path.join(directory, "source.bundle");
    await fs.writeFile(bundle, input, { flag: "wx" });
    await processFile(config.git, ["clone", "--no-checkout", "--", bundle, source], directory);
    await processFile(
      config.git,
      ["-C", source, "-c", "core.hooksPath=/dev/null", "checkout", "--detach", job.sourceHead],
      directory,
    );
    await processFile(
      process.execPath,
      [options.pnpmCli, "install", "--frozen-lockfile", "--ignore-scripts"],
      source,
    );
    await processFile(process.execPath, [options.pnpmCli, "run", "ci"], source);
    let androidArtifactReference;
    const androidSource = path.join(source, "apps/android-connector");
    if (
      await fs.stat(androidSource).catch((error) => {
        if (error.code !== "ENOENT") throw error;
        return null;
      })
    ) {
      const client = path.join(__dirname, "AndroidBuildClient.cjs");
      if (
        !path.isAbsolute(options.androidBuilderReference ?? "") ||
        !/^[a-f0-9]{64}$/.test(options.androidBuilderClientSha256 ?? "")
      )
        throw Error("android-builder-not-enrolled");
      await plain(client);
      await plain(options.androidBuilderReference);
      if (sha(await fs.readFile(client)) !== options.androidBuilderClientSha256)
        throw Error("android-builder-client-integrity");
      const built = await require(client).submit({
        reference: options.androidBuilderReference,
        sourceRoot: source,
        sourceHead: job.sourceHead,
        correlationId: job.id,
        outputRoot: path.join(directory, "android-artifact"),
      });
      androidArtifactReference = built.artifactReference;
    }
    // The builder is enrolled from the installed worker package, not selected by
    // customer source or request input. Source is an isolated pinned checkout.
    await processFile(
      powershell(),
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "RemoteSigned",
        "-File",
        path.join(__dirname, "New-ServixDashboardRelease.ps1"),
        "-PreviousPackageRoot",
        previous,
        "-SourceRoot",
        source,
        ...(options.releaseOutputRoot ? ["-ReleaseOutputRoot", options.releaseOutputRoot] : []),
        ...(androidArtifactReference
          ? [
              "-AndroidArtifactReference",
              androidArtifactReference,
              "-AndroidBuilderReference",
              options.androidBuilderReference,
            ]
          : []),
      ],
      source,
    );
    const receipt = JSON.parse(
      await fs.readFile(path.join(source, ".local/servix-release.json"), "utf8"),
    );
    const outputRoot = path.resolve(options.releaseOutputRoot || source) + path.sep;
    if (
      ![receipt.archive, receipt.package].every((file) => path.resolve(file).startsWith(outputRoot))
    )
      throw Error("native-build-output-escaped");
    const archive = await fs.readFile(receipt.archive),
      archiveSha256 = sha(archive);
    const reference = {
      version: 1,
      kind: "devsetu-native-artifact",
      sourceHead: job.sourceHead,
      archiveSha256,
      archiveBytes: archive.length,
      manifestSha256: receipt.manifestSha256,
    };
    descriptor(Buffer.from(JSON.stringify(reference)), job.sourceHead);
    if (archiveSha256 !== receipt.archiveSha256) throw Error("native-build-output-changed");
    if (options.baselineCache) {
      const cached = path.join(options.baselineCache, reference.manifestSha256);
      try {
        await fs.cp(receipt.package, cached, { recursive: true, force: false, errorOnExist: true });
      } catch (error) {
        if (error.code !== "ERR_FS_CP_EEXIST" && error.code !== "EEXIST") throw error;
      }
      await processFile(process.execPath, [verifier, cached, reference.manifestSha256], directory);
    }
    await plain(options.artifactStore);
    const stored = path.join(options.artifactStore, archiveSha256 + ".zip");
    try {
      await fs.copyFile(receipt.archive, stored, constants.COPYFILE_EXCL);
    } catch (error) {
      if (error.code !== "EEXIST") throw Error("native-artifact-publication-failed");
    }
    await plain(stored);
    if (sha(await fs.readFile(stored)) !== archiveSha256)
      throw Error("native-artifact-store-corrupt");
    const output = path.join(directory, "native-artifact.json");
    await fs.writeFile(output, JSON.stringify(reference), { flag: "wx", mode: 0o600 });
    return output;
  },
  async activate({ job, binding, bytes, directory }) {
    if (
      !binding.nativeOptions?.installationRoot ||
      path.resolve(binding.nativeOptions.installationRoot) !== path.resolve(binding.root)
    )
      throw Error("native-destination-not-enrolled");
    const archive = path.join(directory, "platform.zip");
    const reference = descriptor(bytes, job.sourceHead),
      store = binding.nativeOptions.artifactStore;
    if (!path.isAbsolute(store)) throw Error("native-artifact-store-not-enrolled");
    const saved = path.join(store, reference.archiveSha256 + ".zip");
    await plain(saved);
    const stat = await fs.stat(saved);
    if (!stat.isFile() || stat.size !== reference.archiveBytes)
      throw Error("native-artifact-store-corrupt");
    const payload = await fs.readFile(saved);
    if (sha(payload) !== reference.archiveSha256) throw Error("native-artifact-store-corrupt");
    await fs.writeFile(archive, payload, { flag: "wx" });
    await processFile(
      powershell(),
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "RemoteSigned",
        "-File",
        path.join(__dirname, "Verify-AndroidCompatibility.ps1"),
        "-InstallationRoot",
        binding.root,
        "-Archive",
        archive,
        "-ArchiveSha256",
        reference.archiveSha256,
        "-SourceHead",
        job.sourceHead,
      ],
      directory,
    );
    const request = {
      archive,
      archiveSha256: reference.archiveSha256,
      manifestSha256: reference.manifestSha256,
      installationRoot: binding.root,
      jobId: job.id,
      runId: job.runId,
      requestedBy: job.requestedBy,
      sourceHead: job.sourceHead,
      changeDetails: job.changeDetails,
      operation: job.operation,
    };
    await new Promise((resolve, reject) => {
      const child = execFile(
        powershell(),
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "RemoteSigned",
          "-File",
          path.join(__dirname, "ComponentPlatform.ps1"),
        ],
        { windowsHide: true, timeout: 10 * 60000, maxBuffer: 4096 },
        (error) => (error ? reject(Error("component-recovery-required")) : resolve()),
      );
      child.stdin.on("error", () => reject(Error("component-recovery-required")));
      child.stdin.end(JSON.stringify(request));
    });
  },
};
