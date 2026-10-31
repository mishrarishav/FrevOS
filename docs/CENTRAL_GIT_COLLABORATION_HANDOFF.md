# Central Git collaboration

Status: **BLOCKED for publication/live rollout**. The local implementation and
isolated native workflow are available; final validation is recorded below.
No live installation, permission grant, migration or live restore is claimed.

Repository: mishrarishav/FrevOS.
Branch: codex/central-git-collaboration.
Base: e5b1122ad95323b46beab3789672d2cb6ca2d9cd.
Result commit / pull request: none.

Current commit is the base SHA; all task changes remain uncommitted.
[ADR 0076](adr/0076-configured-private-git-collaboration.md) records the boundary,
delivery sequence, preserved previous worktree's three preview corrections and
distinct live approvals. Phase 4 remains open. Generic GitHub App completion,
automatic deployment on push and GitHub/GitLab parity are outside this task.

## Native Choose folder follow-up — 2026-10-31

Status: **PASS for local Windows native selection**; publication/live rollout
remains BLOCKED by the separate gates below. [ADR 0077](adr/0077-native-code-folder-selection.md)
supersedes only the browser-only selection experience. In scope: the Code
button, typed picker jobs, connector/native helper, packaging and preservation
tests. Out of scope: Server20 activation, live connector replacement, repository
migration, permissions/secrets, push/PR/merge and customer deployments.

With one online compatible system, Choose folder directly opens that system's
OS dialog. With several systems, choose the system first, then Open folder
chooser. Browse in DevSetu remains an explicit fallback for older/headless
connectors. The UI identifies the target laptop; it does not pretend a remote
laptop's chooser is a browser upload control.

Jobs are strict version 1, actor/workspace/device-bound, expire after 90 seconds,
are claimed once, and persist intent before opening native UI. Duplicate clicks
reuse active intent; lost responses do not reopen a prompt. The connector
accepts an existing plain local project directory; drive roots, home roots,
protected/linked paths and UNC selection are refused. Completion refreshes
capability after a long human selection, conservatively requiring a subsequent
Git check before writing. Selection reads Changes without creating .git,
altering remotes, initializing a repository or publishing.

Windows uses the already packaged compiled GUI helper and Common Item Dialog.
It requires the interactive Default desktop on WinSta0 and fails closed on
locked/non-interactive desktops. A redundant SetThreadDesktop call failed with
ERROR_BUSY; checking the inherited desktop instead fixes the real popup without
switching desktops, elevating or changing Windows permissions. Linux uses a
fixed existing zenity/kdialog with a desktop session; Linux native acceptance
has not been run. Cancel, failure and expiry clear busy state explicitly.

Actual browser + Windows acceptance uses the real API client, broker, GUI helper
and read-only connector snapshot on loopback. It is visibly labelled as a local
test with publishing/live pairing disabled. Choose folder opened the real
Windows dialog, selecting a non-empty synthetic folder opened Changes with
app.js selected and .env Protected/excluded; Cancel displayed No files changed.
The selected folder retained identical source/environment bytes and no .git.
An unattended request expired without reopening. Local evidence:
`.local/git-native-folder-picker.png`, `.local/git-native-folder-changes.png`,
`.local/git-native-acceptance.json`. These ignored artifacts contain no credentials
and are not included in publication. A bounded same-user Interactive/Limited
test worker is used because CLI children lack the normal interactive context;
no production pairing or task is replaced.

New downloads compile the GUI helper from source and hash that exact compiled
output in their 14-file system manifest. The enrollment test likewise uses its
own freshly compiled helper, without relying on an untracked source-tree EXE.
The project connector capability updater has an exact three-file allowlist: Connector.cjs,
GitDesktop.cjs and FrevOS.FolderPicker.exe. It verifies reviewed manifest hashes,
JavaScript syntax / native image header, existing identity, ACLs and task proof.
Pinned system-mode runtimes instead use Update-SystemConnector.ps1 through the
existing account/setup update flow. The updater verifies the legacy 12-file or
current 14-file preimage, accepts only the exact current 14-file package, and
keeps the same device, account, credential, monitoring data and permissions.
Only the runtime manifest pin changes in the DPAPI configuration; its ciphertext
is consequently rewrapped. A failed startup restores the old files, manifest
and exact encrypted preimage, removing verified newly added helpers. Independent
unpinned additions are refused. Sidecar-only updates fail closed for system
mode. The existing pairing is retained; re-enrollment is not required. Live users need
the separately reviewed platform/connector capability rollout before using it.

