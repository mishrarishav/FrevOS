# Application review registers

Reviews is available at `/reviews`, also below a configured application base path.
The former `/reviews/pr-12` link remains an alias. Registers are workspace-scoped;
none is seeded from a customer name, workbook path, URL, or employee list.

## Operator configuration

- Reviews uses the existing verified PostgreSQL connection in `DATABASE_URL`.
  Migration 0007 must exist before the new application starts. There is no
  production JSON/SQLite fallback. `DEVSETU_REVIEWS_ROOT` is legacy parse-only
  compatibility; the production entry point does not use it.
- `DEVSETU_REVIEWS_WORKSPACES` explicitly enrolls worker workspace IDs; the
  existing operator Discovery policy also enrolls its verified workspace.
  `DEVSETU_REVIEWS_MONITORING_ENABLED=false` disables automatic polling for a
  code-only developer instance. Server20 remains the normal scheduled worker.
- `DEVSETU_REVIEWS_ADMINISTRATORS` is an optional JSON map of verified workspace
  IDs to user IDs. Membership must still be active with `project:read`.
- Explicit `reviews:admin` membership scope also grants register administration.
  Existing configured Discovery administrators are recognized only in that same
  workspace, through the existing verified Discovery access policy.
- General `project:write`, a displayed role label, a file owner, or being listed
  as an application's business owner does not grant register administration.

Include the central database and protected migration evidence in the owner's
backup configuration. Reviews documents, previews and worker leases use forced
workspace RLS, advisory transactions, revision comparison and fenced workers.
Existing pairing, environment, connector/software state and customer uploads
are outside this migration's write set. The former bounded file adapter remains
only for explicit fixtures and the one-time import source; it is not selected by
application startup. See [central migration](REVIEWS_CENTRAL_MIGRATION.md).

## User flow

1. An administrator opens **Reviews → New register**, supplies a name and chooses
   management/lifecycle/requirement/decision options and additional fields.
2. In **Access**, grant an active workspace member Viewer or Reviewer access.
   Unshared registers are omitted from that user's catalog and detail requests.
   Revocation is checked on every API action, including completion of a check.
3. Add an application manually, or use **Import Excel**. Choose the worksheet,
   header row, column mapping, protocol for scheme-less addresses and aliases
   for workbook values that differ from configured choices.
4. Inspect the preview. Duplicates, missing titles, invalid endpoints and existing
   records require a row decision. An existing match shows the current and
   incoming ownership. No implicit overwrite is performed. Skip leaves the
   record unchanged; Update preserves fields that were not mapped.
5. Confirm once. The server binds the preview to the actor, workspace, register,
   source digest and register revision for fifteen minutes. A restart preserves
   a valid central preview; expiry, use or a changed register requires a new one.
6. Use **Review** for details, links/tests, decisions and assignment/source history.
   A reviewer may edit and test; a viewer can only read.

Import keeps the source file hash, worksheet, source row, mapped cell references,
actor and time. It never edits the original workbook, evaluates formulas, opens
hyperlinks or infers employment status. Numeric Excel dates are not guessed into
calendar dates; use explicit ISO values for configured date fields. Business
Owner, SPOC and Technical maintainer are separate. Blank or conflicting workbook
values do not establish that someone has left an organization.

## Link testing

Administrators configure exact HTTP(S) origins and path prefixes in Settings.
Checks are blocked until an origin is allowed. Internal RFC1918/ULA destinations
also require the private-network option and a route from the running server.
Loopback, link-local, metadata, reserved and mapped addresses are denied in the
production checker. A local fixture adapter is only used in isolated tests.

Every request is a bounded server-side GET with DNS-pinned connections and
per-redirect origin/path/address validation. TLS certificate validation stays on;
HTTPS cannot redirect to HTTP. No portal cookies, authorization headers, browser
session or arbitrary methods/headers are forwarded. Credential-bearing query
parameters are rejected. Final URLs omit queries/fragments; markup is never
executed or retained as HTML. At most five checks execute concurrently.

Results distinguish expected page found, HTTP error, suspected soft 404, wrong
page, authentication/access required, redirects, transport/TLS failure, blocked
policy and unknown identity. Expected page text is required before HTTP success
can be called healthy. It should identify the application rather than a common
company name in a shared footer. A result is evidence from that time and server
network, not proof that every feature works or a project-completion percentage.

The reader does not execute JavaScript or sign in to applications. Client-only
shells and responses that ignore identity encoding remain unverified. Use the
application's own browser flow for those cases. A login/WAF denial is not proof
that the application is down. Current histories become historical after the
endpoint, expected-page rule or allowed-network policy changes. For multiple
links, one successful link cannot mark the entire application healthy.

Bounds are explicit: up to 100 registers per workspace, 2,000 records per
register, 20 endpoints per record, 40 custom fields, 100 retained reviews/checks
and assignment entries per record, and 20 provenance references. XLSX upload
accepts at most 5.6 million Base64 characters, with additional ZIP/XML/row/column
limits. Files with macros, unsafe XML, external workbook parts or oversized
content are rejected. The complete workspace record has a bounded storage cap.

## Validation and deployment boundary

The feature is implemented on `codex/configurable-review-registers`, stacked on
the owner's existing feature base `6addf9b`. Historical native unit/integration tests
exercise a disposable PostgreSQL instance, actual local HTTP servers, inert XLSX
fixtures and file persistence. Historical browser acceptance used a separate
loopback-only instance and its own Docker database/state, including `/devsetu` routing.
No production credentials or production database were used by that preview.
The owner superseded this workflow on 2026-11-11: Docker and the local preview
are stopped and must not be restarted. New validation uses pure/mocked checks,
static builds and bounded authorized Server20 migration/readback. Only code may
run locally with an explicitly verified central runtime profile; no working
direct laptop DB profile is implied. See [code-only runtime](CODEBASE_RUNTIME.md).

