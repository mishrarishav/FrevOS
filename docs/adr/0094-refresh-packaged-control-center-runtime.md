# ADR 0094: Refresh the packaged Control Center runtime

Status: Bounded implementation repair within the owner-authorized software/VPN
acceptance task. Application activation requires a fresh exact artifact review.

The private IIS route is live and its health/integrity checks pass. Actual
DevSetu UI starts L-1465 demo job sw_420e3949f62d59ed45d5f5a22d1536ca and opens a
preview lease, but the browser popup stays blank and direct preview navigation
remains unauthorized. The actual portal response's CSP allows only self form
actions, without the configured preview origin.

The sealed acce2b5c artifact has a stale compiled control-center.js whose
registerControlCenter accepts only three parameters. The freshly compiled
committed source accepts deviceLogin/previewOrigins and builds the constrained
configured CSP. main.js already passes those parameters, but the package recipe
copies the baseline runtime and omits control-center from its refresh list.
The artifact hashes are internally valid; they do not establish output/source
correspondence. Do not bypass browser protections or edit the active artifact.

Refresh all four control-center compiled outputs from the frozen fresh build,
include that source in the inventory, allow only this additional bounded module
family in the delta policy and assert fresh-output/package hash equality before
sealing. Preserve the historical maintenance bootstrap's separately declared
behavior. Add a real packaged-runtime CSP probe: the old baseline must fail and
the new candidate must pass configured origin, paired-login, unrelated-origin
denial and unchanged restrictive directives. Existing browser/auth tests remain.

Prepare with the enrolled builder after its typed two-sidecar update preserves
enrollment/task/permissions. Preserve the active IIS/relay configuration, existing
pairings, runtime/environment, software records and retained Android identity.
Show a fresh exact immutable application review before activation. No dependencies,
auth policy relaxation, network rule, customer code or raw remote command is added.

The failed browser attempt is cleaned up through DevSetu: lease close succeeds,
stop-demo job sw_0abf2b22f85b87a0bae708cadc420bca succeeds and services are empty.
The 367-record software inventory remains unchanged. Actual authenticated
cross-laptop GET/POST remains pending until the packaged output is corrected.

Observed qualification before source freeze: existing Control Center and relay
test files pass 25 tests. The real sealed local acce2b5c package fails the new
runtime probe with configured-preview-origin-absent, reproducing the live header
fault without changing production. New-candidate acceptance remains required.
PowerShell parsing, probe Biome check and repository documentation validation
pass. A slower UNC import probe is diagnostic only; use the already verified
sealed local artifact to avoid repeated network dependency imports.
