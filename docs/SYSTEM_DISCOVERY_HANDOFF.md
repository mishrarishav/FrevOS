# System discovery and onboarding handoff

Status: PASS for the owner-approved bounded development pilot, 2026-10-24.
Configured publication, isolated CI/build, independent server20 activation,
guarded source upgrades and live acceptance completed. Broad-drive collection
is explicitly partial, with observed loss/backlog and limits recorded below.

Repository: `D:\FREVOS`, worktree `.local/worktrees/servix-dashboard`.
Branch: `feature/system-discovery-onboarding`.
Base: `a97a076446fa299556d6d75473721fb199eb984b`.
Resulting published implementation commit: `fd89278b8484d76fe9d291bbc191ec6bc5d7e812`.
Published diff: 54 files, 7,104 insertions(+), 131 deletions(-).
Active manifest: `96e799f3dbe1d204a8cc2d220616c21de0166918c2e3125377023b615389251f`.
Deployment request: `pr_ca688b0e2210441336866ba9ec3e728a`.
Pull request: none. No default branch push or merge occurred.
Final result documentation is a subsequent local working-tree update; the
deployed implementation remains the exact published commit above.

## Delivered scope

The owner-approved bounded pilot adds `/systems/discovery`, shared workspace
cards/tables and responsive dialogs, existing-connector CPU/RAM/disks/OS/tool
observations, revisioned file-tracking policies, bounded retained activity and
selected-folder redacted text before/after. History can be filtered by local day
and file/folder path. Summary polling carries the latest 20 events per source;
opening a source requests its authorized retained history and renders it in
batches. Revocation/offboarding prevents new collection without erasing the
owner's retained historical evidence.

The separate Project reports view uses existing canonical clients/projects and
owner-authored PO/reference/date/timezone, responsible person, assigned verified
source systems and weighted deliverables. Only accepted deliverables with an
evidence reference count as completed. A due date expires at the end of that
calendar day in the saved timezone. File counts, lines, email and online time
never determine completion. Revision checks retain accepted plan history and
source/repository binding provenance. The live client/project catalog was empty
at baseline; no actual PO, client or completion percentage is fabricated.

The installer checks bounded root/immediate-child manifests (`package.json`,
`global.json`, SDK web `.csproj`) and optional `devsetu.system.json` tool/version
requirements. It shows detected/required versions, source and OS authorization,
installs selected allowlisted tools, then rechecks. Fresh clones receive another
project requirement check before enrollment finishes. Tool installation is
separate from project package restore/install, environment profiles and DB
access; existing environment CRUD and development/read-only preview safeguards
continue to apply. No arbitrary install command or package source is exposed.

Windows uses the existing paired scheduled-task/DPAPI connector. Linux x64 has a
separate archive, user-owned private enrollment and a user systemd service.
Prerequisites cover Windows, Ubuntu/Debian and RHEL/Rocky policies. Missing user
session bus/systemd/cgroup-v2 requirements are shown explicitly. Linux local
development uses cgroup limits, private temporary/runtime directories, protected
agent files and fresh PID/birth/port/project checks; pidfd stops and atomic
permission-preserving environment saves fail closed when unavailable. Modern
ASP.NET SDK 8/9/10 recipes are supported by the adapter; classic .NET Framework
requires Windows. Linux destination/native server activation remains outside
this source-connector release and stays Windows-only.

## Collection boundaries

Local consent and an enabled server policy are both required for file activity.
Basic health collection is disclosed separately. All-local-drive tracking is the
default selectable scope, with project-first bounded watchers. Network/pseudo
filesystems and cross-mount descent are excluded; inaccessible directories,
limits, overflow, restart/offline gaps and unavailable audit coverage are shown.
This is best-effort evidence, not a complete journal of every file operation.

Sensitive paths/files, environment files, keys, agent storage, system/cache/build
folders and links are excluded. Selected small text files use redaction before
local spooling, server persistence and presentation. Text baselines and watcher
queues are bounded. Retention is 1–30 days, 100–10,000 events and a 1 MB per-source
server history limit; whichever limit is reached first can remove old evidence.
The default is seven days/2,000 events/10,000 directories. The collector cannot
reconstruct edits made while it was down. Directory notifications can coalesce.

Filesystem notifications never identify an acting developer. User/process/PID
appears only for a separate actual OS audit event from an already accessible
Windows Security 4663 or Linux auditd feed. No real host audit policy, membership,
SACL or privilege is changed. OS access events establish recorded access,
not authorship or exact contents of an edit. Audit availability and gaps remain
visible. Discovery currently lists enrolled project sources, so two connectors
on one laptop can appear as two source rows; it is not a deduplicated device CMDB.

