# Configured component deployment handoff

Status: PASS — bounded configured-deployment development pilot, including final live source-selector correction.
Owner-requested development pilot, 2026-10-23 IST. This does not complete Phase 4 or authorize Production.

## Delivery identity and scope

Repository: `https://github.com/mishrarishav/FrevOS`.
Worktree: `D:\FREVOS\.local\worktrees\servix-dashboard`.
Branch: `feature/configured-component-deployments`.
Base: `bc4530746c01269b3795a25edad63efad9364b9f`.
First successful native source: `5dbe2a323a013369c8039b7727c17a968f9c97b8`.
Resulting deployed source commit: `915173a272d67e08c59caf34ce2fd34785f616ce`.
Complete branch diff stat: 155 files, +23753/-199 against the base (includes the preserved owner stack and final working-tree documents).
Native B source: `b77eb777990fdefd82e54b741d7f5a1c2a67e3a3`.
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
| `pnpm.cmd run ci` | Exit 0; final local run `.local/component-final-ci12.log` (direct cmd process exit 0); 247 tests: 78 contracts, 79 UI/API, 90 backend. Formatting, lint, types, required coverage, build and high-severity dependency gate passed. |
| Backend coverage | Statements 95.13%, branches 90.98%, functions 98.58%, lines 96.22%; thresholds unchanged. |
| UI required API/experience/routing coverage | 100% on all required metrics. |
| `node .local/component-browser.mjs` | Exit 0, `.local/component-browser-source-ui.log`: real PostgreSQL, Git, npm, HTTP workers and Chromium. Source/three workers, split API/frontend, A/B/repeated rollback, protected environment/uploads/attachments, offline/restart, outage, source/builder-offline rollback, table filter persistence and 1366/768/390 responsive checks passed. No console/page/unexpected HTTP errors. Internal HTTP was tested without `crypto.randomUUID`. |
| Cross-host live Playwright | `.local/component-crosshost-result.json`: laptop frontend plus server20 API with a pinned Windows runtime and actual loopback HTTP health. A/B, per-component partial recovery, repeated rollback and protected synthetic data passed. Source head was unchanged on rollback. |
| Cross-host cleanup | Scoped verification tasks removed, connections revoked, fixture project archived. Private synthetic files/receipts retained for review; customer folders were not used. |
| Packaged production-entry smoke | Exit 0 for exact native A, B and final UI release, `.local/components-native-{a5,b2,ui-source}-smoke.log`: Windows Node 24.19.0, isolated real PostgreSQL and authenticated APIs. |
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

ZIP, reference and manifest are different digests. Actual active readback matched this manifest. The independent Apply receipt reports HTTP/UI 200, no operator database write and sibling IIS preserved. Evidence: `.local/components-native-a5-{request,result,verified,release,operator}.json`, live screenshot/log and exact packaged smoke. Servix settings/current source/current request remained unchanged.

Prepared component bootstrap `0f9db4ff`, HTTP correction `9a62b20e` and build-resolution correction `a7b8f52e` were each separately tested and activated through the actual maintenance popup. Their receipts record health/UI 200, no operator database write and preserved sibling IIS. These prepared activations are distinct from the successful source pipeline above.

## Native release B and saved-artifact rollback

B request `pr_314071e668e8c4c5a44bf8477957cef7` completed the same actual source-to-deploy pipeline, including full CI. Exact packaged production-entry smoke passed (`.local/components-native-b2-smoke.log`).

- Manifest: `793a24bead1efe24c085bbef8eb045dd298dbfd1b17d0c412363d68d2c08708f`.
- ZIP: `bdbf70d73972ca88ef44e787fbac6c1028b1abdc594101ec3ba178ab0367e14a`, 78,194,862 bytes.
- Pipeline reference: `15b653846a18c3275865f4a21106b8249e66bd206683c8ac6bd66ef048c31760`.

Actual dashboard rollback requests `pr_a1efec69e29c2feb31bfee9e467fafac` (A) and `pr_3244cd1c348669e9e638d4a0630e5593` (B) each restored the exact original saved ZIP/reference/manifest without rebuilding or changing source. Both independent native Apply receipts report PASS, HTTP/UI 200, no operator database write and preserved sibling IIS. Final readback found three ready connections, no unresolved work, enabled actions and no unexpected browser errors at 1366/768/390 widths. Chromium emitted its expected ignored COOP-header warning for the approved internal HTTP origin; the verifier records it separately without weakening headers.

The owner then identified inconsistent source-control presentation in the two project cards. A shared labeled source selector now renders the saved connector name and fresh Online/Offline state with the same styling on configured and legacy cards. Connector names, identity filtering and action guards remain intact. The fresh source pipeline and final live responsive verification below passed.

## Final live source-selector correction

Actual dashboard Deploy all request `pr_8bd226759891b891e11c7d5cf50c302b` published `915173a272d67e08c59caf34ce2fd34785f616ce`, passed isolated frozen installation/full CI, built the immutable package and activated it independently on server20.

- Active manifest: `cd5f2076cbcfaa513309926f4aad80563ea3c2aa089bc1cd35b5f7578ee3382f`.
- ZIP: `99f32b9dffb0a66df997547a49a1315ef8f1ea38673c3cabfb44d62752ecceca`, 78,194,845 bytes.
- Pipeline reference: `4a5336e312ab233fdb203ebfc9ec90056359bb2b1749ceef5fbb4ffc00c5ab37`.

