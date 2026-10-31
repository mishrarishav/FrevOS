# ADR 0066: Canonical executable identity for initial runtime adoption

Status: Accepted for the owner's bounded Production deployment, 2026-10-27.

## Context

The actual ADR 0065 preparation stopped safely before backup or cutover. The
existing Node 20.11.1 executable is reached through the version manager junction
`C:\Program Files\nodejs` to `C:\nvm\v20.11.1`. The customer data inventory has
no observed links. Rejecting links in the configured executable path correctly
prevented an unpinned runtime; accepting all filesystem links would weaken the
preservation boundary.

## Decision

Supersede ADR 0065's literal executable-path comparison only. Configure the
existing canonical executable path in the reviewed target registry. Do not
install, upgrade or relocate Node, change environments or alter the junction.
Resolve the observed process executable as data and require exact canonical
identity with that configured plain file. Never execute the observed alias.
The deterministic resolver returns its SHA256; the existing preparation,
review, staging and startup checks continue to pin the executable bytes and
version. A different canonical file is rejected even when its bytes match.

Preserve every existing link denial for customer source, data, protected
inventory, staging, operator files and the configured canonical executable.
Target registry changes require a new observation and approval; the failed
preparation is never replayed as an activation.

## Validation

Exercise a real version-manager-style directory junction, the actual helper CLI,
same-file acceptance, different-file and missing/relative-path rejection, and
continued rejection of links in configured executables and protected inventory.
Run native syntax before publication and the normal configured pipeline CI gate
before platform activation, then repeat actual Production preparation. This does not authorize
a new task credential, batch-logon grant or Production cutover by itself.

Related: [ADR 0065](0065-configured-saved-backend-production-promotion.md).
