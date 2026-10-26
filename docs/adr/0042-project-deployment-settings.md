# ADR 0042: Project deployment settings and connector diagnostics

Status: Accepted for the owner-requested development setup task, 2026-10-21.

The owner requests a visible setup page for project source folders, destination,
preserved attachments, connector installation and a read-only connection test.
This supersedes the hidden-settings experience of ADRs 0039 and 0040 without
granting arbitrary remote command or Production authority.

Settings are workspace-scoped, owner-editable, strictly parsed, revisioned and
retained with immutable prior versions. Installation selects a local folder in
the Windows folder picker. Connector diagnostics attest the actual repository
path, origin, HEAD and branch from the installed device; a heartbeat alone is not
a successful source test. Repository identity and device ownership remain bound
to the selected profile. Tests perform no commit, push, build or deployment.

Servix retains its approved server21 development adapter. Custom preserve paths
are literal project-relative paths, applied to both code replacement and obsolete
file removal, including saved-release restoration. Existing mandatory protections
cannot be removed. Configuration cannot silently retarget this privileged adapter.
Other project profiles may be saved and connected to their own source devices;
they remain explicitly not deploy-ready until an applicable destination adapter
has been connected. Saving configuration or receiving a heartbeat does not create
remote credentials, provision IIS, install dependencies or authorize deployment.

Scope excludes Production, arbitrary command editors, secret values in forms,
customer DB migrations, automatic installation in a browser without a local user
action, and changes to the sibling unified-deployment worktree. Existing local
uncommitted work is preserved on the stacked feature/project-deployment-settings
branch. This task does not declare Phase 4 exit or whole-product readiness.
