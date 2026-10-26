# System connector, accounts and platform update handoff

Date: 2026-10-22. Status: PASS for the bounded server20 pilot.

Repository: `https://github.com/mishrarishav/FrevOS`.
Checkout: `D:\FREVOS\.local\worktrees\servix-dashboard`.
Branch: `fix/system-connector-and-account-controls`, stacked on preceding
uncommitted work. Base and unchanged HEAD:
`bc4530746c01269b3795a25edad63efad9364b9f`. No commit, push, PR or merge.

## Changes

The selected stored project owns form identity separately from its editable ID.
Dirty state compares the opening snapshot, including blank defaults. X/Escape
closes a clean form; modified forms offer Keep editing or Discard and close.
The editor's single content scroller uses normal flow, preventing the connector
panel from shrinking to its heading. The name is System connector. Its installer
download keeps the compatible URL and uses a DevSetu System Connector filename.

The persistent Account button exposes logout, own password change and server20
owner user management. The owner can list workspace-local accounts, reuse existing
developer invitations, and reset an account after confirming the owner's password.
Passwords remain salted scrypt hashes; only typed fields can be revealed locally.
Old stored passwords are never returned. Password replacement rechecks the active
session and credential digest under transaction locks, preserves membership and
unrelated accounts, clears target lockout and ends the target's browser sessions.
The confirmed form action creates a one-use, actor/session/workspace/target-bound,
one-minute audit approval; password values/hashes are absent from audit records.
No schema migration is added. No live account password is changed for acceptance.

The server20 platform updater is independent from the restarting control plane.
Only the authenticated server20 owner can submit a CSRF-protected request for the
exact prepared candidate. Candidate/worker/approval files are admin/SYSTEM-owned;
the runtime can publish request files and read results. A SYSTEM task checks fixed
target, script/candidate/archive digests, previous release, expiry and scoped
single-use approval before using the existing activation/recovery boundary.
Claims/results retain identity across restart and prevent replay. No caller path
or command is accepted. The maintenance page shows elapsed time and reconnects
across a web-process restart; Deploy remains disabled while a request exists.

One bootstrap is required because the previous release has no self-update worker
or endpoint. The bootstrap retains the prior UI/account composition, with its main
composition explicitly derived from the previous sealed main and its stale source
map directive removed. The final fixes are a separate sealed artifact intended
for activation through the real application's Deploy DevSetu button. This is a
prepared-artifact activation pilot, not automatic publication/build of arbitrary
future laptop changes. The older root-worktree maintenance prototype is untouched.
[ADR 0045](adr/0045-account-controls-and-platform-update.md) records scope.

## Executed local checks

- `pnpm.cmd run ci`: PASS, exit 0, 232 tests (75 contracts, 78 UI, 79 backend),
  required documentation, formatting, lint, types, coverage, build and high-severity
  dependency audit gate. `.local/controls-ci.log`.
- UI API/experience/routing coverage: 100%. Backend statements 95.08%, branches
  90.29%, functions 98.82%, lines 96.11%. Thresholds/assertions were not weakened.
- Audit reports two moderate advisories; the high-severity gate passed. No new
  dependency or unrelated dependency upgrade was introduced; no full security scan.
- Real disposable PostgreSQL/HTTP integration covers metadata, CSRF, owner/member
  authorization, other-workspace concealment, strict reset bodies, wrong current
  password, reset/self-change, old-password rejection, all target-session revocation,
  unchanged unrelated credentials/memberships, password-free audit and scoped update
  requests. Files: `accounts.integration.test.ts`, `self-updates.test.ts`.
- Exact bootstrap/final artifacts passed manifest/file integrity, bounded delta,
  wrong-digest/migration-change denial and PowerShell parser/reserved-name checks.
- Both exact packaged native entry points passed disposable-DB smoke using their
  packaged Node 24.19.0: HTTP login, health, real maintenance page/external CSP-safe
  assets, scoped candidate request persistence, account composition and logout.
  `.local/controls-bootstrap-retry-artifact.log`,
  `.local/controls-final-corrected-artifact.log`.
  An initial smoke sent a JSON Content-Type with an empty logout body; the driver
  was corrected to the actual client contract. No production assertion or artifact
  was changed for that test correction.
- Headful isolated browser fixtures verified untouched Add closes immediately,
  edited X/Escape requests discard confirmation, Keep editing retains input,
  Discard and close performs no save, and System connector download remains
  reachable with a visible fixed header at 1920x950, 1366x768, 768x1024 and 390x844.
  No document overflow. Reset mismatch, typed-password reveal/hide, clearing inputs,
  scoped reset request and logout were checked with synthetic data only.
  `.local/controls-browser-preview.json`, `controls-system-connector-preview.png`,
  `controls-users-preview.png` under `.local/`.
