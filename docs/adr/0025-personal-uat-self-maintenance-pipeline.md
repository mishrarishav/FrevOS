# ADR 0025: Personal UAT self-maintenance pipeline

- Status: Accepted
- Date: 2026-08-23

## Context

FrevOS and TrackGRN already have a live personal Windows UAT target, a bounded
laptop companion, protected pull requests, deterministic release packages and
health probes. Repeating the same build, copy, extraction, migration and health
commands by hand is slow and error-prone. FrevOS also cannot safely replace its
own running web process from inside that process.

The repository uses one GitHub account for the human owner and local tooling.
The authoring automation session must still never approve or merge its own pull
request. The authenticated human owner nevertheless needs an in-product way to
record an exact-head merge instruction without visiting GitHub for routine work.

## Decision

Add a personal-UAT-only FrevOS maintenance profile and two fixed Windows agents:

1. A laptop agent is pinned to repository ID `1329122983` at `D:\FREVOS`. It can
   inspect changes, create a reviewed branch and pull request, enable GitHub
   squash auto-merge for an exact pull-request head after an authenticated admin
   confirmation that expires after ten minutes, validate/build an immutable UAT package, and submit that package
   to the fixed UAT server over its administrative SMB boundary.
2. A server task runs outside the FrevOS web process. It accepts only a strict
   manifest from a controlled inbox, validates operation ID, source SHA, archive
   name, SHA-256 and archive paths, invokes the packaged reviewed installer, and
   returns a bounded health result.
3. `uat.release` synchronizes a clean local `main` with `origin/main`, validates
   and builds once, transfers the same digest, waits for server activation and
   verifies public health. It does not accept a repository path, command, target,
   share path or executable from an API request.
4. GitHub required checks, protected `main`, squash-only merge and exact-head
   matching remain enforced. The implementation session cannot request its own
   merge; the authenticated human owner initiates the single-use FrevOS operation
   in the Control Center. GitHub auto-merge waits for required checks.

The first release containing the out-of-process updater remains a one-time
bootstrap deployment. Later FrevOS UAT releases use the in-product pipeline.

## Consequences

- Routine FrevOS UAT release work becomes button-driven and produces correlated
  operation, source, digest, deployment and health evidence.
- The web process never receives unrestricted PowerShell, SMB credentials or an
  arbitrary deployment target.
- VPN loss, validation failure, transfer failure, server timeout and health
  failure are explicit operation states.
- This does not authorize Production, arbitrary connected repositories, rollback,
  backup deletion, code generation, or unattended author-session self-merge.
- The personal UAT still depends on the laptop GitHub credential and ignored
  server environment file. A future GitHub App and device identity can replace
  that local boundary without changing the business actions.

## Rejected alternatives

- Executing PowerShell or replacing binaries from the FrevOS web process.
- Passing arbitrary repository paths, commands or server paths through the API.
- Rebuilding on the server or deploying a digest different from the laptop build.
- Disabling required checks or allowing merge/rebase commits.
- Requiring the owner to repeat ZIP copy and extraction for every release.

## Related records

- [ADR 0003](0003-controlled-tool-gateway.md)
- [ADR 0005](0005-immutable-artifact-promotion.md)
- [ADR 0008](0008-default-branch-and-merge-governance.md)
- [ADR 0020](0020-windows-iis-uat-operating-model.md)
- [ADR 0022](0022-trackgrn-uat-automation-pilot.md)
- [ADR 0023](0023-trackgrn-human-approved-squash-merge.md)
