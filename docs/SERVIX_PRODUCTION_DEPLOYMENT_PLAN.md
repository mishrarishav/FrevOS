# Servix Production deployment plan

Date: 2026-10-26. Status: PASS for planning and visible configuration;
Production execution BLOCKED on the unconnected destination adapter.
This is a backend-first plan, not a deployment receipt or a completed Production
connection. Roadmap Phase 4 remains open.

## Owner directions

Keep the current application code and installed dependency versions for this
planned rollout. Do not run dependency fixes, npm installs or runtime upgrades.
The owner describes this as internal use on a secured network; the recorded
dependency advisories remain known findings, not a clean security result.
Final release approval must include the retained dependency risk.

All configuration, approval, deployment, monitoring and recovery must use
DevSetu's visible, authenticated workflow. Configure with the owner present,
show the values and obtain their review. Do not activate through a private
PowerShell/RPC script, direct file copy, manual npm command or another bypass.
Underlying OS operations belong to a scoped enrolled worker invoked by that
workflow, with the same visible request/history and persisted audit evidence.

The initial planning step did not authorize configuration or execution. The owner
subsequently logged into the adjacent browser and asked the assistant to perform
the current configuration and approvals. This permits the visible configuration
work below; it does not waive scoped approval, artifact, target or audit checks.
There is no working Production action to approve in the current UI. No enrollment,
credential binding, permission change, process stop/start, database write, release
activation or rollback occurred. See [ADR 0064](adr/0064-visible-production-configuration.md).

## Visible configuration result

Using the existing logged-in FrevOS Administrator account in DevSetu Internal,
the assistant saved `servix-production`, display name `Servix Production`,
revision 1 through Projects / Configuration. Values:

- Repository: `//10.9.69.20/e$/FrevOS/git/servix.git`.
- Default local source: `D:\servixDev`; no new source publication or project
  connector was created. Promotion must use the saved tested backend bytes.
- Destination: `10.9.69.21`, `D:\Servix`.
- Application URL: `https://support.eesl.co.in/`.
- Preserved paths: `backend/uploads`, `backend/database`, `backend/.env`,
  `backend/.env.prd`, `backend/attachment`, plus mandatory product protections.
- Runner/credential: not connected. No credentials were entered or rebound.

DevSetu's Test connection at 2026-10-26 23:17:45 IST reported Preservation
passed, Destination pending, and no project connector/source-folder verification.
Those source checks belong to the generic source-publication form; installing
another source connector would not supply the missing immutable Production
promotion adapter. The current Components screen also had no enrolled executors.
The existing `servix-development` revision 3 and its target were not edited.

This is a saved destination proposal, not a deployment receipt. No release
approval was minted/consumed. The next bounded implementation must provide the
real enrolled Production promotion/adoption/recovery path before its approvals
can be used. Retargeting the Development runner is not a substitute.

## Current capability boundary

The only observed connected Servix profile is `servix-development`, revision 3,
on server21 at `D:\servixDev`. The retained Production candidate has not been
enrolled or activated. The legacy deployment controller explicitly targets
Development; a saved generic configuration alone does not establish support.

Before execution, DevSetu must have a verified Production target, same-owner
runtime adoption, digest-preserving promotion of the saved Development backend
artifact, scoped approval, preservation checks and saved-artifact recovery.
These need an actual tested execution path. If the existing UI/adapter cannot
provide them, prepare a separate bounded DevSetu implementation and validation
for review first. Do not retarget the Development adapter or weaken its
Production exclusion. This configuration step implements no such enhancement.

## Configuration to review together

The earlier diagnostics and backup rehearsal were controlled operator preflight,
not acceptance of a DevSetu Production UI flow. Future fresh backup/setup and
execution must follow the owner's visible DevSetu requirement as well.

These are intended configuration values and review requirements, not a claim
that every corresponding control currently exists in the UI.

Reuse the verified existing values rather than asking the owner to re-enter
every path or variable. Review target/environment, artifact, protected data and
runtime/availability as four groups; the owner supplies the maintenance window
and the required scoped decisions. Secret values remain outside the review.

| Item | Planned value / verification |
| --- | --- |
| Control plane | DevSetu server20, verified owner in `ws_server20` |
| Application/source | Existing Servix logical repository binding; approved source `e04137b4a862e8760a59b95da7e0de9a32bc6d38` |
| Environment | Production, distinct from the Development target |
| Target | Server21 `10.9.69.21`, verified host DCAPP9 |
| Application root | `D:\Servix`, selected through an approved target binding |
| First component | Compiled backend artifact; API port 5000 |
| Public address | `https://support.eesl.co.in/` |
| Runtime account | Same account as the existing Production process; least privilege |
| Proposed task | `DevSetu-ServixProduction-Backend`, password logon and boot start |
| Credential | Existing protected connection reference at the authorized boundary; no secret values in the form, logs or approval |
| Code selection | Approved immutable bundle, with retained verified source selection for recovery |
| Dependencies/runtime | Keep existing installed versions; fresh compatibility/integrity observation before cutover |
| Persistent data | Existing uploads, attachments, selected mutable folders, environment files and unknown existing files are preserved |
| External file storage | `D:\oracle\blob` remains outside deployment writes |
| Frontend/IIS | Separate scope; this backend plan does not replace frontend assets or IIS configuration |

Host names, paths, identities, ports, artifact references and protections belong
to revisioned configuration and verified registries, not new project-name
conditionals in product code.

## Guided DevSetu sequence

1. With the owner watching, open Projects / Configuration and verify the Servix
   source and workspace identity. Review Production as a separate target and
   show that Development still points to its original root.
