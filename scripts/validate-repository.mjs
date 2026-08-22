import { access, readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ignoredDirectories = new Set([".git", ".local", "coverage", "dist", "node_modules"]);
const ignoredFileNames = new Set(
  (await readFile(join(repositoryRoot, ".gitignore"), "utf8"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !line.startsWith("#") &&
        !line.startsWith("!") &&
        !line.endsWith("/") &&
        !line.includes("/") &&
        !/[?*[\]\\]/.test(line),
    ),
);
const requiredDocuments = [
  "AGENTS.md",
  "README.md",
  "docs/ARCHITECTURE.md",
  "docs/CURRENT_STATE.md",
  "docs/MERGE_POLICY.md",
  "docs/LOCAL_PREVIEW.md",
  "docs/PERMISSIONS.md",
  "docs/PHASE_4_UAT_RUNBOOK.md",
  "docs/PHASE_4_WINDOWS_UAT_RUNBOOK.md",
  "docs/PRODUCT.md",
  "docs/ROADMAP.md",
  "docs/SECURITY.md",
  "docs/adr/README.md",
];

const errors = [];

function normalizeNewlines(content) {
  return content.replace(/\r\n?/g, "\n");
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function collectMarkdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
      continue;
    }

    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".md") && !ignoredFileNames.has(entry.name)) {
      files.push(entryPath);
    }
  }

  return files;
}

function validateDocumentStructure(file, content) {
  const repositoryPath = relative(repositoryRoot, file).replaceAll("\\", "/");
  const lines = normalizeNewlines(content).split("\n");

  for (const [index, line] of lines.entries()) {
    if (/[\t ]+$/.test(line)) {
      errors.push(`${repositoryPath}:${index + 1} has trailing whitespace`);
    }
  }

  if (!repositoryPath.startsWith(".github/")) {
    const topLevelHeadings = lines.filter((line) => line.startsWith("# ")).length;
    if (topLevelHeadings !== 1) {
      errors.push(`${repositoryPath} must contain exactly one top-level heading`);
    }
  }

  const codeFences = lines.filter((line) => line.startsWith("```")).length;
  if (codeFences % 2 !== 0) {
    errors.push(`${repositoryPath} has unbalanced fenced code blocks`);
  }
}

async function validateRelativeLinks(file, content) {
  const repositoryPath = relative(repositoryRoot, file);
  const markdownLink = /\[[^\]]+\]\(([^)]+)\)/g;

  for (const match of content.matchAll(markdownLink)) {
    let target = match[1];
    if (!target || /^(?:[a-z]+:|#)/i.test(target)) {
      continue;
    }

    target = target.replace(/^<|>$/g, "").split("#", 1)[0];
    if (!target) {
      continue;
    }

    const decodedTarget = decodeURIComponent(target);
    const targetPath = resolve(dirname(file), decodedTarget);
    if (!(await pathExists(targetPath))) {
      errors.push(`${repositoryPath} links to missing path ${target}`);
    }
  }
}

async function validateRuleset() {
  const rulesetPath = join(repositoryRoot, ".github/rulesets/protect-main.json");
  const ruleset = JSON.parse(await readFile(rulesetPath, "utf8"));
  const ruleByType = new Map(ruleset.rules?.map((rule) => [rule.type, rule]));
  const pullRequest = ruleByType.get("pull_request")?.parameters;
  const statusChecks = ruleByType.get("required_status_checks")?.parameters;

  if (ruleset.name !== "Protect main" || ruleset.enforcement !== "active") {
    errors.push("Protect main ruleset must remain active in desired state");
  }
  if (!ruleByType.has("deletion") || !ruleByType.has("non_fast_forward")) {
    errors.push("Protect main ruleset must block deletion and force updates");
  }
  if (
    pullRequest?.required_approving_review_count !== 0 ||
    pullRequest?.required_review_thread_resolution !== true ||
    pullRequest?.allowed_merge_methods?.join(",") !== "squash"
  ) {
    errors.push("Protect main pull-request controls differ from the accepted baseline");
  }
  if (
    statusChecks?.strict_required_status_checks_policy !== true ||
    statusChecks?.required_status_checks?.length !== 1 ||
    statusChecks.required_status_checks[0]?.context !== "validate" ||
    statusChecks.required_status_checks[0]?.integration_id !== 15368
  ) {
    errors.push(
      "Protect main must require the GitHub Actions validate check on an up-to-date branch",
    );
  }
}

