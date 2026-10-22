# Servix saved-release rollback handoff

Date: 2026-10-21 (IST).
Status: PASS - live rollout, two rollback/restore cycles and final independent verification.

## Scope and repository

Worktree: `D:\FREVOS\.local\worktrees\servix-dashboard`.
Branch: `feature/servix-release-rollback`.
Base/resulting Git commit: `bc4530746c01269b3795a25edad63efad9364b9f` (unchanged).
The existing owner-authorized deployment/connector work was preserved on this
dedicated continuation branch. No FrevOS commit, GitHub push, PR or merge occurred.
The owner explicitly requested repeatable rollback and deployment afterwards;
[ADR 0041](adr/0041-servix-saved-release-rollback.md) records this bounded extension.
Phase 4 exit and generic project/production readiness are not claimed.

## User behavior

- Rollback previous build restores the previous distinct successful saved build.
- Restore this build in history activates a selected retained successful build.
- Every operation has its own request/history record and Currently deployed marker.
  An artifact can be selected repeatedly; it is not consumed by an operation.
- Restore requires server20/21 connectivity, not laptop publication or a rebuild.
  Normal Deploy still publishes the current laptop source and builds it. Rollback
  never resets the laptop checkout, Git branch or server20 source ref.
- Progress/spinner/elapsed time and disabled actions cover the full operation.
  Definitive HTTP rejections can be retried with current selection; unconfirmed
  network responses retain their original request ID.

## Implementation and safety

The strict restore contract accepts deployment IDs, operation, confirmation and
expected current deployment only. Workspace/project-write authorization, session
CSRF, actor-bound idempotency, stale-current checks, target serialization and
fresh expiry precede activation. Missing/modified artifacts are rejected.

The controller resolves each restore to its original immutable build. The SYSTEM
runner verifies successful private target receipts, digests and current-release
identity. A SYSTEM-owned active-release pointer is published after target health
and preservation checks. Legacy deployments bootstrap from a successful private
receipt and the exact installed-file hashes. An uncertain activation cannot be
replayed and blocks later operations until reconciled.

The existing source-only operator validates both manifests before stopping its
owned development task. Replacement and deletion preimages share its write-ahead
journal. It removes only previous-manifest code files with matching installed
hashes; recovery restores removed files as well. Uploads, environment/database
files, credentials, untracked files and `D:\Servix` production are excluded.
Database contents/schema and installed dependencies are not rolled back. The
existing development SQL bootstrap may run during restart; no database row-level
preservation or database rollback claim is made.

## Executed validation

- `pnpm.cmd run ci`: exit 0, 210 tests (73 contracts, 71 UI/API, 66 control plane),
  required coverage, lint/types/build and audit with no known vulnerabilities.
  Evidence: `.local/rollback-ci.log`.
- Additional UI regressions brought its suite to 73 passing tests: stale
  current-release/poll handling and definitive HTTP rejection metadata.
  `.local/rollback-ui-test.log`. There are 212 distinct passing tests across the
  suites. The saved-release fixture additionally verifies that normal Deploy
  after rollback pins fresh source and binds the prior restored deployment.
  `.local/rollback-fresh-deploy-test.log`.
- `Test-ReleaseRestore.ps1`: exit 0; three native A/B cycles, obsolete managed-file
  deletion/recovery, installed drift rejection before mutation and protected file
  preservation. `.local/rollback-native.log`.
- Artifact checks: exit 0; exact digests, bounded delta, migration denial and
  PowerShell syntax/reserved-variable checks. `.local/rollback-artifact.log`.
- Server20 Plan/Apply: PASS; no database writes/import or migration, sibling IIS
  sites preserved, HTTP health/UI 200 and temporary operator tasks removed.
  `.local/rollback-plan.log`, `.local/rollback-apply.log`.

## Live artifact and operations

Active FrevOS manifest:
`dbc684cda657bbc419d46ac81683e20c71c2d9e1754eb32ae339e39c9362b8f7`.
Previous: `2a266bf025f81b078b670647d06d7b299724fe313fba217b9d3667c54b76a915`.
Archive SHA256: `544b39c607d2569ba8caee0435d40c8142689f6a85917bb52f473ee7871efc92`.
Payload: 3,678 files. Correlation: `1266f770df1146d3b810d5317add58e2`.

All live requests came from the visible dashboard, returned HTTP 202 and reused
existing builds without invoking source publication or a build:

| Operation | Request | Original saved build | Result |
| --- | --- | --- | --- |
| Rollback | `sd_8d51b3839ee0bbad99de7a778d404bae` | `sd_687909fa451dbaab74c23c522647c564` | Succeeded |
| Restore current build | `sd_34b7abd052dbcf36e0c06fbca9148423` | `sd_8aa86bca8f6eb124373a34af559b6f09` | Succeeded |
| Repeat rollback | `sd_301491652b2ab406deac98bc4be3e36b` | `sd_687909fa451dbaab74c23c522647c564` | Succeeded |
| Repeat restore | `sd_6ca6622c94e5c206f8f9da629b72812e` | `sd_8aa86bca8f6eb124373a34af559b6f09` | Succeeded |

