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

The dependency is satisfied. Phase 3 Control Center PR
[#5](https://github.com/mishrarishav/FrevOS/pull/5) was human squash-merged as
`13f3cd22d9e82b1cf0b8a65621aeb9342b402698`, its task branch was deleted, and
default-branch CI passed. The Phase 4A branch is based directly on that squash
commit and requires its own exact-head validation and human review.

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

## Phase 4B: service, identity, and persistence

The second slice will:

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
