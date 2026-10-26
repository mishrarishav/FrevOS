# Local environment variable CRUD handoff

Date: 2026-10-24. Status: PASS for the bounded local environment CRUD pilot.

Repository: `D:\FREVOS\.local\worktrees\servix-dashboard`.
Branch: `feature/local-environment-crud`.
Base: `c572f8c9d89332643a3e672be3b654c21cbc6b7d`.
Initial source publication: `64b4cdd040efb6106ace89e2cb16fad078188e33`.
Final resulting/deployed source: `a97a076446fa299556d6d75473721fb199eb984b`.
No GitHub push, PR or merge. Both publications used the configured server20
source-to-deploy workflow; no manual source commit/build replaced that flow.
The preceding pilot's two working-tree handoff updates are preserved.

Live URL: `http://10.9.69.20/projects/local-development`.
Final request: `pr_b3f787bb88b37836ed99b77b4e71c755`.
Build job: `cj_aef7f6e01af9de489dc968a3a0ab4058`.
Manifest: `d1475ef8c7ed85ad4d4408d1949412db54347fdf95207c8ae28a0ba889702dec`.
Archive SHA256: `3eb82e505c446201d570a2c762f3669ce2117d81e1689f615a6d05325c51befd`,
78,279,350 bytes / 3748 files. Saved artifact reference:
`4d99d13e5573cda62672f1543527dd99c2ce946f372b4a4376a0d1cb0fca2d26`.
The independent destination Apply reports PASS, HTTP/UI 200,
`databaseWritten: false` and sibling IIS applications preserved. The preceding
manifest was `6175b16225b8d7f23a2aca0653b6b9c40b1c3f1199b17e41f92369e6b364b2ba`.
Final result documentation is a validated working-tree update after activation;
it does not change the deployed artifact or require another deployment.

## Authorized scope

The owner requests simple generic CRUD for existing local `.env` variables,
including Production preview profiles, rather than a Servix-specific editor.
ADR 0054 records the bounded extension of ADR 0053. Phase 4 exit remains open.
Production database writes, customer code/deployment, live-server environment
files, credential-provider lifecycle, arbitrary files/shells and broader
configuration are outside this change.

Local Development has an Environment variables action for each source project.
Select an existing discovered service/file; add a variable, change its value,
mark one for deletion or Undo, then explicitly Save the displayed changes.
Cancel discards unsent changes. Closing a pending request does not revoke that
request. An empty replacement is distinct from an untouched masked field.
Save requires stopped local services and no observed conflicting listener.
Restart applies the edited file; Save does not start/deploy an application.

