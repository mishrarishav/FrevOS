# ADR 0085: Extend the simple approval pattern to Android and Linux launchers

Status: Accepted for the owner's explicit subsequent 2026-11-02 request.
Supersedes ADR 0084's exclusion of Android native onboarding only. Phase 4 stays open.

Apply the same connector-bound account request, one administrator approval and
automatic local redemption to Android ARM64/x64, with mandatory health-only
consent and file activity disabled. Preserve existing Android Keystore identity,
signing key, permission boundaries and legacy pending requests. Native Android
notifications/foreground-service consent remain OS-controlled. Approval is not
permission to bypass those prompts or remotely start the app.

Show Connected only after a fresh successful health sync. An installed app and
paired credential alone are not evidence of online presence. Reopened pending
requests resume by private proof, with no saved account password. Surface expiry,
rejection and revoked authorization honestly.

Linux uses the desktop wizard from ADR 0084 plus a per-user application launcher
for the existing connector's read-only live status. Windows uses its desktop
shortcut; Android uses its existing launcher and foreground status notification.
No Linux root service, remote command, location, personal-file collection,
automatic administrator role or background installation is added.

Include platform-contract, wrong-proof/binding, private-state, lifecycle and
status checks. SDK compilation and actual device/desktop acceptance must be
reported separately. No live role change or Production activation is authorized
by this local implementation step.