First rollback independent readback verified all 104 old code files, absence of
four obsolete tracked files, 145 persistent files preserved, production listener
and IIS unchanged, healthy full bootstrap and old frontend `main.95eaa35a.js`.
Both restores returned `main.cdee177f.js`. Final independent readback matched
all 106 current code files and confirmed two old tracked files absent, 145
persistent files preserved, production/IIS unchanged and full health ready.
Laptop HEAD, branch, working-tree status and central source ref remained unchanged.
Final active source is `bad4403be6550167e9afd842c6ca6d6b40ecf69e`, with the same
artifact as before this task. Both Deploy and Rollback re-enabled, the progress
indicator cleared and zero page errors were observed. Evidence is in
`.local/rollback-verify-*.json`, `rollback-source-preservation.json`,
`rollback-live-browser.json`, `rollback-live-controls.png`, request JSONs and private
target receipts. Existing failed deployment history was preserved.

## Limitations

Retained artifacts and the existing 1,000-record deployment history capacity
remain required; artifact/history garbage collection is a separate task. Restore
refuses incompatible installed dependencies or independent installed-code drift.
Actual rollback/restore was exercised live; a fresh normal source publication and
rebuild after rollback was verified in the production-boundary fixture, not
triggered live during this task. A failed activation's recovery path has native
file-journal coverage; a live interrupted/failed target activation was not injected.

## Changed files

The full worktree inventory includes the preceding HTTP/deployment/connector work.
No earlier work was discarded. Machine-readable inventory:
`.local/rollback-changed-files.json`.
Diff stat: 77 files, 8012 additions, 132 deletions.

<!-- BEGIN:rollback-files -->
- `apps/control-center/package.json`
- `apps/control-center/src/App.tsx`
- `apps/control-center/src/ServixDeploymentPanel.tsx`
- `apps/control-center/src/api.ts`
- `apps/control-center/src/deployment-request-id.ts`
- `apps/control-center/src/servix-deployment-state.ts`
- `apps/control-center/src/styles.css`
- `apps/control-center/test/api.test.ts`
- `apps/control-center/test/deployment-request-id.test.ts`
- `apps/control-center/test/servix-deployment-state.test.ts`
- `apps/control-plane/README.md`
- `apps/control-plane/src/config.ts`
- `apps/control-plane/src/developer-connectors.ts`
- `apps/control-plane/src/main.ts`
- `apps/control-plane/src/repositories.ts`
- `apps/control-plane/src/server.ts`
- `apps/control-plane/src/servix-deployment.ts`
- `apps/control-plane/test/connector-local-git.test.ts`
- `apps/control-plane/test/crypto-config.test.ts`
- `apps/control-plane/test/developer-connectors.test.ts`
- `apps/control-plane/test/postgres-service.integration.test.ts`
- `apps/control-plane/test/servix-deployment.test.ts`
- `apps/control-plane/test/servix-execution.test.ts`
- `apps/control-plane/test/servix-rollback.test.ts`
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
- `deployment/servix/Connector.cjs`
- `deployment/servix/DeploymentFiles.psm1`
- `deployment/servix/Import-PackageCache.cjs`
- `deployment/servix/Import-PackageCache.ps1`
- `deployment/servix/Install-ActivationRunner.ps1`
- `deployment/servix/Invoke-DevRelease.ps1`
- `deployment/servix/Invoke-DevTarget.ps1`
- `deployment/servix/New-ConnectorDownload.ps1`
- `deployment/servix/Provision-Servix.ps1`
- `deployment/servix/Publish-GitDependencies.cjs`
- `deployment/servix/Run-Activation.ps1`
- `deployment/servix/Run-Connector.ps1`
- `deployment/servix/Run-DevBackend.ps1`
- `deployment/servix/Setup-Connector.ps1`
- `deployment/servix/Setup.cmd`
- `deployment/servix/Test-ActivationFiles.ps1`
- `deployment/servix/Test-BuildProcess.ps1`
- `deployment/servix/Test-ConnectorRecovery.ps1`
- `deployment/servix/Test-ReleaseRestore.ps1`
- `deployment/servix/reused-operator.json`
- `deployment/servix/web.config`
- `docs/CURRENT_STATE.md`
- `docs/DEVELOPER_CONNECTOR_HANDOFF.md`
- `docs/SERVER20_HTTP_HANDOFF.md`
- `docs/SERVIX_DASHBOARD_HANDOFF.md`
- `docs/SERVIX_ROLLBACK_HANDOFF.md`
- `docs/adr/0038-server20-internal-http.md`
- `docs/adr/0039-server20-servix-git-dashboard.md`
- `docs/adr/0040-portable-developer-connectors.md`
- `docs/adr/0041-servix-saved-release-rollback.md`
- `docs/adr/README.md`
- `packages/contracts/src/auth-cookies.ts`
- `packages/contracts/src/developer-connectors.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/servix-deployment.ts`
- `packages/contracts/test/auth-cookies.test.ts`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
<!-- END:rollback-files -->
