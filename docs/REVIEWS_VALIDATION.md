# Reviews local validation — 2026-11-10

Superseded workflow note, 2026-11-11: the owner forbids new local Docker,
database and preview stacks. The historical checks below must not be rerun as
normal local setup. Central migration SQL 0007 and one register / 53 records /
74 endpoints / one report are now applied and read back from the existing
Server20 PostgreSQL database. Its document hash matches the exact import plan.
No app activation occurred; that remains owner-operated. The current pure/mock
subset passes 90 backend tests, with 7 launcher-policy, 5 packaging and 11
transport tests also passing. Typecheck/build pass without starting services.
See [central migration](REVIEWS_CENTRAL_MIGRATION.md) and
[ADR0109](adr/0109-central-reviews-storage-and-code-only-development.md).

The status and operations below describe their dated historical checkpoints.

Status: PASS for this bounded local implementation and its tests. A live release
and the complete native platform release CI are not claimed.

Repository: FrevOS. Branch: `codex/configurable-review-registers`.
Base and current HEAD: `6addf9b4f86d6052cd89b5511bb0b28191a556cb`.
Changes remain local and uncommitted; no resulting commit, PR, push, publication
or Server20/T-Server activation was requested or performed.

## Observed checks

| Check | Observed result |
| --- | --- |
| `pnpm run typecheck` | PASS for contracts, control-plane and frontend |
| `pnpm run build` | PASS; ordinary existing large-chunk advisory from Vite |
| Final control-plane build and `/devsetu` local-auth frontend build | PASS |
| Five Reviews backend/authority/workbook/checker/PostgreSQL test files | 51 tests PASS |
| Reviews plus existing crypto/config, Code routes and public browser-entry regression subset | Seven files / 33 tests PASS before the additional authority file |
| Authority and existing crypto/config subset | 39 tests PASS |
| Full frontend `test:coverage` | 30 files / 134 tests PASS; configured API/experience/routing coverage 100% |
| Full contracts tests | 18 files / 106 tests PASS |
| Scoped Biome formatting/check and `git diff --check` | No errors; nonblocking style diagnostics remain in some existing integration/source files |
| `pnpm run validate:repo` | PASS |
| `pnpm audit --audit-level=high` | Exit 0; five low and eight moderate advisories reported, no high/critical |
| Production dependency deploy to ignored local runtime package | PASS, frozen dependency graph and supplied workbook parser smoke |
| Packaged metadata denial, inactive-member denial and invalid-root rejection | PASS without contacting metadata endpoints |
| Native release script AST parse | PASS; new runtime/UI/contracts sources added to source inventory |

The first full frontend run encountered Windows PowerShell autoload failure in
the pre-existing native environment-seal fixture. Restricting the test process's
`PSModulePath` to Windows PowerShell module directories resolved it. The targeted
fixture and subsequent complete coverage run passed. No system-wide module path
or application encryption code was changed to accommodate the test.

## Browser acceptance

The local browser uses the actual built UI and API, a disposable Docker
PostgreSQL instance, real local-login/session/CSRF code, and atomic review files.
It is bound to loopback at `http://127.0.0.1:57971/devsetu/reviews`. The separately
configured HTTP page fixtures are also loopback-only; a test-only checker adapter
permits them. Production code continues to deny loopback targets.

- Created a register through the UI with its own name, management choices and
  eight additional fields. No customer fields or values are application seeds.
- Uploaded the actual owner-supplied workbook through the native chooser; both
  worksheets and hidden column spans were available for explicit mapping.
- Mapped all source columns, explicitly matched choice aliases, inspected the
  preview of 54 source rows and three issues, retained incomplete-URL records
  for later editing, and skipped the duplicate row. Exactly 53 records remain.
  Technical maintainers and employment status were not inferred.
- Confirmed independent Card/Table filters: selecting Internal showed 50/53;
  switching to Table restored 53/53. Search, pagination and internal horizontal
  scrolling remain available. Restart/relogin retained the imported records.
- Checked actual CSS viewports around 1366x768, 768x1024 and 390x844. No page-level
  horizontal overflow; table overflow stayed inside its scroller. The phone
  filter drawer was usable. Header actions stayed accessible. Card density was
  reduced with scoped styles; an ordinary desktop card measured about 176 px.
- Created a separate synthetic application. The actual browser Test link action
  first found its expected page, then detected a soft 404 after the endpoint was
  changed: HTTP 200, title `404 Not Found`, result `Error page detected`.
  The old successful check remained historical and the new result remained
  distinct from the recorded access field. Saved a server-attributed review.
