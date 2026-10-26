# ADR 0060: Bound discovery noise independently of useful activity

Status: Accepted for the owner's explicit request, 2026-10-26.

This bounded Phase 4 pilot correction stacks on deployed source
`1d79cc26fd41ebf178e1ade8a76f1f595cd15997`, branch
`codex/discovery-activity-noise`. Preserve preceding result documentation.
The owner reports L-1465 monitoring successfully but tooling imports overwhelm
file activity. Implement Work, Temp / Cache / Tooling and All views; configurable
classification paths, summary interval, noise retention and quota; bounded
collector processing and truthful loss/resource evidence. These labels classify
paths, not employee work or completion. Existing secret exclusions and local
consent continue to apply before classification; no new content collection.

Keep legacy observation/event records readable by the preceding release.
Store revisioned activity settings and optional collector metrics in separate
files. Legacy collectors immediately benefit from server-side segmentation,
quotas and display summaries. Summaries count retained notifications, not edits;
group only matching path/kind/source/attribution without combining text versions.
Noise must not evict the separately reserved Work history. Global event/byte
limits still apply. Disclose that full legacy local spools may already lose work.

Collector changes require an explicit local package update: the currently
installed release has no unattended updater. Preserve the device credential,
task identity, consent and monitoring data. Verify old/new exact runtime file
sets and hashes, protect recovery material, stop only the verified owned task,
replace atomically with recovery on failure, and resume the same device. Never
silently broaden privileges, replace a foreign task or create a new pairing.
This does not authorize a remote execution/update channel or claim the owner's
other laptop has updated. No global execution-policy changes.

Use configured DevSetu publication/build/deploy for platform rollout and verify
the exact downloadable Windows package. No customer source/data, Production,
database writes, cleanup of user files, notice/email or later roadmap work.
