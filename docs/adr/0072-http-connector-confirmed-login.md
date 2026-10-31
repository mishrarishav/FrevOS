# ADR 0072: Connector-confirmed browser login on internal HTTP

Status: Accepted for the owner's 2026-10-28 instruction to retain HTTP now.
Supersedes ADR 0071's remote-HTTPS activation prerequisite for the explicitly
configured connector-page method only; all owner/role/approval boundaries remain.

## Decision

Keep ordinary users restricted to account-owned paired systems and admins able
to bootstrap elsewhere. Do not disable browser security, certificate validation,
local-network permission checks, password authentication or pairing verification.
The server-selected `connector-page` method uses deliberate top-level navigation
to the installed loopback connector, not cross-origin background fetch. Browser
vendors explicitly distinguish top-level navigation from permission-gated
subresource access ([vendor guidance](https://learn.microsoft.com/en-us/deployedge/ms-edge-local-network-access)).

After a correct password, the original browser receives a short-lived HttpOnly
pending cookie. Its UI offers named owned systems' fresh loopback ports. A public
non-authorizing transaction ID may travel in a fragment; no password, device
credential, completion proof or receiver secret may appear in a URL.

The connector serves a non-effecting local confirmation page. Only a local
same-origin, nonce/cookie checked explicit confirmation can use its private
credential to attest the transaction. It returns the proof in a top-level POST
body to the fixed configured DevSetu origin. The server validates the proof and
the attesting device's loopback port, then issues a separate HttpOnly receiver
cookie. That step creates no login session and burns the one-use receipt.

A same-origin completion must present BOTH the original pending cookie and the
receiver cookie. Forwarding the transaction to another computer/browser cannot
complete login: that recipient lacks the original cookie and the original browser
lacks the receiver cookie. Fresh owner, pairing, expiry and credential-version
checks remain mandatory. Browser session creation and its persisted device binding
use the existing deterministic boundary. No cookie-only remembered-device bypass
or claimed browser role is added.

The HTTPS loopback-fetch method remains available separately and retains its
secure-context requirement. A denied browser permission must not automatically
switch methods. The internal pilot's method is trusted versioned configuration,
not a requester-selected field. Existing native Node/PowerShell clients can still
complete the original proof protocol without browser fetch restrictions.

## Required evidence

Test successful same-browser HTTP confirmation, rejection across browser cookies,
forwarded transactions, replay, wrong origin/port, foreign owner, expiry, pairing
revocation and credential changes. Verify actual top-level browser navigation on
an HTTP network origin without flags, trust changes or private-file workarounds.
The earlier private installer `file://` browser-policy rejection remains separate
and must not be bypassed. All new/existing account requests still need manual
admin approval; no live rights are granted by this ADR alone.
