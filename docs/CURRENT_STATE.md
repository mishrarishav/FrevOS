# DevSetu Current State

Last updated: 2026-10-23

## Configured component deployments (in progress, 2026-10-22)

The owner requests configurable microservice destinations and the same source
connector workflow for DevSetu. Work is stacked on
`feature/configured-component-deployments`, ADR 0049. Add a revisioned component
model and independently enrolled build/destination workers while preserving the
existing Servix compatibility path and production exclusion. Implementation and
verification are in progress. Do not infer
remote acceptance or full source-pipeline readiness from new configuration UI.

Resume evidence: the verified component-engine HTTP correction `9a62b20e` is now
active after an actual maintenance-popup submission. Health/UI returned 200;
the activation receipt records no database write and preserved sibling IIS.
Full CI passed 246 tests and required coverage gates; real local Playwright
passed source/build/split deployment, repeated rollback, protection, offline and
responsive checks, including internal HTTP without `crypto.randomUUID`.
The laptop source and unprivileged builder, and independent server20 destination,
are enrolled and online; all three configuration checks pass. Actual native source
pipeline acceptance is still in progress. See
[the current component handoff](COMPONENT_DEPLOYMENTS_HANDOFF.md) for exact
artifacts, nonsecret recovery context and remaining work.

## Server20 Servix repository identity (2026-10-22)

The owner explicitly requests server20 as the Servix repository instead of the
stale GitHub URL. Work is stacked on `fix/server20-repository-identity`, ADR 0048.
The existing central remote/ID and authenticated bundle transport are reused;
source readiness, publication, installation and folder proof must agree on that
binding. Preserve legacy origin, Git working tree/history and destination data.
Manifest `9f3ba5d7` is active after one actual DevSetu update popup submission,
with the change and owner-request approval reference persisted. The Servix profile
now points to the central server20 repository at revision 3, with old settings in
history. Connector/picker upgrade preserved task/pairing; all four live connection
checks passed and Deploy is enabled. Its real popup opened and was cancelled:
zero customer Deploy/Rollback POSTs. Current central/local source, Git working tree,
destination and all five protected paths are unchanged. CI passed 234 tests;
final connector-only boundary regressions, lint/types, native picker and exact
artifact smoke passed. See [the handoff](SERVER20_REPOSITORY_HANDOFF.md).

## Deployment change records (2026-10-22)

The owner requests change-message and approval-reference popups on Deploy and
Rollback. Work is stacked on `feature/deployment-change-notes`, ADR 0047. Context
is required on new requests and retained in history; authenticated actor remains
separate from declared approval text. Servix commits include the supplied context;
restores create no Git commit. Platform activation also records context, preserving
the existing native request boundary. Full CI passed 234 tests and required gates;
exact artifact and packaged native entry-point smoke passed for prepared manifest
`a2bc92d1`, now active after one real DevSetu updater click. After a VPN reconnect,
fresh HTTP80/SMB445 and read-only Plan passed; native Apply reports health/UI200,
no database write and sibling IIS preserved. The existing laptop connector was
upgraded with task/pairing preserved and its message capability verified online.
Live Rollback/Restore popup cancellation submitted no customer action; exact
settings, current source and request remained unchanged. The existing Servix
origin mismatch still disables its Deploy and was not changed in this task.
See [the handoff](DEPLOYMENT_CHANGE_NOTES_HANDOFF.md) for the immutable artifact,
executed evidence and coverage limits.

## DevSetu project visibility (2026-10-22)

The owner noted that Projects still listed only Servix. Work is stacked on
`fix/devsetu-managed-project` under ADR 0046. Add the backend-owned, read-only
platform record to Projects and Deployments; its owner deployment link opens the
existing platform updater. No customer runner, database migration or local source
publication is added. Manifest `733af544` is active after one actual dashboard
update request. Live Projects and Deployments show DevSetu and Servix in cards and
tables; the DevSetu row opens the updater. Full CI passed 233 tests and required
gates, exact packaged/native-entrypoint checks passed, and live readback confirmed
Servix configuration/current source/request unchanged with its connector online.
See [the handoff](DEVSETU_PROJECT_HANDOFF.md) for scope and immutable receipts.

