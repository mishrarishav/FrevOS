// Fixed Servix pre-push publisher. Reuse npm's own locked-tarball and cache libraries.
const fs = require("node:fs/promises");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createHash, randomUUID } = require("node:crypto");
const npmRoot = path.join(path.dirname(process.execPath), "node_modules/npm");
const pacote = require(require.resolve("pacote", { paths: [npmRoot] }));
const cacache = require(require.resolve("cacache", { paths: [npmRoot] }));
const remote = "//10.9.69.20/e$/FrevOS/git/servix.git";
const cacheRoot = "//10.9.69.20/e$/FrevOS/servix/npm-cache";
const localCache = path.join(process.env.LOCALAPPDATA, "npm-cache", "_cacache");
class CachePublicationError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
function git(args) {
  return execFileSync("git.exe", args, {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
  }).trim();
}
async function existingTarball(cache, integrity) {
  // This step checks cache availability. npm ci verifies every SRI on the build
  // host before any artifact exists; downloading cached bytes over SMB here
  // makes a cold lock exceed the source-publication deadline.
  const content = await cacache.get.hasContent(cache, integrity);
  if (!content) return false;
  if (!Number.isSafeInteger(content.size) || content.size < 1 || content.size > 64 * 1024 * 1024)
    throw new CachePublicationError("package-size-capacity");
  return true;
}
async function publish(sha, staged = false) {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new CachePublicationError("invalid-commit");
  if (
    git([
      "-c",
      "safe.directory=" + remote,
      "--git-dir=" + remote,
      "config",
      "--get",
      "frevos.repositoryId",
    ]) !== "gitrepo_6cb7e163f807493fa37963196c49fbac"
  )
    throw new CachePublicationError("repository-identity-mismatch");
  const lockFiles = ["frontend/package-lock.json"];
  if (git(["ls-tree", "--name-only", sha, "--", "backend/package-lock.json"]))
    lockFiles.push("backend/package-lock.json");
  const locks = lockFiles.map((file) => {
    const text = git(["show", sha + ":" + file]),
      value = JSON.parse(text);
    if (value.lockfileVersion !== 3 || !value.packages)
      throw new CachePublicationError("unsupported-lock");
    return { file, value, sha256: createHash("sha256").update(text).digest("hex") };
  });
  const lockDigest =
    locks.length === 1
      ? locks[0].sha256
      : createHash("sha256")
          .update(JSON.stringify(locks.map(({ file, sha256 }) => ({ file, sha256 }))))
          .digest("hex");
  const receipts = path.join(cacheRoot, "frevos-locks"),
    receipt = path.join(receipts, lockDigest + ".json");
  try {
    const saved = JSON.parse(await fs.readFile(receipt, "utf8"));
    if (saved.version === 1 && saved.lockSha256 === lockDigest && saved.published === true) {
      process.stderr.write("FrevOS: locked dependency cache already published.\n");
      return;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const packages = new Map();
  for (const lock of locks)
    for (const [name, pkg] of Object.entries(lock.value.packages)) {
      if (!name) continue;
      if (pkg.link || typeof pkg.resolved !== "string" || typeof pkg.integrity !== "string")
        throw new CachePublicationError("unsupported-locked-package");
      const url = new URL(pkg.resolved);
      if (
        url.protocol !== "https:" ||
        url.hostname !== "registry.npmjs.org" ||
        url.username ||
        url.password ||
        url.port ||
        url.hash ||
        url.search
      )
        throw new CachePublicationError("package-source-outside-profile");
      if (!/^sha(1|256|384|512)-[A-Za-z0-9+/=]+$/.test(pkg.integrity))
        throw new CachePublicationError("invalid-integrity");
      packages.set(pkg.integrity, { url: url.href, integrity: pkg.integrity });
    }
  if (packages.size > 5000) throw new CachePublicationError("package-capacity");
  process.stderr.write(
    "FrevOS: publishing " + packages.size + " locked package tarballs to server20.\n",
  );
  const work = [...packages.values()];
  let next = 0,
    done = 0,
    total = 0,
    failed = false;
  const workers = await Promise.allSettled(
    Array.from({ length: 16 }, async () => {
      while (next < work.length && !failed) {
        const item = work[next++];
        try {
          const present = await existingTarball(path.join(cacheRoot, "_cacache"), item.integrity);
          if (!present) {
            const bytes = await pacote.tarball(item.url, {
              integrity: item.integrity,
              cache: localCache,
              preferOffline: true,
              ignoreScripts: true,
              fetchRetries: 1,
              fetchTimeout: 30000,
            });
            total += bytes.length;
            if (bytes.length > 64 * 1024 * 1024 || total > 1024 * 1024 * 1024)
              throw new CachePublicationError("package-size-capacity");
            await cacache.put(
              path.join(cacheRoot, "_cacache"),
              "make-fetch-happen:request-cache:" + item.url,
              bytes,
              { integrity: item.integrity },
            );
          }
          done++;
          if (done % 200 === 0)
            process.stderr.write("FrevOS package cache: " + done + "/" + work.length + "\n");
        } catch (error) {
          failed = true;
          throw error;
        }
      }
    }),
  );
  const failure = workers.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
  if (done !== work.length) throw new CachePublicationError("incomplete-cache");
  await fs.mkdir(receipts, { recursive: true });
  const temporary = receipt + "." + randomUUID() + ".tmp";
  await fs.writeFile(
    temporary,
    JSON.stringify({
      version: 1,
      lockSha256: lockDigest,
      ...(staged ? { sourceTree: sha } : { sourceHead: sha }),
      locks: locks.map(({ file, sha256 }) => ({ file, sha256 })),
      published: true,
      packages: done,
      bytes: total,
      createdAt: new Date().toISOString(),
    }),
    { flag: "wx" },
  );
  await fs.rename(temporary, receipt);
  process.stderr.write("FrevOS: package cache published; Git push can continue.\n");
}
async function main() {
  if (git(["rev-parse", "--show-toplevel"]).replaceAll("\\", "/").toLowerCase() !== "d:/servixdev")
    throw new CachePublicationError("wrong-local-repository");
  if (process.argv[2] === "--prepare-current") {
    await publish(git(["rev-parse", "HEAD"]));
    return;
  }
  if (process.argv[2] === "--prepare-staged") {
    await publish(git(["write-tree"]), true);
    return;
  }
  if (process.argv[2] !== "frevos") return;
  if (process.argv[3] !== remote) throw new CachePublicationError("wrong-frevos-remote");
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 16384) throw new CachePublicationError("push-input-capacity");
  }
  for (const line of input.trim().split(/\r?\n/)) {
    if (!line) continue;
    const fields = line.trim().split(/\s+/);
    if (fields.length !== 4 || fields[2] !== "refs/heads/frevos-dev" || /^0+$/.test(fields[1]))
      throw new CachePublicationError("wrong-frevos-ref");
    await publish(fields[1]);
  }
}
module.exports = { existingTarball };
if (require.main === module)
  main().catch((error) => {
    process.stderr.write(
      "FrevOS dependency publication failed (" +
        (error.code || error.name) +
        "). Git push/deployment was not continued.\n",
    );
    process.exitCode = 1;
  });