Existing credentials and unclassified values never leave the connector. A
strict, syntax-constrained allowlist permits ordinary host/schema/port/mode and
selected boolean values; all other values are masked and replace-only. Drafts
stay in component memory. Browser X25519/HKDF-SHA256/AES-256-GCM seals all
replacement values before the request leaves the browser. Only the enrolled
connector holds its ephemeral decryption key; central intent/history contains
only sealed replacements and validated safe read results. Noble packages are
exact-pinned at 2.0.1 with the existing frozen lockfile and audit gates.
Primary implementation references: [noble-curves documentation](https://github.com/paulmillr/noble-curves)
and [noble-ciphers documentation](https://github.com/paulmillr/noble-ciphers).

The authenticated Save is actor/workspace/device/profile/file/service bound,
single-use by request ID, expiry bounded and bound to both source observation
and an HMAC of the exact original document. Cryptographic associated data binds
the sealed patch to that request. No plaintext replacement is persisted in
claims/receipts/history. Connector restart changes the key and rejects old
unexecuted payloads. An existing receipt reconciles without replay. Interrupted
unreceipted actions require review. The control plane retains its existing
workspace/ownership/CSRF authorization and serial durable intent boundary.

The writer rejects links/hard links, duplicates and unsupported dotenv syntax.
Unchanged lines, comments, line endings and BOM are preserved. The private
Windows pipe writer creates a same-directory temporary file with the source
DACL before writing, rechecks the original digest with writers locked out and
uses atomic Windows ReplaceFile while retaining the original security
descriptor. Temporary files are removed on a handled failure. Output is a
constant success marker; exceptions, values and paths are not emitted. Local
configuration freshness advances after save, with unchanged service settings.

## Observed validation

- `pnpm.cmd run typecheck`: exit 0, twice during implementation.
- `pnpm.cmd --filter @frevos/contracts run test:coverage`: exit 0; required
  coverage thresholds pass.
- `pnpm.cmd --filter @frevos/control-center run test:coverage`: exit 0; all
  required API/routing/experience coverage remains 100%.
- `pnpm.cmd --filter @frevos/control-plane exec vitest run
  test/local-development.test.ts test/local-development-runtime.test.ts`:
  exit 0, nine tests including real Windows process controls.
- Browser/native encryption interoperability and real atomic Windows save:
  exit 0. A first synthetic attempt found PowerShell converting a null backup
  filename to an invalid empty path; using `NullString.Value` corrected the
  ReplaceFile call. No real environment file was involved.
- `pnpm.cmd run build`: exit 0.
- `node .local/env-crud-browser.mjs`: exit 0, nine authenticated real-browser
  groups with actual Windows connector and isolated PostgreSQL/MySQL fixtures.
  CRUD, Undo, empty replacement, Cancel with no save, masked secrets,
  ciphertext-only transport/history, lost acknowledgment, stale document
  refusal, external edit preservation, actual restart consuming saved values,
  running-service save refusal and Production-profile selection passed.
  1366/768/390 layouts retain Save while the final row scrolls into view.
  Zero unexpected console, page or HTTP errors. The browser had WebCrypto
  `subtle` disabled to exercise the existing internal HTTP pilot route.
- Initial targeted lint caught a region `div`; changed to semantic `section`.
- `pnpm.cmd run ci`: exit 0, 263 tests (82 contracts, 82 UI/API, 99 backend).
  Required coverage, format/lint/type/build and high dependency gates passed;
  the existing one low/two moderate dependency advisories remain.
- Final encryption/file interoperability rerun: exit 0, including unchanged
  source DACL, no temporary residue, hard-link refusal and invalid UTF-8 refusal.
  Final UI typecheck/build passed after the last UI/encoding adjustments. Both
  isolated source pipelines passed frozen installation, full CI and packaging;
  the final pipeline includes the UTF-8 pipe fix and its extended Unicode test.
- All six ordinary existing Servix backend/frontend `.env` profiles are readable
  by the editor; only counts and masking metadata were inspected. Actual file
  baseline includes ten `.env`-named files; none is rewritten for acceptance.
- Final-layout browser rerun: exit 0, the same nine real browser groups passed
  with zero unexpected errors. Desktop/tablet/mobile screenshots were inspected.
- Additional Unicode interoperability: exit 0, two tests. The private Windows
  writer explicitly reads UTF-8, preserving Hindi comments and multilingual
  replacement values rather than depending on the host console code page.
  This is included before upgrading the existing connectors.
- Live preflight: no unresolved actions and customer backend stopped. One
  previously running local frontend is recorded for a bounded connector-upgrade
  restart in its existing mode. Customer file hashes and Servix deployment/
  settings were recorded before activation. Initial preflight exited 1 because
  this frontend was already running; it was preserved through the scoped stop/
  upgrade/resume sequence rather than treating it as an unrelated process.
- `node .local/env-crud-deploy.cjs deploy native-env-crud-final`: exit 0,
  real source publication, isolated frozen install/full CI, sealed package,
  digest-bound transfer and independent server20 activation succeeded. The first
  `native-env-crud` publication also exited 0; connectors were installed only
  from the final UTF-8 package. No failed build was replayed.
- Final native operator and build receipt readers: exit 0; receipt, source and
  active manifest agree. Exact packaged Windows Node 24.19.0/real PostgreSQL
  authenticated composition smoke: exit 0, `.local/env-crud-artifact-smoke.log`.
- Final sealed connector ZIP: exit 0; all eight sidecars match the immutable
  manifest. An initial direct script invocation met the host's default restricted
  execution policy; the standard process-local RemoteSigned invocation passed,
  with no global execution policy or task-definition change.
- The enrolled builder and both existing source connectors were upgraded with
  old-hash checks, private backups and unchanged pairing bytes/task definitions.
  Source sidecars match the final sealed artifact. Scoped frontend Stop/Start
  receipts both exited 0; original mode/port were restored and backend remained
  stopped. No actual customer backend or database was started for acceptance.
- Final live Playwright readback: exit 0, `.local/env-crud-live-readback-final.log`.
  Actual Production preview `.env` loads 39 variables, with password/username
  masked. 1366/768/390 layouts retain Save and reach the final row. Actual
  frontend Login/Login ID renders after restoration; no customer login or CRUD
  was submitted. All ten recorded environment-file hashes, customer deployment
  and settings are unchanged; two fresh source connections, eight sealed sidecars
  and no unresolved actions were verified.
- The first live readback exited 1 on the previously documented internal HTTP
  COOP console warning. The final check separately records exactly that known
  warning (one) while still requiring zero unexpected console, page and HTTP
  errors. It submitted no environment save on either readback.
- `node scripts/validate-repository.mjs`: exit 0, 80 Markdown files.
  `git diff --check`: exit 0. No runtime changes follow the final published CI,
  packaged smoke or live acceptance; only this result documentation is updated.

Private evidence is under ignored `.local/env-crud-*`. Tests use synthetic
values only. No real customer `.env` value has been changed for acceptance.

## Limits and readiness

This edits existing `.env` files only; it does not create/delete entire files,
edit `appsettings.json` or offer an arbitrary text editor. Single-line values
are supported; ambiguous multiline/duplicate syntax and replacements requiring
incompatible dotenv escaping fail closed. Underlying accounts are not created,
rotated or granted new database privileges. Production preview still verifies
read-only access at startup. Encryption protects persisted payloads; it does
not replace HTTPS or defend a compromised browser/source host. Abrupt power
loss can leave a private temporary file or an unreceipted save requiring review.
Phase 4 exit and general Production readiness are not claimed.

## Complete changed-file inventory

The two preceding pilot handoff updates are included and preserved. Published
source diff: 22 files, 1826 insertions and 23 deletions against the base.
Final working-tree diff, including this result documentation: 22 files changed, 1898 insertions(+), 25 deletions(-).

- `apps/control-center/package.json`
- `apps/control-center/src/EnvironmentVariables.tsx`
- `apps/control-center/src/LocalDevelopmentPage.tsx`
- `apps/control-center/src/environment-seal.ts`
- `apps/control-center/src/styles.css`
- `apps/control-center/test/environment-seal.test.ts`
- `apps/control-plane/src/local-development.ts`
- `apps/control-plane/test/local-development.test.ts`
- `deployment/server20/New-ServixDashboardRelease.ps1`
- `deployment/servix/EnvironmentEditor.cjs`
- `deployment/servix/LocalDevelopment.cjs`
- `deployment/servix/New-ConnectorDownload.ps1`
- `deployment/servix/Setup-Connector.ps1`
- `deployment/servix/Write-LocalEnvironment.ps1`
- `docs/CURRENT_STATE.md`
- `docs/LOCAL_DEVELOPMENT_HANDOFF.md`
- `docs/LOCAL_ENVIRONMENT_EDITOR_HANDOFF.md`
- `docs/adr/0054-local-environment-editor.md`
- `docs/adr/README.md`
- `packages/contracts/src/local-development.ts`
- `packages/contracts/test/local-development.test.ts`
- `pnpm-lock.yaml`

## Delivery readiness

The authorized CRUD option is live for existing local `.env` files on enrolled
projects. Stop local services before Save, then start/restart to apply changes.
Actual Production preview still requires verified read-only credentials. This
completes the bounded owner request and is ready for normal pilot use; broader
Phase 4 exit, independent acceptance and Production gates remain open. Final
post-activation documentation remains uncommitted; runtime source and installed
sidecars are pinned to the final deployed commit/artifact above.
