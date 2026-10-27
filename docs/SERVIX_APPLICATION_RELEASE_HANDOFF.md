# Complete application release follow-up

Date: 2026-10-27 IST. Status: **IN PROGRESS — native fixture environment defect
corrected and verified; configured rollout remains pending**.

Repository: `https://github.com/mishrarishav/FrevOS`.
Branch: `codex/servix-full-release`.
Base: `a51e97c20dc27ce047cb54ef54a4ef343a5a5b22`.
Configured DevSetu publication produced
`3b1b3096fe45d2dbc6e977862a54ecaf68a5fdf1`; its 32-file diff is 2,403 additions
and 72 removals, including the preceding deployment's two retained handoff
documents. No PR, merge or default-branch push. Later owner-clarification
documents are not part of that frozen publication.
Phase 4 exit remains open. See [ADR 0067](adr/0067-complete-application-release-promotion.md).

## Scope and implementation

- Reuse the configured laptop source publisher, server20 Git and compatibility
  builder, existing Development operator and independent platform updater.
- Build the frontend with same-origin API/portal routing. Its digest-bound
  descriptor excludes destination web.config, environments and persistent data.
  Build/destination/test recipes live in reviewed JSON configuration.
- Require configured backend regression/compiler and frontend unit tests before
  packaging. Their passing record is bound to the source commit and saved release.
  Verify installed and publicly served frontend files on Development. Only full,
  successful, tested Development manifests are offered for application promotion.
- Production prepares both immutable components from that saved release. A
  controller-backed successful receipt, old configuration/launcher/selection,
  same owner, unchanged environment, canonical Node and exact least-privilege
  boot-task identity are required for subsequent managed updates.
- Preserve prior task XML, backend selection, frontend preimages, all unknown
  files, environments, uploads, attachments, external blobs and IIS routing.
  Install assets before the frontend entry. Verify public artifact bytes before
  success. Failure restores the previous task/selection/frontend and checks its
  public entry/release; uncertainty remains recovery-required without replay.
- Show both component identities, historical backend-only outcomes, configured
  promotion links and exact source/target review. Full approval additionally
  records the owner's Development acceptance for this exact saved release.

The owner explicitly reserves dashboard, filter and resize manual testing for
themselves. Do not perform those UI actions or claim their functional acceptance.
Their Development browser login is available. The later clarification below
supersedes waiting for another same-source visual check. Continue deployment
health and artifact/preservation checks. A new exact artifact-bound Production
decision is still required;
the prior backend-only approval is consumed and is not reused.

## Observed validation so far

- Local `pnpm.cmd run ci`, with the canonical Windows PowerShell 5.1 module path:
  exit 0, 369 tests in that run. Control-plane coverage 95.25% statements,
  91.66% branches, 96.6% functions and 96.72% lines. UI API coverage 100%.
  Build passes; audit gate retains 5 low/6 moderate and no high/critical platform
  findings. The initial environment-path failure is retained in the private log;
  tests/assertions/gates were not weakened. Later changes receive focused
  validation and the actual frozen-source configured CI before activation.
- Final native/static-focused run: 8 tests pass. Real file preimages/public
  HTTP bytes are exercised with a simulated Task Scheduler/CIM boundary:
  adoption, managed updates, corrupt frontend recovery, registration interruption
  after effect and another update. No real fixture startup task was created.
- Actual Servix frontend unit tests: three suites, 11 tests pass. Backend
  register/filter/assignment, mail compaction and reply-trail scripts exit 0.
  The local checkout lacks the build compiler; its three tests pass in a separate
  temporary directory using the exact lock-pinned esbuild 0.28.2 from the official
  registry with integrity verification. Customer dependencies were not changed.
  Task-created cache files were moved into ignored task storage; customer Git
  status is clean.
- Actual compatibility packaging fixture and native parsing pass. Whole-workspace
  type checking passes. Public/Development business UI actions are not exercised.
- Final focused control-plane API tests: `pnpm.cmd --filter @frevos/control-plane
  exec vitest run test/artifact-promotions.test.ts test/servix-deployment.test.ts`,
  exit 0, two files / 16 tests pass. Final UI tests: `pnpm.cmd --filter
  @frevos/control-center exec vitest run test/deployment-settings.test.tsx
  test/promotion-api.test.ts`, exit 0, two files / five tests pass.