## System connector, account controls and self-update (2026-10-22)

The owner reported a stuck dirty new-project dialog and clipped connector panel,
requested the System connector name, account logout/change/reset controls, and
activation of updates through DevSetu itself. Work is stacked on
`fix/system-connector-and-account-controls`; ADR 0045 records the bounded scope.
Existing local hashing, memberships, sessions and invitations are reused without
schema changes. VPN was reconnected and live HTTP/SMB verified. Manifest
`2a01ac93` is active after one real Deploy DevSetu click; the independent native
updater's result publisher was subsequently repaired and reconciled without an
application redeploy. The dashboard reports success across a fresh login. Full
CI passed 232 tests and required gates; subsequent native ACL/journal regressions
and live controls/logout checks passed. Servix current source/request, configuration
revision 2 and its five protected paths remain unchanged; connector online.
This is activation of a prepared artifact, not automatic laptop source/build
publication. See [the handoff](SYSTEM_CONNECTOR_ACCOUNTS_HANDOFF.md) for exact
application/worker digests, recovery evidence and remaining limits.

## DevSetu branding (2026-10-22)

The owner selected DevSetu and requested a minimal display rename and server20
deployment. Work is stacked on `feature/devsetu-branding`, preserving preceding
uncommitted work. ADR 0044 keeps backend/database identities and all existing
deployment behavior intact. Manifest `b9f712ee` is active; 76 UI tests, typecheck,
build, artifact integrity and live branding checks passed. All 3,645 backend and
migration/dependency files match the prior release. Saved settings and current
Servix build are unchanged; the updated connector remains online. The existing
Servix origin/allowlist mismatch still disables Deploy and was not changed in
this display-only task. See
[the branding handoff](DEVSETU_BRANDING_HANDOFF.md).

## Project master and deployment workspace (2026-10-21)

The owner supplied HRMS Applications references and requested Projects master-data
configuration, card/table deployment lists, badges and a working folder picker.
Work proceeds on stacked `feature/project-deployment-workspace`, preserving prior
uncommitted work. ADR 0043 replaces the setup navigation/presentation while keeping
Phase 4 development-pilot scope and fixed Servix destination authority. Archives
are revisioned configuration state, never application or artifact deletion.
Folder selection is a short-lived device-owner request with a native Windows
picker, repository validation and backed-up local path configuration. Manifest
`84911d3a` is active on server20. Live project/deployment views, source/destination
tests, installed native selection/cancellation and persistence after connector
restart passed. Servix request/source remained unchanged; no customer-app Deploy
or Rollback was clicked. Full CI passed 228 tests and required gates; native
Windows/UTF-8 bridge checks and final UI follow-up checks passed. Generic
destination adapters and Production remain outside this task. See
[the handoff](PROJECT_WORKSPACE_HANDOFF.md) for exact scope and evidence.

## Project deployment settings (2026-10-21)

The owner requests a setup page for other project sources, destinations, protected
attachments and connector installation/testing. Work proceeds on the stacked
`feature/project-deployment-settings` branch, preserving preceding uncommitted
work. The active roadmap remains Phase 4 exit with the owner-selected development
pilot exceptions described in ADR 0042. Other projects are explicitly draft
destinations until an applicable runner is connected; no arbitrary remote command
editor, Production target or credential reuse is added. The Servix adapter retains
its exact approved target and consumes snapshotted preservation rules on deployment
and saved-release restore. Manifest `9fee2a44` is active on server20; the live setup
page saved/reloaded revision 2 and passed source/destination/preservation checks.
The existing laptop connector was upgraded with its credentials/task preserved.
The current Servix request/source remained unchanged; no customer-app deployment
was triggered for acceptance. CI passed 223 tests and required gates. See
[the project settings handoff](PROJECT_DEPLOYMENT_SETTINGS_HANDOFF.md) for exact
evidence and limitations. No Phase 4 exit or whole-product readiness claim.

