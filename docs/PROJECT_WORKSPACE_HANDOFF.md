# Project master and deployment workspace handoff

Date: 2026-10-21. Status: PASS for the bounded project/deployment UI and connector task.

Repository: `https://github.com/mishrarishav/FrevOS`.
Checkout: `D:\FREVOS\.local\worktrees\servix-dashboard`.
Branch: `feature/project-deployment-workspace`, stacked on the owner's preceding
uncommitted development deployment work. Base and unchanged HEAD:
`bc4530746c01269b3795a25edad63efad9364b9f`. No commit, push, PR or merge.

## Result

The owner supplied HRMS Applications card/table screenshots as the interaction
reference. The existing FrevOS theme remains. Projects owns configuration as a
searchable master list, with table default, card view, View/Edit, Add project and
revisioned Archive/Restore. The configuration editor keeps actions visible while
its content scrolls. The sidebar nests configuration under Projects; independent
repository operations remain accessible. `/projects/configuration` is canonical;
`/deployments/setup` remains a compatible alias.

Deployments lists active configured profiles in card/table views with shared
business action handlers, Deploy/Rollback, status/source/server/preservation badges,
source laptop selection, elapsed progress and expandable saved-release history.
The old mixed deployment/configuration panel and its obsolete styles are removed.
The record pages use their available shell height; example activity/composer UI
does not cover record actions. Search, view, sort and filters are session-scoped
by signed-in user, workspace and page. Card filters cannot silently restrict table
results; tables have their own column sorting and filters. Narrow card layouts
use a native modal filter drawer.

Choose local folder requests an expiring operation for the caller's own online,
capable connector. No remote path or command can be supplied. The connector opens
a native Windows picker, validates an existing checkout's root/origin/branch and
updates only its installed DPAPI configuration's path/origin with an exact encrypted
backup. Git HEAD/index/files and credential values remain unchanged. Queued source
publication and folder selection exclude each other. Cancellation, expiry, wrong
identity/origin, revocation and stale repository diagnostics fail closed. Windows
picker pipes explicitly use UTF-8; native persistence was tested with a non-ASCII
checkout path. Setup.cmd explicitly starts its Forms installer in STA mode.

Archiving retains configuration history, application files, credentials and saved
releases. It denies new pairing, source publication, deployment and restoration;
already authorized in-flight work is not silently cancelled. Restore re-enables
the profile without reinstalling application data.

## Executed checks

- `pnpm.cmd run ci`: PASS, exit 0; 228 tests (75 contracts, 76 UI, 77 backend),
  required formatting/lint/types, build, real disposable PostgreSQL and Git
  workflows, required coverage and audit. No known dependency vulnerabilities.
  Logs: `.local/workspace-ci-complete.log`, `.local/workspace-ci-visible-picker.log`.
- Backend coverage: statements 95.47%, branches 90.78%, functions 98.41%,
  lines 96.26%. UI API/experience/routing coverage remains 100%.
- After final presentation cleanup/copy and picker encoding changes, the UI's
  76 tests, repository formatting and native picker fixture passed separately.
  Release packaging builds and validates the final source snapshot.
- `powershell.exe -ExecutionPolicy Bypass -NoProfile -NonInteractive -File
  deployment/servix/Test-RepositoryPicker.ps1`: PASS with actual Git and CurrentUser
  DPAPI, including the actual hidden-process UTF-8 persistence bridge with a
  non-ASCII checkout path. Exact prior configuration backup retained; wrong device/profile/origin,
  expired requests, non-root folders and replay denied; credential value, HEAD
  and working tree preserved. `.local/workspace-native-picker-bridge-final.log`.
- Authenticated HTTP integration verifies workspace/CSRF boundaries, source-owner
  isolation, rejection of caller-supplied folder paths and claim/cancel completion.
  Store regressions exercise expiry, terminal outcomes, concurrent source requests,
  archive/restore and retained artifacts.
- Final repository checks: documentation validation passed for 59 Markdown files;
  formatting and `git diff --check` passed. Post-seal formatting normalized one
  verifier line ending in the source checkout; comparison confirmed its normalized
  bytes equal the immutable sealed verifier. No sealed artifact was edited.

