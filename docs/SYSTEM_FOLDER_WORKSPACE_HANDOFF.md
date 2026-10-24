# System folder workspace correction handoff

Status: FAIL until configured rollout and final live acceptance complete.
Implementation checks pass; no correction is declared live yet.

Repository: `D:\FREVOS`; worktree `.local/worktrees/servix-dashboard`.
Branch: `feature/system-folder-workspace`.
Base: `fd89278b8484d76fe9d291bbc191ec6bc5d7e812`.
Resulting source commit/artifact/request: pending configured publication.
Pull request: none; no default-branch push or merge is authorized.
ADR: [0056](adr/0056-system-folder-workspace.md). Phase 4 exit remains open.

## Reproduced owner defects

Authenticated live Playwright reproduced two L-1770 cards for the two project
connectors, no folder browser in tracking settings, rejection of an absolute
D: path in project-relative content inputs, and no DevSetu service candidates.
The project chooser also had a real generic central-repository defect: after
saving its private config it dereferenced that cleared object to build proof.

## Bounded correction

- The source reports a workspace/server/account-salted digest of its OS
  installation identifier; the raw identifier is never transmitted. Discovery
  groups presentation by authenticated account/status and reported identity,
  with separate project bindings and per-project preview/activity/settings.
  Unavailable identity never falls back to hostname matching. Historical sources
  remain retained and can be shown explicitly.
- Directory metadata uses authenticated, actor/device/root/expiry-bound durable
  jobs. Browse immediate child folders, navigate drives/project roots, paginate
  and reject stale pages. Agent independently validates roots and local consent.
  Windows holds non-delete-sharing directory handles and rejects reparse points;
  Linux uses descriptor-relative O_NOFOLLOW traversal and rejects mount escapes.
  No file content, shell command or filesystem mutation is exposed by browsing.
- Directory navigation is independent from the continuous watch budget. Its
  exclusions protect credential/agent directories and links; it does not wrongly
  inherit file-content/cache exclusions such as `.local/worktrees`.
- Content folders can be chosen within the verified project. Priority folders
  can be chosen from approved roots and use the finite watch budget first.
  Configuration stays revisioned and does not silently enable capture.
- The existing folder-binding action accepts a completed authorized browse
  reference, then verifies the selected Git checkout against its registered
  repository identity. Windows preserves DPAPI pairing; Linux preserves owner
  and private configuration permissions. In-flight choices are immutable and
  contradictory success/error reports are rejected. The cleared-config proof
  bug is fixed; specific safe errors replace opaque failures where available.
- Service discovery now walks bounded nested source folders, reusing existing
  npm/.NET recipes and safeguards. Defaults: depth 4, 512 directories, existing
  24-candidate/12-service caps. Optional `devsetu.local.json` accepts version 1,
  maxDepth 1–8, maxDirectories 8–4096 and up to 64 literal relative contexts.
  Links and paths outside the project are rejected. No new project names,
  laptop names, drive letters, port bindings or DB credentials are hardcoded.
- Every deployment/project binding has a project-scoped local preview link;
  service configuration, Start/Stop/Restart and environment editing remain generic.
  A detected backend still requires its valid database environment. Production
  profiles remain verified read-only; no customer backend is started for tests.

## Observed validation

| Command/evidence | Observed result |
| --- | --- |
| `.local/system-folder-reproduce.cjs` | Exit 0; actual old live UI defects recorded in `.local/system-folder-before.json`. |
| `pnpm.cmd run ci` (`.local/system-folder-ci-final.log`) | Exit 0; 282 tests, all required gates; backend statements 95.13%, branches 91.08%; frontend API/experience/routing 100%. Audit: 5 low/6 moderate, no high/critical. |
| First full CI (`.local/system-folder-ci.log`) | Tests passed but statement coverage 94.95% missed 95%; meaningful expiry/cleanup and choice-integrity tests closed the gap. No gate was weakened. |
| `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File deployment/servix/Test-RepositoryPicker.ps1` | Exit 0; actual DPAPI/Git regression, generic central proof, credential/Git preservation, expiry/origin/root/replay checks pass. |
| Store/runtime focused tests | Exit 0; owner/root/expiry/result scope, durable requests, stale page, traversal, link denial, nested npm/ASP.NET discovery and configured contexts pass. |
| `.local/folder-runtime-probe.cjs` | Exit 0; actual D: returned 18 folders and rejected parent traversal. |
| `.local/system-folder-browser.mjs` | Exit 0; real isolated PostgreSQL, two paired Windows workers, actual D: navigation, one system/two projects, content/priority choices, generic DPAPI selection, nested localhost npm Start/Stop, 128-folder pagination and desktop/tablet/mobile controls. Zero browser errors. |
| Mobile visual review | Initial screenshot exposed inner horizontal clipping despite page-level checks. Grid/select/list widths were corrected; a new inner-scroll-width assertion and visually reviewed 390 screenshot pass. |
| `.local/run-system-folder-linux.ps1` | Exit 0; actual Debian kernel 6.1/Node 24.19/Python 3.11: directory pagination, stale page, links/pseudo-mount rejection, installation identity, nested discovery and private Git-folder switch with credential/mode preservation pass. |
| `.local/system-folder-metadata-test.log` | Exit 0; ordinary `.local/worktrees` metadata navigation is allowed while credential directories, links and files remain protected. |
| Fresh live preservation capture/verify | Exit 0; 11 environment hashes, 3 profiles, 2 pipelines and existing customer deployment preserved. |

