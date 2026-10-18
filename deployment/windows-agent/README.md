# TrackGRN Windows companion pilot

This companion is a bounded UAT-only executor for the approved
`mishrarishav/TraceGRN` repository. It polls the FrevOS control plane over HTTPS
and implements only seven fixed actions: repository inspection, deterministic
commit proposal, reviewed commit/push to a dedicated branch, pull-request
creation, human-approved squash merge, build, and UAT API deployment.

It does not expose shell, accept a repository path or deployment target from an
API request, push `main`, auto-merge, bypass protection, deploy Production, run
arbitrary SQL, or perform backup and rollback. Squash merge requires an exact
PR/head binding, explicit human confirmation, clean provider state, and the
successful TrackGRN `validate` check.

The laptop requires Git, GitHub CLI authenticated as `mishrarishav`, Node.js
with `npm.cmd`, the .NET 8 SDK, and the existing VPN/WinRM settings in ignored
`D:\TrackGRN\server.env`.

The build action runs the UI build, non-destructive .NET tests, and API publish.
TrackGRN's `SqlEndToEndTests` fixture creates and deletes a developer-only
`TrackGRN_IntegrationTests` database on local SQLEXPRESS, so the UAT companion
does not redirect that fixture to the live database. Deployment instead runs
the reviewed migration command on the server and requires both the live-health
probe and the database-backed `/api/system/status` probe to pass.

The laptop-local `D:\TrackGRN\server.env` must contain
`FREVOS_TRACKGRN_AGENT_TOKEN`. The same value must be supplied to the FrevOS UAT
runtime as `FREVOS_TRACKGRN_AGENT_TOKEN`. Never commit or paste that value into
logs or reports.

The companion also supports provider-neutral project onboarding for this
personal UAT workspace. The Control Center can queue a GitHub account discovery;
the companion uses the existing `gh` login and returns at most 50 repositories.
Only account and repository metadata is persisted. The GitHub credential never
leaves the Windows GitHub CLI credential store. Connecting a discovered
repository creates its FrevOS project record, but does not grant the repository
TrackGRN's pinned build, deploy, push, or merge actions.

The claim poll sends an explicit empty JSON object. This keeps the request
compatible with the IIS/ARR boundary, which rejects bodyless POST requests.

Validate the fixed local repository boundary without connecting to FrevOS:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\deployment\windows-agent\Invoke-TrackGrnAgent.ps1 -SelfTest
```

Verify only the current GitHub account and bounded repository discovery without
printing or transmitting a credential:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\deployment\windows-agent\Invoke-TrackGrnAgent.ps1 -DiscoverySelfTest
```

After the matching control-plane release and token are provisioned, install the
agent from an Administrator PowerShell session:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\deployment\windows-agent\Install-TrackGrnAgent.ps1
```

The registered task starts when the laptop is available and remains eligible
to run on battery power, so companion polling does not silently queue until AC
power returns.

## FrevOS maintenance companion

The separate `FrevOS-Maintenance-Agent` is pinned to repository ID `1329122983`
and `D:\FREVOS`. It supports reviewed commit/PR preparation, owner-confirmed
CI-gated squash auto-merge, validation/package build, and one-click personal UAT
release. It does not grant these actions to newly connected repositories.

`uat.release` uses the existing ignored server credential boundary only at the
laptop executor. It copies an exact SHA-256-bound package to the fixed
`D:\FrevOS-UAT\automation` inbox through the server administrative share. The
server-side `FrevOS-UAT-DeployAgent` validates and activates it outside the web
process, then writes a bounded result for the laptop agent to report.

The familiar installer now installs both laptop tasks:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\deployment\windows-agent\Install-TrackGrnAgent.ps1
```

The first UAT deployment containing the server task is the only bootstrap
release that still uses the manual package installer. Later healthy releases
are requested with **Update FrevOS UAT** in the Control Center.