## Observed validation

All commands ran from the implementation worktree unless otherwise noted.

| Command/evidence | Observed result |
| --- | --- |
| `pnpm.cmd run ci` (`.local/discovery-ci-final.log`) | Exit 0; 274 tests, repository/format/lint/typecheck/coverage/build/high dependency gate passed, including directory recreation and private cache/agent path exclusions. |
| Control plane coverage | Statements 95.26%, branches 90.88%, functions 98.31%, lines 96.57% in the initial complete run; final log retains exact recalculated totals. |
| Control center API/routing/experience coverage | 100% statements/branches/functions/lines. |
| `node .local/discovery-browser.mjs` (`.local/discovery-browser-reviewed.log`) | Exit 0; real Windows connector, filesystem, PostgreSQL and authenticated Playwright history/settings/plan create/update, 30% behind-plan → 100% complete, offline/restart, 1366/768/390 viewport/scroll checks; zero unexpected browser errors. |
| `node .local/discovery-setup-browser.cjs` | Exit 0; protected one-use local bootstrap, anonymous rejection, actual verified portable Node 22 install/recheck and three responsive widths. |
| Actual Debian 12 VM kernel fixture | Node cgroup launch, stale identity rejection, pidfd Stop, channel-close cleanup, atomic environment mode/stale checks, filesystem/text history and actual isolated auditd attribution passed. |
| Actual Debian ASP.NET fixture | Verified SDK 8.0.426/native dependencies installation, project restore/build/localhost health and child-tree Stop passed. Private XDG runtime directory fixes patched .NET's mutex storage requirements. |
| `node .local/discovery-linux-enrollment.mjs` | Exit 0; actual paired Linux private enrollment, user systemd service, authenticated Git clone/verified POSIX binding, health and configured npm Start/Restart/Stop passed against the isolated real PostgreSQL control plane. |
| Ubuntu 24.04 / Rocky 9 / Red Hat UBI 9 containers | Actual bundled Node, selected Git/Python install/recheck and native dependency recipes passed; missing service manager and .NET Framework rejected. Containers do not establish distro-specific kernel/systemd/AppArmor/SELinux acceptance. |
| `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File deployment/server20/New-ServixDashboardRelease.ps1 -PreviousPackageRoot D:\FREVOS\.local\native-releases\servix-release-0f721f478ced4e9e89698d8409a12ba1\package -ReleaseOutputRoot D:\FREVOS\.local\native-releases` | Exit 0; sealed local candidate built after the final CI. This is preparation, not source-to-live deployment. |
| `node .local/Test-DiscoveryArtifact.mjs .local/servix-release.json final` | Exit 0; exact packaged Windows Node 24.19, real isolated PostgreSQL, authentication, Discovery API/browser navigation, both installer response hashes, patched Zod metadata and existing account/component/maintenance composition passed. The first private smoke used a non-browser `Accept` header for SPA navigation; correcting the harness to send `text/html` resolved that test-only failure without changing production navigation. |
| Actual final Linux archive extraction/entrypoint check | Exit 0; executable modes, all packaged modules/client JavaScript, Node 24.19.0 and Git/Python/user-service/SDK 8.0.426 readiness passed in the Debian VM (`.local/discovery-linux-final-bundle.log`). |
| `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File .local/Upgrade-DiscoverySources.ps1 -Action Plan -PackageRoot <sealed candidate> -ManifestSha256 <candidate digest>` | Exit 0; both enrolled source baselines, 18 candidate sidecars, pinned Node and bundled npm inventory verified; no source task or pairing was modified. |
| `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File .local/discovery-local-preservation.ps1` | Exit 0; both source tasks remain Running/Limited/Interactive and each retains its eight preceding sealed sidecars; eleven environment file hashes match; localhost frontend returns 200 and backend has no listener. No new source collector has been installed. |

The first full run failed the dependency gate on the newly reported
[high Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).
Both direct pins and lockfile now use 4.6.6. The sealed packager imports
that exact frozen vendor package and updates both packaged dependency manifests,
with narrow delta allowances and source inventory. Contracts include standard URL
declarations required by the patched types; type checking remains enabled. The
high gate then passed. That pre-rollout audit reported five low and eight moderate
advisories, with no high/critical finding. The subsequent configured-build undici
failure and final five-low/six-moderate audit are recorded in rollout evidence
below. The existing UI chunk size warning remains; no gate was weakened.

