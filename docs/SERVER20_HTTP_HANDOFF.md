# Server20 internal HTTP access handoff

Status: **PASS** for HTTP activation and visible external login-page/health checks.

Repository `D:\FREVOS`, branch `feature/server20-internal-http`, worktree
`D:\FREVOS\.local\worktrees\server20-http`, base
`bc4530746c01269b3795a25edad63efad9364b9f`. No commit, PR, push or merge.
Other worktrees and their pending changes are preserved.

## Scope

The owner explicitly requested an accessible port, then HTTP for internal access.
The selected URL is `http://10.9.69.20`. Apply the bounded access patch to the
installed six-migration application; preserve existing database/accounts and
other IIS sites. The larger update candidate and laptop business-data import
remain separate pending work. See [ADR 0038](adr/0038-server20-internal-http.md).

## Artifact and validation

- Previous manifest: `de56c5684970bbe7a053318f532b81d1df562a55d5258e033e636cd11c06eef9`.
- HTTP manifest: `d9cd4068832e8b5b5e4548a382f88b2cc1f812edad72473bee5696d794b5f4cf`.
- ZIP SHA-256: `737758bee89ee1f0ed784fc239a4c016237f8cbc8737c1bdeb067df79cf1b33d`.
- Package: 3,635 manifest payload files; exact unchanged dependencies reused from
  the verified previous package. Source/recipe digests are in the package's
  `deployment/server20/source-inventory.json` and match current local source.
- Captured `pnpm run ci` exited 0: **183 tests** (73 contracts, 67 UI, 43
  control-plane), required coverage, build, audit with no known vulnerabilities.
  Control-plane statements 96.68%, branches 91.75%; contracts/UI coverage 100%.
  The first attempt failed typecheck on a repeated optional-cookie lookup;
  reading that boundary value once corrected the producing representation.
- Exact packaged Windows Node24.19 / disposable PG18.4 / actual Edge acceptance
  exited 0: six migrations in isolation, native entrypoint, HTTP form login,
  cookie persistence across reload, browser CSRF denial and authorized create,
  logout. Owned processes and disposable database cleaned up.
  The browser smoke used the first HTTP artifact
  `87198a5a9c8e2872ca8e95b6ca1d4f865738d05f60f1a3bb6ae9fafcf8cd00a4`;
  all 3,625 application payload files in the final artifact have identical hashes.
  Later corrections affected only the operator and its source receipt.
- Native PowerShell syntax, source snapshot hashes and two operator MJS Biome
  checks passed. Full package verification and bounded delta checks passed.
  These checks do not simulate live IIS rollback or establish unobserved recovery.
  `Test-InternalHttp.ps1` passed exact previous/candidate integrity, bounded delta,
  wrong-digest/migration-change denial and reserved PowerShell assignment checks.
- Earlier local preparation attempts retained ignored incomplete outputs. A slow
  PowerShell verifier was replaced with bounded Node stream verification;
  a missing Framework ZIP assembly import was corrected before a usable archive
  was produced. No failed preparation artifact was activated.
- Final repository documentation validation passed (49 Markdown files), changed
  MJS checks passed, source hashes matched the deployed input receipt and
  `git diff --check` passed. A broader optional `biome check .` reported seven
  existing import-organization assist diagnostics in unchanged tracked baseline
  files; targeted Git comparison confirmed all seven are unmodified. This is
  separate from the repository CI's passing formatter/linter gates. Unrelated
  baseline imports were not reordered by this access correction.

## Live operator

Authenticated SMB RPC stages and runs a fixed digest-verified operator on verified
host DCAPP7. No arbitrary remote command endpoint was added to the product.
The staged directory is
`E:\FrevOS\operator\internal-http-8e45195180344729b88756f05351e923`, with private
operator/Administrators/SYSTEM ACLs and receiver-verified archive bytes.

Plan passed against the actual installed manifest, runtime, task, services and
IIS profile. The temporary preflight task was removed after action verification.
The owner's explicit request is recorded as a scoped fifteen-minute single-use
authorization for the exact manifest/ZIP and correlation above. It is not a
claim that the owner separately reviewed the diff. Apply passed: HTTP health and
UI returned 200, sibling site inventory was unchanged and the temporary apply
task was removed after ownership verification. The control-plane task now points
to the verified final release; runtime origin is `http://10.9.69.20` with the
explicit internal HTTP opt-in. A fresh postcondition comparison confirmed the
database connection value and auth mode are unchanged, backend remains loopback
10000, and active state matches the final digest.

