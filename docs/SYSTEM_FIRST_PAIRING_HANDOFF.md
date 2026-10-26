# System-first Windows pairing — 2026-10-25

Status: PASS — bounded Windows pairing correction, configured rollout and exact
downloaded-package verification complete. The owner's other laptop must run
the new package; this test does not claim that laptop is remotely connected.
Repository: `D:\FREVOS`, worktree `.local/worktrees/servix-dashboard`.
Branch: `codex/system-first-pairing`.
Base/deployed source before this correction:
`a9cdebbe7cc7085451405beae8152972fed3c66b`. ADR 0058 records the bounded
stacked change. No GitHub PR or merge is performed. Preserve the preceding
Servix backend artifact handoff and its Production exclusion.

## Result

Default `Setup.cmd` opens a private browser enrollment for the computer. Enter
the DevSetu origin and the existing account's username/password, optionally
consent to metadata activity, then connect. Git, npm installation, a project,
Servix, a Git checkout and an empty folder are unnecessary for monitoring.
The bundled Node runtime runs a protected per-user Limited/Interactive task.
First authenticated health observation is required before showing Connected.
Later project setup remains explicit in `Setup-Project.cmd` and project config.

System credentials carry no repository/profile. The backend denies Git bundle,
source publication, checkout picker and local-development/environment operations
for that purpose. Discovery supports unassigned systems, actual reported disks
and directory browsing with local metadata consent. Server policy additionally
gates tracking. System-only connections never collect or accept text history.
System rows group only by reported installation/account identity; project
bindings stay visible. Plan sources still require a verified project binding.
Records use `system-fc_<id>.json`; the old project reader ignores that namespace.
An interrupted initial naming transition validates and retains identical bytes
before removing the old name; conflicting targets fail closed. This preserves
project readers when recovering to an older platform release.

Browser status survives refresh, simultaneous install requests are rejected,
same-session retries reuse their pairing, and successfully installed enrollments
are resumed after reopening for the same account. Preferences store only origin,
username, consent and device ID; credentials remain CurrentUser DPAPI. Passwords
are neither persisted nor put in URLs, argv, screenshots or diagnostics.
Install helpers receive private stdin. Native ACL protection avoids running an
unsigned downloaded PowerShell helper before the UI opens. Runtime bytes are
SHA256-checked and materialized in a new owned installation; original download
zone markers and global execution policy are retained. Resume checks the pinned
runtime and exact task action plus the resolved owner SID.
Setup children use Windows PowerShell's own module search path rather than
inheriting PowerShell 7's incompatible module paths. An actual resume regression
reproduced `CommandNotFoundException` at the hash command; the normalized child
environment passes. The host's environment and execution policy stay unchanged.

The legacy project prerequisite page now shows a persistent installation status,
elapsed time and final receipt after refresh. Disabled controls use the normal
disabled cursor. It does not pretend to expose winget download percentage or
raw installer output. Project sidecars include the shared session helper and
materialize reviewed bytes for their installed RemoteSigned task.

## Observed validation

- `pnpm --filter @frevos/control-plane exec vitest run
  test/system-enrollment-windows.test.ts test/system-enrollment.test.ts
  test/system-only-pairing.test.ts`: exit 0, five tests at the initial native run.
  Actual Windows .NET helper compilation, downloaded PowerShell zone markers,
  SHA-verified installation, CurrentUser DPAPI, Limited scheduled task,
  authenticated heartbeat/health into real connector/discovery domain stores,
  no Git/project, same-device resume and wrong-account denial passed. Owned task
  and device directory were removed after identity/action checks.
  An initial test exposed Task Scheduler's short username normalization; owner
  SID resolution corrected it. No existing customer task was changed.
- `pnpm run ci`: first complete run exit 0: 293 tests (86 contracts, 85 UI,
  122 control-plane), coverage gates, typecheck and build passed. Final
  `pnpm run ci > .local/system-first-ci-final.log 2>&1`: exit 0, 294 tests
  (86 contracts, 85 UI, 123 control-plane). Contracts statement/branch coverage
  99.13%/92.72%; control-plane 95.20%/91.35%; included UI utilities 100%.
  High audit gate passed: existing five low/six moderate advisories remain.
  The subsequent connection/home-folder label clarification is checked again
  by the configured frozen build before activation.
