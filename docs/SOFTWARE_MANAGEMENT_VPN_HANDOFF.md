# Software management and VPN demo implementation handoff

Status: BLOCKED for live delivery; implementation and release preparation in progress.
Repository: mishrarishav/FrevOS (provider ID 1329122983).
Branch: codex/software-inventory-vpn-preview.
Base: 79b5a20fe568bd2afa2b0d2cb943d52d7225f603.
Resulting source commit and immutable release: pending. No pull request/publication.
Phase 4 remains open; approved bounded stack: ADRs 0087, 0088 and 0089.

## Result and boundaries

Discovery gains owner/admin-scoped installed-software snapshots, a revisioned
administrator catalogue, exact package/device jobs, install history and the
existing isolated VPN browser preview for a bundled temporary API. Admin Install
is one explicit action, creating the exact single-use approval internally;
trusted enrolled devices get no second DevSetu prompt. Ordinary-user installs
need administrator approval. First-time local opt-in remains separate from old
monitoring pairing. Native OS authorization, installer/license dialogs and OS
account rights remain in effect. No unrestricted remote shell is added.

The desktop installer adds inventory/trusted-management choices and a software
permissions link to connection status. Windows updates preserve legacy 12/14-file
credentials/history while moving to the pinned 20-file runtime. Linux preserves
the old eight-file runtime and its credentials during migration/recovery. Linux
monitoring excludes the Windows-only Git desktop sidecar; project Git expansion
is outside this task. Older project sidecar updates can retain project operation
without silently claiming the optional software capability. Android inventory
and installation are outside scope; Android pairing remains unchanged.

Inventory reads Windows registry/current-user app registration or Linux package
manager metadata, without Win32_Product, portable-executable scans or file content.
It is requested explicitly, up to 5,000 records. Polls transfer only changed
snapshots; a failed scan preserves the last successful inventory and reports the
failed scan separately. Lists paginate at 50 records. Jobs/audit/receipts/cache
are bounded (2,000 jobs, 10,000 audit records, 256 local receipts, 32 cache entries /
500 MiB cache, 250 MiB per installer); capacity failures stop new work and require
operator maintenance of retained application records, without automatic deletion
of user files. Existing work/install interruptions are never automatically retried.
Native metadata is also limited to 2.5 MB before upload, reporting partial and
truncated when needed. Every durable record write enforces its matching read
quota; an oversized catalogue revision cannot replace the last valid catalogue.
Both large-Unicode-inventory and oversized-catalogue regressions pass locally.

Supported fixed recipes are Windows MSI, Linux DEB/RPM and the bundled demo.
Catalogue installers use HTTPS, exact bytes/SHA-256 and an optional Windows signer
pin. There is no arbitrary command, arguments, executable path, remote host or
service selector. Linux package dependencies/privilege remain native concerns.
The demo uses an editable unprivileged loopback port and 1–30 minute lifetime,
reads no project files and stops through its owned IPC child. Preview has a
separate software claim channel, preserving ordinary project preview restrictions.
This is bounded HTTP request/response, not a general TCP/UDP mesh or streaming API.

## Observed validation and preparation

- Offline frozen-lockfile install: exit 0, 357 cached packages, no dependency change.
- Repository validation: exit 0, 139 Markdown files before this handoff.
- Full typecheck: exit 0. Targeted software contracts/API/backend/native tests pass.
- Windows actual installed-program scan passes without persisting program names
  in this report. Actual native child demo + HTTP relay GET/POST, bootstrap replay,
  preview close, demo stop and pairing sentinel preservation pass locally.
- Actual Windows CurrentUser DPAPI consent opt-in/revocation/different-pairing
  denial passes while retaining encrypted pairing bytes and file permissions.
  A PowerShell 5.1 null-string atomic-replacement issue found by this fixture is
  fixed and retained as a committed native regression.
- Expanded native Windows update fixture preserves all prior denial/recovery
  checks and adds the prior Git-capable runtime migration. Fixed private-preview
  operator fixtures validate v1 publication and v2 actual maintenance authority.
- Complete clean-environment diagnostic CI: exit 0, 102 files / 520 tests,
  unchanged coverage gates, typecheck/build/audit. This run overlapped final
  implementation review; final frozen-source enrolled CI remains mandatory.
  Frontend coverage 100%; contracts 98.01 statements / 92.92 branches /
  92.03 functions / 98.31 lines; software backend 96.57 statements / 97.09
  branches / 100 functions / 97.34 lines. No high/critical dependency advisory;
  audit reports five low and eight moderate. Existing chunk-size warning remains.
- Additional non-root, network-isolated pinned Debian/Node container: PASS for
  actual migration/files/credential/history, failed-start recovery, local consent,
  actual Linux inventory and installed connector heartbeat/software capability.
  systemctl is stubbed; real systemd/Linux desktop/RHEL acceptance is not claimed.
- Actual React/CSS synthetic UI: 135 rows, last-page reachability, search reset,
  Card/Table, mobile filter drawer, immutable edited ID, invalid-port denial,
  one-action admin queue, and desktop/tablet/mobile widths. The mobile editor
  overflow found during review is corrected. Evidence is ignored under
  .local/evidence/software-*.png; synthetic data is not live inventory.
- Earlier failures are retained: inherited PowerShell 7 module path broke an
  existing ACL test; native builder environment passes it unchanged. A stale
  runtime fixture was extended with the new manifest while retaining assertions.
  New Linux fixture initially returned malformed mock discovery policy; its
  policy response now matches the actual protocol. No acceptance gate weakened.
- Existing enrolled builder packaging/delta sidecars updated through the fixed
  one-use operator pve_3f18a5477ff54e368bca6fd55e4dd1ae: PASS. Encrypted enrollment,
  native adapter, task XML and root ACL preserved; before-images retained locally.
- Fresh Server20 baseline: active manifest 325bfd60, source 27f85a7; eight stable
  pairing identities/credential hashes and five selected settings recorded.
  Existing DCAPP7.eesl.co.in resolves over VPN to Server20. Live browser remains
  authenticated; no installed software/capability is changed on L-1465 yet.

## Remaining live work

Freeze and qualify exact source through the enrolled native builder; independently
review all packaged inputs/installers, integrity, credential-delta proof and native
Plan. Obtain final exact-artifact Production activation approval. Configure the
reviewed private preview after actual maintenance activation, using genuine
request/claim/native-result receipts, never an invented component pipeline run.

L-1465 still needs the new connector once and its explicit trusted-management
opt-in. Its old monitoring agent has no legitimate software/update execution
channel; do not claim it can be remotely upgraded through a raw command. Then
read actual inventory, run only the user-selected separate temporary demo API,
verify a unique GET/POST response from L-1465 in L-1770's VPN browser, close preview,
stop the demo and compare pairing/data/settings. This live test is NOT complete.
No existing customer project, .env, uploads/attachments or database is modified
by current implementation/preparation. No GitHub push/self-merge is claimed.

## Complete current changed-file list

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
- apps/control-plane/test/software-consent.fixture.ps1
- apps/control-plane/test/software-consent.test.ts
- apps/control-plane/test/software-client.test.ts
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
