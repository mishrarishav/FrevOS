# Complete application release follow-up

Date: 2026-10-27 IST. Status: **IN PROGRESS — implementation validated locally;
live platform/Development rollout and owner acceptance remain pending**.

Repository: `https://github.com/mishrarishav/FrevOS`.
Branch: `codex/servix-full-release`.
Base: `a51e97c20dc27ce047cb54ef54a4ef343a5a5b22`.
No resulting publication commit or PR yet. The preceding deployment's two
uncommitted handoff documents are retained. No merge or default-branch push.
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
Their Development browser login is available. Continue deployment health and
artifact/preservation checks, then request their acceptance before new Production
activation. A new exact artifact-bound Production decision is still required;
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

## Pending live evidence and limits

Publish/activate DevSetu through its actual UI and record the source commit,
configured CI result, package and independent Apply receipt. Build/deploy Servix
through the actual Development UI, record both component/test/preservation
receipts, and let the owner perform functional acceptance. Only then prepare
the fresh exact Production review/backup and obtain its scoped decision.

No new Production application mutation has occurred. Customer runtime/library
versions and accepted dependency findings remain unchanged. No database
migration/restore, permission expansion, reboot test, notice or GitHub merge is
claimed. This continues the explicit Windows compatibility path; other project
adapters/platforms are not granted live acceptance by these fixtures.
