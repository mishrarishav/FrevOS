# Code repository workspace

Status: Validation in progress; application activation is pending.

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

Commands and final changed-file inventory will be recorded in
CODE_REPOSITORIES_CHANGESET.md after validation. Existing pairings, databases,
uploads, environment and source refs must be snapshotted/verified for activation.
No GitHub push, source migration or forge enrollment is implied by this handoff.