The isolated TCG VM initially advertised CPU features that triggered guest
kernel faults during .NET execution. It was restarted with a baseline x64 CPU;
the same patched SDK and confinement then passed. Only the synthetic guest's
audit rule/account provisioning was changed; host applications and permissions
were not touched.

The private writable XDG runtime directory also follows the patched runtime's
[documented named-mutex behavior](https://github.com/dotnet/runtime/issues/135726).

## Deferred and unverified targets

IMAP is a future read-only supporting evidence integration, with opaque secret
references, mailbox scope, identity/provenance, retention and approval to be
designed before connection. Other systems may supply evidence through scoped
APIs later. Receiving mail never accepts a milestone or authorizes a tool.
No mailbox is enrolled and no notice, justification request, email or employment
action is sent. First-release output is delay alerts/reports only.

Linux GUI/interactive onboarding requires a local browser and a logged-in user
service manager. New system tool versions are reviewed before installation;
unsupported architecture/distribution, missing containment or permission is not
shown as ready. The shipped Linux archive is x64; arm64 packaging and actual
acceptance are not claimed. Ubuntu/Rocky/RHEL native desktop/kernel policy and
permission-specific acceptance remain separate from the tested Debian kernel.
No continuous service after logout is promised unless the system administrator
has separately enabled the user's lifecycle. No host linger policy is changed.

Drives are enumerated when tracking starts or settings are applied. Newly mounted
drives require another settings save/restart in this pilot. Scans cover up to 64
roots and the configured directory/event limits. pnpm currently has one managed
per-user tool version; recheck other projects after changing it. The recorded
native .NET execution acceptance is SDK 8; SDK 9/10 recipes need their own actual
project/OS acceptance before being described as verified.

## Final rollout evidence

The owner reconnected VPN. HTTP/SMB and the fresh authenticated preservation
capture passed: eleven environment files, three profiles, two pipelines and the
frontend-only local development session. Final settings/session/environment
comparisons passed.

The first configured request `pr_13b66a566242b865d46e75a17ea8cf75` published
`c60a926d92d576858621399491d1bec099d89898`, but isolated build
`cj_ff57487d1079bb4878c6c4292881a6f0` correctly rejected
[the high undici advisory](https://github.com/advisories/GHSA-xjj6-f33q-929c).
A retained-checkout diagnostic reproduced that dependency-gate failure. The
narrow workspace override/lockfile pins testcontainers' undici to 8.12.2. Full
CI then passed all 274 tests and required gates, exit 0, with five low/six
moderate and no high/critical audit finding. No gate was weakened. This failed
request did not activate a new artifact or upgrade a source connector.

The corrected source was published by the actual DevSetu Deploy all UI, built
from an isolated frozen checkout with full CI, and activated by the existing
independent SYSTEM updater. No manual source commit/push or prepared-artifact
shortcut was used. The successful immutable identities are:

- Source: `fd89278b8484d76fe9d291bbc191ec6bc5d7e812`.
- Request: `pr_ca688b0e2210441336866ba9ec3e728a`.
- Builder job: `cj_48f2907ca7e486973becedf4ce994d81`.
- Destination job: `cj_a3fc98dcf2362708fbd9ba16cc951896`.
- Reference digest: `d8ca88e1d05f417338677ce3a581cbc9dce9324afba1264d1831ea1cf9cc96fc`.
- Manifest: `96e799f3dbe1d204a8cc2d220616c21de0166918c2e3125377023b615389251f`.
- Archive: `69f66a667ce0475d5a24a55fb745a18ce8fa55268e280d2b8c9feb477e94333c`, 131,322,300 bytes.
- Package: `D:\FREVOS\.local\native-releases\servix-release-7e3a54007f8a4feb880d3153d64c951c\package`.
- Inventory: 3,896 files, 149,288,900 manifested bytes.
- Linux archive: `f5737033584acd04457a7f95db4bc35256ba37cdf53ddc08e8e1e4b091be187d`,
  48,812,519 bytes; exactly matches the archive already executed in the real
  Debian guest. Windows installer and Linux download response hashes passed
  the exact published-artifact smoke check.

The activation receipt reports PASS, HTTP/UI 200, databaseWritten=false,
siblingsPreserved=true and retained private rollback backups. Active-pointer
manifest, source publication and build/activation receipts agree.

Both enrolled Windows sources received 18 verified sidecars and bundled npm.
Pairing bytes and Limited/Interactive task definitions were preserved. Final
readback confirms both tasks Running, both sources fresh, and installed sidecars
match the actual sealed artifact. The original Servix frontend was restored in
development mode with localhost:3000 HTTP 200; backend port 5000 remains closed.
Eleven environment file hashes, three profiles, two pipeline configurations and
the existing customer deployment identity remain unchanged.

The legacy connector's stop action succeeded and both OS ports were closed,
but its service display remained stale past the private helper's 90-second
deadline. This was independently confirmed before guarded upgrade; the fresh
worker then reported stopped correctly. Frontend restoration also took longer
than that helper's 90-second wait; the existing Start action eventually reached
running, without duplicate Start submission. Final fresh API and OS/HTTP
readback pass. The two helper deadlines are retained as observed deviations,
not hidden as successful waits.

The live owner UI saved DevSetu source policy revision 1: enabled, all local
drives, existing permitted OS audit, seven days/2,000 events/10,000 directories,
and **no content-history folders**. Servix source file capture remains disabled
to avoid collecting the same physical laptop twice; it still reports health.
Three pre-existing revoked verification sources are shown as historical/offline;
they were preserved. No fake client, project, PO or completion record was added.

Live collection observes C: and D: with 10,000 watched directories and partial
coverage. It reports restart-history-unavailable, permission-denied,
buffer-overflow and watch-limit. The startup burst dropped 6,060 events. The
first synthetic probe's creation was not retained and its failed check is recorded; after
the burst, another owned probe was captured in the local queue and eventually
reached server history and the browser after a several-minute backlog. It was
removed afterward. Both create/delete evidence and the responsive visible event
were verified. This establishes the actual collection path, **not complete
all-drive history or immediate delivery under load**. Existing OS audit feed
access was available, but the live retained probe uses filesystem notifications
and correctly reports acting user/process unavailable. No matched live audit
attribution is claimed; actual isolated Linux audit attribution passed earlier.

Authenticated live Playwright checks passed at 1366/768/390 widths, with no
horizontal page overflow, persistent dialog close actions and visible actual
event evidence. There were zero unexpected browser errors/HTTP failures. The
existing HTTP-origin COOP warning remains. Screenshots were visually reviewed.

| Final command/evidence | Observed result |
| --- | --- |
| `pnpm.cmd run ci` (`.local/discovery-ci-undici-fixed.log`) | Exit 0; 274 tests, required repository/format/lint/type/coverage/build/audit gates pass. |
| `node .local/discovery-preservation.cjs capture` | Exit 0; existing settings/session/environment baseline matches. |
| `node .local/discovery-deploy.cjs deploy native-system-discovery-final` | Exit 0; actual UI publication/build/independent activation succeeded. |
| `node .local/component-copy-native-release.cjs native-system-discovery-final` | Exit 0; successful source-job receipt matches active artifact. |
| `node .local/component-native-receipts.cjs native-system-discovery-final` | Exit 0; independent SYSTEM activation PASS, databaseWritten=false. |
| `node .local/Test-DiscoveryArtifact.mjs C:\Users\APPC0024\AppData\Local\DevSetu\Builds\platform\cj_48f2907ca7e486973becedf4ce994d81\source\.local\servix-release.json final` | Exit 0; exact published package, real isolated PostgreSQL/auth/API/HTML/installer/Zod composition pass (`.local/discovery-published-artifact-smoke.log`). |
| `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File .local/Upgrade-DiscoverySources.ps1 -Action Plan -PackageRoot D:\FREVOS\.local\native-releases\servix-release-7e3a54007f8a4feb880d3153d64c951c\package -ManifestSha256 96e799f3dbe1d204a8cc2d220616c21de0166918c2e3125377023b615389251f` | Exit 0; both enrolled source baselines and sealed upgrade inventories verified. |
| `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File .local/Upgrade-DiscoverySources.ps1 -Action Apply -PackageRoot D:\FREVOS\.local\native-releases\servix-release-7e3a54007f8a4feb880d3153d64c951c\package -ManifestSha256 96e799f3dbe1d204a8cc2d220616c21de0166918c2e3125377023b615389251f` | Exit 0; two source upgrades, pairing/tasks retained, no arbitrary target selected. |
| `node .local/discovery-confirm-stopped.cjs` | Exit 0; successful typed stop and independently closed OS ports before upgrade; legacy display staleness recorded. |
| `node .local/discovery-preservation.cjs verify` | Exit 0; original frontend mode, 11 files, 3 profiles, 2 pipelines and customer deployment preserved. |
| `node .local/discovery-final-os.cjs` | Exit 0; sealed sidecars/tasks, localhost frontend HTTP 200, backend closed. |
| `node .local/discovery-live-acceptance.cjs configure` | Exit 0; actual Tracking settings UI saves metadata-only policy. |
| `node .local/discovery-live-acceptance.cjs verify` | Exit 0 for the post-burst probe; first startup-overflow probe failed and is separately retained. |
| `node .local/discovery-live-evidence.cjs` | Exit 0; actual retained event visible at desktop/mobile widths, correct unavailable attribution and no content captured. |
| `pnpm.cmd run validate:repo` and `git diff --check` after final result documentation | Exit 0; 82 Markdown files validated and no whitespace errors. |

The earlier local candidate manifest
`41e7e7e6730fb911d7df9739a878de148a3cb63013a59ebd7cae01f2c84775be`
was preparation only and is not the deployed artifact. No VPN configuration,
host audit policy, server21 deployment, customer database write, actual
environment save, default branch or merge was changed by this pilot.
Live rollback of this new release was not exercised; verified prior artifacts
and private rollback backups are retained. A real rollback remains a separately
authorized operation. No failure was deliberately injected into the customer's
running application or paired source tasks.

## Readiness

Ready for owner use/review of the bounded pilot and entry of authoritative
client/project/PO/milestone records. Phase 4 exit remains open. Native
Ubuntu/RHEL workstation policy acceptance, SDK 9/10 project acceptance, arm64,
IMAP/API ingestion, CMDB deduplication and notices remain follow-on work with
the limitations and authorization boundaries above. This release does not
claim the owner's eventual chatbot/project-delivery vision is fully complete.

<!-- discovery-change-inventory -->

## Complete changed-file inventory

Base to current working tree: 54 files, 7182 insertions(+), 131 deletions(-). Published branch head: `fd89278b8484d76fe9d291bbc191ec6bc5d7e812`. Any later result documentation remains in the working tree until separately published. The two preceding environment-editor result documentation edits are preserved in this list.

- `apps/control-center/src/App.tsx`
- `apps/control-center/src/DiscoveryPage.tsx`
- `apps/control-center/src/RecordWorkspace.tsx`
- `apps/control-center/src/api.ts`
- `apps/control-center/src/routing.ts`
- `apps/control-center/src/styles.css`
- `apps/control-center/test/app.test.tsx`
- `apps/control-center/test/discovery-api.test.ts`
- `apps/control-plane/package.json`
- `apps/control-plane/src/developer-connectors.ts`
- `apps/control-plane/src/main.ts`
- `apps/control-plane/src/server.ts`
- `apps/control-plane/src/system-discovery.ts`
- `apps/control-plane/test/postgres-service.integration.test.ts`
- `apps/control-plane/test/system-discovery-runtime.test.ts`
- `apps/control-plane/test/system-discovery.test.ts`
- `deployment/server20/HttpCommon.ps1`
- `deployment/server20/New-ServixDashboardRelease.ps1`
- `deployment/servix/Connector.cjs`
- `deployment/servix/DiscoverySafety.cjs`
- `deployment/servix/DotNetToolchain.cjs`
- `deployment/servix/EnvironmentEditor.cjs`
- `deployment/servix/FileAudit.cjs`
- `deployment/servix/LinuxController.cjs`
- `deployment/servix/LinuxProcesses.cjs`
- `deployment/servix/LocalDevelopment.cjs`
- `deployment/servix/New-ConnectorDownload.ps1`
- `deployment/servix/New-LinuxDownload.mjs`
- `deployment/servix/NodeToolchain.cjs`
- `deployment/servix/Protect-SetupSession.ps1`
- `deployment/servix/Read-WindowsFileAudit.ps1`
- `deployment/servix/Setup-Connector.ps1`
- `deployment/servix/Setup-Linux.cjs`
- `deployment/servix/Stop-LinuxProcess.py`
- `deployment/servix/SystemDiscovery.cjs`
- `deployment/servix/SystemPrerequisites.cjs`
- `deployment/servix/SystemSetup.cjs`
- `deployment/servix/SystemSetupClient.js`
- `deployment/servix/Write-LinuxEnvironment.py`
- `deployment/servix/install.sh`
- `docs/CURRENT_STATE.md`
- `docs/LOCAL_ENVIRONMENT_EDITOR_HANDOFF.md`
- `docs/SYSTEM_DISCOVERY_HANDOFF.md`
- `docs/adr/0055-system-discovery-onboarding.md`
- `docs/adr/README.md`
- `packages/contracts/package.json`
- `packages/contracts/src/component-deployments.ts`
- `packages/contracts/src/deployment-settings.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/system-discovery.ts`
- `packages/contracts/test/system-discovery.test.ts`
- `packages/contracts/tsconfig.build.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
