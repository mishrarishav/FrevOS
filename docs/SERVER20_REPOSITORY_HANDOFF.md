# Server20 Servix repository handoff

Date: 2026-10-22. Status: PASS for the bounded development pilot.

Repository: `https://github.com/mishrarishav/FrevOS` (project provenance).
Checkout: `D:\FREVOS\.local\worktrees\servix-dashboard`.
Branch: `fix/server20-repository-identity`, stacked on preceding uncommitted work.
Base/unchanged HEAD: `bc4530746c01269b3795a25edad63efad9364b9f`.
No Git staging, commit, push, PR or merge. [ADR 0048](adr/0048-server20-source-identity.md).

## Outcome and authority

The owner replaces the stale Servix GitHub source reference with the existing
server20 central repository. The laptop's actual named remote was read back as
`frevos=//10.9.69.20/e$/FrevOS/git/servix.git`; branch
`feature/server21-servix-dev-preservation`, HEAD
`58e9359012b2326f9c627379c865157ae18c3835`. This is an existing private Git
locator, not a newly exposed Git service. Authenticated bounded bundles remain
the transport; no Windows credentials are shared with developers.

Shared contracts define the central repository ID/locator/remote and one source
proof matcher. Projects, connection tests, folder completion, source preparation
and deployment readiness agree on that binding. Servix no longer compares the
legacy GitHub origin. Diagnostics/publish select remote `frevos`, with the paired
repository identity; central Git still validates its own ID and expected-base/
ancestry/CAS before moving its development ref. Generic draft project rules stay.

An installer can bind an existing checkout after validating an authenticated
central bundle/common ancestry, rejecting a conflicting central named remote.
It may import central objects/tracking refs and add a missing `frevos` remote;
it does not reset HEAD/index/working tree or retarget the legacy `origin`.
New clones use the central binding. Folder selection verifies that binding and
retains the configured device credential. Failed installer binding revokes its
newly paired device. Managed platform projects are excluded from connector setup.

The strict CJS worker job-key whitelist also now accepts the validated change
context from ADR 0047. Previously the direct Git function accepted it, but the
outer worker rejected that additional field. Actual producer-claim/CJS-validator
coverage now guards this boundary. No existing customer deployment was used to
test this correction; direct-function tests alone were insufficient evidence.

The live profile was saved through the existing revisioned owner/CSRF API,
changing its repository reference only and retaining raw prior configuration in
history. Destination, protected paths, local code/history and server21 production
`D:\Servix` are excluded from change. No schema migration or dependency upgrade.
DevSetu's own prepared-artifact self-update scope is unchanged.

## Executed checks

- `pnpm.cmd run ci`: PASS, exit 0, 234 tests and required repository, format, lint,
  types, coverage, build and high-severity dependency audit gate. Two existing
  moderate advisories remain; no full security scan. `.local/central-repository-ci.log`.
  Backend statements95%, branches90.46%, functions98.83%, lines96.01%.
- After CI, two tests received stronger assertions without runtime changes:
  `pnpm.cmd --filter @frevos/control-plane exec vitest run
  test/developer-connectors.test.ts test/connector-local-git.test.ts`: PASS,
  11 tests. Actual claimed source job is accepted by the production CJS validator,
  including change context; unexpected fields remain denied. Real Git verifies
  binding/central publication without `origin`, unchanged HEAD/worktree on bind,
  legacy remote preservation, conflicting central remote and unrelated-history
  rejection, bundle integrity and expected-base/ancestry publication.
  `.local/central-repository-boundary-tests.log`.
  A final connector-only correction also ignores the legacy origin's default-branch
  marker for Servix and gives change context one validation owner at both job and
  Git boundaries. The focused 11 tests, lint and typecheck passed again afterward;
  full CI preceded these connector-only corrections. Main/master protection stays.
  `.local/central-repository-lint.log`, `central-repository-typecheck.log`.
- `Test-RepositoryPicker.ps1`: PASS on native Windows with actual DPAPI, Git and
  hidden UTF-8 bridge; central remote/ID proof and legacy-origin/HEAD preservation
  added to existing identity/expiry/backup/replay checks. `central-repository-picker.log`.
- Contracts reject arbitrary share paths, wrong repository ID/remote/project and
  old GitHub proof for the managed Servix source. Existing generic project tests
  still validate their configured origins.

## Release and acceptance

Build parent is active `a2bc92d1f5b9ce639c2fb16c2e35dfa4dc7cf91bab30884586663762655ef3e7`.
The final exact artifact passed integrity/delta, wrong-digest/migration denial,
PowerShell parser checks and packaged Node24.19/disposable PostgreSQL/HTTP smoke.
The smoke verified the actual central repository descriptor. Logs:
`.local/central-repository-artifact.log`, `central-repository-smoke.log`.

