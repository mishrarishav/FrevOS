# Local development runtime handoff

Status: IN PROGRESS. Owner-requested development pilot, 2026-10-23.

Repository: `https://github.com/mishrarishav/FrevOS`.
Worktree: `D:\FREVOS\.local\worktrees\servix-dashboard`.
Branch: `feature/local-development-runtime`.
Base: `915173a272d67e08c59caf34ce2fd34785f616ce`.
First configured source publication: `e244205d7440f3a2a6783ce3af9f2ba44289c631`.
No GitHub publication, PR or merge. Final activation pending below.

First successful live activation: source
`81f8a5c6737574781942aeb90dc8733c82f68773`, request
`pr_f18ede416ab986d670f9b1f85dbc7f11`, manifest
`31a4cfec77af7aa7bd6178aa038147245aa3102d3894c8da2a1a0ef7ad54a8c4`.
Its isolated frozen install/full CI, immutable archive transfer and independent
server20 activation passed, with HTTP/UI 200, no database write and sibling IIS
preserved. Archive `ce93ec5c902387a37a6585041fd1f00a707ebe16c19bfc97d723b29a2870db70`,
78,249,560 bytes / 3746 files; saved reference
`f0aa25435e32ee9cdc50c2d1afea830123eb3dc666f9a4619b76247bdf863371`.
Exact packaged Windows Node 24.19.0/real PostgreSQL smoke passed, including
authenticated local-development composition and unauthenticated denial.

## Scope and authority

ADR 0053 records the owner-requested stack and bounded local runtime. Preserve the
preceding configured-component handoff/current-state working changes. The HRMS
desktop launcher is a reference, not an implementation target. Reuse existing
connector ownership, repository binding, workspace authorization and CSRF.

In scope: discovered npm development scripts and ASP.NET development servers,
revisioned service/port/local environment references, frontend-to-local-API
bindings, Start/Stop/Restart all or one service, preview, exact project-owned
existing-process stop and durable request/receipt recovery.

Out of scope: arbitrary commands/PIDs, unrelated process termination, customer
source edits, Production writes, migrations, credential creation/rotation,
GitHub publication/merge and general hostile-code sandbox/Phase 4 completion.

## Implementation

`/projects/local-development` uses the existing record workspace, cards/tables,
scoped session preferences and persistent dialog actions. The existing System
connector discovers safe service candidates and environment references. Requests
contain identifiers, revisions and observation fingerprints, not commands or
secret values. API intent and local claims/receipts are durable. Lost completion
reuses the receipt; an interrupted unreceipted claim is never blindly replayed.

Each Windows service controller enters its own kill-on-close, process/memory
limited job before starting application code. Its private input is separate from
the application's closed stdin. Controller/connector exit kills descendants;
reconnect never auto-starts services. Stop remains available if source validation
later fails. Existing listeners require fresh PID, creation identity and project
ownership; unprovable relative-terminal commands are not killable by port alone.

Environment contents are resolved locally without rewriting source settings.
Known Production target aliases are excluded from development choices; profile
contents contribute an opaque authenticated observation fingerprint. Frontends
receive public variables and local API binding. Node preview listeners bind
loopback, and outbound connections are limited to selected DB/local services.
Raw application output is discarded instead of leaking credentials or data.

Production mode requires verified read-only MySQL grants scoped to the selected
database, or a verified PostgreSQL read-only standby. Application-managed/.NET
Production access is blocked until an applicable verifier exists. Independent
hostile-code isolation is not claimed. Development remains source-computer bound;
preview URLs open on that computer, not another phone's localhost.

## Actual configuration discovered

Servix: `D:\servixDev`, backend `servix-backend` (MySQL) and frontend
`servix-frontend` (CRA). Existing backend `.env` and `.env.prd` point to the same
Production-labelled target `10.9.69.31 / servix_db`; the previously approved
server21 development target is `servix_db_dev`, not this database. The owner
supplied `D:\servixDev\backend\.env` as the profile reference on 2026-10-23.
Its actual read-only preflight returned
`local-development-production-readonly-required`: these credentials are writable.
Only `SHOW GRANTS FOR CURRENT_USER` was issued; no write probe, bootstrap or
customer backend was started. A separate existing development/read-only profile
is still required for actual backend previews. Backup/example files are excluded.

HRMS reference: existing Payroll UI/ESS Vite services and ASP.NET API were
discovered without changing its launcher/source/settings. Inherited Production
settings are classified as Production; test/library projects are excluded.

## Observed checks so far

