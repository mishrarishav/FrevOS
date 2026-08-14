# Local Preview

FrevOS Local Preview runs the real React build and Fastify BFF behind Caddy
HTTPS, with PostgreSQL 18 persistence and a Keycloak OIDC realm. It is a
non-Production developer target; it does not replace independent black-box
acceptance or the selected hosted UAT model.

## Requirements

- 4 CPU cores, 8 GB RAM, and 15--20 GB free disk are recommended.
- Docker Engine or Docker Desktop with Compose must be running.
- Install Git, Node.js 24.19.0, and pnpm 11.21.0.
- Ports `8443` must be free.

Run:

```powershell
corepack enable
pnpm install --frozen-lockfile
pnpm local:up
```

The first start builds the product image, creates ignored random local secrets,
imports the realm, applies migrations, and seeds a sample workspace. Synthetic
login passwords are written only to `.local/.env.local`; do not commit or share
that file.

Open `https://frevos.localhost:8443`. Both `frevos.localhost` and
`identity.frevos.localhost` resolve to loopback through the special-use
`localhost` domain, so no hosts-file edit is required.

## Trust the local CA

After the first start, Caddy's root certificate is exported to
`.local/caddy-root.crt`. Trust it only on a development machine.

On Windows, open an elevated PowerShell in the repository root and run:

```powershell
$certificatePath = (Resolve-Path .local\caddy-root.crt).Path
certutil -addstore -f ROOT $certificatePath
```

The path must resolve from the current PowerShell directory; running the
relative `.local` path from `C:\Windows\System32` will fail because the
certificate is stored under the FrevOS repository.

On macOS, import `.local/caddy-root.crt` into the System keychain and set it to
Always Trust. On Linux, copy it into the distribution's local CA directory and
run the distribution's CA update command. Restart the browser after changing
trust. Removing the certificate from the OS trust store reverses this step.

## Daily operation

```powershell
pnpm local:up
pnpm local:status
pnpm local:logs
pnpm local:down
```

`local:down` retains PostgreSQL and Caddy volumes. There is deliberately no
`local:reset` command because deleting persisted identity and workspace data
must remain an explicit Docker volume operation.

The seeded users are `admin@local.frevos` and `viewer@local.frevos`. Read their
generated passwords locally from `.local/.env.local`.

## Backup and restore

Create a timestamped, ignored backup of FrevOS application tables and migration
history:

```powershell
pnpm local:backup
```

Restore accepts only a file under `backups/local` and requires an explicit
confirmation flag:

```powershell
pnpm local:restore -- backups/local/frevos-<timestamp>.dump --confirm-local-restore
```

Restore replaces the FrevOS schema contents but does not replace Keycloak's
realm tables or local secrets. Restored browser sessions are revoked so that
authentication is re-established against the current realm. Take a new backup
before restoring older data.

## Troubleshooting

Use `pnpm local:status` first, then `pnpm local:logs`. A changed realm import is
not reapplied to an existing Keycloak database automatically. Preserve or back
up needed application data before explicitly removing the Compose volumes.

Codespaces is not a supported Local Preview target: forwarded ports and the
developer machine's local certificate trust cross different trust boundaries.
Use the separately authorized hosted UAT path for remote black-box acceptance.