An infrastructure-only rerun failed before app startup: Docker/runc could not
start or exec processes. Read-only diagnosis found approximately 16,050 defunct
TLS helper children. A targeted local proxy restart returned engine HTTP 500;
Docker Desktop restart then restored the four existing local DevSetu containers
healthy, including PostgreSQL readiness. Existing volumes/configurations were
retained; no database credentials, schema or application settings were changed.
Server20/VPN remained reachable. The proxy health-check/reaper configuration is
a separate follow-up; this correction does not claim to fix its recurrence.

## Scope limits and readiness

This groups reported installations for presentation; it is not hardware
attestation, a global cross-user CMDB or a migration to one multi-project worker.
Existing authenticated project pairings remain separate. Folder browsing lists
accessible metadata lazily and does not promise complete continuous drive history.
Watch limits, permissions, overflow, retention and audit attribution remain
explicit. Text history stays within the selected verified project.

Current installers support Windows and Linux x64. This correction's Linux
execution was tested on Debian; other distribution-specific desktop policies,
arm64 and SDK 9/10 project acceptance retain their earlier limitations. Native
destination activation remains Windows-only. Existing compatibility adapters
stay explicit; no new customer-specific executable condition is introduced.

IMAP/API ingestion, automatic notices, employment actions and the eventual
chatbot/delivery-management vision remain follow-on phases. No real client/PO
completion is fabricated, no real environment save is submitted and server21
Production remains excluded. Final configured rollout/live readback is pending.

<!-- system-folder-inventory -->

## Complete changed-file inventory

Base to current working tree: 39 files, 2489 insertions(+), 213 deletions(-). The preceding Discovery result documentation is preserved. Final source identity and any later result-documentation edits are reported above.

- `apps/control-center/src/ComponentDeployments.tsx`
- `apps/control-center/src/DeploymentSettingsPage.tsx`
- `apps/control-center/src/DeploymentsPage.tsx`
- `apps/control-center/src/DiscoveryPage.tsx`
- `apps/control-center/src/FolderBrowser.tsx`
- `apps/control-center/src/LocalDevelopmentPage.tsx`
- `apps/control-center/src/api.ts`
- `apps/control-center/src/discovery-systems.ts`
- `apps/control-center/src/styles.css`
- `apps/control-center/test/discovery-api.test.ts`
- `apps/control-center/test/discovery-systems.test.ts`
- `apps/control-plane/src/developer-connectors.ts`
- `apps/control-plane/src/server.ts`
- `apps/control-plane/src/system-discovery.ts`
- `apps/control-plane/test/system-discovery-runtime.test.ts`
- `apps/control-plane/test/system-discovery.test.ts`
- `apps/control-plane/test/system-folders-runtime.test.ts`
- `deployment/server20/New-ServixDashboardRelease.ps1`
- `deployment/servix/Browse-Folders.ps1`
- `deployment/servix/Browse-Folders.py`
- `deployment/servix/Choose-Repository.ps1`
- `deployment/servix/Connector.cjs`
- `deployment/servix/DiscoverySafety.cjs`
- `deployment/servix/FolderBrowse.cjs`
- `deployment/servix/LocalDevelopment.cjs`
- `deployment/servix/New-ConnectorDownload.ps1`
- `deployment/servix/RepositoryPicker.psm1`
- `deployment/servix/Setup-Connector.ps1`
- `deployment/servix/Setup-Linux.cjs`
- `deployment/servix/SystemDiscovery.cjs`
- `deployment/servix/SystemPrerequisites.cjs`
- `deployment/servix/Test-RepositoryPicker.ps1`
- `docs/CURRENT_STATE.md`
- `docs/SYSTEM_DISCOVERY_HANDOFF.md`
- `docs/SYSTEM_FOLDER_WORKSPACE_HANDOFF.md`
- `docs/adr/0056-system-folder-workspace.md`
- `docs/adr/README.md`
- `packages/contracts/src/developer-connectors.ts`
- `packages/contracts/src/system-discovery.ts`