Follow-up observed commands/results (exit 0 unless stated otherwise):

- `node .local/Run-GitTarget.cjs test/git-desktop.test.ts test/git-desktop-runtime.test.ts test/preview-operators.test.ts`: 3 files / 23 tests pass.
- `node .local/Run-GitTarget.cjs test/system-enrollment-windows.test.ts test/postgres-service.integration.test.ts`: 2 files / 23 tests pass, including real DPAPI/Limited task and route authorization/CSRF.
- Final broker run with `--coverage --coverage.include=src/git-desktop.ts --coverage.thresholds.statements=95 --coverage.thresholds.branches=90 --coverage.thresholds.functions=95 --coverage.thresholds.lines=95`: 11 pass; 95.55% statements, 92.44% branches, 98% functions, 98.24% lines.
- `node .local/Run-GitWorkspace.cjs --filter @frevos/contracts run test:coverage`: 15 files / 94 tests pass; 98.51% statements, 93.53% branches, 94.23% functions, 98.87% lines.
- `node .local/Run-GitWorkspace.cjs --filter @frevos/control-center run test:coverage`: 18 files / 104 tests pass, API/experience/routing 100% coverage.
- Windows csc `/target:winexe /optimize+` with System.Windows.Forms, Drawing and Web.Extensions references compiles the final RepositoryPicker.cs successfully.
- `.local/Test-NativeDownload.ps1`: fresh compiled helper, exactly one ZIP entry per runtime file, all 14 manifest digests pass. The fixture archive contains a real Node executable only; this is not a full production distribution acceptance.
- `node .local/CheckNativeAcceptance.cjs`: observed selected/cancelled records, unchanged environment/source and absent .git all pass.
- `pnpm run typecheck`, `pnpm run build`, and `pnpm exec biome lint . --diagnostic-level=error`: pass after the native changes. The existing frontend chunk-size warning remains.
- `pnpm run format:check`: pass, 273 files; `pnpm run validate:repo`: pass, 119 Markdown files. `pnpm run audit`: exit 0 at the configured high-severity gate; latest database reports 5 low / 8 moderate advisories, no high/critical, without dependency changes.
- Final full backend: `node .local/Run-GitBackendFinal.cjs --coverage --coverage.reportOnFailure --coverage.reportsDirectory=../../.local/git-full-native-coverage`: exit 1; 59 files pass / 1 fails, 271 tests pass / 2 established baseline failures. Coverage gates PASS: 95.01% statements, 91.39% branches, 96.73% functions, 96.81% lines. No other test failure or coverage error occurs in this separate-directory run.
- After the final updater extension, `node .local/Run-GitTarget.cjs test/preview-operators.test.ts test/system-enrollment-windows.test.ts`: exit 0; 2 files / 7 tests. The new full-system fixture includes five Windows file/DPAPI cases: 12-to-14 migration, unchanged pairing/history, verified restart, failed-start recovery, current-to-current update, tampered package denial and independent addition denial. Task transport is fixed fixture functions; no live task-update acceptance is inferred. The project-sidecar fixture separately rejects pinned system mode (8 checks).

The latest full coverage run precedes only the separately verified PowerShell
updater extension and its test registration; TypeScript runtime is unchanged.
An intermediate full coverage run was invalidated when a simultaneous targeted
run reused its coverage directory. It is not acceptance evidence. The final full
run uses a separate report directory and is recorded below; thresholds are not
lowered and the two established process-inventory failures are not hidden.

## Simple daily flow

1. Open **Code**, pair once through **Connect system**, then **Choose folder**.
2. Selection reads Changes only: no Git initialization, repository creation,
   upload, remote change or file deletion. Existing non-empty folders work.
3. Review selected files and enter a message. A new private repository name is
   suggested from the folder; an existing authorized repository can be chosen.
   No automatic first-repository or Servix binding is used.
4. **Commit & Push** explicitly creates/binds a repository when requested, then
   publishes the selected files on a work branch. Clean Git folders use
   **Publish repository**; empty folders can create/clone a repository.
5. Later use Refresh Changes, Commit & Push, Push committed changes, Pull,
   Switch / create branch and Create pull request / review. The repository view
   supplies typed branch/PR/review/squash-merge actions and native code/diff/access
   links. Native Git clients can clone/pull/push the credential-free URLs too.

Operators link each developer's own native account once. Developers do not enter
ports, hostnames, administrator credentials or Git commands for this daily flow.

