# Phase 4 Authentication and Workspace Foundation

## Purpose

Phase 4 establishes the first authoritative user and tenant boundary for
FrevOS. It is split into bounded reviewable slices so that contracts and
security decisions are stable before network and persistence code can depend
on them.

This plan does not make Phase 4 complete. The roadmap exit still requires a
working authentication flow, durable workspace data, and release-gating
negative isolation tests against the real data store.

## Dependency

The current dependency is satisfied. Phase 4A Core PR
[#7](https://github.com/mishrarishav/FrevOS/pull/7) was human squash-merged as
`425c1f3e8b20dde798316b557341baa6c8aa8fb8`, and its remote task branch was
deleted. The Phase 4B branch is based directly on that squash commit.

## Phase 4A: decisions and domain boundary

The first slice includes only:

- accepted service, authentication/session, and tenant-persistence decisions;
- provider-neutral identity and server-session contracts;
- workspace, membership, client, and project contracts;
- an explicit-scope workspace authorization evaluator;
- denial tests for invalid, expired, revoked, cross-user, cross-workspace,
  inactive-workspace, inactive-membership, and missing-scope contexts;
- JSON Schema exports and durable documentation.

Phase 4A does not include:

- a listening HTTP service or browser-to-service integration;
- an OIDC provider adapter, login callback, cookie, CSRF, or logout runtime;
- a database migration, query repository, PostgreSQL instance, or RLS proof;
- membership invitations, product roles, service identities, or global
  administration;
- UI replacement of Phase 3 demonstration data;
- cloud infrastructure, deployment, secrets, analytics, or external writes.

An authorization context is server-constructed evidence. A client may submit a
requested workspace and action, but it must never submit the session,
membership, workspace status, or granted scopes that the evaluator trusts.

## Active Phase 4B: service, identity, and persistence

The second slice owns:

- create the Fastify control-plane boundary;
- implement OpenID Connect Authorization Code with PKCE through a
  provider-neutral adapter;
- persist opaque, rotating, short-lived server sessions and issue only a
  hardened host cookie to the browser;
- add PostgreSQL migrations for users, identities, sessions, workspaces,
  memberships, clients, and projects;
- use a non-owner, non-superuser, non-`BYPASSRLS` application role;
- set verified workspace context transaction-locally and force RLS on every
  tenant table;
- add workspace-scoped repositories and real PostgreSQL integration tests,
  including cross-workspace reads, writes, updates, references, and missing
  context;
- expose only schema-validated session and workspace APIs with response
  schemas.

Phase 4B must not use SQLite or an in-memory store as evidence for PostgreSQL
RLS behavior. CI must execute the isolation suite against the selected
PostgreSQL major line.

The implementation pins Fastify `5.11.3`, `openid-client` `6.8.4`, `pg`
`8.23.0`, Testcontainers `12.1.0`, PostgreSQL `18.4`, and the helper/test image
digests used by CI. OIDC provider tokens are discarded after callback identity
validation because this slice has no provider-API capability. PostgreSQL stores
only session and CSRF digests. Migration authority is separate from the
runtime `frevos_app` role. A tightly scoped, owner-defined membership resolver
returns evidence only for the exact authenticated user and candidate workspace;
only authorized evidence becomes the workspace context for data repositories.

Phase 4B does not include cloud deployment, a production identity provider,
provider consent storage, invitations or product roles, GitHub App onboarding,
agent execution, UI wiring, or Phase 4C acceptance.

## Phase 4C: experience integration and acceptance

The final slice will replace the relevant Phase 3 demonstration boundaries
with authenticated session and authorized workspace data. It will add honest
loading, unauthenticated, denied, empty, retry, and session-expired states and
then enable independent black-box Preview or UAT acceptance.

The client remains presentation only. A hidden route, disabled control, or
selected workspace in browser state never proves authorization.

## Phase 4 exit criteria

Phase 4 is complete only when:

1. OIDC login, callback validation, session rotation, expiry, CSRF protection,
   and logout pass service-level tests.
2. Every protected route reconstructs session and workspace authority on the
   server and denies missing or mismatched evidence.
3. PostgreSQL independently denies unscoped and cross-workspace access with
   forced RLS and workspace-preserving foreign keys.
4. Application authorization and data-layer isolation each have negative
   tests; one layer cannot substitute for the other.
5. Clients and projects cannot reference records from another workspace.
6. No provider tokens, session secrets, or raw identity-provider objects reach
   browser storage, domain contracts, logs, or validation errors.
7. Full repository CI, service integration tests, and authorized black-box
   acceptance pass on the exact reviewed commit.
8. Documentation records the selected OIDC deployment provider and PostgreSQL
   operating model before any deployed runtime is claimed.

## Related decisions

- [ADR 0002](adr/0002-workspace-isolation.md)
- [ADR 0010](adr/0010-schema-first-domain-contracts.md)
- [ADR 0013](adr/0013-fastify-control-plane.md)
- [ADR 0014](adr/0014-oidc-bff-sessions.md)
- [ADR 0015](adr/0015-postgresql-tenant-isolation.md)
