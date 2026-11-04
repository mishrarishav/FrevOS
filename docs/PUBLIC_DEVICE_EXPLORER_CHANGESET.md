# Public device release change record

Status: PASS for the deployed artifact and bounded L-1770 public acceptance;
L-1465 public API acceptance is pending while that device is offline.

Repository: mishrarishav/FrevOS. Branch: `codex/public-gateway-entry`.
Base: `49c62c9`. Live application source:
`b8d2e38c59ee4aac22db7b943814e267b26a38c1`.
No new PR, GitHub push or central source publication was performed.
The later handoff-only commit is documentation, not the live application source.
Its complete file list is `docs/CURRENT_STATE.md`,
`docs/PUBLIC_DEVICE_EXPLORER_HANDOFF.md`,
`docs/PUBLIC_DEVICE_EXPLORER_CHANGESET.md` and
`docs/adr/0099-public-device-transport-and-system-explorer.md`.

## Commands and observed results

- The enrolled native adapter's original build completed with exit 0,
  correlation `cj_7e6f05d7b08fc0df12a24c9ccb5715bf`. Its repository CI sequence
  uses `pnpm run ci`: repository validation, formatting, lint, typecheck, private
  Git fixture preparation, coverage tests, build and audit. All 573 tests in
  113 files pass (102 contracts, 115 UI, 356 backend). Audit reports 5 low and
  8 moderate advisories; the high-severity gate passes. Android signing and
  installer/manifest/archive/native Plan checks pass.
- `node .local/Verify-PublicDeviceExtraProtection.cjs`: exit 0, PASS; retained
  software files, Server20/Server9 IIS and private relay hashes match.
- `.local/Verify-L1770PublicConnection.ps1 -Mode VerifyPublic` with the exact
  reviewed manifest, recorded baseline SHA and migration start timestamp:
  exit 0, PASS; original installation namespace, recognized credential,
  public endpoint and fresh Discovery/Explorer.
- Actual authenticated maintenance UI submission
  `su_1e73c76b48b58062d8d3defb8dae2445`: succeeded, health 200. Build preparation
  used the enrolled adapter; an end-to-end source-publication/build control-plane
  run was not performed.
- Actual public browser checks: repaired layout, compact chip, unique physical
  system rows, C:/D: and ZIP metadata, exclusive empty folder/file creation,
  Up/Back/Forward/absolute Location and non-recursive owned test cleanup pass.
  File-content approval was not invoked. Work/Temp/All and quotas are visible.
- `git diff --check`: exit 0 for the final handoff changes.

Private local evidence includes `software-public-device-activation-success.json`,
`public-device-final-preservation.json`, `public-device-explorer-live-test.json`,
`public-device-live-layout-metrics.json`,
`public-device-live-local-development-table.png`,
`public-device-live-explorer-created.png` and
`public-device-live-temp-cache-final.png` under `.local/`.

The final UI save retains the original 14 recommended temporary path rules and
appends 10 exact folder-boundary rules: `.npm-cache`, `_cacache`, `_npx`,
`.yarn/cache`, `.pnpm-store`, `.parcel-cache`, `.next/cache`, `.angular/cache`,
`.gradle/caches`, `.pytest_cache`. No collection/content consent, priority folder
or tracking flag changed. The 30-second summary, 2-day temp retention, 20% quota,
7-day overall retention and 2000-event ceiling are retained. Existing retained
metadata is reclassified immediately and the temp quota reapplied; the final
observation was 653 Work / 400 Temp / 1053 total. This intentionally ages/discards
excess activity metadata, without deleting any files on the connected computer.

## Limits and readiness

See PUBLIC_DEVICE_EXPLORER_HANDOFF.md for full artifact identity, preservation,
the legacy GitDesktop dependency repair and outstanding acceptance. Credential
qualification uses a verified baseline and reviewed frozen-source delta; direct
comparison with the current provider key was unavailable. Previous failed CI
and packaging attempts remain recorded. L-1465 API, phone/Linux desktop and
actual non-admin paired login are untested. No full platform rollback was run.
Existing executors retain their private endpoint. Public executable application
preview still needs a separate hostname; same-host API responses are inert.
The public route used Wi-Fi/default routing while the operator retained VPN for
private maintenance; physical VPN-disconnected acceptance was not performed.
Next bounded work: update/verify L-1465 when online, then the approved isolated
demo API request/response test and cleanup.

## Complete application change list and diff stat

