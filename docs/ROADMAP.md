# FrevOS Delivery Roadmap

## Delivery policy

FrevOS is delivered in bounded phases. A phase authorizes only the work listed
for that phase; completing it does not automatically authorize the next one.
Every phase requires a dedicated branch, proportional validation, complete diff
review, durable documentation updates, and a factual handoff.

Later-phase directory names and components describe intent, not existing
software. Do not scaffold them merely to suggest progress.

## Phase 0 — Repository foundation

### Phase 0A: architecture and governance

Status: **complete**

Deliverables:

- Root repository instructions and contributor guardrails.
- Durable product, architecture, roadmap, security, and permissions documents.
- Factual current-state and open-decision register.
- Initial architecture decision records.
- Resolved FrevOS repository naming and trust boundaries.
- Durable merge policy, pull-request checklist, and minimum `main` ruleset.

Explicitly excluded:

- Runtime source code or placeholder application directories.
- Dependency manifests or dependency installation.
- UI, APIs, data stores, queues, workers, MCP, or model integrations.
- CI/CD, Playwright, artifacts, deployment code, or infrastructure.

Exit criteria:

- All Phase 0A documents exist and agree on product identity and boundaries.
- Relative documentation links and whitespace validation pass.
- Security invariants, protected actions, and deferred decisions are explicit.
- The complete diff is reviewed and no runtime capability is implied.
- Publication actions occur only with separate authorization.

### Phase 0 completion

Resolve the minimum technical and operational decisions required to enter
Phase 1. Each accepted choice needs requirements, security analysis, and an ADR.
Phase 0 is complete only when `CURRENT_STATE.md` records readiness for Phase 1.

## Phase 1 — Foundation contracts, validation, and CI

Status: **complete**

Define the initial technology baseline and repository conventions. Implement
only foundational domain contracts, validation boundaries, test conventions,
and CI checks needed by subsequent phases. Include workspace identity in every
project-related contract from the start.

Phase 1 deliverables:

- Node.js, TypeScript, pnpm, formatting, lint, test, and build baseline.
- Strict foundational identifier, workspace/project scope, permission, risk,
  approval-binding, validation-result, and JSON Schema contracts.
- Unit tests with enforced coverage thresholds.
- Repository documentation/ruleset validation.
- Read-only GitHub CI with immutable action references and frozen installation.
- Automated dependency-update proposals and dependency vulnerability audit.
- ADRs and current-state evidence for every accepted foundation choice.

Phase 1 excludes UI, APIs, authentication, persistence, workers, GitHub App,
MCP, model integration, Playwright, cloud infrastructure, release artifacts,
and deployment implementation.

Exit requires all local commands and the pull-request CI check to pass on the
exact head SHA. Only after the workflow has a successful default-branch run may
its stable check name become mandatory in the `main` ruleset.

## Phase 2 — Independent acceptance harness

Status: **complete**

Establish `mishrarishav/FrevOS-Acceptance` as a separate black-box Playwright
repository. Define environment contracts, evidence handling, accessibility,
desktop/mobile coverage, failure artifacts, and protections against weakening
tests to accommodate production changes.

Phase 2 deliverables:

- independent repository governance and test-maintenance boundaries;
- pinned Node.js, pnpm, TypeScript, Playwright, axe-core, and Biome toolchain;
- validated fixture/preview/UAT environment contracts with no Production or
  credential support;
- a loopback-only synthetic fixture that proves harness behavior without
  claiming FrevOS product acceptance;
- desktop/mobile Chromium, accessibility, console, responsive, success, and
  network-failure harness checks;
- failure screenshots, traces, videos, HTML, JSON, and JUnit evidence;
- deterministic rejection of production coupling and common test-weakening
  mechanisms;
- read-only pinned CI, short artifact retention, dependency proposals, audit,
  and desired merge governance.

Phase 2 excludes FrevOS UI/product specifications, authentication, workspace
isolation, tool/approval/audit/deployment tests, Production execution, physical
devices, and visual baselines. Those tests require the corresponding product
phase and approved public behavior.

Exit requires complete local validation and evidence review, an authorized
acceptance-repository pull request with clean CI on its exact head SHA, human
squash merge, successful default-branch CI, and active protection requiring the
stable up-to-date validation check.