- `pnpm.cmd run validate:repo`, `pnpm.cmd run format:check`, `pnpm.cmd run lint`,
  native deployment script parsing and `git diff --check` pass. Existing lint
  warnings/information and line-ending notices remain. Private comparison finds
  neither owner-supplied secret value in any changed/new publication file.
  Customer `D:\servixDev` Git status remains clean at this boundary.
- Re-running `pnpm.cmd run ci` in the exact frozen source of the failed configured
  build, with canonical Windows PowerShell modules, exits 0: 88 contract, 93 UI
  and 191 control-plane tests (372 total), all coverage/build/audit gates pass.
  Control-plane branches are 91.69%; platform audit remains 5 low/6 moderate.
  A separate UI coverage run with the installed native Node/pnpm and native
  environment whitelist also exits 0 (93 tests, 100% scoped coverage). The first
  configured CI failure's precise cause was unresolved at that stage. The later
  diagnosis below reproduces and corrects the fixture defect. Retain both failed
  attempts and require a fresh successful configured attempt.

## Pending live evidence and limits

The actual DevSetu UI accepted pipeline `pr_8f4bf3c7708f8494f4290c1683c6faa0`.
Publication succeeded at the commit above; configured native build
`cj_4c8b2342071da6f5ac2940b5dd1bc78b` failed in CI (exit 1, not killed).
No destination activation occurred. Keep that failure evidence. Diagnose the
same isolated frozen source and obtain a passing configured build before any
new platform activation. Build/deploy Servix through the actual Development UI,
record both component/test/preservation receipts and same-source verification,
then prepare the fresh exact Production review/backup and scoped decision.

The UI-created retry `pr_272d49cc8f8666c222ef25fef2c60239`, source
`e2db864d77aeda6b934957f3a89349d079582dc6`, native build
`cj_016e5a6322f8a04721aad7c3ee4fdf1c`, also failed CI without activation.
Direct reproduction with the installed native Node/pnpm and credential-free
environment isolated a test-fixture defect: the new lifecycle fixture derived
its target computer from `COMPUTERNAME`, which the builder intentionally strips.
The target JSON therefore lacked `computer` and strict native verification
rejected it. The fixture now obtains the real local hostname from the OS and
supplies that same identity explicitly to its simulated Windows boundary.
The unchanged lifecycle test then passes with that restricted environment
(49.69 seconds, exit 0). Production identity checks, assertions, coverage gates
and independent acceptance tests are unchanged; the builder whitelist remains
restricted. No customer source or runtime recipe changed for this correction.

The corrected-source attempt `pr_501ce21992e7f1ea57424ba3cc4cae9a`, source
`9785dc8442a1db67e0540a7d6bdf32a8dce4ed68`, native build
`cj_4d9468e43b4a4e15e0ade06cd2e69b31`, stopped before activation on another
existing native integration test. Its retained Vitest result identifies only
`test/environment-seal.test.ts` as failed, at 5,026.84 ms: the default five-second
deadline is too short for its real PowerShell ACL/encrypted-save operations
under concurrent CI load. The one native test now has a bounded 30-second
allowance, and each ACL subprocess a 15-second deadline. All assertions, pure
test deadlines and coverage gates remain unchanged. The full UI coverage suite
then passes in the installed native Node/pnpm/restricted environment: 93 tests,
100% scoped coverage, exit 0. Independent acceptance tests are unchanged.

No new Production application mutation has occurred. Customer runtime/library
versions and accepted dependency findings remain unchanged. No database
migration/restore, permission expansion, reboot test, notice or GitHub merge is
claimed. This continues the explicit Windows compatibility path; other project
adapters/platforms are not granted live acceptance by these fixtures.

The automatic approval review rejected cleanup of the owned temporary compiler
test directory with the reason "blocked by policy". The temporary directory is
retained; this does not block release execution or affect the customer checkout.

## Owner clarification during rollout

The owner subsequently confirmed the changes already appear on Development and
asked to assess their appearance on Production after activation. Under
[ADR 0068](adr/0068-existing-development-source-acceptance.md), do not wait for a
duplicate visual check of the same customer source. Verify the exact existing
source and all new build/artifact/health/preservation gates, then prepare the
fresh exact Production decision. The owner's Production functional check is
still separate and must not be claimed by this implementation session.
