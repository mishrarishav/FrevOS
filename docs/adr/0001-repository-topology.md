# ADR 0001: Separate repositories by trust and lifecycle boundary

- Status: Accepted
- Date: 2026-08-09

## Context

FrevOS needs a production control plane, independent black-box acceptance
tests, an optional UI prototyping space, a high-trust Windows deployment agent,
and temporary access to arbitrary customer repositories. These components have
different owners, permissions, release cycles, and compromise impact.

Combining them would let ordinary production implementation modify independent
acceptance criteria, expose deployment-agent code to lower-trust workflows, or
turn customer source into permanent FrevOS content.

## Decision

- `mishrarishav/FrevOS` is the production platform modular monorepo.
- `mishrarishav/FrevOS-Acceptance` is a separate black-box acceptance repository.
- `FrevOS-UI-Lab`, if created, contains prototypes and approved design inputs,
  not production state, APIs, authentication, or architecture.
- `FrevOS-Windows-Agent`, when created, is a separate high-trust deterministic
  deployment service.
- Customer repositories remain external authorized resources. Workers use
  isolated temporary checkouts; repositories are not vendored, copied
  permanently, or added as submodules.

Runtime directories in `FrevOS` are introduced only when a roadmap phase needs
them.

## Consequences

- Independent QA and deployment trust boundaries are reviewable and enforceable.
- Cross-repository contracts and version compatibility must be explicit.
- CI, access policies, release cadence, and ownership can differ by repository.
- More repositories add operational overhead but reduce dangerous coupling.

## Rejected alternatives

- A single repository containing production and independent acceptance code.
- Git submodules for customer repositories or acceptance tests.
- Permanent mirrors of customer repositories as project identity.
- Hosting the Windows deployment agent inside the lower-trust control-plane
  deployment unit.
