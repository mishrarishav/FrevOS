# ADR 0091: Preserve an already-current private preview guard

Status: Accepted implementation detail of the owner's authorized private-preview
configuration and cross-laptop acceptance task. Extends ADR 0089.

The exact owner-approved application source 2f70b82 is live with manifest acce2b5c.
Private configuration Plan succeeds. Actual Apply then fails after staging an
identical compatibility guard for replacement. The operator's recovery restores
the absent configuration; the guard remains byte-identical and application
health is 200. No original native exception was persisted, so the precise ACL
or replacement error is not claimed. Both guard hashes are identical.

The configuration operator must skip replacement when the existing guard already
matches the active manifest. Retain integrity, authority, expiry, preimages,
configuration recovery and unchanged task/runtime/root-permission checks. Restore
the guard only when this operation changed it. Report whether it changed, and
retain only fixed exception type/line metadata for future recovery diagnostics.

Qualify real Windows files, a read-only identical guard and failed-start recovery.
Freeze the operator in a dedicated task commit. The authorized configuration
operation selects those exact operator bytes by digest through the existing
schema-bound v2 transport and actual maintenance receipt authority. This is a
scoped operator repair, not another application activation or an in-place edit
of the approved application release. The active manifest remains unchanged.

No new permission, DNS/firewall rule, credential or arbitrary remote command is
introduced. L-1465 data and pairing stay protected. Complete the real browser
GET/POST and owned-demo cleanup before claiming VPN acceptance.