- `node .local/Run-CleanWindowsCI.cjs > .local/system-pairing-release-ci-clean.log
  2>&1`: exit 0, 295 tests (86 contracts, 85 UI, 124 control-plane), full
  type/build/audit/coverage pass after naming migration and module-environment
  corrections; control-plane statement coverage 95.18%. This starts the same
  unmodified `pnpm run ci` with the builder's clean Windows module environment.
  A preceding run from PowerShell 7 failed the existing Get-Acl fixture because
  inherited module paths loaded incompatible modules; no test was weakened.
- `pnpm --filter @frevos/control-plane exec vitest run
  test/system-discovery-runtime.test.ts test/system-enrollment.test.ts`:
  exit 0, nine tests. Real owned-folder changes produce system-only metadata;
  content snapshots and project prerequisite probes remain absent.
- `node .local/Test-SystemPairingBrowser.cjs`: exit 0, real Chromium with a
  synthetic account/remote stub: refresh during install, recoverable failure,
  one pairing/two install attempts, observed-report requirement, cleared
  password, desktop/tablet/mobile with no overflow or unexpected page errors.
- `node .local/Test-PrerequisiteRefresh.cjs`: exit 0, Chromium with an isolated
  fake installer: refresh resumes server status, only one install executes,
  disabled cursor is correct, result becomes visible and Continue completes.
- `node .local/ArtifactBaseline.cjs capture system-pairing`: exit 0, three
  profiles, two pipelines, eleven environment hashes, customer active release
  and local stopped-service baseline captured before rollout.

Private receipts/screenshots remain in ignored `.local/`. Browser synthetic
fixtures are UX evidence, not claims that the owner's other laptop connected.
The actual Windows runtime test uses real domain stores on loopback; it does not
alter live accounts or customer data. Per-user interactive task tests run on a
Windows user host and are explicitly skipped for Linux and Windows CI service
identities that cannot run interactive user tasks.

Initial actual DevSetu UI request `pr_d089627b55c1b4004f416b2b9b155481`
published source `ec728e68eec1cc36536595b51bd57e01b215a1eb`, passed frozen
build and independently activated manifest
`6a105e2927bbc066d91fbd8342f0f93dc248fd62c426199757a50502806acda3`.
Archive SHA256
`12dd6793fb3f1bc6ce384a7829bfd6906b5b5b09db355877fea0fe6863225cd2`,
131,408,144 bytes. Native receipt: HTTP/UI 200, SYSTEM updater, siblings preserved,
databaseWritten false. Baseline verification passes for all three profiles, two
pipelines, eleven environments, customer active release and stopped local apps.
Actual built Discovery UI with synthetic read-only responses passes unassigned
drive/folder navigation, disabled text controls, explicit project link and two
responsive viewports without page errors. A final revision adds backward-reader
record isolation, safe interrupted migration and PowerShell 7 launch resilience.

## Final delivery evidence

Final actual UI request `pr_949a30860a3412900cd40fbe07080c36` publishes resulting
commit `e8716d71631136ebc4fa2b54dde3a68de1e10977` on the same task branch.
Its frozen isolated build and independent SYSTEM activation succeeded.
Active manifest:
`b65214b741667d3816c891bda1160aee814f3f0390dedf73ca0ee791eff6a123`.
Archive: 131,409,939 bytes, SHA256
`c4830ea6128b3186c24f67aa71c0270ff2634e08c7ef0dea905215d0642ed9b5`.
Native receipt: HTTP/UI 200, databaseWritten false, siblings preserved and
private recovery backups retained. This is an actual DevSetu source-to-deploy
run, not manual per-release Git/build work. There is no PR or merge.

- `node .local/Test-LegacyConnectorReader.cjs`: exit 0. The actual previous
  sealed artifact's reader (manifest `9c31907f...92bb6b`) reads/heartbeats the
  unchanged project credential, ignores the new system namespace and denies
  the system token. Both record byte buffers remain identical. This is an
  isolated backward-reader test, not a live platform rollback.
- `node .local/Download-SystemPairingPackage.cjs native-system-pairing-final`:
  exit 0 after correcting the diagnostic's release-root path. HTTP 200/no-store;
  the actual downloadable ZIP exactly matches its sealed manifest entry.
  ZIP: 38,983,805 bytes, SHA256
  `efd6453ab254240f3e9e465cc792b4971f7a94ae322ab78ed0f6b1c016de73a8`.
