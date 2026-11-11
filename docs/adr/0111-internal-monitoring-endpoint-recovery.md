# ADR0111 — Recover existing Internal monitoring endpoints

Date: 2026-11-11 IST

Status: Accepted; execution and remaining access blockers are recorded separately.

The owner requests diagnosis and recovery of the remaining Internal monitoring
targets, using the existing account and preserving applications, pairing, data
and environment. The no-local-service requirement in ADR0109 remains in force.
Vendor systems, unknown addresses and broad network or authentication changes
are outside this operation.

Probe from the central collector, distinguish the laptop's route, and verify
actual computer identity before applying endpoint changes. A reachable website
is not evidence of Windows, a working WinRM endpoint or administrator rights.
Read-only credentialed failures are recorded honestly; do not try username
variants or promote an unavailable target to a successful measurement.

Prefer an existing approved management listener over enabling another port.
The routing gateway's verified WinRM listener uses port 5052. Rebinding this
endpoint must update its canonical target ID, stored port, operator registry
and runtime enrollment consistently. Retain grants, history, latest observation,
application references and prior audit. Fence obsolete work; preserve exactly
one target per physical address. Use a fresh central backup, typed scoped
transaction, file preimages and compensating recovery. Reload only the owned
DevSetu application task with its unchanged application artifact. Do not reset
the database, change schema or replace customer applications.

Default DNS binding remains the exact single enrolled IPv4 address. A verified
multi-interface host may opt into an explicit private approved address set,
with Kerberos, required computer identity and exact resolver-set equality.
New DNS answers never enlarge that set. Interface ownership needs authenticated
evidence; resolver data alone is insufficient. Do not remove DNS records used
by other applications or add wildcard TrustedHosts/certificate exceptions.

The protected native updater may replace only its reviewed Common/Collector
programs and explicitly mapped registry entries. Preserve the other programs,
encrypted profile, ACLs and owned task definition/security; only its registry
digest argument changes. Require advancing heartbeats and mapped recovery.
There is no browser-facing raw shell or arbitrary service-control operation.

Initial evidence distinguishes three unreachable addresses, a FreeBSD SSH
identification, web-only endpoints and Windows configuration/access issues.
OS-specific monitoring requires verified OS, usable management access and a
separate supported adapter. An SSH banner or HTTP server header is a diagnostic
clue, not authenticated OS acceptance. Administrator access denied on a host
does not authorize bypassing its controls.

Native WinRM repair, if necessary after diagnosis, is limited to an exact
verified target and source-scoped management rule/listener. Preserve existing
service/authentication/firewall configuration and obey managed policy. Broad
quick-config, endpoint ACL resets, public firewall rules and unrelated restarts
are excluded. A diagnostic or prepared repair is not a completed live recovery.
