# Simple join Server20 release handoff

Status: PASS — frozen-source preparation, independent review, human-approved DevSetu activation and post-deployment verification are complete on Server20. Phase 4 remains open; real Android phone and Linux desktop acceptance are separate pending checks.

Repository: mishrarishav/FrevOS (GitHub provider ID 1329122983). Source branch: codex/simple-join-approvals. The registered source worktree is clean on codex/server20-simple-join-release at the same frozen source.

Base: 758d44497d55142d07bc9d6ecc23d668350f3168. Frozen source: 27f85a79059b61717c2d72fcba7eb45fb0f85256. Tree: 07c03f580fb1a78996c80280cc7b2fc0281dfb17. PR: none for this release; no GitHub push or central source publication is claimed. Existing PR 43 is an older Paperclip change, not this release.

## Prepared artifact

- Target: DCAPP7 / 10.9.69.20, E:\FrevOS. Workspace ws_server20, profile devsetu-platform, registered repository gitrepo_403e3e5a3cdd9ef309eec087f8369c91.
- Manifest SHA-256: 325bfd6025203c4df7b479a0429a4827283f366eccd9ed49b9645d54e29fee12.
- Archive SHA-256: 36520f29c2aa02cce8d3f44294b69e8c28dd4fd4d1838bf0d2ff530bf527fff8. Size: 131985941 bytes; 4044 manifested files and 240 committed source inputs.
- Build correlation: cj_9b226a9a4803ecbcc0674b3f682e2103. Activation correlation: 99a2bebd986245f68452ccac5b7b4d51.
- Previous active manifest: b0c300090e9423d4583dd5a386460b2bf5f1b9136bc6c8dd650331a7a3e5d24d. Live activation succeeded through authenticated DevSetu maintenance on 2026-11-03, with post-verification completed at 02:30 IST.
- Signed Android APK SHA-256: cb1ffa355596b249f9b9b6dde84fba3db1e9f1f6df98b7879a4308ec58afdb9d; retained certificate SHA-256: 0d3a704822eacaef060a4560c2f800479179eed96dfbf9e94993dcf2b75cec92.

## Scope and preservation

The release includes one admin approval for connector-bound new/existing account joins, automatic redemption without manually copying pairing codes, admin bell/dashboard pending requests, correct login challenge state, fresh Connected/Offline status and Windows/Linux status launchers with the Android version 1.1.0 / code 2 update. Prior qualified Paperclip/team and provider-budget changes are inherited; a permanent Paperclip service is not enrolled.

Protected paths: config, postgres-data, state, servix, git, backups, maintenance, operator. The current baseline has eight stable pairing identities/credentials and five stable configuration files. No owner transfer, credential rotation, environment rewrite, schema migration or customer-app deployment is included. Snapshot coverage is selected settings/pairings, not a database backup. Existing devices are not silently upgraded: published installers must be used on the remote device for new connector behavior. Genuine Android phone and Linux desktop acceptance remain open.

## Observed validation

- Enrolled native build of frozen source, correlation cj_9b226a9a4803ecbcc0674b3f682e2103: exit 0, 96 test files / 494 tests (94 contracts, 106 UI, 294 backend); unchanged coverage/typecheck/build/audit gates. Backend coverage 95.17% statements, 91.59% branches, 97.12% functions, 96.9% lines. Native Git passes within its unchanged 180-second test.
- node .local/Review-SimpleJoinArtifact.cjs: exit 0, all package files, local/stored archive hashes, committed source inventory, module/contract closure and Android data/signing compatibility PASS.
- node .local/Review-SimpleJoinInstallers.cjs: exit 0 after correcting the operator checker to read the actual source inventory state (APK metadata has no sourceState field). Windows ZIP 1,987 entries / 14 runtime entries; Linux TAR 2,473 entries / 8 runtime entries; both archive/source integrity PASS without extracting or running them. Packaged native join contract/backend PASS. Android exact committed source and retained signing identity PASS.
- Dependency audit: existing 5 low / 8 moderate findings, no high/critical; existing frontend chunk-size warning.
- Credential evidence: freeze-time exact approved-key check PASS. The former session reference became unavailable afterward; final review uses byte-identical previously scanned files plus qualified frozen-source delta proof: 2,651 previous text files reverified, 2,630 unchanged, 21 changed, 246 introduced hex tokens checked, zero unexplained tokens. This is not a repeated direct current-key scan or an exhaustive secret audit.
- Local preview restoration wrapper reported exit 1; it is retained as a failure. Independent read-only verification proves all four original preview containers healthy with exact identities/images/mounts. No volumes or VM disks were deleted.
- Earlier interrupted/preflight/Docker-off attempts remain in private operator evidence. Docker was normally started; no factory reset or permissions expansion occurred.

