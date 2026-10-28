# Discovery ownership and approved device onboarding

Implementation date: 2026-10-28. Status: **PASS — published and live on Server20**.
Actual DevSetu request `pr_8615ebaba63e611c68f997505b229e70` succeeds, source
`3e97455a43d15edc46bf2f61e6fa5a6364177383`, manifest
`1b9ae1cbc550996a2e18399a00c68f61d5ceedbfed36813e098cd59686fc4e47`.
No live user creation, role grant, ownership reassignment, certificate change or
Servix application deployment occurred. Final runtime storage/bootstrap and UI
verification are recorded below.

Continuation authorization, 2026-10-28: the owner's direct “approval h bhai”
authorizes the pending question's configured DevSetu publication and server build
for branch `codex/discovery-role-access`, reviewed implementation patch
`8206e2d1ccfc0438a5f5e730be9b865cb883c693a2f0a89717e8c16b50ed589d`.
Live activation remains a separate exact-artifact review. No Servix action, live
account/role grant or certificate change is authorized by this publication step.

The owner's subsequent direct instruction, “bhai sb deploy kr do sara approval h”,
expands this continuation to the complete configured publication/build/activation
of this same reviewed Discovery update on Server20. Bind the authenticated UI
request, source commit, exact generated artifact, target and one-use native approval
at execution. Servix application deployment, user grants and certificates remain
outside scope. The initial build-only boundary above is retained as history.

The enrolled local DevSetu builder's two packaging helpers were still the exact
base-commit versions. They are updated to the reviewed source bytes with verified
before-images, preserving ACLs, encrypted executor identity and the pinned native
adapter; no task restart or privilege change occurs. Receipt:
`.local/discovery-build-operator-update.json`. Publication and destination activation
still run through the actual DevSetu UI/worker flow, not a manual Git/deploy command.

Repository: `mishrarishav/FrevOS`, checkout
`D:\FREVOS\.local\worktrees\servix-dashboard`, branch
`codex/discovery-role-access`. Base and current HEAD:
`8aaf286dad968f1618b0284afe9522e6597c4cbf` at initial implementation review.
Configured publication now produces `6b82769f66572a55a34808527a41d00e5f356aa3`,
then documentation-only correction `6770c803ddf9b406c1d8d870f1fce48e5156745f`.
The final configured result is `3e97455a43d15edc46bf2f61e6fa5a6364177383`;
application source remains identical to the first publication (Git diff of
apps/packages/deployment exits 0). Final handoff-only edits are not a new release.
No new GitHub pull request or merge exists. Current roadmap boundary remains Phase 4.
ADRs [0070](adr/0070-discovery-role-and-owner-visibility.md) and
[0071](adr/0071-device-bound-login-and-approved-join.md) record the owner's scope;
[0072](adr/0072-http-connector-confirmed-login.md) records the retained HTTP method.

## Implemented behavior

- Server-derived ordinary/admin capabilities replace Discovery's fixed-name
  administrator check. The versioned `DiscoveryAccessPolicy.json` preserves the
  current initial owner; verified active membership can also grant `discovery:admin`.
  Ordinary users see their own systems and assigned project reports. Admins see
  the workspace. Foreign-owner content, folders and process controls stay denied.
- UI removes unavailable controls and clears stale protected state after loss
  of authorization. Report bindings are filtered by current user/device/source;
  unassigned projects cannot leak through the ordinary Discovery summary.
- Ordinary local-password login requires a running updated account-owned system
  connector. A short-lived browser-cookie transaction and distinct one-use proof
  complete login without exposing the device credential to the browser. Sessions
  retain a private binding across restart, and protected requests recheck pairing
  and current membership. Admins may sign in from unpaired computers.
- Login-screen Request to join supports both new users and existing users'
  additional computers. New users select their own password; the server retains
  only a private salted verifier before approval. Existing passwords are verified
  and never reset. Requesters cannot choose roles or obtain a login session.
