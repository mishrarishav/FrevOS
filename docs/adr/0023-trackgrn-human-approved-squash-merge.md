# ADR 0023: Allow human-approved TrackGRN squash merge in the UAT pilot

- Status: Accepted
- Date: 2026-08-23

## Context

ADR 0022 intentionally stopped the TrackGRN pilot after dedicated-branch push.
The product owner now wants to open and merge TrackGRN pull requests from
FrevOS instead of returning to the GitHub UI. This is a personal, single-owner
UAT workflow; it does not authorize FrevOS to merge its own source changes or
generalize provider credentials.

## Decision

Add two fixed TrackGRN actions:

- `repository.open-pull-request` creates or returns the one open PR for an
  exact reviewed `frevos/trackgrn-*` branch and HEAD SHA; and
- `repository.squash-merge` performs an immediate squash merge only after a
  human checks the confirmation control for an exact PR number and HEAD SHA.

The Windows companion must re-verify repository ID `1334902237`, the approved
GitHub operator, open non-draft state, base branch `main`, exact head SHA,
`MERGEABLE`/`CLEAN` provider state, and one completed successful `validate`
check immediately before merge. The merge command must use
`--match-head-commit` and `--squash`. Auto-merge, administrator bypass, merge
commits, rebases, direct `main` pushes, and model-initiated confirmation are
prohibited.

The human request owns the merge decision. The companion is a deterministic
execution transport and records the PR, reviewed head, validate result, merge
commit, and refreshed local `main` head. The action is unavailable without the
explicit literal confirmation bound into the persisted operation.

## Consequences

- The owner can complete the TrackGRN PR lifecycle from FrevOS without
  weakening the exact-head or green-check gates.
- A TrackGRN `validate` workflow is required before the first merge operation.
- The local GitHub CLI credential remains a personal-UAT limitation. Generic
  repository onboarding still requires a GitHub App installation identity.
- FrevOS source PRs still require independent human GitHub review and merge;
  this exception is pinned only to `mishrarishav/TraceGRN`.

## Rejected alternatives

- Background or model-triggered auto-merge.
- `--admin`, branch-protection bypass, merge commits, or rebase merge.
- Merging a different repository, base branch, PR head, or unchecked PR.
- Treating a provider's mergeable flag as a substitute for the required
  successful `validate` check.

## Related decisions

- [ADR 0008](0008-default-branch-and-merge-governance.md)
- [ADR 0022](0022-trackgrn-uat-automation-pilot.md)
