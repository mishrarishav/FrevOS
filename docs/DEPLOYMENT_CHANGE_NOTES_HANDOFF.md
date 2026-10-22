# Deployment change notes handoff

Date: 2026-10-22. Status: PASS for the bounded development pilot.

Repository: `https://github.com/mishrarishav/FrevOS`.
Checkout: `D:\FREVOS\.local\worktrees\servix-dashboard`.
Branch: `feature/deployment-change-notes`, stacked over preceding uncommitted work.
Base/unchanged HEAD: `bc4530746c01269b3795a25edad63efad9364b9f`.
No Git staging, commit, push, PR or merge. [ADR 0047](adr/0047-deployment-change-records.md).

## Behavior and scope

Deploy, rollback and history restore now open a required confirmation containing
What is changing? and Approved by / approval reference. Cancel/empty forms submit
nothing. New request contracts require validated bounded context, with control
characters rejected and multiline/Unicode changes retained. The authenticated
requesting actor is separate from the user-declared approval name/reference.
Entering a name neither verifies that person's approval nor grants permission;
the existing workspace/actor/target/artifact authorization remains in force.

Context persists in deployment records, activation approvals and source-publication
jobs. Retries for the same request cannot change it. The UI retains target/device/
context/request identity after an unconfirmed result; edited form values cannot
replace a submitted intent. Restore does not fall through to new deployment.
History renders messages as text, preserves line breaks, and identifies older runs
whose context was not recorded. No database migration or credential change.

The selected updated system connector writes the message to the actual Git commit:
subject `deploy: <first message line>`; body includes the complete changes,
Declared approval, authenticated Requested by ID and Deployment request ID.
An explicit capability heartbeat is required during preparation/claim so an old
connector cannot silently omit context. Rollback/restore changes no Git history;
its message is stored with the deployment/activation record instead.

Platform deployment also opens a context popup and displays the saved context on
the updater page. A write-once `.note` sidecar selects the request identity before
publishing the compatible seven-field native request. Racing/retried writers use
the same context or fail; existing native worker/approval scope is unchanged.
Automatic local DevSetu commit/build and platform self-service rollback remain
outside scope. Servix preservation, source allowlist and production `D:\Servix`
are unchanged. No customer deployment/restore is submitted for acceptance.

## Executed local checks

- Final `pnpm.cmd run ci`: PASS, exit 0, 234 tests (76 contracts, 78 UI, 80 backend),
  required docs/format/lint/types/coverage/build/high-severity audit gate.
  `.local/change-notes-ci.log`. Backend statements 95%, branches 90.48%, functions
  98.83%, lines 96.01%; thresholds/assertions not weakened. Two existing moderate
  advisories remain; no dependency upgrade or full security scan.
- Real Git fixture verifies complete multiline context in `%B`, ignored uploads,
  protected attachments, branch restrictions and invalid-context rejection before
  committing. Backend tests cover persistence into activation/source jobs,
  required context, changed-context retry denial, connector capability loss,
  source failures, saved-release restoration and no rebuild/publication on rollback.
  Real PostgreSQL/HTTP tests retain CSRF/workspace/owner enforcement and verify
  context-aware platform requests; old stored deployment records remain readable.
- Isolated headful browser: empty/Cancel/Escape submit zero requests; one confirmed
  Deploy has exact context; submit/close disable while busy; an aborted rollback
  request reopens with read-only retained fields and retries the exact same body.
  History displays its message. Desktop 1366x768, tablet 768x1024 and mobile390x844
  confirmations remain reachable without document overflow. Explicit input labels
  remain stable after entering text. `.local/change-notes-ui-acceptance.json` and
  `change-notes-popup-{1366,390}.png`.
- Isolated actual exported maintenance HTML/JS under production-style CSP verifies
  Cancel, immutable context after a network failure, same-body retry and displayed
  approval/message. `.local/change-notes-platform-acceptance.json` and
  `change-notes-platform-preview.png`. All fixture writes were mocked.
