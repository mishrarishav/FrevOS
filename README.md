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

**Phase 4B: control-plane identity and PostgreSQL isolation is in progress.**
The Phase 3 Control Center and Phase 4A contracts are merged. The active branch
adds the first Fastify BFF, provider-neutral OIDC adapter, durable server
sessions, protected workspace APIs, and forced PostgreSQL row security. The web
shell still uses demonstration data until Phase 4C experience integration.

See [Current State](docs/CURRENT_STATE.md) for the factual implementation
status and open decisions.

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
- [Current State](docs/CURRENT_STATE.md)
- [Architecture Decision Records](docs/adr/README.md)
- [Contributor and agent rules](AGENTS.md)

Documentation in this repository is the durable source of truth. Changes to
approved architecture must update the relevant document and add or supersede
an architecture decision record.