Full checks exposed an existing close race: a stopped deployment controller could
write a late failure over a new controller's recovery-required record. Closed
controllers now relinquish durable transitions; the existing interrupted-build
regression passes without relaxing its assertions. The unrelated Git push used
only to seed a fixture repeatedly timed out, including once with two workers;
that transport's operating-system cause remains unknown. Fixture initialization
now uses the same local bundle/fetch boundary as production. Actual hook execution,
bundle export/import, preservation and conflict/default-branch checks remain.
The complete suite passed afterward (18.68 seconds backend duration observed).
Windows native Git/PostgreSQL workers are bounded at two with unchanged coverage
thresholds; other operating systems are unchanged. No CPU/memory or cross-platform
performance result is claimed.

Live native acceptance exposed an invisible PowerShell-owned chooser. The picker
now has a dedicated Windows Forms GUI executable compiled from
`deployment/servix/RepositoryPicker.cs` using the existing Windows .NET compiler;
no prerequisite software is installed. It has no credential access. Only its
selected path crosses a UTF-8 private pipe back to the installed validation helper.
The root connector owns process supervision; the persistence helper no longer
creates another process-group owner. A standalone native smoke visibly opened the
form and Browse dialog. A second bounded smoke returned the selected
`D:\servixDev` path and exited 0. The first smoke's owned process was cleaned up
after native automation could not target the nested modal's controls outside its
parent bounds; no application data was changed by either standalone smoke.
Native GUI actions use the Computer Use skill; no terminal/authentication dialog
automation was performed. The later live deployed picker check is recorded below.

## Browser verification

An isolated headful Edge preview used authorized read data plus 18 representative
profiles, including a long name, archived entries and unconnected destinations.
CRUD created a nineteenth fixture profile and exercised edit/archive/restore.
Writes and deployment stage responses were intercepted locally; they did not
change live server configuration or deploy customer code.

Both pages and both views passed 1366x768, 768x1024 and 390x844 layout checks:
12 combinations, fixed header positions, internal scrolling to the final rows,
no document-level horizontal/vertical overflow and reachable actions. Wide tables
retain internal horizontal scrolling and sticky actions. Filter drawer/Escape,
search/view persistence, card-filter isolation from tables, read-only developer
controls and the mobile editor scroller were exercised. Preview emitted no page
errors. `.local/workspace-browser-acceptance.json` and viewport screenshots retain
the evidence.

The isolated Deploy action emitted one request, showed publishing/building/activation
progress and disabled Deploy across a card/table switch, then re-enabled after
success. Native picker request/cancel feedback and Test connection rendering passed.
The later failed-run fixture displayed the failure and its public reason directly
in card/table badges, marked Needs attention and retained an enabled retry action.
The UI's 76 tests and typecheck passed after that presentation change. Final release
packaging also rebuilt the previously owned native executable from its checked
source, verifying the copied executable's manifest identity before replacement.
Actual server and native-dialog acceptance are reported separately below.

## Live acceptance

Final manifest:
`84911d3aafd6f90f4068f9b34f963a9e909889fa7875b38f412ba2a0f128e3e1`.
Archive: `d56dffbbaa94383de96eb67082184966dc7e4a0058d2aa46a33258620e9623e5`.
Files: 3,693. Final correlation: `f3dcdcb9cd6b47b4b2fd5ebf91768f2a`.
Artifact verification, Plan and Apply passed, exit 0; health/UI returned 200,
sibling sites were preserved, no database import/migration ran, temporary operator
tasks were removed and private recovery backups retained. Intermediate manifests
`521b2c20` and `58c3d5ab` were superseded during native-window acceptance. Final
evidence: `.local/workspace-final-artifact-tests.log`,
`.local/workspace-last-plan.log`, `.local/workspace-last-apply.log`.

