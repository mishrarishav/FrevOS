# FrevOS Current State

Last updated: 2026-08-09

## Snapshot

| Item | Observed state |
| --- | --- |
| Production repository | `https://github.com/mishrarishav/FrevOS` |
| Detected default branch | `main` |
| Phase branch | `phase/0a-architecture-foundation` |
| Base commit | `7d4ebddbd15693b5747cbb2bf5d8283cb17a2ffa` |
| Active phase | Phase 0A — architecture and governance foundation |
| Runtime capability | None |
| Dependency manifests | None |
| CI/CD | None |
| Independent QA harness | Not implemented |
| Acceptance repository | Accessible, public, empty, and has no default branch |
| UI reference | Product owner will provide the Lovable reference at Phase 3 |
| GitHub authentication | Verified for account `mishrarishav` during Phase 0A |
| External GitHub publication | Branch pushed; draft PR [#1](https://github.com/mishrarishav/FrevOS/pull/1) open against `main` |
| Merge governance | Policy, PR template, and desired ruleset prepared; no GitHub ruleset active |

This snapshot distinguishes target architecture from implemented software. The
documents describe intended boundaries; they do not prove runtime enforcement.

## Phase 0A work

The working branch establishes:

- repository-wide engineering and agent instructions;
- FrevOS product definition and system boundaries;
- phased delivery roadmap with a Phase 3 UI reference gate;
- security threat model and permission/approval model;
- repository topology, isolation, model, tool, release, and approval ADRs;
- this factual state and decision register.

No application, service, package, infrastructure, acceptance-test, model, MCP,
database, queue, deployment, or UI runtime is introduced.

## Accepted foundation decisions

- The product and primary repository are named FrevOS.
- `mishrarishav/FrevOS` is the production modular monorepo.
- `mishrarishav/FrevOS-Acceptance` is independent black-box QA.
- Customer repositories remain external and use ephemeral isolated checkouts.
- Project resources and memory are workspace scoped.
- Agents use controlled business tools and have no ambient authority.
- Model integration is provider neutral at the domain boundary.
- UAT and Production promote the same immutable artifact digest.
- Sensitive actions require exact, single-use human approval.
- A separate allowlisted Windows agent performs deterministic deployment.

The ADR index records the rationale and consequences of these decisions.

## Open decision register

These are deliberate blockers to implementing the affected phases, not blockers
to completing Phase 0A:

| Decision | Needed by | Required evidence |
| --- | --- | --- |
| Runtime language, framework, and workspace tooling | Phase 1 | Product fit, maintainability, security, test and deployment needs |
| Cloud provider and regional/data-residency strategy | Phase 1 | Cost, availability, compliance, worker and networking requirements |
| Identity provider and session architecture | Phase 4 | Tenant model, MFA, lifecycle, recovery, audit requirements |
| Database and tenant-enforcement mechanism | Phase 4 | Isolation proof, migrations, backup, performance, operational model |
| Queue, worker runtime, retry, and cancellation semantics | Phase 7 | Persistence, idempotency, isolation, workload and cost model |
| GitHub App permission and webhook matrix | Phase 5 | Least-privilege mapping for every onboarding/workflow action |
| Worker sandbox and network-egress controls | Phase 5/8 | Threat model, supported builds, secret and artifact boundaries |
| Tool schema/versioning and policy engine design | Phase 6 | Compatibility, denial behavior, audit and approval integration |
| Model provider eligibility and project data classification | Phase 7 | Privacy, retention, regional, capability and cost requirements |
| Artifact store, provenance, SBOM, and signing | Phase 9 | Integrity, retention, access, promotion and verification model |
| Windows agent transport and device identity | Phase 10 | Outbound connectivity, authentication, rotation and recovery |
| Project-memory store, provenance, and freshness | Phase 12 | Retrieval quality, tenant isolation, deletion and retention |
| Lovable UI source and approved commit | Phase 3 | Repository/ZIP, exact SHA, screen contract and responsive states |
| Outlook and Calendar consent scopes | Phase 15 | Minimum permissions, admin consent, retention and send approvals |
| Audit/evidence retention and private security reporting | Before Production | Legal, privacy, operational and incident-response requirements |
| Automation identity and independent reviewer model | Phase 1 | Separate bot/App identity, human reviewer ownership, and least-privilege GitHub scopes |

## Known limitations

- No functional behavior exists to test or deploy.
- No security control described in the target architecture is implemented yet.
- `FrevOS-Acceptance` exists and is accessible but is empty; its independent
  harness and default branch are intentionally deferred to Phase 2.
- Quantitative service objectives and compliance requirements are not defined.
- Phase 0A uses documentation checks only; runtime test, build, and security
  scan results are not applicable.
- The current GitHub integration token can read repository rulesets but returns
  `403 Resource not accessible by integration` for ruleset and merge-setting
  writes. `main` therefore remains mechanically unprotected until an authorized
  administrator applies the documented baseline.

## Readiness rule

Phase 0A may be marked complete after its documentation and diff validations
pass and the authorized changes are published through the agreed Git workflow.
Starting Phase 1 requires a separate readiness decision. Phase 3 must pause
before UI work until the product owner supplies and approves the Lovable source.