## Servix saved-release rollback (2026-10-21)

The owner requested repeatable rollback and later normal deployment of current
source. Branch `feature/servix-release-rollback` preserves the preceding local
work. Manifest `dbc684cd` is active on server20; the dashboard now provides
Rollback previous build, history Restore this build and Currently deployed.
Four live UI operations (rollback/restore twice) succeeded using retained immutable
artifacts, with no source publication or rebuild. The current build was restored
at the end: source `bad4403be655`, frontend `main.cdee177f.js`. Independent
readback matched all 106 current code files, verified two obsolete tracked files
absent and confirmed 145 existing persistent files, production listener and IIS
preserved. The old build similarly matched 104 files and four obsolete removals.
Health/full bootstrap passed. Laptop HEAD/branch/working tree and the central Git
source ref were unchanged. Both dashboard actions re-enabled after completion.

CI passed 210 tests and required gates; the additional UI regressions passed in
its 73-test suite (212 distinct tests overall). Native journal tests exercised
three A/B cycles, removed-file recovery, drift denial and data preservation.
Rollback uses actor/target-bound fresh requests, private successful receipts,
artifact hashes and a SYSTEM-owned current-release pointer. It changes code,
not database state or installed dependencies. See
[the handoff](SERVIX_ROLLBACK_HANDOFF.md) and
[ADR 0041](adr/0041-servix-saved-release-rollback.md).

## Portable developer connector (2026-10-21)

The owner superseded manual commit/push with a one-click source publication
requirement and selected FrevOS developer invitations (not Active Directory).
Local implementation and CI pass on `feature/servix-dashboard-deploy`: 207 tests,
required coverage, build and dependency audit. Windows download/setup, per-user
device pairing/revocation, invitations and actor-bound Git bundle publication are
implemented for the existing Servix development profile. Prior manifest `2a266bf0`
passed HTTP download integrity, live controls, the owner's real
installation, Limited per-user task, heartbeat and enabled Deploy button passed.
No additional developer account was created. The owner's local HEAD/branch and
working-tree status were preserved during installation. The owner's first Deploy
created a commit but exposed missing Git root-lock permissions on server20. The
bounded correction passed native LOCAL SERVICE Git prepare/abort checks while
Git config remained unwritable. The UI now shows stage/spinner/elapsed time,
retains active requests across stale polls and hides invitations behind Add
developer. Separate authenticated heartbeats avoid false offline reports during
Git import. The actual owner's Limited task automatically restarted after a
controlled stop without a manual start; future installers include its one-minute
recovery trigger. Retry `sd_8aa86bca8f6eb124373a34af559b6f09` published
`bad4403be655` and succeeded on server21 development. All 106 deployed code files
matched the sealed artifact; 145 existing files, production listener identity and
IIS configuration were preserved. HTTP health/bootstrap checks passed and the
served frontend contains the owner's white-text badge style. The browser showed
progress throughout, retained its disabled button after refresh and re-enabled
Deploy only after completion. Final acceptance is recorded in the handoff. The old manual-push
workflow is superseded. See
[the connector handoff](DEVELOPER_CONNECTOR_HANDOFF.md) and
[ADR 0040](adr/0040-portable-developer-connectors.md).

## Servix development Git/deploy pilot (2026-10-21)

Owner-selected local commit/push -> server20 private Git -> server20 FrevOS
Deploy -> server21 `D:\servixDev` is live on the dedicated
`feature/servix-dashboard-deploy` worktree. The visible dashboard deployment of
source `ce4b102efb66217ef5c8398975dfe4d7ad83119a` succeeded. Fresh readback matched
104 code files and 145 protected files; all 139 uploads remained present and the
production PID/creation time and IIS configuration were preserved. Browser health
returned 200 / OK with full bootstrap ready. Same-request retry did not duplicate
the deployment. No persistent laptop worker is needed; a scoped pre-push hook
publishes locked public npm dependencies to the server20 cache.

