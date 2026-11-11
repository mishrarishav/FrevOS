import { spawn, spawnSync } from "node:child_process";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const localStackMessage =
  "Local Docker, local databases and localhost preview stacks are disabled for this checkout. Use the verified central Server20 database code-only profile; see docs/CODEBASE_RUNTIME.md. Existing volumes and data are retained.";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeKeys = new Set([
  "FREVOS_PUBLIC_ORIGIN",
  "FREVOS_AUTH_MODE",
  "FREVOS_ALLOW_INTERNAL_HTTP",
  "FREVOS_BASE_PATH",
  "HOST",
  "PORT",
  "FREVOS_OIDC_ISSUER",
  "FREVOS_OIDC_CLIENT_ID",
  "FREVOS_OIDC_CLIENT_SECRET",
  "FREVOS_OIDC_TRANSACTION_KEY",
  "FREVOS_SERVIX_DEPLOYMENT_ROOT",
  "DEVSETU_GIT_EXECUTABLE",
  "DEVSETU_PAPERCLIP_BINDINGS",
  "DEVSETU_REVIEWS_ADMINISTRATORS",
  "DEVSETU_REVIEWS_WORKSPACES",
  "DEVSETU_REVIEWS_MONITORING_ENABLED",
  "NODE_EXTRA_CA_CERTS",
]);
const forbiddenRoles = new Set(["postgres", "root", "frevos_migrator", "frevos_owner"]);
function fail(code) {
  throw new Error(`codebase-runtime:${code}`);
}
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const hasControl = (value, includeSpace = false) =>
  Array.from(value).some(
    (character) =>
      character.charCodeAt(0) < (includeSpace ? 33 : 32) || character.charCodeAt(0) === 127,
  );
