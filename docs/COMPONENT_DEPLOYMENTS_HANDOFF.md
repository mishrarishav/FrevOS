# Configured component deployment handoff

Status: IN PROGRESS — native release A passed; release B and native rollback acceptance remain.
Owner-requested development pilot, 2026-10-23 IST. This does not complete Phase 4 or authorize Production.

## Delivery identity and scope

Repository: `https://github.com/mishrarishav/FrevOS`.
Worktree: `D:\FREVOS\.local\worktrees\servix-dashboard`.
Branch: `feature/configured-component-deployments`.
Base: `bc4530746c01269b3795a25edad63efad9364b9f`.
First successful native source: `5dbe2a323a013369c8039b7727c17a968f9c97b8`.
PR: none. No GitHub push or merge. Internal configured Git publication is performed by Deploy.
ADR 0049 permits the bounded stack over preceding owner work; ADRs 0050–0052 record native transport and recovery decisions.
The complete preserved branch inventory is [the changed-file list](COMPONENT_DEPLOYMENTS_CHANGED_FILES.md).

In scope: revisioned project components, independent source/build/destination enrollment, dependency-ordered deployment, honest partial outcomes, protected paths, saved-artifact rollback and DevSetu self-source deployment. Servix's fixed compatibility adapter remains.
Out of scope: server21 `D:\Servix` Production, database migrations, unrelated worktrees, GitHub publication/merge, broader sandbox and roadmap gates.

## Working behavior

Each component has its own recipe, build context/output, enrolled builder/destination binding, health check, optional browser application URL, dependencies and persistent paths. One authenticated source publication is shared by dependency-ordered jobs. Source commit, configuration revision, authenticated actor, change notes and target binding are pinned. Overlapping destination ownership and changed enrollments are rejected. A failure stops dependents while retaining independently successful components.

Source publication uses logical central repository identity and authenticated Git bundles. Deploy collects change/approval-reference text and automatically commits/publishes; there is no manual per-release add/commit/push. Rollback resolves saved immutable artifacts, creates no Git commit and preserves selected data. Source and builder can be offline during rollback. Presence comes from fresh authenticated observations; outage clears stale readiness.

`Setup.cmd` enrolls source. `Setup-Executor.cmd` enrolls an unprivileged builder or scoped destination. The download includes the complete native operator bundle. Credentials remain DPAPI protected. Native builder configuration includes the immutable baseline/cache, toolchain, private artifact store and short output directory. The server20 updater runs outside the application it replaces. Native ZIPs use the enrolled private store with a small digest-bound HTTP reference; shared IIS upload limits were not raised.

The owner's ongoing configuration-driven workflow is saved in `C:\Users\APPC0024\.codex\skills\devsetu-configured-deployment\SKILL.md`. UI follows the existing Frevo workspace components and design standard.

## Actual configured DevSetu

Profile `devsetu-platform`, revision 3, source folder is this worktree. Public application URL: `http://10.9.69.20/`.

- Source: `fc_a36e424f5355a31a00946ce3983ed064`.
- Logical repository: `gitrepo_403e3e5a3cdd9ef309eec087f8369c91`, remote `devsetu`, central branch `devsetu-dev`; original GitHub origin is preserved.
- Unprivileged laptop builder: `ex_e7fa8000834184a9deae261525c62f5f`.
- Independent SYSTEM server20 destination: `ex_91ec09da1e90510d6e370dcd85a85864`, binding `platform`, root `E:\FrevOS`.

Source/build/destination connection checks passed. Source, builder and destination were online for native acceptance. Actual UI configuration save verified the browser URL, revision and ready checks. Existing task/pairing was preserved during bounded worker upgrades; no credential values are included here.

## Observed validation

| Command or actual action | Observed result |
| --- | --- |
| `pnpm.cmd run ci` | Exit 0; final local run `.local/component-final-ci9.log`; 247 tests: 78 contracts, 79 UI/API, 90 backend. Formatting, lint, types, required coverage, build and high-severity dependency gate passed. |
| Backend coverage | Statements 95.13%, branches 90.98%, functions 98.58%, lines 96.22%; thresholds unchanged. |
| UI required API/experience/routing coverage | 100% on all required metrics. |
| `node .local/component-browser.mjs` | Exit 0, `.local/component-browser-recovery-final.log`: real PostgreSQL, Git, npm, HTTP workers and Chromium. Source/three workers, split API/frontend, A/B/repeated rollback, protected environment/uploads/attachments, offline/restart, outage, source/builder-offline rollback, table filter persistence and 1366/768/390 responsive checks passed. No console/page/unexpected HTTP errors. Internal HTTP was tested without `crypto.randomUUID`. |
| Cross-host live Playwright | `.local/component-crosshost-result.json`: laptop frontend plus server20 API with a pinned Windows runtime and actual loopback HTTP health. A/B, per-component partial recovery, repeated rollback and protected synthetic data passed. Source head was unchanged on rollback. |
| Cross-host cleanup | Scoped verification tasks removed, connections revoked, fixture project archived. Private synthetic files/receipts retained for review; customer folders were not used. |
| Packaged production-entry smoke | Exit 0 for exact native A, `.local/components-native-a5-smoke.log`: Windows Node 24.19.0, isolated real PostgreSQL and authenticated APIs. |
| Exact immutable package checks | Prepared bootstrap/corrections passed manifest/delta validation, wrong digest and migration-delta denials, operator syntax/reserved-name checks. Native builder and updater enforce exact manifest/source/ZIP digests. |
| Operator PowerShell parser + generated connector ZIP | Exit 0 after the final operator changes; all scripts parsed and required native sidecars were present. |
| Real failure/protection tests | Failed-health activation restored previous code; drift, links, traversal, aliases, control-file writes, foreign locks, ownership/revision conflicts and unauthorized/CSRF/cross-scope requests were rejected. |
| `git diff --check` | Exit 0. CRLF normalization warnings retained; no whitespace errors. |
| Source inventory / secret-pattern check | 85 runtime inputs verified before each prepared correction. Secret-pattern scans found no matches; this is not a full security scan. |

