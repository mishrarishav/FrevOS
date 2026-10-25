# ADR 0058: Pair the computer before its projects

Status: Accepted for the owner's reported installer failures, 2026-10-25.

The owner cannot connect a fresh laptop: mandatory project/Git selection defaults
to Servix, downloaded PowerShell helpers fail before the browser opens, and tool
installation hides its result behind busy-looking disabled controls. The owner
explicitly requests a simple working connector. This bounded correction stacks
on deployed `a9cdebbe7cc7085451405beae8152972fed3c66b`, branch
`codex/system-first-pairing`. Preserve preceding final-result documentation.
Phase 4 exit and Production activation remain outside this work.

Supersede only ADR 0055's mandatory project-first enrollment. The default Windows
setup connects an authenticated account's computer without a repository, Git or
project checkout. Health begins independently; metadata activity needs explicit
local consent and enabled server policy. Existing per-project connectors remain
compatible. Project connection stays an explicit later action with existing
repository identity, default-branch, environment and deployment safeguards.

Mark system-only credentials explicitly. They cannot publish/seed/download a Git
repository, execute local development commands, change environments, choose a Git
checkout or appear as a deployable project source. Do not invent a repository or
silently bind an unassigned machine to Servix. Scope health, metadata, directory
requests and revocation to the authenticated workspace/account/device. No text
history is accepted until a verified project binding authorizes it.

Use a browser setup with visible phases, safe error codes, retry/status after
refresh and an observed first heartbeat. Credentials stay in memory/private
pipes and CurrentUser DPAPI; never URLs, logs or screenshots. Reuse the owned
scheduled-task lifecycle. Handle downloaded files without changing global
execution policy or requiring Git installation for monitoring. Keep explicit
project setup available separately; do not initialize, empty or overwrite an
existing customer folder automatically.

Validate account/device scope, monitoring without Git, denied project actions,
consent, restart/retry, actual Windows task/DPAPI and downloaded-file behavior.
Retain existing source/preview/deployment regressions. Use actual configured
platform publication/deployment for rollout; report any unverified target.
