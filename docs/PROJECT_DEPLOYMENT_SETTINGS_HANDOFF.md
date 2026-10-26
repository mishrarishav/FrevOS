# Project deployment settings handoff

Date: 2026-10-21. Status: PASS for the bounded settings/source-onboarding scope.

Repository: `https://github.com/mishrarishav/FrevOS`.
Checkout: `D:\FREVOS\.local\worktrees\servix-dashboard`.
Branch: `feature/project-deployment-settings`, stacked on the prior uncommitted
Servix deployment/connector/rollback work. Base and unchanged HEAD:
`bc4530746c01269b3795a25edad63efad9364b9f`. No commit, push, PR or merge.

## Result and scope

`/deployments/setup` is a workspace-authenticated setup page with saved project
selection, source defaults, destination information, literal preserved paths,
environment policy, connector download/status, actual connected source folder,
Save configuration and Test connection. Deployments links to this page.

Settings live under `E:\FrevOS\servix\jobs\configuration`; owner-only saves use
strict contracts, compare-and-swap revisions and immutable prior/new snapshots.
There are no plaintext secret fields or command editors. Source installation
defaults are separate from the device's actual chosen Git checkout; different
developers/laptops can choose different folders for the same repository.

The Windows installer authenticates the developer, lists authorized workspace
project profiles, opens a project/folder picker and pairs a Limited per-user task.
Its downloadable ZIP includes the existing pinned Node runtime and a shared
preservation module. Credentials remain CurrentUser DPAPI-protected. Diagnostic
heartbeats report actual repository root, credential-free origin, HEAD and branch;
proof expires independently of ordinary device presence. Unknown/stale origins,
revoked devices and other-project devices cannot publish Servix source.

Preservation is snapshotted with each deploy/restore request. The source publisher
skips configured paths and mandatory sensitive/runtime paths using literal Git
exclusions; pre-staged protected changes are rejected without silently resetting
the user's index. Build packaging excludes preserved paths. Activation filters
both replacement files and previous-manifest obsolete files, inventories custom
existing persistent content before stopping the backend, and verifies hashes
after health/recovery. Mandatory protection cannot be removed from the form.
Previously retained immutable artifacts stay usable; current/saved policy is
applied to restoration as well. Code rollback never reverses database state.

## Executed validation

- `pnpm.cmd run ci`: PASS, exit 0, 223 tests (75 contracts, 75 UI, 73 backend),
  required coverage, types, formatting/lint, build and audit; no known dependency
  vulnerabilities reported. Log: `.local/settings-ci-final.log`.
- The extended actual-Git fixture passed separately after its last assertion
  update: tracked/untracked attachments excluded from publication, existing
  staged protected data rejected without changing HEAD/index, ignored uploads,
  hook execution, Git bundle import and other-folder clone behavior retained.
  Log: `.local/settings-git-final.log`.
- Native `Test-Preservation.ps1`: PASS, actual files protected through three
  replacement/obsolete-removal/recovery iterations, case-insensitive exact
  matching, sibling path not excluded, invalid paths rejected.
- Native `Test-ReleaseRestore.ps1`: PASS, three A/B restore/recovery cycles,
  exact owned deletions, drift denial and existing data preservation.
- Final documentation checks: `pnpm.cmd run validate:repo` PASS, exit 0
  (57 Markdown files); `git diff --check` PASS, exit 0.
- Disposable real PostgreSQL HTTP integration covers authentication, workspace
  scope, owner/developer permissions, CSRF, strict input, revision conflict and
  fixed-target health parsing. The native PostgreSQL 18.4 fallback also passed;
  it substitutes container lifecycle only and runs the same real database work.
  These duplicate executions are not counted as additional tests.

Docker/WSL initially exhausted processes (16,028 observed zombies); new containers
and exec failed. Before the bounded local sandbox restart, running containers were
verified as `frevos-local`, working directory `D:\FREVOS`, with unchanged existing
IDs/images and `unless-stopped` policy. Volumes were retained. All four local
services returned healthy and standard container-backed CI subsequently passed.
No Docker Desktop restart on a destination server was performed.

## Live acceptance

The sealed artifact passed validation and server20 Plan/Apply, exit 0. HTTP health
and UI returned 200; sibling IIS sites were preserved, no database import or
migration ran, private rollback backups were retained and the temporary operator
task was removed. Manifest:
`9fee2a44ad957674e44745dabd44429205f69e141cff9500ab6e77a1edea7eee`.
Archive: `2c54154710aad7d39ad708cbec16d0775445bc6f1f3814349e389cd6be33d098`.
Correlation: `9ea69c5e21c641198eb0f48c059e7f6c`. Logs:
`.local/settings-artifact-tests.log`, `.local/settings-plan.log`,
`.local/settings-apply.log`.

