# ADR 0006: Require bound, expiring, single-use human approvals

- Status: Accepted
- Date: 2026-08-09

## Context

FrevOS coordinates actions whose mistakes can alter Production, destroy source,
change permissions or secrets, write Production data, or communicate externally.
Broad or reusable approvals are vulnerable to replay, target substitution,
stale context, confused-deputy failures, and voice or prompt spoofing.

## Decision

Production deployment and rollback, Production release promotion, destructive
repository operations, broad permission changes, secret creation/rotation/
revocation, external email sending, calendar invitation sending, and Production
database writes always require explicit human approval.

An approval is single-use, expiring, actor-bound, workspace-bound,
action-bound, target-bound, and correlation-bound. Artifact actions also bind
the artifact ID and digest; communications bind recipients and the exact content
version. Consumption is atomic and revalidated immediately before execution.

Approval does not bypass underlying permission, policy, validation, artifact
integrity, target allowlists, or required audit persistence. Voice input and
model output may request approval but cannot grant it.

## Consequences

- Protected workflows need explicit pause, expiry, rejection, and replacement
  states.
- Changed targets or content require a new approval.
- Idempotent execution must distinguish a retry from approval replay.
- User experience must clearly show impact without exposing secrets.
- Emergency access and multi-approver policy remain separately designed needs.

## Rejected alternatives

- Permanent or workspace-wide “approve everything” tokens.
- Treating authentication or a broad role as approval for a specific action.
- Reusing a UAT approval for Production.
- Allowing voice recognition or an agent to satisfy human approval.
