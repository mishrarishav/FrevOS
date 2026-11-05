# Code repository workspace

Status: Initial deployment and actual public repository/ZIP acceptance PASS;
corrective idle-timeout/session-UX release in validation.

The e4f93ad artifact is live through authenticated DevSetu request
su_80f4123670420609bab7033f72d27d2d; manifest
fe9ba7ebb9e672736e24fcc37c56ad0dd96c9ef92e3cc575b71dd9d461642d9d.
The complete native CI passes all 590 tests across 118 files. Native Apply,
packaged runtime, preservation and actual public installer downloads pass.
Actual administrator sign-in shows the three registered repositories. Both
requested ZIPs download through the public Code UI and match real-source hashes:
Servix 2,222,749 bytes (751 entries, two protected paths excluded), DevSetu
1,612,015 bytes (585 entries, one excluded). Original refs remain unchanged.
This is authenticated administrator acceptance; no live non-admin grants were
created for testing. Isolated ownership/share/revoke checks remain separate.

Correlated public and Server20 IIS records identify intermittent Code failures
as 502.3 / WinHTTP 12152 at the application's ten-second idle socket deadline.
The correction extends only authenticated Code response sockets to 90 seconds,
retaining Git's bounded subprocess execution and normal unauthenticated limits.
A real TCP regression deliberately holds catalogue/tree/ZIP responses for eleven
seconds and confirms successful delivery plus unchanged revoked-member denial.
An accompanying UI fix clears protected state on HTTP 401 and reuses the existing
session-expired/sign-in boundary. Focused regression, typecheck and an actual
App/Code fixture pass; full native validation and corrective rollout are pending.
No schema migration, operator database writes, source publication, live grants or pairing changes are made.

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
older than the deployed b8d2e38 application. Operator release preparation did not
publish that application source; the UI must not present it as the latest push.
Laptop-only, unpushed edits and compiled deployed bundles are not source commits.

## Validation and release state

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

Commands and final changed-file inventory will be recorded in
CODE_REPOSITORIES_CHANGESET.md after validation. Existing pairings, databases,
uploads, environment and source refs must be snapshotted/verified for activation.
No GitHub push, source migration or forge enrollment is implied by this handoff.
