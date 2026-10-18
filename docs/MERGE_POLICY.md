# FrevOS Merge Policy

## Purpose

This policy turns repository changes into a predictable, reviewable sequence.
It applies to humans, coding agents, automation, and future service identities.
GitHub settings provide minimum mechanical enforcement; this document defines
the stronger operating standard.

## Non-negotiable rules

- Never push changes directly to `main`.
- Every change uses a bounded task branch and pull request.
- The authoring automated session must never merge its own pull request.
- Merge only the exact reviewed head commit.
- Resolve all review conversations before merge.
- Use squash merge only and delete the merged branch.
- Never weaken tests, security checks, approvals, or repository rules merely to
  make a change mergeable.
- Never bypass a rule silently.

## Current identity constraint

The repository currently uses the `mishrarishav` GitHub account for both human
ownership and authorized Codex publication. GitHub therefore cannot reliably
distinguish the human owner from the automated implementation session.

Requiring one GitHub approval now would deadlock a single-account pull request,
because an account cannot provide independent approval for its own PR. Until a
separate automation identity or additional trusted reviewer exists:

- the repository ruleset requires a pull request but zero approving reviews;
- the automated implementation session leaves the PR unmerged;
- the human owner either performs the squash merge in GitHub or, after reviewing
  the exact PR/head evidence, explicitly enables CI-gated squash auto-merge from
  the authenticated FrevOS Control Center;
- the PR body and audit trail provide the handoff evidence.

The FrevOS self-maintenance path does not authorize an authoring automation
session to request its own merge. Its merge operation is accepted only from the
logged-in owner, binds the PR number and exact head SHA, records the requesting
user, expires after ten minutes, uses GitHub auto-merge, and remains subject to the protected branch and
required `validate` check. The first PR that introduces this boundary must still
be merged through the pre-existing human bootstrap path.

When a separate bot/service identity or trusted reviewer is introduced, raise
the ruleset to at least one approval, require approval of the last reviewable
push, and add CODEOWNERS where ownership boundaries are meaningful.

## Required workflow

1. Confirm the authorized task, current phase, base branch, and clean worktree.
2. Create or reuse one dedicated task branch from the intended base commit.
3. Implement the smallest complete scoped change.
4. Run repository-required validation and task-specific security checks.
5. Review the complete staged diff and confirm no unrelated files are present.
6. Commit with a factual, imperative message and push only the task branch.
7. Create or update one pull request against the canonical base repository.
8. Keep the PR draft until its description and available evidence are complete.
9. Resolve review threads and revalidate changes made after review.
10. Verify the PR head SHA, changed-file list, mergeability, and required checks.
11. The human owner marks the PR ready and performs a squash merge, or records
    the exact-head FrevOS auto-merge instruction when that bounded profile is active.
12. Delete the merged branch and verify the default branch contains the result.
13. Update `docs/CURRENT_STATE.md` in the next authorized state-changing task if
    the merge changes phase readiness or durable project facts.

Creating, marking ready, approving, merging, and deleting a branch are distinct
external actions. Each needs appropriate authority; none is implied by another.

## Merge gate

A pull request is merge-ready only when all applicable items are true:

| Gate | Required evidence |
| --- | --- |
| Scope | Request, phase, included work, and excluded work are explicit |
| Branch | Head is a dedicated branch; base is the canonical default branch |
| Diff | Complete file list and diff stat reviewed; no unrelated changes |
| Validation | Exact commands, exit codes, tests, build, and check results |
| Security | Secret scan and task-relevant security checks pass |
| Architecture | Docs and ADRs updated when approved decisions change |
| Reviews | Conversations resolved; required approvals/checks satisfied |
| Freshness | Evidence applies to the current PR head SHA |
| Limitations | Failures, unavailable checks, deviations, and risks disclosed |
| Authority | Human merge boundary and any sensitive approvals satisfied |

“Not applicable” needs a reason. Missing tools, absent CI, or skipped tests must
be reported as limitations, not silently treated as success.

## GitHub enforcement baseline

The desired ruleset is versioned at
`.github/rulesets/protect-main.json`. Repository settings remain the applied
source of enforcement; the file is the reviewable desired-state definition.

The minimum active ruleset for the default branch should:

- require changes through a pull request;
- allow squash merge only;
- require review conversations to be resolved;
- block branch deletion;
- block non-fast-forward/force updates;
- grant no silent bypass actor;
- avoid mandatory status checks until Phase 1 installs stable CI check names;
- temporarily require zero approving reviews under the single-account model.

Repository merge settings should disable merge commits and rebase merges, enable
squash merge, and delete head branches after merge.

Phase 1 must add stable CI before making checks mandatory. A required check must
not be configured until it has run successfully on the default branch and its
name is durable; otherwise every pull request can be deadlocked.

## Emergency exception

An emergency does not erase evidence or authorization. If a configured rule
must be bypassed, the human owner must explicitly authorize the exact action and
record the reason, affected branch/commit, risk, validation performed, and
follow-up task. Restore the normal rule immediately after the exception and
review the resulting default-branch diff.

Direct default-branch force pushes and history rewrites are prohibited even as
routine emergency shortcuts.

## Rollback

Rollback uses a new pull request that reverts the faulty change and carries its
own validation evidence. Do not rewrite shared history or delete audit evidence.
Production rollback remains a separate protected action under
`docs/PERMISSIONS.md`.