2. Review/prepare the Production connection and its locally enrolled scope.
   Verify host identity, root ownership, runtime account and credential reference.
   Present any required batch-logon right/credential binding explicitly before
   a separate scoped setup approval. Do not silently change machine policy or
   use SYSTEM in place of the existing owner.
3. Choose the saved tested backend artifact and show its digest and Development
   receipt. Promote the same backend bytes; do not rebuild for Production,
   install dependencies or publish a new customer source commit for promotion.
4. Review the protected paths and freshness of their inventories. Include all
   selected existing files and discover additions since the older snapshot;
   do not treat the previous 8,542-file count as a complete current inventory.
5. Review backup and restore evidence, then arrange a fresh cutover backup,
   protected recovery access and the maintenance window. The existing backup
   is a rehearsal/snapshot; its old timestamp is not proof of current recovery.
6. Show the complete Production review: exact target, artifact, account/task,
   possible setup rights, verified current process identity, preserved paths,
   brief API interruption, normal startup/bootstrap database effects and normal
   workers. Record the retained dependency findings without presenting them
   as remediated.
7. Only after the owner's explicit approval, invoke the typed DevSetu action.
   Bind approval to actor/workspace/action/target/correlation/expiry/artifact;
   consume it once. Recheck identity, drift, integrity, backup and audit before
   any mutation. Expired or changed scope returns for fresh review.
8. During the approved window, the enrolled worker stages only approved immutable
   files, hands off only the reverified manual process, selects the approved
   artifact and starts the same-owner managed runtime. Keep progress and outcome
   visible in DevSetu; never kill an arbitrary Node process or unknown listener.
9. Verify full API/bootstrap readiness, hosted TLS access, existing attachment
   serving, selected read-only application flows and protected hashes. Persist
   actual receipts; a green button or saved profile alone is not success.
10. On failure, execute only the previously approved exact code-recovery path
    through DevSetu, with drift/ownership checks and retained files. Verify its
    health and data protection again. Code rollback cannot undo database changes;
    an actual Production database restore needs a separate explicit approval.

Pause configuration mutations if the owner cannot see/review the session.
Read-only monitoring may continue; do not treat the old unattended/locked-screen
testing permission as authorization for unseen Production configuration.

## Fixed artifact and existing recovery evidence

- Candidate: `sp_6c3b764d29f94e12a25b09c23914cfdb`, still unapproved.
- Candidate plan SHA256:
  `702fdb16282862d107c9578e4a55da59daaf0a30e11a84f09569ac16829346d8`.
- Backend descriptor SHA256:
  `8e525dab58dde2e560fbc2d7f18547a1d3c1e048204062e09c98c97b227eac96`.
- Backend bundle SHA256:
  `5ff7622a9f316edbe0485c47f179f6c1bccac75241e6540f1d0079b11172fb0c`.
- Development restore: `sd_4fa6678413b3b23b2ba677ad4b09f6e3`.
- Encrypted backup reference:
  `servix-production-backup/sr_8398ce72746c5b91776929f6b469786d`.
- Backup SHA256:
  `0eb90d448a6989e0fb8e0254663bf2c09dbde49bac28eeab2241cc18982b83b3`.
- Rehearsal: matching MySQL 8.0.28, 114 tables, one view, 212,077 rows and matching
  schema; private DPAPI storage and owned network-disabled restore cleanup pass.

The task XML parses on target, but current batch-logon readiness is unproven.
The snapshot's DPAPI recovery was tested only on its current owner/machine.
Application startup against the restored DB, broader disaster recovery and the
Production DevSetu promotion/rollback path are not established by that rehearsal.
See [readiness evidence and risk counts](SERVIX_PRODUCTION_READINESS.md).

## Delivery boundary

Repository: `D:\FREVOS\.local\worktrees\servix-dashboard`, branch
`codex/servix-production-readiness`, base
`5730940fe6c40cc3eb5002ef6beaa564c9571e5f`. No resulting commit or PR.
This phase includes the visible revision-1 configuration write and its connection
test. No source publication, build, Production execution, credential/right change
or customer dependency update occurred. Execution remains unavailable until the
stated DevSetu capability and setup gates pass and the exact action has a valid
scoped approval. The blocker is missing execution capability, not a claim that
the owner refused permission.

Complete changed-file list, including the earlier readiness preparation:

- `docs/CURRENT_STATE.md`.
- `docs/SERVIX_BACKEND_ARTIFACT_HANDOFF.md`.
- `docs/SERVIX_PRODUCTION_DEPLOYMENT_PLAN.md`.
- `docs/SERVIX_PRODUCTION_READINESS.md`.
- `docs/adr/0064-visible-production-configuration.md`.
- `docs/adr/README.md`.

Combined diff: six files, 489 insertions and zero deletions. Base and current
HEAD remain the same SHA above; no new commit, push, PR or merge. Observed checks:
`pnpm run validate:repo` exit 0 (99 Markdown files), `git diff --check` exit 0,
and `node .local/Scan-ActivitySecrets.cjs` exit 0 (known owner secrets absent
from the diff and all three untracked documents). The saved profile persisted
after browser reload; Development still showed revision 3 and its original root.

Runtime code is unchanged. No new build/runtime/security audit was run; earlier
customer dependency findings remain unresolved by owner direction. Status is
PASS for visible configuration, BLOCKED for Production execution. Phase 4 exit
remains open; the next bounded task is the verified Production adapter, not
another source install or reuse of a Development approval. Private screenshots
are retained locally; they contain no credentials or customer file contents.
