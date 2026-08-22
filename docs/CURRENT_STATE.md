# FrevOS Current State

Last updated: 2026-08-22

## Snapshot

| Item | Observed state |
| --- | --- |
| Production repository | `https://github.com/mishrarishav/FrevOS` |
| Detected default branch | `main` |
| Phase branch | `hotfix/windows-uat-first-install-reliability` |
| Base commit | `228ebaa5073769a57769e0b0f650be88c49c4af3` |
| Active phase | Phase 4 exit — Preview/UAT deployment and independent acceptance |
| Phase 3 merge | Core PR [#5](https://github.com/mishrarishav/FrevOS/pull/5) was human squash-merged as `13f3cd2`; its task branch was deleted |
| Phase 4A merge | Core PR [#7](https://github.com/mishrarishav/FrevOS/pull/7) was human squash-merged as `425c1f3`; its task branch was deleted |
| Phase 4B merge | Core PR [#8](https://github.com/mishrarishav/FrevOS/pull/8) was human squash-merged as `6bf5509`; its task branch was deleted |
| Phase 4C merge | Core PR [#9](https://github.com/mishrarishav/FrevOS/pull/9) was human squash-merged as `3973c59`; its task branch was deleted |
| Phase 4 UAT-package merge | Core PR [#10](https://github.com/mishrarishav/FrevOS/pull/10) was human squash-merged as `2b334bb` |
| Phase 4 local-preview merge | Core PR [#11](https://github.com/mishrarishav/FrevOS/pull/11) was human squash-merged as `9ded1f1` |
| Runtime capability | The authenticated Control Center, Fastify BFF, PostgreSQL forced RLS, protected workspace APIs, Preview routes, local table-backed credentials, and Windows/IIS UAT route are merged and live on the selected personal UAT target |
| Dependency manifests | pnpm workspace and committed lockfile on `main` |
| CI/CD | `CI / validate` passed on local-credential merge `0b3718a` and ACL-compatibility merge `228ebaa`; default-branch [run 32535926915](https://github.com/mishrarishav/FrevOS/actions/runs/32535926915) is green and the Windows UAT deployment remains operator-executed |
| Windows UAT evidence | Source `228ebaa5073769a57769e0b0f650be88c49c4af3` is active at `https://tserver2.eeslindia.org/frevos/`; public health, application assets, local login, protected UI, PostgreSQL service, control-plane task, loopback health, and the TrackGRN sibling health probe passed. Initial activation required recorded manual ACL and database-creation interventions that this active hotfix addresses |
| Independent QA harness | Merged through Acceptance PR [#1](https://github.com/mishrarishav/FrevOS-Acceptance/pull/1); exact-head and default-branch CI passed |
| Acceptance repository | Public `main` at completion-state squash commit `ffc85babed5f0e8deaf8af8d0194b9d3734d23be` |
| Acceptance merge governance | Active `Protect main` ruleset `20623785` enforces squash-only pull requests, conversation resolution, strict up-to-date `validate`, and deletion and force-push prevention |
| UI reference | Approved private repository ID `1329600731`, `mishrarishav/neural-command-lab`, commit `85f3ba2271ba381fc0520108365c5bb48fe386a7` |
| GitHub authentication | Verified for account `mishrarishav` during Phase 0A |
| Completed publications | Core PRs [#1](https://github.com/mishrarishav/FrevOS/pull/1), [#2](https://github.com/mishrarishav/FrevOS/pull/2), [#4](https://github.com/mishrarishav/FrevOS/pull/4), [#5](https://github.com/mishrarishav/FrevOS/pull/5), [#7](https://github.com/mishrarishav/FrevOS/pull/7), [#8](https://github.com/mishrarishav/FrevOS/pull/8), [#9](https://github.com/mishrarishav/FrevOS/pull/9), [#10](https://github.com/mishrarishav/FrevOS/pull/10), [#11](https://github.com/mishrarishav/FrevOS/pull/11), [#13](https://github.com/mishrarishav/FrevOS/pull/13), [#15](https://github.com/mishrarishav/FrevOS/pull/15), [#16](https://github.com/mishrarishav/FrevOS/pull/16), [#17](https://github.com/mishrarishav/FrevOS/pull/17), and Acceptance PRs [#1](https://github.com/mishrarishav/FrevOS-Acceptance/pull/1), [#3](https://github.com/mishrarishav/FrevOS-Acceptance/pull/3) squash-merged |
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
- The approved Phase 3 UI reference is pinned by repository ID and exact commit;
  it governs experience only and cannot own production architecture.
- The Control Center experience uses React 19, Vite 8, TypeScript 7, semantic
  CSS tokens, authenticated BFF data for Phase 4 resources, and explicitly
  labeled demonstration data only for later capabilities.
- The control-plane service boundary uses Fastify 5 on Node.js 24.
- Browser authentication uses a provider-neutral OpenID Connect BFF with
  server-side opaque sessions and no provider tokens in browser storage.
- Tenant persistence uses PostgreSQL with application authorization,
  workspace-scoped repositories, composite workspace foreign keys, and forced
  row-level security as independent defenses.
- Phase 4 hosted UAT targets the existing non-Production Windows IIS host with
  loopback-only Node.js and PostgreSQL 18. ADR 0021 changes only that personal
  target to local database-backed credentials; this is not a Production
  identity or platform selection.
- Phase 4 laptop Preview uses Caddy local HTTPS, Keycloak, PostgreSQL 18, and
  the same FrevOS product image; it does not replace hosted UAT or independent
  black-box acceptance.

The ADR index records the rationale and consequences of these decisions.

## Completed Phase 3

The merged Phase 3 foundation introduces:

- `apps/control-center` as the first product experience runtime;
- desktop and mobile shell navigation, Control Center, and design-system
  surfaces;
- local command palette, workspace switching, Agent Activity, command composer,
  and state-gallery interactions;
- planned destinations for later route vocabulary without implementing those
  capabilities;
- an exact UI source contract and web-foundation ADR.

Phase 3 does not introduce authentication, APIs, persistence, integrations,
authorization enforcement, real agent execution, approvals, audit storage,
artifacts, deployments, secrets, or Production access.

Core PR [#5](https://github.com/mishrarishav/FrevOS/pull/5) passed exact-head
CI at `088bbb670637bf3519e60cc9fc9208d0f4300fb9`, was human squash-merged as
`13f3cd22d9e82b1cf0b8a65621aeb9342b402698`, and passed default-branch
[CI run 31380728718](https://github.com/mishrarishav/FrevOS/actions/runs/31380728718).
The merged task branch was deleted. Deployed Preview or UAT product acceptance
remains unavailable and is not claimed.

## Completed Phase 4A

Phase 4A added the accepted Fastify, OIDC BFF, and PostgreSQL RLS decisions;
strict identity, session, workspace, membership, client, and project contracts;
and deterministic workspace authorization with negative tests.

Core PR [#7](https://github.com/mishrarishav/FrevOS/pull/7) passed exact-head
`validate` at `e3c21fca6b669a5eb1e78a8f67a4e6a6bffdcd2c`, was human squash-merged as
`425c1f3e8b20dde798316b557341baa6c8aa8fb8`, and passed default-branch
[CI run 31381302149](https://github.com/mishrarishav/FrevOS/actions/runs/31381302149).
Its remote task branch was deleted.

## Completed Phase 4B

Phase 4B added:

- a separately constructed Fastify BFF with bounded HTTP settings;
- provider-neutral OpenID Connect Authorization Code with PKCE, state, and nonce;
- encrypted pre-authentication state plus opaque, digest-backed, rotating,
  idle-limited, absolute-limited server sessions;
- same-origin, session-bound CSRF protection and hardened host cookies;
- PostgreSQL migrations and repositories for Phase 4 identity and workspace data;
- separate owner/runtime roles, transaction-local workspace context, forced RLS,
  membership-gated evidence resolution, and workspace-preserving foreign keys;
- real PostgreSQL 18.4 isolation and service integration tests.

Core PR [#8](https://github.com/mishrarishav/FrevOS/pull/8) passed exact-head
`validate` at `f7d2555dd73875feac32c3785625aef7ecfc851a`, was human
squash-merged as `6bf550922a8adec9cddbb881f32612a935adfbde`, and passed
default-branch
[CI run 31388085447](https://github.com/mishrarishav/FrevOS/actions/runs/31388085447).
Its remote task branch was deleted.

## Completed Phase 4C implementation

Phase 4C added:

- authenticated-principal workspace discovery with select-only RLS policies;
- server-side filtering for active `workspace:read` authorization;
- a strict browser-safe session summary contract and response validation;
- same-origin Control Center loading of authorized workspaces, clients, and
  projects without browser-managed tokens or membership evidence;
- fail-closed loading, unauthenticated, denied, empty, retry, and
  session-expired experience states;
- real PostgreSQL and deterministic client lifecycle tests.

Commands, tasks, Agent Activity, approvals, audit persistence, external side
effects, and all Phase 5 capabilities remain unavailable.

Core PR [#9](https://github.com/mishrarishav/FrevOS/pull/9) passed exact-head
`validate` at `50bf9d4cc55b6e75e6b30bbc38bb19d93fba3b71`, was human
squash-merged as `3973c592b4e35e336048da98b906ba15028f6d8a`, and passed
default-branch
[CI run 31484010142](https://github.com/mishrarishav/FrevOS/actions/runs/31484010142).
Its remote task branch was deleted. Independent deployed Preview or UAT
acceptance remained unavailable and was not claimed.

## Remaining Phase 4 exit work

Core PR [#10](https://github.com/mishrarishav/FrevOS/pull/10) merged the
non-Production Render, Auth0, PostgreSQL, region, backup, and secret-lifecycle
model; the pinned non-root product image; the Render Blueprint and UAT runbook;
the separate migration boundary; and the related deterministic validation. ADR
0019 now supersedes that paid hosted route while retaining the package as
historical evidence.

Core PR [#11](https://github.com/mishrarishav/FrevOS/pull/11) merged the optional
free laptop Preview target with generated ignored secrets, synthetic identities,
deterministic seed data, local CA guidance, and guarded backup/restore commands.
The local target remains development support and is not hosted-UAT, recovery,
or independent-acceptance evidence.

Core PR [#13](https://github.com/mishrarishav/FrevOS/pull/13) merged the Oracle
Always Free route as `5fccb6e927efe623d2a8aba5f089d554d48d4289` without
claiming a live target. The product owner subsequently selected the existing
non-Production Windows IIS host. Core PR
[#15](https://github.com/mishrarishav/FrevOS/pull/15) merged same-origin
`/frevos` support and the offline Windows deployment and recovery package as
`713093c01e8126345c87cc4457b943e4189d4d09`. ARR installation on the UAT server
was observed with exit code 0. Core PR
[#16](https://github.com/mishrarishav/FrevOS/pull/16) merged bounded local
credentials as `0b3718a48e152da5b62bed29ff953a737d3e0212`; Core PR
[#17](https://github.com/mishrarishav/FrevOS/pull/17) merged the concrete
PowerShell 5.1 ACL type correction as
`228ebaa5073769a57769e0b0f650be88c49c4af3`.

That exact source is active on the selected Windows UAT host. Public and
loopback health returned `200`, PostgreSQL and the control-plane task reported
`Running`, the local administrator completed a real browser login, protected
workspace UI rendered, static assets loaded, and the existing TrackGRN sibling
health probe remained `200`. First activation exposed three deterministic
installer defects: the installing user lacked explicit read access to ephemeral
PostgreSQL input files, the new data directory was not owned by the `initdb`
process identity, and an empty database-existence query was dereferenced as a
non-null string. Operator interventions were recorded without changing packaged
files; the active hotfix makes those steps reproducible. Recovery and independent
acceptance remain intentionally unexecuted.

## Open decision register

These are deliberate blockers to implementing the affected phases, not blockers
to completing Phase 0A:

| Decision | Needed by | Required evidence |
| --- | --- | --- |
| Production cloud provider and regional/data-residency strategy | Before Production | Customer location, compliance, availability, worker networking, support, and commercial requirements |
| Production OIDC provider, tenant, and assurance policy | Before Production | Enterprise SSO, end-user MFA, lifecycle, recovery, audit, regional, and commercial requirements |
| Production PostgreSQL availability and recovery model | Before Production | RPO, RTO, high availability, retention, restore drills, scaling, pooling, and operational ownership |
| Queue, worker runtime, retry, and cancellation semantics | Phase 7 | Persistence, idempotency, isolation, workload and cost model |
| GitHub App permission and webhook matrix | Phase 5 | Least-privilege mapping for every onboarding/workflow action |
| Worker sandbox and network-egress controls | Phase 5/8 | Threat model, supported builds, secret and artifact boundaries |
| Tool schema/versioning and policy engine design | Phase 6 | Compatibility, denial behavior, audit and approval integration |
| Model provider eligibility and project data classification | Phase 7 | Privacy, retention, regional, capability and cost requirements |
| Artifact store, provenance, SBOM, and signing | Phase 9 | Integrity, retention, access, promotion and verification model |
| Windows agent transport and device identity | Phase 10 | Outbound connectivity, authentication, rotation and recovery |
| Project-memory store, provenance, and freshness | Phase 12 | Retrieval quality, tenant isolation, deletion and retention |
| Outlook and Calendar consent scopes | Phase 15 | Minimum permissions, admin consent, retention and send approvals |
| Audit/evidence retention and private security reporting | Before Production | Legal, privacy, operational and incident-response requirements |
| Automation identity and independent reviewer model | Phase 5/8 | Separate bot/App identity, human reviewer ownership, and least-privilege GitHub scopes |

## Known limitations

- Phase 4 has a live personal Windows UAT application and observed local login,
  but the first activation required manual installer interventions. A clean
  deployment of the reviewed reliability fix, recovery exercise, and external
  acceptance have not yet been observed.
- Phase 1 implements contract and CI guardrails only; it does not implement the
  later runtime authorization, isolation, approval, audit, or deployment controls.
- The independent acceptance harness has no merged Phase 4 product-facing
  authentication specifications and has not run against an authorized deployed
  Phase 4 target.
- Chromium emulation does not prove Firefox, WebKit, or physical-device behavior.
- The selected Windows UAT target and authenticated browser state are validated;
  other external Preview or Production targets are not authorized or validated.
- Quantitative service objectives and compliance requirements are not defined.
- The current GitHub integration token can read repository rulesets but returns
  `403 Resource not accessible by integration` for ruleset and merge-setting
  writes. The human owner successfully applied and verified the current baseline.

## Readiness rule

Phases 0A through 4C implementation and the Phase 4 local-credential Windows
route are merged. Exact source `228ebaa5073769a57769e0b0f650be88c49c4af3`
is healthy on one HTTPS origin and the observed sibling IIS application remains
healthy. Phase 4 remains incomplete until the first-install reliability hotfix
is reviewed, merged, and cleanly deployed; logical backup and isolated recovery
evidence is recorded; and a separately reviewed independent black-box acceptance
change passes against that exact target. The product owner postponed recovery
execution to a later task. Phase 5 must not start before those gates.