- Isolated production maintenance view submitted exactly one request, disabled
  Deploy, displayed elapsed/reconnecting status through two simulated 503 polls
  and recovered to success. This is browser behavior, not live updater execution.
  `.local/controls-maintenance-preview.png`.

## Artifacts and live acceptance

Previous live manifest:
`b9f712eeee3942f29b7ad9edf827c52377b87b95cde6a641aeda7d43f228c325`.

The first bootstrap `e53a58d8` failed while creating updater ACLs: assigning a
different actor as the directory owner exceeded the executing principal's native
authority. Existing recovery restored the previous application; no database write
or maintenance directory was left. Correlation `dc48205268ee4fd084a85f2008a798c2`,
`.local/controls-bootstrap-apply.log`. The producing ACL factory now assigns the
execution SID as owner and separately grants the actor access. The native
`Test-SelfUpdateAcl.ps1` regression passed, including a distinct synthetic actor,
private metadata, runtime read-only results and writable requests.

Corrected bootstrap manifest:
`99fa342736ad739571dad3ce4eb964ad9ba5adcaeb048ce7ed4eb9b0543a9599`.
Archive SHA-256:
`a05fe9e6809a3b35d4646148ab137a2d35b2b401c58008655dd3e6a6b9cab385`.
Package: `.local/servix-release-49ff382157b844de8cf9edb015149056/package`.
Correlation `e44692a5e52548488f461e2439a694f9`. Plan/Apply passed, HTTP health/UI
200, databaseWritten false and sibling IIS preserved; temporary RPC tasks removed.
Actual SYSTEM ownership and LocalService permissions were read back. The old
account composition remained absent during this bootstrap, as intended.

Active final application manifest:
`2a01ac93600f5762a65750a84d6a771ef5f44a86a44e11ba8d10bab092a4eee9`.
Archive SHA-256:
`574e55c09904c896d8fbd84ec58ab9b57b19b572fac90744cc8b0cedfa53e7e8`.
Package: `.local/servix-release-5ab17016d1f74447a17a5d0451a1b79c/package`.
Correlation `e3abc937241f42269f20e06a0889f17f`.
The real authenticated `/maintenance` browser submitted exactly one POST,
request `su_6b1ad640a1f5f1624b1fefc56adce157`. Deploy disabled and elapsed time
was visible. The independent updater activated this exact artifact; health/UI
200, databaseWritten false and sibling IIS preserved. The final application was
not activated by a separate operator Apply invocation.

Application activation succeeded, but the updater's terminal result publication
initially remained at activating: native Windows PowerShell binds a null
`File.Replace` backup argument to an invalid empty path. A native production-function
journal regression reproduced the failure. The producer now uses a real private
backup path; activating, terminal, repeated and recovery transitions all pass.
A separately sealed, fresh approved worker-only repair preserved the updater task,
backed up the old worker and reconciled the original claim using its exact successful
activation receipt and active pointer. No application redeploy or database write.
Repair manifest:
`10df9212df2cb8f19098a71c6639f4cccd0395f34589dd44ad2eb7478d7562d1`.
Installed worker SHA-256:
`03caf5d33bcde7d47c5c5c0ccd17dc378d2cc3bd2226a2ec17138bad349c3dfa`.
Repair correlation `a8ad7e53bf9d4af4a0603d38c486398f`; Plan/Apply PASS in
`.local/updater-repair-plan.log` and `.local/updater-repair-apply.log`.
The active sealed application package remains unchanged and contains the earlier
worker source; the independently installed maintenance worker has the repair digest
above. Future builds must include the corrected source and pin the actual active
application digest; old candidate pins and approvals must not be reused.

The actual maintenance page reported "Update succeeded. DevSetu is healthy."
after reconciliation and again after a fresh login. Live Projects acceptance
verified clean close, dirty confirmation, Keep editing, Escape/discard without
save, accessible System connector/download and the owner account/user table.
Sign out returned the sign-in screen and `/v1/session` 401; fresh login returned
204. No live reset, password change or invitation was submitted. Download HEAD
returned 200 with `DevSetu-System-Connector-Windows.zip`; a full ZIP-body GET
exceeded a five-second test timeout, so complete network transfer is not claimed.
Live screenshots are `.local/controls-live-system-connector.png`,
`.local/controls-live-users.png` and `.local/controls-live-update-succeeded.png`.

Final independent API readback, saved in `.local/controls-final-acceptance.json`,
matched baseline Servix current request `sd_a78d33690ccdf8db2db2a54df6a29237`
and source `58e9359012b2326f9c627379c865157ae18c3835`; runner online.
Configuration revision 2 retains `backend/uploads`, `backend/database`,
`backend/.env`, `backend/.env.prd` and `backend/attachment`. The CI run preceded
the native-only ACL/journal/repair corrections; those received native regression,
parser and live verification. No TS/UI change followed that CI run. Earlier failed
and unused immutable candidates/receipts are retained for provenance.

