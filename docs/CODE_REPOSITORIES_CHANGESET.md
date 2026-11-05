# Code repository workspace — final changeset

Status: PASS. Repository: mishrarishav/FrevOS.
Branch: codex/code-repository-workspace.
Base: dc429ddc033fd6346b5a7edcbac2d1ca0359c163.
Deployed frozen source: afb50afd3fe6a932ddfd0fd8ce80b1c36459cd78.
The documentation commit after that source records acceptance, without changing
the reviewed application artifact. No PR, GitHub push or central-source push is
performed in this bounded task.

## Result

The public Code workspace lists actual registered central repositories and the
optional hosted provider, with scoped branches, committed folders/files, README,
history and filtered source ZIPs. Administrators see registered workspace stores;
ordinary members require ownership or explicit read access. Sharing/revocation
uses active members, revision checks and audit. Read access does not grant source
publication or deployment rights. Trusted registration supplies repository IDs,
paths, branches and exclusions; source reads execute neither checkouts nor hooks.
Existing local folder/publication and hosted PR/recovery tools remain accessible.

The live loading failure was correlated with Server20 IIS 502.3 / WinHTTP 12152
at approximately ten seconds. Only authenticated Code response sockets now allow
90 seconds, retaining bounded Git commands, workspace/source identity checks and
post-export authorization. Fetched Code HTTP 401 discards protected context and
uses the existing session-expired experience. A slow actual TCP regression covers
catalogue/tree/archive. The two-revision Git test fixture is seeded by fast-import;
all original acceptance bodies, deadlines and coverage gates remain unchanged.

## Complete changed-file list (31)

- apps/control-center/src/App.tsx
- apps/control-center/src/CodePage.css
- apps/control-center/src/CodePage.tsx
- apps/control-center/src/RecordWorkspace.tsx
- apps/control-center/src/api.ts
- apps/control-center/test/code-browser.test.tsx
- apps/control-center/test/code-repositories-api.test.ts
- apps/control-plane/src/code-git.ts
- apps/control-plane/src/code-repositories.ts
- apps/control-plane/src/component-deployments.ts
- apps/control-plane/src/developer-connectors.ts
- apps/control-plane/src/git-engine.ts
- apps/control-plane/src/main.ts
- apps/control-plane/src/repository-center.ts
- apps/control-plane/src/server.ts
- apps/control-plane/test/code-repositories.test.ts
- apps/control-plane/test/code-routes.test.ts
- apps/control-plane/test/developer-connectors.test.ts
- apps/control-plane/test/git-engine-native.test.ts
- apps/control-plane/test/repository-center.test.ts
- deployment/server20/HttpCommon.ps1
- deployment/server20/New-ServixDashboardRelease.ps1
- docs/CODE_REPOSITORIES_CHANGESET.md
- docs/CODE_REPOSITORIES_HANDOFF.md
- docs/CURRENT_STATE.md
- docs/adr/0100-code-repository-browser-and-access.md
- docs/adr/README.md
- packages/contracts/src/code-repositories.ts
- packages/contracts/src/index.ts
- packages/contracts/test/code-repositories.test.ts
- scripts/test-private-git.cjs

## Observed validation

- Frontend/backend typecheck and Biome checks: exit 0; lint advisory diagnostics
  remain. No new dependencies or lowered validation gates.
- Focused actual Git/HTTP checks: 10 tests across two files PASS, including eleven-
  second authenticated TCP replies and revoked-member denial.
- Enrolled original native build, invoked with Windows PowerShell through
  .local/Prepare-CodeLoadFixV2Release.ps1: observed session 34779 exit 0.
  Its original pnpm run ci performs repository validation, format, lint,
  typecheck, pinned native Git preparation, complete coverage, builds and audit.
  Contracts 103/17 files; Control Center 118/24; control plane 369/77:
  total 590 tests / 118 files PASS, without focused filters. Backend coverage:
  95.03% statements, 91.78% branches, 97.01% functions, 96.93% lines.
- Audit: five low and eight moderate findings, no high/critical finding.
- Actual packaged auth/RBAC/CSRF/source/ZIP/grant/revoke and delayed TCP checks:
  PASS. Fresh compiled module closures, both UI outputs, source inventory,
  archive integrity and packaged CSP: PASS.
- Windows/Linux installer payload reviews and same-certificate Android signing:
  PASS. Actual public downloads of all three match the manifest with strict TLS.
  Phone/Linux desktop installation acceptance is not claimed.
- Fresh native Plan, 33 selected snapshot files and actual authenticated UI
  activation: PASS. Both private/public health return 200; native operator reports
  databaseWritten false and retained sibling applications/private recovery files.
- Four original preview container identities, images and mounts remain healthy.
- Actual public administrator Code catalogue, Servix/DevSetu trees and both ZIP
  downloads: PASS without Retry. Observed index-D4vnR28O.js bytes match the release.
  All three registered source identities/heads are retained. No live access grant
  was created merely to test permission changes; those are isolated acceptance.

## Exact live release

Manifest: 76870e5283e8c7350884defea69a7012b46f1eeb835626ef1efec134d308cfde
Archive: 3b44050df53c237e65cc984747d1e0487d68ad33cb3abcc579cc9a369a4c4a7e
Archive bytes: 132470605
Candidate/correlation: 663581b97cfc457b8a225272a67ceadd
Actual DevSetu request: su_1412de1ec99c84fb5ca1d8dce5b29e6a
Authenticated actor: usr_windows_admin.
Target: DCAPP7 / 10.9.69.20, workspace ws_server20.
Existing owner fix/deploy authorization was materialized into a fresh single-use,
artifact/actor/workspace/target/correlation-bound record. It explicitly records
freshHumanArtifactReply false; no fresh exact-hash human reply is invented.
Source preparation uses the enrolled DevSetu adapter; activation uses the actual
public maintenance UI. This is not a UI source-publication/build-only pipeline.

Post-activation verification retains eight pairing identities/credential hashes,
seven settings, 17 software records, 33 selected snapshot files and three IIS/
relay/configuration hashes. Root and servix .env files were absent; configured
environment protection remains in force. The selected snapshot is not a full
DB backup. No schema migration or operator database write occurred; routine
application/session/background activity continues normally.

Actual committed-source downloads:

| Repository | Branch/head | ZIP bytes | Entries |
| --- | --- | ---: | ---: |
| Servix development | frevos-dev / 72cd488d5304 | 2,222,749 | 751 |
| DevSetu | devsetu-dev / 074b9e5b3377 | 1,612,015 | 585 |

Both ZIPs exclude protected environment/key/runtime paths. The existing DevSetu
central pushed head is older than the active application; it is shown honestly.
This source-browser task does not silently publish local commits or enroll a new
forge. Credential review uses verified qualified-baseline/frozen-delta evidence;
a repeated exact-current-key comparison is unavailable and not claimed. Full
production-app DB restore and actual non-admin/phone/Linux-desktop acceptance
remain outside the observed live checks. Readiness: use the Code UI and its ZIP
downloads; future source-publication/forge enrollment is a separate configured task.
