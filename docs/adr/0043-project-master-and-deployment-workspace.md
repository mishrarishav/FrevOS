# ADR 0043: Project master and deployment workspace

Status: Accepted for the owner-requested development UI task, 2026-10-21.

The owner supplied HRMS Applications card/table screenshots and requested the
same interaction pattern for FrevOS. This supersedes ADR 0042's navigation and
single-form presentation; its authorization and destination limits still apply.
Related decisions: [ADR 0042](0042-project-deployment-settings.md) and
[ADR 0040](0040-portable-developer-connectors.md).

Projects owns deployment configuration as master data: searchable records,
create, view/edit, revisioned archive and restore, preserved paths, connector
installation and testing. Archiving hides deployment actions without deleting
configuration history, application files, credentials or retained artifacts.
The old setup URL remains a supported alias. Other workspace project operations
remain available; deployment profiles do not replace their repository records.

Deployments lists the same active profiles in card/table views, with shared
business action handlers, badges, source device selection, progress and history.
Only the existing approved Servix adapter has enabled deployment/rollback.
Unconnected profiles remain explicit and do not acquire arbitrary target access.
The supplied screenshots guide density, persistent controls and scrolling, while
the existing FrevOS theme and tokens remain authoritative.

Choose folder is a device-owned, expiring operation initiated by its signed-in
owner. The connector opens a local Windows picker, verifies an existing checkout
against its installed repository identity, and updates only its own DPAPI
configuration's checkout path with a backup. It runs no supplied command, accepts
no remote filesystem path, modifies no Git state, and refuses concurrent source
publication. Cancellation, timeout, revocation and stale diagnostics stay visible.
The browser never claims access to a local absolute path from a file upload.

Scope excludes generic destination adapters, Production, customer-app deployment
for UI acceptance, secret editing, new credentials, external invitation sending
and Phase 4 exit. Work is stacked on the owner's existing uncommitted branch in
the servix-dashboard worktree; no commit, push or merge is implied.

Alternatives rejected: retaining a separate setup rail keeps configuration outside
the requested project master; hard deletion loses useful revision history; browser
directory uploads do not provide the installed connector's absolute Git checkout
binding. The consequence of the selected design is one shared record workspace
with separate configuration and deployment actions, plus a one-time per-user
connector installation for local folder access.
