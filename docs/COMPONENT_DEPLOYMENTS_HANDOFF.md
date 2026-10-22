# Configured component deployment handoff

Status: IN PROGRESS. Owner-requested development pilot, 2026-10-23 IST.

Repository: `https://github.com/mishrarishav/FrevOS`.
Worktree: `D:\FREVOS\.local\worktrees\servix-dashboard`.
Branch: `feature/configured-component-deployments`.
Base: `bc4530746c01269b3795a25edad63efad9364b9f`.
The owner explicitly requested completion in goal mode with VPN access.
ADR [0049](adr/0049-configured-component-deployments.md) permits this bounded
stack over preceding uncommitted owner work. No GitHub push, PR or merge.

## Implemented behavior

Projects own revisioned components with an independent recipe, builder,
destination binding, dependencies and persistent paths. Source publication uses
an authenticated logical central repository ID and Git bundles. One publication
is shared by dependency-ordered component jobs. Configuration, source commit,
actor, change notes and destination enrollment are pinned; overlapping roots on
the same system and changed enrollments are rejected. Partial success is
reported honestly; dependent components stop after failure. Rollback uses saved
artifacts without publishing source or changing database data.

Source, build and destination setup reuse the System connector download.
`Setup.cmd` enrolls source; `Setup-Executor.cmd` enrolls a builder or destination.
Credentials are protected by DPAPI and worker jobs contain business data rather
than browser-supplied commands. Builders run without administrator elevation.
The native platform updater runs independently of the application it replaces.
The native builder runs frozen installation and full CI before packaging.
Servix's existing compatibility adapter and server21 Production exclusion remain.

## Observed validation before bootstrap

- `pnpm.cmd run ci`: exit 0, 245 tests (78 contracts, 79 UI/API, 88 backend),
  formatting, lint, type checks, coverage and application build.
- Backend coverage: statements 95.11%, branches 90.90%, functions 98.76%,
  lines 96.22%. UI API/experience/routing coverage: 100% on all required metrics.
- Dependency audit passes the unchanged high-severity gate; two moderate
  advisories remain. This is not a full repository security scan.
- Real Chromium/Playwright with real PostgreSQL, Git, npm and HTTP pull workers:
  source publication, split API/frontend deployment, A/B/repeated rollback,
  persistent `.env`/uploads/attachments, destination offline/restart, control-plane
  outage, source/builder-offline rollback, table filter persistence and responsive
  1366/768/390 layouts passed. No console, page or unexpected HTTP errors.
- Real failed-health activation restored the previous code; drift, foreign
  locks, traversal, archive aliases, protected content and control-file writes
  were rejected. Interrupted claimed work remains recovery-required.

Local evidence: `.local/component-final-ci3.log`,
`.local/component-browser-result.json`, `.local/component-browser-final.log`.

## Activated server20 bootstrap

Manifest: `0f9db4ff4a5d8a9766af19ee2967000b83b0b9158cfbf2a84becfe891b024a4a`.
ZIP SHA-256: `a61f48b8b68124d72b0941272e7005b3d13641934273f1827819fa6d46f4426b`.
Package: `.local/servix-release-bac9b88c732d4f8a95b9f1f52fbd3a33/package`.
Previous active manifest: `9f3ba5d706f53d3b143a765124320b36d3476721b3d71cfa4e5726c819b43252`.

Exact package/delta verification and the wrong-digest/migration-delta denials
passed. The packaged Windows Node 24.19.0 entry point passed isolated real-PG
smoke, authenticated component APIs, revision conflict and combined project-list
checks. All 85 source-inventory entries matched before staging; the source
secret-pattern check found no matches. The full preserved worktree inventory is
`.local/components-review.json` (149 files, +22,802/-199 at that observation;
includes earlier work and a pre-existing command scratch file).

An authenticated server20 Plan passed and its temporary task was removed. One
actual DevSetu maintenance popup submitted this exact candidate with the owner's
task reference. Apply and readback passed: HTTP health/UI 200, no database write,
and sibling IIS configuration preserved. The component screen is live.
Evidence: `.local/components-bootstrap-live.json`, the staged private operator
receipt under correlation `d4e3aa4da4204504a7a482e4d0a8dc90`, and
`.local/components-bootstrap-{plan,integrity2,smoke}.log`.

