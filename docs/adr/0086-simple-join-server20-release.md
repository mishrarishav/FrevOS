# ADR 0086: Release the simple connector flow to Server20

Status: Accepted for the owner's explicit 2026-11-03 deployment follow-up.
Phase 4 remains open. Supersedes ADRs 0084/0085's local-only delivery boundary
for this release, retaining their authorization and device-consent constraints.

The owner requests a new DevSetu release on Server20 with the current Windows,
Linux and Android installers, preserving existing pairing, data and `.env`.
Freeze the reviewed simple-join implementation on `codex/simple-join-approvals`
as a committed source candidate. Local source commit and release preparation
are necessary parts of this request; default-branch publication, self-merge,
unrelated customer applications and a new permanent agent service are excluded.

Use the existing registered DevSetu workspace/profile/repository binding and
enrolled native builder, SDK and independent updater. Fresh observation confirms
the active manifest is `b0c300090e9423d4583dd5a386460b2bf5f1b9136bc6c8dd650331a7a3e5d24d`.
Capture fresh protected settings and pairing identity/credential baselines;
do not reuse the older Paperclip snapshot or its different prepared artifact.
Native build must run the unchanged complete CI on the exact frozen source and
obtain a newly signed Android APK from the existing Server20 SDK/certificate.
Verify all package files, source inventory and installer payload provenance.

The deployed API still lacks build-only. As in ADRs 0079/0081, use only the
existing enrolled native build boundary during preparation; do not submit a
component deploy request that could activate an unreviewed new build. Do not
claim this compatibility preparation is a control-plane build-only pipeline run
or that an unperformed GitHub/central-source publication occurred.

The authenticated DevSetu maintenance workflow must activate the same prepared
digest after exact manifest/archive/source/target review, a fresh protected
snapshot and native Plan. Existing general deployment intent does not mint an
approval for an unknown artifact: capture a fresh single-use actor/workspace/
action/target/correlation/artifact-bound human approval at that final boundary.
Preserve config, postgres-data, state, servix, git, backups, maintenance and
operator, including environments, pairing credentials and application data.
No migration, ownership transfer, secret rotation or permission expansion.

After activation verify active digest, service health, authenticated UI and all
three served installer downloads against that artifact. New installers are
available centrally; existing remote devices are not silently updated. Genuine
phone and Linux desktop acceptance remain distinct from SDK/container proofs.
Report publication, preparation, activation, preservation and remaining limits
separately. No own-PR merge or default-branch push is authorized.
