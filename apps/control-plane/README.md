# FrevOS Control Plane

`@frevos/control-plane` is the Phase 4B server-side identity, session, workspace,
client, and project boundary. It is a Fastify Backend for Frontend (BFF); the
browser never receives an OpenID Provider access, refresh, or ID token.

## Trust boundaries

- `OpenIdClientProvider` owns OpenID Connect discovery, Authorization Code,
  PKCE S256, state, nonce, and ID-token validation. The provider is selected by
  runtime configuration and provider objects do not enter domain contracts.
- The encrypted, authenticated `__Host-frevos-oidc` cookie holds only a
  short-lived pre-authentication transaction. Its AES-256-GCM key is runtime
  configuration and must come from an authorized secret boundary.
- The browser receives an opaque `__Host-frevos-session` cookie with `Secure`,
  `HttpOnly`, `SameSite=Strict`, `Path=/`, and no `Domain`. PostgreSQL stores
  only its SHA-256 digest. A separate host-only anti-CSRF cookie must match a
  session-bound digest and the same-origin request header.
- A successful login replaces any presented FrevOS session, preventing session
  fixation. Sessions have a 30-minute idle limit and a 12-hour absolute limit.
- Every protected workspace request reconstructs the session, workspace,
  membership, and permission scopes on the server.

Provider tokens are used only inside the callback adapter for identity
validation and are discarded afterward. Phase 4B does not request or persist
provider API consent; later provider integrations require their own secret and
consent decisions.

## PostgreSQL boundary

The migration creates separate `frevos_owner` and `frevos_app` roles. The
runtime always enters a transaction, assumes the fixed `frevos_app` role, and
sets a verified `frevos.workspace_id` with transaction-local `set_config`.
Tenant tables are owned by `frevos_owner`, use `FORCE ROW LEVEL SECURITY`, and
have both `USING` and `WITH CHECK` policies. Client-to-project references use a
composite `(workspace_id, client_id)` foreign key.

Before a workspace becomes runtime context, the fixed
`resolve_workspace_evidence` database function resolves only the exact
authenticated user and requested workspace membership. The function is owned
by `frevos_owner`, pins its `search_path`, has no public execution grant, and
returns nothing for a non-member. Only the resulting authorized workspace is
used by later repository transactions.

Run migrations through a separately authorized privileged connection after
building the package:

```sh
MIGRATION_DATABASE_URL=postgresql://... pnpm --filter @frevos/control-plane migrate
```

Normal runtime configuration is:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Runtime login that may assume `frevos_app` but owns no application table |
| `FREVOS_PUBLIC_ORIGIN` | Exact HTTPS BFF/browser origin |
| `FREVOS_OIDC_ISSUER` | HTTPS OpenID Provider issuer |
| `FREVOS_OIDC_CLIENT_ID` | Confidential OIDC client identifier |
| `FREVOS_OIDC_CLIENT_SECRET` | Confidential OIDC client secret |
| `FREVOS_OIDC_TRANSACTION_KEY` | Base64url-encoded 32-byte pre-authentication cookie key |
| `HOST` / `PORT` | Listener address and port; default `127.0.0.1:3001` |

Do not put real values in committed files, shell history, logs, screenshots, or
test fixtures. Deployment, provider selection, key lifecycle, and database
hosting remain open operating decisions.

## Validation

The integration suite starts the pinned PostgreSQL `18.4` image and proves
application-role attributes, forced RLS, missing/wrong context denial, pooled
connection cleanup, cross-workspace reads/writes/updates/references, session
rotation and expiry, OIDC callback handling, CSRF, and logout.

```sh
pnpm --filter @frevos/control-plane test
pnpm --filter @frevos/control-plane test:coverage
```

Docker is required for these tests. Neither SQLite nor an in-memory database is
accepted as storage-isolation evidence.
