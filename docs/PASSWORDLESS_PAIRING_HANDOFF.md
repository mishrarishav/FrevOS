# Passwordless system pairing — 2026-10-25

Status: PASS — implementation, configured live rollout and exact downloaded ZIP
verification complete. No real other laptop was silently enrolled or approved.
Repository: `D:\FREVOS`; worktree `.local/worktrees/servix-dashboard`.
Branch: `codex/passwordless-system-pairing`.
Base/deployed source: `e8716d71631136ebc4fa2b54dde3a68de1e10977`.
ADR 0059 records the owner-authorized bounded correction and stacked plan.
No GitHub PR or merge. Preserve the preceding uncommitted result documentation.

## Result and flow

The default Windows `Setup.cmd` opens a system-only enrollment that asks for the
DevSetu origin and optional local metadata consent. It does not ask for any
account username/password. The computer creates and DPAPI-protects its own
credential and a separate polling proof; only hashes go to the proposal API.
The installer shows a short lookup code valid for ten minutes.

From an existing authorized DevSetu browser, including on a different computer,
open Discovery → Approve connection, enter the code, inspect the computer/name,
OS and health/metadata access, then explicitly approve. The code by itself cannot
approve anything or obtain the device credential. Browser authorization and CSRF
bind approval to actor/workspace/target/digest/purpose/correlation/expiry. An
immutable intent and consumed receipt persist before the scoped device is
created. Changed/corrupt targets, collisions, other actors, expired/rejected
requests and attempts to use a polling proof as a connector are denied.

The same client-held credential starts its Limited task only after approval.
Connected requires an authenticated agent heartbeat and fresh health report;
status polling does not manufacture presence. Existing protected system setups
resume without browser account credentials. Code grants cannot publish Git,
change environments, execute local projects, deploy, or collect file contents.
File activity still requires local consent and server policy. Existing project
setup and explicit `Setup-Account.cmd` remain compatibility paths.

The public proposal API is origin/rate/storage bounded; authenticated lookup is
also rate limited. Expired pending/rejected metadata is pruned after thirty
minutes, while issued approval evidence is retained. State paths reject links,
including linked ancestors. The server cannot recover the client credential;
raw tokens/codes/passwords do not enter URLs, audit payloads or diagnostics.
Windows PowerShell children use their own module environment and private pipes.

## Observed validation

- `pnpm run typecheck`: exit 0.
- Focused real-domain and HTTP/account tests: exit 0, six tests across
  `passwordless-pairing`, `device-enrollment` and `accounts.integration`.
  These cover purpose/actor/workspace/CSRF, code/proof isolation, unchanged target,
  expiry/rejection, replay/idempotence, collision, persistence failure/recovery,
  status freshness, revocation, hash-only storage and legacy system resume.
  The cross-workspace assertion uses the existing 404 concealment contract.
- `node .local/Run-CleanWindowsCI.cjs > .local/passwordless-ci-release.log 2>&1`:
  exit 0. Unmodified full CI passes 302 tests (87 contracts, 86 UI utilities/API,
  129 control-plane), formatting/lint/typecheck/build/coverage and high audit
  gate. Control-plane statement coverage 95.13%; UI included coverage 100%.
  Existing five low/six moderate advisories and the large UI chunk warning remain.
- The new Windows ZIP built by `New-ConnectorDownload.ps1` runs
  `.local/Test-PasswordlessWindows.cjs` with its bundled Node v24.19.0: exit 0.
  Real isolated PostgreSQL/runtime role/RLS, real Fastify account/session/workspace
  authorization and actual built React UI are used. Two separate Chromium
  contexts simulate the installer and the already logged-in owner's computer.
  Account login occurs only once in the owner context; the installer has no
  username/password inputs or account login requests. One proposal and one
  explicit browser approval produce one device. Actual marked downloaded files,
  native ACL protection, CurrentUser DPAPI, Limited scheduled task, first health,
  continued monitoring after closing setup, and passwordless fresh-setup resume
  pass. Three installer viewports pass with zero unexpected page errors.
  No real owner account, customer DB, project folder or live enrollment is used.
- Initial UI fixture navigation failed because its synthetic membership lacked
  `client:read`, which the existing workspace shell requires. The fixture now
  uses an appropriately scoped synthetic owner. Product permissions were not
  broadened. Existing source/agent/account tests remain intact.
- `node .local/ArtifactBaseline.cjs capture passwordless-pairing`: exit 0;
  three profiles, two pipelines, eleven environment hashes, the exact current
  customer release and stopped local services captured before rollout.

