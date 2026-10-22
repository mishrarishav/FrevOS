const fs = require("node:fs/promises"),
  path = require("node:path"),
  { createHash, randomUUID } = require("node:crypto");
const cacache = require(
  require.resolve("cacache", {
    paths: [path.join(path.dirname(process.execPath), "node_modules/npm")],
  }),
);
(async () => {
  const [job, digest] = process.argv.slice(2);
  if (
    process.env.COMPUTERNAME !== "DCAPP7" ||
    !/^E:\\FrevOS\\operator\\servix-preflight-[a-f0-9]{32}$/.test(job) ||
    !/^[a-f0-9]{64}$/.test(digest)
  )
    throw Error("Invalid cache import boundary");
  const bytes = await fs.readFile(path.join(job, "manifest.json"));
  if (createHash("sha256").update(bytes).digest("hex") !== digest)
    throw Error("Cache manifest mismatch");
  const manifest = JSON.parse(bytes);
  if (
    manifest.version !== 1 ||
    manifest.target !== "DCAPP7/servix/npm-cache" ||
    manifest.repositoryId !== "gitrepo_6cb7e163f807493fa37963196c49fbac" ||
    !manifest.packages.length ||
    manifest.packages.length > 5000 ||
    !/^[a-f0-9]{64}$/.test(manifest.lockSha256)
  )
    throw Error("Cache profile mismatch");
  const cacheRoot = "E:/FrevOS/servix/npm-cache",
    cache = path.join(cacheRoot, "_cacache");
  let cursor = 0,
    total = 0;
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (cursor < manifest.packages.length) {
        const item = manifest.packages[cursor++];
        if (
          !/^[a-f0-9]{64}\.tgz$/.test(item.name) ||
          new URL(item.url).origin !== "https://registry.npmjs.org" ||
          new URL(item.url).username ||
          new URL(item.url).password
        )
          throw Error("Invalid cache entry");
        const file = path.join(job, "expanded", item.name),
          stat = await fs.lstat(file);
        if (
          !stat.isFile() ||
          stat.isSymbolicLink() ||
          stat.size !== item.bytes ||
          stat.size > 64 * 1024 * 1024
        )
          throw Error("Cache file identity mismatch");
        const data = await fs.readFile(file);
        total += data.length;
        if (
          total > 1024 * 1024 * 1024 ||
          createHash("sha256").update(data).digest("hex") !== item.sha256
        )
          throw Error("Cache payload mismatch");
        await cacache.put(cache, "make-fetch-happen:request-cache:" + item.url, data, {
          integrity: item.integrity,
        });
      }
    }),
  );
  const verified = await cacache.verify(cache, { concurrency: 8 });
  if (verified.badContentCount || verified.verifiedContent < manifest.packages.length)
    throw Error("Incomplete npm cache integrity");
  const receipts = path.join(cacheRoot, "frevos-locks");
  await fs.mkdir(receipts, { recursive: true });
  const receipt = path.join(receipts, manifest.lockSha256 + ".json"),
    temporary = receipt + "." + randomUUID() + ".tmp";
  const result = {
    version: 1,
    published: true,
    lockSha256: manifest.lockSha256,
    sourceHead: manifest.sourceHead,
    packages: manifest.packages.length,
    bytes: total,
    verifiedContent: verified.verifiedContent,
    createdAt: new Date().toISOString(),
  };
  await fs.writeFile(temporary, JSON.stringify(result), { flag: "wx" });
  await fs.rename(temporary, receipt);
  await fs.writeFile(path.join(job, "cache-result.json"), JSON.stringify(result));
})().catch((error) => {
  console.error("Cache import failed: " + (error.code || error.name));
  process.exitCode = 1;
});
