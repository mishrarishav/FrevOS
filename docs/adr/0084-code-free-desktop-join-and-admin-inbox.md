# ADR 0084: Code-free desktop requests and live admin approval notifications

Status: Accepted for the owner's explicit 2026-11-02 follow-up. Phase 4 remains open.

The owner requests one administrator approval followed by automatic connection,
without carrying a pairing code between browsers. They also request real pending
join notifications in the bell and Control Center dashboard.

The owner's subsequent request adds a visible Connected result and a Windows
desktop connection-status shortcut. It opens a read-only loopback status page,
checks current authenticated server health and displays Offline on failure.
Use the existing private installed runtime and credential boundary, with no
password or device credential in shortcut arguments. Preserve unknown shortcuts;
status viewing must not start or re-pair a connector. This is a desktop shortcut,
not a new tray process or a signed EXE installer.

The standard Windows/Linux flow starts in the installed connector's local
browser page. It collects the requester's own account credentials and consent,
generates/protects its device credential locally, and submits a new/existing-user
join request with immutable device credential/poll hashes, computer name and
architecture. The admin reviews that account AND computer. The same connector
polls with its private proof and redeems automatically after approval. No manual
code, administrator credential, Git/project or second approval is required.
Credentials are not persisted in browser preferences, setup status or audit.
Existing server-side approval, single-use redemption, credential-version and
owner checks remain. A different existing owner is never silently reused.

This supersedes ADR 0071's manual-code UX for new standard desktop requests.
Previously submitted browser/Android requests and explicit advanced registration
retain compatibility; they are not silently converted or reassigned. Browser-only
requests cannot prove a physical computer without its connector: the login page
therefore guides new desktop users to the connector first. Android's native
onboarding is outside this bounded change. Existing paired-device browser login
and ADR 0072's same-browser proof remain; automatic browser sign-in is not claimed.

Use the existing admin-authorized workspace join endpoint for a live bell count
and dashboard card. No username-based role inference or ordinary-user request
disclosure. Polling clears stale results on actor/workspace/access change, never
reports a failed fetch as zero requests, and links to the actual review inbox.
Approval still requires reviewing and confirming the exact request.

Scope: contracts, native join request/poll and wizard, standard desktop guidance,
login-challenge messaging, admin bell/dashboard/inbox navigation, regressions.
Exclude live ownership changes, grants, source publication, Production activation,
new EXE packaging, autonomous notices and unrelated application deployments.
Implement on codex/simple-join-approvals, based on 758d444; the inherited unmerged
release stack stays separate, with no new dependent roadmap phase or auto-merge.

Validate real request/approval/redemption and rejected/changed/foreign proof,
restart/retry, no credential disclosure, old flow compatibility, notification
authorization/staleness and usable desktop/mobile layout. A live release requires
a newly built exact artifact and fresh scoped approval; the earlier Paperclip
artifact does not contain this change.