CI passed 193 tests, required coverage, types, build and audit; the final audit
reported no known vulnerabilities after patching the Vite development dependency.
Native Windows service-account regressions covered execution environment,
stdout/stderr exit semantics and descendant cleanup. Credentials stay outside
source/build/browser boundaries. The route is fixed to Servix development;
backend dependency releases, generic project onboarding, whole-product readiness,
Phase 4 exit and laptop-data import remain open. See
[the handoff](SERVIX_DASHBOARD_HANDOFF.md) and
[ADR 0039](adr/0039-server20-servix-git-dashboard.md) for complete evidence and limits.
## Server20 internal HTTP correction (2026-10-21)

The owner explicitly selected internal HTTP on an accessible port. Work is on
`feature/server20-internal-http`, based on `bc45307`, applying a bounded access
patch to the installed application with no database migrations/import. The
selected origin is `http://10.9.69.20`; other IIS site bindings are preserved.
Local CI passed 183 tests, build, coverage and audit. Actual packaged Windows
Node/disposable PG/Edge HTTP login, reload, CSRF and logout passed. Live activation
and visible external login-page acceptance passed: `http://10.9.69.20/`, UI 200,
health 200 / ok. Final manifest is
`d9cd4068832e8b5b5e4548a382f88b2cc1f812edad72473bee5696d794b5f4cf`.
Database connection/auth mode and sibling-site configuration remained unchanged;
temporary operator tasks were removed. Earlier operator failures and verified
recovery are documented. Live authenticated login remains untested. See
[the handoff](SERVER20_HTTP_HANDOFF.md) and [ADR 0038](adr/0038-server20-internal-http.md).
The larger unified-deployment update and laptop-data import remain pending in
their existing worktrees; Phase 4 exit remains open.

## Server 20 dependency prerequisite (publication candidate)

The dedicated `fix/server20-dependency-audit` branch starts from merged `main`
at `43eb9a0e29ec88882c9a1a922e03d7b8a28113fa`. It updates Fastify within major
5, Vitest/coverage within 4.1, and affected indirect dependencies within their
existing parent ranges. No runtime source, tests, permissions, or audit gates
were weakened or changed. The active roadmap remains Phase 4 exit.

Frozen installation and `pnpm run ci` passed locally: 178 unit/integration
tests, required coverage, formatting, lint, types, application build, and a
dependency audit reporting no known vulnerabilities. This is evidence for the
merged-baseline dependency branch only, not the other unmerged feature branches
or a live Production deployment. Publication, human merge, final release
integration, native server setup and live browser verification remain separate.
See [dependency task handoff](SERVER20_DEPENDENCY_HANDOFF.md).

On 2026-10-07 the owner authorized committing, pushing and creating a draft PR
for this dependency fix. Human merge and Production deployment remain separate
actions. The same reply selected the server20 IP-HTTPS/fresh-DB/new-admin hosting
profile; that rollout decision is separate from this dependency-only patch.

## Snapshot

