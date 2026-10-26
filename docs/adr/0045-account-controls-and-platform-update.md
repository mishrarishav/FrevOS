# ADR 0045: Account controls and platform update

Status: Accepted for the owner-requested server20 pilot, 2026-10-22.

The owner requested a working project close action, accessible System connector,
logout, local password change, administrator user management/reset, and use of
DevSetu itself to activate server20 updates. These extend ADR 0044's display-only
scope with specific account and self-update capabilities. The Phase 4 exit remains
incomplete; this does not authorize unrelated providers, Production customer apps,
schema changes or generic privileged command execution.

Form identity belongs to the selected persisted record, separate from the editable
project ID. Dirty state compares against the opening snapshot, including new-form
defaults. Clean forms close immediately; edited forms offer Keep editing or Discard
and close. Project editor content owns one normal-flow scroll region, so the System
connector cannot shrink to a clipped heading. Existing backend preservation remains.

Reuse existing local credential hashing, login lockout, workspace membership and
session storage. Expose safe account metadata and a workspace-local user list only.
The existing server20 owner identity may reset a member's password after confirming
the owner's own password. Self-change requires the current password. Recheck the
session and credential version under transaction locks, replace the salted scrypt
digest, clear target lockout and revoke the target's browser sessions atomically.
Persist password-free intent/outcome audit records. Existing passwords cannot be
viewed: readable storage/recovery was rejected. Typed password fields may be shown
locally by their user. Existing developer invitation/pairing flows are reused; no
invitation or live password change is submitted during acceptance.

Self-activation runs outside the restarting web process. A fixed SYSTEM updater
accepts only a fresh authenticated server20-owner request for one operator-sealed,
artifact-bound candidate. Catalog, authorization, worker and operator files are
administrator/SYSTEM-owned; the web process can write request files only. The
updater verifies candidate, previous release, script digest, expiring approval and
current release before invoking the existing bounded server20 activation workflow.
Claims prevent replay; terminal receipts survive restart. An interrupted claimed
operation is reported failed/uncertain unless an exact successful activation
receipt and active pointer establish completion. No supplied commands/paths are
accepted. Existing application-data preservation and recovery remain in force.

One initial operator bootstrap is necessary because the prior release exposes no
self-update endpoint/worker. That bootstrap keeps the prior UI/account composition
and adds only the authenticated maintenance page and independent updater. The final
UI/account fixes must then be activated with Deploy DevSetu in the actual server20
application. The current bounded self-update consumes a prepared, locally built
artifact; automatic publication/build of arbitrary future laptop edits is separate
work and must not be claimed complete by this activation test. The older maintenance
prototype in the root checkout is not silently merged.

Related: [ADR 0044](0044-devsetu-display-branding.md),
[ADR 0043](0043-project-master-and-deployment-workspace.md),
[ADR 0040](0040-portable-developer-connectors.md).