Headful Edge verified the live Projects table and nested Configuration link, with
one real Servix profile and View/Edit/Archive controls. The old standalone setup
navigation entry is absent. Deployment cards/table loaded the same profile;
Deploy and Rollback were enabled, and the successful last-deploy badge was visible.
Test connection passed with the fresh own-device source, approved runner/hosted
health and saved five-path preservation policy. No dummy profile was created live.

The existing Limited Interactive connector was upgraded with checked source-file
identity, task ownership, backups and unchanged credential bytes. Its installed
native executable digest is
`517e73201423094f30bae6b7a2f692fe4e9f34c811117f9e933c78dac832555e`.
The live browser request opened that installed native window; Use this folder
confirmed `D:\servixDev`, returned selected status and fresh source proof, and Test
connection passed. A controlled restart of the same owned task reloaded its saved
DPAPI configuration and produced a newer authenticated heartbeat with the same
folder/commit. A second request clicked the native Cancel button and the browser
reported cancellation with the binding unchanged. No authentication dialog was
automated. `.local/visible-picker-upgrade.json`, `.local/workspace-picker-restart.json`
and `.local/workspace-final-live.json` retain safe evidence.

The HTTP installer download matched the sealed package digest and contained eleven
expected files, including `FrevOS.FolderPicker.exe`; no device credential or invite
is bundled. `.local/workspace-final-download.json`. Native GUI selection used the
Computer Use skill; application browser verification used Playwright. The final
headful browser is left on the real deployment card view.

Customer-app Deploy/Rollback were never clicked for this task. Fresh before/after
readback retained current request `sd_a78d33690ccdf8db2db2a54df6a29237`, source
`58e9359012b2326f9c627379c865157ae18c3835` and idle execution. No server21 production
path was accessed. Actual release replacement/preservation is covered by the prior
native workflows; a new customer deployment is not claimed here.

## Limits and next use

The existing Servix development adapter retains `10.9.69.21 / D:\servixDev`.
Other project profiles remain destination pending until an applicable adapter is
connected. No generic credential/command editor, Production access, new credentials
or customer database migration is added. Code rollback does not roll back database
state. A connection test checks fresh source evidence, server20 runner heartbeat
and hosted server21 health; it is not a fresh WinRM/write/build probe.

The installer still needs a one-time local user action. Newly invited-account
installer acceptance and generic destination deployment remain unverified. This
task does not declare Phase 4 exit or whole-product readiness.

## Complete working-tree inventory

Includes earlier preserved work as well as this task, not a new commit.
Diff stat: 99 files, +13324/-165 lines.

<!-- BEGIN:workspace-files -->

