// Enrolled, bounded Android compiler. This module never runs a repository build script.
const fs = require("node:fs/promises"),
  raw = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  { spawn } = require("node:child_process");
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const sourcePaths = [
  "AndroidManifest.xml",
  ...[
    "ServerOrigin",
    "PrivateState",
    "ConnectorApi",
    "MainActivity",
    "MonitorService",
    "LoginProofServer",
  ].map((name) => `src/org/devsetu/connector/${name}.java`),
];
async function plain(file) {
  let current = path.resolve(file);
  // The installer verifies ancestors before enrolling this private root. The
  // restricted service must not gain read access to the control-plane parent.
  const installedRoot = path.resolve(__dirname, "..");
  const boundary =
    current === installedRoot || current.startsWith(installedRoot + path.sep)
      ? installedRoot
      : undefined;
  for (;;) {
    const info = await fs.lstat(current);
    if (info.isSymbolicLink()) throw Error("android-path-linked");
    if (current === boundary) break;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}
function child(root, relative) {
  const target = path.resolve(root, relative);
  if (!target.startsWith(path.resolve(root) + path.sep)) throw Error("android-path-scope-denied");
  return target;
}
async function hashFile(file) {
  const hash = crypto.createHash("sha256");
  for await (const bytes of raw.createReadStream(file)) hash.update(bytes);
  return hash.digest("hex");
}
async function command(file, args, cwd, secretInput) {
  await plain(file);
  return new Promise((resolve, reject) => {
    const env = Object.fromEntries(
      ["SystemRoot", "WINDIR", "TEMP", "TMP", "PATH"].flatMap((key) =>
        process.env[key] ? [[key, process.env[key]]] : [],
      ),
    );
    const processChild = spawn(file, args, {
      cwd,
      env,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "",
      bytes = 0;
    const timer = setTimeout(() => processChild.kill(), 120000);
    processChild.on("error", () => {
      clearTimeout(timer);
      reject(Error("android-tool-start-failed"));
    });
    processChild.stdout.on("data", (data) => {
      bytes += data.length;
      if (bytes > 1000000) processChild.kill();
      else output += data;
    });
    processChild.stderr.on("data", (data) => {
      bytes += data.length;
      if (bytes > 1000000) processChild.kill();
      else output += data;
    });
    processChild.stdin.on("error", () => {});
    processChild.stdin.end(secretInput ?? "");
    processChild.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(output);
      else {
        const failure = Error("android-tool-failed");
        failure.toolFailure = {
          tool: path.basename(file),
          exitCode: code,
          outputBytes: bytes,
          locations: [...new Set(output.match(/[A-Za-z0-9_-]+\.java:[0-9]+/g) ?? [])].slice(0, 12),
          exceptions: [
            ...new Set(
              output.match(/\b(?:java|javax|com\.sun)[A-Za-z0-9_.]*(?:Exception|Error)\b/g) ?? [],
            ),
          ].slice(0, 8),
          diagnostics: [
            ...new Set(output.match(/\bcompiler\.(?:err|warn|misc)\.[a-z0-9_.]+\b/g) ?? []),
          ].slice(0, 12),
        };
        reject(failure);
      }
    });
  });
}
function validateRequest(value, config, now = Date.now()) {
  if (
    !value ||
    Object.keys(value).sort().join() !==
      "correlationId,expiresAt,id,operation,profileId,repositoryId,sourceHead,sourceState,sources,version,workspaceId" ||
    value.version !== 1 ||
    !/^ab_[a-f0-9]{32}$/.test(value.id) ||
    value.operation !== "build-android-apk" ||
    !/^cj_[a-f0-9]{32}$/.test(value.correlationId) ||
    value.workspaceId !== config.workspaceId ||
    value.profileId !== config.profileId ||
    value.repositoryId !== config.repositoryId ||
    !/^[a-f0-9]{40}$/.test(value.sourceHead) ||
    !["committed", "local-uncommitted"].includes(value.sourceState) ||
    !Number.isFinite(Date.parse(value.expiresAt)) ||
    Date.parse(value.expiresAt) <= now ||
    Date.parse(value.expiresAt) > now + 900000 ||
    !Array.isArray(value.sources) ||
    value.sources.length !== sourcePaths.length
  )
    throw Error("android-build-scope-denied");
  let total = 0;
  const names = new Set();
  for (const file of value.sources) {
    if (
      !file ||
      Object.keys(file).sort().join() !== "data,path,sha256" ||
      !sourcePaths.includes(file.path) ||
      names.has(file.path) ||
      typeof file.data !== "string" ||
      file.data.length > 700000 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(file.data) ||
      !/^[a-f0-9]{64}$/.test(file.sha256)
    )
      throw Error("android-source-invalid");
    names.add(file.path);
    const bytes = Buffer.from(file.data, "base64");
    total += bytes.length;
    if (sha(bytes) !== file.sha256 || bytes.length > 500000 || total > 1000000 || bytes.includes(0))
      throw Error("android-source-integrity");
  }
  const manifest = Buffer.from(
    value.sources.find((file) => file.path === "AndroidManifest.xml").data,
    "base64",
  ).toString("utf8");
  const allowed = new Set([
    "android.permission.INTERNET",
    "android.permission.FOREGROUND_SERVICE",
    "android.permission.FOREGROUND_SERVICE_SPECIAL_USE",
    "android.permission.POST_NOTIFICATIONS",
  ]);
  if (
    !manifest.includes('package="org.devsetu.connector"') ||
    /<!DOCTYPE|<!ENTITY|<instrumentation|android:debuggable="true"/.test(manifest) ||
    [...manifest.matchAll(/<uses-permission\b[^>]*android:name="([^"]+)"/g)].some(
      (match) => !allowed.has(match[1]),
    )
  )
    throw Error("android-manifest-scope-denied");
  return value;
}
async function verifyTools(config) {
  await plain(config.root);
  const requiredTools = [
    "java",
    "javac",
    "jar",
    "android",
    "lambda",
    "d8",
    "aapt2",
    "zipalign",
    "apksigner",
    "adb",
  ];
  if (
    !Array.isArray(config.tools) ||
    config.tools.length !== requiredTools.length ||
    new Set(config.tools.map((entry) => entry.id)).size !== requiredTools.length ||
    config.tools.some((entry) => !requiredTools.includes(entry.id))
  )
    throw Error("android-toolchain-not-enrolled");
  for (const tool of config.tools) {
    const file = child(config.root, tool.path);
    await plain(file);
    if (!/^[a-f0-9]{64}$/.test(tool.sha256) || (await hashFile(file)) !== tool.sha256)
      throw Error("android-toolchain-integrity");
  }
}
async function compile(config, request, directory) {
  validateRequest(request, config);
  await verifyTools(config);
  const source = child(directory, "source"),
    classes = child(directory, "classes"),
    dex = child(directory, "dex");
  for (const folder of [source, classes, dex]) await fs.mkdir(folder);
  for (const file of request.sources) {
    const target = child(source, file.path);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, Buffer.from(file.data, "base64"), { flag: "wx" });
  }
  const tool = (id) => child(config.root, config.tools.find((entry) => entry.id === id).path);
  const jar = path.join(directory, "classes.jar"),
    base = path.join(directory, "base.apk"),
    aligned = path.join(directory, "aligned.apk"),
    apk = path.join(directory, "DevSetu-Android.apk");
  await command(
    tool("javac"),
    [
      "-J-Xmx256m",
      "-proc:none",
      "-XDrawDiagnostics",
      "-source",
      "8",
      "-target",
      "8",
      "-bootclasspath",
      tool("android"),
      "-classpath",
      tool("lambda"),
      "-sourcepath",
      "",
      "-encoding",
      "UTF-8",
      "-d",
      classes,
      ...sourcePaths.filter((name) => name.endsWith(".java")).map((name) => child(source, name)),
    ],
    directory,
  );
  await command(tool("jar"), ["--create", "--file", jar, "-C", classes, "."], directory);
  await command(
    tool("java"),
    [
      "-Xmx256m",
      "-cp",
      tool("d8"),
      "com.android.tools.r8.D8",
      "--release",
      "--min-api",
      "26",
      "--lib",
      tool("android"),
      "--output",
      dex,
      jar,
    ],
    directory,
  );
  await command(
    tool("aapt2"),
    [
      "link",
      "-I",
      tool("android"),
      "--manifest",
      child(source, "AndroidManifest.xml"),
      "--min-sdk-version",
      "26",
      "--target-sdk-version",
      "36",
      "-o",
      base,
    ],
    directory,
  );
  const permissions = await command(tool("aapt2"), ["dump", "permissions", base], directory);
  const allowedPermissions = new Set([
    "android.permission.INTERNET",
    "android.permission.FOREGROUND_SERVICE",
    "android.permission.FOREGROUND_SERVICE_SPECIAL_USE",
    "android.permission.POST_NOTIFICATIONS",
  ]);
  if (
    [...permissions.matchAll(/uses-permission[^\r\n]*name='([^']+)'/g)].some(
      (match) => !allowedPermissions.has(match[1]),
    )
  )
    throw Error("android-compiled-permission-denied");
  const badging = await command(tool("aapt2"), ["dump", "badging", base], directory);
  if (!/^package: name='org\.devsetu\.connector'/m.test(badging))
    throw Error("android-compiled-package-denied");
  await command(tool("jar"), ["--update", "--file", base, "-C", dex, "classes.dex"], directory);
  await command(tool("zipalign"), ["-f", "4", base, aligned], directory);
  let certificateSha256 = null;
  if (config.signing) {
    await plain(config.signing.keystore);
    const password = await command(
      path.join(process.env.WINDIR, "System32/WindowsPowerShell/v1.0/powershell.exe"),
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "RemoteSigned",
        "-File",
        child(config.root, "bin/Resolve-SigningReference.ps1"),
        "-Reference",
        config.signing.passwordReference,
      ],
      directory,
    );
    if (!/^[A-Za-z0-9_-]{43}$/.test(password.trim()))
      throw Error("android-signing-reference-invalid");
    await command(
      tool("java"),
      [
        "-Xmx128m",
        "-jar",
        tool("apksigner"),
        "sign",
        "--ks",
        config.signing.keystore,
        "--ks-key-alias",
        config.signing.alias,
        "--ks-pass",
        "stdin",
        "--key-pass",
        "stdin",
        "--out",
        apk,
        aligned,
      ],
      directory,
      password.trim() + "\n" + password.trim() + "\n",
    );
    const verification = await command(
      tool("java"),
      ["-Xmx128m", "-jar", tool("apksigner"), "verify", "--verbose", "--print-certs", apk],
      directory,
    );
    certificateSha256 = verification
      .match(/Signer #1 certificate SHA-256 digest: ([a-f0-9]{64})/i)?.[1]
      ?.toLowerCase();
    if (!certificateSha256 || certificateSha256 !== config.signing.certificateSha256)
      throw Error("android-signature-identity-mismatch");
  } else await fs.copyFile(aligned, apk, raw.constants.COPYFILE_EXCL);
  return {
    version: 1,
    status: config.signing ? "SIGNED" : "UNSIGNED",
    sdkJobId: request.id,
    correlationId: request.correlationId,
    workspaceId: request.workspaceId,
    profileId: request.profileId,
    repositoryId: request.repositoryId,
    configurationSha256: config.configurationSha256,
    sourceHead: request.sourceHead,
    sourceState: request.sourceState,
    sourceTreeSha256: sha(
      JSON.stringify(
        request.sources
          .map(({ path, sha256 }) => ({ path, sha256 }))
          .sort((a, b) => a.path.localeCompare(b.path)),
      ),
    ),
    apkSha256: await hashFile(apk),
    apkBytes: (await fs.stat(apk)).size,
    certificateSha256,
  };
}
async function worker(configPath) {
  await plain(configPath);
  const configBytes = await fs.readFile(configPath);
  const config = JSON.parse(configBytes.toString("utf8"));
  config.configurationSha256 = sha(configBytes);
  const sdkStatePath = child(config.root, "sdk/sdk-state.json");
  try {
    await fs.access(sdkStatePath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await command(
      path.join(process.env.WINDIR, "System32/WindowsPowerShell/v1.0/powershell.exe"),
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "RemoteSigned",
        "-File",
        child(config.root, "bin/Initialize-Sdk.ps1"),
        "-ConfigReference",
        configPath,
      ],
      config.root,
    );
  }
  const sdk = JSON.parse(await fs.readFile(sdkStatePath, "utf8"));
  if (sdk.version !== 1 || sdk.status !== "READY") throw Error("android-sdk-not-ready");
  config.tools = sdk.tools;
  await verifyTools(config);
  const requests = child(config.root, "requests"),
    results = child(config.root, "results"),
    jobs = child(config.root, "jobs");
  for (const folder of [requests, results, jobs]) await plain(folder);
  const healthPath = child(config.root, "results/service-health.json");
  const writeHealth = async () => {
    if (sha(await fs.readFile(configPath)) !== config.configurationSha256)
      throw Error("android-worker-configuration-changed");
    const temporary = healthPath + "." + crypto.randomUUID() + ".tmp";
    await fs.writeFile(
      temporary,
      JSON.stringify({
        version: 1,
        status: "READY",
        at: new Date().toISOString(),
        configSha256: config.configurationSha256,
      }),
      { flag: "wx" },
    );
    await fs.rename(temporary, healthPath);
  };
  await writeHealth();
  let healthy = true;
  const heartbeat = setInterval(() => {
    writeHealth().catch(() => {
      healthy = false;
      process.exitCode = 1;
      clearInterval(heartbeat);
    });
  }, 5000);
  for (;;) {
    if (!healthy || sha(await fs.readFile(configPath)) !== config.configurationSha256)
      throw Error("android-worker-configuration-changed");
    const names = (await fs.readdir(requests)).filter((name) =>
      /^ab_[a-f0-9]{32}\.json$/.test(name),
    );
    if (names.length > 1000) throw Error("android-request-retention-capacity");
    for (const name of names) {
      const input = child(requests, name),
        id = name.slice(0, -5),
        receipt = child(results, name),
        directory = child(jobs, id);
      try {
        await fs.access(receipt);
        continue;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      let result;
      try {
        await plain(input);
        if ((await fs.stat(input)).size > 2000000) throw Error("android-request-capacity");
        const request = JSON.parse(await fs.readFile(input, "utf8"));
        validateRequest(request, config);
        if (request.id !== id) throw Error("android-request-identity-mismatch");
        if ((await fs.readdir(jobs)).length >= 100) throw Error("android-job-retention-capacity");
        await fs.mkdir(directory);
        result = await compile(config, request, directory);
      } catch (error) {
        result = {
          version: 1,
          status: "FAILED",
          errorCode: /^[a-z-]{1,80}$/.test(error.message) ? error.message : "android-build-failed",
          ...(error.toolFailure ? { toolFailure: error.toolFailure } : {}),
        };
      }
      const temporary = receipt + "." + crypto.randomUUID() + ".tmp";
      await fs.writeFile(temporary, JSON.stringify(result), { flag: "wx" });
      await fs.rename(temporary, receipt);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}
module.exports = { sourcePaths, validateRequest, verifyTools, compile, hashFile };
if (require.main === module && process.argv.length === 4 && process.argv[2] === "--worker") {
  worker(process.argv[3]).catch(async (error) => {
    try {
      const config = JSON.parse(await fs.readFile(process.argv[3], "utf8"));
      await fs.writeFile(
        child(config.root, "results/service-start-failure.json"),
        JSON.stringify({
          version: 1,
          status: "FAILED",
          code: /^[a-z-]{1,80}$/.test(error.message)
            ? error.message
            : "android-worker-start-failed",
          osCode: typeof error.code === "string" ? error.code : null,
        }),
      );
    } catch {
      /* Diagnostic failure must not widen access or expose child output. */
    }
    process.exitCode = 1;
  });
}
