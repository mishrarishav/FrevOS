import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ReviewLinkChecker, type ReviewCheckPolicy } from "../src/review-link-checker.js";

let directory: string;
let ca: Buffer;
let key: Buffer;
let certificate: Buffer;
let expiredCertificate: Buffer;
const servers: Server[] = [];
function openssl(...args: string[]) {
  const executable =
    process.platform === "win32"
      ? [
          join(process.env["ProgramFiles"] ?? "C:/Program Files", "Git/usr/bin/openssl.exe"),
          join(process.env["ProgramFiles"] ?? "C:/Program Files", "Git/mingw64/bin/openssl.exe"),
        ].find(existsSync)
      : "openssl";
  if (!executable) throw Error("review-tls-tests-require-openssl");
  execFileSync(executable, args, {
    cwd: directory,
    stdio: "ignore",
    timeout: 15000,
    windowsHide: true,
  });
}
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "frevos-review-tls-"));
  openssl(
    "req",
    "-x509",
    "-newkey",
    "ec",
    "-pkeyopt",
    "ec_paramgen_curve:P-256",
    "-nodes",
    "-keyout",
    "ca.key",
    "-out",
    "ca.crt",
    "-days",
    "2",
    "-subj",
    "/CN=DevSetu fixture CA",
    "-addext",
    "basicConstraints=critical,CA:TRUE",
    "-addext",
    "keyUsage=critical,keyCertSign,cRLSign",
  );
  openssl(
    "req",
    "-new",
    "-newkey",
    "ec",
    "-pkeyopt",
    "ec_paramgen_curve:P-256",
    "-nodes",
    "-keyout",
    "server.key",
    "-out",
    "server.csr",
    "-subj",
    "/CN=review-fixture.invalid",
  );
  await writeFile(
    join(directory, "extensions.cnf"),
    "subjectAltName=DNS:review-fixture.invalid\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=serverAuth\n",
    { mode: 0o600 },
  );
  openssl(
    "x509",
    "-req",
    "-in",
    "server.csr",
    "-CA",
    "ca.crt",
    "-CAkey",
    "ca.key",
    "-CAcreateserial",
    "-out",
    "server.crt",
    "-days",
    "1",
    "-sha256",
    "-extfile",
    "extensions.cnf",
  );
  await mkdir(join(directory, "issued"));
  await writeFile(join(directory, "index.txt"), "", { mode: 0o600 });
  await writeFile(join(directory, "serial"), "1000\n", { mode: 0o600 });
  await writeFile(
    join(directory, "expired.cnf"),
    [
      "[ca]",
      "default_ca=fixture",
      "[fixture]",
      "database=index.txt",
      "new_certs_dir=issued",
      "certificate=ca.crt",
      "private_key=ca.key",
      "serial=serial",
      "default_md=sha256",
      "policy=policy",
      "x509_extensions=server",
      "[policy]",
      "commonName=supplied",
      "[server]",
      "subjectAltName=DNS:review-fixture.invalid",
      "basicConstraints=critical,CA:FALSE",
      "keyUsage=critical,digitalSignature",
      "extendedKeyUsage=serverAuth",
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
  openssl(
    "ca",
    "-batch",
    "-config",
    "expired.cnf",
    "-in",
    "server.csr",
    "-out",
    "expired.crt",
    "-startdate",
    "20200101000000Z",
    "-enddate",
    "20200102000000Z",
    "-notext",
  );
  [ca, key, certificate, expiredCertificate] = (await Promise.all(
    ["ca.crt", "server.key", "server.crt", "expired.crt"].map((file) =>
      readFile(join(directory, file)),
    ),
  )) as [Buffer, Buffer, Buffer, Buffer];
});
afterAll(async () => {
  for (const server of servers) {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
  if (directory) {
    if (
      dirname(resolve(directory)) !== resolve(tmpdir()) ||
      !basename(directory).startsWith("frevos-review-tls-")
    )
      throw Error("tls-fixture-cleanup-path-denied");
    await rm(directory, { recursive: true, force: true });
  }
});
async function fixture(cert = certificate) {
  let seen = 0;
  const server = createServer({ key, cert }, (request, response) => {
    seen++;
    response.setHeader("content-type", "text/html");
    if (request.url === "/large")
      response.end("<title>TLS fixture</title>Application ready" + "x".repeat(4096));
    else if (request.url === "/error") response.writeHead(404).end("<title>TLS missing</title>");
    else if (request.url === "/blocked-redirect")
      response.writeHead(302, { location: "https://unapproved.invalid/" }).end();
    else if (request.url === "/other-host")
      response
        .writeHead(302, {
          location: `https://other-fixture.invalid:${(server.address() as AddressInfo).port}/ready`,
        })
        .end();
    else response.end("<title>TLS fixture</title>Application ready");
  });
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const origin = `https://review-fixture.invalid:${(server.address() as AddressInfo).port}`;
  const policy: ReviewCheckPolicy = {
    allowedOrigins: [origin],
    allowedPathPrefixes: ["/"],
    allowPrivate: false,
    timeoutMs: 1500,
    maxBytes: 1024,
    maxRedirects: 3,
  };
  const endpoint = (path = "/ready") => ({
    id: "ep_fixture",
    label: "TLS fixture",
    url: origin + path,
    expectedText: "Application ready",
    expectedStatuses: [200],
  });
  return { origin, policy, endpoint, seen: () => seen };
}
const resolver = async () => [{ address: "127.0.0.1", family: 4 }];

describe("strict TLS certificate observations", () => {
  it("records a trusted CA/hostname-verified certificate and retains it on bounded bodies and HTTP errors", async () => {
    const f = await fixture(),
      checker = new ReviewLinkChecker(resolver, true, { ca });
    const normal = await checker.check(f.endpoint(), f.policy);
    expect(normal.status).toBe("healthy");
    expect(normal.tls).toHaveLength(1);
    expect(normal.tls?.[0]).toMatchObject({
      url: f.origin + "/ready",
      hostname: "review-fixture.invalid",
      verification: "verified",
      subject: "CN=review-fixture.invalid",
      issuer: "CN=DevSetu fixture CA",
      errorCode: null,
    });
    expect(normal.tls?.[0]?.fingerprint256).toMatch(/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/);
    expect(Date.parse(normal.tls?.[0]?.validTo ?? "")).toBeGreaterThan(Date.now());
    expect(await checker.check(f.endpoint("/large"), f.policy)).toMatchObject({
      status: "unknown",
      httpStatus: 200,
      tls: [{ verification: "verified" }],
    });
    expect(await checker.check(f.endpoint("/error"), f.policy)).toMatchObject({
      status: "http-error",
      httpStatus: 404,
      tls: [{ verification: "verified" }],
    });
  });

  it("keeps verification enabled for an untrusted chain and an expired certificate", async () => {
    const untrusted = await fixture();
    const rejected = await new ReviewLinkChecker(resolver, true).check(
      untrusted.endpoint(),
      untrusted.policy,
    );
    expect(rejected.status).toBe("tls-error");
    expect(rejected.tls?.[0]).toMatchObject({ verification: "failed" });
    expect(rejected.tls?.[0]?.errorCode).toMatch(/CERT|VERIFY|SELF_SIGNED/);
    expect(untrusted.seen()).toBe(0);
    const expired = await fixture(expiredCertificate);
    const outdated = await new ReviewLinkChecker(resolver, true, { ca }).check(
      expired.endpoint(),
      expired.policy,
    );
    expect(outdated.status).toBe("tls-error");
    expect(outdated.tls?.[0]).toMatchObject({
      verification: "failed",
      errorCode: "CERT_HAS_EXPIRED",
    });
    expect(expired.seen()).toBe(0);
    // Failed handshakes may discard the peer certificate before the error event.
    if (outdated.tls?.[0]?.validTo)
      expect(Date.parse(outdated.tls[0].validTo)).toBeLessThan(Date.now());
  });

  it("records a hostname-mismatched certificate as observed, never verified, and keeps origin observations separate", async () => {
    const f = await fixture();
    const other = f.origin.replace("review-fixture.invalid", "other-fixture.invalid");
    const checker = new ReviewLinkChecker(resolver, true, { ca });
    const result = await checker.check(f.endpoint("/other-host"), {
      ...f.policy,
      allowedOrigins: [f.origin, other],
    });
    expect(result.status).toBe("tls-error");
    expect(result.tls).toHaveLength(2);
    expect(result.tls?.[0]).toMatchObject({
      hostname: "review-fixture.invalid",
      verification: "verified",
    });
    expect(result.tls?.[1]).toMatchObject({
      hostname: "other-fixture.invalid",
      verification: "failed",
      subject: "CN=review-fixture.invalid",
      errorCode: "ERR_TLS_CERT_ALTNAME_INVALID",
    });
    expect(f.seen()).toBe(1);
    const blocked = await checker.check(f.endpoint("/blocked-redirect"), f.policy);
    expect(blocked.status).toBe("blocked");
    expect(blocked.tls).toHaveLength(1);
    expect(blocked.tls?.[0]?.verification).toBe("verified");
  });

  it("does not allow fixture trust to be used in a normal production checker", () => {
    expect(() => new ReviewLinkChecker(resolver, false, { ca })).toThrow("fixture-trust-denied");
  });
});
