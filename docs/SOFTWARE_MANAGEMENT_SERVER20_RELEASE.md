# Software inventory and VPN preview: Server20 release handoff

Status: PASS for frozen build, independent artifact/installers, native Plan and
actual Server20 activation. The owner refreshes the expired approval on
2026-11-03 at 11:39 IST; DevSetu maintenance request
su_ecd178442612caeb51b415cc16060240 succeeds with native Apply PASS, health/UI 200,
eight stable pairing identities/credentials and five selected settings unchanged.
All three served installer downloads match the exact manifest below.
The owner updates L-1465 in place; both software permissions are freshly reported
and actual inventory collects 367 records at 12:06:40 IST. The temporary demo
catalogue is saved through DevSetu. No temporary API process has been started.
Live preview remains incomplete: actual configuration Plan rejects Windows DNS
results containing scoped link-local IPv6. ADR 0090 scopes the small follow-up
and a new immutable artifact; no deployed release is edited in place.
Phase 4 remains open. No PR, GitHub push, central-source publication or self-merge.

Repository: mishrarishav/FrevOS, provider ID 1329122983.
Branch: codex/software-inventory-vpn-preview.
Base: 79b5a20fe568bd2afa2b0d2cb943d52d7225f603.
Resulting immutable application source: d0f03f59432b3fcbb1b14021d63b99406fe23210.
Source tree: 49ee53d8668909c32b5ecbb85bb3189c0ebf13fe.
Activation target: DCAPP7/10.9.69.20.
Activation job/candidate: d51023f0dba14c7d9650a56ef21afd85.
Authenticated submitting actor: usr_windows_admin; Windows operator SID is bound
in the private job. Documentation follow-up does not change the application source.

## Exact reviewed artifact

Manifest SHA-256: f8dd3726e5521f2f026c1e8a804c435271c5f341fa10c8b96715314f4e820868.
Archive SHA-256: a01579c5e92382fad81c5b8b818a4e574050d42edd6604fbdfb63f6d6c84a3aa.
Archive bytes: 132079803. Verified package files: 4058.
Committed source inventory inputs reverified: 249.
Previous active manifest: 325bfd6025203c4df7b479a0429a4827283f366eccd9ed49b9645d54e29fee12.
Prepared archive: D:\FREVOS\.local\native-releases\servix-release-9c398e2cceba420c95c500425d77602e\package.zip.
Stored Server20 archive: \\10.9.69.20\e$\FrevOS\component-artifacts\a01579c5e92382fad81c5b8b818a4e574050d42edd6604fbdfb63f6d6c84a3aa.zip.
The prepared-artifact maintenance path uses the enrolled native builder; it is
not claimed as a completed control-plane source-publication pipeline.

## Observed qualification

- Enrolled NativePlatform.build: exit 0 on the exact source above. Clean native
  environment, pnpm frozen-lockfile installation, pnpm run ci, source bundle,
  packaging and internal artifact-store integrity checks complete.
- Exact CI: 104 files / 525 tests: contracts 16/97, frontend 19/108,
  backend 69/320. Original thresholds and timeouts retained; no acceptance
  assertion removed. Typecheck, build, formatting and lint exit 0.
- Backend coverage: 95.13% statements,
  91.8% branches,
  97.16% functions,
  96.87% lines. Frontend API/experience/routing
  coverage 100%. Existing chunk-size warning remains.
- Audit gate: exit 0; five low and eight moderate advisories, no high/critical.
  No library or lockfile version changed for this task.
- Review-ReadySoftwareArtifact.cjs: exit 0, PASS for every packaged hash,
  stored archive, module closure, committed input provenance and retained Android
  signing/data compatibility. Review-ReadySoftwareInstallers.cjs: exit 0.
  Windows archive: 1993 entries / 20
  pinned runtime files. Linux archive: 2478 entries /
  14 pinned runtime files. Native source hashes match.
  Archives were inspected without extracting/executing their payloads.
- Server20 SDK signs Android versionCode 2, APK SHA-256 68a33a38ceb056dbc70c9839c611c80599ebfc5a36e6d04a62d9ffd0d90c4b2b,
  retained certificate 0d3a704822eacaef060a4560c2f800479179eed96dfbf9e94993dcf2b75cec92. No new signing identity.
- Stage-ReadySoftwarePlan.ps1: exit 0; native read-only Plan PASS for the exact
  manifest, databaseWritten=false, temporaryTaskRemoved=true. Selected snapshot
  verifies 14 exact file copies, eight stable pairing identities/
  credential hashes and five selected settings. Existing permissions unchanged.
  This is a selected-file protection snapshot, not a database backup.
- Four owned local previews remain healthy with the same identities, images and
  mounts. The independent Server20 updater is running and integrity verified.
