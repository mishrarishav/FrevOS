# Portable developer connector handoff

Date: 2026-10-21 (IST).
Status: PASS - live onboarding controls, verified download and owner's limited-user connector are operational.

## Scope and authority

Repository/worktree: `D:\FREVOS\.local\worktrees\servix-dashboard`.
Branch: `feature/servix-dashboard-deploy`.
Base/current commit: `bc4530746c01269b3795a25edad63efad9364b9f`.
No FrevOS commit, GitHub push, PR or merge was performed.
The existing manual-push pilot remains documented in
[its handoff](SERVIX_DASHBOARD_HANDOFF.md). The owner explicitly superseded its
manual source-publication requirement and clarified that developer onboarding
means FrevOS invitations, not Active Directory. See
[ADR 0040](adr/0040-portable-developer-connectors.md).

This task adds Windows developer onboarding and portable source publication for
the existing Servix development profile. It does not claim generic project
onboarding, tenant-isolated builds, automatic backend dependency releases,
production deployment, laptop-data import or Phase 4 exit.

## User workflow

1. The workspace owner opens the Servix deployment panel and creates a developer
   invitation. The one-time code expires after 24 hours; no email is sent.
2. The developer downloads the Windows connector from FrevOS, extracts the ZIP
   and opens `Setup.cmd`. Git must already be installed.
3. Setup asks for a checkout folder, username, invitation code when needed, and
   the developer's own password. An empty folder can be initialized from the
   authenticated server20 Git source. An existing checkout must match Servix.
4. Setup pairs a distinct device, stores its credential using Windows user DPAPI,
   and registers a per-user task with a logon trigger. It requests no server
   Windows password and does not require an administrator task principal.
5. The developer saves code, selects their device in FrevOS and clicks Deploy.
   Non-ignored changes are staged and committed under the normal Git policy;
   hooks and signing settings are preserved. The exact commit is transferred to
   server20 in a verified Git bundle, then built and deployed to server21 dev.
6. A replacement laptop repeats setup and receives a new device credential. The
   old device can be revoked in FrevOS. Revocation is independent of the new device.

The laptop/network/VPN must remain available through publication. Builds and
activation then run on server20. Offline or conflicting sources never cause an
implicit fallback to a previously pushed commit. Source publication and target
deployment are separate recorded stages. Current stored code may still differ
from edits saved after the deployment snapshot was committed.

## Boundaries

- Every job is bound to user, workspace, device, request and exact source base.
  A current project write permission is required during polling and completion.
- Invitations create new credentials and a fixed workspace membership in one
  PostgreSQL transaction. Existing accounts cannot be reset by invitation.
  No schema migration or production database operation is included.
- Server device records retain only credential digests. Browser lists omit them.
  Setup sends device credentials to the connector over a private stdin pipe,
  never command arguments or environment variables.
- The connector accepts no remote shell commands or remote-selected paths.
  It refuses ordinary default branches, conflicts and protected data paths.
  A stale checkout can update only by a normal fast-forward; conflicts stop.
- Server20 imports bundles only after verifying the expected current base,
  repository identity, Git object integrity and ancestry. Ref updates compare
  the expected old SHA. Incoming refs use request identities and are removed
  after successful publication. No force push is used.
- Source transport is authenticated HTTP on the owner's existing internal
  origin. Administrative SMB credentials and server21 credentials are excluded
  from developer packages. No firewall or VPN rule change is included.
- Runtime Git writes are scoped to the source repository's objects and refs;
  the release operator retains ACL preimages and checks ownership before recovery.
  Git config, hooks, target credentials and unrelated shares are excluded.
- Reuse the existing immutable build and Servix preservation operator. Uploads,
  environment and database files are excluded from the deployed code payload;
  server21 `D:\Servix` production is outside the profile.

## Validation

`pnpm run ci` passed: 207 tests (73 contracts, 71 UI/API, 63 control plane), required
coverage, formatting, lint, TypeScript builds, application build and dependency
audit reporting no known vulnerabilities. Final log: `.local/connector-recovery-ci-final.log`.

Real Git tests covered a different local folder, creating an immutable commit,
preserving ignored data, a verified bundle, import into a disposable central bare
repository, stale-base denial, incoming-ref cleanup and initialization of a second
checkout from a complete server bundle. A focused follow-up additionally verifies
that a configured local commit hook executes.

Disposable PostgreSQL/Fastify tests covered invitation redemption, one-time use,
actor/workspace CSRF, a new developer login, fixed membership scopes, per-user
device visibility, authenticated source transport, revocation, and denial of an
attempt to overwrite an existing credential. Fixtures establish contract behavior;
they do not establish live server20 task or laptop installer acceptance.

