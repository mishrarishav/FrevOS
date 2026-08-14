# FrevOS

FrevOS is a cloud-first AI Work Operating System. It is the control plane
around AI-assisted work: authorization, planning, policy, execution, evidence,
approvals, audit, release, and deployment.

FrevOS is not a code editor, a general-purpose chatbot, or an unrestricted
remote shell. A user connects an authorized GitHub repository and directs
bounded work from a web or mobile client. Cloud-hosted workers perform the
work through controlled tools, and sensitive actions require explicit human
approval.

## Current status

**Phase 4 exit: Preview/UAT deployment and independent acceptance are in
progress.** The authenticated Control Center, Fastify OIDC BFF, durable server
sessions, protected workspace APIs, and forced PostgreSQL row security are
merged. The active bounded work replaces the paid hosted route with an Oracle
Always Free ARM64 UAT target using private PostgreSQL 18, Caddy HTTPS, Auth0
Free, validated backup, and isolated recovery boundaries. No live cloud target
or Phase 4 completion is claimed yet.

See [Current State](docs/CURRENT_STATE.md) for the factual implementation
status and open decisions.

For an authenticated laptop Preview using local HTTPS, Keycloak, and
PostgreSQL 18, follow [Local Preview](docs/LOCAL_PREVIEW.md) and run
`pnpm local:up`.

For the separately authorized hosted free-tier route, follow the
[Phase 4 Oracle UAT runbook](docs/PHASE_4_UAT_RUNBOOK.md).

## Non-negotiable principles

- Every project resource is workspace scoped.
- Customer repositories remain external and are checked out ephemerally.
- Repository content is untrusted input.
- Agents use schema-validated business tools, not unrestricted host access.
- Agents never push directly to a default branch or merge their own changes.
- Sensitive actions use scoped, expiring, single-use approvals.
- Secrets are referenced, never exposed to models, logs, or repository files.
- Releases are built once; UAT and Production receive the same artifact digest.
- Production implementation and black-box acceptance testing remain separate.
- Every meaningful action produces correlated, redacted audit evidence.

## Repository family

| Repository | Responsibility |
| --- | --- |
| `mishrarishav/FrevOS` | Production control plane and product implementation |
| `mishrarishav/FrevOS-Acceptance` | Independent black-box acceptance tests |
| `mishrarishav/neural-command-lab` | Private Lovable prototype and pinned experience reference only |
| `FrevOS-Windows-Agent` (future) | Deterministic high-trust Windows deployment service |

Customer repositories are never vendored into this repository or attached as
Git submodules.

## Documentation

- [Product](docs/PRODUCT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Security](docs/SECURITY.md)
- [Permissions](docs/PERMISSIONS.md)
- [Merge Policy](docs/MERGE_POLICY.md)
- [Development](docs/DEVELOPMENT.md)
- [Phase 3 UI Reference](docs/UI_REFERENCE.md)
- [Phase 4 UAT Runbook](docs/PHASE_4_UAT_RUNBOOK.md)
- [Local Preview](docs/LOCAL_PREVIEW.md)
- [Current State](docs/CURRENT_STATE.md)
- [Architecture Decision Records](docs/adr/README.md)
- [Contributor and agent rules](AGENTS.md)

Documentation in this repository is the durable source of truth. Changes to
approved architecture must update the relevant document and add or supersede
an architecture decision record.