Authenticated headful Edge opened `http://10.9.69.20/deployments/setup`.
Save configuration persisted revision 2 with the additive literal rule
`backend/attachment`; a full reload retained it. Test connection passed all four
checks: owner laptop L-1770 online, actual source `D:\servixDev` on
`feature/server21-servix-dev-preservation`, approved destination heartbeat/hosted
health and five saved preserved paths. Test was disabled while edits were unsaved.
Add project exposed editable source/destination fields and explicitly showed
destination runner not connected; that draft was discarded, without creating a
dummy project. Creation/persistence of custom profiles is covered by the real
PostgreSQL integration suite rather than this live UI acceptance.

The existing owned Limited connector task was upgraded from its verified prior
client, retaining the task configuration and DPAPI credential bytes, with a local
backup. Its new repository diagnostic heartbeats are live. The HTTP installer
download returned 200, matched the sealed artifact digest
`4f5649f9113b7ac93c7f908815c03955d7faf82233adcc4a7a189e2674721474`
and contained eight expected flat files, including `Preservation.cjs`.
Desktop and 390-pixel browser viewport screenshots were inspected; the mobile
document had no horizontal overflow. Evidence: `.local/settings-live-desktop.png`,
`.local/settings-live-mobile.png`, `.local/settings-connector-upgrade.json`,
`.local/settings-live-acceptance.json`.

No customer-app Deploy or Rollback was clicked. Fresh before/after readback kept
current request `sd_a78d33690ccdf8db2db2a54df6a29237`, source
`58e9359012b2326f9c627379c865157ae18c3835`, and idle execution unchanged.
The user had published this newer source while the task was in progress; older
handoff descriptions of active Servix code are historical. No server21 deployment
or production-path access was needed for acceptance. A new customer-app deployment
using revision 2 has not been executed; preservation activation is verified by the
native filesystem regression workflows, not claimed as a new live deployment.

## Limitations

This adds project configuration and source onboarding; it does not create a new
generic remote deployment engine. The existing Servix Windows/IIS + Node adapter
retains its exact approved server21 development target. Other project profiles
can be saved and paired, but show destination not connected and cannot deploy
until an applicable adapter is connected. The page does not claim otherwise.

Connection testing checks fresh source evidence, server20 runner heartbeat and
the fixed server21 hosted HTTP health. It does not perform a fresh WinRM login,
write probe, build or deployment, and is not a guarantee of a later release's
success. New destination credentials, arbitrary targets, Production, database
migrations, automatic dependency installation and environment-secret editing
remain outside this bounded capability. Server environment files are preserved;
the existing development runtime overrides are displayed explicitly.

The installer requires one local user action after extraction; a browser cannot
silently install a Windows background connector. Native installer dialog manual
acceptance on a newly invited developer account remains unverified. Actual native
file operations and live browser checks are reported separately from that scope.

Ready for the owner to use the Servix settings page and existing deployment flow.
Generic destination adapters remain a separate bounded task; this does not close
Phase 4 or establish whole-product readiness.

## Complete working-tree inventory

The inventory includes prior preserved work as well as this task, not a new commit.
Diff stat: 89 files, +10361/-134 lines.

<!-- BEGIN:settings-files -->

- `apps/control-center/package.json`
- `apps/control-center/src/App.tsx`
- `apps/control-center/src/DeploymentSettingsPage.tsx`
- `apps/control-center/src/ServixDeploymentPanel.tsx`
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
- `deployment/servix/Preservation.cjs`
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
- `deployment/servix/Test-Preservation.ps1`
- `deployment/servix/Test-ReleaseRestore.ps1`
- `deployment/servix/reused-operator.json`
- `deployment/servix/web.config`
- `docs/CURRENT_STATE.md`
- `docs/DEVELOPER_CONNECTOR_HANDOFF.md`
- `docs/PROJECT_DEPLOYMENT_SETTINGS_HANDOFF.md`
- `docs/SERVER20_HTTP_HANDOFF.md`
- `docs/SERVIX_DASHBOARD_HANDOFF.md`
- `docs/SERVIX_ROLLBACK_HANDOFF.md`
- `docs/adr/0038-server20-internal-http.md`
- `docs/adr/0039-server20-servix-git-dashboard.md`
- `docs/adr/0040-portable-developer-connectors.md`
- `docs/adr/0041-servix-saved-release-rollback.md`
- `docs/adr/0042-project-deployment-settings.md`
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

<!-- END:settings-files -->