- Initial local checks caught formatting, lint and exact-optional-type issues;
  these were corrected. Browser fixture follow-ups corrected their deferred-handler
  release and synthetic current-release pointer; a development HMR reload required
  restarting that fixture scenario. The completed scenarios above passed.

## Release and live acceptance

Build parent is the actual active manifest
`733af5447762291037cd3da92c4d1f10d19a5486ed0df91b3f4c0feaecef65b0`.
The prepared release was activated through the preceding real dashboard's
existing updater button; its own older request has no change notes because this
feature becomes available only after activation. Fresh scoped approval was bound
to that exact artifact/action/correlation; old approvals were not reused.
The laptop connector upgrade replaced only owned `Connector.cjs`, retaining task,
pairing/credential bytes, source configuration and native folder picker.

Prepared manifest:
`a2bc92d1f5b9ce639c2fb16c2e35dfa4dc7cf91bab30884586663762655ef3e7`.
Archive SHA-256:
`703eb0a05afdd16ab50e63e04357e3464fdd1ac7cca9f3303ba298fdfadc3d05`.
Package `.local/servix-release-9e749d1383eb4921978148448fedaf6d/package`,
3,711 files; `.local/change-notes-final-release.json` is the build receipt.
Exact artifact integrity/delta, wrong digest/migration denial and native parser
checks passed (`change-notes-artifact.log`). The packaged Node24.19 entry point
passed disposable PostgreSQL/HTTP smoke, both project records, metadata save denial,
context persistence and exactly seven native request fields (`change-notes-smoke.log`).

Initial staging stopped at its private-operator ACL lookup. Fresh HTTP80/SMB445
probes and a real browser navigation all timed out. No activation job/approval or
candidate catalog was published, no dashboard POST submitted and no installed
connector update performed at that stage. The owner reconnected VPN. Before network
loss, read-only baseline `.local/change-notes-before.json` retained both project
profiles and the current Servix run/source.

After reconnect, fresh HTTP80/SMB445 and the existing browser session passed.
The exact existing package was reused, with fresh staging/Plan under correlation
`8ec7f20acb0244728107b59a4f279efb`. Staging hashes matched; authenticated SMB/RPC
Plan passed with configurationChanged/databaseWritten false and temporary task
removed. `.local/change-notes-stage-retry.log`, `change-notes-plan.log`.

The real updater button submitted exactly one POST, request
`su_e82c8c02cd1119e760438dd36a7a63ec`. The button disabled and updater returned
success. Its native Apply receipt reports PASS, HTTP health/UI200, databaseWritten
false, sibling IIS preserved and private recovery backups retained. The active
manifest is the prepared digest above. No separate operator Apply invocation was
used. `.local/change-notes-final-activation.json` identifies the private receipt.

The existing owner device `fc_b21ed71ca3f8d3ee98d4d76ea171d079` was upgraded
with installed connector SHA-256
`4302ca4b53c25d914e602cf56154595ba947639e4ff39f7b860ea619ae2b0123`.
Task and credential bytes were preserved; only `Connector.cjs` was replaced and
private backups retained. `change-notes-connector-upgrade.log` and
`change-notes-connector-upgrade.json` report PASS. A fresh API heartbeat verifies
online plus `changeNotes: true`, with source folder still `D:\servixDev`.

Live Rollback and saved-build Restore popups opened; Cancel/Escape submitted zero
customer POSTs. The live Deploy popup was not bypassed: its existing source-origin
mismatch still disables that action. The actual updater success persisted on a
fresh navigation and its new confirmation form is present; enabled platform
confirmation was exercised only in the isolated fixture, because this release's
own activation used the preceding UI. Screenshots:
`.local/change-notes-live-rollback-popup.png`, `change-notes-live-update-success.png`.
Final `.local/change-notes-live-acceptance.json` records exact project-settings
equality, unchanged Servix current request `sd_a78d33690ccdf8db2db2a54df6a29237`
and source `58e9359012b2326f9c627379c865157ae18c3835`, runner/connector online,
one platform update POST and zero customer actions. No real customer deployment,
rollback or approval name was submitted for acceptance; actual commit propagation
is verified with a disposable real Git repository. The fixture preview was stopped;
the actual deployment page remains visible. Future builds must pin the new active
digest and use fresh scoped approvals.
No Phase 4 exit, generic destination acceptance or whole-product readiness claim.