| Item | Observed state |
| --- | --- |
| Production repository | `https://github.com/mishrarishav/FrevOS` |
| Detected default branch | `main` |
| Phase branch | `feature/github-repository-onboarding` |
| Base commit | `52ce49e` |
| Active phase | Phase 4 exit â€” Preview/UAT deployment and independent acceptance |
| Phase 3 merge | Core PR [#5](https://github.com/mishrarishav/FrevOS/pull/5) was human squash-merged as `13f3cd2`; its task branch was deleted |
| Phase 4A merge | Core PR [#7](https://github.com/mishrarishav/FrevOS/pull/7) was human squash-merged as `425c1f3`; its task branch was deleted |
| Phase 4B merge | Core PR [#8](https://github.com/mishrarishav/FrevOS/pull/8) was human squash-merged as `6bf5509`; its task branch was deleted |
| Phase 4C merge | Core PR [#9](https://github.com/mishrarishav/FrevOS/pull/9) was human squash-merged as `3973c59`; its task branch was deleted |
| Phase 4 UAT-package merge | Core PR [#10](https://github.com/mishrarishav/FrevOS/pull/10) was human squash-merged as `2b334bb` |
| Phase 4 local-preview merge | Core PR [#11](https://github.com/mishrarishav/FrevOS/pull/11) was human squash-merged as `9ded1f1` |
| Runtime capability | The authenticated Control Center, Fastify BFF, PostgreSQL forced RLS, protected workspace APIs, Preview routes, local table-backed credentials, and Windows/IIS UAT route are merged and live on the selected personal UAT target |
| Dependency manifests | pnpm workspace and committed lockfile on `main` |
| CI/CD | Live UAT and companion build fixes PR [#23](https://github.com/mishrarishav/FrevOS/pull/23) passed `validate` and was human squash-merged as `52ce49e`; Windows UAT deployment remains operator-executed |
| Windows UAT evidence | Source `228ebaa5073769a57769e0b0f650be88c49c4af3` is active at `https://tserver2.eeslindia.org/frevos/`; public health, application assets, local login, protected UI, PostgreSQL service, control-plane task, loopback health, and the TrackGRN sibling health probe passed. Initial activation required recorded manual ACL and database-creation interventions that this active hotfix addresses |
| TrackGRN pilot | The companion is installed on the laptop and its repository inspection, commit proposal, UI build, non-destructive API tests, and API publish path have passed. Generic GitHub account discovery and repository registration are active on a dedicated branch; newly connected repositories do not inherit TrackGRN execution authority |
| Independent QA harness | Merged through Acceptance PR [#1](https://github.com/mishrarishav/FrevOS-Acceptance/pull/1); exact-head and default-branch CI passed |
| Acceptance repository | Public `main` at completion-state squash commit `ffc85babed5f0e8deaf8af8d0194b9d3734d23be` |
| Acceptance merge governance | Active `Protect main` ruleset `20623785` enforces squash-only pull requests, conversation resolution, strict up-to-date `validate`, and deletion and force-push prevention |
| UI reference | Approved private repository ID `1329600731`, `mishrarishav/neural-command-lab`, commit `85f3ba2271ba381fc0520108365c5bb48fe386a7` |
| GitHub authentication | Verified for account `mishrarishav` during Phase 0A |
| Completed publications | Core PRs [#1](https://github.com/mishrarishav/FrevOS/pull/1), [#2](https://github.com/mishrarishav/FrevOS/pull/2), [#4](https://github.com/mishrarishav/FrevOS/pull/4), [#5](https://github.com/mishrarishav/FrevOS/pull/5), [#7](https://github.com/mishrarishav/FrevOS/pull/7), [#8](https://github.com/mishrarishav/FrevOS/pull/8), [#9](https://github.com/mishrarishav/FrevOS/pull/9), [#10](https://github.com/mishrarishav/FrevOS/pull/10), [#11](https://github.com/mishrarishav/FrevOS/pull/11), [#13](https://github.com/mishrarishav/FrevOS/pull/13), [#15](https://github.com/mishrarishav/FrevOS/pull/15), [#16](https://github.com/mishrarishav/FrevOS/pull/16), [#17](https://github.com/mishrarishav/FrevOS/pull/17), [#19](https://github.com/mishrarishav/FrevOS/pull/19), and Acceptance PRs [#1](https://github.com/mishrarishav/FrevOS-Acceptance/pull/1), [#3](https://github.com/mishrarishav/FrevOS-Acceptance/pull/3) squash-merged |
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

The TrackGRN pilot resolves only its fixed single-project UAT transport and
operation boundary. Generic GitHub App, model, worker, artifact, and Production
decisions below remain open.

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
