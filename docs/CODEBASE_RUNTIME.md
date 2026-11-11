# Codebase with the central database

The owner-selected workflow uses the existing central Server20 database. Normal
startup must not create a local PostgreSQL, Docker stack, demo accounts, JSON
fallback store, or localhost preview environment. Pure/static checks and builds
are permitted. Starting application code remains an explicit owner action.

Build the checked-out code when needed, then use:

```powershell
pnpm start -- --profile <absolute-path-to-protected-runtime-profile.json>
```

There is no default profile location and no automatic connection discovery.
The command runs the existing built control plane and React assets. It does not
install dependencies, migrate/seed a database or start containers. A refused or
unavailable central connection does not create another database or data store.
Missing artifacts or source files newer than their corresponding compiled
control-plane/contracts/React entry require a fresh owner-operated build first;
an old compiled JSON-backed runtime must not be reused accidentally.

## Runtime profile

Use a separately stored, restricted runtime-only JSON file with this structure:

```json
{
  "version": 1,
  "verifiedAt": "<fresh-operator-verification-UTC>",
  "expiresAt": "<verification-expiry-UTC>",
  "expectedTarget": {
    "host": "<verified-central-host>",
    "port": 5433,
    "database": "<existing-database>",
    "runtimeRole": "<existing-least-privilege-login>"
  },
  "DATABASE_URL": "<runtime-only-connection-reference-with-sslmode=verify-full>",
  "runtime": {
    "FREVOS_PUBLIC_ORIGIN": "<explicit-code-runtime-origin>",
    "FREVOS_AUTH_MODE": "local",
    "FREVOS_ALLOW_INTERNAL_HTTP": "true",
    "FREVOS_BASE_PATH": "",
    "HOST": "127.0.0.1",
    "PORT": 3001,
    "DEVSETU_REVIEWS_MONITORING_ENABLED": "false"
  }
}
```

This is a structural example, not an executable connection or a new credential.
The real database URL is resolved only into the private file and child-process
environment; never paste it into command arguments, Git, screenshots or logs.
`MIGRATION_DATABASE_URL` is rejected. The launcher also rejects placeholder,
expired, broad-permission, target-mismatched and loopback database profiles.
Explicit database certificate bypasses are rejected. The database identity must
match the configured host, port, database and runtime role. The application still
verifies the real database role and schema before serving requests.

The documented old operator file at `D:\FREVOS\.local\server20\database.json`
contains stale placeholder configuration and is not a verified runtime profile.
Server20's own `E:\FrevOS\config\runtime.json` refers to PostgreSQL on that
server's loopback address. Copying that URL onto a laptop would point to the
laptop instead. Direct private reachability or a separately verified private
database transport must be established first. This launcher does not create a
tunnel, change a PostgreSQL listener or open a firewall. A loopback proxy binding
is not supported implicitly.

The profile's `runtime` object accepts the existing named application settings,
including optional `DEVSETU_REVIEWS_WORKSPACES`, explicit existing platform-state
references and normal local/OIDC authentication settings. It rejects unrelated
environment variables and inherited PostgreSQL/runtime overrides. Scheduled
monitoring is off by default for a code-only instance; the separately configured
Server20 worker remains responsible for scheduled work. Do not create additional
workers casually against the same central records.

Central database identity/session access does not automatically centralize legacy
connector job files or make a local copy authoritative. Those capabilities need
their existing explicitly configured state references; no state directory is
created as an incidental fallback by this launcher.

## Existing local resources

`pnpm local:up` now refuses before creating local secrets or invoking Docker.
Existing Compose definitions, volumes, backup files and shutdown commands remain
for preservation and explicit operator recovery. They are not the normal run
workflow. Do not remove unrelated containers or volumes while stopping a helper.

The ignored Reviews helper is `.local/reviews-local-preview.mjs`; its own
SIGINT/SIGTERM handler closes its API/fixture HTTP listeners, PostgreSQL clients
and the exact Testcontainers container it created. Retain its `.local/reviews-preview`
state and backups while the reviewed central migration is completed. Resource
ownership must be verified before any external cleanup.

## Verification boundary

```powershell
pnpm test:runtime-policy
```

These pure tests validate startup refusal, explicit/fresh profile requirements,
target/TLS checks, environment isolation and missing-build behavior. They do not
start application services, Docker or a database.

Legacy broad integration suites still contain Testcontainers fixtures. Do not
run them as a normal local check under the current owner preference. The next
test-workflow change should separate default pure/static tests from explicitly
selected integration execution on a reviewed remote CI target. A global
`TESTCONTAINERS_*` flag alone is not permission to launch local infrastructure,
and central integration fixtures must not run create/drop/reset test code against
the existing central database.
