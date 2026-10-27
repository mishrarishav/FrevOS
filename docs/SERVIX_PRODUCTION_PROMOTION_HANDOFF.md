# Servix saved-backend Production promotion

Date: 2026-10-27 IST. Status: **PASS — live Production deployment verified**.
The bounded initial backend promotion is complete. Broader Phase 4 remains open.

## Final verified outcome

The owner-authorized backend deployment was executed through the actual visible
DevSetu Production promotion UI. Activation
`pm_9b481b3a94f1227d77373247b1d350db` succeeded at 19:13:42 IST, using fresh
review `pm_6ef8e1c91fe2ba73759fe0ff248dfab6` and the explicit same-scope human
confirmation. Source repository/worktree/branch and the complete 48-file inventory
are recorded below. Base is `5730940fe6c40cc3eb5002ef6beaa564c9571e5f`;
configured source publication produced commit
`a51e97c20dc27ce047cb54ef54a4ef343a5a5b22`. Two final handoff documents remain
uncommitted. No GitHub PR was created or merged for this task.

Final cumulative diff: 48 files changed, 5246 insertions(+), 48 deletions(-).

- Exact saved backend bundle:
  `5ff7622a9f316edbe0485c47f179f6c1bccac75241e6540f1d0079b11172fb0c`.
  Descriptor: `8e525dab58dde2e560fbc2d7f18547a1d3c1e048204062e09c98c97b227eac96`.
  Source: `e04137b4a862e8760a59b95da7e0de9a32bc6d38`; saved Development receipt
  `sd_4fa6678413b3b23b2ba677ad4b09f6e3`. Production did not rebuild the customer
  backend or install/update dependencies. Existing Node 20.11.1 is retained.
- Native result is `production-succeeded`, healthVerified=true,
  protectedFilesVerified=8587, runtimeTaskRegistered=true and
  batchLogonAssigned=false. The complete protected inventory is 2,015,258,428
  bytes, digest `a4779714032ec37a086d5162c92b5d21a96dd3a2a1518fee2667bc085b0999c5`.
  Environments, uploads, attachments, original/unknown files, external blobs,
  frontend and IIS configuration are preserved. Only new runtime/artifact data
  and the approved code-selection pointer were added.
- Independent target activation receipt confirms `mode=bundle`, new PID 18504,
  owner SID `S-1-5-21-3574902082-3763586531-1277087089-9176`, configuration
  `e621ae3b710745bedc8c87fa3a91434fe64d167983d207c8c86de216f723a831`, and
  databaseRestored=false. The current selection file SHA is
  `bd114fd468bc4b54734f8d875435ff7baec8e4466a9b7157551a69a437ae361d`,
  matching the receipt and exact descriptor above.
- Independent scheduled-task XML resolves the owner name EESL\APPC0024 to that
  same SID. The task is least privilege, password logon, working directory
  `D:\Servix\backend`, correct configuration hash and boot start after 30 seconds.
  The first independent check expected the XML to store a SID directly; Windows
  normalizes it to the account name. Resolving that name verifies the same SID;
  no runtime change was needed. An actual reboot was not performed.
- `node .local/Verify-ProductionAssets.cjs after`: exit 0, public TLS health OK,
  auth/full bootstrap ready and three original attachment samples match their
  original lengths/SHA256. The live public frontend redirects to its login page
  and renders correctly. No customer sign-in or authenticated business workflow
  was attempted.
- Matching backup
  `promotion-backup/pm_6ef8e1c91fe2ba73759fe0ff248dfab6`, SHA
  `bcaf96bcd603d95e8ec1498ef81269999f0ba568060240dc07a2ce25713b40c7`,
  is retained privately on server20. Full decrypt/decompress integrity and actual
  isolated MySQL 8.0.28 restore pass: 114 tables, one view, 213,131 rows. Full
  restored SQL SHA is
  `459c37cb4c2b147a53e0d2fc73e735d71448105d77917f04654f0f88a0011273`.
  Proof SHA `660501e4a98be10dec6082b5e189440a60ab9ff801f9d35d6aafb9d890e59d2f`
  is in the visible approval record. Owned temporary restore data/task were
  removed. The immutable preparation snapshot's earlier marker remains unchanged.

