# ADR 0082: Include team modules in the bounded Server20 delta policy

Status: Accepted within the owner's immediate Server20 release request,
2026-11-02. Supplements ADR 0081; supersedes its assumption that copy-list and
provenance changes alone complete packaging preflight.

The exact published 3633e4c source passes fresh complete native CI: 95 files /
487 tests, unchanged coverage/build/audit gates, exit 0. The existing Server20
SDK signs its APK with the retained certificate. Final packaging nevertheless
fails before archive publication or activation. The private failure receipt
identifies the package phase; the partial package contains the new modules,
source inventory and manifest. Its versioned delta policy rejects all eight
new compiled module paths.

Add only paperclip-bridge to the existing control-plane module names and
agent-teams to the contracts module names. Retain exact directory, extension,
target, integrity and unknown-path checks. A native PowerShell probe changes
from eight rejected intended paths to eight accepted intended paths; an
unapproved module remains rejected. Validate the actual failed package delta
with the corrected policy as well. No wildcard, approval bypass, permission,
dependency, runtime identity or protected-data change is authorized.

Publish the bounded correction on the same task branch, refresh only the
allowlisted builder sidecar with exact preimages and preservation checks, and
build the new frozen source with fresh CI and SDK provenance. Retain the failed
attempt and its successful CI separately. Existing pairing/configuration,
database and application protections remain required. Production activation
still needs the concrete immutable-artifact review and fresh scoped human
approval from ADR 0081. No permanent Paperclip backend enrollment is included.