Active manifest:
`9f3ba5d706f53d3b143a765124320b36d3476721b3d71cfa4e5726c819b43252`.
Archive SHA-256:
`046f77f7c13eaa1d38b8203d0075360f68da543b001f9c05d4f66913da7d303f`.
Package `.local/servix-release-4a80eb890195425080c52948911c4230/package`,
3,711 files. Operator correlation `6ce853eccbe8400d9f44195f536eb85e`.
Authenticated SMB/RPC Plan passed without config/database changes and its temporary
task was removed. A fresh action/actor/artifact/correlation-bound approval was
consumed by one actual dashboard update submission, request
`su_382a905f0d386e86e9316d30e33a69c4`. Native Apply reports PASS, health/UI200,
databaseWritten false, sibling IIS preserved and recovery backups retained.
No separate operator Apply invocation. The actual confirmation recorded the change
message and the owner's request in this session as its declared approval reference;
the authenticated requester remains `usr_windows_admin`. This is recorded request
context, not a claimed independent human review/signature. Success and context were
read back from the updater after activation.

The owned laptop connector's CJS and picker module were upgraded with task and
credential bytes preserved. Installed connector SHA-256:
`d987608916df6b986a9ae55a0d2ba50a649ad63a103fc6894642bfae2c9bc212`.
Private backup/receipt: `.local/central-repository-connector-upgrade.json`;
`central-repository-connector-upgrade.log` reports PASS. Actual heartbeat reports
online, source folder `D:\servixDev`, central locator, remote `frevos`, paired
repository ID and change-message capability. Legacy Git origin was not retargeted.

The existing owner/CSRF settings API returned200, revision3, with the central locator.
The prior raw revision remains in settings history. Only the repository reference
and normal revision/update metadata changed; destination, source folder and the
five protected paths match the saved baseline. `.local/central-repository-profile-save.json`.
The actual connection test returned200 and ready:true: Connector, Source folder,
Destination and Preservation all passed. `.local/central-repository-live-connection.json`.

The live Project field shows Server20 Git repository and the exact locator.
The live Servix card shows Ready, Deploy is enabled, and its Deploy details popup
opened/cancelled with zero customer-action POSTs. No customer source commit,
deployment or rollback was submitted. Final readback matches previous current
request `sd_a78d33690ccdf8db2db2a54df6a29237` and central source
`58e9359012b2326f9c627379c865157ae18c3835`; local HEAD/branch and Git-status digest
match the pre-upgrade snapshot. `.local/central-repository-live-acceptance.json`.
Screenshots: `central-repository-live-settings.png`, `central-repository-live-ready.png`,
`central-repository-live-update-confirmation.png`, `central-repository-live-update-success.png`
under `.local/`. Future releases must pin the new active digest and fresh approval.

An earlier sealed candidate `bbbeee4a` passed integrity/smoke and was staged under
`54729ae1d5c1452e87ca0a7e9e0a5541`, but remained unapproved/unactivated. It was
superseded to include the final legacy-default-branch/context-owner corrections.
Its package/receipts remain unchanged; the final build uses a new immutable digest.

This is the Servix central-repository correction within the development pilot,
not generic project Git hosting, platform source-build automation or Phase4 exit.

## Working-tree inventory

Final delivery checks passed: repository validation (69 Markdown files), formatting
(106 files, no fixes) and `git diff --check`. Existing CRLF normalization notices
only. No runtime source changed after the final connector boundary checks/build.
The actual deployment page remains visible; no local preview remains running.

Includes preceding uncommitted work. Tracked entries are additions/deletions/path;
untracked entries give new line counts. This handoff count predates final delivery
text and this inventory. Snapshot: `.local/central-repository-inventory.json`.