```text
apps/android-connector/src/org/devsetu/connector/MainActivity.java
apps/android-connector/src/org/devsetu/connector/MonitorService.java
apps/android-connector/src/org/devsetu/connector/ServerOrigin.java
apps/control-center/src/App.tsx
apps/control-center/src/DiscoveryPage.tsx
apps/control-center/src/FolderBrowser.css
apps/control-center/src/FolderBrowser.tsx
apps/control-center/src/PreviewApiInspector.css
apps/control-center/src/PreviewApiInspector.tsx
apps/control-center/src/SystemConnections.tsx
apps/control-center/src/VpnPreviewButton.tsx
apps/control-center/src/api.ts
apps/control-center/src/desktop-workspace.css
apps/control-center/src/main.tsx
apps/control-center/src/styles.css
apps/control-center/test/file-explorer.test.tsx
apps/control-center/test/preview-api-inspector.test.tsx
apps/control-plane/src/browser-entry.ts
apps/control-plane/src/developer-connectors.ts
apps/control-plane/src/device-logins.ts
apps/control-plane/src/main.ts
apps/control-plane/src/preview-relay.ts
apps/control-plane/src/server.ts
apps/control-plane/src/system-discovery.ts
apps/control-plane/test/activity-bounds.test.ts
apps/control-plane/test/android-build.test.ts
apps/control-plane/test/browser-artifact.test.ts
apps/control-plane/test/browser-entry-profile-write.test.ts
apps/control-plane/test/browser-entry.integration.test.ts
apps/control-plane/test/connector-connection-status.test.ts
apps/control-plane/test/connector-identity-namespace.test.ts
apps/control-plane/test/device-enrollment.test.ts
apps/control-plane/test/device-logins.test.ts
apps/control-plane/test/file-explorer-linux.fixture.py
apps/control-plane/test/paired-login-clients.test.ts
apps/control-plane/test/preview-operators.test.ts
apps/control-plane/test/preview-relay.test.ts
apps/control-plane/test/system-discovery.test.ts
apps/control-plane/test/system-folders-runtime.test.ts
deployment/server20/Configure-BrowserEntry.ps1
deployment/server20/HttpCommon.ps1
deployment/server20/New-ServixDashboardRelease.ps1
deployment/server20/Test-AndroidCompatibility.ps1
deployment/server20/Test-BrowserEntryProfileReplacement.ps1
deployment/server20/Test-PreviewExecutorUpdate.ps1
deployment/server20/Update-PreviewExecutor.ps1
deployment/server20/Validate-BrowserEntry.mjs
deployment/server20/Verify-AndroidCompatibility.ps1
deployment/server20/Verify-HttpManifest.mjs
deployment/servix/Browse-Folders.ps1
deployment/servix/Browse-Folders.py
deployment/servix/ComponentExecutor.cjs
deployment/servix/Connector.cjs
deployment/servix/DeviceEnrollment.cjs
deployment/servix/DiscoverySafety.cjs
deployment/servix/FolderBrowse.cjs
deployment/servix/Install-SystemConnector.ps1
deployment/servix/PairedLogin.psm1
deployment/servix/Pairing-State.ps1
deployment/servix/Resume-SystemConnector.ps1
deployment/servix/START-HERE.txt
deployment/servix/Setup-Connector.ps1
deployment/servix/Setup-Executor.ps1
deployment/servix/Setup-Linux.cjs
deployment/servix/SystemDiscovery.cjs
deployment/servix/SystemEnrollment.cjs
deployment/servix/SystemLinuxInstaller.cjs
deployment/servix/Test-PreviewConnectorUpdate.ps1
deployment/servix/Test-SystemConnectorTransport.ps1
deployment/servix/Update-PreviewConnector.ps1
docs/CURRENT_STATE.md
docs/PUBLIC_DEVICE_EXPLORER_HANDOFF.md
docs/PUBLIC_TLS_CHAIN_REPAIR_HANDOFF.md
docs/adr/0099-public-device-transport-and-system-explorer.md
docs/adr/README.md
packages/contracts/src/developer-connectors.ts
packages/contracts/src/preview-relay.ts
packages/contracts/src/system-discovery.ts
packages/contracts/test/connector-purpose.test.ts
scripts/build-browser-entry.mjs
```

