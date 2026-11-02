# Server20 read-only team release review

Status: **BLOCKED on exact-artifact human activation approval**. Preparation,
full native CI, artifact review, protected snapshot and native Plan are PASS.
No new Production Apply, migration or post-activation acceptance is claimed.
Phase 4 remains open.

Repository: mishrarishav/FrevOS, provider ID 1329122983.
Branch: codex/paperclip-agent-bridge.
Bounded base: 738bd1831c020590ba763505a199381aff9dd126.
Frozen release source: db64e3e3d887c892b8c49e2d2d94eb28c68095ad.
Source tree: 56340e13eefe07778b880f60a9588fa74d97e70b.
[Draft PR 43](https://github.com/mishrarishav/FrevOS/pull/43) inherits unmerged
PR 42; no agent merge or default-branch push occurs.

## Exact artifact and destination

| Evidence | Value |
| --- | --- |
| Workspace / profile | ws_server20 / devsetu-platform |
| Destination | DCAPP7 / 10.9.69.20 / E:\FrevOS |
| Manifest SHA256 | a28b9f4a56911f4d90ebc842e7a8b80315b8b3349a75e1e43438429fb43ae19f |
| Archive SHA256 | 9a7470ecae5cdc5c9016b51187f68c7964eece7381b0f9d917eb7d13c85a3439 |
| Archive size / package files | 131,953,805 bytes / 4,044 |
| Source inventory | 240 frozen committed inputs |
| Build correlation | cj_8b6ced773f11b6765e4c085164dadfe9 |
| Activation candidate | 6aecefbe5e2b42a4aba43a6a83b34273 |
| Expected previous manifest | b0c300090e9423d4583dd5a386460b2bf5f1b9136bc6c8dd650331a7a3e5d24d |

The existing independent DevSetu-PlatformUpdater is running as SYSTEM with its
expected action and worker digest verified. Activation must use the owner’s
authenticated DevSetu maintenance flow after fresh scoped approval. Expect a
brief DevSetu application restart. The saved previous release supports the
existing code-recovery mechanism; this is not a database rollback.

## Observed validation

- Enrolled native builder's exact-source `pnpm run ci`: exit 0, 95 files /
  489 tests (94 contracts, 105 UI, 290 backend), original coverage/build/audit
  gates. Backend statements/branches/functions/lines:
  95.21/91.61/97.03/96.94%. Audit: 5 low / 8 moderate, no high/critical.
- [GitHub CI 41360983325](https://github.com/mishrarishav/FrevOS/actions/runs/41360983325):
  PASS for the frozen source; its Windows-only skips are separate from the
  complete native result above.
- Existing Server20 SDK job ab_af701e458900f78383afee346e8ed474 signs the exact
  source. APK SHA256:
  5c8a1632d4f4e2ffd64e7a7d30fc7988e4774708bbe8cd620481979c8c32cdf8.
  Retained certificate:
  0d3a704822eacaef060a4560c2f800479179eed96dfbf9e94993dcf2b75cec92.
- `node .local/Review-PaperclipArtifact.cjs`: exit 0. All package files,
  240 source inputs, both ZIP copies, runtime module closure, packaged team /
  provider-budget contracts and Android compatibility verify. Exact approved
  provider-key scan: 2,651 package text files, zero matches; not a general
  secret/security audit.
- `node .local/Snapshot-PaperclipProtection.cjs`: exit 0. Fourteen selected
  settings/pairing files are read once and verified against those exact bytes.
  Eight pairing identities/credentials and five stable settings match the
  baseline. This is a selected-file snapshot, not a database backup.
- Fixed `Run-Operation.ps1 -Action Plan`: exit 0, exact manifest/candidate,
  configurationChanged=false, databaseWritten=false, temporaryTaskRemoved=true.
- Fixed read-only `Inspect-PaperclipUpdater.ps1`: exit 0; expected system
  identity, action and worker integrity; serverChanged=false.
- Completed temporary preparation task is removed after exact identity/hash
  checks. Four owned local preview containers are restored healthy, with their
  identities/mounts and volumes preserved.

## Protection, failures and limits

Protect config, postgres-data, state, servix, git, backups, maintenance and
operator. Existing environments, pairings, application data, uploads,
attachments, database and signing identity are not reconfigured. Direct byte
comparison of live model-secret storage is denied by Windows ACL; no ACL is
broadened and no secret exported. The authenticated pre-update UI shows three
agents and one stored Owner Qwen connection, revision 1, last test timeout.
Post-activation model readiness remains to be checked with a synthetic prompt.

Earlier failed packaging and full native runs remain recorded in
[the implementation handoff](PAPERCLIP_TEAM_BRIDGE_HANDOFF.md) and ADRs
[0082](adr/0082-team-release-delta-policy.md) /
[0083](adr/0083-native-provider-budgets-and-pairing-fixture.md).
No failed gate is waived. The Windows native profile explicitly chooses a
60-second API budget; the existing connection default remains 15 and the
180-second native test and security/recovery assertions remain. The earlier
generic native Git failure's exact cause is not proved. Staging's inherited
owner-copy error is resolved using only the verified private DACL on new
directories. A live lastSeenAt change explains the initial snapshot comparison
failure; the corrected snapshot verifies each captured buffer instead of
requiring the live heartbeat record to stop changing.

The deployed API lacks build-only. Preparation uses the existing enrolled
native operator boundary; there is no fabricated control-plane pipeline run.
The optional passive Paperclip backend remains unenrolled. Permanent hosting,
company/service credentials, multi-user backend qualification, native
CEO/OpenCode execution and autonomous employee decisions are outside this
activation. Qwen usage/cost and general answer completeness are not certified.

## Changed files and next boundary

The frozen source changes 33 files, +2,201/-20, from the bounded base.
Documentation-only delivery evidence after that source does not change the
reviewed immutable package. Complete frozen-source file list follows.

<!-- release-files:start -->
- `apps/control-center/src/AgentTeamsPanel.tsx`
- `apps/control-center/src/AgentsPage.tsx`
- `apps/control-center/src/api.ts`
- `apps/control-center/test/agents-api.test.ts`
- `apps/control-center/test/environment-seal.test.ts`
- `apps/control-plane/src/agent-workspace.ts`
- `apps/control-plane/src/config.ts`
- `apps/control-plane/src/main.ts`
- `apps/control-plane/src/paperclip-bridge.ts`
- `apps/control-plane/src/repository-center.ts`
- `apps/control-plane/src/server.ts`
- `apps/control-plane/test/accounts.integration.test.ts`
- `apps/control-plane/test/agent-teams.test.ts`
- `apps/control-plane/test/device-enrollment.test.ts`
- `apps/control-plane/test/paperclip-bridge.test.ts`
- `apps/control-plane/test/repository-center.test.ts`
- `deployment/server20/HttpCommon.ps1`
- `deployment/server20/New-ServixDashboardRelease.ps1`
- `docs/CENTRAL_GIT_COLLABORATION_HANDOFF.md`
- `docs/CURRENT_STATE.md`
- `docs/PAPERCLIP_TEAM_BRIDGE.md`
- `docs/PAPERCLIP_TEAM_BRIDGE_HANDOFF.md`
- `docs/adr/0080-paperclip-read-only-team-bridge.md`
- `docs/adr/0081-server20-team-bridge-release.md`
- `docs/adr/0082-team-release-delta-policy.md`
- `docs/adr/0083-native-provider-budgets-and-pairing-fixture.md`
- `docs/adr/README.md`
- `packages/contracts/src/agent-teams.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/repository-center.ts`
- `packages/contracts/test/repository-center.test.ts`
- `scripts/prepare-private-git-test.mjs`
- `scripts/test-private-git.cjs`
<!-- release-files:end -->

The subsequent documentation-only delivery changes these three files:

- `docs/CURRENT_STATE.md`
- `docs/PAPERCLIP_TEAM_BRIDGE_HANDOFF.md`
- `docs/PAPERCLIP_SERVER20_RELEASE_HANDOFF.md` (new)

These files are outside the frozen runtime source inventory; no runtime,
artifact, credential or configuration change is included in that delivery.
`pnpm run validate:repo` and `git diff --check` pass (exit 0).

Next: fresh single-use human approval bound to the exact workspace, actor,
target, candidate and both digests, followed by authenticated DevSetu Apply,
health/UI/model checks and protection comparison. Existing broad intent is not
reused as approval for an artifact that was unknown when it was given.