- Initial full `pnpm.cmd run ci`: exit 0, `.local/local-dev-ci1.log`; 257 tests,
  unchanged coverage/build/high dependency gates. Subsequent changes require
  final validation before delivery. One low/two moderate advisories remain.
- Targeted durable state tests: 4 passed, `.local/local-dev-store-test2.log`.
- Real Windows runtime tests: 3 passed, `.local/local-dev-runtime-test3.log`.
  Later egress/environment changes are being verified separately.
- Updated real Windows runtime suite: 4 passed, exit 0,
  `.local/local-dev-runtime-test4.log`; includes credential-independent target
  alias and strict grant regression checks.
- Authenticated Chromium acceptance has passed actual npm/Vite startup,
  development MySQL writes against synthetic data, hot reload, local API binding,
  loopback, external integration denial, lost-ack reconciliation, individual
  service controls, real SELECT-only MySQL verification and write rejection,
  writable Production-labelled profile refusal, connector interruption cleanup
  and reconnect without replay. Final preference checks exposed an early user
  identity/loading race; controls now wait for the scoped identity and the
  workspace mounts with that scope. `node .local/local-dev-browser.mjs`, exit 0,
  `.local/local-dev-browser4.log` / `local-dev-browser-result.json`: all ten
  acceptance groups passed, zero unexpected browser/HTTP errors, zero external
  integration connections and zero synthetic Production writes. Responsive
  screenshots are retained at 1366/768/390 widths. Earlier locator and scoped
  preference failures remain in the preceding logs.
- `node .local/local-dev-dotnet.cjs`, exit 0, `.local/local-dev-dotnet3.log`:
  installed SDK 10.0.402 compiled/started a real ASP.NET fixture, returned the
  expected disabled migration/background-worker switches, and stopped cleanly.
  Initial NuGet restore failed because its clean environment lacked Windows
  standard program-data paths; the bounded path whitelist now includes them.
- PowerShell parsing (six files) and exact connector ZIP sidecar comparison (six
  files) passed, `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy
  RemoteSigned -File .local/Test-LocalDevBundle.ps1`, exit 0.
- First final CI attempt failed one pre-existing Git fixture assertion: its
  60-second request expired during concurrent browser/.NET/process acceptance,
  so it returned `invalid-source-request` before the expected default-branch
  rejection. Other 257 tests passed. No gate or test was weakened; rerun after
  those independent fixtures have finished.
- Final `pnpm.cmd run ci`, exit 0, `.local/local-dev-ci-final2.log`: 258 tests
  (80 contracts, 80 UI/API, 98 backend), repository/format/lint/types/build and
  high-severity dependency gates passed. Backend coverage: statements 95.17%,
  branches 90.92%, functions 98.48%, lines 96.34%; required UI/API coverage 100%.
  One low and two moderate dependency advisories remain. Final copy-only UI
  messages passed formatting; the subsequent isolated native build reruns full
  CI on the exact published source before activation.

## Review and delivery

Complete task file inventory: [changed files](LOCAL_DEVELOPMENT_CHANGED_FILES.md),
relative to the base above. Pre-publication stat: 33 files, 3903 additions and
49 deletions (documentation will grow with final receipts). Full diff and
untracked implementation were reviewed; `git diff --check` passed. Packaging
explicitly includes both new backend/contract modules and connector sidecars;
the native delta allowlist adds only the new local-development module. GitHub
publication/merge and customer Deploy/Rollback remain excluded.
- Initial process failures retained: `Console.ReadToEnd` was corrected to
  `Console.In.ReadToEnd`; Windows NODE_OPTIONS paths use forward slashes; npm
  startup blocked when application inherited the private control stdin, fixed by
  separate closed application stdin. Raw output was used only in a synthetic
  isolated debug fixture, never against customer application data.
- A targeted coverage-only invocation ran against repository-wide thresholds;
  its four tests passed but unrelated unexecuted files caused the aggregate gate
  to fail. Full CI subsequently passed; no threshold was changed.
- Docker Desktop was stopped and was started for isolated database acceptance.
  MySQL fixture image was resolved and pulled at immutable digest
  `sha256:76f0358884cb92d9a086d24e5671c38048d3fef40f2588703d73eb55392d6b69`.

Final commands, artifact/activation identities, file inventory/stat, known limits
and exact live readiness will be recorded after acceptance.

## Actual source connector and Servix browser acceptance

`Upgrade-LocalDevConnectors.ps1`, exit 0: both existing source connections were
upgraded from their recorded installed baselines, with unchanged DPAPI pairing
bytes, task definitions and Limited/Interactive identity. Six sidecars match the
sealed package. Both report fresh local-development observations; no new pairing
was created. The exact active package was also verified into the existing
enrolled native baseline cache for the final bounded UI correction.

