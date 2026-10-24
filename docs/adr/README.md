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
| [0022](0022-trackgrn-uat-automation-pilot.md) | Accepted | Authorize a bounded TrackGRN UAT automation pilot |
| [0023](0023-trackgrn-human-approved-squash-merge.md) | Accepted | Allow exact-head, green-check, human-approved TrackGRN squash merge |
| [0024](0024-personal-github-repository-onboarding.md) | Accepted | Discover personal GitHub repositories through the Windows companion |

## Creating an ADR

Bounded unmerged operator decision:
[0038: server20 internal HTTP](0038-server20-internal-http.md).

Use the next four-digit number and a short kebab-case name. Include title,
status, date, context, decision, consequences, rejected alternatives, and links
to related records. Update this index in the same change.

Bounded owner-selected development pilot:
[0039: server20 Git and Servix dashboard deployment](0039-server20-servix-git-dashboard.md).

[0040: portable developer connectors](0040-portable-developer-connectors.md)
supersedes the manual source-publication workflow; implementation is in progress.

[0041: Servix saved-release rollback](0041-servix-saved-release-rollback.md)
adds repeated restoration of retained development builds without changing source.

[0042: project deployment settings](0042-project-deployment-settings.md)
adds revisioned configuration, folder selection and read-only connector tests.

[0043: project master and deployment workspace](0043-project-master-and-deployment-workspace.md)
moves configuration under Projects, adds shared card/table lists and revisioned
archive/restore, and connects the browser to a device-owned local folder picker.

[0044: DevSetu display branding](0044-devsetu-display-branding.md)
renames visible product copy while preserving backend and deployment identities.

[0045: account controls and platform update](0045-account-controls-and-platform-update.md)
fixes editor closing/scrolling and adds local account controls and a bounded
server20 self-activation pilot requested by the owner.

[0046: DevSetu managed project](0046-devsetu-managed-project.md)
lists the platform in Projects and Deployments with its independent updater and
read-only configuration.

[0047: deployment change records](0047-deployment-change-records.md)
adds required change/declared-approval context to deployment confirmations,
history and source publication commits.

[0048: server20 source identity](0048-server20-source-identity.md)
replaces stale Servix GitHub-origin checks with the existing central Git identity
and preserves the authenticated bundle workflow.

[0049: configured component deployments](0049-configured-component-deployments.md)
defines reusable source/build/destination enrollment, independent component
deployments and the platform source pipeline for the development pilot.

[0050: bounded native artifact transfer](0050-bounded-native-artifact-transfer.md)
pins configured native archive storage and small digest-bound control-plane
references without changing shared IIS request limits.

[0051: Interrupted build resolution](0051-interrupted-build-resolution.md)
adds an actor/source-bound, non-replaying closure for interrupted builds only.

[0052: Native builder output scope](0052-native-builder-output-scope.md)

[0053: Local development runtime](0053-local-development-runtime.md)
defines the bounded project-scoped development session pilot.

[0054: Local environment editor](0054-local-environment-editor.md)
adds owner-requested generic environment variable CRUD to that pilot.

[0055: System discovery and onboarding](0055-system-discovery-onboarding.md)
records cross-platform prerequisites, local-drive evidence, selected text history
and authoritative delivery plans; mail integration and notices remain deferred.

[0056: System identity, folder browsing and generic local preview](0056-system-folder-workspace.md)
records the owner's corrections to machine/project presentation, drive navigation
and generic nested-service discovery.

[0057: Built backend artifacts and preservation-first promotion](0057-servix-backend-build-artifact.md)
records isolated backend bundling, real DevSetu Development acceptance, immutable
promotion and the owner's no-deletion/data-preservation requirement.