- Existing restricted Android SDK service had stopped with a stale heartbeat.
  Restarting that same service restores fresh health; configuration, service
  binary and three private signing files match before/after hashes. No role,
  SDK enrollment, signing key or parent permission was changed.

## Credential proof and functional limits

The old approved-key journal reference is unavailable. Credential qualification
uses the verified qualified baseline plus strictly reviewed immutable-source /
artifact delta; no unexplained introduced hex token or private-key shape is
accepted. Exact current-key comparison was NOT performed. This is not an
exhaustive secret audit. The prior qualification chain and closed build-input /
whitelisted environment assumptions are retained in private evidence.

Admin Install now represents the exact package/device approval in one action,
with one-time local trusted-management enrollment and revocation checks.
Ordinary-user requests still need an administrator. No raw shell, elevated
broker or automatic OS-rights grant is introduced. Native OS/license/privilege
interaction remains in effect. Actual MSI/DEB/RPM install and privileged Linux
systemd/desktop acceptance are not live-qualified; Linux keeps NoNewPrivileges.
Android software inventory/installation is outside this desktop task.

Actual Windows registry/app inventory, native DPAPI consent opt-in/revocation,
fixed installer verification/launch boundaries, owned temporary child API and
local HTTP relay GET/POST/replay/close/stop are qualified. Non-root isolated Linux
file migration/recovery, inventory and installed collector/software heartbeat
pass with systemctl explicitly stubbed. These do not prove a real phone/Linux
desktop or the pending L-1465 to L-1770 live session.

## Remaining bounded live work

1. Completed: actual exact-artifact approval, authenticated maintenance activation,
   successful native receipt, health and installer/protected-record verification.
   The sealing helper uses the fresh native Plan's server-side archive hash plus
   unchanged staged metadata; Apply independently hashes the ZIP again. A redundant
   client SMB hash is stopped before sealing because small synchronous reads are
   slow over the VPN. The old expired decision is not extended or reused.
2. Completed: owner-run L-1465 in-place connector update and local software opt-in.
   Actual inventory is ready with 367 installed-program records; paired identity
   is retained. No third-party installer or temporary demo process is started yet.
3. Complete ADR 0090's scoped DNS-classification repair, new frozen native build
   and separate exact-artifact approval. Existing deployments stay unchanged
   during preparation; L-1465 needs no second update for this server-only fix.
4. Configure private software preview using strict v2 authority from the actual
   maintenance request/consumed claim/native success receipt. Draft origin
   http://dcapp7:51860 and loopback demo port/lifetime are configurable; DNS
   resolves privately, but listener reachability is not yet proven. No firewall
   or DNS mutation is included in the accepted operator decision.
5. Through DevSetu, read L-1465's actual inventory and run only the selected
   separate temporary demo API. Prove unique GET/POST responses from L-1465 in
   L-1770's browser, close preview, stop the owned demo, verify preservation.

## Complete source change list and stat

- apps/control-center/src/DiscoveryPage.tsx
- apps/control-center/src/RecordWorkspace.tsx
- apps/control-center/src/SoftwarePanel.tsx
- apps/control-center/src/api.ts
- apps/control-center/src/deployment-request-id.ts
- apps/control-center/src/styles.css
- apps/control-center/test/software-api.test.ts
- apps/control-plane/src/main.ts
- apps/control-plane/src/preview-relay.ts
- apps/control-plane/src/server.ts
- apps/control-plane/src/software-management.ts
- apps/control-plane/test/preview-operators.test.ts
- apps/control-plane/test/software-client.test.ts
- apps/control-plane/test/software-consent.fixture.ps1
- apps/control-plane/test/software-consent.test.ts
- apps/control-plane/test/software-linux.fixture.cjs
- apps/control-plane/test/software-linux.test.ts
- apps/control-plane/test/software-management.test.ts
- apps/control-plane/test/software-native.test.ts
- apps/control-plane/test/software-routes.test.ts
- deployment/server20/Configure-PrivatePreview.ps1
- deployment/server20/HttpCommon.ps1
- deployment/server20/New-ServixDashboardRelease.ps1
- deployment/server20/PreviewConfigurationRemote.py
- deployment/server20/Test-PrivatePreviewConfiguration.ps1
- deployment/servix/Connector.cjs
- deployment/servix/DemoApi.cjs
- deployment/servix/DeviceEnrollment.cjs
- deployment/servix/DeviceEnrollmentClient.js
- deployment/servix/New-ConnectorDownload.ps1
- deployment/servix/Run-Connector.ps1
- deployment/servix/Setup-Connector.ps1
- deployment/servix/Setup-Linux.cjs
- deployment/servix/Software-Consent.ps1
- deployment/servix/SoftwareClient.cjs
- deployment/servix/SoftwareNative.cjs
- deployment/servix/SoftwareNative.ps1
- deployment/servix/SoftwareProtocol.cjs
- deployment/servix/SystemEnrollment.cjs
- deployment/servix/SystemLinuxInstaller.cjs
- deployment/servix/Test-SystemConnectorUpdate.ps1
- deployment/servix/Update-SystemConnector.ps1
- docs/CURRENT_STATE.md
- docs/SOFTWARE_MANAGEMENT_VPN_HANDOFF.md
- docs/adr/0087-approved-software-and-private-demo-api.md
- docs/adr/0088-trusted-software-enrollment.md
- docs/adr/0089-maintenance-bound-private-preview-configuration.md
- docs/adr/README.md
- packages/contracts/src/index.ts
- packages/contracts/src/software-management.ts
- packages/contracts/test/software-management.test.ts