`node .local/local-dev-live-servix.cjs`, exit 0:

- Saved actual Servix configuration through the UI: backend port 5000 / `dev`,
  MySQL, provided `.env` as Production reference; frontend port 3000 /
  `start:dev`, `.env.development`, API bound to local backend. Development backend
  profile remains unselected because both discovered files point at Production.
- Actual Production Start was rejected by grants inspection before application
  startup. The customer backend was never started and no customer DB write ran.
- Individually started the actual CRA frontend, verified Login and Login ID on
  `http://localhost:3000`, then stopped it through DevSetu. It is not left running.
- Source HEAD `58e9359012b2326f9c627379c865157ae18c3835`, all existing dirty and
  untracked customer work, five environment-file hashes, current deployment
  `sd_a78d33690ccdf8db2db2a54df6a29237` and deployment-settings revision 3 stayed
  unchanged. No customer Deploy/Rollback was submitted.
- Actual 1366/768/390 workspace, table/search persistence and mode controls
  passed, zero unexpected browser/HTTP errors; internal HTTP retained two
  recorded COOP policy warnings. Screenshots and result are under
  `.local/local-dev-live-servix-*`.

Final expanded `node .local/local-dev-browser.mjs`, exit 0,
`.local/local-dev-browser5.log`: all eleven synthetic acceptance groups passed.
The added real project-owned existing-process scenario verified Cancel submits
no action, exact identity stop succeeds, and an uncertain earlier action disables
the existing-process button. The last guard is a one-line UI correction; the
source-to-deploy pipeline will validate and activate that exact final source.

## Remaining boundaries

- Actual customer backend Development mode needs an existing local profile for
  `servix_db_dev`; Production preview needs separately verified read-only
  credentials. Creating/rotating credentials or customer DB writes is excluded.
- Source discovery covers the root and its immediate service folders, at most
  24 candidates / 12 configured services. Nested monorepo discovery is not
  enabled; the platform's own monorepo has no discovered local services here.
- Production MySQL read-only behavior has real positive and negative acceptance.
  PostgreSQL mode requires a read-only physical standby; its positive replica
  path was not exercised. Application-managed/.NET Production mode is blocked.
- Preview is loopback on the source computer. Raw customer logs are discarded.
  Node integrations are limited to selected DB/local ports; this is not an
  independent hostile-code sandbox. Arbitrary/native application integrations
  require an applicable isolation/verifier design before Production approval.
- An existing relative-terminal process whose project cannot be proved is not
  killable by port alone. Managed sessions and proved absolute script/project
  invocations support stop; unrelated listeners stay alive.
- Sessions stop on connector/controller exit, never auto-resume, and have an
  eight-hour bound. Durable action history has a 2000-record pilot capacity;
  archival and broader runtime/driver acceptance remain future work.
- CI passed with 48 non-failing lint warnings / 282 infos and the unchanged
  one-low/two-moderate dependency advisories. No threshold or required check was
  weakened. Phase 4 exit, independent QA and Production gates remain open.

## Retained first build and enrolled packaging correction

Actual dashboard request `pr_686738cf57e24c6cac57d3b65b4662a7` published the
source above. Review then found that the enrolled native builder executes its
installed packaging script, which still had the preceding module allowlist.
The implementation had updated source packaging but had not yet upgraded those
two enrolled scripts. The owned Limited builder task was deliberately stopped
before artifact publication/destination work. Active manifest stayed
`cd5f2076cbcfaa513309926f4aad80563ea3c2aa089bc1cd35b5f7578ee3382f`.

The existing builder's `New-ServixDashboardRelease.ps1` and `HttpCommon.ps1`
were compared with the preceding enrolled-toolchain receipt, backed up and
upgraded to reviewed source bytes. Pairing bytes and task identity stayed
unchanged. Restart reported the retained claim as `recovery-required` without
replaying it. The actual Close interrupted build popup was cancelled once
(zero submissions), then submitted with the inspection reason and owner task
reference. It marked only the interrupted build failed, retaining source and
evidence, with no artifact/destination or active-release change. Commands:
`Upgrade-LocalDevBuilderPackaging.ps1` and `node .local/local-dev-close-build.cjs`,
both exit 0. Receipts: `.local/local-dev-builder-packaging-upgrade.json` and
`.local/local-dev-build-closed-live.json`. A fresh request will rerun full CI;
the interrupted request will not be retried.