`node .local/component-live-action.cjs deploy native-ui-source`, `node .local/component-native-receipts.cjs native-ui-source`, `node .local/component-copy-native-release.cjs native-ui-source`, `node .local/Test-ComponentsArtifact.mjs .local/components-native-ui-source-release.json final` and `node .local/component-final-readback.cjs` each exited 0. Independent Apply: PASS, HTTP/UI 200, no operator database write, sibling IIS preserved. Exact packaged Windows Node/real-PG smoke passed.

Final Playwright asserted both cards use the same labeled source selector, retain their correct connector IDs and show selected name plus Online; both System online badges remained visible. Desktop/tablet/mobile widths 1366/768/390 passed with no page overflow, page errors, failed HTTP responses or unexpected console errors. The expected internal-HTTP COOP policy warning is retained separately. Evidence: `.local/components-final-readback.json`, `.local/components-final-{live,servix}-{1366,768,390}.png`, `.local/components-native-ui-source-{request,result,verified,release,operator}.json` and corresponding logs. Native B's earlier source-unchanged rollback proof is retained separately in `.local/components-native-b-final-readback.json`.

## Retained failures and recovery

- Internal HTTP lacked `crypto.randomUUID`; the initial button attempt submitted no run. The request ID helper now uses `crypto.getRandomValues`, with regression/browser coverage.
- `pr_5cce734168bc83b7b30aac5369320562` failed before commit because Git rejected a literal exclusion of ignored `.local`. Exact glob exclusions now preserve ignored and tracked protected paths; the real Git regression passed.
- `pr_4d35e313e47557c6ae76c65a3a140486` published `945682f4` but its Windows builder exited `0xc000013a` during VPN baseline copying. The cause remains unproven. Its claim had no output or destination job. Restart correctly retained recovery-required. The actual owner popup then closed only this build as failed with an actor/source-bound inspection record; cancel submitted nothing, and existing work was never replayed. A verified local baseline cache avoids repeated VPN file reads.
- `pr_1a9c64575f353a606f1b7ddd574ce597` committed `eb3e33d3`; central import timed out and the request failed without activation. Read-only checks and an isolated fetch passed. A fresh request subsequently published successfully. The transient timeout cause remains unproven.
- `pr_c009728270ec6388138baf512a1fb8bb` published `4fd344c0` and passed CI, then package copying failed MAX_PATH. A locally enrolled short output directory and full operator sidecars fixed that execution path. The manual diagnostic package was retained only for inspection; it was not substituted for the native pipeline artifact.
- Cross-host inspection initially received a byte array; the verifier decoded it. Replacing transient local verification connections also required an explicit checked ownership-record handoff. The real partial outcome was retained and recovered with component-only API rollback.
- One local browser refresh failed during a concurrent asset build; its cause remains unproven. A subsequent run with stable build outputs passed all checks; the failed log remains available.
- The first B request `pr_4589dc0094c0e8cfa1c7a3ad48038d9e`, source `762af5d0`, failed repository validation because this handoff had been written with a UTF-8 BOM. Its retained checkout reproduced exit 1; no output or destination job existed. The file was rewritten as UTF-8 without BOM and local validation passed. Fresh B request `pr_314071e668e8c4c5a44bf8477957cef7` passed; no validator or gate was weakened.

- Initial UI extraction validation (`.local/component-final-ci10.log`) failed TypeScript because the legacy active flag could be undefined; explicit boolean coercion fixed it. CI11 completed all stages but its PowerShell stderr wrapper returned 1. Separate audit exited 0; a fresh direct cmd CI12 exited 0. No gate was weakened.

## Preservation, limitations and next boundary

Servix remains at source `58e9359012b2326f9c627379c865157ae18c3835`, request `sd_a78d33690ccdf8db2db2a54df6a29237`, settings revision 3, destination server21 `D:\servixDev`. Its five configured protected paths remain selected. No Servix Deploy/Rollback request was submitted in this task. Server21 `D:\Servix` Production was excluded.

The synthetic cross-server acceptance establishes the npm-static/node-source path on the tested hosts. Customer-specific remote configuration, the .NET recipe and large generic HTTP artifacts are unverified. Moving an active destination to a new enrollment requires explicit verified ownership-state migration. Uncertain destination mutations still require operator recovery; the new closure only handles builds with no output/target job. Broader hostile-code sandbox, independent QA and Production gates remain on the roadmap.

Final result documents and generated file inventory are working-tree updates after the deployed source commit; runtime code is the exact published commit. The final documentation-only diff is validated separately.

Non-branch state: the shared Git configuration gained the approved internal `devsetu` remote while preserving GitHub origin. An exact local exclude entry preserves the preexisting scratch file; the old exclude is backed up privately. Paired worker/toolchain upgrades preserved credentials and task identity; private local native baseline/output/cache options were updated. Original root-worktree `.gitattributes` and other worktrees were preserved.

Ready for human review of this bounded pilot. GitHub review/publication and any later roadmap phase remain separate actions requiring their own authorization.
