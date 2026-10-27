# Servix saved-backend Production promotion

Date: 2026-10-27 IST. Status: BLOCKED for live deployment; local validation PASS.
Live Production deployment is not yet verified. Phase 4 remains open.

Repository: `https://github.com/mishrarishav/FrevOS`.
Worktree: `D:\FREVOS\.local\worktrees\servix-dashboard`.
Branch: `codex/servix-production-readiness`.
Base/HEAD before configured publication:
`5730940fe6c40cc3eb5002ef6beaa564c9571e5f`.
An ancestry-only local merge `2ca0759aa75f23b453fef72f25d8f30923728c2d`
reconciles the owner's GitHub squash with internal tip
`7acce2d8df5a2da02462e27a3f9e05f3fab4d06d`. The dry-run and actual merge trees
both equal accepted main's `83d52387c7f856abb666d764f13b6ccc9d3d9e6e`;
all 42 uncommitted changed-file hashes remain identical across the merge.
No force update, default-branch change, PR merge or external publication was used
for this one-time ancestry repair. Implementation publication remains through
the configured DevSetu source pipeline.

## Scope and behavior

[ADR 0065](adr/0065-configured-saved-backend-production-promotion.md) implements
the owner's request for actual DevSetu execution after ADR 0064's disconnected
proposal. The separate configured promotion page prepares and reviews an exact
successful saved Development backend. It does not rebuild customer code, install
dependencies, replace frontend/IIS or retarget the legacy Development adapter.

The new deterministic queue validates workspace/owner/configuration/target,
immutable artifact and backup hashes, expiring single-use approval, current
process identity, same-owner task adoption, protected inventory and recovery
source. Required audit persistence precedes executable work. Interrupted claims
are not replayed. Only the exact reviewed listener can be stopped; post-start
health must belong to the reviewed managed executable and owner.

Remote database credentials travel as a PSRP-encrypted `PSCredential`; plaintext
is resolved only at the private backup child stdin boundary. Browser state,
review records, process arguments and audit payloads contain no credential values.

All existing files remain in place. New immutable runtime/bundle files and a
selection pointer provide code recovery. Any new batch-logon right and scheduled
task credential binding need an explicit review; deny rights and Group Policy
are not overridden. Code recovery does not restore a database.

Target: `servix-production`, DCAPP9 / `10.9.69.21`, `D:\Servix`, API 5000,
`https://support.eesl.co.in/`. Protect the configured five backend paths, all
environments and recovery source, frontend/IIS and external `D:\oracle\blob`.
The fixed target/connection/repository bindings are data in the reviewed registry.

Retain the tested bundle
`5ff7622a9f316edbe0485c47f179f6c1bccac75241e6540f1d0079b11172fb0c`
and descriptor
`8e525dab58dde2e560fbc2d7f18547a1d3c1e048204062e09c98c97b227eac96`
from saved Development restore `sd_4fa6678413b3b23b2ba677ad4b09f6e3`.
Customer dependency advisories remain as recorded in
[Production readiness](SERVIX_PRODUCTION_READINESS.md); no upgrades are included.

## Observed validation

| Command/check | Observed result |
| --- | --- |
| `pnpm.cmd run ci` with Windows PowerShell 5.1 module path | Exit 0 after native protocol correction; 88 contract, 92 UI/API and 177 backend tests, 357 total. Repository validation, format, lint, types, coverage, build and high-severity dependency gate pass. |
| Backend coverage | Statements 95.23%, branches 91.59%, functions 96.60%, lines 96.71%; thresholds unchanged. |
| Required UI coverage | 100% on all four required metrics. |
| Platform dependency audit | Exit 0 at the unchanged high-severity threshold: five low and six moderate findings; no high/critical. Separate customer findings remain unresolved. |
| Native matching backup/restore | `node deployment/servix/Test-PromotionBackup.cjs .local/mysql-8.0.28-winx64.zip`, exit 0. Real Windows dump, CurrentUser DPAPI, complete decrypted/gunzipped integrity, separate actual restore and exact synthetic blob digest pass. Customer connections were not used. Temporary option file removed. |
| Native script parser | 48 `.ps1`/`.psm1` deployment scripts parsed, zero failures. Actual batch-logon readiness must be read on target; it is not inferred from local parsing. |
| Real PostgreSQL HTTP integration follow-up | 22 tests passed, including the authenticated workspace-scoped promotion preparation API, CSRF and scope denials. |
| Native file/runtime tests | Saved byte identity, real bundle entry, retained-source recovery, every protected original file, environment drift, collision, traversal and junction denial pass. |
| Complete tracked whitespace check | `git diff --check`, exit 0; CRLF normalization notices only. |
| Packaged native entry smoke | Exit 0. Exact 3,965-file package passes manifest/delta/module closure and Windows Node 24.19.0 entrypoint with a separate real PostgreSQL fixture; authenticated promotion composition, route, CSRF and invalid-approval denials pass. Manifest `63d68de67517f452688fb1afba45436b05acac0dd9c755e7a9e5b7b8bef5bdfc`. This local package is not a live activation. |
| Standalone executor protocol | Eight store/protocol tests pass, including real Node child execution for scope, target drift, expiry, immutable review sealing, changed actor/digest and stale backup rejection. This exposed and corrected native Windows ESM imports: use `file:` URLs, not drive-letter paths. |
| Final exact packaged executor | Exit 0, manifest `d9fbc47a03630ac238f95c2340719234258e908b0dd6793bdee4bf5acd539894`, ZIP `551d8411765c05e44595f2c99826d802a78807db72f813c1844184af26f89d9d`. All earlier package-composition checks plus actual packaged native authorization with PostgreSQL pass; absent actor/workspace are denied. No live server change. This supersedes the earlier smoke package above. |
| Exact worker backup client | Actual `Get-PromotionMysql` extracts and verifies its official archive pin and exactly four files. Both classic clients load and report 8.0.28. MySQL client SHA `d5383d7fdacee4d053d7690d9086085d30a6b5b4a3103f77ffa3399f161894ca`; dump SHA `072990ae3bdc73f28601dea9615b069d511e3bc1a606553313d32fcfc7f6a0ad`. Customer connections were not used. |

