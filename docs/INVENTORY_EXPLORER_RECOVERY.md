# Software inventory and explorer correction

Owner scope: 2026-11-05; ADR0101; branch codex/inventory-explorer-recovery.
Base: 26794974509d84ecfa70b2cee9489e5a369d1ef5.

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
