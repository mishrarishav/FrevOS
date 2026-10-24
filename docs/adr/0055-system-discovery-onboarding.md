# ADR 0055: Configurable system onboarding and project discovery

Status: Accepted for the owner-requested bounded development pilot, 2026-10-24.

## Scope and authority

The owner approved Windows, Ubuntu/Debian and RHEL/Rocky Linux; prerequisite
review, selected installation and recheck; all local drives' file activity;
selected folders' text history; and a separate Discovery workspace. The owner
also approved DevSetu as the authoritative client/PO/project-plan record and
delay alerts/reports only. IMAP and other systems' APIs are future supporting
evidence sources. No mailbox credential, actual mailbox connection, outgoing
notice, justification request or disciplinary action is authorized by this ADR.

This task is explicitly stacked on the already deployed pilot source
`a97a076446fa299556d6d75473721fb199eb984b`, branch
`feature/system-discovery-onboarding`. Preserve the two existing final-result
documentation edits. This is the owner's continuing pilot change plan, not a
claim that the unmerged general roadmap phases 4, 12, 15 or 16 have exited.
ADRs 0040 and 0053 are superseded only where they restrict source connectors and
supported local-development recipes to Windows, once the Linux execution path
has actual acceptance evidence. Existing Windows-only destination/native
activation recipes remain explicitly Windows-only.

## Contracts

Use existing workspace authentication, CSRF, actor-owned connector enrollment,
repository identity and revisioned business tools. A local path alone never
establishes a project binding. Do not expose arbitrary install commands, shell,
remote file access, package sources or unrestricted process controls.

Installer checks derive requirements from bounded local manifests and reviewed
configuration. Show detected OS/tool/version, required version, package source,
privilege and proposed action before installing selected allowlisted tools.
Install consent is local, single-use and bound to the exact preview; recheck
afterward. Do not silently elevate or alter system audit policies. Dependency
installation and credential/enrollment remain distinct actions. Preserve working
applications and existing pairing/task definitions during upgrades.

System observations include sample time, CPU/RAM/disk, OS, tool readiness,
coverage and gaps. All-local-drive tracking is a requested scope, not a promise
of complete evidence: report inaccessible paths, watch limits, overflow,
disconnect and missed history. Never follow links across an enrolled boundary.
Exclude pseudo/network filesystems, credentials, application agent storage and
other configured sensitive paths. Keep bounded local buffers and explicit
retention. Content history is opt-in for selected folders, bounded text only,
with sensitive files excluded and redaction before persistence and presentation.
Never persist a raw environment file or secret as history.

Filesystem notification does not establish the acting user/process. Display
unavailable attribution unless a verified OS audit event supplies that evidence;
never substitute the assigned developer or connector account. Privileged audit
collection requires its own explicit enrollment/permission review. Agent restart
and scan baselines cannot reconstruct edits made while collection was down.

## Project delivery evidence

Bind client/project/PO/milestones/responsibility to workspace-verified records
and enrolled device/repository/folder references. Use weighted accepted
deliverables for completion and due dates for planned completion; expose missing
plan, freshness and evidence. File counts/lines, CPU use, emails and developer
presence never determine percentage complete. Manual acceptance records retain
the authenticated author and revision. Delay reports are advisory and include
their calculation inputs. They do not send notices or take employment action.

Mail, repository text and imported API content are untrusted evidence and cannot
approve work, alter authority, send communications or run tools. A future IMAP
integration needs read-only account scopes, opaque secret references, mailbox
allowlists, retention, redaction, identity matching, provenance and explicit
connection approval; receiving mail does not automatically accept a milestone.

## Delivery and verification

Deliver in dependent bounded slices: typed/durable evidence and project reports;
local discovery/health and the separate page; selected prerequisite installation
and cross-platform connector packaging/execution. Keep the deployed Windows flow
available throughout. Each slice records actual tests and remaining targets;
configuration or mocked platform detection alone is not OS support. Do not claim
full Linux desktop/systemd/audit acceptance from an ordinary Docker container.
Before pilot activation verify the immutable package, source/destination scope,
existing applications and pairing preservation. Production, server21, permission
expansion, mailbox enrollment and external messages remain separately gated.