- The downloaded `node.exe` runs `.local/Test-DownloadedSystemPackage.cjs`
  against its extracted package: exit 0, Node v24.19.0. Actual native ACL helper,
  marked downloaded files, CurrentUser DPAPI and Limited task pass. Real
  connector/discovery domain stores on an isolated loopback server receive
  three health observations. Monitoring survives closing setup; reopening
  reuses the same device (one pairing), with no Git/project, unexpected
  capability or page error. Three responsive viewports pass. Synthetic account
  only, file activity off, and the owned task/device/temp data are cleaned up.
- `node .local/Test-UnassignedDiscoveryUi.cjs`: exit 0 against the final built
  live UI with synthetic read-only route responses; unassigned drive and
  existing-folder navigation, content restrictions and project navigation pass.
- `node .local/ArtifactBaseline.cjs verify system-pairing`: exit 0 after final
  activation; all three profiles, two pipelines, eleven environment files,
  the exact current customer release and stopped local services are unchanged.
- `node .local/component-native-receipts.cjs native-system-pairing-final`:
  exit 0; the final operator receipt matches the active artifact.
- `git diff --check`: exit 0. Published scope from base to resulting commit:
  37 files, 2,637 insertions, 175 deletions, including the retained prior handoff.
  Final Current State/handoff result updates are saved after publication and
  remain documentation-only local changes; no further code change is pending.

Readiness: the corrected Windows package is available from DevSetu's existing
Download for Windows action and `/downloads/frevos-connector.zip`. Extract into
a new folder, open `Setup.cmd`, use the same server/account and Connect this
computer. Metadata activity is optional. Projects remain a separate later step.
Phase 4 exit and the previously blocked customer Production activation remain
outside this completed correction.

## Changed files for this correction

- `apps/control-center/src/DeploymentSettingsPage.tsx`
- `apps/control-center/src/DiscoveryPage.tsx`
- `apps/control-center/src/FolderBrowser.tsx`
- `apps/control-center/src/discovery-systems.ts`
- `apps/control-center/test/discovery-systems.test.ts`
- `apps/control-plane/src/developer-connectors.ts`
- `apps/control-plane/src/local-development.ts`
- `apps/control-plane/src/system-discovery.ts`
- `apps/control-plane/test/system-discovery-runtime.test.ts`
- `apps/control-plane/test/system-enrollment.test.ts`
- `apps/control-plane/test/system-enrollment-windows.test.ts`
- `apps/control-plane/test/system-only-pairing.test.ts`
- `apps/control-plane/test/fixtures/system-enrollment-task.ps1`
- `deployment/servix/Connector.cjs`
- `deployment/servix/Install-SystemConnector.ps1`
- `deployment/servix/New-ConnectorDownload.ps1`
- `deployment/servix/RepositoryPicker.cs`
- `deployment/servix/Resume-SystemConnector.ps1`
- `deployment/servix/Run-Connector.ps1`
- `deployment/servix/Setup.cmd`
- `deployment/servix/Setup-Connector.ps1`
- `deployment/servix/Setup-Project.cmd`
- `deployment/servix/SetupSession.cjs`
- `deployment/servix/START-HERE.txt`
- `deployment/servix/SystemDiscovery.cjs`
- `deployment/servix/SystemEnrollment.cjs`
- `deployment/servix/SystemEnrollmentClient.js`
- `deployment/servix/SystemSetup.cjs`
- `deployment/servix/SystemSetupClient.js`
- `packages/contracts/src/developer-connectors.ts`
- `packages/contracts/src/system-discovery.ts`
- `packages/contracts/test/connector-purpose.test.ts`
- `docs/CURRENT_STATE.md`
- `docs/adr/0058-system-first-pairing.md`
- `docs/adr/README.md`
- `docs/SYSTEM_FIRST_PAIRING_HANDOFF.md`

The preceding uncommitted `docs/SERVIX_BACKEND_ARTIFACT_HANDOFF.md` and Current
State correction are retained as supplied by the completed prior task.

## Limitations and next boundary

This correction ships the default Windows computer-first setup. Linux's existing
project installer remains compatible; standalone Linux packaging is not claimed.
No automatic project binding, customer-folder initialization, production rollout,
DB write, notice, email, broad permission change or Phase 4 exit is included.
File activity starts after consent/policy, is bounded by watch/retention limits,
and reports coverage gaps; it cannot reconstruct past activity or infer delivery
percentage from edits. The other laptop's final live connection needs its new
package to run and an actual first report; it has not been verified here.
