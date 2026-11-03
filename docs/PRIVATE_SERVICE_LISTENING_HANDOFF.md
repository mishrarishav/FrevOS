# Configurable private API listening

Status: Server20 deployment PASS, 2026-11-03 21:23 IST. L-1465 connector
update and real L-1770 to L-1465 direct LAN and authenticated VPN gateway
GET/POST PASS, verified 21:56 IST. Direct VPN peer IP routing remains unavailable.

## Completed peer acceptance

The owner updates L-1465 from the new Windows installer. The same original
device, owner and credential identity remain, both software permissions are on,
and network capability version 1 reports current private interfaces. Its bundled
API program matches the deployed release. The administrator explicitly adopts
that program through the real DevSetu catalogue action, revision 1 → 2; all other
catalogue fields remain identical.

- DevSetu starts the owned API on reported VPN address 10.242.1.14:5080, allowing
  L-1770's 10.242.1.13 only, for 900 seconds. Job
  sw_21dd0bee7171c0c16ff1729cbc074181 succeeds. Actual L-1770 browser gateway
  GET/POST returns L-1465 and that instance, echoing nonce
  demo-1793722879966-5de8112c785288. The lease is closed and the API stopped.
- A source-bound native direct VPN peer request returns ENETUNREACH. Read-only
  Find-NetRoute shows 10.242.1.14 uses Wi-Fi's default route, not a VPN host/subnet
  route. This does not establish the server-side VPN peer policy or return route.
  No VPN route, firewall or DNS setting is changed to force the test.
- Both computers also report addresses on the same Wi-Fi network. Through the
  same DevSetu controls, start job sw_daa0c883ebf490f0ac5050e97ec6ed64 binds
  192.168.1.4:5080 and allows only L-1770's 192.168.1.2. Native HTTP and actual
  L-1770 browser direct GET/POST succeed with matching L-1465/job identity. The
  browser receives nonce demo-1793722962892-1d0a898f604398. This proves direct LAN
  access while VPN is connected; it is not a VPN peer IP success.
- Both starts retain loopback and pass their consumed administrator/digest
  checks. Both stop jobs succeed: sw_306e6a0a73886a3affb62fd6949728e5 and
  sw_30b3a0860c1aff62ac61adadcef8ab93. Final capability has zero services;
  the stopped direct LAN port refuses connections and gateway returns its
  expected 401 closed-access denial. DevSetu health remains 200.
- Eight pairings and five settings verify. All 12 preexisting software records
  other than the intentionally revisioned catalogue remain byte-identical,
  including inventory and prior jobs. Four new successful test jobs are retained.
  Existing IIS/relay and customer projects remain unchanged.

Actual private IPs above are observations for this test, not application defaults.
Same-network direct access is accepted. Across different networks, the existing
authenticated VPN gateway is accepted; direct VPN peer IP access needs network
administration to provide/verify its routes and peer policy separately.

## Live release and preservation

- Application source: 6dbae78aba7dd577042dd131c180b8ff19a2f32d, task branch
  codex/service-network-bindings, ADR 0097.
- Manifest: 07ac11a8701b15d5a2872131fa6321b1f17fb3a8be260602afd40e097db0b21b.
- Archive: 09a7c5102c86dbf3114d6ad64bb6e7a07ac10ebe5f8a12853fbce2645a074dcd,
  132,078,067 bytes; 4,058 package files, 252 committed source inputs.
- Native builder: cj_b775f7d1859331adb3b79483b563186a; candidate/native operation:
  8cc85720304c4a9aa9c0d48607fa0f27.
- Actual authenticated DevSetu maintenance request:
  su_63e3b06d12e837d72cf9fb02c468d9ab, actor usr_windows_admin, workspace
  ws_server20 / mishrarishav/FrevOS/server20, target DCAPP7/10.9.69.20.
- Native Apply, HTTP health and UI health PASS. Eight pairing identities and
  five settings verify; all 13 preexisting software records remain byte-identical
  before subsequent intentional catalogue/service operations. A private 27-file
  recovery snapshot includes settings, pairings, active reference and software
  records. This selected snapshot is not a database backup.
- Existing IIS and preview relay configuration verify unchanged. No schema,
  customer-project, DNS or firewall change. Recovery backups remain retained;
  no live rollback is claimed.

The owner explicitly instructed testing followed by deployment in the current
chat. The single-use native intent binds the actual artifact, candidate, target,
Windows SID and 15-minute expiry. Its audit records that instruction without
inventing a new artifact-specific human reply. Activation uses the real DevSetu
UI. A first form submission rejected an overlong approval reference; shortening
that reference yielded exactly one accepted deployment request.

## Implemented behavior and qualification

