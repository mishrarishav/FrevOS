# ADR 0097: Configure private service listening through DevSetu

Date: 2026-11-03

Status: Owner-authorized implementation; qualification and activation pending.

## Context and scope

The owner asks to configure listening from DevSetu so a paired laptop's API can
also be opened directly using its private/VPN IP and port. The current owned
temporary API binds only loopback; the accepted Server20 gateway workflow stays
available. Start from application 7625404 and documentation checkpoint cafbaf0 on
task branch codex/service-network-bindings.

Implement a reusable private-listen contract and actual execution for the managed
temporary API. Keep the default loopback behavior. A user selects a currently
reported private IPv4 interface, port/lifetime and explicit private client IPs in
the existing Software workspace. Do not hardcode laptop names or addresses.
Do not rewrite customer applications, add raw commands, change VPN routes or
silently open machine firewall rules. Direct reachability needs an actual peer
test; a successful local bind alone does not establish it.

## Decision

- Bind both loopback and the selected RFC1918 interface, preserving the existing
  authenticated gateway transport. Reject wildcard, public, malformed and
  unassigned addresses. Allow direct requests only from the configured clients
  or the source interface itself; guard Host and mutating browser Origin.
- Bind the selected address/client list into the existing request digest and
  administrator approval. Revalidate consent, device, current interface and
  catalogue before execution. Stop the owned private listener if its interface
  disappears. Never take over or kill an unrelated process occupying a port.
- Report concrete binding and direct URL from observed running services. Use
  Start API terminology for the temporary-service recipe. Keep ordinary software
  installation actions and history.
- Negotiate network capability through the connector identity response. Older
  clients keep their loopback workflow and show an explicit update requirement
  for private listening. New clients avoid new observation fields against older
  servers. A connector runtime update preserves pairing, state and permissions.
- A new bundled API program digest is approved through the existing revisioned
  catalogue action; deploying the application does not silently edit catalogue
  or previously accepted software records.

## Validation and release boundary

Implementation qualification: contract and management tests, native dual sockets,
port conflict ownership, old/new connector negotiation, interface loss and
preserved relay pass. Actual local browser controls approve a fixture catalogue
revision, select an OS-reported interface and start the real child API; direct
private-IP GET/POST and gateway GET/POST return the same service instance. The
fixture is stopped and removed. This is same-machine qualification on L-1770,
not acceptance of L-1770 reaching L-1465. Repository validation, formatting,
lint (existing non-fatal diagnostics retained) and typechecks pass. Full immutable
native CI, artifact review and live deployment are next.

Test strict contracts, stale/missing interfaces, client restrictions, approval
tampering, observation mismatches, old/new negotiation, dual-listener lifecycle
and preserved gateway GET/POST. Exercise actual listener sockets and browser
controls. Prepare and qualify an immutable release with installer closure and
native Plan, preserving existing pairing/data/environment/IIS. Activation and
the exact private IP/port/client scope must be concrete and reviewable. Reuse
the existing user authorization; do not repeat permission prompts for unchanged
actions. Record any OS privilege or VPN/firewall limitation observed in the real
peer test instead of claiming it works from fixtures.
