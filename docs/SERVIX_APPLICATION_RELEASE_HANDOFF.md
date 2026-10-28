# Complete application release follow-up

Date: 2026-10-28 IST. Status: **IN PROGRESS — Production application is live and
verified; DevSetu completion metadata needs the audited projection correction**.

## Current verification and historical checkpoints

At 11:54 IST completion-proof request pr_19c91d349789793cb6152fe90b75c65f
fails CI before package/activation. Retained Vitest metadata identifies only
postgres-service.integration.test.ts and accounts.integration.test.ts as failed;
all other 46 control-plane files, including artifact-promotions and native
promotion-environment tests, pass. Native failure receipt: phase ci, exit 1,
killed=false. Docker CLI independently reports the Linux engine pipe absent.

The installed Docker restart reveals stale AF_UNIX temporary inference and
secrets-engine sockets. Direct socket rename fails (the original is retained);
after stopping Docker, inspected temporary containing directories are renamed
aside within their original parent. The secrets-engine directory contains only
zero-byte engine.sock; no credential, image, volume or database is reset.
Docker starts at 12:00 IST and CLI reports engine 29.7.2. Recheck the same frozen
source's two integration suites, then require a NEW successful full configured
CI/package/activation request. No customer redeploy or approval replay occurs.
This observed startup symptom is also reported in the
[Docker Windows issue](https://github.com/docker/for-win/issues/15044);
the local runtime diagnosis above, rather than that report, establishes this
attempt's engine unavailability. Do not infer the cause of the original engine
shutdown from the external report. Owned socket backups remain available.

The completion-proof correction is published through actual DevSetu UI at
11:40 IST: source `bdd3a56d4cb2dc8caa0444522b4256acfc4f5927`, request
`pr_19c91d349789793cb6152fe90b75c65f`, native build
`cj_dc0ee339fda31e7f6194f99a94a60c92`. Native full CI/package/activation is in
progress; do not duplicate the request. The source checkout is clean following
publication. Changes after this source are evidence documentation only.
Earlier checkpoints are historical and do not request another customer deploy.

At 11:10 IST the actual DevSetu UI accepts full application activation
`pm_ddcdeda2c90cdc2888010328ec7a05d8` for fresh review
`pm_aed46f6b560aa3df3e78e8884960edbd`. Current direct owner confirmation is
bound to this new valid unchanged action; no expired record is reused. Original
approval consumption is **11:10:33 IST**, before review expiry **11:13:17 IST**.
The fresh matching backup's isolated restore passes at 11:08:50 IST: 114 tables,
one view, 213,358 rows, full SQL stream/schema verification and owned data/task
cleanup, no Production write. Recovery proof SHA
`321ba11ab52990b6d8cc4fe6675da26d4363b76b5fbd2dc5f35b0250e6c76afa`;
backup SHA `f92e89113c036252ebc1f8f6cab58d75cfc2c9ec1a2bfbb170651cfdcfb272ff`.

Native activation receipt is succeeded: new PID **14248**, owner SID
S-1-5-21-3574902082-3763586531-1277087089-9176, same bundle selection hash
bd114fd468bc4b54734f8d875435ff7baec8e4466a9b7157551a69a437ae361d,
configuration SHA e621ae3b710745bedc8c87fa3a91434fe64d167983d207c8c86de216f723a831,
8,576 protected files, frontend 7557eb2da721d07f23462c49558ff3a6d964ac6c7d437fcbc87856cc397bea26,
entry 3677ab3d4070bd5b3516da39e19427f68a24513f630602dba7113c83c3855ced,
20 static files, databaseRestored=false. No versions or permissions expanded.
Independent `node .local/Verify-ProductionFullRelease.cjs pm_aed46f6b560aa3df3e78e8884960edbd`
passes all 20 public files/root entry at 11:13:50 IST, matching full release
4bccfd49407f / customer source 20bba3e. `node .local/Verify-October28Assets.cjs after`
passes TLS/API readiness and all three original attachment byte/hash samples at
11:13:51 IST. Business dashboard/filter/resize checking remains with the owner.

The public DevSetu result omits frontend metadata because the remoted native
receipt is a dictionary, making PSObject.Properties membership false. Its status
is already succeeded, but the existing reader correctly rejects incomplete full-
application proof with 503. Keep that guard. Do not replay/rollback the healthy
Production application. Correct the worker's frontend projection for dictionary,
CLIXML and JSON shapes, requiring the expected digest on application success.

The bounded startup reconciliation applies only to already-succeeded application
results missing BOTH frontend fields. Standalone contract validation binds job,
actor/workspace/target, sealed review, consumed approval, source/artifacts, native
runtime path, health/task/protected-file proof and exact frontend digest. It
checks approval validity at its recorded original consumption, never authorizes
an expired deployment and never creates an approval. Wrong/failed/incomplete or
already-populated evidence is rejected. An immutable before-image and matching
private/public audit persist before compare-and-swap metadata replacement;
original private result/approval/receipt stay immutable. New public audit files
inherit public directory ACL instead of copying private-file security.

Focused tests pass two files/12 tests (11.79 seconds, exit 0), covering eight
projection denials, all native transport shapes, failure before result write on
audit collision, retry and idempotence through actual PowerShell 5.1. Initial
native test setup omitted existing RemoteSigned/module-path compatibility;
those fixture launch parameters were corrected without changing OS settings or
assertions. Typecheck, formatting, native syntax and diff checks pass.

Actual scoped read-only projection on the completed controller evidence passes,
resultChanged=false, application/database unchanged, temporary task removed:
before-result file SHA 892eedf14b2eff38cba61b24c7fa5c5b02af43f1f0e14378de273e92b830f1fa,
native receipt SHA 352c00a631071dfd97ebaa984cfe7722010a997916ae14cf3bcf51dc8283c6d2,
projected result SHA cdc9a22b8b89987fc52d90b635126c6c4a9126015269a259cd6f0a12fbc38b4f.
This diagnostic changes only its isolated import path to the verified active
contracts package, not projection guards. Full configured platform CI/activation
is still required; it will reconcile metadata without another customer deploy.
The local culture-dependent PowerShell expiry probe errored before submission;
independent Node Date.parse validation then exits 0 at 11:09:56 IST, and actual
server consumption above independently verifies timely authorization.

Current 10:53–11:01 IST continuation: the owner directly says "approval hai bhai"
for the displayed full-release scope. The earlier technical review expired at
05:54:03 IST and is not submitted, extended or reused. Actual DevSetu preparation
`pm_aed46f6b560aa3df3e78e8884960edbd` produces fresh review SHA
`67b7e2acad04ccee49e6b511fb38b34f61027eb58867f5c3373bd2ae545737a2`,
expires **11:13:17 IST**, backup SHA
`f92e89113c036252ebc1f8f6cab58d75cfc2c9ec1a2bfbb170651cfdcfb272ff`,
443,989,676 bytes, captured 10:58:17 IST. Matching isolated restore is running.

Comparison verifies unchanged workspace/actor/profile/revision/target digest,
saved Development release, complete frontend/backend artifact identities,
existing process/owner/Node/batch rights/managed task and operator hashes.
The only snapshot change is six new files under application uploads. Both target
snapshot integrity hashes verify. All 8,570 original protected records retain
their SHA/size; none removed or changed. Source, environment/database binding
and Node hashes are unchanged. New protected inventory: 8,576 files,
2,016,367,916 bytes, SHA 6492f168ed055c71f7cf057ecb49c50938afcdb7b706e6ada998d7af60f7c247.
Only protected user-data additions are present; planned mutations, artifact,
destination, identity and permissions are unchanged.

The owner's current explicit confirmation authorizes that unchanged deployment
scope, including the previously presented startup/recovery/dependency terms.
Bind it once through the actual UI to the NEW valid review after matching restore
passes; do not treat the old expired review as an approval record. If action,
artifact, destination, identity, permissions or risk changes, obtain a new owner
decision instead. ADR 0069 records accepted same-tree Development observation.
No approval has yet been submitted or consumed for the full application and
Production still runs the earlier backend release. No code/build/library upgrade
or manual dashboard/filter/resize check is added in this continuation.

Final prepared boundary at 05:50 IST: matching isolated restore for review
`pm_54e8481b41d67628f9f8c87e200784b4` PASSES at 05:49:27 IST.
Proof SHA `f1b554df1861be04a717b7085d1fd5962c74715d0ba3951c3010b376ac397e74`;
raw SQL SHA `cd9e4f8d0d9b12c0f6e0c580b28952f707bbf671f06f93139c36ac46d90cd07c`.
Exact fresh backup SHA 6edfebfa6c4b08c2b98256992a46b338ea688fb512fbfa5ef7feb4831b6d8f19
matches that proof: MySQL 8.0.28, 114 tables, one view, 213,139 rows, full SQL
stream and schema counts verified, isolated loopback only. Production database
and files are unchanged; owned temporary data/task removed. Native restore
operator exits 0. The immutable earlier preparation marker is retained unchanged.

The exact actual browser review is open, its Changes field contains both
artifacts/source/tree equivalence and the fresh matching recovery proof. All six
acknowledgments are unchecked, Approval reference is empty, and Approve is disabled.
The owner was asked for this one exact decision, including retention of their
same-tree Development observation under proposed ADR 0069. NO response or approval
is yet recorded. Review expiry remains **05:54:03 IST**; do not activate an expired
scope or infer approval from elapsed time. Snapshot capture is unavailable; the
actual accessibility review is retained at
.local/evidence/production-review-pm_54e8481b41d67628f9f8c87e200784b4.txt.
The tab is marked for handoff. This is not a Production deployment success.

Repository: FrevOS, D:\FREVOS\.local\worktrees\servix-dashboard;
branch codex/servix-full-release. Base a51e97c20dc27ce047cb54ef54a4ef343a5a5b22;
published result 2977bbf736cb71b90bc32c3b3a8dd3d90740a225 through configured
server20 Git, with the 42-file inventory/stat below. No PR exists. Two subsequent
evidence documents are uncommitted; no implementation changes remain unpublished.

At 05:40 IST, fresh review `pm_54e8481b41d67628f9f8c87e200784b4` is
prepared and the actual browser correctly shows a verified update of managed
promotion `pm_9b481b3a94f1227d77373247b1d350db`, not first adoption.
Review SHA `8e8ed6d733b832c44c81cb29083a6dbf78b39010eb53e37806f30f29f68ebd68`;
expires **2026-10-28 05:54:03 IST**. It is actor usr_windows_admin/workspace
ws_server20/profile servix-production revision 1, target SHA
`a219e79b7fd83ee425bf162c9b3b8ca277b436a2ba1723c9ce54235639e143d4`.
Artifacts/source remain the exact full release 4bccfd49407f / source 20bba3e /
frontend 7557eb2da721 / backend 5ff7622a9f31, saved restore sd_165f3a.
Existing owner EESL\APPC0024, PID 18504, Node 20.11.1, batch logon already ready;
8,570 protected files / 2,013,703,406 bytes, inventory SHA
`14ffec5c3707b1d06e395af8984530c7c424eeccc5dc51594d9cfc135cffa8c3`.

Fresh encrypted full-stream-verified MySQL 8.0.28 backup:
`promotion-backup/pm_54e8481b41d67628f9f8c87e200784b4`, SHA
`6edfebfa6c4b08c2b98256992a46b338ea688fb512fbfa5ef7feb4831b6d8f19`,
443,472,386 bytes, captured 05:39:03 IST. Its separately scoped matching isolated
restore is running via Run-PreparedPromotionRecovery.ps1. The immutable preparation
marker predates this later test and must not be rewritten. Production health and
three original attachment samples pass again at 05:41:58 IST; the separate
pre-cutover proof is .local/full-release-production-precutover-assets.json.
All review acknowledgments remain unchecked and no approval was submitted.
ADR 0069 remains proposed. If this review expires, prepare a new scope/backup;
never reuse the expired review or fabricate the owner's decision.

Current live update at 05:36 IST: correction source
`2977bbf736cb71b90bc32c3b3a8dd3d90740a225` is active, manifest
`df48db020b1a231da6bf38aac0c4b20ac738f9a93deb35253ed9e7b87fc1d6f7`.
Request pr_14b5aa503c55b4ea4ffbc3440ee1000a succeeds. Archive SHA
`ecce384b0920aef265e65de45b6c506d58972acccbd542d467f3d5af1219e00f`,
131,638,568 bytes; reference digest
`6631b4ca71abe8503af9bf769a2445e2c629736295241e68647fe1f3a4fb19fe`.
Independent Apply cj_b212d8365a338d1ac4e0e692a1b216f5 verifies HTTP/UI 200,
siblingsPreserved=true and databaseWritten=false, previous manifest 9ed0dbb2.
All 77 test files pass and coverage gates remain unchanged. Repo/branch/base and
complete 42-file publication inventory/stat are recorded below; no GitHub PR,
default push or merge occurred.

Fresh actual UI preparation pm_54e8481b41d67628f9f8c87e200784b4 now captures
its encrypted backup for saved restore sd_165f3a005513759a747408470e7a581f and
full release 4bccfd49407f. New same-scope source observation confirms a clean
D:\servixDev checkout, HEAD 20bba3ebbf606df6e6a3b919898443aa3e56fc20;
its tree and e04137b's tree both equal 5f91dc270c27337e52e07b8db2b7154e7afa219d.
No approval/Production cutover has occurred. Do not reuse the incomplete expired
pm_318cc4094cd89d00b95f0022e2e10ac5 review or its old backup for this new review.

Latest at 05:26 IST: actual configured correction request
`pr_14b5aa503c55b4ea4ffbc3440ee1000a` publishes
`2977bbf736cb71b90bc32c3b3a8dd3d90740a225`, native build
`cj_1af61b623abb3742373166c034f4e586`. All 77 cached files pass (13 contracts,
16 UI, 48 control-plane; zero failures); all existing coverage gates pass.
Native package builder starts at 05:24:54 after the full CI command succeeds.
No new manifest is active yet. Source diff against a51e97c: 42 files,
3,350 insertions/97 deletions. Complete inventory: the historical 39-file list
plus docs/adr/0069-audit-commit-development-acceptance.md,
apps/control-plane/test/promotion-environment.test.ts and
apps/control-plane/test/device-enrollment.test.ts. The only post-publication
changes are evidence documents. No PR or default-branch/GitHub push/merge.
Require the same request's package and independent Apply receipts, then fresh
Prod preparation/backup/restore and exact owner decision. Earlier checkpoints
below are retained historical evidence, not the latest outcome.

Update at 05:10 IST: request pr_9b4d03e06eb6538d614d119dd380317f stops safely
in CI, exit 1/AssertionError, no package or activation. The original Vitest cache
identifies only device-enrollment.test.ts as failed (7,084.70 ms); the other 47
control-plane files, including promotion-environment and promotion-lifecycle,
pass. Contracts/UI coverage pass. Raw original error output was intentionally
discarded by the native adapter; its location regex did not match Windows paths,
so the exact original assertion is unavailable. Do not invent it. Two isolated
installed-Node/restricted-environment reruns pass; a coverage rerun also passes
the device assertions while failing the expected incomplete single-file coverage
gate. That is diagnostic evidence, not full CI acceptance.

The existing fixture has three one-second fixed-tick state waits and a one-second
health budget. It now uses bounded five-second vi.waitFor state assertions and
the same five-second fixture heartbeat budget. No assertions, production timing,
coverage thresholds or independent acceptance tests change. This is a timing
robustness correction supported by isolated-versus-full-run behavior, not proof
of the exact discarded failure. Focused command
`pnpm.cmd --filter @frevos/control-plane exec vitest run test/device-enrollment.test.ts test/promotion-environment.test.ts`
passes two files/three tests, 5.91 seconds, exit 0. Require a NEW actual complete
CI/package/activation; active platform remains e6115ec / 9ed0dbb2.

Update at 04:58 IST: the incomplete review's matching isolated backup restore
PASSES, 114 tables, one view, 213,139 rows, full SQL-stream digest and schema
counts verified. Proof SHA
`196b387c61fbb99850a4cd22c5e4f7bb6d516f02ce8d1d6bbfc7b8feb57adbf4`;
raw SQL SHA `846ad8e7527e8d6ca83fa27885bec3cf27c6152ca8ea41e812decb09db683a6c`.
MySQL source/restore 8.0.28, isolated loopback only, Production database/files
unchanged, owned temporary data/task removed. This does NOT repair the immutable
review's missing managed identity or authorize activation. A new review/backup
will be required after the worker correction.

The actual UI submits correction request `pr_9b4d03e06eb6538d614d119dd380317f`,
source `d762b661184ece8950fda70e6468b3c2b32d9b90`, native build
`cj_ed028c84f6e9d0fb8e6231df589ff102`. Contracts/UI coverage pass; control-plane
CI is in progress. Local native observation tests, typecheck, format/lint,
PowerShell parse, repository validation, private secret exclusion (41 changed
files) and diff check exit 0. The first dialog rejected an approval-reference
string over its existing 160-character limit before submission; the shortened
same-scope reference was accepted once. No duplicate request or Prod approval.

Latest update at 04:51 IST: pm_318cc4094cd89d00b95f0022e2e10ac5 is prepared
with encrypted backup SHA 9368ef076964e2ed48125e75151ae4f270a48ff9925f3eb509911b0ca19841a6,
443,472,370 bytes, 8,570 protected files. The review SHA is
6875b4d65a0983d2c4358ab88b06f8312db93907dd9bd660db9a25186717c422;
it expires 05:02:20 IST and MUST NOT be approved: the remoted observation is a
hashtable, so the worker's PSObject.Properties membership check omits the verified
managed update fields. The existing verify-review guard rejects that scope before
activation; the browser correctly exposes the missing classification as first
adoption. No approval was submitted. An isolated restore of this backup is already
running and will be retained as separate recovery evidence. Live Production health
and all three original attachment samples still pass at 04:47:28 IST.

The worker correction introduces Get-PromotionObservedManaged: dictionary-key
membership or normal object properties, exact promotion-ID shape, and rejection
when task presence and managed evidence disagree. Run this immediately after
observation, before backup; use its result in the review. Actual native PowerShell
test covers a dictionary, real PSSerializer CLIXML round-trip, JSON object, initial
adoption, missing/inconsistent evidence and invalid identity. Command
`pnpm.cmd --filter @frevos/control-plane exec vitest run test/promotion-environment.test.ts`
passes one file/two tests, 2.65 seconds, exit 0. No protocol or ownership guard is
relaxed. Require fresh configured platform publication and a NEW immutable review.

Update at 04:43 IST: the task-observer fix is published and active. Actual
DevSetu request `pr_1b1e23ac5292ec9abdd711a9419c89cc` publishes source
`e6115eccc9d6df09e61025dabddf701460bc6d0a`; native build
`cj_b55f0027c396bcb84756f9a980bd7a9b` passes full configured CI/package.
Manifest `9ed0dbb212d52c16549e95653aebf2bab7772a116b866266e4db92d1760bda61`,
archive SHA `6d2e1e70cec957de3fbea74c231341fb7fd9d570923677bdca476ea2e9f6eb7a`,
131,638,292 bytes; reference digest
`b31ffb96a0edcc5b52e87fbbf53086cb972e40812ff579597b0e4206e4191518`.
Independent Apply `cj_5e0adf90a69db5234bb1dc143cd48661` passes HTTP/UI 200,
siblingsPreserved=true and databaseWritten=false. All 77 retained test files and
the same coverage gates pass; no assertions or acceptance tests were removed.
Before publication: focused native lifecycle test, control-plane typecheck,
Biome format/lint (existing warnings), repository validation (106 Markdown files),
private secret exclusion (40 changed files), PowerShell syntax and diff checks
all exit 0. Source diff at publication: 40 files, 3,123 insertions/85 deletions.
Complete inventory is the historical list below plus ADR 0069; no PR exists and
there is no GitHub/default-branch push or merge.

The actual UI now queues fresh Production prepare
`pm_318cc4094cd89d00b95f0022e2e10ac5` for current saved Development restore
sd_165f3a005513759a747408470e7a581f / full manifest 4bccfd49407f. Follow this
same request; do not repeat preparation because of a transient browser response.
No Production activation or owner acknowledgment of proposed ADR 0069 exists yet.

Native task semantics are documented by Microsoft in the
[Task Scheduler schema](https://learn.microsoft.com/en-us/windows/desktop/taskschd/task-scheduler-schema),
[run-level enum](https://learn.microsoft.com/en-us/windows/win32/api/taskschd/ne-taskschd-task_runlevel_type)
and [logon-type enum](https://learn.microsoft.com/en-us/windows/win32/api/taskschd/ne-taskschd-task_logon_type).
The implementation asks Windows for effective values instead of treating missing
XML elements as authority to relax the guards.

Platform source `15a038af278fb2388c296b3e0f089a88578edb9a`, manifest
`7548a5b468e32e6da1e5eda9052ca44b654abd1359cd1ba023c1c023c9f6132c`,
is active. Request `pr_c48260542da5287b07ebed87e7943118` passes the actual
full CI (77 test files); independent Apply `cj_b2e97fc98ea1bd4cdfa5e960218cc8d3`
verifies HTTP/UI 200, preserved siblings and databaseWritten false. Archive SHA
`214da78c8187e9bd7221a17b68bc7ef64e8b9f4becd8745b922b1e4ca4577b1a`,
131,638,009 bytes. Coverage: contracts 98.28% statements/92.77% branches,
UI 100%, control-plane 95.25% statements/91.74% branches.

Actual full Development request `sd_8199dc23bf2974bb2692f449dc3b73c3`
passes. Source `20bba3ebbf606df6e6a3b919898443aa3e56fc20` has the same tree
`5f91dc270c27337e52e07b8db2b7154e7afa219d` as the owner's observed e04137b.
The publisher's audit commits change no application files. All five configured
customer suites pass, then the optimized frontend build passes. Full manifest:
`4bccfd49407f3d898c5574e468b56da53b91d35864f92ffa98478b14d7df22bc`;
archive SHA `d030878d364f51f1da4ebde976afb315dec52713896c5d194f4b158a730feed7`.
Frontend descriptor `7557eb2da721d07f23462c49558ff3a6d964ac6c7d437fcbc87856cc397bea26`;
backend descriptor `8e525dab58dde2e560fbc2d7f18547a1d3c1e048204062e09c98c97b227eac96`.
Backend bundle remains `5ff7622a9f316edbe0485c47f179f6c1bccac75241e6540f1d0079b11172fb0c`.
Health/readiness, 153 protected files, retained unknown files, IIS configuration
and Production listener preservation all verify. Rollback sd_4010e745f5c57ede4d4820562760480a
and restore sd_165f3a005513759a747408470e7a581f succeed through actual UI.
The restored full artifact is byte-identical, with no rebuild. Independent public
verification confirms all 20 frontend files; three Production attachment samples
retain their prior SHA/bytes and Production health remains ready.

First full Production prepare `pm_4c8ea36ee3d920a7f00d4b6d3fcc4cfb` stops
before backup/cutover on PropertyNotFoundStrict in Invoke-PromotionTarget.ps1.
Windows exports omit default RunLevel and Enabled elements. The new bounded fix
uses the native unregistered Schedule.Service.NewTask parser for effective values
and cross-checks action/principal bindings. No registered task or permissions
are changed by observation. The lifecycle fixture now models omitted defaults,
rejects elevated/disabled-boot tasks without stopping their runtime, and retains
all update/recovery checks. Focused command
`pnpm.cmd --filter @frevos/control-plane exec vitest run test/promotion-lifecycle.test.ts`
passes one file/one test, 28.86 seconds, exit 0.

Actual shadow Observe via `.local/Run-PromotionCanonical.ps1` passes on the exact
Production target: same existing promotion pm_9b481b3a94f1227d77373247b1d350db,
PID 18504, same owner and canonical Node hash, 8,570 protected files, no database
write, no Production change and temporary diagnostic task removed. The summary
boolean managedRuntimeVerified is inaccurate because it checks a PowerShell
hashtable through PSObject.Properties; successful Read-ManagedTask and its returned
previous promotion ID prove the native verification. The raw receipt is retained.
The observer fix still requires actual platform CI/publication. Next obtain a fresh
prepared backup and matching isolated restore, then one exact owner decision.
[ADR 0069](adr/0069-audit-commit-development-acceptance.md) is proposed only.
No full-application Production activation, manual business UI acceptance, forced
Production recovery/reboot, dependency upgrade or database restore is claimed.

The publication inventory below is historical at c0471d2. At 15a038a it remains
39 files, 2,927 additions/84 deletions against base a51e97c. Current uncommitted
fix adds changes to Invoke-PromotionTarget.ps1, PromotionLifecycle.ps1 and
promotion-lifecycle.test.ts, plus current evidence documents and proposed ADR 0069.
Earlier paragraphs below are historical checkpoints.

## Verified platform and customer source follow-up

The Git-profile request `pr_fbb3c9aabdf9d01af32754adb1a10d3d` also succeeded,
source `c0471d297c398473d8dbf2f2fd10be5c754f2ea2`, manifest
`2ed37f31f595270c12dc1dffc441ff6974fa79c1e1fe6e45106be63c0350bb31`.
Archive SHA `f76c8fa751bc3d66160fa3d140299096f887c10a55b9a4dbaf2e0269a250b266`,
131,637,496 bytes; reference digest
`22ec17e5d43d0d9213f09921524faa6d598126a988ec61f692787ec12dd5c2a7`.
Independent Apply `cj_6ebb20a520181975425e00227759af22` verifies HTTP/UI 200,
siblings preserved, databaseWritten false and the previous `accdf662...` manifest.
All 77 retained test files pass; control-plane branch coverage is 91.73%.

Read-only authenticated state now reads customer head `e04137b...` correctly.
The next actual Development request `sd_7c3eb4e752850ba1d995f9f95289f1eb`
reached bundle upload but failed before build with bundle-upload-failed. Local
publication created audit commit `614133925dd3bb6213241c9072b8d471c79bfc75`;
its tree diff against `e04137b...` is empty. The 946-byte saved bundle imports
successfully into a private isolated repository under SYSTEM. Under the real
controller identity LOCAL SERVICE (`S-1-5-19`), the same deployed SDK reproduces
SIGTERM/killed at 5,041 ms in its first config/identity command. A longer bounded
read with the identical restricted environment succeeds at 19,998 ms; after that,
warm reads complete in 68–132 ms and the entire original SDK import succeeds in
1,082 ms. Repository identity, refs/heads and incoming-ref write permissions are
already correct. No central Git ref, Production application or database changed;
the isolated diagnostic tasks were removed. Only owned diagnostic folders receive
temporary LOCAL SERVICE access; no central repository permission was broadened.

The follow-up adds a validated Git-profile readTimeoutMs (30,000; allowed range
5,000–60,000) to the controller and builder identity-read boundary. This addresses
the observed native cold-start latency without changing test deadlines, assertions,
Git verification, dependency/runtime versions or environment restrictions. Local
focused tests/typecheck pass; a fresh actual configured CI/package/activation is
required before the next customer retry. The environment probes happened after
the first long read warmed the process cache, so they do not establish that adding
HOME, PATH or disabling global configuration fixes the cause; none is applied.

The bounded deadline fix is now published through actual DevSetu request
`pr_c48260542da5287b07ebed87e7943118`, source
`15a038af278fb2388c296b3e0f089a88578edb9a`, native build
`cj_0181fa49035adfeb7f0df9cf653273e6`. It is building, not activated. Final local
validation is exit 0: two focused files / nine tests, typecheck, format check,
lint (existing warnings retained), repository validation and secret exclusion.
The Git profile test uses a different 45-second input to prove the runtime takes
its deadline from configuration and rejects an out-of-range 120-second value.
PowerShell recipe syntax and complete reviewed diff checks pass. Follow this same
request to terminal CI/package/Apply receipts before retrying customer publication.

The sixth configured pipeline `pr_569e11398745b52b96aa39217ad8e92d` succeeded.
Its source is `53ea0214f4fb1e4e13369256d471122a94a0ad3d`, reference digest
`e164f15aa2b693995c364300f5888e2b6678b6f20cce2939523ab1f3903c4e3e`, archive
SHA `d1ad6d15ed714788de44f99239dc5c1fb72c3c5d852ef5ba8a17e137c14ee4ab`
(131,636,730 bytes, 3,970 packaged files), manifest
`accdf66214a481a477334f6c33fc254f8813002c8d4f5ecaeeb884a57337d50f`.
Independent Apply job `cj_ade3a227131e7859e2b5e527fef47967` reports PASS,
HTTP/UI 200, siblings preserved and databaseWritten false. Server20 active.json
matches. This is actual source publication, full CI, packaging and activation.

The subsequent UI-created Development request
`sd_f27841bcf5ca00cd6e608dbdf6ab9e18` failed before source publication with the
generic build-or-authorization error; no build scratch or target activation was
created. Read-only SYSTEM diagnostics verify the source repository still contains
`e04137b4a862e8760a59b95da7e0de9a32bc6d38`. Its fixed Git cmd launcher times out
on identity/head (20 seconds each) and version (7 seconds). The installed
`ucrt64/bin/git.exe` reads version in 82 ms, repository identity in 66 ms and head
in 75 ms. It is the same installed Git 2.56.0.windows.2; no version upgrade or
binary replacement is involved. Temporary diagnostic tasks were removed.

The bounded correction moves the compatibility Git executable, repository and
verified provider identity into ReleaseBuildProfile.json. Controller startup
validates the versioned profile and supplies it to the existing Git executor;
the builder consumes the same data and verifies repository identity before export.
Absolute executable/repository paths are required, ambient service secrets remain
excluded and the exact source/target protections are unchanged. Focused tests
cover configured execution, mismatched identity and rejection of a relative tool
path. A fresh actual configured CI/package/activation is still required for this
correction before retrying Servix Development. No new Production application
deployment or approval is claimed.

Browser screenshot/mouse dispatch timed out after activation. The actual visible
DevSetu dialog remained operable through its normal keyboard controls; no direct
deployment API mutation or automatic retry was used.

The Git-profile correction is published by actual DevSetu request
`pr_fbb3c9aabdf9d01af32754adb1a10d3d`, source
`c0471d297c398473d8dbf2f2fd10be5c754f2ea2`, native build
`cj_719b8635255295dada6eda2281b25128`. Full CI started at 02:37:26 IST;
contracts and UI coverage pass, native tests remain in progress. Source publication
is not activation. Before that publication, two focused files / nine tests pass,
format check, lint and typecheck exit 0, build recipe syntax and repository
validation pass, and the private secret comparison excludes both approved owner
secrets across all 39 changed files. Existing lint warnings remain; no unrelated
lint changes were made.

The connector publisher records a change-message commit even for a clean source.
After the next customer publication, verify the actual new head and compare its
Git tree with `e04137b...`; do not silently call a different commit the exact source
accepted by ADR 0068. If only audit metadata changed, include the tree-equivalence
proof and acceptance of that exact tested release in the single fresh Production
decision. Do not ask for duplicate Development visual testing or set the release's
manual acceptance acknowledgment before the owner confirms that exact decision.
Record any resulting superseding acceptance decision without rewriting ADR 0068.

## 2026-10-28 resume

The owner confirmed desktop unlock and VPN reconnect. Bounded probes to server20
HTTP/SMB and server21 API pass. Request `pr_cb04963e4944410690fbbccb6234531c`
and native build `cj_cb5fd978d75ed933cc34baae585f163b` both reconcile as failed;
no activation was left pending. Active platform manifest is still
`a4c5e8ab2a0f7c97f1762455e5e6c67c68d21ac652754e19300d3d5ef48bd461`.

The installed native Node/pnpm, with the existing restricted environment, runs
the six failing files together: `vitest run test/local-development-runtime.test.ts
test/connector-local-git.test.ts test/system-discovery-runtime.test.ts
test/promotion-lifecycle.test.ts test/system-enrollment-windows.test.ts
test/promotion-environment.test.ts --reporter=verbose`, exit 0, six files /
15 tests pass in 224.95 seconds. This is not a full configured CI pass.

The host still has only 464 MB free physical RAM of 16,025 MB (CPU 64% observed).
To bound peak CI contention, root coverage runs workspace projects sequentially
and the Windows UI/contracts runners use one worker, as the control-plane runner
already does. All test cases, real native boundaries, assertions and coverage
thresholds remain enabled. No customer runtime or library changes are involved.
Direct validation of the bounded runners passes: Windows UI 93 tests with 100%
scoped coverage (18.58 seconds), and contracts 88 tests with existing coverage
gates unchanged; both exit 0. Repository validation, formatting, lint and private
changed-file secret comparison also pass before configured publication.
The fifth actual DevSetu request `pr_b63ae3d73f826b5f5d3b07920799e684`, source
`1a7a31ff958941143e3df7797d67f21788b97222`, native build
`cj_59fdf51e6c7e451c33bb37914f7389bf`, failed CI before activation. Contracts and
UI coverage passed; 46 of 48 native files passed, with only the two database
integration files failing. Exact restricted-environment reproduction failed before
PostgreSQL startup with Docker OCI `fork/exec /usr/bin/runc: resource temporarily
unavailable`. The repository's local Caddy preview container had 16,068 processes,
verified by Docker stats and Compose ownership labels for `D:\FREVOS`.

At 01:44 IST the scoped `docker restart --time 10 9b5d079c3875` exited 0. This
restarted only that local proxy, retaining its configuration/volumes; no Docker
daemon restart, unrelated application stop or remote mutation occurred. Its
process count reduced to 18. The same installed restricted Node/pnpm then ran
`vitest run test/accounts.integration.test.ts test/postgres-service.integration.test.ts
--reporter=json`: exit 0, 22/22 tests pass. The isolated synthetic databases were
removed by their normal test lifecycle. This focused pass does not qualify a
failed configured request for activation.

The sixth request was submitted through the actual DevSetu dialog:
`pr_569e11398745b52b96aa39217ad8e92d`, native build
`cj_21edd083f3bb17b5d57411eb6b508c37`, source
`53ea0214f4fb1e4e13369256d471122a94a0ad3d`. Git tree comparison with `1a7a31ff...`
is empty; the publisher records another approved change-message commit. Browser
submission initially reported uncertain confirmation, but the controller's scoped
request file proves acceptance; no Retry was submitted. Follow this same request
to terminal full CI/package/independent activation evidence. Only then may the
customer Development release and fresh full-application Production review proceed.

At 02:07:29 IST the sixth native builder reached the enrolled release packager,
which is invoked only after successful `pnpm run ci`. Its frozen-source retained
Vitest results contain 13 contracts, 16 UI and 48 control-plane files, none marked
failed. Coverage gates pass: contracts 98.28% statements / 92.77% branches, UI
100%, control-plane 95.25% statements / 91.69% branches / 96.6% functions /
96.72% lines. Compilation and the configured high-severity dependency audit gate
completed before packaging. No final package/activation result is claimed by
this intermediate observation.

Repository: `https://github.com/mishrarishav/FrevOS`.
Branch: `codex/servix-full-release`.
Base: `a51e97c20dc27ce047cb54ef54a4ef343a5a5b22`.
Latest configured DevSetu publication produced
`53ea0214f4fb1e4e13369256d471122a94a0ad3d`; its cumulative diff from the base
is 37 files, 2,662 additions and 76 removals. This includes the preceding
deployment's retained handoff documents, owner clarification and bounded CI
worker configuration. Later evidence additions to this document and
CURRENT_STATE.md remain uncommitted. No PR, merge, default-branch push or new
live activation is claimed.
Phase 4 exit remains open. See [ADR 0067](adr/0067-complete-application-release-promotion.md).

## Scope and implementation

- Reuse the configured laptop source publisher, server20 Git and compatibility
  builder, existing Development operator and independent platform updater.
- Build the frontend with same-origin API/portal routing. Its digest-bound
  descriptor excludes destination web.config, environments and persistent data.
  Build/destination/test recipes live in reviewed JSON configuration.
- Require configured backend regression/compiler and frontend unit tests before
  packaging. Their passing record is bound to the source commit and saved release.
  Verify installed and publicly served frontend files on Development. Only full,
  successful, tested Development manifests are offered for application promotion.
- Production prepares both immutable components from that saved release. A
  controller-backed successful receipt, old configuration/launcher/selection,
  same owner, unchanged environment, canonical Node and exact least-privilege
  boot-task identity are required for subsequent managed updates.
- Preserve prior task XML, backend selection, frontend preimages, all unknown
  files, environments, uploads, attachments, external blobs and IIS routing.
  Install assets before the frontend entry. Verify public artifact bytes before
  success. Failure restores the previous task/selection/frontend and checks its
  public entry/release; uncertainty remains recovery-required without replay.
- Show both component identities, historical backend-only outcomes, configured
  promotion links and exact source/target review. Full approval additionally
  records the owner's Development acceptance for this exact saved release.

The owner explicitly reserves dashboard, filter and resize manual testing for
themselves. Do not perform those UI actions or claim their functional acceptance.

## Subsequent owner updates

1. Edit the configured customer checkout (`D:\servixDev` on the selected source
   connector). Keep environment credentials and persistent data outside the
   immutable artifact. No manual Git command is needed in the configured flow.
2. In DevSetu Deployments, select **Servix development → Deploy**, enter the
   change message and declared reference, and follow that request to completion.
   Source publication goes to configured server20 Git; configured frontend and
   backend tests/builds precede deployment and preservation/health verification.
3. Perform the owner's business checks on Development when application code
   actually changes. Choose that successful saved complete release from the
   Production promotion page opened through project configuration.
4. Prepare a fresh Production review. Examine target, both artifact identities,
   running owner/task, protected inventory and matching backup/recovery evidence.
   Confirm that exact unexpired scope once. Promotion reuses the saved digests;
   it does not rebuild from a changing source checkout.
5. Check the completed Production result and public application. A later code
   recovery selects a saved tested release through a new scoped review; database
   restore, arbitrary shell and automatic replay are not part of this workflow.

The historical unbound Production card's disabled Deploy control is not the
application promotion entry point. Use the configured tested-release promotion
link. Reusing the connector is sufficient; no reinstall is required for each
customer code update. Changed connection/runtime configuration needs its own
review and cannot silently reuse a preceding deployment approval.
Their Development browser login is available. The later clarification below
supersedes waiting for another same-source visual check. Continue deployment
health and artifact/preservation checks. A new exact artifact-bound Production
decision is still required;
the prior backend-only approval is consumed and is not reused.

## Observed validation so far

- Local `pnpm.cmd run ci`, with the canonical Windows PowerShell 5.1 module path:
  exit 0, 369 tests in that run. Control-plane coverage 95.25% statements,
  91.66% branches, 96.6% functions and 96.72% lines. UI API coverage 100%.
  Build passes; audit gate retains 5 low/6 moderate and no high/critical platform
  findings. The initial environment-path failure is retained in the private log;
  tests/assertions/gates were not weakened. Later changes receive focused
  validation and the actual frozen-source configured CI before activation.
- Final native/static-focused run: 8 tests pass. Real file preimages/public
  HTTP bytes are exercised with a simulated Task Scheduler/CIM boundary:
  adoption, managed updates, corrupt frontend recovery, registration interruption
  after effect and another update. No real fixture startup task was created.
- Actual Servix frontend unit tests: three suites, 11 tests pass. Backend
  register/filter/assignment, mail compaction and reply-trail scripts exit 0.
  The local checkout lacks the build compiler; its three tests pass in a separate
  temporary directory using the exact lock-pinned esbuild 0.28.2 from the official
  registry with integrity verification. Customer dependencies were not changed.
  Task-created cache files were moved into ignored task storage; customer Git
  status is clean.
- Actual compatibility packaging fixture and native parsing pass. Whole-workspace
  type checking passes. Public/Development business UI actions are not exercised.
- Final focused control-plane API tests: `pnpm.cmd --filter @frevos/control-plane
  exec vitest run test/artifact-promotions.test.ts test/servix-deployment.test.ts`,
  exit 0, two files / 16 tests pass. Final UI tests: `pnpm.cmd --filter
  @frevos/control-center exec vitest run test/deployment-settings.test.tsx
  test/promotion-api.test.ts`, exit 0, two files / five tests pass.
- `pnpm.cmd run validate:repo`, `pnpm.cmd run format:check`, `pnpm.cmd run lint`,
  native deployment script parsing and `git diff --check` pass. Existing lint
  warnings/information and line-ending notices remain. Private comparison finds
  neither owner-supplied secret value in any changed/new publication file.
  Customer `D:\servixDev` Git status remains clean at this boundary.
- Re-running `pnpm.cmd run ci` in the exact frozen source of the failed configured
  build, with canonical Windows PowerShell modules, exits 0: 88 contract, 93 UI
  and 191 control-plane tests (372 total), all coverage/build/audit gates pass.
  Control-plane branches are 91.69%; platform audit remains 5 low/6 moderate.
  A separate UI coverage run with the installed native Node/pnpm and native
  environment whitelist also exits 0 (93 tests, 100% scoped coverage). The first
  configured CI failure's precise cause was unresolved at that stage. The later
  diagnosis below reproduces and corrects the fixture defect. Retain both failed
  attempts and require a fresh successful configured attempt.

## Pending live evidence and limits

The actual DevSetu UI accepted pipeline `pr_8f4bf3c7708f8494f4290c1683c6faa0`.
Publication succeeded at the commit above; configured native build
`cj_4c8b2342071da6f5ac2940b5dd1bc78b` failed in CI (exit 1, not killed).
No destination activation occurred. Keep that failure evidence. Diagnose the
same isolated frozen source and obtain a passing configured build before any
new platform activation. Build/deploy Servix through the actual Development UI,
record both component/test/preservation receipts and same-source verification,
then prepare the fresh exact Production review/backup and scoped decision.

The UI-created retry `pr_272d49cc8f8666c222ef25fef2c60239`, source
`e2db864d77aeda6b934957f3a89349d079582dc6`, native build
`cj_016e5a6322f8a04721aad7c3ee4fdf1c`, also failed CI without activation.
Direct reproduction with the installed native Node/pnpm and credential-free
environment isolated a test-fixture defect: the new lifecycle fixture derived
its target computer from `COMPUTERNAME`, which the builder intentionally strips.
The target JSON therefore lacked `computer` and strict native verification
rejected it. The fixture now obtains the real local hostname from the OS and
supplies that same identity explicitly to its simulated Windows boundary.
The unchanged lifecycle test then passes with that restricted environment
(49.69 seconds, exit 0). Production identity checks, assertions, coverage gates
and independent acceptance tests are unchanged; the builder whitelist remains
restricted. No customer source or runtime recipe changed for this correction.

The corrected-source attempt `pr_501ce21992e7f1ea57424ba3cc4cae9a`, source
`9785dc8442a1db67e0540a7d6bdf32a8dce4ed68`, native build
`cj_4d9468e43b4a4e15e0ade06cd2e69b31`, stopped before activation on another
existing native integration test. Its retained Vitest result identifies only
`test/environment-seal.test.ts` as failed, at 5,026.84 ms: the default five-second
deadline is too short for its real PowerShell ACL/encrypted-save operations
under concurrent CI load. The one native test now has a bounded 30-second
allowance, and each ACL subprocess a 15-second deadline. All assertions, pure
test deadlines and coverage gates remain unchanged. The full UI coverage suite
then passes in the installed native Node/pnpm/restricted environment: 93 tests,
100% scoped coverage, exit 0. Independent acceptance tests are unchanged.

The fourth UI request `pr_cb04963e4944410690fbbccb6234531c`, source
`b91f8423771a3f546445faa1b2c7b631270deaf9`, native build
`cj_cb5fd978d75ed933cc34baae585f163b`, failed local CI (exit 1, not killed,
AssertionError classification). Contracts coverage is 98.28% statements /
92.77% branches; UI coverage is 100%. Control-plane CI has not passed. Retained
Vitest metadata identifies six failing files: local-development-runtime,
connector-local-git, system-discovery-runtime, promotion-lifecycle,
system-enrollment-windows and promotion-environment. Several durations approach
native test deadlines; exact assertions must be reproduced before declaring a
fix. A separate restricted-environment recheck of promotion-environment exits 0
in 8.72 seconds. Do not weaken assertions or claim the six failures fixed.

At 23:26 IST, bounded probes to server20 HTTP/SMB and server21 API all timed out.
FortiClient was present but desktop interaction returned GetCursorPos access
denied, consistent with a locked desktop. The owner has a pending unlock/VPN
request. Local observation at 23:33 reports only 335 MB free physical memory
of 16,025 MB and CPU 81%; this can affect timing, but is not proof of the cause
of every assertion. No running Node process in these four failed frozen build
source folders was found. No unrelated application was stopped.

The first API observer could not establish its read-only session on the fourth
attempt; the accepted request/source were independently verified from the
controller's scoped component job files. The file observer's 30-minute deadline
expired and was resumed against the SAME request, without a new deployment.
While disconnected, the server's last recorded request may still say building;
reconcile the local failed receipt with that same request after reconnecting
before submitting another attempt. Do not replay a claimed activation.

Customer source remains clean at
`e04137b4a862e8760a59b95da7e0de9a32bc6d38` (23:34 observation). No new Servix
Development deployment, full-release manifest, fresh full-application Production
review/backup or Production activation exists for this follow-up. The preceding
backend-only Production success remains valid historical evidence. The latest
verified active platform is still the prior `a51e97c...` release; new source
publication alone is not activation.

No new Production application mutation has occurred. Customer runtime/library
versions and accepted dependency findings remain unchanged. No database
migration/restore, permission expansion, reboot test, notice or GitHub merge is
claimed. This continues the explicit Windows compatibility path; other project
adapters/platforms are not granted live acceptance by these fixtures.

The automatic approval review rejected cleanup of the owned temporary compiler
test directory with the reason "blocked by policy". The temporary directory is
retained; this does not block release execution or affect the customer checkout.

## Owner clarification during rollout

The owner subsequently confirmed the changes already appear on Development and
asked to assess their appearance on Production after activation. Under
[ADR 0068](adr/0068-existing-development-source-acceptance.md), do not wait for a
duplicate visual check of the same customer source. Verify the exact existing
source and all new build/artifact/health/preservation gates, then prepare the
fresh exact Production decision. The owner's Production functional check is
still separate and must not be claimed by this implementation session.

## Complete publication file inventory

At `c0471d297c398473d8dbf2f2fd10be5c754f2ea2`: 39 files changed,
2,834 insertions(+), 82 deletions(-), relative to the documented base.

- apps/control-center/src/ArtifactPromotionsPage.tsx
- apps/control-center/src/DeploymentSettingsPage.tsx
- apps/control-center/test/deployment-settings.test.tsx
- apps/control-center/test/environment-seal.test.ts
- apps/control-center/vite.config.ts
- apps/control-plane/src/artifact-promotions.ts
- apps/control-plane/src/main.ts
- apps/control-plane/src/servix-deployment.ts
- apps/control-plane/test/artifact-promotions.test.ts
- apps/control-plane/test/fixtures/PromotionLifecycle.ps1
- apps/control-plane/test/frontend-artifact.test.ts
- apps/control-plane/test/managed-runtime.test.ts
- apps/control-plane/test/promotion-lifecycle.test.ts
- apps/control-plane/test/servix-deployment.test.ts
- apps/control-plane/test/servix-execution.test.ts
- deployment/servix/Build-DevRelease.cjs
- deployment/servix/Build-Servix.ps1
- deployment/servix/FrontendArtifact.cjs
- deployment/servix/Invoke-DevRelease.ps1
- deployment/servix/Invoke-PromotionTarget.ps1
- deployment/servix/ManagedRuntime.cjs
- deployment/servix/PromotionFiles.cjs
- deployment/servix/PromotionProtocol.mjs
- deployment/servix/PromotionRegistry.json
- deployment/servix/PromotionWorker.psm1
- deployment/servix/PublishedRelease.cjs
- deployment/servix/ReleaseBuildProfile.json
- deployment/servix/Run-Activation.ps1
- deployment/servix/Test-BundledRelease.cjs
- docs/CURRENT_STATE.md
- docs/SERVIX_APPLICATION_RELEASE_HANDOFF.md
- docs/SERVIX_PRODUCTION_PROMOTION_HANDOFF.md
- docs/adr/0067-complete-application-release-promotion.md
- docs/adr/0068-existing-development-source-acceptance.md
- docs/adr/README.md
- package.json
- packages/contracts/src/artifact-promotions.ts
- packages/contracts/src/servix-deployment.ts
- packages/contracts/vitest.config.ts

## Resume boundary

Servix Production full application action pm_ddcdeda2c90cdc2888010328ec7a05d8
already succeeds natively under timely consumed owner approval. Independent
public static, API readiness and original attachment checks pass. Do NOT replay,
rollback, rebuild or ask for another approval for this completed action because
of historical checkpoint text. ADR 0069 is accepted for the owner's same-tree
Development observation; business UI checking after Production stays with them.

Follow ONLY current DevSetu completion-proof request
pr_19c91d349789793cb6152fe90b75c65f / source bdd3a56d through CI/package/Apply.
Then verify audited metadata reconciliation restores the existing Production
history and last-verified full-release identity. Retain original receipt,
consumed approval, result preimage and matching audit; no customer or database
mutation is part of that repair. Phase 4 exit remains open; this is not readiness
for a later roadmap phase.

Historical uncommitted checkpoint from b91f842: 2 documentation files, 107 additions and 9 removals (CURRENT_STATE.md and this handoff).

Post-publication evidence diff against 2977bbf: 2 documents, 151 additions/11 deletions.
Closing validation exits 0. All remaining changes are this handoff
and CURRENT_STATE.md; implementation source is already published and live.
