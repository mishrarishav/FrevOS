# ADR 0016: Constrain workspace discovery with authenticated-principal row security

- Status: Accepted
- Date: 2026-08-11

## Context

Phase 4C must replace the demonstration workspace switcher with authorized
workspace data. A browser cannot safely guess a workspace identifier or submit
membership and permission evidence. The Phase 4B exact-workspace resolver is
appropriate after a workspace is selected, but it does not let an authenticated
principal discover which workspaces may be selected.

ADR 0015 requires verified, transaction-local policy context and forced RLS for
tenant tables. Workspace discovery must extend that defense without turning
principal identity into tenant-data authority or weakening the exact-workspace
boundary used for clients and projects.

## Decision

- Add a session-protected `GET /v1/workspaces` BFF endpoint. It derives the user
  identifier only from the authenticated server session.
- Set that validated user identifier as transaction-local `frevos.user_id`
  while listing workspace evidence. Never accept this context from a header,
  route parameter, browser state, model output, or client payload.
- Add select-only RLS policies that let `frevos_app` read workspace and
  membership rows belonging to that principal. Missing or different principal
  context returns no discovery rows.
- Do not extend principal discovery policies to clients or projects, and do not
  grant principal-scoped inserts or updates. Those operations retain the exact
  verified `frevos.workspace_id` boundary.
- Apply deterministic workspace authorization to every discovered membership
  and return only active workspaces with active membership and
  `workspace:read`. Return workspace records only, never membership status,
  granted scopes, or raw identity evidence.
- Reconstruct the session, exact workspace membership, and required permission
  again when the browser selects a workspace. A discovery result is not a
  reusable authorization grant.
- Validate the browser response against strict shared contracts and fail closed
  for malformed responses, denial, session expiry, and unavailable services.
- Prove missing-context, cross-principal, tenant-data, and write denial against
  real PostgreSQL, in addition to service authorization tests.

## Consequences

- The Control Center can populate its switcher without configured or guessed
  workspace identifiers.
- Principal context reveals only the principal's own membership relationships;
  client and project rows remain invisible until exact workspace authorization.
- Workspace discovery adds a second policy context with a deliberately narrower
  purpose. Repository APIs and tests must keep principal discovery and tenant
  data transactions distinct.
- Membership removal, suspension, workspace suspension, or scope removal causes
  discovery or subsequent selection to fail closed.

## Rejected alternatives

- A committed or runtime-configured default workspace identifier.
- Browser-supplied membership, roles, scopes, or principal identifiers.
- Listing every workspace and relying on hidden UI controls for isolation.
- Treating an earlier discovery response as sufficient authority for later data
  access.
- Extending principal-scoped RLS reads to all tenant tables.

## Related records

- [ADR 0002](0002-workspace-isolation.md)
- [ADR 0014](0014-oidc-bff-sessions.md)
- [ADR 0015](0015-postgresql-tenant-isolation.md)
- [Phase 4 foundation](../PHASE_4_FOUNDATION.md)
