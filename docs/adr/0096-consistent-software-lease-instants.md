# ADR 0096: Construct software leases from one clock instant

Date: 2026-11-03

Status: Activated in source 7625404; fresh inventory and real demo lifecycle PASS.

## Observed problem

Full native CI for the preview-header repair fails the existing actual software
client integration at demo startup. An isolated run reproduces it; later isolated
passes do not prove resolution. The owner reconnects VPN and signs in again.
Both laptops and the existing L-1465 pairing/permissions are freshly verified.

An actual DevSetu inventory refresh is requested on L-1465. Request
sw_a167c9e7a098e21b3899a74886fb71a0 is claimed and marked interrupted 144 ms later.
The prior 367-record inventory is preserved. Its timestamps are
2026-11-03T12:16:57.150Z and 2026-11-03T13:16:57.151Z: a lease of 3,600,001 ms.
Offline validation of that exact job confirms its binding digest matches, while
the working-shape job is rejected by the unchanged maximum-duration check.

SoftwareManagement reads the clock separately for created/issued time and
expiry. Crossing a millisecond boundary makes either the one-hour job or the
ten-minute install approval exceed the strict connector protocol limit. The
fixed-clock unit fixtures hid this timing-dependent defect.

## Decision

Capture one clock instant for each new job and each new approval, and derive
expiry from that instant. Preserve the exact one-hour/ten-minute limits, digest,
consent, workspace, device, administrator, catalogue and single-use checks.
Do not add timing tolerance, replay an interrupted install, alter old job history
or weaken connector validation. No connector reinstall is required for this
server-side construction fix.

Add a deterministic advancing-clock regression covering inventory, administrator
auto-approval and manually approved installs, including actual connector protocol
validation of claimed jobs. It reproduces the exact one-millisecond violation on
old source before the fix. Stop the obsolete unactivated preparation, retain its
failure evidence, then prepare a new immutable release containing this correction
and ADR 0095. Preserve pairings, settings, data, environment and isolated IIS/relay.

After qualification and exact artifact activation, perform a fresh UI inventory
request and actual L-1770 browser GET/POST against the temporary L-1465 demo.
Close the preview lease and stop only the owned demo. Retain the interrupted
request as history; never relabel it successful.

## Acceptance

Full native CI passes 527 tests. Actual UI refresh
sw_68de3048a3b9129c6916820ebed28e31 succeeds with 367 entries. Demo start
sw_93f97a430c4527f96f04dcb69350af97 succeeds with an exact one-hour job and
ten-minute approval. L-1770 browser GET/POST returns L-1465 and an echoed nonce.
The preview lease is closed and owned stop sw_7f2adf9c5f519661c808b66cdde6a63f
succeeds with no services remaining. The old interrupted record is retained.
See [the completed handoff](../PRIVATE_PREVIEW_ORIGIN_RELEASE_HANDOFF.md).
