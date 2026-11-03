# Private preview packaged-runtime repair

Status: Historical packaging repair activated successfully, then superseded by
source 7625404 with completed live browser acceptance. See
[the current handoff](PRIVATE_PREVIEW_ORIGIN_RELEASE_HANDOFF.md).

Repository mishrarishav/FrevOS (provider ID 1329122983), branch
codex/software-inventory-vpn-preview. Bounded implementation base
c1ad31f0490c4cd4ac2e0551a673808cc1646ee8, frozen source
812501ddec7fdd80ca998d11c812ebed9daf6b82, tree
eff3cedc18a2d91d06bd726509a9adf5f47768bf. No PR, GitHub push or merge is performed.
At this preparation checkpoint the active application was source 2f70b82 /
manifest acce2b5c; the subsequent activation and correction are recorded below.
The previously activated private IIS route stays live and unchanged.

## Problem and bounded fix

Actual DevSetu UI starts L-1465's temporary API, but preview bootstrap is blocked.
The sealed application artifact contains an old compiled control-center.js,
although main.js passes the newer device-login/preview-origin options. The recipe
refreshes selected baseline modules and omitted control-center. Its self-only
form CSP therefore blocks the configured private preview form.

Refresh all four compiled control-center outputs, inventory its source, extend
the bounded delta policy for that module and compare package/fresh-build hashes.
Before archive sealing, run the actual packaged module through a Fastify injection
probe for configured preview origins, paired-login origin, restrictive directives,
navigation and invalid-origin denial. Preserve the explicit historical maintenance
bootstrap exception. No dependency, customer code, schema, network-rule or
authentication-policy relaxation is introduced. ADR 0094 records the decision.

The failed live attempt is cleaned up: start sw_420e3949f62d59ed45d5f5a22d1536ca,
stop sw_0abf2b22f85b87a0bae708cadc420bca, services empty and server preview-close
audit observed. Inventory remains 367 records. This is not a successful GET/POST.

## Immutable candidate and preparation evidence

- Manifest b8aed7d69538007f689c7974a94b7d24aca80c6a87a4566c2c9aeb42be672b0e.
- Archive 8c0c31b15ed796942cecac9caf19b7b85c778ab95d1ee9a839998fe40df0812f,
  132,081,001 bytes; 4,058 package files / 251 committed source inputs.
- Builder correlation cj_91ee06bc17ed3d95ffbb6adceab1e60d; candidate/native Plan
  correlation 8f03ca8733af421e9b5931324ca90917.
- Target DCAPP7/10.9.69.20; actor usr_windows_admin and existing EESL operator SID;
  workspace ws_server20 / mishrarishav/FrevOS/server20.
- Existing typed builder two-sidecar operation pve_1484fa4ee12041d0af1ffaf4bc89db5c
  passes with enrollment/adapter/task/root permissions preserved.
- The enrolled native adapter builds the frozen bundle through its unchanged
  build method. This is build-only operator preparation plus authenticated
  maintenance activation, not a claim of a new UI build-only pipeline or source
  publication.
- Four local preview containers retain IDs, images and mounts and are healthy.
- Native read-only Plan passes with configurationChanged/databaseWritten false
  and its temporary task removed. Fourteen private selected snapshot files verify
  eight stable pairing identities/credentials and five settings. Seven completed
  software/catalogue/inventory records plus existing IIS/relay hashes verify.
- Retained IIS digest 204d1c51d699f836b4ee13f8d24b78dbda0cd625329080df3c87109b6594b1ac;
  relay digest 005b5e44bdb4bb875408906045977f6c15334a4b1e08d3a97f608194ae301c11.

## Observed validation

- `pnpm.cmd --filter @frevos/control-plane exec vitest run
  test/control-center.test.ts test/preview-relay.test.ts`: exit 0, 25 tests PASS.
- `Test-ControlCenterArtifact.mjs` against the sealed old local acce2b5c artifact
  reports FAIL / configured-preview-origin-absent as expected. Its isolated fresh
  output fixture passes, verifies four outputs/two navigation paths/invalid-origin
  denial, and removes only its verified owned fixture.