## Working-tree inventory

Final delivery checks passed: repository validation (67 Markdown files), formatting
(106 files, no fixes) and `git diff --check`. Only existing CRLF normalization
notices were emitted. Runtime source did not change after successful CI/build;
remaining edits are documentation/local operator receipts. Ready for these bounded
controls; the pre-existing Servix origin mismatch remains an independent limit.

Includes all preceding uncommitted work, not just this task. Tracked values are
additions/deletions/path; untracked entries give new line counts. This handoff
count predates this inventory and final delivery text. Machine-readable snapshot:
`.local/change-notes-inventory.json`.

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
823	2	apps/control-plane/test/postgres-service.integration.test.ts
3	0	apps/control-plane/vitest.config.ts
192	4	docs/CURRENT_STATE.md
34	0	docs/adr/README.md
6	0	packages/contracts/src/index.ts
107	88	pnpm-lock.yaml
2	0	pnpm-workspace.yaml
364	0	apps/control-center/src/AccountControls.tsx (untracked)
116	0	apps/control-center/src/DeploymentActionDialog.tsx (untracked)
927	0	apps/control-center/src/DeploymentSettingsPage.tsx (untracked)
696	0	apps/control-center/src/DeploymentsPage.tsx (untracked)
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
597	0	apps/control-plane/src/developer-connectors.ts (untracked)
150	0	apps/control-plane/src/local-accounts.ts (untracked)
169	0	apps/control-plane/src/self-updates.ts (untracked)
654	0	apps/control-plane/src/servix-deployment.ts (untracked)
270	0	apps/control-plane/test/accounts.integration.test.ts (untracked)
218	0	apps/control-plane/test/connector-local-git.test.ts (untracked)
486	0	apps/control-plane/test/deployment-settings.test.ts (untracked)
367	0	apps/control-plane/test/developer-connectors.test.ts (untracked)
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
154	0	deployment/server20/Verify-HttpManifest.mjs (untracked)
10	0	deployment/servix/ActivationFiles.psm1 (untracked)
125	0	deployment/servix/Build-DevRelease.cjs (untracked)
53	0	deployment/servix/Build-Servix.ps1 (untracked)
59	0	deployment/servix/BuildProcess.psm1 (untracked)
17	0	deployment/servix/Choose-Repository.ps1 (untracked)
554	0	deployment/servix/Connector.cjs (untracked)
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
108	0	docs/DEPLOYMENT_CHANGE_NOTES_HANDOFF.md (untracked)
304	0	docs/DEVELOPER_CONNECTOR_HANDOFF.md (untracked)
245	0	docs/DEVSETU_BRANDING_HANDOFF.md (untracked)
244	0	docs/DEVSETU_PROJECT_HANDOFF.md (untracked)
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
29	0	docs/adr/0047-deployment-change-records.md (untracked)
19	0	packages/contracts/src/auth-cookies.ts (untracked)
25	0	packages/contracts/src/deployment-change.ts (untracked)
125	0	packages/contracts/src/deployment-settings.ts (untracked)
69	0	packages/contracts/src/developer-connectors.ts (untracked)
30	0	packages/contracts/src/local-accounts.ts (untracked)
79	0	packages/contracts/src/servix-deployment.ts (untracked)
20	0	packages/contracts/test/auth-cookies.test.ts (untracked)
45	0	packages/contracts/test/deployment-change.test.ts (untracked)
52	0	packages/contracts/test/deployment-settings.test.ts (untracked)
```