The first full CI run exposed the existing model-secret ACL provider's domain
name lookup failure. Applying the exact same SID-bound owner/SYSTEM descriptor
through .NET preserves its restrictions; the actual native secret round trip and
cross-scope denials then pass. No acceptance tests or thresholds were weakened.

Local Docker startup encountered inaccessible stale IPC socket files. Only
stopped, verified IPC directories were renamed and retained; no Docker images,
volumes or application data were reset. Docker then started and real integration
tests ran. These local fixture operations did not change Production.

## Remaining live evidence and limitations

The owner restored VPN after a server20 HTTP/SMB timeout. Actual DevSetu source,
builder and destination presence is now online. Publish/update the platform
through its existing visible configured pipeline, then run the new native
Production preparation. A fresh review must bind the observed target, current
owner/process, backup and saved bundle before any cutover.

The initial adoption runner deliberately refuses an already existing task or
selection pointer; later managed promotions need a separately reviewed adoption
extension. A lost controller or unverifiable public health is reported as
recovery-required and blocks further overlapping updates. A batch right granted
before a later failure is explicitly reported; it is not silently claimed undone.

Fresh backup receipts distinguish stream integrity from isolated restore. The
matching native fixture and earlier actual Production restore rehearsal do not
pretend every newly captured backup was separately restored. Live attachment,
health and complete preservation evidence remain required before deployment PASS.

Readiness: ready for actual configured platform publication and native preflight;
not a Phase 4 exit or a claim of completed Production deployment.

## Latest live checkpoint

The actual DevSetu Deploy all popup was submitted with the owner's bounded ADR
0065 change record. It returned “Request not confirmed”; retain its original
request rather than creating a duplicate. The open browser tab is kept for
continuation. No implementation source publication or Production activation is
confirmed. The local ancestry repair above retains every working-file byte.

VPN recovered briefly, then the server20 TCP/HTTP probe timed out again. The
Fortinet interfaces were disabled/disconnected and route selection for server20
used the ordinary Wi-Fi default gateway. A fresh VPN reconnect is requested.
No Production process stop, task registration, environment/attachment write or
batch-logon grant was performed in this implementation run.

The later PSRP credential-transport refinement parses successfully and uses the
same backup child contract; its actual remote execution remains part of the
pending native preflight. The final local smoke package includes the corrected
standalone executor protocol and verifies its real database authorization. It
remains a test artifact, not the eventual configured source-pipeline release.

Next: recover VPN, inspect the original request/history, retry that exact request
if appropriate, and resolve any definite failed source request before starting
a fresh one. Finish the configured platform release, then fresh Production
preflight, concrete adoption/permission approval and verified cutover. Do not
bypass the UI flow or the existing Development exclusion.

## Complete changed-file inventory

Prepublication diff stat: 42 files, +4254/-41.

- `apps/control-center/src/App.tsx`
- `apps/control-center/src/ArtifactPromotionsPage.tsx`
- `apps/control-center/src/DeploymentSettingsPage.tsx`
- `apps/control-center/src/api.ts`
- `apps/control-center/src/routing.ts`
- `apps/control-center/src/styles.css`
- `apps/control-center/test/app.test.tsx`
- `apps/control-center/test/promotion-api.test.ts`
- `apps/control-plane/src/artifact-promotions.ts`
- `apps/control-plane/src/main.ts`
- `apps/control-plane/src/server.ts`
- `apps/control-plane/test/artifact-promotions.test.ts`
- `apps/control-plane/test/postgres-service.integration.test.ts`
- `apps/control-plane/test/promotion-files.test.ts`
- `deployment/server20/HttpCommon.ps1`
- `deployment/server20/New-ServixDashboardRelease.ps1`
- `deployment/servix/BatchLogon.psm1`
- `deployment/servix/Invoke-PromotionTarget.ps1`
- `deployment/servix/ModelSecret.ps1`
- `deployment/servix/ProductionBackendRuntime.cjs`
- `deployment/servix/PromotionBackup.cjs`
- `deployment/servix/PromotionConnections.json`
- `deployment/servix/PromotionFiles.cjs`
- `deployment/servix/PromotionProtocol.mjs`
- `deployment/servix/PromotionRegistry.json`
- `deployment/servix/PromotionTools.json`
- `deployment/servix/PromotionWorker.psm1`
- `deployment/servix/Protect-PromotionBackup.ps1`
- `deployment/servix/Run-Activation.ps1`
- `deployment/servix/Run-PromotionHelper.ps1`
- `deployment/servix/Run-SavedBackend.ps1`
- `deployment/servix/Test-PromotionBackup.cjs`
- `docs/CURRENT_STATE.md`
- `docs/SERVIX_BACKEND_ARTIFACT_HANDOFF.md`
- `docs/SERVIX_PRODUCTION_DEPLOYMENT_PLAN.md`
- `docs/SERVIX_PRODUCTION_PROMOTION_HANDOFF.md`
- `docs/SERVIX_PRODUCTION_READINESS.md`
- `docs/adr/0064-visible-production-configuration.md`
- `docs/adr/0065-configured-saved-backend-production-promotion.md`
- `docs/adr/README.md`
- `packages/contracts/src/artifact-promotions.ts`
- `packages/contracts/src/index.ts`
