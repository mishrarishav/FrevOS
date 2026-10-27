# DevSetu Current State

Last updated: 2026-10-28

## Complete application release follow-up — resumed

The Git-profile platform correction is live: source `c0471d2...`, manifest
`2ed37f31f595270c12dc1dffc441ff6974fa79c1e1fe6e45106be63c0350bb31`.
Its full CI and independent Apply pass, with HTTP/UI 200, preserved siblings
and no database write. A new customer source upload then exposed the service
account's five-second Git read deadline. Exact LOCAL SERVICE reproduction kills
the initial identity read at 5,041 ms; with the same restricted environment and
a bounded longer observation it succeeds at 19,998 ms. Warm reads and complete
isolated import then pass in roughly one second. Central repository and Production
remain unchanged. The follow-up makes this read deadline explicit in the Git
profile (30 seconds, validated range 5–60 seconds), shared by controller and
builder identity checks. Require its actual configured CI/activation before the
next customer retry. No test assertions or test deadlines are changed by this fix.

The sixth actual DevSetu pipeline succeeded at 02:17 IST on 2026-10-28, source
`53ea0214f4fb1e4e13369256d471122a94a0ad3d`, active manifest
`accdf66214a481a477334f6c33fc254f8813002c8d4f5ecaeeb884a57337d50f`.
All 77 cached test files and coverage gates pass. The independent native Apply
receipt verifies HTTP/UI 200, preserved siblings and no database write.

The subsequent full Servix Development request failed before source publication.
Read-only server20 SYSTEM diagnostics identify the compatibility adapter's fixed
Git launcher timing out, including `--version`; the installed direct executable
reads version, configured repository identity and source head in under 100 ms.
The compatibility controller and builder now consume that executable/repository
identity from the versioned build profile. This correction needs a new actual
configured platform build/activation before retrying customer deployment. No
customer build or new Production mutation occurred. Earlier observations below
are historical checkpoints, not the current live outcome.

On 2026-10-28 the owner restored VPN/desktop access. Server20 HTTP/SMB and
server21 API probes now pass. The previous request and native job both reconcile
as failed; active platform manifest remains `a4c5e8ab...`. All six previously
failing native files pass together in the restricted installed Node/pnpm
environment (15 tests, 224.95 seconds). This does not replace the required
configured full CI result. Free RAM remains low (464 MB of 16 GB observed), so
coverage projects now execute sequentially and Windows UI/contracts tests use
one worker, matching the existing control-plane Windows worker bound. No assertions,
coverage thresholds or independent acceptance tests are removed. The next
configured publication/build must pass before platform activation or a new
customer release. The historical interruption below remains as evidence.

The fifth configured build of `1a7a31ff...` completed all native files except
the two PostgreSQL integration suites. Exact restricted-environment reproduction
identified Docker OCI `resource temporarily unavailable`, before test databases
could start. The repository-owned local Caddy test proxy had 16,068 processes.
Its scoped restart reduced that to 18 without restarting Docker or touching
server20/server21; the same two suites then pass all 22 tests. The sixth actual
UI-created request `pr_569e11398745b52b96aa39217ad8e92d` is building source
`53ea0214f4fb1e4e13369256d471122a94a0ad3d`. Its tree is identical to `1a7a31ff...`;
the configured publisher records a new change-message commit. Require that
request's full CI, package and independent activation receipts before proceeding.

The owner now requests the complete source → frontend/backend Development →
Production flow and subsequent updates. Branch `codex/servix-full-release`,
base `a51e97c20dc27ce047cb54ef54a4ef343a5a5b22`, continues the same bounded
Phase 4 deployment capability. [ADR 0067](adr/0067-complete-application-release-promotion.md)
supersedes the initial backend-only/first-adoption boundaries while retaining
all approvals, preservation and runtime ownership checks. Earlier final handoff
changes are retained. No new Production application activation has occurred.
At the historical 2026-10-27 interruption, configured source was
`b91f8423771a3f546445faa1b2c7b631270deaf9` on
`codex/servix-full-release`; publication is not live activation. Four UI-created
attempts have stopped in native CI. Two identified harness defects are corrected,
but the latest run still has six failing native test files. VPN/server20/server21
access was unavailable, the desktop was locked, and a local observation showed
335 MB free RAM of 16 GB with CPU 81%. Unlock/VPN input was pending. Reconcile the
same failed request after reconnecting, reproduce the remaining failures on a
stable host, and require a successful configured build before proceeding. No
new customer Development release or fresh full-application Production review
has yet been prepared. See the handoff for exact request IDs, validation and limits.

Read-only diagnosis confirms server20 Git and local configured source at
`e04137b4a862e8760a59b95da7e0de9a32bc6d38`, the exact latest backend bundle in
Production, and an older public frontend. Development includes the newer chip,
resizing and contextual filter UI; its built-in Development URL prevents direct
safe promotion. New builds use same-origin routing and component digests.
Implementation and validation are underway; do not claim complete-flow live
acceptance until the actual receipts and public file checks are recorded.
The earlier three configured platform attempts stopped in CI before activation. Reproduction
isolated a new unit fixture's missing computer-name input under the restricted
builder environment. Its measured-OS-identity correction passes in that same
environment. A separate existing UI native-encryption integration test exceeded
its five-second JavaScript default; only that native test receives a bounded
30-second allowance and ACL children a 15-second deadline. All 93 UI tests and
coverage then pass in the restricted environment. Production checks and
independent acceptance tests are unchanged.
The owner reserves dashboard/filter/resize manual checks for themselves and
subsequently confirmed these changes already appear on Development. Under
[ADR 0068](adr/0068-existing-development-source-acceptance.md), verify the same
customer source and new technical release gates without waiting for another
duplicate visual check. A fresh exact Production decision remains required;
the owner will perform their functional check after Production activation. See the
[application-release handoff](SERVIX_APPLICATION_RELEASE_HANDOFF.md).

## Servix Production deployment completed — PASS

The actual visible DevSetu activation
`pm_9b481b3a94f1227d77373247b1d350db` succeeded at 19:13:42 IST on
2026-10-27. It consumed the owner-confirmed fresh review
`pm_6ef8e1c91fe2ba73759fe0ff248dfab6` and selected the same tested compiled
backend bundle `5ff7622a9f316edbe0485c47f179f6c1bccac75241e6540f1d0079b11172fb0c`.
No customer rebuild, dependency/runtime upgrade, frontend/IIS replacement or
Production database restore occurred. Normal app startup effects were approved.

The receipt verifies health and all 8,587 protected files. Independent public
TLS health/full readiness and three original attachment byte/hash checks pass.
The public Servix login page renders. Independent target files confirm bundle
selection, the exact descriptor and runtime configuration hash. The new managed
listener is PID 18504, the same existing owner SID; the task
`DevSetu-ServixProduction-Backend` resolves to EESL\APPC0024, least privilege,
password logon and a boot trigger with 30-second delay. No batch-logon right was
added. Boot configuration is verified; an actual reboot was not performed.

The matching fresh encrypted backup and its complete isolated restore passed
before cutover: MySQL 8.0.28, 114 tables, one view, 213,131 rows, full SQL digest
verified and temporary data/task removed. The immutable preparation marker
predates the separate restore; its later proof is explicitly in the approval
change record. Code recovery retains the verified original source; a destructive
Production rollback/DB restore was not run as a test. Retained customer dependency
findings remain accepted and unresolved. Authenticated customer workflows were
not exercised; public rendering, readiness, original attachments and the complete
protected inventory were verified. Broader Phase 4 exit and later managed
Production upgrades/rollback remain separate work. See the final
[handoff](SERVIX_PRODUCTION_PROMOTION_HANDOFF.md) for exact receipts and limits.

## Production execution accepted (2026-10-27, 19:10 IST)

Fresh preparation `pm_6ef8e1c91fe2ba73759fe0ff248dfab6` matches the approved
target/configuration, owner, original PID 10760, artifact and all 8,587 protected
files exactly. Its review SHA is
`893b8daffcaf68b8a273212b93b75adf30f1de6133500e3805fe0b875cef0d70`.
Fresh backup SHA `bcaf96bcd603d95e8ec1498ef81269999f0ba568060240dc07a2ce25713b40c7`
passes full integrity and a separate matching native restore: 114 tables, one
view, 213,131 rows. Proof SHA is
`660501e4a98be10dec6082b5e189440a60ab9ff801f9d35d6aafb9d890e59d2f`;
temporary restore data/task removed. No Production database restore was run.

With the owner's explicit same-scope confirmation, the actual visible UI's five
acknowledgments were recorded and exact activation
`pm_9b481b3a94f1227d77373247b1d350db` was accepted. It is working at
`adopting-reviewed-owner-and-promoting-backend`; this is not yet proof of success.
Follow this same job to its terminal receipt; do not submit a duplicate after
an observation timeout. Final public health/attachments, managed-task identity
and preserved-file verification remain required.

## Owner-confirmed execution resumed (2026-10-27, 18:55 IST)

The owner explicitly answered the task-binding review confirmation with approval
for the same exact target/account/artifact scope. The earlier review expired;
it was closed without approval or mutation. Visible DevSetu preparation
`pm_6ef8e1c91fe2ba73759fe0ff248dfab6` is queued for a fresh observation and
backup. Verify that its target, runtime owner, bundle and configuration remain
the same before recording this human confirmation against the new exact review.
Repeat the matching-backup recovery check. Public readiness and original served
attachment bytes pass at 18:56 IST. No Production process stop has occurred yet.

## Current Production review ready (2026-10-27, 18:45 IST)