PowerShell connector scripts parsed successfully. The download builder reuses
the existing pinned Node 24.19.0 archive and includes its license; it does not
install or upgrade a developer's other toolchain. The release builder checks for
source changes during packaging before publishing an artifact receipt.

## Live acceptance

- Server20 active manifest:
  `2a266bf025f81b078b670647d06d7b299724fe313fba217b9d3667c54b76a915`.
  Previous manifest: `7c987233c3faab0eef46d0939b96f6d8e0d7210ad7174e2d0e21152c3a2a8f79`.
  Archive SHA256: `df203d5189e396ed4a4b40b41eb1a31c84f62bf0bb8fe6ab69cf7e5602a0d536`.
  Payload: 3,677 files. Exact manifest, bounded delta, wrong digest denial,
  migration denial and PowerShell checks passed.
- Operator correlation: `53a4b7bbf053410ab96c2b2c0610da7c`. Plan and Apply passed;
  HTTP health/UI returned 200, sibling IIS sites were preserved, no database
  migration/data import occurred, and the temporary operator tasks were removed.
  ACL and configuration preimages remain in the private operator directory.
- Git source writes cover objects, development refs, HEAD and publisher-created
  root lock/packed-ref files. Native LOCAL SERVICE prepare/abort transactions
  passed for both branch update and incoming-ref deletion. Opening existing Git
  config for write was denied and its digest remained unchanged. Hooks and
  credential directories were excluded. Server Git is `2.56.0.windows.2`.
- The actual HTTP download matched the sealed artifact: 34,705,988 bytes,
  SHA256 `82b06a472c85e986936b3d280c6f4b4430bb1315c0e48feb58c62db1f10ba7e0`.
  The public installer contains no private repository URL; repository metadata
  is supplied only after authenticated pairing. HTTPS/SSH origins are verified
  against that authorized profile.
- The owner installed the exact downloaded production Setup script on this
  laptop. Device `fc_b21ed71ca3f8d3ee98d4d76ea171d079` is paired to the existing
  owner account and `D:\servixDev`. Its task
  `FrevOS-Connector-fc_b21ed71ca3f8d3ee98d4d76ea171d079` is Running with a Limited
  principal; the server observed its heartbeat. The device credential is stored
  under the user's LOCALAPPDATA with CurrentUser DPAPI, not in the repository.
- Before/after setup, source HEAD remained
  `89c419b1dfa3c019e5fd2f888ed322bb2c92c96b` on
  `feature/server21-servix-dev-preservation`; working-tree status also matched.
  The owner made that commit independently; the agent did not create a source
  commit or publish these changes during connector setup.
- Visible browser acceptance passed at
  `http://10.9.69.20/deployments/deploy-72`: download link and owner invitation
  controls visible, paired laptop online, selected source correct, Deploy
  enabled, zero page errors. No invitation code or password was captured.
- The updated connector module was installed from the verified HTTP ZIP without
  re-pairing or changing its DPAPI credential. A controlled stop of the actual
  owner's task at 09:06:08 UTC automatically recovered at 09:06:26 UTC, with a
  fresh online heartbeat by 09:06:40 UTC; no manual restart was issued.
- The browser accepted one retry `sd_8aa86bca8f6eb124373a34af559b6f09` (HTTP 202).
  While the POST was deliberately held, the button disabled immediately and the
  elapsed timer advanced to 00:12. With the request released, automatic source
  publication produced `bad4403be6550167e9afd842c6ca6d6b40ecf69e` on laptop and
  server20. The button remained disabled after polling and page refresh while
  the frontend built. Invitation fields were absent from the normal deploy flow.
- The retry succeeded at 09:13:54 UTC (14:43:54 IST). Independent readback matched
  all 106 deployed code files to artifact
  `cfdf87c3afd3b6acf25b14cb4772414206afed58554b005ff4fe43c36de10695`.
  The target operator verified 145 persistent files unchanged, production listener
  identity preserved and IIS configuration unchanged. Hosted health returned
  200 / OK with both bootstrap flags ready. The frontend changed from
  `main.95eaa35a.js` to `main.cdee177f.js`; the served script contains the new
  white-text rounded badge style. Authenticated visual inspection inside the
  Servix dashboard was not performed. On completion the FrevOS spinner disappeared
  and Deploy re-enabled; zero page errors were observed.
- Evidence: `.local/connector-owner-install.json`,
  `.local/connector-browser-acceptance.json`, `.local/connector-live-panel.png`,
  `.local/connector-artifact-final.log`, `.local/connector-activation.json` and
  its linked private Plan/Apply receipts.

## Changed files

