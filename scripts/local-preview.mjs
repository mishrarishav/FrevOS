import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const localDirectory = join(root, ".local");
const environmentFile = join(localDirectory, ".env.local");
const composeArguments = ["compose", "--env-file", environmentFile, "-f", "compose.local.yaml"];
const command = process.argv[2];

function secret(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

function ensureEnvironment() {
  mkdirSync(localDirectory, { recursive: true });
  if (existsSync(environmentFile)) return false;
  const values = {
    FREVOS_DB_MIGRATOR_PASSWORD: secret(),
    FREVOS_DB_RUNTIME_PASSWORD: secret(),
    FREVOS_DB_KEYCLOAK_PASSWORD: secret(),
    FREVOS_KEYCLOAK_ADMIN_PASSWORD: secret(),
    FREVOS_OIDC_CLIENT_SECRET: secret(),
    FREVOS_OIDC_TRANSACTION_KEY: secret(32),
    FREVOS_LOCAL_ADMIN_PASSWORD: secret(18),
    FREVOS_LOCAL_VIEWER_PASSWORD: secret(18),
  };
  writeFileSync(
    environmentFile,
    `${Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n")}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  return true;
}

function docker(args, options = {}) {
  const result = spawnSync("docker", [...composeArguments, ...args], {
    cwd: root,
    encoding: options.encoding ?? "utf8",
    stdio: options.stdio ?? "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result.stdout?.trim();
}

function requireEnvironment() {
  if (!existsSync(environmentFile)) {
    throw new Error("Local secrets are missing. Run `pnpm local:up` first.");
  }
}

switch (command) {
  case "up": {
    const created = ensureEnvironment();
    docker(["up", "--build", "--wait"]);
    const certificate = docker(
      ["exec", "-T", "caddy", "cat", "/data/caddy/pki/authorities/local/root.crt"],
      { stdio: ["ignore", "pipe", "inherit"] },
    );
    writeFileSync(join(localDirectory, "caddy-root.crt"), `${certificate}\n`, "utf8");
    console.log("FrevOS Local Preview: https://frevos.localhost:8443");
    console.log("Trust instructions: docs/LOCAL_PREVIEW.md");
    if (created) {
      console.log("Synthetic login passwords were written only to .local/.env.local.");
    }
    break;
  }
  case "down":
    requireEnvironment();
    docker(["down"]);
    break;
  case "status":
    requireEnvironment();
    docker(["ps"]);
    break;
  case "logs":
    requireEnvironment();
    docker(["logs", "--follow", "--tail", "200"]);
    break;
  case "backup": {
    requireEnvironment();
    const backupDirectory = join(root, "backups", "local");
    mkdirSync(backupDirectory, { recursive: true });
    const stamp = new Date().toISOString().replaceAll(":", "-");
    const target = join(backupDirectory, `frevos-${stamp}.dump`);
    const descriptor = openSync(target, "wx", 0o600);
    const result = spawnSync(
      "docker",
      [
        ...composeArguments,
        "exec",
        "-T",
        "postgres",
        "pg_dump",
        "-U",
        "frevos_migrator",
        "-d",
        "frevos",
        "-Fc",
        "--schema=frevos",
        "--table=public.frevos_schema_migrations",
      ],
      { cwd: root, stdio: ["ignore", descriptor, "inherit"] },
    );
    closeSync(descriptor);
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
    console.log(`Backup written to ${target}`);
    break;
  }
  case "restore": {
    requireEnvironment();
    const source = resolve(root, process.argv[3] ?? "");
    const allowedDirectory = resolve(root, "backups", "local");
    if (!source.startsWith(`${allowedDirectory}\\`) && !source.startsWith(`${allowedDirectory}/`)) {
      throw new Error("Restore source must be inside backups/local.");
    }
    if (!existsSync(source) || process.argv[4] !== "--confirm-local-restore") {
      throw new Error(
        "Use `pnpm local:restore -- backups/local/<file>.dump --confirm-local-restore`.",
      );
    }
    docker(["stop", "frevos"]);
    docker(["cp", source, `postgres:/tmp/${basename(source)}`]);
    docker([
      "exec",
      "-T",
      "postgres",
      "pg_restore",
      "-U",
      "frevos_migrator",
      "-d",
      "frevos",
      "--clean",
      "--if-exists",
      `/tmp/${basename(source)}`,
    ]);
    docker([
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "frevos_migrator",
      "-d",
      "frevos",
      "-c",
      "UPDATE frevos.sessions SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP WHERE status = 'active'",
    ]);
    docker(["start", "frevos"]);
    console.log(`Restored ${source}. Run pnpm local:status to verify health.`);
    break;
  }
  default:
    throw new Error("Expected one of: up, down, status, logs, backup, restore.");
}
