# ADR 0018: Add a free local Preview operating model

Status: Accepted

Date: 2026-08-12

## Context

ADR 0017 selected paid Render and Auth0 resources for Phase 4 non-Production
Preview and UAT. The application already requires a real OIDC issuer,
PostgreSQL persistence, same-origin delivery, and secure host-only cookies.
Developers also need a repeatable laptop target that does not incur hosted
service cost or weaken those browser boundaries.

## Decision

Add a local-only operating model using Docker Compose, PostgreSQL 18, Keycloak,
and Caddy. Caddy terminates locally trusted HTTPS for the FrevOS and identity
loopback names. The existing product image serves the React build and Fastify
BFF on one FrevOS origin. Keycloak imports a synthetic realm at startup.

Generate local database, Keycloak, OIDC, and user secrets into an ignored file.
Use distinct migrator, unprivileged application runtime, and isolated Keycloak
database logins, ordered health checks, automatic migrations, repeat-safe
sample data, persistent named volumes, and guarded local backup and restore
commands.

This ADR supersedes ADR 0017 only for laptop Preview. ADR 0017 remains the
accepted hosted UAT model and no Production provider decision is made.

## Consequences

- Authenticated development can run without Auth0 or Render charges.
- Secure `__Host-*` cookie behavior is exercised over trusted HTTPS.
- Developers must explicitly trust and later remove a local CA certificate.
- Fixed synthetic identity IDs make application seeding deterministic while
  passwords and client secrets remain generated locally.
- Realm import applies only when Keycloak initializes its database state.
- Independent Playwright product specifications remain separate and are not
  satisfied merely by this stack being healthy.

## Rejected alternatives

- Plain HTTP was rejected because it cannot exercise the secure cookie boundary.
- Browser tokens or a development authentication bypass were rejected because
  they would create a different security architecture.
- Codespaces was rejected as the default because port forwarding and local CA
  trust complicate the browser-to-runtime boundary.
- Sharing committed local passwords was rejected in favor of generated ignored
  values.

## Related records

- [ADR 0014](0014-oidc-bff-sessions.md)
- [ADR 0015](0015-postgresql-tenant-isolation.md)
- [ADR 0017](0017-preview-uat-operating-model.md)
- [Local Preview](../LOCAL_PREVIEW.md)
