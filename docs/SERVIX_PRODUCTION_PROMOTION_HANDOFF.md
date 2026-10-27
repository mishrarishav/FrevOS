# Servix saved-backend Production promotion

Date: 2026-10-27 IST. Status: Production activation pending; platform live PASS.
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

VPN recovered on 2026-10-27. Inspecting history showed the overnight unconfirmed
popup had submitted no run. The actual owner browser signed in again and
published source `e58a2f68290884c57a7223e568535390d450ae3a` in request
`pr_7d2372322b21de619bd0ccdcc35a6447`. CI passed, but the installed packager's
old module list omitted the new promotion modules; packaging failed safely.

The bounded operator update `94eaf10d123f4877a70756bf6418a049` imported only
`HttpCommon.ps1` and `New-ServixDashboardRelease.ps1` from that frozen source.
Both previous files remain backed up; builder task configuration and DPAPI
credential bytes were verified unchanged. The visible retry
`pr_1c92360166fda9d4001954131282064b` published
`e6ca25a3098737fdc67c518b9a189a08bb508398` (identical source tree), passed CI
and built the actual 3,965-file package. Its manifest is
`dfcc4da6e2dcaaa7647493780cf58d41130466877ecb8966f6f8cf5c374cc439`, ZIP
`b86c98dce6acc657772a985ab6d4ef8035fd6c49a9996d483e3d21d38c55e612`, and
component reference digest
`78412259cb45a4d06cef117db12acfac0f28c54b2946ec3c3325e73aaef8ed92`.
Independent Plan and Apply `ed392743444845a59add51913aead8ce` both report
PASS; Apply reports HTTP/UI 200, no operator database write and sibling IIS
preservation. The configured pipeline reports succeeded.

The actual new `/projects/promotions` page reports the registered worker online.
Its selected saved Development restore remains `sd_4fa6678413b3b23b2ba677ad4b09f6e3`.
Preparation `pm_8bcdd4bee32b23e623f8bf26b141e3e6` verified the saved artifact,
then failed safely during target file observation, before backup or cutover.
Bounded read-only diagnostics report `promotion-linked-path`: the installed
Node 20.11.1 alias `C:\Program Files\nodejs` points to `C:\nvm\v20.11.1`.
The customer-data scan found no links. The diagnostic tasks were removed after
their exact command identity was verified; no Production permissions changed.

[ADR 0066](adr/0066-canonical-promotion-runtime-identity.md) configures that
existing canonical executable and requires the observed process to resolve to
the exact same plain file. Different files, missing/relative paths and links in
the configured executable or protected inventory remain denied. No customer
runtime upgrade, environment edit or junction change is included. Validate and
publish this correction through DevSetu, prepare again, then obtain the concrete
task/permission approval before verified cutover.

Evidence: `.local/production-platform-live-{run,native-receipt,apply}.json`,
`.local/agentic-native-operator-promotion-update.json`,
`.local/production-promotion-live-pm_8bcdd4bee32b23e623f8bf26b141e3e6.json`,
`.local/production-promotion-diagnostic-pm_8bcdd4bee32b23e623f8bf26b141e3e6.json`.
The last separately checked public Production health was OK with both bootstrap
flags ready. Live Production activation is not claimed.

ADR 0066 local follow-up validation: native syntax, Biome format/lint,
repository validation (102 Markdown files), complete diff/secret review and
`git diff --check` exit 0. The initial filtered test invocation actually ran
44 backend files: 177 tests passed and the existing inventory test failed
because its Windows PowerShell child inherited the PowerShell 7 module path
(`Get-FileHash` unavailable). With the native module path,
`pnpm.cmd exec vitest run test/promotion-files.test.ts test/persistent-file-inventory.test.ts`
exits 0, both files/four tests pass, including the actual junction/resolver CLI
and original full-file inventory regression. No test or threshold was weakened.
The configured source pipeline must pass its full CI gate before activation.

## Complete changed-file inventory

Initial publication diff stat: 42 files, +4254/-41. The ADR 0066 follow-up adds
one decision document and updates the existing helper, registry, test and handoff
files below; final statistics must be recorded after validation.

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
- `docs/adr/0066-canonical-promotion-runtime-identity.md`
- `docs/adr/README.md`
- `packages/contracts/src/artifact-promotions.ts`
- `packages/contracts/src/index.ts`