Native/browser private receipts and screenshots stay in ignored `.local/`.
Code fields are cleared/hidden before screenshots; no real pairing code is
issued or approved by these tests. Every owned native fixture task is stopped
and removed only after its exact action, SID, device, loopback endpoint and
synthetic account are verified. Real customer tasks remain untouched.

## Complete changed-file list

- `apps/control-center/src/DiscoveryPage.tsx`
- `apps/control-center/src/SystemPairingDialog.tsx`
- `apps/control-center/src/api.ts`
- `apps/control-center/test/system-pairing-api.test.ts`
- `apps/control-plane/src/developer-connectors.ts`
- `apps/control-plane/src/server.ts`
- `apps/control-plane/test/accounts.integration.test.ts`
- `apps/control-plane/test/device-enrollment.test.ts`
- `apps/control-plane/test/passwordless-pairing.test.ts`
- `apps/control-plane/test/fixtures/system-enrollment-task.ps1`
- `deployment/servix/DeviceEnrollment.cjs`
- `deployment/servix/DeviceEnrollmentClient.js`
- `deployment/servix/Pairing-State.ps1`
- `deployment/servix/New-ConnectorDownload.ps1`
- `deployment/servix/START-HERE.txt`
- `deployment/servix/Setup.cmd`
- `deployment/servix/Setup-Account.cmd`
- `packages/contracts/src/developer-connectors.ts`
- `packages/contracts/test/connector-purpose.test.ts`
- `docs/CURRENT_STATE.md`
- `docs/SYSTEM_FIRST_PAIRING_HANDOFF.md` (retained prior final result)
- `docs/PASSWORDLESS_PAIRING_HANDOFF.md`
- `docs/adr/0059-passwordless-system-pairing.md`
- `docs/adr/README.md`

## Final configured delivery

Actual DevSetu UI request `pr_b41479e0865369cab52f9861e90e5434` publishes resulting
source commit `1d79cc26fd41ebf178e1ade8a76f1f595cd15997` on the task branch.
The isolated frozen build and independent SYSTEM activation succeeded. Active
manifest:
`71a2a55e03d35179462fe817c44246e5487267c52abef56352a050fdb15dab6a`.
Archive: 131,442,004 bytes; SHA256
`9fbe66e12a4346e9e570f09bd0c01ca327123bfd71602c64b0a67b1414fe60c4`.
Native receipt confirms HTTP/UI 200, databaseWritten false, sibling preservation
and retained private recovery backups. No manual release Git/build or PR/merge
was substituted for the configured pipeline.

- `node .local/Download-PasswordlessPackage.cjs`: exit 0. The actual HTTP
  200/no-store Windows download matches the sealed manifest entry byte for byte.
  ZIP size 38,993,069 bytes, SHA256
  `025ad131629641b3955843eee60002eb6a6e2db8c3132deee458991b130a06da`.
- Its own `node.exe` executes `.local/Test-PasswordlessWindows.cjs` against the
  downloaded/extracted package: exit 0. The real PostgreSQL/Fastify/account/
  browser/native ACL/DPAPI/Limited task test again passes, with one owner browser
  login, zero installer account login, one proposal/approval/device, first health,
  continued monitoring after setup closes, and passwordless fresh setup resume.
  Three viewports and zero page errors; Node v24.19.0. Synthetic isolated
  enrollment only. Owned fixture task/data are cleaned up after scope checks.
- `node .local/Test-PasswordlessLiveUi.cjs`: exit 0. Actual live Discovery opens
  the approval dialog with no password field. Desktop/mobile checks pass. Missing
  browser authentication, foreign proposal origin and missing device credential
  are denied; no real proposal/approval is created. One initial read-only browser
  navigation hit `ERR_NETWORK_CHANGED`; a fresh browser retry passed.
- `node .local/ArtifactBaseline.cjs verify passwordless-pairing`: exit 0; three
  profiles, two pipelines, eleven environment hashes, the exact active customer
  release and stopped local services are unchanged.
- `node .local/component-native-receipts.cjs native-passwordless-pairing`: exit
  0; operator receipt matches the active manifest and preserves siblings.
- `git diff --check`: exit 0. Published base-to-result diff: 24 files,
  2,211 insertions, 19 deletions, including preserved prior result docs. Final
  handoff/Current State results are documentation-only local updates saved after
  publication. No further implementation change is pending.

Readiness: use the new Windows ZIP, open Setup.cmd, enter the configured server
origin and optional local metadata choice, then approve its code from Discovery
in the authorized user's own logged-in browser. No administrator password needs
to be entered or shared on the new computer. The real target still needs that
specific human approval and its first health report.

This Windows pilot does not change Linux
project setup, invite/send messages, grant administrator/project/deployment
rights, touch customer Production or exit Phase 4. A new real laptop still needs
the human's explicit browser approval; that is not silently automated here.