## Server20 Plan and cleanup

Windows PowerShell -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File .local/Stage-SimpleJoinPlan.ps1: exit 0. Fixed authenticated native Plan verifies exact manifest, no configuration/database write and removal of its temporary task. The 14-file fresh byte-exact snapshot verifies eight pairings and five stable settings. Existing DevSetu-PlatformUpdater is running as SYSTEM with verified worker integrity; inspection exit 0 and serverChanged false. The completed Limited build-only task was identity/hash/actor/exit-0 verified, exported and removed; permanent executors remain unchanged.

## Publication and activation boundary

Preparation uses the already enrolled native DevSetu adapter and Server20 SDK as approved in ADR 0086. The deployed API lacks build-only: this is not a control-plane build-only run and no unreviewed Deploy All was submitted. Authenticated DevSetu maintenance must activate this same digest after read-only Plan and fresh single-use actor/workspace/target/correlation/artifact approval. No own-PR merge or default-branch push.

## Changed source files

Diff stat: 35 files changed, 2113 insertions(+), 176 deletions(-).

- apps/android-connector/AndroidManifest.xml
- apps/android-connector/src/org/devsetu/connector/ConnectorApi.java
- apps/android-connector/src/org/devsetu/connector/MainActivity.java
- apps/android-connector/src/org/devsetu/connector/MonitorService.java
- apps/control-center/src/App.tsx
- apps/control-center/src/DiscoveryPage.tsx
- apps/control-center/src/JoinRequestForm.tsx
- apps/control-center/src/JoinRequestsInbox.tsx
- apps/control-center/src/styles.css
- apps/control-center/test/app.test.tsx
- apps/control-plane/src/join-requests.ts
- apps/control-plane/src/server.ts
- apps/control-plane/test/connection-shortcut.fixture.ps1
- apps/control-plane/test/device-enrollment.test.ts
- apps/control-plane/test/device-logins.test.ts
- apps/control-plane/test/fixtures/system-enrollment-task.ps1
- apps/control-plane/test/join-login.integration.test.ts
- apps/control-plane/test/linux-connection-status.fixture.cjs
- apps/control-plane/test/simple-join-status.test.ts
- deployment/servix/Connector.cjs
- deployment/servix/DeviceEnrollment.cjs
- deployment/servix/DeviceEnrollmentClient.js
- deployment/servix/Install-SystemConnector.ps1
- deployment/servix/Resume-SystemConnector.ps1
- deployment/servix/Run-Connector.ps1
- deployment/servix/START-HERE.txt
- deployment/servix/SystemLinuxInstaller.cjs
- docs/CURRENT_STATE.md
- docs/ONBOARDING_OBSERVATIONS_2026_11_02.md
- docs/SIMPLE_JOIN_IMPLEMENTATION_HANDOFF.md
- docs/adr/0084-code-free-desktop-join-and-admin-inbox.md
- docs/adr/0085-android-and-linux-simple-connection-status.md
- docs/adr/0086-simple-join-server20-release.md
- docs/adr/README.md
- packages/contracts/src/join-requests.ts

Delivery documentation may be committed separately after the artifact source; that documentation commit does not change the built source identity. The live evidence and final commands below complete this release.

## Human approval, activation and live verification