async function validatePhase4Deployment() {
  const dockerfile = await readFile(join(repositoryRoot, "Dockerfile"), "utf8");
  const dockerIgnore = normalizeNewlines(
    await readFile(join(repositoryRoot, ".dockerignore"), "utf8"),
  );
  const blueprint = normalizeNewlines(await readFile(join(repositoryRoot, "render.yaml"), "utf8"));
  const workspace = normalizeNewlines(
    await readFile(join(repositoryRoot, "pnpm-workspace.yaml"), "utf8"),
  );
  const controlPlaneManifest = JSON.parse(
    await readFile(join(repositoryRoot, "apps/control-plane/package.json"), "utf8"),
  );

  const fromLines = dockerfile.split("\n").filter((line) => line.startsWith("FROM "));
  if (
    fromLines.length !== 2 ||
    fromLines.some(
      (line) =>
        !line.includes("node:24.19.0-bookworm-slim@sha256:") || /(?:^|:)latest(?:\s|$)/.test(line),
    )
  ) {
    errors.push("Docker build and runtime stages must pin Node.js 24.19.0 by digest");
  }
  if (!dockerfile.includes("USER node") || !dockerfile.includes("--frozen-lockfile")) {
    errors.push("Docker runtime must be non-root and install from the frozen lockfile");
  }
  if (
    !workspace.includes("injectWorkspacePackages: true") ||
    !dockerfile.includes("deploy --prod /runtime/control-plane") ||
    dockerfile.includes("deploy --prod --legacy")
  ) {
    errors.push("Docker deployment must inject workspace packages into a portable runtime");
  }
  for (const ignored of [
    ".env",
    ".local",
    "backups",
    "pass.md",
    "**/node_modules",
    "**/dist",
    ".git",
  ]) {
    if (!dockerIgnore.split("\n").includes(ignored)) {
      errors.push(`.dockerignore must exclude ${ignored}`);
    }
  }

  for (const required of [
    'postgresMajorVersion: "18"',
    "region: frankfurt",
    "plan: starter",
    "plan: basic-256mb",
    "ipAllowList: []",
    'autoDeployTrigger: "off"',
    "healthCheckPath: /health",
    "generateValue: true",
  ]) {
    if (!blueprint.includes(required)) {
      errors.push(`Render Blueprint is missing required setting: ${required}`);
    }
  }
  if (blueprint.includes("MIGRATION_DATABASE_URL")) {
    errors.push("Render web service must never receive MIGRATION_DATABASE_URL");
  }
  for (const secret of ["DATABASE_URL", "FREVOS_OIDC_CLIENT_SECRET"]) {
    const declaration = new RegExp(`- key: ${secret}\\n\\s+sync: false`);
    if (!declaration.test(blueprint)) {
      errors.push(`Render Blueprint must keep ${secret} as an unsynchronized secret`);
    }
  }
  if (controlPlaneManifest.dependencies?.["@fastify/static"] !== "10.1.2") {
    errors.push("Control plane must pin the patched @fastify/static 10.1.2 release");
  }
}

async function validateLocalPreview() {
  const compose = await readFile(join(repositoryRoot, "compose.local.yaml"), "utf8");
  const realm = await readFile(
    join(repositoryRoot, "docker/local/keycloak/frevos-local-realm.json"),
    "utf8",
  );
  const seed = await readFile(join(repositoryRoot, "docker/local/postgres/seed.sql"), "utf8");
  const manifest = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8"));

  for (const required of [
    "postgres:18.4-bookworm",
    "quay.io/keycloak/keycloak:26.7.0",
    "caddy:2.10.2-alpine",
    "service_completed_successfully",
    "https://frevos.localhost:8443",
    "NODE_EXTRA_CA_CERTS",
    "frevos-caddy-trust:/caddy-trust:ro",
    "chmod 0444 /trust/root.crt",
  ]) {
    if (!compose.includes(required)) {
      errors.push(`Local Preview Compose file is missing required setting: ${required}`);
    }
  }
  for (const script of [
    "local:up",
    "local:down",
    "local:status",
    "local:logs",
    "local:backup",
    "local:restore",
  ]) {
    if (typeof manifest.scripts?.[script] !== "string") {
      errors.push(`Local Preview package script is missing: ${script}`);
    }
  }
  for (const placeholder of [
    `$${"{FREVOS_OIDC_CLIENT_SECRET}"}`,
    `$${"{FREVOS_LOCAL_ADMIN_PASSWORD}"}`,
    `$${"{FREVOS_LOCAL_VIEWER_PASSWORD}"}`,
  ]) {
    if (!realm.includes(placeholder)) {
      errors.push(`Keycloak realm must use generated value: ${placeholder}`);
    }
  }
  for (const email of ["admin@local.frevos", "viewer@local.frevos"]) {
    if (!realm.includes(`"email": "${email}"`)) {
      errors.push(`Keycloak synthetic user must have a complete local profile: ${email}`);
    }
  }
  if (!seed.includes("set_config('frevos.workspace_id', 'ws_local_demo', true)")) {
    errors.push("Local Preview seed must set an explicit workspace context for forced RLS");
  }
}