Validation: local complete CI exits 0 (361 tests, required coverage, build and
platform audit gate); actual configured CI also passed before native packaging.
Platform audit findings are 5 low/6 moderate, no high/critical. Customer backend
and QuerySafe findings remain unresolved by the owner's explicit direction;
their versions were not changed. Native parsing, approved-secret exclusion and
repository/diff checks pass. Exact commands/results and earlier bounded repairs
are retained in the chronological evidence below.

Important limits: no forced live rollback or Production database restore was
performed; the matching backup was restored only in isolation. Source-only code
recovery cannot undo normal startup/database changes. This is the configured
initial-adoption pilot, not general support for later managed Production
upgrades or rollback and not a Phase 4 exit claim. The original manual npm
process is replaced by the managed task; do not start another manual backend on
port 5000 alongside it. Use DevSetu `/projects/promotions` for this receipt;
the legacy generic Production destination card remains a separate capability.

Final evidence: `.local/production-promotion-live-pm_9b481b3a94f1227d77373247b1d350db.json`,
`.local/production-activation-receipt.json`,
`.local/production-managed-task-verification.json`,
`.local/production-selected-artifact-verification.json`,
`.local/production-assets-after.json`, the matching recovery proof, and screenshots
`servix-production-succeeded-20261027.png`,
`servix-production-health-preservation-20261027.png`,
`servix-production-public-login-20261027.png` under `.local/evidence/`.

## Chronological implementation and earlier observations

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

## Canonical runtime activation and private binding follow-up

The canonical correction's configured request
`pr_917aba694fc020c735c9cbecd6c6fc94` succeeded from source
`3bca2f97afe22274120e41fbf89aea7bc2929dd4`. Its actual package manifest is
`2417b37cd93b6b2eade79061842d86049695e4ffc08b09d3a1fe6bcc34e0ede8`, ZIP
`e6c7f430cc2fb0138fa08908f6579597bf19211bac88a2363e8114a4f9066436`, reference
`e42be3741de261f12a1127837f6d10a72dafec5e1f83e97dd319998409543566`.
Independent Plan/Apply `cc5669acf9eb292754f5f9f5c66e9944` report PASS,
HTTP/UI 200, no operator database write and sibling IIS preservation. Native
coverage remains 95.23/91.59/96.60/96.71; all 358 tests and the unchanged audit
gate passed before packaging.

Earlier configured runs `pr_0b0016b68deff372970d01376b40911c` and
`pr_43873bad103fd5b95c913753689ebcb4` failed before activation. The first cached
test result identifies a timeout in the unchanged interactive Windows enrollment
fixture. Its exact synthetic loopback identity was verified and cleaned up.
Full frozen-source CI and a separate exact enrolled Node/minimal-environment CI
both passed (exit 0), then a scoped idle builder restart preserved its task,
adapter and DPAPI bytes. The fresh configured run above passed. Do not claim a
fully established cause for the earlier intermittent worker failures.

The actual isolated read-only canonical observation reports PID 10760,
`EESL\APPC0024`, Node 20.11.1, 8,572 protected files and existing batch-logon
readiness. Three original Production upload samples served over verified TLS
match their old baseline hashes. The customer checkout remains clean at
`e04137b4a862e8760a59b95da7e0de9a32bc6d38`.

Preparation `pm_430c1fb0df00a6a011c9a03e7ea67b9a` passed observation but the
official archive download raised a WebException. Its HTTP status was not
observed. A bounded cache action imported the previously verified official
222,021,254-byte archive with configured SHA
`cb207afb33e2bbfe9535ba78fa9a1a3cccd11156f73864a5db0be8dcc2dbb1bc`.
The active worker verified all four required files and actual MySQL 8.0.28
loading; application dependencies were unchanged. Interrupted download bytes
were retained. The temporary maintenance task was removed after identity check.

Preparation `pm_f99f5c7b32585b2e951752bcc114a89b` passed those prerequisites,
then failed before backup/cutover with `Private database binding unavailable`.
Replace inline JavaScript with `Read-PromotionEnvironment.cjs`, pin its hash
before remote invocation, and recheck the observed environment hash inside it.
Its private output is ASCII JSON, preserving Unicode through PowerShell 5.1's
console code page. The controller also escapes private JSON input before the
existing bounded backup wrapper. Private JSON uses the .NET serializer directly
so plaintext values are not passed as JSON cmdlet parameter bindings. Values remain within the authenticated private
PSRP/stdin execution boundary and are never included in reports.

