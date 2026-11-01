# Servix Production readiness, 2026-10-26

Status: PASS for refreshed read-only preservation and encrypted database backup/
restore rehearsal. The owner subsequently delegated visible DevSetu configuration;
`servix-production` revision 1 is now saved with its destination still pending.
Existing dependency versions remain unchanged. See the
[guided plan](SERVIX_PRODUCTION_DEPLOYMENT_PLAN.md). Production activation remains
BLOCKED on target/runtime capability and valid action-bound release approval. No Production
application deployment, restart, task registration, permission assignment or
database write was performed.

## Repository and scope

Platform checkout: `D:\FREVOS\.local\worktrees\servix-dashboard`, branch
`codex/servix-production-readiness`, base merged main
`5730940fe6c40cc3eb5002ef6beaa564c9571e5f`. This follow-up has no commit or PR.
Customer source remains clean in external `D:\servixDev`, branch
`codex/servix-backend-artifact-source`, head
`e04137b4a862e8760a59b95da7e0de9a32bc6d38`. Phase 4 exit remains open.

Scope is readiness for ADR 0057's compiled backend. Frontend/IIS changes,
dependency upgrades, Production identity/permission changes and actual activation
are separate actions. Read-only diagnostic staging uses existing server20
operator/server21 Development runtime directories; the private backup is local.

Candidate `sp_6c3b764d29f94e12a25b09c23914cfdb` remains unapproved. Its eleven
files verify. Plan SHA256:
`702fdb16282862d107c9578e4a55da59daaf0a30e11a84f09569ac16829346d8`.
Backend descriptor SHA256:
`8e525dab58dde2e560fbc2d7f18547a1d3c1e048204062e09c98c97b227eac96`.
Backend bundle SHA256:
`5ff7622a9f316edbe0485c47f179f6c1bccac75241e6540f1d0079b11172fb0c`.
Development restore is `sd_4fa6678413b3b23b2ba677ad4b09f6e3`; proposed Production
target is DCAPP9/server21, `D:\Servix`, port 5000, existing owner account.

## Preservation and runtime evidence

Selected server20/server21 connections and verified TLS public health pass.
Read-only job `15e4dcdf138a47d9b4a6b20db83ebf89` confirms Production PID 10760,
its creation/owner, all 85 recovery-source files and Node/environment identity.
All 8,542 original protected files have zero missing/changed entries; eleven
environments, frontend/IIS hashes and the original filename-encoding proof pass.
Normal subsequent customer activity still requires a fresh cutover inventory.

Live DevSetu still has only `servix-development`, revision 3, as a connected
Servix deployment profile. The owner-visible follow-up saved `servix-production`
revision 1 at the intended Production root and public address. Its 23:17:45 IST
connection test passed preservation but reported destination pending. No
Production executor is enrolled. The Production candidate is not a working
connection, and the historical adapter's Production exclusion is unchanged.