async function validateOracleUat() {
  const compose = normalizeNewlines(
    await readFile(join(repositoryRoot, "compose.oci.yaml"), "utf8"),
  );
  const caddy = normalizeNewlines(
    await readFile(join(repositoryRoot, "docker/oci/Caddyfile"), "utf8"),
  );
  const configure = normalizeNewlines(
    await readFile(join(repositoryRoot, "scripts/configure-oci-uat.sh"), "utf8"),
  );
  const operations = normalizeNewlines(
    await readFile(join(repositoryRoot, "scripts/oci-uat.sh"), "utf8"),
  );
  const restoreCheck = normalizeNewlines(
    await readFile(join(repositoryRoot, "docker/oci/postgres/restore-check.sh"), "utf8"),
  );

  for (const required of [
    "platform: linux/arm64",
    "postgres:18.4-bookworm@sha256:882236b897e39051d2368c5ccc6cda944904723506b2dfc97f2a8f5bc9afa382",
    "caddy:2.10.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d",
    "internal: true",
    'user: "999:999"',
    'user: "1000:1000"',
    "no-new-privileges:true",
    "cap_drop:\n      - ALL",
    "$" + "{FREVOS_DATA_ROOT:-/srv/frevos}/postgres:/var/lib/postgresql",
    'entrypoint: ["/backup.sh"]',
    'entrypoint: ["/restore-check.sh"]',
  ]) {
    if (!compose.includes(required)) {
      errors.push(`Oracle UAT Compose file is missing required setting: ${required}`);
    }
  }

  const frevosService = compose.match(/\n {2}frevos:\n([\s\S]*?)\n {2}caddy:\n/)?.[1] ?? "";
  const postgresService = compose.match(/\n {2}postgres:\n([\s\S]*?)\n {2}migrate:\n/)?.[1] ?? "";
  if (!frevosService || frevosService.includes("MIGRATION_DATABASE_URL")) {
    errors.push("Oracle UAT web service must never receive MIGRATION_DATABASE_URL");
  }
  if (!postgresService || postgresService.includes("ports:")) {
    errors.push("Oracle UAT PostgreSQL must not publish a host port");
  }
  if ((compose.match(/\n {4}ports:\n/g) ?? []).length !== 1) {
    errors.push("Only the Oracle UAT Caddy service may publish host ports");
  }

  for (const required of [
    "admin 127.0.0.1:2019",
    "{$FREVOS_UAT_HOST}",
    "reverse_proxy frevos:10000",
  ]) {
    if (!caddy.includes(required)) {
      errors.push(`Oracle UAT Caddyfile is missing required setting: ${required}`);
    }
  }
  if (/^\s*log\s*[{\n]/m.test(caddy)) {
    errors.push("Oracle UAT Caddy access logging must remain disabled for OIDC callbacks");
  }

  for (const required of [
    "repository_root=/opt/frevos/repository",
    'environment_file="$environment_directory/uat.env"',
    "data_root=/srv/frevos",
    '[ ! -e "$environment_file" ]',
    "status --porcelain",
    "install -o root -g root -m 0600",
    "openssl rand -hex 32",
    "openssl rand -base64 32",
    '"$' + '{#transaction_key}" -eq 43',
  ]) {
    if (!configure.includes(required)) {
      errors.push(`Oracle UAT configuration boundary is missing: ${required}`);
    }
  }
  for (const required of [
    "environment_file=/etc/frevos/uat.env",
    "root:root:600",
    "compose config --quiet",
    "node:24.19.0-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03",
    "actual_sha",
    "configured_sha",
    "status --porcelain",
    "--confirm-isolated-restore-check",
  ]) {
    if (!operations.includes(required)) {
      errors.push(`Oracle UAT operation boundary is missing: ${required}`);
    }
  }
  if (
    !restoreCheck.includes("check_database=frevos_restore_check") ||
    !restoreCheck.includes('!= "--confirm-isolated-restore-check"') ||
    restoreCheck.includes("DROP DATABASE frevos")
  ) {
    errors.push("Oracle UAT restore check must remain isolated and exactly confirmed");
  }
}

async function validateWindowsUat() {
  const builder = normalizeNewlines(
    await readFile(
      join(repositoryRoot, "deployment/windows-uat/New-WindowsUatRelease.ps1"),
      "utf8",
    ),
  );
  const installer = normalizeNewlines(
    await readFile(join(repositoryRoot, "deployment/windows-uat/Install-WindowsUat.ps1"), "utf8"),
  );
  const arrInstaller = normalizeNewlines(
    await readFile(
      join(repositoryRoot, "deployment/windows-uat/Install-ArrPrerequisite.ps1"),
      "utf8",
    ),
  );
  const startup = normalizeNewlines(
    await readFile(join(repositoryRoot, "deployment/windows-uat/Start-WindowsUat.ps1"), "utf8"),
  );
  const operations = normalizeNewlines(
    await readFile(join(repositoryRoot, "deployment/windows-uat/Invoke-WindowsUat.ps1"), "utf8"),
  );
  const proxy = normalizeNewlines(
    await readFile(join(repositoryRoot, "deployment/windows-uat/web.config.template"), "utf8"),
  );
  const personalSeed = normalizeNewlines(
    await readFile(join(repositoryRoot, "deployment/windows-uat/seed.sql"), "utf8"),
  );
  const trackGrnAgent = normalizeNewlines(
    await readFile(
      join(repositoryRoot, "deployment/windows-agent/Invoke-TrackGrnAgent.ps1"),
      "utf8",
    ),
  );
  const trackGrnAgentInstaller = normalizeNewlines(
    await readFile(
      join(repositoryRoot, "deployment/windows-agent/Install-TrackGrnAgent.ps1"),
      "utf8",
    ),
  );

  for (const required of [
    'basePath = "/frevos"',
    '"--config.node-linker=hoisted"',
    "node-v24.19.0-win-x64.zip",
    "57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73",
    "postgresql-18.4-1-windows-x64-binaries.zip",
    "7effe34c0bf89027b3f171447d351cbc460f4566c8d0f643daec67f140787858",
    "requestRouter_amd64.msi",
    "fb61fdb7101795a34d5129cb37eee43ab675c7ed76ba3a3b23b039d8c90c2a4b",
    "release-manifest.json",
    'VITE_FREVOS_AUTH_MODE = "local"',
    '"bootstrap-local-user.js"',
    "Compiled control-plane entry point is missing after release pruning",
    '"deployment\\windows-agent"',
  ]) {
    if (!builder.includes(required)) {
      errors.push(`Windows UAT release builder is missing: ${required}`);
    }
  }

  for (const required of [
    "[switch]$ConfirmSharedIisProxyChange",
    '$uatRoot = "D:\\FrevOS-UAT"',
    '$siteName = "tserver2.eeslindia.org"',
    '$applicationName = "frevos"',
    "$listenPort = 10000",
    "$postgresPort = 5433",
    '"127.0.0.1"',
    "NT AUTHORITY\\NetworkService",
    "NT AUTHORITY\\LOCAL SERVICE",
    "MIGRATION_DATABASE_URL = $migrationDatabaseUrl",
    'FREVOS_AUTH_MODE = "local"',
    "Initial local admin password",
    "bootstrap-local-user.js",
    "Set-ControlledAcl -Path $operationsConfigFile",
    "applicationHost.config",
    "Wait-ForLocalHealth",
    "FREVOS_TRACKGRN_AGENT_TOKEN = $trackGrnAgentToken",
  ]) {
    if (!installer.includes(required)) {
      errors.push(`Windows UAT installer is missing: ${required}`);
    }
  }
  if (installer.includes("OIDC") || startup.includes("FREVOS_OIDC")) {
    errors.push("Windows personal UAT must not require an external OIDC configuration");
  }
  if (
    !installer.includes("[Security.AccessControl.FileSecurity]::new()") ||
    !installer.includes("[Security.AccessControl.DirectorySecurity]::new()") ||
    installer.includes("[Security.AccessControl.FileSystemSecurity]::new()")
  ) {
    errors.push(
      "Windows UAT ACL creation must use concrete PowerShell 5.1-compatible security types",
    );
  }
  for (const required of [
    "Set-InstallerOwnedDirectory -Path $dataDirectory",
    "Set-ControlledAcl -Path $passwordFile -AllowCurrentUserRead",
    "Set-ControlledAcl -Path $roleFile -AllowCurrentUserRead",
    "[string]::IsNullOrWhiteSpace([string]$databaseExists)",
    "A partial PostgreSQL data directory exists without PG_VERSION",
  ]) {
    if (!installer.includes(required)) {
      errors.push(`Windows UAT first-install reliability guard is missing: ${required}`);
    }
  }
  for (const required of [
    "usr_windows_admin",
    "wsm_windows_admin",
    "workspace:read",
    "client:write",
    "project:write",
    "prj_uat_trackgrn",
    "1334902237",
    "svc_trackgrn_windows_agent",
  ]) {
    if (!personalSeed.includes(required)) {
      errors.push(`Windows personal UAT seed is missing: ${required}`);
    }
  }
  if (
    !startup.includes('SetEnvironmentVariable("MIGRATION_DATABASE_URL", $null, "Process")') ||
    startup.includes("operations.json")
  ) {
    errors.push(
      "Windows UAT web startup must clear migration authority and never load operations configuration",
    );
  }
  if (!startup.includes('"FREVOS_TRACKGRN_AGENT_TOKEN"')) {
    errors.push("Windows UAT startup must explicitly allow the TrackGRN agent token");
  }
  for (const required of [
    '$workspaceRoot = "D:\\TrackGRN"',
    '$expectedRemote = "https://github.com/mishrarishav/TraceGRN.git"',
    '$agentId = "svc_trackgrn_windows_agent"',
    '$serverReleaseRoot = "D:\\TrackGRN-UAT\\releases"',
    '"repository.inspect"',
    '"repository.propose-commit"',
    '"repository.commit-push"',
    '"project.build"',
    '"uat.deploy"',
    "expectedChangeDigest",
    "FullyQualifiedName!~APItrackGRN.Tests.SqlEndToEndTests",
    "/apiTrackGrn/api/system/status",
    'databaseStatus = "available"',
    "function Assert-GitHubOperator",
    "gh api repos/mishrarishav/TraceGRN --jq .id",
    '"frevos/trackgrn-$suffix"',
    'Invoke-Git @("push", "--set-upstream", "origin", "HEAD")',
  ]) {
    if (!trackGrnAgent.includes(required)) {
      errors.push(`TrackGRN Windows agent is missing: ${required}`);
    }
  }
  for (const prohibited of ["Invoke-Expression", "cmd.exe", 'push", "origin", "main"']) {
    if (trackGrnAgent.includes(prohibited)) {
      errors.push(`TrackGRN Windows agent exposes a prohibited execution path: ${prohibited}`);
    }
  }
  for (const required of [
    '$taskName = "FrevOS-TrackGRN-Agent"',
    '"D:\\TrackGRN\\server.env"',
    "Register-ScheduledTask",
  ]) {
    if (!trackGrnAgentInstaller.includes(required)) {
      errors.push(`TrackGRN Windows agent installer is missing: ${required}`);
    }
  }
  for (const required of [
    "[switch]$ConfirmSharedIisRestart",
    "requestRouter_amd64.msi",
    "rewrite.dll",
  ]) {
    if (!arrInstaller.includes(required)) {
      errors.push(`Windows UAT ARR boundary is missing: ${required}`);
    }
  }
  for (const required of [
    '[ValidateSet("Status", "Backup", "RestoreCheck", "Rollback")]',
    "[switch]$ConfirmIsolatedRestoreCheck",
    "frevos_restore_check",
    "release-manifest.json",
    "Database state was not changed",
  ]) {
    if (!operations.includes(required)) {
      errors.push(`Windows UAT operations boundary is missing: ${required}`);
    }
  }
  if (operations.includes("DROP DATABASE frevos")) {
    errors.push("Windows UAT restore check must never drop the active database");
  }
  if (!proxy.includes("http://127.0.0.1:__PORT__/frevos/{R:1}")) {
    errors.push("Windows UAT IIS proxy must target only the loopback /frevos application");
  }
}

for (const document of requiredDocuments) {
  if (!(await pathExists(join(repositoryRoot, document)))) {
    errors.push(`Required document is missing: ${document}`);
  }
}

const markdownFiles = await collectMarkdownFiles(repositoryRoot);
for (const file of markdownFiles) {
  const content = await readFile(file, "utf8");
  validateDocumentStructure(file, content);
  await validateRelativeLinks(file, content);
}

await validateRuleset();
await validatePhase4Deployment();
await validateLocalPreview();
await validateOracleUat();
await validateWindowsUat();

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`ERROR: ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Repository validation passed (${markdownFiles.length} Markdown files).`);
}