The dependency gate reports one low and two moderate advisories. No threshold was lowered. Independent `FrevOS-Acceptance` tests were not modified or claimed run.

## Native release A

Request: `pr_6ac242c17ab0df10b295148356004548`; source: `5dbe2a323a013369c8039b7727c17a968f9c97b8`.
Actual dashboard Deploy all completed source publication, isolated frozen installation, full CI, native package, immutable private publication and independent activation.

- Manifest: `d0eb1691c62fec887d5e901315c7f0011215ccae94d764c632eebf91af10773b`.
- ZIP: `0908f64bc793f179380ea867d08e9e2d7721bc978919e976b12e6dfcb40a4eb6`, 78,194,826 bytes.
- Pipeline reference: `7bae1e1462428ded9ed68e4eb6bace4cae8ad51a4bcd467fb75607512ce7c96d`.

ZIP, reference and manifest are different digests. Actual active readback matched this manifest. Evidence: `.local/components-native-a5-{request,result,verified,release}.json`, live screenshot/log and exact packaged smoke. Servix settings/current source/current request remained unchanged.

Prepared component bootstrap `0f9db4ff`, HTTP correction `9a62b20e` and build-resolution correction `a7b8f52e` were each separately tested and activated through the actual maintenance popup. Their receipts record health/UI 200, no operator database write and preserved sibling IIS. These prepared activations are distinct from the successful source pipeline above.

## Retained failures and recovery

- Internal HTTP lacked `crypto.randomUUID`; the initial button attempt submitted no run. The request ID helper now uses `crypto.getRandomValues`, with regression/browser coverage.
- `pr_5cce734168bc83b7b30aac5369320562` failed before commit because Git rejected a literal exclusion of ignored `.local`. Exact glob exclusions now preserve ignored and tracked protected paths; the real Git regression passed.
- `pr_4d35e313e47557c6ae76c65a3a140486` published `945682f4` but its Windows builder exited `0xc000013a` during VPN baseline copying. The cause remains unproven. Its claim had no output or destination job. Restart correctly retained recovery-required. The actual owner popup then closed only this build as failed with an actor/source-bound inspection record; cancel submitted nothing, and existing work was never replayed. A verified local baseline cache avoids repeated VPN file reads.
- `pr_1a9c64575f353a606f1b7ddd574ce597` committed `eb3e33d3`; central import timed out and the request failed without activation. Read-only checks and an isolated fetch passed. A fresh request subsequently published successfully. The transient timeout cause remains unproven.
- `pr_c009728270ec6388138baf512a1fb8bb` published `4fd344c0` and passed CI, then package copying failed MAX_PATH. A locally enrolled short output directory and full operator sidecars fixed that execution path. The manual diagnostic package was retained only for inspection; it was not substituted for the native pipeline artifact.
- Cross-host inspection initially received a byte array; the verifier decoded it. Replacing transient local verification connections also required an explicit checked ownership-record handoff. The real partial outcome was retained and recovered with component-only API rollback.
- One local browser refresh failed while another run rebuilt its served assets. A subsequent run with stable build outputs passed all checks; the failed log remains available.

## Preservation, limitations and next boundary

Servix remains at source `58e9359012b2326f9c627379c865157ae18c3835`, request `sd_a78d33690ccdf8db2db2a54df6a29237`, settings revision 3, destination server21 `D:\servixDev`. Its five configured protected paths remain selected. No Servix Deploy/Rollback request was submitted in this task. Server21 `D:\Servix` Production was excluded.

The synthetic cross-server acceptance establishes the npm-static/node-source path on the tested hosts. Customer-specific remote configuration, the .NET recipe and large generic HTTP artifacts are unverified. Moving an active destination to a new enrollment requires explicit verified ownership-state migration. Uncertain destination mutations still require operator recovery; the new closure only handles builds with no output/target job. Broader hostile-code sandbox, independent QA and Production gates remain on the roadmap.

Finish native release B and saved-artifact A/B rollback, record final active digest/source/receipts and diff stat, then mark this bounded pilot PASS. GitHub review/publication and any later roadmap phase remain separate actions requiring their own authorization.
