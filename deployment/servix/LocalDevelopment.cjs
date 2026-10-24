// Local development is a bounded business recipe, never a browser shell.
const fs = require("node:fs/promises"),
  path = require("node:path"),
  net = require("node:net");
const { createHash, createHmac } = require("node:crypto");
const { spawn } = require("node:child_process");
const { EnvironmentEditor } = require("./EnvironmentEditor.cjs");
const scripts = ["start", "dev", "start:dev", "start:cra"];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const digest = (value) => createHash("sha256").update(value).digest("hex");
const fail = (code) => {
  throw Error(code);
};
const envPattern = /^(?:\.env(?:\.[a-zA-Z0-9_-]+)?|appsettings(?:\.[a-zA-Z0-9_-]+)?\.json)$/;
const productionName = (value) => /(?:^|[._-])(?:prod|prd|production)(?:[._-]|$)/i.test(value);
const selectableEnvironment = (value) =>
  envPattern.test(value) &&
  !/(?:^|\.)(?:example|sample|template|old|bak|backup)(?:[.-]|$)/i.test(value);
const allowed = new Set([
  "SystemRoot",
  "WINDIR",
  "PATH",
  "PATHEXT",
  "TEMP",
  "TMP",
  "USERPROFILE",
  "HOME",
  "LOCALAPPDATA",
  "APPDATA",
  "COMSPEC",
  "SystemDrive",
  "ProgramFiles",
  "ProgramFiles(x86)",
  "ProgramW6432",
  "ProgramData",
  "ALLUSERSPROFILE",
  "HOMEDRIVE",
  "HOMEPATH",
]);
function cleanEnvironment() {
  const environment = Object.fromEntries(
    [...allowed].flatMap((key) =>
      process.env[key] === undefined ? [] : [[key, process.env[key]]],
    ),
  );
  const managed = require("./NodeToolchain.cjs").root();
  environment.PATH =
    (process.platform === "win32" ? managed : path.join(managed, "bin")) +
    path.delimiter +
    (environment.PATH || "");
  return environment;
}
async function plain(file) {
  let current = path.resolve(file);
  for (;;) {
    if ((await fs.lstat(current)).isSymbolicLink()) fail("local-development-linked-path");
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}
async function inside(root, relative) {
  if (
    typeof relative !== "string" ||
    (relative !== "." &&
      !relative.split("/").every((p) => /^[A-Za-z0-9_. -]+$/.test(p) && p !== "." && p !== ".."))
  )
    fail("local-development-invalid-path");
  const file = path.resolve(root, relative);
  if (
    file !== path.resolve(root) &&
    !(process.platform === "win32"
      ? file.toLowerCase().startsWith(path.resolve(root).toLowerCase() + path.sep)
      : file.startsWith(path.resolve(root) + path.sep))
  )
    fail("local-development-invalid-path");
  await plain(file);
  return file;
}
async function json(file) {
  if ((await fs.stat(file)).size > 262144) fail("local-development-file-capacity");
  return JSON.parse((await fs.readFile(file, "utf8")).replace(/^\uFEFF/, ""));
}
async function atomic(file, value) {
  const temporary = file + ".tmp";
  const handle = await fs.open(temporary, "w", 0o600);
  try {
    await handle.writeFile(JSON.stringify(value));
    await handle.sync();
  } finally {
    await handle.close();
  }
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(temporary, file);
      return;
    } catch (error) {
      if (attempt >= 5 || !["EPERM", "EACCES", "EBUSY"].includes(error.code)) throw error;
      await sleep(25 * 2 ** attempt);
    }
  }
}
async function discover(root) {
  await plain(root);
  const folders = (await require("./SystemPrerequisites.cjs").projectFolders(root)).map(
    (folder) => path.relative(root, folder).replaceAll(path.sep, "/") || ".",
  );
  const candidates = [];
  for (const context of folders) {
    const directory = await inside(root, context),
      files = await fs.readdir(directory);
    let recipe,
      databaseHint = "application",
      framework,
      available = [],
      name = path.basename(directory),
      bytes;
    if (files.includes("package.json")) {
      await plain(path.join(directory, "package.json"));
      const manifest = await json(path.join(directory, "package.json"));
      available = scripts.filter((s) => typeof manifest.scripts?.[s] === "string");
      if (!available.length) continue;
      name = String(manifest.name || name).slice(0, 80);
      recipe = "npm-script";
      bytes = JSON.stringify(manifest.scripts);
      framework =
        manifest.dependencies?.vite || manifest.devDependencies?.vite
          ? "vite"
          : manifest.dependencies?.["react-scripts"]
            ? "cra"
            : "node";
      databaseHint =
        framework !== "node"
          ? "none"
          : manifest.dependencies?.mysql2
            ? "mysql"
            : manifest.dependencies?.pg
              ? "postgres"
              : "application";
    } else if (files.filter((f) => f.endsWith(".csproj")).length === 1) {
      recipe = "dotnet-run";
      framework = "dotnet";
      const project = files.find((f) => f.endsWith(".csproj"));
      await plain(path.join(directory, project));
      bytes = await fs.readFile(path.join(directory, project));
      if (!/Sdk\s*=\s*["']Microsoft\.NET\.Sdk\.Web["']/i.test(bytes.toString("utf8"))) continue;
    } else continue;
    const environments = [];
    const identities = new Map();
    for (const reference of files.filter(selectableEnvironment).slice(0, 16)) {
      if (!(await fs.lstat(path.join(directory, reference))).isFile()) continue;
      await plain(path.join(directory, reference));
      const values = await environment(directory, reference);
      const identity = databaseIdentity(values);
      identities.set(reference, identity);
      const targets = databaseTargets(values);
      const label = targets
        .map((t) =>
          /^[A-Za-z0-9_.:[\]-]+$/.test(t.host) && /^[A-Za-z0-9_.-]+$/.test(t.database)
            ? t.host + "/" + t.database
            : "Configured database",
        )
        .join(", ")
        .slice(0, 160);
      environments.push({
        reference,
        production: productionName(reference),
        ...(label ? { databaseTarget: label } : {}),
      });
    }
    const productionTargets = environments
      .filter((e) => e.production)
      .map((e) => identities.get(e.reference))
      .filter(Boolean);
    for (const item of environments)
      if (
        identities.get(item.reference) &&
        productionTargets.includes(identities.get(item.reference))
      )
        item.production = true;
    const slug = context
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .slice(0, 44);
    candidates.push({
      id: "svc-" + slug + "-" + digest(context).slice(0, 8),
      name,
      context,
      recipe,
      framework,
      databaseHint,
      scripts: available,
      manifestDigest: digest(bytes),
      environments,
    });
    if (candidates.length >= 24) break;
  }
  return candidates;
}
function parseEnvironment(text) {
  if (Buffer.byteLength(text) > 65536) fail("local-development-environment-capacity");
  const values = Object.create(null);
  for (const raw of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    const match = raw.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) fail("local-development-invalid-environment");
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      if (value[0] === '"')
        value = value.slice(1, -1).replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\"/g, '"');
      else value = value.slice(1, -1);
    } else value = value.replace(/\s+#.*$/, "");
    if (value.includes("\0") || Object.keys(values).length >= 512)
      fail("local-development-invalid-environment");
    values[match[1]] = value;
  }
  return values;
}
function flatten(value, prefix = "", result = {}) {
  for (const [key, item] of Object.entries(value)) {
    if (key === "$schema") continue;
    if (!/^[A-Za-z0-9_.:-]+$/.test(key)) fail("local-development-invalid-environment");
    const name = prefix + key.replaceAll(":", "__");
    if (item && typeof item === "object" && !Array.isArray(item))
      flatten(item, name + "__", result);
    else if (["string", "number", "boolean"].includes(typeof item)) result[name] = String(item);
  }
  return result;
}
async function environment(directory, reference) {
  if (!reference) return {};
  if (!envPattern.test(reference)) fail("local-development-invalid-environment");
  const file = await inside(directory, reference);
  if (reference.endsWith(".json")) {
    let baseline = {};
    if (reference !== "appsettings.json") {
      try {
        baseline = flatten(await json(await inside(directory, "appsettings.json")));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    return { ...baseline, ...flatten(await json(file)) };
  }
  return parseEnvironment(await fs.readFile(file, "utf8"));
}
function databaseTargets(values) {
  if (values.DATABASE_URL) {
    try {
      const url = new URL(values.DATABASE_URL);
      return [
        {
          host: url.hostname.toLowerCase(),
          port: Number(url.port || (url.protocol.startsWith("mysql") ? 3306 : 5432)),
          database: decodeURIComponent(url.pathname.slice(1)),
        },
      ];
    } catch {
      return [];
    }
  }
  if (values.DB_HOST && values.DB_NAME)
    return [
      {
        host: values.DB_HOST.toLowerCase(),
        port: Number(values.DB_PORT || 3306),
        database: values.DB_NAME,
      },
    ];
  if (values.PGHOST && values.PGDATABASE)
    return [
      {
        host: values.PGHOST.toLowerCase(),
        port: Number(values.PGPORT || 5432),
        database: values.PGDATABASE,
      },
    ];
  const targets = [];
  for (const [key, value] of Object.entries(values).filter(([key]) =>
    /^ConnectionStrings__/i.test(key),
  )) {
    const fields = Object.fromEntries(
      String(value)
        .split(";")
        .map((part) => {
          const at = part.indexOf("=");
          return [part.slice(0, at).trim().toLowerCase(), part.slice(at + 1).trim()];
        }),
    );
    const host = fields.server || fields.host || fields["data source"],
      database = fields.database || fields["initial catalog"];
    if (host && database)
      targets.push({ host: host.toLowerCase(), port: Number(fields.port || 1433), database });
  }
  return targets;
}
function databaseIdentity(values) {
  const targets = databaseTargets(values).sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b)),
  );
  return targets.length ? digest(JSON.stringify(targets)) : null;
}
function validatePlan(plan, candidates) {
  if (
    !plan ||
    Object.keys(plan).join() !== "services" ||
    !Array.isArray(plan.services) ||
    !plan.services.length ||
    plan.services.length > 12
  )
    fail("local-development-invalid-plan");
  const ids = new Set(),
    ports = new Set();
  for (const service of plan.services) {
    if (
      Object.keys(service).some(
        (k) =>
          ![
            "id",
            "port",
            "script",
            "database",
            "apiServiceId",
            "developmentEnvironment",
            "productionEnvironment",
          ].includes(k),
      )
    )
      fail("local-development-invalid-plan");
    const candidate = candidates.find((c) => c.id === service.id);
    if (
      !candidate ||
      ids.has(service.id) ||
      ports.has(service.port) ||
      !Number.isInteger(service.port) ||
      service.port < 1024 ||
      service.port > 65535
    )
      fail("local-development-invalid-plan");
    if (!["none", "mysql", "postgres", "application"].includes(service.database))
      fail("local-development-invalid-plan");
    if (
      service.database === "none" &&
      (["mysql", "postgres"].includes(candidate.databaseHint) ||
        candidate.environments.some((e) => e.databaseTarget))
    )
      fail("local-development-database-profile-required");
    if (candidate.recipe === "npm-script" && !candidate.scripts.includes(service.script))
      fail("local-development-script-unavailable");
    if (candidate.recipe === "dotnet-run" && service.script) fail("local-development-invalid-plan");
    for (const ref of [service.developmentEnvironment, service.productionEnvironment])
      if (ref && !candidate.environments.some((e) => e.reference === ref))
        fail("local-development-environment-unavailable");
    if (
      service.developmentEnvironment &&
      (productionName(service.developmentEnvironment) ||
        candidate.environments.find((e) => e.reference === service.developmentEnvironment)
          ?.production)
    )
      fail("local-development-production-profile-denied");
    if (
      service.apiServiceId &&
      (service.apiServiceId === service.id ||
        !plan.services.some((s) => s.id === service.apiServiceId && s.database !== "none"))
    )
      fail("local-development-api-binding-invalid");
    ids.add(service.id);
    ports.add(service.port);
  }
}
function mysqlReadOnlyGrants(grants, database) {
  if (typeof database !== "string" || !database || !grants.length) return false;
  const expected = "`" + database.replaceAll("`", "``") + "`.*";
  return grants.every((grant) => {
    const parsed = grant.match(/^GRANT (.+?) ON (.+?) TO .+$/i);
    if (!parsed || /WITH GRANT OPTION|IDENTIFIED|REQUIRE/i.test(grant)) return false;
    const privileges = parsed[1].split(/,\s*/);
    if (parsed[2] === "*.*") return privileges.length === 1 && privileges[0] === "USAGE";
    return parsed[2] === expected && privileges.every((p) => p === "SELECT" || p === "SHOW VIEW");
  });
}
async function readOnlyDatabase(directory, driver, env) {
  // Verify privileges, not an application checkbox or transaction default.
  // Unknown role inheritance/privileges fail closed. No write probe is used.
  if (driver === "mysql") {
    const mysql = require(path.join(directory, "node_modules/mysql2/promise"));
    const connection = await mysql.createConnection({
      host: env.DB_HOST,
      port: Number(env.DB_PORT || 3306),
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
      connectTimeout: 5000,
      multipleStatements: false,
    });
    try {
      const [rows] = await connection.query("SHOW GRANTS FOR CURRENT_USER");
      const grants = rows.map((row) => String(Object.values(row)[0]));
      if (!mysqlReadOnlyGrants(grants, env.DB_NAME))
        fail("local-development-production-readonly-required");
      await connection.query("SELECT 1");
    } finally {
      await connection.end();
    }
  } else if (driver === "postgres") {
    const { Client } = require(path.join(directory, "node_modules/pg"));
    const connection = new Client(
      env.DATABASE_URL
        ? { connectionString: env.DATABASE_URL, connectionTimeoutMillis: 5000 }
        : {
            host: env.PGHOST,
            port: Number(env.PGPORT || 5432),
            database: env.PGDATABASE,
            user: env.PGUSER,
            password: env.PGPASSWORD,
            connectionTimeoutMillis: 5000,
          },
    );
    await connection.connect();
    try {
      const standby = await connection.query("SELECT pg_is_in_recovery() AS readonly");
      if (!standby.rows[0]?.readonly)
        fail("local-development-production-readonly-replica-required");
      const role = await connection.query(
        "SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=current_user",
      );
      const inherited = await connection.query(
        "SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user) LIMIT 1",
      );
      const writes = await connection.query(
        "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND (has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') OR c.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)) LIMIT 1",
      );
      const create = await connection.query(
        "SELECT 1 FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND has_schema_privilege(current_user,oid,'CREATE') LIMIT 1",
      );
      if (
        !role.rows.length ||
        Object.values(role.rows[0]).some(Boolean) ||
        inherited.rowCount ||
        writes.rowCount ||
        create.rowCount
      )
        fail("local-development-production-readonly-required");
    } finally {
      await connection.end();
    }
  } else fail("local-development-production-readonly-unverified");
}
async function tool(name) {
  for (const folder of (process.env.PATH || "").split(path.delimiter)) {
    const file = path.join(folder.replace(/^"|"$/g, ""), name);
    try {
      if ((await fs.stat(file)).isFile()) {
        const resolved = process.platform === "linux" ? await fs.realpath(file) : file;
        await plain(resolved);
        return resolved;
      }
    } catch {}
  }
  fail("local-development-toolchain-unavailable");
}
const powershell = () =>
  path.join(process.env.WINDIR, "System32/WindowsPowerShell/v1.0/powershell.exe");
