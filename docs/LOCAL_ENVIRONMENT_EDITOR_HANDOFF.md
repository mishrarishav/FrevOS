# Local environment variable CRUD handoff

Date: 2026-10-24. Status: PASS for local validation; live activation pending.

Repository: `D:\FREVOS\.local\worktrees\servix-dashboard`.
Branch: `feature/local-environment-crud`.
Base: `c572f8c9d89332643a3e672be3b654c21cbc6b7d`.
Publication/resulting commit and activation: pending. No GitHub PR or merge.
The preceding pilot's two working-tree handoff updates are preserved.

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
  Final UI typecheck/build passed after the last UI/encoding adjustments. The
  isolated native pipeline will run full CI again for the published source.
- All six ordinary existing Servix backend/frontend `.env` profiles are readable
  by the editor; only counts and masking metadata were inspected. Actual file
  baseline includes ten `.env`-named files; none is rewritten for acceptance.
- Final-layout browser rerun: exit 0, the same nine real browser groups passed
  with zero unexpected errors. Desktop/tablet/mobile screenshots were inspected.
- Live preflight: no unresolved actions and customer backend stopped. One
  previously running local frontend is recorded for a bounded connector-upgrade
  restart in its existing mode. Customer file hashes and Servix deployment/
  settings are recorded before activation. Live activation remains pending.

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

The two preceding pilot handoff updates are included and preserved. Diff stat
will be recorded against the base after source publication.

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
