# DevSetu branding handoff

Date: 2026-10-22. Status: PASS for the bounded display rename and deployment.

Repository: `https://github.com/mishrarishav/FrevOS`.
Checkout: `D:\FREVOS\.local\worktrees\servix-dashboard`.
Branch: `feature/devsetu-branding`, stacked on preceding uncommitted work.
Base and unchanged HEAD: `bc4530746c01269b3795a25edad63efad9364b9f`.
No commit, push, pull request or merge.

## Scope

Owner-requested display rename to DevSetu: login, navigation shell, accessible
labels, page title/description, D favicon and brand mark, connector installer
prompts and native folder-picker title. The product-owned default server20
workspace label is mapped for presentation only. Database records, schema,
backend application code, package names, routes, auth cookies, service/task/IIS
names, filesystem paths, Git identities, customer source and protected data
remain unchanged. Existing historical documentation retains its original names.
ADR 0044 records the distinction.

Release operator files pin the previous active artifact, bind approval to this
branding task and check the new HTML title. The release source inventory now
includes HTML and favicon. These are deployment verification changes only.

## Validation and activation

Executed from the checkout above, exit 0 unless explicitly stated otherwise:

- `pnpm.cmd --filter '@frevos/control-center' run test`: 76 tests passed.
- `pnpm.cmd run typecheck`: passed; `.local/devsetu-typecheck.log`.
- `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File
  deployment/server20/New-ServixDashboardRelease.ps1 -PreviousPackageRoot
  .local/servix-release-d50681cf99e34d6dba7a6e87ca3e45df/package`: passed;
  `.local/devsetu-build.log`. Build includes local-auth frontend and native picker.
- `node .local/Check-DevSetuDelta.cjs`: passed; all 3,645 files under
  `apps/control-plane/` are identical to the prior sealed artifact, including
  migrations, dependencies and contracts. Only frontend output, connector display
  copy/native executable, connector ZIP and release verification metadata differ.
  `.local/devsetu-delta.json` records the complete artifact delta.
- `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File
  deployment/server20/Test-ServixDashboardRelease.ps1` with the exact candidate,
  manifest and previous-package arguments: passed; full file hashes, bounded delta,
  wrong-digest and migration-change rejection, PowerShell parser/reserved names.
- `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File
  deployment/servix/Test-RepositoryPicker.ps1`: passed; real Git/CurrentUser DPAPI,
  identity/expiry/origin/replay checks, exact backup, unchanged Git and credential.
- `pnpm.cmd run validate:repo`, `pnpm.cmd run format:check`, `pnpm.cmd run lint`
  and `git diff --check`: passed. Lint retains existing advisory warnings/infos;
  no unrelated cleanup performed. Documentation validation covers 61 files.

Full CI from the preceding task is historical evidence, not a rerun for this
display-only task. No new security scan or dependency audit was performed;
dependency bytes are unchanged.

Active manifest:
`b9f712eeee3942f29b7ad9edf827c52377b87b95cde6a641aeda7d43f228c325`.
Archive SHA-256:
`82fe22091dd0aa862e66c61454b78094e281d6f04b463dd229261f63c6287207`.
Sealed package: `.local/servix-release-2475c27a5f8a457287c24704c1a534e9/package`,
3,693 files. Previous active manifest: `84911d3a`.

The owner's explicit rename-and-deploy request authorized this artifact. Fresh
single-use approval action `frevos.server20.devsetu-branding.v1` was bound to the
actor, workspace, server20, manifest, archive and correlation
`fdaed3389ad44ef89b9e67598c7dbdc1`. The existing private SMB RPC boundary ran Plan
and Apply successfully, removed both temporary tasks and retained private recovery
backups. Receipts: `.local/devsetu-plan.log`, `.local/devsetu-apply.log`.
Health/UI returned HTTP 200; databaseWritten false; sibling IIS sites preserved.
The server active pointer was independently read back and matched the manifest.

