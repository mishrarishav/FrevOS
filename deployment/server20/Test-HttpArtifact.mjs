// Isolated artifact acceptance; no live server or Production database is accessed.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const root = resolve(process.argv[2]),
  pwPackage = resolve(process.argv[3]);
const api = join(root, "apps/control-plane"),
  req = createRequire(join(api, "package.json"));
const { Pool } = req("pg"),
  { chromium } = createRequire(pwPackage)("@playwright/test");
const docker = "C:/Program Files/Docker/Docker/resources/bin/docker.exe";
const image =
  "postgres:18.4-alpine3.23@sha256:996d0920e4ff9df1fc19dacb904492f3c1ec0ec1cc338f0ad7123be7731c5f5e";
const name = `frevos-http-smoke-${randomUUID()}`,
  password = randomBytes(32).toString("hex"),
  runtimePassword = randomBytes(32).toString("hex"),
  adminPassword = randomBytes(32).toString("hex");
let containerId,
  pool,
  app,
  browser,
  nodeRoot,
  stage = "setup",
  stopped = true;
const assert = (condition) => {
  if (!condition) throw Error("Artifact assertion failed");
};
const command = (file, args, env = {}) => {
  const r = spawnSync(file, args, {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
    windowsHide: true,
    timeout: 60000,
  });
  if (r.status !== 0 || r.error) throw Error("Private test child failed");
  return r.stdout.trim();
};
try {
  nodeRoot = await mkdtemp(join(tmpdir(), "frevos-http-node-"));
  command(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      "Add-Type -AssemblyName System.IO.Compression.FileSystem; $z=[IO.Compression.ZipFile]::OpenRead($env:FREVOS_TEST_ZIP); try {$s=$z.GetEntry('node-v24.19.0-win-x64/node.exe').Open(); $o=[IO.File]::Create($env:FREVOS_TEST_NODE); try {$s.CopyTo($o)} finally {$o.Dispose();$s.Dispose()}} finally {$z.Dispose()}",
    ],
    {
      FREVOS_TEST_ZIP: join(root, "prerequisites/node-v24.19.0-win-x64.zip"),
      FREVOS_TEST_NODE: join(nodeRoot, "node.exe"),
    },
  );
  const node = join(nodeRoot, "node.exe");
  assert(command(node, ["--version"]) === "v24.19.0");
  stage = "disposable-database";
  containerId = command(
    docker,
    [
      "run",
      "--rm",
      "-d",
      "--name",
      name,
      "--label",
      "frevos.test=internal-http",
      "-e",
      "POSTGRES_PASSWORD",
      "-p",
      "127.0.0.1::5432",
      image,
    ],
    { POSTGRES_PASSWORD: password },
  );
  assert(/^[a-f0-9]{64}$/.test(containerId));
  const mapping = command(docker, ["port", containerId, "5432/tcp"]);
  assert(/^127\.0\.0\.1:\d+$/.test(mapping));
  const dbPort = Number(mapping.split(":")[1]);
  pool = new Pool({
    host: "127.0.0.1",
    port: dbPort,
    user: "postgres",
    password,
    database: "postgres",
    connectionTimeoutMillis: 1000,
  });
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try {
      await pool.query("SELECT 1");
      ready = true;
      break;
    } catch {
      await delay(250);
    }
  }
  assert(ready);
  await pool.query(
    `CREATE ROLE frevos_runtime LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`,
  );
  await pool.query("CREATE DATABASE frevos");
  await pool.end();
  pool = new Pool({
    host: "127.0.0.1",
    port: dbPort,
    user: "postgres",
    password,
    database: "frevos",
  });
  const clean = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !/^(PG|FREVOS|DATABASE_URL$|MIGRATION_DATABASE_URL$|NODE_OPTIONS$)/.test(key),
    ),
  );
  const runtimeUrl = `postgresql://frevos_runtime:${runtimePassword}@127.0.0.1:${dbPort}/frevos`;
  command(node, [join(api, "dist/migrate.js")], {
    ...clean,
    DATABASE_URL: runtimeUrl,
    MIGRATION_DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:${dbPort}/frevos`,
  });
  assert(
    Number(
      (await pool.query("SELECT count(*) AS n FROM public.frevos_schema_migrations")).rows[0].n,
    ) === 6,
  );
  const listener = createServer();
  await new Promise((r) => listener.listen(0, "127.0.0.1", r));
  const port = listener.address().port;
  await new Promise((r) => listener.close(r));
  const origin = `http://127.0.0.1:${port}`;
  const env = {
    ...clean,
    DATABASE_URL: runtimeUrl,
    FREVOS_PUBLIC_ORIGIN: origin,
    FREVOS_ALLOW_INTERNAL_HTTP: "true",
    FREVOS_AUTH_MODE: "local",
    FREVOS_BASE_PATH: "",
    HOST: "127.0.0.1",
    PORT: String(port),
  };
  command(node, [join(api, "dist/bootstrap-local-user.js")], {
    ...env,
    FREVOS_BOOTSTRAP_USERNAME: "admin",
    FREVOS_BOOTSTRAP_DISPLAY_NAME: "FrevOS Administrator",
    FREVOS_BOOTSTRAP_PASSWORD: adminPassword,
  });
  await pool.query(
    (await readFile(join(root, "deployment/server20/workspace.sql"), "utf8")).replace(
      /^\\set[^\n]*\n/,
      "",
    ),
  );
  stage = "packaged-native-entrypoint";
  app = spawn(node, [join(api, "dist/main.js")], {
    cwd: api,
    env,
    stdio: "ignore",
    windowsHide: true,
  });
  stopped = false;
  ready = false;
  for (let i = 0; i < 60; i++) {
    assert(app.exitCode === null && app.signalCode === null);
    try {
      const r = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(2000) });
      if (r.status === 200) {
        ready = true;
        break;
      }
    } catch {}
    await delay(250);
  }
  assert(ready);
  stage = "real-browser-http-login";
  browser = await chromium.launch({
    executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  assert((await page.goto(origin))?.status() === 200);
  await page.getByLabel("Username", { exact: true }).fill("admin");
  await page.getByLabel("Password", { exact: true }).fill(adminPassword);
  const logged = page.waitForResponse(
    (r) => r.url() === `${origin}/auth/login` && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  assert((await logged).status() === 204);
  await page.waitForFunction(() => !document.querySelector('input[name="password"]'));
  const cookies = await context.cookies();
  assert(
    cookies.some(
      (c) =>
        c.name === "frevos-internal-session" && c.httpOnly && !c.secure && c.sameSite === "Strict",
    ),
  );
  assert(!cookies.some((c) => c.name.startsWith("__Host-frevos")));
  await page.reload();
  await page.waitForFunction(async () => {
    const r = await fetch("/v1/session");
    return r.status === 200;
  });
  assert((await page.locator('input[name="password"]').count()) === 0);
  stage = "browser-csrf-and-logout";
  const result = await page.evaluate(async () => {
    const path = "/v1/workspaces/ws_server20/clients";
    const csrf = document.cookie
      .split("; ")
      .find((c) => c.startsWith("frevos-internal-csrf="))
      ?.split("=")[1];
    const denied = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "HTTP fixture" }),
    });
    const created = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": csrf },
      body: JSON.stringify({ displayName: "HTTP fixture" }),
    });
    const logout = await fetch("/auth/logout", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": csrf },
      body: "{}",
    });
    return {
      denied: denied.status,
      created: created.status,
      logout: logout.status,
      session: (await fetch("/v1/session")).status,
    };
  });
  assert(
    result.denied === 403 &&
      result.created === 201 &&
      result.logout === 204 &&
      result.session === 401,
  );
  console.log(
    "PASS: exact packaged Windows Node entrypoint; disposable PG18/six migrations; actual Edge HTTP login; cookie persistence across reload; browser CSRF denial/create; logout.",
  );
} catch {
  console.error(`FAIL: isolated HTTP artifact stage ${stage}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (app && app.exitCode === null && app.signalCode === null) {
    const exit = new Promise((r) => app.once("exit", r));
    app.kill();
    await Promise.race([exit, delay(5000)]);
  }
  stopped = !app || app.exitCode !== null || app.signalCode !== null;
  if (pool) await pool.end().catch(() => {});
  let containerRemoved = !containerId;
  try {
    if (containerId && /^[a-f0-9]{64}$/.test(containerId)) {
      if (command(docker, ["inspect", "--format", "{{.Name}}", containerId]) !== `/${name}`) {
        process.exitCode = 1;
        console.error("Fixture cleanup identity mismatch; retained");
      } else {
        command(docker, ["stop", "--time", "5", containerId]);
        containerRemoved = true;
      }
    }
  } catch {
    process.exitCode = 1;
    console.error("Fixture cleanup failed; retained identity needs review");
  }
  if (
    nodeRoot &&
    stopped &&
    basename(nodeRoot).startsWith("frevos-http-node-") &&
    dirname(resolve(nodeRoot)) === resolve(tmpdir())
  )
    await rm(nodeRoot, { recursive: true, force: true });
  console.log(
    stopped && containerRemoved
      ? "Owned test processes stopped; disposable database removed."
      : "Native child cleanup incomplete; temporary files retained.",
  );
}
