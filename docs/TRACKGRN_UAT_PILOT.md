# TrackGRN UAT pilot runbook

## Purpose and boundary

This activates the bounded pilot accepted in
[ADR 0022](adr/0022-trackgrn-uat-automation-pilot.md). It is only for the
approved laptop checkout and UAT target. It does not authorize Production,
arbitrary repositories or commands, backup, restore, or rollback. ADR 0023
adds only an explicit human-approved squash merge for the pinned TrackGRN
repository.

## One-time secret provisioning

Choose a new companion token containing 32 to 256 characters. Do not reuse
`DB_PASSWORD`, FrevOS administrator, SQL, or WinRM credentials. Add it only to
ignored `D:\TrackGRN\server.env`:

```text
FREVOS_TRACKGRN_AGENT_TOKEN=<the distinct companion token>
```

The next reviewed FrevOS UAT installation asks for this value through a masked
prompt. Enter the same value. Later installations preserve the ACL-protected
runtime value and do not prompt again.

## Deploy the control-plane release

Build the reviewed, clean, human-merged source with the existing Windows UAT
release builder. Copy and extract the ZIP on the server, then run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\deployment\windows-uat\Install-WindowsUat.ps1 `
  -ConfirmSharedIisProxyChange
```

Verify it before starting the companion:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File D:\FrevOS-UAT\bin\Invoke-WindowsUat.ps1 `
  -Action Status
```

PostgreSQL and Control Plane must be `Running`; local health must be `200`.

## Validate and install the laptop companion

The laptop must have Git, GitHub CLI authenticated as `mishrarishav`, Node.js,
the .NET 8 SDK, and the existing VPN/WinRM configuration.

From the matching FrevOS checkout on the TrackGRN laptop:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\deployment\windows-agent\Invoke-TrackGrnAgent.ps1 `
  -SelfTest
```

It must identify `mishrarishav/TraceGRN`, repository ID `1334902237`, and the
current HEAD without exposing a secret. Then use Administrator PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\deployment\windows-agent\Install-TrackGrnAgent.ps1
```

Task `FrevOS-TrackGRN-Agent` runs after logon and polls only the fixed HTTPS
route. API requests cannot change its workspace or deployment target.

## Operation sequence

On the Projects surface:

1. **Inspect repository** records branch, HEAD, clean state, files, and digest.
2. **Prepare commit** creates an editable deterministic message proposal.
3. Review files and edit the message.
4. **Commit and push dedicated branch** works only while HEAD and digest match.
   The companion also verifies GitHub CLI is authenticated as `mishrarishav`
   and resolves repository ID `1334902237`. The reviewed checkout must be the
   current remote `main`; stale or stacked feature branches fail closed.
5. **Open pull request** creates or returns the PR for the exact pushed branch
   and reviewed head.
6. Review the PR, then check the explicit confirmation and click **Squash &
   Merge**. The companion re-verifies `main`, exact head, non-draft open state,
   `MERGEABLE`/`CLEAN`, and a successful `validate` check. It never enables
   auto-merge or bypasses protection.
7. **Build and test** runs UI build, non-destructive .NET tests, and API
   publish. The result explicitly records that the destructive local
   SQLEXPRESS fixture was not run.
8. **Deploy API to UAT** checks VPN/WinRM, deploys a SHA-addressed IIS release,
   runs reviewed migrations, and records both service-health and database
   connectivity evidence.

`Connect VPN` means the allowlisted WinRM route was unavailable. Connect VPN and
create a new deploy request; failed side effects are not automatically replayed.

TrackGRN's SQL end-to-end fixture creates and deletes
`TrackGRN_IntegrationTests` on a developer-owned local SQLEXPRESS instance. The
companion never points that destructive fixture at the live `TrackGRN`
database. UAT database verification is performed after the reviewed server-side
migration through `/api/system/status`; anything other than `available` fails
the deployment operation.

## Evidence and limitation

Operations retain requester, scope, agent, action, bounded input/result, status,
error, and timestamps. Tokens, credentials, raw command output, and repository
contents are excluded.

The pilot uses deterministic file-based commit proposals because no approved
model/data-policy adapter exists. Gemini integration is separate and must not
silently transmit repository content.
