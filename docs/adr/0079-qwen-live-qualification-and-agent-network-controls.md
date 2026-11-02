# ADR 0079: Qwen live qualification and stable agent network controls

Status: Accepted for the owner's explicit follow-up, 2026-11-01. Phase 4 remains
open; this is a bounded continuation of the deployed ADR 0062 pilot, not entry
into a later autonomous-agent phase.

Use task branch `codex/qwen-live-qualification`, based on deployed-source
documentation head `d1356d1b0ef95051c00330018ff474b28c2d6732`. The owner requests
gateway enablement, matching configurable token limits, Hindi/latency evaluation
and actual Paperclip compatibility checks. The owner separately reports an
unusable Agents network zoom/pan experience. Keep the predecessor PR unmerged;
do not merge, push a default branch or start a dependent roadmap phase.

The fresh owner endpoint returns authenticated HTTP 200 after the owner starts
Qwen. The existing admission marker is already enabled; do not bypass the host
watchdog or replace that observed transition with an unconditional enable write.
The existing PHP contract accepts at most 256 output tokens and 16 messages,
rejects streaming/tools, and uses the configured upstream alias. Match the
existing DevSetu agents through their revisioned configuration controls rather
than adding a provider-specific default or exposing credentials. Preserve all
other skills, memory, ownership, evidence-source and notification guardrails.
Record the configured timeout and actual provider latency separately.

Expose a bounded, versioned connection-test request option (5 to 60 seconds;
legacy empty requests retain 15 seconds). Keep the probe at 16 output tokens,
with existing authentication, CSRF, ownership, auditing and concurrency limits.
The model dialog lets the operator choose the budget for each connection test;
this is a request option while the page is open, not a stored credential/model
record change. Preserve the on-disk record schemas for rollback compatibility.
Allow the authenticated response socket enough bounded time for the maximum
test budget plus DNS/key resolution; never forge readiness after a timeout.

Use bounded synthetic prompts and deterministic, declared checks. Retain raw
synthetic answers and measured end-to-end latency privately, with no credentials
or customer content. Basic checks are not general intelligence, safety or
production-readiness certification. Record arithmetic/unit errors and missing
information honestly. Completion remains accepted milestone arithmetic under
ADR 0062, never a file-count productivity estimate or an autonomous personnel
decision.

Qualify a pinned official Paperclip runner/adapter in an isolated disposable
environment. No permanent Paperclip installation, new live access/secret grant,
customer repository access, arbitrary host tool execution, or real employee
message is included. A direct HTTP test is not an end-to-end Paperclip run;
report the precise runtime boundary and any incompatibility that prevents it.

For the UI correction, retain the existing configurable identities and
relationships. Default to usable cards, keep the optional network view, fit its
actual graph bounds, and map pointer coordinates through the SVG screen matrix
so portrait/landscape letterboxing does not multiply drag distance. Dragging
must not accidentally open an editor; a click and keyboard selection still
must. Cancel/lost capture ends a drag, explicit zoom/reset remains stable during
background refresh, and no wheel gesture silently changes application zoom.
Validate real browser drag/click/resize and existing frontend checks.

Customer applications, pairing, databases, uploads, environment files, model
weights, runtime resource safeguards and existing secret references are
preserved. Production UI activation and external publication remain separate
scoped actions; no old release approval is reused.
