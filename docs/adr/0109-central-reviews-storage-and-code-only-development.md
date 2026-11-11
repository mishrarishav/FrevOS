# ADR0109 — Central Reviews storage and code-only development

Date: 2026-11-11 IST

Status: Accepted; central schema/data migration and scoped readback verified.
Final application activation remains owner-operated.

The owner supersedes the earlier local Reviews preview workflow. Do not start
Docker, a local database, an identity stack or a localhost preview service for
this workspace. Application code may run locally only with an explicitly
verified central connection profile. A failed central connection must fail
closed; it must not create a local store, seed account or replacement database.

Reviews uses the installation's existing PostgreSQL database. Migration 0007
adds forced workspace RLS, revisioned JSON documents and append-only migration
receipts. Runtime transactions use the existing application role and workspace
context. Import previews and worker leases share central storage; worker fencing
prevents two application instances from accepting the same completed work.
Developer profiles disable automatic monitoring unless explicitly configured.

The one-time migration selects only the real workbook register, remaps its
structured actors to verified existing workspace members, preserves configured
origins, business fields, link observations and completed reports, and pauses
the imported weekly schedule. Synthetic fixture registers, expired previews and
worker leases are excluded. No users, grants or credentials are created.

The migration executes on the verified Server20 installation, not on the
laptop. Its fixed operator CLI supports read-only inspection and planning before
an approval-bound apply. A full native PostgreSQL dump, a target-state snapshot
and immutable source/mapping copies precede schema/data changes. The selected
plain-SQL export is checked for successful exporter exit, bounded header/footer
completion markers, exact byte count and SHA256. Data import is an
atomic workspace transaction with destination comparison and idempotent receipt.
This is export verification, not a restored-database acceptance test. Receipts
explicitly record `restoreTested: false`. The first custom archive was exported
successfully but pg_restore, including --version, timed out under both minimal
and inherited native environments. Both executables match the pinned vendor
binaries. That attempt stopped before schema/data mutation and its dump, approval
claim and diagnostics remain retained; no security policy was bypassed.

The successful operation is `rmi_70a2b5a11cbb4ebba05c3fbf0978c54e`. It
imports one register, 53 records, 74 endpoints and one report. APP-role readback
matches the planned document hash; existing role/member metadata is unchanged.
Failed attempts retain their claims and artifacts. A fresh operation may reuse
only an explicitly bound, hash-verified private code artifact; its SQL, input,
backup, approval and results stay under its own new migration ID.

The existing database currently listens on loopback. This decision does not
expose PostgreSQL publicly, modify firewall/HBA rules or bypass TLS. A local
application cannot be claimed connected until an approved private database
transport and its identity/TLS checks have actually passed. Other platform file
state also requires its existing central installation context.

The owner retains final application activation. Applying the central Reviews
schema/data does not activate the new frontend/backend. Existing pairing,
environment files, deployed application, IIS routing and unrelated records are
outside the migration write set.

Execution evidence and final verification are recorded in
[Current State](../CURRENT_STATE.md) and the central migration runbook.