async function processQuery(input) {
  if (process.platform === "linux") return require("./LinuxProcesses.cjs").query(input);
  return new Promise((resolve, reject) => {
    const child = spawn(
      powershell(),
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "RemoteSigned",
        "-File",
        path.join(__dirname, "LocalDevProcesses.ps1"),
      ],
      { windowsHide: true, stdio: ["pipe", "pipe", "ignore"], env: cleanEnvironment() },
    );
    let output = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(Error("local-development-process-check-failed"));
    }, 20000);
    child.stdout.on("data", (bytes) => {
      if (output.length < 8192) output += bytes;
    });
    child.on("error", () => {
      clearTimeout(timer);
      reject(Error("local-development-process-check-failed"));
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      try {
        if (code !== 0) throw Error();
        resolve(JSON.parse(output));
      } catch {
        reject(Error("local-development-process-check-failed"));
      }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify(input));
  });
}
async function listening(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    const finish = (yes) => {
      socket.destroy();
      resolve(yes);
    };
    socket.setTimeout(500);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}
function controller(launch) {
  if (process.platform === "linux") return require("./LinuxController.cjs").controller(launch);
  return new Promise((resolve, reject) => {
    const child = spawn(
      powershell(),
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "RemoteSigned",
        "-File",
        path.join(__dirname, "Run-LocalDevService.ps1"),
      ],
      { windowsHide: true, stdio: ["pipe", "pipe", "ignore"], env: cleanEnvironment() },
    );
    let output = "",
      settled = false;
    const timer = setTimeout(() => {
      child.stdin.end("stop\n");
      reject(Error("local-development-controller-timeout"));
    }, 20000);
    child.stdin.on("error", () => {});
    child.stdout.on("data", (bytes) => {
      output += bytes;
      if (output.length > 4096) {
        child.stdin.end("stop\n");
        return;
      }
      if (!output.includes("\n") || settled) return;
      try {
        const record = JSON.parse(output.trim());
        if (!Number.isInteger(record.pid) || !Number.isFinite(Date.parse(record.createdAt)))
          throw Error();
        settled = true;
        clearTimeout(timer);
        resolve({ child, pid: record.pid, startedAt: new Date(record.createdAt).toISOString() });
      } catch {
        child.stdin.end("stop\n");
        clearTimeout(timer);
        reject(Error("local-development-controller-failed"));
      }
    });
    child.on("error", () => {
      clearTimeout(timer);
      reject(Error("local-development-controller-failed"));
    });
    child.on("exit", () => {
      if (!settled) {
        clearTimeout(timer);
        reject(Error("local-development-controller-failed"));
      }
    });
    child.stdin.write(JSON.stringify({ ...launch, parentId: process.pid }) + "\n");
  });
}
class LocalDevelopmentRuntime {
  constructor(config, inspectRepository) {
    this.config = config;
    this.inspectRepository = inspectRepository;
    this.root = path.join(config.stateRoot, "local-development");
    this.controllers = new Map();
    this.states = new Map();
    this.planRecord = null;
    this.chain = Promise.resolve();
    this.environmentEditor = new EnvironmentEditor(config.credential);
  }
  serial(fn) {
    const next = this.chain.then(fn);
    this.chain = next.catch(() => {});
    return next;
  }
  async initialize() {
    if (!["win32", "linux"].includes(process.platform))
      fail("local-development-platform-unsupported");
    await fs.mkdir(this.root, { recursive: true });
    await plain(this.root);
    try {
      this.planRecord = await json(path.join(this.root, "configuration.json"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  async catalog() {
    await this.inspectRepository(this.config);
    const candidates = await discover(this.config.repository);
    const environmentProofs = [];
    for (const candidate of candidates)
      for (const environment of candidate.environments) {
        const directory = await inside(this.config.repository, candidate.context);
        const file = await inside(directory, environment.reference);
        if ((await fs.stat(file)).size > 262144) fail("local-development-environment-capacity");
        environmentProofs.push(
          createHmac("sha256", this.config.credential)
            .update(candidate.context + "/" + environment.reference)
            .update(await fs.readFile(file))
            .digest("hex"),
        );
      }
    const catalog = {
      candidates,
      fingerprint: createHmac("sha256", this.config.credential)
        .update(JSON.stringify({ candidates, environmentProofs }))
        .digest("hex"),
    };
    this.lastCatalog = catalog;
    return catalog;
  }
  snapshot() {
    return this.serial(() => this.snapshotInternal());
  }
  async snapshotInternal() {
    let catalog,
      sourceReady = true;
    try {
      catalog = await this.catalog();
    } catch {
      sourceReady = false;
      catalog = this.lastCatalog ||
        this.planRecord?.catalog || {
          candidates: [],
          fingerprint: createHmac("sha256", this.config.credential)
            .update("unavailable")
            .digest("hex"),
        };
    }
    const services = [];
    for (const service of this.planRecord?.plan.services || []) {
      const state = this.states.get(service.id) || { id: service.id, status: "stopped" };
      const candidate = catalog.candidates.find((c) => c.id === service.id);
      const owned = this.controllers.get(service.id);
      if (owned && !sourceReady && (await listening(service.port))) {
        state.status = "running";
      } else if (candidate && sourceReady && (await listening(service.port))) {
        const observedProcess = await processQuery({
          operation: "inspect",
          port: service.port,
          directory: await inside(this.config.repository, candidate.context),
          ...(owned
            ? { controllerId: process.platform === "linux" ? owned.pid : owned.child.pid }
            : {}),
        });
        if (owned && observedProcess?.projectOwned) state.status = "running";
        else if (!owned && observedProcess) {
          state.status = "port-conflict";
          state.existing = {
            ...observedProcess,
            identity: createHmac("sha256", this.config.credential)
              .update(JSON.stringify(observedProcess))
              .digest("hex"),
          };
        }
      } else if (owned && Date.now() - Date.parse(owned.startedAt) > 180000) {
        await this.stop(service.id);
        state.status = "failed";
        state.errorCode = "local-development-startup-timeout";
      } else if (!owned && state.status === "port-conflict") {
        state.status = "stopped";
        delete state.existing;
      }
      this.states.set(service.id, state);
      services.push({ ...state });
    }
    return {
      version: 1,
      deviceId: this.config.deviceId,
      profileId: this.config.profileId || "servix-development",
      fingerprint: catalog.fingerprint,
      candidates: catalog.candidates,
      revision: this.planRecord?.revision || 0,
      sourceReady,
      plan: this.planRecord?.plan || null,
      services,
      environmentEditor: this.environmentEditor.metadata(),
    };
  }
  hasRunning() {
    return this.controllers.size > 0;
  }
  async stop(id) {
    const owned = this.controllers.get(id);
    if (!owned) return;
    owned.stopping = true;
    owned.child.stdin.end("stop\n");
    const deadline = Date.now() + 15000;
    while (owned.child.exitCode === null && Date.now() < deadline) await sleep(100);
    if (owned.child.exitCode === null) fail("local-development-stop-unconfirmed");
    this.controllers.delete(id);
    this.states.set(id, { id, status: "stopped" });
  }
  async launch(service, candidate, mode) {
    if (this.controllers.has(service.id)) {
      if (this.states.get(service.id)?.mode !== mode)
        fail("local-development-restart-to-change-database");
      return;
    }
    if (await listening(service.port)) fail("local-development-port-in-use");
    const prerequisites = await require("./SystemPrerequisites.cjs").inspect(
      this.config.repository,
    );
    if (prerequisites.blocked.length || prerequisites.tools.some((t) => t.status !== "ready"))
      fail("local-development-prerequisites-required");
    const directory = await inside(this.config.repository, candidate.context);
    const reference =
      mode === "production" ? service.productionEnvironment : service.developmentEnvironment;
    if (service.database !== "none" && !reference)
      fail("local-development-database-profile-required");
    const selected = await environment(directory, reference);
    if (service.database !== "none" && !databaseIdentity(selected))
      fail("local-development-database-profile-required");
    if (mode === "development") {
      if (reference && productionName(reference))
        fail("local-development-production-profile-denied");
      const identity = databaseIdentity(selected);
      if (identity)
        for (const other of candidate.environments.filter((e) => e.production))
          if (databaseIdentity(await environment(directory, other.reference)) === identity)
            fail("local-development-production-profile-denied");
    } else if (service.database !== "none")
      await readOnlyDatabase(directory, service.database, selected);
    // Frontend processes receive only public application variables; backend DB
    // profiles never become Vite/CRA compile-time browser values.
    const values =
      service.database === "none"
        ? Object.fromEntries(
            Object.entries(selected).filter(
              ([k]) =>
                /^(?:REACT_APP_|VITE_|PUBLIC_)/.test(k) &&
                !/password|secret|token|credential|database|db_/i.test(k),
            ),
          )
        : selected;
    if (service.database === "none" && service.apiServiceId) {
      const api = this.planRecord.plan.services.find((s) => s.id === service.apiServiceId);
      if (!api) fail("local-development-api-binding-invalid");
      for (const key of [
        "REACT_APP_API_URL",
        "REACT_APP_API_BASE_URL",
        "VITE_API_URL",
        "VITE_API_BASE_URL",
        "PUBLIC_API_URL",
      ])
        values[key] = "http://localhost:" + api.port + "/api";
    } else if (mode === "production" && service.database === "none" && reference)
      fail("local-development-production-api-binding-required");
    const env = {
      ...cleanEnvironment(),
      ...values,
      NODE_ENV: "development",
      HOST: "localhost",
      PORT: String(service.port),
      BROWSER: "none",
      CI: "true",
      ASPNETCORE_ENVIRONMENT: "Development",
      ASPNETCORE_URLS: "http://localhost:" + service.port,
      DOTNET_ENVIRONMENT: "Development",
      Database__AutoMigrate: "false",
      BackgroundWorkers__Enabled: "false",
      EngineHistory__Enabled: "false",
      EngineActivity__Enabled: "false",
      DOTNET_CLI_TELEMETRY_OPTOUT: "1",
      DOTNET_CLI_WORKLOAD_UPDATE_NOTIFY_DISABLE: "true",
      DOTNET_PROCESSOR_COUNT: "2",
    };
    for (const key of Object.keys(env))
      if (
        /^(?:NODE_OPTIONS|NODE_PATH|DOTNET_STARTUP_HOOKS|DOTNET_ADDITIONAL_DEPS|COMPLUS_|COR_|CORECLR_|LD_|FREVOS_|DEVSETU_)/i.test(
          key,
        )
      )
        delete env[key];
    env.NODE_OPTIONS =
      '--require "' + path.join(__dirname, "LocalDevBoundary.cjs").replaceAll("\\", "/") + '"';
    const endpoints = this.planRecord.plan.services.map((s) => ({
      host: "localhost",
      port: s.port,
    }));
    if (service.database === "mysql" && selected.DB_HOST)
      endpoints.push({ host: selected.DB_HOST, port: Number(selected.DB_PORT || 3306) });
    if (service.database === "postgres") {
      if (selected.DATABASE_URL) {
        const url = new URL(selected.DATABASE_URL);
        endpoints.push({ host: url.hostname, port: Number(url.port || 5432) });
      } else if (selected.PGHOST)
        endpoints.push({ host: selected.PGHOST, port: Number(selected.PGPORT || 5432) });
    }
    env.DEVSETU_LOCAL_EGRESS = JSON.stringify(endpoints);
    if (reference && !reference.endsWith(".json") && service.database !== "none")
      env.ENV_FILE = path.join(directory, reference);
    let executable, arguments_;
    if (candidate.recipe === "npm-script") {
      const selected = await require("./NodeToolchain.cjs").selection(this.config.repository);
      const cli =
        selected?.npm ??
        (await require("./SystemPrerequisites.cjs").npmCli(this.config.repository));
      await plain(cli);
      executable = selected?.node ?? process.execPath;
      env.PATH = path.dirname(executable) + path.delimiter + env.PATH;
      arguments_ = [cli, "--prefix", directory, "run", service.script];
      if (candidate.framework === "vite")
        arguments_.push(
          "--",
          "--host",
          "localhost",
          "--port",
          String(service.port),
          "--strictPort",
        );
    } else {
      const sdk =
        process.platform === "linux"
          ? await require("./DotNetToolchain.cjs").forProject(this.config.repository, directory)
          : null;
      executable =
        sdk?.executable ?? (await tool(process.platform === "win32" ? "dotnet.exe" : "dotnet"));
      if (sdk) {
        env.DOTNET_ROOT = sdk.directory;
        env.DOTNET_MULTILEVEL_LOOKUP = "0";
        env.PATH = sdk.directory + path.delimiter + env.PATH;
      }
      arguments_ = [
        "run",
        "--no-launch-profile",
        "--project",
        directory,
        "--",
        "--urls",
        "http://localhost:" + service.port,
        "--Database:AutoMigrate=false",
        "--BackgroundWorkers:Enabled=false",
        "--EngineHistory:Enabled=false",
        "--EngineActivity:Enabled=false",
      ];
    }
    const owned = await controller({
      executable,
      arguments: arguments_,
      directory,
      environment: env,
      ...(process.platform === "linux"
        ? {
            connectorUnit: this.config.linuxService,
            credentialFile: this.config.credentialFile,
            stateRoot: this.config.stateRoot,
          }
        : {}),
    });
    this.controllers.set(service.id, owned);
    this.states.set(service.id, {
      id: service.id,
      status: "starting",
      mode,
      pid: owned.pid,
      startedAt: owned.startedAt,
      previewUrl: "http://localhost:" + service.port + "/",
    });
    owned.child.once("exit", () => {
      if (!owned.stopping) {
        this.controllers.delete(service.id);
        this.states.set(service.id, {
          id: service.id,
          status: "failed",
          mode,
          errorCode: "local-development-process-exited",
        });
      }
    });
  }
  execute(job) {
    return this.serial(() => this.executeInternal(job));
  }
  async executeInternal(job) {
    const request = job.request;
    if (
      job.workspaceId !== "ws_server20" ||
      request.deviceId !== this.config.deviceId ||
      request.profileId !== (this.config.profileId || "servix-development") ||
      !/^ld_[a-f0-9]{32}$/.test(request.requestId)
    )
      fail("local-development-scope-mismatch");
    const receiptFile = path.join(this.root, request.requestId + ".receipt.json");
    const requestHash = digest(JSON.stringify(request));
    try {
      const receipt = await json(receiptFile);
      if (receipt.requestHash !== requestHash) fail("local-development-idempotency-conflict");
      return receipt.result;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const claim = path.join(this.root, request.requestId + ".claim");
    try {
      const file = await fs.open(claim, "wx", 0o600);
      await file.writeFile(requestHash);
      await file.sync();
      await file.close();
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      return {
        requestId: request.requestId,
        status: "recovery-required",
        errorCode: "local-development-interrupted-action",
      };
    }
    let result;
    try {
      const snapshot = await this.snapshotInternal();
      if (
        ![
          "configure",
          "start",
          "stop",
          "restart",
          "kill-existing",
          "environment-read",
          "environment-save",
        ].includes(request.operation) ||
        request.version !== 1 ||
        Date.parse(job.expiresAt) <= Date.now()
      )
        fail("local-development-invalid-action");
      if (
        ["start", "restart"].includes(request.operation) &&
        !["development", "production"].includes(request.mode)
      )
        fail("local-development-invalid-action");
      if (request.operation !== "stop" && !snapshot.sourceReady)
        fail("local-development-source-unavailable");
      if (
        request.expectedRevision !== snapshot.revision ||
        request.fingerprint !== snapshot.fingerprint
      )
        fail("local-development-observation-changed");
      let environment;
      if (["environment-read", "environment-save"].includes(request.operation)) {
        const candidate = snapshot.candidates.find((c) => c.id === request.serviceId);
        if (
          !candidate?.environments.some((e) => e.reference === request.reference) ||
          !/^\.env(?:\.[A-Za-z0-9_-]+)?$/.test(request.reference)
        )
          fail("local-development-environment-unavailable");
        const directory = await inside(this.config.repository, candidate.context);
        const file = await inside(directory, request.reference);
        if (request.operation === "environment-read") {
          environment = await this.environmentEditor.read(
            file,
            request.serviceId,
            request.reference,
          );
        } else {
          if (
            this.hasRunning() ||
            snapshot.services.some((s) =>
              ["starting", "running", "port-conflict"].includes(s.status),
            )
          )
            fail("local-development-stop-before-environment-save");
          await this.environmentEditor.save(file, request);
          // A saved file is an explicit local configuration change. Retain the
          // service plan and advance its freshness without silently starting it.
          if (this.planRecord) {
            const catalog = await this.catalog();
            const record = {
              ...this.planRecord,
              revision: this.planRecord.revision + 1,
              fingerprint: catalog.fingerprint,
              catalog,
            };
            await atomic(path.join(this.root, "configuration.json"), record);
            this.planRecord = record;
          }
        }
      } else if (request.operation === "configure") {
        if (this.hasRunning()) fail("local-development-stop-before-configuration");
        validatePlan(request.plan, snapshot.candidates);
        const record = {
          revision: snapshot.revision + 1,
          plan: request.plan,
          fingerprint: snapshot.fingerprint,
          catalog: { fingerprint: snapshot.fingerprint, candidates: snapshot.candidates },
        };
        await atomic(path.join(this.root, "configuration.json"), record);
        this.planRecord = record;
        this.states.clear();
      } else {
        const services = (snapshot.plan?.services || []).filter(
          (s) => !request.serviceId || s.id === request.serviceId,
        );
        if (!services.length) fail("local-development-configuration-required");
        if (request.operation === "kill-existing") {
          const state = snapshot.services.find((s) => s.id === request.serviceId);
          if (!state?.existing?.projectOwned || state.existing.identity !== request.identity)
            fail("local-development-process-changed");
          const candidate = snapshot.candidates.find((c) => c.id === request.serviceId);
          await processQuery({
            operation: "stop",
            directory: await inside(this.config.repository, candidate.context),
            port: services[0].port,
            expectedPid: state.existing.pid,
            expectedCreatedAt: state.existing.createdAt,
          });
          this.states.set(request.serviceId, { id: request.serviceId, status: "stopped" });
        } else {
          if (["stop", "restart"].includes(request.operation))
            for (const service of services) await this.stop(service.id);
          if (["start", "restart"].includes(request.operation)) {
            if (this.planRecord.fingerprint !== snapshot.fingerprint)
              fail("local-development-configuration-stale");
            validatePlan(snapshot.plan, snapshot.candidates);
            for (const service of services) {
              try {
                await this.launch(
                  service,
                  snapshot.candidates.find((c) => c.id === service.id),
                  request.mode,
                );
              } catch (error) {
                const failed = {
                  id: service.id,
                  status: "failed",
                  errorCode: /^local-development-[a-z-]+$/.test(error.message)
                    ? error.message
                    : "local-development-start-failed",
                };
                if (this.controllers.has(service.id) && this.states.has(service.id))
                  this.states.get(service.id).errorCode = failed.errorCode;
                else this.states.set(service.id, failed);
                throw error;
              }
            }
          }
        }
      }
      result = {
        requestId: request.requestId,
        status: "succeeded",
        ...(environment ? { environment } : {}),
      };
    } catch (error) {
      result = {
        requestId: request.requestId,
        status: "failed",
        errorCode: /^local-development-[a-z-]+$/.test(error.message)
          ? error.message
          : "local-development-action-failed",
      };
    }
    const file = await fs.open(receiptFile, "wx", 0o600);
    try {
      await file.writeFile(JSON.stringify({ requestHash, result }));
      await file.sync();
    } finally {
      await file.close();
    }
    return result;
  }
  async close() {
    for (const id of [...this.controllers.keys()]) await this.stop(id);
  }
}
function start(config, inspectRepository, api) {
  const runtime = new LocalDevelopmentRuntime(config, inspectRepository);
  let stopped = false,
    refreshBusy = false;
  const refresh = async () => {
    if (refreshBusy || stopped) return;
    refreshBusy = true;
    try {
      await api("/v1/connector/local-development/observe", await runtime.snapshot());
    } catch {
    } finally {
      refreshBusy = false;
    }
  };
  const loop = (async () => {
    await runtime.initialize();
    const timer = setInterval(() => void refresh(), 4000);
    timer.unref();
    while (!stopped) {
      try {
        await refresh();
        const { job } = await api("/v1/connector/local-development/claim", {});
        if (job) {
          const result = await runtime.execute(job);
          await refresh();
          await api("/v1/connector/local-development/complete", result);
        }
      } catch (error) {
        if (/^connector-http-(?:401|403)$/.test(error.message))
          await runtime.close().catch(() => {});
        /* No raw application, database or transport errors are persisted. */
      }
      await sleep(2000);
    }
    clearInterval(timer);
  })();
  loop.catch(() => {});
  return {
    runtime,
    stop: async () => {
      stopped = true;
      await runtime.close();
    },
  };
}
module.exports = {
  discover,
  parseEnvironment,
  validatePlan,
  databaseIdentity,
  readOnlyDatabase,
  mysqlReadOnlyGrants,
  LocalDevelopmentRuntime,
  start,
};
