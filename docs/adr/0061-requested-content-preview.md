# ADR 0061: Request one redacted file preview with local approval

Status: Accepted for the owner's additional request, 2026-10-26.

Stack this bounded addition on ADR 0060's activity correction. Supersede ADR
0058 only to permit a single explicitly requested file preview from a system
connector without a project binding. This does not enable automatic text history,
grant project operations or broaden the device credential into a file API.

Use a typed, owner/workspace/device/root/path-bound request expiring in ten
minutes. Only fresh enrolled roots are eligible. The updated connector opens a
local consent page identifying the requester and exact file. Approval applies
once to that request; declining, expiry, disconnect, missing approval or an old
collector never authorizes reading. No shell commands, arbitrary network paths,
binary/large files, links, agent state or sensitive excluded files are eligible.
Limit UTF-8 text to 8 KiB and mask secrets before transmitting or persisting.

The browser may show the current approved snapshot and the last retained
approved snapshot for that same actor/device/root/path. Label their timestamps;
these are two observations, not a reconstruction of every intervening edit.
With no prior snapshot explicitly show baseline unavailable. Earlier content
cannot be recovered from filesystem notifications. A completed request cannot
be replayed or redirected. Revalidate device/workspace authorization at claim,
completion and read. Retain redacted requests/results for seven days with hard
global/per-device request limits and one active request per device.

Existing project-selected text history and its consent rules are unchanged.
Do not collect raw secrets or enable automatic notices, audits or privileges.
Validate local consent in a real browser, identity/path/expiry denials, redaction,
baseline availability and updated Windows connector resume. The owner's actual
laptop must explicitly run the verified package update; do not claim otherwise.