## Execution and protection

The separately installed private engine independently enforces Git permissions.
DevSetu verifies the workspace, provider installation, immutable native account
and repository IDs and live permissions for every operation. No shared admin
token, email auto-link, automatic grant or public endpoint is introduced.
Browser session/CSRF checks are distinct from paired connector job authorization.
Connector jobs belong to one owner/workspace/device/folder, require an expiring
folder selection proof, fresh capability/Git readiness and file fingerprint.
Older connectors keep monitoring and honestly need a Git capability update.

Runtime operations use fixed execFile Git arguments, never shell text, customer
scripts or caller executables. Hooks/signing/filters/includes/fsmonitor,
submodule recursion and automatic maintenance do not run. Linked metadata and
ancestor checkouts fail closed. Bounded bundles transfer through the paired API
to disposable server checkouts; native tokens resolve only on the server.

Protected floors exclude .env, uploads, attachments, private keys/databases,
credential files and tooling credentials/caches. Human file review remains
necessary; this is not universal secret detection. Previously committed protected
data blocks publication pending explicit remediation, even after deletion.
Only the creator's exact unchanged new-repository seed can certify initial
history linking. It adds a two-parent commit with the existing local tree while
retaining original commits, source branch, remotes and file bytes. No reset,
rebase or force push rewrites existing history. Arbitrary unrelated existing
repositories are rejected. Dirty pulls/switches, conflicting staged work, unsafe
trees/refs, protected-default writes and non-fast-forward publication are refused.
Lost publication retains the local commit; fresh observation and explicit
reconciliation precede another mutation. Unknown effects are never auto-replayed.

Completed jobs are compacted. Versioned safety limits: 2,000 Changes rows,
8 MiB/file, 32 MiB/read snapshot, 64 MiB/bundle, 64 folders/actor, 512 KiB/record,
16 MiB/job records and 10,000 state entries. Capacity fails closed instead of
silently deleting audit history. Automatic archival/large-repository adapters
remain separate work.

## Operator enrollment — not applied live

The optional `<SERVIX_ROOT>/config/repository-hosting.json` is validated by
RepositoryHostingConfigSchema. Missing config shows unconfigured; malformed or
cross-workspace config fails closed. Required registry fields are version,
installationId, workspaceId, provider=gitea, apiUrl, webUrl, allowPrivateHttp,
defaultBranch, accounts and repositories. Each account records userId,
providerUserId, login, credentialId and credentialReference. Each repository
records id, providerRepositoryId, owner, name, defaultBranch, requiredApprovals
and requiredChecks. New Code repositories persist bindings under the jobs root.

1. Review a separate immutable binary/service/root/listener installation. Pin
   its hash, bind VPN-private addresses, disable public registration and require
   authenticated access. API/web URL must be one canonical origin, resolving only
   privately. HTTP requires explicit private-network allowance. No redirects,
   caller URLs, inherited proxies or DNS rebinding are accepted by the adapter.
2. Deliberately map each native account and review roles. Enroll its token through
   ProtectedModelSecrets under
   `<SERVIX_ROOT>/private/repository-hosting/<workspace>/secrets`. JSON contains
   only opaque credential references/IDs. No live credentials or grants were made.
3. Configure native default-branch protection: no direct/force push, fresh
   non-author review, rejected/outdated blocking, no admin override and required
   named checks. DevSetu also checks exact current head/base before merge.
4. Update enrolled Windows connectors with the reviewed existing operator's
   `-Capability Git`: only Connector.cjs and GitDesktop.cjs may change. Preserve
   DPAPI, task definition, identity and permissions. New Windows/Linux installer
   manifests include the runtime; Linux native acceptance remains pending.
5. Rehearse multi-user denials, restart/offline, publication and unchanged
   deployment behavior on the reviewed destination before onboarding developers.

Optional recovery config specifies workRoot, backupRoot, restoreRoot, binary,
binarySha256, serviceName, expectedCommandLine, keyOwner, keyId, keyReference,
maxBytes and maxFiles. Plain managed paths must be distinct; exact service image,
hash, command, --work-path and --config must agree. Private SID-based ACLs are
verified before plaintext restore. A protected 32-byte key reference resolves
only at the execution boundary; never put key values in JSON/browser/logs/Git.
Root ACLs allow only the reviewed root owner, current execution identity, SYSTEM
and Administrators; other grants, including domain/group SIDs, fail closed.
The source engine identity must own its managed root if it needs a separate grant.

