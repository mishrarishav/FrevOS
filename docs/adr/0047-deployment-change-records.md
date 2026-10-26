# ADR 0047: Deployment change records

Status: Accepted for the owner-requested development pilot, 2026-10-22.

Deploy, rollback and saved-build restore require a confirmation popup containing
the change message and declared approver/name/reference. The server separately
records the authenticated requesting actor. A typed approval name is context,
not proof that this person approved, and does not grant or bypass authorization.
Existing actor/workspace/target/artifact approval checks remain in force.

New API requests require bounded validated context; historical records can omit
it and display an explicit older-record message. Context is immutable for the
request identity and survives status changes/restart. Duplicate retries must
match it. Cancel does not submit. Unconfirmed retries retain the same target,
device, details and request ID. A restore never falls through into new deployment.

Servix source publication carries the context into the selected device job and
actual Git commit. A capability heartbeat prevents an older connector from
silently omitting the message. Rollback changes no Git history; its context stays
in the deployment record and activation approval file. Preserved data rules remain.

The platform updater uses the same context with an authenticated confirmation.
A write-once context sidecar selects one request identity before publishing the
compatible seven-field native request. Raced/retried writes cannot alter context.
Existing native worker/authorization scope remains unchanged; no platform source
commit/build pipeline or self-service rollback is added. No schema migration.

Related: [ADR 0045](0045-account-controls-and-platform-update.md),
[ADR 0046](0046-devsetu-managed-project.md).
