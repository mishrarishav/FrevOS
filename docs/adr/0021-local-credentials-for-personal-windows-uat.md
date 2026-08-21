# ADR 0021: Use local credentials for personal Windows UAT

- Status: Accepted
- Date: 2026-08-22
- Supersedes: [ADR 0020](0020-windows-iis-uat-operating-model.md) for the active Windows UAT operating model

## Context

The product owner clarified that the current Windows deployment is a personal,
internal Phase 4 UAT instance. The selected IIS host has no general Internet
access. Requiring a hosted OIDC tenant would add an outbound allowlist,
third-party application configuration, synthetic external identities, and a
client-secret lifecycle that are disproportionate for this target.

FrevOS must still avoid plaintext passwords, browser-managed bearer tokens,
unbounded login attempts, and authorization inferred from a username. The
existing server-side sessions, CSRF protection, PostgreSQL forced row security,
and workspace memberships remain applicable.

## Decision

- Configure only the Windows personal UAT artifact with
  `FREVOS_AUTH_MODE=local`. Other Preview and deployment routes retain their
  existing OIDC behavior, and Production identity remains an open decision.
- Store normalized local usernames and salted Node.js built-in `scrypt`
  password digests in PostgreSQL. Never store, log, package, or place a
  plaintext password in a command argument or configuration file.
- Bootstrap one initial administrator from hidden server-console password and
  confirmation prompts. Keep user identity, workspace membership, and scopes
  as database records; a username never grants authority by itself.
- Accept local login only as a same-origin JSON POST. Return the same public
  denial for an unknown username, wrong password, disabled credential, or
  temporary lock.
- Temporarily lock an existing credential for 15 minutes after five failed
  attempts. Retain the existing opaque digest-backed session, idle and absolute
  expiry, secure host-only cookies, logout, CSRF, and workspace authorization.
- Keep public signup, email recovery, external reset links, MFA, and SSO out of
  this bounded personal UAT change. Those require a separately approved
  lifecycle and Production decision.
- Retain every non-identity boundary from ADR 0020: exact-SHA offline releases,
  loopback Node.js and PostgreSQL, least-privilege service identities, IIS ARR,
  guarded migrations, backups, isolated restore checks, and human merge.

## Consequences

- The Windows UAT installer no longer asks for an issuer, client ID, client
  secret, callback URL, or outbound identity-provider access.
- Losing the local administrator password has no email recovery path. An
  administrator-level credential reset must use a later bounded management
  tool or a separately reviewed database operation.
- Local credentials are intentionally limited to this personal UAT route. They
  are not evidence that the future multi-user Production identity decision is
  complete.
- PostgreSQL backup handling now includes password digests and must retain its
  administrator-only access boundary.

## Rejected alternatives

- Disable authentication entirely, because the application exposes repository,
  approval, and deployment-oriented information even in UAT.
- Store a plaintext or reversibly encrypted password, because a database or
  backup disclosure would immediately expose the credential.
- Keep hosted Auth0 for this target, because the required outbound dependency
  conflicts with the selected offline personal operating model.
- Deploy another identity platform such as Keycloak on the shared server,
  because its additional runtime and operations are unnecessary for one
  personal UAT identity.

## Related records

- [ADR 0014](0014-oidc-bff-sessions.md)
- [ADR 0015](0015-postgresql-tenant-isolation.md)
- [ADR 0020](0020-windows-iis-uat-operating-model.md)
- [Windows UAT runbook](../PHASE_4_WINDOWS_UAT_RUNBOOK.md)
