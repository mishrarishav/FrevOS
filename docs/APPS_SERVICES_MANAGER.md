# Apps and services manager

The owner changed the task on 2026-11-06: finish implementation and local tests;
the owner performs final deployment through DevSetu. No new live activation or
connector replacement occurs. ADRs0103–0105 extend Android support, owner-operated
deployment and local WAF. The preceding live baseline stays unchanged.

2026-11-06, ADR 0102. Task branch `codex/apps-services-manager`, based on
`8ec671cc86fc0f721875894bfea0c02f15b199c1`. Application deployment and packaged
acceptance are recorded below when observed; the preceding inventory/explorer
release remains the live baseline until activation succeeds.

Discovery → Software now opens a Windows-style Apps & services workspace. Its
navigation separates Installed apps, Services, Approved catalogue and History.
Windows inventory separates Control Panel registrations, Microsoft Store apps
and the combined registered list. Machine registrations and the connector user's
app packages are included; this does not discover every portable executable or
other users' private app packages. Linux lists package-manager registrations.

Services includes running and stopped Windows SCM or Linux system/user systemd
services, status, startup type and selected-service details. Shared card/table
views, search, column filters, sorting, pagination and scoped session preferences
remain available. Primary controls stay outside the records scroller. Narrow
screens place the selected-service pane below the list with Start/Stop first.

Inventory consent permits reading services. Existing connections default to
service control Off. An owner can enable the separate local Software permissions
checkbox once. An administrator enables a particular service in the revisioned
per-device catalogue, then Start/Stop queues an exact audited request without an
additional DevSetu approval prompt. The existing software-install permission is
independent and is not enabled by this feature. Setup updates preserve a valid
existing service-control selection on Windows and Linux.

Each control request binds workspace, device, current administrator, operation,
policy revision and native definition digest. Claim consumes its short-lived
approval once; execution checks role, local consent, current catalogue and native
definition again. Native OS permissions still apply. Protected infrastructure and
connector services cannot be controlled. No custom command, binary, arguments,
startup changes, driver control or cascading Stop is exposed. An application
administrator does not receive an elevated Windows/Linux token. Definitions are
hashed locally; command lines and service-account identities are not uploaded.

Service scans replace bounded snapshots, independently of installed-app scans.
The connector negotiates server support before sending the new capability.
Default collection is every 30 seconds; connector `serviceRefreshSeconds` is
bounded to 15–300 seconds. A control requires a snapshot no older than 90 seconds;
Refresh services obtains one explicitly. Independent cursors avoid resending
unchanged snapshots to browser polling. Failed scans retain the previous
successful snapshot and display the failure separately. Service collection does
not append file-activity events or unbounded history.

## Pre-release evidence

- Actual Windows read: 320 services, including running and stopped services;
  current SCM access rights read without a service mutation. RPC infrastructure
  is protected and binary/account fields are absent from the snapshot.
- Typed server/client tests exercise consent, admin versus owner, cross-device
  and workspace scope, exact policy/definition, revocation after claim, expiry,
  receipts and replay. Their native action is a fixture, not a live OS change.
- Native Linux adapter fixtures cover fixed arguments, system/user separation,
  native permission denial, active dependents and changed definitions. Existing
  actual Linux installed-connector/migration test passes; its systemd manager
  remains explicitly stubbed.
- Browser layout fixture: 278 apps / 325 services, desktop, 768×1024 tablet and
  390×844 mobile. Category counts, Start/Stop result states, restricted user,
  final-row filtering and card/table filter separation verified. These are
  synthetic records and do not establish live service-control acceptance.
- Final contracts suite: 106 tests, statements 98.03%, branches 92.53%, functions
  92.42%, lines 98.28%. Final control-center suite: 127 tests; tracked
  API/experience/routing coverage 100%. Latest source-details/control tests: 5 pass.
- Final affected backend suite: 94 tests across 19 files, including real
  component Git publication/deploy/rollback and protected data, native Windows
  inventory, Windows write denial, actual non-root Linux explorer/migration,
  receipt recovery, sessions/CSRF/RBAC and Android queues. This scoped run does
  not replace the complete release CI coverage gate.