`pnpm.cmd exec vitest run test/promotion-environment.test.ts test/promotion-files.test.ts`
exits 0: four tests pass, including the real PowerShell 5.1 file invocation,
private Unicode/quote/space preservation through the actual backup wrapper,
drift denial with empty failed stdout, and canonical junction/retention checks.
The initial regression correctly caught OEM decoding drift before ASCII JSON
escaping was added. Actual server21 read-only execution of the new helper also
passes: environment hash unchanged, required fields available, PSCredential
transport rehydrated, no credential values reported or database writes.
The file-helper correction still requires the configured full CI and platform
publication before another actual Production preparation.

Configured request `pr_57b713e09f45a197a95fc7f32bb3bc0e` published
`d206a90691d4794ad777542411a44fef043fc140` but failed before activation. The
cached failed file is the unchanged `device-enrollment.test.ts` (6.59 seconds);
the new private-environment test passes. Running that same failed file alone in
its frozen checkout exits 0 (one test). Native worker output does not establish
the exact assertion failure. Change only Windows backend file concurrency from
two to one to reduce shared Task Scheduler/CIM pressure; retain every test,
assertion, per-test timeout, coverage threshold and security gate. This is a
runner-resource mitigation, not a claim that the underlying intermittency has
been fully diagnosed. A fresh full configured run is still required.

## Fixed private wire schema

The serial configured request `pr_75dfac707e77900bd3b61db2e2b5ea01` succeeded
from source `6e4478604805a196556c70f81e281f873b2fcb70`. The 3,966-file package
manifest is `bb0a2d8e09a55f3f45819d627da4d2f5f3eec9de3cc5b80ea5b851c01f8e0d57`,
ZIP `cc449df76e8976efd906c7971ad916f7de640469a121db14d34b8ea097450aba`, reference
`896b051395c7f0e54a40b477620575dffcb509b2f39593459a9442c5171efe68`.
Independent Apply `9a3e4ffd01a63c365e3ead0b8c6626c8` reports PASS, HTTP/UI 200,
no operator database write and sibling IIS preservation. Full configured CI
passed; observed native coverage is 95.23/91.63/96.60/96.71.

Preparation `pm_0f3777dd9d4ad2996a3aaf1f2e5ab056` passed observation and private
binding, then failed before backup in the private serializer (worker line 162,
MethodInvocationException/InvalidOperationException). The earlier regression
covered private values but omitted the complete path/hash/client payload. A
fixed native DTO now accepts only the existing known string/integer wire fields;
PowerShell provider/PSObject metadata is not reflected. The expanded actual
PowerShell regression uses the complete metadata and real bounded wrapper,
preserving private quote/Unicode values and all integrity denials.

A bounded read-only server20/server21 diagnostic used the actual PSRP credential,
cached client metadata, backup directory and scope hash with the pending DTO.
It reports PASS, full private payload shape verified, unchanged environment and
no credential values reported, database writes or application changes. Its
temporary task was removed. This fixes an implementation defect; the accepted
private transport/approval policy is unchanged. Publish the correction before
repeating the actual Production preparation.

Worker progress now names private binding and payload encoding separately.
Failure results retain only an allowlisted last stage (bounded read of the
worker-owned progress record); raw diagnostics and private values stay out of
the public result. Scope/approval/claim/recovery behavior is unchanged.

Evidence includes `.local/production-canonical-platform-{run,native-receipt,apply}.json`,
`.local/production-canonical-ci.log`, `.local/production-exact-native-ci-result.json`,
`.local/production-builder-restart.json`, `.local/production-assets-before.json`,
and the scoped cache/private-binding diagnostic receipts. Production cutover,
its fresh backup and final preservation/health are still pending.

## Live preparation and exact review, 2026-10-27

