# Complete application release follow-up

Date: 2026-10-28 IST. Status: **IN PROGRESS — platform activation passes;
the customer source step exposed a Git launcher issue, now corrected in configuration**.

## Verified platform and customer source follow-up

The sixth configured pipeline `pr_569e11398745b52b96aa39217ad8e92d` succeeded.
Its source is `53ea0214f4fb1e4e13369256d471122a94a0ad3d`, reference digest
`e164f15aa2b693995c364300f5888e2b6678b6f20cce2939523ab1f3903c4e3e`, archive
SHA `d1ad6d15ed714788de44f99239dc5c1fb72c3c5d852ef5ba8a17e137c14ee4ab`
(131,636,730 bytes, 3,970 packaged files), manifest
`accdf66214a481a477334f6c33fc254f8813002c8d4f5ecaeeb884a57337d50f`.
Independent Apply job `cj_ade3a227131e7859e2b5e527fef47967` reports PASS,
HTTP/UI 200, siblings preserved and databaseWritten false. Server20 active.json
matches. This is actual source publication, full CI, packaging and activation.

The subsequent UI-created Development request
`sd_f27841bcf5ca00cd6e608dbdf6ab9e18` failed before source publication with the
generic build-or-authorization error; no build scratch or target activation was
created. Read-only SYSTEM diagnostics verify the source repository still contains
`e04137b4a862e8760a59b95da7e0de9a32bc6d38`. Its fixed Git cmd launcher times out
on identity/head (20 seconds each) and version (7 seconds). The installed
`ucrt64/bin/git.exe` reads version in 82 ms, repository identity in 66 ms and head
in 75 ms. It is the same installed Git 2.56.0.windows.2; no version upgrade or
binary replacement is involved. Temporary diagnostic tasks were removed.

The bounded correction moves the compatibility Git executable, repository and
verified provider identity into ReleaseBuildProfile.json. Controller startup
validates the versioned profile and supplies it to the existing Git executor;
the builder consumes the same data and verifies repository identity before export.
Absolute executable/repository paths are required, ambient service secrets remain
excluded and the exact source/target protections are unchanged. Focused tests
cover configured execution, mismatched identity and rejection of a relative tool
path. A fresh actual configured CI/package/activation is still required for this
correction before retrying Servix Development. No new Production application
deployment or approval is claimed.

Browser screenshot/mouse dispatch timed out after activation. The actual visible
DevSetu dialog remained operable through its normal keyboard controls; no direct
deployment API mutation or automatic retry was used.

## 2026-10-28 resume

The owner confirmed desktop unlock and VPN reconnect. Bounded probes to server20
HTTP/SMB and server21 API pass. Request `pr_cb04963e4944410690fbbccb6234531c`
and native build `cj_cb5fd978d75ed933cc34baae585f163b` both reconcile as failed;
no activation was left pending. Active platform manifest is still
`a4c5e8ab2a0f7c97f1762455e5e6c67c68d21ac652754e19300d3d5ef48bd461`.

The installed native Node/pnpm, with the existing restricted environment, runs
the six failing files together: `vitest run test/local-development-runtime.test.ts
test/connector-local-git.test.ts test/system-discovery-runtime.test.ts
test/promotion-lifecycle.test.ts test/system-enrollment-windows.test.ts
test/promotion-environment.test.ts --reporter=verbose`, exit 0, six files /
15 tests pass in 224.95 seconds. This is not a full configured CI pass.