```text
apps/control-center/src/DiscoveryPage.tsx          |  43 +-
 apps/control-center/src/RecordWorkspace.tsx        | 108 +++-
 apps/control-center/src/SoftwarePanel.tsx          | 677 +++++++++++++++++++++
 apps/control-center/src/api.ts                     |  80 ++-
 apps/control-center/src/deployment-request-id.ts   |   2 +-
 apps/control-center/src/styles.css                 |  84 +++
 apps/control-center/test/software-api.test.ts      |  86 +++
 apps/control-plane/src/main.ts                     |  45 +-
 apps/control-plane/src/preview-relay.ts            |  58 +-
 apps/control-plane/src/server.ts                   |  70 ++-
 apps/control-plane/src/software-management.ts      | 632 +++++++++++++++++++
 apps/control-plane/test/preview-operators.test.ts  |   4 +-
 apps/control-plane/test/software-client.test.ts    | 263 ++++++++
 .../test/software-consent.fixture.ps1              |  13 +
 apps/control-plane/test/software-consent.test.ts   |  39 ++
 apps/control-plane/test/software-linux.fixture.cjs | 203 ++++++
 apps/control-plane/test/software-linux.test.ts     |  53 ++
 .../control-plane/test/software-management.test.ts | 597 ++++++++++++++++++
 apps/control-plane/test/software-native.test.ts    | 226 +++++++
 apps/control-plane/test/software-routes.test.ts    | 245 ++++++++
 deployment/server20/Configure-PrivatePreview.ps1   |  16 +-
 deployment/server20/HttpCommon.ps1                 |   2 +-
 deployment/server20/New-ServixDashboardRelease.ps1 |   5 +-
 deployment/server20/PreviewConfigurationRemote.py  |   4 +-
 .../server20/Test-PrivatePreviewConfiguration.ps1  |  17 +-
 deployment/servix/Connector.cjs                    |  21 +-
 deployment/servix/DemoApi.cjs                      | 102 ++++
 deployment/servix/DeviceEnrollment.cjs             |  25 +-
 deployment/servix/DeviceEnrollmentClient.js        |  15 +
 deployment/servix/New-ConnectorDownload.ps1        |   5 +-
 deployment/servix/Run-Connector.ps1                |   2 +-
 deployment/servix/Setup-Connector.ps1              |   4 +-
 deployment/servix/Setup-Linux.cjs                  |  59 +-
 deployment/servix/Software-Consent.ps1             |  18 +
 deployment/servix/SoftwareClient.cjs               | 444 ++++++++++++++
 deployment/servix/SoftwareNative.cjs               | 311 ++++++++++
 deployment/servix/SoftwareNative.ps1               |  41 ++
 deployment/servix/SoftwareProtocol.cjs             | 137 +++++
 deployment/servix/SystemEnrollment.cjs             |   6 +
 deployment/servix/SystemLinuxInstaller.cjs         |  85 ++-
 deployment/servix/Test-SystemConnectorUpdate.ps1   |   5 +-
 deployment/servix/Update-SystemConnector.ps1       |   5 +-
 docs/CURRENT_STATE.md                              |  23 +
 docs/SOFTWARE_MANAGEMENT_VPN_HANDOFF.md            | 173 ++++++
 .../0087-approved-software-and-private-demo-api.md |  48 ++
 docs/adr/0088-trusted-software-enrollment.md       |  29 +
 ...ntenance-bound-private-preview-configuration.md |  24 +
 docs/adr/README.md                                 |  12 +
 packages/contracts/src/index.ts                    |  17 +-
 packages/contracts/src/software-management.ts      | 282 +++++++++
 .../contracts/test/software-management.test.ts     |  91 +++
 51 files changed, 5398 insertions(+), 158 deletions(-)
```

Implementation details and retained earlier failures are in
[the implementation handoff](SOFTWARE_MANAGEMENT_VPN_HANDOFF.md).
Private evidence is under the dedicated worktree .local/software-ready-*;
no credential, key or environment value is included in this handoff.
