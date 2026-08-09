# ADR 0002: Enforce workspace scope in authorization and data access

- Status: Accepted
- Date: 2026-08-09

## Context

FrevOS is multi-workspace and processes sensitive source code, task history,
artifacts, deployment targets, office data, and project memory. A check only in
the user interface or API authorization layer can be bypassed by background
jobs, cache mistakes, object-ID guessing, or future code paths.

## Decision

Every project-related entity and operation has a non-null workspace identity.
The authorization layer verifies membership and action scope, while the data
access layer independently constrains reads and writes to the same workspace.

Workspace context also scopes queues, jobs, cache keys, search indexes, object
storage, project memory, audit queries, telemetry, approvals, and tool output.
An object ID without verified workspace context is never sufficient authority.

Cross-workspace access fails closed and produces redacted audit evidence.
Negative isolation tests are required as each relevant layer is implemented.

## Consequences

- Domain contracts must carry workspace identity from their first version.
- Repository patterns and data stores must make unscoped access difficult.
- Background and service identities need explicit workspace delegation.
- Some global administration workflows require separately designed authority;
  they cannot reuse normal project access.
- Isolation adds repetitive constraints but reduces catastrophic tenant leakage.

## Rejected alternatives

- Relying only on route middleware or client-side filtering.
- Inferring workspace from a user-selected UI state.
- Allowing globally unique resource IDs to bypass workspace constraints.
- Adding tenancy after core features are implemented.
