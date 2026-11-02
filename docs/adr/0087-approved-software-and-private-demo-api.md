# ADR 0087: Approved software management and private demo API

Status: Accepted for the owner's explicit 2026-11-03 follow-up. Phase 4 stays open.

The owner requests configurable software inventory, approved software installation
and a live L-1465 to L-1770 VPN HTTP preview test. The owner selects a separate
temporary demo API and excludes existing projects from that test. This bounded
stack is based on deployed source 27f85a7 and delivery commit 79b5a20; it does not
authorize a default-branch push, self-merge or unrelated customer deployment.

Reuse verified workspace membership, Discovery owner/admin visibility, opaque
connector credentials, CSRF, immutable typed jobs and durable audit. Inventory
covers Windows installed-program registry entries and current-user app packages,
or Linux package-manager records. State the collection scope, time, truncation
and unavailable/unsupported results; an empty failed scan is never an empty
computer. Android package collection/installation is outside this desktop task.

Provide an administrator-managed versioned package catalogue. An install pins
one device, actor, workspace, request, package revision and artifact SHA-256.
Only fixed installer recipes are supported; requests cannot supply a command,
arguments, shell, arbitrary executable path or service name. Require fresh
single-use administrator approval and local computer confirmation before install.
Do not grant privilege automatically; native installer/OS authorization remains
with the computer's user. Recheck role, active pairing, consent, artifact and
audit before execution. Persist a consumed local receipt before launching; an
interrupted install needs reconciliation rather than automatic repetition.

Inventory and approved-software operations use a separate explicitly consented
connector capability. Existing monitoring enrollment alone does not grant it.
Keep pairing credentials, existing projects, environments and files untouched.
Update runtime manifests, supported native updaters and installer packaging
together; older connectors are visibly unsupported until updated.

Retain ADR 0075's isolated private origins, bounded request/response transport,
one-use bootstrap, per-request authorization and no public exposure. Add only a
fixed bundled demo-API recipe with configurable nonprivileged loopback port and
short lifetime, pinned to its bundled program digest. Its approval/consent and
fresh owned process are required for software-demo preview; do not relax ordinary
system-connector restrictions on project execution. No arbitrary repository or
script can be substituted for the bundled demo. Explicitly configured software
targets may use this separate bounded provider; legacy project targets retain
their current checks. Stop the temporary demo after live GET/POST/response tests.

Prepare and review the exact source/artifact, preservation snapshot and native
Plan before requesting final artifact-bound Server20 activation and any new
software capability/install approval. Native Windows and Linux adapter evidence
does not substitute for actual L-1465/L-1770 acceptance. Record missing local
update/consent or VPN access as incomplete, not a successful live test.
