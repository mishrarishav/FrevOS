# ADR 0051: Close interrupted builds without replay

Status: Accepted for the owner-requested development pilot, 2026-10-23.

A real laptop native build was terminated with Windows task exit `0xc000013a`
while copying a verified baseline. Its durable claim had no receipt; restart
correctly retained `recovery-required`. No artifact or destination job existed.
Keep that evidence and add a versioned, schema-validated owner action to close
only this non-activation case as failed. Bind it to the original actor, request,
exact source commit and declared inspection/change record. Reject any output,
destination job, in-flight build or successful component. Persist the resolution
before closing claims; matching retries finish durable writes without replay.
Destination uncertainty continues to require operator recovery.

Permit an explicitly enrolled local immutable baseline cache. Its digest is
selected by the fresh remote active pointer, and every file is verified before
execution. New build outputs populate the cache for the next build. A cache does
not bypass source pinning, full CI, archive verification, approval or health.
This avoids thousands of VPN filesystem round trips on every native build.

The observed task termination cause remains unproven. Do not describe it as
successful recovery of an activation or silently restart the interrupted job.
