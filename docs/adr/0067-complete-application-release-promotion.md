# ADR 0067: Complete application releases and managed Production updates

Status: Accepted for the owner's explicit complete-flow request, 2026-10-27.

## Context and scope

The owner requires source publication to the configured server20 repository,
frontend and backend builds, Development verification, promotion of the same
artifacts to Production, and subsequent updates through DevSetu. ADR 0065's
initial backend-only adoption succeeded, but leaves the Production frontend
behind and rejects the now-managed runtime on the next update. Phase 4 exit
remains open. This is a continuation of that bounded deployment capability,
not a later roadmap phase or permission to merge the existing implementation.

## Decision

Supersede ADR 0065's backend-only and initial-adoption-only boundaries. Retain
its actor/workspace/target/artifact-bound, expiring, single-use approval,
encrypted backup, preservation, owner and toolchain checks and ADR 0066's
canonical executable identity. Keep the historical receipts readable.

The existing source publisher and server20 compatibility builder remain the
execution path. Build the frontend for same-origin API/portal routing, with no
Development address embedded. Describe its immutable application files in a
digest-bound descriptor; preserve destination web.config and every environment,
upload, attachment, unknown file and IIS setting. Record build/destination data
in reviewed configuration. No project-name conditional or arbitrary command
editor is introduced. Both components belong to one exact saved Development
release. A backend-only historical release cannot satisfy a full-release target.

Managed updates require a matching successful private controller receipt,
configuration and launcher hashes, exact task action, same owner, least
privilege, password logon, boot trigger, current selection and observed process.
Stage new immutable runtime/artifact files before stopping anything. Preserve
the previous task XML, selection and frontend preimages. Compare-and-swap each
changed file, install hashed assets before the frontend entry, and verify both
component identities and health. On a failed activation recover the exact prior
managed task/selection/frontend; never fall back to unreviewed source. Preserve
new immutable files and all original application/user files during recovery.

The Production UI must name both components and their source/digests, show
managed update versus first adoption, and report complete, recovered or
recovery-required outcomes accurately. Choosing a saved tested release supports
code restoration through the same fresh review, without rebuilding or restoring
the database. Required audit persistence precedes effects. Interrupted work is
not replayed automatically.

On 2026-10-27 the owner reserved dashboard, filters and column-resize manual
acceptance for themselves. Do not exercise those business UI actions on their
behalf. Continue build/unit gates, deployment health and artifact/data-preservation
verification. Report the new Development release for owner acceptance before
claiming their functional acceptance or making a new exact Production decision.

## Validation and exclusions

Exercise real source publication/build/Development deployment, failed-activation
recovery, repeated updates and saved release recovery with protected fixtures,
then actual visible DevSetu Production preparation and separately scoped exact
approval. Verify public static bytes, backend readiness, component/source
receipts, original attachments, environments and protected inventories. Do not
claim live acceptance from fixture-only tests.

No customer feature edits, library/runtime upgrades, database migration or
database restoration, permission expansion, external notices or GitHub merge
is authorized by this ADR. Existing dependency risks remain recorded. The final
handoff must distinguish observed live checks from unexercised business flows.