Exit evidence: Acceptance PR
[#1](https://github.com/mishrarishav/FrevOS-Acceptance/pull/1) passed exact-head
CI, was human squash-merged as `087f85e`, passed default-branch Acceptance CI,
and is protected by active ruleset `20623785` with strict required `validate`.

## Phase 3 — Control Center shell and design system

Status: **complete**

The hard UI-reference gate is satisfied by the approved, exact source recorded
in [Phase 3 UI Reference](UI_REFERENCE.md).

Implement the application shell and approved design system without assigning
production persistence, authorization, or API ownership to prototype code.

Phase 3 deliverables:

- a production-owned React and Vite application boundary;
- responsive desktop and mobile shell navigation;
- Control Center and design-system surfaces using deterministic demonstration
  data;
- command palette, workspace switcher, Agent Activity, Ask FrevOS composer, and
  reusable state gallery interactions;
- honest planned-surface destinations for later-phase route vocabulary;
- semantic OKLCH tokens, accessible focus behavior, and reduced motion;
- framework ADR, exact source contract, unit validation, and production build.

Phase 3 excludes authentication, API and provider integrations, persistence,
real repository or task actions, authorization enforcement, approvals,
orchestration, audit storage, releases, deployments, and PWA/offline behavior.
Those capabilities remain owned by their roadmap phases.

Exit evidence: Core PR [#5](https://github.com/mishrarishav/FrevOS/pull/5)
passed exact-head CI, was human squash-merged as `13f3cd2`, passed
default-branch CI, and its task branch was deleted.

## Phase 4 — Authentication, workspaces, clients, and isolation

Status: **in progress — Phase 4C implementation is merged; deployment and
independent acceptance remain**

Implement authentication and the workspace membership boundary. Add clients
and projects only with authorization and data-layer isolation tests, including
negative cross-workspace cases.

Phase 4 is delivered through three bounded slices:

- **Phase 4A — decisions and domain boundary:** service, session, and database
  ADRs; identity, session, workspace, membership, client, and project
  contracts; deterministic workspace authorization and negative unit tests.
- **Phase 4B — service and persistence:** Fastify BFF, OIDC adapter, durable
  server sessions, PostgreSQL schema and repositories, forced RLS, and real
  PostgreSQL isolation tests.
- **Phase 4C — experience and acceptance:** authenticated Control Center data,
  denied/expired/error states, and authorized black-box Preview or UAT
  acceptance.

See [Phase 4 Authentication and Workspace Foundation](PHASE_4_FOUNDATION.md)
for the exact boundary and exit criteria. Phase 4A contracts do not satisfy
the full phase exit without the Phase 4B data-layer proof.

Phase 4A was human squash-merged through Core PR
[#7](https://github.com/mishrarishav/FrevOS/pull/7) as `425c1f3`. Phase 4B was
human squash-merged through Core PR
[#8](https://github.com/mishrarishav/FrevOS/pull/8) as `6bf5509`. Phase 4C was
human squash-merged through Core PR
[#9](https://github.com/mishrarishav/FrevOS/pull/9) as `3973c59`; all three
merge commits passed default-branch CI. The remaining bounded exit work owns
same-origin UAT packaging and the selected non-Production operating model.
Full Phase 4 exit still requires an authorized live deployment, recovery
evidence, and separately reviewed independent black-box acceptance.

## Phase 5 — GitHub App and repository onboarding

Implement URL normalization, GitHub App authorization, immutable repository
identity, permission snapshots, webhook verification, isolated analysis, and
reviewable project configuration proposals.

## Phase 6 — Controlled tool gateway

Implement the versioned business-tool registry, schema validation, invocation
authorization, risk classification, approval hooks, idempotency, redaction,
timeouts, error contracts, and correlated audit events. Do not expose general
host or Production command execution.

## Phase 7 — Model router and task orchestrator

Implement provider-neutral model interfaces, data-policy routing, persistent
task state, bounded planning, retries, agent selection, and evidence assembly.
Models remain assistants; deterministic policy remains authoritative.

## Phase 8 — Repository work lifecycle

Implement isolated repository analysis, planning, dedicated-branch coding,
testing, independent QA coordination, review, commit, and pull-request flows.
Enforce default-branch and self-merge prohibitions.

## Phase 9 — Immutable build and release artifacts

Produce versioned artifacts with source identity, digests, SBOM, provenance,
and signing metadata where required. Enforce build-once promotion semantics.

## Phase 10 — Windows deployment service

Build the separate `FrevOS-Windows-Agent` as a deterministic, least-privileged,
allowlisted service supporting IIS and Windows Services. Prefer outbound
connectivity and prohibit arbitrary paths, commands, or executable targets.

## Phase 11 — Deployment lifecycle

Implement UAT and Production deployment requests, artifact verification,
approvals, backup, health checks, status reporting, and controlled rollback.
Prove that Production receives the UAT-tested digest.

## Phase 12 — Project memory

Implement source-linked workspace/project memory, freshness and invalidation
rules, retrieval authorization, provenance, and explicit separation between
verified facts and model assumptions.

## Phase 13 — Mobile PWA completion

Complete installability, offline-safe behavior, reconnectable task timelines,
notifications, touch interaction, slow-network behavior, and mobile acceptance
coverage.

## Phase 14 — Voice interface

Add push-to-talk commands as an input method. Voice identity alone must never
grant approval or authorize sensitive actions.

## Phase 15 — Outlook and Calendar

Implement separately scoped mail search/read, draft creation, approved sending,
calendar read/free-time lookup, event proposals, and approved invitation
sending. Preserve minimal consent and audit-safe redaction.

## Phase 16 — Autonomous workflows and hardening

Add policy-bounded automation, monitoring, evaluations, failure recovery,
operational hardening, abuse testing, and service objectives. Autonomy must not
erase approval boundaries or expand tool authority.

## Cross-phase exit gate

Before declaring any phase complete:

1. Confirm scope and excluded work.
2. Verify authorization and workspace-boundary implications.
3. Run and record relevant lint, type, test, build, and security checks.
4. Review the complete diff and generated evidence.
5. Update architecture, ADRs, security, permissions, and current state as needed.
6. Record limitations, deviations, and unresolved risks.
7. Make an explicit readiness decision; do not start the next phase silently.
