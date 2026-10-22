# ADR 0040: Portable developer connectors and one-click source publication

Status: Accepted for the bounded Windows Servix development connector pilot.
Date: 2026-10-21.

## Context

The owner superseded ADR 0039's manual commit/push requirement. The desired flow
is edit locally, select a developer device in FrevOS, then click Deploy once.
The owner clarified that "add" means inviting developers into FrevOS, not Active
Directory. A replacement laptop must work after downloading and pairing the
connector; sharing the owner's Windows credentials is excluded.

## Decision

Implement a downloadable Windows connector using the existing Git executable and
the packaged Node runtime. Installation is per Windows user, with no administrator
requirement. The user selects their local checkout during setup. Verify repository
identity against the server-owned Servix profile, not the selected path alone.
Reuse existing local authentication, workspace authorization, password hashing,
Git and the Servix preservation deployment operator.

Pair each device to one authenticated user, workspace and source repository.
Store its credential under Windows user DPAPI; retain only a digest on the server.
Allow listing and revoking devices. Polling and results recheck membership and
bind jobs to their original actor/device/request. Another user's device must never
be selected implicitly. Offline devices fail closed: do not silently deploy an
older pushed commit. Expiring requests, durable local claims and server receipts
prevent retries from duplicating commits or deployments.

Deploy stages and commits non-ignored local changes and publishes the exact commit
to server20. Source publication uses an authenticated, bounded Git bundle endpoint;
developers receive no administrative SMB credentials, target credentials or shell
execution API. Verify the bundle, expected base and commit ancestry before moving
the central development ref. Never force-push, reset a developer checkout, merge
conflicts automatically, or push an ordinary default branch. Conflicting or stale
checkouts stop with a useful error. Existing uploads, environment files, database
files and server21 production remain outside the code deployment boundary.

Workspace-owner-created, expiring invitations provision a new developer account
with fixed project read/write scopes. Invite redemption cannot overwrite an
existing account or elevate a developer to administrator. Invitation links/codes
are returned only to the inviting owner, never logged or sent externally by the
agent. New developers choose their own passwords.

## Consequences and alternatives

The laptop and its network/VPN must remain available until source publication
finishes. Build and activation then run independently on server20. Windows is the
first supported connector platform. Generic project onboarding, other operating
systems, production deployment and automatic backend dependency releases are
separate work. The current HTTP origin remains the owner's explicit internal-only
choice; do not add an internet-facing connector endpoint or change firewall rules.

Rejected: hardcoded laptop paths, polling an administrative share on every
developer machine, shared passwords, arbitrary command queues, defaulting to any
online developer's checkout, and claiming the manual-push pilot already supports
one-click local source publication.

See [ADR 0039](0039-server20-servix-git-dashboard.md) for the previous deployed flow.
