# Passwordless system pairing — 2026-10-25

Status: implementation/local validation PASS; configured rollout pending.
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

Final source SHA, deployment/ZIP identities, diff stat and live receipts are
added after configured publication. This Windows pilot does not change Linux
project setup, invite/send messages, grant administrator/project/deployment
rights, touch customer Production or exit Phase 4. A new real laptop still needs
the human's explicit browser approval; that is not silently automated here.
