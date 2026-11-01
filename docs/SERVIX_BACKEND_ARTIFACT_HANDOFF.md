# Servix backend artifact deployment and preservation

Date: 2026-10-25. ADR 0057; Phase 4 exit remains open.

Follow-up 2026-10-26: [fresh Production readiness](SERVIX_PRODUCTION_READINESS.md)
now verifies an encrypted database backup and matching-version isolated restore,
current preservation, task-policy evidence and Dev/Production dependency audits.
This supersedes the historical database-recovery gap below only for the bounded
rehearsal. Production activation/task registration remain unperformed.

Status: PASS for Development artifact build, activation and both recovery cycles.
The strengthened preservation guard is live and verified.
Production activation is BLOCKED on its separately scoped human approval and
runtime adoption; no Production deployment or database write is claimed.

## Repositories and scope

- Platform: `D:\FREVOS\.local\worktrees\servix-dashboard`, branch
  `feature/servix-build-artifact`, base
  `69dd69e12649d30e9c63a453cb526ea373b17a10`, published source
  `a9cdebbe7cc7085451405beae8152972fed3c66b`. Final result documentation may
  remain uncommitted after that source publication. No PR or merge was created.
- Customer: external `D:\servixDev`, branch
  `codex/servix-backend-artifact-source`, base
  `ada280e9f957a1c75e9f3a12b36b6a6504fb5ff0`, published source
  `e04137b4a862e8760a59b95da7e0de9a32bc6d38`. Compiler work and tests used an
  isolated external checkout before four build-only files reached this checkout.
- In scope: runnable backend compilation, actual DevSetu publication/build/
  Development activation, saved-artifact recovery, preservation verification and
  a concrete Production artifact/runtime proposal.
- Out of scope: weakening the old Production exclusion, unattended Production
  approval, dependency mass updates, customer feature edits, notices/email,
  unrelated Discovery work, roadmap exit or merging the implementation.

## Result and immutable identity

The real DevSetu build compiles 85 application modules and 23 runtime dependency
bindings into a 2,282,888-byte backend bundle. Target runtime dependencies remain
installed separately. Per-module paths, per-project dependency resolution,
environment and mutable data roots are retained. No backend source tree,
environment values, uploads or runtime dependency installation is deployed.
Existing destination source and unknown files remain in place. The new release
contains only the backend bundle and its descriptor for backend code.

- Bundle SHA256:
  `5ff7622a9f316edbe0485c47f179f6c1bccac75241e6540f1d0079b11172fb0c`.
- Backend descriptor SHA256:
  `8e525dab58dde2e560fbc2d7f18547a1d3c1e048204062e09c98c97b227eac96`.
- Development release manifest:
  `599a63262003575eee3a3bf42799cd7376ae05c3563cdffa8989c6af51e3d163`.
- Original actual UI deploy: `sd_2fba221e1855f7f17d9004617130ba12`.
- Actual UI source rollback: `sd_a238715b901b996e40eeabb4d2bfa30c`.
- Actual UI identical-bundle restore: `sd_9b2f6358cc7a00e4e25a93ced199261c`.

Each first-cycle action passed API/bootstrap health, anonymous browser load with
zero unexpected page errors, and three served attachment hashes against the
pre-deployment baseline. Rollback and restore used saved releases without new
Git publication or builds. Read-only process inspection confirmed the restored
Development process actually runs the selected bundle on port 5001.

## Issues corrected during actual use

1. Source dependency preparation reread all cached tarballs over SMB and exceeded
   Git's command budget. Availability lookup is now bounded; actual offline
   `npm ci` still verifies integrity and rejects corrupt cache content.
2. Frontend install exceeded ten minutes in the durable E: workspace. Extraction
   now uses LOCAL SERVICE's verified private C: scratch, with offline installs
   and a twenty-minute stage budget; durable evidence stays in the controller
   store. The observed successful install took eight minutes; backend install
   and compilation then completed. Failed workspaces remain retained.
3. A frozen CI Git fixture reused an expired request after real Git operations.
   The binding scenario now issues its own request, retaining explicit expiry
   rejection. Runtime authorization was not weakened.
4. PowerShell 5.1 named-property sorting collapsed hashtable inventory entries.
   An explicit path expression fixes deduplication. A real six-file fixture was
   observed failing before the fix and passing afterward, including modified
   and missing non-first files and duplicate selected folders.
5. The private audit bridge decoded UTF-8 snapshot filenames with the legacy
   default encoding. Verification now reads original snapshot bytes explicitly,
   proves the filename conversion against that retained snapshot and preserves
   every original recorded hash. No customer filename or file was changed.

## Preservation evidence

Independent read-only verification after the first cycle checked all 8,542
original files: 139 Development uploads, four Development database files,
8,176 Production uploads and 223 external blob files. Missing: zero; changed:
zero. Eleven environment hashes, both frontend web.config hashes and IIS
configuration match. Production PID 10760, its creation identity and existing
owner remain unchanged. The saved bundle is compatible with Production's
installed dependency versions without importing the app or connecting to its DB.