- Enrolled `.local/Prepare-CspSoftwareRelease.ps1`, observed session 11847:
  exit 0 / PREPARED. Full CI passes 104 files / 526 tests (97 contracts, 108 UI,
  321 backend), builds and audit gates. Backend coverage: statements 95.13%,
  branches 91.80%, functions 97.16%, lines 96.87%. Audit retains five low and
  eight moderate advisories; no high/critical advisory or dependency change.
- `.local/Review-CspSoftwareArtifact.cjs`: exit 0 / PASS, all package/source
  hashes and stored archive verify; actual packaged CSP probe passes and all
  four outputs equal the fresh frozen build.
- `.local/Review-CspSoftwareInstallers.cjs`: Windows 20-file and Linux 14-file
  runtime closures PASS; Android signed with retained certificate
  0d3a704822eacaef060a4560c2f800479179eed96dfbf9e94993dcf2b75cec92.
- `.local/Stage-CspSoftwarePlan.ps1`: exit 0 / native Plan PASS. Copies the exact
  already-verified Server20 artifact-store archive into private staging and keeps
  the independent staged digest and native Plan integrity checks.
- `.local/Recheck-CspSoftwareActivation.cjs` and
  `.local/Verify-CspExtraProtection.cjs`: exit 0 / PASS; fresh candidate remains
  unsealed/unconsumed and protected identities/settings/data/routing match.
- Probe Biome check, PowerShell parser, `git diff --check` and documentation
  validation (147 Markdown files at source freeze) pass. Initial import ordering
  and unsafe-finally lint findings are fixed; no rule is disabled. A slow read-only
  UNC module-import diagnostic is stopped after switching to the verified local
  sealed artifact; it is not represented as a successful remote runtime probe.

Credential qualification retains the previous verified baseline/frozen-source
delta chain, rechecks 2,663 prior text files, qualifies 17 changed source files
and seven changed artifact text files, and validates the two prior IIS operation
receipts/digest evidence. Unknown digest-shaped values/private-key shapes fail
closed. The former exact-key journal is unavailable: this is not a repeated
direct-key scan or an exhaustive secret audit. No secret value is copied to this
handoff, source, logs or browser review.

## Complete bounded implementation delta

```text
deployment/server20/HttpCommon.ps1                 |   2 +-
deployment/server20/New-ServixDashboardRelease.ps1 |   6 +-
deployment/server20/Test-ControlCenterArtifact.mjs | 108 +++++++++++++++++++++
docs/CURRENT_STATE.md                              |   8 ++
docs/adr/0094-refresh-packaged-control-center-runtime.md | 45 +++++++++
docs/adr/README.md                                 |   3 +
6 files changed, 170 insertions(+), 2 deletions(-)
```

This handoff and the next CURRENT_STATE checkpoint are documentation follow-up;
the application artifact stays bound to frozen implementation source 812501d.
The exact approval was received and consumed. Actual DevSetu maintenance request
su_fa961f5e0e8469cb84d203a9361a14d6 activates this artifact successfully: native
Apply, health, eight pairings/five settings, retained software records, IIS/relay
and all three served installer hashes PASS. It is the active application.

The subsequent actual browser attempt starts demo sw_7ffea31e8d534d52b844688994ab9195
and reaches the preview bootstrap, which returns preview-bootstrap-denied.
Portal no-referrer suppresses Origin on this cross-origin form POST. The preview
lease is closed and demo stop sw_0201f595e7a3fc1401c10956f03a0a8b succeeds; observed
services are empty. Local isolated browser reproduction proves strict-origin
preserves the exact portal Origin and completes cookie/GET/POST with nonce.
ADR 0095 scopes a separate immutable header correction; the relay must continue
rejecting null or incorrect Origin. No live cross-laptop GET/POST, live rollback,
third-party install, Linux desktop or phone acceptance is claimed. Phase 4 remains open.
