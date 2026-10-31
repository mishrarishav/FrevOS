# ADR 0068: Existing Development source acceptance during full-release rollout

Status: Accepted by the owner's explicit clarification, 2026-10-27.

## Context

During the ADR 0067 platform build, the owner confirmed the requested changes
are already visible on Development. Requiring another visual confirmation of
the same changes after rebuilding would not distinguish the release. The owner
will check dashboard, filters and column resizing on Production after activation.

## Decision and scope

Supersede ADR 0067's additional owner Development acceptance waiting step for
this same-source rollout. Retain the owner's existing functional observation;
verify that the configured customer source remains exactly
`e04137b4a862e8760a59b95da7e0de9a32bc6d38`. Continue the new immutable build,
configured frontend/backend tests, Development health/public-artifact verification
and protected-file checks. The same artifacts must be promoted without rebuilding.
Do not perform the reserved business UI checks or claim a new manual acceptance.
If customer source changes, this same-source acceptance does not cover it.

This does not approve an unidentified Production artifact or reuse the previous
backend-only approval. Prepare the exact target/artifact-bound, expiring review
and fresh backup/recovery evidence, then obtain the required scoped human
Production decision. Record the existing source acceptance and new technical
verification in that review. The owner's post-deployment functional check remains
pending until they report it. No dependency upgrade, database restoration,
permission expansion or feature edit is added.
