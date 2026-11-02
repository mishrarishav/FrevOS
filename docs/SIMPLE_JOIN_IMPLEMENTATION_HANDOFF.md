# Simple connector requests and connection status

Date: 2026-11-03 IST. Phase 4 remains open.

Status: PASS for the bounded implementation and local qualification. The final
complete native CI gate passes. Implementation is local, uncommitted and not
deployed. Genuine phone/Linux desktop acceptance and a newly reviewed release
remain separate; this document does not approve publication or activation.

Repository: mishrarishav/FrevOS, provider ID 1329122983.
Branch: `codex/simple-join-approvals`.
Base and current HEAD: `758d44497d55142d07bc9d6ecc23d668350f3168`.
Resulting commit / PR: none. No staging, commit, push, merge or new deployment.
The inherited unmerged Paperclip stack is unchanged; this remains one bounded
Phase 4 onboarding task under ADRs 0084/0085.

## Scope and behavior

- Windows and Linux local setup, and the Android app, accept the requester's
  own new/existing account. They submit a private-proof-bound account/computer
  request. An administrator reviews that exact computer and account once;
  the same connector automatically redeems the approved request. No normal
  pairing-code copying, administrator password, project or Git prerequisite.
- Private credential/poll hashes, name, architecture and monitoring choice are
  immutable approval inputs. A foreign proof, changed binding, expired approval
  or different account cannot reuse the grant. Existing account/version,
  single-use redemption, workspace authorization and audit checks remain.
- Existing manual requests and installed pairings retain compatibility.
  An older connection owned by another account is never silently reassigned.
  Pending native requests resume with their private proof; account passwords
  are not saved. New-account approval followed by expiry directs retries to
  the existing account, without recreating it.
- The admin bell shows the real pending count and leads to Join requests.
  Control Center shows a matching approval card. Results are session/workspace
  scoped, clear on access changes and fail unavailable rather than falsely zero.
  Ordinary users receive no requester names or approval controls.
- Connected is shown only after authenticated health, with live Offline status.
  Windows installs a branded desktop shortcut. Linux installs a per-user app
  launcher and a desktop entry when `~/Desktop` exists. Android uses its app icon
  and existing foreground monitoring notification. Status launchers never
  re-pair or start a stopped collector.
- A successful browser device challenge now presents verification without the
  contradictory registration error. Connecting the device does not create a
  browser session; same-browser proof and the user's own sign-in remain.

Excluded: a new signed Windows EXE, tray process, automatic browser sign-in,
owner reassignment, broad role grants, new remote commands, Android personal-file
collection, customer application deployment and Production activation. Linux
desktop trust/launch behavior depends on its desktop environment. Android's
native notification/foreground-service permissions remain user-controlled.

## Validation evidence

All evidence below is local qualification unless explicitly described as the
existing Server20 SDK builder. No actual requester or live account was approved.

- `pnpm install --frozen-lockfile`: exit 0, 357 packages.
- `pnpm run typecheck`: exit 0 on final TypeScript source.
- `pnpm run build`: exit 0; existing frontend chunk-size warning remains.
- Complete CI attempts retain failures; no timeout, security assertion, coverage
  threshold or acceptance test was weakened. Earlier attempts found formatting,
  lint, inherited PowerShell module paths, a duplicate synthetic Android ID and
  Windows fixture first-health latency. Those diagnostics and corrections are
  retained in ignored `.local/simple-join-*.log` evidence.
- The real PostgreSQL/HTTP approval/login integration passes with the native
  local wizard and Linux/Android binding cases. The Windows install adapter in
  that case is injected; its real DPAPI/scheduled task is separately exercised
  by the original Windows enrollment fixture.
- Actual Windows shortcut and branded-icon fixture: 3 tests passed in
  `simple-join-status.test.ts`. Its exact test-owned shortcut/root is cleaned up.
- Actual loopback status checks exercise online/offline and reject foreign
  Origin/Host. Existing proof, replay, revocation and ownership tests remain.
- Network-isolated non-root pinned Linux container fixture: PASS for actual
  filesystem install/resume, app/desktop launcher, icon, offline page, retained
  private credential, retained shared-directory mode and refusal to overwrite
  an unknown launcher. `systemctl` is stubbed; no real Linux desktop/systemd
  acceptance is claimed.
- Browser tests use the actual components/CSS with synthetic API records:
  bell/dashboard count, correct review target, no copied code, count clearing
  after approval, ordinary-user denial, desktop/tablet/390px mobile layout.
  There is no horizontal page overflow at tested widths. Screenshots are in
  `.local/evidence/join-*.jpg`; they are local synthetic previews, not Server20.
- The existing Server20 SDK builds/signs the Android source with its retained
  certificate. Its `local-uncommitted` report qualifies compilation only; it is
  not a published/releasable APK or evidence of phone acceptance. A new server
  release containing the native join endpoints must precede live APK rollout.

Observed final-source commands and artifacts:

| Command / qualification | Observed result |
| --- | --- |
| `node scripts/validate-repository.mjs` | Exit 0, 134 Markdown documents. |
| `git diff --check` | Exit 0. |
| `pnpm run ci` (`simple-join-ci-final.log`) | Exit 1: contracts 94/94, UI 106/106, backend 293/294; only unchanged native Git fixture times out at 180 seconds. Backend coverage report is not produced after failure. |
| `node .local/Diagnose-SimpleJoinNativeGit.cjs` | Exit 0, all 18 native Git/RBAC/backup/restore checks in 178.614 seconds. Diagnostic adds safe stage timings only; this does not replace the failed original CI gate. |
| `pnpm run ci` (`simple-join-ci-release-gate.log`) | Exit 0: 96 files / 494 tests (contracts 94, UI 106, backend 294), original coverage/format/lint/typecheck/build/audit gates. Native Git and Windows enrollment both pass; no assertion or deadline is relaxed. |
| `pnpm run typecheck` | Exit 0. |
| `pnpm run build` | Exit 0, existing frontend chunk warning. |
| `pnpm run audit` | Exit 0 at unchanged high threshold; 5 low / 8 moderate advisories remain. |
| PowerShell parser over Run/Install/Resume and both fixture scripts | Exit 0, five files. |
| Existing enrolled Server20 SDK via `Build-SimpleJoinAndroid.cjs` | Exit 0, SIGNED; job `ab_5b4c91b4df71f6adc19141a7fe25f3f0`. |
| `node .local/Verify-SimpleJoinAndroid.cjs` | Exit 0, all seven current source files and APK bytes match the report. |

Final backend coverage: 95.17% statements, 91.54% branches, 97.12% functions,
96.90% lines. Windows module-path correction applies only to the validation
process environment (`PSModulePath` / `WindowsPowerShellModulePath`), with no
machine/user environment changes. The complete diff was manually reviewed and
authorization/private-state negative tests pass. No new independent security
scan is claimed. The retained low/moderate advisories and chunk warning are
not concealed or treated as zero findings.

Android source tree:
`1dd234e27466ebe44d6b2da25276836f679633e79acf0df92b4f44b8963db782`.
APK: `88843b4e622d0cbf87c8d50ec92b95793e670d9cbe572a0be1da2fec97d37ead`.
Retained certificate:
`0d3a704822eacaef060a4560c2f800479179eed96dfbf9e94993dcf2b75cec92`.
The APK stays in ignored local qualification storage; it is not offered as a live
download against an older server. No new signing identity or SDK was installed.

The 28 changed non-document source/test files are snapshotted with aggregate
SHA-256 `4fbb0848aaa1c49579a24bfd9d7079880297b9a67b62c5b4d06afbbf8e1aadac`.
The snapshot remains byte-identical after the final complete CI. Two exact
orphaned shortcuts from earlier test runs were moved, with
hashes verified, to `.local/test-shortcut-recovery`; unrelated desktop entries
were not changed. The fixture now removes its exact verified shortcut itself.
Tool policy rejected deletion of one exact abandoned synthetic Git fixture
before execution. A safer, path/provenance/process-verified move into ignored
`.local/test-fixture-recovery` preserves all of its files instead. Other temporary
roots were not touched. Four owned local previews were restarted with their
original container IDs, images and mounts; all four are running and healthy at
00:30 IST on 2026-11-03. An initial whole-array comparison flags Docker's changed
mount order; comparing by destination verifies every unchanged mount field.
`.local/simple-join-preview-preservation.json` retains that final observation.
No volumes or VM disks were removed. The task's temporary Vite server and
synthetic browser tab are closed; the user's Server20 tab is retained.

## Delivery and next boundary

The earlier prepared Paperclip artifact `a28b9f4a…` does not include this task.
Do not activate it as an onboarding fix. After clean qualification, review the
complete patch, obtain publication authorization as required, publish the task
branch, build a new immutable release and present its exact digest for fresh
activation approval. Existing Server20 pairings, settings and `.env` have not
been rewritten by this work. User phone and genuine Linux desktop acceptance
remain separate from compilation and synthetic browser evidence.

Complete changed-file list (including untracked additions; no staged files):

```text
apps/android-connector/AndroidManifest.xml
apps/android-connector/src/org/devsetu/connector/ConnectorApi.java
apps/android-connector/src/org/devsetu/connector/MainActivity.java
apps/android-connector/src/org/devsetu/connector/MonitorService.java
apps/control-center/src/App.tsx
apps/control-center/src/DiscoveryPage.tsx
apps/control-center/src/JoinRequestForm.tsx
apps/control-center/src/JoinRequestsInbox.tsx
apps/control-center/src/styles.css
apps/control-center/test/app.test.tsx
apps/control-plane/src/join-requests.ts
apps/control-plane/src/server.ts
apps/control-plane/test/connection-shortcut.fixture.ps1
apps/control-plane/test/device-enrollment.test.ts
apps/control-plane/test/device-logins.test.ts
apps/control-plane/test/fixtures/system-enrollment-task.ps1
apps/control-plane/test/join-login.integration.test.ts
apps/control-plane/test/linux-connection-status.fixture.cjs
apps/control-plane/test/simple-join-status.test.ts
deployment/servix/Connector.cjs
deployment/servix/DeviceEnrollment.cjs
deployment/servix/DeviceEnrollmentClient.js
deployment/servix/Install-SystemConnector.ps1
deployment/servix/Resume-SystemConnector.ps1
deployment/servix/Run-Connector.ps1
deployment/servix/START-HERE.txt
deployment/servix/SystemLinuxInstaller.cjs
docs/CURRENT_STATE.md
docs/ONBOARDING_OBSERVATIONS_2026_11_02.md
docs/SIMPLE_JOIN_IMPLEMENTATION_HANDOFF.md
docs/adr/0084-code-free-desktop-join-and-admin-inbox.md
docs/adr/0085-android-and-linux-simple-connection-status.md
docs/adr/README.md
packages/contracts/src/join-requests.ts
```

Final diff stat: 34 files changed, 2057 insertions(+), 176 deletions(-).
