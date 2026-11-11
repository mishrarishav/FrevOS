# Internal server monitoring recovery — 11 November 2026

Status: PASS for Server9 recovery; BLOCKED for the remaining eight targets.
The owner authorized diagnosis and monitoring of the workbook's Internal hosts,
using the unchanged account and current protected credential reference. Vendor
hosts and unrelated applications were excluded. See ADR0111.

## Live result

Server9 / DCPUBWEB already had an authenticated Kerberos WinRM listener on
**5052**, rather than the previously enrolled 5985. Its monitoring port and
canonical target ID were changed together in central PostgreSQL, the runtime
enrollment and the protected native registry. No listener, firewall rule, DNS
record, account privilege, IIS site or customer application was changed.

The six hosts reporting real OS readings are `10.9.69.9`, `.19`, `.20`, `.21`,
`.28` and `.31`. Server20 is explicitly a local central-host observation;
the other five use remote WinRM. Fourteen targets and 50 application source
references remain. The unavailable hosts have no invented CPU/RAM measurements.

Authenticated browser acceptance through the public T-Server route observed
DCPUBWEB / Windows Server 2022, CPU, memory, drives, network counters, processes
and 293 service records. Its sample times advanced from 16:16:52 to 16:18:32 IST;
CPU changed from 2% to 0%, memory from 81.4% to 81.3%, with measured graph points.
The existing five hosts also returned fresh observations after restart.
Evidence screenshot: private operator file `server9-live-recovery.png`.
Private and public health both returned HTTP 200 with `status: ok` after recovery.

## Immutable operation and preservation

- Application source remains `8d0f37b3f9e9f5733d70a993d9a80fd50095b1cd`.
- Active application manifest remains
  `7e085cf28e75d3e6ca62b687e4d1e713a77ed21cf2364def3c46cfcdef2670ce`.
- Native source is `f3c9094015c3721dea879863a683c30231532f76` on
  `codex/internal-server-monitoring`; only Common/Collector programs changed.
- Successful application operation: `smr_22d060941fa247f6a77c8ea58bdf2bcf`.
- Native operation: `sme_0ff34f698f6f401b912c050ae8a9900b`.
- Verified actor/workspace: `usr_windows_admin` / `ws_server20`.
- Plan SHA256:
  `448f46e5bd3c1bbcfd58ce16badd810d91a6ac501e53db909c98038b79bd01e8`.
- Operation SHA256:
  `98937d0f465072ca218026f5ac7f9a5fc09bfd4d574159657e9b6abf0a54e3b6`.
- Native manifest SHA256:
  `7e7f9a95e622da7fa09839e5495cf181018e28edc7acca1e2084e35665485964`.
- New registry SHA256:
  `a514f4c7709065699e6a4b4c1be780ae3486b8bbdd18bc7b1d6168bc9e53e5a2`.
- New monitoring configuration SHA256:
  `d69d8c840b1e4e9d2a6414449ad7bd781f5150f5b44c0a77cf416d7c9c96147c`.

Native Plan/Apply and central verification passed. Only Server9's target ID,
port and native revision changed; Server5 and the other targets retain their
configuration. Policy, grants, source references, latest measurements and
history were retained; old-ID work was fenced. Central verification counted
882 retained history points, compared with 877 at Plan while collection was
still advancing. The native worker produced two advancing healthy heartbeats.
Its encrypted credential and task definition/security were retained, except
for the intended registry-digest argument. The same application artifact was
restarted; no application release was built or activated for this repair.

The fresh 801,519-byte plain-SQL backup has SHA256
`47ee1c3dbec63286f3be1677dfd241197f831039d1e799e16f0703f233acb4dd`.
Export exit, header/footer, byte count and digest passed. An isolated restore
test was not performed. SQL schema migrations were not needed or applied.
The Reviews document digest remains
`6cb3b0ed0e30118a72af5915c0fb341726df0f9265adcb82e7350910d79da4af`.

Independent read-only SMB preservation verification also passed: nine pairing
identities, credential hashes, status and access fields match, excluding only
their typed polling timestamp; 19 software records and 44 immutable snapshot
files match. Fifteen settings were checked: 11 unchanged and the exact four
approved monitoring-config/registry/Common/Collector updates. Runtime environment,
active artifact and encrypted profile hashes match. No `.env` files existed in
the selected baseline paths, so no preserved `.env` file count is invented.

