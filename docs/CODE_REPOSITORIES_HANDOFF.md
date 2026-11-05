# Code repository workspace

Status: PASS — corrective release and actual public administrator acceptance.

2026-11-05: Corrective Code release afb50afd3fe6a932ddfd0fd8ce80b1c36459cd78 is LIVE on Server20 through
actual authenticated DevSetu maintenance request su_1412de1ec99c84fb5ca1d8dce5b29e6a, actor
usr_windows_admin. Manifest 76870e5283e8c7350884defea69a7012b46f1eeb835626ef1efec134d308cfde;
archive 3b44050df53c237e65cc984747d1e0487d68ad33cb3abcc579cc9a369a4c4a7e. The original complete enrolled
native CI passes all 590 tests across 118 files; backend coverage is 95.03%
statements, 91.78% branches, 97.01% functions and 96.93% lines. Actual packaged
TCP acceptance holds an authenticated Code read for eleven seconds and succeeds.
Authenticated Code response sockets allow 90 seconds; the global/default
timeout and unrelated routes remain unchanged. Fetched Code HTTP 401 clears protected state
and enters the existing session-expired boundary.

Actual public administrator acceptance passes: the catalogue and both requested
source trees load without Retry, and Servix/DevSetu ZIP downloads match their
committed-source hashes. The observed public browser bundle matches this manifest.
Eight pairings, seven settings, 17 software records, 33 selected snapshot files
and three routing/configuration files are verified retained. No root or servix
.env file existed in that selected snapshot; environment/runtime settings remain
protected and unchanged. Native Apply and private/public health are PASS/200;
all three actual installer downloads match the manifest under strict TLS and
Android retains its signing certificate. No schema migration, operator database
write or live repository grant is performed. Normal application/session/background
activity continues. The snapshot is not a full database backup.

The central source heads remain Servix 72cd488 and DevSetu 074b9e5; this operator-
prepared artifact activation does not publish source to central Git or GitHub.
Credential qualification uses a verified baseline and frozen delta, without a
fresh exact-provider-key comparison. Actual ordinary-user acceptance remains
separate from isolated RBAC/grant/revoke tests. See CODE_REPOSITORIES_HANDOFF.md.

Repository: mishrarishav/FrevOS. Branch: `codex/code-repository-workspace`.
Base: `dc429ddc033fd6346b5a7edcbac2d1ca0359c163`. ADR 0100 records the owner scope.
The existing public entry remains `https://tserver2.eeslindia.org/devsetu/`.
Server9 routes to the Server20 application and retained state.

## Behavior

Code opens a shared, bounded card/table repository workspace. Open a repository
to select a branch, browse committed folders/files, read its README, page through
commit history or download a commit-bound source ZIP. Long code scrolls inside
the workspace. URL query state survives refresh and browser history. The existing
local-folder connection/publication and hosted branch/PR tools remain under
Connect & push; no new Git hosting engine is installed automatically.

Only approved bare stores with exact repository-ID markers are browsed. Paths,
branches, owners and protected paths use trusted registrations; browser requests
cannot select an arbitrary filesystem directory. Browsing reads Git objects,
without checking out or executing source. Repository HTML/Markdown stays escaped.
Binary/large files show metadata. Links/submodules are not followed. Downloads
exclude environment/key paths and configured retained data, are attachment-only,
no-store and limited to one concurrent 64 MiB export. This filtering is not a
repository-wide secret scan. The source ZIP is not a complete forge backup.

Administrators use the configured Discovery administrator policy. Ordinary
members see only owned or explicitly shared central repositories. Legacy stores
with no owner start administrator-only. Manage access grants/revokes one active
workspace member with revision checks and durable audit records. Reading and
downloading does not grant deployment or publication rights. Direct source APIs
and the previous connector baseline endpoint apply source authorization too.
Raw baseline bundles require owner/publication authority, with a second check
after generation. Failed/revoked exports remove only their own temporary bundle.
Optional hosted repositories additionally revalidate immutable provider/user IDs
and live forge permissions. Provider/team access is displayed as inherited;
unlinked accounts must be linked before a forge grant. Existing developers are
not downgraded to read-only when a read grant is requested.

## Actual Server20 source observations

Read-only inspection on 2026-11-05 verified these registered bare stores:

| Repository | Branch | Pushed head |
| --- | --- | --- |
| Servix | `frevos-dev` | `72cd488d5304496c3e8b6aa7d53f77899ac9c747` |
| DevSetu | `devsetu-dev` | `074b9e5b33770434142facfd0d9bb6dc54c081c7` |
| Archived cross-server verification | `devsetu-dev` | `9a409128bfe11abcb41777eb9b81a91c332d34c4` |