- Granted a synthetic viewer only the synthetic register, signed out/in through
  the actual UI, and verified that the imported register was absent. Viewer
  screens contained no Import, Add, Settings or Test link controls. Backend tests
  independently reject direct viewer writes and revoked/foreign access.
- Restored the administrator and imported register for the owner. Temporary
  viewport overrides were reset. Proof screenshots are in the conversation's
  ignored `.local/reviews-proof` directory; no screenshots or workbook content
  are included in the source change.

The source workbook hash remained
`896f4844cce550b274ad04c8d72ac5063da58921045b5498a87e0fe34ee65d45`.
At this initial implementation checkpoint, no existing environment file, pairing,
remote connector, live database, customer uploads, IIS configuration or production
data was changed. No customer endpoint had been requested by those tests. The
local register intentionally starts with an
empty production-network allowlist: an administrator must select permitted
origins in Settings and expected identity text per link before measured health
can be established. Import never grants network access automatically.

## Limits and handoff

Use [Reviews](REVIEWS.md) for configuration and workflow. Server-side checks do
not execute JavaScript or authenticate to applications. Scripts-only shells,
compressed responses and missing expected identity remain unverified rather than
being called healthy. Actual remote endpoint acceptance belongs to the server
network on which the owner deploys the feature. No e-office/mail workflow is
implemented in this phase.

The review root must be retained and backed up. The owner must select this source
branch/worktree and run the existing publication/build/release gates, including
the new dependency lockfile, before activation. The native source inventory now
contains the new module inputs; this is not a claim that a live artifact has
already been built or approved.

## Complete changed files

Existing tracked files:

- `apps/control-center/src/App.tsx`
- `apps/control-center/src/RecordWorkspace.tsx`
- `apps/control-center/src/api.ts`
- `apps/control-center/src/routing.ts`
- `apps/control-plane/package.json`
- `apps/control-plane/src/config.ts`
- `apps/control-plane/src/main.ts`
- `apps/control-plane/src/server.ts`
- `deployment/server20/New-ServixDashboardRelease.ps1`
- `docs/CURRENT_STATE.md`
- `packages/contracts/src/index.ts`
- `pnpm-lock.yaml`

New files:

- `apps/control-center/src/ReviewsPage.css`
- `apps/control-center/src/ReviewsPage.tsx`
- `apps/control-center/test/reviews-api.test.ts`
- `apps/control-center/test/reviews-page.test.tsx`
- `apps/control-center/test/reviews-routing.test.ts`
- `apps/control-plane/src/review-authority.ts`
- `apps/control-plane/src/review-link-checker.ts`
- `apps/control-plane/src/review-registers.ts`
- `apps/control-plane/src/review-workbook.ts`
- `apps/control-plane/test/review-authority.test.ts`
- `apps/control-plane/test/review-link-checker.test.ts`
- `apps/control-plane/test/review-registers.test.ts`
- `apps/control-plane/test/review-workbook.test.ts`
- `apps/control-plane/test/reviews.integration.test.ts`
- `docs/REVIEWS.md`
- `docs/REVIEWS_VALIDATION.md`
- `docs/adr/0107-configurable-application-review-registers.md`
- `packages/contracts/src/review-registers.ts`
- `packages/contracts/test/review-registers.test.ts`

The tracked diff before this handoff report had 12 files, 387 insertions and
45 deletions. The complete change additionally includes the new files listed
above; they must not be omitted merely because `git diff` excludes untracked
files. Private preview/test packages, local databases and workbook values remain
ignored and are not part of publication.

## Actual workbook links — owner-authorized follow-up, 2026-11-10 IST

The local loopback Reviews instance now contains explicit configuration for 101
exact protocol-specific origins, with private-network access limited to those
origins, 8-second deadlines, 256-KB prefixes and at most five redirects. No
wildcards, app credentials or TLS bypass were used. Older ASP.NET sites were
checked with the new opt-in anonymous session-cookie handling, isolated to one
check/initial origin. Existing grants remain unchanged.

The 53 imported records contain 51 original links. All were requested through
the actual authenticated Reviews API using the production checker (the isolated
loopback fixture adapter is selected only for its own fixture origin). Twenty-
three protocol-unspecified source links additionally received an explicitly
labeled HTTP diagnostic alongside HTTPS. The original HTTPS result is retained.
No HTTP diagnostic was substituted for an explicit source HTTPS hyperlink.

At 2026-11-10T18:07:07Z, the latest complete 74-endpoint pass measured:

