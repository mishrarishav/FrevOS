# ADR 0070: Discovery roles and owner-scoped visibility

Status: Accepted for the owner's bounded Discovery enhancement, 2026-10-28.

## Scope

The owner requests normal users see their own Discovery data and only admins
see all systems. Continue the existing Phase 4 pilot on deployed source
8aaf286dad968f1618b0284afe9522e6597c4cbf in a dedicated
codex/discovery-role-access branch. Retain the preceding Servix evidence edits.
This does not start a later roadmap phase or authorize another Servix deployment.

Supersede ADR 0055 only for fixed administrator identification and previously
workspace-wide project-report visibility to ordinary connector users. Keep
connector consent, ownership, collection exclusions and all execution boundaries.

## Decision

Resolve Discovery admin visibility from an operator-controlled, versioned
DiscoveryAccessPolicy.json or an explicit persisted discovery:admin membership
grant. Require fresh active workspace/membership evidence for the exact actor
and workspace plus existing connector access. The policy's initial admin entry
preserves the existing pilot owner; no executable branch checks a specific user
ID. A login name, browser role, hostname, employee label or connector observation
cannot grant admin visibility. Configuration is published through the reviewed
platform workflow. Broad grant changes require their own authorized review; no
self-promotion endpoint or role-editing form is introduced here.

Normal users receive only actor-owned systems, their history/graphs and reports
with current matching device/user/repository/profile plan bindings. Unassigned
projects, foreign device IDs and foreign bindings are omitted, including summary
counts and filtered views. Project progress remains accepted milestone evidence,
never a percentage inferred from file activity. Admins see all workspace systems
and project reports and can manage project plans under the existing write scope.

Admin visibility does not grant cross-owner folder browsing, content requests,
tracking-policy changes or source process control. These stay with the connector
owner and retain local consent, freshness, path and credential checks. Pairing
under an admin account still owns the connector as that admin; no existing device
is silently reassigned to an employee or inferred from the Windows user name.

The API returns server-derived UI capabilities. Hide unauthorized controls and
label the current view. On failed authorization/connection or an account/role
change, clear retained dashboard data and inaccessible dialogs; never retain a
previous user's private evidence as a stale offline dashboard. Backend checks
remain authoritative if a caller constructs an API request directly.

## Verification and exclusions

Exercise two ordinary owners, configurable non-default admins, admin removal,
revoked membership, forged role/foreign IDs, unassigned projects, plan binding
redaction, stale bindings and owner-only control denials. Verify authenticated
HTTP responses and actual browser rendering against an isolated fixture before
claiming live acceptance. Preserve existing source/deployment/secret authorities.
No database schema migration, password change, live ownership reassignment,
outgoing notification or customer application deployment is part of this change.
