# Server monitoring

Server monitoring is part of **Reviews → Server monitoring**, at
`/reviews/servers` below the configured application base path. It shares the
existing workspace and central installation; it does not create a separate
customer-specific application.

## Source and authorization

An administrator selects an application register, its hosting-address custom
field and the exact ownership values approved for monitoring. These are
configuration, not hardcoded customer names, workbook rows or server addresses.
The current owner-approved selection is the workbook's **Internal** value;
vendor-managed rows are excluded. A shared server address becomes one target
with references to its linked application reviews. Blank, malformed and
placeholder addresses do not become monitoring targets.

Import also requires a private operator source policy and exact endpoint
enrollment. New addresses appearing in a later workbook edit do not silently
authorize remote access. An operator must first enroll their workspace,
address, port, transport and credential-profile reference. Only literal private
IPv4 targets are supported by this collector. Its DNS endpoint must resolve to
the enrolled address, and HTTPS retains normal certificate validation.

Active workspace administrators see all enrolled targets. Other active members
see only targets explicitly granted to their account. Application ownership,
SPOC labels and access to a review register do not grant server access. The same
authorization applies to catalog reads, manual checks and alert acknowledgements;
configuration and imports require administrator authority. Credential-profile
references and grant lists are omitted from ordinary users' responses.

## Measurements and controls

The overview offers scoped card/table views, search, connection-state filters
and queued **Check now** / **Check all** actions. A server opens a Windows
Task Manager-style workspace with Performance, Processes, Services and Alerts.
Performance shows CPU, memory, uptime, logical processors, drive space and
network throughput. Collection times, last access checks and stale states remain
visible. A local central-host sample is labelled separately from remote WinRM.

Graphs contain actual received observations. Unsupported counters are null;
missing samples, long collection gaps and future timestamps are not drawn as
zero utilization or joined into an invented continuous line. Historical values
remain labelled after the configured stale interval. Process CPU uses measured
performance counters normalized by logical processors; cumulative process CPU
seconds are not a percentage. Optional empty inventory arrays do not prove that
the server has no processes or services.

The native collector bounds process, service and drive inventory. The process
view is a diagnostic selection, not an exhaustive process audit. Service metadata
is **read-only** in this feature. Starting/stopping services, killing processes,
installing software, reading file contents and arbitrary command execution are
outside its operation set. Existing Discovery service controls are a separate
feature and authority boundary. This native implementation samples Windows;
it does not claim a Linux or Android remote monitoring adapter.

Administrators configure collection interval, CPU/memory thresholds,
consecutive high samples, stale interval, history retention and maximum retained
points. CPU/memory alerts require measured samples; connection failures have
their own alert state. Acknowledgement is per user. Authentication failure
pauses automatic attempts to avoid repeatedly submitting an invalid credential;
administrator action is required before retrying.

The browser polls saved status about every five seconds while visible. A browser
read never starts a remote collector. Manual checks queue durable work and return
quickly; a bounded central worker performs collection independently of open
browser tabs. Leases, fencing, configuration revisions and authorization rechecks
reject late or no-longer-authorized results. Work is ordered fairly rather than
continually rechecking the first servers in the list.

## Central storage and native operator

State belongs to the installation's existing PostgreSQL database, with forced
workspace row-level security and revisioned transactions. SQL migration 0008
adds the server-monitoring state table. History, alerts and audit are bounded;
database failure does not create a filesystem or SQLite replacement.

The default protected configuration is `config/server-monitoring.json` under
the parent of the configured Servix root. Operators can override its location
using `DEVSETU_SERVER_MONITORING_CONFIG`. It contains typed enrollment and opaque
credential references, never a password supplied by the web UI.

A separately enrolled SYSTEM worker executes one fixed read-only PowerShell
sampling program. The application submits bounded request IDs, actions and
identity bindings to its dedicated queue. Private registry/program/profile ACLs
prevent the application identity from changing the executable or endpoint list
or forging results. Credentials are sealed in SYSTEM's DPAPI CurrentUser
context. Passwords and raw Windows errors are not returned in API responses or
task arguments. Existing authentication trust, firewall and certificate checks
are not weakened. See the [native operator runbook](../deployment/server-monitoring/README.md)
for installation, manifest, queue ACL, credential and heartbeat checks.

This workspace follows [ADR0109](adr/0109-central-reviews-storage-and-code-only-development.md):
do not start local Docker, a local database or an HTTP preview stack. Pure mocked,
parser, SSR, API-adapter and static build checks are permitted. Code-only startup
requires an explicitly verified central connection and installation context.

## Observed preparation status — 2026-11-11 IST

- The workbook has 53 records: 50 Internal and three vendor-managed. The approved
  hosting data yields 14 private server targets; eight Internal rows lack a
  usable hosting IP. Vendor endpoints and the reserved example are excluded.
  The spoken malformed address remains unresolved rather than being guessed.
- Laptop-side WinRM probes reached zero of 14 endpoints. A separate Server20
  probe reached six WinRM ports. Actual protected credential probes produced
  four successful remote WinRM observations and one explicitly local Server20
  observation; nine targets remain unavailable, including a DNS/trust-specific
  unresolved endpoint. These are separate vantage points, not contradictory
  login results. RDP or HTTP reachability alone does not prove WinRM access.
- The native SYSTEM worker on the central server is installed with 14 enrolled
  targets and a healthy heartbeat. Its credential profile is DPAPI protected.
  Existing pairing, runtime environment and customer data were not changed.
- At this preparation checkpoint the new application package was **not yet
  activated** and SQL 0008 was **not yet applied**. Application activation,
  migration/readback and live browser acceptance require their own subsequent
  execution evidence. The worker being healthy is not proof that the new UI is
  deployed or that all servers are online.

The root operator records subsequent migration, release and live outcomes in
[Current State](CURRENT_STATE.md). No successful result should be inferred for
an unavailable target.
