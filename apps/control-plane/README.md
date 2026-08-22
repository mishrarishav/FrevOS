# FrevOS Control Plane

`@frevos/control-plane` is the Phase 4 server-side identity, session, workspace,
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
- `GET /v1/workspaces` derives its principal only from the authenticated
  session, returns only active memberships with `workspace:read`, and exposes no
  membership or scope payload to the browser.

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

Workspace discovery uses a separate transaction-local `frevos.user_id` context
derived from the authenticated session. Select-only RLS policies expose that
principal's workspace and membership rows for discovery; they do not expose
clients or projects and do not authorize inserts or updates. Application
authorization then removes suspended, revoked, inactive, or missing-scope
evidence. Every selected-workspace API still reconstructs exact membership
evidence and establishes the existing verified `frevos.workspace_id` context.

Run migrations through a separately authorized privileged connection after
building the package:

```sh
pnpm --filter @frevos/control-plane migrate
```

Both `MIGRATION_DATABASE_URL` and the separate runtime `DATABASE_URL` must be
injected by an authorized secret boundary. The command applies migrations with
the former and validates and grants only `frevos_app` to the login role derived
from the latter. The running service must receive only `DATABASE_URL`; startup
rejects a superuser, role-creating, database-creating, owner-capable, or
`BYPASSRLS` login.

Normal runtime configuration is:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Runtime login that may assume `frevos_app` but owns no application table |
| `FREVOS_PUBLIC_ORIGIN` | Exact HTTPS BFF/browser origin |
| `FREVOS_AUTH_MODE` | `oidc` by default; `local` only for the bounded Windows personal UAT route |
| `FREVOS_OIDC_ISSUER` | HTTPS OpenID Provider issuer, required only in `oidc` mode |
| `FREVOS_OIDC_CLIENT_ID` | Confidential OIDC client identifier, required only in `oidc` mode |
| `FREVOS_OIDC_CLIENT_SECRET` | Confidential OIDC client secret, required only in `oidc` mode |
| `FREVOS_OIDC_TRANSACTION_KEY` | Base64url-encoded 32-byte pre-authentication cookie key, required only in `oidc` mode |
| `FREVOS_TRACKGRN_AGENT_TOKEN` | Distinct 32–256 character secret for the fixed TrackGRN UAT companion; optional elsewhere |
| `HOST` / `PORT` | Listener address and port; default `127.0.0.1:3001` |

Do not put real values in committed files, shell history, logs, screenshots, or
test fixtures. The selected non-Production operating model and exact bootstrap
sequence are in the
[Phase 4 UAT runbook](../../docs/PHASE_4_UAT_RUNBOOK.md). Production provider,
availability, region, and recovery choices remain open.

## TrackGRN UAT automation pilot

ADR 0022 adds a workspace-scoped operation queue for the fixed TrackGRN project
and a separately installed outbound Windows companion. Agent authentication,
repository identity, allowed actions, reviewed change digest, dedicated branch,
UAT release root, and health endpoint are deterministic. See the
[TrackGRN UAT pilot runbook](../../docs/TRACKGRN_UAT_PILOT.md).

## Same-origin delivery

The deployment entrypoint serves `apps/control-center/dist` and the BFF from
the exact same origin. Browser navigation receives the SPA shell, while missing
API, authentication, health, well-known, and asset paths remain real 404s.
Hashed assets are immutable, the HTML shell is not cached, and every response
receives the accepted CSP, frame, MIME, referrer, permissions, opener, and HSTS
headers. `/health` probes PostgreSQL and returns 503 when the database is
unavailable.

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
