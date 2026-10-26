# DevSetu managed project handoff

Date: 2026-10-22. Status: PASS for the bounded server20 pilot.

Repository: `https://github.com/mishrarishav/FrevOS`.
Checkout: `D:\FREVOS\.local\worktrees\servix-dashboard`.
Branch: `fix/devsetu-managed-project`, stacked over preceding uncommitted work.
Base and unchanged HEAD: `bc4530746c01269b3795a25edad63efad9364b9f`.
No staging, commit, push, PR or merge. [ADR 0046](adr/0046-devsetu-managed-project.md).

## Behavior

Previously only Servix appeared in Projects; DevSetu's updater was a separate
header link. The backend now owns a read-only `devsetu-platform` record alongside
Servix, without writing a settings file or database row. Projects and Deployments
use the same list in cards and tables. View explains its build source, server20
destination and managed protection. The owner Deploy link opens `/maintenance`
for review/activation of a prepared artifact. Other users see Owner managed.

Edit/archive, connector pairing and customer-runner tests reject the managed
identity at the backend. A conflicting settings file fails closed. DevSetu never
uses Servix deploy/restore actions or displays a false laptop-offline state.
Self-service platform rollback remains disabled and explicitly described; existing
failed-activation recovery is unchanged. Source commit/push/build automation is
not added. No schema/dependency change, invitation, password change or server21
customer-app deploy/rollback is part of this task. Production `D:\Servix` excluded.

## Executed checks

- `pnpm.cmd run ci`: PASS, exit 0; 233 tests (75 contracts, 78 UI, 80 backend),
  required docs/format/lint/types, coverage, build and high-severity audit gate.
  `.local/managed-project-ci.log`. Two existing moderate advisories remain;
  no dependency upgrade or full security scan was performed.
- Backend statements 95.11%, branches 90.39%, functions 98.82%, lines 96.14%.
  Tests verify the actual managed record, no settings write, owner read-only
  enforcement, pairing/test denial, storage collision and capacity including both
  defaults. Real PostgreSQL/HTTP integration verifies the authorized list.
- Headful isolated browser used compiled backend metadata and read-only snapshots
  from server20, with all mutation requests blocked. Projects and Deployments both
  show two records in cards/tables. The platform has only View in Projects; its
  deployment link is `/maintenance`, rollback disabled, no false offline badge.
  Member fixture has no platform Deploy link. Navigation/refresh retained the
  records. Desktop 1366x768, tablet 768x1024 and mobile 390x844 deployment views
  had no document horizontal overflow; mobile project list/details also passed.
  Zero mutation requests. `.local/managed-project-preview.json` and associated
  `managed-project-*-preview.png` screenshots. These are fixtures, not live-new-UI
  acceptance or proof of a full ZIP transfer.

## Release

The builder/installer pin the actual previous manifest
`2a01ac93600f5762a65750a84d6a771ef5f44a86a44e11ba8d10bab092a4eee9`.
This release includes the previously verified native updater repair source;
the installed independent worker already has the same digest. No bootstrap is
needed. A fresh artifact/action/correlation-bound approval was consumed by the
existing dashboard updater. Old approvals were not reused.

Active manifest:
`733af5447762291037cd3da92c4d1f10d19a5486ed0df91b3f4c0feaecef65b0`.
Archive SHA-256:
`da8c83ee45c7e9ea00106e00b16d3f9c5b0e05fe157f045162a9b9085be30688`.
Package `.local/servix-release-b31a2ecbf7524a349762f073293a3e72/package`,
3,707 files. Receipt `.local/managed-project-final-release.json`.
Operator correlation `36750bb032434eb791eb42886ce2656f`.
Self-update request `su_f1aa030ddea4b1aa01f89df6264d1f76`.

Exact artifact verification passed integrity/delta, wrong digest and migration
denial, and PowerShell parser/reserved-name checks. The packaged Node 24.19.0
native entry point passed disposable PostgreSQL/HTTP smoke including both actual
projects, read-only platform save denial, login/logout and the updater contract.
Logs `.local/managed-project-artifact.log` and `managed-project-smoke.log`.
Authenticated SMB/RPC Plan passed with no database/configuration change and its
temporary task removed (`managed-project-plan.log`).

The real `/maintenance` button submitted exactly one POST. Deploy disabled,
elapsed time appeared, and the independent worker activated the prepared artifact.
Its native Apply receipt reports PASS, health/UI 200, databaseWritten false,
sibling IIS preserved and private recovery backups retained. No separate operator
Apply invocation or worker-only repair was necessary. The original app package
and independent worker now include the same previously repaired result producer.
The page reported success, including when reopened through the new deployment row.

Live Projects showed two records in cards/tables; DevSetu had View only and its
details opened/closed. Live Deployments showed both records in cards/tables, owner
Deploy linked to `/maintenance`, platform Rollback disabled and no false offline
label. Following that row link reopened the existing successful update without
another POST. Refresh/navigation retained both records. Screenshots are
`.local/managed-project-live-projects-{cards,table}.png`,
`managed-project-live-deployments-{cards,table}.png`, and
`managed-project-live-update-success.png`.