The host still has only 464 MB free physical RAM of 16,025 MB (CPU 64% observed).
To bound peak CI contention, root coverage runs workspace projects sequentially
and the Windows UI/contracts runners use one worker, as the control-plane runner
already does. All test cases, real native boundaries, assertions and coverage
thresholds remain enabled. No customer runtime or library changes are involved.
Direct validation of the bounded runners passes: Windows UI 93 tests with 100%
scoped coverage (18.58 seconds), and contracts 88 tests with existing coverage
gates unchanged; both exit 0. Repository validation, formatting, lint and private
changed-file secret comparison also pass before configured publication.
The fifth actual DevSetu request `pr_b63ae3d73f826b5f5d3b07920799e684`, source
`1a7a31ff958941143e3df7797d67f21788b97222`, native build
`cj_59fdf51e6c7e451c33bb37914f7389bf`, failed CI before activation. Contracts and
UI coverage passed; 46 of 48 native files passed, with only the two database
integration files failing. Exact restricted-environment reproduction failed before
PostgreSQL startup with Docker OCI `fork/exec /usr/bin/runc: resource temporarily
unavailable`. The repository's local Caddy preview container had 16,068 processes,
verified by Docker stats and Compose ownership labels for `D:\FREVOS`.

At 01:44 IST the scoped `docker restart --time 10 9b5d079c3875` exited 0. This
restarted only that local proxy, retaining its configuration/volumes; no Docker
daemon restart, unrelated application stop or remote mutation occurred. Its
process count reduced to 18. The same installed restricted Node/pnpm then ran
`vitest run test/accounts.integration.test.ts test/postgres-service.integration.test.ts
--reporter=json`: exit 0, 22/22 tests pass. The isolated synthetic databases were
removed by their normal test lifecycle. This focused pass does not qualify a
failed configured request for activation.

The sixth request was submitted through the actual DevSetu dialog:
`pr_569e11398745b52b96aa39217ad8e92d`, native build
`cj_21edd083f3bb17b5d57411eb6b508c37`, source
`53ea0214f4fb1e4e13369256d471122a94a0ad3d`. Git tree comparison with `1a7a31ff...`
is empty; the publisher records another approved change-message commit. Browser
submission initially reported uncertain confirmation, but the controller's scoped
request file proves acceptance; no Retry was submitted. Follow this same request
to terminal full CI/package/independent activation evidence. Only then may the
customer Development release and fresh full-application Production review proceed.

At 02:07:29 IST the sixth native builder reached the enrolled release packager,
which is invoked only after successful `pnpm run ci`. Its frozen-source retained
Vitest results contain 13 contracts, 16 UI and 48 control-plane files, none marked
failed. Coverage gates pass: contracts 98.28% statements / 92.77% branches, UI
100%, control-plane 95.25% statements / 91.69% branches / 96.6% functions /
96.72% lines. Compilation and the configured high-severity dependency audit gate
completed before packaging. No final package/activation result is claimed by
this intermediate observation.

Repository: `https://github.com/mishrarishav/FrevOS`.
Branch: `codex/servix-full-release`.
Base: `a51e97c20dc27ce047cb54ef54a4ef343a5a5b22`.
Latest configured DevSetu publication produced
`53ea0214f4fb1e4e13369256d471122a94a0ad3d`; its cumulative diff from the base
is 37 files, 2,662 additions and 76 removals. This includes the preceding
deployment's retained handoff documents, owner clarification and bounded CI
worker configuration. Later evidence additions to this document and
CURRENT_STATE.md remain uncommitted. No PR, merge, default-branch push or new
live activation is claimed.
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

The fourth UI request `pr_cb04963e4944410690fbbccb6234531c`, source
`b91f8423771a3f546445faa1b2c7b631270deaf9`, native build
`cj_cb5fd978d75ed933cc34baae585f163b`, failed local CI (exit 1, not killed,
AssertionError classification). Contracts coverage is 98.28% statements /
92.77% branches; UI coverage is 100%. Control-plane CI has not passed. Retained
Vitest metadata identifies six failing files: local-development-runtime,
connector-local-git, system-discovery-runtime, promotion-lifecycle,
system-enrollment-windows and promotion-environment. Several durations approach
native test deadlines; exact assertions must be reproduced before declaring a
fix. A separate restricted-environment recheck of promotion-environment exits 0
in 8.72 seconds. Do not weaken assertions or claim the six failures fixed.

