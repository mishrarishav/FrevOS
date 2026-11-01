# Paperclip team bridge implementation handoff

Status: PASS for the bounded local implementation and synthetic task bridge.
No Server20 integration activation or permanent service is claimed.

Repository: `mishrarishav/FrevOS`, verified provider ID `1329122983`.
Branch: `codex/paperclip-agent-bridge`.
Base: `738bd1831c020590ba763505a199381aff9dd126`.
Implementation commit: `26664d5d80817b1f4f1e4874883894275ab589c4`.
Owner-authorized task branch publication and draft
[PR 43](https://github.com/mishrarishav/FrevOS/pull/43) succeed. PR targets main;
its inherited comparison includes 235 files (+35,011/-577), distinct from the
bounded 20-file implementation delta below.
Predecessor PR 42 remains unmerged. Phase 4 remains open.

## Implemented behavior

Agents now supports explicit specialist/coordinator team requests, revision and
source-policy checks, model readiness, deterministic plan facts displayed
separately from model advice, persisted step history, bounded output/storage,
idempotent replay and interruption after restart. Raw IDs/revisions are inside
collapsed Technical details after the owner's UI feedback. Existing single
agent, model-secret, Discovery and notification workflows are reused.

The optional Paperclip adapter records parent/child issues and results through
its actual HTTP API. DevSetu runs the models and remains the policy authority.
Paperclip runners, hiring, schedules, shell/Git/deployment and notices are not
enabled. This is a task-record bridge with actual DevSetu team execution, not
Paperclip's native autonomous CEO/runner workflow or repaired OpenCode streaming.
See [operator/user instructions](PAPERCLIP_TEAM_BRIDGE.md) and
[ADR 0080](adr/0080-paperclip-read-only-team-bridge.md).

## Actual integration evidence

Official Paperclip source and the image's OCI revision both match
`3ee4c5b6138da82d0b1f51aa010540561bf43c22`. Linux AMD64 image:
`ghcr.io/paperclipai/paperclip@sha256:0caac831435542951398d095f86047874124c474053e5f06e205431bf3463308`.
The official image is an approximately 4.83 GB compressed download, including
unused runner tooling; this is not a minimal task-only production package.

The disposable instance uses UID 1000, one CPU, 768 MiB, 512 PIDs, dropped
capabilities, no-new-privileges and no host bind mounts, volumes or model keys.
Two startup attempts are retained in the private receipt: trusted mode refuses
non-loopback bind; read-only root refuses an embedded PostgreSQL compatibility
symlink. The working core stays on container loopback with a fixed contained
forwarder published only on host loopback. The initial internal network does
not publish a host port until a bridge endpoint is attached. These test-only
accommodations are not an authenticated private-service production enrollment.

A temporary board API credential is necessary: an arbitrary Bearer is rejected
with HTTP 401 even in local-trusted mode. Two disposable test credentials are
created only inside that fresh synthetic instance, kept in process memory,
then verified revoked. No existing user credential is replaced or broadened.

Observed end-to-end PASS: actual AgentWorkspace team runtime → actual protected
Qwen gateway → real Paperclip company/issues API. Parent plus specialist and
coordinator child issues all reach `done`. Identical request replay returns the
same task and makes no additional inference call. Three measured model calls
(one 16-token connection test plus two 64-token analyses) take 1,529 ms,
40,156 ms and 49,478 ms; total team time is 94,687 ms.

The accepted synthetic plan deterministically gives 30% completed, 100% planned
and behind-plan. Both model answers in Hindi correctly repeat 30% and being
behind, but omit requested planned completion/editor caveats. Thus transport,
task persistence and bounded execution PASS; full answer completeness/general
model intelligence are not established. The earlier 128-token attempt times
out after 60 seconds with no coordinator execution. It remains a failed attempt;
no gateway budget or safeguard is raised to conceal it. Usage/cost are unavailable.

Private evidence under `.local/` includes `paperclip-team-live-result.json`,
per-run `qualification.json`, failed pre-auth/timeout receipts, service scope,
cleanup receipts and the saved UI screenshot. Only synthetic plan data is used.
No customer repository files or real employee messages enter this qualification.
Three owned test containers and their internal network are removed after the
two credentials are verified revoked. The vendor image remains in Docker cache.

## Validation and deviations

- `pnpm run build:contracts`: observed exit 0.
- Control-plane and Control Center typechecks: observed exit 0.
- `vitest run test/agent-teams.test.ts test/paperclip-bridge.test.ts`: 13 pass,
  observed exit 0; the final full native CI also covers these cases.
- Real browser component fixture: coordinator selection, two specialists,
  Hindi question, explicit sharing, acceptance, polled completion, expandable
  steps and collapsed technical IDs verified. It is visibly labeled synthetic;
  it does not establish live authenticated Server20 UI acceptance.
- First `pnpm run ci`: fails an existing native encryption fixture because
  child PowerShell inherits an incompatible module path. Subsequent runs use
  existing `NativePlatform.buildEnvironment()`; no global OS setting is edited.
- The next CI fails that test's negative tamper assertion: replacing a random
  ciphertext byte with `00` can leave it unchanged. The fixture now XORs a bit,
  strengthening the same assertion. Both unchanged preservation/crypto cases
  pass on the real Windows connector in a targeted native run. Production
  encryption and external acceptance tests are not changed.
- Full backend coverage attempt: 287 pass, one existing Windows enrollment
  failure (scheduled task running, no observation within its original 35-second
  window). Fresh unchanged targeted fixture passes in 24,382 ms. Resource-heavy
  image extraction overlaps the earlier run; causation is not proved. No test,
  timeout or coverage threshold is weakened.
- The first final-CI start fails repository validation on the then-missing
  handoff link before tests. This document resolves the link. A fresh complete
  frozen-source run subsequently passes all 95 files / 487 tests (94 contracts,
  105 UI, 288 backend), original thresholds, build and dependency audit,
  observed exit 0. Exact launcher: `node .local/Run-PaperclipBridgeReviewedCi.cjs`,
  which invokes the package-manager `run ci` with the existing native environment.
  Backend statements/branches/functions/lines: 95.16/91.59/96.78/96.90%.
  Configured frontend API/experience/routing coverage remains 100%. The audit
  reports 5 low and 8 moderate advisories, no high/critical. The vendor image
  is integrity-pinned, not covered by the project's dependency audit. Vite's
  existing large-chunk warning remains; no warning threshold is changed.
- Exact approved model-credential scan: 506 repository text files, zero matches,
  observed exit 0. This is a bounded exact-key check, not a general security scan.
- Runtime/validation inputs are fingerprinted independently of documentation:
  408 files, SHA256
  `2f10352588b1805c38143bd9895ec045ad16dd6849f107b762ac5729ab51fd54`.

## Changed files and review

<!-- changed-files:start -->
- `apps/control-center/src/AgentTeamsPanel.tsx`
- `apps/control-center/src/AgentsPage.tsx`
- `apps/control-center/src/api.ts`
- `apps/control-center/test/agents-api.test.ts`
- `apps/control-center/test/environment-seal.test.ts`
- `apps/control-plane/src/agent-workspace.ts`
- `apps/control-plane/src/config.ts`
- `apps/control-plane/src/main.ts`
- `apps/control-plane/src/paperclip-bridge.ts`
- `apps/control-plane/src/server.ts`
- `apps/control-plane/test/accounts.integration.test.ts`
- `apps/control-plane/test/agent-teams.test.ts`
- `apps/control-plane/test/paperclip-bridge.test.ts`
- `docs/CURRENT_STATE.md`
- `docs/PAPERCLIP_TEAM_BRIDGE.md`
- `docs/PAPERCLIP_TEAM_BRIDGE_HANDOFF.md`
- `docs/adr/0080-paperclip-read-only-team-bridge.md`
- `docs/adr/README.md`
- `packages/contracts/src/agent-teams.ts`
- `packages/contracts/src/index.ts`

Diff stat: 20 files changed, 1852 insertions, 3 deletions. New
untracked files are counted as complete additions; the Git index is untouched.
<!-- changed-files:end -->

The complete tracked diff and every new source/test/document are reviewed.
The reviewed patch is staged, index reverse-verified, committed and pushed
after the owner's explicit approval. No PR merge, Server20 runtime configuration,
data migration or Production activation occurs during that publication.

## Immediate release follow-up

The owner subsequently requests Server20 deployment now (not Server25 or a
future scheduled run). [ADR 0081](adr/0081-server20-team-bridge-release.md)
records that new scope. Preflight finds two new modules absent from the sealed
copy lists: paperclip-bridge and agent-teams. The follow-up adds their compiled
artifacts and all three new source inputs to provenance. Existing dependency
closure checks must verify the produced package. Enrolled builder sidecars are
refreshed only through the preserving, idle-checked updater. Fresh release CI,
artifact integrity and exact activation approval are pending. The earlier
487-test result applies to the implementation before this packaging follow-up;
no activation or live private Paperclip enrollment is inferred from it.

## Preservation and next boundary

Existing pairing, model secrets, environment, applications, databases, uploads,
attachments and the previously reviewed release artifact are not edited. Four
owned local preview containers are temporarily stopped with their original
identities/mounts recorded; restoration succeeds with all four identities and
mounts preserved. All four subsequently report healthy.

Next bounded release requires a concrete review of this change, predecessor
dependency handling, a supported private Paperclip service and a dedicated
company-scoped service identity/opaque secret reference. Permanent service
credentials/access, publication and Production activation are separate scoped
approvals under AGENTS.md. No old build or activation approval is reused. This
handoff does not declare full roadmap phases or autonomous employee decisions
ready. Real private-service enrollment, multi-user Paperclip RBAC and the
permanent service's operating-system/network/backup configuration still need
qualification. A synthetic board key with access to a fresh disposable instance
is not proof of a least-privilege live service identity.