- Repository validation, format, lint, typecheck and workspace builds pass. The
  final source-details UI build also passes. No dependency gate is weakened.
- Real Linux-container filesystem checks cover canonical aliases, a symlinked
  distribution unit directory, stable Start/Stop definition hashes, changed
  drop-in rejection and missing definitions becoming read-only. The systemd
  command runner remains stubbed. Unit/drop-in reads are bounded to 256 KiB per
  file, 32 paths per unit and 16 MiB per scan; an exhausted scan stops further
  reads. A daemon reload requirement makes controls read-only.
- Android: nine sources compile against the approved API36 SDK; 21 actual JVM
  execution-policy fixtures pass. See [Android scope](ANDROID_APPS_SERVICES.md).
- Actual pinned Coraza smoke: 19 checks pass. Three WAF configuration tests pass.
  See [WAF gateway](WAF_GATEWAY.md). Existing four Docker preview containers
  remain healthy; the separate local WAF sidecar is healthy too.
- Compatibility follow-up: 49 tests across eight affected backend files pass,
  including 11 new real-store format-floor tests and the native 12-check recovery
  fixture. The final four format tests also exercise actual metadata generation
  from real compiled schemas in an isolated package layout. The existing sidecar
  update fixture passes ten checks. Backend build and workspace typecheck pass.

## Release and operational acceptance

Final live deployment is deferred to the owner. No new activation, live connector
replacement, pairing/data/environment change, public WAF route or GitHub push is
performed by this task. Local commits are on `codex/apps-services-manager`.

The earlier frozen source 19572a9 did not finish a passing release build: an
unchanged native Git integration hit its 180-second limit on the memory-pressured
laptop. Its gates/timeouts were not changed, and no failed artifact was activated.
The subsequent local scoped checks above pass; complete original release CI must
still pass when the owner creates the final immutable release.

The current local Windows token cannot create a disposable SCM service (OS error
5). Real service mutation is therefore not claimed; no existing service was used
as a test. Native Windows reads are real; action/receipt paths are typed fixtures.
Android phone lifecycle/signed APK and ESDS/L-1465 live acceptance remain untested.

Before the owner's release, bind the intended source checkout/branch and review
the Android/platform builder and destination sidecar enrollment updates; retain
the existing signing identity. ADR0106 binds reader metadata to actual packaged
schemas, persists a monotonic data-format floor and rejects incompatible
activation/recovery after new state is written. Pre-write legacy recovery stays
available. No enrollment guard is bypassed. The current live profile's source
folder points to the parent
checkout, not this task's nested worktree; this task does not switch that binding.
Publishing the older folder must not be described as releasing these new edits.

In the configured project, use Open deployment, review source folder/branch/last
observed commit, choose Deploy all and confirm its change/approval record. The
existing pipeline publishes source, runs configured CI/build and activates the
result through the independent updater. A legacy unconfigured entry offers
Configure deployment or Review prepared release; prepared activation does not
build new code. The new navigation is local until the owner releases it; the
existing configured source/card deployment path remains available in the old UI.
T-Server routes to the Server20 application, so it does not need a second copy of
the application. The optional WAF is separate infrastructure requiring a compatible
enrolled destination, not an automatic side effect of that application release.

Connector updates after release report the new capabilities with pairing/data
preserved. Service control has a separate one-time local opt-in. Windows/Linux
actions use actual OS rights; Android controls only its own sampling worker.
Existing unreconciled/expired-job hard capacity is retained on desktop connectors
and is not represented as unlimited history; periodic service snapshots do not
create an administrative job for every sample.

## Complete task source inventory

Repository: `mishrarishav/FrevOS`; branch `codex/apps-services-manager`; base
`8ec671cc86fc0f721875894bfea0c02f15b199c1`. Local implementation/validation status: PASS.
Production release/phone/native service-mutation acceptance: not completed.
No PR, remote publication or new live activation is created by this task.
The complete diff/stat is available with `git diff --stat 8ec671cc86fc0f721875894bfea0c02f15b199c1 HEAD`
after the local handoff commit.

