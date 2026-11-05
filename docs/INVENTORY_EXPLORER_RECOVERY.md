# Software inventory and explorer correction

Delivery status: PASS for the deployed correction, real L-1770 inventory and
actual public explorer simulation. ESDS live acceptance is pending device
availability. Observed 2026-11-06 IST (2026-11-05 UTC).

Owner scope: 2026-11-05; ADR0101; branch codex/inventory-explorer-recovery.
Base: 26794974509d84ecfa70b2cee9489e5a369d1ef5.
Deployed source: ffaa26fa5a9aea0d6561b58b699822805ccb6533.
Repository: FrevOS; configured central repository
gitrepo_403e3e5a3cdd9ef309eec087f8369c91. No PR, GitHub push, merge, or central
source publication is performed by this task. A documentation-only follow-up
records acceptance after the immutable deployed source.

Actual deployment and acceptance:

- Manifest: a28311c7b5175cd4ce77536d6fd19df5c25662f6503d69c60ae532ecbbe5c0c2.
- Archive: 8effbc35dd32ff1c2291d4cb4f73954da8e547357159e744b7e2b2fc549b663d;
  132,475,274 bytes; 4,088 manifest files.
- Candidate: 02d3a48584714c458201848f0ac9de1a.
- Request: su_a9af54d9f290028ee321ea97252be75e, authenticated actor
  usr_windows_admin, actual public DevSetu maintenance UI. Native Apply PASS,
  health/UI 200, siblings retained, private recovery backups retained. The initial
  overlong declared-approval text is rejected before a request exists; shortening
  that field submits this one candidate. No ambiguous deployment is resubmitted.
- Authorization is the owner's existing explicit inventory/explorer deployment
  instruction, materialized as a single-use, expiring actor/workspace/target/
  correlation/artifact-bound record. No fresh hash-specific human reply is claimed.
- Original full native CI: 103 contracts + 121 frontend + 372 backend tests;
  596 total / 119 files. Backend coverage: statements 95.04%, branches 91.79%,
  functions 97.01%, lines 96.94%. Audit: 5 low / 8 moderate; no dependency upgrade.
- The actual L-1770 project connector is updated with its pairing bytes, task,
  discovery identity, existing consent files and transport preserved. Only the
  explicitly requested inventory sharing is then enabled; install permission
  stays false. Initial job sw_3d505c7c8ebbc16cfcac8c40ad23cf6f is succeeded,
  inventoried 278 entries from registry/AppX, ready/not truncated, and its local
  receipt is reconciled. Its initial-request audit is verified. More than eight
  minutes later there is still one initial job and the same inventory hash.
- Actual T-Server UI shows 278 of 278 programs, six pages and enabled Refresh.
  Public Windows/Linux/Android downloads return 200 with default strict TLS and
  match artifact hashes; Android retains signing certificate
  0d3a704822eacaef060a4560c2f800479179eed96dfbf9e94993dcf2b75cec92.
- Actual public file explorer uses the real L-1770 connector: restricted request
  fb_51795aeef6354715be1d06551deb8d3d returns folder-permission-denied and the UI
  explains choosing a writable folder. Request fb_3fac6bc2727f45bc842bae8afdb1df16
  creates a zero-byte file exclusively in its writable parent. No existing user
  file is overwritten. Protected AppData creation remains scope-denied. Both
  disposable test fixtures have their temporary ACL restored and are removed.
- Post-work preservation verifies 9 pairing records, 7 settings, 17 pre-existing
  software records, 34 selected snapshot files and 3 unchanged routing files.
  Root/servix .env were absent; runtime/environment settings remain unchanged.
  This selected snapshot is not a full database backup. Normal application and
  session/background activity continues; the native operator performs no database
  write, schema migration or new grant.

Validation commands and observed exits (all paths below are relative to the
operator worktree; ignored .local proof files retain exact receipts):

| Command / operation | Observed result |
| --- | --- |
| Run-Code-Checks.cjs: changed-file Biome error checks and both typechecks | 0 |
| Focused software management/routes/client and real Windows/Linux folder tests | 0 after fixing successful-receipt reconciliation |
| Focused inventory status/explorer/grouping frontend tests | 0; 9 cases |
| Prepare-InventoryRecoveryRelease.ps1, unchanged enrolled NativePlatform.build | 0; original complete native CI 596/596; prepared artifact |
| Test-PackagedInventoryRecoveryRuntime.cjs | 0; actual packaged Code/RBAC/revocation/ZIP and delayed TCP checks |
| Test-PackagedInventoryRecoverySoftware.cjs | 0; actual packaged authenticated initial-inventory HTTP/client protocol |
| Verify-InventoryUiProvenance.cjs | 0; observed actual helper module input, six byte-identical output files, write:false |
| Review-InventoryRecoveryArtifact.cjs and Review-InventoryRecoveryInstallers.cjs | 0 |
| Stage-InventoryRecoveryPlan.ps1 | 0; exact read-only native Plan PASS; temporary task removed |
| Recheck / materialize existing owner request / seal candidate | 0; fresh, single-use scope |
| Authenticated public DevSetu Deploy / Observe-InventoryRecoveryActivation.ps1 | succeeded / 0; same artifact |
| Packaged Software project update operator and Enable-OwnerRequestedInventory.cjs | 0; pairing retained; install consent unchanged |
| Verify-LiveInventoryRecovery.cjs | 0; actual 278-entry snapshot, audit, receipt, no repeated initial job |
| Verify-LiveExplorerRecovery.cjs and disposable fixture cleanup | 0; OS denial and successful real exclusive create |
| Verify-InventoryRecoveryLivePreservation.cjs | 0; selected data/settings/pairings/routing retained; private/public 200 |
| Verify-InventoryRecoveryInstallerDownloads.cjs | 0; three actual public downloads / strict TLS |