Final API readback `.local/managed-project-live-acceptance.json` confirms exact
Servix configuration equality, unchanged current request
`sd_a78d33690ccdf8db2db2a54df6a29237` and source
`58e9359012b2326f9c627379c865157ae18c3835`, runner online, and updater succeeded.
All five saved Servix protected paths remain in the same revision-2 profile.
The owned fixture preview was stopped and live Projects left visible. No live
customer deployment/restore, password change or invitation was submitted.
Future releases must pin the new active digest and use new scoped approvals;
this build's source pin refers to its own previous release intentionally.

## Limits and next scope

The existing Servix origin allowlist mismatch is unchanged. This supplies project
visibility and navigation to the working prepared-artifact updater; automatic
publication/build of future DevSetu source changes and platform rollback are
separate work. Phase 4 exit and whole-product readiness are not established.

## Working-tree inventory

Final delivery checks passed: `pnpm.cmd run validate:repo` (65 Markdown files),
`pnpm.cmd run format:check` (103 files, no fixes) and `git diff --check`.
Only existing CRLF normalization notices were emitted. No runtime source changed
after the successful CI/build/artifact checks. Ready for use of these project
views within the existing pilot scope.

Includes all preceding uncommitted work, not only this task. Tracked entries
are additions/deletions/path; untracked entries give new line counts. This handoff
count predates the final delivery text and inventory. Snapshot:
`.local/managed-project-inventory.json`.

