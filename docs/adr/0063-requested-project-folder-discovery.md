# ADR 0063: Locate project folder candidates through bounded metadata requests

Status: Accepted for the owner's clarification, 2026-10-26.

The owner wants an agent to look in Discovery for the laptop/folder associated
with a named project before reporting current changes and plan variance.
Extend ADR 0062's read-only reporting pilot with a typed on-request metadata
search. A project ID must resolve through the verified workspace catalog; the
server derives the display-name query. No arbitrary path, regex or shell.

Use only fresh, owner-enrolled devices with enabled metadata consent and their
observed tracking roots. The collector independently rechecks local consent,
tracking roots, local filesystems, sensitive exclusions and links. Scan folder
names without file contents, independently of watcher exhaustion, bounded by
1000 directories, a 1000-entry queue, two seconds and forty matches. Report
partial coverage, permission/limit gaps and timestamps; absence of a match does
not prove absence of a project. Bound request storage/expiry and workspace/device
ownership at create, claim, completion and read.

Agent requests search at most two eligible devices per selected project. Use
verified plan/source bindings first. Matching folder names remain candidates,
never authoritative repository identity, authorship or completion proof. Keep
percentages/schedule deterministic from accepted plans. Store only redacted
metadata evidence, not raw file contents. No automatic binding, checkout,
initialization, deletion, notices, personnel decisions or permission expansion.
Old collectors remain usable and report that this capability needs an explicit
local update. Do not claim exhaustive filesystem discovery or Linux desktop
acceptance from a metadata test/container.