**Actual execution accepted at 19:10 IST.** Fresh review
`pm_6ef8e1c91fe2ba73759fe0ff248dfab6`, SHA
`893b8daffcaf68b8a273212b93b75adf30f1de6133500e3805fe0b875cef0d70`,
was compared to the prior approved business scope: workspace, actor, profile and
revision, target digest, saved Development receipt, complete artifact identity,
original process/owner/Node and batch-logon readiness all match; the complete
protected inventory also remains the same 8,587 files/digest. It expires at
19:15:19 IST and was approved through the actual UI before that deadline.

Its 443,471,394-byte fresh encrypted backup SHA is
`bcaf96bcd603d95e8ec1498ef81269999f0ba568060240dc07a2ce25713b40c7`.
The same bounded native restore diagnostic passes at 19:09:25 IST: MySQL 8.0.28,
114 tables, one view, 213,131 restored rows, full raw SQL digest
`459c37cb4c2b147a53e0d2fc73e735d71448105d77917f04654f0f88a0011273`,
and complete owned data/task cleanup. Recovery proof SHA is
`660501e4a98be10dec6082b5e189440a60ab9ff801f9d35d6aafb9d890e59d2f`.
The fresh backup and later diagnostic proof are explicitly in the visible change
record; the immutable preparation snapshot's older marker is not edited.

The owner's explicit answer to `call_633a92f4a6184a489444f240c2817e39` was recorded
as the approval reference; five acknowledgments were checked through the UI.
Batch-logon assignment remains false because it is already ready. Accepted
activation ID is `pm_9b481b3a94f1227d77373247b1d350db`, bound to that fresh review.
At the latest observation it is working in the owner-adoption/promotion stage;
no success claim is made yet. Monitor that exact request rather than resubmitting.
Final health, managed listener/task identity and protected-file proof remain
required. Supporting local records use the same promotion ID suffixes; public
health/full readiness and three original attachments pass just before activation
at 19:09:58 IST.

Execution resumed at 18:55 IST after the owner's explicit answer, "हाँ, इसी
exact scope में deploy करो", to confirmation
`call_633a92f4a6184a489444f240c2817e39`. This authorizes the described same-owner
least-privilege boot task credential binding, target, saved artifact, brief API
interruption and normal startup/background effects with retained risks. The old
review is expired and is not reused. Fresh visible preparation
`pm_6ef8e1c91fe2ba73759fe0ff248dfab6` is running. Verify the same business scope
and fresh exact review before activation; repeat recovery verification for the
new backup. Original public attachment bytes and full health pass again at
18:56 IST. No Production cutover has yet occurred.

Status: **BLOCKED on required action-time task-binding confirmation; preparation
and recovery validation PASS**. The owner reconnected VPN; both servers are
reachable on HTTP/SMB. The actual visible DevSetu pipeline
`pr_7a6a6e4b7a8b7dc75cf37a6d3260a9b2` published source
`a51e97c20dc27ce047cb54ef54a4ef343a5a5b22` and succeeded. Full configured CI
resolved successfully before packaging. The 3,966-file platform package has
manifest `a4c5e8ab2a0f7c97f1762455e5e6c67c68d21ac652754e19300d3d5ef48bd461`,
ZIP `987d98de8353fa23b90e1ee7fd185cc46cd57c8b733bcd1fadf4614fb15c6467`,
component reference `3bf4f41b371364df4a6991915c21aa53f2f1a5bf2e09a41e61e4812b1ecec772`.
Native Apply `cj_450c0d18aa59db3ad74a79d049ac3c86` reports PASS, UI HTTP 200,
databaseWritten=false; active manifest independently matches. This resolves the
earlier DTO publication and native diagnostic blockers.

Through the live visible Production page, preparation
`pm_3cac9475b29bbc1974578dc68ccec70e` reached `prepared`. Its original process
is still PID 10760 / EESL\APPC0024 / Node 20.11.1; batch logon is already ready
and the proposed task does not yet exist. Protection records 8,587 files,
2,015,258,428 bytes, digest
`a4779714032ec37a086d5162c92b5d21a96dd3a2a1518fee2667bc085b0999c5`.
The saved backend bundle/descriptor/source remain exactly the earlier approved
Development bytes; no customer rebuild or dependency install was performed.