Two earlier attempts retain private receipts/backups:

- `5a79216370a84f3a9b228b0d1c351bf9` failed creating the release directory under
  SYSTEM before switching runtime/task/state or adding a binding. Initial native
  detail was limited to IOException. The ACL helper used the requesting actor as
  owner; the correction makes the executing principal the resource owner and
  grants the actor separately. A fresh live ACL preflight probe passed.
- `ec8d2f3ce90d4f4bb2668724a3af2aba` switched the application, added HTTP and passed
  HTTP health, then failed on reserved `$home` assignment at the final UI check.
  Its exact binding was removed, runtime/state/task restored, and old backend
  health verified. Receipt says `restoredPrevious: true`. The final variable is
  `homepageResponse`; an AST guard now rejects reserved assignments.

Consumed records were not replayed. Corrected artifacts used fresh bounded
attempt/correlation records under the owner's continuing instruction. Failed
prepared releases and operator directories are retained with known identities.

Backups include runtime JSON (secret-bearing, private), active state, original
task XML, IIS configuration and sibling-site inventory. Recovery restores only
the owned task/config/state and added exact binding, with identity checks;
unrelated processes and global IIS configuration are not overwritten.

No new credential values were logged or copied to chat. No TLS warning was
bypassed, firewall profile changed, or database migration/import executed.

## External acceptance and remaining work

Visible Playwright/Edge confirmed `http://10.9.69.20/`, title **FrevOS Control
Center**, UI 200, health 200 / ok, and visible Username/Password/Sign in controls.
Observation: 2026-10-21 00:28:47 IST (18:58:47 UTC on October 20).
An older browser context still showed the prior IIS welcome page; a fresh
context returned FrevOS. The verified fresh window remains open and earlier
tool-owned diagnostic windows were closed. If an existing browser retains the
welcome page, hard-refresh it. Private evidence is in ignored
`.local/live-browser.json`, `.local/server20-http-live.png`,
`.local/http-apply-result.json` and `.local/live-postconditions.json`.

Live authenticated login has not been exercised; actual HTTP login/session/CSRF
was tested with the identical application payload against disposable PostgreSQL.
No live database-content comparison or laptop-data import is claimed. The second
attempt exercised actual recovery; other mixed outcomes, outside concurrent
modifications and failed cleanup remain unverified.

Before a later full update/data import, incorporate this HTTP profile and the new
active baseline into that candidate's runner. The older prepared 8443-bound
package/approval is not an instruction to overwrite this HTTP setup. The larger
update, data import and self-update worker remain pending.

## Complete changed-file inventory

21 changed files; 1048 additions and 33 deletions excluding this handoff's own line count. No generated runtime output or private data is tracked.

| File | State | Added | Removed |
| --- | --- | ---: | ---: |
| `apps/control-center/src/api.ts` | modified | 3 | 1 |
| `apps/control-center/test/api.test.ts` | modified | 25 | 1 |
| `apps/control-plane/README.md` | modified | 9 | 0 |
| `apps/control-plane/src/config.ts` | modified | 22 | 1 |
| `apps/control-plane/src/server.ts` | modified | 65 | 29 |
| `apps/control-plane/test/crypto-config.test.ts` | modified | 30 | 0 |
| `apps/control-plane/test/postgres-service.integration.test.ts` | modified | 85 | 0 |
| `deployment/server20/Apply-InternalHttp.ps1` | new | 161 | 0 |
| `deployment/server20/HttpCommon.ps1` | new | 31 | 0 |
| `deployment/server20/New-InternalHttpRelease.ps1` | new | 43 | 0 |
| `deployment/server20/Start-Server20.ps1` | new | 22 | 0 |
| `deployment/server20/Test-HttpArtifact.mjs` | new | 286 | 0 |
| `deployment/server20/Test-InternalHttp.ps1` | new | 24 | 0 |
| `deployment/server20/Verify-HttpManifest.mjs` | new | 128 | 0 |
| `docs/adr/0038-server20-internal-http.md` | new | 52 | 0 |
| `docs/adr/README.md` | modified | 3 | 0 |
| `docs/CURRENT_STATE.md` | modified | 19 | 1 |
| `docs/SERVER20_HTTP_HANDOFF.md` | new | self | 0 |
| `packages/contracts/src/auth-cookies.ts` | new | 19 | 0 |
| `packages/contracts/src/index.ts` | modified | 1 | 0 |
| `packages/contracts/test/auth-cookies.test.ts` | new | 20 | 0 |