The owner explicitly approves these exact digests in request_user_input_async call_7d61551ac1074e16a1b1e831f91763a3, item 0: “हाँ, इसी exact release को DevSetu से deploy करो”. The private single-use approval binds usr_windows_admin, the current operator SID, workspace mishrarishav/FrevOS/server20, action devsetu.platform.components.v1, target DCAPP7/10.9.69.20 and correlation 99a2bebd986245f68452ccac5b7b4d51. It is issued at 20:51:05 UTC and expires at 21:06:05 UTC on 2026-11-02 (02:21–02:36 IST on November 3). The actual DevSetu UI submits at 02:26 IST; the native operator consumes the approval at 02:27 IST, within its scope and lifetime.

- Windows PowerShell -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File .local/Seal-SimpleJoinApprovedCandidate.ps1: exit 0, exact staged archive rehashed, candidate SEALED, activationSubmitted false.
- Authenticated http://10.9.69.20/maintenance: Deploy DevSetu → entered exact change message and owner approval reference → Confirm deploy. UI reports “Update succeeded. DevSetu is healthy.” for manifest 325bfd602520 and source 27f85a7; requested actor usr_windows_admin.
- Native Apply receipt: PASS, matching current/previous manifest and correlation, httpHealth 200, uiStatus 200, siblingsPreserved true, databaseWritten false. configurationChanged true records the intended activation state/task rewiring; stable runtime/environment and project configuration bytes independently remain unchanged. No schema migration is performed.
- node .local/Verify-SimpleJoinLive.cjs: exit 0 at 2026-11-02T21:00:01.882Z. Active manifest and source match the approved artifact; eight stable pairing identities/credentials and all five baseline settings verify unchanged.
- All three live HTTP downloads return 200 with Cache-Control no-store and exact artifact bytes/hashes:

| Installer | Bytes | SHA-256 |
| --- | ---: | --- |
| /downloads/frevos-connector.zip | 39038067 | 1c72e0a5a8e7b53c796f56d8b4860dec7e3d35f2d38e388c0e664d1dbe727c8f |
| /downloads/devsetu-connector-linux-x64.tar.gz | 48853348 | 56135387b65b5b9172d6b8fd15005f198fbfc33f9c154ba15bb481acd5d13624 |
| /downloads/devsetu-connector-android.apk | 37273 | cb1ffa355596b249f9b9b6dde84fba3db1e9f1f6df98b7879a4308ec58afdb9d |

- Authenticated Discovery smoke check: session verified, three grouped systems, L-1465 and L-1770 Online with fresh heartbeats, ESDS003228SS Offline/stale with last-seen time. The new bell opens and accurately reports zero pending joins; the inbox retains two expired historical requests. No live join was created, approved, transferred or deleted for this test. The initial navigation times out, then the same tab renders successfully; no duplicate tab or alternative control mechanism is used.
- Windows PowerShell -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File .local/Inspect-SimpleJoinUpdater.ps1 after activation: exit 0, existing DevSetu-PlatformUpdater running as SYSTEM with verified worker hash, serverChanged false.
- node .local/Verify-SimpleJoinReleasePreviews.cjs: exit 0; all four original local previews healthy with exact identities/images/mounts. Completed temporary build task removed after identity/actor/action/hash/exit-0 checks; temporary loopback review server stopped and review tab closed.
- The five compatibility source-Git ACL preimages exactly match their after-images: no access expansion occurred. The idempotent operator rewrote the same DACLs.
- git diff --check for final documentation: exit 0. Runtime source stays frozen at 27f85a7; delivery-only documentation does not alter the deployed artifact.

The deployment operator retains private previous-state/task/runtime/IIS backups and the previous artifact. No live rollback was executed; it requires a separately scoped human approval. This is not a full database backup or a claim that normal running services make no database writes. No GitHub push, PR merge or central-source publication is implied by the successful maintenance activation.

## Delivery documentation

Additional delivery files relative to the frozen artifact source: docs/CURRENT_STATE.md and docs/SIMPLE_JOIN_SERVER20_RELEASE_HANDOFF.md (this file). The complete source change list above plus this new handoff gives 36 changed files relative to base 758d4449. Next bounded work is genuine device acceptance of the updated installers, or a separately approved first-class build-only pipeline; neither is claimed complete by this release.