## Enrollment and HTTP correction

Source `fc_a36e424f5355a31a00946ce3983ed064`, unprivileged laptop builder
`ex_e7fa8000834184a9deae261525c62f5f`, and independent SYSTEM server20 destination
`ex_91ec09da1e90510d6e370dcd85a85864` are installed and online. Profile
`devsetu-platform` revision 2 pins them to logical repository
`gitrepo_403e3e5a3cdd9ef309eec087f8369c91`. All three connection tests pass.

Partial source installation was resumed only after exact package verification;
lost seed acknowledgement is recovered by authenticated readback without replay.
The real Playwright harness exercises that case. Native artifact transfer uses
the enrolled private store and small immutable reference under ADR 0050; shared
IIS upload limits were not raised.

The first live Deploy attempt exposed internal HTTP's unavailable
`crypto.randomUUID`; no run was submitted or source committed. The request ID
helper now uses `crypto.getRandomValues`. Full CI passed 246 tests, and real
Playwright passed with `randomUUID` explicitly unavailable. Exact packaged smoke,
delta and digest/migration denial checks passed. The correction is active through
the actual maintenance popup: manifest
`9a62b20e810803787baa23dc2702d5244e1c098ec69455f13b084655c15ca037`, ZIP
`db226d5aa084c2fee7c92080c3705de74abdf3f48331ae366cf8c16b355a69e1`.
Its source inventory verified 85 inputs; secret-pattern matches: zero.

The first submitted native source run `pr_5cce734168bc83b7b30aac5369320562`
failed before commit: Git rejects an explicit literal exclusion of an ignored
`.local` directory, even while staging other files. Publication now uses exact
glob character classes for protected paths. The real Git regression includes
an ignored `.local` directory and case-insensitive tracked protection. It passed;
the paired source worker was upgraded with task and credential bytes preserved.
The failed request is retained, and verification uses a fresh request ID.

## Remaining work and recovery context

Actual cross-server acceptance passed with a synthetic project: frontend on
`L-1770`, API under a scoped server20 ProgramData verification root with a pinned
Windows task and loopback health. A/B, component-only API rollback after a real
partial outcome, repeated whole-project A/B rollback with source/builder offline,
and synthetic environment/uploads/attachments preservation passed. The first
inspection needed byte-array decoding; replacing transient local enrollments also
required an explicit verified ownership-record handoff. The resulting partial run
was retained and recovered through component-only rollback. Verification tasks
were removed, connections revoked and the fixture project archived. Evidence:
`.local/component-crosshost-result.json`, `component-crosshost-recovery-final.log`.

Native request `pr_4d35e313e47557c6ae76c65a3a140486` published source
`945682f40f859778a62f0b33258bc7d29bfd6bc3`, then the Windows builder task exited
with `0xc000013a` while copying the baseline. The cause remains unproven.
The restarted worker correctly marked its retained claim recovery-required;
no output, destination job or activation existed. ADR 0051 adds bounded owner
closure and an enrolled, fully verified local baseline cache. Do not replay
that request. Finish with a fresh source request after closing it.

Enrollment and initial source binding are complete. Source-seed acknowledgement
loss must be resolved by authenticated readback, never by replaying the seed
mutation.

The existing paired enrollment is retained only in the opaque DPAPI reference
`.local/components-enrollment.dpapi`; do not print or copy its plaintext into
documentation, logs or model context. Nonsecret IDs and installation receipts
are written to `.local/components-local-enrollment.json` as steps finish.
The pre-existing root command scratch is retained and excluded locally from
source publication; its prior Git exclude file is backed up in `.local/`.

Perform actual dashboard-driven source deployments and saved-artifact rollback.
Record exact source commits,
artifacts, target receipts and preservation evidence. Re-run relevant CI and
Playwright after the enrollment corrections. The activated bootstrap is not
evidence of completed source-to-deploy or remote microservice acceptance.

Customer-specific remote configuration and the .NET recipe are not yet
accepted on real remote targets. Do not touch `D:\Servix` Production, run database
migrations, include unrelated worktrees or claim Phase 4 completion. This remains
the owner-authorized development pilot; broader isolation/Production gates stay
on the roadmap.
