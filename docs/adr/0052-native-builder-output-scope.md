# ADR 0052: Short, enrolled native release output

Status: Accepted for the owner-requested development pilot, 2026-10-23.

The first native isolated checkout passed CI but Windows PowerShell refused to
copy the immutable dependency baseline into its deeply nested output: a path
exceeded MAX_PATH. Keep source and baseline pinning; do not relax filesystem or
integrity policy. Enroll an existing, plain, specific short output directory on
the native builder. Pass it only from private local configuration to the sealed
packager. Reject output receipts outside that enrolled directory. The source
checkout still owns its receipt and all source/inventory checks remain intact.

The executor installer also copies every fixed operator sidecar required by the
native packager. Existing enrolled workers receive a bounded file/hash upgrade
with credential and public binding unchanged. No failed job is replayed, and no
manually generated diagnostic artifact substitutes for a pipeline artifact.
