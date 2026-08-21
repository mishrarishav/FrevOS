# Phase 4 Windows IIS UAT Runbook

## Purpose and authority boundary

This is the active procedure selected in
[ADR 0020](adr/0020-windows-iis-uat-operating-model.md) for synthetic
non-Production UAT at `https://tserver2.eeslindia.org/frevos/`. It does not
authorize Production use, Phase 5 capabilities, active-database restoration,
secret rotation, changes to sibling IIS applications, or acceptance-test
weakening.

ARR installation can restart shared IIS services. OIDC secret creation and
replacement are separate secret-lifecycle actions. The reviewed scripts stop
unless the operator supplies their exact confirmation switches. Never capture,
paste, or retain the hidden secret prompts.

## 1. Prepare exact OIDC settings

Create or select the dedicated synthetic UAT OIDC application. Public signup
must remain disabled. Configure exact values with no wildcard:

| Provider setting | Value |
| --- | --- |
| Callback URL | `https://tserver2.eeslindia.org/frevos/auth/callback` |
| Login URI | `https://tserver2.eeslindia.org/frevos/auth/login` |
| Logout URL | `https://tserver2.eeslindia.org/frevos/` |

Retain the HTTPS issuer ending in `/`, client ID, and synthetic admin, viewer,
and no-membership subjects. Keep the client secret only for the later hidden
server prompt. Confirm the server can reach the issuer discovery URL over
HTTPS; the installer fails closed if it cannot.

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

On first initialization only, enter non-secret OIDC values and the hidden OIDC
client secret. The script generates database and transaction secrets locally,
initializes PostgreSQL 18, applies checksum-guarded migrations, loads idempotent
synthetic seed data, registers the least-privilege startup task, creates only
the `/frevos` IIS application, and checks loopback plus public HTTPS health.

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
4. Login redirects only to the exact configured issuer and returns to
   `/frevos/auth/callback` on the same public origin.
5. Browser storage contains no provider token. FrevOS cookies are host-only,
   `Secure`, `HttpOnly` where required, and `SameSite=Strict`.
6. Synthetic identities observe only their authorized workspace data and the
   no-membership identity observes the empty state.
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
