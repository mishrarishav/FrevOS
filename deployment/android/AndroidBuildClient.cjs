// Pinned operator-side client for the enrolled SDK worker. No remote command field.
const fs = require("node:fs/promises"),
  path = require("node:path"),
  crypto = require("node:crypto");
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
async function read(file, maximum = 8192) {
  const info = await fs.lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size > maximum)
    throw Error("android-reference-capacity-or-link");
  return fs.readFile(file);
}
async function submit({
  reference,
  sourceRoot,
  sourceHead,
  correlationId,
  outputRoot,
  sourceState = "committed",
  requireSigned = true,
}) {
  const enrolled = JSON.parse(await read(reference));
  if (
    enrolled.version !== 1 ||
    !path.isAbsolute(enrolled.root) ||
    !/^ws_[a-z0-9_-]+$/.test(enrolled.workspaceId) ||
    !/^[a-z0-9-]+$/.test(enrolled.profileId) ||
    !/^gitrepo_[a-f0-9]{32}$/.test(enrolled.repositoryId) ||
    !/^[a-f0-9]{64}$/.test(enrolled.configurationSha256) ||
    !/^[a-f0-9]{40}$/.test(sourceHead) ||
    !/^cj_[a-f0-9]{32}$/.test(correlationId) ||
    !["committed", "local-uncommitted"].includes(sourceState) ||
    (requireSigned &&
      (sourceState !== "committed" || !/^[a-f0-9]{64}$/.test(enrolled.certificateSha256)))
  )
    throw Error("android-builder-not-enrolled");
  const health = JSON.parse(await read(path.join(enrolled.root, "results/service-health.json")));
  const age = Date.now() - Date.parse(health.at);
  if (
    health.version !== 1 ||
    health.status !== "READY" ||
    health.configSha256 !== enrolled.configurationSha256 ||
    !Number.isFinite(age) ||
    age < -60000 ||
    age > 15000
  )
    throw Error("android-builder-offline-or-changed");
  let total = 0;
  const sources = [];
  for (const name of sourcePaths) {
    const target = path.join(sourceRoot, "apps/android-connector", name);
    let cursor = target;
    while (cursor !== sourceRoot) {
      if ((await fs.lstat(cursor)).isSymbolicLink()) throw Error("android-source-linked");
      const parent = path.dirname(cursor);
      if (parent === cursor) throw Error("android-source-outside-checkout");
      cursor = parent;
    }
    const bytes = await read(target, 500000);
    total += bytes.length;
    if (total > 1000000) throw Error("android-source-capacity");
    sources.push({ path: name, sha256: sha(bytes), data: bytes.toString("base64") });
  }
  const id = "ab_" + crypto.randomBytes(16).toString("hex");
  const request = {
    version: 1,
    id,
    operation: "build-android-apk",
    workspaceId: enrolled.workspaceId,
    profileId: enrolled.profileId,
    repositoryId: enrolled.repositoryId,
    sourceHead,
    sourceState,
    correlationId,
    expiresAt: new Date(Date.now() + 600000).toISOString(),
    sources,
  };
  const filename = path.join(enrolled.root, "requests", id + ".json"),
    temporary = filename + "." + crypto.randomUUID() + ".tmp";
  await fs.writeFile(temporary, JSON.stringify(request), { flag: "wx" });
  await fs.rename(temporary, filename);
  const deadline = Date.now() + 600000;
  let report;
  while (Date.now() < deadline) {
    try {
      report = JSON.parse(await read(path.join(enrolled.root, "results", id + ".json")));
      break;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  if (!report) throw Error("android-build-deadline");
  if (!["SIGNED", "UNSIGNED"].includes(report.status)) throw Error("android-build-failed");
  const tree = sha(
    JSON.stringify(
      sources
        .map(({ path, sha256 }) => ({ path, sha256 }))
        .sort((a, b) => a.path.localeCompare(b.path)),
    ),
  );
  if (
    report.sdkJobId !== id ||
    report.correlationId !== correlationId ||
    report.workspaceId !== enrolled.workspaceId ||
    report.profileId !== enrolled.profileId ||
    report.repositoryId !== enrolled.repositoryId ||
    report.configurationSha256 !== enrolled.configurationSha256 ||
    report.sourceHead !== sourceHead ||
    report.sourceState !== sourceState ||
    report.sourceTreeSha256 !== tree ||
    !/^[a-f0-9]{64}$/.test(report.apkSha256) ||
    !Number.isSafeInteger(report.apkBytes) ||
    report.apkBytes < 1 ||
    report.apkBytes > 10000000 ||
    (requireSigned &&
      (report.status !== "SIGNED" || report.certificateSha256 !== enrolled.certificateSha256))
  )
    throw Error("android-artifact-provenance-mismatch");
  const apk = await read(path.join(enrolled.root, "jobs", id, "DevSetu-Android.apk"), 10000000);
  if (apk.length !== report.apkBytes || sha(apk) !== report.apkSha256)
    throw Error("android-artifact-integrity");
  await fs.mkdir(outputRoot);
  const apkPath = path.join(outputRoot, "DevSetu-Android.apk");
  await fs.writeFile(apkPath, apk, { flag: "wx" });
  const result = {
    ...report,
    apkPath,
    sdkJobId: id,
    correlationId,
    configurationSha256: enrolled.configurationSha256,
  };
  const artifactReference = path.join(outputRoot, "android-artifact.json");
  await fs.writeFile(artifactReference, JSON.stringify(result), { flag: "wx" });
  return { artifactReference, report: result };
}
module.exports = { submit, sourcePaths };
