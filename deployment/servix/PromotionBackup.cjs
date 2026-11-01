"use strict";
const fs = require("node:fs/promises"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  zlib = require("node:zlib");
const { spawn } = require("node:child_process"),
  { pipeline } = require("node:stream/promises"),
  { Transform } = require("node:stream");
const live = new Set();
function meter(limit) {
  const hash = crypto.createHash("sha256");
  let bytes = 0;
  const stream = new Transform({
    transform(b, _encoding, done) {
      bytes += b.length;
      if (bytes > limit) return done(Error("backup-budget"));
      hash.update(b);
      done(null, b);
    },
  });
  return { stream, result: () => ({ bytes, sha256: hash.digest("hex") }) };
}
function child(executable, args, input) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key.toLowerCase() !== "psmodulepath"),
  );
  const p = spawn(executable, args, {
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...env, NODE_OPTIONS: "" },
  });
  live.add(p);
  // Retain only numeric MySQL error codes, never raw stderr/rows/credentials.
  const mysqlCodes = new Set();
  p.stderr.on("data", (b) => {
    for (const match of b.toString().matchAll(/ERROR\s+(\d{3,5})/g))
      mysqlCodes.add(Number(match[1]));
  });
  p.stdin.on("error", () => {});
  const timer = setTimeout(() => p.kill(), 20 * 60000);
  p.done = new Promise((ok, no) => {
    p.once("error", () => {
      live.delete(p);
      clearTimeout(timer);
      no(Error("backup-process"));
    });
    p.once("close", (code) => {
      live.delete(p);
      clearTimeout(timer);
      code === 0
        ? ok()
        : no(
            Object.assign(Error("backup-process"), {
              executable: path.basename(executable),
              exitCode: code,
              mysqlCodes: [...mysqlCodes],
            }),
          );
    });
  });
  p.done.catch(() => {});
  if (input !== undefined) p.stdin.end(input);
  return p;
}
async function capture(p, limit = 1024 * 1024) {
  let bytes = 0;
  const chunks = [];
  p.stdout.on("data", (b) => {
    bytes += b.length;
    if (bytes > limit) p.kill();
    else chunks.push(b);
  });
  await p.done;
  if (bytes > limit) throw Error("backup-output-budget");
  return Buffer.concat(chunks);
}
async function backup(cfg) {
  const { plain, hash, writeNew } = require("./PromotionFiles.cjs");
  const directory = path.resolve(cfg.directory);
  plain(directory);
  if (
    !/^pm_[a-f0-9]{32}$/.test(path.basename(directory)) ||
    !/^[a-f0-9]{64}$/.test(cfg.scopeSha256)
  )
    throw Error("backup-scope");
  const client = path.join(cfg.clientRoot, "bin/mysql.exe"),
    dump = path.join(cfg.clientRoot, "bin/mysqldump.exe");
  if (hash(client) !== cfg.clientSha256 || hash(dump) !== cfg.dumpSha256)
    throw Error("backup-tool-integrity");
  if (!(await capture(child(dump, ["--version"], ""))).toString().includes(` ${cfg.version} `))
    throw Error("backup-version");
  const option = (s) =>
    '"' +
    String(s)
      .replaceAll("\\", "\\\\")
      .replaceAll('"', '\\"')
      .replaceAll("\n", "\\n")
      .replaceAll("\r", "\\r") +
    '"';
  const e = cfg.environment;
  if (
    !/^[A-Za-z0-9_.-]{1,253}$/.test(e.host) ||
    !/^[A-Za-z0-9_$-]{1,64}$/.test(e.database) ||
    !Number.isInteger(e.port) ||
    e.port < 1 ||
    e.port > 65535
  )
    throw Error("backup-database-binding");
  const optionFile = path.join(directory, "client.private.cnf");
  writeNew(
    optionFile,
    Buffer.from(
      "[client]\nhost=" +
        option(e.host) +
        "\nport=" +
        e.port +
        "\nuser=" +
        option(e.user) +
        "\npassword=" +
        option(e.password) +
        "\nprotocol=TCP\n",
    ),
  );
  try {
    const metadataSql =
      "SELECT JSON_OBJECT('version',@@version,'tables',(SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE'),'views',(SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='VIEW'),'nonTransactional',(SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' AND ENGINE<>'InnoDB'));\n";
    const readMetadata = async () =>
      JSON.parse(
        (
          await capture(
            child(
              client,
              [
                `--defaults-file=${optionFile}`,
                `--database=${e.database}`,
                "--connect-timeout=8",
                "--batch",
                "--raw",
                "--skip-column-names",
              ],
              metadataSql,
            ),
          )
        ).toString(),
      );
    const before = await readMetadata();
    if (before.version !== cfg.version || before.nonTransactional !== 0 || before.tables < 1)
      throw Error("backup-source-contract");
    const powershell = path.join(
      process.env.SystemRoot,
      "System32/WindowsPowerShell/v1.0/powershell.exe",
    );
    const boundaryArgs = [
      "-NoProfile",
      "-NonInteractive",
      "-File",
      path.join(__dirname, "Protect-PromotionBackup.ps1"),
      "-Directory",
      directory,
      "-ScopeSha256",
      cfg.scopeSha256,
    ];
    const protect = child(powershell, [...boundaryArgs, "-Action", "Protect"]);
    const dumper = child(
      dump,
      [
        `--defaults-file=${optionFile}`,
        "--single-transaction",
        "--quick",
        "--no-tablespaces",
        "--set-gtid-purged=OFF",
        "--routines",
        "--events",
        "--triggers",
        "--hex-blob",
        "--default-character-set=utf8mb4",
        "--column-statistics=0",
        "--databases",
        "--skip-lock-tables",
        "--",
        e.database,
      ],
      "",
    );
    const raw = meter(4 * 1024 ** 3),
      compressed = meter(2 * 1024 ** 3),
      protectedOutput = capture(protect, 16384);
    protectedOutput.catch(() => {});
    await Promise.all([
      pipeline(dumper.stdout, raw.stream, zlib.createGzip(), compressed.stream, protect.stdin),
      dumper.done,
    ]);
    const encrypted = JSON.parse((await protectedOutput).toString()),
      rawReceipt = raw.result(),
      compressedReceipt = compressed.result();
    if (encrypted.status !== "PASS" || rawReceipt.bytes < 1000 || compressedReceipt.bytes < 1000)
      throw Error("backup-empty");
    const after = await readMetadata();
    if (JSON.stringify(before) !== JSON.stringify(after)) throw Error("backup-source-drift");
    const unprotect = child(
        powershell,
        [...boundaryArgs, "-Action", "Unprotect", "-FileSha256", encrypted.sha256],
        "",
      ),
      verify = meter(4 * 1024 ** 3);
    const sink = new Transform({
      transform(_b, _e, done) {
        done();
      },
    });
    sink.resume();
    await Promise.all([
      pipeline(unprotect.stdout, zlib.createGunzip(), verify.stream, sink),
      unprotect.done,
    ]);
    if (JSON.stringify(verify.result()) !== JSON.stringify(rawReceipt))
      throw Error("backup-integrity");
    const result = {
      version: 1,
      createdAt: new Date().toISOString(),
      sha256: encrypted.sha256,
      bytes: encrypted.bytes,
      databaseVersion: before.version,
      encrypted: true,
      integrityVerified: true,
      isolatedRestoreTested: false,
      raw: rawReceipt,
      compressed: compressedReceipt,
      metadata: before,
      scopeSha256: cfg.scopeSha256,
    };
    writeNew(path.join(directory, "receipt.json"), Buffer.from(JSON.stringify(result)));
    return result;
  } finally {
    for (const p of live) p.kill();
    await Promise.allSettled([...live].map((p) => p.done));
    for (const k of Object.keys(e)) delete e[k];
    await fs.unlink(optionFile);
  }
}
module.exports = { backup, meter };
if (require.main === module) {
  (async () => {
    const chunks = [];
    let size = 0;
    for await (const b of process.stdin) {
      size += b.length;
      if (size > 65536) throw Error();
      chunks.push(b);
    }
    const input = Buffer.concat(chunks);
    try {
      return await backup(JSON.parse(input.toString()));
    } finally {
      input.fill(0);
    }
  })()
    .then((r) => process.stdout.write(JSON.stringify(r)))
    .catch(() => {
      process.stderr.write("Promotion backup unavailable\n");
      process.exitCode = 1;
    });
}
