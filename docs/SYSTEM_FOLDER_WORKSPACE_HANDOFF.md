# System folder workspace correction handoff

Status: PASS for the bounded owner-reported corrections, deployed and verified
on server20 on 2026-10-24. Phase 4 exit remains open.

Repository: `D:\FREVOS`; worktree `.local/worktrees/servix-dashboard`.
Branch: `feature/system-folder-workspace`.
Base: `fd89278b8484d76fe9d291bbc191ec6bc5d7e812`.
Published source: `69dd69e12649d30e9c63a453cb526ea373b17a10`.
Manifest: `a30bff2988d37f665b69457d5c699e06ec2c374e5f0746e5a6030914a69b3f7a`.
Archive: `2903bf2057ed46fd09398908c30e7b3493105a9497ba7dec22f5ab8754645cf5`
(131,346,977 bytes; 3,899 sealed files).
Configured request: `pr_9a274c715407920b4ab1d1e9bad15b83`, succeeded.
Build: `cj_20517a0e4daa908820ef7c6a2e26da66`, succeeded.
Independent destination: `cj_e6edba392191699b91ee4020d0a10845`, succeeded.
Final result-documentation edits remain in this working tree after publication;
they are not claimed to be part of that deployed source commit.
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
| `node .local/system-folder-deploy.cjs deploy native-system-folders` | Exit 0; actual authenticated UI publication, isolated frozen install/full CI/build, sealing, independent SYSTEM activation and active-manifest readback pass. Fresh backend coverage: statements 95.13%, branches 91.14%. |
| `node .local/component-copy-native-release.cjs native-system-folders` | Exit 0; successful build receipt matches deployed archive and manifest. |
| `node .local/component-native-receipts.cjs native-system-folders` | Exit 0; independent Apply PASS, HTTP/UI 200, siblings preserved, databaseWritten false, private rollback backups retained. |
| `node .local/Test-DiscoveryArtifact.mjs .local/system-folder-candidate-release.json final` | Exit 0; the exact subsequently activated manifest starts with packaged Node 24.19, isolated PostgreSQL, authenticated Discovery/maintenance/account APIs, installer hashes and Zod 4.6.6. No live database changes. |
| `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File .local/Upgrade-SystemFolderSources.ps1 -Action Plan` with the sealed package/hash | Final exit 0 for both enrolled sources; nine sidecars each, pinned Node and existing pairing/task scope verified. Initial plan correctly refused an older Servix picker; see the provenance resolution below. |
| Same source helper with `-Action Apply` | Exit 0; nine sealed sidecars installed on each existing source, exact DPAPI pairing bytes and Limited/Interactive task definitions preserved; owned workers restarted, private backups retained. |
| `node .local/system-folder-linux-archive.cjs` | Exit 0; actual deployed Linux archive has 2,464 entries, new folder helpers match the sealed manifest, runtime/installer executable modes correct and no archive links. Archive SHA-256 `b2bb0beb4c6b9c506dd7e543ed34da04e6e524f8f25edac2807f4d51d0bd6026`. |
| `node .local/system-folder-live.cjs` | Exit 0; actual live UI has one machine/two bindings, browses D: through `.local/worktrees/servix-dashboard`, saves D: priority at policy revision 2 with content history still disabled, and discovers generic `apps/control-center` and `apps/control-plane` candidates. Configure services opens; no real backend/start or environment save submitted. Widths 1366/768/390 and inner/page overflow checks pass; screenshots visually reviewed. Zero unexpected browser errors; existing internal HTTP COOP warning retained. |
| `node .local/system-folder-preservation.cjs stop`, then `resume`, then `verify` | Each exit 0. Fresh baseline had zero running local services; none were started. Eleven environment file hashes, three profiles, two component configurations and Servix deployment identity remain unchanged. |
| `node .local/system-folder-final-os.cjs` | Exit 0; all eighteen installed sidecar hashes match, both Limited/Interactive source tasks running, ports 3000/5000 not listening as before, all configured local services stopped as before, four pre-existing local infrastructure containers healthy. |
| `pnpm.cmd run validate:repo` | Exit 0; 84 Markdown files pass repository validation after final result-documentation edits. |
| `git diff --check fd89278b8484d76fe9d291bbc191ec6bc5d7e812` | Exit 0; complete base-to-result diff reviewed, including the two final documentation changes. |

Exact source upgrade commands, executed from the worktree:

```powershell
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File .local\Upgrade-SystemFolderSources.ps1 -Action Plan -PackageRoot D:\FREVOS\.local\native-releases\servix-release-39bae3ad8bb143bf9ffbb23e64e02b03\package -ManifestSha256 a30bff2988d37f665b69457d5c699e06ec2c374e5f0746e5a6030914a69b3f7a
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File .local\Upgrade-SystemFolderSources.ps1 -Action Apply -PackageRoot D:\FREVOS\.local\native-releases\servix-release-39bae3ad8bb143bf9ffbb23e64e02b03\package -ManifestSha256 a30bff2988d37f665b69457d5c699e06ec2c374e5f0746e5a6030914a69b3f7a
```

The initial source plan detected that Servix still had a legacy picker omitted
from the preceding source-sidecar upgrade. Its SHA-256
`76451659c79ff7711f2dbbbf58ab1ee6f14ebbd38ecd78c7610b9963b2f59978`
and complete diff matched the retained sealed source
`bc4530746c01269b3795a25edad63efad9364b9f`, manifest
`9f3ba5d706f53d3b143a765124320b36d3476721b3d71cfa4e5726c819b43252`.
The reviewed operator plan accepts that exact module only for the existing
Servix source; other drift still fails closed. Both sources now carry the same
current sealed picker. No credential, enrollment or project binding was replaced.

Local evidence: `.local/components-native-system-folders-{request,result,verified,release,operator}.json`,
`.local/system-folder-sources-{plan,apply}.json`,
`.local/system-folder-live-verified.json`, `.local/system-folder-final-os.json`,
`.local/system-folder-linux-archive.json` and `.local/system-folder-artifact-smoke.log`.
Private operator/source backups remain local; evidence does not expose secrets.

## Owner navigation

Open `http://10.9.69.20/systems/discovery` and refresh any old browser tab.
Systems shows one L-1770 card with separate DevSetu and Servix project bindings.
Browse folders opens a drive/project selector; choose D: and navigate child folders.
Tracking settings supports folder selection and explicitly saved priority folders.
D: is now prioritized on the already-enabled DevSetu source; text history remains
off and the existing watch limits/consent remain visible.

Use Local preview & services on a project binding, or the matching deployment's
preview link, then Configure services. Nested DevSetu frontend/API candidates are
available as well as existing Servix services. Configure the appropriate local
environment before starting a backend. Existing Start/Stop/Restart and environment
CRUD remain generic; a detected candidate does not prove its database is configured.

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
Production remains excluded. Configured server20 rollout and live readback pass;
the next work is a separately scoped pilot/reliability or roadmap gate, not an
implicit Phase 4 exit or authorization to start Phase 5.

<!-- system-folder-inventory -->

## Complete changed-file inventory

Base to current working tree: 39 files, 2568 insertions(+), 213 deletions(-). The preceding Discovery result documentation is preserved. Final source identity and any later result-documentation edits are reported above.

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
