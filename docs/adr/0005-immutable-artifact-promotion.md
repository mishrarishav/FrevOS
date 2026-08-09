# ADR 0005: Build once and promote the same artifact digest

- Status: Accepted
- Date: 2026-08-09

## Context

Rebuilding separately for Production can produce different bytes because of
dependency drift, mutable build inputs, compromised infrastructure, or
environment-specific behavior. Passing UAT would then provide weak evidence
about what entered Production.

## Decision

A pinned source commit and build run produce a versioned immutable artifact.
The artifact record contains or links the source repository and commit, build
run, creation time, cryptographic file digests, SBOM, provenance, and signing
metadata where applicable.

UAT and Production retrieve and verify the exact same artifact digest.
Environment-specific configuration and secrets are injected through controlled
deployment configuration and are not baked by rebuilding the application.

Promotion, deployment, and rollback are distinct audited transitions. A
Production approval binds the exact artifact identity and digest.

## Consequences

- Artifact storage must support immutability, access control, and retention.
- Builds must be reproducible enough to diagnose inputs even though promotion
  relies on the stored artifact rather than rebuilding it.
- Configuration compatibility must be validated separately from artifact bytes.
- Any artifact change requires a new build, evidence set, and approval.

## Rejected alternatives

- Rebuilding from the same Git tag for each environment.
- Deploying a mutable “latest” artifact reference.
- Allowing deployment agents to modify application binaries for an environment.
- Approving a release version without binding its cryptographic digest.