Limits and deviations:

- Build-only preparation uses the already enrolled DevSetu native adapter;
  activation uses the real authenticated DevSetu UI. No build-only UI API or new
  central/GitHub publication is implied.
- The native source inventory is curated and omits the new UI helper. Rather
  than treating that file as verified by the inventory, supplemental proof binds
  its exact frozen Git blob to the actual Vite module graph and byte-identical
  read-only builds of both complete packaged UI variants. Original CI, compiler
  source, enrolled packaging recipe and immutable artifact remain unchanged.
- Credential absence qualification inherits the verified baseline and frozen
  delta. The current provider key journal is unavailable; a repeated exact-key
  comparison or exhaustive secret audit is not claimed.
- ESDS and L-1465 are offline at final acceptance. No live ESDS software list,
  file creation or updated remote runtime is claimed. The latest Windows/Linux
  installers carry automatic initial collection after local inventory consent;
  supported older software-capable connectors can still use manual Refresh while
  online. No repeated installer run is needed on the updated L-1770 connection.
- Inventory covers registered programs/package-manager records, not every
  portable executable or other users' private packages. OS/connector-user write
  permissions still apply. Real Android phone/Linux desktop installation is not
  re-accepted by this Windows inventory task.

Changed files in the deployed task (19; diff: 608 insertions, 46 deletions):

```text
apps/control-center/src/FolderBrowser.tsx
apps/control-center/src/SoftwarePanel.tsx
apps/control-center/src/discovery-systems.ts
apps/control-center/src/software-inventory-status.ts
apps/control-center/test/discovery-systems.test.ts
apps/control-center/test/file-explorer.test.tsx
apps/control-center/test/software-inventory-status.test.ts
apps/control-plane/src/server.ts
apps/control-plane/src/software-management.ts
apps/control-plane/test/software-client.test.ts
apps/control-plane/test/software-management.test.ts
apps/control-plane/test/software-routes.test.ts
apps/control-plane/test/system-folders-runtime.test.ts
apps/control-plane/test/fixtures/explorer-permission.ps1
deployment/servix/SoftwareClient.cjs
deployment/servix/Update-PreviewConnector.ps1
docs/CURRENT_STATE.md
docs/INVENTORY_EXPLORER_RECOVERY.md
docs/adr/0101-initial-inventory-and-explorer-permissions.md
```

The two handoff documents above receive the post-acceptance documentation update.
Screenshots are retained in the user's DevSetu 2 workspace as inventory-live.jpg,
inventory-release-live.jpg, explorer-permission-live.jpg and explorer-create-live.jpg.
Ready for normal L-1770 inventory use and the separate ESDS-online acceptance.

Implementation context at source freeze follows; later acceptance above supersedes
its pending-release wording.


The screenshot's L-1770 / DevSetu source connection is a legacy project agent
without SoftwareClient/Native/Protocol/DemoApi/PreviewRelay sidecars. Its monitoring
heartbeat does not prove software support. The new bounded artifact-bound Software
update installs the complete closed sidecar set and retains its identity, task,
pairing and existing consents. Inventory sharing is separate from installation
authority; collecting inventory never enables installs.

An updated consenting client requests an initial inventory through its credential.
The server verifies active workspace/owner/device and fresh consent, serializes
against pending software jobs, retains existing snapshots and limits failure
retries to one per ten minutes. The client checks once per minute; ordinary
heartbeats do not rescan. A successful acknowledged receipt is durably reconciled,
so normal restart does not recollect it. Manual Refresh inventory remains.

The actual ESDS connector returned folder-permission-denied for file/directory
creation in C:\Users. Windows did not allow its logged-in user to write there.
No ACL/elevation workaround is introduced. The UI explains the cause and asks
for an accessible personal/project folder. Existing items are never overwritten;
protected paths and links remain denied. Capability preference applies only
inside an already verified owner/installation grouping; display associations
never establish authorization.

Focused validation: control-center typecheck and nine inventory/explorer/grouping
UI cases pass. Software management/routes and real Windows/Linux explorer cases
pass; the new Windows ACL fixture reproduces ESDS's denial while writable-folder
creation succeeds. Real client restart test found an unreconciled-success receipt;
that implementation bug is fixed and all three actual client tests then pass.
Backend typecheck and changed-file Biome error checks pass. Original test deadlines,
runtime permission checks, authorization and native CI gates are retained.

Direct native L-1770 inspection reports 278 registered entries, status ready,
registry and AppX sources, not truncated. That is read-only OS evidence, separate
from later Server20/public UI acceptance. ESDS's last observation was offline
at inspection; isolated simulation must not be reported as live ESDS acceptance.

Release preparation/activation and preservation results are recorded after the
complete immutable native build and actual authenticated DevSetu flow. No database
migration, generic command capability, repository grant, GitHub publication,
DNS/firewall or provider credential change is authorized by this task.