```text
.../src/org/devsetu/connector/MainActivity.java    |  47 +-
 .../src/org/devsetu/connector/MonitorService.java  |   4 +-
 .../src/org/devsetu/connector/ServerOrigin.java    |  18 +-
 apps/control-center/src/App.tsx                    |   8 +-
 apps/control-center/src/DiscoveryPage.tsx          | 415 ++++++-----
 apps/control-center/src/FolderBrowser.css          | 332 +++++++++
 apps/control-center/src/FolderBrowser.tsx          | 765 ++++++++++++++++-----
 apps/control-center/src/PreviewApiInspector.css    |  74 ++
 apps/control-center/src/PreviewApiInspector.tsx    | 173 +++++
 apps/control-center/src/SystemConnections.tsx      |  45 ++
 apps/control-center/src/VpnPreviewButton.tsx       |  12 +-
 apps/control-center/src/api.ts                     |  15 +
 apps/control-center/src/desktop-workspace.css      | 263 +++++++
 apps/control-center/src/main.tsx                   |   1 +
 apps/control-center/src/styles.css                 | 175 +++++
 apps/control-center/test/file-explorer.test.tsx    |  59 ++
 .../test/preview-api-inspector.test.tsx            |  55 ++
 apps/control-plane/src/browser-entry.ts            |  23 +-
 apps/control-plane/src/developer-connectors.ts     |   9 +-
 apps/control-plane/src/device-logins.ts            |  11 +-
 apps/control-plane/src/main.ts                     |   1 +
 apps/control-plane/src/preview-relay.ts            | 107 ++-
 apps/control-plane/src/server.ts                   |  59 +-
 apps/control-plane/src/system-discovery.ts         | 103 ++-
 apps/control-plane/test/activity-bounds.test.ts    |  18 +
 apps/control-plane/test/android-build.test.ts      |   4 +-
 apps/control-plane/test/browser-artifact.test.ts   |  27 +-
 .../test/browser-entry-profile-write.test.ts       |  43 ++
 .../test/browser-entry.integration.test.ts         |  26 +
 .../test/connector-connection-status.test.ts       | 291 ++++++++
 .../test/connector-identity-namespace.test.ts      | 160 +++++
 apps/control-plane/test/device-enrollment.test.ts  |  23 +
 apps/control-plane/test/device-logins.test.ts      |  28 +-
 .../test/file-explorer-linux.fixture.py            |  30 +
 .../test/paired-login-clients.test.ts              | 286 +++++---
 apps/control-plane/test/preview-operators.test.ts  |  47 +-
 apps/control-plane/test/preview-relay.test.ts      | 251 +++++++
 apps/control-plane/test/system-discovery.test.ts   | 125 +++-
 .../test/system-folders-runtime.test.ts            | 104 ++-
 deployment/server20/Configure-BrowserEntry.ps1     |   2 +-
 deployment/server20/HttpCommon.ps1                 |   1 +
 deployment/server20/New-ServixDashboardRelease.ps1 |   5 +-
 deployment/server20/Test-AndroidCompatibility.ps1  |  10 +-
 .../Test-BrowserEntryProfileReplacement.ps1        |  25 +
 deployment/server20/Test-PreviewExecutorUpdate.ps1 |  36 +-
 deployment/server20/Update-PreviewExecutor.ps1     |  13 +-
 deployment/server20/Validate-BrowserEntry.mjs      |   6 +-
 .../server20/Verify-AndroidCompatibility.ps1       |   1 +
 deployment/server20/Verify-HttpManifest.mjs        |   4 +-
 deployment/servix/Browse-Folders.ps1               |  28 +-
 deployment/servix/Browse-Folders.py                |  42 +-
 deployment/servix/ComponentExecutor.cjs            |   4 +-
 deployment/servix/Connector.cjs                    | 149 +++-
 deployment/servix/DeviceEnrollment.cjs             |  24 +-
 deployment/servix/DiscoverySafety.cjs              |   7 +
 deployment/servix/FolderBrowse.cjs                 |  44 ++
 deployment/servix/Install-SystemConnector.ps1      |   5 +-
 deployment/servix/PairedLogin.psm1                 |   6 +-
 deployment/servix/Pairing-State.ps1                |   2 +-
 deployment/servix/Resume-SystemConnector.ps1       | 121 +++-
 deployment/servix/START-HERE.txt                   |  30 +-
 deployment/servix/Setup-Connector.ps1              |  23 +-
 deployment/servix/Setup-Executor.ps1               |  10 +-
 deployment/servix/Setup-Linux.cjs                  |  14 +-
 deployment/servix/SystemDiscovery.cjs              |  40 +-
 deployment/servix/SystemEnrollment.cjs             |  40 +-
 deployment/servix/SystemLinuxInstaller.cjs         |  67 +-
 deployment/servix/Test-PreviewConnectorUpdate.ps1  |  52 +-
 .../servix/Test-SystemConnectorTransport.ps1       |  94 +++
 deployment/servix/Update-PreviewConnector.ps1      | 119 +++-
 docs/CURRENT_STATE.md                              |  23 +
 docs/PUBLIC_DEVICE_EXPLORER_HANDOFF.md             |  81 +++
 docs/PUBLIC_TLS_CHAIN_REPAIR_HANDOFF.md            | 150 ++++
 ...-public-device-transport-and-system-explorer.md |  51 ++
 docs/adr/README.md                                 |   7 +
 packages/contracts/src/developer-connectors.ts     |  24 +-
 packages/contracts/src/preview-relay.ts            |  20 +
 packages/contracts/src/system-discovery.ts         |  37 +
 packages/contracts/test/connector-purpose.test.ts  |  66 ++
 scripts/build-browser-entry.mjs                    |   2 +-
 80 files changed, 5086 insertions(+), 636 deletions(-)
```
