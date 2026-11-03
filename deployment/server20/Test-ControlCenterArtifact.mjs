import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
let assets;
let server;
try {
  const [packageInput, digest, sourceInput] = process.argv.slice(2);
  if (!packageInput || !/^[a-f0-9]{64}$/.test(digest || "")) throw Error("artifact-input-invalid");
  const root = resolve(packageInput);
  const manifestBytes = await readFile(join(root, "release-manifest.json"));
  if (hash(manifestBytes) !== digest) throw Error("artifact-manifest-differs");
  const manifest = JSON.parse(manifestBytes);
  const outputs = [];
  for (const suffix of ["js", "js.map", "d.ts", "d.ts.map"]) {
    const relative = `apps/control-plane/dist/control-center.${suffix}`;
    const entries = manifest.files.filter((f) => f.path === relative);
    const bytes = await readFile(join(root, relative));
    if (
      entries.length !== 1 ||
      entries[0].bytes !== bytes.length ||
      entries[0].sha256 !== hash(bytes)
    )
      throw Error("artifact-control-center-differs");
    if (sourceInput && hash(await readFile(join(resolve(sourceInput), relative))) !== hash(bytes))
      throw Error("artifact-control-center-not-fresh");
    outputs.push({ path: relative, sha256: hash(bytes) });
  }
  const require = createRequire(join(root, "apps/control-plane/package.json"));
  const fastify = require("fastify");
  const { registerControlCenter } = await import(pathToFileURL(join(root, outputs[0].path)).href);
  assets = await mkdtemp(join(tmpdir(), "devsetu-artifact-csp-"));
  await writeFile(
    join(assets, "index.html"),
    "<!doctype html><title>Artifact policy fixture</title>",
  );
  const preview = "http://preview-fixture.internal";
  server = fastify();
  await registerControlCenter(server, assets, "", true, [preview]);
  for (const url of ["/", "/systems/discovery"]) {
    const response = await server.inject({ method: "GET", url, headers: { accept: "text/html" } });
    if (response.statusCode !== 200) throw Error("artifact-navigation-failed");
    const directives = String(response.headers["content-security-policy"] || "")
      .split(";")
      .map((s) => s.trim());
    if (!directives.includes(`form-action 'self' ${preview}`))
      throw Error("configured-preview-origin-absent");
    if (!directives.includes("connect-src 'self' http://127.0.0.1:*/device-login"))
      throw Error("paired-login-origin-absent");
    for (const expected of [
      "default-src 'self'",
      "script-src 'self'",
      "base-uri 'none'",
      "object-src 'none'",
      "frame-ancestors 'none'",
    ])
      if (!directives.includes(expected)) throw Error("artifact-restrictive-policy-differs");
    if (response.headers["x-content-type-options"] !== "nosniff")
      throw Error("artifact-content-type-guard-differs");
  }
  const invalid = fastify();
  let denied = false;
  try {
    await registerControlCenter(invalid, assets, "", true, [
      "http://preview-fixture.internal; form-action *",
    ]);
  } catch {
    denied = true;
  } finally {
    await invalid.close();
  }
  if (!denied) throw Error("artifact-unconfigured-origin-accepted");
  console.log(
    JSON.stringify({
      status: "PASS",
      manifestSha256: digest,
      freshOutputsVerified: Boolean(sourceInput),
      outputs,
      navigationChecks: 2,
      invalidOriginDenied: true,
    }),
  );
} catch (error) {
  console.log(
    JSON.stringify({
      status: "FAIL",
      code: /^[a-z-]+$/.test(error.message) ? error.message : "artifact-csp-probe-failed",
    }),
  );
  process.exitCode = 1;
} finally {
  await server?.close();
  if (assets) {
    if (
      dirname(assets) !== resolve(tmpdir()) ||
      !basename(assets).startsWith("devsetu-artifact-csp-")
    ) {
      console.log(JSON.stringify({ status: "FAIL", code: "fixture-cleanup-scope" }));
      process.exitCode = 1;
    } else {
      await rm(assets, { recursive: true });
    }
  }
}