Fresh backup `promotion-backup/pm_3cac9475b29bbc1974578dc68ccec70e` was captured
at 18:34:04 IST, 443,471,538 encrypted bytes, SHA
`b26b2eb70ab24a7d7032bdb343f27520071b73353d21c17e1b50cbd2650abc22`.
Full-stream decrypt/decompress integrity passes. A separate bounded native
operator diagnostic then restores this exact SYSTEM-DPAPI backup into an
isolated loopback-only MySQL 8.0.28 instance on server20. It pins the official
cached archive and active sealed helper, enforces a 1 GiB/16-process job limit,
disables events, external file operations, binary logs and query logging, and
uses only an ephemeral private local database credential. No Production database
connection is used by this restore diagnostic. Whole restored SQL SHA is
`b4023f124b560a2f38a8e075f9c6f5c4abd1d74efe89a5a5c704c4e9d0024255`;
114 tables and one view match source backup metadata, and 213,131 restored rows
are counted. Owned temporary database data and the scoped temporary task are
removed. Application startup against this restored DB is not tested.

Recovery proof SHA is
`3db01e6bc90bce4d9cd905f4e04bf507bda0c9d3121d5918e56f0398ef9a463f`.
The immutable preparation snapshot still says isolatedRestoreTested=false because
it was created before this separate diagnostic; it is not rewritten or presented
as worker-recorded evidence. The later proof and exact same backup SHA are
explicitly included in the visible change description.

Exact review SHA is
`a61ff61beab0709b65a6da8deae7acbb950f51dca684d94092173ad9828bfd1d`,
expiring at 18:49:04 IST. At the concrete final step, the owner was asked for
action-time confirmation of the new same-owner least-privilege boot task's
persistent credential binding, brief API interruption, normal startup/bootstrap
database effects, retained risk and source-only code recovery. No approval
checkbox, Production task registration or process stop has yet occurred.
The public TLS health/full readiness and three original attachment bytes pass
again at 18:44:41 IST. If the review expires, prepare and verify a fresh review
before any approval; never edit the sealed review or consume an expired one.

Evidence: `.local/production-dto-platform-{native-receipt,apply}.json`,
`.local/production-promotion-live-pm_3cac9475b29bbc1974578dc68ccec70e.json`,
`.local/production-prepared-recovery-pm_3cac9475b29bbc1974578dc68ccec70e.json`,
`.local/production-prepared-recovery-proof-pm_3cac9475b29bbc1974578dc68ccec70e.json`,
`.local/production-assets-before.json`, and the two exact-review screenshots.
All actual pipeline/observation/recovery commands exit 0. Operator source parser
and approved-secret exclusion checks pass. The customer application, persistent
files, dependencies, environments, frontend/IIS and Production database have not
been changed by this preparation/restore testing.

At 18:51 IST, a fresh authenticated GET confirms this review expired at
18:49:04 IST, the worker remains online, and all five history jobs still have no
approval; there is no activation job. The required task-binding confirmation
remains unanswered. Keep the same goal pending and preserve this backup/recovery
evidence. When the owner is available, create a fresh review rather than editing
or approving the expired one. Avoid repeatedly creating unused backups while
waiting for human confirmation.

## Complete changed-file inventory

Additional local follow-up on 2026-10-27: the configured DTO build
`pr_7346423a9ed268e889ae2012ab0814b4` failed before activation. Its frozen cache
reports `apps/control-center/test/environment-seal.test.ts` failed. Isolated
execution exits 1 because Windows PowerShell cannot load its Security module;
pinning its own module directory makes the identical two tests pass (exit 0).
The exact original configured failure output was discarded, so this does not
establish its complete cause. Pin Windows 5.1 modules for the enrolled native
build environment and retain bounded safe failure metadata for further evidence.
The record contains only fixed phase, numeric exit code, killed flag, byte count,
allowlisted error classes and bounded source locations. It excludes raw output,
messages and command lines; write failure leaves the original denial unchanged.
The five executor tests pass, including a synthetic private-value exclusion test.

Latest follow-up status: **BLOCKED on network; local validation PASS**. Repository
`D:\FREVOS\.local\worktrees\servix-dashboard`, branch
`codex/servix-production-readiness`, base
`5730940fe6c40cc3eb5002ef6beaa564c9571e5f`, current published HEAD
`51eb92751058383186dfc4800c46bff98aa37135`, four local changed files. No PR was
created and no default-branch push or merge was performed for this follow-up.

