# ADR 0076: Configured private Git collaboration

Status: Accepted for the owner's explicit implementation request, 2026-10-30.

## Scope and existing work

The owner requests standard clone/pull/push, branches, pull requests and reviews,
repository roles, and verified backup/restore through DevSetu. This is one bounded
extension of the configured central-source pilot (ADRs 0048–0049), not completion
of the generic GitHub App, orchestration, or remaining Phase 4 acceptance gates.
The explicitly requested follow-on is based on the existing platform source
e5b1122ad95323b46beab3789672d2cb6ca2d9cd. Its dedicated branch is
codex/central-git-collaboration. The three unpublished preview corrections in the
previous worktree remain there; they are not silently committed or discarded.

## Decision

Use a separately installed, pinned, private Gitea engine for standard Git
transport and its complete repository/branch/PR/review experience. DevSetu owns
workspace authorization, an explicit connection registry, a Repository Center,
scoped operations, configuration and recovery evidence. Customer repositories
remain in the separate engine's storage, never in this platform repository or
as permanent control-plane checkouts. Workers still use isolated checkouts.

Connections identify the provider installation, immutable provider repository
ID and verified account ID; a local path or a repository name is not identity.
Each DevSetu actor has an explicit account/credential-reference binding. There
is no shared administrator token for ordinary users, email-based auto-link,
automatic permission grant, anonymous repository access or public exposure.
The engine independently enforces Git and review permissions, including direct
Git clients. The control-plane adapter rechecks account, repository identity and
live repository permission for every operation. Browser visibility is not RBAC.

Expose real repository state and typed branch/PR/review actions in DevSetu, and
link to the engine's native code/diff/access/credential screens for their complete
workflows. Never present a placeholder link as an executed operation. Git URLs
contain no credentials. HTTPS or configured SSH is the developer transport;
plain HTTP is limited to an explicitly allowed private installation or isolated
loopback verification. Tokens resolve only at the server execution boundary.

Repository, account, URL, branch, required approvals/checks, retention, storage,
listener, executable identity and runtime binding are configuration. Protected
default branches reject direct push and force push. Fresh non-author review,
the exact head SHA, the current base SHA and required checks gate merge. No
automated author self-merge or automatic deployment on push is introduced.

Backup covers Git refs/objects plus the engine database, reviews, roles, issues,
attachments, LFS and configuration. A consistent full backup quiesces the exact
enrolled engine; a Git bundle alone is not a full platform backup. Backups stay
in operator-protected storage with integrity manifests. Restore first targets a
new isolated root, checks integrity/identity and verifies repository and metadata
behavior. Live replacement is a distinct scoped, expiring, single-use human
approval, with a preimage and recovery path; it never silently overwrites code.

## Delivery sequence and authority

The owner additionally specifies a GitHub Desktop style daily flow: pair the
system once, choose an existing non-empty folder, review Changes, enter a message
and Commit & Push. Pull, branch and PR actions stay simple. Do not require a
developer to enter server addresses, ports or administrator credentials. Folder
selection is read-only; publication is a distinct explicit action. Reuse the
authenticated owner-only folder browser and its expiring result as selection
proof. Installed connectors advertise the new capability separately from
metadata-only monitoring; older connectors remain usable and honestly need an
update for Git actions. Exclude protected data, preserve existing remotes/history,
refuse dirty/destructive pulls and conflicting staged work, and retain local
commits when publication is interrupted. No automatic deploy on code push.

1. Strict connection/action contracts, private engine adapter and negative RBAC.
2. Repository Center and actual Git/branch/PR/review interoperability.
3. Fixed configured backup/isolated-restore operators and recovery checks.
4. Real multi-user integration, proportional CI, complete diff review and handoff.

The owner authorizes implementation and isolated verification of this sequence.
Installing a new live service, creating live secrets, granting roles, migrating
existing repositories or replacing live state are separately reviewed actions.
No existing central ref, remote, protected data, deployment or secret is changed
by enabling this module in an unconfigured state. GitHub publication and merge
of the implementation remain separate actions.

This supersedes the earlier product exclusion of an optional self-hosted source
control integration, while retaining ADR 0001's external repository boundary.
It does not authorize an in-process custom Git server or a GitHub/GitLab parity
claim. See the operator handoff for exact verification and pending live gates.

## Primary implementation references

- https://docs.gitea.com/installation/install-from-binary/
- https://docs.gitea.com/development/api-usage/
- https://docs.gitea.com/usage/access-control/permissions/
- https://docs.gitea.com/usage/access-control/protected-branches/
- https://docs.gitea.com/administration/backup-and-restore/