## Limits

Customer-app Deploy/Rollback and production `D:\Servix` on server21 are excluded.
The existing Servix Git-origin allowlist mismatch is unchanged. User management
does not expose old passwords, silently promote developers to owner, or send an
invitation during acceptance. Automatic laptop source/build publication and generic
destination adapters remain outside this bounded self-activation test. No Phase 4
exit, cross-platform native acceptance or whole-product readiness claim.

## Working-tree inventory

Final documentation checks: `pnpm.cmd run validate:repo` passed (63 Markdown
files), `pnpm.cmd run format:check` passed (102 files, no fixes), and
`git diff --check` passed. Git emitted existing CRLF normalization notices only.
The owned local browser-fixture preview was stopped; the actual server20 Projects
page remains open. No staged files or resulting commit were created. Ready for
owner use of these bounded controls; the broader Phase 4 exit remains incomplete.

Snapshot includes all preceding uncommitted work, not only this task. No staging,
commit, push, PR or merge was performed. Resulting HEAD equals the base above.
Tracked diff stat is additions/deletions/path; untracked entries are new file line
counts. This handoff count is measured before appending this inventory. Full
machine-readable snapshot: `.local/controls-changed-files.json`.

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
816	2	apps/control-plane/test/postgres-service.integration.test.ts
3	0	apps/control-plane/vitest.config.ts
164	4	docs/CURRENT_STATE.md
26	0	docs/adr/README.md
5	0	packages/contracts/src/index.ts
107	88	pnpm-lock.yaml
2	0	pnpm-workspace.yaml
364	0	apps/control-center/src/AccountControls.tsx (untracked)
890	0	apps/control-center/src/DeploymentSettingsPage.tsx (untracked)
562	0	apps/control-center/src/DeploymentsPage.tsx (untracked)
85	0	apps/control-center/src/DeveloperAccess.tsx (untracked)
369	0	apps/control-center/src/RecordWorkspace.tsx (untracked)
31	0	apps/control-center/src/WorkspaceDialog.tsx (untracked)
4	0	apps/control-center/src/deployment-request-id.ts (untracked)
30	0	apps/control-center/src/servix-deployment-state.ts (untracked)
13	0	apps/control-center/test/deployment-request-id.test.ts (untracked)
101	0	apps/control-center/test/deployment-settings.test.tsx (untracked)
57	0	apps/control-center/test/servix-deployment-state.test.ts (untracked)
228	0	apps/control-plane/src/deployment-settings.ts (untracked)
571	0	apps/control-plane/src/developer-connectors.ts (untracked)
150	0	apps/control-plane/src/local-accounts.ts (untracked)
112	0	apps/control-plane/src/self-updates.ts (untracked)
646	0	apps/control-plane/src/servix-deployment.ts (untracked)
258	0	apps/control-plane/test/accounts.integration.test.ts (untracked)
201	0	apps/control-plane/test/connector-local-git.test.ts (untracked)
450	0	apps/control-plane/test/deployment-settings.test.ts (untracked)
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
152	0	deployment/server20/Verify-HttpManifest.mjs (untracked)
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
237	0	docs/PROJECT_DEPLOYMENT_SETTINGS_HANDOFF.md (untracked)
291	0	docs/PROJECT_WORKSPACE_HANDOFF.md (untracked)
150	0	docs/SERVER20_HTTP_HANDOFF.md (untracked)
232	0	docs/SERVIX_DASHBOARD_HANDOFF.md (untracked)
200	0	docs/SERVIX_ROLLBACK_HANDOFF.md (untracked)
169	0	docs/SYSTEM_CONNECTOR_ACCOUNTS_HANDOFF.md (untracked)
52	0	docs/adr/0038-server20-internal-http.md (untracked)
66	0	docs/adr/0039-server20-servix-git-dashboard.md (untracked)
60	0	docs/adr/0040-portable-developer-connectors.md (untracked)
47	0	docs/adr/0041-servix-saved-release-rollback.md (untracked)
30	0	docs/adr/0042-project-deployment-settings.md (untracked)
43	0	docs/adr/0043-project-master-and-deployment-workspace.md (untracked)
27	0	docs/adr/0044-devsetu-display-branding.md (untracked)
51	0	docs/adr/0045-account-controls-and-platform-update.md (untracked)
19	0	packages/contracts/src/auth-cookies.ts (untracked)
125	0	packages/contracts/src/deployment-settings.ts (untracked)
68	0	packages/contracts/src/developer-connectors.ts (untracked)
30	0	packages/contracts/src/local-accounts.ts (untracked)
75	0	packages/contracts/src/servix-deployment.ts (untracked)
20	0	packages/contracts/test/auth-cookies.test.ts (untracked)
52	0	packages/contracts/test/deployment-settings.test.ts (untracked)
```
