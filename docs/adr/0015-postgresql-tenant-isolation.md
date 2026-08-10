# ADR 0015: Enforce tenant data boundaries with PostgreSQL row security

- Status: Accepted
- Date: 2026-08-10

## Context

Phase 4 introduces durable users, identities, sessions, workspaces,
memberships, clients, and projects. ADR 0002 requires authorization and data
access to enforce workspace scope independently. Route middleware or a query
convention alone cannot defend every future route, job, or object-ID lookup.

PostgreSQL provides row-level security (RLS), transaction-local settings,
constraints, and composite foreign keys. RLS has important bypass behavior:
superusers and roles with `BYPASSRLS` always bypass policies, while table owners
normally bypass unless the table uses `FORCE ROW LEVEL SECURITY`.

## Decision

- Use PostgreSQL as the Phase 4 control-plane system of record. Pin the exact
  supported major and patch in runtime and CI configuration when Phase 4B adds
  the database boundary.
- Give every tenant-owned table a non-null `workspace_id`. Tenant-owned unique
  keys and foreign keys include `workspace_id` so a reference cannot cross a
  workspace even if an object identifier is known.
- Enable and force RLS on every tenant-owned table. Define both `USING` and
  `WITH CHECK` policy expressions against the verified transaction workspace.
- Run migrations through a narrowly controlled owner role. Run application
  queries through a separate `NOSUPERUSER`, `NOBYPASSRLS`, non-owner role.
- Begin a transaction before tenant data access and set the verified workspace
  with `set_config('frevos.workspace_id', value, true)`. The `true` flag keeps
  context transaction-local and prevents pooled connections from retaining it.
- Read policy context with `current_setting('frevos.workspace_id', true)` so
  missing context evaluates to no matching tenant instead of broad access.
- Accept workspace context only after authenticated membership authorization;
  never copy a header, route parameter, model output, or browser selection
  directly into database policy context.
- Keep an explicit workspace predicate in repository methods in addition to
  RLS. Application authorization, repository scoping, RLS, and relational
  constraints are independent defenses.
- Execute release-gating isolation tests against real PostgreSQL. Cover missing
  context, wrong context, guessed IDs, cross-workspace reads and writes,
  updates that try to move a row, composite-reference violations, pooled
  connection reuse, and application-role RLS attributes.
- Treat migrations and any exceptional global operation as a separate
  privileged boundary. Normal product and worker paths must not receive an RLS
  bypass.

Phase 4A records the design but adds no database or SQL. Migrations,
repositories, roles, and integration proof are Phase 4B deliverables.

## Consequences

- A missing workspace context fails closed at the storage layer.
- Transaction handling becomes part of the authorization boundary and must be
  tested with the selected connection pool.
- Composite keys add schema repetition but block cross-workspace references.
- Tests using mocks, SQLite, or in-memory stores cannot demonstrate PostgreSQL
  policy behavior.
- Operational access, backup, migration, and incident procedures need explicit
  privileged identities and audit controls.

## Rejected alternatives

- Application query filters without database enforcement.
- One database schema per workspace at this product stage.
- A global application role that owns tenant tables or has `BYPASSRLS`.
- Session-wide tenant settings on pooled connections.
- Globally unique IDs as a substitute for workspace-scoped lookups and foreign
  keys.
- Mock-database tests as RLS evidence.

## Evidence

- [PostgreSQL row security policies](https://www.postgresql.org/docs/18/ddl-rowsecurity.html)
- [PostgreSQL configuration functions](https://www.postgresql.org/docs/18/functions-admin.html)
- [PostgreSQL constraints](https://www.postgresql.org/docs/18/ddl-constraints.html)

## Related records

- [ADR 0002](0002-workspace-isolation.md)
- [ADR 0010](0010-schema-first-domain-contracts.md)
- [Phase 4 foundation](../PHASE_4_FOUNDATION.md)