| Result | Original 51 links | All 74 protocol-specific checks |
| --- | ---: | ---: |
| Expected page text and HTTP status matched | 6 | 6 |
| Returned page needs identity/browser verification | 13 | 14 |
| Unreachable / DNS failure / total deadline | 16 | 32 |
| Sign-in/access restriction detected | 2 | 5 |
| Redirect target blocked by exact-origin policy | 3 | 3 |
| HTTP error | 3 | 4 |
| TLS validation error | 8 | 10 |

The two additional records have no single usable URL. The grouped server label
and MCS entry were not guessed into endpoints. `www.example.com` remains a source
placeholder, never an expected healthy application.

Concrete evidence: GEF5, Apps and EKApp returned HTTP 404. Recruitment returned a
sign-in form. HTTP diagnostics for CMS and Ujala's integrated portal returned
login forms while their HTTPS entries retained TLS errors; Attendance returned
403. Test CCMS and test SCMIS API redirected to the unrelated corporate homepage
and remained blocked. The `agdsm.in` redirect to its unapproved `www` origin also
remains explicit. The first-hop response is not misreported as the destination's
status when a redirect is blocked.

Read-only browser observations are saved separately in configurable evidence
fields: 13 dashboard/application/catalogue pages visibly rendered, three sign-in
pages (Unify, UrjaVEER and BoardPAC), one incomplete Bihar SLNP heading-only page
and one domain-parking/different page at the Inspire address. No application
credentials were submitted or transactions executed. CCMS/UP CCMS displayed old
sync dates; availability does not imply data freshness. Client-rendered pages or
oversized server responses retain their measured `unknown` result alongside
the independently recorded browser evidence. They were not forged into healthy
server-check results.

The local application table includes HTTP results, last-tested time, final URL
and configurable browser evidence. Multiple endpoints label each HTTP status and
URL separately, so an HTTP login does not appear to clear a TLS error. Column
filters can isolate HTTP 404 or browser sign-in outcomes. Detail histories retain
both obsolete and current tests with their distinction.

Regression validation after these changes: 57 Reviews authority/domain/parser/
checker/PostgreSQL tests pass, all 116 contracts tests pass (including 10 new
policy tests), contracts and control-plane builds/typecheck pass, and frontend
builds/typecheck pass. The full frontend suite passes 143 tests after the final
endpoint-label improvement. The native ACL fixture uses a
process-only Windows PowerShell module-path correction, without weakening tests.

The source workbook SHA256 is unchanged. Results, browser observations, a local
configuration export and pre-check backup are in ignored
`.local/reviews-preview/actual-links/`; no personal workbook values, synthetic
account grants or local workspace IDs are seeded in application code. Final
publication/activation remains owner-operated. These observations are from the
owner laptop's network at the recorded time, not a claim about Server20's future
network reachability. Local test data/configuration do not automatically migrate
with a code deployment; the destination review root/register must be configured
and imported deliberately without copying fixture account grants.

Final built-UI acceptance confirms the HTTP filter returns exactly the three
404 applications, and the browser-verification filter returns Unify, UrjaVEER
and BoardPAC as the three manually observed sign-in pages. Actual Apps HTTP404
and Unify browser evidence are saved in the owner's ignored `.local/reviews-proof`
directory as `actual-404-evidence.png` and `actual-browser-login-evidence.png`.

## Scheduled monitoring acceptance — 2026-11-11 IST

PASS, local implementation on `codex/configurable-review-registers`, base
`6addf9b4f86d6052cd89b5511bb0b28191a556cb`. No resulting commit, PR, push or
Server20/T-Server activation was created. ADR0108 bounds this continuation.

Final observed checks (all exit 0):

- Contracts build and `pnpm run typecheck`: all workspace packages pass.
- Control-plane TypeScript build and local-auth `/devsetu` frontend Vite build:
  pass. Vite retains its existing large-chunk advisory.
- Eight scoped Reviews control-plane test files: **83 tests pass**. Includes
  actual PostgreSQL/authenticated HTTP routes, no requests to excluded fixture
  records, authority revocation, schedule/configuration/source binding, paused
  manual runs, catch-up/restart/DST, orphaned attempts, missing URLs, alert
  deduplication/renewal/thresholds and private read receipts.
- Full frontend: **153 tests / 31 files pass**. Includes the exact eligibility
  form, native time saving, role restrictions, TLS freshness, compact summary,
  dashboard/bell independence and `/devsetu` API action wiring.
- Full contracts: **137 tests / 20 files pass**. Legacy check data remains
  readable without inventing TLS metadata; new inputs are bounded and strict.
- Actual trusted, expired, untrusted and hostname-mismatched TLS fixtures pass
  with verification enabled. Test-only trust does not become a runtime setting.
