# ADR 0056: System identity, folder browsing and generic local preview

Status: Accepted for the owner's reported pilot corrections, 2026-10-24.

The owner reports duplicate L-1770 systems, broken/missing folder selection,
incomplete D: navigation and local preview that appears Servix-only. This bounded
correction is explicitly stacked on deployed
`fd89278b8484d76fe9d291bbc191ec6bc5d7e812`, branch
`feature/system-folder-workspace`. Preserve the final Discovery result docs.
Phase 4 exit and the eventual chatbot/mail/notice vision remain outside this fix.

Supersede ADR 0055's connector-row presentation with one system presentation per
authenticated account and reported installation identity. Obtain a salted digest
of an OS installation identifier locally; never transmit the raw identifier.
Unavailable identity means separate unverified source rows, never hostname-only
merging. This identity groups presentation only: it does not grant permissions,
combine credentials, move project bindings or authorize actions on another
source. Existing per-project enrolled workers/pairings remain explicit.

Add a versioned directory-metadata browsing tool. It lists only immediate folder
names from enrolled, consented local drives or the verified project root, with
pagination, freshness, explicit inaccessible/excluded states and bounded durable
requests. Bind every request/result to its authenticated workspace/account,
device, local root, revision and expiry. Verify scope and reject links/mount
escapes again on the agent. No file read, content download, shell command or
filesystem mutation is exposed. Directory browsing is independent from watch
coverage and cannot imply every descendant is continuously tracked.

Allow reviewed priority folders within approved local roots to be selected in
tracking configuration so the finite watch budget can cover the owner's chosen
folders before broad-drive scanning. Selected text history remains opt-in and
restricted to the verified project's permitted relative folders. Preserve
exclusions, retention, actual audit attribution, dropped-event/gap reporting and
local consent. Do not silently elevate or change filesystem/audit permissions.

Discover generic local services through bounded nested project/workspace folders,
with configurable discovery limits, rather than customer names or fixed paths.
Expose local-development navigation for every registered project/binding and
explain missing candidates/setup. Reuse revisioned Start/Stop/Restart, environment
CRUD, process identity checks and development/production-read-only safeguards.
Do not start DevSetu/customer backends against unverified databases during tests.
No Production/server21 deployment, external communication or new credential
lifecycle is included. Validate the real directory/identity/runtime path and
responsive UI before any configured pilot rollout.