Actual DevSetu publication `pr_7a6a6e4b7a8b7dc75cf37a6d3260a9b2` succeeded from
source `a51e97c20dc27ce047cb54ef54a4ef343a5a5b22`; active manifest is
`a4c5e8ab2a0f7c97f1762455e5e6c67c68d21ac652754e19300d3d5ef48bd461`.
Full configured CI passed. Independent native Apply is PASS, UI HTTP 200,
databaseWritten=false. The private-backup DTO and safe builder diagnostics are
now live.

Visible preparation `pm_3cac9475b29bbc1974578dc68ccec70e` succeeded. It observes
the original PID 10760, existing owner/Node and already-ready batch logon, with
8,587 protected files. Fresh backup SHA is
`b26b2eb70ab24a7d7032bdb343f27520071b73353d21c17e1b50cbd2650abc22`,
443,471,538 encrypted bytes, captured at 18:34:04 IST. Full-stream integrity
passes. A separate scoped native diagnostic restored this exact backup on
isolated MySQL 8.0.28: 114 tables, one view, 213,131 rows, matching whole-SQL
digest and table/view counts. Its temporary data and task were removed; no
Production database or application file was written. The immutable preparation
snapshot predates this external diagnostic; its isolatedRestoreTested=false
marker was not rewritten. The exact UI change record includes the later proof
SHA `3db01e6bc90bce4d9cd905f4e04bf507bda0c9d3121d5918e56f0398ef9a463f`.

Exact review SHA `a61ff61beab0709b65a6da8deae7acbb950f51dca684d94092173ad9828bfd1d`
expires at 18:49:04 IST. The owner was asked for action-time confirmation of the
new same-owner startup-task credential binding. No approval acknowledgments,
task binding, process stop or Production cutover have been performed. Public
health/full readiness and three original served attachment hashes pass again.
Continue only with valid exact review and confirmation; expired review requires
fresh preparation. See the detailed handoff below.

At 18:51 IST, authenticated read-only observation confirms the worker online,
the same prepared result, no approval/cutover job, and an expired exact review.
The required task-binding confirmation is still unanswered. Do not regenerate
backups repeatedly while waiting; resume fresh preparation when the owner is
available for the final confirmation. Production activation remains unperformed.

## Saved backend Production promotion (platform live, cutover pending, 2026-10-27)

The visible configured platform pipeline `pr_75dfac707e77900bd3b61db2e2b5ea01`
published source `6e4478604805a196556c70f81e281f873b2fcb70` and activated manifest
`bb0a2d8e09a55f3f45819d627da4d2f5f3eec9de3cc5b80ea5b851c01f8e0d57`.
Independent native Apply reports PASS, HTTP/UI 200, no operator database write
and sibling IIS preservation. The first build failed because its enrolled
packager omitted the new modules; a reviewed two-file operator update preserved
the builder task and credential bytes, and the actual retry succeeded.

The actual new Production page reports its worker online. Preparation
`pm_8bcdd4bee32b23e623f8bf26b141e3e6` stopped safely before backup/cutover:
the existing Node executable uses the version manager junction
`C:\Program Files\nodejs` to `C:\nvm\v20.11.1`. Read-only diagnostics found no
links in the inspected customer data. [ADR 0066](adr/0066-canonical-promotion-runtime-identity.md)
pins the same canonical executable and verifies the observed process resolves
to it, retaining customer/staging link denials. That correction passed the full
358-test configured CI gate and is live. Actual read-only observation verified
PID 10760, owner `EESL\APPC0024`, Node 20.11.1, existing batch-logon readiness and
8,572 protected files. Earlier configured CI attempts failed; normal and exact
minimal-environment CI passed, then an identity-verified idle builder restart
and fresh configured run succeeded. The failure cause is not fully established;
no test/gate was bypassed.

Preparation `pm_430c1fb0df00a6a011c9a03e7ea67b9a` passed the runtime inventory,
then its official MySQL archive download failed. The already verified official
8.0.28 archive was imported into the worker cache with its exact configured
checksum; four required files and actual client loading passed. Preparation
`pm_f99f5c7b32585b2e951752bcc114a89b` then reached private DB binding but its
inline JavaScript invocation failed. Replace it with a hash-pinned file helper.
ASCII JSON escaping preserves private Unicode values across PowerShell 5.1
console code pages in both directions. Actual server21 read-only binding and
encrypted PSCredential transport pass; a real native helper/backup-wrapper
regression passes without reporting credential values. Publish this bounded
correction through DevSetu before repeating preparation. No Production runtime
stop, task credential binding, environment write or permission grant occurred.

The first configured file-helper run passed its new native regression but failed
the unchanged device-enrollment test. That test passes alone. Serialize backend
test files on Windows to reduce shared Task Scheduler/CIM contention; every test,
assertion, timeout, coverage threshold and audit gate remains enabled. Require a
fresh full configured CI before activation; the underlying intermittent failure
is not claimed fully diagnosed.

The serial configured run above passed full CI and activated the file-helper
correction. Preparation `pm_0f3777dd9d4ad2996a3aaf1f2e5ab056` then stopped
before backup at private payload serialization: PowerShell path/hash output
objects introduced reflection metadata. Use a fixed native DTO with typed string
and integer fields; retain private JSON escaping and the same wire schema. The
expanded real PowerShell regression includes path/hash/client metadata, and an
actual server20/server21 private binding plus full payload-shape check passes.
Add explicit private-binding/encoding stages and retain only known safe failure
stage names. Publish this correction through the configured gate, then prepare
again. Production cutover and its task credential binding remain pending.

The owner explicitly requests completing the missing runner and deploying through
DevSetu. [ADR 0065](adr/0065-configured-saved-backend-production-promotion.md)
authorizes this bounded follow-up. Implement a separate configured, reviewed
saved-artifact promotion worker, fresh encrypted backup, same-owner runtime
adoption and preservation/recovery. Keep the legacy Development exclusions,
customer dependency versions and frontend/IIS intact. Full `pnpm.cmd run ci`
passes with 357 tests and unchanged coverage gates. The actual Windows matching
MySQL 8.0.28 dump/DPAPI/full-stream verification/isolated restore fixture passes;
all 48 native operator scripts parse. A SID-only application of the unchanged
private ACL also fixes the observed offline-domain native secret test failure.
Standalone native-protocol execution exposed a Windows ESM path error; using
file URLs fixes it. Actual native validation/sealing/tamper/expiry tests and the
final packaged executor authorization against isolated PostgreSQL pass. The exact
worker's four-file matching MySQL client extraction/load check also passes.
Earlier VPN interruptions were resolved and actual history was inspected before
the successful publication above. The local ancestry-only merge
`2ca0759aa75f23b453fef72f25d8f30923728c2d`
reconciles main's owner squash with central Git without changing accepted code
or the 42 working files. Production activation remains pending; see the
[promotion handoff](SERVIX_PRODUCTION_PROMOTION_HANDOFF.md).

The DTO publication attempt `pr_7346423a9ed268e889ae2012ab0814b4` failed before
activation from source `51eb92751058383186dfc4800c46bff98aa37135`. Its frozen
Vitest cache identifies `environment-seal.test.ts`. An isolated reproduction
fails to load the Windows PowerShell security module when inheriting the parent
PowerShell module path; the same two tests pass with the Windows 5.1 module path.
Pin that path in the minimal native builder environment. Add bounded failure
metadata (fixed phase/codes and source locations only), never raw child output
or command lines. Five focused executor tests pass. Full local `pnpm.cmd run ci`
exits 0: 361 tests, build and audit gate pass (5 low/6 moderate platform findings).
The identity-verified existing builder now has the reviewed adapter, with its
credential value/scope, task and permissions unchanged; encrypted before-files
and a flushed maintenance intent are retained. The actual configured publication
is still required. The final live connection check on 2026-10-27 at 17:52 IST
times out for HTTP/SMB/WinRM on both servers; the visible UI reports systems
offline. Production remains untouched.

At 18:05 IST the owner reconnected VPN. Fresh TCP checks pass for HTTP/SMB on
both servers and authenticated observations report the enrolled platform builder
and destination online. Resume the same configured publication, then fresh
Production preparation and exact review. Earlier blocked observations remain
historical evidence; no Production activation has occurred.

## Servix Production configuration (destination pending, 2026-10-26)

The owner subsequently logged into the adjacent DevSetu browser and delegated
the current configuration/review work. Through that visible authenticated UI,
`servix-production` revision 1 was saved in DevSetu Internal: server21,
`D:\Servix`, `https://support.eesl.co.in/`, the existing central Servix repository,
and the five backend preservation paths. Test connection at 23:17:45 IST reports
preservation passed and destination pending. No Production adapter is enrolled;
no Production approval, activation, task, credential binding or permission change
was created. The existing Development configuration remains revision 3.
See [ADR 0064](adr/0064-visible-production-configuration.md) and the
[guided Production plan](SERVIX_PRODUCTION_DEPLOYMENT_PLAN.md).

## Earlier Servix Production readiness (2026-10-26)

Owner direction: defer library/application changes and plan the retained artifact
with existing dependencies. All future configuration and deployment must be
through DevSetu, visibly with the owner. That earlier step authorized planning;
the subsequent visible configuration result above supersedes its plan-only limit.
The dependency findings remain recorded for final
risk/approval review. See the [guided Production plan](SERVIX_PRODUCTION_DEPLOYMENT_PLAN.md).

Branch `codex/servix-production-readiness` starts at merged main
`5730940fe6c40cc3eb5002ef6beaa564c9571e5f`. Read-only checks preserve the original
Production PID/owner, 8,542 original protected files, eleven environments and
IIS; all 85 recovery-source files match the retained unapproved backend candidate.
Public TLS health is HTTP 200. Production is not a connected DevSetu target.

