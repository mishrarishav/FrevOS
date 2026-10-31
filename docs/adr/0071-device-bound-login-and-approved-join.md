# ADR 0071: Paired-device login and manually approved join requests

Status: Accepted for the owner's explicit follow-up, 2026-10-28.

Later decision: [ADR 0072](0072-http-connector-confirmed-login.md) supersedes only
the remote-HTTPS prerequisite for the configured connector-page method. The
original decision below is retained as history; owner and approval rules remain.

## Scope

Extend ADR 0070's bounded Phase 4 Discovery work: normal DevSetu users may log
in only from an account-owned paired computer. Configured admins can log in on
an unpaired computer and register it for a selected user before logging out.
The owner additionally requests Request to join on the login screen, manual
admin approval, a resulting pairing code and browser-suggested Windows/Linux
installer download. The owner explicitly selected BOTH new-account onboarding
and an existing user's additional computer; every request needs admin approval.
No other roadmap phase or customer application deployment is implied.

## Boundaries

Keep existing local password hashing, lockouts, HttpOnly cookies, CSRF, fresh
workspace membership and exact admin policy. A valid ordinary password alone
must not create a browser session. Complete a short-lived browser-bound login
transaction using an account-owned connector's credential, proven through an
origin/host-checked loopback service. Never send the connector credential to the
browser. Proofs are distinct, expiring and single-use. Reject foreign owners,
revoked pairings, replay, malformed or expired proof and unbound old sessions.
Login requires a running updated connector. An established session may survive
brief connector/network loss until normal session expiry while its pairing stays
active. Revoke/unpair or role removal is rechecked on protected requests.

Admin bypass comes from verified server configuration/membership, never a client
claim or login name. Admin registration records approver and assigned account
separately. The owner assignment and target device participate in immutable
approval intent/consumption records. No existing device is silently reassigned.
This supersedes ADR 0070's self-pairing permission for ordinary users in the
configured pilot. It does not grant cross-owner file or process controls.

Anonymous join requests create no account, device credential, session or admin
grant before manual approval. New users choose their own password; only a salted
verifier may be retained privately pending approval. Existing users prove their
current account password without gaining a session. Approval is bound to the
request, workspace, assigned user, preallocated device, platform/consent scope,
target digest, authenticated admin and expiry. New accounts receive the existing
ordinary developer scopes only. Never reset an existing user's password or let
a requester choose an admin role. Retrying an interrupted operation may reuse
only the exact already-created identity/verifier for that request.

After approval the requester sees their one-use expiring pairing code and the
appropriate installer. Store only the code hash on the server; keep raw code
in the requesting browser and out of URLs/logs/audit. Installer redemption binds
locally generated private credentials to the approved device/user once; retain
admin intent, consumption and safe outcome evidence. Codes are not login proof.

Browser OS detection is a convenience hint with a Windows/Linux override. It
does not establish authorization or a hardware identity. Installer downloads
contain no account credential. The actual installer must check its platform
and target scope, disclose collection consent and preserve existing connections.
Never expose arbitrary remote URLs/commands or bypass browser local-network
permission prompts. Unsupported architectures remain explicitly unsupported.

Remote activation requires a trusted HTTPS DevSetu origin. Current browsers
restrict loopback-network permission to secure contexts; the pilot's present
plain HTTP origin cannot safely activate paired login. Startup rejects a remote
HTTP origin before this policy is enabled. A loopback HTTP origin is allowed only
for isolated local verification. No certificate trust, browser flags or existing
IIS bindings are weakened. The owner must supply/approve a valid certificate and
hosting configuration before reviewed live activation. This follows the browser
vendor's [Local Network Access guidance](https://developer.chrome.com/blog/local-network-access).

The Linux download defaults to system-only onboarding through the same reviewed
code protocol. It uses the signed-in non-root user's systemd/cgroup-v2 manager,
private Unix modes and a verified runtime inventory. Preserve identity and state
on update; keep bounded recovery copies and restore verified old bytes after
startup failure. Windows keeps its existing protected per-user lifecycle. The
explicit account/project compatibility launchers also complete paired login.

## Required evidence

Exercise ordinary login rejection on unpaired/wrong systems, successful paired
login, proof expiry/replay, cookie/browser binding, credential-version changes,
revocation after login, restart, admin login without a connector, admin-only
registration with assigned ownership, new/existing join approval/rejection and
single-use redemption. Verify HTTP and browser flows using synthetic accounts
and a real loopback listener; do not create live user accounts for testing.
Record Windows/Linux installer packaging and any unverified native targets.
Activate only through the configured reviewed platform workflow with evidence;
do not modify Servix, its data or customer dependency versions.