## Full backup and isolated restore

The Windows/SQLite/local-storage adapter quiesces only the enrolled engine,
encrypts an integrity manifest and complete storage using AES-256-GCM bound to
workspace/installation, and restarts that service in finally. It covers Git
objects/refs, database, roles, reviews, issues, attachments, LFS and configuration.
External databases/storage/paths are refused rather than silently omitted. Links,
overlap, tampering, wrong keys/digests, traversal and capacity fail closed.

Verify isolated restore always writes a fresh root and runs the pinned engine's
offline `doctor check --run check-db-consistency`, without --fix. It never boots
a restored live database's mailer/webhooks/scheduled jobs. Native metadata tests
separately boot only trusted synthetic fixtures and check restored refs, roles,
PRs and reviews. Low-level isolated restore works after the original source is
lost. UI recovery currently needs a live verified native administrator; total
engine outage requires separately authorized offline operator recovery/cutover.
No live overwrite button is exposed. Back up DevSetu's registry, job receipts and
protected secret store separately; the engine snapshot is not a full DevSetu or
customer database backup.

## Earlier Git validation and remaining limitations

The following full-run numbers precede the native chooser follow-up above.
Observed commands on Windows x64 / Node 24.19.0 / pnpm 11.21.0:

| Command | Exit / observed result |
| --- | --- |
| `pnpm run validate:repo` | 0; 118 Markdown files |
| `pnpm run format:check` | 0 |
| `pnpm exec biome lint . --diagnostic-level=error` | 0; non-error diagnostics remain; no zero-warning claim |
| `pnpm run typecheck` | 0 |
| `pnpm --filter @frevos/contracts run test:coverage` | 0; 15 files / 93 tests; 98.5% statements, 93.53% branches, 94.23% functions, 98.86% lines |
| `pnpm --filter @frevos/control-center run test:coverage` in NativePlatform.buildEnvironment | 0; 18 files / 104 tests; API/experience/routing 100% coverage |
| `pnpm --filter @frevos/control-plane exec vitest run --coverage --coverage.reportOnFailure` in NativePlatform.buildEnvironment | 1; 59 files pass / 1 fails; 267 pass / 2 fail; only the two baseline process tests fail |
| Backend coverage from that full run | Gates PASS: 95% statements, 91.4% branches, 96.7% functions, 96.79% lines; thresholds unchanged |
| `pnpm --filter @frevos/control-plane exec vitest run test/git-desktop-runtime.test.ts test/git-desktop.test.ts test/git-recovery.test.ts test/repository-center.test.ts` in sanitized environment | 0; 4 files / 31 tests after broker and case-insensitive root fixes |
| Latest `vitest run test/git-desktop-runtime.test.ts test/git-engine-native.test.ts` | 0; 2 files / 7 tests, including .gitignore, filters and complete native acceptance after the last runtime change |
| Latest `vitest run test/preview-operators.test.ts -t Test-GitRecoveryBoundary` | 0; seven real file/ACL boundary checks; other tests intentionally not selected by this focused rerun |
| Full run operator tests | Five pass, including Git connector preservation and recovery; native Windows service transport is explicitly simulated |
| Clean base worktree `vitest run test/local-development-runtime.test.ts` | 1; 2 pass / same 2 fail at e5b1122; no tracked baseline changes |
| `node scripts/prepare-private-git-test.mjs` | 0; existing Windows binary identity verified |
| `pnpm run build` | 0; Vite reports its existing large-chunk warning |
| `pnpm run audit` | 0 at high threshold; 5 low / 6 moderate advisories remain |
| `git diff --check` | 0 |

The initial unsanitized frontend invocation fails an existing PowerShell module
autoload check. Rerunning through the existing NativePlatform environment
passes; no environment-seal test is changed. Early backend runs record a failed
new broker test and 94.24%/94.95% statement coverage; the actual broker correction
and added boundary cases precede the final full result above. No threshold is
lowered and no acceptance fixture is modified to conceal a production failure.

Browser verification uses actual Code/FolderBrowser components with explicitly
isolated API fixtures. Choose-folder leaves repository count at 0; explicit
Commit & Push changes it to 1 and shows Published, clears the commit message and
shows zero local changes. Protected .env selection is disabled. Reopening refreshes
Changes. Effective browser widths 434, 853 and 1518 CSS pixels fit without page
horizontal overflow; viewport overrides are reset. These checks establish UI
behavior, not live transport. No remote GitHub CI or default container image build
is claimed. Those earlier UI checks used fixture responses. The later native
chooser section records actual local broker/GUI/connector acceptance separately.