```text
3	3	README.md
2	2	apps/control-center/index.html
1	1	apps/control-center/package.json
2	2	apps/control-center/public/favicon.svg
176	53	apps/control-center/src/App.tsx
176	8	apps/control-center/src/api.ts
1	1	apps/control-center/src/main.tsx
22	1	apps/control-center/src/routing.ts
1009	0	apps/control-center/src/styles.css
218	1	apps/control-center/test/api.test.ts
3	3	apps/control-center/test/app.test.tsx
25	0	apps/control-plane/README.md
30	1	apps/control-plane/src/config.ts
70	0	apps/control-plane/src/main.ts
17	0	apps/control-plane/src/repositories.ts
498	29	apps/control-plane/src/server.ts
30	0	apps/control-plane/test/crypto-config.test.ts
820	2	apps/control-plane/test/postgres-service.integration.test.ts
3	0	apps/control-plane/vitest.config.ts
172	4	docs/CURRENT_STATE.md
30	0	docs/adr/README.md
5	0	packages/contracts/src/index.ts
107	88	pnpm-lock.yaml
2	0	pnpm-workspace.yaml
364	0	apps/control-center/src/AccountControls.tsx (untracked)
927	0	apps/control-center/src/DeploymentSettingsPage.tsx (untracked)
618	0	apps/control-center/src/DeploymentsPage.tsx (untracked)
85	0	apps/control-center/src/DeveloperAccess.tsx (untracked)
72	0	apps/control-center/src/PlatformProjectDetails.tsx (untracked)
369	0	apps/control-center/src/RecordWorkspace.tsx (untracked)
31	0	apps/control-center/src/WorkspaceDialog.tsx (untracked)
4	0	apps/control-center/src/deployment-request-id.ts (untracked)
30	0	apps/control-center/src/servix-deployment-state.ts (untracked)
13	0	apps/control-center/test/deployment-request-id.test.ts (untracked)
101	0	apps/control-center/test/deployment-settings.test.tsx (untracked)
57	0	apps/control-center/test/servix-deployment-state.test.ts (untracked)
259	0	apps/control-plane/src/deployment-settings.ts (untracked)
573	0	apps/control-plane/src/developer-connectors.ts (untracked)
150	0	apps/control-plane/src/local-accounts.ts (untracked)
112	0	apps/control-plane/src/self-updates.ts (untracked)
646	0	apps/control-plane/src/servix-deployment.ts (untracked)
258	0	apps/control-plane/test/accounts.integration.test.ts (untracked)
201	0	apps/control-plane/test/connector-local-git.test.ts (untracked)
484	0	apps/control-plane/test/deployment-settings.test.ts (untracked)
354	0	apps/control-plane/test/developer-connectors.test.ts (untracked)
58	0	apps/control-plane/test/self-updates.test.ts (untracked)
164	0	apps/control-plane/test/servix-deployment.test.ts (untracked)
57	0	apps/control-plane/test/servix-execution.test.ts (untracked)
255	0	apps/control-plane/test/servix-rollback.test.ts (untracked)
161	0	deployment/server20/Apply-InternalHttp.ps1 (untracked)
208	0	deployment/server20/Apply-ServixDashboard.ps1 (untracked)
53	0	deployment/server20/HttpCommon.ps1 (untracked)
41	0	deployment/server20/Install-SelfUpdate.ps1 (untracked)
43	0	deployment/server20/New-InternalHttpRelease.ps1 (untracked)
73	0	deployment/server20/New-ServixDashboardRelease.ps1 (untracked)
66	0	deployment/server20/Repair-SelfUpdateWorker.ps1 (untracked)
43	0	deployment/server20/Run-SelfUpdate.ps1 (untracked)
23	0	deployment/server20/Start-Server20.ps1 (untracked)
286	0	deployment/server20/Test-HttpArtifact.mjs (untracked)
24	0	deployment/server20/Test-InternalHttp.ps1 (untracked)
32	0	deployment/server20/Test-SelfUpdateAcl.ps1 (untracked)
22	0	deployment/server20/Test-SelfUpdateJournal.ps1 (untracked)
21	0	deployment/server20/Test-ServixDashboardRelease.ps1 (untracked)
28	0	deployment/server20/Test-ServixDeploymentIdle.ps1 (untracked)
153	0	deployment/server20/Verify-HttpManifest.mjs (untracked)
10	0	deployment/servix/ActivationFiles.psm1 (untracked)
125	0	deployment/servix/Build-DevRelease.cjs (untracked)
53	0	deployment/servix/Build-Servix.ps1 (untracked)
59	0	deployment/servix/BuildProcess.psm1 (untracked)
17	0	deployment/servix/Choose-Repository.ps1 (untracked)
518	0	deployment/servix/Connector.cjs (untracked)
113	0	deployment/servix/DeploymentFiles.psm1 (untracked)
90	0	deployment/servix/Import-PackageCache.cjs (untracked)
30	0	deployment/servix/Import-PackageCache.ps1 (untracked)
45	0	deployment/servix/Install-ActivationRunner.ps1 (untracked)
150	0	deployment/servix/Invoke-DevRelease.ps1 (untracked)
129	0	deployment/servix/Invoke-DevTarget.ps1 (untracked)
25	0	deployment/servix/New-ConnectorDownload.ps1 (untracked)
41	0	deployment/servix/Preservation.cjs (untracked)
51	0	deployment/servix/Provision-Servix.ps1 (untracked)
176	0	deployment/servix/Publish-GitDependencies.cjs (untracked)
88	0	deployment/servix/RepositoryPicker.cs (untracked)
54	0	deployment/servix/RepositoryPicker.psm1 (untracked)
134	0	deployment/servix/Run-Activation.ps1 (untracked)
11	0	deployment/servix/Run-Connector.ps1 (untracked)
27	0	deployment/servix/Run-DevBackend.ps1 (untracked)
87	0	deployment/servix/Setup-Connector.ps1 (untracked)
3	0	deployment/servix/Setup.cmd (untracked)
15	0	deployment/servix/Test-ActivationFiles.ps1 (untracked)
31	0	deployment/servix/Test-BuildProcess.ps1 (untracked)
29	0	deployment/servix/Test-ConnectorRecovery.ps1 (untracked)
26	0	deployment/servix/Test-Preservation.ps1 (untracked)
30	0	deployment/servix/Test-ReleaseRestore.ps1 (untracked)
58	0	deployment/servix/Test-RepositoryPicker.ps1 (untracked)
30	0	deployment/servix/reused-operator.json (untracked)
17	0	deployment/servix/web.config (untracked)
304	0	docs/DEVELOPER_CONNECTOR_HANDOFF.md (untracked)
245	0	docs/DEVSETU_BRANDING_HANDOFF.md (untracked)
63	0	docs/DEVSETU_PROJECT_HANDOFF.md (untracked)
237	0	docs/PROJECT_DEPLOYMENT_SETTINGS_HANDOFF.md (untracked)
291	0	docs/PROJECT_WORKSPACE_HANDOFF.md (untracked)
150	0	docs/SERVER20_HTTP_HANDOFF.md (untracked)
232	0	docs/SERVIX_DASHBOARD_HANDOFF.md (untracked)
200	0	docs/SERVIX_ROLLBACK_HANDOFF.md (untracked)
305	0	docs/SYSTEM_CONNECTOR_ACCOUNTS_HANDOFF.md (untracked)
52	0	docs/adr/0038-server20-internal-http.md (untracked)
66	0	docs/adr/0039-server20-servix-git-dashboard.md (untracked)
60	0	docs/adr/0040-portable-developer-connectors.md (untracked)
47	0	docs/adr/0041-servix-saved-release-rollback.md (untracked)
30	0	docs/adr/0042-project-deployment-settings.md (untracked)
43	0	docs/adr/0043-project-master-and-deployment-workspace.md (untracked)
27	0	docs/adr/0044-devsetu-display-branding.md (untracked)
51	0	docs/adr/0045-account-controls-and-platform-update.md (untracked)
23	0	docs/adr/0046-devsetu-managed-project.md (untracked)
19	0	packages/contracts/src/auth-cookies.ts (untracked)
125	0	packages/contracts/src/deployment-settings.ts (untracked)
68	0	packages/contracts/src/developer-connectors.ts (untracked)
30	0	packages/contracts/src/local-accounts.ts (untracked)
75	0	packages/contracts/src/servix-deployment.ts (untracked)
20	0	packages/contracts/test/auth-cookies.test.ts (untracked)
52	0	packages/contracts/test/deployment-settings.test.ts (untracked)
```
