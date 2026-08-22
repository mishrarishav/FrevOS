# Phase 4 Windows IIS UAT Runbook

## Purpose and authority boundary

This is the active procedure selected in
[ADR 0020](adr/0020-windows-iis-uat-operating-model.md) for synthetic
non-Production UAT at `https://tserver2.eeslindia.org/frevos/`. It does not
authorize Production use, Phase 5 capabilities, active-database restoration,
secret rotation, changes to sibling IIS applications, or acceptance-test
weakening.

ARR installation can restart shared IIS services. The reviewed scripts stop
unless the operator supplies their exact confirmation switches. Never capture,
paste, or retain the hidden local-password prompts.

## 1. Prepare the initial local administrator

Choose one normalized username using 3-64 lowercase letters, numbers, dots,
underscores, or hyphens; one display name; and a password of 8-128 characters.
Enter the password and confirmation only at the later hidden server prompts.
Do not put the password in Git, chat, screenshots, commands, configuration, or
retained evidence. Public signup and external password recovery are absent.

## 2. Build the offline candidate

Build only after the candidate SHA is clean, reviewed, and has passed repository
CI:

```powershell
Set-Location D:\FREVOS
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\deployment\windows-uat\New-WindowsUatRelease.ps1
```

The builder runs the frozen install and product build, creates a production-only
control-plane deployment, pins the offline prerequisites by SHA-256, and emits:

```text
artifacts\windows-uat\frevos-windows-uat-<40-character-source-sha>.zip
```

Record the source SHA and printed archive SHA-256. Transfer that exact archive
to a staging folder on `10.9.69.9`; do not extract over an existing release or
the IIS application directory.

## 3. Preflight the shared server

From an elevated server PowerShell window, verify the existing target without
changing it:

```powershell
Get-Website -Name "tserver2.eeslindia.org"
Get-WebApplication -Site "tserver2.eeslindia.org"
Get-NetTCPConnection -State Listen -LocalPort 10000,5433 -ErrorAction SilentlyContinue
Test-NetConnection 127.0.0.1 -Port 443
```

The site must exist, TCP 10000 and 5433 must not belong to uncontrolled
processes, IIS URL Rewrite must be installed, and the fixed target paths must
not contain unrelated data. PostgreSQL and Node remain loopback-only; do not add
firewall rules for either port.

## 4. Install the separately confirmed ARR prerequisite

Extract the candidate to a new staging directory and verify its archive hash.
If `requestRouter.dll` is absent, schedule an approved shared-IIS maintenance
window and run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\deployment\windows-uat\Install-ArrPrerequisite.ps1 `
  -ConfirmSharedIisRestart
```

ARR 3.0.5311 is free Microsoft IIS infrastructure, not open source. Its MSI is
included only because the selected server has no general Internet access. URL
Rewrite is a prerequisite. If the installer reports reboot-required exit code
3010, reboot and recheck every existing IIS application before proceeding.

## 5. Install or update FrevOS

From the extracted candidate root, run the reviewed installer as administrator:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\deployment\windows-uat\Install-WindowsUat.ps1 `
  -ConfirmSharedIisProxyChange
```

When no local credential exists, enter the initial username and display name,
then the password and confirmation at hidden prompts. The script generates
database secrets locally, initializes PostgreSQL 18, applies checksum-guarded
migrations, stores only a salted `scrypt` password digest, loads idempotent
personal seed data, registers the least-privilege startup task, creates only the
`/frevos` IIS application, and checks loopback plus public HTTPS health.

For a first installation, the script makes the empty PostgreSQL data directory
owned and writable by the elevated installer identity before `initdb`, grants
that identity read access only to the ephemeral password and role-input files,
and then applies the service ACLs. An empty database-existence result is treated
as "not created". A non-empty data directory without `PG_VERSION` fails closed
for operator review; the installer never deletes a partial cluster.

The operation creates no external firewall rule. It backs up the IIS server
configuration under `D:\FrevOS-UAT\iis-backups` before the FrevOS change. A
failed application health check restores the prior active release pointer when
available but does not silently restore or downgrade the database.

## 6. Verify runtime boundaries

Run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File D:\FrevOS-UAT\bin\Invoke-WindowsUat.ps1 -Action Status
```

Then verify all observations:

1. `GET /frevos/health` returns `200` with `{"status":"ok"}` over public HTTPS.
2. `GET /frevos/` returns the Control Center with the required security headers.
3. Hashed `/frevos/assets/` content is immutable; missing API and asset routes
   return genuine 404 responses.
4. A wrong local username or password is denied without revealing which value
   was incorrect; five failures temporarily lock the existing credential.
5. Browser storage contains no password or bearer token. FrevOS cookies are host-only,
   `Secure`, `HttpOnly` where required, and `SameSite=Strict`.
6. The local identity observes only workspace data granted by database-backed
   membership and scopes.
7. PostgreSQL listens only on `127.0.0.1:5433`; Node listens only on
   `127.0.0.1:10000`.
8. The running Local Service process cannot read the administrator-only
   operations configuration and never receives `MIGRATION_DATABASE_URL`.
9. Existing sibling IIS applications still pass their own health probes.

## 7. Back up and exercise isolated recovery

Create one validated logical backup:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File D:\FrevOS-UAT\bin\Invoke-WindowsUat.ps1 -Action Backup
```

Then exercise only the fixed isolated database:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File D:\FrevOS-UAT\bin\Invoke-WindowsUat.ps1 `
  -Action RestoreCheck -ConfirmIsolatedRestoreCheck
```

Record the archive filename, UTC time, command exit status, relation validation,
and temporary-database removal. Do not record contents or credentials. Define
retention and independent storage before deleting any archive; this package
does not delete backups automatically.

## 8. Application-file rollback

List the immutable release directories and select an exact prior SHA. After
review, change application files only:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File D:\FrevOS-UAT\bin\Invoke-WindowsUat.ps1 `
  -Action Rollback -ReleaseSha <40-character-source-sha>
```

Rollback checks local health and never changes database state. If a schema
downgrade or active-data restore is required, stop and use a separately reviewed
destructive recovery procedure.

## 9. Independent acceptance

The independent `mishrarishav/FrevOS-Acceptance` repository must pin the exact
deployed SHA and target only `https://tserver2.eeslindia.org/frevos/`. It must
cover desktop and mobile authentication, empty membership, authorized workspace
rendering, logout/session expiry, denial, responsiveness, accessibility,
console errors, and network failure without exposing credentials in artifacts.

Phase 4 remains incomplete until exact-source CI, deployment, backup, isolated
restore, sibling-application smoke checks, and independently reviewed black-box
acceptance all pass.
