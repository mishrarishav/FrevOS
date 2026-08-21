# ADR 0020: Operate Phase 4 UAT on the existing Windows IIS host

- Status: Accepted
- Date: 2026-08-21
- Supersedes: [ADR 0019](0019-oracle-free-uat-operating-model.md) for the active hosted Phase 4 UAT target

## Context

ADR 0019 selected an Oracle Always Free VM because Phase 4 needed an
independently reachable HTTPS UAT target without ongoing hosting cost. The
product owner has instead authorized use of an existing non-Production Windows
Server at `10.9.69.9`, whose IIS site already terminates HTTPS for
`tserver2.eeslindia.org`. The host is shared with existing applications and has
no general Internet access. FrevOS must not disrupt those applications, expose
PostgreSQL, place secrets in source, or split the OIDC Backend for Frontend from
its browser origin.

The repository must preserve the Phase 4 identity, session, PostgreSQL forced
row-security, exact-source, recovery, and independent-acceptance boundaries.
This decision is only for synthetic non-Production UAT. It is not the future
FrevOS deployment-agent implementation and does not authorize Phase 5 or later
capabilities.

## Decision

### Same-origin application boundary

- Publish the complete Control Center and Fastify control plane from
  `https://tserver2.eeslindia.org/frevos/`. API, authentication, assets, and SPA
  navigation remain under the same `/frevos` base path.
- Configure the OIDC provider with exact callback, login, and logout URLs under
  that path. Keep the hardened `__Host-*` cookies host-only, secure, strict, and
  scoped to `/`; no provider token enters browser storage.
- Do not put the Control Center on GitHub Pages. A static cross-origin UI would
  break the selected same-origin BFF, cookie, and CSRF model.

### Runtime and network boundary

- Build an offline release from one clean, exact Git SHA. The manifest records
  SHA-256 for every payload file. The package pins Node.js 24.19.0 and
  PostgreSQL 18.4 x64 binaries and contains only compiled product output,
  production dependencies, migrations, synthetic seed data, and reviewed
  operating scripts.
- Run Fastify as `NT AUTHORITY\LOCAL SERVICE` through one fixed startup task. It
  listens only on `127.0.0.1:10000` and receives only the unprivileged
  `frevos_runtime` database credential.
- Run PostgreSQL as `NT AUTHORITY\NETWORK SERVICE` on `127.0.0.1:5433`. Do not
  create a public listener or firewall rule. Persist releases, configuration,
  database data, backups, and state under `D:\FrevOS-UAT`.
- Add one IIS application named `frevos` beneath the existing
  `tserver2.eeslindia.org` site. IIS terminates the existing trusted certificate
  and proxies only that application to the loopback Node listener.

### Shared IIS exception

- IIS Application Request Routing 3.0.5311 and URL Rewrite provide the reverse
  proxy. ARR is free Microsoft infrastructure but is not open source. This is a
  declared exception caused by the product-owner-selected shared IIS host; it
  is not an application dependency or a Production platform choice.
- ARR installation can restart shared IIS services, and enabling proxy support
  changes server-level IIS configuration. The package therefore separates ARR
  installation and requires exact confirmation switches for both the restart
  boundary and shared proxy setting.
- Back up `applicationHost.config` before the FrevOS IIS change. Never alter the
  bindings, physical paths, application pools, or configuration of existing
  sibling applications.

### Identity, database, and secrets

- Continue to use a dedicated OIDC-conformant UAT provider with synthetic admin,
  viewer, and no-membership identities. The provider discovery endpoint must be
  reachable outbound from the server; otherwise activation stops rather than
  weakening authentication.
- Read the client secret from a hidden local administrator prompt. Generate the
  transaction key and separate migrator/runtime database passwords on the
  server. Never put them in Git, release archives, commands, chat, screenshots,
  IIS configuration, or retained evidence.
- Store runtime configuration so only administrators, SYSTEM, and Local Service
  can read it. Store the migration and recovery credential in a separate file
  readable only by administrators and SYSTEM. The running web task never loads
  that operations file.
- Initialize or migrate only the fixed `frevos` database. Database migration is
  checksum guarded and seed data is idempotent and synthetic.

### Deployment and recovery boundary

- Keep releases immutable under `D:\FrevOS-UAT\releases\<source-sha>` and use a
  controlled active-release pointer. A failed health check restores the prior
  pointer when one exists.
- Produce custom-format logical backups without overwriting a prior archive.
  Validate each archive with `pg_restore --list` before publishing it.
- Restore exercises target only `frevos_restore_check`, require an exact
  confirmation, validate required relations, and remove the temporary database.
  They never restore over the active database.
- Application rollback changes compiled files only. Database downgrade and
  active-data restoration remain separate destructive operations requiring
  their own approval and procedure.

## Consequences

- Phase 4 can use the already allowlisted HTTPS host without GitHub Pages or a
  new public database. Browser and API traffic preserve the same-origin BFF.
- The offline bundle can be transferred over the existing administrative SMB
  boundary, but an authorized administrator must execute it locally because
  WinRM is unavailable.
- The shared server, proprietary IIS/ARR layer, locally operated PostgreSQL,
  manual certificate ownership, outbound OIDC allowlisting, patching, capacity,
  and backup retention are explicit UAT risks. They are not a Production SLO,
  recovery, or licensing decision.
- A successful installation is not Phase 4 completion. The exact merged source,
  logical backup, isolated restore, and independent black-box acceptance must
  all pass and be reviewed.

## Rejected alternatives

- Host the UI on GitHub Pages and the API on IIS, because that violates the
  same-origin session and CSRF architecture.
- Bind Node.js or PostgreSQL to a LAN or public interface for convenience.
- Give the running web process the migration or recovery database credential.
- Install ARR or enable shared proxy settings silently on a multi-application
  IIS server.
- Use SQL Server for this UAT, because the implemented forced-RLS persistence
  boundary and migrations are PostgreSQL-specific.
- Treat the existing TrackGRN application, database, or credentials as FrevOS
  infrastructure.

## Related records

- [ADR 0005](0005-immutable-artifact-promotion.md)
- [ADR 0014](0014-oidc-bff-sessions.md)
- [ADR 0015](0015-postgresql-tenant-isolation.md)
- [ADR 0019](0019-oracle-free-uat-operating-model.md)
- [Windows UAT runbook](../PHASE_4_WINDOWS_UAT_RUNBOOK.md)
