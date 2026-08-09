# ADR 0011: Run least-privilege, reproducible validation in GitHub Actions

- Status: Accepted
- Date: 2026-08-09

## Context

Local results alone do not prove a clean checkout can reproduce validation.
GitHub Actions is the repository's available CI boundary, but third-party action
tags, write-capable workflow tokens, mutable dependencies, and premature
required-check configuration can create supply-chain risk or deadlock merges.

## Decision

Create one stable `CI / validate` job for pull requests, `main` pushes, and
manual dispatch. It runs repository governance validation, format, lint,
type-check, unit coverage, package build, and high-severity dependency audit.

The workflow:

- grants only `contents: read`;
- disables checkout credential persistence;
- pins actions to full commit SHAs with human-readable release comments;
- installs the exact pnpm and Node.js versions;
- uses the committed lockfile with frozen installation;
- cancels superseded runs for the same workflow/ref;
- applies a bounded timeout;
- exposes no secrets and performs no publication or deployment.

Dependabot proposes grouped weekly npm and GitHub Actions updates. A CI check
becomes mandatory in the `main` ruleset only after the same stable check name
has succeeded on the default branch.

## Consequences

- Every pull request receives reproducible clean-environment evidence.
- Workflow compromise impact is reduced by read-only permissions and immutable
  action references.
- Dependency audit availability depends on the registry advisory service and
  may require an explicitly documented retry for transient provider failures.
- Publishing packages, artifacts, releases, or deployments needs later
  separately permissioned workflows.

## Rejected alternatives

- Mutable major tags without recorded commit identity.
- Default write-capable workflow permissions.
- Installing without a committed frozen lockfile.
- One workflow that also publishes or deploys.
- Requiring a status check before it has ever succeeded on `main`.
