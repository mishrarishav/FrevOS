"use strict";
const fs = require("node:fs"),
  path = require("node:path");
const u = require("./PromotionFiles.cjs");
function commandMatches(command, entry, configuration) {
  const m = String(command)
    .trim()
    .match(/^(?:"[^"]+"|\S+)\s+(?:"([^"]+)"|(\S+))\s+([a-f0-9]{64})$/);
  return (
    !!m &&
    path.resolve(m[1] || m[2]).toLowerCase() === path.resolve(entry).toLowerCase() &&
    m[3] === configuration
  );
}
function verify(context, candidate) {
  const fail = () => {
    throw Error("managed-runtime-not-verified");
  };
  const known = (context.knownManaged || []).find(
    (k) => k.launcherArguments === candidate.arguments,
  );
  if (
    !known ||
    !context.target.managedUpdates ||
    !/^pm_[a-f0-9]{32}$/.test(known.id) ||
    known.ownerSid !== candidate.ownerSid ||
    candidate.ownerSid !== candidate.process.ownerSid ||
    !candidate.leastPrivilege ||
    !candidate.passwordLogon ||
    !candidate.bootStart ||
    candidate.actions !== 1 ||
    candidate.execute.toLowerCase() !== candidate.expectedPowerShell.toLowerCase() ||
    path.resolve(candidate.workingDirectory).toLowerCase() !==
      path.resolve(context.target.root, "backend").toLowerCase()
  )
    fail();
  const runtime = u.beneath(context.target.root, `.runtime/devsetu-promotions/${known.id}`);
  if (path.resolve(known.runtime).toLowerCase() !== runtime.toLowerCase()) fail();
  const cfgFile = path.join(runtime, "runtime.json");
  if (
    u.hash(cfgFile) !== known.configurationSha256 ||
    u.hash(path.join(runtime, "Run-SavedBackend.ps1")) !== known.launcherSha256
  )
    fail();
  const cfg = JSON.parse(fs.readFileSync(cfgFile));
  if (
    cfg.root !== context.target.root ||
    cfg.profileId !== context.target.profileId ||
    cfg.workspaceId !== context.target.workspaceId ||
    cfg.computer !== context.target.computer ||
    cfg.ownerSid !== known.ownerSid ||
    cfg.port !== context.target.port ||
    cfg.manifestSha256 !== known.descriptorSha256 ||
    cfg.descriptor !== known.descriptor ||
    cfg.nodeSha256 !== u.hash(context.target.node) ||
    cfg.environmentSha256 !== u.hash(u.beneath(context.target.root, "backend/.env")) ||
    cfg.entrySha256 !== u.hash(path.join(runtime, "ProductionBackendRuntime.cjs")) ||
    cfg.helperSha256 !== u.hash(path.join(runtime, "BackendArtifact.cjs"))
  )
    fail();
  const receipt = JSON.parse(fs.readFileSync(path.join(runtime, "activation-receipt.json")));
  const pointer = u.beneath(context.target.root, "backend/.runtime/devsetu-backend-artifact.json");
  const selected = JSON.parse(fs.readFileSync(pointer));
  if (
    receipt.id !== known.id ||
    receipt.status !== "succeeded" ||
    receipt.configurationSha256 !== known.configurationSha256 ||
    receipt.selection.afterSha256 !== u.hash(pointer) ||
    selected.mode !== "bundle" ||
    selected.descriptor !== known.descriptor ||
    selected.manifestSha256 !== known.descriptorSha256 ||
    !commandMatches(
      candidate.process.command,
      path.join(runtime, "ProductionBackendRuntime.cjs"),
      known.configurationSha256,
    )
  )
    fail();
  if (known.frontendDigest) {
    const front = require("./FrontendArtifact.cjs").current(context);
    if (!front.exists || front.binding.sha256 !== known.frontendDigest) fail();
  }
  return {
    id: known.id,
    runtime,
    configurationSha256: known.configurationSha256,
    launcherArguments: known.launcherArguments,
    taskXml: candidate.taskXml,
    taskXmlSha256: u.sha(Buffer.from(candidate.taskXml, "utf8")),
  };
}
module.exports = { verify, commandMatches };
if (require.main === module) {
  try {
    const context = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
    const candidate = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
    process.stdout.write(JSON.stringify(verify(context, candidate)));
  } catch {
    process.stderr.write("Managed runtime verification failed\n");
    process.exitCode = 1;
  }
}
