# ADR 0008: Protect `main` with pull-request and human-merge controls

- Status: Accepted
- Date: 2026-08-09

## Context

FrevOS requires pull-request delivery and prohibits agents from merging their
own changes. The repository currently has one GitHub account, `mishrarishav`,
serving as both human owner and the authenticated identity used for authorized
Codex publication. GitHub cannot distinguish those two actors for review-count
enforcement, so requiring an approving review from the start would deadlock the
repository.

No branch ruleset or CI checks existed when this decision was made.

## Decision

Protect the default branch with an active repository ruleset that:

- requires a pull request;
- blocks deletion and non-fast-forward updates;
- allows squash merge only;
- requires review conversations to be resolved;
- defines no bypass actor;
- temporarily requires zero approving reviews;
- does not require status checks until Phase 1 creates stable CI checks.

Configure the repository to allow squash merge only and delete task branches
after merge.

The automated authoring session must not invoke merge. Under the temporary
single-account model, the human owner reviews the evidence and merges through
GitHub. Once a separate automation identity or trusted reviewer exists, a later
ADR must raise the minimum to at least one approval, require approval of the
last reviewable push, and define ownership rules.

## Consequences

- Direct default-branch pushes and force updates receive mechanical protection.
- Pull requests create a durable evidence and discussion boundary.
- Independent reviewer enforcement remains procedural until identities are
  separated.
- Phase 1 must install stable CI before status checks become required.
- The human owner retains a small manual merge responsibility.

## Rejected alternatives

- Leaving `main` unprotected and relying only on conversational instructions.
- Letting the authoring agent merge after its own checks.
- Requiring one approval immediately and deadlocking the sole GitHub account.
- Adding placeholder required checks before CI exists.
- Allowing merge commits, force pushes, or silent administrator bypasses.