An encrypted CurrentUser-DPAPI backup of MySQL 8.0.28 passes full-stream integrity
and isolated restore: 114 tables, one view, 212,077 rows and matching schema.
Production application/database/permissions were not changed. Same-owner task
XML parses on target, but batch-logon readiness is unproven; no task was registered.

Fresh runtime lock audits: Development backend 6 moderate/19 high/3 critical,
Production backend 6 moderate/26 high/3 critical, and QuerySafe on both targets
3 moderate/3 high/1 critical. QuerySafe locks/root versions match; 22/25 backend
root versions match. Functional Development success was not a clean customer
security audit. The owner has deferred upgrades for this plan; runtime adoption,
final risk acknowledgement and fresh Production approval remain separate gates.
See [Production readiness](SERVIX_PRODUCTION_READINESS.md).

## GitHub main integration (owner-authorized PR preparation, 2026-10-26)

PR [#38](https://github.com/mishrarishav/FrevOS/pull/38) targets `main` from
`codex/agentic-monitoring-pilot`. Its initial Ubuntu CI exposed that the fixed
Servix compatibility Git environment used a Windows-only PATH on POSIX hosts.
Keep the Windows compatibility environment and use a fixed trusted POSIX
`/usr/bin:/bin` path on other hosts; do not inherit the service's arbitrary PATH
or secrets. Existing real Git publication and environment-isolation tests apply.
This is merge preparation only: no new live/customer deployment, identity or
approval-policy change. The human owner must mark ready and squash merge after
the exact final head's checks pass. See the agentic handoff for validation.
Linux's next run passed all applicable tests but exposed a coverage gap from the
Windows-only component lifecycle test. Run that same actual Git/build/deploy/
rollback/preservation test on Windows and Linux with the host's enrolled npm
entry point. Add isolated Windows secret-helper transport failure tests runnable
on either host; these simulate the child protocol, not native DPAPI. Coverage
thresholds and the separate native Windows acceptance remain unchanged.
The actual Linux lifecycle then exposed a Windows-only executor root contract.
Reuse the existing strict Windows/POSIX literal-path validator for authenticated
executor bindings, retaining traversal/relative/control-character/root denial.
This does not broaden Windows-only service/native activation recipes or claim
Linux desktop/onboarding/browser acceptance.

The human owner subsequently squash-merged PR #38 at
`5730940fe6c40cc3eb5002ef6beaa564c9571e5f` after exact-head GitHub CI run
`40277221413` passed (340 applicable Linux tests and unchanged coverage/image/
audit gates). Native Windows CI had passed all 346 tests; targeted Windows
contract/component checks passed after the final root correction. This merge
did not activate those integration fixes on server20 or change Servix Production.

## Configurable agents and measured health (bounded live pilot PASS, 2026-10-26)

Owner-approved ADRs 0062/0063 bound this follow-up on
`codex/agentic-monitoring-pilot`, stacking on the deployed
`1f22ed2a6523678adcff35d8e8d1b9507ddce517` pilot. Scope: bounded real health
sample graphs; protected, revisioned configurable model connections; multiple
read-only agents with individual versioned skills/memory and deterministic
source guardrails; requested bounded project-folder metadata candidates; inert
notification drafts with exact actor/device/message approval and separate local
opt-in. Preserve preceding activity/update/recovery results and all customer
configuration/data. These are bounded owner-requested pilots, not completion of
the entire later agent/workflow roadmap. No Production, autonomous personnel
action, model shell, repository mutation, email or real employee test messages.

Final local CI passes 341 tests, typecheck/build/audit and all unchanged coverage
gates. Configured request `pr_d7190750e13d561d08f064bcd08c4ba0` activated source
`7acce2d8df5a2da02462e27a3f9e05f3fab4d06d`, manifest
`d8a4047960c9d9a62f31ffb640fd77fb0900f16470f9e1ee7d279a6752b8832f`.
Independent SYSTEM receipt confirms HTTP/UI 200 and sibling preservation.
Exact downloaded Windows ZIP acceptance passes real PostgreSQL/Fastify,
passwordless pairing/update, native ACL/DPAPI/Limited task, local opt-in,
requested D: folder metadata search, Hindi input and interrupted recovery.
Live real-sample graphs, responsive UI, protected connection and three editable
agents pass; customer configuration/environment baseline is preserved.
The supplied provider's direct authenticated synthetic probe returns HTTP 503
`unavailable`, and the live configured test reports `timeout`; working model
inference is not established. Existing remote collectors need an explicit local
same-device update for new capabilities; L-1465 was not remotely updated. No
real employee notice, customer Production activation or full Linux desktop
acceptance is claimed. Delivery-result documentation is separate from the
activated source. The owner subsequently authorized publishing this dedicated
branch, including the delivery documentation, to the existing GitHub origin;
the configured deployment source remains DevSetu central Git. See
[agentic pilot handoff](AGENTIC_MONITORING_HANDOFF.md).

## Bounded activity and requested file snapshots (implementation preflight, 2026-10-26)

ADRs 0060/0061 on `codex/discovery-activity-noise` stack on deployed
`1d79cc26fd41ebf178e1ade8a76f1f595cd15997`. L-1465 is reported by its owner to
be paired and reporting system monitoring. Implement configurable activity
segments/summaries, independently bounded history, bounded collector processing,
same-device explicit local update and one-time locally approved masked file
snapshots. Native update/interruption recovery and real local consent browser
preflight pass. Full local CI passes 311 tests and all required gates. Configured
request `pr_0cd5ce4127b2cdbd8e86bf28d74b790a` is live at source
`1f22ed2a6523678adcff35d8e8d1b9507ddce517`, manifest
`ebc0522f68a4a967a1eedbe3a5bfb6e84bd23d749bd2399011b0be87a82f8040`.
Frozen CI, independent SYSTEM activation, HTTP/UI 200, exact-download native
update/interruption recovery and customer baseline verification pass. The actual owner's
laptop is not claimed updated. Preserve preceding final-result documentation.
No customer/Production/data changes. See
[handoff and follow-up scope](ACTIVITY_MONITORING_HANDOFF.md).

## Passwordless system pairing (bounded Windows pilot PASS, 2026-10-25)

The owner does not authorize sharing the administrator password with a new
computer. ADR 0059, branch `codex/passwordless-system-pairing`, stacks on deployed
`e8716d71631136ebc4fa2b54dde3a68de1e10977`. Scope: client-held system credentials,
short lookup code and explicit approval from the authorized browser; protected
resume without account credentials. Preserve system/project purpose separation,
all previous result documentation and the configured deployment workflow. No
Production, broad permission, invitation sending or unrelated phase work.

Default setup now shows a short target-bound lookup code instead of account
credentials. Discovery's explicit browser approval persists actor/workspace/
purpose/target/correlation/expiry evidence before creating the system-only
device. Client credentials stay CurrentUser DPAPI; the server sees hashes.
Full CI passes 302 tests and all coverage/type/build/high-audit gates. A real
Windows ZIP, actual native ACL/DPAPI/Limited task and real isolated Fastify/
PostgreSQL/browser test pass with separate installer/owner contexts, one owner
login, one proposal/approval/device, fresh health and passwordless task resume.
Existing configuration/environment/customer release baseline is captured.
Final UI request `pr_b41479e0865369cab52f9861e90e5434` is live at resulting source
`1d79cc26fd41ebf178e1ade8a76f1f595cd15997`, manifest
`71a2a55e03d35179462fe817c44246e5487267c52abef56352a050fdb15dab6a`.
Frozen isolated CI and independent SYSTEM activation pass; HTTP/UI 200,
databaseWritten false and siblings preserved. The actual 38,993,069-byte Windows
ZIP matches sealed SHA256
`025ad131629641b3955843eee60002eb6a6e2db8c3132deee458991b130a06da`.
Its own Node v24.19.0 again passes the real isolated two-browser/native/DPAPI/task
flow: one owner login, zero installer logins, one proposal/approval/device,
fresh health, continued monitoring and passwordless fresh-setup resume. Live
approval UI and deny checks pass; a transient network-change browser failure
passed on fresh retry. All three profiles, two pipelines, eleven environments
and the exact customer release/stopped services remain unchanged. No real other
laptop is claimed paired; its owner must approve the specific code. See
[handoff](PASSWORDLESS_PAIRING_HANDOFF.md).

## System-first pairing correction (bounded Windows pilot PASS, 2026-10-25)

The owner requests a simpler working connection after a new laptop repeatedly
fails the installer. Branch `codex/system-first-pairing`, base/deployed source
`a9cdebbe7cc7085451405beae8152972fed3c66b`, ADR 0058. Preserve the preceding
Current State/handoff updates. Scope: connect a computer without Git/project
selection, visible/recoverable local setup, consented monitoring and explicit
later project setup. Existing project credentials and deployment remain scoped;
no Production, database, customer-source or unrelated roadmap changes.

The default Windows setup now pairs a computer without project/Git selection.
System-only credentials explicitly deny project operations and text history.
Actual Windows DPAPI/Limited-task health/resume tests, consented metadata tests,
Chromium refresh/retry/responsive checks and the legacy prerequisite status
regression pass. Full local CI passes 295 tests, coverage/type/build and the
high audit gate (existing five low/six moderate advisories). The preceding
customer configuration/environment/release baseline is preserved. Configured
platform publication and the exact downloadable package pass live verification;
the owner's other laptop must run the new package and is not claimed Online. See
[handoff](SYSTEM_FIRST_PAIRING_HANDOFF.md).

Initial UI rollout `pr_d089627b55c1b4004f416b2b9b155481` is live at source
`ec728e68eec1cc36536595b51bd57e01b215a1eb`, manifest
`6a105e2927bbc066d91fbd8342f0f93dc248fd62c426199757a50502806acda3`.
Health/UI and the customer baseline pass. Final review separates system records
from legacy Git-reader filenames and normalizes child Windows PowerShell module
paths; actual task resume and interrupted/conflicting naming tests pass. Clean
builder-equivalent full CI passes 295 tests. Final UI request
`pr_949a30860a3412900cd40fbe07080c36` is live at resulting source
`e8716d71631136ebc4fa2b54dde3a68de1e10977`, manifest
`b65214b741667d3816c891bda1160aee814f3f0390dedf73ca0ee791eff6a123`.
Native receipt confirms HTTP/UI 200, siblings preserved and databaseWritten false.
The 38,983,805-byte actual download matches its sealed ZIP hash
`efd6453ab254240f3e9e465cc792b4971f7a94ae322ab78ed0f6b1c016de73a8`.
Its bundled Node v24.19.0, native ACL, DPAPI, Limited task, first health report,
continued monitoring after setup closes and same-device fresh-setup resume pass
in an isolated real-domain loopback test with one pairing/three observations.
Final built Discovery UI navigation and all 11 environment/customer configuration
baseline checks pass. The previous sealed reader also passes isolated project
compatibility with unchanged record bytes. No other laptop is claimed connected.

## Servix backend artifact deployment (Development PASS, 2026-10-25)

The owner's bounded artifact request is implemented on
`feature/servix-build-artifact`, base
`69dd69e12649d30e9c63a453cb526ea373b17a10`, ADR 0057. Preceding result docs
are preserved. Platform source `a9cdebbe7cc7085451405beae8152972fed3c66b`
is active at manifest
`9c31907f8bf77c8f19a33920a37c9fed8f88bf208a950f38d79b83674e92bb6b` through
actual UI request `pr_3689116227498418bb2ebfcce03e5d38`. Frozen CI,
independent activation, HTTP/UI health and sibling preservation passed. Local
CI passes 287 tests, build/coverage and the high audit gate; five low and six
moderate platform advisories remain.

Actual DevSetu publication/build/Development deployment
`sd_2fba221e1855f7f17d9004617130ba12` uses customer source
`e04137b4a862e8760a59b95da7e0de9a32bc6d38`. Release
`599a63262003575eee3a3bf42799cd7376ae05c3563cdffa8989c6af51e3d163` contains
a 2,282,888-byte compiled backend: 85 application modules and 23 dependency
bindings. Bundle SHA256
`5ff7622a9f316edbe0485c47f179f6c1bccac75241e6540f1d0079b11172fb0c` matches
the isolated compiler result. Existing runtime dependencies, source, unknown
files and mutable data are retained.

Both actual UI recovery cycles passed without rebuilding. Final rollback
`sd_34ea154e9b5fcc750eec9d774d6cb64f` and restore
`sd_4fa6678413b3b23b2ba677ad4b09f6e3` each checked all 145 Development
protected files and passed bootstrap health, browser load and three served
attachment hashes. The restored process is verified to run the bundle.

Live testing corrected slow SMB cache preparation, a frontend install timeout
(private LOCAL SERVICE C: scratch/offline installs), an expired Git test fixture,
and PowerShell 5.1 inventory deduplication. The new six-file regression rejects
changed/missing non-first files and duplicate-folder errors. Initial one-entry
inventory receipts are superseded as preservation evidence by the full baseline
audit and corrected live guard. Full audit after the final cycle checked all
8,542 originals, 11 environments, both web.config files and IIS: zero missing or
changed files. Seventeen Unicode filenames are decoded against the retained raw
UTF-8 snapshot with every original hash unchanged; no filename was edited.
Production PID 10760 and its original owner are preserved.

Production candidate `sp_6c3b764d29f94e12a25b09c23914cfdb` packages the identical
backend, pinned runtime/configuration, source recovery snapshot and task XML.
Local runtime and unregistered Task Scheduler definition validation pass.
Production is BLOCKED on the candidate's scoped approval, target runtime adoption
and startup/DB recovery review. No Production activation/database write is
claimed; the old adapter still excludes Production. Existing customer dependency
advisories (6 moderate, 28 high, 3 critical) remain unresolved. Phase 4 exit stays
open. See [complete handoff](SERVIX_BACKEND_ARTIFACT_HANDOFF.md) for commands,
identities, preservation evidence, changed files and limitations.

## System folder workspace corrections (bounded pilot PASS, 2026-10-24)

The owner reports that connector rows duplicate L-1770, folder selection fails,
D: cannot be navigated and generic local preview is not usable. Actual live
Playwright reproduced duplicate machine titles, no folder browser, rejection of
drive paths in project-relative content inputs and zero DevSetu service candidates.
Correction branch: `feature/system-folder-workspace`, explicitly stacked on
deployed `fd89278b8484d76fe9d291bbc191ec6bc5d7e812`, ADR 0056. Preserve the
preceding final-result documentation. The correction is now live at source
`69dd69e12649d30e9c63a453cb526ea373b17a10`, manifest
`a30bff2988d37f665b69457d5c699e06ec2c374e5f0746e5a6030914a69b3f7a`,
configured request `pr_9a274c715407920b4ab1d1e9bad15b83`. Actual UI publication,
isolated frozen CI/build, immutable artifact and independent SYSTEM activation
succeeded; HTTP/UI health is 200, siblings preserved, databaseWritten false.

The bounded change adds reported OS-installation identity for presentation-only
grouping with explicit project bindings, authorized paginated directory metadata
independent of watch coverage, configurable priority folders and generic nested
service discovery/navigation. A real central-repository picker bug used a
cleared private config to construct its final proof; the fix preserves the
required public identity before cleanup. Existing credential, workspace, Git,
filesystem and DB safeguards remain. No new credential lifecycle, production,
mail/notice or roadmap exit is included.

Focused tests, full CI, real Windows DPAPI/Git regression, actual Debian directory
and private-folder switching, exact packaged startup/download smoke and isolated
two-real-connector Playwright Start/Stop all pass. Live Playwright verifies one
machine/two project bindings, D: navigation through `.local/worktrees`, generic
DevSetu frontend/API candidates and Configure services. Desktop/tablet/mobile
checks pass with zero unexpected browser errors. D: priority is explicitly saved
at revision 2 on the already-enabled source; content history stays off.

Both existing source workers have nine verified sealed sidecars each; DPAPI
pairing and Limited/Interactive tasks preserved. The old Servix picker was
verified against its retained older sealed manifest before upgrade. Eleven
environment hashes, three profiles, two component configurations and customer
deployment identity are unchanged; local services were stopped at the fresh
baseline and remain stopped. Existing local Docker infrastructure was restored
after a helper/zombie process failure; four containers are healthy, while the
health-check/reaper recurrence is a separate follow-up. No real customer backend
or database was used for tests. See [complete handoff](SYSTEM_FOLDER_WORKSPACE_HANDOFF.md)
for commands, receipts, changed files, deviations and limitations. Phase 4 remains
open; no Production/server21 rollout or notice/mail action is included.

## System discovery and onboarding (bounded pilot PASS, 2026-10-24)

The owner-approved configurable onboarding/Discovery pilot is live on server20,
source `fd89278b8484d76fe9d291bbc191ec6bc5d7e812`, branch
`feature/system-discovery-onboarding`, ADR 0055. The actual DevSetu Deploy all
flow published source, ran an isolated frozen CI/build and activated sealed
manifest `96e799f3dbe1d204a8cc2d220616c21de0166918c2e3125377023b615389251f`
through the independent SYSTEM updater. Request `pr_ca688b0e2210441336866ba9ec3e728a`
and activation/health receipts pass. Phase 4 exit remains open.

The release adds Windows and Linux x64 source prerequisites review/selected
install/recheck, system health, a separate Discovery page, bounded drive metadata
and opt-in selected-folder redacted text history. DevSetu owns client/PO/plans;
progress uses accepted weighted deliverables. Reports show delays only. IMAP/API
ingestion and notices/employment actions remain future work. No real client/PO
or completion percentage was fabricated in the empty canonical live catalog.

Full CI passes 274 tests and required gates. Patched Zod 4.6.6 and a narrow
undici 8.12.2 override satisfy the current high audit gate; five low/six moderate
advisories and the existing UI chunk warning remain. Windows/Playwright/real
PostgreSQL, Debian-kernel Node/ASP.NET/process/audit/environment and actual Linux
paired clone/Start/Restart/Stop acceptance pass. Ubuntu/Rocky/Red Hat UBI tool
checks pass; their native desktop/kernel policy acceptance is not claimed.

Both actual Windows source connectors are upgraded with pairing/task identity
preserved and fresh health. Servix frontend is restored in development mode,
localhost:3000 HTTP 200; backend stays stopped. Eleven environment hashes,
three profiles, two pipelines and customer deployment identity are preserved.
The owner UI enabled DevSetu all-local-drive metadata policy with no content
folders. Servix file capture stays disabled to avoid duplicate collection.

Live C:/D: coverage is partial: the 10,000-directory cap, permission gaps and
startup overflow are visible. The startup burst dropped 6,060 events; a later
actual probe reached retained history/UI after backlog and was removed. Browser
1366/768/390 checks pass, with zero unexpected errors. This is bounded evidence,
not a complete or instant all-drive journal. See
[the Discovery handoff](SYSTEM_DISCOVERY_HANDOFF.md) for exact identities,
commands, failed-attempt/deadline evidence, final file inventory and limits.

## Generic local environment CRUD (bounded pilot PASS, 2026-10-24)

The owner requests simple CRUD of variables in existing local `.env` files for
all connected projects, including Production preview profiles. Work is stacked
on deployed source `c572f8c9d89332643a3e672be3b654c21cbc6b7d` in
`feature/local-environment-crud`, ADR 0054. The shared UI, authenticated durable
actions and enrolled connector implement masked reads, browser-sealed patches,
stale-document checks and atomic permission-preserving Windows writes. No
Servix path is hardcoded. Full CI passed 263 tests, and final synthetic browser
CRUD, encryption/Windows ACL checks and responsive layout verification passed.
Final source `a97a076446fa299556d6d75473721fb199eb984b` is active with manifest
`d1475ef8c7ed85ad4d4408d1949412db54347fdf95207c8ae28a0ba889702dec`.
Its isolated frozen install/full CI and independent activation passed. Both
source connectors retain pairing/tasks and match all eight sealed sidecars.
Live Production-profile readback loaded 39 masked/safe variables at 1366/768/390;
ten existing environment files and the customer deployment/settings are
unchanged. The previously running local frontend was restored in its original
mode; backend stayed stopped. Final native Node/PostgreSQL smoke and live checks
passed, with zero unexpected browser errors and one known internal HTTP COOP
warning. No real customer environment save or database write was submitted.
The bounded CRUD request is complete; final result docs are uncommitted updates.
See [the environment editor handoff](LOCAL_ENVIRONMENT_EDITOR_HANDOFF.md).
Phase 4 exit and Production database writes remain outside this task.

## Local development sessions (bounded pilot PASS, 2026-10-23)

The owner requests launcher-style local frontend/backend Start/Stop/Restart,
existing-process controls, database profile selection and preview inside DevSetu
using the existing connector. HRMS's desktop launcher is a reference only and
remains untouched. Work is stacked on `feature/local-development-runtime`, base
`915173a272d67e08c59caf34ce2fd34785f616ce`, ADR 0053. Phase 4 exit stays open.

The initial API, connector runtime and shared workspace UI were activated at source
`c572f8c9d89332643a3e672be3b654c21cbc6b7d`, manifest
`0cfe98b973dcde58a680f7b87d9437b32c83e76d08eeb336ada29a4d12b5e674`.
Full CI passed 258 tests and required gates. Eleven real Windows/npm/Vite/MySQL/
authenticated Playwright acceptance groups and a real ASP.NET fixture passed.
Both existing source connectors were upgraded with task/pairing preserved.
Actual Servix backend/frontend Start all, localhost Login/local API, auth/full
bootstrap health, Restart all and Stop all passed against `servix_db_dev`.
Customer source, original environment files, deployment settings and existing
deployment stayed unchanged. Final uncertain-action controls, exact packaged
Windows Node/real-PostgreSQL smoke and live 1366/768/390 readback passed. Both
source connectors match final sealed sidecars; source/build/destination checks
are ready and there is no unresolved work. Final documentation is a validated
working-tree update after deployment. Phase 4 exit remains open.

The owner supplied `D:\servixDev\backend\.env`. It and `.env.prd` resolve to
`10.9.69.31 / servix_db`, whereas the approved development database is
`servix_db_dev`. A read-only grants inspection rejected the supplied credentials
as writable; neither file is offered as a Development DB profile. The existing
credentials could reach the approved development database, verified by
`SELECT DATABASE()`. A separate ignored `.env.devsetu-development` profile now
selects that database, local CORS/uploads and disabled mail/scheduled mail, with
unchanged credential values and access scope. Local revision 3 uses backend
`npm start` on 5000 and CRA frontend `start:dev` on 3000. Both were stopped after
acceptance. Normal development startup may bootstrap its database; no Production
write or customer login/CRUD was submitted. Actual Production mode still needs
read-only credentials. HRMS is reference-only and unchanged. Secrets stay at the
local execution boundary. See
[the local development handoff](LOCAL_DEVELOPMENT_HANDOFF.md).

## Configured component deployments (bounded pilot PASS, 2026-10-23)

The owner's configuration-driven source/component development pilot passed on
`feature/configured-component-deployments`, ADRs 0049–0052. Final deployed source:
`915173a272d67e08c59caf34ce2fd34785f616ce`.
Active manifest: `cd5f2076cbcfaa513309926f4aad80563ea3c2aa089bc1cd35b5f7578ee3382f`.
Actual dashboard publication, isolated frozen installation/full CI, immutable
packaging/private transfer and independent activation passed. Native A/B and both
saved-artifact rollbacks passed without rebuilding or changing source. Exact
packaged Windows Node/real-PostgreSQL smoke passed for A, B and final UI release.

Full CI passed 247 tests and required coverage/build/high dependency gates.
Real local Playwright passed deployment, protection, offline/restart, rollback,
outage and responsive flows. Actual cross-host laptop frontend/server20 Windows
API, partial component recovery and repeated rollback passed with synthetic
persistent data preserved; verification tasks/connections were removed/revoked
and the fixture profile archived. Final live 1366/768/390 checks confirm consistent
named source controls on DevSetu and Servix, three ready connections, no unresolved
work and no unexpected browser errors. Internal HTTP produces one recorded COOP
policy warning; one low and two moderate dependency advisories remain.

Servix source/current release/settings are unchanged. No Servix Deploy/Rollback
was submitted; server21 Production is excluded. This completes the authorized
bounded development pilot, not Phase 4, independent QA or Production gates.
Final result documentation is a validated working-tree update after deployment.
See [the handoff](COMPONENT_DEPLOYMENTS_HANDOFF.md) for artifact identities,
complete changed files/stat, retained failures, commands and limitations.

## Server20 Servix repository identity (2026-10-22)

The owner explicitly requests server20 as the Servix repository instead of the
stale GitHub URL. Work is stacked on `fix/server20-repository-identity`, ADR 0048.
The existing central remote/ID and authenticated bundle transport are reused;
source readiness, publication, installation and folder proof must agree on that
binding. Preserve legacy origin, Git working tree/history and destination data.
Manifest `9f3ba5d7` is active after one actual DevSetu update popup submission,
with the change and owner-request approval reference persisted. The Servix profile
now points to the central server20 repository at revision 3, with old settings in
history. Connector/picker upgrade preserved task/pairing; all four live connection
checks passed and Deploy is enabled. Its real popup opened and was cancelled:
zero customer Deploy/Rollback POSTs. Current central/local source, Git working tree,
destination and all five protected paths are unchanged. CI passed 234 tests;
final connector-only boundary regressions, lint/types, native picker and exact
artifact smoke passed. See [the handoff](SERVER20_REPOSITORY_HANDOFF.md).

## Deployment change records (2026-10-22)

The owner requests change-message and approval-reference popups on Deploy and
Rollback. Work is stacked on `feature/deployment-change-notes`, ADR 0047. Context
is required on new requests and retained in history; authenticated actor remains
separate from declared approval text. Servix commits include the supplied context;
restores create no Git commit. Platform activation also records context, preserving
the existing native request boundary. Full CI passed 234 tests and required gates;
exact artifact and packaged native entry-point smoke passed for prepared manifest
`a2bc92d1`, now active after one real DevSetu updater click. After a VPN reconnect,
fresh HTTP80/SMB445 and read-only Plan passed; native Apply reports health/UI200,
no database write and sibling IIS preserved. The existing laptop connector was
upgraded with task/pairing preserved and its message capability verified online.
Live Rollback/Restore popup cancellation submitted no customer action; exact
settings, current source and request remained unchanged. The existing Servix
origin mismatch still disables its Deploy and was not changed in this task.
See [the handoff](DEPLOYMENT_CHANGE_NOTES_HANDOFF.md) for the immutable artifact,
executed evidence and coverage limits.

## DevSetu project visibility (2026-10-22)

The owner noted that Projects still listed only Servix. Work is stacked on
`fix/devsetu-managed-project` under ADR 0046. Add the backend-owned, read-only
platform record to Projects and Deployments; its owner deployment link opens the
existing platform updater. No customer runner, database migration or local source
publication is added. Manifest `733af544` is active after one actual dashboard
update request. Live Projects and Deployments show DevSetu and Servix in cards and
tables; the DevSetu row opens the updater. Full CI passed 233 tests and required
gates, exact packaged/native-entrypoint checks passed, and live readback confirmed
Servix configuration/current source/request unchanged with its connector online.
See [the handoff](DEVSETU_PROJECT_HANDOFF.md) for scope and immutable receipts.

## System connector, account controls and self-update (2026-10-22)

The owner reported a stuck dirty new-project dialog and clipped connector panel,
requested the System connector name, account logout/change/reset controls, and
activation of updates through DevSetu itself. Work is stacked on
`fix/system-connector-and-account-controls`; ADR 0045 records the bounded scope.
Existing local hashing, memberships, sessions and invitations are reused without
schema changes. VPN was reconnected and live HTTP/SMB verified. Manifest
`2a01ac93` is active after one real Deploy DevSetu click; the independent native
updater's result publisher was subsequently repaired and reconciled without an
application redeploy. The dashboard reports success across a fresh login. Full
CI passed 232 tests and required gates; subsequent native ACL/journal regressions
and live controls/logout checks passed. Servix current source/request, configuration
revision 2 and its five protected paths remain unchanged; connector online.
This is activation of a prepared artifact, not automatic laptop source/build
publication. See [the handoff](SYSTEM_CONNECTOR_ACCOUNTS_HANDOFF.md) for exact
application/worker digests, recovery evidence and remaining limits.

## DevSetu branding (2026-10-22)

The owner selected DevSetu and requested a minimal display rename and server20
deployment. Work is stacked on `feature/devsetu-branding`, preserving preceding
uncommitted work. ADR 0044 keeps backend/database identities and all existing
deployment behavior intact. Manifest `b9f712ee` is active; 76 UI tests, typecheck,
build, artifact integrity and live branding checks passed. All 3,645 backend and
migration/dependency files match the prior release. Saved settings and current
Servix build are unchanged; the updated connector remains online. The existing
Servix origin/allowlist mismatch still disables Deploy and was not changed in
this display-only task. See
[the branding handoff](DEVSETU_BRANDING_HANDOFF.md).

## Project master and deployment workspace (2026-10-21)

The owner supplied HRMS Applications references and requested Projects master-data
configuration, card/table deployment lists, badges and a working folder picker.
Work proceeds on stacked `feature/project-deployment-workspace`, preserving prior
uncommitted work. ADR 0043 replaces the setup navigation/presentation while keeping
Phase 4 development-pilot scope and fixed Servix destination authority. Archives
are revisioned configuration state, never application or artifact deletion.
Folder selection is a short-lived device-owner request with a native Windows
picker, repository validation and backed-up local path configuration. Manifest
`84911d3a` is active on server20. Live project/deployment views, source/destination
tests, installed native selection/cancellation and persistence after connector
restart passed. Servix request/source remained unchanged; no customer-app Deploy
or Rollback was clicked. Full CI passed 228 tests and required gates; native
Windows/UTF-8 bridge checks and final UI follow-up checks passed. Generic
destination adapters and Production remain outside this task. See
[the handoff](PROJECT_WORKSPACE_HANDOFF.md) for exact scope and evidence.

## Project deployment settings (2026-10-21)

The owner requests a setup page for other project sources, destinations, protected
attachments and connector installation/testing. Work proceeds on the stacked
`feature/project-deployment-settings` branch, preserving preceding uncommitted
work. The active roadmap remains Phase 4 exit with the owner-selected development
pilot exceptions described in ADR 0042. Other projects are explicitly draft
destinations until an applicable runner is connected; no arbitrary remote command
editor, Production target or credential reuse is added. The Servix adapter retains
its exact approved target and consumes snapshotted preservation rules on deployment
and saved-release restore. Manifest `9fee2a44` is active on server20; the live setup
page saved/reloaded revision 2 and passed source/destination/preservation checks.
The existing laptop connector was upgraded with its credentials/task preserved.
The current Servix request/source remained unchanged; no customer-app deployment
was triggered for acceptance. CI passed 223 tests and required gates. See
[the project settings handoff](PROJECT_DEPLOYMENT_SETTINGS_HANDOFF.md) for exact
evidence and limitations. No Phase 4 exit or whole-product readiness claim.

## Servix saved-release rollback (2026-10-21)

The owner requested repeatable rollback and later normal deployment of current
source. Branch `feature/servix-release-rollback` preserves the preceding local
work. Manifest `dbc684cd` is active on server20; the dashboard now provides
Rollback previous build, history Restore this build and Currently deployed.
Four live UI operations (rollback/restore twice) succeeded using retained immutable
artifacts, with no source publication or rebuild. The current build was restored
at the end: source `bad4403be655`, frontend `main.cdee177f.js`. Independent
readback matched all 106 current code files, verified two obsolete tracked files
absent and confirmed 145 existing persistent files, production listener and IIS
preserved. The old build similarly matched 104 files and four obsolete removals.
Health/full bootstrap passed. Laptop HEAD/branch/working tree and the central Git
source ref were unchanged. Both dashboard actions re-enabled after completion.

CI passed 210 tests and required gates; the additional UI regressions passed in
its 73-test suite (212 distinct tests overall). Native journal tests exercised
three A/B cycles, removed-file recovery, drift denial and data preservation.
Rollback uses actor/target-bound fresh requests, private successful receipts,
artifact hashes and a SYSTEM-owned current-release pointer. It changes code,
not database state or installed dependencies. See
[the handoff](SERVIX_ROLLBACK_HANDOFF.md) and
[ADR 0041](adr/0041-servix-saved-release-rollback.md).

## Portable developer connector (2026-10-21)

The owner superseded manual commit/push with a one-click source publication
requirement and selected FrevOS developer invitations (not Active Directory).
Local implementation and CI pass on `feature/servix-dashboard-deploy`: 207 tests,
required coverage, build and dependency audit. Windows download/setup, per-user
device pairing/revocation, invitations and actor-bound Git bundle publication are
implemented for the existing Servix development profile. Prior manifest `2a266bf0`
passed HTTP download integrity, live controls, the owner's real
installation, Limited per-user task, heartbeat and enabled Deploy button passed.
No additional developer account was created. The owner's local HEAD/branch and
working-tree status were preserved during installation. The owner's first Deploy
created a commit but exposed missing Git root-lock permissions on server20. The
bounded correction passed native LOCAL SERVICE Git prepare/abort checks while
Git config remained unwritable. The UI now shows stage/spinner/elapsed time,
retains active requests across stale polls and hides invitations behind Add
developer. Separate authenticated heartbeats avoid false offline reports during
Git import. The actual owner's Limited task automatically restarted after a
controlled stop without a manual start; future installers include its one-minute
recovery trigger. Retry `sd_8aa86bca8f6eb124373a34af559b6f09` published
`bad4403be655` and succeeded on server21 development. All 106 deployed code files
matched the sealed artifact; 145 existing files, production listener identity and
IIS configuration were preserved. HTTP health/bootstrap checks passed and the
served frontend contains the owner's white-text badge style. The browser showed
progress throughout, retained its disabled button after refresh and re-enabled
Deploy only after completion. Final acceptance is recorded in the handoff. The old manual-push
workflow is superseded. See
[the connector handoff](DEVELOPER_CONNECTOR_HANDOFF.md) and
[ADR 0040](adr/0040-portable-developer-connectors.md).

## Servix development Git/deploy pilot (2026-10-21)

Owner-selected local commit/push -> server20 private Git -> server20 FrevOS
Deploy -> server21 `D:\servixDev` is live on the dedicated
`feature/servix-dashboard-deploy` worktree. The visible dashboard deployment of
source `ce4b102efb66217ef5c8398975dfe4d7ad83119a` succeeded. Fresh readback matched
104 code files and 145 protected files; all 139 uploads remained present and the
production PID/creation time and IIS configuration were preserved. Browser health
returned 200 / OK with full bootstrap ready. Same-request retry did not duplicate
the deployment. No persistent laptop worker is needed; a scoped pre-push hook
publishes locked public npm dependencies to the server20 cache.

CI passed 193 tests, required coverage, types, build and audit; the final audit
reported no known vulnerabilities after patching the Vite development dependency.
Native Windows service-account regressions covered execution environment,
stdout/stderr exit semantics and descendant cleanup. Credentials stay outside
source/build/browser boundaries. The route is fixed to Servix development;
backend dependency releases, generic project onboarding, whole-product readiness,
Phase 4 exit and laptop-data import remain open. See
[the handoff](SERVIX_DASHBOARD_HANDOFF.md) and
[ADR 0039](adr/0039-server20-servix-git-dashboard.md) for complete evidence and limits.
## Server20 internal HTTP correction (2026-10-21)

The owner explicitly selected internal HTTP on an accessible port. Work is on
`feature/server20-internal-http`, based on `bc45307`, applying a bounded access
patch to the installed application with no database migrations/import. The
selected origin is `http://10.9.69.20`; other IIS site bindings are preserved.
Local CI passed 183 tests, build, coverage and audit. Actual packaged Windows
Node/disposable PG/Edge HTTP login, reload, CSRF and logout passed. Live activation
and visible external login-page acceptance passed: `http://10.9.69.20/`, UI 200,
health 200 / ok. Final manifest is
`d9cd4068832e8b5b5e4548a382f88b2cc1f812edad72473bee5696d794b5f4cf`.
Database connection/auth mode and sibling-site configuration remained unchanged;
temporary operator tasks were removed. Earlier operator failures and verified
recovery are documented. Live authenticated login remains untested. See
[the handoff](SERVER20_HTTP_HANDOFF.md) and [ADR 0038](adr/0038-server20-internal-http.md).
The larger unified-deployment update and laptop-data import remain pending in
their existing worktrees; Phase 4 exit remains open.

## Server 20 dependency prerequisite (publication candidate)

The dedicated `fix/server20-dependency-audit` branch starts from merged `main`
at `43eb9a0e29ec88882c9a1a922e03d7b8a28113fa`. It updates Fastify within major
5, Vitest/coverage within 4.1, and affected indirect dependencies within their
existing parent ranges. No runtime source, tests, permissions, or audit gates
were weakened or changed. The active roadmap remains Phase 4 exit.

Frozen installation and `pnpm run ci` passed locally: 178 unit/integration
tests, required coverage, formatting, lint, types, application build, and a
dependency audit reporting no known vulnerabilities. This is evidence for the
merged-baseline dependency branch only, not the other unmerged feature branches
or a live Production deployment. Publication, human merge, final release
integration, native server setup and live browser verification remain separate.
See [dependency task handoff](SERVER20_DEPENDENCY_HANDOFF.md).

On 2026-10-07 the owner authorized committing, pushing and creating a draft PR
for this dependency fix. Human merge and Production deployment remain separate
actions. The same reply selected the server20 IP-HTTPS/fresh-DB/new-admin hosting
profile; that rollout decision is separate from this dependency-only patch.

## Snapshot

| Item | Observed state |
| --- | --- |
| Production repository | `https://github.com/mishrarishav/FrevOS` |
| Detected default branch | `main` |
| Phase branch | `feature/github-repository-onboarding` |
| Base commit | `52ce49e` |
| Active phase | Phase 4 exit â€” Preview/UAT deployment and independent acceptance |
| Phase 3 merge | Core PR [#5](https://github.com/mishrarishav/FrevOS/pull/5) was human squash-merged as `13f3cd2`; its task branch was deleted |
| Phase 4A merge | Core PR [#7](https://github.com/mishrarishav/FrevOS/pull/7) was human squash-merged as `425c1f3`; its task branch was deleted |
| Phase 4B merge | Core PR [#8](https://github.com/mishrarishav/FrevOS/pull/8) was human squash-merged as `6bf5509`; its task branch was deleted |
| Phase 4C merge | Core PR [#9](https://github.com/mishrarishav/FrevOS/pull/9) was human squash-merged as `3973c59`; its task branch was deleted |
| Phase 4 UAT-package merge | Core PR [#10](https://github.com/mishrarishav/FrevOS/pull/10) was human squash-merged as `2b334bb` |
| Phase 4 local-preview merge | Core PR [#11](https://github.com/mishrarishav/FrevOS/pull/11) was human squash-merged as `9ded1f1` |
| Runtime capability | The authenticated Control Center, Fastify BFF, PostgreSQL forced RLS, protected workspace APIs, Preview routes, local table-backed credentials, and Windows/IIS UAT route are merged and live on the selected personal UAT target |
| Dependency manifests | pnpm workspace and committed lockfile on `main` |
| CI/CD | Live UAT and companion build fixes PR [#23](https://github.com/mishrarishav/FrevOS/pull/23) passed `validate` and was human squash-merged as `52ce49e`; Windows UAT deployment remains operator-executed |
| Windows UAT evidence | Source `228ebaa5073769a57769e0b0f650be88c49c4af3` is active at `https://tserver2.eeslindia.org/frevos/`; public health, application assets, local login, protected UI, PostgreSQL service, control-plane task, loopback health, and the TrackGRN sibling health probe passed. Initial activation required recorded manual ACL and database-creation interventions that this active hotfix addresses |
| TrackGRN pilot | The companion is installed on the laptop and its repository inspection, commit proposal, UI build, non-destructive API tests, and API publish path have passed. Generic GitHub account discovery and repository registration are active on a dedicated branch; newly connected repositories do not inherit TrackGRN execution authority |
| Independent QA harness | Merged through Acceptance PR [#1](https://github.com/mishrarishav/FrevOS-Acceptance/pull/1); exact-head and default-branch CI passed |
| Acceptance repository | Public `main` at completion-state squash commit `ffc85babed5f0e8deaf8af8d0194b9d3734d23be` |
| Acceptance merge governance | Active `Protect main` ruleset `20623785` enforces squash-only pull requests, conversation resolution, strict up-to-date `validate`, and deletion and force-push prevention |
| UI reference | Approved private repository ID `1329600731`, `mishrarishav/neural-command-lab`, commit `85f3ba2271ba381fc0520108365c5bb48fe386a7` |
| GitHub authentication | Verified for account `mishrarishav` during Phase 0A |
| Completed publications | Core PRs [#1](https://github.com/mishrarishav/FrevOS/pull/1), [#2](https://github.com/mishrarishav/FrevOS/pull/2), [#4](https://github.com/mishrarishav/FrevOS/pull/4), [#5](https://github.com/mishrarishav/FrevOS/pull/5), [#7](https://github.com/mishrarishav/FrevOS/pull/7), [#8](https://github.com/mishrarishav/FrevOS/pull/8), [#9](https://github.com/mishrarishav/FrevOS/pull/9), [#10](https://github.com/mishrarishav/FrevOS/pull/10), [#11](https://github.com/mishrarishav/FrevOS/pull/11), [#13](https://github.com/mishrarishav/FrevOS/pull/13), [#15](https://github.com/mishrarishav/FrevOS/pull/15), [#16](https://github.com/mishrarishav/FrevOS/pull/16), [#17](https://github.com/mishrarishav/FrevOS/pull/17), [#19](https://github.com/mishrarishav/FrevOS/pull/19), and Acceptance PRs [#1](https://github.com/mishrarishav/FrevOS-Acceptance/pull/1), [#3](https://github.com/mishrarishav/FrevOS-Acceptance/pull/3) squash-merged |
| Merge governance | Active `Protect main`; PR, squash, resolution, strict `validate`, deletion, and force-push controls verified |

This snapshot distinguishes target architecture from implemented software. The
documents describe intended boundaries; they do not prove runtime enforcement.

## Completed Phase 0A

The merged foundation establishes:

- repository-wide engineering and agent instructions;
- FrevOS product definition and system boundaries;
- phased delivery roadmap with a Phase 3 UI reference gate;
- security threat model and permission/approval model;
- repository topology, isolation, model, tool, release, and approval ADRs;
- this factual state and decision register.

Phase 0A introduced no application runtime.

## Completed Phase 1

The merged foundation introduces:

- Node.js 24 LTS, TypeScript 7, pnpm 11, native ESM, and strict compiler rules;
- one provider-neutral `@frevos/contracts` package;
- strict identifiers, workspace/project scopes, permissions, risk, approval
  bindings, safe validation results, and JSON Schema exports;
- Vitest unit tests with enforced coverage thresholds;
- Biome formatting and linting;
- repository documentation and desired-ruleset validation;
- read-only, commit-pinned GitHub Actions CI and grouped Dependabot proposals;
- exact dependencies, a frozen lockfile, and high-severity audit enforcement.

No UI, API, authentication, persistence, queue, worker, GitHub App, MCP, model,
Playwright, cloud infrastructure, artifact, or deployment capability is added.

PR [#2](https://github.com/mishrarishav/FrevOS/pull/2) passed its exact-head
pull-request CI, was human squash-merged as `72bbcb4`, and then passed the
default-branch `CI / validate` run. The active ruleset now requires that stable
check and an up-to-date branch.

## Completed Phase 2

The merged independent `FrevOS-Acceptance` foundation introduces:

- separate repository and test-maintenance governance;
- Playwright desktop/mobile Chromium and axe-core accessibility foundations;
- fixture/preview/UAT environment validation with Production and credentials
  denied;
- a synthetic loopback fixture clearly separated from product acceptance;
- semantic, responsive, console, network-failure, and accessibility checks;
- retained-on-failure screenshot, trace, and video evidence plus HTML, JSON, and
  JUnit reports;
- automated rejection of production source coupling, skipped/focused tests,
  arbitrary sleeps, forced interactions, and weak assertions;
- read-only pinned CI, frozen dependencies, short artifact retention, and
  desired branch governance.

Acceptance PR [#1](https://github.com/mishrarishav/FrevOS-Acceptance/pull/1)
passed its exact-head CI, was human squash-merged as `087f85e`, and passed
default-branch
[Acceptance CI run 31363238909](https://github.com/mishrarishav/FrevOS-Acceptance/actions/runs/31363238909).
The active Acceptance ruleset requires the stable up-to-date `validate` check.

No FrevOS UI behavior is claimed or tested because the Phase 3 Lovable source
and screen contract have not been supplied.

## Accepted foundation decisions

- The product and primary repository are named FrevOS.
- `mishrarishav/FrevOS` is the production modular monorepo.
- `mishrarishav/FrevOS-Acceptance` is independent black-box QA.
- Customer repositories remain external and use ephemeral isolated checkouts.
- Project resources and memory are workspace scoped.
- Agents use controlled business tools and have no ambient authority.
- Model integration is provider neutral at the domain boundary.
- UAT and Production promote the same immutable artifact digest.
- Sensitive actions require exact, single-use human approval.
- A separate allowlisted Windows agent performs deterministic deployment.
- The foundation uses Node.js 24 LTS, pnpm 11, TypeScript 7, Biome, and Vitest.
- Zod schemas are the runtime source of truth for shared boundary contracts.
- CI runs the same validation with read-only permissions and immutable actions.
- Independent acceptance uses a separate black-box Playwright repository and a
  synthetic self-test that cannot be represented as product acceptance.
- The approved Phase 3 UI reference is pinned by repository ID and exact commit;
  it governs experience only and cannot own production architecture.
- The Control Center experience uses React 19, Vite 8, TypeScript 7, semantic
  CSS tokens, authenticated BFF data for Phase 4 resources, and explicitly
  labeled demonstration data only for later capabilities.
- The control-plane service boundary uses Fastify 5 on Node.js 24.
- Browser authentication uses a provider-neutral OpenID Connect BFF with
  server-side opaque sessions and no provider tokens in browser storage.
- Tenant persistence uses PostgreSQL with application authorization,
  workspace-scoped repositories, composite workspace foreign keys, and forced
  row-level security as independent defenses.
- Phase 4 hosted UAT targets the existing non-Production Windows IIS host with
  loopback-only Node.js and PostgreSQL 18. ADR 0021 changes only that personal
  target to local database-backed credentials; this is not a Production
  identity or platform selection.
- Phase 4 laptop Preview uses Caddy local HTTPS, Keycloak, PostgreSQL 18, and
  the same FrevOS product image; it does not replace hosted UAT or independent
  black-box acceptance.

The ADR index records the rationale and consequences of these decisions.

## Completed Phase 3

The merged Phase 3 foundation introduces:

- `apps/control-center` as the first product experience runtime;
- desktop and mobile shell navigation, Control Center, and design-system
  surfaces;
- local command palette, workspace switching, Agent Activity, command composer,
  and state-gallery interactions;
- planned destinations for later route vocabulary without implementing those
  capabilities;
- an exact UI source contract and web-foundation ADR.

Phase 3 does not introduce authentication, APIs, persistence, integrations,
authorization enforcement, real agent execution, approvals, audit storage,
artifacts, deployments, secrets, or Production access.

Core PR [#5](https://github.com/mishrarishav/FrevOS/pull/5) passed exact-head
CI at `088bbb670637bf3519e60cc9fc9208d0f4300fb9`, was human squash-merged as
`13f3cd22d9e82b1cf0b8a65621aeb9342b402698`, and passed default-branch
[CI run 31380728718](https://github.com/mishrarishav/FrevOS/actions/runs/31380728718).
The merged task branch was deleted. Deployed Preview or UAT product acceptance
remains unavailable and is not claimed.

## Completed Phase 4A

Phase 4A added the accepted Fastify, OIDC BFF, and PostgreSQL RLS decisions;
strict identity, session, workspace, membership, client, and project contracts;
and deterministic workspace authorization with negative tests.

Core PR [#7](https://github.com/mishrarishav/FrevOS/pull/7) passed exact-head
`validate` at `e3c21fca6b669a5eb1e78a8f67a4e6a6bffdcd2c`, was human squash-merged as
`425c1f3e8b20dde798316b557341baa6c8aa8fb8`, and passed default-branch
[CI run 31381302149](https://github.com/mishrarishav/FrevOS/actions/runs/31381302149).
Its remote task branch was deleted.

## Completed Phase 4B

Phase 4B added:

- a separately constructed Fastify BFF with bounded HTTP settings;
- provider-neutral OpenID Connect Authorization Code with PKCE, state, and nonce;
- encrypted pre-authentication state plus opaque, digest-backed, rotating,
  idle-limited, absolute-limited server sessions;
- same-origin, session-bound CSRF protection and hardened host cookies;
- PostgreSQL migrations and repositories for Phase 4 identity and workspace data;
- separate owner/runtime roles, transaction-local workspace context, forced RLS,
  membership-gated evidence resolution, and workspace-preserving foreign keys;
- real PostgreSQL 18.4 isolation and service integration tests.

Core PR [#8](https://github.com/mishrarishav/FrevOS/pull/8) passed exact-head
`validate` at `f7d2555dd73875feac32c3785625aef7ecfc851a`, was human
squash-merged as `6bf550922a8adec9cddbb881f32612a935adfbde`, and passed
default-branch
[CI run 31388085447](https://github.com/mishrarishav/FrevOS/actions/runs/31388085447).
Its remote task branch was deleted.

## Completed Phase 4C implementation

Phase 4C added:

- authenticated-principal workspace discovery with select-only RLS policies;
- server-side filtering for active `workspace:read` authorization;
- a strict browser-safe session summary contract and response validation;
- same-origin Control Center loading of authorized workspaces, clients, and
  projects without browser-managed tokens or membership evidence;
- fail-closed loading, unauthenticated, denied, empty, retry, and
  session-expired experience states;
- real PostgreSQL and deterministic client lifecycle tests.

Commands, tasks, Agent Activity, approvals, audit persistence, external side
effects, and all Phase 5 capabilities remain unavailable.

Core PR [#9](https://github.com/mishrarishav/FrevOS/pull/9) passed exact-head
`validate` at `50bf9d4cc55b6e75e6b30bbc38bb19d93fba3b71`, was human
squash-merged as `3973c592b4e35e336048da98b906ba15028f6d8a`, and passed
default-branch
[CI run 31484010142](https://github.com/mishrarishav/FrevOS/actions/runs/31484010142).
Its remote task branch was deleted. Independent deployed Preview or UAT
acceptance remained unavailable and was not claimed.

## Remaining Phase 4 exit work

Core PR [#10](https://github.com/mishrarishav/FrevOS/pull/10) merged the
non-Production Render, Auth0, PostgreSQL, region, backup, and secret-lifecycle
model; the pinned non-root product image; the Render Blueprint and UAT runbook;
the separate migration boundary; and the related deterministic validation. ADR
0019 now supersedes that paid hosted route while retaining the package as
historical evidence.

Core PR [#11](https://github.com/mishrarishav/FrevOS/pull/11) merged the optional
free laptop Preview target with generated ignored secrets, synthetic identities,
deterministic seed data, local CA guidance, and guarded backup/restore commands.
The local target remains development support and is not hosted-UAT, recovery,
or independent-acceptance evidence.

Core PR [#13](https://github.com/mishrarishav/FrevOS/pull/13) merged the Oracle
Always Free route as `5fccb6e927efe623d2a8aba5f089d554d48d4289` without
claiming a live target. The product owner subsequently selected the existing
non-Production Windows IIS host. Core PR
[#15](https://github.com/mishrarishav/FrevOS/pull/15) merged same-origin
`/frevos` support and the offline Windows deployment and recovery package as
`713093c01e8126345c87cc4457b943e4189d4d09`. ARR installation on the UAT server
was observed with exit code 0. Core PR
[#16](https://github.com/mishrarishav/FrevOS/pull/16) merged bounded local
credentials as `0b3718a48e152da5b62bed29ff953a737d3e0212`; Core PR
[#17](https://github.com/mishrarishav/FrevOS/pull/17) merged the concrete
PowerShell 5.1 ACL type correction as
`228ebaa5073769a57769e0b0f650be88c49c4af3`.

That exact source is active on the selected Windows UAT host. Public and
loopback health returned `200`, PostgreSQL and the control-plane task reported
`Running`, the local administrator completed a real browser login, protected
workspace UI rendered, static assets loaded, and the existing TrackGRN sibling
health probe remained `200`. First activation exposed three deterministic
installer defects: the installing user lacked explicit read access to ephemeral
PostgreSQL input files, the new data directory was not owned by the `initdb`
process identity, and an empty database-existence query was dereferenced as a
non-null string. Operator interventions were recorded without changing packaged
files; the active hotfix makes those steps reproducible. Recovery and independent
acceptance remain intentionally unexecuted.

## Open decision register

The TrackGRN pilot resolves only its fixed single-project UAT transport and
operation boundary. Generic GitHub App, model, worker, artifact, and Production
decisions below remain open.

These are deliberate blockers to implementing the affected phases, not blockers
to completing Phase 0A:

| Decision | Needed by | Required evidence |
| --- | --- | --- |
| Production cloud provider and regional/data-residency strategy | Before Production | Customer location, compliance, availability, worker networking, support, and commercial requirements |
| Production OIDC provider, tenant, and assurance policy | Before Production | Enterprise SSO, end-user MFA, lifecycle, recovery, audit, regional, and commercial requirements |
| Production PostgreSQL availability and recovery model | Before Production | RPO, RTO, high availability, retention, restore drills, scaling, pooling, and operational ownership |
| Queue, worker runtime, retry, and cancellation semantics | Phase 7 | Persistence, idempotency, isolation, workload and cost model |
| GitHub App permission and webhook matrix | Phase 5 | Least-privilege mapping for every onboarding/workflow action |
| Worker sandbox and network-egress controls | Phase 5/8 | Threat model, supported builds, secret and artifact boundaries |
| Tool schema/versioning and policy engine design | Phase 6 | Compatibility, denial behavior, audit and approval integration |
| Model provider eligibility and project data classification | Phase 7 | Privacy, retention, regional, capability and cost requirements |
| Artifact store, provenance, SBOM, and signing | Phase 9 | Integrity, retention, access, promotion and verification model |
| Windows agent transport and device identity | Phase 10 | Outbound connectivity, authentication, rotation and recovery |
| Project-memory store, provenance, and freshness | Phase 12 | Retrieval quality, tenant isolation, deletion and retention |
| Outlook and Calendar consent scopes | Phase 15 | Minimum permissions, admin consent, retention and send approvals |
| Audit/evidence retention and private security reporting | Before Production | Legal, privacy, operational and incident-response requirements |
| Automation identity and independent reviewer model | Phase 5/8 | Separate bot/App identity, human reviewer ownership, and least-privilege GitHub scopes |

## Known limitations

- Phase 4 has a live personal Windows UAT application and observed local login,
  but the first activation required manual installer interventions. A clean
  deployment of the reviewed reliability fix, recovery exercise, and external
  acceptance have not yet been observed.
- Phase 1 implements contract and CI guardrails only; it does not implement the
  later runtime authorization, isolation, approval, audit, or deployment controls.
- The independent acceptance harness has no merged Phase 4 product-facing
  authentication specifications and has not run against an authorized deployed
  Phase 4 target.
- Chromium emulation does not prove Firefox, WebKit, or physical-device behavior.
- The selected Windows UAT target and authenticated browser state are validated;
  other external Preview or Production targets are not authorized or validated.
- Quantitative service objectives and compliance requirements are not defined.
- The current GitHub integration token can read repository rulesets but returns
  `403 Resource not accessible by integration` for ruleset and merge-setting
  writes. The human owner successfully applied and verified the current baseline.

## Readiness rule

Phases 0A through 4C implementation and the Phase 4 local-credential Windows
route are merged. Exact source `228ebaa5073769a57769e0b0f650be88c49c4af3`
is healthy on one HTTPS origin and the observed sibling IIS application remains
healthy. Phase 4 remains incomplete until the first-install reliability hotfix
is reviewed, merged, and cleanly deployed; logical backup and isolated recovery
evidence is recorded; and a separately reviewed independent black-box acceptance
change passes against that exact target. The product owner postponed recovery
execution to a later task. Phase 5 must not start before those gates.