The optional `repository-hosting.json` is absent on this installation. The new
view therefore starts from existing central stores. DevSetu's pushed head is
older than the deployed afb50af application. Operator release preparation did not
publish that application source; the UI must not present it as the latest push.
Laptop-only, unpushed edits and compiled deployed bundles are not source commits.

## Validation history and release evidence

2026-11-05 corrective validation: source 3e4189b completes 589 of 590 tests.
The unchanged ownership/catalogue case times out at 30 seconds in its initial
Windows Git fixture. All other checks, including delayed authenticated Code TCP
responses and both native Git/PR/RBAC/encrypted-recovery workflows, pass. No
artifact is packaged or activated. Seed the same two revisions, protected files,
binary/large metadata and branch in one real fast-import, then clone its working
copy. Keep every assertion, test deadline, runtime implementation and coverage
gate unchanged. Full frozen CI must pass again before corrected activation.

- Focused contracts/API/render tests exercise typed paths, URL prefixes, CSRF,
  source escaping and navigation references. Full coverage is running.
- Thirty-four focused backend checks pass across four files, including real
  Git trees, history, binary/large metadata, symlinks/submodules, filtered ZIP
  contents, unchanged refs/environment, grants/revocation and connector denial.
  A subsequent pagination case adds 135 real files and 35 commits.
- The actual pinned Gitea 28.2.0 engine passes clone/push/PR/RBAC and full encrypted
  backup/isolated-restore acceptance, including the new committed-source reading
  and provider grant/revoke path. This is isolated acceptance, not live enrollment.
- Browser design fixtures use actual App/Code components with 43 repositories,
  138 files and 43 members. Table/card/search/pagination, branch/folder/file,
  refresh restoration and grant/revoke controls are exercised. At 1366, 768 and
  390 CSS-pixel widths, the page has no horizontal overflow, retained controls
  remain visible and internal list/dialog scrolling reaches final records.
  These fixtures are synthetic; no live member was granted repository access.
- Typecheck, format, application build and repository validation pass. Lint exits
  zero with advisory diagnostics. Audit reports five low/eight moderate findings
  and no high/critical finding. The first full-coverage run was interrupted after
  Docker failed to create a container (`ttrpc: closed`). A non-destructive Docker
  Desktop restart retained the four preview container IDs/images/mount mappings;
  all four are healthy. The actual account integration and seven real-Code tests
  subsequently pass. The frozen native build must still run every original gate;
  no timeout, coverage threshold or test was weakened. Native artifact/live
  acceptance remain pending.
- First complete frozen native CI on a59d6ee passes all 587 tests, but its 94.69%
  statement coverage fails the unchanged 95% gate. This attempt is retained as
  failed validation, with no artifact activation. The next validation adds the
  actual Code workspace/provider flow and permission/storage/concurrency cases;
  application implementation and coverage thresholds are unchanged.
- Final focused Code/native-engine acceptance passes 10 tests, including real
  hosted catalog/tree/roles, grant/revoke, provider file/history/ZIP and central
  policy/identity/quota/concurrent-export checks. Scoped new-module coverage is
  95.56% statements, 91.21% branches, 98.53% lines and 100% functions. The original
  global frozen-source CI is still required; this scoped report does not replace it.
- The next frozen source, 383e58f, passes 587 of 589 tests but hits the original
  pagination/native-engine time limits. Preserve that failed attempt. The fixture
  now imports the same real 135-file/35-commit Git history in one process and
  removes duplicate added provider round trips, preserving the Code-service
  grant/revoke and existing recovery assertions. Full acceptance must pass with
  the original deadlines and global coverage thresholds before packaging.
- The new hosted-Code workflow is now a separate native acceptance fixture;
  the full original Git/PR/RBAC/encrypted-recovery workflow is preserved and
  separately passes at 177 seconds with its original 180-second deadline.
  The Code fixture passes at 21.8 seconds. Final targeted Code acceptance passes
  10 tests with 95.56% statements, 91.21% branches, 98.53% lines and 100% functions.
  That targeted command filters the already separately exercised original native
  test; the upcoming complete frozen-source CI must execute both native tests.

The final commands, complete changed-file list and release identities are recorded
in CODE_REPOSITORIES_CHANGESET.md. Frozen artifact source is afb50af; the final
handoff documentation is a later local commit and is not a different deployed
application. Existing source stores remain configured central bare repositories;
the optional hosted forge is not enrolled on Server20. Actual non-admin UI,
phone and Linux-desktop acceptance are not claimed. Isolated RBAC/native-engine
acceptance is distinct from those live checks. Credential review inherits a
verified qualified baseline and frozen-source delta; current exact-key journal
comparison is unavailable. No GitHub push or central-source publication occurred.
