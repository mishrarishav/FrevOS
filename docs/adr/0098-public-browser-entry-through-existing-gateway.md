# ADR 0098: Public browser entry through an existing HTTPS gateway

Date: 2026-11-03

Status: Accepted scope; implementation and activation pending.

The owner selects `https://tserver2.eeslindia.org/devsetu/`. Server9 is a
routing gateway only; the current application, database, workers, pairings,
configuration and persistent data stay on Server20. The legacy `/frevos`,
TrackGRN, IMS and other Server9 applications are outside this change.

Read-only authenticated observations establish Server9 as DCPUBWEB at
10.9.69.9. TrackGRN's `Analyse all` chat identifies working Kerberos WinRM on
`DCPUBWEB.eesl.co.in:5052`; the IMS `Add SQLite UAT environment` chat confirms
the same hostname. A fresh administrator session succeeds without reading or
changing a password. Server9 reaches Server20 health and UI with HTTP 200.
ARR and URL Rewrite are already enabled. The existing HTTPS certificate is
valid through 2026-11-18; this operation does not rotate shared bindings.

An IIS path rewrite alone is insufficient: the application checks exact
browser origins, secure cookies and built asset/API prefixes. Add an optional,
validated browser-entry profile on Server20. A second loopback listener in the
same process shares the existing domain services and database pool; it does
not start duplicate connectors, workers, retention loops or data stores.
Its separately built assets use the configured prefix and its authentication
uses the actual public HTTPS origin. The original internal listener and saved
connector endpoints remain unchanged. No Origin rewriting or global proxy
trust is allowed.

Public session/CSRF cookie names derive a namespace from the configured entry
prefix. Their secure host-only policy stays intact; the legacy `/frevos`
application and the existing internal entry retain their original cookie names.
This avoids accidental session collisions on the shared gateway hostname.

The first entry is browser access. It is not an operating-system VPN or a
connector endpoint migration. Existing connector transport, native pairing
and private laptop-app preview keep their present network requirements.
Unavailable public transport actions must fail explicitly rather than create
new identities or pretend a private preview works outside the VPN. A separate
public preview origin and verified connector migration require later scope.

The selected path shares its browser origin with existing gateway applications;
a path is not an origin isolation boundary. Preserve strict CSRF, authorization,
session and device-proof checks. Never weaken these to make routing work.

Prepare immutable application and routing artifacts, mapped IIS changes and
recovery before activation. Profiles carry addresses, ports, paths, site names
and expected hashes; executable code must not contain new customer-specific
conditions. Preserve sibling IIS fingerprints, existing Server20 configuration,
pairing identities, software records and environment files. Activation and
external-network acceptance must be reported separately from preparation.
