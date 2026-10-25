# System-first Windows pairing — 2026-10-25

Status: implementation and local validation PASS; configured rollout pending.
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
