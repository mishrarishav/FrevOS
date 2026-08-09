# FrevOS Current State

Last updated: 2026-08-09

## Snapshot

| Item | Observed state |
| --- | --- |
| Production repository | `https://github.com/mishrarishav/FrevOS` |
| Detected default branch | `main` |
| Phase branch | `phase/1-contracts-and-ci` |
| Base commit | `04953f5be4417182ff3a27ffb7a78e4dad667599` |
| Active phase | Phase 1 — foundation contracts, validation, and CI |
| Runtime capability | Foundational `@frevos/contracts` package on the phase branch |
| Dependency manifests | pnpm workspace and committed lockfile on the phase branch |
| CI/CD | Read-only `CI / validate` workflow prepared; external run pending publication |
| Independent QA harness | Not implemented |
| Acceptance repository | Accessible, public, empty, and has no default branch |
| UI reference | Product owner will provide the Lovable reference at Phase 3 |
| GitHub authentication | Verified for account `mishrarishav` during Phase 0A |
| Phase 0 publication | PR [#1](https://github.com/mishrarishav/FrevOS/pull/1) squash-merged as `04953f5` |
| Merge governance | Active `Protect main` ruleset; squash-only, PR, resolution, deletion, and force-push controls verified |

This snapshot distinguishes target architecture from implemented software. The
documents describe intended boundaries; they do not prove runtime enforcement.

## Completed Phase 0A

The merged foundation establishes:

- repository-wide engineering and agent instructions;
- FrevOS product definition and system boundaries;
- phased delivery roadmap with a Phase 3 UI reference gate;
- security threat model and permission/approval model;
- repository topology, isolation, model, tool, release, and approval ADRs;
- this factual state and decision register.

Phase 0A introduced no application runtime.

## Phase 1 work

The current phase branch introduces:

- Node.js 24 LTS, TypeScript 7, pnpm 11, native ESM, and strict compiler rules;
- one provider-neutral `@frevos/contracts` package;
- strict identifiers, workspace/project scopes, permissions, risk, approval
  bindings, safe validation results, and JSON Schema exports;
- Vitest unit tests with enforced coverage thresholds;
- Biome formatting and linting;
- repository documentation and desired-ruleset validation;
- read-only, commit-pinned GitHub Actions CI and grouped Dependabot proposals;
- exact dependencies, a frozen lockfile, and high-severity audit enforcement.

No UI, API, authentication, persistence, queue, worker, GitHub App, MCP, model,
Playwright, cloud infrastructure, artifact, or deployment capability is added.

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
- The foundation uses Node.js 24 LTS, pnpm 11, TypeScript 7, Biome, and Vitest.
- Zod schemas are the runtime source of truth for shared boundary contracts.
- CI runs the same validation with read-only permissions and immutable actions.

The ADR index records the rationale and consequences of these decisions.

## Open decision register

These are deliberate blockers to implementing the affected phases, not blockers
to completing Phase 0A:

| Decision | Needed by | Required evidence |
| --- | --- | --- |
| Web and service application frameworks | Phase 3/4 | UI contract, API boundaries, maintainability, security, and deployment needs |
| Cloud provider and regional/data-residency strategy | Before Phase 4 runtime deployment | Cost, availability, compliance, worker and networking requirements |
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
| Automation identity and independent reviewer model | Phase 5/8 | Separate bot/App identity, human reviewer ownership, and least-privilege GitHub scopes |

## Known limitations

- No application, API, persistence, authentication, or deployment behavior
  exists yet.
- Phase 1 implements contract and CI guardrails only; it does not implement the
  later runtime authorization, isolation, approval, audit, or deployment controls.
- `FrevOS-Acceptance` exists and is accessible but is empty; its independent
  harness and default branch are intentionally deferred to Phase 2.
- Quantitative service objectives and compliance requirements are not defined.
- GitHub CI cannot run until the phase branch is published. Local results do not
  replace the required clean-environment pull-request result.
- The current GitHub integration token can read repository rulesets but returns
  `403 Resource not accessible by integration` for ruleset and merge-setting
  writes. The human owner successfully applied and verified the current baseline.

## Readiness rule

Phase 0A is complete. Phase 1 may be marked complete only after local validation,
complete diff review, dependency audit, and the pull-request `CI / validate`
check pass for the exact head SHA. After the merged workflow succeeds on `main`,
its stable check name may be added to the `Protect main` ruleset. Phase 3 must
pause before UI work until the product owner supplies and approves the Lovable
source.
