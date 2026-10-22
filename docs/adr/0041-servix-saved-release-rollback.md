# ADR 0041: Servix development saved-release rollback

Status: Accepted for the owner-authorized Servix development pilot.
Date: 2026-10-21.

## Context

The owner requested repeated rollback to a previous successful deployment and
normal deployment of current laptop code afterwards. ADR 0040's connector remains
the source-publication path. Rebuilding old source would make rollback depend on
the laptop and package registry and would produce a different artifact.

## Decision

Reuse retained immutable build artifacts and the existing preservation operator.
An authenticated, workspace-scoped, CSRF-protected restore request names saved
deployment IDs and the expected current deployment. The server selects the
previous distinct successful artifact for Rollback; history also permits restoring
a selected successful build. Every activation gets a fresh actor-bound, expiring,
single-use request and history record. Request retries preserve identity.

Resolve restored releases to their original build. The privileged runner verifies
SYSTEM-owned successful target receipts, artifact digests and current-release
identity. A private active-release pointer is published only after target health
and preservation succeed. Existing installations bootstrap from the previous
successful receipt and exact installed-file hashes. An uncertain activation is
never replayed and blocks subsequent operations pending reconciliation.

The target validates the current manifest before stopping its owned development
task. It journals replacements and removes only obsolete managed code files whose
hashes still match that manifest. Recovery restores those removed files too.
Uploads, environment/database files, credentials and production remain excluded.
Rollback changes neither laptop Git history nor the server source branch. Normal
Deploy continues to publish and build the current laptop code.

## Consequences and alternatives

Saved artifacts can be restored repeatedly without rebuilding or a laptop worker.
Missing, modified or incompatible artifacts and installed-code drift fail closed.
Historical artifact retention and the existing history capacity still apply.
Database contents/schema and dependency installations are not rolled back; the
existing source-only dependency and bootstrap checks remain required. Full-folder
mirroring and Git reset/force-push were rejected because they do not preserve the
owner's source and runtime data requirements.

Related: [ADR 0040](0040-portable-developer-connectors.md),
[connector handoff](../DEVELOPER_CONNECTOR_HANDOFF.md).
