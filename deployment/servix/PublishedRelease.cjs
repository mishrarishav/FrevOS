"use strict";
// This verifies public application artifact bytes; it never authenticates to the
// customer application or reads business records, attachments or database rows.
const front = require("./FrontendArtifact.cjs");
async function publicFile(url, record) {
  const response = await fetch(url, {
    redirect: "error",
    headers: { "cache-control": "no-cache" },
    signal: AbortSignal.timeout(15000),
  });
  if (response.status !== 200 || !response.body) throw Error("frontend-public-response");
  let bytes = 0;
  const hash = require("node:crypto").createHash("sha256");
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > record.bytes) throw Error("frontend-public-size");
    hash.update(chunk);
  }
  if (bytes !== record.bytes || hash.digest("hex") !== record.sha256)
    throw Error("frontend-public-digest");
}
async function verify(context, expected) {
  front.verify(context, expected);
  return verifyDescriptor(context.target.root, context.frontendArtifact, context.target.frontend);
}
async function verifyDescriptor(root, binding, config) {
  const d = front.read(root, binding, config);
  const base = new URL(config.applicationUrl);
  if (
    !/^https?:$/.test(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw Error("frontend-public-url");
  if (!base.pathname.endsWith("/")) base.pathname += "/";
  for (const f of d.files) {
    const url = new URL(f.path.split("/").map(encodeURIComponent).join("/"), base);
    await publicFile(url, f);
  }
  await publicFile(
    base,
    d.files.find((f) => f.path === d.entry),
  );
  return { verified: true, files: d.files.length, sha256: binding.sha256 };
}
async function verifyRecovery(context, expected) {
  const previous = front.recoveryState(context, expected);
  if (previous.binding)
    return verifyDescriptor(context.target.root, previous.binding, context.target.frontend);
  if (previous.before)
    await publicFile(new URL(context.target.frontend.applicationUrl), previous.before);
  return { verified: true, previousEntryRestored: !!previous.before };
}
module.exports = { verify, verifyDescriptor, verifyRecovery };
if (require.main === module) {
  (async () => {
    const fs = require("node:fs");
    if (process.argv[2] === "--recover") {
      const context = JSON.parse(fs.readFileSync(process.argv[3]));
      process.stdout.write(JSON.stringify(await verifyRecovery(context, process.argv[4])));
    } else if (process.argv[2] === "--development") {
      const manifest = JSON.parse(fs.readFileSync(process.argv[4])),
        profile = JSON.parse(fs.readFileSync(process.argv[5]));
      process.stdout.write(
        JSON.stringify(
          await verifyDescriptor(process.argv[3], manifest.frontendArtifact, {
            ...profile.frontend,
            applicationUrl: profile.development.siteUrl,
          }),
        ),
      );
    } else {
      const context = JSON.parse(fs.readFileSync(process.argv[2]));
      process.stdout.write(JSON.stringify(await verify(context, process.argv[3])));
    }
  })().catch(() => {
    process.stderr.write("Published frontend verification failed\n");
    process.exitCode = 1;
  });
}