- `apps/control-center/package.json`
- `apps/control-center/src/App.tsx`
- `apps/control-center/src/DeploymentSettingsPage.tsx`
- `apps/control-center/src/DeploymentsPage.tsx`
- `apps/control-center/src/DeveloperAccess.tsx`
- `apps/control-center/src/RecordWorkspace.tsx`
- `apps/control-center/src/WorkspaceDialog.tsx`
- `apps/control-center/src/api.ts`
- `apps/control-center/src/deployment-request-id.ts`
- `apps/control-center/src/routing.ts`
- `apps/control-center/src/servix-deployment-state.ts`
- `apps/control-center/src/styles.css`
- `apps/control-center/test/api.test.ts`
- `apps/control-center/test/app.test.tsx`
- `apps/control-center/test/deployment-request-id.test.ts`
- `apps/control-center/test/deployment-settings.test.tsx`
- `apps/control-center/test/servix-deployment-state.test.ts`
- `apps/control-plane/README.md`
- `apps/control-plane/src/config.ts`
- `apps/control-plane/src/deployment-settings.ts`
- `apps/control-plane/src/developer-connectors.ts`
- `apps/control-plane/src/main.ts`
- `apps/control-plane/src/repositories.ts`
- `apps/control-plane/src/server.ts`
- `apps/control-plane/src/servix-deployment.ts`
- `apps/control-plane/test/connector-local-git.test.ts`
- `apps/control-plane/test/crypto-config.test.ts`
- `apps/control-plane/test/deployment-settings.test.ts`
- `apps/control-plane/test/developer-connectors.test.ts`
- `apps/control-plane/test/postgres-service.integration.test.ts`
- `apps/control-plane/test/servix-deployment.test.ts`
- `apps/control-plane/test/servix-execution.test.ts`
- `apps/control-plane/test/servix-rollback.test.ts`
- `apps/control-plane/vitest.config.ts`
- `deployment/server20/Apply-InternalHttp.ps1`
- `deployment/server20/Apply-ServixDashboard.ps1`
- `deployment/server20/HttpCommon.ps1`
- `deployment/server20/New-InternalHttpRelease.ps1`
- `deployment/server20/New-ServixDashboardRelease.ps1`
- `deployment/server20/Start-Server20.ps1`
- `deployment/server20/Test-HttpArtifact.mjs`
- `deployment/server20/Test-InternalHttp.ps1`
- `deployment/server20/Test-ServixDashboardRelease.ps1`
- `deployment/server20/Test-ServixDeploymentIdle.ps1`
- `deployment/server20/Verify-HttpManifest.mjs`
- `deployment/servix/ActivationFiles.psm1`
- `deployment/servix/Build-DevRelease.cjs`
- `deployment/servix/Build-Servix.ps1`
- `deployment/servix/BuildProcess.psm1`
- `deployment/servix/Choose-Repository.ps1`
- `deployment/servix/Connector.cjs`
- `deployment/servix/DeploymentFiles.psm1`
- `deployment/servix/Import-PackageCache.cjs`
- `deployment/servix/Import-PackageCache.ps1`
- `deployment/servix/Install-ActivationRunner.ps1`
- `deployment/servix/Invoke-DevRelease.ps1`
- `deployment/servix/Invoke-DevTarget.ps1`
- `deployment/servix/New-ConnectorDownload.ps1`
- `deployment/servix/Preservation.cjs`
- `deployment/servix/Provision-Servix.ps1`
- `deployment/servix/Publish-GitDependencies.cjs`
- `deployment/servix/RepositoryPicker.cs`
- `deployment/servix/RepositoryPicker.psm1`
- `deployment/servix/Run-Activation.ps1`
- `deployment/servix/Run-Connector.ps1`
- `deployment/servix/Run-DevBackend.ps1`
- `deployment/servix/Setup-Connector.ps1`
- `deployment/servix/Setup.cmd`
- `deployment/servix/Test-ActivationFiles.ps1`
- `deployment/servix/Test-BuildProcess.ps1`
- `deployment/servix/Test-ConnectorRecovery.ps1`
- `deployment/servix/Test-Preservation.ps1`
- `deployment/servix/Test-ReleaseRestore.ps1`
- `deployment/servix/Test-RepositoryPicker.ps1`
- `deployment/servix/reused-operator.json`
- `deployment/servix/web.config`
- `docs/CURRENT_STATE.md`
- `docs/DEVELOPER_CONNECTOR_HANDOFF.md`
- `docs/PROJECT_DEPLOYMENT_SETTINGS_HANDOFF.md`
- `docs/PROJECT_WORKSPACE_HANDOFF.md`
- `docs/SERVER20_HTTP_HANDOFF.md`
- `docs/SERVIX_DASHBOARD_HANDOFF.md`
- `docs/SERVIX_ROLLBACK_HANDOFF.md`
- `docs/adr/0038-server20-internal-http.md`
- `docs/adr/0039-server20-servix-git-dashboard.md`
- `docs/adr/0040-portable-developer-connectors.md`
- `docs/adr/0041-servix-saved-release-rollback.md`
- `docs/adr/0042-project-deployment-settings.md`
- `docs/adr/0043-project-master-and-deployment-workspace.md`
- `docs/adr/README.md`
- `packages/contracts/src/auth-cookies.ts`
- `packages/contracts/src/deployment-settings.ts`
- `packages/contracts/src/developer-connectors.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/servix-deployment.ts`
- `packages/contracts/test/auth-cookies.test.ts`
- `packages/contracts/test/deployment-settings.test.ts`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`

<!-- END:workspace-files -->
