# ADR 0073: Discovery legacy display grouping and last seen

Status: Accepted for the owner's Discovery correction, 2026-10-29.

## Scope

The owner observes two ESDS003228SS cards and requests one system card and a
visible last-online status for offline systems. Live inspection confirms one
observed monitoring connection with an installation identity and one legacy
project connection without any observation. This is a bounded Phase 4
maintenance continuation from live source
3e97455a43d15edc46bf2f61e6fa5a6364177383 on
codex/discovery-system-presence. Preserve the two preceding rollout evidence
edits. No later roadmap phase, Android client, account grant, connector deletion,
ownership reassignment, customer application or database migration is included.

## Decision

Keep installation identity, connector owner and lifecycle as the primary display
group. Associate a legacy connection lacking an installation identity with an
existing group only when its normalized hostname matches exactly one observed
group for the same owner and lifecycle. A reported platform mismatch prevents
association. Distinct reported identities with the same hostname, unknown-only
sources, different owners and revoked/active sources remain distinct. Names do
not prove physical identity: label the association as identity pending.

This supersedes the earlier Discovery presentation's separate legacy-source card
only for an unambiguous display association. Retain every original device ID,
connection, activity/history and owner-only action. Do not persist an identity
merge, transfer permissions, join histories or copy a verified identity onto the
legacy record. Later observations can split the display automatically.

Expose optional nullable lastSeenAt using the newer of the server's authenticated
connector heartbeat and stored observation receipt time. Do not use browser
visits, enrollment creation or a device-supplied clock as online evidence. A
group displays the newest known time across its connections independently of
which connection supplies health. Cards, table and connection details show local
absolute time and elapsed age, or Not recorded when no receipt exists. Retain
the existing deterministic online/stale checks. Last seen is evidence of contact,
not an exact disconnect timestamp or proof that the user was working.

## Verification

Cover the observed legacy/monitoring combination in both orders, distinct
identities with the same name, different owners, revoked status, platform
conflicts, newest group receipt, unknown presence, stale health versus a newer
heartbeat and ordinary-user response isolation. Verify actual UI cards/table
and status filtering against a labeled isolated fixture before publication.
Use the configured DevSetu publication/build/activation path for any live update;
retain exact-artifact approval and persistent-data protections.