- `pnpm.cmd run ci` with Windows 5.1 module path: exit 0, repository validation,
  format/lint/typecheck, 361 tests (88 contracts, 92 UI, 181 control-plane), build
  and audit gate pass. Control-plane coverage is 95.23/91.56/96.60/96.71; required
  UI coverage is 100%. Platform audit has 5 low/6 moderate findings, no high or
  critical. Existing customer advisories/dependency versions remain unchanged.
- The first local CI found a new test's TypeScript index-signature error;
  bracket access fixes it and the complete rerun above passes. No assertion,
  timeout, coverage or security gate was bypassed.
- `node .local/Review-PromotionDiff.cjs`: exit 0, approved private values absent
  from all four changed files. `git diff --check`: exit 0. Repository validation
  passes with 102 Markdown files. Complete 48-file base-to-worktree inventory
  follows; exact final stat is recorded in the local validation receipt.
- Identity-verified idle builder maintenance: exit 0, correlation
  `98b1e173d0254e79b3c210044a66da21`, executor
  `ex_e7fa8000834184a9deae261525c62f5f`, adapter SHA
  `5767fc7f0299c24217f1a5fdea3737e958c1902f06e0c4e357db9639fc624e3a`.
  Only its adapter and corresponding encrypted enrollment hash changed. Exact
  task definition, existing credential value/scope and permissions are unchanged.
  Before-files and a flushed, scoped intent are retained. An initial conservative
  idle check rejected the owned Windows console host without stopping the task;
  replacement attempts then failed safely and restored the prior enrollment.
  Using explicit retained backup paths for Windows atomic replacement succeeds.
- At 17:52 IST on 2026-10-27, concurrent TCP checks of ports 80/445/5985 on both
  server20 and server21 all time out. The visible UI reports connection unavailable
  and source system offline. Screenshot and local CI log are retained under
  `.local/evidence/devsetu-production-network-blocked-20261027.png` and
  `.local/production-builder-diagnostics-ci.log`.

Actual configured publication, fresh Production backup/review, task credential
binding, cutover and final live health/preservation are still pending. The active
server20 manifest remains `bb0a2d8e09a55f3f45819d627da4d2f5f3eec9de3cc5b80ea5b851c01f8e0d57`;
the DTO correction has not reached it. No Production process stop or environment,
upload, attachment, frontend/IIS or application database write was performed.
Resume this same bounded promotion after connectivity returns; this is not
readiness for a later roadmap phase.

Resume at 18:05 IST on 2026-10-27: the owner reconnected VPN; HTTP/SMB checks on
both servers now pass and authenticated platform builder/destination observations
are fresh. Continue the actual configured publication of the tested DTO and
builder diagnostics corrections before a new Production preparation. No new
Production approval, task binding or cutover is implied by reconnecting VPN.

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
- `apps/control-plane/test/component-executor.test.ts`
- `apps/control-plane/test/postgres-service.integration.test.ts`
- `apps/control-plane/test/promotion-files.test.ts`
- `apps/control-plane/test/promotion-environment.test.ts`
- `apps/control-plane/vitest.config.ts`
- `deployment/server20/HttpCommon.ps1`
- `deployment/server20/New-ServixDashboardRelease.ps1`
- `deployment/servix/BatchLogon.psm1`
- `deployment/servix/Invoke-PromotionTarget.ps1`
- `deployment/servix/ModelSecret.ps1`
- `deployment/servix/NativePlatform.cjs`
- `deployment/servix/ProductionBackendRuntime.cjs`
- `deployment/servix/PromotionBackup.cjs`
- `deployment/servix/PromotionConnections.json`
- `deployment/servix/PromotionFiles.cjs`
- `deployment/servix/PromotionProtocol.mjs`
- `deployment/servix/PromotionRegistry.json`
- `deployment/servix/PromotionTools.json`
- `deployment/servix/PromotionWorker.psm1`
- `deployment/servix/Protect-PromotionBackup.ps1`
- `deployment/servix/Read-PromotionEnvironment.cjs`
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