- Discovery's admin-only Join requests inbox reviews the exact account, device,
  platform and metadata consent. Approval records bind actor, workspace, target,
  digest, expiry and single use; durable consumption precedes account creation.
  New identities receive existing ordinary developer scopes, never an admin role.
- The requester receives a code after approval and a browser-suggested Windows
  or Linux x64 download with manual OS override. Only the hash reaches the server;
  the raw code stays in the requesting browser, outside URLs and audit records.
  Codes expire 15 minutes after approval and bind locally generated credentials
  to the preallocated device. Exact retries are idempotent; changed bindings fail.
- Admin direct registration can assign the device to a selected active workspace
  account. Approval actor and eventual device owner remain distinct and audited.
- Windows `Setup.cmd` accepts an approved join code without admin credentials or
  a project. Linux `install.sh` now defaults to the same system-only flow using a
  non-root user systemd service; explicit `--project` preserves project setup.
  Native Node/PowerShell project/account launchers complete device proof as well.
- Linux inventory verification, private credential files, same-device resume,
  runtime update and recovery preserve monitoring state and unknown files. Recovery
  storage is capped at three copies and further updates fail closed. This setup
  does not offer Linux desktop notifications. Existing project execution is separate.
- Platform packaging explicitly copies the three new control-plane modules and
  two contract modules (including declaration/source-map outputs), and records
  the new source inputs. The release delta allowlist admits only those named
  modules; unrelated executable, migration, environment and upload deltas stay denied.
  One pre-existing preview-launcher discard assignment is expressed as `[void]`
  instead of assigning to `$null`, preserving behavior and satisfying the unchanged
  release reserved-variable gate. No acceptance check is weakened or modified.

## HTTP decision and safe rollout

The owner explicitly says HTTPS is not needed now. The earlier HTTPS prerequisite
applied to automatic cross-origin loopback fetch, and is superseded by ADR 0072's
explicit connector-page method. Trusted versioned configuration chooses the method;
a browser cannot downgrade it. No certificate, trust, browser flags or permission
settings are changed. The alternative loopback-fetch mode retains its HTTPS gate.

