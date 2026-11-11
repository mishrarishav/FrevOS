# Central Reviews migration

Verified 2026-11-11 04:48 IST: operation
`rmi_70a2b5a11cbb4ebba05c3fbf0978c54e` applied SQL 0007 and imported the
real register into the existing Server20 database. Fresh APP-role readback is
one register / 53 records / 74 endpoints / one report, with the exact planned
document hash. Existing active users/role attributes are unchanged. The imported
schedule is paused; final app activation remains with the owner.

The protected operation retains `backup/before-0007.sql`, source/mapping,
`target-before.json`, receipts and inspection/apply results. The complete SQL
export is 206,737 bytes; SHA256
`3d92e700bd8e6aa7fad1459c633d840b5ff9fee84ae93f33d1938b8250540a40`.
This is verified export evidence, not a restored-database acceptance test.

The authoritative database is discovered from the verified installation's
protected runtime profile. Never use a stale laptop database profile, print a
connection string, copy the server administrator credential to the laptop, or
run an integration suite against production.

The `review-central-migrate` operator CLI has three fixed actions: `inspect`,
`plan`, and `apply`. It runs only on its exact expected Windows computer. Each
migration uses a new `rmi_<32 hex>` directory under the installation's private
`operator/reviews-migrations` directory. Source, mapping, SQL, plan and approval
are digest bound. Existing migration directories and destination registers are
never overwritten.

An optional validated `artifactId` can reuse an existing private package. The
transport requires the same artifact ID in its configuration and hash-bound plan,
verifies the CLI bytes, and retains all path/reparse checks. Only the code path
is shared; SQL, inputs, backups, claims and results remain under the new operation
ID. Prepare cannot select a different artifact ID. Never delete a failed claim to
replay an operation; inspect existing receipts before creating a fresh plan.

1. Inspect the existing database, schema history and active administrator policy.
2. Select the real source register and map every structured actor to an active
   member of the target workspace. Keep synthetic registers out of the plan.
3. Plan against the exact current destination digest; review counts and identities.
4. Apply the bound plan under the owner's migration instruction. Before any
   schema/data mutation, retain the full native plain-SQL database export, its
   SHA256 and verified header/footer completion markers, the destination snapshot,
   source and mapping. Verify exporter exit and exact byte count. This does not
   claim an isolated restore test; the receipt records `restoreTested: false`.
5. Apply only migration 0007, then atomically insert/merge the selected register
   and its receipt under application-role workspace RLS.
6. Read the saved result, verify central counts and preserved state, and retain
   the run directory for recovery. The application release remains separate.

Recovery uses the retained pre-migration target document and receipts after
reviewing any subsequent legitimate central writes. Do not drop tables, remove
receipts, overwrite a newer register or restore the whole production database
merely to undo one import. Full-database restore from retained plain SQL uses the
matching native psql with stop-on-error after operator disaster-recovery review;
it has its own downtime and data-loss implications. Do not feed plain SQL to
pg_restore.

The former local preview data is retained as migration evidence. Its processes
and Docker stack are stopped; this workflow must not restart them. The source
workbook remains unchanged. The imported weekly schedule is paused until the
owner enables it centrally.
