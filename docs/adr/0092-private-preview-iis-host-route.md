# ADR 0092: Private preview through the existing IIS HTTP port

Status: Owner-approved preparation; live routing activation requires the exact
review requested by the owner. Extends ADRs 0075, 0089 and 0091.

Source 2f70b82 / manifest acce2b5c is live. The scoped configuration operator
62d58ef succeeds without rewriting its identical guard. The private listener is
running on Server20 port 51860. Actual L-1770 connections to that port time out,
including direct IPv4. Server20 reports Windows firewall disabled; the network
policy causing the timeout is not available. No firewall/DNS rule is changed.

The owner selects preparing an IIS route on existing port 80, with a final exact
review before activation. Use the existing private hostname, a new hostname-only
binding on the configured private address, a dedicated pool and a dedicated ARR
farm. The farm preserves the Host header; global ARR settings and existing IIS
sites/pools/farms/bindings stay unchanged. A real mapped IIS configuration commit
already verifies this schema approach without changing live applicationHost.config.
Per-site proxy override attempts fail in the private copy and are not deployed.

Move only the configured relay to loopback and advertise its private hostname
on port 80. Keep DevSetu's IP login origin separate from application JavaScript.
Preserve existing approval/lease/cookie/role/request bounds. Disable access and
failed-request tracing logs for the new site. Its dedicated physical folder
contains no customer files or credentials and grants only the required read
access to IIS identities; existing parent permissions remain unchanged.

Use a schema-bound, digest-verified, expiring, single-use configuration operation
with retained preimages, collision and baseline checks, mapped-schema validation,
sibling comparison, portal/preview health and owned-change recovery. Bind final
approval to the operator, configuration payload, active manifest, actor, workspace,
target and correlation. Never edit the activated application artifact in place.
No application rebuild, GitHub publication, network-rule change, database write,
new credential or customer application deployment is included.

Only after owner approval: activate the exact route, verify actual L-1770 to
L-1465 browser GET/POST, close preview access, stop the owned demo, and reverify
pairings/settings/software data. Until then live browser acceptance is incomplete.

Observed qualification: 30 Windows PowerShell payload/approval checks pass. The
full typed operator passes Server20 read-only Plan, including real mapped IIS
schema commit and removal/recovery with existing sibling fingerprint unchanged.
The temporary execution task is removed. This does not prove live activation or
cross-laptop application traffic.

Primary platform references: [IIS host bindings](https://learn.microsoft.com/en-us/iis/configuration/system.applicationHost/sites/site/bindings/binding),
[mapped ServerManager construction](https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.administration.servermanager.-ctor?view=iis-dotnet)
and the actual Server20 ARR schema. Per-farm properties are verified against that
installed schema rather than assumed to support a per-site global-proxy override.