The first independent audit failed because it assumed a root-level native
manifest which the installer does not persist. Its failure receipt was retained.
The corrected verifier reads the actual update-scoped manifest, binds its native
operation ID, checks installed program hashes, and passed 24 pure tests including
an absent root manifest and rejection of a wrong update scope. Its actual v2
receipt is PASS; neither audit executed remote commands or writes.

## Failed attempt and corrected recovery

The first operation, `smr_c7780ca05a0d4cf3b72acce5cc819076`, failed its native
file-security postcondition before the database update. A replacement temp file
under the SYSTEM-only operator directory caused inherited ACL entries to be
recalculated. This removed the application's LOCAL SERVICE read permission
from the monitoring configuration. The database remained unchanged and
configuration bytes were restored to the old state, but that inherited ACL
defect also prevented application restart.
DevSetu had a temporary outage; this was not a successful deployment.

An independent read-only verification proved the old registry, runtime and
central document alignment. The first file-replacement backup retained the
original owner/group/DACL. An exact hash- and ACL-bound recovery restored that
descriptor only to `config/server-monitoring.json`, then verified old native
programs and restarted the same application. Health recovered at 10:34:52 UTC.
No new principals or wider permissions were granted.

The corrected operation freezes the original owner/group/DACL using explicit
.NET `Owner | Group | Access` sections (14). It creates replacement files in the
same config directory and reconstructs a fresh FileSecurity object from the
frozen descriptor for both forward replacement and compensation. Exact byte
hashes and security descriptors are checked before and after replacement.
Slow file/process work runs outside the short PostgreSQL CAS transaction.
Original failed artifacts/receipts remain retained; their operation IDs were
not replayed or overwritten.

## Remaining access blockers

| Target | Actual evidence | Required access or infrastructure change |
| --- | --- | --- |
| `10.9.69.5` / DCAPP2 | SMB authentication succeeded; ADMIN$/C$ denied. Kerberos WinRM and corrected DCOM returned access denied. DNS also has a second private address, which was not silently enrolled. | A target administrator must grant approved read-only remoting/CIM/performance access and verify interface ownership before any multi-address exception. The same password cannot supply missing authorization. |
| `10.9.69.29` / DCDEEPAPP1 | Web/RPC/SMB reachable; tested WinRM ports closed. DCOM denied; the readiness bridge failed opening C$ before creating target files/tasks. | A target administrator must inspect the intended WinRM listener and source-scoped management access from Server20. No broad quick-config or endpoint ACL reset was attempted. |
| `10.9.69.10` | SSH banner advertises FreeBSD; exactly one pinned-key attempt with the designated account failed. No remote command ran. | A usable approved SSH identity/key reference, actual OS verification and an appropriate read-only collector are required. A banner alone is not OS acceptance. |
| `10.9.69.23` | Web HEAD returned nginx/200; tested management endpoints unavailable. | Confirm OS and enable an approved authenticated collection path from Server20. Web reachability is not OS monitoring. |
| `10.9.69.32` | Web HEAD returned Apache/RHEL header and 301; tested management endpoints unavailable. | Confirm the actual OS and intended management endpoint. The header is only a clue; a Linux collector is not claimed. |
| `10.9.69.4` | ICMP and bounded management/web checks timed out. | Confirm address, host availability and permitted routing/firewall path. |
| `10.9.69.6` | ICMP reported DestinationHostUnreachable; bounded ports timed out. | Confirm host, subnet/VLAN and permitted route from Server20. |
| `10.6.69.5` | The literal workbook address timed out. | Confirm this address and its route; it was not replaced with `10.9.69.5`. |

There was no working elevated console session available for these blocked
targets. No credential variants were tried. Password values, command output
containing secrets and raw database exceptions are absent from this report.

## Validation and limits

The committed native changes passed 79 native assertions, 40 enrollment-update
PS5 assertions, 22 central tests, 18 queue tests and 14 packaging tests. The
corrected private operation passed 11 Node tests, 15 mocked PS5 checks, 11
assertions executing its actual replacement script and four transport tests.
An independent 58-assertion real-temp-file PS5 regression reproduced the old
inheritance defect in two folder layouts and verified forward/recovery ACL and
byte preservation. Those fixtures used temporary files only.

No local Docker, database or localhost app was started for this work. Full
Docker release CI and unsupported Linux/FreeBSD monitoring are not claimed.
No default-branch merge or unrelated application deployment was performed.