Read-only adoption job `bf2402a2865440e3ba5ce5f9fd5dddaf` parses the proposed
task XML on server21, verifies its same owner/PID/environment/Node, password
logon, least privilege, pinned action and boot trigger. No task was registered.
The exported merged rights policy contains no observed Batch Logon allow/deny
entries; existing-owner batch-logon readiness is not established. Do not infer
permission to grant a right, register a credential or override Group Policy.
See [Microsoft's batch-logon policy](https://learn.microsoft.com/en-us/windows/security/threat-protection/security-policy-settings/log-on-as-a-batch-job).

## Actual database recovery rehearsal

Read-only metadata identifies MySQL 8.0.28, 114 InnoDB base tables and one view,
approximately 339,263,488 bytes of table/index storage. Three selected backup
folders yielded no backup evidence; enterprise backups elsewhere were not ruled
out. The discovered app-host dump client was 5.5, so a pinned matching 8.0.28
client was used privately. Source capture uses a single transaction, quick
streaming, no GTID purge/tablespace export or source table locking, with routines,
events and triggers included. Source schema fingerprints before/after match.
See [MySQL's backup contract](https://dev.mysql.com/doc/refman/8.0/en/mysqldump.html).

- Reference: `servix-production-backup/sr_8398ce72746c5b91776929f6b469786d`.
- Encrypted SHA256:
  `0eb90d448a6989e0fb8e0254663bf2c09dbde49bac28eeab2241cc18982b83b3`.
- Encrypted size 439,176,586 bytes; uncompressed SQL 847,318,302 bytes.
- Owner/SYSTEM-only ACL, scoped multi-block CurrentUser DPAPI, ciphertext and
  full decrypted/gunzipped-stream digest verification pass.
- Matching image:
  `mysql@sha256:e9fee3e714fd69cd2ccfa0c6a141fac0a60f2a02f72d43c0e7055601aaf481b0`.
- Restore: 114 base tables, one view, 212,077 rows. Source/restored schema SHA256:
  `6efddb90d6a19ad0fbf314bdbd616e960f44c534a830637b2e1e06d5a4b511d9`.
- Observed trigger, routine and event counts are zero.
- Restore was network-disabled with 768 MiB memory and bounded CPU. SQL and
  credentials were not placed in process arguments or container logs. The owned
  restore container and anonymous data volume were removed; other services remain.

Initial isolated imports failed with MySQL 2013 because the readiness probe
accepted the temporary initialization server before its planned shutdown. The
corrected probe waits for `@@GLOBAL.skip_networking = 0`. The same retained
encrypted backup then passed full integrity and restore without another source
dump. These were local rehearsal failures, not Production outages.

The backup is outside Git under the owner's private local backup directory.
Cross-machine DPAPI recovery, an additional disaster-recovery copy, point-in-time
recovery and application startup against the restored database were not tested.
A fresh cutover backup/freshness decision remains necessary. Code rollback does
not undo database writes or bootstrap changes.

## Development versus Production dependency evidence

Current target package/lock files were copied into isolated temporary audit
folders; no install, fix or target lock rewrite occurred. Both audit calls exit
1 when advisories exist. Reports overlap and cannot be summed as unique CVEs.

| Target/project | Moderate | High | Critical |
| --- | ---: | ---: | ---: |
| Development backend | 6 | 19 | 3 |
| Production backend | 6 | 26 | 3 |
| Development QuerySafe | 3 | 3 | 1 |
| Production QuerySafe | 3 | 3 | 1 |

The three critical backend package records are `protobufjs`, `proxy-addr`, `tar`
in both reports. QuerySafe's critical record is `protobufjs` in both. These are
audit advisories, not proof of a validated exploit or application startup failure.
The earlier build/health/rollback passes did not establish a clean customer
dependency audit; prior handoff already recorded unresolved dependency risk.

QuerySafe lock hashes and all four installed root dependency versions match.
Backend locks differ: 22/25 root versions match; Development has `mammoth` 1.12.0
and `pdf-parse` 1.1.1 where Production lacks them, while Production has `pm2`
7.0.1 where Development lacks it. This is not proof every transitive installed
file equals its lock. The retained bundle uses existing runtime dependencies;
deploying only code cannot be represented as dependency remediation.

## Commands and observed outcomes

- `node .local/ServixProduction-Refresh.cjs`: exit 0; candidate integrity,
  connectivity, authenticated owner/profile and TLS health pass.
- Clean Windows PowerShell `.local/Run-ProductionReadiness.ps1
  -DevelopmentRunLabel restore-guard`: exit 0; full preservation/runtime pass.
- `node .local/ServixProduction-RecoveryInventory.cjs`: exit 0; read-only
  source/runtime/database metadata pass.
- `node .local/Test-ServixPrivateBackup.cjs`: exit 0; native ACL/DPAPI round trip,
  wrong-scope/hash rejection before output and corruption denial pass.
- `node .local/Backup-ServixProduction.cjs`: exit 1 after successful capture due
  to the initial local initialization-server race.
- `node .local/Verify-ServixEncryptedBackup.cjs`: exit 0; entire raw stream matches.
- `node .local/Restore-ServixProductionBackup-final.cjs`: exit 0; restore/schema/
  row count/integrity/owned cleanup pass.
- Clean Windows PowerShell `.local/Run-ProductionAdoptionReadiness.ps1
  -DevelopmentRunLabel restore-guard`: exit 0 for inspection; task parses,
  batch-logon readiness unproven; no registration, execution or permission change.
- `node .local/Audit-ServixProductionLocks.cjs` and
  `node .local/Audit-ServixDevelopmentLocks.cjs`: wrappers exit 0; underlying
  `npm audit --omit=dev --json --package-lock-only --ignore-scripts
  --registry=https://registry.npmjs.org` calls exit 1 with the table above.
- `node .local/Compare-ServixEnvironmentDependencies.cjs`: exit 0; read-only
  target lock and installed-root comparison pass.

## Handoff and next scope

No application code changed; broad platform CI was not repeated for these
preflight/documentation results. Private helpers/receipts, raw SQL and backup
bytes are excluded from source publication. No new commit, push, PR, merge or
Production activation is claimed.

Changed files in this preparation are this document, `docs/CURRENT_STATE.md`,
`docs/SERVIX_BACKEND_ARTIFACT_HANDOFF.md` and the subsequent guided deployment
plan, plus the subsequent visible-configuration ADR/index update. The owner
directs no dependency/application changes; the delegated configuration work
does not clear the findings or waive execution controls. Target/runtime adoption, required rights/
credential binding, maintenance window and normal startup/database effects
then need a fresh actor/workspace/action/target/correlation/expiry/artifact-bound
approval. Frontend/IIS remains a separate scope. No old Development approval or
retained unapproved candidate authorizes Production execution.

Documentation checks: `pnpm run validate:repo` exit 0 (97 Markdown files),
`git diff --check` exit 0 and `node .local/Scan-ActivitySecrets.cjs` exit 0.
The earlier readiness-only diff was three files and 193 insertions; the added
guided plan and owner-direction updates are a subsequent documentation change.