Official Windows Gitea 28.2.0 is verified at 122,481,664 bytes, SHA-256
`d13471c433903d8c6c8b4cc7dd2783cff8b8ffb66d4698a76c2c0213ac378d53`.
scripts/test-private-git.cjs uses only random synthetic accounts/private temporary
storage. Actual native Git/roles/PR/review/merge, clone, remote checkout, preserved
existing history/remotes, first clean publish, environment preservation, encrypted
full backup, offline consistency, restored native metadata, tamper rejection and
restart pass. No binary/credentials are committed. DEVSETU_TEST_GITEA selects a
verified test binary; absence skips native acceptance and is not a platform PASS.
The CI preparation step now provisions the official Linux x64 28.2.0 binary,
SHA-256 `15681fc615d56611c274f52803fef4d6d5316b620f93b677dd4b831a74e50b9f`,
verified against the [vendor checksum](https://dl.gitea.com/gitea/28.2.0/gitea-28.2.0-linux-amd64.sha256).
Both platforms use an isolated writable Git config and remove their own exact
temporary roots on completion. Windows existing-binary preparation passes;
the configured Linux GitHub CI job has not been remotely executed here.

Repeated folder selection exposed a genuine broker bug: its displayed snapshot
was being persisted with the strict binding. Saving only the verified binding
fixes it; the real-file deduplication/rebinding tests pass afterward. Attribute
filters (including LFS) and external attributes/ignore files are explicitly
refused before the desktop path can initialize or publish source.

Two unchanged local-development tests fail on this host (starting vs running;
stopped vs port-conflict), reproduced on a clean worktree at the exact base SHA.
An owned HTTP server returns 200 but Get-NetTCPConnection and netstat omit its
listener. Exact OS cause is unknown. No process checks/tests/thresholds are weakened.
Operator tests also exposed domain-name ACL translation failure: copying and
comparing binary SID Access/Owner/Group descriptors through .NET preserves exact
permissions and passes the five boundary tests. Domain trust was not changed.
Synthetic restore startup uses an isolated writable Git config; production
offline verification retains locked Git settings and never boots the copy.

- No Server20 install, live service/secret/role enrollment, repository migration,
  GitHub push/PR/merge or deployment is applied. Windows native tests are local;
  Server2016, live service stop/start, Linux and cross-laptop acceptance remain.
- The default unconfigured container stays independent of Windows helpers.
  Configured Git in that image needs a separately packaged/verified adapter and
  Git executable; no container Git-hosting acceptance is claimed.
- Desktop bundles support ordinary SHA-1 repos. SHA-256, linked worktrees,
  filters/includes, submodules/symlink trees, oversized histories and LFS transfer
  are unsupported/refused. Reviewed native clients cover workflows outside this
  pilot; local LFS files remain included in full engine backup.
- More than 100 branches/open PRs, full code/diff browsing and access management
  use the native UI. Publication UI checks use actual components with explicitly
  mocked API data; native folder selection is independently verified locally.
  Neither establishes a live cross-laptop hosting workflow.
- Phase 4 and previous preview/Android acceptance stay open. Required gates and
  human diff review precede publication; concrete live enrollment is separate.

Next bounded step: independently review this branch and resolve/reproduce the
existing Windows listener-inventory failures on an approved validation host.
Remote CI and publication are pending, not inferred from local coverage. After
required gates, prepare an exact live engine/service/storage/account/connector
enrollment plan for the destination's separate approval and acceptance. No
dependent roadmap phase or live migration is declared ready.

## Complete changed-file inventory

Diff stat (tracked and new files): 63 files, +9941/-60.
No generated binary, credential, ignored fixture or acceptance-repository change is included.

- `.github/workflows/ci.yml` (+3/-0; modified)
- `.gitignore` (+1/-0; modified)
- `apps/control-center/src/api.ts` (+76/-0; modified)
- `apps/control-center/src/App.tsx` (+13/-0; modified)
- `apps/control-center/src/FolderBrowser.tsx` (+7/-1; modified)
- `apps/control-center/src/GitFoldersPanel.tsx` (+765/-0; new)
- `apps/control-center/src/RecordWorkspace.tsx` (+4/-2; modified)
- `apps/control-center/src/RepositoryCenterPage.tsx` (+535/-0; new)
- `apps/control-center/src/RepositoryRecoveryDialog.tsx` (+121/-0; new)
- `apps/control-center/src/routing.ts` (+9/-0; modified)
- `apps/control-center/src/styles.css` (+36/-0; modified)
- `apps/control-center/test/app.test.tsx` (+4/-1; modified)
- `apps/control-center/test/repository-center-api.test.ts` (+123/-0; new)
- `apps/control-plane/src/git-desktop.ts` (+775/-0; new)
- `apps/control-plane/src/git-engine.ts` (+207/-0; new)
- `apps/control-plane/src/main.ts` (+26/-0; modified)
- `apps/control-plane/src/repository-center.ts` (+828/-0; new)
- `apps/control-plane/src/server.ts` (+175/-0; modified)
- `apps/control-plane/test/git-desktop-runtime.test.ts` (+291/-0; new)
- `apps/control-plane/test/git-desktop.test.ts` (+473/-0; new)
- `apps/control-plane/test/git-engine-native.test.ts` (+27/-0; new)
- `apps/control-plane/test/git-recovery.test.ts` (+124/-0; new)
- `apps/control-plane/test/postgres-service.integration.test.ts` (+253/-0; modified)
- `apps/control-plane/test/preview-operators.test.ts` (+36/-0; modified)
- `apps/control-plane/test/repository-center.test.ts` (+627/-0; new)
- `apps/control-plane/test/system-enrollment-windows.test.ts` (+7/-1; modified)
- `deployment/server20/Configure-PrivatePreview.ps1` (+9/-3; modified)
- `deployment/server20/HttpCommon.ps1` (+1/-1; modified)
- `deployment/server20/New-ServixDashboardRelease.ps1` (+3/-2; modified)
- `deployment/server20/Update-PreviewExecutor.ps1` (+7/-1; modified)
- `deployment/servix/Connector.cjs` (+9/-1; modified)
- `deployment/servix/GitDesktop.cjs` (+961/-0; new)
- `deployment/servix/GitRecovery.cjs` (+603/-0; new)
- `deployment/servix/GitService.ps1` (+40/-0; new)
- `deployment/servix/LocalDevProcesses.ps1` (+48/-2; modified)
- `deployment/servix/New-ConnectorDownload.ps1` (+3/-3; modified)
- `deployment/servix/RepositoryPicker.cs` (+95/-0; modified)
- `deployment/servix/Setup-Connector.ps1` (+2/-2; modified)
- `deployment/servix/Setup-Linux.cjs` (+1/-0; modified)
- `deployment/servix/SystemEnrollment.cjs` (+2/-0; modified)
- `deployment/servix/Test-GitRecoveryBoundary.ps1` (+32/-0; new)
- `deployment/servix/Test-PreviewConnectorUpdate.ps1` (+24/-18; modified)
- `deployment/servix/Test-SystemConnectorUpdate.ps1` (+39/-0; new)
- `deployment/servix/Update-PreviewConnector.ps1` (+21/-8; modified)
- `deployment/servix/Update-SystemConnector.ps1` (+27/-12; modified)
- `docs/adr/0076-configured-private-git-collaboration.md` (+92/-0; new)
- `docs/adr/0077-native-code-folder-selection.md` (+39/-0; new)
- `docs/adr/0078-native-listener-detection-and-server20-release.md` (+32/-0; new)
- `docs/adr/README.md` (+12/-0; modified)
- `docs/ARCHITECTURE.md` (+27/-0; modified)
- `docs/CENTRAL_GIT_COLLABORATION_HANDOFF.md` (+381/-0; new)
- `docs/CENTRAL_GIT_SERVER20_RELEASE_HANDOFF.md` (+293/-0; new)
- `docs/CURRENT_STATE.md` (+54/-0; modified)
- `docs/PERMISSIONS.md` (+21/-0; modified)
- `docs/PRODUCT.md` (+9/-1; modified)
- `docs/ROADMAP.md` (+8/-0; modified)
- `package.json` (+2/-1; modified)
- `packages/contracts/src/git-desktop.ts` (+203/-0; new)
- `packages/contracts/src/index.ts` (+2/-0; modified)
- `packages/contracts/src/repository-center.ts` (+248/-0; new)
- `packages/contracts/test/repository-center.test.ts` (+230/-0; new)
- `scripts/prepare-private-git-test.mjs` (+55/-0; new)
- `scripts/test-private-git.cjs` (+760/-0; new)