- The production runtime helper copies the frozen Review modules and exact
  pinned XML/ZIP production dependency closure into a new package output; actual
  compiled imports and XLSX parsing pass outside the checkout. Missing
  dependencies, unpinned importer metadata, link escapes and live-style output
  targets are rejected before mutation. Actual Windows PowerShell delta tests
  accept the intended overlay and reject modified/new/deleted environment,
  pairing/data and unrelated paths. No full release or installer build was run.
- `git diff --check` passes. Source workbook digest is unchanged.

A real local weekly occurrence was enabled for Wednesday 01:30 Asia/Calcutta,
with only the two explicitly selected Accessible/VPN source classifications.
Without clicking Run check now, it started at **01:30:04 IST**, completed at
**01:32:04 IST**, selected 27 records, excluded 26 and completed all **34 configured
URL checks**. Results were six expected-page matches, ten unverified pages,
five TLS failures, eleven unreachable outcomes and two access/sign-in outcomes.
Unknown results are not declared downtime or success. The grouped server entry
has no URL and is not a fabricated HTTP endpoint; the final implementation now
reports this missing-URL case as partial with an explicit message (native domain
regression passes). The saved earlier acceptance report remains historical.

The run retained 28 HTTPS-hop observations, including 18 verified certificate
observations. Actual retained expiry evidence includes:

| Endpoint | Certificate not-after (UTC) | Local time (IST) |
| --- | --- | --- |
| EECALCULATOR | 2026-11-13 23:59:59 | 2026-11-14 05:29:59 |
| BoardPAC | 2026-11-15 23:59:59 | 2026-11-16 05:29:59 |
| Several EESL dashboards | 2026-11-18 23:59:59 | 2026-11-19 05:29:59 |

These are observations, not renewed-certificate claims. Expiry threshold notices
were generated from verified metadata and shown in the actual Control Center
and existing notification bell. The final store has 23 active, site-deduplicated
expiry/TLS alerts. No application sign-in credentials were submitted.

Built-browser acceptance verifies native Time 09:17 saves and reopens as 09:17
instead of reverting to 09:00. The local demo was then paused, weekdays cleared
and time restored to 09:00. Accessible choices and 15/10-day thresholds remain
ready for owner configuration; cached certificate reminders retain their last
observation time. Browser tests verify Reports and dashboard totals, certificate
issuer/date/freshness, bell alert navigation, and bounded mobile forms. Requested
desktop/tablet/mobile overrides were 1366x768, 768x1024 and 390x844; browser zoom
reported 1518/853/434 CSS-pixel widths respectively, all without document-level
horizontal overflow. The mobile form scrolls internally and retains its footer.
Viewport overrides were reset.

Screenshots are in the owner's ignored `.local/reviews-proof` output directory:
`weekly-scheduled-report.png`, `weekly-monitoring-dashboard.png`,
`ssl-certificate-evidence.png`, `ssl-notification-bell.png`,
`weekly-schedule-settings.png` and mobile proof variants. Local schedule/report
exports are in ignored `.local/reviews-preview/actual-links`. They are evidence,
not production account/permission seeds. The running local helper uses a
disposable Docker PostgreSQL database and retained isolated review state.

Additional files in this continuation:

- `packages/contracts/test/review-monitoring.test.ts`
- `apps/control-plane/src/review-monitor-schedule.ts`
- `apps/control-plane/test/review-monitoring.test.ts`
- `apps/control-plane/test/review-link-tls.test.ts`
- `apps/control-plane/test/review-runtime-package.test.ts`
- `apps/control-center/src/ReviewReports.tsx`
- `apps/control-center/src/ReviewReports.css`
- `apps/control-center/test/review-monitoring.test.tsx`
- `deployment/server20/Copy-ReviewRuntime.mjs`
- `deployment/server20/HttpCommon.ps1` (protected delta guard)
- `docs/adr/0108-scheduled-reviews-and-certificate-alerts.md`
- `docs/adr/README.md`

The previous complete changed-file list still applies; existing Reviews contracts,
domain/checker, API/server, UI/App, release source inventory and documentation are
extended. Full raw source, private workbook values, fixture databases and package
proof outputs remain local. The review root is still a single-writer, bounded
file store and requires owner-selected retention/backup on final deployment.

Diff snapshot before this metadata entry: 14 modified tracked files, 649 inserted
and 54 deleted tracked lines; 29 additional untracked source/test/document files
containing 12,566 lines. The full local Reviews stack therefore spans 43 files.
The lists above cover both tracked and new files; ignored fixture/evidence output
is excluded. HEAD remains the base commit; the owner has not requested publication.