The original raw snapshot remains retained; its 17 non-ASCII filenames are
verified against the original UTF-8 bytes instead of silently rebaselining.
Initial live receipts reported only one protected inventory entry because of
the PowerShell defect; those receipts alone are insufficient preservation
evidence. The independent full baseline check and corrected live guard are the
required evidence. Final guard rollout/cycle results are recorded below.

## Validation and limitations

- `pnpm.cmd run ci`: exit 0, 287 tests, repository/format/lint/type/coverage/build
  gates pass; high audit gate passes with five low and six moderate advisories.
  The existing frontend chunk-size warning remains.
- `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File
  deployment\servix\Test-PersistentInventory.ps1`: exit 1 before the correction,
  exit 0 afterward; six files, changed/missing non-first denial and deduplication.
- Customer `node --test tests/buildRelease.test.js`: three compiler tests pass,
  including execution with original source folders moved away, dependency/path
  preservation, undeclared imports and retained prior output.
- Real UI publication/build/activation and saved-release recovery receipts are
  retained privately. Deployment actions used authenticated Playwright forms
  after the owner authorized screen-lock-independent operation; APIs monitor
  state. One-time launcher/cache setup used the existing scoped operator bridge.
- Private Production runtime fixture: exit 0; bundle boot, correct cwd/profile,
  same-owner entry and source recovery pass; environment/source drift denied;
  synthetic upload preserved. No real Production app or database was used.
- Existing customer runtime lock entries were not updated. The earlier customer
  audit has six moderate, 28 high and three critical advisories; this is an
  unresolved risk requiring explicit review, not a clean security-scan result.
- Production's existing source snapshot and installed dependencies are inspected
  read-only. DB backup/recovery and actual managed Production task registration
  have not been verified. Code rollback does not reverse database changes.
- A prepared Production profile is not a connected deployment adapter. The old
  adapter continues to exclude Production. No Production one-click acceptance
  is claimed.

## Production approval boundary

Prepare the identical backend bytes, pinned runtime/configuration, original
source recovery snapshot, task XML and selection records for review. Preserve
the existing account rather than switching Production to SYSTEM. The new task
credential binding, initial manual npm handoff, normal startup/database effects
and recovery scope require a fresh artifact/actor/workspace/action/target/
correlation/expiry-bound approval under AGENTS.md and SECURITY.md. No existing
manual process may be killed without verified ownership and approved handoff.
Frontend and IIS changes are outside this backend proposal.

