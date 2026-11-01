# ADR 0080: Paperclip task bridge for explicitly requested read-only teams

Status: Accepted for the owner's explicit continuation, 2026-11-02.

Continue ADR 0062's bounded agent pilot on `codex/paperclip-agent-bridge`,
based on `738bd1831c020590ba763505a199381aff9dd126`. Phase 4 remains open.
This is not entry into the full Phase 7 or autonomous work lifecycle. The
predecessor PR 42 is unmerged; this follow-up depends on its reviewed source
and must not be independently released ahead of it. No default branch merge
or publication is included in this implementation request.

The owner asks to complete Paperclip integration and explain usable DevSetu
capabilities. Supersede only ADR 0079's qualification-only exclusion for this
new task. Preserve its failed OpenCode qualification as historical evidence.
Qwen's configured non-streaming chat API remains unchanged. DevSetu executes
its existing read-only agents through its protected model gateway. Paperclip
is an optional task-record backend, not a second authorization authority or
an unrestricted local runner. Do not claim native Paperclip CEO autonomy or
OpenCode streaming compatibility from this bridge.

Add an explicitly requested team task: a user selects one coordinator and up
to four specialists they own, plus an optional verified project. Run the
specialists sequentially with their current skills, memory, model and source
guardrails, then synthesize their bounded results with the coordinator.
Persist each step and the final result. A failed, revoked or changed step
stops synthesis. After restart, interrupted tasks are terminal and never
automatically replay external writes or paid inference. Unknown token/cost
usage is displayed as unavailable, never estimated as measured usage.

Paperclip enrollment is operator-controlled, disabled by default and bound
to an exact private service origin/address, workspace, actor, company and
existing passive agent identities. Enroll a separate company per actor;
Paperclip's broader company visibility must not weaken DevSetu's ownership.
Resolve an opaque service-token reference only at the HTTP boundary. Deny
redirects, arbitrary origins, cross-company resources, oversized responses
and active/scheduled Paperclip runners. Share only explicitly selected task
text and sanitized result summaries after a per-task opt-in. Do not copy
model keys, raw file content, memory or Discovery records into Paperclip.
External task/child creation, result comments and status changes have durable
intent/result records. Ambiguous writes stop without automatic retries.

In scope: typed contracts, bounded deterministic orchestration, private
Paperclip task adapter, existing Agents UI controls/history, operator
configuration and synthetic real-service qualification. Out of scope:
autonomous code changes, unrestricted tools, notices, scheduling, production
activation, new live service credentials, broad grants, customer data export
and model/proxy changes. Live service enrollment/secret lifecycle and platform
activation remain separate exact review/approval boundaries. Existing pairing,
environment, databases, uploads, attachments and previous release are untouched.