```text
3	3	README.md
2	2	apps/control-center/index.html
1	1	apps/control-center/package.json
2	2	apps/control-center/public/favicon.svg
176	53	apps/control-center/src/App.tsx
182	8	apps/control-center/src/api.ts
1	1	apps/control-center/src/main.tsx
22	1	apps/control-center/src/routing.ts
1021	0	apps/control-center/src/styles.css
225	1	apps/control-center/test/api.test.ts
3	3	apps/control-center/test/app.test.tsx
25	0	apps/control-plane/README.md
30	1	apps/control-plane/src/config.ts
70	0	apps/control-plane/src/main.ts
17	0	apps/control-plane/src/repositories.ts
504	29	apps/control-plane/src/server.ts
30	0	apps/control-plane/test/crypto-config.test.ts
829	2	apps/control-plane/test/postgres-service.integration.test.ts
3	0	apps/control-plane/vitest.config.ts
206	4	docs/CURRENT_STATE.md
38	0	docs/adr/README.md
6	0	packages/contracts/src/index.ts
107	88	pnpm-lock.yaml
2	0	pnpm-workspace.yaml
364	0	apps/control-center/src/AccountControls.tsx (untracked)
116	0	apps/control-center/src/DeploymentActionDialog.tsx (untracked)
927	0	apps/control-center/src/DeploymentSettingsPage.tsx (untracked)
697	0	apps/control-center/src/DeploymentsPage.tsx (untracked)
85	0	apps/control-center/src/DeveloperAccess.tsx (untracked)
72	0	apps/control-center/src/PlatformProjectDetails.tsx (untracked)
369	0	apps/control-center/src/RecordWorkspace.tsx (untracked)
31	0	apps/control-center/src/WorkspaceDialog.tsx (untracked)
4	0	apps/control-center/src/deployment-request-id.ts (untracked)
30	0	apps/control-center/src/servix-deployment-state.ts (untracked)
13	0	apps/control-center/test/deployment-request-id.test.ts (untracked)
101	0	apps/control-center/test/deployment-settings.test.tsx (untracked)
57	0	apps/control-center/test/servix-deployment-state.test.ts (untracked)
261	0	apps/control-plane/src/deployment-settings.ts (untracked)
594	0	apps/control-plane/src/developer-connectors.ts (untracked)
150	0	apps/control-plane/src/local-accounts.ts (untracked)
169	0	apps/control-plane/src/self-updates.ts (untracked)
654	0	apps/control-plane/src/servix-deployment.ts (untracked)
270	0	apps/control-plane/test/accounts.integration.test.ts (untracked)
277	0	apps/control-plane/test/connector-local-git.test.ts (untracked)
490	0	apps/control-plane/test/deployment-settings.test.ts (untracked)
376	0	apps/control-plane/test/developer-connectors.test.ts (untracked)
74	0	apps/control-plane/test/self-updates.test.ts (untracked)
176	0	apps/control-plane/test/servix-deployment.test.ts (untracked)
57	0	apps/control-plane/test/servix-execution.test.ts (untracked)
267	0	apps/control-plane/test/servix-rollback.test.ts (untracked)
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
155	0	deployment/server20/Verify-HttpManifest.mjs (untracked)
10	0	deployment/servix/ActivationFiles.psm1 (untracked)
125	0	deployment/servix/Build-DevRelease.cjs (untracked)
53	0	deployment/servix/Build-Servix.ps1 (untracked)
59	0	deployment/servix/BuildProcess.psm1 (untracked)
17	0	deployment/servix/Choose-Repository.ps1 (untracked)
646	0	deployment/servix/Connector.cjs (untracked)
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
57	0	deployment/servix/RepositoryPicker.psm1 (untracked)
134	0	deployment/servix/Run-Activation.ps1 (untracked)
11	0	deployment/servix/Run-Connector.ps1 (untracked)
27	0	deployment/servix/Run-DevBackend.ps1 (untracked)
88	0	deployment/servix/Setup-Connector.ps1 (untracked)
3	0	deployment/servix/Setup.cmd (untracked)
15	0	deployment/servix/Test-ActivationFiles.ps1 (untracked)
31	0	deployment/servix/Test-BuildProcess.ps1 (untracked)
29	0	deployment/servix/Test-ConnectorRecovery.ps1 (untracked)
26	0	deployment/servix/Test-Preservation.ps1 (untracked)
30	0	deployment/servix/Test-ReleaseRestore.ps1 (untracked)
68	0	deployment/servix/Test-RepositoryPicker.ps1 (untracked)
30	0	deployment/servix/reused-operator.json (untracked)
17	0	deployment/servix/web.config (untracked)
280	0	docs/DEPLOYMENT_CHANGE_NOTES_HANDOFF.md (untracked)
304	0	docs/DEVELOPER_CONNECTOR_HANDOFF.md (untracked)
245	0	docs/DEVSETU_BRANDING_HANDOFF.md (untracked)
244	0	docs/DEVSETU_PROJECT_HANDOFF.md (untracked)
237	0	docs/PROJECT_DEPLOYMENT_SETTINGS_HANDOFF.md (untracked)
291	0	docs/PROJECT_WORKSPACE_HANDOFF.md (untracked)
150	0	docs/SERVER20_HTTP_HANDOFF.md (untracked)
91	0	docs/SERVER20_REPOSITORY_HANDOFF.md (untracked)
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
29	0	docs/adr/0047-deployment-change-records.md (untracked)
40	0	docs/adr/0048-server20-source-identity.md (untracked)
19	0	packages/contracts/src/auth-cookies.ts (untracked)
25	0	packages/contracts/src/deployment-change.ts (untracked)
149	0	packages/contracts/src/deployment-settings.ts (untracked)
69	0	packages/contracts/src/developer-connectors.ts (untracked)
30	0	packages/contracts/src/local-accounts.ts (untracked)
79	0	packages/contracts/src/servix-deployment.ts (untracked)
20	0	packages/contracts/test/auth-cookies.test.ts (untracked)
45	0	packages/contracts/test/deployment-change.test.ts (untracked)
77	0	packages/contracts/test/deployment-settings.test.ts (untracked)
```
