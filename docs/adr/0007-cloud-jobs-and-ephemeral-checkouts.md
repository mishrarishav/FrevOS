# ADR 0007: Persist jobs and isolate repository execution in cloud workers

- Status: Accepted
- Date: 2026-08-09

## Context

FrevOS must operate from mobile devices without requiring a user's laptop or
browser to remain connected. Repository commands and dependencies are untrusted,
long-running work can fail, and concurrent customer projects must not share
credentials or writable filesystems.

## Decision

Task and job state is persisted by the control plane. Cloud workers claim
bounded jobs, use a fresh isolated workspace, obtain only short-lived
job-specific credentials, check out an authorized pinned repository revision,
run allowlisted work with resource and network limits, upload redacted evidence,
and clean up according to explicit retention policy.

Client disconnect, browser close, logout, or temporary worker loss does not erase
the task. Retries use idempotency and resume rules so an external side effect is
not accidentally duplicated.

Local checkout paths are never durable project identity. Workers do not receive
control-plane secrets, host sockets, arbitrary Production access, or credentials
for unrelated workspaces.

## Consequences

- A persistent queue/state machine and worker-heartbeat strategy are required.
- Cancellation, retry, timeout, evidence retention, and orphan cleanup need
  explicit semantics.
- Isolation and bounded egress increase infrastructure cost and complexity.
- Users can supervise work asynchronously from desktop or mobile.

## Rejected alternatives

- Running work only in the user's browser or laptop.
- Reusing a permanent writable checkout across customers or tasks.
- Identifying a project by its worker filesystem path.
- Granting workers long-lived, multi-project credentials.