Discovery → selected computer → Software → Approved catalogue provides Listen on,
API port, lifetime and explicit allowed-client IPs. Interfaces come from the
connector's current OS observation; no laptop/IP conditional is embedded in the
application. The bounded execution adapter is the DevSetu-owned temporary API,
not arbitrary customer application rewriting or a general TCP/UDP mesh.

Keep localhost as the default. Private mode binds a second listener to one
currently assigned RFC1918 IPv4 address while retaining localhost and the
authenticated gateway. Deny wildcard/public/unassigned addresses and unexpected
clients, Host and mutating browser Origin. Bind configuration into the existing
job digest and administrator checks, revalidate before execution, and stop the
owned service if the interface disappears. Port conflicts preserve unrelated
listeners. No automatic firewall rule or VPN route is created.

The connector negotiates optional network capability with the server. Old clients
retain localhost mode; new clients avoid new observation fields against an older
server. The new API program digest is adopted by an explicit revisioned catalogue
action after the updated connector reports it. Deployment does not silently edit
the existing software catalogue.

Full immutable native CI passes 537 tests across 106 files: 99 contracts, 110 UI,
328 backend. Formatting, lint, typechecks, builds and audit gates PASS. Backend
coverage is statements 95.14%, branches 91.83%, functions 97.17%, lines 96.88%.
Audit reports five low and eight moderate advisories, no high/critical advisory;
dependencies were not changed.

Actual source controls and separately the exact packaged SoftwareManagement,
SoftwareClient, child DemoApi and PreviewRelay pass real local-browser direct-IP
and gateway GET/POST. These fixtures run on L-1770, return matching job instances
and echoed nonces, and clean up their own leases/services/storage. They do not
constitute L-1770 reaching L-1465. Native socket tests also cover lost interfaces,
old-server negotiation, peer/Host/Origin denial and foreign port ownership.

Windows 20-file and Linux 14-file runtime closures PASS. All three live downloads
match the active manifest and return no-store. Android retains its signing
identity; phone and genuine Linux desktop acceptance remain separate.

Credential qualification uses the verified qualified baseline and frozen-source
delta, with independently derived retained IIS/relay digest evidence. The old
exact-key journal is unavailable; no repeated direct-current-key scan or
exhaustive secret audit is claimed. Provider secrets are not build inputs.

## Connector update and repeatable service workflow

Use the same Windows user that originally paired L-1465:

1. Download a fresh Windows installer from Discovery, extract into a new folder
   and run Setup.cmd. Do not reuse the earlier ZIP or extraction.
2. In the setup browser page's Account dropdown select Advanced: update existing
   connection / legacy code. Leave code empty. No username or password is needed
   for this saved connection update. Keep the configured Server20 URL.
3. Retain the file-activity choice; keep Share installed-program inventory and
   Trust administrator-approved software catalogue installs and temporary API
   services enabled. Click Connect this computer and wait for Connected.
4. Confirm the original device identity, owner and permissions remain. The
   reported bundled API digest must match the new release and network capability
   must list current private interfaces before private mode is used.
5. From L-1770, approve the API version update in the existing catalogue, choose
   L-1465's currently reported appropriate private/VPN interface, port 5080,
   900-second lifetime and only L-1770's freshly verified private client IP.
6. Start API through DevSetu. Verify the direct URL from L-1770 with actual GET
   and POST, matching L-1465/job identity and nonce; preserve gateway behavior.
   Direct reachability depends on VPN and OS firewall policy. Report any observed
   failure accurately rather than inferring reachability from a listener.
7. Close preview access, stop only the owned temporary API and verify historical
   records and original pairings/settings. Catalogue adoption and new service
   jobs are intentional audited changes; do not label them byte-identical.

Before the completed update, the live page correctly showed localhost mode, a
Download connector update link and a disabled Approve API update action. After
the update it exposes actual interfaces; the catalogue now matches the connector.
The final live controls show Start API enabled and no running service. To repeat
the accepted LAN scenario, select the current Wi-Fi address and the caller's
current private IP before starting; addresses may change with network leases.

## Evidence and scope

Private task `.local/software-network-*` records contain build/CI, artifact,
installer, packaged browser, 27-file snapshot, native Plan, owner-request intent,
activation receipt, live downloads, preservation and policy verification.
Screenshots are under `.local/evidence/software-network-*`.
The `software-network-peer-final-acceptance.json` record explicitly reports
PASS_WITH_VPN_ROUTE_LIMITATION, with separate native/direct browser/gateway,
route, job lifecycle and cleanup evidence. It does not claim direct VPN success.

Preparation uses the configured enrolled native builder; activation uses DevSetu.
This is prepared-artifact activation, not proof of a new UI build-only pipeline.
No GitHub push, PR, merge or central-source publication is performed by this
operation. Documentation commits do not change the active application source.
