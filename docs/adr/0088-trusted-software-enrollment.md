# ADR 0088: One-time trusted software enrollment and one-action admin installs

Status: Accepted for the owner's explicit 2026-11-03 UX correction.
Supersedes ADR 0087's repeated local confirmation requirement for devices whose
user explicitly enables trusted approved-software management at setup.

The owner requests one-time consent rather than repeated DevSetu permission
dialogs. Record device-local opt-in once, separately from existing monitoring
pairing. An administrator's explicit Install action on a reviewed catalogue
entry creates and atomically consumes a fresh, target/workspace/actor/request/
artifact-bound approval record; there is no separate admin approval dialog.
The request includes the catalogue package digest the browser actually reviewed.
Ordinary users submit requests for an administrator to approve. Neither role
gets an unrestricted remote shell or arbitrary command/argument editor.

The enrolled connector may execute only these approved catalogue jobs while its
trusted-management consent remains enabled. Recheck local consent, administrator
authority, current catalogue digest and exact job approval immediately before
execution. Preserve consumed receipts and do not automatically retry interrupted
installs. Revocation disables future execution. OS installer/privilege/license
interaction remains native; monitoring enrollment does not imply elevated OS
rights. No privilege escalation, privileged broker enrollment or silent change
to existing enrollment is authorized by this UX decision.

Production activation, secret lifecycle changes, new broad permissions and
other protected operations retain the repository's exact human approval rules.
This is scoped enrollment authorization plus explicit per-action admin intent,
not a generic approve-everything bypass. Existing credential and data retention,
fixed demo recipe, private preview isolation and bounded native validation remain.
