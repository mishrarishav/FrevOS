# FrevOS Current State

Last updated: 2026-08-10

## Snapshot

| Item | Observed state |
| --- | --- |
| Production repository | `https://github.com/mishrarishav/FrevOS` |
| Detected default branch | `main` |
| Phase branch | `phase/2-independent-acceptance-harness` |
| Base commit | `72bbcb462a20d0f93c8c272519e8cc7720929e69` |
| Active phase | Phase 2 complete — Phase 3 UI reference gate |
| Runtime capability | Foundational `@frevos/contracts` package merged; no application runtime |
| Dependency manifests | pnpm workspace and committed lockfile on `main` |
| CI/CD | `CI / validate` passed on `main` and is a strict required check |
| Independent QA harness | Merged through Acceptance PR [#1](https://github.com/mishrarishav/FrevOS-Acceptance/pull/1); exact-head and default-branch CI passed |
| Acceptance repository | Public `main` at Phase 2 squash commit `087f85eab600aa50243d2f22b90c68e3c7013ca9` |
| Acceptance merge governance | Active `Protect main` ruleset `20623785` enforces squash-only pull requests, conversation resolution, strict up-to-date `validate`, and deletion and force-push prevention |
| UI reference | Product owner will provide the Lovable reference at Phase 3 |
| GitHub authentication | Verified for account `mishrarishav` during Phase 0A |
| Completed publications | Core PR [#1](https://github.com/mishrarishav/FrevOS/pull/1), core PR [#2](https://github.com/mishrarishav/FrevOS/pull/2), and Acceptance PR [#1](https://github.com/mishrarishav/FrevOS-Acceptance/pull/1) squash-merged |
| Merge governance | Active `Protect main`; PR, squash, resolution, strict `validate`, deletion, and force-push controls verified |

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

## Completed Phase 1

The merged foundation introduces:

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

PR [#2](https://github.com/mishrarishav/FrevOS/pull/2) passed its exact-head
pull-request CI, was human squash-merged as `72bbcb4`, and then passed the
default-branch `CI / validate` run. The active ruleset now requires that stable
check and an up-to-date branch.

## Completed Phase 2

The merged independent `FrevOS-Acceptance` foundation introduces:

- separate repository and test-maintenance governance;
- Playwright desktop/mobile Chromium and axe-core accessibility foundations;
- fixture/preview/UAT environment validation with Production and credentials
  denied;
- a synthetic loopback fixture clearly separated from product acceptance;
- semantic, responsive, console, network-failure, and accessibility checks;
- retained-on-failure screenshot, trace, and video evidence plus HTML, JSON, and
  JUnit reports;
- automated rejection of production source coupling, skipped/focused tests,
  arbitrary sleeps, forced interactions, and weak assertions;
- read-only pinned CI, frozen dependencies, short artifact retention, and
  desired branch governance.

Acceptance PR [#1](https://github.com/mishrarishav/FrevOS-Acceptance/pull/1)
passed its exact-head CI, was human squash-merged as `087f85e`, and passed
default-branch
[Acceptance CI run 31363238909](https://github.com/mishrarishav/FrevOS-Acceptance/actions/runs/31363238909).
The active Acceptance ruleset requires the stable up-to-date `validate` check.

No FrevOS UI behavior is claimed or tested because the Phase 3 Lovable source
and screen contract have not been supplied.

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
- Independent acceptance uses a separate black-box Playwright repository and a
  synthetic self-test that cannot be represented as product acceptance.

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
- Phase 2 has no product-facing tests because no approved executable UI exists.
- Chromium emulation does not prove Firefox, WebKit, or physical-device behavior.
- External preview/UAT execution and authenticated browser state are not yet
  authorized or validated.
- Quantitative service objectives and compliance requirements are not defined.
- The current GitHub integration token can read repository rulesets but returns
  `403 Resource not accessible by integration` for ruleset and merge-setting
  writes. The human owner successfully applied and verified the current baseline.

## Readiness rule

Phases 0A, 1, and 2 are complete. Phase 3 is paused before UI implementation
until the product owner supplies and approves the exact Lovable source, commit,
screen contract, responsive behavior, design tokens, and acceptance criteria.