function exactKeys(value, required, optional = []) {
  return (
    record(value) &&
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => required.includes(key) || optional.includes(key))
  );
}
export function assertNoLocalStackStartup(command) {
  if (command === "up") throw new Error(localStackMessage);
}
export function codebaseArguments(args) {
  if (args[0] === "--") args = args.slice(1);
  if (args.length !== 2 || args[0] !== "--profile" || !args[1] || args[1].startsWith("-"))
    fail("explicit-profile-required");
  return resolve(args[1]);
}
function loopback(host) {
  const value = host
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  return (
    value === "localhost" ||
    value.endsWith(".localhost") ||
    /^(?:127\.|0\.0\.0\.0$)/.test(value) ||
    ["::1", "::", "0:0:0:0:0:0:0:1", "0:0:0:0:0:0:0:0"].includes(value) ||
    /^(?:::ffff:)?127\./.test(value)
  );
}
export function validateCodebaseProfile(value, now = Date.now()) {
  if (
    !exactKeys(value, [
      "version",
      "verifiedAt",
      "expiresAt",
      "expectedTarget",
      "DATABASE_URL",
      "runtime",
    ]) ||
    value.version !== 1
  )
    fail("invalid-profile");
  if (!exactKeys(value.expectedTarget, ["host", "port", "database", "runtimeRole"]))
    fail("invalid-target-binding");
  const target = value.expectedTarget;
  if (
    typeof target.host !== "string" ||
    !target.host ||
    target.host !== target.host.trim() ||
    target.host.length > 253 ||
    loopback(target.host) ||
    !Number.isInteger(target.port) ||
    target.port < 1 ||
    target.port > 65535 ||
    typeof target.database !== "string" ||
    !/^[a-zA-Z][a-zA-Z0-9_-]{0,62}$/.test(target.database) ||
    typeof target.runtimeRole !== "string" ||
    !/^[a-z][a-z0-9_]{2,62}$/.test(target.runtimeRole) ||
    forbiddenRoles.has(target.runtimeRole)
  )
    fail("invalid-central-target");
  const verified = typeof value.verifiedAt === "string" ? Date.parse(value.verifiedAt) : Number.NaN;
  const expires = typeof value.expiresAt === "string" ? Date.parse(value.expiresAt) : Number.NaN;
  if (
    !Number.isFinite(verified) ||
    !Number.isFinite(expires) ||
    verified > now ||
    expires <= now ||
    expires <= verified
  )
    fail("missing-or-stale-verification");
  if (
    typeof value.DATABASE_URL !== "string" ||
    value.DATABASE_URL.length > 8192 ||
    hasControl(value.DATABASE_URL, true) ||
    /REPLACE_|CHANGE_ME|TODO/i.test(value.DATABASE_URL)
  )
    fail("invalid-database-reference");
  let database;
  try {
    database = new URL(value.DATABASE_URL);
  } catch {
    fail("invalid-database-reference");
  }
  let databaseName, role, password;
  try {
    databaseName = decodeURIComponent(database.pathname.slice(1));
    role = decodeURIComponent(database.username);
    password = decodeURIComponent(database.password);
  } catch {
    fail("invalid-database-reference");
  }
  if (
    !["postgres:", "postgresql:"].includes(database.protocol) ||
    database.hostname.toLowerCase() !== target.host.toLowerCase() ||
    Number(database.port || "5432") !== target.port ||
    databaseName !== target.database ||
    role !== target.runtimeRole ||
    !password ||
    hasControl(password) ||
    database.hash
  )
    fail("database-target-mismatch");
  if (
    database.searchParams.get("sslmode") !== "verify-full" ||
    [...database.searchParams.keys()].some(
      (key) => !["sslmode", "sslrootcert", "sslcert", "sslkey", "application_name"].includes(key),
    )
  )
    fail("verified-database-tls-required");
  if (!record(value.runtime) || Object.keys(value.runtime).some((key) => !runtimeKeys.has(key)))
    fail("invalid-runtime-settings");
  const runtime = {};
  for (const [key, setting] of Object.entries(value.runtime)) {
    if (
      (typeof setting !== "string" && !(key === "PORT" && typeof setting === "number")) ||
      String(setting).length > 100000 ||
      String(setting).includes(String.fromCharCode(0))
    )
      fail("invalid-runtime-settings");
    runtime[key] = String(setting);
  }
  for (const key of ["FREVOS_PUBLIC_ORIGIN", "FREVOS_AUTH_MODE", "HOST", "PORT"])
    if (!runtime[key]) fail("missing-runtime-setting");
  if (
    !["local", "oidc"].includes(runtime.FREVOS_AUTH_MODE) ||
    !/^\d+$/.test(runtime.PORT) ||
    Number(runtime.PORT) < 1 ||
    Number(runtime.PORT) > 65535
  )
    fail("invalid-runtime-settings");
  let origin;
  try {
    origin = new URL(runtime.FREVOS_PUBLIC_ORIGIN);
  } catch {
    fail("invalid-runtime-origin");
  }
  if (
    !["https:", "http:"].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    fail("invalid-runtime-origin");
  if (
    runtime.DEVSETU_REVIEWS_MONITORING_ENABLED !== undefined &&
    !["true", "false"].includes(runtime.DEVSETU_REVIEWS_MONITORING_ENABLED)
  )
    fail("invalid-monitoring-mode");
  runtime.DEVSETU_REVIEWS_MONITORING_ENABLED ??= "false";
  return {
    databaseUrl: value.DATABASE_URL,
    runtime,
    target: { ...target },
    verifiedAt: value.verifiedAt,
    expiresAt: value.expiresAt,
  };
}
function assertPrivateProfile(file, stat) {
  if (process.platform !== "win32") {
    if ((stat.mode & 0o077) !== 0) fail("profile-permissions-too-broad");
    return;
  }
  const script =
    "$ErrorActionPreference='Stop';$a=Get-Acl -LiteralPath $env:DEVSETU_RUNTIME_PROFILE_CHECK;$wide=@('S-1-1-0','S-1-5-7','S-1-5-11','S-1-5-32-545','S-1-5-32-546');foreach($r in $a.Access){$sid=$r.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value;if($r.AccessControlType -eq 'Allow' -and $sid -in $wide){exit 9}}";
  const systemRoot = process.env.SystemRoot;
  if (!systemRoot || !isAbsolute(systemRoot)) fail("profile-permission-check-unavailable");
  const checked = spawnSync(
    join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
    ["-NoProfile", "-NonInteractive", "-Command", script],
    {
      windowsHide: true,
      stdio: "ignore",
      timeout: 10000,
      env: {
        ...process.env,
        DEVSETU_RUNTIME_PROFILE_CHECK: file,
        PSModulePath: join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "Modules"),
      },
    },
  );
  if (checked.error || checked.status !== 0) fail("profile-permissions-unverified");
}
export function loadCodebaseProfile(
  file,
  { now = Date.now(), checkPermissions = assertPrivateProfile } = {},
) {
  let stat, source;
  try {
    stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 131072)
      fail("profile-file-invalid");
    checkPermissions(file, stat);
    source = readFileSync(file, "utf8");
  } catch {
    fail("profile-unavailable-or-unprotected");
  }
  let value;
  try {
    value = JSON.parse(source);
  } catch {
    fail("invalid-profile-json");
  }
  return validateCodebaseProfile(value, now);
}
export function codebaseEnvironment(profile, inherited = process.env) {
  const environment = {};
  for (const [key, value] of Object.entries(inherited))
    if (
      !/^(?:PG|FREVOS|DEVSETU|DATABASE_URL$|MIGRATION_DATABASE_URL$|NODE_OPTIONS$|NODE_TLS_REJECT_UNAUTHORIZED$|NODE_EXTRA_CA_CERTS$)/i.test(
        key,
      )
    )
      environment[key] = value;
  return { ...environment, ...profile.runtime, DATABASE_URL: profile.databaseUrl };
}
export function codebaseLaunchPlan(profile, repositoryRoot = root) {
  const entry = join(repositoryRoot, "apps", "control-plane", "dist", "main.js");
  const index = join(repositoryRoot, "apps", "control-center", "dist", "index.html");
  for (const file of [entry, index]) {
    try {
      const stat = lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink()) fail("build-required");
    } catch {
      fail("build-required");
    }
  }
  const newest = (path) => {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) fail("build-source-invalid");
    return stat.isDirectory()
      ? Math.max(0, ...readdirSync(path).map((name) => newest(join(path, name))))
      : stat.mtimeMs;
  };
  for (const [artifact, inputs] of [
    [
      entry,
      [
        join(repositoryRoot, "apps", "control-plane", "src"),
        join(repositoryRoot, "apps", "control-plane", "migrations"),
      ],
    ],
    [
      join(repositoryRoot, "packages", "contracts", "dist", "index.js"),
      [join(repositoryRoot, "packages", "contracts", "src")],
    ],
    [
      index,
      [
        join(repositoryRoot, "apps", "control-center", "src"),
        join(repositoryRoot, "apps", "control-center", "index.html"),
        join(repositoryRoot, "apps", "control-center", "vite.config.ts"),
      ],
    ],
  ]) {
    try {
      if (Math.max(...inputs.map(newest)) > lstatSync(artifact).mtimeMs) fail("build-required");
    } catch {
      fail("build-required");
    }
  }
  if (profile.runtime.FREVOS_SERVIX_DEPLOYMENT_ROOT) {
    try {
      const stat = lstatSync(profile.runtime.FREVOS_SERVIX_DEPLOYMENT_ROOT);
      if (!stat.isDirectory() || stat.isSymbolicLink())
        fail("platform-state-reference-unavailable");
    } catch {
      fail("platform-state-reference-unavailable");
    }
  }
  return { entry, environment: codebaseEnvironment(profile) };
}
export function logRedactor(profile) {
  const secrets = [profile.databaseUrl];
  try {
    const url = new URL(profile.databaseUrl);
    secrets.push(url.password, decodeURIComponent(url.password));
  } catch {
    /* Profile validation already verified the URL. */
  }
  for (const key of ["FREVOS_OIDC_CLIENT_SECRET", "FREVOS_OIDC_TRANSACTION_KEY"])
    if (profile.runtime[key]) secrets.push(profile.runtime[key]);
  return (value) =>
    secrets.filter(Boolean).reduce((text, secret) => text.replaceAll(secret, "[redacted]"), value);
}
export function forwardRuntimeLog(stream, target, redact) {
  let buffer = "",
    discarding = false;
  const omitted = () => target.write("[oversized runtime log omitted]\n");
  stream.setEncoding("utf8");
  stream.on("data", (part) => {
    if (discarding) {
      const end = part.indexOf("\n");
      if (end < 0) return;
      part = part.slice(end + 1);
      discarding = false;
    }
    buffer += part;
    let end = buffer.indexOf("\n");
    while (end >= 0) {
      const line = buffer.slice(0, end + 1);
      if (line.length > 131072) omitted();
      else target.write(redact(line));
      buffer = buffer.slice(end + 1);
      end = buffer.indexOf("\n");
    }
    if (buffer.length > 131072) {
      omitted();
      buffer = "";
      discarding = true;
    }
  });
  stream.on("end", () => {
    if (buffer && !discarding) target.write(redact(buffer));
  });
}
export function startCodebase(args = process.argv.slice(2)) {
  const file = codebaseArguments(args);
  const profile = loadCodebaseProfile(file);
  const plan = codebaseLaunchPlan(profile);
  const child = spawn(process.execPath, [plan.entry], {
    cwd: root,
    windowsHide: true,
    env: plan.environment,
    stdio: ["inherit", "pipe", "pipe"],
  });
  const redact = logRedactor(profile);
  forwardRuntimeLog(child.stdout, process.stdout, redact);
  forwardRuntimeLog(child.stderr, process.stderr, redact);
  process.once("SIGINT", () => child.kill("SIGINT"));
  process.once("SIGTERM", () => child.kill("SIGTERM"));
  child.once("error", () => {
    console.error(
      "Codebase runtime could not start. No local database or preview fallback was created.",
    );
    process.exitCode = 1;
  });
  child.once("exit", (code) => {
    process.exitCode = code ?? 1;
  });
  console.log(
    "Starting the built codebase with its explicit verified central database profile. No database, migration, seed or Docker stack is started.",
  );
  return child;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    startCodebase();
  } catch (error) {
    console.error(
      error instanceof Error && error.message.startsWith("codebase-runtime:")
        ? error.message
        : "Codebase runtime configuration could not be verified.",
    );
    console.error(
      "Use pnpm start -- --profile <protected-runtime-profile.json>. See docs/CODEBASE_RUNTIME.md. No local fallback was started.",
    );
    process.exitCode = 1;
  }
}
