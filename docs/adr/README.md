# Architecture Decision Records

Architecture Decision Records (ADRs) preserve why consequential FrevOS choices
were made. Accepted records are immutable historical evidence. A changed
decision receives a new ADR that names the record it supersedes.

## Status values

- **Proposed:** under review and not implementation authority.
- **Accepted:** approved architecture direction.
- **Deprecated:** retained for history but no longer recommended.
- **Superseded:** replaced by a named later ADR.

## Index

| ADR | Status | Decision |
| --- | --- | --- |
| [0001](0001-repository-topology.md) | Accepted | Separate repositories by trust and lifecycle boundary |
| [0002](0002-workspace-isolation.md) | Accepted | Enforce workspace scope in authorization and data access |
| [0003](0003-controlled-tool-gateway.md) | Accepted | Route side effects through controlled business tools |
| [0004](0004-provider-neutral-model-boundary.md) | Accepted | Keep model providers behind domain-neutral adapters |
| [0005](0005-immutable-artifact-promotion.md) | Accepted | Build once and promote the same artifact digest |
| [0006](0006-sensitive-action-approvals.md) | Accepted | Require bound, expiring, single-use human approvals |
| [0007](0007-cloud-jobs-and-ephemeral-checkouts.md) | Accepted | Persist jobs and isolate repository execution in cloud workers |
| [0008](0008-default-branch-and-merge-governance.md) | Accepted | Protect `main` with pull-request and human-merge controls |
| [0009](0009-foundation-toolchain.md) | Accepted | Use a minimal Node.js and TypeScript workspace toolchain |
| [0010](0010-schema-first-domain-contracts.md) | Accepted | Define strict runtime-validated, workspace-scoped contracts |
| [0011](0011-continuous-integration-baseline.md) | Accepted | Run least-privilege, reproducible validation in GitHub Actions |
| [0012](0012-control-center-web-foundation.md) | Accepted | Use React and Vite for the Control Center experience |
| [0013](0013-fastify-control-plane.md) | Accepted | Use Fastify for the control-plane service boundary |
| [0014](0014-oidc-bff-sessions.md) | Accepted | Use OpenID Connect through a session-owning backend |
| [0015](0015-postgresql-tenant-isolation.md) | Accepted | Enforce tenant data boundaries with PostgreSQL row security |
| [0016](0016-principal-scoped-workspace-discovery.md) | Accepted | Constrain workspace discovery with authenticated-principal row security |
| [0017](0017-preview-uat-operating-model.md) | Superseded | Operate Phase 4 Preview and UAT on Render and Auth0 |
| [0018](0018-local-preview-operating-model.md) | Accepted | Add a free local Preview operating model |
| [0019](0019-oracle-free-uat-operating-model.md) | Superseded | Operate hosted Phase 4 UAT on Oracle Always Free and Auth0 |
| [0020](0020-windows-iis-uat-operating-model.md) | Superseded | Operate hosted Phase 4 UAT on the existing Windows IIS host |
| [0021](0021-local-credentials-for-personal-windows-uat.md) | Accepted | Use local credentials for personal Windows UAT |

## Creating an ADR

Use the next four-digit number and a short kebab-case name. Include title,
status, date, context, decision, consequences, rejected alternatives, and links
to related records. Update this index in the same change.