At 23:26 IST, bounded probes to server20 HTTP/SMB and server21 API all timed out.
FortiClient was present but desktop interaction returned GetCursorPos access
denied, consistent with a locked desktop. The owner has a pending unlock/VPN
request. Local observation at 23:33 reports only 335 MB free physical memory
of 16,025 MB and CPU 81%; this can affect timing, but is not proof of the cause
of every assertion. No running Node process in these four failed frozen build
source folders was found. No unrelated application was stopped.

The first API observer could not establish its read-only session on the fourth
attempt; the accepted request/source were independently verified from the
controller's scoped component job files. The file observer's 30-minute deadline
expired and was resumed against the SAME request, without a new deployment.
While disconnected, the server's last recorded request may still say building;
reconcile the local failed receipt with that same request after reconnecting
before submitting another attempt. Do not replay a claimed activation.

Customer source remains clean at
`e04137b4a862e8760a59b95da7e0de9a32bc6d38` (23:34 observation). No new Servix
Development deployment, full-release manifest, fresh full-application Production
review/backup or Production activation exists for this follow-up. The preceding
backend-only Production success remains valid historical evidence. The latest
verified active platform is still the prior `a51e97c...` release; new source
publication alone is not activation.

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

## Complete publication file inventory

At `53ea0214f4fb1e4e13369256d471122a94a0ad3d`: 37 files changed,
2,662 insertions(+), 76 deletions(-), relative to the documented base.

- apps/control-center/src/ArtifactPromotionsPage.tsx
- apps/control-center/src/DeploymentSettingsPage.tsx
- apps/control-center/test/deployment-settings.test.tsx
- apps/control-center/test/environment-seal.test.ts
- apps/control-center/vite.config.ts
- apps/control-plane/src/artifact-promotions.ts
- apps/control-plane/src/servix-deployment.ts
- apps/control-plane/test/artifact-promotions.test.ts
- apps/control-plane/test/fixtures/PromotionLifecycle.ps1
- apps/control-plane/test/frontend-artifact.test.ts
- apps/control-plane/test/managed-runtime.test.ts
- apps/control-plane/test/promotion-lifecycle.test.ts
- apps/control-plane/test/servix-deployment.test.ts
- deployment/servix/Build-DevRelease.cjs
- deployment/servix/Build-Servix.ps1
- deployment/servix/FrontendArtifact.cjs
- deployment/servix/Invoke-DevRelease.ps1
- deployment/servix/Invoke-PromotionTarget.ps1
- deployment/servix/ManagedRuntime.cjs
- deployment/servix/PromotionFiles.cjs
- deployment/servix/PromotionProtocol.mjs
- deployment/servix/PromotionRegistry.json
- deployment/servix/PromotionWorker.psm1
- deployment/servix/PublishedRelease.cjs
- deployment/servix/ReleaseBuildProfile.json
- deployment/servix/Run-Activation.ps1
- deployment/servix/Test-BundledRelease.cjs
- docs/CURRENT_STATE.md
- docs/SERVIX_APPLICATION_RELEASE_HANDOFF.md
- docs/SERVIX_PRODUCTION_PROMOTION_HANDOFF.md
- docs/adr/0067-complete-application-release-promotion.md
- docs/adr/0068-existing-development-source-acceptance.md
- docs/adr/README.md
- package.json
- packages/contracts/src/artifact-promotions.ts
- packages/contracts/src/servix-deployment.ts
- packages/contracts/vitest.config.ts

## Resume boundary

Restore VPN/desktop access and usable build capacity; reconcile the same request,
reproduce the six native failures, and obtain a passing configured source build.
Then activate the platform, build/deploy the complete Servix Development release,
verify source, component hashes, health and protected files, and prepare the
fresh exact Production decision. The owner performs the business UI check after
Production; do not ask for a duplicate same-source Development visual check.
Phase 4 exit remains open; this is not readiness for a later roadmap phase.

Final uncommitted evidence diff from b91f842: 2 documentation files, 107 additions and 9 removals (CURRENT_STATE.md and this handoff).