- `apps/android-connector/AndroidManifest.xml`
- `apps/android-connector/src/org/devsetu/connector/AndroidSoftware.java`
- `apps/android-connector/src/org/devsetu/connector/AndroidSoftwarePolicy.java`
- `apps/android-connector/src/org/devsetu/connector/HealthSamplingService.java`
- `apps/android-connector/src/org/devsetu/connector/MainActivity.java`
- `apps/android-connector/src/org/devsetu/connector/MonitorService.java`
- `apps/android-connector/test/org/devsetu/connector/SoftwarePolicyTest.java`
- `apps/control-center/src/ComponentDeployments.tsx`
- `apps/control-center/src/DeploymentSettingsPage.tsx`
- `apps/control-center/src/DeploymentsPage.tsx`
- `apps/control-center/src/DiscoveryPage.tsx`
- `apps/control-center/src/PlatformProjectDetails.tsx`
- `apps/control-center/src/RecordWorkspace.tsx`
- `apps/control-center/src/SoftwarePanel.tsx`
- `apps/control-center/src/api.ts`
- `apps/control-center/src/software-inventory-status.ts`
- `apps/control-center/src/styles.css`
- `apps/control-center/test/configured-deployment-workspace.test.tsx`
- `apps/control-center/test/service-controls.test.ts`
- `apps/control-center/test/software-api.test.ts`
- `apps/control-plane/src/server.ts`
- `apps/control-plane/src/software-management.ts`
- `apps/control-plane/test/android-build.test.ts`
- `apps/control-plane/test/android-software.test.ts`
- `apps/control-plane/test/service-client.test.ts`
- `apps/control-plane/test/service-management.test.ts`
- `apps/control-plane/test/service-native.test.ts`
- `apps/control-plane/test/software-format-floor.test.ts`
- `apps/control-plane/test/software-format.test.ts`
- `apps/control-plane/test/software-routes.test.ts`
- `compose.waf.yaml`
- `deployment/android/AndroidBuild.cjs`
- `deployment/android/AndroidBuildClient.cjs`
- `deployment/server20/Apply-ServixDashboard.ps1`
- `deployment/server20/HttpCommon.ps1`
- `deployment/server20/New-ServixDashboardRelease.ps1`
- `deployment/server20/SoftwareDataFormat.mjs`
- `deployment/server20/Test-PreviewExecutorUpdate.ps1`
- `deployment/server20/Test-SoftwareCompatibility.ps1`
- `deployment/server20/Update-PreviewExecutor.ps1`
- `deployment/server20/Verify-AndroidCompatibility.ps1`
- `deployment/servix/ComponentPlatform.ps1`
- `deployment/servix/Software-Consent.ps1`
- `deployment/servix/SoftwareClient.cjs`
- `deployment/servix/SoftwareNative.cjs`
- `deployment/servix/SoftwareNative.ps1`
- `deployment/servix/SoftwareProtocol.cjs`
- `deployment/servix/SystemLinuxInstaller.cjs`
- `deployment/waf/Caddyfile`
- `deployment/waf/smoke-backend.cjs`
- `deployment/waf/waf.env.example`
- `docs/ANDROID_APPS_SERVICES.md`
- `docs/APPS_SERVICES_MANAGER.md`
- `docs/CURRENT_STATE.md`
- `docs/WAF_GATEWAY.md`
- `docs/adr/0102-desktop-apps-and-services-manager.md`
- `docs/adr/0103-android-apps-and-owned-services.md`
- `docs/adr/0104-owner-operated-configured-platform-deployment.md`
- `docs/adr/0105-configurable-coraza-waf-gateway.md`
- `docs/adr/0106-software-data-format-recovery-boundary.md`
- `docs/adr/README.md`
- `package.json`
- `packages/contracts/src/software-management.ts`
- `packages/contracts/test/service-management.test.ts`
- `packages/contracts/test/software-management.test.ts`
- `scripts/create-android-policy-fixtures.mjs`
- `scripts/test-android-software.ps1`
- `scripts/waf-config.mjs`
- `scripts/waf-config.test.mjs`
- `scripts/waf-smoke.mjs`
- `scripts/waf.mjs`