Full worktree delta includes the earlier HTTP/deployment pilot work; none was
discarded or committed. Machine-readable inventory: `.local/connector-changed-files.json`.
Diff stat: 73 files, 6968 additions, 124 deletions.

<!-- BEGIN:connector-files -->
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
- `deployment/servix/reused-operator.json`
- `deployment/servix/web.config`
- `docs/CURRENT_STATE.md`
- `docs/DEVELOPER_CONNECTOR_HANDOFF.md`
- `docs/SERVER20_HTTP_HANDOFF.md`
- `docs/SERVIX_DASHBOARD_HANDOFF.md`
- `docs/adr/0038-server20-internal-http.md`
- `docs/adr/0039-server20-servix-git-dashboard.md`
- `docs/adr/0040-portable-developer-connectors.md`
- `docs/adr/README.md`
- `packages/contracts/src/auth-cookies.ts`
- `packages/contracts/src/developer-connectors.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/servix-deployment.ts`
- `packages/contracts/test/auth-cookies.test.ts`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
<!-- END:connector-files -->

## Remaining acceptance and limitations

### Connector recovery and deployment feedback (2026-10-21)

At 13:58 IST the owner's connector task was Ready rather than Running. The
previous action ended with `0xC000013A` (interruption); the initiating cause is
unknown. The server-side device remained active, with its last heartbeat at
07:55:06 UTC. Starting the existing scheduled task restored fresh heartbeats and
the live dashboard's Online state and enabled Deploy button. The owner then
requested automatic recovery. The existing Limited task now retains its logon
trigger and has an indefinite one-minute recovery trigger with IgnoreNew;
credentials and identity remain unchanged. The installer supplies the same
settings for future devices. A disposable native Limited task exited with the
same interruption code and restarted at its recovery trigger. This does not
establish recovery while the user is logged out or the laptop is asleep.

The owner's first live attempt `sd_821f8ea5fa294b69dfe5294116465914`
created local commit `b3e20a6fc870bdcaa20ed2bee5d257686a1c092f` and uploaded its
bundle, but server20 could not update its branch. Read-only Git prepare/abort
transactions under the actual LOCAL SERVICE identity reproduced permission
denials for root `HEAD.lock` and `packed-refs.lock`. The previous generic
`local-git-failed` message described the wrong stage. The old failed record,
bundle and incoming ref are retained as evidence.

The correction adds root-file creation, Creator Owner access for files created
by the publisher, and HEAD modification; existing Git config/hooks and deployment
credentials remain outside its write permissions. Heartbeats have a separate
authenticated endpoint and bounded presence lease, independent of serialized Git
imports. Expired/revoked credentials cannot renew presence. The client reports
bundle-upload failures separately from local Git failures.

The UI immediately shows a spinner, stage and elapsed timer, rejects synchronous
duplicate clicks, and preserves newer accepted records when a stale poll arrives.
The developer invitation form is hidden behind Add developer; deployment still
uses the authenticated user. New regression coverage exercises poll ordering,
presence during a blocked import, expiration/revocation and presence capacity.
`pnpm.cmd run ci` passed 207 tests, required coverage, build and dependency audit
with no known vulnerabilities. Native task recovery and all operator PowerShell
syntax checks passed. Live correction rollout, owner-connector update, actual
automatic recovery and end-to-end deployment passed. Evidence includes
`.local/connector-recovery-ci-final.log`, `connector-recovery-apply.log`,
`connector-recovery-git-permissions.log`, `connector-recovery-live-acceptance.json`,
`connector-recovery-ui-busy.json`, `connector-recovery-target-acceptance.json`,
`connector-recovery-browser-success.json` and `connector-recovery-badge-build.json`
under `.local/`.

No additional developer account or invitation was created. Real invitation/RBAC
behavior was exercised against disposable PostgreSQL; the live owner login,
pairing, installation, limited task and heartbeat were exercised on the real laptop.

The pilot still uses one shared development branch and target. Divergent commits
require an ordinary Git merge/rebase by the developer; the connector cannot
silently resolve them. Builds are trusted-source builds under the existing
Windows service identities, not a sandbox for untrusted tenants. Existing backend
dependency compatibility and SQL bootstrap limitations still apply. Device
credentials expire after 90 days. Reboot, offline-mid-transfer, very large/slow
transfers and installation from a separate non-admin Windows account remain
unverified; the actual runtime task's Limited principal is verified. New frontend
dependencies still depend on server20 registry/cache availability; automatic
backend dependency installation is outside this source-only profile. The current
`htmlparser2` addition is compatible with the observed server21 dev `8.0.2` install.
Historical job/artifact retention remains
bounded by capacity checks and needs an operational retention policy.
