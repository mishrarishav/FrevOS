"use strict";
// Opt-in Windows acceptance. All databases and credentials are synthetic.
const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os"),
  crypto = require("node:crypto"),
  assert = require("node:assert/strict"),
  zlib = require("node:zlib"),
  net = require("node:net");
const { spawn, execFile } = require("node:child_process"),
  { promisify } = require("node:util"),
  { pipeline } = require("node:stream/promises");
const execute = promisify(execFile),
  { backup } = require("./PromotionBackup.cjs"),
  pin = require("./PromotionTools.json").mysql;
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const cleanEnv = () =>
  Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key.toLowerCase() !== "psmodulepath"),
  );
const command = async (exe, args) =>
  (
    await execute(exe, args, {
      windowsHide: true,
      timeout: 120000,
      maxBuffer: 1048576,
      env: cleanEnv(),
    })
  ).stdout;
let base, current, clientRoot, directory;
const scope = crypto.randomBytes(16).toString("hex"),
  delay = (ms) => new Promise((ok) => setTimeout(ok, ms));
function stream(exe, args, input) {
  const p = spawn(exe, args, {
    windowsHide: true,
    env: cleanEnv(),
    stdio: ["pipe", "pipe", "pipe"],
  });
  p.stderr.resume();
  p.stdin.on("error", () => {});
  p.done = new Promise((ok, no) => {
    p.once("error", no);
    p.once("close", (code) => (code === 0 ? ok() : no(Error("Synthetic fixture process failed"))));
  });
  p.done.catch(() => {});
  if (input !== undefined) p.stdin.end(input);
  return p;
}
async function freePort() {
  const s = net.createServer();
  await new Promise((ok) => s.listen(0, "127.0.0.1", ok));
  const port = s.address().port;
  await new Promise((ok) => s.close(ok));
  return port;
}
async function stop() {
  if (!current) return;
  const owned = current;
  current = null;
  if (owned.exitCode === null) owned.kill();
  await owned.done.catch(() => {});
}
async function mysql(port, sql) {
  const options = path.join(base, `client-${port}.cnf`);
  try {
    await fs.writeFile(
      options,
      `[client]\nhost=127.0.0.1\nport=${port}\nuser=root\npassword=fixture-only-password\nprotocol=TCP\n`,
      { flag: "wx" },
    );
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
  }
  const p = stream(
    path.join(clientRoot, "bin/mysql.exe"),
    [`--defaults-file=${options}`, "--batch", "--raw", "--skip-column-names"],
    sql,
  );
  const chunks = [];
  p.stdout.on("data", (b) => chunks.push(b));
  await p.done;
  return Buffer.concat(chunks).toString();
}
async function database(name) {
  const data = path.join(base, name),
    exe = path.join(clientRoot, "bin/mysqld.exe");
  await fs.mkdir(data);
  await command(exe, [
    "--no-defaults",
    "--initialize-insecure",
    `--basedir=${clientRoot}`,
    `--datadir=${data}`,
    "--console",
  ]);
  const init = path.join(base, `${name}-init.sql`);
  await fs.writeFile(
    init,
    "ALTER USER 'root'@'localhost' IDENTIFIED BY 'fixture-only-password';\n",
  );
  const port = await freePort();
  current = stream(
    exe,
    [
      "--no-defaults",
      "--no-monitor",
      `--basedir=${clientRoot}`,
      `--datadir=${data}`,
      "--bind-address=127.0.0.1",
      `--port=${port}`,
      "--mysqlx=0",
      `--init-file=${init}`,
      "--skip-log-bin",
      "--event-scheduler=OFF",
      "--innodb-buffer-pool-size=64M",
      "--innodb-log-file-size=32M",
      "--max-connections=12",
      "--performance-schema=OFF",
      "--console",
    ],
    "",
  );
  current.stdout.resume();
  for (let n = 0; n < 120; n++) {
    try {
      if ((await mysql(port, "SELECT @@GLOBAL.skip_networking;\n")).trim() === "0") return port;
    } catch {}
    if (current.exitCode !== null) throw Error("Synthetic database startup failed");
    await delay(250);
  }
  throw Error("Synthetic database readiness failed");
}
(async () => {
  assert.equal(process.platform, "win32");
  const archive = path.resolve(process.argv[2] || "");
  assert.equal(sha(await fs.readFile(archive)), pin.sha256);
  base = await fs.mkdtemp(path.join(os.tmpdir(), "promotion-backup-native-"));
  clientRoot = path.join(base, "client");
  const psFile = path.join(base, "extract.ps1"),
    toolsFile = path.join(__dirname, "PromotionTools.json");
  await fs.writeFile(
    psFile,
    "param($Archive,$Destination,$Tools)\n$ErrorActionPreference='Stop';$pin=(Get-Content -LiteralPath $Tools -Raw|ConvertFrom-Json).mysql;if((Get-FileHash -LiteralPath $Archive).Hash.ToLowerInvariant() -cne $pin.sha256){throw 'Tool archive changed'};Add-Type -AssemblyName System.IO.Compression.FileSystem;$zip=[IO.Compression.ZipFile]::OpenRead($Archive);try{foreach($entry in $zip.Entries){$prefix=$pin.directory+'/';if(-not $entry.FullName.StartsWith($prefix)){continue};$relative=$entry.FullName.Substring($prefix.Length);if($relative -notmatch '^bin/(mysql|mysqld|mysqldump)\\.exe$|^bin/[A-Za-z0-9_.-]+\\.dll$|^share/(english|charsets)/[A-Za-z0-9_.-]+$'){continue};$file=Join-Path $Destination $relative.Replace('/','\\');[void][IO.Directory]::CreateDirectory((Split-Path $file));[IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$file,$false)}}finally{$zip.Dispose()}\n",
  );
  const powershell = path.join(
    process.env.SystemRoot,
    "System32/WindowsPowerShell/v1.0/powershell.exe",
  );
  await command(powershell, [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    psFile,
    "-Archive",
    archive,
    "-Destination",
    clientRoot,
    "-Tools",
    toolsFile,
  ]);
  directory = path.join(base, `pm_${scope}`);
  const boundary = path.join(__dirname, "Protect-PromotionBackup.ps1");
  await command(powershell, [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    boundary,
    "-Action",
    "Prepare",
    "-Directory",
    directory,
  ]);
  const port = await database("source"),
    value = crypto.randomBytes(32768).toString("hex");
  await mysql(
    port,
    `CREATE DATABASE fixture_db;USE fixture_db;CREATE TABLE fixture_data(id INT PRIMARY KEY,value LONGBLOB) ENGINE=InnoDB;INSERT INTO fixture_data VALUES(1,UNHEX('${value}'));\n`,
  );
  const beforePolicy = process.env.PSExecutionPolicyPreference;
  process.env.PSExecutionPolicyPreference = "Bypass";
  let result;
  try {
    result = await backup({
      directory,
      scopeSha256: sha(Buffer.from(scope)),
      clientRoot,
      version: pin.version,
      clientSha256: sha(await fs.readFile(path.join(clientRoot, "bin/mysql.exe"))),
      dumpSha256: sha(await fs.readFile(path.join(clientRoot, "bin/mysqldump.exe"))),
      environment: {
        host: "127.0.0.1",
        port,
        user: "root",
        password: "fixture-only-password",
        database: "fixture_db",
      },
    });
  } finally {
    if (beforePolicy === undefined) delete process.env.PSExecutionPolicyPreference;
    else process.env.PSExecutionPolicyPreference = beforePolicy;
  }
  assert.equal(result.integrityVerified, true);
  assert.equal(result.metadata.tables, 1);
  await assert.rejects(fs.stat(path.join(directory, "client.private.cnf")));
  await stop();
  const restorePort = await database("restore");
  const unprotect = stream(
    powershell,
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      boundary,
      "-Action",
      "Unprotect",
      "-Directory",
      directory,
      "-ScopeSha256",
      sha(Buffer.from(scope)),
      "-FileSha256",
      result.sha256,
    ],
    "",
  );
  const restore = stream(path.join(clientRoot, "bin/mysql.exe"), [
    `--defaults-file=${path.join(base, `client-${restorePort}.cnf`)}`,
    "--binary-mode=1",
  ]);
  restore.stdout.resume();
  await Promise.all([
    pipeline(unprotect.stdout, zlib.createGunzip(), restore.stdin),
    unprotect.done,
    restore.done,
  ]);
  const restored = await mysql(
    restorePort,
    "USE fixture_db;SELECT COUNT(*),SHA2(value,256) FROM fixture_data GROUP BY value;\n",
  );
  assert.equal(restored.trim(), `1\t${sha(Buffer.from(value, "hex"))}`);
  console.log(
    JSON.stringify({
      status: "PASS",
      nativeMatchingDump: true,
      currentUserDpapi: true,
      fullStreamIntegrity: true,
      actualIsolatedRestore: true,
      optionFileRemoved: true,
      customerConnectionUsed: false,
      databaseWritesOnlyInSyntheticFixtures: true,
      testDatabaseNetwork: "loopback-only",
      toolVersion: pin.version,
    }),
  );
})()
  .catch((e) => {
    console.error(
      JSON.stringify({
        status: "FAIL",
        type: e.name,
        message: e.message,
        executable: e.executable,
        exitCode: e.exitCode,
        mysqlCodes: e.mysqlCodes,
        customerConnectionUsed: false,
      }),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await stop();
    if (base) {
      assert.equal(path.dirname(path.resolve(base)), path.resolve(os.tmpdir()));
      assert(path.basename(base).startsWith("promotion-backup-native-"));
      await fs.rm(base, { recursive: true, force: true });
    }
  });
