# ADR 0059: Approve a computer without sharing the administrator password

Status: Accepted for the owner's explicit password-sharing objection, 2026-10-25.

Bounded correction on deployed `e8716d71631136ebc4fa2b54dde3a68de1e10977`,
branch `codex/passwordless-system-pairing`. Preserve the preceding result docs.
Supersede ADR 0058 only where default setup requires account/password entry.
Phase 4 exit, Production, customer source/data and project permissions remain
outside scope. Use the existing configured DevSetu publication/build/deploy flow.

Default Windows setup proposes a system-only device and shows a short lookup
code. An authorized user approves that exact computer in their existing DevSetu
browser session, including when that browser is on another computer. The installer
never asks for an administrator's password. The short code alone cannot approve,
obtain a credential, change the target or grant project/deployment access.

Generate the device credential and a separate polling proof on the client.
Persist them only with CurrentUser DPAPI in the protected device directory;
send hashes during proposal. The server stores no recoverable device credential.
Bind approval to actor, workspace, purpose, target device/hash, correlation,
ten-minute expiry and one enrollment. Persist intent before creating the scoped
device. Deny collisions, changed targets, expired/rejected proposals, unauthorized
actors and duplicate ownership. Retry an interrupted approved action idempotently.
Retain an immutable consumed approval receipt and never reassign its actor.

Require authenticated workspace authorization and CSRF for lookup/approval.
Bound public proposal/poll traffic and storage; use the separate polling proof,
not the short code, for local status. Keep file activity an explicit local choice
and matching server policy. It never grants content history or execution.

Resume an existing protected system connection without browser credentials,
using its existing device scope and verified task/runtime. Preserve existing
account-based and per-project setup as compatibility paths. Show Connected only
after an authenticated heartbeat and fresh health report. No code/token/password
in URLs, logs, traces, screenshots or reports; tests use isolated synthetic data.

Validate expiry, target/actor/workspace scope, replay, poll-proof isolation,
interrupted persistence, real DPAPI/task resume, browser approval and the exact
downloaded package. No real invitation/email or device approval is sent by tests.