Password task logon requires a credential at registration and supports execution
without an interactive session; registration and batch-logon rights still need
target verification. See [Microsoft task logon documentation](https://learn.microsoft.com/en-us/windows/win32/taskschd/principal-logontype)
and [task registration contract](https://learn.microsoft.com/en-us/windows/win32/api/taskschd/nf-taskschd-itaskfolder-registertaskdefinition).

## Final guard rollout, changed files and readiness

Platform source `a9cdebbe7cc7085451405beae8152972fed3c66b` is active as manifest
`9c31907f8bf77c8f19a33920a37c9fed8f88bf208a950f38d79b83674e92bb6b`.
Actual UI request `pr_3689116227498418bb2ebfcce03e5d38` passed frozen CI,
publication, independent activation, HTTP/UI health and sibling preservation.
Three profiles, two component configurations and 11 environment hashes match
the pre-rollout baseline; the active customer release was retained.

Final actual UI rollback `sd_34ea154e9b5fcc750eec9d774d6cb64f` and restore
`sd_4fa6678413b3b23b2ba677ad4b09f6e3` each checked all 145 distinct Development
protected files and passed health/browser/three-attachment verification. No
rebuild occurred. Final independent job `0c144bd831e248598b78a3bc988ebc79`
again checked all 8,542 original files: zero missing, zero changed; 11 environments,
both web.config files, IIS and the original Production process/owner match.

The original raw snapshot SHA256 is
`68b5e22b9ddc13fe822ba370408a90932e6070276e7fdc23a19b79b4f7c38746`.
All original recorded file hashes/lengths matched before resolving the 17 names
through the exact verified UTF-8/default-encoding conversion. This is a metadata
decoding correction, not a new baseline or a filesystem repair.

Production candidate `sp_6c3b764d29f94e12a25b09c23914cfdb`, plan SHA256
`702fdb16282862d107c9578e4a55da59daaf0a30e11a84f09569ac16829346d8`, is retained
privately under `.local/production-candidates/`. It includes the identical tested
backend bytes, pinned runtime/helper/configuration, atomic selection helper,
source recovery snapshot and task definition. Candidate generation verified the
83 previously recorded existing Production source hashes. Two new compiled
utility modules are absent from the old Production source; they are contained
in the bundle. The recovery snapshot covers all 85 current Production JS/JSON
source files, including its older extra modules.

Task Scheduler COM parsing passed with the existing owner SID, password logon,
least privilege, a boot trigger and the pinned action/configuration. No task was
registered or executed. The first private template draft was rejected for BSTR
encoding; its immutable candidate remains retained and superseded. This does
not establish target batch-logon rights, actual registration, DB recovery or
Production acceptance. The candidate is awaiting human approval, not an approved
Production release. The old Production adapter remains excluded.

Private command results after the final cycle: `Watch-ServixArtifact.cjs
restore-guard`, `Verify-ServixArtifactWeb.cjs restore-guard`,
`Run-ProductionReadiness.ps1 -DevelopmentRunLabel restore-guard`,
`Prepare-ProductionBackendCandidate.cjs deploy-scratch rollback-guard
restore-guard`, and `Test-ProductionTaskDefinition.ps1` all completed with exit 0.
Evidence files are retained in ignored `.local` storage; no credentials or
customer file contents are included here.

Complete platform changed-file list (23 files):

- `apps/control-plane/test/backend-artifact-runtime.test.ts`
- `apps/control-plane/test/backend-build-cache.test.ts`
- `apps/control-plane/test/connector-local-git.test.ts`
- `apps/control-plane/test/persistent-file-inventory.test.ts`
- `deployment/servix/BackendArtifact.cjs`
- `deployment/servix/BackendArtifactSelection.psm1`
- `deployment/servix/Build-DevRelease.cjs`
- `deployment/servix/Build-Servix.ps1`
- `deployment/servix/DeploymentFiles.psm1`
- `deployment/servix/Invoke-DevRelease.ps1`
- `deployment/servix/Invoke-DevTarget.ps1`
- `deployment/servix/Publish-GitDependencies.cjs`
- `deployment/servix/Run-Activation.ps1`
- `deployment/servix/Run-DevBackend.ps1`
- `deployment/servix/Test-BackendArtifactSelection.ps1`
- `deployment/servix/Test-BundledRelease.cjs`
- `deployment/servix/Test-PersistentInventory.ps1`
- `deployment/servix/Test-RetainedArtifactFiles.ps1`
- `docs/CURRENT_STATE.md`
- `docs/SERVIX_BACKEND_ARTIFACT_HANDOFF.md` (new final-result document)
- `docs/SYSTEM_FOLDER_WORKSPACE_HANDOFF.md`
- `docs/adr/0057-servix-backend-build-artifact.md`
- `docs/adr/README.md`

Tracked diff versus the stated base, observed with `git diff BASE --stat`:

```text
.../test/backend-artifact-runtime.test.ts          | 174 +++++++++++++
 .../control-plane/test/backend-build-cache.test.ts |  48 ++++
 .../control-plane/test/connector-local-git.test.ts |  12 +-
 .../test/persistent-file-inventory.test.ts         |  32 +++
 deployment/servix/BackendArtifact.cjs              | 271 +++++++++++++++++++++
 deployment/servix/BackendArtifactSelection.psm1    |  48 ++++
 deployment/servix/Build-DevRelease.cjs             |  43 +++-
 deployment/servix/Build-Servix.ps1                 |  29 ++-
 deployment/servix/DeploymentFiles.psm1             |  14 +-
 deployment/servix/Invoke-DevRelease.ps1            |  25 +-
 deployment/servix/Invoke-DevTarget.ps1             |   4 +-
 deployment/servix/Publish-GitDependencies.cjs      | 107 ++++----
 deployment/servix/Run-Activation.ps1               |   2 +-
 deployment/servix/Run-DevBackend.ps1               |  13 +-
 .../servix/Test-BackendArtifactSelection.ps1       |  28 +++
 deployment/servix/Test-BundledRelease.cjs          |  99 ++++++++
 deployment/servix/Test-PersistentInventory.ps1     |  30 +++
 deployment/servix/Test-RetainedArtifactFiles.ps1   |  27 ++
 docs/CURRENT_STATE.md                              |  87 ++++++-
 docs/SYSTEM_FOLDER_WORKSPACE_HANDOFF.md            |  70 +++++-
 docs/adr/0057-servix-backend-build-artifact.md     |  51 ++++
 docs/adr/README.md                                 |   4 +
 22 files changed, 1141 insertions(+), 77 deletions(-)
```

The new handoff adds 250 lines. Combined working-tree stat: 23 files changed, 1391 insertions, 77 deletions. The final Current State and handoff updates are uncommitted documentation; the deployed source remains the published SHA above.

Customer changed files: `backend/package.json`, `backend/package-lock.json`,
`backend/scripts/buildRelease.js`, `backend/tests/buildRelease.test.js`. Observed
customer diff stat: four files changed, 708 insertions, 71 deletions. Existing
runtime lock entries and business source are unchanged by this task.

The next bounded action is human review of this exact Production candidate,
its existing dependency advisories, DB startup/recovery implications and initial
same-owner runtime adoption. Production activation requires its valid scoped
approval and verified binding; the Development artifact task is complete.