The owner authorized the central schema/data migration separately. Final
application release and Server20/T-Server activation remain with the owner.
E-office drafting, external email, automatic notices,
paired-laptop link-check execution and authenticated application browser checks
are outside this phase.

## Actual-link verification follow-up (2026-11-10)

Settings can optionally **Follow isolated application session cookies during
redirects**. This is off unless explicitly selected. Each check starts an empty
anonymous cookie jar for its initial exact origin (16 cookies / 8 KB maximum),
checks host/path/expiry/Secure constraints and discards it on completion. Parent
domain cookies and cross-origin cookies are ignored. It never imports DevSetu
or browser sessions, persists cookie values, or signs in. This supports older
ASP.NET anonymous cookie-detection redirects without treating them as an endless
loop. HTTP-to-HTTPS upgrades can require the canonical HTTPS endpoint configured
separately because the cookie jar does not change origins.

Up to 128 exact origins may be configured. Import still grants none. When the
source omitted a protocol, an administrator can explicitly add an HTTP diagnostic
alongside the original HTTPS endpoint. These remain separate results; a working
HTTP page never clears a TLS error. The checker still rejects HTTPS downgrades.
Redirects outside the configured origins remain blocked, with their target shown.

Large responses retain their observed HTTP status and bounded prefix/title.
A partial HTTP 200 remains unverified even when expected text is in the prefix;
recognized error or sign-in pages can still be identified. Failed redirect
destinations do not inherit the previous hop's HTTP status. Checks use a bounded
total deadline and the first eligible DNS address; a timeout is evidence from
the running server's network, not proof of permanent application downtime.

The application table shows measured HTTP results, test time and final URLs.
Configurable custom fields can retain a separate browser-verification outcome,
evidence and recording time. This keeps browser-rendered dashboards/login pages
distinct from a server-side check that cannot execute JavaScript. A visible
dashboard does not establish fresh business data or authenticated functionality.
See the dated actual-link results in [validation](REVIEWS_VALIDATION.md).

## Weekly schedules, reports and SSL reminders

1. Open a register and choose **Reports & schedule → Weekly schedule**.
2. Select the exact recorded-access values that mean Accessible in this register.
   Nothing is selected automatically. Every other value, including the imported
   Inaccessible classification, is skipped. A failed check remains eligible next
   week if the record is still in the selected Accessible classification.
3. Choose one or more Monday–Sunday days, the time and IANA timezone. Set SSL
   warning thresholds, for example `15, 10` days. Enable and save when ready.
   The next occurrence is shown in that timezone. The saved schedule runs in the
   control plane; closing the browser does not stop it.
4. Use **Run check now** for an administrator-requested report with the same
   eligibility and network policy. This works with weekly checks paused. Inspect
   completed/pending/skipped items, HTTP verdicts and TLS evidence in Reports.
5. The Control Center shows the latest permitted report and active alerts. The
   existing notification bell includes SSL/monitoring notices independently of
   administrator-only join requests. Marking an alert read affects only that
   authenticated user. Register sharing and workspace membership apply to all
   reports, alerts, acknowledgement and dashboard requests.

The server claims each occurrence and each request attempt durably before
network I/O. Only one monitor runs per register, with the existing checker bounds
and fresh administrator/access/source-policy checks before and after requests.
After downtime, it can catch up the most recent due occurrence within seven days
and since the schedule was configured, with the actual check time recorded.
Repeated DST wall times run once; a missing spring-forward time runs at the first
available later wall minute that day. A process interrupted during a request
records an unknown/interrupted attempt rather than replaying an ambiguous GET.
Unattempted pending items can resume. Disabling/changing a schedule or revoking
its administrator prevents further authorized work; remaining cancellations are
visible in the report. One process must own each configured review root.

Each HTTPS hop can retain its observed subject, issuer, fingerprint, validity
dates and verification outcome. HTTP-only links have no TLS certificate. An
invalid/untrusted handshake may provide no certificate dates; this is shown as
unknown, not a made-up expiry. Verification remains enabled. Reports distinguish
verification **at observation**, current time until the **recorded** expiry and
application/HTTP health. A fresh check may see a renewed certificate.

The worker re-evaluates expiry from retained current verified evidence between
weekly HTTP runs, so warning thresholds need not wait until next week's check.
It does not claim to have made a fresh network observation. Only the most urgent
matching threshold is raised on an initial late observation; subsequent threshold
crossings create a new notice. Renewed certificates resolve obsolete warnings
after fresh evidence. Pausing weekly HTTP checks retains these cached certificate
reminders; clearing the selected access values while paused stops new reminders.
No external email or connector-desktop notice is sent.

Reports retain at most 12 runs and 1,000 endpoint items per run; excess endpoints
are explicitly counted as skipped/partial. Up to 300 retained alerts and bounded
per-user read receipts live in the same central transactional review store. Dashboard/bell
polling receives compact latest-report counts, not repeated full report histories.
Detailed report items remain available through the authorized register state.
Storage remains subject to the existing workspace byte cap and owner backup.

Final owner-operated releases include the compiled Reviews modules and locked
production parser dependency closure using `Copy-ReviewRuntime.mjs`. This helper
only writes a new `servix-release-<id>/package` output, verifies frozen-source
boundaries/lockfile inputs, and produces a hash proof. It performs no downloads,
install hooks or live activation. Protected `.env`, pairing and data changes stay
outside the permitted application delta. Local fixture schedules/users are not
production configuration: select the destination register, actual administrator
and retained review-root backup deliberately after the owner's deployment.
