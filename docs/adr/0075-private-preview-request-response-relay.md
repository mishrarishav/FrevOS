# ADR 0075: Private paired-device HTTP preview relay

Status: Accepted for the owner's explicit implementation request, 2026-10-30.

## Scope and stack

The owner requests using another paired laptop's local application through
DevSetu over the existing VPN, with configurable targets and no public exposure.
This bounded Phase 4 task uses codex/vpn-preview-relay, stacked on deployed
source d4967eca5272cc1360245e44336a738151b6e325. That explicit follow-on is the
stacked-change plan; Android acceptance remains separate and incomplete. No
GitHub publication, merge, customer application deployment, network-rule change
or new permission grant is included.

## Decision

Reuse paired project connectors, configured development services, revision and
observation checks. A service explicitly opts into VPN preview. Only that
connector's currently owned, running loopback services may receive requests;
browser input never selects an upstream host, port, command or file. An optional
configured API path maps to the service's existing apiServiceId. Relative API
variables are supplied only at service launch; source environment files remain
unchanged. Older connectors advertise no relay capability and are rejected.

Use authenticated bounded HTTP claims/completions on the existing control
channel. Keep application requests/responses in memory, correlate each once,
cancel on disconnect/timeout, and never retry a claimed HTTP action. Do not
persist URLs, queries, headers, bodies, app credentials or cookies in job/audit
records. Record only lifecycle scope and metadata in the existing protected
local-development audit directory, before issuing a preview session.

An operator-owned preview-relay.json configures workspace, private listener,
separate private preview origins, limits and session lifetime. It is disabled
when absent. Validate private DNS resolution and listener addresses. Every
preview origin has a different hostname from the control plane and other
origins: customer JavaScript must never execute under DevSetu's session origin
or share its cookies. A short-lived, one-use POST bootstrap creates a host-only
HttpOnly preview cookie. A configured origin is leased to one target and browser
session until expiry/close; another application cannot replace an active lease.
Recheck original session, workspace permission, paired login, device owner/admin
access, source freshness and service revision on requests and connector claims.

Handle buffered HTTP methods, paths/queries, bounded binary bodies, statuses,
application headers/cookies and local redirects. Strip hop-by-hop and DevSetu
credentials. Use exact-host and Origin checks, no CORS access, no arbitrary
redirect following, and fail closed on stale/offline/revoked connections.
Streaming/SSE and application WebSocket upgrades are explicitly unsupported in
this bounded HTTP release; development hot reload can require a page reload.

## Delivery

Exercise a real loopback app, separate browser origins, concurrent requests,
binary assets, POST bodies, application cookies and redirects. Negative cases
include cross-user/workspace/device access, public/same-host origins, disabled
services, stale/revoked sessions, expiry, capacity, timeout, replay and header
injection. Validate Windows/Linux packaging and unchanged existing service plans.
An isolated local check is not live VPN acceptance. Deployment needs actual
private origin/DNS/listener configuration and an updated connector; do not claim
the installed older connector acquires this feature automatically.

## Approved execution checkpoint

The owner explicitly approves the existing DCAPP7 private hostname and the
same-scope configured DevSetu rollout, source-connector update and private
preview configuration. The observed DNS A record on the current VPN client is
the existing Server20 address; no public exposure, DNS mutation, customer
Production action or permission grant is included. The protected owner sign-in
boundary verifies the actual browser session without exposing its value.

The current enrolled packaging recipe enumerates runtime modules explicitly.
Use a scoped, one-use executor update to add only the reviewed packaging/delta
operator bytes while preserving encrypted enrollment, SDK/signing references,
adapter bytes, task definition and permissions. The new platform source then
publishes/builds/activates through actual DevSetu. A separate fixed, manifest-bound
configuration operator writes the new private configuration child and restarts
the same control task; existing runtime values, databases and sibling sites stay
unchanged. Windows project-connector sidecars update in place with pairing bytes
retained; a legacy implicit profile is resolved from authenticated server proof.
Every operator has retained preimages and failure recovery. Native fixture
transports are identified as fixtures, never as live task or VPN acceptance.
