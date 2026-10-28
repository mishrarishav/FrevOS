# Discovery duplicate cards and last seen

Status: implementation checks PASS; configured publication/live verification pending.
Date: 2026-10-29 (Asia/Calcutta).

Repository: mishrarishav/FrevOS, worktree
D:\FREVOS\.local\worktrees\servix-dashboard.
Branch: codex/discovery-system-presence.
Base: 3e97455a43d15edc46bf2f61e6fa5a6364177383.
Resulting commit / pull request: not created yet.

## Scope and evidence

Live Discovery shows ESDS003228SS twice: one monitoring connection with an
installation identity and one legacy project connection with no observation.
ADR 0073 defines provisional owner/name association only when unambiguous,
retaining both enrollments, all history and authorization. Known identity
collisions do not merge. Last seen uses server heartbeat/observation receipt
times, independent of health-source selection. Unknown times stay Not recorded.

This does not delete or reassign any device or grant access. No collector,
installer, customer application, environment, upload or database is changed.
Existing installations do not need a connector reinstall for this correction.
The owner's subsequent Android request is a separate follow-on implementation;
this correction does not claim Android support.

## Observed validation

- pnpm.cmd run build:contracts: exit 0.
- pnpm.cmd --filter @frevos/control-center exec vitest run test/discovery-systems.test.ts test/discovery-api.test.ts:
  exit 0, 7 tests in 2 files.
- pnpm.cmd --filter @frevos/control-plane exec vitest run test/system-discovery.test.ts --maxWorkers=1:
  exit 0, 11 tests in 1 file. Covers legacy heartbeat, never-contacted, stale
  observation with newer heartbeat, service reconstruction and other-owner denial.
- pnpm.cmd run typecheck: exit 0 for all three packages.
- Actual browser, isolated UI fixture: 4 source records render as 3 system cards,
  the legacy/observed pair has 2 preserved connections, absolute time/elapsed age
  appears, never-seen shows Not recorded, table has a sortable Last seen column.
  This fixture is presentation validation, not live backend acceptance.

## Changed files

- apps/control-center/src/DiscoveryPage.tsx
- apps/control-center/src/discovery-systems.ts
- apps/control-center/test/discovery-systems.test.ts
- apps/control-plane/src/system-discovery.ts
- apps/control-plane/test/system-discovery.test.ts
- packages/contracts/src/system-discovery.ts
- docs/adr/0073-discovery-legacy-grouping-and-last-seen.md
- docs/adr/README.md
- docs/CURRENT_STATE.md (includes preserved preceding rollout evidence)
- docs/DISCOVERY_ROLE_ACCESS_HANDOFF.md (preserved preceding evidence only)
- docs/DISCOVERY_PRESENCE_HANDOFF.md

## Limitations and readiness

The first actual configured request pr_f1cd10646530ad2665bd30442c4d5513 publishes
969b8f4344882cb5e3fff9966a75968a0902ffb5. CI passes 81/82 files; the unrelated
unchanged Windows local-development process fixture fails an assertion. No
candidate is activated. Recheck the exact frozen source using the enrolled
adapter's native environment: all four native runtime cases pass, including real
process-tree ownership, loopback binding, preservation and unrelated-listener
protection. Evidence: .local/discovery-presence-native-recheck.json. No test,
timeout or acceptance gate changes. Retry the full configured workflow, retaining
this failed run and its exact-source diagnostic as history.

Hostname association is explicitly provisional; a unique hostname is not proof
of hardware identity. Different owners/lifecycles and distinct reported machine
identities remain separate. No exact disconnect time can be reconstructed.
Source-role checks and original device IDs remain authoritative. Final diff stat,
remaining validation and actual configured release evidence are recorded after
the reviewed source publication. No GitHub push, PR or merge has occurred.
