# ADR 0065: Configured saved-backend Production promotion

Status: Accepted for the owner's bounded deployment request, 2026-10-27.

## Context

The owner explicitly requests completing the missing Production runner and
deploying Servix through visible DevSetu. ADR 0064's saved destination proposal
does not provide execution. Phase 4 remains open. Existing application code,
installed runtime/dependency versions, uploads, attachments and environments
must be retained.

## Decision

Implement a separate configured saved-backend promotion workflow. Supersede
ADR 0064's configuration-only implementation boundary for this bounded task;
retain its historical result and ADR 0057's legacy Development exclusions.
Use the existing authenticated workspace, CSRF checks, owner identity and
independent Windows worker. No browser-supplied command, credential or runtime
path is accepted. Allowed targets and opaque connection references belong to
reviewed deployment configuration, not project-name conditionals.

Verify a successful saved Development receipt and promote the same descriptor
and backend bundle bytes without source publication, rebuilding or installing
customer dependencies. Prepare a fresh target observation and encrypted database
backup before presenting the exact promotion review. Pin the current process,
owner, Node/environment/database target, source recovery, protected inventory,
runtime helper and artifact digests. Configuration or observation drift requires
new review. The protected worker consumes an expiring actor/workspace/action/
target/correlation/artifact-bound approval once, persists audit before effects,
and never replays an interrupted claim.

Adopt the existing runtime owner and show the scheduled-task/credential binding
and any required batch-logon right separately. Do not silently broaden machine
permissions or switch to SYSTEM. Stop only the exact reviewed process. Preserve
all existing files; use new immutable artifact/runtime directories and an atomic
selection pointer. Health failure may recover only to the exact reviewed saved
selection/source snapshot. Database restore remains separately approved.

## Consequences and validation

Native validation found that PowerShell's ACL provider resolves a domain account
name while applying an already SID-bound private ACL, and fails when the laptop
cannot reach its domain. Apply the same owner/SYSTEM-only descriptor through
the .NET directory API in the backup boundary and existing model-secret boundary.
Keep owner, protected inheritance, allowed SIDs and DPAPI checks unchanged.
The existing native secret round-trip and cross-scope denials remain required.

The visible flow must distinguish preparation, review, execution and recovery
from a generic saved project. Exercise actual worker preflight and isolated
native activation/recovery before calling the adapter ready. Verify live health,
attachments, original and fresh protected inventories after activation. Do not
claim acceptance for untested targets or conceal retained dependency findings.

## Rejected alternatives

- Retargeting the existing Development adapter.
- Rebuilding the backend for Production or installing new app dependencies.
- Private-script activation while presenting only a saved UI configuration.
- Blanket, reusable approval or automatic Production database restoration.

Related: [ADR 0057](0057-servix-backend-build-artifact.md),
[ADR 0064](0064-visible-production-configuration.md).
