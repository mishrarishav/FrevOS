# System discovery and onboarding handoff

Status: BLOCKED for live rollout by unavailable server20/VPN connectivity.
The bounded implementation and observed local acceptance pass; live activation
and preservation verification remain required and are not claimed complete.

Repository: `D:\FREVOS`, worktree `.local/worktrees/servix-dashboard`.
Branch: `feature/system-discovery-onboarding`.
Base: `a97a076446fa299556d6d75473721fb199eb984b`.
Resulting implementation commit: none; implementation remains an uncommitted
dedicated-branch change until configured source publication succeeds.
Local immutable candidate manifest:
`41e7e7e6730fb911d7df9739a878de148a3cb63013a59ebd7cae01f2c84775be`.
Live publication/activation receipts: pending configured rollout.
Pull request: none. No default branch push or merge is part of this pilot.

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
high gate then passed. The final audit reported five low and eight moderate
advisories, with no high/critical finding, and the existing UI chunk size warning
remains; no gate was weakened. Earlier runs reported fewer below-gate advisories;
the final count records the current registry result rather than retaining the
earlier count.

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

The actual Linux paired enrollment/clone/business-action acceptance passed.
The local builder's two required operator scripts were updated with exact prior
receipt guards, private backups, pairing bytes and task definition preserved
(`.local/discovery-builder-upgrade.json`). No source connector was stopped or
upgraded while server20 was unreachable.

The sealed **local candidate**, based on uncommitted working-tree changes over
the stated base, is
`D:\FREVOS\.local\native-releases\servix-release-6570eb8a9f614057b2906f857465c7bb\package`:

- Manifest: `41e7e7e6730fb911d7df9739a878de148a3cb63013a59ebd7cae01f2c84775be`.
- Archive: `f16e5e4a42c43b082f7c4fa88835617873ffa9c248c28025aeb348c39fa70482`.
- Files: 3,896; total manifested bytes: 149,288,924.
- Linux archive: `f5737033584acd04457a7f95db4bc35256ba37cdf53ddc08e8e1e4b091be187d`, 48,812,519 bytes.
- Current source sidecars and both dependency manifests match the sealed candidate;
  `.local/discovery-ready-seal.json` and `.local/servix-release.json` retain receipts.

Pending: actual configured source publication/isolated frozen build, independent
server20 activation, guarded source upgrades and final live configuration/session
verification. No original frontend session has been stopped while connectivity
is unavailable, so restoration is unnecessary until the later guarded upgrade.
Server21, actual customer database
writes, actual environment saves, default branch publication and phase 4 exit
remain excluded. The complete current working-tree inventory follows below;
resulting published source/activation identities remain pending.

On 2026-10-24 at approximately 05:00 IST, both `10.9.69.20:80` and `:445` timed
out, and the authenticated read-only preservation capture failed with `fetch
failed`. Later bounded probes reproduced the timeouts. The owner was asked to
reconnect VPN. No deployment request, new source publication or real customer
environment write was submitted in this state. Resume by capturing the live
preservation baseline, publishing through DevSetu Deploy all, verifying the sealed
package/independent activation, upgrading the two source sidecars with guarded
backups, and restoring the original frontend-only local session.

A read-only process check found FortiClient running. This session does not expose
the `node_repl` runtime required by the installed computer-use skill, so no VPN
UI/profile/authentication state was changed. The actual observed blocker remains
server20 connectivity; the owner's reconnect reply is still pending.

<!-- discovery-change-inventory -->

## Complete changed-file inventory

Base to current working tree: 53 files, 7080 insertions(+), 127 deletions(-). Implementation remains uncommitted until the configured source publication succeeds. The two preceding environment-editor result documentation edits are preserved in this list.

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
