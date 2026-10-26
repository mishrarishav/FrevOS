# ADR 0038: Owner-selected internal HTTP access on server20

- Status: Accepted for the bounded server20 access correction
- Date: 2026-10-21

## Context

The owner requested visible browser verification of FrevOS on DCAPP7 and a fix
when it did not open. Server-local health returned 200, while VPN access to the
configured HTTPS 8443 timed out. HTTP 80 served the IIS welcome page; port 81
belonged to another site's hostname. The owner explicitly selected an accessible
port and then requested HTTP for internal access.

## Decision

Use `http://10.9.69.20` with an IP-specific IIS port 80 binding for
`FrevOS-Server20`. Preserve the other sites' bindings, the current database,
accounts and six migration files. Apply only the transport correction to the
verified installed artifact `de56c5684970bbe7a053318f532b81d1df562a55d5258e033e636cd11c06eef9`.
The larger unmerged unified-deployment candidate and laptop-data import are
separate pending work.

HTTPS remains the default. HTTP configuration requires explicit
`FREVOS_ALLOW_INTERNAL_HTTP=true`, local authentication, a private/loopback IPv4
public origin and a loopback backend listener. OIDC remains on HTTPS. The shared
cookie transport contract assigns separate HTTP session/CSRF names because
`__Host-` cookies require Secure transport. Preserve HttpOnly session cookies,
SameSite Strict, session rotation, exact-origin checks, CSRF and workspace access.
The browser and server consume the same cookie-name contract.

Build a bounded native patch from the verified previous dependency artifact.
Capture current source hashes, validate every payload file, and reject unrelated
runtime, dependency or migration changes. Use the owner's explicit HTTP request
as authorization, recorded with the actor, workspace, action, target, artifact,
correlation and a fifteen-minute single-use window. Do not describe the record
as a separate human diff review or as merge/publication approval.

The fixed operator prepares private runtime/task/IIS backups, switches the owned
control-plane task, and adds the exact HTTP binding after backend readiness.
Retain and verify ownership during recovery; do not kill arbitrary processes,
replace sibling sites or rewrite historical migration hashes. No database writes
or migrations are part of this operator. Existing runtime account secrets stay
inside protected server files and process environment boundaries.

## Consequences and verification

This is the owner's internal HTTP exception, not a claim about external router
exposure or general-purpose public HTTP hosting. The Phase 4 exit gate remains
open. Exact packaged Windows Node/PG/Edge acceptance verifies real HTTP login,
reload persistence, browser CSRF denial/create and logout in an isolated database.
Record actual live activation, external browser results and remaining work in
[the handoff](../SERVER20_HTTP_HANDOFF.md).
