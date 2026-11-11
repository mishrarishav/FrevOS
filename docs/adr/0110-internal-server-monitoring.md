# ADR0110 — Configurable internal server monitoring

Date: 2026-11-11 IST

Status: Accepted; implementation and native operator preparation verified.
Application activation and migration are recorded separately when executed.

The owner authorizes monitoring all entries classified Internal in the supplied
application workbook, excluding vendor-managed servers. Server monitoring lives
under Reviews with the existing configurable registers, rather than embedding
the customer's name, ownership values or server addresses in application code.

Import requires an administrator-selected register, exact ownership values and
hosting custom field plus private operator enrollment of the source and each
endpoint. Repeated hosting addresses consolidate into a target with application
references. Placeholders and missing/malformed addresses are excluded. A future
workbook edit does not enroll a new network destination automatically.

Administrators see all workspace targets; other active members require explicit
target grants. Reads, queued work, result acceptance and per-user alert
acknowledgements recheck authority. Configuration remains administrator-only.
Business-owner/SPOC text is not authorization or proof of an OS actor.

The existing central PostgreSQL database stores revisioned state under forced
workspace RLS. SQL 0008 adds bounded server history, alerts, audit and durable
work state. Fixed native collection runs outside database transactions; leases,
fencing and configuration/authority checks reject stale results. Manual work
and overdue targets are ordered to avoid starvation. Authentication failure
pauses automatic retries.

A separate protected SYSTEM worker samples only exact enrolled private endpoints
using a fixed read-only program. The app's queue carries no executable commands,
addresses, passwords or arbitrary PowerShell. Credential profiles are opaque
web references and SYSTEM-DPAPI protected at the operator boundary. Registry,
program and result ACLs retain separate app/operator authority. WinRM trust,
certificate validation and firewall configuration are not bypassed. Explicit
local sampling of the central host is never reported as remote WinRM success.

The UI follows the existing desktop workspace design: persistent card/table
controls and a Task Manager-style Performance/Processes/Services/Alerts detail.
Graphs use actual observations, preserve gaps and label stale data. Unknown
CPU/network counters are null. Process CPU is a measured normalized counter,
not cumulative CPU seconds. This feature does not start/stop services, install
software, kill processes or evaluate user commands. Existing Discovery controls
remain separate. The native collector supports Windows; Linux/Android remote
collector support is not implied.

[ADR0109](0109-central-reviews-storage-and-code-only-development.md) remains in
force: no local Docker, local database or preview runtime. Pure fixture/SSR/API,
PowerShell parser/mock and static build checks do not constitute live acceptance.
Central configuration has no local fallback; failure is explicit.

Preparation observed 14 approved private targets. Server20 probes produced four
successful remote observations plus its separately labelled local observation;
nine targets remain unavailable. Laptop probes reached no WinRM endpoint. The
native worker is healthy, but at this checkpoint SQL 0008 and the new app package
are not yet activated. Existing pairing/data/environment remain preserved.
Subsequent operator outcomes must be appended without promoting an unverified
server or a prepared release to a completed live deployment.

See [Server monitoring](../SERVER_MONITORING.md), the
[native operator runbook](../../deployment/server-monitoring/README.md) and
[Current State](../CURRENT_STATE.md).