On HTTP, valid password authentication creates only a pending browser transaction.
The user follows a named own-system link to its loopback page and explicitly
confirms. The connector posts its distinct proof in a body to its fixed DevSetu
origin. That receipt issues only an HttpOnly receiver cookie, not a session. The
same-origin completion requires both that cookie and the original pending cookie.
Forwarding to a different browser cannot complete the login. Ports, workspace,
user, credential version, pairing, expiry, replay and current role are checked.
Only the non-authorizing transaction ID travels in a fragment; no proof/secret
travels in a URL. The local form sends only its origin as referrer, preserving its
real Origin header without exposing a path/fragment. The server continues to deny
null or foreign origins. Main-frame navigation is a separately supported browser
interaction ([vendor guidance](https://learn.microsoft.com/en-us/deployedge/ms-edge-local-network-access)).

Earlier read-only TLS probes found port 443's certificate expired and 8443 timed
out. These are historical diagnostics, not a current request to add HTTPS. No
certificate/binding/trust changes are made. Scoped platform publication/activation
review remains; prior Servix approvals do not apply.

The pilot retains the same configured HTTP origin. Publish the compatible
connector downloads together with the server, retain admin bootstrap, then update
existing system connectors before ordinary users sign in again. Their same-origin
update preserves identity/credential/state. Do not install the new proof-port
heartbeat against the old live server: its strict schema predates that field.
Ordinary project-only
legacy connections need system enrollment first. A different origin remains a
separate reviewed migration; credentials are never silently sent elsewhere.
Old ordinary browser sessions must sign in again. If their connector is not yet
updated, the login screen provides public Windows/Linux update links after the
device check fails, so they are not forced into a duplicate registration. Existing
system setup verifies the same-origin protected connection before updating it.

## Observed verification

- `pnpm.cmd run typecheck`: PASS, exit 0 after the implementation and fixtures.
- `pnpm.cmd run format:check`: PASS, exit 0 (240 files). Full lint exits 0 (242 files,
  231 warnings / 792 informational diagnostics, zero errors); no rule or coverage
  threshold was reduced. `pnpm.cmd run validate:repo` exits 0 (110 Markdown files),
  and `git diff --check` exits 0. Retained final repo/format/lint logs have the prefix
  `.local/discovery-http-final-`.
- `pnpm.cmd --filter @frevos/control-center run test:coverage`: 17 files / 99
  tests PASS; statements, branches, functions and lines all 100%.
- `pnpm.cmd --filter @frevos/contracts run test:coverage`: 13 files / 88 tests
  PASS; statements 98.31%, branches 92.77%, functions 93.54%, lines 98.71%.
- First broad backend recheck: 49/51 files pass, with a legacy fixture that had
  not declared its admin and a Windows module-resolution failure. The fixture
  now explicitly declares its trusted admin; native checks run with the Windows
  PowerShell module path, without changing host settings. Focused rechecks pass.
- Earlier broad backend run: all 52 files / 204 tests PASS, but statements 94.49%
  fail the unchanged 95% gate. Additional tests exercise expiring binding
  pruning, consent initialization, interrupted-approval recovery, account collision,
  altered verifier/audit, admin-assigned ownership and rate-limit reset. Final
  broad coverage recheck now passes. A subsequent diagnostic run passed 51/52 files
  but the existing component deployment test exceeds its unchanged 120-second
  limit. Its assertion-identical temporary diagnostic copy then passes in 43.58
  seconds; that diagnostic file is removed. The final original suite passes below.
- Final `pnpm.cmd --filter @frevos/control-plane run test:coverage -- --coverage.reportOnFailure`:
  exit 0, all 52 files / 205 tests PASS, duration 311.40 seconds. Statements 95.08%
  (4525/4759), branches 91.48% (3213/3512), functions 96.8% (970/1002), lines 96.62%
  (4236/4384). Gates and the existing component test timeout are unchanged. The
  invoking process temporarily uses the native Windows PowerShell module path
  and restores its previous value; no host policy/module setting is modified.
  Final contracts recheck also exits 0, 13 files / 88 tests with the same coverage.
  Combined backend/UI/contracts count: 392 tests across 82 files.
- After the final PowerShell discard change,
  `pnpm.cmd --filter @frevos/control-plane exec vitest run test/local-development-runtime.test.ts`
  exits 0: all four tests pass in 94.21 seconds, including actual Windows child
  process startup/restart/containment checks. These are overlapping rechecks of
  the existing suite, not four additional distinct tests. Log:
  `.local/discovery-http-preview-runtime.log`.
- Final `pnpm.cmd run build`: exit 0 with `VITE_FREVOS_AUTH_MODE=local` scoped to
  that process and restored afterward. Existing 500 kB chunk warning remains
  (UI bundle 621.53 kB); no build limit is changed. Retained logs:
  `.local/discovery-http-final-build.log`, `.local/discovery-role-http-control-plane.log`,
  `.local/discovery-role-http-ui.log`, `.local/discovery-http-final-contracts.log`.
- Real Fastify/PostgreSQL fixtures use a non-owner, non-superuser RLS role and
  synthetic accounts. Positive proof, wrong owner/browser/credentials, replay,
  expiry, role revocation, new/existing approval/rejection and own-data access run
  through the actual services and HTTP contracts. No live account is used.
- Actual in-app browser verifies unpaired ordinary login denial, both join choices,
  Windows OS suggestion, an existing-user request staying pending, administrator
  login without a local connector, explicit admin review, requester code/download
  and admin visibility across owners. Admin UI approval is consumed by the actual
  Debian connector. Local operator-only image: `.local/discovery-role-admin.png`;
  this ignored evidence is not part of the published source checkout.
- Browser policy blocks navigation to the installer's private `file://` bootstrap.
  That block was not bypassed. Full installer-browser acceptance remains unverified.
  A different actual browser test on an HTTP private network origin passes the
  ordinary user's connector confirmation, return receipt, protected session and
  own-data Discovery. Its one Online system is visible; the admin's device and
  admin approval controls are absent. Local operator-only image:
  `.local/discovery-http-user.png`, retained outside Git.
- Real Debian 12 x64 guest: non-root UID 1000 / actual user systemd, approved-code
  redemption, authenticated Online health, protected credential mode/owner, runtime
  update, startup-failure recovery and unchanged credential/monitoring data PASS.
  The owned fixture is stopped afterward; its volume and other containers remain.
  Ubuntu/RHEL/Rocky native acceptance is not claimed for this new flow.
- Windows installer package: 1,983 entries / 12 runtime digests verify. Linux final
  package: 8 runtime digests verify; extracted non-root Linux process exercises the
  proof listener and confirms the project compatibility helper is present.
- Windows package SHA256:
  `455b24f6ad0cf7d7c388397a8f183a724e442070527a822ede594986fa083779`.
  Linux package SHA256:
  `75aae1579a5cb31f499ca8a53818dfc566118a77fe4f750ca18618d537ac138f`.
  The final Windows ZIP is inside the final whole-platform package below at
  `deployment/servix/connector.zip`; it includes the final launcher change. The
  identical Linux archive is also at `.local/discovery-http-linux-x64.tar.gz`.
  Earlier standalone Windows ZIPs are superseded, not live downloads.
  Windows ZIP verification opens each runtime entry and recomputes all 12 SHA256
  values; installer launchers and both HTTP confirmation paths are present.
  Linux verification exits 0 in an unprivileged UID 1000 Node 24.19 Debian container
  with networking disabled, a read-only filesystem and dropped capabilities; all
  eight runtime digests, project compatibility and the actual proof listener pass.
- `pnpm.cmd run audit`: exit 0; 5 low / 6 moderate advisories, no high/critical.
  No dependency or lockfile change. Existing Servix dependency-risk decisions
  remain separate and unchanged.
  Final audit output is retained in `.local/discovery-http-final-audit.log`. These
  dependency checks and authorization/storage negative tests do not constitute
  an independent repository security scan.
- `node .local/discovery-role-secret-patterns.cjs`: exit 0, no private-key/common
  provider-token patterns in tracked additions or the 20 new files. This is a
  limited pattern check; a dedicated independent secret scanner is unavailable.
- Native PowerShell release-boundary check: exit 0, all 20 named new module/output
  deltas accepted, five unrelated executable/migration/environment/archive/upload
  deltas rejected, and the two changed packaging scripts plus the login module
  parse without syntax errors. The unchanged manifest gate still rejects any
  unexpected broader file change.
- Whole local platform build using
  `deployment/server20/New-ServixDashboardRelease.ps1 -PreviousPackageRoot .local/servix-release-00f04fc2faa2417381bd70a69317d359/package -SourceRoot .`:
  first attempt exits 1 because the pinned Node Linux runtime download hits its
  unchanged 300-second timeout. The exact-source retry exits 0, including source
  stability, compiled dependency closure, manifest integrity and bounded delta.
  That first successful package was superseded after the unchanged acceptance
  script flagged the pre-existing `$null` discard assignment in the preview
  launcher. The behavior-equivalent `[void]` correction and native runtime recheck
  above resolve it; the acceptance script is unmodified.
- Final whole platform build exits 0 and creates 3,994 files in
  `.local/servix-release-eaa53c75225e4aaf902ff1fe09d2cfda/package`.
  Manifest SHA256 `baff00a1c97ee9c9a2211fffb820c04f0df467d85d3735d16add865c1965359c`;
  archive SHA256 `73700619318a1b13aa034d33960e520fff88143605afe013dd670b6702653efe`.
  Retained output: `.local/discovery-http-platform-package-final.log`.
  `deployment/server20/Test-ServixDashboardRelease.ps1 -PackageRoot <that package> -ManifestSha256 baff00a1c97ee9c9a2211fffb820c04f0df467d85d3735d16add865c1965359c -PreviousPackageRoot .local/servix-release-00f04fc2faa2417381bd70a69317d359/package`
  exits 0: exact artifact, bounded delta, wrong digest/migration denial, all native
  script syntax and reserved-variable gates PASS. Log:
  `.local/discovery-http-platform-verify-final.log`. All three new compiled
  services import without starting the application or contacting live
  infrastructure; all 20 new runtime outputs and the policy are in the manifest.
  This is a local
  uncommitted-source test artifact, not a published/approved live release. The
  configured workflow must freeze and rebuild the authorized published source.

## Configured execution checkpoints

- Actual UI request `pr_7f5fff2f4d234a6d9074a45130e9e947` publishes 6b82769f6657;
  native job `cj_71314d9db82e1660631c37fa1f700d5b` fails CI before tests because
  three Markdown references point to ignored operator screenshots. Their paths
  remain intact locally and are now described as local evidence, not portable links.
  A clean exported source tree passes all 110 Markdown checks without `.local`.
- Actual UI retry `pr_a34afc3b5e2f023373dd93f7de110fda` publishes 6770c803ddf9;
  native job `cj_c40e271571bc67f52609d0cc76fdefe0` passes repository/format/types,
  contracts and UI coverage, and 49/52 backend files. Three database fixture files
  fail immediately because the local Docker engine is absent. No artifact or
  destination action is produced; active Server20 remains bb5e5ed03785.
- Docker startup reports a stale zero-byte inference runtime endpoint. With the
  daemon stopped, verify the exact plain parent directories and their complete
  zero-byte endpoint inventories, then retain those parents under unique sibling
  names. No recursive deletion, image/volume reset, secret value or security setting
  change occurs. `docker desktop start` exits 0 and engine 29.7.2 responds; all four
  existing local preview containers are still present. Receipt:
  `.local/discovery-docker-startup-recovery.json`.
- Run the three failed database files against the SAME frozen source 6770c803 and
  the enrolled native builder's exact filtered environment: 23/23 tests PASS,
  exit 0. Safe report `.local/discovery-frozen-database-recheck.json` retains only
  counts/statuses, not raw child output or credentials. A new complete configured
  CI/package/activation attempt is still required; no failure record is replayed.

### Final configured rollout — PASS

- Actual UI request `pr_8615ebaba63e611c68f997505b229e70`, published source
  `3e97455a43d15edc46bf2f61e6fa5a6364177383`, native builder job
  `cj_a764b0d266eb285b3307f62a05f4cac3`: full configured CI passes before its
  enrolled packager starts. Vitest caches show 13 contracts, 17 UI and 52 backend
  files, zero failed files. Contracts coverage 98.31/92.77/93.54/98.71%; UI all
  100%; backend 95.08/91.48/96.8/96.62% (statements/branches/functions/lines).
  These are the unchanged required gates, not a partial-suite substitution.
- The committed-source package has 3,994 files. Manifest
  `1b9ae1cbc550996a2e18399a00c68f61d5ceedbfed36813e098cd59686fc4e47`, archive
  `df954b58cbed81850d557d5304ac9fececfaee0ab9d5cb0a6675fc025d68e2a5`, native
  descriptor artifact `a07cbfc03c82ecdab08716e164e3bc528d8946b84d27c8f059e4178e3129a99a`.
  The unchanged exact-artifact acceptance script exits 0 against this package
  and its actual baseline: manifest, delta, wrong-digest/migration denial and
  native syntax/reserved-variable gates pass. Log:
  `.local/discovery-native-exact-artifact-check.log`.
- Destination job `cj_447e88612041447021e155813294b684` and independent native
  Plan/Apply both PASS. Existing Native Windows actor, workspace, target,
  correlation, source, manifest and archive bindings match; the fresh expiring
  approval is consumed once. Health/UI return 200, siblings are preserved and
  `databaseWritten=false`. All existing runtime configuration values compare
  equal to their private before-image without reporting secret values.
- Read-only `node .local/Verify-DiscoveryLive.cjs`: exit 0. Active manifest equals
  the reviewed native package and its source. Public JavaScript (621,535 bytes),
  Windows installer (39,012,247 bytes) and Linux archive (48,845,013 bytes) all
  return 200 and match the released manifest hashes. Live Windows ZIP SHA256
  `0ab6742c7bd3b5056e39065184d4c8cde3d5d30f371a78b71abeffe001205702`;
  Linux SHA256 `75aae1579a5cb31f499ca8a53818dfc566118a77fe4f750ca18618d537ac138f`.
  Safe report `.local/discovery-live-verification.json`.
- Actual live browser shows DevSetu **succeeded**, new artifact a07cbfc03c82,
  and source 3e97455a43d1. Fresh Discovery at `/systems/discovery` shows
  **Admin · All workspace systems**, the new Join requests control and existing
  system observations. Images remain operator-local:
  `.local/discovery-release-live.png`, `.local/discovery-admin-live.png`.
- Live Join requests initially reports unavailable because the legacy Windows
  `servix/private` parent intentionally excludes Local Service. Provision ONLY
  its new empty `join-requests` child with a protected ACL for the existing
  service identity (Modify), existing operator/admins and SYSTEM. Parent ACL is
  verified unchanged; no existing credential is read and no database write or
  user grant occurs. This uses a separate fresh scoped one-use initialization
  approval, not the consumed deployment approval. Versioned fixed-target tool:
  `.local/Initialize-DiscoveryJoinStorage.v1.ps1`; receipt
  `.local/discovery-join-storage-bootstrap.json`, with matching private audit
  records beside the native operator job. The protected `servix` state persists
  across later deployments; a fresh Windows control-server bootstrap must also
  initialize this service-owned child. Do not grant service access to its parent.
- The live admin inbox then loads successfully with zero requests and no error.
  `.local/discovery-join-inbox-live.png` records that state. No real test user,
  pending request, consent or role is created to manufacture acceptance.

## Remaining limits and next step

Join storage fails closed at 500 retained requests; no audit/history purge or
automatic role escalation is introduced. Pending requests expire after 24 hours.
Device-login transactions cap at 128 globally / four per account, expire after two
minutes, and session binding storage prunes expired records at its 1,000-record cap.
Raw passwords and connector credentials are absent from API views/audit evidence.
The proof protects the enrolled credential boundary; hardware attestation is not
implemented. Existing ordinary scopes are preserved rather than redesigned.

The authorized configured rollout, exact native approval/receipt checks, live
health, downloads and admin UI checks pass. Existing ordinary system connectors
must explicitly update from the live trusted download before paired-only login;
their pairing/state are preserved. Admin bootstrap remains available. Real-user
ordinary login and the full Windows installer browser bootstrap are not claimed
from the admin-only live checks; same-source isolated browser/native evidence
above remains distinct. Next bounded scope can address fresh-server bootstrap
automation and the inbox's generic project-oriented empty-state hint.

The owner also raises Android as a possible additional connector. It is not
implemented or advertised by the current Windows/Linux contracts/downloads.
An Android app, platform capability contract, consented storage access and
Android-specific background scheduling need a separately bounded mobile scope.
Keep Servix frontend/backend, uploads, attachments, environment files and databases
untouched. The prior dirty Servix handoff and Current State evidence are preserved.

## Complete published change inventory

Repository `mishrarishav/FrevOS`, branch `codex/discovery-role-access`. Base `8aaf286dad968f1618b0284afe9522e6597c4cbf`; resulting configured source `3e97455a43d15edc46bf2f61e6fa5a6364177383`. No GitHub PR or merge. This range includes the two retained pre-existing Servix evidence edits. All published application code is live; only final evidence documentation remains uncommitted after deployment.

Original implementation review patch SHA256: `8206e2d1ccfc0438a5f5e730be9b865cb883c693a2f0a89717e8c16b50ed589d`. This is a historical review identifier, not a deployed manifest. Application source equality between the first publication 6b82769f and final source 3e97455a is independently checked with Git (exit 0).

- `M apps/control-center/src/App.tsx`
- `M apps/control-center/src/DiscoveryPage.tsx`
- `A apps/control-center/src/JoinRequestForm.tsx`
- `A apps/control-center/src/JoinRequestsInbox.tsx`
- `M apps/control-center/src/RecordWorkspace.tsx`
- `M apps/control-center/src/SystemPairingDialog.tsx`
- `M apps/control-center/src/api.ts`
- `A apps/control-center/test/device-join-api.test.tsx`
- `M apps/control-plane/src/control-center.ts`
- `M apps/control-plane/src/developer-connectors.ts`
- `A apps/control-plane/src/device-logins.ts`
- `A apps/control-plane/src/discovery-access.ts`
- `A apps/control-plane/src/join-requests.ts`
- `M apps/control-plane/src/main.ts`
- `M apps/control-plane/src/repositories.ts`
- `M apps/control-plane/src/server.ts`
- `M apps/control-plane/src/system-discovery.ts`
- `M apps/control-plane/test/accounts.integration.test.ts`
- `M apps/control-plane/test/control-center.test.ts`
- `M apps/control-plane/test/device-enrollment.test.ts`
- `A apps/control-plane/test/device-logins.test.ts`
- `A apps/control-plane/test/discovery-access.test.ts`
- `A apps/control-plane/test/join-login.integration.test.ts`
- `A apps/control-plane/test/paired-login-clients.test.ts`
- `M apps/control-plane/test/postgres-service.integration.test.ts`
- `M apps/control-plane/test/system-discovery.test.ts`
- `M deployment/server20/HttpCommon.ps1`
- `M deployment/server20/New-ServixDashboardRelease.ps1`
- `M deployment/servix/Connector.cjs`
- `M deployment/servix/DeviceEnrollment.cjs`
- `M deployment/servix/DeviceEnrollmentClient.js`
- `A deployment/servix/DiscoveryAccessPolicy.json`
- `M deployment/servix/New-ConnectorDownload.ps1`
- `M deployment/servix/New-LinuxDownload.mjs`
- `A deployment/servix/PairedLogin.psm1`
- `M deployment/servix/Run-LocalDevService.ps1`
- `M deployment/servix/START-HERE.txt`
- `M deployment/servix/Setup-Connector.ps1`
- `M deployment/servix/Setup-Executor.ps1`
- `M deployment/servix/Setup-Linux.cjs`
- `A deployment/servix/Setup-SystemLinux.cjs`
- `M deployment/servix/SystemEnrollment.cjs`
- `A deployment/servix/SystemLinuxInstaller.cjs`
- `M deployment/servix/install.sh`
- `M docs/CURRENT_STATE.md`
- `A docs/DISCOVERY_ROLE_ACCESS_HANDOFF.md`
- `M docs/SERVIX_APPLICATION_RELEASE_HANDOFF.md`
- `A docs/adr/0070-discovery-role-and-owner-visibility.md`
- `A docs/adr/0071-device-bound-login-and-approved-join.md`
- `A docs/adr/0072-http-connector-confirmed-login.md`
- `M docs/adr/README.md`
- `M packages/contracts/src/developer-connectors.ts`
- `A packages/contracts/src/device-login.ts`
- `M packages/contracts/src/index.ts`
- `A packages/contracts/src/join-requests.ts`
- `M packages/contracts/src/system-discovery.ts`

Published diff stat:

```text
apps/control-center/src/App.tsx                    |  94 ++-
 apps/control-center/src/DiscoveryPage.tsx          | 233 ++++---
 apps/control-center/src/JoinRequestForm.tsx        | 301 ++++++++
 apps/control-center/src/JoinRequestsInbox.tsx      | 245 +++++++
 apps/control-center/src/RecordWorkspace.tsx        |  14 +-
 apps/control-center/src/SystemPairingDialog.tsx    |  46 +-
 apps/control-center/src/api.ts                     |  94 ++-
 apps/control-center/test/device-join-api.test.tsx  | 228 ++++++
 apps/control-plane/src/control-center.ts           |  12 +-
 apps/control-plane/src/developer-connectors.ts     |  76 +-
 apps/control-plane/src/device-logins.ts            | 266 +++++++
 apps/control-plane/src/discovery-access.ts         |  62 ++
 apps/control-plane/src/join-requests.ts            | 494 +++++++++++++
 apps/control-plane/src/main.ts                     |  43 ++
 apps/control-plane/src/repositories.ts             |  70 +-
 apps/control-plane/src/server.ts                   | 207 ++++++
 apps/control-plane/src/system-discovery.ts         |  47 +-
 .../test/accounts.integration.test.ts              |  94 +++
 apps/control-plane/test/control-center.test.ts     |  16 +
 apps/control-plane/test/device-enrollment.test.ts  |  84 +++
 apps/control-plane/test/device-logins.test.ts      | 370 ++++++++++
 apps/control-plane/test/discovery-access.test.ts   | 134 ++++
 .../test/join-login.integration.test.ts            | 774 +++++++++++++++++++++
 .../test/paired-login-clients.test.ts              | 103 +++
 .../test/postgres-service.integration.test.ts      |   1 +
 apps/control-plane/test/system-discovery.test.ts   | 102 ++-
 deployment/server20/HttpCommon.ps1                 |   1 +
 deployment/server20/New-ServixDashboardRelease.ps1 |   3 +
 deployment/servix/Connector.cjs                    | 166 ++++-
 deployment/servix/DeviceEnrollment.cjs             |  83 ++-
 deployment/servix/DeviceEnrollmentClient.js        |   6 +
 deployment/servix/DiscoveryAccessPolicy.json       |   6 +
 deployment/servix/New-ConnectorDownload.ps1        |   2 +-
 deployment/servix/New-LinuxDownload.mjs            |  10 +
 deployment/servix/PairedLogin.psm1                 |  26 +
 deployment/servix/Run-LocalDevService.ps1          |   2 +-
 deployment/servix/START-HERE.txt                   |  24 +-
 deployment/servix/Setup-Connector.ps1              |   7 +-
 deployment/servix/Setup-Executor.ps1               |   5 +-
 deployment/servix/Setup-Linux.cjs                  |   9 +-
 deployment/servix/Setup-SystemLinux.cjs            |  30 +
 deployment/servix/SystemEnrollment.cjs             |   9 +-
 deployment/servix/SystemLinuxInstaller.cjs         | 349 ++++++++++
 deployment/servix/install.sh                       |   6 +-
 docs/CURRENT_STATE.md                              | 109 +++
 docs/DISCOVERY_ROLE_ACCESS_HANDOFF.md              | 391 +++++++++++
 docs/SERVIX_APPLICATION_RELEASE_HANDOFF.md         | 167 ++++-
 .../0070-discovery-role-and-owner-visibility.md    |  56 ++
 .../0071-device-bound-login-and-approved-join.md   |  89 +++
 docs/adr/0072-http-connector-confirmed-login.md    |  51 ++
 docs/adr/README.md                                 |  12 +
 packages/contracts/src/developer-connectors.ts     |   2 +
 packages/contracts/src/device-login.ts             |  29 +
 packages/contracts/src/index.ts                    |   2 +
 packages/contracts/src/join-requests.ts            |  63 ++
 packages/contracts/src/system-discovery.ts         |  10 +
 56 files changed, 5761 insertions(+), 174 deletions(-)
```

Final uncommitted evidence updates: `docs/CURRENT_STATE.md` and `docs/DISCOVERY_ROLE_ACCESS_HANDOFF.md`. They record observed outcomes and do not alter the active application. Local operational scripts/receipts and images are intentionally ignored, not shipped source or public proof links.