Headful Edge on the actual server20 origin verified DevSetu login, browser title,
favicon, shell/default workspace label, Projects table and read-only configuration
dialog, deployment cards/table and the existing rollback control. No page errors.
At 390 x 844 the document remained 390 x 844 with no page overflow. Screenshots:
`.local/devsetu-live-login.png`, `devsetu-live-projects.png`,
`devsetu-live-deployments.png`, `devsetu-live-mobile.png` (all under `.local/`).
The loaded Projects table contains one configured record. View/Escape and view
switching were exercised; no CRUD or customer-app Deploy/Rollback was submitted.

Saved configuration payloads matched exactly before/after. Current Servix request
`sd_a78d33690ccdf8db2db2a54df6a29237`, source
`58e9359012b2326f9c627379c865157ae18c3835` and run count were unchanged. The
destination runner remained online. The paired laptop's two display files were
upgraded after exact old/new hash and task ownership checks, with backups; its
DPAPI credential bytes, task, source folder and pairing remained unchanged. A
fresh online heartbeat after restart was observed. No native UI interaction was
needed for this title-only patch; previous native interaction checks are historical.
`.local/devsetu-picker-upgrade.json` and `.local/devsetu-live-acceptance.json`.

The live download returned 200 and matched the sealed connector ZIP SHA-256
`7f8777e87e8c2ba02175690771ca916be413ce55791226860b461016f6910419`.
It contains 11 files, DevSetu setup copy and the same native executable hash as
the installed picker:
`bb6ecc0531581e096fbfa3739008503de7f60dff939fc1ee2ca7aa8f1684891e`.

## Files and limitations

The change preserves the existing worktree's uncommitted implementation. No
backend/database migration or universal product-readiness claim. Internal FrevOS
identifiers remain intentionally compatible, including the connector ZIP name.
The installed connector's display executable and fatal-start message were updated
with device credentials and pairing preserved.

Existing eligibility limitation, observed before and after this release: the
laptop's repository origin is `https://github.com/mishrarishav/Servix.git`, while
the existing Servix source allowlist expects `freshwavetechlab-boop/itsm.git`.
Deploy remains disabled; Rollback is enabled and the laptop/runner are online.
The origin, allowlist, backend and Git configuration were deliberately left intact
under the owner's display-only constraint. No claim that deployment eligibility
or whole-product readiness was fixed. The next bounded task can reconcile the
selected repository identity across its owning configuration and consumers.

<!-- BEGIN:branding-files -->

Branding-task files (18):

- `README.md`
- `apps/control-center/index.html`
- `apps/control-center/public/favicon.svg`
- `apps/control-center/src/App.tsx`
- `apps/control-center/src/DeploymentSettingsPage.tsx`
- `apps/control-center/src/main.tsx`
- `apps/control-center/test/app.test.tsx`
- `deployment/server20/Apply-ServixDashboard.ps1`
- `deployment/server20/New-ServixDashboardRelease.ps1`
- `deployment/server20/Test-ServixDashboardRelease.ps1`
- `deployment/server20/Verify-HttpManifest.mjs`
- `deployment/servix/Connector.cjs`
- `deployment/servix/RepositoryPicker.cs`
- `deployment/servix/Setup-Connector.ps1`
- `docs/CURRENT_STATE.md`
- `docs/DEVSETU_BRANDING_HANDOFF.md`
- `docs/adr/0044-devsetu-display-branding.md`
- `docs/adr/README.md`

Complete preserved worktree: 105 files, +13659/-199 lines (includes preceding work).

- `README.md`
- `apps/control-center/index.html`
- `apps/control-center/package.json`
- `apps/control-center/public/favicon.svg`
- `apps/control-center/src/App.tsx`
- `apps/control-center/src/DeploymentSettingsPage.tsx`
- `apps/control-center/src/DeploymentsPage.tsx`
- `apps/control-center/src/DeveloperAccess.tsx`
- `apps/control-center/src/RecordWorkspace.tsx`
- `apps/control-center/src/WorkspaceDialog.tsx`
- `apps/control-center/src/api.ts`
- `apps/control-center/src/deployment-request-id.ts`
- `apps/control-center/src/main.tsx`
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
- `docs/DEVSETU_BRANDING_HANDOFF.md`
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
- `docs/adr/0044-devsetu-display-branding.md`
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

<!-- END:branding-files -->
